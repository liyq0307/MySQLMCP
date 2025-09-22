/**
 * MySQL企业级连接池管理器 - 智能连接池与健康监控系统
 *
 * 高性能、自适应的MySQL连接池管理实现，提供企业级连接管理能力。
 * 集成智能健康监控、动态连接调整、重试机制、数据持久化等企业级功能，
 * 为MySQL MCP服务器提供稳定可靠、高可用性的数据库连接基础设施。
 *
 * @fileoverview 企业级MySQL连接池管理系统 - 智能、高效、可靠
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-04
 * @license MIT
 */

import { createPool, Pool, PoolConnection, PoolOptions } from 'mysql2/promise';
import * as fs from 'fs/promises';
import * as os from 'os';
import { DatabaseConfig } from './config.js';
import { logger } from './logger.js';
import { StringConstants, DefaultConfig } from './constants.js';
import { TimeUtils } from './utils/common.js';
import { ensureDirectoryExists } from './utils/fileUtils.js';
import { withErrorHandling, withPerformanceMonitoring } from './utils/decorators.js';

/**
 * 连接池统计信息接口
 */
interface ConnectionPoolStats {
  [key: string]: string | number | boolean | object;
}

/**
 * 追踪的连接信息
 */
interface TrackedConnection {
  connection: PoolConnection;
  acquiredAt: number;
  stackTrace: string;
  connectionId: string;
}

/**
 * 断路器状态
 */
type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * 连接池集群配置
 */
interface PoolClusterConfig {
  master: DatabaseConfig;
  slaves?: DatabaseConfig[];
}

interface ExtendedPoolConnection extends PoolConnection {
  __connectionId?: string;
  __isReadOnly?: boolean;
}

/**
 * 连接池类 - 企业级MySQL连接管理
 *
 * 高可用的MySQL连接池管理类，提供完整的数据库连接生命周期管理、
 * 故障恢复、重试机制、性能监控和数据持久化功能。
 *
 * 🔧 核心功能特性：
 * - 智能连接池管理：自动维护最小/最大连接数边界
 * - 重试与故障恢复：指数退避重试机制，提升系统可用性
 * - 异步健康监控：非阻塞的定期健康检查，支持并发保护
 * - 动态池重建：通过重建连接池实现真正的动态调整
 * - 数据持久化：统计数据自动保存，重启时恢复历史状态
 * - 超时保护：多层超时机制防止资源泄漏和无限等待
 * - 连接预热：启动时预创建连接，优化初始响应时间
 * - 优雅资源管理：完整的连接释放和清理机制
 *
 * 🛡️ 企业级特性：
 * - 集群友好：支持水平扩展和高可用部署
 * - 监控集成：丰富的性能指标和状态跟踪
 * - 配置化安全：SSL/TLS支持和SQL注入防护
 * - 容错设计：自动故障检测和恢复机制
 *
 * @class ConnectionPool
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-04
 */
export class ConnectionPool {
  /** 数据库配置设置 */
  private config: DatabaseConfig;

  /** MySQL 连接池实例 */
  private pool: Pool | null = null;

  /** 健康检查监控间隔计时器 */
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /** 健康检查队列标志，防止并发检查 */
  private healthCheckInProgress: boolean = false;

  /** 优雅终止的关闭事件标志 */
  private shutdownEvent: boolean = false;

  /** 连接池性能统计 */
  private connectionStats: Record<string, number> = {
    pool_hits: 0,
    pool_waits: 0,
    total_connections_acquired: 0,
    avg_wait_time: 0,
    max_wait_time: 0
  };

  /** 连接池动态调整相关属性 */
  private currentConnectionLimit: number;
  private minConnectionLimit: number;
  private maxConnectionLimit: number;
  private recentWaitTimes: number[] = [];
  private healthCheckFailures: number = 0;
  private lastHealthCheckTime: number = 0;

  /** 监控数据持久化配置 */
  private statsFilePath: string;
  private statsSaveInterval: NodeJS.Timeout | null = null;
  private statsPersistenceEnabled: boolean = true;

  /** 连接泄漏检测 */
  private activeConnections: Map<string, TrackedConnection> = new Map();
  private leakDetectionInterval: NodeJS.Timeout | null = null;
  private connectionIdCounter: number = 0;

  /** 断路器相关属性 */
  private circuitBreakerState: CircuitBreakerState = 'closed';
  private circuitBreakerFailures: number = 0;
  private circuitBreakerLastFailTime: number = 0;
  private circuitBreakerThreshold: number = 5;
  private circuitBreakerTimeout: number = 30000; // 30秒
  private circuitBreakerHalfOpenRequests: number = 0;

  /**
   * 包装连接以进行跟踪和泄漏检测
   *
   * 统一的连接包装方法，避免在多个地方重复实现相同的连接跟踪逻辑。
   *
   * @private
   * @param {PoolConnection} connection - 要包装的连接
   * @param {string} connectionId - 连接ID
   * @param {boolean} isReadOnly - 是否为只读连接
   * @returns {PoolConnection} 包装后的连接
   */
  private wrapConnectionWithTracking(connection: PoolConnection, connectionId: string, isReadOnly: boolean = false): PoolConnection {
    // 包装release方法
    const originalRelease = connection.release.bind(connection);
    const extConn = connection as ExtendedPoolConnection;
    extConn.__connectionId = connectionId;
    extConn.__isReadOnly = isReadOnly;
    connection.release = () => {
      this.activeConnections.delete(connectionId);
      originalRelease();
    };

    return connection;
  }

  /** 读写分离支持 */
  private readPools: Pool[] = [];
  private currentReadPoolIndex: number = 0;
  private clusterConfig?: PoolClusterConfig;

