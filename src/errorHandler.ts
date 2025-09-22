/**
 * MySQL MCP错误处理与智能分析系统
 *
 * 为Model Context Protocol (MCP)提供安全、可靠的错误处理服务。
 * 集成完整的错误分类、分析和恢复建议功能。
 *
 * @fileoverview MySQL MCP错误处理与智能分析系统
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import { ErrorCategory, ErrorSeverity, MySQLMCPError } from './types.js';
import { MySQLErrorClassifier } from './errors/errorClassifier.js';
import { sensitiveDataHandler, SensitiveDataType } from './utils/security.js';

/**
 * 错误处理器工具类
 *
 * 提供便捷的错误处理和转换方法
 */
export class ErrorHandler {
  /**
   * 安全错误转换
   *
   * 将任意类型的错误转换为标准化的MySQLMCPError格式，同时保护敏感信息。
   * 该方法集成智能错误分类、用户友好消息生成和安全数据掩码功能。
   *
   * @public
   * @static
   * @param {unknown} error - 要转换的原始错误对象
   * @param {string} [context] - 可选的上下文信息，用于错误追踪和日志记录
   * @param {boolean} [maskSensitive=true] - 是否对敏感信息进行掩码处理，默认为true
   * @returns {MySQLMCPError} 标准化的安全错误对象，包含分类、严重级别和用户友好消息
   *
   * @example
   * // 基本错误转换
   * const error = new Error('Database connection failed');
   * const safeError = ErrorHandler.safeError(error);
   *
   * @example
   * // 带上下文的错误转换
   * const safeError = ErrorHandler.safeError(error, 'user_login_process');
   *
   * @example
   * // 禁用敏感信息掩码（用于调试）
   * const debugError = ErrorHandler.safeError(error, 'debug_context', false);
   */
  public static safeError(
    error: unknown, 
    context?: string, 
    maskSensitive: boolean = true
  ): MySQLMCPError {
    const classified = MySQLErrorClassifier.classifyError(error, context);
    
    if (maskSensitive) {
      // 掩码密码和敏感信息
      classified.message = this.maskSensitiveInfo(classified.message);
    }
    
    // 添加用户友好的错误消息
    classified.message = this.addUserFriendlyMessage(classified);
    
    return classified;
  }

  /**
   * 掩码敏感信息
   *
   * @private
   * @static
   * @param {string} message - 错误消息
   * @returns {string} 掩码后的消息
   */
  private static maskSensitiveInfo(message: string): string {
    // 使用统一的敏感数据处理器
    const result = sensitiveDataHandler.processSensitiveData(message, {
      enabledTypes: [
        SensitiveDataType.PASSWORD,
        SensitiveDataType.USERNAME,
        SensitiveDataType.HOST,
        SensitiveDataType.TOKEN,
        SensitiveDataType.API_KEY,
        SensitiveDataType.CONNECTION_STRING
      ]
    });
    
    return result.processedText;
  }
  
