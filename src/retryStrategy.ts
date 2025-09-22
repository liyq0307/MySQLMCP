/**
 * 智能重试策略系统 - 企业级错误恢复机制
 *
 * 基于FastMCP框架的高性能、智能重试策略管理系统，集成了完整的错误分类和恢复功能栈。
 * 为Model Context Protocol (MCP)提供安全、可靠、高效的数据库操作重试服务，
 * 支持企业级应用的所有重试需求。
 *
 * @fileoverview 智能重试策略系统 - 企业级错误恢复解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import {
  ErrorCategory,
  ErrorSeverity,
  MySQLMCPError,
  ErrorContext
} from './types.js';

/**
 * 重试策略配置
 */
export interface RetryStrategy {
  /** 最大重试次数（包括首次尝试） */
  maxAttempts: number;
  /** 基础延迟时间（毫秒） */
  baseDelay: number;
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  /** 退避乘数（每次重试延迟增加的倍数） */
  backoffMultiplier: number;
  /** 是否启用抖动（随机延迟） */
  jitter: boolean;
  /** 可重试的错误类型列表 */
  retryableErrors?: string[];
  /** 不可重试的错误类型列表 */
  nonRetryableErrors?: string[];
  /** 自定义重试条件函数 */
  condition?: (error: Error, attempt: number) => boolean;
}

/**
 * 重试结果
 */
export interface RetryResult<T> {
  /** 是否最终成功 */
  success: boolean;
  /** 实际尝试次数 */
  attempts: number;
  /** 总延迟时间（毫秒） */
  totalDelay: number;
  /** 最终成功结果 */
  finalResult?: T;
  /** 最后一次错误 */
  lastError?: Error;
  /** 重试历史记录 */
  retryHistory: Array<{
    /** 尝试次数 */
    attempt: number;
    /** 该次尝试的错误 */
    error?: Error;
    /** 该次尝试前的延迟时间（毫秒） */
    delay: number;
    /** 该次尝试的时间戳 */
    timestamp: number;
  }>;
}

/**
 * 重试统计信息
 */
export interface RetryStats {
  /** 总操作次数 */
  totalOperations: number;
  /** 成功操作次数 */
  successfulOperations: number;
  /** 失败操作次数 */
  failedOperations: number;
  /** 总重试次数 */
  totalRetries: number;
  /** 平均尝试次数 */
  averageAttempts: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 总延迟时间（毫秒） */
  totalDelay: number;
  /** 平均延迟时间（毫秒） */
  averageDelay: number;
  /** 错误类型分布 */
  errorDistribution: Record<string, number>;
}

/**
 * 重试上下文
 */
export interface RetryContext extends ErrorContext {
  /** 当前尝试次数 */
  attempt: number;
  /** 剩余尝试次数 */
  remainingAttempts: number;
  /** 当前延迟时间（毫秒） */
  delay: number;
  /** 操作ID（用于跟踪） */
  operationId?: string;
}

/**
 * 智能重试策略管理器
 *
 * 提供基于错误分类和严重级别的智能重试机制，支持多种重试策略
 * 和自定义条件判断。
 *
 * @class SmartRetryStrategy
 * @since 1.0.0
 */