  /**
   * 连接池构造函数
   *
   * 使用提供的数据库配置初始化连接池。
   * 连接池在第一次连接请求时延迟创建。
   *
   * @constructor
   * @param {DatabaseConfig | PoolClusterConfig} config - 数据库连接配置或集群配置
   */
  constructor(config: DatabaseConfig | PoolClusterConfig) {
    // 检查是否为集群配置
    if ('master' in config) {
      this.clusterConfig = config as PoolClusterConfig;
      this.config = this.clusterConfig.master;
    } else {
      this.config = config as DatabaseConfig;
    }
    
    this.currentConnectionLimit = this.config.connectionLimit;
    this.minConnectionLimit = Math.max(1, Math.floor(this.config.connectionLimit / 2));
    this.maxConnectionLimit = this.config.connectionLimit * 2;

    // 初始化统计数据持久化配置
    this.statsFilePath = `./stats/${this.config.database}_stats.json`;
  }

  /**
   * 记录错误日志
   *
   * 统一的错误日志记录方法，确保日志格式一致
   *
   * @private
   * @param {string} message - 错误消息
   * @param {unknown} error - 错误对象
   * @param {string} [context] - 上下文信息
   */
  private logError(message: string, error: unknown, context?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const logMessage = context ? `${message} [${context}]: ${errorMessage}` : `${message}: ${errorMessage}`;
    logger.error(logMessage);
  }

  /**
   * 记录警告日志
   *
   * 统一的警告日志记录方法，确保日志格式一致
   *
   * @private
   * @param {string} message - 警告消息
   * @param {unknown} [details] - 详细信息
   */
  private logWarning(message: string, details?: unknown): void {
    const logMessage = details ? `${message}: ${JSON.stringify(details)}` : message;
    logger.warn(logMessage);
  }

