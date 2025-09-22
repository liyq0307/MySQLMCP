/**
 * MySQL MCP 服务器常量 - 中央配置管理
 *
 * 企业级常量集合，为 MySQL MCP 服务器提供集中化的配置管理、错误处理和系统参数定义。
 * 集成了完整的常量生态，包括错误代码映射、默认配置、安全策略和字符串常量。
 *
 * @fileoverview MySQL MCP服务器常量 - 企业级中央配置管理
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */
export const MySQLErrorCodes = {
  /** 访问控制错误 - 身份验证和授权失败 */
  ACCESS_DENIED: 1045,                    // 一般访问拒绝
  ACCESS_DENIED_FOR_USER: 1044,           // 用户特定访问拒绝
  TABLE_ACCESS_DENIED: 1142,              // 表级访问拒绝
  COLUMN_ACCESS_DENIED: 1143,             // 列级访问拒绝

  /** 对象解析错误 - 数据库对象未找到 */
  UNKNOWN_DATABASE: 1049,                 // 数据库不存在
  TABLE_DOESNT_EXIST: 1146,               // 表不存在
  UNKNOWN_COLUMN: 1054,                   // 列不存在
  UNKNOWN_TABLE: 1109,                    // 表引用错误

  /** 数据完整性错误 - 约束违反和重复 */
  DUPLICATE_ENTRY: 1062,                  // 重复键值
  DUPLICATE_ENTRY_WITH_KEY_NAME: 1586,    // 带键名的重复键
  DUPLICATE_KEY_NAME: 1557,               // 重复键名

  /** SQL 语法错误 - 查询解析和语法问题 */
  PARSE_ERROR: 1064,                      // SQL 语法错误
  SYNTAX_ERROR: 1149,                     // 一般语法错误
  PARSE_ERROR_NEAR: 1065,                 // 特定标记附近的语法错误

  /** 连接错误 - 网络和连接问题 */
  CANT_CONNECT_TO_SERVER: 2003,           // 无法连接到 MySQL 服务器
  LOST_CONNECTION: 2013,                  // 查询期间连接丢失
  SERVER_HAS_GONE_AWAY: 2006,             // MySQL 服务器已断开
  
  /** 事务和锁定错误 */
  DEADLOCK: 1213,                         // 死锁检测
  LOCK_WAIT_TIMEOUT: 1205,                // 锁等待超时
  QUERY_INTERRUPTED: 1317,                // 查询被中断
  
  /** SSL 错误 */
  SSL_ERROR: 2026,                        // SSL 连接错误
} as const;

/**
 * 默认配置常量
 *
 * 系统各组件的默认配置值集合，提供安全、性能优化的初始值。
 * 所有配置均可通过环境变量进行覆盖，以适应不同部署环境的需求。
 *
 * 配置分类：
 * - 数据库连接：MySQL连接设置、连接池参数
 * - 安全限制：访问控制、输入验证和查询限制
 * - 缓存参数：缓存大小和过期时间设置
 * - 性能监控：指标收集和性能阈值
 * - 可靠性设置：重试机制和错误处理策略
 *
 * @constant
 * @since 1.0.0
 *
 * @example
 * // 使用环境变量覆盖默认值
 * const port = process.env.MYSQL_PORT || DefaultConfig.MYSQL_PORT;
 *
 * @example
 * // 获取安全配置
 * const maxQueryLength = process.env.MAX_QUERY_LENGTH || DefaultConfig.MAX_QUERY_LENGTH;
 */
