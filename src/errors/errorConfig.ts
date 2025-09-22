/**
 * 统一错误配置中心
 *
 * 集中管理所有错误相关的配置，包括错误映射、分类、严重性、可能原因、
 * 恢复建议和预防建议等。这个统一配置文件替代了之前分散在多个文件中的配置。
 *
 * 主要功能：
 * - 错误代码到类别的映射
 * - 错误严重性分级
 * - 可能原因分析
 * - 恢复建议提供
 * - 预防措施建议
 * - 统一的错误处理配置接口
 *
 * @fileoverview 统一错误配置中心 - 集中管理所有错误相关配置
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-17
 * @license MIT
 */

import { MySQLErrorCodes } from '../constants.js';
import { ErrorCategory, ErrorSeverity } from '../types.js';

/**
 * 错误代码到类别的映射表
 *
 * 将MySQL错误代码映射到对应的错误类别，用于错误分类。
 */
export const ERROR_CODE_MAPPING: Record<number, ErrorCategory> = {
  // 访问控制错误
  [MySQLErrorCodes.ACCESS_DENIED]: ErrorCategory.ACCESS_DENIED,
  [MySQLErrorCodes.ACCESS_DENIED_FOR_USER]: ErrorCategory.ACCESS_DENIED,
  [MySQLErrorCodes.TABLE_ACCESS_DENIED]: ErrorCategory.ACCESS_DENIED,
  [MySQLErrorCodes.COLUMN_ACCESS_DENIED]: ErrorCategory.ACCESS_DENIED,

  // 对象不存在错误
  [MySQLErrorCodes.UNKNOWN_DATABASE]: ErrorCategory.OBJECT_NOT_FOUND,
  [MySQLErrorCodes.TABLE_DOESNT_EXIST]: ErrorCategory.OBJECT_NOT_FOUND,
  [MySQLErrorCodes.UNKNOWN_COLUMN]: ErrorCategory.OBJECT_NOT_FOUND,
  [MySQLErrorCodes.UNKNOWN_TABLE]: ErrorCategory.OBJECT_NOT_FOUND,

  // 约束违反错误
  [MySQLErrorCodes.DUPLICATE_ENTRY]: ErrorCategory.CONSTRAINT_VIOLATION,
  [MySQLErrorCodes.DUPLICATE_ENTRY_WITH_KEY_NAME]: ErrorCategory.CONSTRAINT_VIOLATION,
  [MySQLErrorCodes.DUPLICATE_KEY_NAME]: ErrorCategory.CONSTRAINT_VIOLATION,

  // 语法错误
  [MySQLErrorCodes.PARSE_ERROR]: ErrorCategory.SYNTAX_ERROR,
  [MySQLErrorCodes.SYNTAX_ERROR]: ErrorCategory.SYNTAX_ERROR,
  [MySQLErrorCodes.PARSE_ERROR_NEAR]: ErrorCategory.SYNTAX_ERROR,

  // 连接错误
  [MySQLErrorCodes.CANT_CONNECT_TO_SERVER]: ErrorCategory.CONNECTION_ERROR,
  [MySQLErrorCodes.LOST_CONNECTION]: ErrorCategory.CONNECTION_ERROR,
  [MySQLErrorCodes.SERVER_HAS_GONE_AWAY]: ErrorCategory.CONNECTION_ERROR,

  // 死锁错误
  [MySQLErrorCodes.DEADLOCK]: ErrorCategory.DEADLOCK_ERROR,
  [MySQLErrorCodes.LOCK_WAIT_TIMEOUT]: ErrorCategory.LOCK_WAIT_TIMEOUT,

  // 查询中断
  [MySQLErrorCodes.QUERY_INTERRUPTED]: ErrorCategory.QUERY_INTERRUPTED,

  // SSL错误
  [MySQLErrorCodes.SSL_ERROR]: ErrorCategory.SSL_ERROR,
};

/**
 * 错误严重性映射表
 *
 * 将错误类别映射到对应的严重性级别。
 */
export const SEVERITY_MAPPING: Record<ErrorCategory, ErrorSeverity> = {
  [ErrorCategory.ACCESS_DENIED]: ErrorSeverity.HIGH,
  [ErrorCategory.OBJECT_NOT_FOUND]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CONSTRAINT_VIOLATION]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SYNTAX_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.CONNECTION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.SECURITY_VIOLATION]: ErrorSeverity.CRITICAL,
  [ErrorCategory.VALIDATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.RATE_LIMIT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.TIMEOUT_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.TRANSACTION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.RESOURCE_EXHAUSTED]: ErrorSeverity.HIGH,
  [ErrorCategory.NETWORK_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DATABASE_UNAVAILABLE]: ErrorSeverity.CRITICAL,
  [ErrorCategory.DATA_INTEGRITY_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DATA_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CONFIGURATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DEADLOCK_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.LOCK_WAIT_TIMEOUT]: ErrorSeverity.MEDIUM,
  [ErrorCategory.QUERY_INTERRUPTED]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SERVER_GONE_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.SERVER_LOST_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.SSL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.UNKNOWN]: ErrorSeverity.MEDIUM,

  // 新增错误类型的默认映射
  [ErrorCategory.MEMORY_LEAK]: ErrorSeverity.HIGH,
  [ErrorCategory.PERFORMANCE_DEGRADATION]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CONCURRENT_ACCESS_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DATA_CONSISTENCY_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DATA_PROCESSING]: ErrorSeverity.MEDIUM,
  [ErrorCategory.BACKUP_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DATA_EXPORT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.REPORT_GENERATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.REPLICATION_ERROR]: ErrorSeverity.CRITICAL,
  [ErrorCategory.AUTHENTICATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.AUTHORIZATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.QUOTA_EXCEEDED]: ErrorSeverity.MEDIUM,
  [ErrorCategory.MAINTENANCE_MODE]: ErrorSeverity.LOW,
  [ErrorCategory.VERSION_MISMATCH]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SCHEMA_MIGRATION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.INDEX_CORRUPTION]: ErrorSeverity.CRITICAL,
  [ErrorCategory.PARTITION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.FULLTEXT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SPATIAL_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.JSON_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.WINDOW_FUNCTION_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.CTE_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.TRIGGER_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.VIEW_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.STORED_PROCEDURE_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.FUNCTION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.EVENT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.PRIVILEGE_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.ROLE_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.PLUGIN_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CHARACTER_SET_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.COLLATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.TIMEZONE_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.LOCALE_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.ENCRYPTION_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.COMPRESSION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.AUDIT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.MONITORING_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.HEALTH_CHECK_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.LOAD_BALANCER_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.PROXY_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.FIREWALL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.DNS_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CERTIFICATE_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.TOKEN_EXPIRED]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SESSION_EXPIRED]: ErrorSeverity.LOW,
  [ErrorCategory.INVALID_INPUT]: ErrorSeverity.LOW,
  [ErrorCategory.BUSINESS_LOGIC_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.EXTERNAL_SERVICE_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.DEPENDENCY_ERROR]: ErrorSeverity.HIGH,
  [ErrorCategory.CIRCUIT_BREAKER_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.RETRY_EXHAUSTED]: ErrorSeverity.HIGH,
  [ErrorCategory.THROTTLED]: ErrorSeverity.MEDIUM,
  [ErrorCategory.DEGRADED_SERVICE]: ErrorSeverity.MEDIUM,
  [ErrorCategory.PARTIAL_FAILURE]: ErrorSeverity.MEDIUM,
  [ErrorCategory.CASCADING_FAILURE]: ErrorSeverity.CRITICAL,
  [ErrorCategory.SLOW_QUERY_LOG_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: ErrorSeverity.LOW,
};

/**
 * 错误严重性映射表（兼容性别名）
 */
export const ERROR_SEVERITY_MAPPING: Record<ErrorCategory, ErrorSeverity> = SEVERITY_MAPPING;

/**
 * 错误类别前缀映射表
 *
 * 将错误类别映射到对应的显示前缀。
 */
