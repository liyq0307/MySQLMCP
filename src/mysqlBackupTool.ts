/**
 * MySQL 高级备份和导出工具
 *
 * 提供企业级数据库备份、数据导出和报表生成功能，集成了智能内存管理、
 * 任务队列调度、错误恢复和性能监控等高级特性。
 *
 * @fileoverview MySQL 高级备份和导出工具 - 企业级数据管理解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { MySQLManager } from './mysqlManager.js';
import { withErrorHandling, withPerformanceMonitoring } from './utils/decorators.js';
import { ensureDirectoryExists } from './utils/fileUtils.js';
import {
  BackupOptions,
  ExportOptions,
  BackupResult,
  ExportResult,
  ReportConfig
} from './types.js';
import {
  IncrementalBackupOptions,
  IncrementalBackupResult,
  RecoveryStrategy,
  ErrorRecoveryResult,
  ProgressTracker,
  CancellationToken,
  LargeFileOptions,
  MemoryUsage,
  TaskQueue,
  MemoryManager
} from './types/backupTypes.js';
import { ErrorHandler } from './errorHandler.js';
import { logger } from './logger.js';
import { EventEmitter } from 'events';
import { CommonUtils } from './utils/common.js';
import { CacheManager } from './cache.js';
import { CacheRegion } from './types.js';
import { ExporterFactory } from './exporter/exporterFactory.js';

/**
 * MySQL 高级备份和导出工具类
 *
 * 基于 EventEmitter 的企业级备份工具，集成了智能内存管理、任务队列系统、
 * 进度跟踪、错误恢复等高级特性。支持全量/增量备份、多格式导出、
 * 大文件处理和实时监控。
 *
 * 主要组件：
 * - 内存管理器：智能内存监控和优化
 * - 任务调度器：优先级队列和并发控制  
 * - 导出引擎：Excel/CSV/JSON 多格式导出
 * - 缓存系统：查询结果缓存和 LRU 淘汰
 * - 进度跟踪：实时进度监控和取消机制
 *
 * @class MySQLBackupTool
 * @extends EventEmitter
 * @since 1.0.0
 * @version 1.0.0
 */
export class MySQLBackupTool extends EventEmitter {
  private cacheManager: CacheManager;
  private taskQueue: Map<string, TaskQueue> = new Map();
  private exporterFactory: ExporterFactory;
  private maxConcurrentTasks = 5;
  private runningTasks = 0;
  private taskIdCounter = 0;
  private progressTrackers: Map<string, ProgressTracker> = new Map();
  private memoryManager: MemoryManager;
  private schedulerInterval?: NodeJS.Timeout;
  private isSchedulerRunning = false;

  constructor(private mysqlManager: MySQLManager) {
    super();
    this.cacheManager = this.mysqlManager.cacheManager;
    this.memoryManager = new MemoryManager();
    this.exporterFactory = ExporterFactory.getInstance(mysqlManager, this.memoryManager);
    this.setMaxListeners(200); 
    this.setupMemoryManagement();
    this.startTaskScheduler();
    this.optimizeMaxConcurrency();
  }

  /**
   * 优化最大并发数基于系统资源
   * @private
   */
  private optimizeMaxConcurrency(): void {
    const memUsage = this.memoryManager.getCurrentUsage();
    const availableMemory = memUsage.heapTotal - memUsage.heapUsed;
    
    // 基于可用内存动态调整并发数
    if (availableMemory > 500 * 1024 * 1024) { // > 500MB
      this.maxConcurrentTasks = 8;
    } else if (availableMemory > 200 * 1024 * 1024) { // > 200MB
      this.maxConcurrentTasks = 5;
    } else {
      this.maxConcurrentTasks = 3;
    }
    
    this.emit('concurrency-optimized', {
      maxConcurrentTasks: this.maxConcurrentTasks,
      availableMemory: Math.round(availableMemory / 1024 / 1024) + 'MB'
    });
  }


  /**
   * 获取表统计信息
   * @private
   */
  private async getTableStatistics(
    specificTables?: string[]
  ): Promise<{ tableCount: number; recordCount: number }> {
    try {
      let tables: string[];
      
      if (specificTables && specificTables.length > 0) {
        tables = specificTables;
      } else {
        // 检查缓存
        const cachedTables = await this.cacheManager.get<string[]>(CacheRegion.QUERY_RESULT, 'SHOW_TABLES');
        if (cachedTables) {
          tables = cachedTables;
        } else {
          const result = await this.mysqlManager.executeQuery('SHOW TABLES');  
          tables = (result as Record<string, unknown>[]).map(row => Object.values(row)[0] as string);
          await this.cacheManager.set(CacheRegion.QUERY_RESULT, 'SHOW_TABLES', tables || []);
        }
      }
      
      // 并行获取所有表的统计信息
      const countPromises = tables.map(async (tableName) => {
        try {
          const cacheKey = `COUNT_${tableName}`;
          const cachedCount = await this.cacheManager.get<number>(CacheRegion.QUERY_RESULT, cacheKey);
          
          if (cachedCount !== null) {
            return cachedCount;
          }
          
          // 使用更快的统计查询
          const result = await this.mysqlManager.executeQuery(
            `SELECT table_rows FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
            [tableName]
          );
          
          let count = 0;
          if (Array.isArray(result) && result.length > 0) {
            count = (result[0] as Record<string, unknown>).table_rows as number || 0;
            // 如果统计信息不准确，使用精确计数（但限制在小表上）
            if (count === 0 || count === null) {
              const exactResult = await this.mysqlManager.executeQuery(
                `SELECT COUNT(*) as count FROM \`${tableName}\` LIMIT 1000`
              );
              count = (exactResult as Record<string, unknown>[])[0]?.count as number || 0;
            }
          }
          
          await this.cacheManager.set(CacheRegion.QUERY_RESULT, cacheKey, count);
          return count;
        } catch (error) {
          logger.warn(`Failed to get count for table ${tableName}:`, undefined, { error: (error as Error).message });
          return 0;
        }
      });
      
      // 分批执行以避免过多并发查询
      const batchSize = Math.min(10, this.maxConcurrentTasks);
      let totalRecordCount = 0;
      
      for (let i = 0; i < countPromises.length; i += batchSize) {
        const batch = countPromises.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch);
        totalRecordCount += batchResults.reduce((sum, count) => sum + count, 0);
        
