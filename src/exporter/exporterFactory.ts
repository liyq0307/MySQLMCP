/**
 * 导出工作类
 * 
 * @author liyq
 * @since 1.0.0
 * @version 1.0.0
 * @category Backup
 * @subcategory ExporterFactory
 * 
 */

import { MySQLManager } from '../mysqlManager.js';
import { MemoryManager } from '../types/backupTypes.js';
import { ExporterType, ExporterConstructor, BaseExporter, CsvExporter, JsonExporter, ExcelExporter } from './exporters.js';
import { MySQLMCPError, ErrorCategory, ErrorSeverity } from '../types.js';

/**
 * 导出器工厂类
 *
 * 主要功能：
 * - 1. 单例模式管理
 * - 2. 导出器实例创建
 * - 3. 基础缓存功能
 */
export class ExporterFactory {
  private static instance: ExporterFactory | null = null;
  private readonly mysqlManager: MySQLManager;
  private readonly memoryManager: MemoryManager;

  /* 导出器类型注册表 */
  private readonly exporterRegistry = new Map<ExporterType, ExporterConstructor>();

  /* 导出器实例缓存 */
  private readonly exporterCache = new Map<string, BaseExporter>();

  /**
   * 私有构造函数 - 实现单例模式
   */
  private constructor(
    mysqlManager: MySQLManager,
    memoryManager: MemoryManager
  ) {
    this.mysqlManager = mysqlManager;
    this.memoryManager = memoryManager;
    this.initializeDefaultExporters();
  }

  /**
   * 获取工厂实例 - 单例模式
   */
  public static getInstance(
    mysqlManager: MySQLManager,
    memoryManager: MemoryManager
  ): ExporterFactory {
    if (!ExporterFactory.instance) {
      ExporterFactory.instance = new ExporterFactory(mysqlManager, memoryManager);
    }
    return ExporterFactory.instance;
  }

  /**
   * 初始化默认导出器
   */
  private initializeDefaultExporters(): void {
    this.exporterRegistry.set('csv', CsvExporter);
    this.exporterRegistry.set('json', JsonExporter);
    this.exporterRegistry.set('excel', ExcelExporter);
    this.exporterRegistry.set('xlsx', ExcelExporter); // xlsx 是 excel 的别名
  }

  /**
   * 创建导出器实例
   */
  public createExporter(type: ExporterType = 'csv'): BaseExporter {
    // 检查缓存
    const cached = this.exporterCache.get(type);
    if (cached) {
      return cached;
    }

    // 创建新实例
    const ExporterClass = this.exporterRegistry.get(type);

    if (!ExporterClass) {
      throw new MySQLMCPError(
        `不支持的导出器类型: ${type}。支持的类型: ${Array.from(this.exporterRegistry.keys()).join(', ')}`,
        ErrorCategory.INVALID_INPUT,
        ErrorSeverity.MEDIUM
      );
    }

    try {
      const exporter = new ExporterClass(this.mysqlManager, this.memoryManager);

      // 缓存实例（限制缓存大小）
      if (this.exporterCache.size < 10) {
        this.exporterCache.set(type, exporter);
      }

      return exporter;
    } catch (error) {
      throw new MySQLMCPError(
        `创建导出器失败 (${type}): ${(error as Error).message}`,
        ErrorCategory.CONFIGURATION_ERROR,
        ErrorSeverity.HIGH,
        undefined,
        error as Error
      );
    }
  }
}