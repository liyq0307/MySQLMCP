/**
 * MySQL性能管理器 - 企业级数据库性能优化方案
 *
 * 统一管理和优化MySQL数据库性能的综合性工具，集成了慢查询分析、索引优化、
 * 查询性能剖析、系统监控和报告生成等全方位性能管理功能。
 *
 * @fileoverview MySQL性能管理的统一解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-10
 * @license MIT
 *
 */
import { MySQLManager } from './mysqlManager.js';
import { withErrorHandling, withPerformanceMonitoring } from './utils/decorators.js';
import {
  ErrorCategory,
  ErrorSeverity,
  MySQLMCPError
} from './types.js';
import { logger } from './logger.js';

/**
 * 索引建议信息
 */
export interface IndexSuggestion {
  /** 建议的表名 */
  table: string;
  /** 建议的索引列 */
  columns: string[];
  /** 索引类型 */
  indexType: 'PRIMARY' | 'UNIQUE' | 'INDEX' | 'FULLTEXT' | 'SPATIAL';
  /** 预期性能提升百分比 */
  expectedImprovement: string;
  /** 优先级 */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 建议理由 */
  reason: string;
}

/**
 * 查询剖析结果
 */
export interface QueryProfileResult {
  /** 查询执行计划 */
  explainResult: Record<string, unknown>[];
  /** 执行统计信息 */
  executionStats: {
    executionTime: number;
    rowsExamined: number;
    rowsReturned: number;
  };
  /** 优化建议 */
  recommendations: string[];
  /** 性能评分（0-100） */
  performanceScore: number;
}

/**
 * 慢查询信息
 */
export interface SlowQueryInfo {
  /** SQL文本 */
  sqlText: string;
  /** 执行时间（秒） */
  executionTime: number;
  /** 锁等待时间（秒） */
  lockTime: number;
  /** 扫描行数 */
  rowsExamined: number;
  /** 返回行数 */
  rowsReturned: number;
  /** 执行开始时间 */
  startTime: Date;
  /** 用户信息 */
  user: string;
  /** 数据库名 */
  database: string;
  /** IP地址 */
  ipAddress: string;
  /** 线程ID */
  threadId: number;
  /** 执行计划是否使用索引 */
  usesIndex: boolean;
}

/**
 * 慢查询分析结果
 */
export interface SlowQueryAnalysis {
  /** 总慢查询数量 */
  totalSlowQueries: number;
  /** 最慢查询信息 */
  slowestQuery?: SlowQueryInfo;
  /** 平均执行时间 */
  averageExecutionTime: number;
  /** 最常见的查询模式 */
  commonPatterns: Array<{
    pattern: string;
    count: number;
    avgTime: number;
  }>;
  /** 索引优化建议 */
  indexSuggestions: IndexSuggestion[];
  /** 性能问题总结 */
  performanceIssues: string[];
  /** 优化建议 */
  recommendations: string[];
}

/**
 * 性能报告结果
 */
export interface PerformanceReport {
  /** 报告生成时间 */
  generatedAt: Date;
  /** 报告总结 */
  summary: {
    slowQueriesCount: number;
    averageExecutionTime: number;
    recommendationsCount: number;
  };
  /** 慢查询分析结果 */
  slowQueryAnalysis: SlowQueryAnalysis;
  /** 系统状态 */
  systemStatus: {
    connectionHealth: string;
    memoryUsage: string;
    activeConnections: number;
  };
  /** 最终优化建议 */
  recommendations: string[];
}

/**
 * 性能分析配置选项
 */
export interface PerformanceAnalysisConfig {
  /** 慢查询阈值（秒） */
  longQueryTime?: number;
  /** 时间范围（天数） */
  timeRange?: number;
  /** 是否包含详细分析 */
  includeDetails?: boolean;
  /** 最大分析数量 */
  limit?: number;
  /** 最小扫描行数限制 */
  minExaminedRowLimit?: number;
  /** 性能模式监控启用状态 */
  enablePerformanceSchema?: boolean;
  /** 是否记录未使用索引的查询 */
  logQueriesNotUsingIndexes?: boolean;
  /** 日志文件大小限制（MB） */
  maxLogFileSize?: number;
  /** 是否启用慢查询日志轮转 */
  logSlowAdminStatements?: boolean;
  /** 慢查询日志文件路径 */
  slowQueryLogFile?: string;
}

/**
 * 慢查询配置选项
 */
export interface SlowQueryConfig {
  /** 慢查询阈值（秒），默认为1秒 */
  longQueryTime?: number;
  /** 是否记录未使用索引的查询 */
  logQueriesNotUsingIndexes?: boolean;
  /** 最小检查事务时间（秒） */
  minExaminedRowLimit?: number;
  /** 日志文件大小限制（MB） */
  maxLogFileSize?: number;
  /** 是否启用慢查询日志轮转 */
  logSlowAdminStatements?: boolean;
  /** 慢查询日志文件路径 */
  slowQueryLogFile?: string;
  /** 是否启用性能模式监控 */
  enablePerformanceSchema?: boolean;
}

/**
 * 慢查询分析模块
 *
 * 专门用于分析MySQL慢查询日志和性能模式数据的模块，能够识别性能瓶颈、
 * 分析查询模式并提供优化建议。通过分析performance_schema中的统计信息，
 * 提供详细的慢查询分析报告。
 *
 * @class SlowQueryAnalysisModule
 * @example
 * // 创建慢查询分析模块实例
 * const slowQueryModule = new SlowQueryAnalysisModule(mysqlManager);
 * 
 * // 分析慢查询
 * const analysis = await slowQueryModule.analyzeSlowQueries(50, '1 hour');
 * 
 * // 获取活跃慢查询
 * const activeQueries = await slowQueryModule.getActiveSlowQueries();
 */
class SlowQueryAnalysisModule {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 性能分析配置
   * @private
   * @type {PerformanceAnalysisConfig}
   */
  private config: PerformanceAnalysisConfig;

  /**
   * 构造函数 - 初始化慢查询分析模块
   * 
   * 创建SlowQueryAnalysisModule实例，用于分析MySQL慢查询和性能数据。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   * @param {PerformanceAnalysisConfig} [config={}] - 性能分析配置选项
   */
  constructor(mysqlManager: MySQLManager, config: PerformanceAnalysisConfig = {}) {
    this.mysqlManager = mysqlManager;
    this.config = {
      longQueryTime: 1,
      logQueriesNotUsingIndexes: true,
      minExaminedRowLimit: 1000,
      maxLogFileSize: 100,
      logSlowAdminStatements: true,
      enablePerformanceSchema: true,
      ...config
    };
  }

  /**
   * 启用慢查询日志
   *
   * 配置MySQL服务器启用慢查询日志记录功能。
   *
   * @param config 慢查询配置参数
   * @returns Promise<boolean> 配置是否成功
   */
  @withErrorHandling('enableSlowQueryLog', 'MSG_ENABLE_SLOW_QUERY_LOG_FAILED')
  @withPerformanceMonitoring('enable_slow_query_log')
  public async enableSlowQueryLog(config: SlowQueryConfig = {}): Promise<boolean> {
    const effectiveConfig = { ...this.config, ...config };

    // 检查用户权限
    await this.checkUserPrivileges();

    // 设置慢查询相关参数
    const settings = [
      `SET GLOBAL slow_query_log = 'ON'`,
      `SET GLOBAL long_query_time = ${effectiveConfig.longQueryTime || 1}`,
      `SET GLOBAL log_queries_not_using_indexes = '${effectiveConfig.logQueriesNotUsingIndexes ? 'ON' : 'OFF'}'`,
      `SET GLOBAL min_examined_row_limit = ${effectiveConfig.minExaminedRowLimit || 1000}`,
      `SET GLOBAL log_slow_admin_statements = '${effectiveConfig.logSlowAdminStatements ? 'ON' : 'OFF'}'`
    ];

    if (effectiveConfig.slowQueryLogFile) {
      settings.push(`SET GLOBAL slow_query_log_file = '${effectiveConfig.slowQueryLogFile}'`);
    }

    // 批量执行配置
    for (const setting of settings) {
      await this.mysqlManager.executeQuery(setting);
    }

    // 验证配置是否生效
    const verifyQuery = `
      SELECT
        @@slow_query_log as slow_query_log_enabled,
        @@long_query_time as long_query_time,
        @@log_queries_not_using_indexes as log_queries_not_using_indexes,
        @@min_examined_row_limit as min_examined_row_limit
    `;

    const verifyResult = await this.mysqlManager.executeQuery(verifyQuery) as Record<string, unknown>[];
    const settings_verified = verifyResult[0] as Record<string, unknown>;

    if (!settings_verified.slow_query_log_enabled) {
      throw new MySQLMCPError(
        '慢查询日志启用失败',
        ErrorCategory.SLOW_QUERY_LOG_ERROR,
        ErrorSeverity.HIGH
      );
    }

    this.config = { ...this.config, ...effectiveConfig };
    logger.warn('✅ 慢查询日志已成功启用');
    return true;
  }

  /**
   * 禁用慢查询日志
   */
  @withErrorHandling('disableSlowQueryLog', 'MSG_DISABLE_SLOW_QUERY_LOG_FAILED')
  @withPerformanceMonitoring('disable_slow_query_log')
  public async disableSlowQueryLog(): Promise<boolean> {
    await this.mysqlManager.executeQuery(`SET GLOBAL slow_query_log = 'OFF'`);
    logger.warn('⏹️ 慢查询日志已禁用');
    return true;
  }

  /**
   * 获取慢查询日志配置
   */
  @withErrorHandling('getSlowQueryLogConfig')
  @withPerformanceMonitoring('get_slow_query_config')
  public async getSlowQueryLogConfig(): Promise<SlowQueryConfig> {
    const query = `
      SELECT
        @@slow_query_log as slowQueryLog,
        @@long_query_time as longQueryTime,
        @@log_queries_not_using_indexes as logQueriesNotUsingIndexes,
        @@min_examined_row_limit as minExaminedRowLimit,
        @@slow_query_log_file as slowQueryLogFile,
        @@log_slow_admin_statements as logSlowAdminStatements
    `;

    const result = await this.mysqlManager.executeQuery(query) as Record<string, unknown>[];
    return result[0] as SlowQueryConfig;
  }

  /**
   * 获取慢查询日志状态
   */
  @withErrorHandling('getSlowQueryLogStatus')
  @withPerformanceMonitoring('get_slow_query_status')
  public async getSlowQueryLogStatus(): Promise<Record<string, unknown>> {
    const queries = [
      'SELECT @@slow_query_log as enabled',
      'SELECT @@slow_query_log_file as log_file',
      'SELECT @@long_query_time as threshold_seconds',
      'SELECT @@log_queries_not_using_indexes as log_no_index',
      'SELECT @@min_examined_row_limit as min_rows',
      'SELECT @@log_slow_admin_statements as log_admin'
    ];

    const results: Record<string, unknown> = {};

    for (let i = 0; i < queries.length; i++) {
      try {
        const result = await this.mysqlManager.executeQuery(queries[i]) as Record<string, unknown>[];
        Object.assign(results, result[0]);
      } catch (error) {
        logger.warn(`获取状态信息失败 (${i}):`, undefined, { error: (error as Error).message });
      }
    }

    return results;
  }

