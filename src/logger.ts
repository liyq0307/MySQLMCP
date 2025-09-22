/**
 * MySQL企业级日志记录系统 - 结构化日志与安全审计中心
 *
 * 企业级综合日志记录解决方案，集成结构化日志记录和安全事件审计功能。
 * 为MySQL MCP服务器提供完整的日志监控、安全审计和问题诊断能力，
 * 支持多级别日志记录、敏感信息保护和实时安全事件跟踪。
 *
 * @fileoverview 企业级日志系统 - 结构化记录、安全审计、性能优化
 * @author liyq  
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 */

/* 从专门的安全日志记录器模块导入 */
import { SecurityLogger, SecurityEventType, SecurityLogEntry } from './logging/securityLogger.js';
import { StructuredLogger } from './logging/structuredLogger.js';

/**
 * 全局结构化日志记录器实例
 *
 * 提供统一的结构化日志记录接口，支持多种日志级别和格式。
 * 使用单例模式确保全局一致性，支持异步写入、上下文追踪和回调函数。
 * 集成敏感信息过滤功能，确保日志安全。
 *
 * @public
 * @readonly
 * @type {StructuredLogger}
 * @example
 * // 记录不同级别的日志
 * logger.info('用户登录成功', 'auth', { userId: '123', ip: '192.168.1.1' });
 * logger.error('数据库连接失败', 'database', new Error('Connection timeout'));
 * 
 * // 创建子日志记录器
 * const authLogger = logger.child('auth');
 * authLogger.debug('认证过程开始');
 */
export const logger: StructuredLogger = StructuredLogger.getInstance();

/**
 * 全局安全日志记录器实例
 *
 * 提供专门的安全事件日志记录功能，用于审计和监控安全相关活动。
 * 支持安全事件分类、详细日志记录和安全威胁分析。
 * 包含SQL注入、访问违规、认证失败等安全事件的专用记录方法。
 *
 * @public
 * @readonly
 * @type {SecurityLogger}
 * @example
 * // 记录SQL注入尝试
 * securityLogger.logSqlInjectionAttempt(
 *   "SELECT * FROM users WHERE id = '1' OR '1'='1'",
 *   ['union_injection', 'boolean_injection'],
 *   '192.168.1.100',
 *   'user123'
 * );
 * 
 * // 记录访问违规
 * securityLogger.logAccessViolation(
 *   '/admin/settings',
 *   'user123',
 *   'ADMIN_PERMISSION',
 *   '192.168.1.100'
 * );
 */
export const securityLogger: SecurityLogger = new SecurityLogger(1000);

/**
 * 重新导出安全日志相关类型和枚举
 */
export { SecurityLogger, SecurityEventType, SecurityLogEntry };