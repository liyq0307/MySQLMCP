/**
 * 结构化日志记录器
 *
 * 提供高性能、多格式的结构化日志记录，支持异步文件写入、
 * 敏感信息过滤和灵活的配置选项。
 *
 * @fileoverview 结构化日志记录器实现
 * @author liyq
 * @since 1.0.0
 */

import { promises as fs } from 'fs';
import {
  MySQLMCPError,
  ErrorCategory,
  ErrorSeverity
} from '../types.js';
import { sensitiveDataHandler } from '../utils/security.js';

/**
 * 日志级别枚举
 */
export enum LogLevel {
  /** 调试信息（最详细） */
  DEBUG = 'debug',
  /** 一般信息 */
  INFO = 'info',
  /** 警告信息 */
  WARN = 'warn',
  /** 错误信息 */
  ERROR = 'error',
  /** 致命错误（最严重） */
  FATAL = 'fatal'
}

/**
 * 日志配置接口
 */
export interface LogConfig {
  /** 日志级别 */
  level: LogLevel;
  /** 是否显示时间戳 */
  timestamp: boolean;
  /** 是否启用颜色输出 */
  colorize: boolean;
  /** 日志格式 */
  format: 'json' | 'text' | 'pretty';
  /** 输出目标 */
  output: 'console' | 'file' | 'both';
  /** 单个日志文件的最大大小（字节） */
  maxFileSize?: number;
  /** 最大保留文件数量 */
  maxFiles?: number;
  /** 日志文件路径 */
  filePath?: string;
  /** 是否启用时间戳（备用配置） */
  enableTimestamp?: boolean;
  /** 是否启用颜色（备用配置） */
  enableColors?: boolean;
  /** 是否启用请求ID跟踪 */
  enableRequestId?: boolean;
  /** 是否启用结构化日志 */
  enableStructuredLogging?: boolean;
  /** 敏感字段列表（会被过滤） */
  sensitiveFields?: string[];
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  /** 日志时间戳 */
  timestamp: Date;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息内容 */
  message: string;
  /** 模块名称 */
  module?: string;
  /** 上下文信息 */
  context?: Record<string, unknown>;
  /** 错误对象 */
  error?: Error;
  /** 错误堆栈信息 */
  stack?: string;
  /** 请求ID（用于跟踪） */
  requestId?: string;
  /** 用户ID */
  userId?: string;
  /** 日志分类 */
  category?: string;
  /** 额外的元数据 */
  metadata?: Record<string, unknown>;
  /** 会话ID */
  sessionId?: string;
  /** 跟踪ID（分布式跟踪） */
  traceId?: string;
  /** 跨度ID（分布式跟踪） */
  spanId?: string;
}

/**
 * 日志回调函数类型
 */
export type LogCallback = (entry: LogEntry) => void | Promise<void>;

/**
 * 颜色代码
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
};

/**
 * 日志级别颜色映射
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: COLORS.blue,
  [LogLevel.INFO]: COLORS.green,
  [LogLevel.WARN]: COLORS.yellow,
  [LogLevel.ERROR]: COLORS.red,
  [LogLevel.FATAL]: COLORS.bright + COLORS.red
};

/**
 * 日志级别权重（用于过滤）
 */
const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40,
  [LogLevel.FATAL]: 50
};

/**
 * 结构化日志记录器
 * 
 * 提供高性能、多格式的结构化日志记录，支持异步文件写入、敏感信息过滤和灵活的配置选项。
 * 
 * @class StructuredLogger   
 * @since 1.0.0
 */
export class StructuredLogger {
  private config: LogConfig;
  private callbacks: Set<LogCallback> = new Set();
  private currentRequestId?: string;
  private currentUserId?: string;
  private currentSessionId?: string;
  private currentTraceId?: string;
  private currentSpanId?: string;

  /**
   * 默认配置
   */
  private static readonly DEFAULT_CONFIG: LogConfig = {
    level: LogLevel.INFO,
    format: 'pretty',
    output: 'console',
    timestamp: true,
    colorize: true,
    enableColors: true,
    enableTimestamp: true,
    enableRequestId: true,
    enableStructuredLogging: true,
    sensitiveFields: ['password', 'token', 'secret', 'key', 'credit_card', 'ssn']
  };

  /**
   * 全局实例
   */
  private static instance: StructuredLogger;