  /**
   * 初始化连接池
   *
   * 创建和配置带有安全设置的MySQL连接池，预热连接，
   * 并启动健康监控。此方法是幂等的，可以安全地多次调用。
   *
   * @public
   * @returns {Promise<void>} 当连接池初始化完成时解析的Promise
   * @throws {Error} 当连接池创建或初始化失败时抛出
   *
   * @example
   * await connectionPool.initialize();
   */
  @withErrorHandling('initialize', 'MSG_POOL_INIT_FAILED')
  @withPerformanceMonitoring('pool_initialize')
  public async initialize(): Promise<void> {
    // 如果连接池已存在则跳过初始化
    if (this.pool) {
      return;
    }

    try {
      // 配置带有安全和性能设置的连接池
      const poolConfig: PoolOptions = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.currentConnectionLimit,
        connectTimeout: this.config.connectTimeout * 1000,
        charset: StringConstants.CHARSET,
        multipleStatements: false, // 安全：禁用多语句以防止SQL注入
        ssl: this.config.sslEnabled ? {} : undefined
      };

      // 创建连接池
      this.pool = createPool(poolConfig);

      // 初始化从节点连接池（如果配置了读写分离）
      await this.initializeReadPools();

      // 预创建最小连接数以获得更好的初始性能
      await this.preCreateConnections();

      // 加载之前保存的统计数据
      await this.loadStatsFromFile();
 
      // 启动定期健康监控
      this.startHealthCheck();
 
      // 启动定期统计数据保存
      this.startStatsSaver();
      
      // 启动连接泄漏检测
      this.startLeakDetection();
 
    } catch (error) {
      throw new Error(`${StringConstants.MSG_FAILED_TO_INIT_POOL} ${error}`);
    }
  }

  /**
   * 启动连接泄漏检测
   *
   * 定期检查是否有连接长时间未释放。
   *
   * @private
   */
  private startLeakDetection(): void {
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
    }
    
    // 每30秒检查一次连接泄漏
    this.leakDetectionInterval = setInterval(() => {
      this.detectLeakedConnections();
    }, 30000);
  }

  /**
   * 检测泄漏的连接
   *
   * 检查活跃连接列表，找出可能泄漏的连接。
   *
   * @private
   */
  private detectLeakedConnections(): void {
    const now = Date.now();
    const leakThreshold = 60000; // 60秒
    const suspectedLeaks: string[] = [];
    
    this.activeConnections.forEach((trackedConn, id) => {
      const duration = now - trackedConn.acquiredAt;
      if (duration > leakThreshold) {
        suspectedLeaks.push(id);
        logger.error(`可能的连接泄漏检测 [ID: ${id}]`, 'ConnectionPool', undefined, {
          duration: `${duration}ms`,
          acquiredAt: new Date(trackedConn.acquiredAt).toISOString(),
          stackTrace: trackedConn.stackTrace
        });
      }
    });
    
    if (suspectedLeaks.length > 0) {
      logger.warn(`检测到 ${suspectedLeaks.length} 个可能的连接泄漏，正在执行自动修复...`);

      // 详细记录泄漏信息
      suspectedLeaks.forEach(id => {
        const trackedConn = this.activeConnections.get(id);
        if (trackedConn) {
          const duration = now - trackedConn.acquiredAt;
          logger.error(`连接泄漏详情 [ID: ${id}]`, 'ConnectionPool', undefined, {
            duration: `${duration}ms (${Math.round(duration / 1000)}秒)`,
            acquiredAt: new Date(trackedConn.acquiredAt).toISOString(),
            stackTrace: trackedConn.stackTrace.substring(0, 200) + '...' // 截断堆栈跟踪
          });
        }
      });

      // 自动修复：强制关闭泄漏的连接
      let fixedCount = 0;
      suspectedLeaks.forEach(id => {
        try {
          const trackedConn = this.activeConnections.get(id);
          if (trackedConn) {
            // 尝试强制释放连接
            if (trackedConn.connection && typeof trackedConn.connection.release === 'function') {
              trackedConn.connection.release();
            }

            // 从追踪列表中移除
            this.activeConnections.delete(id);
            fixedCount++;

            logger.warn(`连接 ${id} 已强制修复`);
          }
        } catch (fixError: unknown) {
          const err = fixError as Error;
          logger.error(`修复连接 ${id} 失败: ${err.message}`);
        }
      });

      logger.warn(`连接泄漏修复完成: ${fixedCount}/${suspectedLeaks.length} 个连接已修复`);
      
      // 如果修复失败的数量过多，可能需要更高级的干预
      if (suspectedLeaks.length - fixedCount > 0) {
        logger.error('连接泄漏自动修复失败，建议检查应用程序代码以防止连接泄漏');
        this.connectionStats.total_connection_leaks = (this.connectionStats.total_connection_leaks || 0) + suspectedLeaks.length;

        // 可以在这里触发告警事件或邮件通知
        logger.error('严重告警: 连接泄漏自动修复失败，可能影响系统性能');
      }
    }
  }

  /**
   * 初始化从节点连接池
   *
   * 如果配置了从节点，创建只读连接池。
   *
   * @private
   * @returns {Promise<void>} 当初始化完成时解析的Promise
   */
  private async initializeReadPools(): Promise<void> {
    if (!this.clusterConfig?.slaves || this.clusterConfig.slaves.length === 0) {
      return;
    }
    
    for (const slaveConfig of this.clusterConfig.slaves) {
      const poolConfig: PoolOptions = {
        host: slaveConfig.host,
        port: slaveConfig.port,
        user: slaveConfig.user,
        password: slaveConfig.password,
        database: slaveConfig.database,
        connectionLimit: slaveConfig.connectionLimit,
        connectTimeout: slaveConfig.connectTimeout * 1000,
        charset: StringConstants.CHARSET,
        multipleStatements: false,
        ssl: slaveConfig.sslEnabled ? {} : undefined
      };
      
      const readPool = createPool(poolConfig);
      // 预热从节点连接池
      await this.warmupPool(readPool, Math.min(2, slaveConfig.connectionLimit));
      this.readPools.push(readPool);
    }
    
    logger.warn(`初始化了 ${this.readPools.length} 个从节点连接池`);
  }

  /**
   * 断路器成功处理
   *
   * 记录成功的操作，可能将断路器从半开状态恢复到关闭状态。
   *
   * @private
   */
  private onCircuitBreakerSuccess(): void {
    if (this.circuitBreakerState === 'half-open') {
      this.circuitBreakerHalfOpenRequests++;
      if (this.circuitBreakerHalfOpenRequests >= 3) {
        // 连续3次成功，关闭断路器
        this.circuitBreakerState = 'closed';
        this.circuitBreakerFailures = 0;
        logger.warn('断路器已恢复到关闭状态');
      }
    } else if (this.circuitBreakerState === 'closed') {
      this.circuitBreakerFailures = 0;
    }
  }

  /**
   * 断路器失败处理
   *
   * 记录失败的操作，可能触发断路器打开。
   *
   * @private
   */
  private onCircuitBreakerFailure(): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailTime = Date.now();
    
    if (this.circuitBreakerState === 'half-open') {
      // 半开状态下失败，立即打开断路器
      this.circuitBreakerState = 'open';
      logger.error('断路器在半开状态下失败，已打开断路器');
    } else if (this.circuitBreakerState === 'closed' && 
               this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      // 关闭状态下连续失败达到阈值，打开断路器
      this.circuitBreakerState = 'open';
      logger.error(`连续失败 ${this.circuitBreakerFailures} 次，已打开断路器`);
    }
  }

  /**
   * 预创建最小连接数
   *
   * 创建配置中指定的最小连接数，通过避免首次请求时的
   * 连接创建延迟来提高初始性能。
   *
   * @private
   * @returns {Promise<void>} 当连接预创建完成时解析的Promise
   */
  /**
   * 预创建连接以获得更好的初始性能
   * 
   * 优化版本：使用批量创建和并行处理，提高预热效率
   * @private
   */
  private async preCreateConnections(): Promise<void> {
    if (!this.pool) return;

    try {
      const startTime = Date.now();
      const batchSize = 5; // 每批创建的连接数
      const minConnections = this.config.minConnections;
      
      // 分批创建连接，避免一次性创建过多连接导致的资源争用
      for (let i = 0; i < minConnections; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, minConnections - i);
        const promises: Promise<PoolConnection>[] = [];
        
        for (let j = 0; j < currentBatchSize; j++) {
          promises.push(this.pool.getConnection());
        }
        
        // 等待当前批次完成
        const connections = await Promise.allSettled(promises);
        
        // 释放成功创建的连接
        connections.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            result.value.release();
          }
        });
        
        // 批次之间短暂延迟，避免过度争用资源
        if (i + batchSize < minConnections) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      const duration = Date.now() - startTime;
      logger.warn(`连接池预热完成：预创建 ${minConnections} 个连接，耗时 ${duration}ms`);
    } catch (error) {
      // 预创建失败对整体功能不是关键的
      logger.warn('连接池预热失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 启动健康检查监控
   *
   * 启动定期健康检查以确保连接池保持健康和响应。
   * 在启动新的健康检查间隔之前清除任何现有的健康检查间隔。
   *
   * @private
   */
  private startHealthCheck(): void {
    // 如果存在则清除现有的健康检查间隔
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // 启动新的健康检查间隔
    this.healthCheckInterval = setInterval(() => {
      // 使用 setImmediate 确保非阻塞
      setImmediate(() => {
        this.performHealthCheck();
      });
    }, DefaultConfig.HEALTH_CHECK_INTERVAL * 1000);
  }

  /**
   * 执行健康检查
   *
   * 使用轻量级的ping命令验证连接池是否正常工作。
   * 采用异步队列机制防止并发检查，超时机制防止阻塞。
   * 增强的连接验证和错误恢复策略。
   *
   * @private
   * @returns {Promise<void>} 当健康检查完成时解析的Promise
   */
  private async performHealthCheck(): Promise<void> {
    // 防止并发健康检查
    if (!this.pool || this.shutdownEvent || this.healthCheckInProgress) return;

    // 检查断路器状态
    if (this.circuitBreakerState === 'open') {
      // 检查是否应该尝试半开状态
      if (Date.now() - this.circuitBreakerLastFailTime > this.circuitBreakerTimeout) {
        this.circuitBreakerState = 'half-open';
        this.circuitBreakerHalfOpenRequests = 0;
      } else {
        return; // 断路器打开，跳过健康检查
      }
    }

    this.healthCheckInProgress = true;
    const startTime = TimeUtils.now();
    this.lastHealthCheckTime = startTime;

    try {
      // 增强的健康检查：获取连接并执行轻量级ping
      const healthCheckPromise = this.pool.getConnection().then(async (connection) => {
        try {
          // 使用ping代替SELECT查询，更轻量级
          await connection.ping();
          connection.release();
          return true;
        } catch (error) {
          connection.release();
          throw error;
        }
      });

      // 设置超时机制（更短的超时时间以快速响应）
      const timeoutMs = DefaultConfig.CONNECT_TIMEOUT * 500; // 连接超时的一半
      await Promise.race([
        healthCheckPromise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('健康检查超时')), timeoutMs)
        )
      ]);

      // 健康检查成功
      this.healthCheckFailures = 0;
      this.onCircuitBreakerSuccess();
    } catch (error: unknown) {
      const err = error as Error;
      // 健康检查失败：记录详细错误信息
      logger.warn('健康检查失败', 'ConnectionPool', {
        error: err.message,
        timestamp: new Date().toISOString(),
        failureCount: this.healthCheckFailures + 1
      });
      this.healthCheckFailures++;
      this.onCircuitBreakerFailure();

      // 如果连续失败次数过多，触发连接池调整
      if (this.healthCheckFailures >= 3) {
        // 使用 process.nextTick 确保非阻塞调整
        process.nextTick(() => {
          this.adjustPoolSize().catch(adjustError =>
            logger.warn('连接池调整失败:', adjustError)
          );
        });
      }

      // 在严重情况下触发高级恢复机制
      if (this.healthCheckFailures >= 5) {
        logger.error('健康检查连续失败 5 次，触发高级恢复机制');
        // 使用非阻塞方式触发恢复
        process.nextTick(() => {
          this.triggerAdvancedRecovery().catch(recoveryError =>
            logger.error('高级恢复机制执行失败:', recoveryError)
          );
        });
      }
    } finally {
      // 重置健康检查标志
      this.healthCheckInProgress = false;
    }
  }

  /**
   * 触发高级恢复机制
   *
   * 当健康检查连续失败多次时触发高级恢复机制，包括：
   * 1. 重建连接池
   * 2. 发送告警通知
   * 3. 记录详细故障信息
   * 4. 实现多层级恢复策略
   *
   * @private
   * @returns {Promise<void>} 当恢复机制执行完成时解析的Promise
   */
  private async triggerAdvancedRecovery(): Promise<void> {
    this.logError('触发高级连接池恢复机制，开始故障修复流程', '');
    const recoveryStartTime = Date.now();

    try {
      // 1. 记录故障详情
      await this.recordRecoveryEvent({
        type: 'HEALTH_CHECK_FAILURE_RECOVERY',
        failureCount: this.healthCheckFailures,
        timestamp: recoveryStartTime,
        severity: 'CRITICAL'
      });

      // 2. 尝试一级恢复：重建主连接池
      await this.executePrimaryRecovery();

      // 3. 验证恢复效果
      const recoveryResult = await this.validateRecovery();

      if (recoveryResult.success) {
        this.logError('连接池恢复成功，所有功能已恢复正常', '');
        this.healthCheckFailures = 0;
        this.onCircuitBreakerSuccess();

        await this.recordRecoveryEvent({
          type: 'RECOVERY_SUCCESS',
          duration: Date.now() - recoveryStartTime,
          recoveryStrategy: recoveryResult.strategy,
          timestamp: Date.now(),
          severity: 'INFO'
        });
      } else {
        // 4. 一级恢复失败，尝试二级恢复
        this.logError('一级恢复失败，尝试二级恢复策略', '');
        await this.executeSecondaryRecovery();

        // 再次验证
        const secondaryResult = await this.validateRecovery();
        if (secondaryResult.success) {
          logger.error('二级恢复成功，连接池已恢复');
        } else {
          // 5. 最终恢复失败，触发紧急告警
          logger.error('所有恢复机制均失败，系统需要手动干预');
          await this.triggerCriticalAlert();
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('高级恢复机制执行出错:', err.message);
      await this.recordRecoveryEvent({
        type: 'RECOVERY_FAILED',
        error: err.message,
        duration: Date.now() - recoveryStartTime,
        timestamp: Date.now(),
        severity: 'EMERGENCY'
      });

      // 即使恢复失败，也要尝试发送告警
      await this.triggerCriticalAlert();
    }
  }

  /**
   * 执行一级恢复策略
   *
   * @private
   * @returns {Promise<void>}
   */
  private async executePrimaryRecovery(): Promise<void> {
    logger.error('执行一级恢复：重建主连接池');

    // 重置连接池大小到推荐值
    const recommendedSize = Math.max(this.minConnectionLimit, Math.floor(this.currentConnectionLimit / 2));
    await this.recreatePool(recommendedSize);

    // 重置断路器状态
    this.circuitBreakerState = 'closed';
    this.circuitBreakerFailures = 0;
  }

  /**
   * 执行二级恢复策略
   *
   * @private
   * @returns {Promise<void>}
   */
  private async executeSecondaryRecovery(): Promise<void> {
    this.logError('执行二级恢复：深度重建和资源清理', '');

    try {
      // 1. 强制清理所有活跃连接
      await this.forceCleanupConnections();

      // 2. 重建连接池到最小配置
      await this.recreatePool(this.minConnectionLimit);

      // 3. 等待一段时间让系统稳定
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 4. 尝试预热连接
      await this.preCreateConnections();

    } catch (error) {
      this.logError('二级恢复策略执行失败', error);
      throw error;
    }
  }

  /**
   * 强制清理所有活跃连接
   *
   * @private
   * @returns {Promise<void>}
   */
  private async forceCleanupConnections(): Promise<void> {
    this.logError('强制清理所有活跃连接', '');

    const cleanupPromises: Promise<void>[] = [];

    // 关闭所有追踪的连接
    this.activeConnections.forEach((trackedConn, id) => {
      const cleanupPromise = new Promise<void>((resolve) => {
        try {
          if (trackedConn.connection && typeof trackedConn.connection.release === 'function') {
            trackedConn.connection.release();
          }
          this.activeConnections.delete(id);
          resolve();
        } catch (error) {
          this.logError(`清理连接 ${id} 失败`, error);
          resolve(); // 不阻塞整体清理流程
        }
      });
      cleanupPromises.push(cleanupPromise);
    });

    // 等待所有清理操作完成
    await Promise.all(cleanupPromises);

    // 强制关闭现有连接池
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
      } catch (error) {
        this.logError('强制关闭主连接池失败', error);
      }
    }

    // 清理从节点连接池
    for (let i = this.readPools.length - 1; i >= 0; i--) {
      try {
        await this.readPools[i].end();
        this.readPools.splice(i, 1);
      } catch (error) {
        this.logError(`强制关闭从节点连接池 ${i + 1} 失败`, error);
      }
    }

    this.logError(`连接清理完成，已清理 ${cleanupPromises.length} 个活跃连接`, '');
  }

  /**
   * 验证恢复效果
   *
   * @private
   * @returns {Promise<{success: boolean, strategy?: string}>}
   */
  private async validateRecovery(): Promise<{success: boolean, strategy?: string}> {
    logger.error('开始验证恢复效果...');

    try {
      if (!this.pool) {
        return { success: false };
      }

      // 执行简化的健康检查
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();

      logger.error('恢复验证通过，连接池工作正常');
      return { success: true, strategy: 'PRIMARY' };
    } catch (error) {
      logger.error('恢复验证失败:', undefined, error as Error);
      return { success: false };
    }
  }

  /**
   * 触发严重告警
   *
   * @private
   * @returns {Promise<void>}
   */
  private async triggerCriticalAlert(): Promise<void> {
    const alertData = {
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL',
      component: 'ConnectionPool',
      event: 'CONNECTION_POOL_RECOVERY_FAILED',
      details: {
        failureCount: this.healthCheckFailures,
        poolName: this.config.database,
        host: this.config.host,
        lastHealthCheckTime: this.lastHealthCheckTime,
        currentPoolSize: this.currentConnectionLimit,
        circuitBreakerState: this.circuitBreakerState
      },
      recommendations: [
        '检查数据库服务器状态',
        '验证网络连接',
        '检查数据库凭据',
        '查看数据库日志',
        '考虑重启应用程序'
      ]
    };

    logger.error('紧急告警: 连接池恢复失败', 'ConnectionPool', undefined, alertData);

    try {
      // 可以在这里集成外部告警系统，如邮件、Slack、监控服务等
      // await this.sendExternalAlert(alertData);

      // 保存告警到文件
      await this.saveAlertToFile(alertData);
    } catch (error) {
      logger.error('发送告警失败:', undefined, error as Error);
    }
  }

  /**
   * 记录恢复事件
   *
   * @private
   * @param event - 恢复事件信息
   * @returns {Promise<void>}
   */
  private async recordRecoveryEvent(event: {
    type: string;
    timestamp: number;
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' | 'EMERGENCY';
    [key: string]: unknown;
  }): Promise<void> {
    try {
      // 准备事件数据
      const eventData = {
        ...event,
        poolName: this.config.database,
        host: this.config.host,
        port: this.config.port
      };

      logger.error(`记录恢复事件: ${event.type} - ${event.severity}`, 'ConnectionPool', undefined, eventData);

      // 可以根据配置将事件发送到日志系统、监控系统等
      // await this.logToMonitoringSystem(eventData);

      // 保存到本地文件用于分析
      await this.saveEventToFile(eventData);
    } catch (error) {
      logger.error('记录恢复事件失败:', undefined, error as Error);
    }
  }

  /**
   * 保存告警到文件
   *
   * @private
   * @param alertData - 告警数据
   * @returns {Promise<void>}
   */
  private async saveAlertToFile(alertData: Record<string, unknown>): Promise<void> {
    try {
      const alertsFilePath = `./logs/${this.config.database}_alerts.log`;
      const dir = alertsFilePath.substring(0, alertsFilePath.lastIndexOf('/'));

      await ensureDirectoryExists(dir);

      const alertEntry = `${alertData.timestamp} [${alertData.severity}] ${alertData.event}: ${JSON.stringify(alertData)}\n`;

      await fs.appendFile(alertsFilePath, alertEntry, 'utf8');
    } catch (error) {
      logger.warn('保存告警到文件失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 保存事件到文件
   *
   * @private
   * @param eventData - 事件数据
   * @returns {Promise<void>}
   */
  private async saveEventToFile(eventData: Record<string, unknown>): Promise<void> {
    try {
      const eventsFilePath = `./logs/${this.config.database}_recovery_events.log`;
      const dir = eventsFilePath.substring(0, eventsFilePath.lastIndexOf('/'));

      await ensureDirectoryExists(dir);

      const eventEntry = `${new Date(eventData.timestamp as string | number).toISOString()} [${eventData.severity}] ${eventData.type}: ${JSON.stringify(eventData)}\n`;

      await fs.appendFile(eventsFilePath, eventEntry, 'utf8');
    } catch (error) {
      logger.warn('保存事件到文件失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 动态调整连接池大小
   *
   * 根据性能指标和健康检查结果动态调整连接池大小。
   * 当需要调整时，会重建连接池以实现真正的动态调整。
   *
   * @private
   * @returns {Promise<void>} 当连接池调整完成时解析的Promise
   */
  private async adjustPoolSize(): Promise<void> {
    if (!this.pool) return;

    try {
      // 计算平均等待时间和趋势
      const avgWaitTime = this.recentWaitTimes.length > 0
        ? this.recentWaitTimes.reduce((a, b) => a + b, 0) / this.recentWaitTimes.length
        : 0;
      
      // 计算最近等待时间的变化趋势
      const recentWaitTimes = this.recentWaitTimes.slice(-10); // 最近10个等待时间
      const trend = recentWaitTimes.length > 1
        ? (recentWaitTimes[recentWaitTimes.length - 1] - recentWaitTimes[0]) / (recentWaitTimes.length - 1)
        : 0;

      let newConnectionLimit = this.currentConnectionLimit;

      // 如果等待时间过长且有上升趋势，增加连接数
      if (avgWaitTime > 200 && trend > 10 && this.currentConnectionLimit < this.maxConnectionLimit) {
        newConnectionLimit = Math.min(this.maxConnectionLimit, this.currentConnectionLimit + 3);
      }
      // 如果等待时间很短且有下降趋势，减少连接数以节省资源
      else if (avgWaitTime < 50 && trend < -5 && this.currentConnectionLimit > this.minConnectionLimit) {
        newConnectionLimit = Math.max(this.minConnectionLimit, this.currentConnectionLimit - 2);
      }
      // 如果健康检查连续失败且连接池较大，则减少连接数
      else if (this.healthCheckFailures >= 3 && this.currentConnectionLimit > this.minConnectionLimit) {
        newConnectionLimit = Math.max(this.minConnectionLimit, this.currentConnectionLimit - 1);
      }
      // 基于系统负载的动态调整
      else {
        // 获取系统负载信息
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;
        
        // 如果系统负载较高，适当减少连接数
        if (loadAvg > cpuCount * 0.8 && this.currentConnectionLimit > this.minConnectionLimit) {
          newConnectionLimit = Math.max(this.minConnectionLimit, this.currentConnectionLimit - 1);
        }
        // 如果系统负载较低，可以适当增加连接数
        else if (loadAvg < cpuCount * 0.3 && this.currentConnectionLimit < this.maxConnectionLimit) {
          newConnectionLimit = Math.min(this.maxConnectionLimit, this.currentConnectionLimit + 1);
        }
      }

      // 只有在需要调整时才重建连接池
      if (newConnectionLimit !== this.currentConnectionLimit) {
        logger.warn(`连接池大小调整：${this.currentConnectionLimit} -> ${newConnectionLimit}`);
        await this.recreatePool(newConnectionLimit);
      }
    } catch (error) {
      logger.warn('连接池大小调整失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 重建连接池 - 使用双缓冲机制
   *
   * 通过双缓冲机制重新创建连接池来实现动态调整大小。
   * 先创建新池，预热后再切换，确保零停机时间。
   *
   * @private
   * @param {number} newConnectionLimit - 新的连接池大小上限
   * @returns {Promise<void>} 当连接池重建完成时解析的Promise
   */
  private async recreatePool(newConnectionLimit: number): Promise<void> {
    try {
      logger.warn(`开始重建连接池：${this.currentConnectionLimit} -> ${newConnectionLimit}`);
      
      // 配置新连接池
      const poolConfig: PoolOptions = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: newConnectionLimit,
        connectTimeout: this.config.connectTimeout * 1000,
        charset: StringConstants.CHARSET,
        multipleStatements: false,
        ssl: this.config.sslEnabled ? {} : undefined
      };

      // 创建新连接池
      const newPool = createPool(poolConfig);
      
      // 预热新连接池
      await this.warmupPool(newPool, Math.min(this.config.minConnections, newConnectionLimit));
      
      // 暂停健康检查，避免在切换期间干扰
      this.stopHealthCheck();
      
      // 保存旧连接池引用
      const oldPool = this.pool;
      
      // 原子切换到新连接池
      this.pool = newPool;
      this.currentConnectionLimit = newConnectionLimit;
      this.healthCheckFailures = 0;
      
      // 重启健康检查
      this.startHealthCheck();
      
      // 异步优雅关闭旧连接池
      if (oldPool) {
        this.gracefulShutdownPool(oldPool).catch((error: unknown) => {
          logger.warn('旧连接池关闭时出现错误:', (error as Error).message);
        });
      }

      logger.warn(`连接池重建完成，新大小：${newConnectionLimit}`);
    } catch (error) {
      logger.error('连接池重建失败:', undefined, error as Error);
      // 恢复健康检查
      this.startHealthCheck();
      throw error;
    }
  }

  /**
   * 预热连接池
   *
   * 为指定的连接池预创建连接，提高初始性能。
   *
   * @private
   * @param {Pool} pool - 要预热的连接池
   * @param {number} count - 要预创建的连接数
   * @returns {Promise<void>} 当预热完成时解析的Promise
   */
  private async warmupPool(pool: Pool, count: number): Promise<void> {
    try {
      const promises: Promise<PoolConnection>[] = [];
      for (let i = 0; i < count; i++) {
        promises.push(pool.getConnection());
      }
      
      const connections = await Promise.all(promises);
      connections.forEach(conn => conn.release());
    } catch (error) {
      logger.warn('连接池预热失败:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 优雅关闭连接池
   *
   * 异步优雅地关闭指定的连接池，等待活跃连接完成。
   *
   * @private
   * @param {Pool} pool - 要关闭的连接池
   * @returns {Promise<void>} 当连接池关闭时解析的Promise
   */
  private async gracefulShutdownPool(pool: Pool): Promise<void> {
    try {
      // 等待一小段时间让活跃连接完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 设置关闭超时
      const closeTimeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('连接池关闭超时')), 10000)
      );
      
      await Promise.race([pool.end(), closeTimeout]);
    } catch (error) {
      logger.warn('关闭旧连接池时出现警告:', (error as Error).message);
    }
  }

  /**
   * 停止健康检查
   *
   * 停止监控间隔并清理相关资源。
   *
   * @private
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * 启动定期统计数据保存
   *
   * 启动定期保存统计数据的任务，避免重启后数据丢失。
   *
   * @private
   */
  private startStatsSaver(): void {
    // 每5分钟保存一次统计数据
    const saveInterval = 5 * 60 * 1000; // 5分钟

    this.statsSaveInterval = setInterval(() => {
      this.saveStatsToFile().catch(error =>
        logger.warn('定期保存统计数据失败:', error.message)
      );
    }, saveInterval);
  }

  /**
   * 保存统计数据到文件
   *
   * 将当前监控统计数据保存到本地文件，供重启后恢复使用。
   *
   * @private
   * @returns {Promise<void>} 当保存完成时解析的Promise
   */
  private async saveStatsToFile(): Promise<void> {
    if (!this.statsPersistenceEnabled) return;

    try {
      // 准备要保存的数据
      const statsData = {
        timestamp: new Date().toISOString(),
        poolName: this.config.database,
        connectionStats: { ...this.connectionStats },
        currentConnectionLimit: this.currentConnectionLimit,
        recentWaitTimes: this.recentWaitTimes.slice(-50), // 仅保存最近50个
        healthCheckFailures: this.healthCheckFailures,
        lastHealthCheckTime: this.lastHealthCheckTime
      };

      // 确保目录存在
      const dir = this.statsFilePath.substring(0, this.statsFilePath.lastIndexOf('/'));
      await ensureDirectoryExists(dir);

      // 保存到文件
      await fs.writeFile(
        this.statsFilePath,
        JSON.stringify(statsData, null, 2),
        'utf8'
      );

      logger.warn(`统计数据已保存到 ${this.statsFilePath}`);
    } catch (error: unknown) {
      const err = error as Error;
      logger.warn('保存统计数据失败:', err.message);
    }
  }

  /**
   * 从文件加载统计数据
   *
   * 在连接池初始化时尝试加载之前保存的统计数据。
   *
   * @private
   * @returns {Promise<void>} 当加载完成时解析的Promise
   */
  private async loadStatsFromFile(): Promise<void> {
    if (!this.statsPersistenceEnabled) return;

    try {
      // 检查文件是否存在
      await fs.access(this.statsFilePath);

      // 读取文件内容
      const data = await fs.readFile(this.statsFilePath, 'utf8');
      const statsData = JSON.parse(data);

      // 验证数据有效性
      if (statsData && statsData.connectionStats) {
        // 恢复统计数据
        Object.assign(this.connectionStats, statsData.connectionStats);

        // 恢复其他状态
        if (statsData.currentConnectionLimit) {
          this.currentConnectionLimit = statsData.currentConnectionLimit;
        }
        if (statsData.recentWaitTimes) {
          this.recentWaitTimes = statsData.recentWaitTimes.slice(-100); // 限制最大数量
        }

        logger.warn(`已从 ${this.statsFilePath} 恢复统计数据`);
      }
    } catch (error: unknown) {
      // 文件不存在或加载失败是正常的，重置为默认值
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        logger.warn('加载统计数据失败:', err.message);
      }
    }
  }

  /**
   * 获取数据库连接
   *
   * 从连接池中检索连接，具有自动初始化、重试机制和超时保护功能。
   * 测量连接获取时间并更新监控统计信息。支持连接跟踪和泄漏检测。
   *
   * @public
   * @returns {Promise<PoolConnection>} 解析为数据库连接的Promise
   * @throws {Error} 当连接池初始化失败、超时或重试失败时抛出
   *
   * @example
   * const connection = await pool.getConnection();
   * try {
   *   const [rows] = await connection.execute('SELECT * FROM users');
   *   return rows;
   * } finally {
   *   connection.release();
   * }
   */
  public async getConnection(): Promise<PoolConnection> {
    // 检查断路器状态
    if (this.circuitBreakerState === 'open') {
      const timeSinceLastFail = Date.now() - this.circuitBreakerLastFailTime;
      if (timeSinceLastFail > this.circuitBreakerTimeout) {
        // 尝试半开状态
        this.circuitBreakerState = 'half-open';
        this.circuitBreakerHalfOpenRequests = 0;
      } else {
        throw new Error(`断路器打开中，请 ${Math.ceil((this.circuitBreakerTimeout - timeSinceLastFail) / 1000)} 秒后重试`);
      }
    }

    // 如果尚未完成则初始化连接池
    if (!this.pool) {
      await this.initialize();
    }

    // 验证连接池是否成功初始化
    if (!this.pool) {
      throw new Error('连接池未初始化');
    }

    const maxRetries = DefaultConfig.MAX_RETRY_ATTEMPTS;
    const baseDelay = DefaultConfig.RECONNECT_DELAY * 1000; // 转换为毫秒
    let lastError: Error | null = null;

    // 重试机制：最多重试几次，指数退避
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 跟踪连接获取时间以进行性能监控
        const startTime = TimeUtils.now();

        // 创建获取连接的 Promise 与超时结合
        const connectionPromise = this.pool.getConnection();

        // 添加超时机制
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('连接获取超时')), DefaultConfig.CONNECT_TIMEOUT * 1000);
        });

        const connection = await Promise.race([connectionPromise, timeoutPromise]);
        const waitTime = TimeUtils.getDurationInMs(startTime);

        // 跟踪活跃连接以进行泄漏检测
        const connectionId = `conn_${++this.connectionIdCounter}_${Date.now()}`;
        const stackTrace = new Error().stack || 'No stack trace available';
        this.activeConnections.set(connectionId, {
          connection,
          acquiredAt: Date.now(),
          stackTrace,
          connectionId
        });

        // 包装连接以进行跟踪和泄漏检测
        this.wrapConnectionWithTracking(connection, connectionId);

        // 更新连接统计信息
        this.connectionStats[StringConstants.FIELD_TOTAL_CONNECTIONS_ACQUIRED]++;

        // 根据等待时间更新连接统计信息
        if (waitTime > 100) { // 超过100ms表示连接池压力
          this.connectionStats[StringConstants.FIELD_POOL_WAITS]++;
        } else {
          this.connectionStats[StringConstants.FIELD_POOL_HITS]++;
        }

        // 更新等待时间统计
        this.recentWaitTimes.push(waitTime);
        if (this.recentWaitTimes.length > 100) {
          this.recentWaitTimes.shift(); // 保持最近100个等待时间
        }

        // 更新平均和最大等待时间
        const totalWaitTime = this.recentWaitTimes.reduce((a, b) => a + b, 0);
        this.connectionStats[StringConstants.FIELD_AVG_WAIT_TIME] = totalWaitTime / this.recentWaitTimes.length;
        this.connectionStats[StringConstants.FIELD_MAX_WAIT_TIME] = Math.max(
          this.connectionStats[StringConstants.FIELD_MAX_WAIT_TIME] || 0,
          waitTime
        );

        // 如果等待时间过长，可能需要调整连接池
        if (waitTime > 500) {
          await this.adjustPoolSize();
        }

        // 断路器成功
        this.onCircuitBreakerSuccess();

        return connection;
      } catch (error: unknown) {
        lastError = error as Error;
        this.onCircuitBreakerFailure();

        // 如果不是最后一次尝试，则等待指数退避后的重试
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // 指数退避
          logger.warn(`连接获取失败 (尝试 ${attempt + 1}/${maxRetries + 1})，${delay}ms 后重试：`, (error as Error).message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试都失败了，抛出最后一次的错误
    throw new Error(`获取数据库连接失败，已重试 ${maxRetries + 1} 次：${lastError?.message || '未知错误'}`);
  }

  /**
   * 获取只读连接
   *
   * 从从节点连接池获取连接，使用轮询负载均衡策略。
   * 如果没有配置从节点，则从主节点获取连接。
   *
   * @public
   * @returns {Promise<PoolConnection>} 解析为数据库连接的Promise
   * @throws {Error} 当连接获取失败时抛出
   *
   * @example
   * // 获取只读连接执行查询
   * const connection = await pool.getReadConnection();
   * try {
   *   const [rows] = await connection.execute('SELECT * FROM users');
   *   return rows;
   * } finally {
   *   connection.release();
   * }
   */
  public async getReadConnection(): Promise<PoolConnection> {
    // 如果没有配置从节点，使用主节点
    if (this.readPools.length === 0) {
      return this.getConnection();
    }
    
    // 轮询选择从节点
    const poolIndex = this.currentReadPoolIndex;
    this.currentReadPoolIndex = (this.currentReadPoolIndex + 1) % this.readPools.length;
    
    const readPool = this.readPools[poolIndex];
    const maxRetries = DefaultConfig.MAX_RETRY_ATTEMPTS;
    const baseDelay = DefaultConfig.RECONNECT_DELAY * 1000;
    
    // 重试机制
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = TimeUtils.now();
        
        // 获取连接并设置超时
        const connectionPromise = readPool.getConnection();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('连接获取超时')), DefaultConfig.CONNECT_TIMEOUT * 1000);
        });
        
        const connection = await Promise.race([connectionPromise, timeoutPromise]);
        const waitTime = TimeUtils.getDurationInMs(startTime);
        
        // 跟踪只读连接
        const connectionId = `read_conn_${++this.connectionIdCounter}_${Date.now()}`;
        const stackTrace = new Error().stack || 'No stack trace available';
        this.activeConnections.set(connectionId, {
          connection,
          acquiredAt: Date.now(),
          stackTrace,
          connectionId
        });

        // 包装连接以进行跟踪和泄漏检测
        this.wrapConnectionWithTracking(connection, connectionId, true);
        
        logger.warn(`从节点${poolIndex + 1}连接获取成功，等待时间: ${waitTime}ms`);
        return connection;
      } catch (error: unknown) {
        const err = error as Error;
        
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          logger.warn(`从节点${poolIndex + 1}连接获取失败 (尝试 ${attempt + 1}/${maxRetries + 1})，${delay}ms 后重试：`, err.message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // 如果从节点都不可用，尝试从主节点获取
    logger.error(`从节点${poolIndex + 1}不可用，尝试从主节点获取连接`);
    return this.getConnection();
  }

  /**
   * 获取写入连接
   *
   * 显式从主节点获取连接，用于写入操作。
   * 这是 getConnection 的别名，但语义更清晰。
   *
   * @public
   * @returns {Promise<PoolConnection>} 解析为数据库连接的Promise
   */
  public async getWriteConnection(): Promise<PoolConnection> {
    const connection = await this.getConnection();
    const extConn = connection as ExtendedPoolConnection;
    extConn.__isReadOnly = false;
    return connection;
  }

  /**
   * 获取连接池统计信息
   *
   * 返回关于连接池的综合统计信息，包括配置、性能指标
   * 和健康状态，用于监控和调试目的。
   *
   * @public
   * @returns {ConnectionPoolStats} 连接池统计信息和配置信息
   *
   * @example
   * const stats = pool.getStats();
   * console.log(`连接池命中: ${stats.connection_stats.pool_hits}`);
   */
  public getStats(): ConnectionPoolStats {
    if (!this.pool) {
      return { [StringConstants.STATUS_KEY]: StringConstants.STATUS_NOT_INITIALIZED };
    }

    // 返回可用的连接池统计信息和配置
    // 注意：在生产实现中，我们会访问更多连接池内部信息
    return {
      [StringConstants.FIELD_POOL_NAME]: StringConstants.POOL_NAME,
      [StringConstants.FIELD_POOL_SIZE]: this.currentConnectionLimit,
      [StringConstants.FIELD_MIN_POOL_SIZE]: this.minConnectionLimit,
      [StringConstants.FIELD_MAX_POOL_SIZE]: this.maxConnectionLimit,
      [StringConstants.FIELD_CONNECTION_STATS]: { ...this.connectionStats },
      [StringConstants.FIELD_HEALTH_CHECK_ACTIVE]: !!this.healthCheckInterval,
      [StringConstants.FIELD_HEALTH_CHECK_FAILURES]: this.healthCheckFailures,
      [StringConstants.FIELD_LAST_HEALTH_CHECK]: this.lastHealthCheckTime
    };
  }

  /**
   * 关闭连接池
   *
   * 执行连接池的优雅关闭，包括停止健康检查、
   * 关闭所有连接和清理资源。应在应用程序关闭时调用。
   *
   * @public
   * @returns {Promise<void>} 当连接池完全关闭时解析的Promise
   *
   * @example
   * // 优雅关闭
   * await pool.close();
   */
  public async close(): Promise<void> {
    // 设置关闭标志以防止新操作
    this.shutdownEvent = true;

    // 停止健康检查监控
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // 停止连接泄漏检测
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
      this.leakDetectionInterval = null;
    }

    // 停止统计数据定期保存
    if (this.statsSaveInterval) {
      clearInterval(this.statsSaveInterval);
      this.statsSaveInterval = null;
    }

    // 保存最终统计数据
    await this.saveStatsToFile();

    // 关闭主连接池并释放所有连接
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    
    // 关闭所有从节点连接池
    for (const readPool of this.readPools) {
      try {
        await readPool.end();
      } catch (error) {
        logger.warn('关闭从节点连接池失败:', undefined, { error: (error as Error).message });
      }
    }
    this.readPools = [];
  }
}