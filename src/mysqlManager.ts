/**
 * MySQL 高级管理器 - 企业级数据库操作核心
 *
 * 全功能企业级MySQL管理系统，集成了连接池管理、智能缓存、高级安全防护、
 * 性能监控、权限控制、内存优化和自适应重试等完整的数据库管理功能。
 * 为生产环境提供可靠、安全、高性能的数据库操作统一接口。
 *
 * @fileoverview 企业级MySQL管理器 - 生产环境数据库操作的完整解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import { ConnectionPool } from './connection.js';
import { ConfigurationManager } from './config.js';
import { CacheManager } from './cache.js';
import { SecurityValidator } from './security.js';
import { SecurityPatternType } from './utils/security.js';
import { AdaptiveRateLimiter } from './rateLimit.js';
import { MetricsManager, PerformanceMetrics } from './metrics.js';
import { StringConstants, DefaultConfig } from './constants.js';
import { SmartRetryStrategy } from './retryStrategy.js';
import { withErrorHandling, withPerformanceMonitoring } from './utils/decorators.js';
import {
  ErrorCategory,
  ErrorSeverity,
  MySQLMCPError,
  ValidationLevel,
  ErrorContext,
  CacheRegion } from './types.js';
import { rbacManager } from './rbac.js';
import { logger, securityLogger } from './logger.js';
import { sensitiveDataHandler } from './utils/security.js';
import { memoryMonitor } from './monitor.js';
import { ErrorHandler } from './errorHandler.js';
import { IdUtils, MemoryUtils, PerformanceUtils, TimeUtils } from './utils/common.js';
import { BatchValidator } from './utils/security.js';
import { memoryPressureManager } from './memoryPressureManager.js';


/**
 * MySQL 高级管理器主类
 *
 * 企业级MySQL数据库管理器的核心实现，集成了完整的数据库操作功能栈。
 * 采用模块化架构设计，提供统一的数据访问接口和全方位的安全保护。
 *
 * 核心模块集成：
 * - 连接池管理：高效连接复用和健康监控
 * - 缓存系统：三级智能缓存和自适应调整  
 * - 安全防护：多层验证和威胁检测
 * - 权限控制：RBAC模型和操作级授权
 * - 性能监控：实时指标收集和告警分析
 * - 内存优化：压力感知和资源管理
 * - 智能重试：上下文感知和错误分类恢复
 *
 * @class MySQLManager  
 * @since 1.0.0
 * @version 1.0.0
 */
export class MySQLManager {
  /** 用于跟踪和调试的唯一会话标识符 */
  private sessionId: string;

  /** 数据库、安全和缓存设置的配置管理器 */
  public configManager: ConfigurationManager;

  /** 高效数据库连接的连接池管理器 */
  public connectionPool: ConnectionPool;

  /** 统一缓存管理器，管理所有数据库相关的缓存 */
  public cacheManager: CacheManager;

  /** 传统性能指标收集器 */
  public metrics: PerformanceMetrics;

  /** 带时间序列数据和告警的指标管理器 */
  public enhancedMetrics: MetricsManager;

  /** 请求节流的自适应速率限制器 */
  private adaptiveRateLimiter: AdaptiveRateLimiter;

  /** 智能重试统计和管理 */
  private smartRetryManager: typeof SmartRetryStrategy;

  /** RBAC权限管理器 */
  public rbac: typeof rbacManager;

  /** 安全日志记录器 */
  public securityLogger: typeof securityLogger;

  /** 敏感数据处理器 */
  public sensitiveDataHandler: typeof sensitiveDataHandler;