  /**
   * 分析慢查询日志
   * 
   * 通过查询performance_schema.events_statements_summary_by_digest表，
   * 分析慢查询的执行统计信息，识别性能瓶颈和常见查询模式。
   * 提供详细的慢查询分析报告，包括最慢查询、平均执行时间、索引建议等。
   *
   * @param {number} [limit=100] - 限制返回的慢查询数量，默认为100
   * @param {string} [timeRange='1 day'] - 分析时间范围，默认为1天
   * @returns {Promise<SlowQueryAnalysis>} 慢查询分析结果
   * @throws {MySQLMCPError} 当分析失败时抛出错误
   * @example
   * // 分析最近1小时的慢查询，最多返回20个
   * const analysis = await slowQueryModule.analyzeSlowQueries(20, '1 hour');
   * 
   * // 分析最近24小时的慢查询，最多返回50个
   * const analysis = await slowQueryModule.analyzeSlowQueries(50, '1 day');
   */
  async analyzeSlowQueries(limit: number = 100, timeRange: string = '1 day'): Promise<SlowQueryAnalysis> {
    try {
      // 检查performance_schema是否启用
      await this.checkPerformanceSchema();

      // 构建时间范围条件
      const timeFilter = this.buildTimeFilter(timeRange);

      // 查询慢查询统计信息
      const query = `
        SELECT
          DIGEST_TEXT as sql_text,
          COUNT_STAR as execution_count,
          SUM_TIMER_WAIT / 100000 as total_time_sec,
          AVG_TIMER_WAIT / 1000000000 as avg_time_sec,
          MAX_TIMER_WAIT / 1000000000 as max_time_sec,
          FIRST_SEEN as first_seen,
          LAST_SEEN as last_seen,
          SCHEMA_NAME as database_name,
          SUM_ROWS_EXAMINED as total_rows_examined,
          SUM_ROWS_SENT as total_rows_sent,
          SUM_NO_INDEX_USED + SUM_NO_GOOD_INDEX_USED as queries_without_index,
          DIGEST as query_digest
        FROM performance_schema.events_statements_summary_by_digest
        WHERE
          SCHEMA_NAME IS NOT NULL
          AND DIGEST_TEXT IS NOT NULL
          AND AVG_TIMER_WAIT > ${(this.config.longQueryTime || 1)} * 100000
          ${timeFilter}
        ORDER BY AVG_TIMER_WAIT DESC
        LIMIT ${limit}
      `;

      const slowQueries = await this.mysqlManager.executeQuery(query) as Array<{
        sql_text: string;
        execution_count: number;
        total_time_sec: number;
        avg_time_sec: number;
        max_time_sec: number;
        database_name: string;
        total_rows_examined: number;
        total_rows_sent: number;
        queries_without_index: number;
      }>;

      if (slowQueries.length === 0) {
        return this.createEmptyAnalysis();
      }

      // 转换格式并分析
      const queryInfos: SlowQueryInfo[] = slowQueries.map(query => ({
        sqlText: query.sql_text,
        executionTime: query.avg_time_sec,
        lockTime: 0,
        rowsExamined: Math.floor(query.total_rows_examined / query.execution_count),
        rowsReturned: Math.floor(query.total_rows_sent / query.execution_count),
        startTime: new Date(),
        user: 'N/A',
        database: query.database_name || 'unknown',
        ipAddress: 'N/A',
        threadId: 0,
        usesIndex: query.queries_without_index === 0
      }));

      // 生成完整分析结果
      return this.generateAnalysisResult(queryInfos, slowQueries);
    } catch (error) {
      throw new MySQLMCPError(
        `慢查询分析失败: ${(error as Error).message}`,
        ErrorCategory.DATA_ERROR,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 获取活跃的慢查询
   * 
   * 查询information_schema.processlist表，获取当前正在执行的慢查询。
   * 这些查询可能正在消耗大量系统资源，需要重点关注和优化。
   *
   * @returns {Promise<SlowQueryInfo[]>} 活跃慢查询列表
   * @throws {MySQLMCPError} 当获取失败时抛出错误
   * @example
   * // 获取当前活跃的慢查询
   * const activeQueries = await slowQueryModule.getActiveSlowQueries();
   * logger.debug(`发现 ${activeQueries.length} 个活跃慢查询`);
   */
  async getActiveSlowQueries(): Promise<SlowQueryInfo[]> {
    try {
      const query = `
        SELECT
          info AS sql_text,
          TIME AS execution_time,
          COMMAND AS command_type,
          STATE AS current_state,
          DB AS database_name,
          HOST AS client_host,
          ID AS thread_id
        FROM information_schema.processlist
        WHERE TIME > ${(this.config.longQueryTime || 1)}
          AND COMMAND != 'Sleep'
        ORDER BY TIME DESC
        LIMIT 50
      `;

      const result = await this.mysqlManager.executeQuery(query) as Array<{
        sql_text: string;
        execution_time: number;
        command_type: string;
        current_state: string;
        database_name: string;
        client_host: string;
        thread_id: number;
      }>;

      return result.map(row => ({
        sqlText: row.sql_text || '',
        executionTime: row.execution_time || 0,
        lockTime: 0,
        rowsExamined: 0,
        rowsReturned: 0,
        startTime: new Date(Date.now() - (row.execution_time * 1000)),
        user: row.client_host?.split('@')[0] || '',
        database: row.database_name || '',
        ipAddress: row.client_host?.split('@')[1] || '',
        threadId: row.thread_id,
        usesIndex: false
      }));
    } catch (error) {
      throw new MySQLMCPError(
        `获取活跃慢查询失败: ${(error as Error).message}`,
        ErrorCategory.DATA_ERROR,
        ErrorSeverity.LOW
      );
    }
  }

  /**
   * 检查用户权限
   */
  private async checkUserPrivileges(): Promise<void> {
    try {
      await this.mysqlManager.executeQuery('SELECT @@version');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Access denied')) {
        throw new MySQLMCPError(
          '用户没有足够的权限配置慢查询日志，需要SUPER权限或相应权限',
          ErrorCategory.PRIVILEGE_ERROR,
          ErrorSeverity.HIGH
        );
      }
      throw error;
    }
  }

  /**
   * 检查性能模式是否启用
   *
   * 验证MySQL服务器的performance_schema是否已启用，这是慢查询分析的基础。
   * performance_schema提供详细的查询执行统计信息，用于识别性能瓶颈和优化机会。
   * 如果未启用，则无法进行深度慢查询分析，必须提前配置MySQL服务器。
   *
   * @private
   * @returns {Promise<void>} 检查通过时无返回值，失败时抛出错误
   * @throws {MySQLMCPError} 当performance_schema未启用时抛出的配置错误
   */
  private async checkPerformanceSchema(): Promise<void> {
    const query = 'SELECT @@performance_schema as enabled';
    const result = await this.mysqlManager.executeQuery(query) as Array<{ enabled: number }>;
    const enabled = result[0].enabled;

    if (!enabled) {
      throw new MySQLMCPError(
        'performance_schema未启用，无法进行慢查询分析。需要启用performance_schema以获得详细的查询统计信息。',
        ErrorCategory.CONFIGURATION_ERROR,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 构建时间范围过滤条件
   *
   * 根据指定的时间范围生成MySQL查询的WHERE子句时间过滤条件。
   * 使用DATE_SUB函数计算相对时间范围，确保查询只分析指定时间段内的数据。
   * 支持灵活的时间范围配置，如 '1 day', '1 week', '1 hour' 等。
   *
   * @private
   * @param {string} timeRange - 时间范围字符串，MySQL INTERVAL格式
   * @returns {string} 时间过滤WHERE子句，如果无时间范围则返回空字符串
   */
  private buildTimeFilter(timeRange: string): string {
    return timeRange ? `AND LAST_SEEN >= DATE_SUB(NOW(), INTERVAL ${timeRange})` : '';
  }

  /**
   * 创建空的慢查询分析结果
   *
   * 当没有发现慢查询数据时，返回标准化的空分析结果结构。
   * 提供默认值和友好的提示信息，维持接口一致性。
   * 用于处理查询范围内无慢查询的情况，确保调用方始终获得一致的数据结构。
   *
   * @private
   * @returns {SlowQueryAnalysis} 标准化的空慢查询分析结果
   */
  private createEmptyAnalysis(): SlowQueryAnalysis {
    return {
      totalSlowQueries: 0,
      averageExecutionTime: 0,
      commonPatterns: [],
      indexSuggestions: [],
      performanceIssues: [],
      recommendations: ['未发现慢查询记录']
    };
  }

  /**
   * 生成完整的分析结果
   *
   * 综合处理慢查询数据，生成完整的性能分析报告。
   * 计算统计信息、识别查询模式、生成索引建议和优化建议。
   * 整合各项分析结果，提供全面的性能洞察和优化指导。
   *
   * @private
   * @param {SlowQueryInfo[]} queryInfos - 转换后的慢查询信息数组
   * @param {unknown[]} rawQueries - 原始查询数据，用于补充统计信息
   * @returns {SlowQueryAnalysis} 完整的慢查询分析结果对象
   */
  private generateAnalysisResult(queryInfos: SlowQueryInfo[], rawQueries: unknown[]): SlowQueryAnalysis {
    const totalTime = queryInfos.reduce((sum, q) => sum + q.executionTime, 0);
    const avgTime = totalTime / queryInfos.length;

    // 分析查询模式
    const patternCount: Record<string, { count: number; totalTime: number }> = {};
    queryInfos.forEach(query => {
      const pattern = this.extractQueryPattern(query.sqlText);
      if (!patternCount[pattern]) {
        patternCount[pattern] = { count: 0, totalTime: 0 };
      }
      patternCount[pattern].count++;
      patternCount[pattern].totalTime += query.executionTime;
    });

    const commonPatterns = Object.entries(patternCount)
      .map(([pattern, stats]) => ({
        pattern,
        count: stats.count,
        avgTime: stats.totalTime / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 生成索引建议
    const indexSuggestions = this.generateIndexSuggestions(queryInfos);

    // 识别性能问题
    const performanceIssues = this.identifyPerformanceIssues(queryInfos, rawQueries);

    // 生成优化建议
    const recommendations = this.generateOptimizationRecommendations(queryInfos.length, avgTime, commonPatterns);

    return {
      totalSlowQueries: queryInfos.length,
      slowestQuery: queryInfos[0],
      averageExecutionTime: avgTime,
      commonPatterns,
      indexSuggestions,
      performanceIssues,
      recommendations
    };
  }

  /**
   * 提取查询模式字符串
   *
   * 从SQL查询文本中提取标准化模式的辅助方法，用于识别常见的查询模式。
   * 通过移除空白符、数字参数和字符串字面量，将具体查询转换为抽象模式。
   * 便利于统计和分析相同类型的查询，提高模式识别的准确性。
   *
   * @private
   * @param {string} sqlText - 原始SQL查询文本
   * @returns {string} 标准化的查询模式字符串，最长100字符
   */
  private extractQueryPattern(sqlText: string): string {
    return sqlText
      .replace(/\s+/g, ' ')
      .replace(/\d+/g, '?')
      .replace(/'[^']*'/g, '?')
      .replace(/"[^"]*"/g, '?')
      .toUpperCase()
      .substring(0, 100);
  }

  /**
   * 生成索引优化建议
   *
   * 分析慢查询信息，生成针对性的索引创建建议。通过解析查询中的WHERE条件、
   * 范围查询和复合查询模式，确定最有效的索引策略。对于没有使用索引的查询，
   * 识别关键查询模式并提出相应的索引建议。
   *
   * @private
   * @param {SlowQueryInfo[]} queryInfos - 慢查询信息数组，用于生成索引建议
   * @returns {IndexSuggestion[]} 索引优化建议数组，包含表名、列名和预期性能提升
   */
  private generateIndexSuggestions(queryInfos: SlowQueryInfo[]): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];

    queryInfos.forEach(query => {
      if (!query.usesIndex && query.executionTime > 1) {
        const upperSql = query.sqlText.toUpperCase();

        if (upperSql.includes('WHERE') && upperSql.includes('=')) {
          const tableMatch = query.sqlText.match(/FROM\s+(\w+)/i);
          const table = tableMatch ? tableMatch[1] : 'unknown_table';

          // 根据WHERE条件生成不同的索引建议
          let columns: string[] = [];
          let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
          let expectedImprovement = '60-85%';

          if (upperSql.includes('WHERE ID =') || upperSql.includes('WHERE USER_ID =')) {
            columns = ['id'];
            priority = 'HIGH';
            expectedImprovement = '70-90%';
          } else if (upperSql.includes('WHERE EMAIL =')) {
            columns = ['email'];
            priority = 'MEDIUM';
          } else if (upperSql.includes('WHERE STATUS =')) {
            columns = ['status'];
            priority = 'MEDIUM';
          }

          if (columns.length > 0) {
            suggestions.push({
              table,
              columns,
              indexType: 'INDEX',
              expectedImprovement,
              priority,
              reason: `WHERE子句中频繁使用${columns.join(',')}字段进行查询`
            });
          }

          // 复合索引建议
          if (upperSql.includes('WHERE') && (
            (upperSql.match(/AND/gi) || []).length > 1 ||
            upperSql.includes('ORDER BY') ||
            upperSql.includes('GROUP BY')
          )) {
            const compositeColumns = this.extractCompositeColumns(upperSql);
            if (compositeColumns.length > 1) {
              suggestions.push({
                table,
                columns: compositeColumns,
                indexType: 'INDEX',
                expectedImprovement: '70-95%',
                priority: 'HIGH',
                reason: '多条件查询，复合索引可显著提升性能'
              });
            }
          }
        }
      }
    });

    return suggestions;
  }

  /**
   * 提取复合索引列
   *
   * 从SQL查询中提取适合复合索引的字段列表。分析WHERE条件、
   * ORDER BY和GROUP BY子句中的字段，确定多字段索引的候选列。
   * 限制最大字段数量为3个，避免索引过长和维护成本过高。
   *
   * @private
   * @param {string} upperSql - 大写的SQL查询字符串
   * @returns {string[]} 复合索引字段数组，最多包含3个字段
   */
  private extractCompositeColumns(upperSql: string): string[] {
    const columns: string[] = [];
    const whereClause = upperSql.split('WHERE')[1]?.split('ORDER BY')[0]?.split('GROUP BY')[0] || '';

    // 提取WHERE子句中的字段
    const fieldRegex = /(\w+)\s*[=!><]/g;
    let match;
    while ((match = fieldRegex.exec(whereClause)) !== null) {
      const field = match[1].toLowerCase();
      if (['and', 'or', 'not', 'is', 'null', 'exists', 'in'].includes(field)) continue;
      if (!columns.includes(field)) {
        columns.push(field);
        if (columns.length >= 3) break; // 最多3个字段
      }
    }

    return columns;
  }

  /**
   * 识别性能问题
   *
   * 分析慢查询信息，识别常见的性能问题和瓶颈点。包括未使用索引的查询、
   * 扫描行数过多的查询、执行时间过长的查询以及锁等待时间较长的查询。
   * 这些问题可能导致数据库性能下降或资源浪费。
   *
   * @private
   * @param {SlowQueryInfo[]} queryInfos - 慢查询信息数组
   * @param {unknown[]} _rawQueries - 原始查询数据（目前未使用，预留扩展）
   * @returns {string[]} 识别出的性能问题描述数组
   */
  private identifyPerformanceIssues(queryInfos: SlowQueryInfo[], _rawQueries: unknown[]): string[] {
    const issues: string[] = [];

    const noIndexQueries = queryInfos.filter(q => !q.usesIndex).length;
    if (noIndexQueries > queryInfos.length * 0.5) {
      issues.push(`大量查询未使用索引 (${noIndexQueries}/${queryInfos.length})`);
    }

    const totalRowsExamined = queryInfos.reduce((sum, q) => sum + q.rowsExamined, 0);
    const avgRowsExamined = totalRowsExamined / queryInfos.length;

    if (avgRowsExamined > 10000) {
      issues.push(`平均扫描行数过高 (${Math.floor(avgRowsExamined)}行)`);
    }

    const longRunningQueries = queryInfos.filter(q => q.executionTime > 5).length;
    if (longRunningQueries > 0) {
      issues.push(`发现${longRunningQueries}个执行时间超过5秒的查询`);
    }

    const highLockTimeQueries = queryInfos.filter(q => q.lockTime > 1).length;
    if (highLockTimeQueries > 0) {
      issues.push(`发现${highLockTimeQueries}个锁等待时间较长的查询`);
    }

    return issues;
  }

  /**
   * 生成优化建议
   *
   * 根据总查询数、平均执行时间和常见查询模式生成具体的优化建议。
   * 针对不同的性能问题给出相应的解决方案，如启用慢查询日志、
   * 使用查询缓存、执行存储过程或添加索引等。
   *
   * @private
   * @param {number} totalQueries - 总慢查询数量
   * @param {number} avgTime - 平均执行时间（秒）
   * @param {Array<{pattern: string, count: number, avgTime: number}>} commonPatterns - 常见查询模式数组
   * @returns {string[]} 优化建议字符串数组
   */
  private generateOptimizationRecommendations(
    totalQueries: number,
    avgTime: number,
    commonPatterns: Array<{ pattern: string; count: number; avgTime: number }>
  ): string[] {
    const recommendations: string[] = [];

    if (avgTime > 2) {
      recommendations.push('⚡ 查询平均执行时间较长，建议检查数据库参数调优');
    }

    if (commonPatterns.length > 3) {
      recommendations.push('🔄 发现重复查询模式，考虑使用查询缓存或存储过程');
    }

    if (totalQueries > 50) {
      recommendations.push('📊 慢查询数量较多，建议启用慢查询日志进行详细分析');
    }

    if (totalQueries > 10) {
      recommendations.push('🔍 发现多个慢查询，建议添加适当索引');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 查询性能相对良好，建议继续监控');
    }

    return recommendations;
  }
}

/**
 * 索引优化模块
 *
 * 专门用于分析数据库索引使用情况并生成优化建议的模块。通过分析慢查询模式、
 * 现有索引使用情况和表结构，提供针对性的索引创建建议，以提升查询性能。
 *
 * @class IndexOptimizationModule
 * @example
 * // 创建索引优化模块实例
 * const indexModule = new IndexOptimizationModule(mysqlManager);
 * 
 * // 生成索引优化建议
 * const suggestions = await indexModule.generateIndexSuggestions(20, '1 day');
 */
class IndexOptimizationModule {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 性能分析配置
   * @private
   * @type {PerformanceAnalysisConfig}
   */
  private config: PerformanceAnalysisConfig;

  /**
   * 构造函数 - 初始化索引优化模块
   * 
   * 创建IndexOptimizationModule实例，用于分析数据库索引使用情况并生成优化建议。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   * @param {PerformanceAnalysisConfig} [config={}] - 性能分析配置选项
   */
  constructor(mysqlManager: MySQLManager, config: PerformanceAnalysisConfig = {}) {
    this.mysqlManager = mysqlManager;
    this.config = config;
  }

  /**
   * 生成索引优化建议
   * 
   * 通过分析慢查询模式和现有索引使用情况，生成针对性的索引创建建议。
   * 建议包括表名、列名、索引类型、预期性能提升和优先级等信息。
   *
   * @param {number} [limit=50] - 限制返回的建议数量，默认为50
   * @param {string} [timeRange='1 day'] - 分析时间范围，默认为1天
   * @returns {Promise<IndexSuggestion[]>} 索引优化建议列表
   * @throws {MySQLMCPError} 当生成建议失败时抛出错误
   * @example
   * // 生成最近24小时的索引优化建议，最多返回20个
   * const suggestions = await indexModule.generateIndexSuggestions(20, '1 day');
   * 
   * // 生成最近1小时的索引优化建议，最多返回10个
   * const suggestions = await indexModule.generateIndexSuggestions(10, '1 hour');
   */
  async generateIndexSuggestions(limit: number = 50, timeRange: string = '1 day'): Promise<IndexSuggestion[]> {
    try {
      // 初始化SlowQueryAnalysisModule实例
      const slowQueryModule = new SlowQueryAnalysisModule(this.mysqlManager, this.config);
      const slowQueryAnalysis = await slowQueryModule.analyzeSlowQueries(limit, timeRange);

      if (slowQueryAnalysis?.totalSlowQueries === 0) {
        return this.generateGeneralIndexRecommendations();
      }

      // 基于慢查询数据生成针对性建议
      const suggestions: IndexSuggestion[] = [];
      const analyzedTables = new Set<string>();

      if (slowQueryAnalysis?.commonPatterns) {
        for (const pattern of slowQueryAnalysis.commonPatterns) {
          const suggestionsFromPattern = await this.analyzeQueryPattern(pattern.pattern);
          suggestionsFromPattern.forEach(suggestion => {
            if (!analyzedTables.has(suggestion.table)) {
              suggestions.push(suggestion);
              analyzedTables.add(suggestion.table);
            }
          });
        }
      }

      // 分析现有索引使用情况
      const existingIndexAnalysis = await this.analyzeExistingIndexes();
      suggestions.push(...existingIndexAnalysis);

      return suggestions.slice(0, limit);
    } catch (error) {
      throw new MySQLMCPError(
        `索引建议生成失败: ${(error as Error).message}`,
        ErrorCategory.DATA_ERROR,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 分析查询模式
   *
   * 从查询模式字符串中分析表名和字段使用情况，生成相应的索引建议。
   * 解析FROM子句和WHERE子句，确定最相关的表和过滤字段，
   * 为它们生成合适的索引建议。
   *
   * @private
   * @param {string} pattern - 查询模式字符串
   * @returns {Promise<IndexSuggestion[]>} 索引建议数组
   */
  private async analyzeQueryPattern(pattern: string): Promise<IndexSuggestion[]> {
    const suggestions: IndexSuggestion[] = [];

    // 分析查询模式中的表和字段
    try {
      if (pattern.includes('FROM') && pattern.includes('WHERE')) {
        const tableMatch = pattern.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];

          // 检查表是否存在
          if (await this.checkTableExists(tableName)) {
            // 分析WHERE条件中的字段
            const fieldSuggestions = this.extractFieldSuggestions(pattern, tableName);
            suggestions.push(...fieldSuggestions);
          }
        }
      }
    } catch {
      // 忽略分析错误，继续下一个模式
    }

    return suggestions;
  }

  /**
   * 检查表是否存在
   *
   * 查询数据库检查指定的表是否真实存在。这是一个重要的验证步骤，
   * 确保索引建议只针对有效的表，避免生成无效的DDL语句。
   *
   * @private
   * @param {string} tableName - 要检查的表名
   * @returns {Promise<boolean>} 如果表存在返回true，否则返回false
   */
  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const query = `SHOW TABLES LIKE '${tableName}'`;
      const result = await this.mysqlManager.executeQuery(query);
      return Array.isArray(result) && result.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 提取字段建议
   *
   * 从查询模式中提取具体的字段使用情况，生成字段级别的索引建议。
   * 分析等值查询和范围查询，为相应的字段生成优先级和性能提升评估。
   *
   * @private
   * @param {string} pattern - 查询模式字符串
   * @param {string} tableName - 表名
   * @returns {IndexSuggestion[]} 字段级别的索引建议数组
   */
  private extractFieldSuggestions(pattern: string, tableName: string): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];
    const upperPattern = pattern.toUpperCase();

    // 分析相等查询
    const equalConditions = upperPattern.match(/(\w+)\s*[=!]\s*[?\w]+/g);
    if (equalConditions) {
      for (const condition of equalConditions.slice(0, 5)) { // 限制建议数量
        const fieldMatch = condition.match(/(\w+)\s*[=!]/);
        if (fieldMatch) {
          const field = fieldMatch[1];
          if (!['AND', 'OR', 'NOT', 'IS', 'NULL', 'EXISTS', 'IN'].includes(field.toUpperCase())) {
            suggestions.push({
              table: tableName,
              columns: [field.toLowerCase()],
              indexType: 'INDEX',
              expectedImprovement: '50-80%',
              priority: this.getPriority(field),
              reason: `WHERE条件中频繁使用${field}字段进行等值查询`
            });
          }
        }
      }
    }

    // 分析范围查询
    const rangeConditions = upperPattern.match(/(\w+)\s*[><]\s*=?\s*[?\w]+/g);
    if (rangeConditions) {
      for (const condition of rangeConditions.slice(0, 3)) {
        const fieldMatch = condition.match(/(\w+)\s*[><]/);
        if (fieldMatch) {
          const field = fieldMatch[1];
          suggestions.push({
            table: tableName,
            columns: [field.toLowerCase()],
            indexType: 'INDEX',
            expectedImprovement: '40-70%',
            priority: 'MEDIUM',
            reason: `${field}字段的范围查询可通过索引优化`
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * 获取字段优先级
   *
   * 根据字段名确定索引建议的优先级别。常用的字段如id、user_id、created_at等
   * 被标记为高优先级，其他的email、status等特殊字段为中等优先级，
   * 默认的其他字段为低优先级。
   *
   * @private
   * @param {string} field - 字段名（小写）
   * @returns {'HIGH' | 'MEDIUM' | 'LOW'} 字段的优先级别
   */
  private getPriority(field: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const highPriorityFields = ['id', 'user_id', 'created_at', 'updated_at'];
    const mediumPriorityFields = ['email', 'status', 'category_id'];

    if (highPriorityFields.includes(field.toLowerCase())) {
      return 'HIGH';
    } else if (mediumPriorityFields.includes(field.toLowerCase())) {
      return 'MEDIUM';
    }
    return 'MEDIUM';
  }

  /**
   * 分析现有索引
   *
   * 扫描数据库中的所有表，分析现有索引的使用情况和健康状态。
   * 识别缺失的主键索引、过时的冗余索引等问题，为它们生成相应的优化建议。
   * 限制分析的表数量以提高性能。
   *
   * @private
   * @returns {Promise<IndexSuggestion[]>} 现有索引相关的优化建议数组
   */
  private async analyzeExistingIndexes(): Promise<IndexSuggestion[]> {
    const suggestions: IndexSuggestion[] = [];

    try {
      // 获取所有表
      const tables = await this.mysqlManager.executeQuery('SHOW TABLES') as Array<{[key: string]: string}>;

      for (const tableRow of tables.slice(0, 20)) { // 限制分析的表数量
        const tableName = Object.values(tableRow)[0];

        // 检查表的索引
        const indexInfo = await this.getTableIndexInfo(tableName);
        const suggestionsForTable = await this.analyzeTableIndexHealth(tableName, indexInfo);
        suggestions.push(...suggestionsForTable);
      }
    } catch {
      // 忽略索引分析错误
    }

    return suggestions;
  }

  /**
   * 获取表索引信息
   *
   * 查询information_schema.STATISTICS视图获取指定表的完整索引信息。
   * 包括索引名称、字段名、索引类型、序列位置等详细信息，用于进行深入的索引分析。
   *
   * @private
   * @param {string} tableName - 表名
   * @returns {Promise<Array<Record<string, unknown>>>} 索引信息记录数组
   */
  private async getTableIndexInfo(tableName: string): Promise<Array<Record<string, unknown>>> {
    const query = `
      SELECT
        INDEX_NAME,
        COLUMN_NAME,
        SEQ_IN_INDEX,
        NON_UNIQUE,
        INDEX_TYPE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;

    return await this.mysqlManager.executeQuery(query, [tableName]) as Array<Record<string, unknown>>;
  }

  /**
   * 分析表索引健康状况
   *
   * 对表的现有索引进行全面健康检查，包括检查主键索引是否存在、
   * 识别冗余索引等。生成具体的优化建议以改进索引结构和性能。
   *
   * @private
   * @param {string} tableName - 表名
   * @param {Array<Record<string, unknown>>} indexes - 表的索引信息
   * @returns {Promise<IndexSuggestion[]>} 索引健康建议数组
   */
  private async analyzeTableIndexHealth(tableName: string, indexes: Array<Record<string, unknown>>): Promise<IndexSuggestion[]> {
    const suggestions: IndexSuggestion[] = [];

    // 检查是否缺少主键
    const hasPrimaryKey = indexes.some(idx => (idx.INDEX_NAME as string) === 'PRIMARY');
    if (!hasPrimaryKey) {
      suggestions.push({
        table: tableName,
        columns: ['id'], // 假设主键字段名为id
        indexType: 'PRIMARY',
        expectedImprovement: '80-95%',
        priority: 'HIGH',
        reason: '表缺少主键索引，这是数据库设计的最佳实践'
      });
    }

    // 检查是否有重复索引
    const indexMap = new Map<string, string[]>();
    indexes.forEach(idx => {
      const indexName = idx.INDEX_NAME as string;
      const columnName = idx.COLUMN_NAME as string;
      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, []);
      }
      indexMap.get(indexName)?.push(columnName);
    });

    for (const [indexName, columns] of Array.from(indexMap.entries())) {
      for (const [otherIndexName, otherColumns] of Array.from(indexMap.entries())) {
        if (indexName !== otherIndexName && columns.length > 0 && otherColumns.length > 0) {
          if (this.isRedundantIndex(columns, otherColumns)) {
            suggestions.push({
              table: tableName,
              columns,
              indexType: 'INDEX' as const,
              expectedImprovement: '5-10%',
              priority: 'LOW',
              reason: `索引${indexName}与${otherIndexName}存在重复，可考虑清理`
            });
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * 检查索引是否冗余
   *
   * 比较两个索引的字段列表，确定它们是否包含相同的字段。
   * 如果两个索引具有完全相同的字段（顺序相同），则认为存在冗余，
   * 可以考虑清理其中一个来减少维护开销。
   *
   * @private
   * @param {string[]} columns1 - 第一个索引的字段列表
   * @param {string[]} columns2 - 第二个索引的字段列表
   * @returns {boolean} 如果索引冗余返回true，否则返回false
   */
  private isRedundantIndex(columns1: string[], columns2: string[]): boolean {
    if (columns1.length !== columns2.length) return false;
    return columns1.every(col => columns2.includes(col));
  }

  /**
   * 生成通用索引建议
   *
   * 当没有具体的慢查询数据时，提供通用的索引优化建议。
   * 这些建议基于数据库设计的最佳实践，主要包括定期分析和主键检查等通用指导。
   *
   * @private
   * @returns {IndexSuggestion[]} 通用的索引优化建议数组
   */
  private generateGeneralIndexRecommendations(): IndexSuggestion[] {
    return [
      {
        table: 'general_recommendation',
        columns: ['标准建议'],
        indexType: 'INDEX',
        expectedImprovement: 'N/A',
        priority: 'MEDIUM',
        reason: '定期运行慢查询分析以获取针对性的索引优化建议'
      },
      {
        table: 'primary_key_check',
        columns: ['主键检查'],
        indexType: 'PRIMARY',
        expectedImprovement: '高',
        priority: 'HIGH',
        reason: '确保所有表都定义了合适的主键索引'
      }
    ];
  }
}

/**
 * 查询性能剖析模块
 *
 * 专门用于分析单个SQL查询性能的模块，通过执行EXPLAIN命令分析查询执行计划，
 * 提供详细的性能分析报告和优化建议。帮助识别查询中的性能瓶颈和改进机会。
 *
 * @class QueryProfilingModule
 * @example
 * // 创建查询性能剖析模块实例
 * const profilingModule = new QueryProfilingModule(mysqlManager);
 * 
 * // 对特定查询进行性能剖析
 * const profile = await profilingModule.profileQuery('SELECT * FROM users WHERE id = ?', [{ id: 123 }]);
 */
class QueryProfilingModule {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 构造函数 - 初始化查询性能剖析模块
   * 
   * 创建QueryProfilingModule实例，用于分析单个SQL查询的性能。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   */
  constructor(mysqlManager: MySQLManager) {
    this.mysqlManager = mysqlManager;
  }

  /**
   * 对特定查询进行性能剖析
   * 
   * 通过执行EXPLAIN命令分析查询执行计划，评估查询性能并提供优化建议。
   * 返回详细的执行计划信息、性能统计和改进建议。
   *
   * @param {string} sql - 要剖析的SQL查询语句
   * @param {Record<string, unknown>[]} [params] - 查询参数数组
   * @returns {Promise<QueryProfileResult>} 查询性能剖析结果
   * @throws {MySQLMCPError} 当剖析失败时抛出错误
   * @example
   * // 剖析简单查询
   * const profile = await profilingModule.profileQuery('SELECT * FROM users');
   * 
   * // 剖析带参数的查询
   * const profile = await profilingModule.profileQuery(
   *   'SELECT * FROM users WHERE id = ? AND status = ?',
   *   [{ id: 123, status: 'active' }]
   * );
   */
  async profileQuery(sql: string, params?: Record<string, unknown>[]): Promise<QueryProfileResult> {
    try {
      // 验证查询
      await this.mysqlManager.validateInput(sql, 'query');

      // 执行EXPLAIN分析
      const explainJson = await this.getExplainResult(sql, params);
      const explainSimple = await this.getSimpleExplainResult(sql, params);

      // 获取执行统计（如果可能）
      const executionStats = await this.getExecutionStats(sql, params);

      // 分析执行计划并生成建议
      const recommendations = this.analyzeExplainResult(explainJson, explainSimple);
      const performanceScore = this.calculatePerformanceScore(explainJson, executionStats);

      return {
        explainResult: explainJson,
        executionStats,
        recommendations,
        performanceScore
      };
    } catch (error) {
      throw new MySQLMCPError(
        `查询性能剖析失败: ${(error as Error).message}`,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 获取EXPLAIN结果（JSON格式）
   *
   * 尝试使用EXPLAIN FORMAT=JSON命令获取查询的详细执行计划信息。
   * JSON格式提供结构化的执行计划数据，如果失败则降级到简单格式。
   *
   * @private
   * @param {string} sql - 要分析的SQL查询
   * @param {Record<string, unknown>[]} [params] - 查询参数数组
   * @returns {Promise<Record<string, unknown>[]>} 执行计划的结果数组
   */
  private async getExplainResult(sql: string, params?: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    try {
      const explainQuery = `EXPLAIN FORMAT=JSON ${sql}`;
      const result = await this.mysqlManager.executeQuery(explainQuery, params) as Record<string, unknown>;
      return Array.isArray(result) ? result : [result];
    } catch {
      // 如果FORMAT=JSON不可用，使用传统格式
      return await this.getSimpleExplainResult(sql, params);
    }
  }

  /**
   * 获取标准EXPLAIN结果
   *
   * 使用简单的EXPLAIN命令获取查询的执行计划信息。这是兼容性更好的备选方案，
   * 当JSON格式不可用时使用，提供基本的查询执行分析。
   *
   * @private
   * @param {string} sql - 要分析的SQL查询
   * @param {Record<string, unknown>[]} [params] - 查询参数数组
   * @returns {Promise<Record<string, unknown>[]>} 执行计划的结果数组
   */
  private async getSimpleExplainResult(sql: string, params?: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
    const explainQuery = `EXPLAIN ${sql}`;
    const result = await this.mysqlManager.executeQuery(explainQuery, params) as Record<string, unknown>;
    return Array.isArray(result) ? result : [result];
  }

  /**
   * 获取执行统计信息
   *
   * 尝试通过MySQL的profiling功能获取查询的详细执行统计信息。
   * 包括实际的执行时间、扫描行数等。如果profiling功能不可用，返回默认值。
   * 这是一个辅助的统计收集方法，主要用于计算性能评分。
   *
   * @private
   * @param {string} sql - 要分析的SQL查询
   * @param {Record<string, unknown>[]} [params] - 查询参数数组
   * @returns {Promise<{ executionTime: number; rowsExamined: number; rowsReturned: number }>}
   *          执行统计信息对象，返回-1表示信息不可用
   */
  private async getExecutionStats(sql: string, params?: Record<string, unknown>[]): Promise<{ executionTime: number; rowsExamined: number; rowsReturned: number }> {
    // 注意：获取精确的执行统计可能需要服务器级别的配置
    try {
      // 启用查询性能分析
      await this.mysqlManager.executeQuery('SET profiling = 1');
      
      // 执行查询
      await this.mysqlManager.executeQuery(sql, params);
      
      // 获取性能分析信息
      const profileResult = await this.mysqlManager.executeQuery('SHOW PROFILE') as Array<{Duration: number}>;
      const totalDuration = profileResult.reduce((sum, row) => sum + (row.Duration || 0), 0);
      
      // 获取查询ID
      const queryIdResult = await this.mysqlManager.executeQuery('SELECT @@profiling AS profiling_enabled, @@profiling_history_size AS history_size') as Array<{profiling_enabled: number, history_size: number}>;
      const profilingEnabled = queryIdResult[0]?.profiling_enabled || 0;
      
      if (profilingEnabled && profileResult.length > 0) {
        // 返回执行时间和估算的行数
        return {
          executionTime: totalDuration * 1000, // 转换为毫秒
          rowsExamined: -1, // EXPLAIN中获取更准确的信息
          rowsReturned: -1  // EXPLAIN中获取更准确的信息
        };
      } else {
        // 如果profiling不可用，返回默认值
        return {
          executionTime: -1,
          rowsExamined: -1,
          rowsReturned: -1
        };
      }
    } catch {
      // 返回默认值
      return {
      executionTime: -1,
      rowsExamined: -1,
      rowsReturned: -1
    };
  }
}

  /**
   * 获取最后查询的ID
   *
   * 获取最近执行的查询ID，用于在性能剖析过程中追踪查询执行。
   * 这个方法主要用于查询性能分析时的辅助标识，当无法获取准确ID时返回默认值1。
   * 提供容错处理，确保即使查询失败也能返回合理的标识符。
   *
   * @private
   * @returns {Promise<number>} 查询标识符，成功时返回最近查询ID，失败时返回1
   */
  private async getLastQueryId(): Promise<number> {
    try {
      // 获取最近的查询ID
      const result = await this.mysqlManager.executeQuery('SELECT @@last_query_id as id') as Array<{ id: number }>;
      return result[0]?.id || 1;
    } catch {
      // 如果无法获取查询ID，尝试使用LAST_INSERT_ID作为备选方案
      try {
        const result = await this.mysqlManager.executeQuery('SELECT LAST_INSERT_ID() as id') as Array<{ id: number }>;
        return result[0]?.id || 1;
      } catch {
        return 1;
      }
    }
  }

  /**
   * 分析EXPLAIN结果并生成建议
   *
   * 深入分析EXPLAIN执行计划结果，识别性能问题并生成具体的优化建议。
   * 检查索引使用情况、全表扫描、扫描行数等关键指标，提供针对性的改进建议。
   *
   * @private
   * @param {Record<string, unknown>[]} explainJson - JSON格式的EXPLAIN结果
   * @param {Record<string, unknown>[]} explainSimple - 简单格式的EXPLAIN结果
   * @returns {string[]} 优化建议数组
   */
  private analyzeExplainResult(explainJson: Record<string, unknown>[], explainSimple: Record<string, unknown>[]): string[] {
    const recommendations: string[] = [];

    try {
      // 分析简单的EXPLAIN结果
      explainSimple.forEach((row, index) => {
        const rowData = row as Record<string, unknown>;

        // 检查是否使用了全表扫描
        if ((rowData.type as string) === 'ALL') {
          recommendations.push(`查询步骤${index + 1}：使用全表扫描，建议添加索引`);
        }

        // 检查索引使用情况
        if (rowData.key === null || rowData.key === undefined) {
          recommendations.push(`查询步骤${index + 1}：未使用索引，查询性能可能较差`);
        }

        // 检查扫描行数
        const rows = rowData.rows as number;
        if (rows && rows > 1000) { // 提高阈值到1000行
          recommendations.push(`查询步骤${index + 1}：扫描${rows}行数据，建议优化索引或查询条件`);
        }

        // 检查Extra字段的关键信息
        const extra = rowData.Extra as string;
        if (extra) {
          if (extra.includes('Using temporary')) {
            recommendations.push(`查询步骤${index + 1}：使用临时表，建议优化GROUP BY或ORDER BY`);
          }
          if (extra.includes('Using filesort')) {
            recommendations.push(`查询步骤${index + 1}：使用文件排序，建议优化ORDER BY索引`);
          }
          if (extra.includes('Using where')) {
            recommendations.push(`查询步骤${index + 1}：使用WHERE条件过滤，索引推荐有效`);
          }
          // 添加对Using index的检查
          if (extra.includes('Using index')) {
            recommendations.push(`查询步骤${index + 1}：使用覆盖索引，查询性能良好`);
          }
        }

        // 检查possible_keys字段
        const possibleKeys = rowData.possible_keys as string;
        if (!possibleKeys || possibleKeys.length === 0) {
          recommendations.push(`查询步骤${index + 1}：没有可用的索引，建议为查询条件添加索引`);
        }
      });

      // 如果没有具体的建议，提供通用建议
      if (recommendations.length === 0) {
        recommendations.push('查询执行计划正常，建议继续监控性能表现');
      }

      // 添加标准的优化建议
      const fullTableScans = explainSimple.filter(row => {
        const rowData = row as Record<string, unknown>;
        const rowType = rowData.type;
        const rowRows = rowData.rows;
        return rowType === 'ALL' && typeof rowRows === 'number' && rowRows > 1000;
      });

      if (fullTableScans.length > 0) {
        recommendations.push('考虑为相关字段添加索引以减少全表扫描');
      }

      if (explainSimple.length > 3) { // 降低阈值到3个表
        recommendations.push('查询涉及多个表，建议检查JOIN条件和索引');
      }

      // 分析JSON格式的EXPLAIN结果（如果可用）
      if (explainJson && explainJson.length > 0) {
        const jsonAnalysis = this.analyzeJsonExplain(explainJson);
        recommendations.push(...jsonAnalysis);
      }

    } catch (error) {
      recommendations.push(`分析解释结果时出现错误: ${(error as Error).message}`);
    }

    return recommendations;
  }

  /**
   * 分析JSON格式的EXPLAIN结果
   *
   * 深入分析JSON格式的EXPLAIN输出，提供更详细的性能建议。
   * JSON格式包含更丰富的执行计划信息，如成本估算、访问类型等。
   *
   * @private
   * @param {Record<string, unknown>[]} explainJson - JSON格式的EXPLAIN结果
   * @returns {string[]} 基于JSON分析的优化建议数组
   */
  private analyzeJsonExplain(explainJson: Record<string, unknown>[]): string[] {
    const recommendations: string[] = [];

    try {
      if (!explainJson || explainJson.length === 0) {
        return recommendations;
      }

      // JSON格式的EXPLAIN通常在第一个元素的EXPLAIN字段中包含详细信息
      const explainData = explainJson[0];

      if (typeof explainData === 'object' && explainData !== null) {
        // 检查是否有EXPLAIN字段（MySQL 5.7+的JSON格式）
        const explainField = (explainData as Record<string, unknown>).EXPLAIN;
        if (explainField) {
          const jsonPlan = typeof explainField === 'string' ? JSON.parse(explainField) : explainField;

          // 分析查询块
          if (jsonPlan.query_block) {
            const queryBlock = jsonPlan.query_block;

            // 检查成本
            if (queryBlock.cost_info) {
              const cost = parseFloat(queryBlock.cost_info.query_cost || '0');
              if (cost > 1000) {
                recommendations.push(`查询成本较高 (${cost.toFixed(2)})，建议优化`);
              }
            }

            // 分析嵌套循环
            if (queryBlock.nested_loop) {
              const tables = queryBlock.nested_loop;
              if (Array.isArray(tables) && tables.length > 3) {
                recommendations.push('查询涉及多个嵌套循环，考虑优化JOIN策略');
              }
            }

            // 分析表访问
            if (queryBlock.table) {
              const table = queryBlock.table;
              if (table.access_type === 'ALL') {
                recommendations.push(`表 ${table.table_name} 使用全表扫描，建议添加索引`);
              }

              // 检查过滤效率
              if (table.filtered && parseFloat(table.filtered) < 50) {
                recommendations.push(`表 ${table.table_name} 的过滤效率低 (${table.filtered}%)，建议优化条件`);
              }
            }

            // 分析排序操作
            if (queryBlock.ordering_operation) {
              if (queryBlock.ordering_operation.using_filesort) {
                recommendations.push('查询使用文件排序，建议优化ORDER BY索引');
              }
            }

            // 分析分组操作
            if (queryBlock.grouping_operation) {
              if (queryBlock.grouping_operation.using_temporary_table) {
                recommendations.push('查询使用临时表进行分组，建议优化GROUP BY');
              }
            }
          }
        }
      }
    } catch (error) {
      logger.warn('分析JSON EXPLAIN结果时出错:', (error as Error).message);
    }

    return recommendations;
  }

  /**
   * 计算性能评分
   *
   * 基于执行计划和实际执行统计计算查询的性能评分（0-100分）。
   * 综合考虑索引使用、扫描效率、执行时间等因素，给出数字化的性能评估。
   * 评分越高表示查询性能越好。
   *
   * @private
   * @param {Record<string, unknown>[]} explainJson - JSON格式的EXPLAIN结果
   * @param {{executionTime: number}} executionStats - 执行统计信息
   * @returns {number} 性能评分（0-100），越高越好
   * @example
   * // 计算性能评分
   * const score = this.calculatePerformanceScore(explanResult, stats);
   *
   * if (score > 80) {
   *   logger.debug('查询性能优秀');
   * } else if (score > 60) {
   *   logger.debug('查询性能良好');
   * } else {
   *   logger.debug('查询性能需要优化');
   * }
   */
  private calculatePerformanceScore(explainJson: Record<string, unknown>[], executionStats: { executionTime: number }): number {
    try {
      let score = 100;

      // 如果无法获取执行统计，使用执行计划估算
      if (executionStats.executionTime === -1) {
        // 基于执行计划估算分数
        explainJson.forEach(row => {
          // 全表扫描严重减分
          if (row.table && row.access_type === 'ALL') {
            score -= 30;
          }
          // 大量扫描行数减分
          if (row.rows && typeof row.rows === 'number' && row.rows > 10000) {
            score -= 20;
          }
          // 索引扫描情况
          if (row.key) {
            score += 10;
          }
        });
      } else {
        // 基于实际执行时间打分
        // 毫秒为单位
        const execTime = executionStats.executionTime;
        if (execTime > 5000) {
          score -= 50; // 5秒以上严重减分
        } else if (execTime > 1000) {
          score -= 30; // 1秒以上减分
        } else if (execTime > 500) {
          score -= 15; // 500ms以上小幅减分
        } else if (execTime < 50) {
          score += 10; // 快查询加分
        }
      }

      return Math.max(0, Math.min(100, score));
    } catch {
      return 50; // 无法分析时返回中等分数
    }
  }
}

/**
 * 性能监控模块
 *
 * 用于持续监控MySQL数据库性能的模块，定期分析慢查询并提供实时性能反馈。
 * 支持配置监控间隔和自动告警功能，帮助及时发现和解决性能问题。
 *
 * @class PerformanceMonitoringModule
 * @example
 * // 创建性能监控模块实例
 * const monitoringModule = new PerformanceMonitoringModule(mysqlManager);
 * 
 * // 启动性能监控
 * await monitoringModule.startMonitoring({}, 30); // 每30分钟监控一次
 * 
 * // 停止性能监控
 * monitoringModule.stopMonitoring();
 */
class PerformanceMonitoringModule {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 慢查询分析模块实例
   * @private
   * @type {SlowQueryAnalysisModule}
   */
  private slowQueryAnalysis: SlowQueryAnalysisModule;

  /**
   * 监控是否激活
   * @private
   * @type {boolean}
   */
  private monitoringActive: boolean = false;

  /**
   * 监控间隔定时器
   * @private
   * @type {NodeJS.Timeout | undefined}
   */
  private monitoringInterval?: NodeJS.Timeout;

  /**
   * 构造函数 - 初始化性能监控模块
   * 
   * 创建PerformanceMonitoringModule实例，用于持续监控数据库性能。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   * @param {PerformanceAnalysisConfig} [config={}] - 性能分析配置选项
   */
  constructor(mysqlManager: MySQLManager, config: PerformanceAnalysisConfig = {}) {
    this.mysqlManager = mysqlManager;
    this.slowQueryAnalysis = new SlowQueryAnalysisModule(mysqlManager, config);
  }

  /**
   * 启动性能监控
   * 
   * 启动定期性能监控任务，按指定间隔分析慢查询并提供性能反馈。
   * 监控结果将输出到控制台，并记录性能指标供后续分析。
   *
   * @param {SlowQueryConfig} [config={}] - 慢查询配置选项
   * @param {number} [intervalMinutes=60] - 监控间隔（分钟），默认为60分钟
   * @returns {Promise<void>} 启动完成时解析的Promise
   * @throws {MySQLMCPError} 当启动监控失败时抛出错误
   * @example
   * // 启动性能监控，每30分钟分析一次
   * await monitoringModule.startMonitoring({}, 30);
   * 
   * // 启动性能监控，每小时分析一次
   * await monitoringModule.startMonitoring();
   */
  async startMonitoring(config: SlowQueryConfig = {}, intervalMinutes: number = 60): Promise<void> {
    try {
      // 启用慢查询日志
      await this.slowQueryAnalysis.enableSlowQueryLog(config);

      this.monitoringActive = true;

      // 设置定期监控
      this.monitoringInterval = setInterval(async () => {
        try {
          const analysis = await this.slowQueryAnalysis.analyzeSlowQueries(20, '1 hour');

          if (analysis.totalSlowQueries > 0) {
            logger.warn(`⚠️ [性能监控] 检测到 ${analysis.totalSlowQueries} 个慢查询`);
            logger.warn(`📊 [性能监控] 最慢查询耗时: ${analysis.slowestQuery?.executionTime.toFixed(2)}s`);

            if (analysis.indexSuggestions && analysis.indexSuggestions.length > 0) {
              logger.warn(`💡 [性能监控] 发现 ${analysis.indexSuggestions.length} 个索引优化建议`);
            }
          } else {
            logger.warn(`✅ [性能监控] 查询性能正常`);
          }
        } catch (error) {
          logger.error(`❌ [性能监控] 监控过程发生错误:`, (error as Error).message);
        }
      }, intervalMinutes * 60 * 1000);

      logger.warn(`🔍 [性能监控] 开始监控，每 ${intervalMinutes} 分钟分析一次`);
    } catch (error) {
      throw new MySQLMCPError(
        `启动性能监控失败: ${(error as Error).message}`,
        ErrorCategory.CONFIGURATION_ERROR,
        ErrorSeverity.HIGH
      );
    }
  }

  /**
   * 停止性能监控
   * 
   * 停止正在进行的性能监控任务，清理定时器资源。
   *
   * @example
   * // 停止性能监控
   * monitoringModule.stopMonitoring();
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.monitoringActive = false;
    logger.warn('⏹️ [性能监控] 性能监控已停止');
  }

  /**
   * 获取监控状态
   * 
   * 获取当前性能监控的状态信息，包括是否激活和配置参数。
   *
   * @returns {Object} 监控状态信息
   * @returns {boolean} active - 监控是否激活
   * @returns {PerformanceAnalysisConfig} config - 性能分析配置
   * @example
   * // 获取监控状态
   * const status = monitoringModule.getMonitoringStatus();
   * logger.debug(`监控状态: ${status.active ? '激活' : '未激活'}`);
   */
  getMonitoringStatus(): { active: boolean; config: PerformanceAnalysisConfig } {
    return {
      active: this.monitoringActive,
      config: this.slowQueryAnalysis['config'] || {}
    };
  }
}

/**
 * 报告生成模块
 *
 * 专门用于生成综合MySQL数据库性能报告的模块，整合慢查询分析、系统状态监测和优化建议。
 * 通过多维度数据收集和深度分析，生成结构化的性能报告帮助数据库管理员进行性能诊断
 * 和优化决策。支持灵活的报告配置和详细程度控制，满足不同场景的报告需求。
 *
 * 核心特性
 *  • 综合报告生成：整合慢查询、系统状态、优化建议等多维性能数据 
 * • 多层次分析：提供概要总结和详细分析，支持不同深度报告需求        
 *  • 时序数据整合：结合历史性能数据趋势，提供更准确的性能洞察      
 *  • 定制化输出：支持灵活的报告时间范围和内容配置                    
 *  • 可操作建议：基于数据分析生成具体的性能优化建议和下一步行动       
 *
 * @class ReportingModule
 * @example
 * // 创建报告生成模块实例
 * const reportingModule = new ReportingModule(mysqlManager, {
 *   includeDetails: true,
 *   limit: 50
 * });
 *
 * // 生成性能报告
 * const report = await reportingModule.generateReport(100, '1 week', true);
 *
 * // 报告包含的内容
 * logger.debug(`生成时间: ${report.generatedAt.toISOString()}`);
 * logger.debug(`慢查询数量: ${report.summary.slowQueriesCount}`);
 * logger.debug(`优化建议: ${report.recommendations.length} 条`);
 */
class ReportingModule {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 慢查询分析模块实例
   * @private
   * @type {SlowQueryAnalysisModule}
   */
  private slowQueryAnalysis: SlowQueryAnalysisModule;

  /**
   * 构造函数 - 初始化报告生成模块
   *
   * 创建ReportingModule实例，用于生成综合性能报告和优化建议。
   * 配置相关的子模块，确保报告生成的准确性和完整性。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   * @param {PerformanceAnalysisConfig} [config={}] - 性能分析配置选项
   */
  constructor(mysqlManager: MySQLManager, config: PerformanceAnalysisConfig = {}) {
    this.mysqlManager = mysqlManager;
    this.slowQueryAnalysis = new SlowQueryAnalysisModule(mysqlManager, config);
  }

  /**
   * 生成性能报告
   *
   * 生成综合的MySQL数据库性能报告，包含慢查询分析、系统状态检查和优化建议。
   * 整合多个数据源进行深度分析，提供结构化的性能洞察和可操作的优化建议。
   * 支持灵活的配置选项，满足不同的报告需求和详细程度。
   *
   * @param {number} [limit=50] - 分析查询的最大数量限制，用于控制报告计算量
   * @param {string} [timeRange='1 day'] - 报告分析的时间范围，采用MySQL间隔语法（'1 day', '1 week', '1 hour'等）
   * @param {boolean} [_includeDetails=true] - 是否包含详细信息（目前参数未使用，预留未来扩展）
   * @returns {Promise<PerformanceReport>} 完整的性能报告对象，包含：
   *   • generatedAt: 报告生成时间戳
   *   • summary: 报告概览统计
   *   • slowQueryAnalysis: 慢查询深度分析结果
   *   • systemStatus: 系统状态检查结果
   *   • recommendations: 综合优化建议列表
   * @throws {MySQLMCPError} 当报告生成过程中出现错误时抛出
   * @example
   * // 生成24小时性能报告
   * const dailyReport = await reportingModule.generateReport(100, '1 day');
   *
   * // 生成综合长时间性能报告
   * const weeklyReport = await reportingModule.generateReport(200, '1 week');
   *
   * // 查看报告概览
   * logger.debug(`报告生成时间: ${dailyReport.generatedAt.toISOString()}`);
   * logger.debug(`慢查询总数: ${dailyReport.summary.slowQueriesCount}`);
   * logger.debug(`优化建议数: ${dailyReport.recommendations.length}`);
   */
  async generateReport(limit: number = 50, timeRange: string = '1 day', _includeDetails: boolean = true): Promise<PerformanceReport> {
    try {
      // 获取慢查询分析
      const slowQueryAnalysis = await this.slowQueryAnalysis.analyzeSlowQueries(limit, timeRange);

      // 获取系统状态
      const systemStatus = await this.getSystemStatus();

      // 生成优化建议
      const recommendations = this.generateComprehensiveRecommendations(slowQueryAnalysis, systemStatus);

      const report: PerformanceReport = {
        generatedAt: new Date(),
        summary: {
          slowQueriesCount: slowQueryAnalysis.totalSlowQueries,
          averageExecutionTime: slowQueryAnalysis.averageExecutionTime,
          recommendationsCount: recommendations.length
        },
        slowQueryAnalysis,
        systemStatus,
        recommendations
      };

      return report;
    } catch (error) {
      throw new MySQLMCPError(
        `生成性能报告失败: ${(error as Error).message}`,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM
      );
    }
  }

  /**
   * 获取系统状态信息
   *
   * 收集MySQL数据库服务器的各类系统状态信息，包括连接池状态、版本信息和性能指标。
   * 通过查询information_schema等系统信息视图来获取实时状态数据，为性能报告提供系统级别的上下文。
   * 支持错误处理，当系统信息获取失败时返回安全的默认值。
   *
   * @private
   * @returns {Promise<{ connectionHealth: string; memoryUsage: string; activeConnections: number; system?: Record<string, unknown>; error?: string }>}
   *   系统状态信息对象，包含以下字段：
   *   • connectionHealth: 连接状态评估 ("healthy"/"warning"/"critical")
   *   • memoryUsage: 内存使用描述信息
   *   • activeConnections: 当前活跃连接数量
   *   • system?: 详细的系统信息（MySQL版本、缓冲池命中率等）
   *   • error?: 当获取失败时的错误描述
   */
  private async getSystemStatus(): Promise<{ connectionHealth: string; memoryUsage: string; activeConnections: number; system?: Record<string, unknown>; error?: string }> {
    try {
      // 获取连接信息
      const connectionQuery = "SELECT COUNT(*) as active_connections FROM information_schema.processlist WHERE COMMAND != 'Sleep'";
      const connectionResult = await this.mysqlManager.executeQuery(connectionQuery) as Array<{ active_connections: number }>;
      const activeConnections = connectionResult[0]?.active_connections || 0;

      // 获取版本信息
      const versionQuery = "SELECT VERSION() as mysql_version";
      const versionResult = await this.mysqlManager.executeQuery(versionQuery) as Array<{ mysql_version: string }>;

      return {
        connectionHealth: activeConnections < 50 ? 'healthy' : activeConnections < 100 ? 'warning' : 'critical',
        memoryUsage: '通过系统监控获取',
        activeConnections: activeConnections,
        system: {
          mysql_version: versionResult[0]?.mysql_version || 'unknown',
          query_cache_hit_rate: await this.getQueryCacheHitRate(),
          innodb_buffer_pool_hit_rate: await this.getInnodbBufferPoolHitRate()
        }
      };
    } catch {
      return {
        connectionHealth: 'unknown',
        memoryUsage: 'unknown',
        activeConnections: -1,
        error: '系统状态获取失败'
      };
    }
  }

  /**
   * 获取查询缓存命中率
   *
   * 查询MySQL的查询缓存性能统计信息，计算缓存命中率。
   * 如果查询缓存被禁用或不可用，返回0.0表示无缓存命中。
   * 命中率表示从缓存中取数据的百分比，高的命中率表明缓存工作良好。
   *
   * @private
   * @returns {Promise<string>} 查询缓存命中率，格式为"XX.X%"
   */
  private async getQueryCacheHitRate(): Promise<string> {
    try {
      // 查询缓存相关的MySQL状态变量
      const cacheStatusQuery = `
        SHOW GLOBAL STATUS WHERE Variable_name IN (
          'Qcache_queries_in_cache',
          'Qcache_hits',
          'Qcache_inserts',
          'Qcache_not_cached',
          'Qcache_lowmem_prunes'
        )
      `;
      const cacheResult = await this.mysqlManager.executeQuery(cacheStatusQuery) as Array<{ Variable_name: string; Value: string }>;

      if (!cacheResult || cacheResult.length === 0) {
        return '0.0%'; // 查询缓存不可用
      }

      // 将状态结果转换为对象
      const cacheStats: Record<string, number> = {};
      cacheResult.forEach(row => {
        cacheStats[row.Variable_name] = parseInt(row.Value) || 0;
      });

      const hits = cacheStats['Qcache_hits'] || 0;
      const inserts = cacheStats['Qcache_inserts'] || 0;
      const notCached = cacheStats['Qcache_not_cached'] || 0;

      // 计算总查询数和命中率
      const totalQueries = hits + inserts + notCached;
      if (totalQueries === 0) {
        return '0.0%';
      }

      const hitRate = (hits / totalQueries) * 100;
      return `${hitRate.toFixed(1)}%`;
    } catch (error) {
      // 查询缓存可能不可用或被禁用
      logger.warn('获取查询缓存命中率失败:', (error as Error).message);
      return 'N/A';
    }
  }

  /**
   * 获取InnoDB缓冲池命中率
   *
   * 查询InnoDB引擎的缓冲池性能统计信息，计算缓冲池页面的命中率。
   * 缓冲池命中率是MySQL性能的重要指标，高命中率表示内存使用效率良好。
   * 返回缓冲池页面的读命中率，忽略其他类型的I/O操作。
   *
   * @private
   * @returns {Promise<string>} InnoDB缓冲池命中率，格式为"XX.X%"
   */
  private async getInnodbBufferPoolHitRate(): Promise<string> {
    try {
      // 查询InnoDB相关的MySQL状态变量
      const innodbStatusQuery = `
        SHOW GLOBAL STATUS WHERE Variable_name IN (
          'Innodb_buffer_pool_reads',
          'Innodb_buffer_pool_read_requests'
        )
      `;
      const innodbResult = await this.mysqlManager.executeQuery(innodbStatusQuery) as Array<{ Variable_name: string; Value: string }>;

      if (!innodbResult || innodbResult.length === 0) {
        return 'N/A'; // InnoDB统计不可用
      }

      // 将状态结果转换为对象
      const innodbStats: Record<string, number> = {};
      innodbResult.forEach(row => {
        innodbStats[row.Variable_name] = parseInt(row.Value) || 0;
      });

      const bufferReads = innodbStats['Innodb_buffer_pool_reads'] || 0;
      const readRequests = innodbStats['Innodb_buffer_pool_read_requests'] || 0;

      // 计算缓冲池命中率
      if (readRequests === 0) {
        return '100.0%'; // 无读取请求，认为是100%命中
      }

      const hitRate = ((readRequests - bufferReads) / readRequests) * 100;
      return `${Math.max(0, hitRate).toFixed(1)}%`;
    } catch (error) {
      // InnoDB统计可能不可用
      logger.warn('获取InnoDB缓冲池命中率失败:', (error as Error).message);
      return 'N/A';
    }
  }

  /**
   * 生成综合优化建议
   *
   * 基于慢查询分析结果和系统状态信息，生成全面的性能优化建议。
   * 结合多维度数据进行智能分析，提供具体的、可操作的优化建议。
   * 建议按照优先级别组织，帮助用户系统性地解决性能问题。
   *
   * @private
   * @param {SlowQueryAnalysis} analysis - 慢查询分析结果，包含查询统计和模式分析
   * @param {Object} systemStatus - 系统状态信息，包含连接健康度和资源使用情况
   * @param {string} systemStatus.connectionHealth - 连接状态评估结果
   * @returns {string[]} 优化建议数组，按照优先级排序的字符串列表
   */
  private generateComprehensiveRecommendations(
    analysis: SlowQueryAnalysis,
    systemStatus: { connectionHealth: string }
  ): string[] {
    const recommendations: string[] = [];

    // 基于慢查询分析的建议
    if (analysis.recommendations) {
      recommendations.push(...analysis.recommendations);
    }

    // 系统级建议
    if (systemStatus.connectionHealth === 'critical') {
      recommendations.push('🔗 连接数过高，建议增加连接池大小或优化查询效率');
    }

    if (analysis.totalSlowQueries > 100) {
      recommendations.push('📊 大量慢查询发现，建议启用查询缓存或进行全面的索引优化');
    }

    if (analysis.averageExecutionTime > 5) {
      recommendations.push('⚡ 平均查询执行时间过长，建议进行服务器参数调优');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 系统性能良好，继续保持当前的优化措施');
    }

    return recommendations;
  }
}

/**
 * 统一性能管理器类 - 合并所有性能优化功能
 *
 * 企业级MySQL性能管理的核心组件，整合了慢查询分析、索引优化、查询剖析、
 * 性能监控和报告生成等五大核心功能模块。提供统一的性能优化入口和配置管理，
 * 支持多种性能优化操作的集中调度和执行。
 *
 * @class PerformanceManager
 * @example
 * // 创建性能管理器实例
 * const performanceManager = new PerformanceManager(mysqlManager);
 * 
 * // 执行慢查询分析
 * const analysis = await performanceManager.optimizePerformance('analyze_slow_queries', {
 *   limit: 50,
 *   timeRange: '1 day'
 * });
 * 
 * // 生成性能报告
 * const report = await performanceManager.optimizePerformance('performance_report', {
 *   includeDetails: true
 * });
 */
export class PerformanceManager {
  /**
   * MySQL连接管理器实例
   * @private
   * @type {MySQLManager}
   */
  private mysqlManager: MySQLManager;

  /**
   * 性能分析配置
   * @private
   * @type {PerformanceAnalysisConfig}
   */
  private config: PerformanceAnalysisConfig;

  /**
   * 慢查询分析模块实例
   * @public
   * @type {SlowQueryAnalysisModule}
   */
  public slowQueryAnalysis: SlowQueryAnalysisModule;

  /**
   * 索引优化模块实例
   * @public
   * @type {IndexOptimizationModule}
   */
  public indexOptimization: IndexOptimizationModule;

  /**
   * 查询性能剖析模块实例
   * @public
   * @type {QueryProfilingModule}
   */
  public queryProfiling: QueryProfilingModule;

  /**
   * 性能监控模块实例
   * @public
   * @type {PerformanceMonitoringModule}
   */
  public performanceMonitoring: PerformanceMonitoringModule;

  /**
   * 报告生成模块实例
   * @public
   * @type {ReportingModule}
   */
  public reporting: ReportingModule;

  /**
   * 构造函数 - 初始化性能管理器
   * 
   * 创建PerformanceManager实例并初始化所有子模块。根据提供的配置参数
   * 设置性能分析的默认值，确保所有性能优化功能都能正常工作。
   *
   * @constructor
   * @param {MySQLManager} mysqlManager - MySQL连接管理器实例
   * @param {PerformanceAnalysisConfig} [config={}] - 性能分析配置选项
   * @example
   * // 使用默认配置创建实例
   * const manager = new PerformanceManager(mysqlManager);
   * 
   * // 使用自定义配置创建实例
   * const manager = new PerformanceManager(mysqlManager, {
   *   longQueryTime: 2,
   *   limit: 50,
   *   includeDetails: true
   * });
   */
  constructor(mysqlManager: MySQLManager, config: PerformanceAnalysisConfig = {}) {
    this.mysqlManager = mysqlManager;
    this.config = {
      longQueryTime: 1,
      timeRange: 1,
      includeDetails: true,
      limit: 100,
      minExaminedRowLimit: 1000,
      enablePerformanceSchema: true,
      logQueriesNotUsingIndexes: true,
      maxLogFileSize: 100,
      logSlowAdminStatements: true,
      ...config
    };

    // 初始化子模块
    this.slowQueryAnalysis = new SlowQueryAnalysisModule(mysqlManager, this.config);
    this.indexOptimization = new IndexOptimizationModule(mysqlManager, this.config);
    this.queryProfiling = new QueryProfilingModule(mysqlManager);
    this.performanceMonitoring = new PerformanceMonitoringModule(mysqlManager, this.config);
    this.reporting = new ReportingModule(mysqlManager, this.config);
  }

  /**
   * 配置慢查询日志
   * 
   * 启用MySQL慢查询日志功能，设置慢查询阈值和其他相关参数。
   * 该功能用于捕获执行时间超过指定阈值的SQL查询，便于后续分析和优化。
   *
   * @param {number} [longQueryTime=1] - 慢查询时间阈值（秒），默认为1秒
   * @returns {Promise<void>} 配置完成时解析的Promise
   * @throws {MySQLMCPError} 当配置失败时抛出错误
   * @example
   * // 启用慢查询日志，阈值为2秒
   * await performanceManager.configureSlowQueryLog(2);
   */
  async configureSlowQueryLog(longQueryTime: number = 1): Promise<void> {
    try {
      const settings = [
        'SET GLOBAL slow_query_log = "ON"',
        `SET GLOBAL long_query_time = ${longQueryTime}`,
        'SET GLOBAL log_queries_not_using_indexes = "ON"',
        'SET GLOBAL log_slow_admin_statements = "ON"'
      ];

      for (const setting of settings) {
        await this.mysqlManager.executeQuery(setting);
      }

      logger.warn(`✅ 慢查询日志已配置，阈值: ${longQueryTime}秒`);
    } catch (error) {
      throw new MySQLMCPError(
        `配置慢查询日志失败: ${(error as Error).message}`,
        ErrorCategory.CONFIGURATION_ERROR,
        ErrorSeverity.HIGH
      );
    }
  }

  /**
   * 获取慢查询日志配置
   * 
   * 获取当前MySQL服务器的慢查询日志配置信息，包括是否启用、阈值设置等。
   *
   * @returns {Promise<Record<string, unknown>>} 包含慢查询日志配置信息的对象
   * @throws {MySQLMCPError} 当获取配置失败时抛出错误
   * @example
   * // 获取慢查询日志配置
   * const config = await performanceManager.getSlowQueryLogConfig();
   * logger.debug(config.enabled, config.threshold);
   */
  async getSlowQueryLogConfig(): Promise<Record<string, unknown>> {
    try {
      const queries = [
        'SELECT @@slow_query_log as enabled',
        'SELECT @@long_query_time as threshold',
        'SELECT @@slow_query_log_file as log_file',
        'SELECT @@log_queries_not_using_indexes as log_no_index'
      ];

      const config: Record<string, unknown> = {};

      for (const query of queries) {
        const result = await this.mysqlManager.executeQuery(query) as Record<string, unknown>[];
        Object.assign(config, result[0]);
      }

      return config;
    } catch (error) {
      throw new MySQLMCPError(
        `获取慢查询日志配置失败: ${(error as Error).message}`,
        ErrorCategory.DATA_ERROR,
        ErrorSeverity.LOW
      );
    }
  }

  /**
   * 禁用慢查询日志
   * 
   * 关闭MySQL慢查询日志功能，停止记录慢查询信息。
   *
   * @returns {Promise<void>} 禁用完成时解析的Promise
   * @throws {MySQLMCPError} 当禁用失败时抛出错误
   * @example
   * // 禁用慢查询日志
   * await performanceManager.disableSlowQueryLog();
   */
  async disableSlowQueryLog(): Promise<void> {
    try {
      await this.mysqlManager.executeQuery('SET GLOBAL slow_query_log = "OFF"');
      logger.warn('⏹️ 慢查询日志已禁用');
    } catch (error) {
      throw new MySQLMCPError(
        `禁用慢查询日志失败: ${(error as Error).message}`,
        ErrorCategory.CONFIGURATION_ERROR,
        ErrorSeverity.LOW
      );
    }
  }

  /**
   * 统一性能优化入口方法
   * 
   * 性能管理器的核心方法，根据指定的操作类型调用相应的子模块方法执行具体功能。
   * 支持多种性能优化操作，包括慢查询分析、索引建议、性能报告生成等。
   *
   * @param {string} action - 要执行的性能优化操作类型
   * @param {Object} [options={}] - 操作选项参数
   * @param {number} [options.limit] - 限制返回结果的数量
   * @param {boolean} [options.includeDetails] - 是否包含详细信息
   * @param {string} [options.timeRange] - 分析时间范围
   * @param {string} [options.query] - 要剖析的SQL查询（仅用于query_profiling）
   * @param {Record<string, unknown>[]} [options.params] - 查询参数（仅用于query_profiling）
   * @param {number} [options.longQueryTime] - 慢查询时间阈值
   * @param {boolean} [options.logQueriesNotUsingIndexes] - 是否记录未使用索引的查询
   * @param {number} [options.monitoringIntervalMinutes] - 监控间隔（分钟）
   * @returns {Promise<unknown>} 操作结果，根据操作类型返回不同结构的数据
   * @throws {MySQLMCPError} 当操作失败时抛出错误
   * @example
   * // 分析慢查询
   * const analysis = await performanceManager.optimizePerformance('analyze_slow_queries', {
   *   limit: 20,
   *   timeRange: '1 hour'
   * });
   * 
   * // 生成索引建议
   * const suggestions = await performanceManager.optimizePerformance('suggest_indexes', {
   *   limit: 10,
   *   timeRange: '1 day'
   * });
   * 
   * // 启用慢查询日志
   * await performanceManager.optimizePerformance('enable_slow_query_log', {
   *   longQueryTime: 2
   * });
   */
  async optimizePerformance(
    action: string,
    options: {
      limit?: number;
      includeDetails?: boolean;
      timeRange?: string;
      query?: string;
      params?: Record<string, unknown>[];
      longQueryTime?: number;
      logQueriesNotUsingIndexes?: boolean;
      monitoringIntervalMinutes?: number;
    } = {}
  ): Promise<unknown> {
    try {
      switch (action) {
        case 'analyze_slow_queries':
          return await this.slowQueryAnalysis.analyzeSlowQueries(
            options.limit || 100,
            options.timeRange || '1 day'
          );

        case 'suggest_indexes':
          return await this.indexOptimization.generateIndexSuggestions(
            options.limit || 50,
            options.timeRange || '1 day'
          );

        case 'performance_report':
          return await this.reporting.generateReport(
            options.limit || 50,
            options.timeRange || '1 day',
            options.includeDetails ?? true
          );

        case 'query_profiling':
          if (!options.query) {
            throw new Error('query_profiling操作必须提供query参数');
          }
          return await this.queryProfiling.profileQuery(
            options.query,
            options.params
          );

        case 'start_monitoring':
          return await this.performanceMonitoring.startMonitoring({
            longQueryTime: options.longQueryTime,
            logQueriesNotUsingIndexes: options.logQueriesNotUsingIndexes
          }, options.monitoringIntervalMinutes);

        case 'stop_monitoring':
          this.performanceMonitoring.stopMonitoring();
          return { message: '性能监控已停止' };

        case 'enable_slow_query_log':
          return await this.configureSlowQueryLog(options.longQueryTime);

        case 'disable_slow_query_log':
          return await this.disableSlowQueryLog();

        case 'get_active_slow_queries':
          return await this.slowQueryAnalysis.getActiveSlowQueries();

        case 'get_config':
          return await this.getSlowQueryLogConfig();

        default:
          throw new MySQLMCPError(
            `未知的性能优化操作: ${action}`,
            ErrorCategory.INVALID_INPUT,
            ErrorSeverity.MEDIUM
          );
      }
    } catch (error) {
      throw new MySQLMCPError(
        `性能优化操作失败: ${(error as Error).message}`,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM
      );
    }
  }
}