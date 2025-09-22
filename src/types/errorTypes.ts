/**
 * 错误处理相关类型定义
 *
 * @fileoverview 错误分类、严重级别和处理相关类型
 * @author liyq
 * @since 1.0.0
 */

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  FATAL = 'fatal'
}

/**
 * 验证级别枚举
 */
export enum ValidationLevel {
  STRICT = 'strict',
  MODERATE = 'moderate',
  BASIC = 'basic'
}

/**
 * 错误分类枚举
 */
export enum ErrorCategory {
  ACCESS_DENIED = 'access_denied',
  OBJECT_NOT_FOUND = 'object_not_found',
  CONSTRAINT_VIOLATION = 'constraint_violation',
  SYNTAX_ERROR = 'syntax_error',
  CONNECTION_ERROR = 'connection_error',
  SECURITY_VIOLATION = 'security_violation',
  VALIDATION_ERROR = 'validation_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  TIMEOUT_ERROR = 'timeout_error',
  TRANSACTION_ERROR = 'transaction_error',
  RESOURCE_EXHAUSTED = 'resource_exhausted',
  NETWORK_ERROR = 'network_error',
  DATABASE_UNAVAILABLE = 'database_unavailable',
  DATA_INTEGRITY_ERROR = 'data_integrity_error',
  DATA_ERROR = 'data_error',
  CONFIGURATION_ERROR = 'configuration_error',
  DEADLOCK_ERROR = 'deadlock_error',
  LOCK_WAIT_TIMEOUT = 'lock_wait_timeout',
  QUERY_INTERRUPTED = 'query_interrupted',
  SERVER_GONE_ERROR = 'server_gone_error',
  SERVER_LOST_ERROR = 'server_lost_error',
  SSL_ERROR = 'ssl_error',
  UNKNOWN = 'unknown',
  // 新增错误类型
  MEMORY_LEAK = 'memory_leak',
  PERFORMANCE_DEGRADATION = 'performance_degradation',
  CONCURRENT_ACCESS_ERROR = 'concurrent_access_error',
  DATA_CONSISTENCY_ERROR = 'data_consistency_error',
  DATA_PROCESSING = 'data_processing',
  BACKUP_ERROR = 'backup_error',
  DATA_EXPORT_ERROR = 'data_export_error',
  REPORT_GENERATION_ERROR = 'report_generation_error',
  REPLICATION_ERROR = 'replication_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  AUTHORIZATION_ERROR = 'authorization_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  MAINTENANCE_MODE = 'maintenance_mode',
  VERSION_MISMATCH = 'version_mismatch',
  SCHEMA_MIGRATION_ERROR = 'schema_migration_error',
  INDEX_CORRUPTION = 'index_corruption',
  PARTITION_ERROR = 'partition_error',
  FULLTEXT_ERROR = 'fulltext_error',
  SPATIAL_ERROR = 'spatial_error',
  JSON_ERROR = 'json_error',
  WINDOW_FUNCTION_ERROR = 'window_function_error',
  CTE_ERROR = 'cte_error',
  TRIGGER_ERROR = 'trigger_error',
  VIEW_ERROR = 'view_error',
  STORED_PROCEDURE_ERROR = 'stored_procedure_error',
  FUNCTION_ERROR = 'function_error',
  EVENT_ERROR = 'event_error',
  PRIVILEGE_ERROR = 'privilege_error',
  ROLE_ERROR = 'role_error',
  PLUGIN_ERROR = 'plugin_error',
  CHARACTER_SET_ERROR = 'character_set_error',
  COLLATION_ERROR = 'collation_error',
  TIMEZONE_ERROR = 'timezone_error',
  LOCALE_ERROR = 'locale_error',
  ENCRYPTION_ERROR = 'encryption_error',
  COMPRESSION_ERROR = 'compression_error',
  AUDIT_ERROR = 'audit_error',
  MONITORING_ERROR = 'monitoring_error',
  HEALTH_CHECK_ERROR = 'health_check_error',
  LOAD_BALANCER_ERROR = 'load_balancer_error',
  PROXY_ERROR = 'proxy_error',
  FIREWALL_ERROR = 'firewall_error',
  DNS_ERROR = 'dns_error',
  CERTIFICATE_ERROR = 'certificate_error',
  TOKEN_EXPIRED = 'token_expired',
  SESSION_EXPIRED = 'session_expired',
  INVALID_INPUT = 'invalid_input',
  BUSINESS_LOGIC_ERROR = 'business_logic_error',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
  DEPENDENCY_ERROR = 'dependency_error',
  CIRCUIT_BREAKER_ERROR = 'circuit_breaker_error',
  RETRY_EXHAUSTED = 'retry_exhausted',
  THROTTLED = 'throttled',
  DEGRADED_SERVICE = 'degraded_service',
  PARTIAL_FAILURE = 'partial_failure',
  CASCADING_FAILURE = 'cascading_failure',
  SLOW_QUERY_LOG_ERROR = 'slow_query_log_error',
  SLOW_QUERY_ANALYSIS_ERROR = 'slow_query_analysis_error',
  SLOW_QUERY_CONFIGURATION_ERROR = 'slow_query_configuration_error',
  SLOW_QUERY_REPORT_GENERATION_ERROR = 'slow_query_report_generation_error',
  SLOW_QUERY_MONITORING_ERROR = 'slow_query_monitoring_error',
  SLOW_QUERY_INDEX_SUGGESTION_ERROR = 'slow_query_index_suggestion_error'
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  operation: string;
  sessionId: string;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * 增强的MySQL错误类
 */
export class MySQLMCPError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context?: ErrorContext;
  public readonly originalError?: Error;
  public readonly recoverable: boolean;
  public readonly retryable: boolean;
  public readonly code?: number;
  public readonly timestamp: Date;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: ErrorContext,
    originalError?: Error
  ) {
    super(message);
    this.name = 'MySQLMCPError';
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date();
    
    // 如果原始错误有code属性，复制过来
    if (originalError && 'code' in originalError && typeof originalError.code === 'number') {
      this.code = originalError.code;
    }
    
    // 根据错误类别确定是否可恢复和可重试
    this.recoverable = this.isRecoverable(category);
    this.retryable = this.isRetryable(category);
    
    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MySQLMCPError);
    }
  }

  private isRecoverable(category: ErrorCategory): boolean {
    const recoverableCategories = [
      ErrorCategory.TIMEOUT_ERROR,
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.CONNECTION_ERROR,
      ErrorCategory.RATE_LIMIT_ERROR,
      ErrorCategory.RESOURCE_EXHAUSTED,
      ErrorCategory.DEADLOCK_ERROR,
      ErrorCategory.LOCK_WAIT_TIMEOUT,
      ErrorCategory.SLOW_QUERY_LOG_ERROR,
      ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR,
      ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR,
      ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR,
      ErrorCategory.SLOW_QUERY_MONITORING_ERROR,
      ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR
    ];
    return recoverableCategories.includes(category);
  }

  private isRetryable(category: ErrorCategory): boolean {
    const retryableCategories = [
      ErrorCategory.TIMEOUT_ERROR,
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.CONNECTION_ERROR,
      ErrorCategory.DEADLOCK_ERROR,
      ErrorCategory.LOCK_WAIT_TIMEOUT,
      ErrorCategory.SERVER_GONE_ERROR,
      ErrorCategory.SERVER_LOST_ERROR,
      ErrorCategory.SLOW_QUERY_LOG_ERROR,
      ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR,
      ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR
    ];
    return retryableCategories.includes(category);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      recoverable: this.recoverable,
      retryable: this.retryable,
      context: this.context,
      code: this.code,
      timestamp: this.timestamp,
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }
}