  /**
   * 添加用户友好的错误消息
   *
   * @private
   * @static
   * @param {MySQLMCPError} error - 错误对象
   * @returns {string} 用户友好的错误消息
   */
  private static addUserFriendlyMessage(error: MySQLMCPError): string {
    let userFriendlyMessage = error.message;
    const originalMessage = error.message.toLowerCase();
    
    // 添加基于错误消息内容的特定建议
    const specificSuggestions = ErrorHandler.getSpecificSuggestions(originalMessage);
    if (specificSuggestions) {
      userFriendlyMessage += specificSuggestions;
    }

    // 添加常见原因和排查步骤
    const troubleshootingInfo = ErrorHandler.getTroubleshootingInfo(error.category);
    if (troubleshootingInfo) {
      userFriendlyMessage += troubleshootingInfo;
    }
    
    // 根据错误类别添加用户友好的建议
    switch (error.category) {
      // 基础数据库错误
      case ErrorCategory.ACCESS_DENIED:
        userFriendlyMessage += " 🚫 访问被拒绝。请检查您的用户名和密码是否正确，确保您有足够的权限访问数据库。您也可以联系数据库管理员重置您的访问权限。";
        break;
      case ErrorCategory.OBJECT_NOT_FOUND:
        userFriendlyMessage += " 🔍 对象未找到。请检查您请求的数据库、表或列是否存在，验证名称拼写是否正确（注意大小写敏感），并确认您连接的是正确的数据库。";
        break;
      case ErrorCategory.CONSTRAINT_VIOLATION:
        userFriendlyMessage += " ⚠️ 数据约束违反。请检查您的数据是否符合数据库的约束条件，如主键唯一性、外键引用完整性或数据类型匹配。考虑使用 INSERT IGNORE 或 ON DUPLICATE KEY UPDATE 来处理重复数据。";
        break;
      case ErrorCategory.SYNTAX_ERROR:
        userFriendlyMessage += " 📝 SQL语法错误。请检查您的SQL查询语句是否正确，特别注意关键字、引号、括号的匹配，以及表名和字段名的拼写。建议使用SQL语法检查工具验证。";
        break;
      case ErrorCategory.CONNECTION_ERROR:
        userFriendlyMessage += " 🔌 连接错误。请确认数据库服务器正在运行，网络连接稳定，防火墙设置允许连接，并检查连接参数（主机名、端口）是否正确。";
        break;
      case ErrorCategory.TIMEOUT_ERROR:
        userFriendlyMessage += " ⏰ 查询超时。查询执行时间过长，建议优化SQL语句、添加适当的索引、考虑分页处理大数据集，或适当增加查询超时设置。";
        break;
      case ErrorCategory.DEADLOCK_ERROR:
        userFriendlyMessage += " 🔒 死锁发生。多个事务互相等待对方释放资源，请稍后自动重试操作，或优化事务执行顺序减少锁竞争。";
        break;
      case ErrorCategory.LOCK_WAIT_TIMEOUT:
        userFriendlyMessage += " ⏳ 锁等待超时。等待其他事务释放锁的时间过长，请稍后重试，或考虑调整事务隔离级别和锁超时设置。";
        break;
      case ErrorCategory.DATABASE_UNAVAILABLE:
        userFriendlyMessage += " 🚨 数据库不可用。数据库服务当前无法访问，可能是维护期间或服务故障，请稍后重试或联系系统管理员。";
        break;
      case ErrorCategory.TRANSACTION_ERROR:
        userFriendlyMessage += " 💳 事务错误。事务执行期间出现问题，可能因为锁冲突、约束违反或并发访问导致。请检查事务隔离级别、优化事务逻辑、减少事务持续时间。";
        break;
      case ErrorCategory.DATA_PROCESSING:
        userFriendlyMessage += " 🔄 数据处理失败。检查数据格式和处理逻辑，验证输入数据完整性，确认数据类型匹配。";
        break;
      case ErrorCategory.DATA_INTEGRITY_ERROR:
        userFriendlyMessage += " 🛡️ 数据完整性错误。数据违反了完整性约束，请检查主键、外键、唯一约束和检查约束的定义，验证数据关系的正确性。";
        break;
      case ErrorCategory.DATA_ERROR:
        userFriendlyMessage += " 📊 数据错误。数据格式、类型或内容存在问题，请检查数据类型匹配、数值范围、字符编码和数据格式是否符合要求。";
        break;
      case ErrorCategory.QUERY_INTERRUPTED:
        userFriendlyMessage += " ⏹️ 查询中断。查询执行被用户或系统中断，可能是超时、取消操作或系统重启导致。请重新执行查询或检查系统状态。";
        break;
      case ErrorCategory.SERVER_GONE_ERROR:
        userFriendlyMessage += " 🔌 服务器连接丢失。数据库服务器连接已断开，请检查网络连接、服务器状态、防火墙设置，稍后重试连接。";
        break;
      case ErrorCategory.SERVER_LOST_ERROR:
        userFriendlyMessage += " 📡 服务器连接丢失。与数据库服务器的连接在操作过程中丢失，请检查网络稳定性、服务器负载、连接超时设置。";
        break;
      
      // 高级错误类型
      case ErrorCategory.MEMORY_LEAK:
        userFriendlyMessage += " 💾 内存泄漏检测。系统发现内存使用异常增长，建议重启应用程序释放内存，并检查代码中的内存管理逻辑，联系开发团队进行内存分析。";
        break;
      case ErrorCategory.PERFORMANCE_DEGRADATION:
        userFriendlyMessage += " 📊 性能下降。数据库响应时间变长，建议分析查询性能瓶颈、检查索引使用情况、优化数据库配置参数，或考虑使用缓存减少负载。";
        break;
      case ErrorCategory.CONCURRENT_ACCESS_ERROR:
        userFriendlyMessage += " 🔄 并发访问冲突。多个用户同时访问相同资源导致冲突，建议优化锁策略、调整事务隔离级别，或实现乐观并发控制机制。";
        break;
      case ErrorCategory.DATA_CONSISTENCY_ERROR:
        userFriendlyMessage += " ❗ 数据一致性异常。发现数据不一致问题，建议运行数据一致性检查、验证事务完整性、检查并发写入冲突，考虑使用数据修复工具。";
        break;
      case ErrorCategory.BACKUP_ERROR:
        userFriendlyMessage += " 💾 备份操作失败。请检查备份存储空间是否充足、验证备份权限设置、确认备份配置参数正确，并检查数据库表锁定状态。";
        break;
      case ErrorCategory.REPLICATION_ERROR:
        userFriendlyMessage += " 🔄 数据同步错误。主从复制出现问题，请检查主从服务器网络连接、验证复制用户权限、检查二进制日志配置，必要时重新同步主从数据。";
        break;
      case ErrorCategory.AUTHENTICATION_ERROR:
        userFriendlyMessage += " 🔐 身份验证失败。请验证用户凭据是否正确、检查认证服务状态、确认认证方法配置无误，并检查密码策略设置。";
        break;
      case ErrorCategory.AUTHORIZATION_ERROR:
        userFriendlyMessage += " 🛡️ 授权被拒绝。您有有效的身份验证但缺乏访问权限，请检查用户权限配置、验证角色分配、确认资源访问权限设置。";
        break;
      case ErrorCategory.QUOTA_EXCEEDED:
        userFriendlyMessage += " 📏 配额超出限制。您已达到资源使用上限，请检查资源使用情况、清理不必要数据、申请增加配额限制，或优化资源使用效率。";
        break;
      case ErrorCategory.MAINTENANCE_MODE:
        userFriendlyMessage += " 🔧 系统维护中。数据库当前处于维护模式，请查看维护通知和时间表，等待维护完成后重试，或联系管理员了解维护进度。";
        break;
      case ErrorCategory.VERSION_MISMATCH:
        userFriendlyMessage += " 🔄 版本不兼容。客户端和服务器版本不匹配，请检查版本兼容性矩阵、升级或降级相关组件，联系技术支持获取兼容版本信息。";
        break;
      case ErrorCategory.SCHEMA_MIGRATION_ERROR:
        userFriendlyMessage += " 🏗️ 架构迁移失败。数据库结构更新出现问题，请检查迁移脚本语法、验证数据库权限、备份当前数据结构，考虑回滚到上一个稳定版本。";
        break;
      case ErrorCategory.INDEX_CORRUPTION:
        userFriendlyMessage += " 📚 索引损坏。发现索引数据异常，请运行索引完整性检查、重建损坏的索引、检查存储设备健康状态，验证数据库文件完整性。";
        break;
      case ErrorCategory.SECURITY_VIOLATION:
        userFriendlyMessage += " 🚨 安全违规检测。系统发现潜在的安全威胁，请立即检查输入数据的来源和内容、验证应用程序安全过滤机制、考虑启用更严格的安全验证。";
        break;
      case ErrorCategory.NETWORK_ERROR:
        userFriendlyMessage += " 🌐 网络连接问题。请检查网络连接稳定性、验证防火墙和代理设置、检查DNS解析是否正常，考虑使用连接重试机制。";
        break;
      case ErrorCategory.RESOURCE_EXHAUSTED:
        userFriendlyMessage += " ⚡ 资源耗尽。系统资源（内存、CPU、连接数）已用完，请增加系统资源、优化查询减少资源使用、检查连接池配置，考虑负载均衡。";
        break;
      case ErrorCategory.CONFIGURATION_ERROR:
        userFriendlyMessage += " ⚙️ 配置错误。系统配置存在问题，请检查配置文件语法、验证环境变量设置、确认参数值在有效范围内，检查依赖服务配置。";
        break;
      case ErrorCategory.SSL_ERROR:
        userFriendlyMessage += " 🔒 SSL连接错误。安全连接出现问题，请检查SSL证书配置和有效期、验证SSL版本兼容性、确认SSL连接参数设置，检查网络是否支持SSL。";
        break;
      case ErrorCategory.RATE_LIMIT_ERROR:
        userFriendlyMessage += " 🚦 请求频率超限。您的请求过于频繁，请等待片刻后重试、优化请求频率、考虑增加速率限制阈值，检查是否存在异常高频请求模式。";
        break;
      case ErrorCategory.UNKNOWN:
        userFriendlyMessage += " ❓ 未知错误。系统遇到了无法识别的问题，请查看完整的错误日志获取更多信息、联系系统管理员进行进一步分析、检查MySQL服务器状态。";
        break;
        
      // 慢查询日志相关错误
      case ErrorCategory.SLOW_QUERY_LOG_ERROR:
        userFriendlyMessage += " 📊 慢查询日志错误。慢查询日志系统出现异常，请检查慢查询日志配置、验证日志文件权限、检查磁盘空间是否充足、确认慢查询日志已正确启用。";
        break;
      case ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR:
        userFriendlyMessage += " 📈 慢查询分析错误。查询性能分析过程失败，请检查慢查询日志文件是否可读、验证分析参数、确保性能监控表可用、尝试重新执行分析操作。";
        break;
      case ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR:
        userFriendlyMessage += " ⚙️ 慢查询配置错误。配置设置存在问题，请检查slow_query_log和long_query_time参数、验证配置文件的语法正确性、重启MySQL服务使配置生效。";
        break;
      case ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR:
        userFriendlyMessage += " 📋 慢查询报告生成失败。报表生成过程出现错误，请验证查询结果数据、检查报表模板配置、确认导出权限、尝试减小数据量重新生成。";
        break;
      case ErrorCategory.SLOW_QUERY_MONITORING_ERROR:
        userFriendlyMessage += " 📊 慢查询监控异常。自动监控功能不能正常工作，请检查监控间隔设置、验证定时器状态、重启监控服务、检查系统资源是否充足。";
        break;
      case ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR:
        userFriendlyMessage += " 💡 索引建议生成失败。优化建议生成过程出现错误，请检查查询历史数据、验证索引建议算法、确保有足够的历史查询样本进行分析。";
        break;

      // 其他新增错误类型的用户友好消息
      case ErrorCategory.PARTITION_ERROR:
        userFriendlyMessage += " 🗂️ 分区错误。表分区出现问题，请检查分区配置、验证分区键设置、修复分区元数据、重新平衡分区数据分布。";
        break;
      case ErrorCategory.FULLTEXT_ERROR:
        userFriendlyMessage += " 🔍 全文索引错误。全文搜索功能异常，请检查全文索引配置、验证全文索引语法、重建全文索引、检查分词器设置。";
        break;
      case ErrorCategory.SPATIAL_ERROR:
        userFriendlyMessage += " 🗺️ 空间数据错误。地理空间数据处理异常，请检查空间数据格式、验证空间参考系统、更新空间索引、检查几何数据完整性。";
        break;
      case ErrorCategory.JSON_ERROR:
        userFriendlyMessage += " 📄 JSON数据处理错误。请检查JSON数据格式是否正确、验证JSON路径语法、修复JSON数据结构、更新JSON索引。";
        break;
      case ErrorCategory.WINDOW_FUNCTION_ERROR:
        userFriendlyMessage += " 📊 窗口函数错误。窗口函数语法或逻辑出现问题，请检查OVER子句、PARTITION BY和ORDER BY设置，验证窗口函数的语法正确性。";
        break;
      case ErrorCategory.CTE_ERROR:
        userFriendlyMessage += " 🔄 公用表表达式错误。WITH子句或递归CTE出现问题，请检查CTE定义语法、验证递归终止条件，检查列名和数据类型匹配。";
        break;
      case ErrorCategory.TRIGGER_ERROR:
        userFriendlyMessage += " ⚡ 触发器错误。数据库触发器执行失败，请检查触发器定义语法、验证触发条件、检查触发器权限，审查触发器逻辑中的异常处理。";
        break;
      case ErrorCategory.VIEW_ERROR:
        userFriendlyMessage += " 🔍 视图错误。数据库视图处理出现问题，请检查视图定义语法、验证基础表存在、检查列映射关系，更新或重建视图。";
        break;
      case ErrorCategory.STORED_PROCEDURE_ERROR:
        userFriendlyMessage += " 📝 存储过程错误。存储过程执行失败，请检查过程定义语法、验证参数传递、检查过程权限，审查过程逻辑中的异常处理。";
        break;
      case ErrorCategory.FUNCTION_ERROR:
        userFriendlyMessage += " ⚙️ 函数错误。数据库函数执行失败，请检查函数定义和调用语法、验证函数参数类型和数量、检查函数返回值类型。";
        break;
      case ErrorCategory.EVENT_ERROR:
        userFriendlyMessage += " 📅 事件调度错误。数据库事件调度程序出现问题，请检查事件调度器设置、验证事件定义语法、检查事件执行权限。";
        break;
      case ErrorCategory.CERTIFICATE_ERROR:
        userFriendlyMessage += " 📜 证书错误。SSL/TLS证书出现问题，请检查证书有效期、验证证书链完整性、更新SSL证书、重新安装证书文件。";
        break;
      case ErrorCategory.FIREWALL_ERROR:
        userFriendlyMessage += " 🛡️ 防火墙阻止。网络安全设置阻止了连接，请检查防火墙规则、验证端口开放状态、检查防火墙服务状态、重新配置防火墙设置。";
        break;
      case ErrorCategory.PRIVILEGE_ERROR:
        userFriendlyMessage += " 🔐 权限错误。用户没有执行指定操作的权限，请检查用户权限设置、验证数据库访问权限、联系管理员获取必要权限。";
        break;
      case ErrorCategory.ROLE_ERROR:
        userFriendlyMessage += " 🎭 角色错误。数据库角色管理出现问题，请检查角色定义和分配、验证角色权限配置、更新角色成员身份。";
        break;
      case ErrorCategory.PLUGIN_ERROR:
        userFriendlyMessage += " 🔌 插件错误。数据库插件加载或执行失败，请检查插件安装状态、验证插件版本兼容性、重新加载或更新插件。";
        break;
      case ErrorCategory.CHARACTER_SET_ERROR:
        userFriendlyMessage += " 🔤 字符集错误。字符编码不匹配或转换失败，请检查数据库、表和列的字符集设置，确保数据编码一致性。";
        break;
      case ErrorCategory.COLLATION_ERROR:
        userFriendlyMessage += " 🔤 排序规则错误。字符串排序规则冲突或不兼容，请检查数据库、表和列的排序规则设置，统一排序规则配置。";
        break;
      case ErrorCategory.TIMEZONE_ERROR:
        userFriendlyMessage += " 🌍 时区错误。时区设置不正确或转换失败，请检查服务器和客户端时区设置，确保时间数据处理的一致性。";
        break;
      case ErrorCategory.LOCALE_ERROR:
        userFriendlyMessage += " 🌐 本地化错误。语言和地区设置出现问题，请检查系统本地化配置、验证语言包安装状态，更新本地化设置。";
        break;
      case ErrorCategory.ENCRYPTION_ERROR:
        userFriendlyMessage += " 🔐 加密错误。数据加密或解密过程失败，请检查加密密钥和算法配置、验证加密模块状态，更新加密证书。";
        break;
      case ErrorCategory.COMPRESSION_ERROR:
        userFriendlyMessage += " 🗜 压缩错误。数据压缩或解压失败，请检查压缩算法设置、验证数据完整性、检查存储空间是否足够。";
        break;
      case ErrorCategory.AUDIT_ERROR:
        userFriendlyMessage += " 📈 审计错误。数据库审计日志记录失败，请检查审计配置和日志存储空间、验证审计权限设置，检查审计服务状态。";
        break;
      case ErrorCategory.MONITORING_ERROR:
        userFriendlyMessage += " 📊 监控错误。系统监控组件出现问题，请检查监控服务配置和连接状态、验证监控数据采集设置，重启监控服务。";
        break;
      case ErrorCategory.HEALTH_CHECK_ERROR:
        userFriendlyMessage += " ♥️ 健康检查失败。系统健康检查出现异常，请检查系统组件运行状态、验证服务可用性，重新执行健康检查。";
        break;
      case ErrorCategory.LOAD_BALANCER_ERROR:
        userFriendlyMessage += " ⚖️ 负载均衡器错误。负载均衡服务出现问题，请检查负载均衡器配置和后端服务器状态，验证路由规则设置。";
        break;
      case ErrorCategory.PROXY_ERROR:
        userFriendlyMessage += " 🔄 代理服务器错误。数据库代理服务出现问题，请检查代理服务器配置和状态、验证代理规则和路由设置。";
        break;
      case ErrorCategory.DNS_ERROR:
        userFriendlyMessage += " 🌍 DNS解析失败。域名解析出现问题，请检查DNS服务器设置、验证域名解析配置、检查网络连接状态、考虑更换DNS服务器。";
        break;
      case ErrorCategory.TOKEN_EXPIRED:
        userFriendlyMessage += " ⏰ 令牌已过期。访问令牌已经失效，请检查令牌有效期、重新获取访问令牌、验证身份认证状态、更新令牌存储。";
        break;
      case ErrorCategory.SESSION_EXPIRED:
        userFriendlyMessage += " 🔑 会话已过期。您的登录会话已经失效，请重新登录系统、检查会话超时设置、验证会话配置、清理过期会话。";
        break;
      case ErrorCategory.INVALID_INPUT:
        userFriendlyMessage += " 📝 输入数据无效。提供的数据格式不正确，请检查输入数据格式、验证数据类型是否匹配、修改输入内容后重新提交。";
        break;
      case ErrorCategory.VALIDATION_ERROR:
        userFriendlyMessage += " ✅ 数据验证失败。输入数据不符合业务规则，请检查验证规则设置、验证输入数据完整性、修改验证配置、提供符合要求的有效数据。";
        break;
      case ErrorCategory.BUSINESS_LOGIC_ERROR:
        userFriendlyMessage += " 🏢 业务逻辑错误。业务规则执行异常，请检查业务规则配置、验证业务流程正确性、修改业务逻辑实现、联系业务分析师确认需求。";
        break;
      case ErrorCategory.EXTERNAL_SERVICE_ERROR:
        userFriendlyMessage += " 🔗 外部服务异常。依赖的第三方服务出现问题，请检查外部服务状态页面、验证服务连接、查看服务状态更新、联系服务提供商。";
        break;
      case ErrorCategory.DEPENDENCY_ERROR:
        userFriendlyMessage += " 📦 依赖项错误。系统依赖的服务或组件异常，请检查依赖服务运行状态、验证依赖版本兼容性、更新相关依赖包、重新安装依赖项。";
        break;
      case ErrorCategory.CIRCUIT_BREAKER_ERROR:
        userFriendlyMessage += " ⚡ 断路器触发。系统检测到下游服务故障并自动保护，请等待断路器自动恢复、检查下游服务状态、验证断路器配置、必要时手动重置。";
        break;
      case ErrorCategory.RETRY_EXHAUSTED:
        userFriendlyMessage += " 🔄 重试次数耗尽。多次重试操作仍未成功，请检查重试配置设置、验证问题根本原因、联系技术支持获取帮助、考虑手动处理。";
        break;
      case ErrorCategory.THROTTLED:
        userFriendlyMessage += " 🚦 请求被限流。系统临时限制请求频率以保护服务质量，请等待限制解除后重试、检查请求频率、优化请求策略、考虑批量处理。";
        break;
      case ErrorCategory.DEGRADED_SERVICE:
        userFriendlyMessage += " ⚠️ 服务降级中。系统当前运行在降级模式，核心功能仍可用但性能受限，请检查服务降级原因、验证核心功能、使用备用服务。";
        break;
      case ErrorCategory.PARTIAL_FAILURE:
        userFriendlyMessage += " 🔄 部分功能异常。系统组件出现部分故障，请检查具体失败组件、验证系统整体状态、重试失败操作、考虑使用降级服务继续。";
        break;
      case ErrorCategory.CASCADING_FAILURE:
        userFriendlyMessage += " 🌊 连锁故障发生。系统检测到故障正在扩散，请立即停止系统服务、检查故障传播路径、隔离受影响组件、联系紧急技术支持。";
        break;
      case ErrorCategory.DATA_EXPORT_ERROR:
        userFriendlyMessage += " 📤 数据导出失败。请检查以下几点：1) 导出目标路径是否可写且有足够空间；2) 导出文件格式是否支持（如CSV、JSON等）；3) 数据量是否过大导致内存溢出；4) 检查是否有足够的权限执行导出操作。如果问题持续，请联系系统管理员。";
        break;
      case ErrorCategory.REPORT_GENERATION_ERROR:
        userFriendlyMessage += " 📊 报表生成失败。请检查以下几点：1) 报表查询语句是否正确且不包含语法错误；2) 报表模板配置是否完整；3) 确认导出格式是否兼容；4) 检查系统资源（内存、CPU）是否充足。如果问题持续，请联系系统管理员。";
        break;
        
      default:
        // 对于未处理的错误类别，添加通用的用户友好提示
        userFriendlyMessage += " 😅 系统遇到了一些问题。请稍后重试操作，如果问题持续存在，请联系系统管理员并提供错误详情以获取技术支持。";
        break;
    }
    
    // 根据严重级别添加紧急程度提示
    switch (error.severity) {
      case ErrorSeverity.FATAL:
        userFriendlyMessage += " 🚨 这是严重错误，建议立即联系技术支持团队。";
        break;
      case ErrorSeverity.CRITICAL:
        userFriendlyMessage += " ⚠️ 这是关键错误，需要优先处理以避免系统进一步问题。";
        break;
      case ErrorSeverity.HIGH:
        userFriendlyMessage += " 🔴 这是高优先级错误，建议尽快处理。";
        break;
      case ErrorSeverity.MEDIUM:
        userFriendlyMessage += " 🟡 这是中等优先级错误，影响系统部分功能。";
        break;
      case ErrorSeverity.LOW:
        userFriendlyMessage += " 🟢 这是低优先级错误，系统仍可正常运行。";
        break;
      case ErrorSeverity.INFO:
        userFriendlyMessage += " ℹ️ 这是信息性提示，供您参考。";
        break;
    }
    
    return userFriendlyMessage;
  }