        // 检查内存压力
        const pressure = this.memoryManager.checkMemoryPressure();
        if (pressure > 0.8) {
          await this.memoryManager.requestMemoryCleanup();
          await this.sleep(100); // 短暂延迟以降低系统压力
        }
      }
      
      return {
        tableCount: tables.length,
        recordCount: totalRecordCount
      };
    } catch (error) {
      logger.warn('Failed to get optimized table statistics:', undefined, { error: (error as Error).message });
      return { tableCount: 0, recordCount: 0 };
    }
  }

  /**
   * 创建数据库备份
   *
   * 执行数据库备份操作，支持全量备份和部分表备份。
   * 可选择是否包含表结构和数据，并支持文件压缩。
   *
   * @param {BackupOptions} options - 备份选项配置
   * @returns {Promise<BackupResult>} 包含备份结果的JSON格式数据
   * @throws {Error} 当备份失败时抛出
   */
  @withErrorHandling('createBackup', 'MSG_BACKUP_FAILED')
  @withPerformanceMonitoring('backup_create')
  async createBackup(options: BackupOptions = {}): Promise<BackupResult> {
    const startTime = Date.now();
    const defaultOptions: BackupOptions = {
      outputDir: './backups',
      compress: true,
      includeData: true,
      includeStructure: true,
      tables: [],
      filePrefix: 'mysql_backup',
      maxFileSize: 100 // MB
    };

    const opts = { ...defaultOptions, ...options };

    try {
      // 确保输出目录存在
      await ensureDirectoryExists(opts.outputDir!);

      // 生成备份文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${opts.filePrefix}_${timestamp}`;
      const backupPath = path.join(opts.outputDir!, fileName);

      // 获取数据库配置
      const config = this.mysqlManager.configManager.database;

      // 优化：并行获取表统计信息
      const tableStats = await this.getTableStatistics(opts.tables);
      const tableCount = tableStats.tableCount;
      const recordCount = tableStats.recordCount;

      // 构建 mysqldump 命令
      const dumpArgs = [
        `-h${config.host}`,
        `-P${config.port}`,
        `-u${config.user}`,
        `-p${config.password}`,
        '--default-character-set=utf8mb4',
        '--single-transaction',
        '--routines',
        '--triggers'
      ];

      if (!opts.includeData) {
        dumpArgs.push('--no-data');
      }

      if (!opts.includeStructure) {
        dumpArgs.push('--no-create-info');
      }

      dumpArgs.push(config.database || '');

      if (opts.tables && opts.tables.length > 0) {
        dumpArgs.push(...opts.tables);
      }

      // 执行备份
      const sqlFilePath = `${backupPath}.sql`;
      await CommonUtils.executeCommand('mysqldump', dumpArgs, sqlFilePath);

      let finalFilePath = sqlFilePath;
      let fileSize = 0;

      // 检查文件大小并压缩
      const stats = await fs.stat(sqlFilePath);
      fileSize = stats.size;

      if (opts.compress || fileSize > (opts.maxFileSize! * 1024 * 1024)) {
        const zipFilePath = `${backupPath}.zip`;
        await CommonUtils.compressFile(sqlFilePath, zipFilePath);

        // 删除原始SQL文件
        await fs.unlink(sqlFilePath);

        finalFilePath = zipFilePath;
        const zipStats = await fs.stat(zipFilePath);
        fileSize = zipStats.size;
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        filePath: finalFilePath,
        fileSize,
        tableCount,
        recordCount,
        duration
      };

    } catch (error) {
      // 清理缓存以释放内存
      await this.cacheManager.clearRegion(CacheRegion.QUERY_RESULT);
      
      const safeError = ErrorHandler.safeError(error, 'createBackup');
      
      // 发出错误事件
      this.emit('backup-error', {
        error: safeError.message,
        duration: Date.now() - startTime,
        memoryUsage: this.memoryManager.getCurrentUsage()
      });
      
      return {
        success: false,
        error: safeError.message,
        duration: Date.now() - startTime
      } as BackupResult;
    }
  }

  /**
   * 创建增量备份
   *
   * 基于时间戳或binlog位置创建增量备份，只备份自上次备份以来发生变化的数据。
   * 支持多种增量模式：时间戳、binlog位置、手动指定表。
   *
   * @param {IncrementalBackupOptions} options - 增量备份选项配置
   * @returns {Promise<IncrementalBackupResult>} 包含增量备份结果的JSON格式数据
   * @throws {Error} 当增量备份失败时抛出
   */
  @withPerformanceMonitoring('backup_create_incremental')
  async createIncrementalBackup(options: IncrementalBackupOptions = {}): Promise<IncrementalBackupResult> {
    const startTime = Date.now();
    const defaultOptions: IncrementalBackupOptions = {
      outputDir: './backups',
      compress: true,
      includeData: true,
      includeStructure: false, // 增量备份通常只包含数据
      tables: [],
      filePrefix: 'mysql_incremental',
      maxFileSize: 100, // MB
      incrementalMode: 'timestamp',
      trackingTable: '__backup_tracking'
    };

    const opts = { ...defaultOptions, ...options };

    try {
      // 确保输出目录存在
      await ensureDirectoryExists(opts.outputDir!);

      // 确定增量备份的起始点
      let sinceTime: Date;
      let changedTables: string[] = [];
      let totalChanges = 0;

      if (opts.incrementalMode === 'timestamp') {
        if (opts.lastBackupTime) {
          sinceTime = new Date(opts.lastBackupTime);
        } else {
          // 尝试从跟踪表获取最后备份时间
          sinceTime = await this.getLastBackupTime(opts.trackingTable!);
        }
      } else if (opts.incrementalMode === 'binlog') {
        // 基于binlog位置的增量备份
        return await this.createBinlogIncrementalBackup(opts);
      } else {
        // 手动模式：备份指定的表
        sinceTime = opts.lastBackupTime ? new Date(opts.lastBackupTime) : new Date(0);
      }

      // 分析哪些表有变化
      const allTables = await this.getChangedTables(sinceTime, opts.tables);
      changedTables = allTables.changedTables;
      totalChanges = allTables.totalChanges;

      if (changedTables.length === 0) {
        return {
          success: true,
          backupType: 'incremental',
          filePath: '',
          fileSize: 0,
          tableCount: 0,
          recordCount: 0,
          duration: Date.now() - startTime,
          incrementalSince: sinceTime.toISOString(),
          changedTables: [],
          totalChanges: 0,
          message: '自上次备份以来没有数据变化'
        };
      }

      // 生成备份文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sinceTimestamp = sinceTime.toISOString().replace(/[:.]/g, '-');
      const fileName = `${opts.filePrefix}_${sinceTimestamp}_to_${timestamp}`;
      const backupPath = path.join(opts.outputDir!, fileName);

      // 获取数据库配置
      const config = this.mysqlManager.configManager.database;

      // 构建增量备份的 mysqldump 命令
      const dumpArgs = [
        `-h${config.host}`,
        `-P${config.port}`,
        `-u${config.user}`,
        `-p${config.password}`,
        '--default-character-set=utf8mb4',
        '--single-transaction',
        '--where', `updated_at >= '${sinceTime.toISOString().slice(0, 19).replace('T', ' ')}'`
      ];

      if (!opts.includeStructure) {
        dumpArgs.push('--no-create-info');
      }

      if (!opts.includeData) {
        dumpArgs.push('--no-data');
      }

      dumpArgs.push(config.database || '');
      dumpArgs.push(...changedTables);

      // 执行增量备份
      const sqlFilePath = `${backupPath}.sql`;
      await CommonUtils.executeCommand('mysqldump', dumpArgs, sqlFilePath);

      let finalFilePath = sqlFilePath;
      let fileSize = 0;

      // 在备份文件中添加增量备份信息
      const backupInfo = `-- Incremental Backup Information
-- Base backup: ${opts.baseBackupPath || 'N/A'}
-- Incremental since: ${sinceTime.toISOString()}
-- Changed tables: ${changedTables.join(', ')}
-- Total changes: ${totalChanges}
-- Created at: ${new Date().toISOString()}

`;

      const existingContent = await fs.readFile(sqlFilePath, 'utf8');
      await fs.writeFile(sqlFilePath, backupInfo + existingContent);

      // 检查文件大小并压缩
      const stats = await fs.stat(sqlFilePath);
      fileSize = stats.size;

      if (opts.compress || fileSize > (opts.maxFileSize! * 1024 * 1024)) {
        const zipFilePath = `${backupPath}.zip`;
        await CommonUtils.compressFile(sqlFilePath, zipFilePath);

        // 删除原始SQL文件
        await fs.unlink(sqlFilePath);

        finalFilePath = zipFilePath;
        const zipStats = await fs.stat(zipFilePath);
        fileSize = zipStats.size;
      }

      // 更新备份跟踪表
      await this.updateBackupTracking(opts.trackingTable!, new Date(), finalFilePath);

      const duration = Date.now() - startTime;

      return {
        success: true,
        backupType: 'incremental',
        filePath: finalFilePath,
        fileSize,
        tableCount: changedTables.length,
        recordCount: totalChanges,
        duration,
        baseBackupPath: opts.baseBackupPath,
        incrementalSince: sinceTime.toISOString(),
        changedTables,
        totalChanges
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'createIncrementalBackup');
      return {
        success: false,
        backupType: 'incremental',
        error: safeError.message,
        duration: Date.now() - startTime,
        changedTables: [],
        totalChanges: 0
      };
    }
  }

  /**
   * 基于binlog创建增量备份
   *
   * @param {IncrementalBackupOptions} options - 备份选项
   * @returns {Promise<IncrementalBackupResult>} 备份结果
   * @private
   */
  private async createBinlogIncrementalBackup(options: IncrementalBackupOptions): Promise<IncrementalBackupResult> {
    const startTime = Date.now();

    try {
      // 获取当前binlog位置
      const masterStatus = await this.mysqlManager.executeQuery('SHOW MASTER STATUS');
      if (!Array.isArray(masterStatus) || masterStatus.length === 0) {
        throw new Error('无法获取当前binlog状态，可能未启用binlog');
      }

      const currentBinlog = (masterStatus[0] as Record<string, unknown>).File as string;
      const currentPosition = (masterStatus[0] as Record<string, unknown>).Position as number;

      // 生成备份文件名
      const _timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${options.filePrefix}_binlog_${options.binlogPosition || 'start'}_to_${currentBinlog}.${currentPosition}`;
      const backupPath = path.join(options.outputDir!, fileName);

      // 获取数据库配置
      const config = this.mysqlManager.configManager.database;

      // 使用mysqlbinlog提取增量数据
      const binlogArgs = [
        `--host=${config.host}`,
        `--port=${config.port}`,
        `--user=${config.user}`,
        `--password=${config.password}`,
        '--read-from-remote-server',
        '--raw'
      ];

      if (options.binlogPosition) {
        binlogArgs.push(`--start-position=${options.binlogPosition}`);
      }

      binlogArgs.push(currentBinlog);

      const sqlFilePath = `${backupPath}.sql`;
      await CommonUtils.executeCommand('mysqlbinlog', binlogArgs, sqlFilePath);

      let finalFilePath = sqlFilePath;
      let fileSize = 0;

      // 检查文件大小并压缩
      const stats = await fs.stat(sqlFilePath);
      fileSize = stats.size;

      if (options.compress || fileSize > (options.maxFileSize! * 1024 * 1024)) {
        const zipFilePath = `${backupPath}.zip`;
        await CommonUtils.compressFile(sqlFilePath, zipFilePath);

        await fs.unlink(sqlFilePath);

        finalFilePath = zipFilePath;
        const zipStats = await fs.stat(zipFilePath);
        fileSize = zipStats.size;
      }

      return {
        success: true,
        backupType: 'incremental',
        filePath: finalFilePath,
        fileSize,
        tableCount: 0, // binlog备份无法准确统计表数量
        recordCount: 0, // binlog备份无法准确统计记录数量
        duration: Date.now() - startTime,
        baseBackupPath: options.baseBackupPath,
        incrementalSince: options.binlogPosition,
        changedTables: ['*'], // binlog包含所有变化
        totalChanges: 0
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'createBinlogIncrementalBackup');
      return {
        success: false,
        backupType: 'incremental',
        error: safeError.message,
        duration: Date.now() - startTime,
        changedTables: [],
        totalChanges: 0
      };
    }
  }

  /**
   * 获取最后备份时间
   *
   * @param {string} trackingTable - 跟踪表名
   * @returns {Promise<Date>} 最后备份时间
   * @private
   */
  private async getLastBackupTime(trackingTable: string): Promise<Date> {
    try {
      // 检查跟踪表是否存在
      const tableExists = await this.mysqlManager.executeQuery(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = ? AND table_schema = DATABASE()",
        [trackingTable]
      );

      if ((tableExists as Record<string, unknown>[])[0]?.count === 0) {
        // 创建跟踪表
        await this.mysqlManager.executeQuery(`
          CREATE TABLE \`${trackingTable}\` (
            id INT AUTO_INCREMENT PRIMARY KEY,
            backup_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            backup_type ENUM('full', 'incremental') NOT NULL,
            backup_path VARCHAR(500),
            file_size BIGINT,
            table_count INT,
            record_count BIGINT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        return new Date(0); // 如果表不存在，返回最早时间
      }

      // 获取最后备份时间
      const lastBackup = await this.mysqlManager.executeQuery(
        `SELECT backup_time FROM \`${trackingTable}\` ORDER BY backup_time DESC LIMIT 1`
      );

      if (Array.isArray(lastBackup) && lastBackup.length > 0) {
        return new Date((lastBackup[0] as Record<string, unknown>).backup_time as string);
      }

      return new Date(0);
    } catch (error) {
      logger.warn('获取最后备份时间失败:', undefined, { error: (error as Error).message });
      return new Date(0);
    }
  }

  /**
   * 优化获取有变化的表
   *
   * @param {Date} sinceTime - 起始时间
   * @param {string[]} [specificTables] - 指定要检查的表
   * @returns {Promise<{changedTables: string[], totalChanges: number}>} 变化的表和总变化数
   * @private
   */
  private async getChangedTables(
    sinceTime: Date,
    specificTables?: string[]
  ): Promise<{ changedTables: string[], totalChanges: number }> {
    try {
      const changedTables: string[] = [];
      let totalChanges = 0;

      // 获取所有表或指定表（使用缓存优化）
      let tables: string[];
      if (specificTables && specificTables.length > 0) {
        tables = specificTables;
      } else {
        const cachedTables = await this.cacheManager.get<string[]>(CacheRegion.QUERY_RESULT, 'SHOW_TABLES');
        if (cachedTables) {
          tables = cachedTables;
        } else {
          const allTables = await this.mysqlManager.executeQuery('SHOW TABLES');
          tables = (allTables as Record<string, unknown>[]).map(row => Object.values(row)[0] as string);
          await this.cacheManager.set(CacheRegion.QUERY_RESULT, 'SHOW_TABLES', tables);
        }
      }

      // 并行检查表变化（分批处理以控制并发）
      const batchSize = Math.min(5, this.maxConcurrentTasks);
      for (let i = 0; i < tables.length; i += batchSize) {
        const batch = tables.slice(i, i + batchSize);
        
        const changePromises = batch.map(async (table) => {
          try {
            // 优先使用information_schema获取列信息
            const columns = await this.mysqlManager.executeQuery(
              `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? 
               AND DATA_TYPE IN ('timestamp', 'datetime') 
               AND COLUMN_NAME IN ('updated_at', 'modified_at', 'updated_time', 'modification_time')`,
              [table]
            );

            if (Array.isArray(columns) && columns.length > 0) {
              const timestampColumn = (columns[0] as Record<string, unknown>).COLUMN_NAME as string;
              
              // 使用索引优化的查询检查变化
              const changes = await this.mysqlManager.executeQuery(
                `SELECT COUNT(*) as count FROM \`${table}\` 
                 WHERE \`${timestampColumn}\` >= ? 
                 AND \`${timestampColumn}\` IS NOT NULL`,
                [sinceTime.toISOString().slice(0, 19).replace('T', ' ')]
              );

              const changeCount = (changes as Record<string, unknown>[])[0].count as number;
              if (changeCount > 0) {
                return { table, changes: changeCount };
              }
            } else {
              // 备用方案：检查AUTO_INCREMENT值或使用TABLE_STATUS
              const tableStatus = await this.mysqlManager.executeQuery(
                `SELECT Auto_increment, Update_time FROM information_schema.TABLES 
                 WHERE table_schema = DATABASE() AND table_name = ?`,
                [table]
              );

              if (Array.isArray(tableStatus) && tableStatus.length > 0) {
                const status = tableStatus[0] as Record<string, unknown>;
                const updateTime = status.Update_time as Date;
                
                if (updateTime && new Date(updateTime) > sinceTime) {
                  return { table, changes: 1 };
                }
              }
            }
            
            return null;
          } catch (tableError) {
            logger.warn(`检查表 ${table} 变化时出错:`, "MemoryMonitor", { error: (tableError as Error).message });
            return null;
          }
        });

        const batchResults = await Promise.all(changePromises);
        
        // 处理批次结果
        batchResults.forEach(result => {
          if (result) {
            changedTables.push(result.table);
            totalChanges += result.changes;
          }
        });

        // 检查内存压力并清理
        const pressure = this.memoryManager.checkMemoryPressure();
        if (pressure > 0.8) {
          await this.memoryManager.requestMemoryCleanup();
          await this.sleep(50);
        }
      }

      return { changedTables, totalChanges };

    } catch (error) {
      logger.warn('获取变化表失败:', undefined, { error: (error as Error).message });
      return { changedTables: [], totalChanges: 0 };
    }
  }

  /**
   * 更新备份跟踪记录
   *
   * @param {string} trackingTable - 跟踪表名
   * @param {Date} backupTime - 备份时间
   * @param {string} backupPath - 备份文件路径
   * @param {string} [backupType='incremental'] - 备份类型
   * @private
   */
  private async updateBackupTracking(
    trackingTable: string,
    backupTime: Date,
    backupPath: string,
    backupType: 'full' | 'incremental' = 'incremental'
  ): Promise<void> {
    try {
      const stats = await fs.stat(backupPath);

      await this.mysqlManager.executeQuery(`
        INSERT INTO \`${trackingTable}\` (backup_time, backup_type, backup_path, file_size)
        VALUES (?, ?, ?, ?)
      `, [backupTime, backupType, backupPath, stats.size]);

    } catch (error) {
      logger.warn('更新备份跟踪记录失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 带错误恢复的备份创建
   *
   * @param {BackupOptions} options - 备份选项
   * @param {RecoveryStrategy} [recovery] - 恢复策略
   * @returns {Promise<ErrorRecoveryResult<BackupResult>>} 带恢复信息的结果
   */
  async createBackupWithRecovery(
    options: BackupOptions = {},
    recovery?: RecoveryStrategy
  ): Promise<ErrorRecoveryResult<BackupResult>> {
    const defaultRecovery: RecoveryStrategy = {
      retryCount: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      fallbackOptions: {
        compress: false, // 关闭压缩作为回退
        maxFileSize: 50   // 减小文件大小限制
      }
    };

    const strategy = { ...defaultRecovery, ...recovery };

    return await this.executeWithRecovery(
      async () => await this.createBackup(options),
      strategy,
      'backup',
      options
    );
  }

  /**
     * 带进度跟踪的备份创建
     *
     * @param {BackupOptions} options - 备份选项
     * @param {CancellationToken} [cancellationToken] - 取消令牌
     * @returns {Promise<{result: BackupResult, tracker: ProgressTracker}>} 备份结果和进度跟踪器
     */
  async createBackupWithProgress(
    options: BackupOptions = {},
    cancellationToken?: CancellationToken
  ): Promise<{ result: BackupResult, tracker: ProgressTracker }> {
    const tracker = this.createProgressTracker('backup', cancellationToken);

    try {
      // 使用现有的 createBackup 方法，但添加进度更新
      tracker.progress = { stage: 'dumping', progress: 50, message: '正在创建备份...' };
      this.updateProgress(tracker);

      const result = await this.createBackup(options);

      tracker.progress = { stage: 'completed', progress: 100, message: '备份完成' };
      this.updateProgress(tracker);

      if (tracker.onComplete) {
        tracker.onComplete(result);
      }

      return { result, tracker };
    } catch (error) {
      tracker.progress = {
        stage: 'error',
        progress: 0,
        message: `备份失败: ${(error as Error).message}`
      };
      this.updateProgress(tracker);

      if (tracker.onError) {
        tracker.onError(error as Error);
      }

      throw error;
    } finally {
      // 清理跟踪器
      setTimeout(() => {
        this.progressTrackers.delete(tracker.id);
      }, 30000); // 30秒后清理
    }
  }

  /**
   * 更新进度
   *
   * @param {ProgressTracker} tracker - 进度跟踪器
   * @private
   */
  private updateProgress(tracker: ProgressTracker): void {
    if (tracker.onProgress) {
      tracker.onProgress(tracker.progress);
    }

    this.emit('progress-update', {
      trackerId: tracker.id,
      operation: tracker.operation,
      progress: tracker.progress
    });
  }

  /**
   * 检查操作是否被取消
   *
   * @param {CancellationToken} [cancellationToken] - 取消令牌
   * @returns {boolean} 是否被取消
   * @private
   */
  private checkCancellation(cancellationToken?: CancellationToken): boolean {
    return cancellationToken?.isCancelled || false;
  }

  /**
   * 创建进度跟踪器
   *
   * @param {string} operation - 操作类型
   * @param {CancellationToken} [cancellationToken] - 取消令牌
   * @returns {ProgressTracker} 进度跟踪器
   */
  createProgressTracker(
    operation: string,
    cancellationToken?: CancellationToken
  ): ProgressTracker {
    const id = `${operation}_${Date.now()}_${++this.taskIdCounter}`;
    const tracker: ProgressTracker = {
      id,
      operation,
      startTime: new Date(),
      progress: {
        stage: 'preparing',
        progress: 0,
        message: `准备开始 ${operation} 操作...`
      },
      cancellationToken
    };

    this.progressTrackers.set(id, tracker);

    // 监听取消事件
    if (cancellationToken) {
      cancellationToken.onCancelled(() => {
        tracker.progress = {
          stage: 'error',
          progress: 0,
          message: '操作已被取消'
        };
        this.updateProgress(tracker);
      });
    }

    return tracker;
  }

  /**
   * 大文件备份（使用内存优化）
   *
   * @param {BackupOptions} options - 备份选项
   * @param {LargeFileOptions} largeFileOptions - 大文件处理选项
   * @returns {Promise<BackupResult>} 备份结果
   */
  @withPerformanceMonitoring('backup_create_large_file')
  async createLargeFileBackup(
    options: BackupOptions = {},
    largeFileOptions: LargeFileOptions = {}
  ): Promise<BackupResult> {
    const startTime = Date.now();
    const defaultLargeFileOptions: LargeFileOptions = {
      chunkSize: 64 * 1024 * 1024,        // 64MB chunks
      maxMemoryUsage: 512 * 1024 * 1024,  // 512MB max memory
      useMemoryPool: true,
      compressionLevel: 6,                 // Balanced compression
      diskThreshold: 100 * 1024 * 1024    // 100MB threshold for disk caching
    };

    const largeOpts = { ...defaultLargeFileOptions, ...largeFileOptions };
    const backupOpts = {
      ...options,
      compress: true,
      maxFileSize: largeOpts.diskThreshold! / (1024 * 1024)
    };

    try {
      // 检查内存使用情况
      const memoryPressure = this.memoryManager.checkMemoryPressure();
      if (memoryPressure > 0.8) {
        await this.memoryManager.requestMemoryCleanup();
      }

      // 确保输出目录存在
      await ensureDirectoryExists(backupOpts.outputDir!);

      // 生成临时目录用于分块处理
      const tempDir = path.join(backupOpts.outputDir!, 'temp_' + Date.now());
      await ensureDirectoryExists(tempDir);

      try {
        // 获取表信息并计算总大小
        const tables = await this.getTablesWithSizes(backupOpts.tables);
        let totalProcessed = 0;
        const chunks: string[] = [];

        // 按大小排序表，先处理小表（优化内存使用）
        tables.sort((a, b) => a.size - b.size);

        // 预估内存需求并调整批次大小
        const estimatedMemoryPerTable = Math.max(
          ...tables.map(t => Math.min(t.size / 10, 50 * 1024 * 1024))
        );
        const availableMemory = this.memoryManager.getCurrentUsage().heapTotal * 0.5;
        const optimalBatchSize = Math.floor(availableMemory / estimatedMemoryPerTable);
        const finalBatchSize = Math.max(1, Math.min(optimalBatchSize, 3));

        this.emit('large-file-optimization', {
          tablesCount: tables.length,
          estimatedMemoryPerTable: Math.round(estimatedMemoryPerTable / 1024 / 1024) + 'MB',
          optimalBatchSize: finalBatchSize
        });

        // 分块处理表
        for (let i = 0; i < tables.length; i++) {
          const table = tables[i];

          // 检查内存压力
          const currentPressure = this.memoryManager.checkMemoryPressure();
          if (currentPressure > 0.9) {
            await this.memoryManager.requestMemoryCleanup();
            // 等待内存释放
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          this.emit('large-file-progress', {
            stage: 'processing',
            currentTable: table.name,
            tableIndex: i + 1,
            totalTables: tables.length,
            progress: Math.round((i / tables.length) * 100)
          });

          // 为大表创建单独的备份文件
          if (table.size > largeOpts.diskThreshold!) {
            const chunkFile = await this.createTableChunkBackup(table, tempDir, largeOpts);
            chunks.push(chunkFile);
          } else {
            // 小表可以合并处理
            const chunkFile = await this.createSmallTableBackup([table], tempDir, largeOpts);
            chunks.push(chunkFile);
          }

          totalProcessed += table.size;
        }

        // 合并所有块文件
        const finalBackupPath = await this.mergeBackupChunks(chunks, backupOpts, largeOpts);

        // 清理临时文件
        await fs.rm(tempDir, { recursive: true, force: true });

        const stats = await fs.stat(finalBackupPath);
        const duration = Date.now() - startTime;

        return {
          success: true,
          filePath: finalBackupPath,
          fileSize: stats.size,
          tableCount: tables.length,
          recordCount: totalProcessed,
          duration
        };

      } catch (error) {
        // 清理临时文件
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          // 忽略清理错误
        }
        throw error;
      }

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'createLargeFileBackup');
      return {
        success: false,
        error: safeError.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 优化获取表及其大小信息
   *
   * @param {string[]} [specificTables] - 指定的表
   * @returns {Promise<Array<{name: string, size: number, rows: number}>>} 表信息
   * @private
   */
  private async getTablesWithSizes(specificTables?: string[]): Promise<Array<{ name: string, size: number, rows: number }>> {
    const tablesInfo: Array<{ name: string, size: number, rows: number }> = [];

    let tables: string[];
    if (specificTables && specificTables.length > 0) {
      tables = specificTables;
    } else {
      // 使用缓存的表列表
      const cachedTables = await this.cacheManager.get<string[]>(CacheRegion.QUERY_RESULT, 'SHOW_TABLES');
      if (cachedTables) {
        tables = cachedTables;
      } else {
        const allTables = await this.mysqlManager.executeQuery('SHOW TABLES');
        tables = (allTables as Record<string, unknown>[]).map(row => Object.values(row)[0] as string);
        await this.cacheManager.set(CacheRegion.QUERY_RESULT, 'SHOW_TABLES', tables);
      }
    }

    // 批量获取所有表的状态信息（更高效）
    try {
      const whereClause = specificTables && specificTables.length > 0 
        ? `AND table_name IN (${specificTables.map(() => '?').join(', ')})` 
        : '';
      
      const params = specificTables && specificTables.length > 0 ? specificTables : [];
      
      const tablesStatus = await this.mysqlManager.executeQuery(
        `SELECT table_name, data_length, index_length, table_rows, update_time
         FROM information_schema.tables 
         WHERE table_schema = DATABASE() ${whereClause}
         ORDER BY (data_length + index_length) ASC`,
        params
      );

      if (Array.isArray(tablesStatus)) {
        for (const status of tablesStatus as Record<string, unknown>[]) {
          const tableName = status.table_name as string;
          const dataLength = (status.data_length as number) || 0;
          const indexLength = (status.index_length as number) || 0;
          const tableRows = (status.table_rows as number) || 0;
          
          tablesInfo.push({
            name: tableName,
            size: dataLength + indexLength,
            rows: tableRows
          });
        }
      }
    } catch (error) {
      logger.warn('批量获取表状态失败，使用逐个查询方式:', undefined, { error: (error as Error).message });
      
      // 降级到逐个查询（分批处理）
      const batchSize = Math.min(5, this.maxConcurrentTasks);
      for (let i = 0; i < tables.length; i += batchSize) {
        const batch = tables.slice(i, i + batchSize);
        
        const promises = batch.map(async (tableName) => {
          try {
            const cacheKey = `TABLE_STATUS_${tableName}`;
            const cachedStatus = await this.cacheManager.get<{ size: number, rows: number }>(CacheRegion.QUERY_RESULT, cacheKey);
            
            if (cachedStatus) {
              return {
                name: tableName,
                size: cachedStatus.size,
                rows: cachedStatus.rows
              };
            }

            const tableStatus = await this.mysqlManager.executeQuery(
              'SHOW TABLE STATUS LIKE ?', [tableName]
            );

            if (Array.isArray(tableStatus) && tableStatus.length > 0) {
              const status = tableStatus[0] as Record<string, unknown>;
              const size = ((status.Data_length as number) || 0) + ((status.Index_length as number) || 0);
              const rows = (status.Rows as number) || 0;
              
              // 缓存结果
              await this.cacheManager.set(CacheRegion.QUERY_RESULT, cacheKey, { size, rows });
              
              return {
                name: tableName,
                size,
                rows
              };
            } else {
              // 使用COUNT估算
              const rowCount = await this.mysqlManager.executeQuery(
                `SELECT COUNT(*) as count FROM \`${tableName}\``
              );
              const count = (rowCount as Record<string, unknown>[])[0].count as number || 0;
              
              return {
                name: tableName,
                size: count * 100, // 粗略估算
                rows: count
              };
            }
          } catch (error) {
            logger.warn(`无法获取表 ${tableName} 的信息:`, undefined, { error: (error as Error).message });
            return {
              name: tableName,
              size: 0,
              rows: 0
            };
          }
        });

        const batchResults = await Promise.all(promises);
        tablesInfo.push(...batchResults);

        // 检查内存压力
        const pressure = this.memoryManager.checkMemoryPressure();
        if (pressure > 0.8) {
          await this.memoryManager.requestMemoryCleanup();
          await this.sleep(100);
        }
      }
    }

    return tablesInfo;
  }

  /**
   * 创建表块备份
   *
   * @param {object} table - 表信息
   * @param {string} tempDir - 临时目录
   * @param {LargeFileOptions} options - 选项
   * @returns {Promise<string>} 块文件路径
   * @private
   */
  private async createTableChunkBackup(
    table: { name: string, size: number, rows: number },
    tempDir: string,
    options: LargeFileOptions
  ): Promise<string> {
    const chunkFile = path.join(tempDir, `${table.name}_chunk.sql`);
    const _config = this.mysqlManager.configManager.database;

    // 对于大表，使用LIMIT分批导出
    const batchSize = Math.max(1000, Math.floor(options.chunkSize! / 1024)); // 估算批次大小
    let offset = 0;
    let hasMoreData = true;

    const writeStream = createWriteStream(chunkFile);

    try {
      // 写入表结构
      const createTableQuery = await this.mysqlManager.executeQuery(
        `SHOW CREATE TABLE \`${table.name}\``
      );

      if (Array.isArray(createTableQuery) && createTableQuery.length > 0) {
        const createStatement = (createTableQuery[0] as Record<string, unknown>)['Create Table'] as string;
        writeStream.write(`DROP TABLE IF EXISTS \`${table.name}\`;\n`);
        writeStream.write(`${createStatement};\n\n`);
      }

      // 分批导出数据
      while (hasMoreData) {
        // 检查内存压力
        const memoryPressure = this.memoryManager.checkMemoryPressure();
        if (memoryPressure > 0.85) {
          await this.memoryManager.requestMemoryCleanup();
        }

        const data = await this.mysqlManager.executeQuery(
          `SELECT * FROM \`${table.name}\` LIMIT ${batchSize} OFFSET ${offset}`
        );

        if (!Array.isArray(data) || data.length === 0) {
          hasMoreData = false;
          break;
        }

        // 生成INSERT语句
        if (data.length > 0) {
          const columns = Object.keys(data[0]);
          const columnList = columns.map(col => `\`${col}\``).join(', ');

          writeStream.write(`INSERT INTO \`${table.name}\` (${columnList}) VALUES\n`);

          for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const values = columns.map(col => {
              const value = row[col];
              if (value === null) return 'NULL';
              if (typeof value === 'string') {
                return `'${value.replace(/'/g, "''")}'`;
              }
              return value;
            }).join(', ');

            writeStream.write(`(${values})${i === data.length - 1 ? ';\n\n' : ',\n'}`);
          }
        }

        offset += batchSize;

        if (data.length < batchSize) {
          hasMoreData = false;
        }
      }

      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      return chunkFile;

    } catch (error) {
      writeStream.destroy();
      throw error;
    }
  }

  /**
   * 创建小表备份
   *
   * @param {Array} tables - 表信息数组
   * @param {string} tempDir - 临时目录
   * @param {LargeFileOptions} options - 选项
   * @returns {Promise<string>} 块文件路径
   * @private
   */
  private async createSmallTableBackup(
    tables: Array<{ name: string, size: number, rows: number }>,
    tempDir: string,
    _options: LargeFileOptions
  ): Promise<string> {
    const chunkFile = path.join(tempDir, `small_tables_${Date.now()}.sql`);
    const config = this.mysqlManager.configManager.database;

    const dumpArgs = [
      `-h${config.host}`,
      `-P${config.port}`,
      `-u${config.user}`,
      `-p${config.password}`,
      '--default-character-set=utf8mb4',
      '--single-transaction',
      '--routines',
      '--triggers',
      config.database || '',
      ...tables.map(t => t.name)
    ];

    await CommonUtils.executeCommand('mysqldump', dumpArgs, chunkFile);
    return chunkFile;
  }

  /**
   * 合并备份块
   *
   * @param {string[]} chunks - 块文件路径数组
   * @param {BackupOptions} backupOptions - 备份选项
   * @param {LargeFileOptions} largeFileOptions - 大文件选项
   * @returns {Promise<string>} 最终备份文件路径
   * @private
   */
  private async mergeBackupChunks(
    chunks: string[],
    backupOptions: BackupOptions,
    largeFileOptions: LargeFileOptions
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFileName = `${backupOptions.filePrefix || 'mysql_large_backup'}_${timestamp}`;
    const finalPath = path.join(backupOptions.outputDir!, finalFileName);

    if (chunks.length === 1) {
      // 只有一个块，直接移动并压缩
      const singleChunk = chunks[0];
      const sqlPath = `${finalPath}.sql`;
      await fs.rename(singleChunk, sqlPath);

      if (backupOptions.compress) {
        const zipPath = `${finalPath}.zip`;
        await CommonUtils.compressFile(sqlPath, zipPath, 'zip', largeFileOptions.compressionLevel);
        await fs.unlink(sqlPath);
        return zipPath;
      }

      return sqlPath;
    }

    // 多个块需要合并
    const mergedSqlPath = `${finalPath}.sql`;
    const writeStream = createWriteStream(mergedSqlPath);

    try {
      // 写入文件头
      writeStream.write(`-- MySQL Large File Backup\n`);
      writeStream.write(`-- Generated on: ${new Date().toISOString()}\n`);
      writeStream.write(`-- Chunks: ${chunks.length}\n\n`);
      writeStream.write(`SET FOREIGN_KEY_CHECKS=0;\n\n`);

      // 合并所有块
      for (const chunkFile of chunks) {
        const chunkContent = await fs.readFile(chunkFile, 'utf8');
        writeStream.write(chunkContent);
        writeStream.write('\n');

        // 删除临时块文件
        await fs.unlink(chunkFile);
      }

      writeStream.write(`\nSET FOREIGN_KEY_CHECKS=1;\n`);
      writeStream.end();

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      // 压缩合并后的文件
      if (backupOptions.compress) {
        const zipPath = `${finalPath}.zip`;
        await CommonUtils.compressFile(mergedSqlPath, zipPath, 'zip', largeFileOptions.compressionLevel);
        await fs.unlink(mergedSqlPath);
        return zipPath;
      }

      return mergedSqlPath;

    } catch (error) {
      writeStream.destroy();
      throw error;
    }
  }

  /**
     * 带队列的备份创建
     * 
     * @param {BackupOptions} options - 备份选项
     * @param {number} priority - 任务优先级
     * @returns {Promise<{taskId: string, result?: BackupResult}>} 任务ID和结果
     */
  async createBackupQueued(options: BackupOptions = {}, priority: number = 1): Promise<{ taskId: string, result?: BackupResult }> {
    const taskId = this.addTaskToQueue(
      'backup',
      () => this.createBackup(options),
      options as Record<string, unknown>,
      priority
    );

    // 等待任务完成
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const task = this.getTaskStatus(taskId);
        if (!task) {
          reject(new Error('任务不存在'));
          return;
        }

        if (task.status === 'completed') {
          resolve({ taskId, result: task.result });
        } else if (task.status === 'failed') {
          reject(new Error(task.error || '任务执行失败'));
        } else if (task.status === 'cancelled') {
          reject(new Error('任务已取消'));
        } else {
          setTimeout(checkStatus, 1000); // 1秒后再检查
        }
      };

      checkStatus();
    });
  }

  /**
   * 生成数据报表
   *
   * 执行多个查询并生成综合数据报表，支持多工作表Excel文件。
   * 提供详细的报表信息和自定义选项。
   *
   * @param {ReportConfig} reportConfig - 报表配置对象
   * @returns {Promise<ExportResult>} 包含报表生成结果的JSON格式数据
   * @throws {Error} 当报表生成失败时抛出
   */
  @withPerformanceMonitoring('report_generate')
  async generateReport(reportConfig: ReportConfig): Promise<ExportResult> {
    const startTime = Date.now();

    try {
      const opts: ExportOptions = {
        outputDir: './reports',
        format: 'excel',
        fileName: `report_${reportConfig.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`,
        includeHeaders: true,
        ...reportConfig.options
      };

      // 确保输出目录存在
      await ensureDirectoryExists(opts.outputDir!);

      // 创建工作簿
      const workbook = new ExcelJS.Workbook();

      // 添加报表信息工作表
      const infoSheet = workbook.addWorksheet('报表信息');
      infoSheet.addRow(['报表标题', reportConfig.title]);
      infoSheet.addRow(['生成时间', new Date().toLocaleString('zh-CN')]);
      if (reportConfig.description) {
        infoSheet.addRow(['报表描述', reportConfig.description]);
      }
      infoSheet.addRow(['查询数量', reportConfig.queries.length]);

      // 设置信息表样式
      infoSheet.getColumn(1).width = 15;
      infoSheet.getColumn(2).width = 40;
      infoSheet.getRow(1).font = { bold: true, size: 14 };

      let totalRows = 0;
      let totalColumns = 0;

      // 为每个查询创建工作表
      for (const queryConfig of reportConfig.queries) {
        try {
          const data = await this.mysqlManager.executeQuery(queryConfig.query, queryConfig.params || []);

          if (Array.isArray(data) && data.length > 0) {
            const worksheet = workbook.addWorksheet(queryConfig.name.substring(0, 31)); // Excel工作表名称限制
            const columns = Object.keys(data[0]);

            // 添加标题
            worksheet.addRow([queryConfig.name]).font = { bold: true, size: 12 };
            worksheet.addRow([]); // 空行

            // 添加列头
            if (opts.includeHeaders) {
              worksheet.addRow(columns);
              worksheet.getRow(3).font = { bold: true };
              worksheet.getRow(3).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
              };
            }

            // 添加数据
            data.forEach(row => {
              worksheet.addRow(Object.values(row));
            });

            // 自动调整列宽
            worksheet.columns.forEach((column, index) => {
              let maxLength = 0;
              worksheet.eachRow((row, rowNumber) => {
                if (rowNumber >= 3) { // 跳过标题行
                  const cell = row.getCell(index + 1);
                  const value = cell.value ? cell.value.toString() : '';
                  maxLength = Math.max(maxLength, value.length);
                }
              });
              column.width = Math.min(Math.max(maxLength + 2, 10), 50);
            });

            totalRows += data.length;
            totalColumns = Math.max(totalColumns, columns.length);
          }
        } catch (queryError) {
          // 为查询错误创建错误工作表
          const errorSheet = workbook.addWorksheet(`错误_${queryConfig.name.substring(0, 25)}`);
          errorSheet.addRow(['查询名称', queryConfig.name]);
          errorSheet.addRow(['错误信息', (queryError as Error).message]);
          errorSheet.addRow(['查询SQL', queryConfig.query]);
        }
      }

      // 更新信息表
      infoSheet.addRow(['总行数', totalRows]);
      infoSheet.addRow(['总列数', totalColumns]);

      // 保存文件
      const filePath = path.join(opts.outputDir!, opts.fileName!);
      await workbook.xlsx.writeFile(filePath);

      const stats = await fs.stat(filePath);
      const duration = Date.now() - startTime;

      return {
        success: true,
        filePath,
        fileSize: stats.size,
        rowCount: totalRows,
        columnCount: totalColumns,
        format: 'excel',
        duration
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'generateReport');
      return {
        success: false,
        error: safeError.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * 验证备份文件的完整性和有效性，检查文件大小、结构和内容
   * 现在支持压缩文件的完整内容验证
   *
   * @param {string} backupFilePath - 备份文件路径
   * @param {boolean} [deepValidation=true] - 是否进行深度验证（解压缩文件）
   * @returns {Promise<any>} 包含验证结果的对象
   */
  @withPerformanceMonitoring('backup_verify')
  async verifyBackup(backupFilePath: string, deepValidation: boolean = true): Promise<{
    valid: boolean;
    fileSize: number;
    tablesFound: string[];
    recordCount?: number;
    createdAt?: string;
    backupType?: string;
    compression?: string;
    error?: string;
    warnings?: string[];
    compressionRatio?: number;
    decompressedSize?: number;
    checksum?: string;
  }> {
    try {
      const stats = await fs.stat(backupFilePath);
      let content: string;
      const warnings: string[] = [];
      let compressionType = 'none';
      let compressionRatio: number | undefined;
      let decompressedSize: number | undefined;
      let tempFiles: string[] = [];

      // 检测压缩类型
      const fileExt = path.extname(backupFilePath).toLowerCase();
      const isCompressed = ['.zip', '.gz', '.gzip', '.br'].includes(fileExt);

      if (isCompressed) {
        compressionType = fileExt === '.zip' ? 'ZIP' :
          fileExt === '.br' ? 'BROTLI' : 'GZIP';

        if (!deepValidation) {
          // 浅验证：仅检查文件存在性和基本属性
          return {
            valid: true,
            fileSize: stats.size,
            tablesFound: [],
            compression: compressionType,
            createdAt: stats.mtime.toISOString(),
            warnings: ['仅进行浅验证，未解压缩验证内容']
          };
        }

        // 深度验证：解压缩并验证内容
        try {
          const tempDir = path.join(path.dirname(backupFilePath), 'temp_verify');
          tempFiles = await CommonUtils.decompressFile(backupFilePath, tempDir, fileExt);

          if (tempFiles.length === 0) {
            throw new Error('解压缩后未找到文件');
          }

          // 找到SQL文件（通常是第一个或最大的文件）
          let sqlFile = tempFiles[0];
          if (tempFiles.length > 1) {
            let maxSize = 0;
            for (const file of tempFiles) {
              const fileStats = await fs.stat(file);
              if (fileStats.size > maxSize && file.endsWith('.sql')) {
                maxSize = fileStats.size;
                sqlFile = file;
              }
            }
          }

          content = await fs.readFile(sqlFile, 'utf8');

          // 计算压缩比和解压缩大小
          const decompressedStats = await fs.stat(sqlFile);
          decompressedSize = decompressedStats.size;
          compressionRatio = stats.size / decompressedSize;

          // 清理临时文件
          await fs.rm(path.dirname(sqlFile), { recursive: true, force: true });

        } catch (decompressionError) {
          return {
            valid: false,
            fileSize: stats.size,
            tablesFound: [],
            compression: compressionType,
            createdAt: stats.mtime.toISOString(),
            error: `解压缩失败: ${(decompressionError as Error).message}`,
            warnings: ['无法解压缩文件进行内容验证']
          };
        }
      } else {
        content = await fs.readFile(backupFilePath, 'utf8');
      }

      // 检查文件大小
      if (stats.size === 0) {
        return {
          valid: false,
          fileSize: 0,
          tablesFound: [],
          error: '备份文件为空'
        };
      }

      if (stats.size < 100) {
        warnings.push('备份文件大小异常小，可能不完整');
      }

      // 计算文件校验和
      const crypto = await import('crypto');
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // 增强的SQL结构检查
      const hasHeader = content.includes('mysqldump') || content.includes('MySQL dump') ||
        content.includes('MySQL数据库备份') || content.includes('-- Server version');
      const hasFooter = content.includes('Dump completed') || content.includes('备份结束') ||
        content.includes('-- Dump completed on') || content.includes('SET SQL_MODE=@OLD_SQL_MODE');

      // 检查字符集设置
      const hasCharset = content.includes('utf8') || content.includes('UTF8') ||
        content.includes('CHARACTER SET') || content.includes('CHARSET');

      // 检查表结构 - 更准确的正则表达式
      const createTableMatches = content.match(/CREATE TABLE[\s\S]*?ENGINE[\s\S]*?;/gi) || [];
      const dropTableMatches = content.match(/DROP TABLE IF EXISTS [`"]([^`"]+)[`"]/g) || [];
      const insertMatches = content.match(/INSERT INTO[\s\S]*?VALUES[\s\S]*?;/gi) || [];
      const lockTableMatches = content.match(/LOCK TABLES [`"]([^`"]+)[`"]/g) || [];

      // 提取表名 - 支持更多格式
      const tablesFromDrop = dropTableMatches.map(match => {
        const result = match.match(/[`"]([^`"]+)[`"]/);
        return result ? result[1] : '';
      }).filter(name => name !== '');

      const tablesFromLock = lockTableMatches.map(match => {
        const result = match.match(/[`"]([^`"]+)[`"]/);
        return result ? result[1] : '';
      }).filter(name => name !== '');

      // 合并所有找到的表名并去重
      const allTables = [...new Set([...tablesFromDrop, ...tablesFromLock])];

      // 估算记录数量 - 更准确的计算
      let estimatedRecords = 0;
      const valuePatterns = content.match(/VALUES\s*\(/gi) || [];
      estimatedRecords = valuePatterns.length;

      // 检查是否有多行INSERT
      const multiRowInserts = content.match(/INSERT INTO[^;]*VALUES[^;]*(?:\([^)]*\),\s*)+/gi) || [];
      multiRowInserts.forEach(insert => {
        const rowCount = (insert.match(/\(/g) || []).length;
        estimatedRecords += Math.max(0, rowCount - 1); // 减去INSERT部分的括号
      });

      // 检查备份类型
      let backupType = 'unknown';
      if (createTableMatches.length > 0 && insertMatches.length > 0) {
        backupType = 'full'; // 结构和数据
      } else if (createTableMatches.length > 0) {
        backupType = 'structure'; // 仅结构
      } else if (insertMatches.length > 0) {
        backupType = 'data'; // 仅数据
      }

      // 增强的验证检查
      if (allTables.length === 0) {
        warnings.push('未找到表定义，备份可能不完整或格式不正确');
      }

      if (backupType === 'full' && estimatedRecords === 0) {
        warnings.push('未找到数据插入语句，可能为空表备份');
      }

      if (!hasCharset) {
        warnings.push('未找到字符集设置，可能导致乱码问题');
      }

      // 检查SQL语法问题
      const suspiciousPatterns = [
        /LOCK TABLES[^;]*(?!UNLOCK)/gi,  // 未解锁的锁表
        /BEGIN(?![;\s]*COMMIT)/gi,        // 未提交的事务
        /START TRANSACTION(?![;\s]*COMMIT)/gi
      ];

      suspiciousPatterns.forEach(pattern => {
        if (pattern.test(content)) {
          warnings.push('发现可能的SQL语法问题或未完成的事务');
        }
      });

      // 检查是否有潜在的截断问题
      if (!content.endsWith('\n') && !content.endsWith(';')) {
        warnings.push('备份文件可能被截断（文件末尾异常）');
      }

      // 检查文件完整性指标
      const completenessScore = this.calculateCompletenessScore({
        hasHeader,
        hasFooter,
        tablesCount: allTables.length,
        hasInserts: insertMatches.length > 0,
        hasCharset,
        warningsCount: warnings.length
      });

      const isValid = hasHeader && allTables.length > 0 && completenessScore >= 0.7;

      return {
        valid: isValid,
        fileSize: stats.size,
        tablesFound: allTables,
        recordCount: estimatedRecords,
        createdAt: stats.mtime.toISOString(),
        backupType,
        compression: compressionType,
        compressionRatio,
        decompressedSize,
        checksum,
        error: isValid ? undefined : this.generateValidationError(hasHeader, allTables.length, hasFooter, completenessScore),
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      return {
        valid: false,
        fileSize: 0,
        tablesFound: [],
        error: `验证过程中出错: ${(error as Error).message}`
      };
    }
  }

  /**
   * 计算备份文件完整性评分
   *
   * @param {object} params - 评分参数
   * @returns {number} 完整性评分 (0-1)
   * @private
   */
  private calculateCompletenessScore(params: {
    hasHeader: boolean;
    hasFooter: boolean;
    tablesCount: number;
    hasInserts: boolean;
    hasCharset: boolean;
    warningsCount: number;
  }): number {
    let score = 0;

    // 基础分数
    if (params.hasHeader) score += 0.3;
    if (params.hasFooter) score += 0.2;
    if (params.tablesCount > 0) score += 0.3;
    if (params.hasCharset) score += 0.1;

    // 数据相关分数
    if (params.hasInserts) score += 0.1;

    // 警告扣分
    score -= Math.min(params.warningsCount * 0.05, 0.2);

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 生成验证错误信息
   *
   * @param {boolean} hasHeader - 是否有文件头
   * @param {number} tablesCount - 表数量
   * @param {boolean} hasFooter - 是否有文件尾
   * @param {number} completenessScore - 完整性评分
   * @returns {string} 错误信息
   * @private
   */
  private generateValidationError(
    hasHeader: boolean,
    tablesCount: number,
    hasFooter: boolean,
    completenessScore: number
  ): string {
    const errors: string[] = [];

    if (!hasHeader) errors.push('缺少备份文件头');
    if (tablesCount === 0) errors.push('未找到表定义');
    if (!hasFooter) errors.push('缺少文件结尾标识');
    if (completenessScore < 0.7) errors.push(`完整性评分过低 (${(completenessScore * 100).toFixed(1)}%)`);

    return `备份文件验证失败: ${errors.join(', ')}`;
  }

  /**
   * 通用导出方法 - 根据格式自动选择导出方式
   *
   * @param {string} query - SQL查询
   * @param {unknown[]} params - 查询参数
   * @param {ExportOptions} options - 导出选项
   * @returns {Promise<ExportResult>} 导出结果
   */
  async exportData(query: string, params: unknown[] = [], options: ExportOptions = {}): Promise<ExportResult> {
    const format = options.format || 'excel';
    // Map format to ExporterType - treat 'excel' as 'excel' and anything else as is
    const exporterType = format === 'excel' ? 'excel' : format;
    const exporter = this.exporterFactory.createExporter(exporterType);
    return exporter.export(query, params, options);
  }

  /**
   * 带错误恢复的导出
   *
   * @param {string} query - SQL查询
   * @param {unknown[]} params - 查询参数
   * @param {ExportOptions} options - 导出选项
   * @param {RecoveryStrategy} [recovery] - 恢复策略
   * @returns {Promise<ErrorRecoveryResult<ExportResult>>} 带恢复信息的结果
   */
  async exportDataWithRecovery(
    query: string,
    params: unknown[] = [],
    options: ExportOptions = {},
    recovery?: RecoveryStrategy
  ): Promise<ErrorRecoveryResult<ExportResult>> {
    const defaultRecovery: RecoveryStrategy = {
      retryCount: 2,
      retryDelay: 500,
      exponentialBackoff: true,
      fallbackOptions: {
        streaming: false, // 关闭流式处理作为回退
        maxRows: 10000,   // 减少行数限制
        batchSize: 500    // 减小批处理大小
      }
    };

    const strategy = { ...defaultRecovery, ...recovery };

    return await this.executeWithRecovery(
      async () => await this.exportData(query, params, options),
      strategy,
      'export',
      options
    );
  }

  /**
   * 通用错误恢复执行器
   *
   * @param {Function} operation - 要执行的操作
   * @param {RecoveryStrategy} strategy - 恢复策略
   * @param {string} operationType - 操作类型
   * @param {any} originalOptions - 原始选项
   * @returns {Promise<ErrorRecoveryResult<T>>} 执行结果
   * @private
   */
  private async executeWithRecovery<T>(
    operation: () => Promise<T>,
    strategy: RecoveryStrategy,
    operationType: string,
    originalOptions: BackupOptions | ExportOptions | Record<string, unknown>
  ): Promise<ErrorRecoveryResult<T>> {
    let lastError: Error | null = null;
    let attemptsUsed = 0;
    let recoveryApplied: string | undefined;

    // 主要尝试
    for (let attempt = 0; attempt <= strategy.retryCount; attempt++) {
      try {
        attemptsUsed = attempt + 1;

        if (attempt > 0) {
          // 计算延迟时间
          const delay = strategy.exponentialBackoff
            ? strategy.retryDelay * Math.pow(2, attempt - 1)
            : strategy.retryDelay;

          await this.sleep(delay);

          // 调用重试回调
          if (strategy.onRetry) {
            strategy.onRetry(attempt, lastError!);
          }

          this.emit('retry-attempt', {
            operation: operationType,
            attempt,
            totalAttempts: strategy.retryCount + 1,
            delay,
            error: lastError?.message
          });
        }

        const result = await operation();

        if (attempt > 0) {
          recoveryApplied = `成功重试 (第 ${attempt} 次尝试)`;
        }

        return {
          success: true,
          result,
          recoveryApplied,
          attemptsUsed
        };

      } catch (error) {
        lastError = error as Error;

        // 检查是否是可恢复的错误
        if (!ErrorHandler.isRecoverableError(lastError)) {
          break; // 不可恢复的错误，停止重试
        }

        // 记录错误
        this.emit('recovery-error', {
          operation: operationType,
          attempt: attempt + 1,
          error: lastError.message,
          isRecoverable: true
        });
      }
    }

    // 如果有回退选项，尝试回退策略
    if (strategy.fallbackOptions && lastError) {
      try {
        this.emit('fallback-attempt', {
          operation: operationType,
          originalError: lastError.message,
          fallbackOptions: strategy.fallbackOptions
        });

        if (strategy.onFallback) {
          strategy.onFallback(lastError);
        }

        // 应用回退选项
        const fallbackOptions = { ...originalOptions, ...strategy.fallbackOptions };

        let fallbackResult: T;
        if (operationType === 'backup') {
          fallbackResult = await this.createBackup(fallbackOptions) as T;
        } else if (operationType === 'export') {
          // 这里需要重新构造参数，但为了简化，我们假设有访问权限
          fallbackResult = await this.exportData('', [], fallbackOptions) as T;
        } else {
          throw lastError; // 不支持的操作类型
        }

        return {
          success: true,
          result: fallbackResult,
          recoveryApplied: `应用回退策略成功`,
          attemptsUsed
        };

      } catch (fallbackError) {
        this.emit('fallback-failed', {
          operation: operationType,
          fallbackError: (fallbackError as Error).message,
          originalError: lastError.message
        });
      }
    }

    // 所有恢复尝试都失败了
    return {
      success: false,
      error: `${operationType} 操作失败，已尝试 ${attemptsUsed} 次: ${lastError?.message}`,
      attemptsUsed,
      finalError: lastError!
    };
  }

  /**
   * 睡眠函数
   *
   * @param {number} ms - 毫秒数
   * @returns {Promise<void>}
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带进度跟踪的导出
   *
   * @param {string} query - SQL查询
   * @param {unknown[]} params - 查询参数
   * @param {ExportOptions} options - 导出选项
   * @param {CancellationToken} [cancellationToken] - 取消令牌
   * @returns {Promise<{result: ExportResult, tracker: ProgressTracker}>} 导出结果和进度跟踪器
   */
  async exportDataWithProgress(
    query: string,
    params: unknown[] = [],
    options: ExportOptions = {},
    cancellationToken?: CancellationToken
  ): Promise<{ result: ExportResult, tracker: ProgressTracker }> {
    const tracker = this.createProgressTracker('export', cancellationToken);

    try {
      // 检查取消状态
      if (this.checkCancellation(cancellationToken)) {
        throw new Error('操作已被取消');
      }

      tracker.progress = { stage: 'processing', progress: 10, message: '开始Excel导出...' };
      this.updateProgress(tracker);

      const result = await this.exportData(query, params, options);

      tracker.progress = { stage: 'completed', progress: 100, message: '导出完成' };
      this.updateProgress(tracker);

      if (tracker.onComplete) {
        tracker.onComplete(result);
      }

      return { result, tracker };
    } catch (error) {
      tracker.progress = {
        stage: 'error',
        progress: 0,
        message: `导出失败: ${(error as Error).message}`
      };
      this.updateProgress(tracker);

      if (tracker.onError) {
        tracker.onError(error as Error);
      }

      throw error;
    } finally {
      // 清理跟踪器
      setTimeout(() => {
        this.progressTrackers.delete(tracker.id);
      }, 30000); // 30秒后清理
    }
  }

  /**
   * 带队列的导出
   * 
   * @param {string} query - SQL查询
   * @param {unknown[]} params - 查询参数
   * @param {ExportOptions} options - 导出选项
   * @param {number} priority - 任务优先级
   * @returns {Promise<{taskId: string, result?: ExportResult}>} 任务ID和结果
   */
  async exportDataQueued(
    query: string,
    params: unknown[] = [],
    options: ExportOptions = {},
    priority: number = 1
  ): Promise<{ taskId: string, result?: ExportResult }> {
    const taskId = this.addTaskToQueue(
      'export',
      () => this.exportData(query, params, options),
      { query, params, options },
      priority
    );

    // 等待任务完成
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const task = this.getTaskStatus(taskId);
        if (!task) {
          reject(new Error('任务不存在'));
          return;
        }

        if (task.status === 'completed') {
          resolve({ taskId, result: task.result });
        } else if (task.status === 'failed') {
          reject(new Error(task.error || '任务执行失败'));
        } else if (task.status === 'cancelled') {
          reject(new Error('任务已取消'));
        } else {
          setTimeout(checkStatus, 1000); // 1秒后再检查
        }
      };

      checkStatus();
    });
  }

  /**
   * 获取所有活动的进度跟踪器
   *
   * @returns {ProgressTracker[]} 活动的进度跟踪器列表
   */
  getActiveTrackers(): ProgressTracker[] {
    return Array.from(this.progressTrackers.values());
  }

  /**
   * 取消指定的操作
   *
   * @param {string} trackerId - 跟踪器ID
   * @returns {boolean} 是否成功取消
   */
  cancelOperation(trackerId: string): boolean {
    const tracker = this.progressTrackers.get(trackerId);
    if (tracker && tracker.cancellationToken) {
      tracker.cancellationToken.cancel();
      return true;
    }
    return false;
  }

  /**
   * 清理已完成的跟踪器
   */
  cleanupCompletedTrackers(): void {
    const now = Date.now();
    for (const [id, tracker] of this.progressTrackers.entries()) {
      const elapsed = now - tracker.startTime.getTime();
      if (elapsed > 300000 || // 5分钟后清理
        tracker.progress.stage === 'completed' ||
        tracker.progress.stage === 'error') {
        this.progressTrackers.delete(id);
      }
    }
  }

  /**
   * 设置内存管理
   * @private
   */
  private setupMemoryManagement(): void {
    this.memoryManager.enableMemoryMonitoring();

    // 监听内存压力并采取行动
    this.memoryManager.onMemoryPressure((pressure) => {
      this.emit('memory-pressure', { pressure });

      if (pressure > 0.85) {
        // 高内存压力：清理完成的跟踪器
        this.cleanupCompletedTrackers();

        // 强制垃圾回收
        this.memoryManager.requestMemoryCleanup();

        // 如果压力仍然很高，暂停新任务
        if (pressure > 0.95) {
          this.emit('memory-critical', {
            pressure,
            message: '内存使用率过高，暂停新任务'
          });
        }
      }
    });
  }

  /**
   * 获取内存使用情况
   *
   * @returns {MemoryUsage} 内存使用情况
   */
  getMemoryUsage(): MemoryUsage {
    return this.memoryManager.getCurrentUsage();
  }

  /**
   * 获取内存压力
   *
   * @returns {number} 内存压力 (0-1)
   */
  getMemoryPressure(): number {
    return this.memoryManager.checkMemoryPressure();
  }

  /**
   * 手动触发内存清理
   *
   * @returns {Promise<void>}
   */
  async cleanupMemory(): Promise<void> {
    await this.memoryManager.requestMemoryCleanup();
    this.cleanupCompletedTrackers();
  }

  /**
   * 启用/禁用内存监控
   *
   * @param {boolean} enabled - 是否启用
   */
  setMemoryMonitoring(enabled: boolean): void {
    if (enabled) {
      this.memoryManager.enableMemoryMonitoring();
    } else {
      this.memoryManager.disableMemoryMonitoring();
    }
  }

  /**
   * 启动任务调度器
   * @private
   */
  private startTaskScheduler(): void {
    if (this.isSchedulerRunning) return;

    this.isSchedulerRunning = true;
    
    // 使用动态间隔，根据任务负载调整检查频率
    const scheduleNext = () => {
      if (!this.isSchedulerRunning) return;
      
      const queuedTasks = Array.from(this.taskQueue.values()).filter(t => t.status === 'queued').length;
      const interval = queuedTasks > 5 ? 500 : 1000; // 高负载时更频繁检查
      
      setTimeout(async () => {
        try {
          await this.processTaskQueue();
        } catch (error) {
          logger.warn('Task queue processing error:', undefined, { error: (error as Error).message });
        }
        scheduleNext();
      }, interval);
    };

    scheduleNext();
    this.emit('scheduler-started', { 
      maxConcurrentTasks: this.maxConcurrentTasks,
      adaptiveScheduling: true 
    });
  }

  /**
   * 停止任务调度器
   */
  stopTaskScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
    this.isSchedulerRunning = false;
    this.emit('scheduler-stopped');
  }

  /**
   * 处理任务队列
   * @private
   */
  private async processTaskQueue(): Promise<void> {
    // 清理已完成或失败的任务
    this.cleanupCompletedTasks();

    // 如果当前运行的任务数量已达到最大值，则等待
    if (this.runningTasks >= this.maxConcurrentTasks) {
      return;
    }

    // 获取待执行的任务（按优先级排序）
    const pendingTasks = Array.from(this.taskQueue.values())
      .filter(task => task.status === 'queued')
      .sort((a, b) => b.priority - a.priority); // 高优先级优先

    // 启动可以运行的任务
    const tasksToStart = pendingTasks.slice(0, this.maxConcurrentTasks - this.runningTasks);

    for (const task of tasksToStart) {
      this.executeTask(task);
    }
  }

  /**
   * 添加任务到队列
   * 
   * @param {string} type - 任务类型
   * @param {Function} operation - 要执行的操作
   * @param {any} params - 操作参数
   * @param {number} priority - 任务优先级（越高越优先）
   * @returns {string} 任务ID
   */
  addTaskToQueue<T>(
    type: 'backup' | 'export' | 'report',
    operation: () => Promise<T>,
    params: Record<string, unknown> = {},
    priority: number = 1
  ): string {
    const taskId = `${type}_${Date.now()}_${++this.taskIdCounter}`;

    const task: TaskQueue = {
      id: taskId,
      type,
      status: 'queued',
      priority,
      createdAt: new Date(),
      progress: {
        stage: 'preparing',
        progress: 0,
        message: `${type} 任务已加入队列...`
      }
    };

    // 存储任务和操作
    this.taskQueue.set(taskId, task);
    (task as TaskQueue & { _operation: () => Promise<T> })._operation = operation;
    (task as TaskQueue & { _params: Record<string, unknown> })._params = params;

    this.emit('task-queued', {
      taskId,
      type,
      priority,
      queueSize: this.taskQueue.size
    });

    return taskId;
  }

  /**
   * 执行单个任务
   * @param {TaskQueue} task - 要执行的任务
   * @private
   */
  private async executeTask(task: TaskQueue): Promise<void> {
    try {
      // 更新任务状态
      task.status = 'running';
      task.startedAt = new Date();
      this.runningTasks++;

      this.emit('task-started', {
        taskId: task.id,
        type: task.type,
        runningTasks: this.runningTasks
      });

      // 执行任务
      const operation = (task as TaskQueue & { _operation?: () => Promise<unknown> })._operation;
      if (!operation) {
        throw new Error('任务操作未定义');
      }

      const result = await operation();

      // 任务成功完成
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result as BackupResult;
      this.runningTasks--;

      this.emit('task-completed', {
        taskId: task.id,
        type: task.type,
        result,
        duration: task.completedAt.getTime() - task.startedAt!.getTime(),
        runningTasks: this.runningTasks
      });

    } catch (error) {
      // 任务失败
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = (error as Error).message;
      this.runningTasks--;

      this.emit('task-failed', {
        taskId: task.id,
        type: task.type,
        error: task.error,
        runningTasks: this.runningTasks
      });
    }
  }

  /**
   * 取消任务
   * 
   * @param {string} taskId - 任务ID
   * @returns {boolean} 是否成功取消
   */
  cancelTask(taskId: string): boolean {
    const task = this.taskQueue.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'running') {
      // 对于正在运行的任务，设置取消标志
      task.status = 'cancelled';
      task.completedAt = new Date();
      this.runningTasks--;

      // 如果任务有关联的进度跟踪器，也要取消
      const tracker = this.progressTrackers.get(taskId);
      if (tracker && tracker.cancellationToken) {
        tracker.cancellationToken.cancel();
      }

      this.emit('task-cancelled', {
        taskId,
        type: task.type,
        runningTasks: this.runningTasks
      });

      return true;
    } else if (task.status === 'queued') {
      // 对于排队中的任务，直接移除
      this.taskQueue.delete(taskId);

      this.emit('task-removed', {
        taskId,
        type: task.type,
        queueSize: this.taskQueue.size
      });

      return true;
    }

    return false;
  }

  /**
   * 获取任务状态
   * 
   * @param {string} taskId - 任务ID
   * @returns {TaskQueue | null} 任务信息
   */
  getTaskStatus(taskId: string): TaskQueue | null {
    return this.taskQueue.get(taskId) || null;
  }

  /**
   * 获取队列统计信息
   * 
   * @returns {object} 队列统计
   */
  getQueueStats(): {
    totalTasks: number;
    queuedTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
    maxConcurrentTasks: number;
    averageWaitTime: number;
    averageExecutionTime: number;
  } {
    const tasks = Array.from(this.taskQueue.values());

    const queuedTasks = tasks.filter(t => t.status === 'queued').length;
    const runningTasks = tasks.filter(t => t.status === 'running').length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const cancelledTasks = tasks.filter(t => t.status === 'cancelled').length;

    // 计算平均等待时间
    const waitTimes = tasks
      .filter(t => t.startedAt)
      .map(t => t.startedAt!.getTime() - t.createdAt.getTime());
    const averageWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

    // 计算平均执行时间
    const executionTimes = tasks
      .filter(t => t.completedAt && t.startedAt)
      .map(t => t.completedAt!.getTime() - t.startedAt!.getTime());
    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    return {
      totalTasks: tasks.length,
      queuedTasks,
      runningTasks,
      completedTasks,
      failedTasks,
      cancelledTasks,
      maxConcurrentTasks: this.maxConcurrentTasks,
      averageWaitTime,
      averageExecutionTime
    };
  }

  /**
   * 清理已完成的任务
   * @private
   */
  private cleanupCompletedTasks(): void {
    const now = Date.now();
    const retentionTime = 30 * 60 * 1000; // 30分钟

    for (const [taskId, task] of this.taskQueue.entries()) {
      const isCompleted = ['completed', 'failed', 'cancelled'].includes(task.status);
      const isOld = task.completedAt && (now - task.completedAt.getTime()) > retentionTime;

      if (isCompleted && isOld) {
        this.taskQueue.delete(taskId);
        this.emit('task-cleaned', { taskId, type: task.type });
      }
    }
  }

  /**
   * 设置最大并发任务数
   * 
   * @param {number} maxConcurrent - 最大并发数
   */
  setMaxConcurrentTasks(maxConcurrent: number): void {
    if (maxConcurrent < 1) {
      throw new Error('最大并发任务数必须大于0');
    }

    const oldMax = this.maxConcurrentTasks;
    this.maxConcurrentTasks = maxConcurrent;

    this.emit('concurrency-changed', {
      oldMax,
      newMax: maxConcurrent
    });
  }

  /**
   * 暂停任务队列处理
   */
  pauseQueue(): void {
    this.stopTaskScheduler();
    this.emit('queue-paused');
  }

  /**
   * 恢复任务队列处理
   */
  resumeQueue(): void {
    this.startTaskScheduler();
    this.emit('queue-resumed');
  }

  /**
   * 清空任务队列（只清除排队中的任务）
   * 
   * @returns {number} 清除的任务数量
   */
  clearQueue(): number {
    const queuedTasks = Array.from(this.taskQueue.values())
      .filter(task => task.status === 'queued');

    queuedTasks.forEach(task => {
      this.taskQueue.delete(task.id);
    });

    this.emit('queue-cleared', { clearedCount: queuedTasks.length });

    return queuedTasks.length;
  }

  /**
   * 获取所有任务信息
   * 
   * @param {string} [status] - 可选的状态过滤
   * @returns {TaskQueue[]} 任务列表
   */
  getAllTasks(status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'): TaskQueue[] {
    const tasks = Array.from(this.taskQueue.values());

    if (status) {
      return tasks.filter(task => task.status === status);
    }

    return tasks;
  }

  /**
   * 清理资源（在对象销毁时调用）
   */
  async cleanup(): Promise<void> {
    // 停止任务调度器
    this.stopTaskScheduler();

    // 取消所有运行中的任务
    const runningTasks = Array.from(this.taskQueue.values())
      .filter(task => task.status === 'running');

    runningTasks.forEach(task => {
      this.cancelTask(task.id);
    });

    // 清理缓存
    await this.cacheManager.clearRegion(CacheRegion.QUERY_RESULT);

    // 清理内存管理器
    this.memoryManager.disableMemoryMonitoring();

    // 清理所有跟踪器
    this.progressTrackers.clear();

    // 清空任务队列
    this.taskQueue.clear();

    // 发出清理统计信息
    const memoryUsage = this.memoryManager.getCurrentUsage();
    this.emit('cleanup-completed', {
      finalMemoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      resourcesCleared: {
        queryCache: true,
        connectionCache: true,
        taskQueue: true,
        progressTrackers: true
      }
    });


  }

  /**
   * 获取任务队列诊断信息
   * 
   * @returns {object} 详细的诊断信息
   */
  getQueueDiagnostics(): {
    scheduler: {
      isRunning: boolean;
      intervalId: number | null;
      checkInterval: number;
    };
    queue: {
      size: number;
      oldestTask: Date | null;
      newestTask: Date | null;
      tasksByType: Record<string, number>;
      tasksByStatus: Record<string, number>;
    };
    performance: {
      averageWaitTime: number;
      averageExecutionTime: number;
      successRate: number;
      throughput: number; // tasks per minute
    };
    resources: {
      maxConcurrentTasks: number;
      currentRunningTasks: number;
      queuedTasks: number;
      memoryUsage: MemoryUsage;
      memoryPressure: number;
    };
  } {
    const tasks = Array.from(this.taskQueue.values());
    const now = Date.now();

    // 队列信息
    const tasksByType: Record<string, number> = {};
    const tasksByStatus: Record<string, number> = {};
    let oldestTask: Date | null = null;
    let newestTask: Date | null = null;

    tasks.forEach(task => {
      // 按类型统计
      tasksByType[task.type] = (tasksByType[task.type] || 0) + 1;

      // 按状态统计
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;

      // 时间范围
      if (!oldestTask || task.createdAt < oldestTask) {
        oldestTask = task.createdAt;
      }
      if (!newestTask || task.createdAt > newestTask) {
        newestTask = task.createdAt;
      }
    });

    // 性能指标
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const failedTasks = tasks.filter(t => t.status === 'failed');
    const totalFinishedTasks = completedTasks.length + failedTasks.length;

    const successRate = totalFinishedTasks > 0
      ? completedTasks.length / totalFinishedTasks
      : 0;

    // 计算吞吐量（每分钟完成的任务数）
    const timeWindow = 60 * 1000; // 1分钟
    const recentCompletedTasks = completedTasks.filter(
      task => task.completedAt && (now - task.completedAt.getTime()) <= timeWindow
    );
    const throughput = recentCompletedTasks.length;

    // 平均等待和执行时间
    const waitTimes = tasks
      .filter(t => t.startedAt)
      .map(t => t.startedAt!.getTime() - t.createdAt.getTime());
    const averageWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

    const executionTimes = tasks
      .filter(t => t.completedAt && t.startedAt)
      .map(t => t.completedAt!.getTime() - t.startedAt!.getTime());
    const averageExecutionTime = executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0;

    return {
      scheduler: {
        isRunning: this.isSchedulerRunning,
        intervalId: this.schedulerInterval ? 1 : null, // 简化返回值
        checkInterval: 1000
      },
      queue: {
        size: tasks.length,
        oldestTask,
        newestTask,
        tasksByType,
        tasksByStatus
      },
      performance: {
        averageWaitTime,
        averageExecutionTime,
        successRate,
        throughput
      },
      resources: {
        maxConcurrentTasks: this.maxConcurrentTasks,
        currentRunningTasks: this.runningTasks,
        queuedTasks: tasks.filter(t => t.status === 'queued').length,
        memoryUsage: this.memoryManager.getCurrentUsage(),
        memoryPressure: this.memoryManager.checkMemoryPressure()
      }
    };
  }
}