  /**
   * 获取全局日志实例
   *
   * @public
   * @static
   * @param {Partial<LogConfig>} [config] - 日志配置
   * @returns {StructuredLogger} 日志实例
   */
  public static getInstance(config?: Partial<LogConfig>): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger(config);
    } else if (config) {
      StructuredLogger.instance.updateConfig(config);
    }
    return StructuredLogger.instance;
  }

  /**
   * 构造函数
   *
   * @private
   * @param {Partial<LogConfig>} [config] - 日志配置
   */
  constructor(config?: Partial<LogConfig>) {
    this.config = { ...StructuredLogger.DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   *
   * @public
   * @param {Partial<LogConfig>} config - 新配置
   */
  public updateConfig(config: Partial<LogConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 添加日志回调
   *
   * @public
   * @param {LogCallback} callback - 日志回调函数
   */
  public addCallback(callback: LogCallback): void {
    this.callbacks.add(callback);
  }

  /**
   * 移除日志回调
   *
   * @public
   * @param {LogCallback} callback - 日志回调函数
   */
  public removeCallback(callback: LogCallback): void {
    this.callbacks.delete(callback);
  }

  /**
   * 设置上下文信息
   *
   * @public
   * @param {object} context - 上下文信息
   */
  public setContext(context: {
    requestId?: string;
    userId?: string;
    sessionId?: string;
    traceId?: string;
    spanId?: string;
  }): void {
    if (context.requestId) this.currentRequestId = context.requestId;
    if (context.userId) this.currentUserId = context.userId;
    if (context.sessionId) this.currentSessionId = context.sessionId;
    if (context.traceId) this.currentTraceId = context.traceId;
    if (context.spanId) this.currentSpanId = context.spanId;
  }

  /**
   * 清除上下文信息
   *
   * @public
   */
  public clearContext(): void {
    this.currentRequestId = undefined;
    this.currentUserId = undefined;
    this.currentSessionId = undefined;
    this.currentTraceId = undefined;
    this.currentSpanId = undefined;
  }

  /**
   * 记录调试日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  /**
   * 记录调试日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  public debug(message: string, category?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, category, metadata);
  }

  /**
   * 记录信息日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  public info(message: string, category?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, category, metadata);
  }

  /**
   * 记录警告日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  public warn(message: string, category?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, category, metadata);
  }

  /**
   * 记录错误日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Error} [error] - 错误对象
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  public error(message: string, category?: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, category, metadata, error);
  }

  /**
   * 记录致命日志
   *
   * @public
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Error} [error] - 错误对象
   * @param {Record<string, unknown>} [metadata] - 元数据
   */
  public fatal(message: string, category?: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, category, metadata, error);
  }

  /**
   * 记录结构化日志
   *
   * @public
   * @param {LogLevel} level - 日志级别
   * @param {string} message - 日志消息
   * @param {string} [category] - 日志分类
   * @param {Record<string, unknown>} [metadata] - 元数据
   * @param {Error} [error] - 错误对象
   */
  public log(
    level: LogLevel, 
    message: string, 
    category?: string, 
    metadata?: Record<string, unknown>, 
    error?: Error
  ): void {
    // 检查日志级别
    if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[this.config.level]) {
      return;
    }

    // 创建日志条目
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      category: category || 'default',
      message,
      metadata: this.maskSensitiveFields(metadata),
      requestId: this.config.enableRequestId ? this.currentRequestId : undefined,
      userId: this.currentUserId,
      sessionId: this.currentSessionId,
      traceId: this.currentTraceId,
      spanId: this.currentSpanId
    };

    // 添加错误信息
    if (error) {
      entry.error = error instanceof MySQLMCPError ? error : new MySQLMCPError(
        error.message,
        ErrorCategory.UNKNOWN,
        ErrorSeverity.MEDIUM
      );
    }

    // 格式化并输出日志
    const formattedLog = this.formatLogEntry(entry);
    this.outputLog(formattedLog);

    // 调用回调函数
    this.invokeCallbacks(entry);
  }

  /**
   * 创建子日志记录器
   *
   * @public
   * @param {string} category - 日志分类
   * @returns {StructuredLogger} 子日志记录器
   */
  public child(category: string): StructuredLogger {
    const childLogger = new StructuredLogger(this.config);
    childLogger.callbacks = this.callbacks;
    childLogger.setContext({
      requestId: this.currentRequestId,
      userId: this.currentUserId,
      sessionId: this.currentSessionId,
      traceId: this.currentTraceId,
      spanId: this.currentSpanId
    });
    
    // 重写log方法以包含分类
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, _, metadata, error) => {
      originalLog(level, message, category, metadata, error);
    };
    
    return childLogger;
  }

  /**
   * 格式化日志条目
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   * @returns {string} 格式化后的日志
   */
  private formatLogEntry(entry: LogEntry): string {
    switch (this.config.format) {
      case 'json':
        return this.formatJson(entry);
      case 'text':
        return this.formatText(entry);
      case 'pretty':
        return this.formatPretty(entry);
      default:
        return this.formatPretty(entry);
    }
  }

  /**
   * JSON格式化
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   * @returns {string} JSON格式日志
   */
  private formatJson(entry: LogEntry): string {
    const jsonEntry = {
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      category: entry.category,
      message: entry.message,
      ...entry.metadata && { metadata: entry.metadata },
      ...entry.error && { 
        error: {
          name: entry.error.name,
          message: entry.error.message,
          ...(entry.error instanceof MySQLMCPError && {
            category: entry.error.category,
            severity: entry.error.severity,
            code: entry.error.code
          }),
          stack: entry.error.stack
        }
      },
      ...entry.requestId && { requestId: entry.requestId },
      ...entry.userId && { userId: entry.userId },
      ...entry.sessionId && { sessionId: entry.sessionId },
      ...entry.traceId && { traceId: entry.traceId },
      ...entry.spanId && { spanId: entry.spanId }
    };

    return JSON.stringify(jsonEntry);
  }

  /**
   * 文本格式化
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   * @returns {string} 文本格式日志
   */
  private formatText(entry: LogEntry): string {
    const timestamp = this.config.enableTimestamp ? `[${entry.timestamp.toISOString()}] ` : '';
    const level = `[${entry.level.toUpperCase()}] `;
    const category = `[${entry.category}] `;
    const context = this.buildContextString(entry);
    const error = entry.error ? ` Error: ${entry.error.message}` : '';
    
    let result = `${timestamp}${level}${category}${entry.message}${error}${context}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      result += ` ${JSON.stringify(entry.metadata)}`;
    }
    
    return result;
  }

  /**
   * 美化格式化
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   * @returns {string} 美化格式日志
   */
  private formatPretty(entry: LogEntry): string {
    const timestamp = this.config.enableTimestamp 
      ? `${COLORS.dim}[${entry.timestamp.toISOString()}]${COLORS.reset} ` 
      : '';
    
    const level = this.config.enableColors 
      ? `${LEVEL_COLORS[entry.level]}[${entry.level.toUpperCase()}]${COLORS.reset} ` 
      : `[${entry.level.toUpperCase()}] `;
    
    const category = `${COLORS.cyan}[${entry.category}]${COLORS.reset} `;
    const context = this.buildContextString(entry);
    const error = entry.error 
      ? `${COLORS.red} Error: ${entry.error.message}${COLORS.reset}` 
      : '';
    
    let message = `${timestamp}${level}${category}${entry.message}${error}${context}`;
    
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      message += ` ${COLORS.dim}${JSON.stringify(entry.metadata)}${COLORS.reset}`;
    }
    
    return message;
  }

  /**
   * 构建上下文字符串
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   * @returns {string} 上下文字符串
   */
  private buildContextString(entry: LogEntry): string {
    const parts: string[] = [];
    
    if (entry.requestId) parts.push(`req:${entry.requestId}`);
    if (entry.userId) parts.push(`user:${entry.userId}`);
    if (entry.sessionId) parts.push(`session:${entry.sessionId}`);
    if (entry.traceId) parts.push(`trace:${entry.traceId}`);
    if (entry.spanId) parts.push(`span:${entry.spanId}`);
    
    return parts.length > 0 ? `${COLORS.dim} (${parts.join(', ')})${COLORS.reset}` : '';
  }

  /**
   * 输出日志
   *
   * @private
   * @param {string} formattedLog - 格式化后的日志
   */
  private async outputLog(formattedLog: string): Promise<void> {
    const outputs = Array.isArray(this.config.output) ? this.config.output : [this.config.output];
    
    for (const output of outputs) {
      switch (output) {
        case 'console':
          // console.log(formattedLog);
          break;
        case 'file':
          await this.writeToFile(formattedLog);
          break;
        case 'both':
          // console.log(formattedLog);
          await this.writeToFile(formattedLog);
          break;
      }
    }
  }

  /**
   * 写入文件
   *
   * @private
   * @param {string} log - 日志内容
   */
  private async writeToFile(log: string): Promise<void> {
    if (!this.config.filePath) {
      return;
    }

    try {
      await fs.appendFile(this.config.filePath, log + '\n');
    } catch (error) {
      // 如果文件写入失败，回退到控制台输出
      console.error(`Failed to write to log file: ${error}`);
      // console.log(log);
    }
  }

  /**
   * 调用回调函数
   *
   * @private
   * @param {LogEntry} entry - 日志条目
   */
  private invokeCallbacks(entry: LogEntry): void {
    this.callbacks.forEach(callback => {
      try {
        callback(entry);
      } catch (error) {
        console.error('Error in log callback:', error);
      }
    });
  }

  /**
   * 掩码敏感字段
   *
   * 使用统一的敏感数据处理器来掩码日志元数据中的敏感信息
   *
   * @private
   * @param {Record<string, unknown>} [metadata] - 元数据
   * @returns {Record<string, unknown>} 掩码后的元数据
   */
  private maskSensitiveFields(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata) {
      return metadata;
    }

    const masked = { ...metadata };
    
    // 对于每个字段值，如果是字符串则进行敏感数据检测和掩码
    for (const [key, value] of Object.entries(masked)) {
      if (typeof value === 'string') {
        const result = sensitiveDataHandler.processSensitiveData(value);
        masked[key] = result.processedText;
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // 递归处理嵌套对象
        masked[key] = this.maskSensitiveFields(value as Record<string, unknown>);
      }
    }
    
    // 特殊处理配置中指定的敏感字段名
    for (const field of this.config.sensitiveFields || []) {
      if (field in masked) {
        masked[field] = '***';
      }
      
      // 检查嵌套对象
      for (const [_key, nestedValue] of Object.entries(masked)) {
        if (typeof nestedValue === 'object' && nestedValue !== null && !Array.isArray(nestedValue)) {
          const nestedObj = nestedValue as Record<string, unknown>;
          if (field in nestedObj) {
            nestedObj[field] = '***';
          }
        }
      }
    }
    
    return masked;
  }
}