export const CATEGORY_PREFIX_MAPPING: Record<ErrorCategory, string> = {
  [ErrorCategory.ACCESS_DENIED]: '[访问拒绝]',
  [ErrorCategory.OBJECT_NOT_FOUND]: '[对象未找到]',
  [ErrorCategory.CONSTRAINT_VIOLATION]: '[约束违反]',
  [ErrorCategory.SYNTAX_ERROR]: '[语法错误]',
  [ErrorCategory.CONNECTION_ERROR]: '[连接错误]',
  [ErrorCategory.SECURITY_VIOLATION]: '[安全违规]',
  [ErrorCategory.VALIDATION_ERROR]: '[验证错误]',
  [ErrorCategory.RATE_LIMIT_ERROR]: '[速率限制]',
  [ErrorCategory.TIMEOUT_ERROR]: '[超时错误]',
  [ErrorCategory.TRANSACTION_ERROR]: '[事务错误]',
  [ErrorCategory.RESOURCE_EXHAUSTED]: '[资源耗尽]',
  [ErrorCategory.NETWORK_ERROR]: '[网络错误]',
  [ErrorCategory.DATABASE_UNAVAILABLE]: '[数据库不可用]',
  [ErrorCategory.DATA_INTEGRITY_ERROR]: '[数据完整性错误]',
  [ErrorCategory.DATA_ERROR]: '[数据错误]',
  [ErrorCategory.CONFIGURATION_ERROR]: '[配置错误]',
  [ErrorCategory.DEADLOCK_ERROR]: '[死锁错误]',
  [ErrorCategory.LOCK_WAIT_TIMEOUT]: '[锁等待超时]',
  [ErrorCategory.QUERY_INTERRUPTED]: '[查询中断]',
  [ErrorCategory.SERVER_GONE_ERROR]: '[服务器丢失]',
  [ErrorCategory.SERVER_LOST_ERROR]: '[服务器断开]',
  [ErrorCategory.SSL_ERROR]: '[SSL错误]',
  [ErrorCategory.UNKNOWN]: '[未知错误]',

  // 新增错误类型的默认前缀
  [ErrorCategory.MEMORY_LEAK]: '[内存泄漏]',
  [ErrorCategory.PERFORMANCE_DEGRADATION]: '[性能降级]',
  [ErrorCategory.CONCURRENT_ACCESS_ERROR]: '[并发访问错误]',
  [ErrorCategory.DATA_CONSISTENCY_ERROR]: '[数据一致性错误]',
  [ErrorCategory.DATA_PROCESSING]: '[数据处理]',
  [ErrorCategory.BACKUP_ERROR]: '[备份错误]',
  [ErrorCategory.DATA_EXPORT_ERROR]: '[数据导出错误]',
  [ErrorCategory.REPORT_GENERATION_ERROR]: '[报表生成错误]',
  [ErrorCategory.REPLICATION_ERROR]: '[复制错误]',
  [ErrorCategory.AUTHENTICATION_ERROR]: '[认证错误]',
  [ErrorCategory.AUTHORIZATION_ERROR]: '[授权错误]',
  [ErrorCategory.QUOTA_EXCEEDED]: '[配额超限]',
  [ErrorCategory.MAINTENANCE_MODE]: '[维护模式]',
  [ErrorCategory.VERSION_MISMATCH]: '[版本不匹配]',
  [ErrorCategory.SCHEMA_MIGRATION_ERROR]: '[架构迁移错误]',
  [ErrorCategory.INDEX_CORRUPTION]: '[索引损坏]',
  [ErrorCategory.PARTITION_ERROR]: '[分区错误]',
  [ErrorCategory.FULLTEXT_ERROR]: '[全文搜索错误]',
  [ErrorCategory.SPATIAL_ERROR]: '[空间数据错误]',
  [ErrorCategory.JSON_ERROR]: '[JSON错误]',
  [ErrorCategory.WINDOW_FUNCTION_ERROR]: '[窗口函数错误]',
  [ErrorCategory.CTE_ERROR]: '[CTE错误]',
  [ErrorCategory.TRIGGER_ERROR]: '[触发器错误]',
  [ErrorCategory.VIEW_ERROR]: '[视图错误]',
  [ErrorCategory.STORED_PROCEDURE_ERROR]: '[存储过程错误]',
  [ErrorCategory.FUNCTION_ERROR]: '[函数错误]',
  [ErrorCategory.EVENT_ERROR]: '[事件错误]',
  [ErrorCategory.PRIVILEGE_ERROR]: '[权限错误]',
  [ErrorCategory.ROLE_ERROR]: '[角色错误]',
  [ErrorCategory.PLUGIN_ERROR]: '[插件错误]',
  [ErrorCategory.CHARACTER_SET_ERROR]: '[字符集错误]',
  [ErrorCategory.COLLATION_ERROR]: '[排序规则错误]',
  [ErrorCategory.TIMEZONE_ERROR]: '[时区错误]',
  [ErrorCategory.LOCALE_ERROR]: '[区域设置错误]',
  [ErrorCategory.ENCRYPTION_ERROR]: '[加密错误]',
  [ErrorCategory.COMPRESSION_ERROR]: '[压缩错误]',
  [ErrorCategory.AUDIT_ERROR]: '[审计错误]',
  [ErrorCategory.MONITORING_ERROR]: '[监控错误]',
  [ErrorCategory.HEALTH_CHECK_ERROR]: '[健康检查错误]',
  [ErrorCategory.LOAD_BALANCER_ERROR]: '[负载均衡错误]',
  [ErrorCategory.PROXY_ERROR]: '[代理错误]',
  [ErrorCategory.FIREWALL_ERROR]: '[防火墙错误]',
  [ErrorCategory.DNS_ERROR]: '[DNS错误]',
  [ErrorCategory.CERTIFICATE_ERROR]: '[证书错误]',
  [ErrorCategory.TOKEN_EXPIRED]: '[令牌过期]',
  [ErrorCategory.SESSION_EXPIRED]: '[会话过期]',
  [ErrorCategory.INVALID_INPUT]: '[无效输入]',
  [ErrorCategory.BUSINESS_LOGIC_ERROR]: '[业务逻辑错误]',
  [ErrorCategory.EXTERNAL_SERVICE_ERROR]: '[外部服务错误]',
  [ErrorCategory.DEPENDENCY_ERROR]: '[依赖错误]',
  [ErrorCategory.CIRCUIT_BREAKER_ERROR]: '[熔断器错误]',
  [ErrorCategory.RETRY_EXHAUSTED]: '[重试耗尽]',
  [ErrorCategory.THROTTLED]: '[限流]',
  [ErrorCategory.DEGRADED_SERVICE]: '[服务降级]',
  [ErrorCategory.PARTIAL_FAILURE]: '[部分失败]',
  [ErrorCategory.CASCADING_FAILURE]: '[级联失败]',
  [ErrorCategory.SLOW_QUERY_LOG_ERROR]: '[慢查询日志错误]',
  [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: '[慢查询分析错误]',
  [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: '[慢查询配置错误]',
  [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: '[慢查询报告生成错误]',
  [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: '[慢查询监控错误]',
  [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: '[慢查询索引建议错误]',
};

/**
 * 错误可能原因映射表
 *
 * 为每个错误类别提供可能的原因列表，用于帮助诊断和分析。
 */
export const POSSIBLE_CAUSES: Record<ErrorCategory, string[]> = {
  [ErrorCategory.ACCESS_DENIED]: [
    '用户权限不足',
    '用户不存在或被禁用',
    '密码错误或过期',
    '从不允许的主机连接',
    '数据库权限配置错误'
  ],

  [ErrorCategory.OBJECT_NOT_FOUND]: [
    '数据库或表不存在',
    '列名拼写错误',
    '表名大小写不匹配',
    '权限不足导致无法看到对象',
    '对象被删除或重命名'
  ],

  [ErrorCategory.CONSTRAINT_VIOLATION]: [
    '主键或唯一键冲突',
    '外键约束违反',
    '数据类型不匹配',
    'NOT NULL约束违反',
    'CHECK约束失败'
  ],

  [ErrorCategory.SYNTAX_ERROR]: [
    'SQL语法错误',
    '关键字拼写错误',
    '缺少必要的分隔符',
    '引号配对错误',
    'MySQL版本不兼容的语法'
  ],

  [ErrorCategory.CONNECTION_ERROR]: [
    'MySQL服务未运行',
    '网络连接问题',
    '防火墙阻止连接',
    '连接数超出限制',
    '连接超时设置过短'
  ],

  [ErrorCategory.SECURITY_VIOLATION]: [
    'SQL注入攻击尝试',
    '权限提升攻击',
    '恶意查询检测',
    '访问模式异常'
  ],

  [ErrorCategory.VALIDATION_ERROR]: [
    '输入数据格式错误',
    '参数类型不匹配',
    '必需字段缺失',
    '数据范围超出限制'
  ],

  [ErrorCategory.RATE_LIMIT_ERROR]: [
    '请求频率过高',
    '并发连接数超限',
    '资源使用超配额',
    '防护机制触发'
  ],

  [ErrorCategory.TIMEOUT_ERROR]: [
    '查询执行时间过长',
    '网络延迟过高',
    '锁等待时间超时',
    '服务器响应延迟'
  ],

  [ErrorCategory.TRANSACTION_ERROR]: [
    '事务逻辑错误',
    '并发事务冲突',
    '死锁导致回滚',
    '事务嵌套问题'
  ],

  [ErrorCategory.RESOURCE_EXHAUSTED]: [
    '内存不足',
    '磁盘空间用尽',
    '连接池耗尽',
    '系统负载过高'
  ],

  [ErrorCategory.NETWORK_ERROR]: [
    '网络连接不稳定',
    'DNS解析失败',
    '路由配置错误',
    '网络设备故障'
  ],

  [ErrorCategory.DATABASE_UNAVAILABLE]: [
    '数据库服务停机',
    '主从切换进行中',
    '维护窗口期间',
    '灾难恢复进行中'
  ],

  [ErrorCategory.DATA_INTEGRITY_ERROR]: [
    '数据一致性检查失败',
    '引用完整性约束违反',
    '数据损坏或丢失',
    '版本冲突'
  ],

  [ErrorCategory.DATA_ERROR]: [
    '数据类型转换失败',
    '字符编码问题',
    '数值计算溢出',
    '日期格式错误'
  ],

  [ErrorCategory.CONFIGURATION_ERROR]: [
    '配置参数错误',
    '版本兼容性问题',
    '环境变量未设置',
    '权限配置不当'
  ],

  [ErrorCategory.DEADLOCK_ERROR]: [
    '事务执行顺序不当',
    '长时间持有锁',
    '表设计存在问题',
    '并发操作过多'
  ],

  [ErrorCategory.LOCK_WAIT_TIMEOUT]: [
    '锁竞争激烈',
    '事务持续时间过长',
    '批量操作阻塞',
    '索引锁定问题'
  ],

  [ErrorCategory.QUERY_INTERRUPTED]: [
    '查询被手动取消',
    '连接意外断开',
    '超时设置触发',
    '系统资源限制'
  ],

  [ErrorCategory.SERVER_GONE_ERROR]: [
    '服务器重启',
    '网络连接中断',
    '配置变更',
    '硬件故障'
  ],

  [ErrorCategory.SERVER_LOST_ERROR]: [
    '网络连接丢失',
    '服务器过载',
    '代理服务器问题',
    '连接池配置错误'
  ],

  [ErrorCategory.SSL_ERROR]: [
    'SSL证书过期',
    '证书配置错误',
    '加密算法不匹配',
    'CA证书问题'
  ],

  [ErrorCategory.UNKNOWN]: [
    '未知的系统错误',
    '驱动程序问题',
    '环境配置异常',
    '第三方组件故障'
  ],

  // 新增错误类别的可能原因
  [ErrorCategory.MEMORY_LEAK]: [
    '对象未正确释放',
    '循环引用导致内存泄漏',
    '缓存无限增长',
    '连接池未正确管理',
    '大对象长期持有'
  ],

  [ErrorCategory.PERFORMANCE_DEGRADATION]: [
    '索引缺失或不当',
    '查询优化器选择错误',
    '硬件资源不足',
    '数据量增长过快',
    '并发连接数过多'
  ],

  [ErrorCategory.CONCURRENT_ACCESS_ERROR]: [
    '多线程并发访问同一资源',
    '锁机制设计不当',
    '事务隔离级别配置错误',
    '共享资源未加锁保护',
    '异步操作竞态条件'
  ],

  [ErrorCategory.DATA_CONSISTENCY_ERROR]: [
    '主从复制延迟',
    '分布式事务失败',
    '数据同步机制故障',
    'ACID属性违反',
    '缓存与数据库不一致'
  ],

  [ErrorCategory.DATA_PROCESSING]: [
    '数据格式不符合预期',
    '批处理任务执行失败',
    'ETL流程中断',
    '数据转换逻辑错误',
    '大数据量处理超时'
  ],

  [ErrorCategory.BACKUP_ERROR]: [
    '备份存储空间不足',
    '备份权限配置错误',
    '备份过程中断',
    '备份文件损坏',
    '备份策略配置不当'
  ],

  [ErrorCategory.DATA_EXPORT_ERROR]: [
    '导出文件格式不支持',
    '导出权限不足',
    '导出数据量过大',
    '目标路径不可写',
    '字符编码转换失败'
  ],

  [ErrorCategory.REPORT_GENERATION_ERROR]: [
    '报表模板配置错误',
    '数据源连接失败',
    '报表引擎资源不足',
    '报表参数验证失败',
    '输出格式不支持'
  ],

  [ErrorCategory.REPLICATION_ERROR]: [
    '主从网络连接中断',
    '复制用户权限不足',
    'binlog文件损坏',
    '从库磁盘空间不足',
    '复制延迟过大'
  ],

  [ErrorCategory.AUTHENTICATION_ERROR]: [
    '用户凭据无效',
    '认证服务不可用',
    '密码策略不符合',
    '账户被锁定或禁用',
    '认证协议不匹配'
  ],

  [ErrorCategory.AUTHORIZATION_ERROR]: [
    '用户权限不足',
    '角色配置错误',
    '权限继承关系异常',
    '资源访问控制列表不当',
    '权限缓存过期'
  ],

  [ErrorCategory.QUOTA_EXCEEDED]: [
    '磁盘配额超限',
    '连接数配额用尽',
    '内存使用超出限制',
    'CPU时间配额耗尽',
    '并发操作数超限'
  ],

  [ErrorCategory.MAINTENANCE_MODE]: [
    '系统正在维护升级',
    '计划性停机维护',
    '数据库架构变更',
    '硬件维护进行中',
    '安全补丁安装'
  ],

  [ErrorCategory.VERSION_MISMATCH]: [
    '客户端与服务器版本不兼容',
    '驱动程序版本过旧',
    'API版本不匹配',
    '协议版本冲突',
    '依赖库版本不兼容'
  ],

  [ErrorCategory.SCHEMA_MIGRATION_ERROR]: [
    '迁移脚本语法错误',
    '迁移权限不足',
    '迁移过程中断',
    '版本控制冲突',
    '依赖对象缺失'
  ],

  [ErrorCategory.INDEX_CORRUPTION]: [
    '索引文件物理损坏',
    '异常关机导致索引不一致',
    '磁盘坏道影响索引',
    '并发操作破坏索引结构',
    '索引统计信息错误'
  ],

  [ErrorCategory.PARTITION_ERROR]: [
    '分区表达式错误',
    '分区数量超出限制',
    '分区剪枝失败',
    '分区键值超出范围',
    '分区元数据损坏'
  ],

  [ErrorCategory.FULLTEXT_ERROR]: [
    '全文索引配置错误',
    '搜索词过短或过长',
    '停用词表配置不当',
    '全文索引损坏',
    '字符集不支持全文搜索'
  ],

  [ErrorCategory.SPATIAL_ERROR]: [
    '空间数据格式错误',
    '空间索引配置不当',
    '几何运算溢出',
    '坐标系转换失败',
    '空间数据类型不匹配'
  ],

  [ErrorCategory.JSON_ERROR]: [
    'JSON格式不合法',
    'JSON路径表达式错误',
    'JSON数据类型转换失败',
    'JSON嵌套层级过深',
    'JSON数据大小超限'
  ],

  [ErrorCategory.WINDOW_FUNCTION_ERROR]: [
    '窗口函数语法错误',
    '分区子句配置不当',
    '排序子句缺失',
    '窗口框架定义错误',
    '聚合函数使用不当'
  ],

  [ErrorCategory.CTE_ERROR]: [
    '公用表表达式语法错误',
    '递归CTE无终止条件',
    'CTE引用关系错误',
    'CTE名称冲突',
    '递归层级过深'
  ],

  [ErrorCategory.TRIGGER_ERROR]: [
    '触发器语法错误',
    '触发器权限不足',
    '触发器递归调用',
    '触发器执行超时',
    '触发器中访问无效对象'
  ],

  [ErrorCategory.VIEW_ERROR]: [
    '视图定义语法错误',
    '视图引用的表不存在',
    '视图权限不足',
    '视图递归定义',
    '视图更新规则冲突'
  ],

  [ErrorCategory.STORED_PROCEDURE_ERROR]: [
    '存储过程语法错误',
    '参数类型不匹配',
    '存储过程权限不足',
    '存储过程执行超时',
    '变量作用域错误'
  ],

  [ErrorCategory.FUNCTION_ERROR]: [
    '用户自定义函数语法错误',
    '函数参数个数不匹配',
    '函数返回类型错误',
    '函数执行权限不足',
    '函数中访问无效资源'
  ],

  [ErrorCategory.EVENT_ERROR]: [
    '事件调度器未启用',
    '事件语法定义错误',
    '事件执行权限不足',
    '事件执行时间配置错误',
    '事件执行异常终止'
  ],

  [ErrorCategory.PRIVILEGE_ERROR]: [
    '数据库权限分配不当',
    '表级权限缺失',
    '列级权限限制',
    '存储过程执行权限不足',
    '系统权限配置错误'
  ],

  [ErrorCategory.ROLE_ERROR]: [
    '角色定义不存在',
    '角色继承关系错误',
    '角色权限分配不当',
    '角色激活状态异常',
    '角色循环继承'
  ],

  [ErrorCategory.PLUGIN_ERROR]: [
    '插件未正确安装',
    '插件版本不兼容',
    '插件配置参数错误',
    '插件依赖缺失',
    '插件许可证过期'
  ],

  [ErrorCategory.CHARACTER_SET_ERROR]: [
    '字符集不支持',
    '字符集转换失败',
    '字符编码配置错误',
    '多字节字符处理异常',
    '字符集兼容性问题'
  ],

  [ErrorCategory.COLLATION_ERROR]: [
    '排序规则不存在',
    '排序规则与字符集不匹配',
    '比较操作排序规则冲突',
    '索引排序规则不一致',
    '排序规则版本不兼容'
  ],

  [ErrorCategory.TIMEZONE_ERROR]: [
    '时区名称不存在',
    '时区数据文件损坏',
    '时区转换计算错误',
    '夏令时规则变更',
    '时区配置与系统不一致'
  ],

  [ErrorCategory.LOCALE_ERROR]: [
    '区域设置不支持',
    '本地化资源文件缺失',
    '日期时间格式错误',
    '数字格式本地化失败',
    '语言环境配置不当'
  ],

  [ErrorCategory.ENCRYPTION_ERROR]: [
    '加密密钥不存在或无效',
    '加密算法不支持',
    '密钥管理服务不可用',
    '加密数据损坏',
    '密钥轮换失败'
  ],

  [ErrorCategory.COMPRESSION_ERROR]: [
    '压缩算法不支持',
    '压缩数据损坏',
    '解压缩内存不足',
    '压缩级别配置错误',
    '压缩格式版本不兼容'
  ],

  [ErrorCategory.AUDIT_ERROR]: [
    '审计日志配置错误',
    '审计存储空间不足',
    '审计插件未启用',
    '审计权限不足',
    '审计日志文件损坏'
  ],

  [ErrorCategory.MONITORING_ERROR]: [
    '监控服务连接失败',
    '监控指标配置错误',
    '监控数据收集异常',
    '监控告警规则不当',
    '监控存储后端故障'
  ],

  [ErrorCategory.HEALTH_CHECK_ERROR]: [
    '健康检查超时',
    '健康检查端点不可达',
    '健康检查配置错误',
    '依赖服务健康状态异常',
    '健康检查频率过高'
  ],

  [ErrorCategory.LOAD_BALANCER_ERROR]: [
    '负载均衡器配置错误',
    '后端服务器不可用',
    '负载均衡算法失效',
    '健康检查失败',
    '会话亲和性配置问题'
  ],

  [ErrorCategory.PROXY_ERROR]: [
    '代理服务器连接失败',
    '代理认证失败',
    '代理配置错误',
    '代理超时设置不当',
    '代理协议不匹配'
  ],

  [ErrorCategory.FIREWALL_ERROR]: [
    '防火墙规则阻止连接',
    '端口未开放',
    'IP地址被拒绝',
    '防火墙配置错误',
    'WAF规则误拦截'
  ],

  [ErrorCategory.DNS_ERROR]: [
    'DNS服务器不可达',
    '域名解析失败',
    'DNS记录配置错误',
    'DNS缓存污染',
    'DNS服务器响应超时'
  ],

  [ErrorCategory.CERTIFICATE_ERROR]: [
    'SSL证书过期',
    '证书链验证失败',
    '证书域名不匹配',
    '根证书不受信任',
    '证书格式错误'
  ],

  [ErrorCategory.TOKEN_EXPIRED]: [
    '访问令牌超过有效期',
    '令牌签名验证失败',
    '令牌格式不正确',
    '令牌被撤销',
    '令牌颁发者不可信'
  ],

  [ErrorCategory.SESSION_EXPIRED]: [
    '用户会话超时',
    '会话令牌无效',
    '会话存储服务不可用',
    '会话数据损坏',
    '并发会话数限制'
  ],

  [ErrorCategory.INVALID_INPUT]: [
    '输入参数格式错误',
    '必需参数缺失',
    '参数值超出范围',
    '参数类型不匹配',
    '输入数据验证失败'
  ],

  [ErrorCategory.BUSINESS_LOGIC_ERROR]: [
    '业务规则违反',
    '工作流状态异常',
    '业务约束检查失败',
    '数据状态不一致',
    '业务逻辑配置错误'
  ],

  [ErrorCategory.EXTERNAL_SERVICE_ERROR]: [
    '外部API服务不可用',
    '第三方服务响应超时',
    '外部服务认证失败',
    'API调用频率超限',
    '外部服务数据格式异常'
  ],

  [ErrorCategory.DEPENDENCY_ERROR]: [
    '依赖服务不可用',
    '依赖版本不兼容',
    '依赖配置错误',
    '依赖循环引用',
    '关键依赖缺失'
  ],

  [ErrorCategory.CIRCUIT_BREAKER_ERROR]: [
    '熔断器开启状态',
    '失败率超过阈值',
    '熔断器配置不当',
    '服务恢复检测失败',
    '熔断器状态同步异常'
  ],

  [ErrorCategory.RETRY_EXHAUSTED]: [
    '重试次数达到上限',
    '重试间隔配置不当',
    '持续性系统故障',
    '重试策略选择错误',
    '资源持续不可用'
  ],

  [ErrorCategory.THROTTLED]: [
    '请求频率超过限制',
    '资源使用配额耗尽',
    '并发请求数过多',
    '限流规则触发',
    '系统负载保护机制'
  ],

  [ErrorCategory.DEGRADED_SERVICE]: [
    '服务部分功能不可用',
    '性能指标下降',
    '资源容量不足',
    '依赖服务异常',
    '负载均衡器故障'
  ],

  [ErrorCategory.PARTIAL_FAILURE]: [
    '批处理部分失败',
    '分布式操作部分成功',
    '多节点部分响应',
    '事务部分回滚',
    '数据同步部分失败'
  ],

  [ErrorCategory.CASCADING_FAILURE]: [
    '下游服务故障扩散',
    '资源竞争加剧',
    '错误处理机制失效',
    '系统边界防护不当',
    '故障隔离机制缺失'
  ],

  [ErrorCategory.SLOW_QUERY_LOG_ERROR]: [
    '慢查询日志配置错误',
    '日志文件权限不足',
    '日志存储空间不足',
    '日志格式解析失败',
    '日志轮转配置问题'
  ],

  [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: [
    '查询分析工具故障',
    '分析算法配置错误',
    '统计数据不完整',
    '分析结果解析失败',
    '性能基线数据缺失'
  ],

  [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: [
    '慢查询阈值设置不当',
    '监控规则配置错误',
    '采样率设置问题',
    '过滤条件配置错误',
    '存储配置参数异常'
  ],

  [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: [
    '报告模板加载失败',
    '数据聚合计算错误',
    '报告格式化异常',
    '报告输出路径不可写',
    '报告生成超时'
  ],

  [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: [
    '监控服务连接异常',
    '监控指标收集失败',
    '告警规则触发异常',
    '监控数据传输错误',
    '实时监控延迟过高'
  ],

  [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: [
    '索引分析算法失败',
    '查询计划解析错误',
    '统计信息不准确',
    '索引建议生成异常',
    '成本估算计算错误'
  ]
};

/**
 * 错误恢复建议映射表
 *
 * 将错误类别映射到对应的恢复建议列表。
 */
export const RECOVERY_SUGGESTIONS: Record<ErrorCategory, string[]> = {
  [ErrorCategory.ACCESS_DENIED]: [
    "检查用户名和密码是否正确",
    "验证用户是否具有足够的权限",
    "确认MySQL用户账户状态正常",
    "检查主机连接权限设置"
  ],
  [ErrorCategory.OBJECT_NOT_FOUND]: [
    "验证数据库、表或列名是否存在",
    "检查拼写和大小写是否正确",
    "确认当前连接的数据库是否正确",
    "查看对象是否已被删除或重命名"
  ],
  [ErrorCategory.CONSTRAINT_VIOLATION]: [
    "检查重复键值，考虑使用INSERT IGNORE或ON DUPLICATE KEY UPDATE",
    "验证外键约束是否满足",
    "确认数据类型和长度限制",
    "检查NOT NULL约束违反"
  ],
  [ErrorCategory.SYNTAX_ERROR]: [
    "检查SQL语法是否正确",
    "验证保留字是否正确使用",
    "确认引号和括号是否配对",
    "检查函数名和参数是否正确"
  ],
  [ErrorCategory.CONNECTION_ERROR]: [
    "检查MySQL服务是否运行",
    "验证网络连接是否正常",
    "确认防火墙设置允许连接",
    "检查连接超时设置是否合理"
  ],
  [ErrorCategory.SECURITY_VIOLATION]: [
    "立即检查输入数据的来源和内容",
    "实施更严格的输入验证",
    "审查应用程序的安全措施",
    "启用详细的安全审计日志"
  ],
  [ErrorCategory.VALIDATION_ERROR]: [
    "验证输入数据格式是否正确",
    "检查参数类型和值范围",
    "确认必需字段是否提供",
    "使用合适的数据类型转换"
  ],
  [ErrorCategory.RATE_LIMIT_ERROR]: [
    "降低请求频率",
    "实施请求队列管理",
    "增加连接池大小",
    "使用缓存减少数据库访问"
  ],
  [ErrorCategory.TIMEOUT_ERROR]: [
    "增加查询超时设置",
    "优化查询性能",
    "添加适当的索引",
    "分解复杂查询为简单操作"
  ],
  [ErrorCategory.TRANSACTION_ERROR]: [
    "检查事务逻辑是否正确",
    "确保事务正确提交或回滚",
    "避免长时间运行的事务",
    "使用适当的事务隔离级别"
  ],
  [ErrorCategory.RESOURCE_EXHAUSTED]: [
    "增加系统内存配置",
    "清理不必要的连接",
    "优化查询减少资源使用",
    "扩展磁盘空间"
  ],
  [ErrorCategory.NETWORK_ERROR]: [
    "检查网络连接稳定性",
    "验证DNS配置是否正确",
    "确认路由设置",
    "联系网络管理员"
  ],
  [ErrorCategory.DATABASE_UNAVAILABLE]: [
    "等待数据库服务恢复",
    "检查数据库服务状态",
    "联系数据库管理员",
    "使用备用数据库连接"
  ],
  [ErrorCategory.DATA_INTEGRITY_ERROR]: [
    "执行数据一致性检查",
    "修复数据完整性约束",
    "恢复到已知良好的数据状态",
    "联系数据库管理员进行数据修复"
  ],
  [ErrorCategory.DATA_ERROR]: [
    "检查数据类型是否匹配",
    "验证字符编码设置",
    "使用适当的数据转换函数",
    "检查数值范围和精度"
  ],
  [ErrorCategory.CONFIGURATION_ERROR]: [
    "检查配置文件语法",
    "验证环境变量设置",
    "确认版本兼容性",
    "恢复到已知正确的配置"
  ],
  [ErrorCategory.DEADLOCK_ERROR]: [
    "实施重试机制处理死锁",
    "优化事务逻辑减少锁持有时间",
    "按统一顺序访问表和行",
    "考虑降低事务隔离级别"
  ],
  [ErrorCategory.LOCK_WAIT_TIMEOUT]: [
    "增加锁等待超时时间",
    "优化查询减少锁定时间",
    "避免长时间运行的事务",
    "添加适当的索引减少锁竞争"
  ],
  [ErrorCategory.QUERY_INTERRUPTED]: [
    "重新执行被中断的查询",
    "检查连接稳定性",
    "增加查询超时设置",
    "优化查询性能"
  ],
  [ErrorCategory.SERVER_GONE_ERROR]: [
    "重新建立数据库连接",
    "检查服务器状态",
    "验证网络连接",
    "联系系统管理员"
  ],
  [ErrorCategory.SERVER_LOST_ERROR]: [
    "尝试重新连接数据库",
    "检查网络连接状态",
    "验证连接池配置",
    "联系网络管理员"
  ],
  [ErrorCategory.SSL_ERROR]: [
    "检查SSL证书有效性",
    "验证证书配置",
    "更新过期的证书",
    "确认加密算法兼容性"
  ],
  [ErrorCategory.UNKNOWN]: [
    "记录详细错误信息",
    "联系技术支持",
    "检查系统日志",
    "尝试重新启动相关服务"
  ],

  // 新增错误类别的恢复建议
  [ErrorCategory.MEMORY_LEAK]: [
    "重启应用释放内存",
    "检查和修复内存泄漏代码",
    "增加JVM内存配置",
    "实施内存监控和告警",
    "优化缓存使用策略"
  ],

  [ErrorCategory.PERFORMANCE_DEGRADATION]: [
    "分析慢查询日志",
    "添加缺失的索引",
    "优化查询语句",
    "增加硬件资源",
    "实施查询缓存策略"
  ],

  [ErrorCategory.CONCURRENT_ACCESS_ERROR]: [
    "实施重试机制",
    "优化锁策略减少竞争",
    "调整事务隔离级别",
    "使用乐观锁代替悲观锁",
    "分离读写操作"
  ],

  [ErrorCategory.DATA_CONSISTENCY_ERROR]: [
    "执行数据一致性检查",
    "修复数据不一致问题",
    "启用强一致性模式",
    "检查主从复制状态",
    "实施分布式事务"
  ],

  [ErrorCategory.DATA_PROCESSING]: [
    "验证数据格式",
    "调整批处理大小",
    "增加处理超时时间",
    "实施数据清洗",
    "使用流式处理代替批处理"
  ],

  [ErrorCategory.BACKUP_ERROR]: [
    "检查备份存储空间",
    "验证备份权限配置",
    "重新执行备份操作",
    "使用增量备份策略",
    "检查备份文件完整性"
  ],

  [ErrorCategory.DATA_EXPORT_ERROR]: [
    "检查导出权限",
    "验证导出路径可写性",
    "分批导出大数据集",
    "选择合适的导出格式",
    "检查字符编码设置"
  ],

  [ErrorCategory.REPORT_GENERATION_ERROR]: [
    "检查报表模板配置",
    "验证数据源连接",
    "增加报表生成资源",
    "简化报表复杂度",
    "使用异步报表生成"
  ],

  [ErrorCategory.REPLICATION_ERROR]: [
    "检查主从网络连接",
    "验证复制用户权限",
    "修复损坏的binlog文件",
    "重建从库复制",
    "调整复制参数"
  ],

  [ErrorCategory.AUTHENTICATION_ERROR]: [
    "验证用户凭证",
    "重置用户密码",
    "检查认证服务状态",
    "更新认证配置",
    "启用备用认证方式"
  ],

  [ErrorCategory.AUTHORIZATION_ERROR]: [
    "检查用户权限设置",
    "更新角色权限配置",
    "刷新权限缓存",
    "重新分配必要权限",
    "联系管理员授予权限"
  ],

  [ErrorCategory.QUOTA_EXCEEDED]: [
    "清理不必要的数据",
    "申请增加配额",
    "优化资源使用",
    "实施数据归档",
    "升级服务计划"
  ],

  [ErrorCategory.MAINTENANCE_MODE]: [
    "等待维护完成",
    "使用备用系统",
    "推迟非紧急操作",
    "联系管理员确认维护时间",
    "启用只读模式"
  ],

  [ErrorCategory.VERSION_MISMATCH]: [
    "升级客户端版本",
    "使用兼容的API版本",
    "检查版本兼容性",
    "更新驱动程序",
    "联系技术支持确认兼容性"
  ],

  [ErrorCategory.SCHEMA_MIGRATION_ERROR]: [
    "检查迁移脚本语法",
    "验证迁移权限",
    "回滚到上一个版本",
    "分步执行迁移",
    "备份数据后重新迁移"
  ],

  [ErrorCategory.INDEX_CORRUPTION]: [
    "重建损坏的索引",
    "执行表修复操作",
    "从备份恢复索引",
    "检查磁盘硬件状态",
    "联系数据库管理员"
  ],

  [ErrorCategory.PARTITION_ERROR]: [
    "检查分区表达式",
    "修复分区元数据",
    "重新组织分区",
    "清理无效分区",
    "重建分区表"
  ],

  [ErrorCategory.FULLTEXT_ERROR]: [
    "重建全文索引",
    "检查全文索引配置",
    "调整搜索词长度",
    "更新停用词表",
    "修复索引文件"
  ],

  [ErrorCategory.SPATIAL_ERROR]: [
    "验证空间数据格式",
    "重建空间索引",
    "检查坐标系配置",
    "使用正确的空间函数",
    "更新空间数据类型"
  ],

  [ErrorCategory.JSON_ERROR]: [
    "验证JSON格式",
    "检查JSON路径表达式",
    "使用JSON验证函数",
    "调整JSON数据大小",
    "修复JSON数据结构"
  ],

  [ErrorCategory.WINDOW_FUNCTION_ERROR]: [
    "检查窗口函数语法",
    "添加ORDER BY子句",
    "修正分区表达式",
    "调整窗口框架定义",
    "使用正确的聚合函数"
  ],

  [ErrorCategory.CTE_ERROR]: [
    "检查CTE语法",
    "添加递归终止条件",
    "修正CTE引用关系",
    "重命名CTE避免冲突",
    "限制递归深度"
  ],

  [ErrorCategory.TRIGGER_ERROR]: [
    "检查触发器语法",
    "验证触发器权限",
    "修复触发器逻辑",
    "增加触发器超时时间",
    "避免触发器递归调用"
  ],

  [ErrorCategory.VIEW_ERROR]: [
    "检查视图定义",
    "验证基表存在性",
    "更新视图权限",
    "修复视图引用",
    "重新创建视图"
  ],

  [ErrorCategory.STORED_PROCEDURE_ERROR]: [
    "检查存储过程语法",
    "验证参数类型",
    "增加存储过程权限",
    "调试存储过程逻辑",
    "增加执行超时时间"
  ],

  [ErrorCategory.FUNCTION_ERROR]: [
    "检查函数定义",
    "验证参数匹配",
    "修正返回类型",
    "增加函数执行权限",
    "优化函数性能"
  ],

  [ErrorCategory.EVENT_ERROR]: [
    "启用事件调度器",
    "检查事件定义",
    "验证事件权限",
    "修正事件时间配置",
    "调试事件逻辑"
  ],

  [ErrorCategory.PRIVILEGE_ERROR]: [
    "检查用户权限",
    "分配必要权限",
    "更新权限配置",
    "刷新权限缓存",
    "联系数据库管理员"
  ],

  [ErrorCategory.ROLE_ERROR]: [
    "检查角色定义",
    "修复角色继承关系",
    "激活用户角色",
    "更新角色权限",
    "重新分配角色"
  ],

  [ErrorCategory.PLUGIN_ERROR]: [
    "重新安装插件",
    "更新插件版本",
    "检查插件配置",
    "安装插件依赖",
    "更新插件许可证"
  ],

  [ErrorCategory.CHARACTER_SET_ERROR]: [
    "设置正确的字符集",
    "转换字符编码",
    "更新字符集配置",
    "使用支持的字符集",
    "修复字符编码问题"
  ],

  [ErrorCategory.COLLATION_ERROR]: [
    "使用有效的排序规则",
    "匹配字符集和排序规则",
    "统一排序规则设置",
    "更新索引排序规则",
    "检查排序规则兼容性"
  ],

  [ErrorCategory.TIMEZONE_ERROR]: [
    "设置正确的时区",
    "更新时区数据文件",
    "同步时区配置",
    "修复时区转换",
    "使用UTC时间"
  ],

  [ErrorCategory.LOCALE_ERROR]: [
    "设置支持的区域",
    "安装本地化资源",
    "修正日期时间格式",
    "更新语言环境",
    "使用标准本地化设置"
  ],

  [ErrorCategory.ENCRYPTION_ERROR]: [
    "更新加密密钥",
    "修复加密配置",
    "重新初始化加密",
    "联系密钥管理服务",
    "使用正确的加密算法"
  ],

  [ErrorCategory.COMPRESSION_ERROR]: [
    "检查压缩算法支持",
    "修复压缩数据",
    "增加解压缩内存",
    "调整压缩级别",
    "更新压缩格式"
  ],

  [ErrorCategory.AUDIT_ERROR]: [
    "检查审计配置",
    "清理审计日志空间",
    "启用审计插件",
    "修复审计权限",
    "重建审计日志"
  ],

  [ErrorCategory.MONITORING_ERROR]: [
    "重连监控服务",
    "检查监控配置",
    "修复监控指标",
    "更新告警规则",
    "联系监控服务提供商"
  ],

  [ErrorCategory.HEALTH_CHECK_ERROR]: [
    "增加健康检查超时",
    "修复健康检查端点",
    "更新健康检查配置",
    "检查依赖服务状态",
    "降低健康检查频率"
  ],

  [ErrorCategory.LOAD_BALANCER_ERROR]: [
    "检查负载均衡配置",
    "修复后端服务器",
    "更新健康检查设置",
    "调整负载均衡算法",
    "重启负载均衡器"
  ],

  [ErrorCategory.PROXY_ERROR]: [
    "检查代理服务器状态",
    "更新代理认证信息",
    "修正代理配置",
    "调整代理超时设置",
    "使用直连方式"
  ],

  [ErrorCategory.FIREWALL_ERROR]: [
    "更新防火墙规则",
    "开放必要端口",
    "添加IP白名单",
    "检查防火墙配置",
    "联系网络管理员"
  ],

  [ErrorCategory.DNS_ERROR]: [
    "检查DNS服务器",
    "清理DNS缓存",
    "更新DNS记录",
    "使用备用DNS",
    "配置本地hosts文件"
  ],

  [ErrorCategory.CERTIFICATE_ERROR]: [
    "更新SSL证书",
    "修复证书链",
    "验证证书域名",
    "安装根证书",
    "重新生成证书"
  ],

  [ErrorCategory.TOKEN_EXPIRED]: [
    "刷新访问令牌",
    "重新获取令牌",
    "检查令牌格式",
    "验证令牌签名",
    "联系认证服务"
  ],

  [ErrorCategory.SESSION_EXPIRED]: [
    "重新登录系统",
    "刷新会话令牌",
    "检查会话存储",
    "修复会话数据",
    "增加会话超时时间"
  ],

  [ErrorCategory.INVALID_INPUT]: [
    "验证输入格式",
    "提供必需参数",
    "调整参数值范围",
    "使用正确的数据类型",
    "实施输入验证"
  ],

  [ErrorCategory.BUSINESS_LOGIC_ERROR]: [
    "检查业务规则",
    "修正工作流状态",
    "更新业务配置",
    "修复数据状态",
    "联系业务分析师"
  ],

  [ErrorCategory.EXTERNAL_SERVICE_ERROR]: [
    "检查外部服务状态",
    "使用备用服务",
    "增加服务超时时间",
    "更新API认证",
    "实施服务降级"
  ],

  [ErrorCategory.DEPENDENCY_ERROR]: [
    "检查依赖服务状态",
    "更新依赖版本",
    "修复依赖配置",
    "解决循环依赖",
    "安装缺失依赖"
  ],

  [ErrorCategory.CIRCUIT_BREAKER_ERROR]: [
    "等待熔断器恢复",
    "调整熔断器阈值",
    "修复底层服务",
    "手动重置熔断器",
    "实施服务降级"
  ],

  [ErrorCategory.RETRY_EXHAUSTED]: [
    "检查系统状态",
    "增加重试次数",
    "调整重试间隔",
    "修复底层问题",
    "实施手动处理"
  ],

  [ErrorCategory.THROTTLED]: [
    "降低请求频率",
    "使用请求队列",
    "分散请求时间",
    "申请提高限制",
    "优化请求效率"
  ],

  [ErrorCategory.DEGRADED_SERVICE]: [
    "检查服务健康状态",
    "修复异常组件",
    "增加资源容量",
    "实施负载分担",
    "启用备用服务"
  ],

  [ErrorCategory.PARTIAL_FAILURE]: [
    "重试失败的部分",
    "检查失败原因",
    "实施补偿操作",
    "记录失败详情",
    "手动处理失败项"
  ],

  [ErrorCategory.CASCADING_FAILURE]: [
    "立即启用断路器",
    "隔离故障组件",
    "实施紧急降级",
    "恢复关键服务",
    "联系运维团队"
  ],

  [ErrorCategory.SLOW_QUERY_LOG_ERROR]: [
    "修复慢查询日志配置",
    "检查日志文件权限",
    "清理日志存储空间",
    "修复日志格式",
    "重新配置日志轮转"
  ],

  [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: [
    "重启分析工具",
    "检查分析配置",
    "补充统计数据",
    "修复分析算法",
    "更新性能基线"
  ],

  [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: [
    "调整慢查询阈值",
    "修正监控规则",
    "更新采样配置",
    "修复过滤条件",
    "重新配置存储参数"
  ],

  [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: [
    "重新加载报告模板",
    "修复数据聚合",
    "调整报告格式",
    "检查输出路径",
    "增加生成超时时间"
  ],

  [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: [
    "重连监控服务",
    "修复指标收集",
    "更新告警规则",
    "检查数据传输",
    "降低监控延迟"
  ],

  [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: [
    "重新分析查询计划",
    "更新表统计信息",
    "修复索引分析算法",
    "重新生成索引建议",
    "手动分析查询性能"
  ]
};

/**
 * 错误预防建议映射表
 *
 * 为每个错误类别提供预防建议列表，用于帮助避免同类错误。
 */
export const PREVENTION_TIPS: Record<ErrorCategory, string[]> = {
  [ErrorCategory.ACCESS_DENIED]: [
    "使用强密码并定期更换",
    "实施最小权限原则",
    "监控用户访问模式",
    "启用连接审计日志"
  ],
  [ErrorCategory.OBJECT_NOT_FOUND]: [
    "使用参数化查询避免拼写错误",
    "实施数据库模式版本控制",
    "添加对象存在性检查",
    "使用正确的命名约定"
  ],
  [ErrorCategory.CONSTRAINT_VIOLATION]: [
    "添加适当的数据验证",
    "使用事务确保数据一致性",
    "实施重试机制处理临时冲突",
    "设计合理的数据模型"
  ],
  [ErrorCategory.SYNTAX_ERROR]: [
    "使用SQL语法检查工具",
    "实施代码审查流程",
    "使用ORM或查询构建器",
    "添加SQL单元测试"
  ],
  [ErrorCategory.CONNECTION_ERROR]: [
    "实施连接池管理",
    "添加连接健康检查",
    "设置合理的超时值",
    "监控连接使用情况"
  ],
  [ErrorCategory.SECURITY_VIOLATION]: [
    "实施严格的输入验证",
    "使用参数化查询防止SQL注入",
    "启用安全审计日志",
    "实施访问控制策略"
  ],
  [ErrorCategory.VALIDATION_ERROR]: [
    "实施客户端和服务端双重验证",
    "使用数据类型安全的编程语言特性",
    "添加输入数据清理机制",
    "定义明确的数据验证规则"
  ],
  [ErrorCategory.RATE_LIMIT_ERROR]: [
    "实施智能请求限流",
    "使用缓存减少数据库压力",
    "监控系统负载情况",
    "设计优雅的降级机制"
  ],
  [ErrorCategory.TIMEOUT_ERROR]: [
    "优化查询性能",
    "设置合理的超时值",
    "监控查询执行时间",
    "添加查询性能告警"
  ],
  [ErrorCategory.TRANSACTION_ERROR]: [
    "设计简洁的事务逻辑",
    "避免长时间运行的事务",
    "实施事务监控",
    "使用适当的隔离级别"
  ],
  [ErrorCategory.RESOURCE_EXHAUSTED]: [
    "监控系统资源使用情况",
    "实施资源配额管理",
    "设置资源使用告警",
    "定期清理无用资源"
  ],
  [ErrorCategory.NETWORK_ERROR]: [
    "实施网络连接监控",
    "使用多个网络路径",
    "设置网络超时和重试",
    "定期检查网络配置"
  ],
  [ErrorCategory.DATABASE_UNAVAILABLE]: [
    "实施数据库高可用架构",
    "设置自动故障转移",
    "监控数据库服务状态",
    "制定灾难恢复计划"
  ],
  [ErrorCategory.DATA_INTEGRITY_ERROR]: [
    "实施数据完整性检查",
    "使用事务确保数据一致性",
    "定期备份重要数据",
    "实施数据版本控制"
  ],
  [ErrorCategory.DATA_ERROR]: [
    "实施严格的数据类型检查",
    "使用适当的字符编码",
    "添加数据范围验证",
    "实施数据清洗流程"
  ],
  [ErrorCategory.CONFIGURATION_ERROR]: [
    "实施配置管理版本控制",
    "添加配置验证检查",
    "使用配置模板",
    "实施配置变更审批流程"
  ],
  [ErrorCategory.DEADLOCK_ERROR]: [
    "设计避免死锁的事务模式",
    "按统一顺序访问资源",
    "减少事务持有锁的时间",
    "添加适当的索引"
  ],
  [ErrorCategory.LOCK_WAIT_TIMEOUT]: [
    "优化查询减少锁定时间",
    "使用合适的索引策略",
    "避免在高峰期执行长事务",
    "监控锁等待情况"
  ],
  [ErrorCategory.QUERY_INTERRUPTED]: [
    "设置合理的查询超时",
    "优化查询性能",
    "实施查询监控",
    "添加查询重试机制"
  ],
  [ErrorCategory.SERVER_GONE_ERROR]: [
    "实施服务器健康监控",
    "设置自动重连机制",
    "使用连接池管理",
    "监控服务器资源使用"
  ],
  [ErrorCategory.SERVER_LOST_ERROR]: [
    "实施网络连接监控",
    "使用心跳检测机制",
    "设置连接超时和重试",
    "监控网络质量"
  ],
  [ErrorCategory.SSL_ERROR]: [
    "定期更新SSL证书",
    "监控证书过期时间",
    "使用标准的加密算法",
    "实施SSL配置检查"
  ],
  [ErrorCategory.UNKNOWN]: [
    "实施详细的错误日志记录",
    "添加系统监控告警",
    "定期更新系统组件",
    "建立错误处理最佳实践"
  ],

  // 新增错误类别的预防建议
  [ErrorCategory.MEMORY_LEAK]: [
    "定期进行内存分析",
    "实施内存使用监控",
    "使用内存泄漏检测工具",
    "实施对象池管理",
    "定期重启高内存使用组件"
  ],

  [ErrorCategory.PERFORMANCE_DEGRADATION]: [
    "定期性能基线测试",
    "监控查询执行时间",
    "定期索引优化分析",
    "实施容量规划",
    "使用性能监控工具"
  ],

  [ErrorCategory.CONCURRENT_ACCESS_ERROR]: [
    "设计无锁编程模式",
    "使用事务级别隔离",
    "实施乐观锁策略",
    "设计合理的锁粒度",
    "避免长时间持锁"
  ],

  [ErrorCategory.DATA_CONSISTENCY_ERROR]: [
    "实施事务一致性检查",
    "使用分布式事务",
    "实施数据版本控制",
    "监控主从复制延迟",
    "设计幂等操作"
  ],

  [ErrorCategory.DATA_PROCESSING]: [
    "实施数据格式验证",
    "使用流式处理架构",
    "设计容错数据处理",
    "实施数据质量监控",
    "建立数据处理管道"
  ],

  [ErrorCategory.BACKUP_ERROR]: [
    "实施自动化备份策略",
    "监控备份存储空间",
    "定期备份恢复测试",
    "使用多种备份媒介",
    "实施备份加密策略"
  ],

  [ErrorCategory.DATA_EXPORT_ERROR]: [
    "验证导出数据格式",
    "实施分批导出策略",
    "监控导出数据大小",
    "设计导出权限控制",
    "使用标准化导出格式"
  ],

  [ErrorCategory.REPORT_GENERATION_ERROR]: [
    "使用报表模板系统",
    "实施报表缓存策略",
    "设计异步报表生成",
    "监控报表生成性能",
    "定期检查报表质量"
  ],

  [ErrorCategory.REPLICATION_ERROR]: [
    "实施高可用复制架构",
    "监控复制延迟指标",
    "定期复制健康检查",
    "使用复制监控工具",
    "实施复制故障转移"
  ],

  [ErrorCategory.AUTHENTICATION_ERROR]: [
    "实施强密码策略",
    "使用多因子认证",
    "定期轮换认证凭证",
    "监控认证失败次数",
    "实施认证服务备份"
  ],

  [ErrorCategory.AUTHORIZATION_ERROR]: [
    "实施最小权限原则",
    "定期审计用户权限",
    "使用基于角色的访问控制",
    "实施权限变更流程",
    "监控权限使用情况"
  ],

  [ErrorCategory.QUOTA_EXCEEDED]: [
    "实施资源使用监控",
    "设计自动扩容机制",
    "定期检查资源使用",
    "实施资源配额预警",
    "优化资源使用效率"
  ],

  [ErrorCategory.MAINTENANCE_MODE]: [
    "制定维护窗口计划",
    "实施分阶段上线",
    "建立维护通知机制",
    "使用灰度发布策略",
    "实施自动化部署"
  ],

  [ErrorCategory.VERSION_MISMATCH]: [
    "实施版本兼容性管理",
    "使用语义化版本控制",
    "定期检查依赖版本",
    "实施向后兼容策略",
    "使用版本监控工具"
  ],

  [ErrorCategory.SCHEMA_MIGRATION_ERROR]: [
    "实施数据库版本控制",
    "使用迁移工具和框架",
    "设计可回滚迁移",
    "实施迁移测试策略",
    "监控迁移执行状态"
  ],

  [ErrorCategory.INDEX_CORRUPTION]: [
    "定期执行索引检查",
    "监控索引健康状态",
    "实施索引备份策略",
    "使用索引统计监控",
    "避免异常系统关机"
  ],

  [ErrorCategory.PARTITION_ERROR]: [
    "设计合理的分区策略",
    "监控分区健康状态",
    "定期分区维护操作",
    "实施分区自动管理",
    "使用分区监控工具"
  ],

  [ErrorCategory.FULLTEXT_ERROR]: [
    "定期优化全文索引",
    "监控全文索引性能",
    "使用适当的全文索引类型",
    "定期更新停用词表",
    "监控全文搜索质量"
  ],

  [ErrorCategory.SPATIAL_ERROR]: [
    "验证空间数据合法性",
    "使用空间索引优化",
    "选择合适的坐标系",
    "监控空间数据质量",
    "使用空间数据验证规则"
  ],

  [ErrorCategory.JSON_ERROR]: [
    "实施JSON数据验证",
    "限制JSON数据大小",
    "使用JSON模式验证",
    "监控JSON处理性能",
    "设计JSON数据结构约束"
  ],

  [ErrorCategory.WINDOW_FUNCTION_ERROR]: [
    "验证窗口函数语法",
    "使用窗口函数最佳实践",
    "监控窗口函数性能",
    "限制窗口框架大小",
    "使用窗口函数索引优化"
  ],

  [ErrorCategory.CTE_ERROR]: [
    "验证CTE语法正确性",
    "限制递归CTE深度",
    "使用CTE性能监控",
    "避免复杂的CTE逻辑",
    "实施CTE单元测试"
  ],

  [ErrorCategory.TRIGGER_ERROR]: [
    "限制触发器复杂度",
    "监控触发器性能",
    "避免触发器嵌套",
    "实施触发器单元测试",
    "使用触发器日志监控"
  ],

  [ErrorCategory.VIEW_ERROR]: [
    "设计简单明确的视图",
    "监控视图性能",
    "避免视图嵌套",
    "定期检查视图依赖",
    "实施视图版本控制"
  ],

  [ErrorCategory.STORED_PROCEDURE_ERROR]: [
    "使用存储过程最佳实践",
    "实施存储过程单元测试",
    "监控存储过程性能",
    "使用存储过程版本控制",
    "限制存储过程复杂度"
  ],

  [ErrorCategory.FUNCTION_ERROR]: [
    "验证函数输入参数",
    "实施函数单元测试",
    "监控函数性能",
    "使用函数版本控制",
    "限制函数复杂度"
  ],

  [ErrorCategory.EVENT_ERROR]: [
    "设计简单的事件逻辑",
    "监控事件执行状态",
    "使用事件错误处理",
    "定期检查事件调度",
    "实施事件日志监控"
  ],

  [ErrorCategory.PRIVILEGE_ERROR]: [
    "实施最小权限原则",
    "定期审计权限分配",
    "使用权限管理工具",
    "实施权限变更审批",
    "监控权限使用情况"
  ],

  [ErrorCategory.ROLE_ERROR]: [
    "设计清晰的角色体系",
    "定期清理无用角色",
    "避免角色循环依赖",
    "实施角色变更审批",
    "监控角色使用情况"
  ],

  [ErrorCategory.PLUGIN_ERROR]: [
    "使用官方插件源",
    "定期更新插件版本",
    "监控插件兼容性",
    "实施插件沙箱测试",
    "定期检查插件许可"
  ],

  [ErrorCategory.CHARACTER_SET_ERROR]: [
    "统一使用UTF-8编码",
    "监控字符编码一致性",
    "实施字符集验证",
    "定期检查字符集配置",
    "使用标准化字符集"
  ],

  [ErrorCategory.COLLATION_ERROR]: [
    "统一排序规则设置",
    "监控排序规则一致性",
    "使用兼容排序规则",
    "定期检查索引排序",
    "实施排序规则标准化"
  ],

  [ErrorCategory.TIMEZONE_ERROR]: [
    "统一使用UTC时间",
    "定期更新时区数据",
    "监控时区设置一致性",
    "使用时区识别的时间存储",
    "实施时区转换最佳实践"
  ],

  [ErrorCategory.LOCALE_ERROR]: [
    "使用标准化本地化设置",
    "定期更新本地化资源",
    "监控本地化配置一致性",
    "使用多语言支持框架",
    "实施本地化测试策略"
  ],

  [ErrorCategory.ENCRYPTION_ERROR]: [
    "实施密钥轮换策略",
    "使用密钥管理服务",
    "监控加密健康状态",
    "实施加密数据备份",
    "使用标准加密算法"
  ],

  [ErrorCategory.COMPRESSION_ERROR]: [
    "选择合适的压缩算法",
    "监控压缩效果",
    "定期检查压缩数据完整性",
    "使用压缩性能监控",
    "实施压缩策略优化"
  ],

  [ErrorCategory.AUDIT_ERROR]: [
    "设计完善的审计策略",
    "定期审计日志维护",
    "监控审计系统健康",
    "实施审计数据备份",
    "使用审计分析工具"
  ],

  [ErrorCategory.MONITORING_ERROR]: [
    "实施统一监控平台",
    "设置多层次监控告警",
    "监控系统健康状态",
    "定期检查监控配置",
    "使用监控数据分析"
  ],

  [ErrorCategory.HEALTH_CHECK_ERROR]: [
    "设计合理的健康检查策略",
    "监控健康检查效果",
    "实施分层健康检查",
    "使用健康检查自动化",
    "定期优化健康检查参数"
  ],

  [ErrorCategory.LOAD_BALANCER_ERROR]: [
    "设计高可用负载均衡",
    "监控负载均衡健康",
    "实施负载均衡凗罩",
    "使用多种负载均衡策略",
    "定期测试负载均衡效果"
  ],

  [ErrorCategory.PROXY_ERROR]: [
    "设计健壮的代理架构",
    "监控代理服务健康",
    "实施代理凗罩策略",
    "使用代理连接池",
    "定期测试代理性能"
  ],

  [ErrorCategory.FIREWALL_ERROR]: [
    "定期审查防火墙规则",
    "监控防火墙状态",
    "实施防火墙凗罩",
    "使用防火墙日志分析",
    "定期测试网络连接"
  ],

  [ErrorCategory.DNS_ERROR]: [
    "使用多个DNS服务器",
    "监控DNS解析性能",
    "实施DNS缓存策略",
    "定期检查DNS配置",
    "使用DNS健康监控"
  ],

  [ErrorCategory.CERTIFICATE_ERROR]: [
    "实施证书生命周期管理",
    "监控证书过期时间",
    "使用证书自动更新",
    "定期验证证书链",
    "实施证书备份策略"
  ],

  [ErrorCategory.TOKEN_EXPIRED]: [
    "实施令牌自动刷新",
    "监控令牌生命周期",
    "使用令牌管理服务",
    "实施令牌验证机制",
    "定期检查令牌安全性"
  ],

  [ErrorCategory.SESSION_EXPIRED]: [
    "设计合理的会话超时",
    "实施会话管理策略",
    "监控会话状态",
    "使用会话持久化",
    "实施会话安全机制"
  ],

  [ErrorCategory.INVALID_INPUT]: [
    "实施严格的输入验证",
    "使用输入清洗和过滤",
    "定义清晰的数据约束",
    "实施参数类型检查",
    "使用输入验证框架"
  ],

  [ErrorCategory.BUSINESS_LOGIC_ERROR]: [
    "实施业务规则验证",
    "设计明确的业务流程",
    "监控业务逻辑执行",
    "使用业务规则引擎",
    "定期审查业务规则"
  ],

  [ErrorCategory.EXTERNAL_SERVICE_ERROR]: [
    "实施外部服务监控",
    "设计服务降级策略",
    "使用服务熔断器",
    "实施外部服务缓存",
    "定期测试外部服务"
  ],

  [ErrorCategory.DEPENDENCY_ERROR]: [
    "实施依赖管理策略",
    "监控依赖服务健康",
    "使用依赖版本管理",
    "设计依赖隔离机制",
    "定期审查依赖关系"
  ],

  [ErrorCategory.CIRCUIT_BREAKER_ERROR]: [
    "设计智能熔断器",
    "监控熔断器状态",
    "实施熔断器暂缓",
    "使用自适应熔断器",
    "定期测试熔断器效果"
  ],

  [ErrorCategory.RETRY_EXHAUSTED]: [
    "设计智能重试策略",
    "监控重试效果",
    "实施重试限制机制",
    "使用指数退避算法",
    "定期优化重试参数"
  ],

  [ErrorCategory.THROTTLED]: [
    "实施智能限流策略",
    "监控系统负载情况",
    "使用请求队列管理",
    "设计自适应限流",
    "定期评估限流效果"
  ],

  [ErrorCategory.DEGRADED_SERVICE]: [
    "设计优雅降级机制",
    "监控服务降级指标",
    "实施服务分级策略",
    "使用炒作服务机制",
    "定期测试降级效果"
  ],

  [ErrorCategory.PARTIAL_FAILURE]: [
    "设计容错处理机制",
    "实施部分失败监控",
    "使用幂等操作设计",
    "实施数据一致性检查",
    "定期分析失败模式"
  ],

  [ErrorCategory.CASCADING_FAILURE]: [
    "实施系统隔离设计",
    "使用断路器模式",
    "设计故障隔离机制",
    "监控系统健康度",
    "定期进行灾难演练"
  ],

  [ErrorCategory.SLOW_QUERY_LOG_ERROR]: [
    "定期维护慢查询日志",
    "监控日志存储空间",
    "实施日志轮转策略",
    "使用日志分析工具",
    "定期检查日志配置"
  ],

  [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: [
    "使用可靠的分析工具",
    "定期校准分析算法",
    "监控分析系统健康",
    "实施分析结果备份",
    "使用多维度性能分析"
  ],

  [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: [
    "使用配置管理工具",
    "定期验证配置参数",
    "实施配置版本控制",
    "监控配置变更影响",
    "使用配置模板和最佳实践"
  ],

  [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: [
    "使用模板化报告系统",
    "定期测试报告生成",
    "实施报告生成监控",
    "使用异步报告生成",
    "定期优化报告性能"
  ],

  [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: [
    "实施多层次监控",
    "使用可靠的监控平台",
    "定期测试监控系统",
    "实施监控数据备份",
    "监控系统性能和可用性"
  ],

  [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: [
    "使用智能索引分析工具",
    "定期更新表统计信息",
    "实施索引建议验证",
    "监控索引建议质量",
    "使用自动化索引优化"
  ]
};

/**
 * 统一错误配置接口
 *
 * 提供统一的接口来访问所有错误相关配置。
 */
export interface UnifiedErrorConfig {
  /** 错误代码映射 */
  codeMapping: typeof ERROR_CODE_MAPPING;
  /** 错误严重性映射 */
  severityMapping: typeof SEVERITY_MAPPING;
  /** 可能原因映射 */
  possibleCauses: typeof POSSIBLE_CAUSES;
  /** 恢复建议映射 */
  recoverySuggestions: typeof RECOVERY_SUGGESTIONS;
  /** 预防建议映射 */
  preventionTips: typeof PREVENTION_TIPS;
}

/**
 * 获取统一的错误配置
 *
 * @returns 包含所有错误配置的统一对象
 */
export function getUnifiedErrorConfig(): UnifiedErrorConfig {
  return {
    codeMapping: ERROR_CODE_MAPPING,
    severityMapping: SEVERITY_MAPPING,
    possibleCauses: POSSIBLE_CAUSES,
    recoverySuggestions: RECOVERY_SUGGESTIONS,
    preventionTips: PREVENTION_TIPS
  };
}

/**
 * 根据错误代码获取完整的错误信息
 *
 * @param errorCode - MySQL错误代码
 * @returns 包含分类、严重性、原因、建议等完整错误信息
 */
export function getCompleteErrorInfo(errorCode: number) {
  const category = ERROR_CODE_MAPPING[errorCode] || ErrorCategory.UNKNOWN;
  const severity = SEVERITY_MAPPING[category] || ErrorSeverity.MEDIUM;
  const causes = POSSIBLE_CAUSES[category] || [];
  const suggestions = RECOVERY_SUGGESTIONS[category] || [];
  const preventions = PREVENTION_TIPS[category] || [];

  return {
    errorCode,
    category,
    severity,
    possibleCauses: causes,
    recoverySuggestions: suggestions,
    preventionTips: preventions
  };
}

/**
 * 根据错误类别获取所有相关配置
 *
 * @param category - 错误类别
 * @returns 该类别的所有相关配置信息
 */
export function getErrorConfigByCategory(category: ErrorCategory) {
  const severity = SEVERITY_MAPPING[category] || ErrorSeverity.MEDIUM;
  const causes = POSSIBLE_CAUSES[category] || [];
  const suggestions = RECOVERY_SUGGESTIONS[category] || [];
  const preventions = PREVENTION_TIPS[category] || [];

  return {
    category,
    severity,
    possibleCauses: causes,
    recoverySuggestions: suggestions,
    preventionTips: preventions
  };
}

/**
 * 检查错误代码是否已知
 *
 * @param errorCode - MySQL错误代码
 * @returns 是否为已知错误代码
 */
export function isKnownErrorCode(errorCode: number): boolean {
  return errorCode in ERROR_CODE_MAPPING;
}

/**
 * 获取所有支持的错误类别
 *
 * @returns 所有支持的错误类别数组
 */
export function getSupportedErrorCategories(): ErrorCategory[] {
  return Object.values(ErrorCategory);
}

/**
 * 获取指定严重性级别的所有错误类别
 *
 * @param severity - 错误严重性级别
 * @returns 匹配指定严重性的错误类别数组
 */
export function getErrorCategoriesBySeverity(severity: ErrorSeverity): ErrorCategory[] {
  return Object.keys(SEVERITY_MAPPING)
    .filter(category => SEVERITY_MAPPING[category as ErrorCategory] === severity)
    .map(category => category as ErrorCategory);
}

/**
 * 获取错误配置统计信息
 *
 * @returns 错误配置的统计信息
 */
export function getErrorConfigStats() {
  const totalErrorCodes = Object.keys(ERROR_CODE_MAPPING).length;
  const totalCategories = Object.keys(SEVERITY_MAPPING).length;
  const categoriesWithCauses = Object.keys(POSSIBLE_CAUSES).length;
  const categoriesWithSuggestions = Object.keys(RECOVERY_SUGGESTIONS).length;
  const categoriesWithPreventions = Object.keys(PREVENTION_TIPS).length;

  const severityStats = Object.values(ErrorSeverity).reduce((stats, severity) => {
    stats[severity] = getErrorCategoriesBySeverity(severity).length;
    return stats;
  }, {} as Record<ErrorSeverity, number>);

  return {
    totalErrorCodes,
    totalCategories,
    categoriesWithCauses,
    categoriesWithSuggestions,
    categoriesWithPreventions,
    severityDistribution: severityStats
  };
}