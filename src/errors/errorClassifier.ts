/**
 * MySQL 错误分类器
 *
 * 根据MySQL错误代码和消息内容智能分类错误，提供错误严重性评估、
 * 恢复建议和详细的上下文信息。
 *
 * @fileoverview MySQL错误智能分类系统
 * @author liyq
 * @since 1.0.0
 */

import { ErrorCategory, ErrorSeverity, MySQLMCPError } from '../types.js';
import { logger } from '../logger.js';
import {
  ERROR_CODE_MAPPING,
  SEVERITY_MAPPING,
  CATEGORY_PREFIX_MAPPING,
  RECOVERY_SUGGESTIONS,
  POSSIBLE_CAUSES,
  PREVENTION_TIPS
} from './errorConfig.js';

/**
 * MySQL 错误分类器
 *
 * 根据MySQL错误代码和消息内容智能分类错误，提供错误严重性评估、
 * 恢复建议和详细的上下文信息。
 *
 * @class MySQLErrorClassifier
 * @since 1.0.0
 */
export class MySQLErrorClassifier {
  /**
   * 分类MySQL错误
   *
   * 根据错误代码和消息内容智能分类错误，返回结构化的错误信息。
   *
   * @public
   * @static
   * @param {unknown} error - 原始错误对象
   * @param {string} [context] - 错误发生的上下文信息
   * @returns {MySQLMCPError} 分类后的结构化错误
   */
  public static classifyError(error: unknown, context?: string): MySQLMCPError {
    // 提取基本错误信息
    const message = this.extractErrorMessage(error);
    const code = this.extractErrorCode(error);
    
    // 分类错误
    const category = this.categorizeError(code, message);
    const severity = SEVERITY_MAPPING[category];
    
    // 创建结构化错误
    const classifiedError = new MySQLMCPError(
      this.buildEnhancedMessage(message, category, context),
      category,
      severity,
      undefined, // context should be ErrorContext, not number
      error instanceof Error ? error : undefined
    );

    // 记录错误日志
    this.logError(classifiedError, context);

    return classifiedError;
  }

  /**
   * 获取错误恢复建议
   *
   * @public
   * @static
   * @param {ErrorCategory} category - 错误类别
   * @returns {string[]} 恢复建议列表
   */
  public static getRecoverySuggestions(category: ErrorCategory): string[] {
    return RECOVERY_SUGGESTIONS[category] || RECOVERY_SUGGESTIONS[ErrorCategory.UNKNOWN];
  }

  /**
   * 生成错误诊断报告
   *
   * @public
   * @static
   * @param {MySQLMCPError} error - 分类后的错误
   * @returns {object} 错误诊断报告
   */
  public static generateDiagnosticReport(error: MySQLMCPError): {
    error: {
      message: string;
      category: ErrorCategory;
      severity: ErrorSeverity;
      code?: number;
      timestamp: Date;
    };
    diagnosis: {
      possibleCauses: string[];
      recoverySuggestions: string[];
      preventionTips: string[];
    };
  } {
    return {
      error: {
        message: error.message,
        category: error.category,
        severity: error.severity,
        code: error.code,
        timestamp: error.timestamp
      },
      diagnosis: {
        possibleCauses: POSSIBLE_CAUSES[error.category] || [],
        recoverySuggestions: this.getRecoverySuggestions(error.category),
        preventionTips: PREVENTION_TIPS[error.category] || []
      }
    };
  }

  /**
   * 记录错误日志
   *
   * @private
   * @static
   * @param {MySQLMCPError} error - 错误对象
   * @param {string} [context] - 上下文信息
   */
  private static logError(error: MySQLMCPError, context?: string): void {
    const logLevel = this.getLogLevel(error.severity);
    const metadata = {
      category: error.category,
      severity: error.severity,
      code: error.code,
      context,
      timestamp: error.timestamp.toISOString()
    };

    if (logLevel === 'fatal') {
      logger.fatal(error.message, 'database_error', error, metadata);
    } else if (logLevel === 'error') {
      logger.error(error.message, 'database_error', error, metadata);
    } else if (logLevel === 'warn') {
      logger.warn(error.message, 'database_warning', metadata);
    } else {
      logger.info(error.message, 'database_info', metadata);
    }
  }