  /**
   * 智能错误分析和建议
   *
   * 分析错误并提供详细的诊断信息、恢复建议和预防措施。
   * 帮助用户理解错误原因并采取适当的纠正措施。
   *
   * @public
   * @static
   * @param {Error} error - 要分析的错误对象
   * @param {string} operation - 可选的操作上下文
   * @returns {object} 错误分析结果，包含分类、严重级别、建议和预防措施
   *
   * @example
   * // 分析连接错误
   * const analysis = ErrorHandler.analyzeError(new Error('Access denied for user \'root\'@\'localhost\''), 'connection');
   * console.log(analysis.category); // 'access_denied'
   * console.log(analysis.suggestions); // ['检查数据库服务器是否运行', ...]
   */
  public static analyzeError(error: Error, operation?: string): {
    category: string;
    severity: string;
    suggestions: string[];
    preventionTips: string[];
    isRecoverable: boolean;
  } {
    const errorMessage = error.message.toLowerCase();
    const analysis = {
      category: 'unknown',
      severity: 'medium',
      suggestions: [] as string[],
      preventionTips: [] as string[],
      isRecoverable: this.isRecoverableError(error)
    };

    // 连接相关错误
    if (errorMessage.includes('connection') || errorMessage.includes('connect')) {
      analysis.category = 'connection';
      analysis.suggestions.push('检查数据库服务器是否运行');
      analysis.suggestions.push('验证连接参数（主机、端口、用户名、密码）');
      analysis.suggestions.push('检查网络连接');
      analysis.preventionTips.push('配置连接池超时和重试机制');
      analysis.preventionTips.push('监控数据库服务器状态');
    }

    // 权限相关错误
    if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
      analysis.category = 'permission';
      analysis.severity = 'high';
      analysis.suggestions.push('检查数据库用户权限');
      analysis.suggestions.push('确认用户有相应表的访问权限');
      analysis.suggestions.push('联系数据库管理员');
      analysis.preventionTips.push('定期审核数据库权限');
      analysis.preventionTips.push('使用最小权限原则');
    }