export const DefaultConfig = {
  /** MySQL 连接配置 - 数据库连接设置 */
  MYSQL_PORT: 3306,                        // 标准 MySQL 端口
  CONNECTION_LIMIT: 10,                    // 连接池中的最大连接数
  MIN_CONNECTIONS: 2,                      // 要维护的最小连接数
  CONNECT_TIMEOUT: 60,                     // 连接超时（秒）
  IDLE_TIMEOUT: 60,                        // 空闲连接超时（秒）

  /** 安全配置 - 访问控制和验证限制 */
  MAX_QUERY_LENGTH: 10000,                 // 最大 SQL 查询长度
  MAX_RESULT_ROWS: 1000,                   // 每个查询结果的最大行数
  QUERY_TIMEOUT: 30,                       // 查询执行超时（秒）
  RATE_LIMIT_WINDOW: 60,                   // 速率限制窗口（秒）
  RATE_LIMIT_MAX: 100,                     // 每个窗口的最大请求数

  /** 输入验证配置 - 数据验证限制 */
  MAX_INPUT_LENGTH: 1000,                  // 最大输入字符串长度
  MAX_TABLE_NAME_LENGTH: 64,               // 最大表名长度

  /** 缓存配置 - 缓存系统参数 */
  SCHEMA_CACHE_SIZE: 128,                  // 模式缓存条目限制
  TABLE_EXISTS_CACHE_SIZE: 64,             // 表存在性缓存限制
  INDEX_CACHE_SIZE: 64,                    // 索引信息缓存限制
  CACHE_TTL: 300,                          // 缓存过期时间（秒）

  /** 连接池配置 - 连接池管理设置 */
  HEALTH_CHECK_INTERVAL: 30,               // 健康检查频率（秒）
  CONNECTION_MAX_AGE: 3600,                // 最大连接年龄（秒）

  /** 性能监控配置 - 指标和监控 */
  METRICS_WINDOW_SIZE: 1000,               // 要保留的指标数据点
  SLOW_QUERY_THRESHOLD: 1.0,               // 慢查询阈值（秒）

  /** 重试配置 - 错误处理和恢复 */
  RECONNECT_ATTEMPTS: 3,                   // 数据库重连尝试次数
  RECONNECT_DELAY: 1,                      // 重连尝试之间的延迟
  MAX_RETRY_ATTEMPTS: 3,                   // 最大操作重试次数

  /** 批处理配置 - 批量操作设置 */
  BATCH_SIZE: 1000,                        // 默认批处理大小

  /** 日志配置 - 日志输出和格式化 */
  MAX_LOG_DETAIL_LENGTH: 100,              // 最大日志详细信息长度
} as const;

/**
 * 字符串常量
 *
 * 集中化的字符串常量集合，用于保持一致的消息传递、配置键命名和系统标识符。
 * 按功能类别组织，便于维护和国际化支持。
 *
 * 类别说明：
 * - 数据库配置：默认连接设置和连接参数
 * - 环境变量：配置覆盖使用的环境变量键
 * - SQL 操作：SQL查询类型和关键字常量
 * - 错误消息：用户友好的错误消息模板
 * - 系统状态：状态代码和状态指示器
 * - JSON 字段：API响应中的字段标识符
 *
 * @constant
 * @since 1.0.0
 *
 * @example
 * // 使用字符串常量确保一致性
 * const host = process.env[StringConstants.ENV_MYSQL_HOST] || StringConstants.DEFAULT_HOST;
 *
 * @example
 * // 通过常量访问SQL操作类型
 * if (queryType === StringConstants.SQL_SELECT) {
 *   // 处理SELECT查询
 * }
 */
