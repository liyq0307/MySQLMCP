/**
 * 安全日志记录器
 *
 * 专门用于记录安全相关事件的日志记录器，包括SQL注入尝试、
 * 访问违规、认证失败、权限拒绝等安全事件的记录和查询。
 *
 * @fileoverview 安全事件日志记录器实现
 * @author liyq
 * @since 1.0.0
 */

import { ErrorSeverity } from '../types.js';
import { IdUtils } from '../utils/common.js';

/**
 * 安全事件类型枚举
 */
export enum SecurityEventType {
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  ACCESS_VIOLATION = 'access_violation',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DATA_ENCRYPTION_ERROR = 'data_encryption_error',
  PERMISSION_DENIED = 'permission_denied',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SYSTEM_COMPROMISE = 'system_compromise'
}

/**
 * 安全日志条目接口
 */
export interface SecurityLogEntry {
  id: string;
  timestamp: Date;
  eventType: SecurityEventType;
  severity: ErrorSeverity;
  sourceIp?: string;
  userId?: string;
  sessionId?: string;
  message: string;
  details?: Record<string, unknown>;
  stackTrace?: string;
}

/**
 * 安全日志记录器类
 *
 * 专门用于记录和管理安全相关事件的日志记录器。
 * 提供安全事件的记录、查询和过滤功能。
 *
 * 主要功能：
 * - 记录各种安全事件（SQL注入、访问违规、认证失败等）
 * - 提供基于事件类型的日志过滤
 * - 维护固定大小的日志缓冲区
 * - 自动输出到控制台
 * - 支持详细的事件上下文信息
 *
 * @class SecurityLogger
 * @since 1.0.0
 */
export class SecurityLogger {
  private logs: SecurityLogEntry[] = [];
  private maxLogSize: number;

  /**
   * 安全日志记录器构造函数
   * @param maxLogSize - 日志缓冲区最大大小，默认1000条
   */
  constructor(maxLogSize: number = 1000) {
    this.maxLogSize = maxLogSize;
  }

  /**
   * 记录安全事件
   * 
   * 通用的安全事件记录方法，支持丰富的上下文信息。
   *
   * @public
   * @param eventType - 安全事件类型
   * @param severity - 事件严重性级别
   * @param message - 事件描述消息
   * @param options - 可选的附加信息
   */
  public logSecurityEvent(
    eventType: SecurityEventType,
    severity: ErrorSeverity,
    message: string,
    options?: {
      sourceIp?: string;
      userId?: string;
      sessionId?: string;
      details?: Record<string, unknown>;
      error?: Error;
    }
  ): void {
    const logEntry: SecurityLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      eventType,
      severity,
      message,
      sourceIp: options?.sourceIp,
      userId: options?.userId,
      sessionId: options?.sessionId,
      details: options?.details,
      stackTrace: options?.error?.stack
    };

    // 添加到日志缓冲区
    this.logs.push(logEntry);