    // 磁盘空间相关错误
    if (errorMessage.includes('disk') || errorMessage.includes('space')) {
      analysis.category = 'storage';
      analysis.severity = 'high';
      analysis.suggestions.push('清理磁盘空间');
      analysis.suggestions.push('删除旧的备份文件');
      analysis.suggestions.push('移动文件到其他分区');
      analysis.preventionTips.push('设置磁盘空间监控告警');
      analysis.preventionTips.push('定期清理临时文件');
    }

    // 内存相关错误
    if (errorMessage.includes('memory') || errorMessage.includes('out of memory')) {
      analysis.category = 'memory';
      analysis.severity = 'high';
      analysis.suggestions.push('减少批处理大小');
      analysis.suggestions.push('启用流式处理');
      analysis.suggestions.push('限制查询结果行数');
      analysis.preventionTips.push('监控内存使用情况');
      analysis.preventionTips.push('优化查询以减少内存消耗');
    }

    // 超时相关错误
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      analysis.category = 'timeout';
      analysis.suggestions.push('增加查询超时时间');
      analysis.suggestions.push('优化查询性能');
      analysis.suggestions.push('检查数据库负载');
      analysis.preventionTips.push('建立适当的查询索引');
      analysis.preventionTips.push('分批处理大数据量操作');
    }

    // 语法错误
    if (errorMessage.includes('syntax') || errorMessage.includes('invalid')) {
      analysis.category = 'syntax';
      analysis.severity = 'low';
      analysis.isRecoverable = false;
      analysis.suggestions.push('检查SQL语法');
      analysis.suggestions.push('验证表名和列名');
      analysis.suggestions.push('检查SQL关键字拼写');
      analysis.preventionTips.push('使用SQL验证工具');
      analysis.preventionTips.push('进行代码审查');
    }

    // 根据操作类型添加特定建议
    if (operation === 'backup') {
      analysis.suggestions.push('尝试备份单个表而不是整个数据库');
      analysis.suggestions.push('使用压缩选项减少文件大小');
      analysis.preventionTips.push('定期测试备份恢复过程');
    } else if (operation === 'export') {
      analysis.suggestions.push('减少导出的行数');
      analysis.suggestions.push('使用流式处理模式');
      analysis.preventionTips.push('分批导出大数据集');
    }

    return analysis;
  }

  /**
   * 检查错误是否可恢复
   *
   * @public
   * @static
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否可恢复
   */
  public static isRecoverableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();

    // 可恢复的错误类型
    const recoverablePatterns = [
      'connection', 'timeout', 'network', 'temporary', 'busy',
      'lock', 'deadlock', 'retry', 'unavailable', 'overload',
      'memory', 'disk', 'space', 'permission denied'
    ];

    // 不可恢复的错误类型
    const nonRecoverablePatterns = [
      'syntax error', 'invalid', 'not found', 'duplicate',
      'constraint', 'foreign key', 'data too long', 'out of range'
    ];

    // 检查不可恢复的模式
    for (const pattern of nonRecoverablePatterns) {
      if (errorMessage.includes(pattern)) {
        return false;
      }
    }

    // 检查可恢复的模式
    for (const pattern of recoverablePatterns) {
      if (errorMessage.includes(pattern)) {
        return true;
      }
    }

    // 检查特定的MySQL错误代码
    if (error instanceof MySQLMCPError) {
      // 这里可以根据具体的错误类别判断
      return error.category !== ErrorCategory.VALIDATION_ERROR &&
        error.category !== ErrorCategory.SECURITY_VIOLATION;
    }

    // 默认情况下，假设网络相关的错误是可恢复的
    return errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout');
  }

  /**
   * 根据错误消息内容提供特定建议
   *
   * @private
   * @static
   * @param {string} errorMessage - 错误消息（小写）
   * @returns {string} 特定建议文本
   */
  private static getSpecificSuggestions(errorMessage: string): string {
    const suggestions: string[] = [];

    // MySQL特定错误代码和消息模式
    const errorPatterns = [
      // 连接相关错误
      {
        patterns: ['connection refused', 'can\'t connect', 'host \'.*\' is not allowed'],
        suggestion: ' 💡 连接被拒绝：检查数据库服务是否运行，验证主机名和端口设置，确认防火墙允许连接。'
      },
      {
        patterns: ['access denied for user', 'authentication failed'],
        suggestion: ' 💡 认证失败：验证用户名和密码正确性，检查用户权限设置，确认使用正确的认证方法。'
      },
      {
        patterns: ['unknown database', 'database \'.*\' doesn\'t exist'],
        suggestion: ' 💡 数据库不存在：确认数据库名称拼写正确，检查数据库是否已创建，验证连接配置。'
      },
      {
        patterns: ['table \'.*\' doesn\'t exist', 'no such table'],
        suggestion: ' 💡 表不存在：验证表名拼写和大小写，确认表是否已创建，检查是否连接到正确的数据库。'
      },
      {
        patterns: ['column \'.*\' not found', 'unknown column'],
        suggestion: ' 💡 列不存在：检查列名拼写和大小写，确认表结构是否正确，验证列是否存在于指定表中。'
      },
      
      // 语法和SQL错误
      {
        patterns: ['syntax error', 'you have an error in your sql syntax'],
        suggestion: ' 💡 SQL语法错误：使用SQL语法检查器验证查询，检查关键字拼写，确认引号和括号匹配。'
      },
      {
        patterns: ['data too long', 'data truncated'],
        suggestion: ' 💡 数据过长：检查插入数据的长度是否超过列定义，考虑调整列长度或截断数据。'
      },
      {
        patterns: ['duplicate entry', 'duplicate key'],
        suggestion: ' 💡 重复数据：检查唯一约束和主键冲突，使用INSERT IGNORE或ON DUPLICATE KEY UPDATE处理重复数据。'
      },
      
      // 性能相关错误
      {
        patterns: ['lock wait timeout', 'lock timeout'],
        suggestion: ' 💡 锁等待超时：优化事务执行时间，检查长时间运行的事务，考虑调整锁超时设置。'
      },
      {
        patterns: ['deadlock found', 'deadlock detected'],
        suggestion: ' 💡 死锁检测：优化事务执行顺序，减少事务持有锁的时间，实现自动重试机制。'
      },
      {
        patterns: ['query execution was interrupted', 'query timeout'],
        suggestion: ' 💡 查询超时：优化查询语句性能，添加适当索引，考虑分页处理大数据集。'
      },
      
      // 资源限制错误
      {
        patterns: ['too many connections', 'max_connections'],
        suggestion: ' 💡 连接数超限：检查连接池配置，优化连接使用，适当增加最大连接数限制。'
      },
      {
        patterns: ['out of memory', 'memory limit'],
        suggestion: ' 💡 内存不足：优化查询减少内存使用，增加系统内存，调整MySQL内存参数配置。'
      },
      {
        patterns: ['disk full', 'no space left'],
        suggestion: ' 💡 磁盘空间不足：清理不必要的数据和日志文件，扩展存储空间，优化数据存储策略。'
      },
      
      // SSL和安全相关
      {
        patterns: ['ssl connection error', 'ssl handshake'],
        suggestion: ' 💡 SSL连接错误：检查SSL证书配置和有效期，验证SSL协议版本兼容性，确认SSL连接参数。'
      },
      {
        patterns: ['certificate', 'ssl certificate'],
        suggestion: ' 💡 证书问题：验证SSL证书有效性和信任链，更新过期证书，检查证书路径配置。'
      },
      
      // 字符编码相关
      {
        patterns: ['character set', 'charset', 'collation'],
        suggestion: ' 💡 字符编码问题：统一数据库、表和列的字符集设置，确保客户端连接字符编码匹配。'
      },
      
      // 慢查询日志相关
      {
        patterns: ['slow query log', 'slow_query_log'],
        suggestion: ' 💡 慢查询日志：检查慢查询日志配置，确保slow_query_log设置为ON，验证long_query_time阈值设置。'
      },
      {
        patterns: ['slow query analysis', 'slow_query_analysis'],
        suggestion: ' 💡 慢查询分析：检查performance_schema是否启用，验证慢查询日志文件可访问，确保有足够的权限读取查询统计。'
      },
      {
        patterns: ['slow query configuration', 'slow_query_configuration'],
        suggestion: ' 💡 慢查询配置：检查my.cnf或my.ini配置文件中的慢查询设置，验证参数值有效，重启服务使配置生效。'
      },
      {
        patterns: ['slow query report', 'slow_query_report'],
        suggestion: ' 💡 慢查询报告：检查查询结果数据是否完整，验证报表生成权限，尝试分批生成大型报表。'
      },
      {
        patterns: ['slow query monitoring', 'slow_query_monitoring'],
        suggestion: ' 💡 慢查询监控：检查监控任务状态，验证定时器配置，重启监控服务，检查系统定时任务设置。'
      },
      {
        patterns: ['index suggestion', 'index_suggestion'],
        suggestion: ' 💡 索引建议：检查查询历史数据，验证查询模式分析，确保有足够的历史查询样本。'
      },

      // 事务相关
      {
        patterns: ['transaction', 'rollback', 'commit'],
        suggestion: ' 💡 事务处理：检查事务逻辑完整性，确保异常时正确回滚，优化事务执行时间。'
      }
    ];

    // 匹配错误模式并添加建议
    for (const { patterns, suggestion } of errorPatterns) {
      if (patterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(errorMessage);
      })) {
        suggestions.push(suggestion);
        break; // 只匹配第一个适用的建议
      }
    }

    return suggestions.join('');
  }

  /**
   * 获取错误类别的排查信息
   *
   * @private
   * @static
   * @param {ErrorCategory} category - 错误类别
   * @returns {string} 排查信息
   */
  private static getTroubleshootingInfo(category: ErrorCategory): string {
    const troubleshootingMap: Record<string, string> = {
      [ErrorCategory.CONNECTION_ERROR]: ' 🔧 排查步骤：1) ping测试网络连通性 2) telnet测试端口可达性 3) 检查防火墙规则 4) 验证MySQL服务状态',
      [ErrorCategory.ACCESS_DENIED]: ' 🔧 排查步骤：1) 验证用户存在性 2) 检查密码正确性 3) 确认用户主机权限 4) 查看MySQL用户表配置',
      [ErrorCategory.SYNTAX_ERROR]: ' 🔧 排查步骤：1) 使用SQL格式化工具检查 2) 逐行验证SQL语法 3) 检查关键字保留字冲突 4) 验证引号和括号匹配',
      [ErrorCategory.DEADLOCK_ERROR]: ' 🔧 排查步骤：1) 分析死锁日志信息 2) 优化事务执行顺序 3) 减少锁持有时间 4) 调整事务隔离级别',
      [ErrorCategory.TIMEOUT_ERROR]: ' 🔧 排查步骤：1) 分析慢查询日志 2) 检查查询执行计划 3) 优化索引使用 4) 监控系统资源使用',
      [ErrorCategory.LOCK_WAIT_TIMEOUT]: ' 🔧 排查步骤：1) 查看当前锁等待情况 2) 分析长时间运行事务 3) 优化锁竞争热点 4) 调整锁等待超时参数',
      [ErrorCategory.RESOURCE_EXHAUSTED]: ' 🔧 排查步骤：1) 监控系统资源使用率 2) 分析内存和CPU瓶颈 3) 优化查询和连接数 4) 扩展系统硬件资源',
      [ErrorCategory.SLOW_QUERY_LOG_ERROR]: ' 🔧 排查步骤：1) 检查slow_query_log变量是否为ON 2) 验证慢查询日志文件权限 3) 检查磁盘空间充足性 4) 验证long_query_time设置合理',
      [ErrorCategory.SLOW_QUERY_ANALYSIS_ERROR]: ' 🔧 排查步骤：1) 检查performance_schema已启用 2) 验证权限可以访问performance_schema 3) 检查慢查询日志文件可读 4) 确保有足够的分析时间窗口',
      [ErrorCategory.SLOW_QUERY_CONFIGURATION_ERROR]: ' 🔧 排查步骤：1) 检查my.cnf配置文件语法 2) 验证slow_query_log_file路径存在 3) 检查参数值是有效的数字/字符串 4) 重启MySQL服务使配置生效',
      [ErrorCategory.SLOW_QUERY_REPORT_GENERATION_ERROR]: ' 🔧 排查步骤：1) 验证SQL查询语句正确性 2) 检查导出文件路径可写权限 3) 测试小规模数据集的导出 4) 检查内存是否充足生成大型报表',
      [ErrorCategory.SLOW_QUERY_MONITORING_ERROR]: ' 🔧 排查步骤：1) 检查定时任务调度器状态 2) 验证慢查询监控时间间隔 3) 检查系统资源是否充足 4) 查看监控日志中的具体错误',
      [ErrorCategory.SLOW_QUERY_INDEX_SUGGESTION_ERROR]: ' 🔧 排查步骤：1) 检查performance_schema有足够的历史数据 2) 验证查询统计表可用性 3) 检查分析参数设置合理 4) 确保有足够权限访问查询统计'
    };

    return troubleshootingMap[category] || '';
  }
}