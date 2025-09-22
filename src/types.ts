/**
 * 统一类型定义系统 - MySQL MCP企业级类型管理平台
 *
 * 基于FastMCP框架的高性能、企业级类型定义管理系统，集成了完整的类型导出和兼容性管理功能栈。
 * 为Model Context Protocol (MCP)提供统一、安全、高效的类型定义服务，
 * 支持企业级应用的所有类型管理需求。
 *
 * @fileoverview 统一类型定义系统 - MySQL MCP企业级类型管理平台
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

// 数据库相关类型
export * from './types/databaseTypes.js';

// 错误处理相关类型
export * from './types/errorTypes.js';

// 缓存相关类型
export * from './types/cacheTypes.js';

// 备份相关类型
export * from './types/backupTypes.js';

// 为了保持向后兼容性，重新导出一些常用类型的别名
export type {
  QueryResult,
  BackupOptions,
  ExportOptions,
  BackupResult,
  ExportResult,
  ReportConfig,
  ImportOptions,
  ImportResult,
  ValidationResult,
  FieldMapping,
  ImportProgress
} from './types/databaseTypes.js';

export {
  ErrorSeverity,
  ErrorCategory,
  ValidationLevel,
  MySQLMCPError,
  ErrorContext
} from './types/errorTypes.js';

export {
  CacheEntry,
  CacheRegion,
  CacheRegionStats
} from './types/cacheTypes.js';