    // 维持缓冲区大小限制
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }

    // 输出到控制台
    this.outputToConsole(logEntry);
  }

  /**
   * 记录SQL注入尝试
   *
   * 专门记录SQL注入攻击尝试的便捷方法。
   *
   * @public
   * @param query - 尝试注入的查询语句
   * @param patterns - 检测到的危险模式
   * @param sourceIp - 攻击来源IP地址
   * @param userId - 尝试攻击的用户ID（如果已认证）
   */
  public logSqlInjectionAttempt(
    query: string,
    patterns: string[],
    sourceIp?: string,
    userId?: string
  ): void {
    this.logSecurityEvent(
      SecurityEventType.SQL_INJECTION_ATTEMPT,
      ErrorSeverity.CRITICAL,
      '检测到SQL注入尝试',
      {
        sourceIp,
        userId,
        details: {
          query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
          detectedPatterns: patterns
        }
      }
    );
  }

  /**
   * 记录访问违规
   *
   * 记录未授权访问资源的尝试。
   *
   * @public
   * @param resource - 尝试访问的资源
   * @param userId - 用户ID
   * @param requiredPermission - 访问资源所需的权限
   * @param sourceIp - 来源IP地址
   */
  public logAccessViolation(
    resource: string,
    userId: string,
    requiredPermission: string,
    sourceIp?: string
  ): void {
    this.logSecurityEvent(
      SecurityEventType.ACCESS_VIOLATION,
      ErrorSeverity.HIGH,
      '访问权限被拒绝',
      {
        sourceIp,
        userId,
        details: {
          resource,
          requiredPermission
        }
      }
    );
  }

  /**
   * 记录认证失败
   *
   * 记录用户认证失败事件，用于检测暴力破解攻击。
   *
   * @public
   * @param username - 尝试认证的用户名
   * @param reason - 认证失败的原因
   * @param sourceIp - 来源IP地址
   */
  public logAuthenticationFailure(
    username: string,
    reason: string,
    sourceIp?: string
  ): void {
    this.logSecurityEvent(
      SecurityEventType.AUTHENTICATION_FAILURE,
      ErrorSeverity.HIGH,
      '用户认证失败',
      {
        sourceIp,
        details: {
          username,
          reason
        }
      }
    );
  }

  /**
   * 记录速率限制超出
   *
   * 记录请求速率超过限制的事件。
   *
   * @public
   * @param userId - 用户ID
   * @param requestCount - 当前请求计数
   * @param limit - 速率限制值
   * @param sourceIp - 来源IP地址
   */
  public logRateLimitExceeded(
    userId: string,
    requestCount: number,
    limit: number,
    sourceIp?: string
  ): void {
    this.logSecurityEvent(
      SecurityEventType.RATE_LIMIT_EXCEEDED,
      ErrorSeverity.MEDIUM,
      '超出速率限制',
      {
        sourceIp,
        userId,
        details: {
          requestCount,
          limit
        }
      }
    );
  }

  /**
   * 记录权限拒绝
   *
   * 记录权限不足导致的操作拒绝事件。
   *
   * @public
   * @param userId - 用户ID
   * @param permission - 被拒绝的权限
   * @param resource - 相关资源（可选）
   * @param sourceIp - 来源IP地址
   */
  public logPermissionDenied(
    userId: string,
    permission: string,
    resource?: string,
    sourceIp?: string
  ): void {
    this.logSecurityEvent(
      SecurityEventType.PERMISSION_DENIED,
      ErrorSeverity.HIGH,
      '权限被拒绝',
      {
        sourceIp,
        userId,
        details: {
          permission,
          resource
        }
      }
    );
  }

  /**
   * 获取安全日志
   *
   * 返回按时间倒序排列的安全日志条目。
   *
   * @public
   * @param limit - 返回日志条目数量限制
   * @returns 安全日志条目数组（最新的在前）
   */
  public getSecurityLogs(limit?: number): SecurityLogEntry[] {
    const logs = [...this.logs].reverse(); // 最新的日志在前面
    return limit ? logs.slice(0, limit) : logs;
  }

  /**
   * 根据事件类型过滤日志
   *
   * 返回指定类型的所有日志条目。
   *
   * @public
   * @param eventType - 要过滤的安全事件类型
   * @returns 匹配指定类型的日志条目数组
   */
  public getLogsByType(eventType: SecurityEventType): SecurityLogEntry[] {
    return this.logs.filter(log => log.eventType === eventType);
  }

  /**
   * 根据严重性级别过滤日志
   *
   * 返回指定严重性级别的所有日志条目。
   *
   * @public
   * @param severity - 要过滤的严重性级别
   * @returns 匹配指定严重性的日志条目数组
   */
  public getLogsBySeverity(severity: ErrorSeverity): SecurityLogEntry[] {
    return this.logs.filter(log => log.severity === severity);
  }

  /**
   * 根据用户ID过滤日志
   *
   * 返回指定用户相关的所有日志条目。
   *
   * @public
   * @param userId - 要过滤的用户ID
   * @returns 指定用户相关的日志条目数组
   */
  public getLogsByUser(userId: string): SecurityLogEntry[] {
    return this.logs.filter(log => log.userId === userId);
  }

  /**
   * 根据时间范围过滤日志
   *
   * 返回指定时间范围内的日志条目。
   *
   * @public
   * @param startTime - 开始时间
   * @param endTime - 结束时间
   * @returns 指定时间范围内的日志条目数组
   */
  public getLogsByTimeRange(startTime: Date, endTime: Date): SecurityLogEntry[] {
    return this.logs.filter(log => 
      log.timestamp >= startTime && log.timestamp <= endTime
    );
  }

  /**
   * 获取日志统计信息
   *
   * 返回按事件类型和严重性分组的统计信息。
   *
   * @public
   * @returns 日志统计信息对象
   */
  public getLogStatistics(): {
    total: number;
    byEventType: Record<SecurityEventType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    timeRange: { earliest?: Date; latest?: Date };
  } {
    const stats = {
      total: this.logs.length,
      byEventType: {} as Record<SecurityEventType, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      timeRange: {
        earliest: this.logs[0]?.timestamp,
        latest: this.logs[this.logs.length - 1]?.timestamp
      }
    };

    // 初始化计数器
    Object.values(SecurityEventType).forEach(type => {
      stats.byEventType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });

    // 统计各类型和严重性的数量
    this.logs.forEach(log => {
      stats.byEventType[log.eventType]++;
      stats.bySeverity[log.severity]++;
    });

    return stats;
  }

  /**
   * 清除所有日志
   *
   * 清空日志缓冲区中的所有记录。
   *
   * @public
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * 生成唯一ID
   *
   * 生成基于时间戳和随机数的唯一标识符。
   *
   * @private
   * @returns 唯一ID字符串
   */
  private generateId(): string {
    return IdUtils.generateShortId();
  }

  /**
   * 输出到控制台
   *
   * 将安全日志条目格式化后输出到控制台。
   *
   * @private
   * @param logEntry - 要输出的日志条目
   */
  private outputToConsole(logEntry: SecurityLogEntry): void {
    const severityPrefix = `[${logEntry.severity.toUpperCase()}]`;
    const typePrefix = `[${logEntry.eventType}]`;
    const timePrefix = `[${logEntry.timestamp.toISOString()}]`;
    
    let consoleMessage = `${timePrefix} ${severityPrefix} ${typePrefix} ${logEntry.message}`;
    
    if (logEntry.userId) {
      consoleMessage += ` (User: ${logEntry.userId})`;
    }
    
    if (logEntry.sourceIp) {
      consoleMessage += ` (IP: ${logEntry.sourceIp})`;
    }
    
    console.warn(consoleMessage);
    
    // 对于高严重性事件，输出详细信息
    if (logEntry.severity === ErrorSeverity.CRITICAL || logEntry.severity === ErrorSeverity.HIGH) {
      if (logEntry.details) {
        console.warn('  Details:', JSON.stringify(logEntry.details, null, 2));
      }
      if (logEntry.stackTrace) {
        console.warn('  Stack Trace:', logEntry.stackTrace);
      }
    }
  }
}