export class SmartRetryStrategy {
  /**
   * 默认重试策略配置
   */
  private static readonly DEFAULT_STRATEGY: RetryStrategy = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryableErrors: [
      ErrorCategory.CONNECTION_ERROR,
      ErrorCategory.TIMEOUT_ERROR,
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.DATABASE_UNAVAILABLE,
      ErrorCategory.RESOURCE_EXHAUSTED,
      ErrorCategory.RATE_LIMIT_ERROR,
      ErrorCategory.DEADLOCK_ERROR,
      ErrorCategory.LOCK_WAIT_TIMEOUT,
      ErrorCategory.SERVER_GONE_ERROR,
      ErrorCategory.SERVER_LOST_ERROR,
      ErrorCategory.SSL_ERROR,
      ErrorCategory.PERFORMANCE_DEGRADATION,
      ErrorCategory.CONCURRENT_ACCESS_ERROR,
      ErrorCategory.THROTTLED,
      ErrorCategory.DEGRADED_SERVICE,
      ErrorCategory.EXTERNAL_SERVICE_ERROR,
      ErrorCategory.DEPENDENCY_ERROR,
      ErrorCategory.PARTIAL_FAILURE
    ],
    nonRetryableErrors: [
      ErrorCategory.ACCESS_DENIED,
      ErrorCategory.SECURITY_VIOLATION,
      ErrorCategory.SYNTAX_ERROR,
      ErrorCategory.OBJECT_NOT_FOUND,
      ErrorCategory.CONSTRAINT_VIOLATION,
      ErrorCategory.DATA_INTEGRITY_ERROR,
      ErrorCategory.CONFIGURATION_ERROR,
      ErrorCategory.QUERY_INTERRUPTED,
      ErrorCategory.AUTHENTICATION_ERROR,
      ErrorCategory.AUTHORIZATION_ERROR,
      ErrorCategory.VALIDATION_ERROR,
      ErrorCategory.BUSINESS_LOGIC_ERROR,
      // 注意：FATAL 是严重级别，不是错误类别
      ErrorCategory.MEMORY_LEAK,
      ErrorCategory.VERSION_MISMATCH,
      ErrorCategory.CERTIFICATE_ERROR,
      ErrorCategory.TOKEN_EXPIRED,
      ErrorCategory.SESSION_EXPIRED,
      ErrorCategory.MAINTENANCE_MODE,
      ErrorCategory.QUOTA_EXCEEDED,
      ErrorCategory.RETRY_EXHAUSTED,
      ErrorCategory.CIRCUIT_BREAKER_ERROR,
      ErrorCategory.CASCADING_FAILURE
    ]
  };

  /**
   * 基于严重级别的重试策略映射
   */
  private static readonly SEVERITY_BASED_STRATEGIES: Record<ErrorSeverity, Partial<RetryStrategy>> = {
    [ErrorSeverity.INFO]: {
      maxAttempts: 2,
      baseDelay: 500,
      maxDelay: 5000
    },
    [ErrorSeverity.LOW]: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000
    },
    [ErrorSeverity.MEDIUM]: {
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 20000
    },
    [ErrorSeverity.HIGH]: {
      maxAttempts: 3,
      baseDelay: 3000,
      maxDelay: 30000
    },
    [ErrorSeverity.CRITICAL]: {
      maxAttempts: 2,
      baseDelay: 5000,
      maxDelay: 60000
    },
    [ErrorSeverity.FATAL]: {
      maxAttempts: 0,
      baseDelay: 0,
      maxDelay: 0
    }
  };

  /**
   * 重试统计
   */
  private static retryStats: Map<string, {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    averageRetryTime: number;
    lastRetryTime: Date;
  }> = new Map();

  /**
   * 执行带重试的操作
   *
   * @public
   * @static
   * @template T
   * @param {() => Promise<T>} operation - 要执行的操作
   * @param {Partial<RetryStrategy>} [customStrategy] - 自定义重试策略
   * @param {ErrorContext} [context] - 错误上下文
   * @returns {Promise<RetryResult>} 重试结果
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    customStrategy?: Partial<RetryStrategy>,
    context?: ErrorContext
  ): Promise<RetryResult<T>> {
    const strategy = this.mergeStrategy(customStrategy);
    const operationId = context?.operation || 'anonymous';
    let attempts = 0;
    let totalDelay = 0;
    let lastError: MySQLMCPError | undefined;
    const retryHistory: Array<{
      attempt: number;
      error?: Error;
      delay: number;
      timestamp: number;
    }> = [];

    // 初始化统计
    this.initRetryStats(operationId);

    while (attempts < strategy.maxAttempts) {
      attempts++;
      const attemptStartTime = Date.now();

      try {
        const result = await operation();

        // 添加成功尝试到重试历史
        retryHistory.push({
          attempt: attempts,
          error: undefined,
          delay: attempts > 1 ? this.calculateDelay(attempts, strategy) : 0,
          timestamp: Date.now()
        });

        // 记录成功重试
        if (attempts > 1) {
          this.updateRetryStats(operationId, true, Date.now() - attemptStartTime);
        }

        return {
          success: true,
          attempts,
          totalDelay,
          finalResult: result,
          retryHistory
        };
      } catch (error) {
        const classifiedError = error instanceof MySQLMCPError 
          ? error 
          : new MySQLMCPError(
              String(error),
              ErrorCategory.UNKNOWN,
              ErrorSeverity.MEDIUM
            );

        lastError = classifiedError;

        // 添加到重试历史
        retryHistory.push({
          attempt: attempts,
          error: classifiedError,
          delay: 0,
          timestamp: Date.now()
        });

        // 检查是否应该重试
        if (!this.shouldRetry(classifiedError, attempts, strategy)) {
          this.updateRetryStats(operationId, false, Date.now() - attemptStartTime);
          break;
        }

        // 如果不是最后一次尝试，计算延迟并等待
        if (attempts < strategy.maxAttempts) {
          const delay = this.calculateDelay(attempts, strategy);
          totalDelay += delay;
          
          // 更新历史记录中的延迟
          retryHistory[retryHistory.length - 1].delay = delay;
          
          // 记录重试尝试
          this.logRetryAttempt(operationId, attempts, classifiedError, delay, context);
          
          await this.sleep(delay);
        }
      }
    }

    // 添加最后失败的尝试到重试历史
    retryHistory.push({
      attempt: attempts,
      error: lastError,
      delay: attempts > 1 ? this.calculateDelay(attempts, strategy) : 0,
      timestamp: Date.now()
    });

    // 记录失败重试
    this.updateRetryStats(operationId, false, 0);

    return {
      success: false,
      attempts,
      lastError,
      totalDelay,
      retryHistory
    };
  }

  /**
   * 创建分类特定的重试策略
   *
   * @public
   * @static
   * @param {ErrorCategory[]} retryableCategories - 可重试的错误类别
   * @param {ErrorCategory[]} nonRetryableCategories - 不可重试的错误类别
   * @param {Partial<RetryStrategy>} [baseConfig] - 基础配置
   * @returns {RetryStrategy} 定制的重试策略
   */
  public static createCategorySpecificStrategy(
    retryableCategories: ErrorCategory[],
    nonRetryableCategories: ErrorCategory[],
    baseConfig?: Partial<RetryStrategy>
  ): RetryStrategy {
    return {
      ...this.DEFAULT_STRATEGY,
      ...baseConfig,
      retryableErrors: retryableCategories,
      nonRetryableErrors: nonRetryableCategories
    };
  }

  /**
   * 创建严重级别特定的重试策略
   *
   * @public
   * @static
   * @param {ErrorSeverity} severity - 错误严重级别
   * @param {Partial<RetryStrategy>} [customConfig] - 自定义配置
   * @returns {RetryStrategy} 定制的重试策略
   */
  public static createSeveritySpecificStrategy(
    severity: ErrorSeverity,
    customConfig?: Partial<RetryStrategy>
  ): RetryStrategy {
    const severityStrategy = this.SEVERITY_BASED_STRATEGIES[severity] || {};
    return {
      ...this.DEFAULT_STRATEGY,
      ...severityStrategy,
      ...customConfig
    };
  }

  /**
   * 获取重试统计信息
   *
   * @public
   * @static
   * @param {string} [operationId] - 操作ID，如果未提供则返回所有统计
   * @returns {Record<string, unknown>} 重试统计信息
   */
  public static getRetryStats(operationId?: string): Record<string, unknown> {
    if (operationId) {
      return this.retryStats.get(operationId) || {};
    }

    const allStats: Record<string, unknown> = {};
    this.retryStats.forEach((stats, id) => {
      allStats[id] = stats;
    });
    return allStats;
  }

  /**
   * 重置重试统计
   *
   * @public
   * @static
   * @param {string} [operationId] - 操作ID，如果未提供则重置所有统计
   */
  public static resetRetryStats(operationId?: string): void {
    if (operationId) {
      this.retryStats.delete(operationId);
    } else {
      this.retryStats.clear();
    }
  }

  /**
   * 合并策略配置
   *
   * @private
   * @static
   * @param {Partial<RetryStrategy>} [customStrategy] - 自定义策略
   * @returns {RetryStrategy} 合并后的策略
   */
  private static mergeStrategy(customStrategy?: Partial<RetryStrategy>): RetryStrategy {
    return {
      ...this.DEFAULT_STRATEGY,
      ...customStrategy
    };
  }

  /**
   * 判断是否应该重试
   *
   * @private
   * @static
   * @param {MySQLMCPError} error - 错误对象
   * @param {number} attempt - 当前尝试次数
   * @param {RetryStrategy} strategy - 重试策略
   * @returns {boolean} 是否应该重试
   */
  private static shouldRetry(
    error: MySQLMCPError, 
    attempt: number, 
    strategy: RetryStrategy
  ): boolean {
    // 检查是否超过最大尝试次数
    if (attempt >= strategy.maxAttempts) {
      return false;
    }

    // 检查错误严重级别
    if (error.severity === ErrorSeverity.FATAL) {
      return false;
    }

    // 检查不可重试的错误类别
    if (strategy.nonRetryableErrors?.includes(error.category)) {
      return false;
    }

    // 检查可重试的错误类别
    if (strategy.retryableErrors?.includes(error.category)) {
      // 检查自定义条件
      if (strategy.condition) {
        return strategy.condition(error, attempt);
      }
      return true;
    }

    // 默认不重试
    return false;
  }

  /**
   * 计算重试延迟
   *
   * @private
   * @static
   * @param {number} attempt - 当前尝试次数
   * @param {RetryStrategy} strategy - 重试策略
   * @returns {number} 延迟时间（毫秒）
   */
  private static calculateDelay(attempt: number, strategy: RetryStrategy): number {
    const exponentialDelay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
    const delay = Math.min(exponentialDelay, strategy.maxDelay);
    
    // 添加抖动以避免 thundering herd 问题
    if (strategy.jitter) {
      const jitterAmount = delay * 0.1; // 10% 抖动
      return delay + (Math.random() * 2 - 1) * jitterAmount;
    }
    
    return Math.max(delay, 0);
  }

  /**
   * 睡眠函数
   *
   * @private
   * @static
   * @param {number} ms - 睡眠时间（毫秒）
   * @returns {Promise<void>}
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 初始化重试统计
   *
   * @private
   * @static
   * @param {string} operationId - 操作ID
   */
  private static initRetryStats(operationId: string): void {
    if (!this.retryStats.has(operationId)) {
      this.retryStats.set(operationId, {
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        averageRetryTime: 0,
        lastRetryTime: new Date()
      });
    }
  }

  /**
   * 更新重试统计
   *
   * @private
   * @static
   * @param {string} operationId - 操作ID
   * @param {boolean} success - 是否成功
   * @param {number} duration - 重试持续时间
   */
  private static updateRetryStats(operationId: string, success: boolean, duration: number): void {
    const stats = this.retryStats.get(operationId);
    if (!stats) return;

    stats.totalAttempts++;
    if (success) {
      stats.successfulRetries++;
    } else {
      stats.failedRetries++;
    }

    // 计算平均重试时间
    if (duration > 0) {
      stats.averageRetryTime = (stats.averageRetryTime * (stats.totalAttempts - 1) + duration) / stats.totalAttempts;
    }

    stats.lastRetryTime = new Date();
  }

  /**
   * 记录重试尝试日志
   *
   * @private
   * @static
   * @param {string} operationId - 操作ID
   * @param {number} attempt - 尝试次数
   * @param {MySQLMCPError} error - 错误对象
   * @param {number} delay - 延迟时间
   * @param {ErrorContext} [context] - 错误上下文
   */
  private static logRetryAttempt(
    operationId: string, 
    attempt: number, 
    error: MySQLMCPError, 
    delay: number, 
    context?: ErrorContext
  ): void {
    // 这里可以集成结构化日志系统
    const logMessage = `重试尝试 [${operationId}] - 第${attempt}次尝试: ${error.message}，等待${delay}ms`;
    
    if (context) {
      console.warn(`[重试] ${logMessage}`, {
        operation: context.operation,
        category: error.category,
        severity: error.severity,
        delay,
        attempt,
        timestamp: new Date().toISOString()
      });
    } else {
      console.warn(`[重试] ${logMessage}`);
    }
  }
}