  /**
   * 用于安全验证的预编译危险SQL模式
   * 这些模式检测可能危害系统安全或数据完整性的潜在有害SQL操作。
   */
  private static DANGEROUS_PATTERNS: RegExp[] = [
    /\b(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i,
    /\b(SYSTEM|EXEC|SHELL)\b/i,
    /\bINTO\s+OUTFILE\b/i,
    /\bLOAD\s+DATA\b/i,
  ];

  /**
   * 表名验证模式
   * 确保表名只包含安全字符（字母数字、下划线、连字符）
   */
  private static TABLE_NAME_PATTERN: RegExp = /^[a-zA-Z0-9_-]+$/;
  
  /**
   * MySQL 管理器构造函数
   *
   * 初始化MySQL管理系统的所有组件，包括配置、连接池、
   * 缓存、安全和监控功能。
   *
   * @constructor
   * @throws {Error} 当组件初始化失败时抛出
   */
  constructor() {
    // 生成用于跟踪的唯一会话标识符
    this.sessionId = IdUtils.generateUUID();

    // 初始化集中配置管理
    this.configManager = new ConfigurationManager();

    // 使用数据库配置初始化连接池
    this.connectionPool = new ConnectionPool(this.configManager.database);

    // 初始化统一缓存管理器（启用WeakMap防护，集成查询缓存功能）
    this.cacheManager = new CacheManager(
      this.configManager.cache,
      {
        enabled: this.configManager.cache.enableQueryCache,
        defaultTTL: this.configManager.cache.queryCacheTTL,
        maxSize: this.configManager.cache.queryCacheSize,
        maxResultSize: this.configManager.cache.maxQueryResultSize
      },
      true,
      Boolean(this.configManager.cache.enableTieredCache),
      Boolean(this.configManager.cache.enableTTLAdjustment)
    );
    
    // 执行初始化缓存预热
    void this.initializeCacheWarmup().catch((error: Error) => {
      logger.warn('缓存预热失败', 'MySQLManager', { error: error.message });
    });

    // 初始化性能监控系统
    this.metrics = new PerformanceMetrics();
    this.enhancedMetrics = new MetricsManager();
    this.enhancedMetrics.startMonitoring();

    // 初始化安全验证系统
    //this.securityValidator = new SecurityValidator();

    // 使用安全配置初始化自适应速率限制
    this.adaptiveRateLimiter = new AdaptiveRateLimiter(
      this.configManager.security.rateLimitMax,
      this.configManager.security.rateLimitWindow
    );

    // 初始化智能重试管理器
    this.smartRetryManager = SmartRetryStrategy;

    // 初始化RBAC权限管理器
    this.rbac = rbacManager;
    
    // 初始化默认的RBAC配置
    this.rbac.initializeDefaultConfiguration();

    // 初始化安全日志记录器
    this.securityLogger = securityLogger;

    // 初始化敏感数据处理器
    this.sensitiveDataHandler = sensitiveDataHandler;

    // 注册主要组件对象以进行内存泄漏跟踪
    memoryMonitor.registerObjectForCleanup('mysql_manager_session', this, 1024);
    memoryMonitor.registerObjectForCleanup('connection_pool', this.connectionPool, 2048);
    memoryMonitor.registerObjectForCleanup('cache_manager', this.cacheManager, 1024);
    memoryMonitor.registerObjectForCleanup('metrics_manager', this.enhancedMetrics, 512);
  }
  
  /**
   * 检查用户权限
   *
   * 验证用户是否具有执行指定操作的权限。
   *
   * @private
   * @param userId - 用户ID
   * @param operation - 要执行的操作类型
   * @param target - 操作目标（如表名）
   * @throws {Error} 当用户没有足够权限时抛出
   */
  private checkPermission(userId: string, operation: string, target?: string): void {
    // 如果没有提供用户ID，则跳过权限检查（向后兼容）
    if (!userId) {
      return;
    }

    // 构建权限标识符
    const permissionId = target ? `${operation}:${target}` : operation;

    // 检查用户是否具有权限
    if (!this.rbac.checkPermission(userId, permissionId)) {
      // 记录权限拒绝事件
      this.securityLogger.logPermissionDenied(
        userId,
        permissionId,
        target,
        undefined // sourceIp需要从请求上下文中获取
      );
      
      throw new MySQLMCPError(
        `用户 ${userId} 没有执行 ${permissionId} 操作的权限`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }
  }

  /**
   * 检查查询权限并分析查询类型和表名
   *
   * 统一的查询权限检查方法，包含查询类型检测和表名提取。
   * 用于避免在多个地方重复实现相同的权限检查逻辑。
   *
   * @private
   * @param query - 要检查的SQL查询
   * @param userId - 用户ID
   * @returns 包含查询类型和表名的对象
   */
  private analyzeAndCheckQueryPermission(query: string, userId?: string): { queryType: string; tableName?: string } {
    // 简单的查询类型检测（实际应用中可能需要更复杂的分析）
    const normalizedQuery = SecurityValidator.normalizeSQLQuery(query);
    const queryType = normalizedQuery.split(' ')[0].toUpperCase();

    // 提取表名（如果可能）
    let tableName: string | undefined;
    const fromMatch = normalizedQuery.match(/from\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      tableName = fromMatch[1];
    }

    // 如果提供了用户ID，检查权限
    if (userId) {
      this.checkPermission(userId, queryType, tableName);
    }

    return { queryType, tableName };
  }

  /**
   * 验证查询的安全合规性
   *
   * 统一的查询验证方法，用于验证单个或多个查询的安全性。
   *
   * @private
   * @param queries - 要验证的查询字符串或查询数组
   */
  private validateQueries(queries: string | string[]): void {
    const queryArray = Array.isArray(queries) ? queries : [queries];
    for (const query of queryArray) {
      this.validateQuery(query);
    }
  }

  /**
   * 初始化缓存预热
   * 
   * 在启动时预热以下内容:
   * 1. 常用表的schema信息
   * 2. 系统表的存在性检查
   * 3. 关键索引信息
   * 4. 常用查询结果的预取配置
   * 
   * @private
   * @returns {Promise<void>}
   */
  private async initializeCacheWarmup(): Promise<void> {
    try {
      // 常用系统表列表
      const commonTables = [
        'mysql.user',
        'mysql.db',
        'information_schema.tables',
        'information_schema.columns'
      ];

      // 预热表信息
      for (const fullTableName of commonTables) {
        const [schema, table] = fullTableName.split('.');
        if (!schema || !table) continue;

        await this.cacheManager.preloadTableInfo(
          table,
          // 加载表结构
          async () => {
            const schemaQuery = `
              SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            `;
            return await this.executeQuery(schemaQuery, [schema, table]);
          },
          // 检查表是否存在
          async () => {
            const existsQuery = `
              SELECT COUNT(*) as count 
              FROM INFORMATION_SCHEMA.TABLES 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            `;
            const result = await this.executeQuery(existsQuery, [schema, table]);
            return Array.isArray(result) && result[0] && result[0].count > 0;
          },
          // 加载索引信息
          async () => {
            const indexQuery = `
              SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
              FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            `;
            return await this.executeQuery(indexQuery, [schema, table]);
          }
        );
      }

      // 获取查询缓存实例
      const queryCache = this.cacheManager.getCacheInstance(CacheRegion.QUERY_RESULT);
      if (queryCache) {
        // 配置查询预取
        queryCache.configurePrefetch(true, 0.6, 20); // 启用预取，阈值0.6，最多预取20个

        // 预热一些常用的系统查询
        const commonQueries = new Map([
          ['show_tables', {
            query: 'SHOW TABLES',
            params: [],
            result: await this.executeQuery('SHOW TABLES')
          }],
          ['show_databases', {
            query: 'SHOW DATABASES',
            params: [],
            result: await this.executeQuery('SHOW DATABASES')
          }],
          ['server_variables', {
            query: 'SHOW VARIABLES',
            params: [],
            result: await this.executeQuery('SHOW VARIABLES')
          }]
        ]);

        // 批量预热查询缓存
        await queryCache.warmup(commonQueries);
      }

      logger.info('缓存预热完成', 'MySQLManager', {
        tablesWarmed: commonTables.length,
        queriesWarmed: queryCache ? 3 : 0
      });

    } catch (error) {
      logger.error('缓存预热过程中发生错误', 'MySQLManager', error as Error);
      throw error;
    }
  }

  /**
   * 使用智能重试策略执行数据库操作
   *
   * 使用SmartRetryStrategy实现基于错误严重级别和类别的智能重试。
   * 包含详细的统计信息收集和上下文感知重试。
   *
   * @private
   * @template T - 操作的返回类型
   * @param operation - 要使用重试逻辑执行的异步操作
   * @param operationName - 操作名称，用于日志和统计
   * @param context - 可选的错误上下文信息
   * @returns 解析为操作结果的Promise
   * @throws {Error} 当所有重试尝试都用尽或发生不可重试错误时抛出
   */
  private async executeWithSmartRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'database_operation',
    context?: { table?: string; query?: string }
  ): Promise<T> {
    const errorContext: ErrorContext = {
      operation: operationName,
      sessionId: this.sessionId,
      userId: context?.table || 'unknown',
      timestamp: new Date(),
      metadata: {
        table: context?.table,
        queryType: context?.query?.split(' ')[0]?.toUpperCase(),
      }
    };

    // 使用智能重试策略执行操作
    const result = await this.smartRetryManager.executeWithRetry(
      operation,
      {
        // 可以根据需要自定义重试策略
        maxAttempts: DefaultConfig.MAX_RETRY_ATTEMPTS,
        baseDelay: 1000, // 1秒基础延迟
        maxDelay: 30000, // 30秒最大延迟
        backoffMultiplier: 2,
        jitter: true
      },
      errorContext
    );

    // 如果重试成功，返回结果
    if (result.success) {
      // 记录重试统计信息（如果有重试）
      if (result.attempts > 1) {
        logger.info('操作重试成功', 'MySQLManager', {
          operation: operationName,
          attempts: result.attempts,
          totalDelay: result.totalDelay,
          sessionId: this.sessionId
        });
      }
      return result.finalResult as T;
    }

    // 重试失败，抛出最后的错误
    const finalError = result.lastError || new MySQLMCPError(
      '操作执行失败，所有重试尝试已用尽',
      ErrorCategory.RETRY_EXHAUSTED,
      ErrorSeverity.HIGH
    );

    logger.error('操作重试失败', 'MySQLManager', finalError, {
      operation: operationName,
      attempts: result.attempts,
      totalDelay: result.totalDelay,
      sessionId: this.sessionId
    });

    throw finalError;
  }

  /**
   * 验证输入数据
   *
   * 对输入数据执行综合安全验证，以防止SQL注入和其他安全漏洞。
   *
   * @private
   * @param inputValue - 要验证的值（字符串、数字、布尔值、null、undefined）
   * @param fieldName - 被验证字段的名称（用于错误消息）
   * @param validationLevel - 验证严格级别（"strict"、"moderate"、"basic"）
   * @throws {Error} 当输入未通过安全验证时抛出
   */
  public validateInput(inputValue: unknown, fieldName: string, validationLevel: ValidationLevel = ValidationLevel.STRICT): void {
    SecurityValidator.validateInputComprehensive(inputValue, fieldName, validationLevel);
  }
  
  /**
   * 验证SQL查询安全性
   *
   * 对SQL查询执行综合安全验证，包括长度限制、
   * 危险模式检测和查询类型限制。
   *
   * @private
   * @param query - 要验证的SQL查询字符串
   * @throws {Error} 当查询未通过安全验证时抛出
   */
  private validateQuery(query: string): void {
    // 检查查询长度是否超过配置的最大值
    if (query.length > this.configManager.security.maxQueryLength) {
      const error = new Error(StringConstants.MSG_QUERY_TOO_LONG);
      const safeError = ErrorHandler.safeError(error, 'validateQuery');
      throw new Error(safeError.message);
    }

    // 扫描可能危害安全的危险SQL模式
    for (const pattern of MySQLManager.DANGEROUS_PATTERNS) {
      if (pattern.test(query)) {
        // 记录SQL注入尝试
        this.securityLogger.logSqlInjectionAttempt(
          query,
          [pattern.source],
          undefined, // sourceIp需要从请求上下文中获取
          undefined  // userId需要从请求上下文中获取
        );
        const error = new Error(StringConstants.MSG_PROHIBITED_OPERATIONS);
        const safeError = ErrorHandler.safeError(error, 'validateQuery');
        throw new Error(safeError.message);
      }
    }

    // 使用SecurityValidator分析更复杂的威胁
    const threatAnalysis = SecurityValidator.analyzeSecurityThreats(query);
    if (threatAnalysis && threatAnalysis.threats.length > 0) {
      // 记录检测到的安全威胁
      const injectionThreats = threatAnalysis.threats
        .filter(t => t.type === SecurityPatternType.SQL_INJECTION)
        .map(t => t.patternId);
      
      if (injectionThreats.length > 0) {
        this.securityLogger.logSqlInjectionAttempt(
          query,
          injectionThreats,
          undefined, // sourceIp需要从请求上下文中获取
          undefined  // userId需要从请求上下文中获取
        );
      }
      
      const error = new Error(StringConstants.MSG_PROHIBITED_OPERATIONS);
      const safeError = ErrorHandler.safeError(error, 'validateQuery');
      throw new Error(safeError.message);
    }

    // 提取并验证查询类型（第一个单词）
    const trimmedQuery = query.trim();
    // 使用更可靠的方式提取查询类型
    const queryTypeMatch = trimmedQuery.match(/^(\w+)/);
    const queryType = queryTypeMatch ? queryTypeMatch[1].toUpperCase() : '';

    // 确保查询类型在允许列表中
    if (!queryType || !this.configManager.security.allowedQueryTypes.includes(queryType)) {
      const error = new Error(StringConstants.MSG_QUERY_TYPE_NOT_ALLOWED.replace('{query_type}', queryType));
      const safeError = ErrorHandler.safeError(error, 'validateQuery');
      throw new Error(safeError.message);
    }
  }

  /**
   * 验证表名
   *
   * 根据安全模式和长度限制验证表名，
   * 以防止SQL注入并确保兼容性。
   *
   * @private
   * @param tableName - 要验证的表名
   * @throws {Error} 当表名无效或过长时抛出
   */
  public validateTableName(tableName: string): void {
    // 检查是否符合允许的字符模式
    if (!MySQLManager.TABLE_NAME_PATTERN.test(tableName)) {
      const error = new Error(StringConstants.MSG_INVALID_TABLE_NAME);
      const safeError = ErrorHandler.safeError(error, 'validateTableName');
      throw new Error(safeError.message);
    }

    // 检查长度限制
    if (tableName.length > DefaultConfig.MAX_TABLE_NAME_LENGTH) {
      const error = new Error(StringConstants.MSG_TABLE_NAME_TOO_LONG);
      const safeError = ErrorHandler.safeError(error, 'validateTableName');
      throw new Error(safeError.message);
    }
  }

  /**
   * 检查速率限制
   *
   * 使用自适应速率限制器验证当前请求是否在速率限制范围内。
   *
   * @private
   * @param identifier - 速率限制的唯一标识符（默认为"default"）
   * @throws {Error} 当超出速率限制时抛出
   */
  private checkRateLimit(identifier: string = "default"): void {
    if (!this.adaptiveRateLimiter.checkRateLimit(identifier)) {
      // 记录速率限制超出事件
      this.securityLogger.logRateLimitExceeded(
        identifier,
        0, // 实际请求计数需要从速率限制器中获取
        this.configManager.security.rateLimitMax,
        undefined // sourceIp需要从请求上下文中获取
      );
      
      const error = new Error(StringConstants.MSG_RATE_LIMIT_EXCEEDED);
      const safeError = ErrorHandler.safeError(error, 'checkRateLimit');
      throw new Error(safeError.message);
    }
  }
  
  /**
   * 使用缓存获取表模式
   *
   * 使用智能缓存检索表模式信息以提高性能。
   * 缓存未命中触发数据库查询，而命中立即返回缓存数据。
   *
   * @private
   * @param tableName - 要获取模式的表名
   * @returns 解析为表模式信息的Promise
   * @throws {Error} 当模式查询失败时抛出
   */
  @withErrorHandling('getTableSchema', 'MSG_QUERY_FAILED')
  @withPerformanceMonitoring('get_table_schema')
  public async getTableSchemaCached(tableName: string): Promise<unknown> {
    if (!(await this.tableExistsCached(tableName))) {
      return null;
    }
    
    const cacheKey = `schema_${tableName}`;
    let result: unknown = await this.cacheManager.get(CacheRegion.SCHEMA, cacheKey);

    if (result === null) {
      // 缓存未命中：执行模式查询
      const schemaQuery = `
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY,
          EXTRA,
          COLUMN_COMMENT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `;

      result = await this.executeQuery(schemaQuery, [tableName]);
      this.cacheManager.set(CacheRegion.SCHEMA, cacheKey, result);
      this.metrics.cacheMisses++;
    } else {
      // 缓存命中：返回缓存数据
      this.metrics.cacheHits++;
    }

    return result ?? false;
  }

  /**
   * 使用缓存检查表存在性
   *
   * 使用缓存验证表是否存在于当前数据库中，
   * 以避免重复的INFORMATION_SCHEMA查询。
   *
   * @private
   * @param tableName - 要检查的表名
   * @returns 如果表存在则解析为true，否则为false的Promise
   * @throws {Error} 当存在性检查查询失败时抛出
   */
  private async tableExistsCached(tableName: string): Promise<boolean> {
    const cacheKey = `exists_${tableName}`;
    let result: boolean | null = await this.cacheManager.get<boolean>(CacheRegion.TABLE_EXISTS, cacheKey);

    if (result === null) {
      // 缓存未命中：执行存在性检查查询
      const existsQuery = `
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      `;

      const queryResult = await this.executeQuery(existsQuery, [tableName]) as Array<{count: number}> | undefined;
      const exists = !!(queryResult && queryResult[0] && queryResult[0].count > 0);
      result = exists;
      this.cacheManager.set(CacheRegion.TABLE_EXISTS, cacheKey, result);
      this.metrics.cacheMisses++;
    } else {
      // 缓存命中：返回缓存结果
      this.metrics.cacheHits++;
    }

    return result ?? false;
  }
  
  /**
   * 执行SQL查询
   *
   * 执行SQL查询的主要公共方法，具有综合安全性、性能监控、
   * 缓存和错误处理功能。包括速率限制、重试机制和指标收集。
   *
   * @public
   * @param query - 要执行的SQL查询字符串
   * @param params - 预处理语句的可选参数
   * @param userId - 可选的用户ID，用于权限检查
   * @returns 解析为查询结果的Promise
   * @throws {Error} 当超出速率限制、安全验证失败或查询执行失败时抛出
   *
   * @example
   * // 简单查询
   * const results = await manager.executeQuery("SELECT * FROM users LIMIT 10");
   *
   * @example
   * // 参数化查询
   * const user = await manager.executeQuery("SELECT * FROM users WHERE id = ?", [123]);
   */
  public async executeQuery(query: string, params?: unknown[], userId?: string): Promise<unknown> {
    const timer = PerformanceUtils.createTimer();
    
    // 记录查询开始日志
    logger.debug('开始执行查询', 'MySQLManager', {
      query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      userId,
      hasParams: !!params
    });

    try {
      // 应用速率限制以防止滥用
      this.checkRateLimit();

      // 验证查询的安全合规性
      this.validateQueries(query);

      // 如果提供了用户ID，检查权限
      if (userId) {
        this.analyzeAndCheckQueryPermission(query, userId);
      }

      // 尝试从查询缓存获取结果
      const cachedResult = await this.cacheManager.getCachedQuery(query, params);
      if (cachedResult !== null) {
        // 缓存命中，记录成功执行的指标
        const queryTime = timer.getElapsed();
        this.updateMetrics(queryTime, false, false);

        // 记录缓存命中日志
        logger.info('查询缓存命中', 'MySQLManager', {
          queryTime,
          userId,
          cacheHit: true
        });

        return cachedResult;
      }

      // 在瞬态故障时自动重试执行（使用智能重试策略）
      const result = await this.executeWithSmartRetry(
        async () => {
          return await this.executeQueryInternal(query, params);
        },
        'execute_query',
        {
          query: query.split(' ')[0]?.toUpperCase(),
          table: this.extractTableName(query)
        }
      );

      // 异步缓存查询结果（不阻塞响应）
      this.cacheManager.setCachedQuery(query, params, result).catch(cacheError => {
        logger.warn('查询结果缓存失败', 'MySQLManager', {
          error: (cacheError as Error).message,
          query: query.substring(0, 100)
        });
      });

      // 记录成功执行的指标
      const queryTime = timer.getElapsed();
      const isSlow = queryTime > DefaultConfig.SLOW_QUERY_THRESHOLD;
      this.updateMetrics(queryTime, false, isSlow);
      
      // 记录查询成功日志
      logger.info('查询执行成功', 'MySQLManager', {
        queryTime,
        isSlow,
        userId
      });

      return result;
    } catch (error) {
      // 记录错误指标
      const queryTime = timer.getElapsed();
      this.updateMetrics(queryTime, true, false);
      
      // 记录查询错误日志
      logger.error('查询执行失败', 'MySQLManager', error as Error, {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        userId,
        queryTime
      });
      
      throw error;
    }
  }

  /**
   * 内部查询执行
   *
   * 处理实际数据库连接和查询执行的低级方法。
   * 管理连接生命周期并确保适当的资源清理。
   *
   * @private
   * @param query - SQL查询字符串
   * @param params - 可选查询参数
   * @returns 解析为原始查询结果的Promise
   * @throws {Error} 当连接或查询执行失败时抛出
   */
  @withErrorHandling('executeQueryInternal', 'MSG_QUERY_FAILED')
  @withPerformanceMonitoring('query_internal')
  private async executeQueryInternal(query: string, params?: unknown[]): Promise<unknown> {
    const connection = await this.connectionPool.getConnection();

    try {
      const [rows] = await connection.execute(query, params);
      return this.processQueryResults(rows);
    } finally {
      // 始终将连接释放回连接池
      connection.release();
    }
  }
  
  /**
   * 内存友好的结果流式处理
   *
   * 对查询结果进行流式处理以优化内存使用，
   * 限制返回结果的数量以防止内存溢出。
   *
   * @private
   * @param rows - 原始查询结果
   * @returns 处理后的结果数组
   */
  private streamResults(rows: unknown): unknown {
    // 如果结果是数组且超过最大结果行数限制，则截断
    if (Array.isArray(rows) && rows.length > this.configManager.security.maxResultRows) {
      return rows.slice(0, this.configManager.security.maxResultRows);
    }
    return rows;
  }
  
  /**
   * 处理查询结果
   * 
   * 统一处理查询结果，包括流式处理和敏感数据处理
   * 
   * @private
   * @param rows - 原始查询结果
   * @returns 处理后的结果
   */
  private processQueryResults(rows: unknown): unknown {
    // 使用流式处理优化内存使用
    const processedRows = this.streamResults(rows);
    
    // 处理敏感数据
    const processedText = JSON.stringify(processedRows);
    const result = this.sensitiveDataHandler.processSensitiveData(processedText);
    return JSON.parse(result.processedText);
  }
  
  /**
   * 更新性能指标
   *
   * 更新查询执行的性能指标，包括时间、错误和慢查询统计。
   *
   * @private
   * @param queryTime - 查询执行时间（秒）
   * @param isError - 是否发生错误
   * @param isSlow - 是否为慢查询
   */
  private updateMetrics(queryTime: number, isError: boolean = false, isSlow: boolean = false): void {
    this.metrics.queryCount++;
    this.metrics.totalQueryTime += queryTime;
    
    if (isError) {
      this.metrics.errorCount++;
      this.enhancedMetrics.recordError("query_error", ErrorSeverity.MEDIUM);
    }
    
    if (isSlow) {
      this.metrics.slowQueryCount++;
    }
    
    // 记录到增强指标管理器
    this.enhancedMetrics.recordQueryTime(queryTime);

    // 更新缓存命中率指标
    const cacheHitRate = this.metrics.getCacheHitRate();
    this.enhancedMetrics.recordCacheHitRate(cacheHitRate);
  }
  
  /**
   * 使缓存失效
   *
   * 使用统一的缓存失效接口，整合了所有失效逻辑。
   * 根据操作类型进行精确的缓存清理，提高性能。
   *
   * @public
   * @param operationType - 操作类型（DDL、DML、CREATE、ALTER等）
   * @param tableName - 可选的表名，用于特定表缓存失效
   */
  public async invalidateCaches(operationType: string = "DDL", tableName?: string): Promise<void> {
    // 使用统一的缓存失效接口
    await this.cacheManager.invalidateCache(operationType, tableName);
  }

  /**
   * 获取性能指标
   *
   * 检索综合性能指标，包括查询统计、缓存性能和
   * 连接池状态，用于监控和调试。现在包含查询缓存统计。
   *
   * @public
   * @returns 包含详细性能指标的对象
   *
   * @example
   * const metrics = manager.getPerformanceMetrics();
   * console.log(`缓存命中率: ${metrics.cache_stats.schema_cache.hit_rate}`);
   * console.log(`查询缓存命中率: ${metrics.query_cache_stats.hitRate}`);
   */
  public getPerformanceMetrics(): Record<string, unknown> {
    return {
      [StringConstants.SECTION_PERFORMANCE]: this.metrics.toObject(),
      [StringConstants.SECTION_CACHE_STATS]: this.cacheManager.getAllStats(),
      [StringConstants.SECTION_CONNECTION_POOL]: this.connectionPool.getStats(),
      'smart_retry_stats': this.smartRetryManager.getRetryStats(),
      'query_cache_stats': this.cacheManager.getQueryCacheStats()
    };
  }

  /**
   * 从SQL查询中提取表名（简单实现）
   * 
   * @private
   * @param query - SQL查询语句
   * @returns 提取的表名或undefined
   */
  private extractTableName(query: string): string | undefined {
    try {
      const upperQuery = query.toUpperCase().trim();
      const patterns = [
        /FROM\s+([`"]?)(\w+)\1/i,
        /UPDATE\s+([`"]?)(\w+)\1/i,
        /INSERT\s+INTO\s+([`"]?)(\w+)\1/i,
        /DELETE\s+FROM\s+([`"]?)(\w+)\1/i,
        /REPLACE\s+INTO\s+([`"]?)(\w+)\1/i
      ];
      
      for (const pattern of patterns) {
        const match = upperQuery.match(pattern);
        if (match && match[2]) {
          return match[2].toLowerCase();
        }
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 批量执行查询
   *
   * 高效执行多个SQL查询，在同一事务中进行。
   * 适用于需要原子性的多个操作。
   *
   * @public
   * @param queries - 要执行的查询数组，每个包含SQL和参数
   * @param userId - 可选的用户ID，用于权限检查
   * @returns 解析为所有查询结果数组的Promise
   */
  @withErrorHandling('executeBatchQueries', 'MSG_BATCH_QUERY_FAILED')
  @withPerformanceMonitoring('batch_queries')
  public async executeBatchQueries(queries: Array<{sql: string, params?: unknown[]}>, userId?: string): Promise<unknown[]> {
    const connection = await this.connectionPool.getConnection();
    
    try {
      await connection.beginTransaction();
      const results: unknown[] = [];
      
      // 验证所有查询的安全合规性
      this.validateQueries(queries.map(q => q.sql));

      // 如果提供了用户ID，检查每个查询的权限
      if (userId) {
        for (const query of queries) {
          this.analyzeAndCheckQueryPermission(query.sql, userId);
        }
      }
      
      // 执行所有查询
      for (const query of queries) {
        const [rows] = await connection.execute(query.sql, query.params);
        // 使用统一的结果处理函数
        const processedRows = this.processQueryResults(rows);
        results.push(processedRows);
      }

      await connection.commit();

      // 分析查询类型并失效相关缓存
      const modifyingOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];
      const affectedTables = new Set<string>();
      let hasModifyingOperations = false;

      for (const query of queries) {
        const normalizedQuery = query.sql.trim().toUpperCase();
        const queryType = normalizedQuery.split(' ')[0];

        if (modifyingOperations.includes(queryType)) {
          hasModifyingOperations = true;

          // 尝试提取表名
          const tableName = this.extractTableName(query.sql);
          if (tableName) {
            affectedTables.add(tableName);
          }
        }
      }

      // 如果有修改操作，失效相关缓存
      if (hasModifyingOperations) {
        if (affectedTables.size > 0) {
          // 按表失效缓存
          for (const tableName of affectedTables) {
            await this.invalidateCaches('DML', tableName);
          }
        } else {
          // 如果无法确定具体表，失效所有相关缓存
          await this.invalidateCaches('DML');
        }
      }

      return results;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 高效批量插入数据
   *
   * 使用优化的批量插入方法高效地向表中插入多行数据。
   * 使用单个事务确保数据完整性，并支持批量处理以提高性能。
   *
   * @public
   * @param tableName - 目标表名
   * @param columns - 列名数组
   * @param dataRows - 数据行数组，每行是一个值数组
   * @param batchSize - 可选的批处理大小，默认使用配置值
   * @param userId - 可选的用户ID，用于权限检查
   * @returns 包含插入结果信息的对象
   */
  @withErrorHandling('executeBatchInsert', 'MSG_BATCH_INSERT_FAILED')
  @withPerformanceMonitoring('batch_insert')
  public async executeBatchInsert(
    tableName: string,
    columns: string[],
    dataRows: unknown[][],
    batchSize?: number,
    userId?: string
  ): Promise<{
    affectedRows: number;
    batchesProcessed: number;
    batchSize: number;
    totalRowsProcessed: number;
  }> {
    if (!dataRows || !columns || dataRows.length === 0 || columns.length === 0) {
      return {
        affectedRows: 0,
        batchesProcessed: 0,
        batchSize: batchSize || DefaultConfig.BATCH_SIZE,
        totalRowsProcessed: 0
      };
    }

    // 验证表名和列名
    this.validateTableName(tableName);
    BatchValidator.validateColumns(columns);

    // 使用优化的批量验证
    BatchValidator.validateDataRows(dataRows, columns, ValidationLevel.BASIC);

    // 如果提供了用户ID，检查权限
    if (userId) {
      this.checkPermission(userId, "INSERT", tableName);
    }

    // 使用动态计算的批处理大小
    const effectiveBatchSize = batchSize || this.calculateOptimalBatchSize(dataRows.length);

    const timer = PerformanceUtils.createTimer();
    let totalAffected = 0;
    let batchesProcessed = 0;

    try {
      // 检查请求频率限制
      this.checkRateLimit();

      // 构建 INSERT 语句
      const placeholders = columns.map(() => '?').join(', ');
      const query = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
      
      // 对于大数据集，使用并行处理
      if (dataRows.length > effectiveBatchSize * 2) {
        // 并行处理大数据集
        const results = await this.executeParallelBatchInsert(
         query,
         dataRows,
         effectiveBatchSize,
         userId
        );
        
        totalAffected = results.reduce((sum, result) => sum + result.affectedRows, 0);
        batchesProcessed = results.reduce((sum, result) => sum + result.batchesProcessed, 0);
      } else {
        // 对于中等大小的数据集，使用优化的批处理
        const connection = await this.connectionPool.getConnection();
      
        try {
          await connection.beginTransaction();
          
          // 使用更大的批处理大小以提高性能
          const optimizedBatchSize = Math.min(effectiveBatchSize * 2, 5000);
          
          // 分批处理数据
          for (let i = 0; i < dataRows.length; i += optimizedBatchSize) {
            const batch = dataRows.slice(i, i + optimizedBatchSize);
            
            // 使用 mysql2 的批量插入优化
            const [result] = await connection.execute(query, batch.flat());
            
            // mysql2 的 execute 返回结果可能包含 affectedRows
            if (result && typeof result === 'object' && 'affectedRows' in result) {
              totalAffected += (result as { affectedRows: number }).affectedRows;
            } else {
              // 如果没有 affectedRows，使用批处理大小作为估计
              totalAffected += batch.length;
            }
            
            batchesProcessed++;
          }
          
          await connection.commit();
          
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      }

      // 记录性能指标
      const queryTime = timer.getElapsed();
      const isSlow = queryTime > DefaultConfig.SLOW_QUERY_THRESHOLD;
      this.updateMetrics(queryTime, false, isSlow);

      // 成功插入后，失效相关缓存
      await this.invalidateCaches('INSERT', tableName);

      return {
        affectedRows: totalAffected,
        batchesProcessed,
        batchSize: effectiveBatchSize,
        totalRowsProcessed: dataRows.length
      };

    } catch (error) {
      // 记录错误指标
      const queryTime = timer.getElapsed();
      this.updateMetrics(queryTime, true, false);
      throw error;
    }
  }

  /**
   * 获取系统负载
   *
   * 获取当前系统负载以用于调整重试策略。
   *
   * @private
   * @returns 系统负载值 (0-1)
   */
  private getSystemLoad(): number {
    // 获取当前内存使用情况
    const memoryUsage = MemoryUtils.getCurrentUsage();
    const memoryLoad = MemoryUtils.calculateMemoryUsagePercent(memoryUsage.heapUsed, memoryUsage.heapTotal) / 100;
    
    // 简化实现：只使用内存负载作为系统负载指标
    return Math.min(1, memoryLoad);
  }

  /**
   * 关闭MySQL管理器
   *
   * 执行所有组件的优雅关闭，包括指标监控、连接池关闭和缓存清理。
   * 应在应用程序关闭期间调用以防止资源泄漏。
   *
   * @public
   * @returns 当所有清理完成时解析的Promise
   *
   * @example
   * // 优雅关闭
   * await manager.close();
   */
  /**
   * 根据内存压力调整缓存大小
   *
   * 基于当前内存压力级别动态调整所有缓存的大小，
   * 以优化内存使用并防止内存溢出。
   *
   * @public
   */
  public adjustCachesForMemoryPressure(): void {
    try {
      // 使用中央化的内存压力管理器
      const pressureLevel = memoryPressureManager.getCurrentPressure();
      
      // 调整所有缓存的大小
      this.cacheManager.adjustForMemoryPressure(pressureLevel);
    } catch (error) {
      // 内存压力调整失败不会影响核心功能
      logger.warn('Failed to adjust caches for memory pressure', 'MySQLManager', { error: (error as Error).message });
    }
  }

  /**
   * 计算最优批处理大小
   *
   * 根据当前系统资源和内存压力动态计算最优批处理大小，
   * 以平衡性能和内存使用。
   *
   * @private
   * @param {number} dataSize - 数据大小（行数）
   * @returns {number} 最优批处理大小
   */
  private calculateOptimalBatchSize(dataSize: number): number {
    try {
      // 使用中央化的内存压力管理器
      const pressureLevel = memoryPressureManager.getCurrentPressure();
      
      // 基于内存压力调整批处理大小
      // 压力越高，批处理大小越小以减少内存使用
      const scaleFactor = Math.max(0.1, 1 - pressureLevel);
      const baseBatchSize = DefaultConfig.BATCH_SIZE;
      let optimalBatchSize = Math.max(10, Math.floor(baseBatchSize * scaleFactor));
      
      // 对于大数据集，可以适当增加批处理大小以提高性能
      if (dataSize > 10000) {
        optimalBatchSize = Math.min(optimalBatchSize * 2, baseBatchSize * 2);
      }
      
      // 确保批处理大小在合理范围内
      return Math.max(10, Math.min(optimalBatchSize, 5000));
    } catch (error) {
      // 如果计算失败，使用默认批处理大小
      logger.warn('Failed to calculate optimal batch size:', 'MySQLManager', {error: (error as Error).message});
      return DefaultConfig.BATCH_SIZE;
    }
  }

  /**
   * 并行执行批处理插入
   *
   * 将大数据集分割成多个批次并并行处理，以提高插入性能。
   *
   * @private
   * @param {string} query - INSERT 查询语句
   * @param {unknown[][]} dataRows - 数据行数组
   * @param {number} batchSize - 批处理大小
   * @param {string} _userId - 用户ID（用于权限检查）
   * @returns {Promise<Array<{affectedRows: number, batchesProcessed: number}>>} 批处理结果数组
   */
  private async executeParallelBatchInsert(
    query: string,
    dataRows: unknown[][],
    batchSize: number,
    _userId?: string
  ): Promise<Array<{affectedRows: number, batchesProcessed: number}>> {
    try {
      // 将数据分割成多个批次
      const batches: unknown[][][] = [];
      for (let i = 0; i < dataRows.length; i += batchSize) {
        batches.push(dataRows.slice(i, i + batchSize));
      }
      
      // 限制并行度以防止资源耗尽
      const maxParallelism = Math.min(4, Math.max(1, Math.floor(batches.length / 2)));
      const results: Array<{affectedRows: number, batchesProcessed: number}> = [];
      
      // 分组并行处理批次
      for (let i = 0; i < batches.length; i += maxParallelism) {
        const batchGroup = batches.slice(i, i + maxParallelism);
        const groupPromises = batchGroup.map(async (batch) => {
          const connection = await this.connectionPool.getConnection();
          try {
            await connection.beginTransaction();
            
            // 执行批处理插入
            const [result] = await connection.execute(query, batch.flat());
            
            await connection.commit();
            
            // 返回结果
            const affectedRows = result && typeof result === 'object' && 'affectedRows' in result
              ? (result as { affectedRows: number }).affectedRows
              : batch.length;
              
            return {
              affectedRows,
              batchesProcessed: 1
            };
          } catch (error) {
            await connection.rollback();
            throw error;
          } finally {
            connection.release();
          }
        });
        
        // 等待当前组完成
        const groupResults = await Promise.all(groupPromises);
        results.push(...groupResults);
      }
      
      return results;
    } catch (error) {
      logger.error('Parallel batch insert failed:', 'MySQLManager', error as Error);
      throw error;
    }
  }

  /**
   * 获取智能缓存实例用于特定用途
   *
   * 为特定的缓存区域创建或获取SmartCache实例，
   * 支持WeakMap内存泄漏防护和自动清理功能。
   *
   * @public
   * @param region - 缓存区域
   * @returns SmartCache实例
   *
   * @example
   * const schemaCache = manager.getSmartCache(CacheRegion.SCHEMA);
   * await schemaCache.put('users', schemaData, schemaObject);
   */
  public getSmartCache(region: CacheRegion): import('./cache.js').SmartCache<unknown> | null {
    return this.cacheManager.getCacheInstance(region);
  }

  /**
   * 注册对象进行内存泄漏跟踪
   *
   * 将对象注册到内存监控系统中，用于自动检测和清理无引用对象。
   *
   * @public
   * @param id - 对象标识符
   * @param object - 要跟踪的对象
   * @param estimatedSize - 估算的对象大小（字节）
   *
   * @example
   * manager.registerForMemoryTracking('query_result_123', queryResult, 2048);
   */
  public registerForMemoryTracking(id: string, object: object, estimatedSize: number = 64): void {
    memoryMonitor.registerObjectForCleanup(id, object, estimatedSize);
  }

  /**
   * 触摸对象以更新访问时间
   *
   * 更新已注册对象的最后访问时间，防止其被自动清理。
   *
   * @public
   * @param id - 对象标识符
   *
   * @example
   * manager.touchObject('query_result_123');
   */
  public touchObject(id: string): void {
    memoryMonitor.touchObject(id);
  }

  /**
   * 取消对象的内存跟踪
   *
   * 从内存监控系统中移除对象的跟踪记录。
   *
   * @public
   * @param id - 对象标识符
   * @returns 是否成功取消跟踪
   *
   * @example
   * const removed = manager.unregisterFromMemoryTracking('query_result_123');
   */
  public unregisterFromMemoryTracking(id: string): boolean {
    return memoryMonitor.unregisterObject(id);
  }

  // 记录上次内存清理时间，用于控制清理频率
  private lastMemoryCleanupTime: number = 0;
  // 内存清理最小间隔（毫秒），默认1分钟
  private memoryCleanupMinInterval: number = 60 * 1000;

  /**
   * 执行手动内存清理
   *
   * 立即触发内存清理和缓存优化，
   * 用于在高内存压力情况下的主动内存管理。
   * 现在包含查询缓存清理。
   *
   * 优化策略：
   * - 基于时间间隔控制清理频率，避免过度清理
   * - 异步执行不同类型的清理任务
   * - 根据内存压力动态调整清理策略
   *
   * @public
   * @returns 清理统计信息
   *
   * @example
   * const stats = await manager.performMemoryCleanup();
   * console.log(`释放了 ${stats.memoryReclaimed} 字节内存`);
   * console.log(`查询缓存清理了 ${stats.queryCacheCleanedEntries} 个条目`);
   */
  public async performMemoryCleanup(): Promise<{
    cleanedCount: number;
    memoryReclaimed: number;
    duration: number;
    queryCacheCleanedEntries: number;
    weakMapStats: {
      totalCleaned: number;
      totalMemoryReclaimed: number;
      regionStats: Record<string, { cleanedCount: number; memoryReclaimed: number }>;
    };
  }> {
    const now = Date.now();

    // 控制清理频率，避免过于频繁的清理操作
    if (now - this.lastMemoryCleanupTime < this.memoryCleanupMinInterval) {
      // 如果不是在高内存压力下，跳过清理
      const currentSnapshot = memoryMonitor.getCurrentSnapshot();
      if (currentSnapshot.pressureLevel <= 0.8) {
        return {
          cleanedCount: 0,
          memoryReclaimed: 0,
          duration: 0,
          queryCacheCleanedEntries: 0,
          weakMapStats: {
            totalCleaned: 0,
            totalMemoryReclaimed: 0,
            regionStats: {}
          }
        };
      }
    }

    const startTime = TimeUtils.now();

    // 并行执行不同的清理任务以提高性能
    const [cleanupResult, weakMapStats, queryCacheCleanedEntries] = await Promise.all([
      // 执行基本内存清理
      Promise.resolve().then(() => memoryMonitor.performAutomaticCleanup()),

      // 执行WeakMap清理
      Promise.resolve().then(() => this.cacheManager.performWeakMapCleanup()),

      // 清理过期的查询缓存条目
      this.cacheManager.cleanupExpiredQueryEntries()
    ]);

    // 根据内存压力调整缓存策略
    const currentSnapshot = memoryMonitor.getCurrentSnapshot();
    if (currentSnapshot.pressureLevel > 0.7) {
      this.cacheManager.adjustForMemoryPressure(currentSnapshot.pressureLevel);
    }

    const duration = TimeUtils.getDurationInMs(startTime);

    // 更新最后清理时间
    this.lastMemoryCleanupTime = now;

    return {
      ...cleanupResult,
      queryCacheCleanedEntries,
      weakMapStats,
      duration
    };
  }

  /**
   * 获取内存使用和清理统计
   *
   * 提供详细的内存使用情况和自动清理统计信息，
   * 用于监控和调试内存管理性能。
   *
   * @public
   * @returns 包含内存统计和WeakMap缓存统计的对象
   *
   * @example
   * const memStats = manager.getMemoryStats();
   * console.log(`跟踪了 ${memStats.trackedObjects} 个对象`);
   * console.log(`WeakMap缓存命中率: ${memStats.weakMapStats.cacheStats}`);
   */
  public getMemoryStats(): ReturnType<typeof memoryMonitor.getAutoCleanupStats> {
    return memoryMonitor.getAutoCleanupStats();
  }

  /**
   * 启用或禁用激进内存清理模式
   *
   * 在内存压力较高时可以启用激进模式，
   * 会更频繁地执行清理和更严格的缓存策略。
   *
   * @public
   * @param enabled - 是否启用激进模式
   *
   * @example
   * manager.setAggressiveMemoryCleanup(true); // 启用激进清理
   */
  public setAggressiveMemoryCleanup(enabled: boolean): void {
    // 调整WeakMap缓存管理器设置
    const _config = enabled ? {
      cleanupInterval: 5000,      // 5秒清理间隔
      refTimeout: 60000,          // 1分钟引用超时
      aggressiveCleanup: true
    } : {
      cleanupInterval: 30000,     // 30秒清理间隔
      refTimeout: 300000,         // 5分钟引用超时
      aggressiveCleanup: false
    };

    // 注意：实际实现中需要WeakMapCacheManager支持动态配置更新
    if (enabled) {
      // 立即执行清理
      this.performMemoryCleanup();
    }
  }

  public async close(): Promise<void> {
    try {
      // 停止增强指标监控
      this.enhancedMetrics.stopMonitoring();

      // 执行WeakMap清理
      this.cacheManager.performWeakMapCleanup();

      // 取消注册跟踪的对象
      memoryMonitor.unregisterObject('mysql_manager_session');
      memoryMonitor.unregisterObject('connection_pool');
      memoryMonitor.unregisterObject('cache_manager');
      memoryMonitor.unregisterObject('metrics_manager');

      // 关闭连接池并释放所有连接
      await this.connectionPool.close();

      // 清除所有缓存以释放内存
      this.cacheManager.clearAll();
    } catch (error) {
      logger.error(`${StringConstants.MSG_ERROR_DURING_CLEANUP}`, 'MySQLManager', error as Error);
    }
  }
}