export const StringConstants = {
  /** 数据库配置字符串 - 默认连接设置 */
  DEFAULT_HOST: "localhost",               // 默认 MySQL 主机
  DEFAULT_USER: "root",                    // 默认 MySQL 用户名
  DEFAULT_PASSWORD: "",                    // 默认 MySQL 密码（空）
  DEFAULT_DATABASE: "",                    // 默认数据库名称（空）
  POOL_NAME: "mysql_mcp_pool",             // 连接池标识符
  CHARSET: "utf8mb4",                      // 默认字符集
  SQL_MODE: "TRADITIONAL",                 // 默认 SQL 模式

  /** 环境变量键 */
  ENV_MYSQL_HOST: "MYSQL_HOST",
  ENV_MYSQL_PORT: "MYSQL_PORT",
  ENV_MYSQL_USER: "MYSQL_USER",
  ENV_MYSQL_PASSWORD: "MYSQL_PASSWORD",
  ENV_MYSQL_DATABASE: "MYSQL_DATABASE",
  ENV_MYSQL_SSL: "MYSQL_SSL",
  ENV_CONNECTION_LIMIT: "MYSQL_CONNECTION_LIMIT",
  ENV_CONNECT_TIMEOUT: "MYSQL_CONNECT_TIMEOUT",
  ENV_IDLE_TIMEOUT: "MYSQL_IDLE_TIMEOUT",
  ENV_ALLOWED_QUERY_TYPES: "ALLOWED_QUERY_TYPES",
  ENV_MAX_QUERY_LENGTH: "MAX_QUERY_LENGTH",
  ENV_MAX_RESULT_ROWS: "MAX_RESULT_ROWS",
  ENV_QUERY_TIMEOUT: "QUERY_TIMEOUT",
  ENV_RATE_LIMIT_WINDOW: "RATE_LIMIT_WINDOW",
  ENV_RATE_LIMIT_MAX: "RATE_LIMIT_MAX",

  /** SQL 查询类型 */
  SQL_SELECT: "SELECT",
  SQL_SHOW: "SHOW",
  SQL_DESCRIBE: "DESCRIBE",
  SQL_INSERT: "INSERT",
  SQL_UPDATE: "UPDATE",
  SQL_DELETE: "DELETE",
  SQL_CREATE: "CREATE",
  SQL_DROP: "DROP",
  SQL_ALTER: "ALTER",

  /** 默认允许的查询类型 */
  DEFAULT_ALLOWED_QUERY_TYPES: "SELECT,SHOW,DESCRIBE,INSERT,UPDATE,DELETE,CREATE,DROP,ALTER",

  /** 危险的 SQL 模式 */
  DANGEROUS_PATTERNS: ["--", "/*", "*/", "xp_", "sp_"],

  /** 错误类别 */
  ERROR_CATEGORY_ACCESS_DENIED: "access_denied",
  ERROR_CATEGORY_OBJECT_NOT_FOUND: "object_not_found",
  ERROR_CATEGORY_CONSTRAINT_VIOLATION: "constraint_violation",
  ERROR_CATEGORY_SYNTAX_ERROR: "syntax_error",
  ERROR_CATEGORY_CONNECTION_ERROR: "connection_error",
  ERROR_CATEGORY_UNKNOWN: "unknown",

  /** 错误严重级别 */
  SEVERITY_HIGH: "high",
  SEVERITY_MEDIUM: "medium",
  SEVERITY_LOW: "low",

  /** 日志事件类型 */
  LOG_EVENT_SECURITY: "[SECURITY]",

  /** 错误消息模板 */
  MSG_DATABASE_ACCESS_DENIED: "数据库访问被拒绝，请检查用户名和密码",
  MSG_DATABASE_OBJECT_NOT_FOUND: "未找到数据库对象",
  MSG_DATABASE_CONSTRAINT_VIOLATION: "数据约束违反",
  MSG_DATABASE_SYNTAX_ERROR: "SQL语法错误",
  MSG_DATABASE_CONNECTION_ERROR: "数据库连接错误",
  MSG_MYSQL_CONNECTION_POOL_FAILED: "MySQL连接池创建失败",
  MSG_MYSQL_CONNECTION_ERROR: "MySQL连接错误",
  MSG_MYSQL_QUERY_ERROR: "MySQL查询错误",
  MSG_RATE_LIMIT_EXCEEDED: "超出速率限制。请稍后再试。",
  MSG_QUERY_TOO_LONG: "查询超过最大允许长度",
  MSG_PROHIBITED_OPERATIONS: "查询包含禁止的操作",
  MSG_QUERY_TYPE_NOT_ALLOWED: "不允许查询类型 '{query_type}'",
  MSG_INVALID_TABLE_NAME: "无效的表名格式",
  MSG_TABLE_NAME_TOO_LONG: "表名超过最大长度",
  MSG_INVALID_CHARACTER: "{field_name} 中包含无效字符",
  MSG_INPUT_TOO_LONG: "{field_name} 超过最大长度",
  MSG_DANGEROUS_CONTENT: "{field_name} 中包含潜在危险内容",

  /** 状态字符串 */
  STATUS_SUCCESS: "success",
  STATUS_FAILED: "failed",
  STATUS_NOT_INITIALIZED: "not_initialized",
  STATUS_ERROR: "error",
  STATUS_KEY: "status",
  ERROR_KEY: "error",

  /** 特殊值 */
  NULL_BYTE: '\x00',
  TRUE_STRING: "true",

  /** 服务器相关常量 */
  SERVER_NAME: "mysql-mcp-server",
  SERVER_VERSION: "1.0.0",

  /** 错误消息 */
  MSG_FASTMCP_NOT_INSTALLED: "错误：FastMCP未安装。请使用以下命令安装：npm install fastmcp",
  MSG_ERROR_DURING_CLEANUP: "清理过程中出错：",
  MSG_SIGNAL_RECEIVED: "收到信号",
  MSG_GRACEFUL_SHUTDOWN: "正在优雅关闭...",
  MSG_SERVER_RUNNING: "MySQL MCP 服务器 (FastMCP) 在 stdio 上运行",
  MSG_SERVER_ERROR: "服务器错误：",

  /** 工具函数错误消息 */
  MSG_QUERY_FAILED: "查询失败：",
  MSG_SHOW_TABLES_FAILED: "显示表失败：",
  MSG_DESCRIBE_TABLE_FAILED: "描述表失败：",
  MSG_GET_METRICS_FAILED: "获取性能指标失败：",
  MSG_SELECT_DATA_FAILED: "选择数据失败：",
  MSG_INSERT_DATA_FAILED: "插入数据失败：",
  MSG_UPDATE_DATA_FAILED: "更新数据失败：",
  MSG_DELETE_DATA_FAILED: "删除数据失败：",
  MSG_GET_SCHEMA_FAILED: "获取模式失败：",
  MSG_GET_INDEXES_FAILED: "获取索引失败：",
  MSG_GET_FOREIGN_KEYS_FAILED: "获取外键失败：",
  MSG_CREATE_TABLE_FAILED: "创建表失败：",
  MSG_DROP_TABLE_FAILED: "删除表失败：",
  MSG_DIAGNOSE_FAILED: "诊断失败：",
  MSG_ANALYZE_ERROR_FAILED: "错误分析失败：",
  MSG_GET_POOL_STATUS_FAILED: "获取连接池状态失败：",
  MSG_BATCH_QUERY_FAILED: "批量查询失败：",
  MSG_BATCH_INSERT_FAILED: "批量插入失败：",
  MSG_POOL_INIT_FAILED: "连接池初始化失败：",
  MSG_CONNECTION_FAILED: "获取连接失败：",
  MSG_BACKUP_FAILED: "备份失败：",
  MSG_INCREMENTAL_BACKUP_FAILED: "增量备份失败：",
  MSG_BACKUP_VERIFY_FAILED: "备份验证失败：",
  MSG_EXPORT_FAILED: "导出失败：",
  MSG_CSV_IMPORT_FAILED: "CSV导入失败：",
  MSG_JSON_IMPORT_FAILED: "JSON导入失败：",
  MSG_EXCEL_IMPORT_FAILED: "Excel导入失败：",
  MSG_SQL_IMPORT_FAILED: "SQL导入失败：",
  MSG_ENABLE_SLOW_QUERY_LOG_FAILED: "启用慢查询日志失败：",
  MSG_DISABLE_SLOW_QUERY_LOG_FAILED: "禁用慢查询日志失败：",

  /** 连接池相关常量 */
  MSG_FAILED_TO_INIT_POOL: "初始化连接池失败：",

  /** JSON 响应字段常量 */
  SUCCESS_KEY: "success",

  /** SQL 关键字常量 */
  SQL_IF_EXISTS: "IF EXISTS",

  /** 性能指标字段常量 */
  FIELD_QUERY_COUNT: "query_count",
  FIELD_AVG_QUERY_TIME: "avg_query_time",
  FIELD_SLOW_QUERY_COUNT: "slow_query_count",
  FIELD_ERROR_COUNT: "error_count",
  FIELD_ERROR_RATE: "error_rate",
  FIELD_CACHE_HIT_RATE: "cache_hit_rate",
  FIELD_CONNECTION_POOL_HITS: "connection_pool_hits",
  FIELD_CONNECTION_POOL_WAITS: "connection_pool_waits",

  /** 缓存统计字段常量 */
  FIELD_SIZE: "size",
  FIELD_MAX_SIZE: "max_size",
  FIELD_DYNAMIC_MAX_SIZE: "dynamic_max_size",
  FIELD_HIT_COUNT: "hit_count",
  FIELD_MISS_COUNT: "miss_count",
  FIELD_HIT_RATE: "hit_rate",
  FIELD_TTL: "ttl",

  /** 连接池统计字段常量 */
  FIELD_POOL_NAME: "pool_name",
  FIELD_POOL_SIZE: "pool_size",
  FIELD_AVAILABLE_CONNECTIONS: "available_connections",
  FIELD_CONNECTION_STATS: "connection_stats",
  FIELD_HEALTH_CHECK_ACTIVE: "health_check_active",
  FIELD_POOL_HITS: "pool_hits",
  FIELD_POOL_WAITS: "pool_waits",
  FIELD_TOTAL_CONNECTIONS_ACQUIRED: "total_connections_acquired",
  FIELD_AVG_WAIT_TIME: "avg_wait_time",
  FIELD_MAX_WAIT_TIME: "max_wait_time",
  FIELD_MIN_POOL_SIZE: "min_pool_size",
  FIELD_MAX_POOL_SIZE: "max_pool_size",
  FIELD_HEALTH_CHECK_FAILURES: "health_check_failures",
  FIELD_LAST_HEALTH_CHECK: "last_health_check",
  FIELD_ENTERPRISE_METRICS: "enterprise_metrics",

  /** 性能报告部分常量 */
  SECTION_PERFORMANCE: "performance",
  SECTION_CACHE_STATS: "cache_stats",
  SECTION_CONNECTION_POOL: "connection_pool",
  SECTION_SCHEMA_CACHE: "schema_cache",
  SECTION_TABLE_EXISTS_CACHE: "table_exists_cache",
  SECTION_INDEX_CACHE: "index_cache",

  /** 配置字段常量 */
  FIELD_HOST: "host",
  FIELD_PORT: "port",
  FIELD_DATABASE: "database",
  FIELD_CONNECTION_LIMIT: "connection_limit",
  FIELD_CONNECT_TIMEOUT: "connect_timeout",
  FIELD_SSL_ENABLED: "ssl_enabled",

  /** 诊断报告字段常量 */
  FIELD_CONNECTION_POOL_STATUS: "connection_pool_status",
  FIELD_CONFIG: "config",
  FIELD_SECURITY_CONFIG: "security_config",
  FIELD_PERFORMANCE_METRICS: "performance_metrics",
  FIELD_CONNECTION_TEST: "connection_test",
  FIELD_MAX_QUERY_LENGTH: "max_query_length",
  FIELD_MAX_RESULT_ROWS: "max_result_rows",
  FIELD_RATE_LIMIT_MAX: "rate_limit_max",
  FIELD_ALLOWED_QUERY_TYPES: "allowed_query_types",
  FIELD_RESULT: "result",
} as const;