  /**
   * 根据严重级别获取日志级别
   *
   * @private
   * @static
   * @param {ErrorSeverity} severity - 错误严重级别
   * @returns {string} 日志级别
   */
  private static getLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.FATAL:
        return 'fatal';
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
      case ErrorSeverity.INFO:
        return 'info';
      default:
        return 'info';
    }
  }

  /**
   * 提取错误消息
   *
   * @private
   * @static
   * @param {unknown} error - 原始错误对象
   * @returns {string} 错误消息
   */
  private static extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return '未知错误';
  }

  /**
   * 提取错误代码
   *
   * @private
   * @static
   * @param {unknown} error - 原始错误对象
   * @returns {number | undefined} 错误代码
   */
  private static extractErrorCode(error: unknown): number | undefined {
    if (error && typeof error === 'object') {
      const errorObj = error as Record<string, unknown>;
      if ('code' in errorObj && typeof errorObj.code === 'number') {
        return errorObj.code;
      }
      if ('errno' in errorObj && typeof errorObj.errno === 'number') {
        return errorObj.errno;
      }
    }
    return undefined;
  }

  /**
   * 分类错误
   *
   * @private
   * @static
   * @param {number | undefined} code - 错误代码
   * @param {string} message - 错误消息
   * @returns {ErrorCategory} 错误类别
   */
  private static categorizeError(code: number | undefined, message: string): ErrorCategory {
    // 首先尝试通过错误代码分类
    if (code && ERROR_CODE_MAPPING[code]) {
      return ERROR_CODE_MAPPING[code];
    }

    // 通过消息内容分类
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('access denied') || lowerMessage.includes('permission')) {
      return ErrorCategory.ACCESS_DENIED;
    }
    if (lowerMessage.includes("doesn't exist") || lowerMessage.includes('unknown')) {
      return ErrorCategory.OBJECT_NOT_FOUND;
    }
    if (lowerMessage.includes('duplicate') || lowerMessage.includes('constraint')) {
      return ErrorCategory.CONSTRAINT_VIOLATION;
    }
    if (lowerMessage.includes('syntax') || lowerMessage.includes('parse')) {
      return ErrorCategory.SYNTAX_ERROR;
    }
    if (lowerMessage.includes('connect') || lowerMessage.includes('connection')) {
      return ErrorCategory.CONNECTION_ERROR;
    }
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many')) {
      return ErrorCategory.RATE_LIMIT_ERROR;
    }
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return ErrorCategory.TIMEOUT_ERROR;
    }
    if (lowerMessage.includes('transaction') || lowerMessage.includes('deadlock')) {
      return ErrorCategory.TRANSACTION_ERROR;
    }
    if (lowerMessage.includes('resource') || lowerMessage.includes('exhausted') || lowerMessage.includes('out of memory')) {
      return ErrorCategory.RESOURCE_EXHAUSTED;
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('socket')) {
      return ErrorCategory.NETWORK_ERROR;
    }
    if (lowerMessage.includes('unavailable') || lowerMessage.includes('not running')) {
      return ErrorCategory.DATABASE_UNAVAILABLE;
    }
    if (lowerMessage.includes('integrity') || lowerMessage.includes('checksum')) {
      return ErrorCategory.DATA_INTEGRITY_ERROR;
    }
    if (lowerMessage.includes('config') || lowerMessage.includes('invalid configuration')) {
      return ErrorCategory.CONFIGURATION_ERROR;
    }
    if (lowerMessage.includes('deadlock')) {
      return ErrorCategory.DEADLOCK_ERROR;
    }
    if (lowerMessage.includes('lock wait timeout')) {
      return ErrorCategory.LOCK_WAIT_TIMEOUT;
    }
    if (lowerMessage.includes('query execution was interrupted')) {
      return ErrorCategory.QUERY_INTERRUPTED;
    }
    if (lowerMessage.includes('server has gone away')) {
      return ErrorCategory.SERVER_GONE_ERROR;
    }
    if (lowerMessage.includes('lost connection') && !lowerMessage.includes('mysql server')) {
      return ErrorCategory.SERVER_LOST_ERROR;
    }
    if (lowerMessage.includes('ssl')) {
      return ErrorCategory.SSL_ERROR;
    }
    
    // 备份相关错误检测
    if (lowerMessage.includes('backup') || lowerMessage.includes('dump') || lowerMessage.includes('mysqldump')) {
      return ErrorCategory.BACKUP_ERROR;
    }
    
    // 导出相关错误检测
    if (lowerMessage.includes('export') || lowerMessage.includes('csv') || lowerMessage.includes('excel') || lowerMessage.includes('json')) {
      return ErrorCategory.DATA_EXPORT_ERROR;
    }
    
    // 报表相关错误检测
    if (lowerMessage.includes('report') || lowerMessage.includes('generate') || lowerMessage.includes('template')) {
      return ErrorCategory.REPORT_GENERATION_ERROR;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * 构建增强错误消息
   *
   * @private
   * @static
   * @param {string} originalMessage - 原始错误消息
   * @param {ErrorCategory} category - 错误类别
   * @param {string} [context] - 上下文信息
   * @returns {string} 增强后的错误消息
   */
  private static buildEnhancedMessage(
    originalMessage: string, 
    category: ErrorCategory, 
    context?: string
  ): string {
    const categoryPrefix = CATEGORY_PREFIX_MAPPING[category];
    const contextSuffix = context ? ` (上下文: ${context})` : '';
    return `${categoryPrefix} ${originalMessage}${contextSuffix}`;
  }
}