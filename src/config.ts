/**
 * 企业级配置管理系统 - 统一配置中心
 *
 * 完整的企业级配置管理解决方案，提供类型安全的配置加载、验证、
 * 环境适应和动态调整能力。为MySQL MCP服务器提供集中式、可靠的
 * 配置管理服务，确保系统在不同环境和场景下的稳定运行。
 * 
 * @fileoverview 企业级配置管理系统 - MySQL MCP服务器统一配置解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import { config } from 'dotenv';
import { DefaultConfig, StringConstants } from './constants.js';
import { logger } from './logger.js';

// 加载环境变量配置
config();

/**
 * 数据库配置接口
 *
 * 定义完整的 MySQL 数据库连接和连接池配置参数。
 * 包含数据库连接参数、SSL 设置、超时配置和连接池管理参数。
 *
 * @interface DatabaseConfig
 * @since 1.0.0
 * @license MIT
 *
 * @example
 * // 数据库配置示例
 * const dbConfig: DatabaseConfig = {
 *   host: 'localhost',
 *   port: 3306,
 *   user: 'myuser',
 *   password: 'mypassword',
 *   database: 'mydb',
 *   connectionLimit: 10,
 *   minConnections: 2,
 *   connectTimeout: 60,
 *   idleTimeout: 60,
 *   sslEnabled: false
 * };
 */
export interface DatabaseConfig {
  /** MySQL 服务器主机名或 IP 地址 */
  host: string;

  /** MySQL 服务器端口号（默认：3306） */
  port: number;

  /** 用于身份验证的数据库用户名 */
  user: string;

  /** 用于身份验证的数据库密码 */
  password: string;

  /** 目标数据库名称 */
  database: string;

  /** 连接池中的最大连接数 */
  connectionLimit: number;

  /** 连接池中要维护的最小连接数 */
  minConnections: number;

  /** 连接超时时间（秒） */
  connectTimeout: number;

  /** 空闲连接超时时间（秒） */
  idleTimeout: number;

  /** 是否启用 SSL/TLS 加密 */
  sslEnabled: boolean;
}

/**
 * 安全配置接口
 *
 * 定义查询执行和访问控制的安全策略和限制参数。
 * 包含查询长度限制、速率限制、结果集限制和访问控制配置。
 *
 * @interface SecurityConfig
 * @since 1.0.0
 * @license MIT
 *
 * @example
 * // 安全配置示例
 * const securityConfig: SecurityConfig = {
 *   maxQueryLength: 10000,
 *   allowedQueryTypes: ['SELECT', 'INSERT', 'UPDATE'],
 *   maxResultRows: 1000,
 *   queryTimeout: 30,
 *   rateLimitMax: 100,
 *   rateLimitWindow: 60
 * };
 */
export interface SecurityConfig {
  /** SQL 查询的最大允许长度 */
  maxQueryLength: number;

  /** 允许的 SQL 查询类型列表（SELECT、INSERT 等） */
  allowedQueryTypes: string[];

  /** 单个查询可以返回的最大行数 */
  maxResultRows: number;

  /** 查询执行超时时间（秒） */
  queryTimeout: number;

  /** 速率限制窗口内的最大请求数 */
  rateLimitMax: number;

  /** 速率限制窗口持续时间（秒） */
  rateLimitWindow: number;
}

/**
 * 缓存配置接口
 *
 * 定义数据库元数据缓存系统的参数配置。
 * 包含不同缓存类型（模式、表存在性、索引、查询结果）的大小和生命周期设置。
 *
 * @interface CacheConfig
 * @since 1.0.0
 * @license MIT
 *
 * @example
 * // 缓存配置示例
 * const cacheConfig: CacheConfig = {
 *   schemaCacheSize: 128,
 *   tableExistsCacheSize: 64,
 *   indexCacheSize: 64,
 *   cacheTTL: 300,
 *   enableQueryCache: true,
 *   queryCacheSize: 1000,
 *   queryCacheTTL: 300,
 *   maxQueryResultSize: 1048576
 * };
 */
export interface CacheConfig {
  /** 要缓存的模式条目的最大数量 */
  schemaCacheSize: number;

  /** 要缓存的表存在性检查的最大数量 */
  tableExistsCacheSize: number;

  /** 要缓存的索引信息条目的最大数量 */
  indexCacheSize: number;

  /** 缓存生存时间（秒） */
  cacheTTL: number;

  /** 是否启用查询结果缓存 */
  enableQueryCache: boolean;

  /** 要缓存的查询结果条目的最大数量 */
  queryCacheSize: number;

  /** 查询结果缓存生存时间（秒） */
  queryCacheTTL: number;

  /** 单个查询结果的最大缓存大小（字节） */
  maxQueryResultSize: number;
  /** 是否启用分级缓存（L1/L2） */
  enableTieredCache?: boolean;
  /** 是否启用TTL动态调整 */
  enableTTLAdjustment?: boolean;
}

/**
 * 配置管理器类
 *
 * 统一的配置管理类，负责从环境变量加载、验证和初始化所有系统配置。
 * 提供类型安全的数据库、安全和缓存配置访问接口。
 *
 * @class ConfigurationManager
 * @since 1.0.0
 * @license MIT
 *
 * @example
 * // 创建配置管理器实例
 * const configManager = new ConfigurationManager();
 *
 * // 访问数据库配置
 * const dbConfig = configManager.database;
 *
 * // 访问安全配置
 * const securityConfig = configManager.security;
 *
 * // 访问缓存配置
 * const cacheConfig = configManager.cache;
 */
export class ConfigurationManager {
  /** 数据库连接和连接池配置 */
  public database: DatabaseConfig;

  /** 安全策略和访问控制配置 */
  public security: SecurityConfig;

  /** 缓存系统配置 */
  public cache: CacheConfig;

  /**
   * 配置管理器构造函数
   *
   * 通过从环境变量加载来初始化所有配置部分，
   * 并回退到安全的默认值。
   *
   * @constructor
   */
  constructor() {
    this.database = this.loadDatabaseConfig();
    this.security = this.loadSecurityConfig();
    this.cache = this.loadCacheConfig();
  }

  /**
   * 加载数据库配置
   *
   * 从环境变量加载数据库连接设置，包含验证和安全默认值。
   * 支持MySQL连接参数，包括SSL、超时和连接池。
   * 添加配置验证以确保数据完整性。
   *
   * @private
   * @returns {DatabaseConfig} 已验证的数据库配置对象
   */
  private loadDatabaseConfig(): DatabaseConfig {
    const port = this.parseIntWithValidation(
      process.env[StringConstants.ENV_MYSQL_PORT], 
      DefaultConfig.MYSQL_PORT,
      1,
      65535,
      'MySQL端口'
    );

    const connectionLimit = this.parseIntWithValidation(
      process.env[StringConstants.ENV_CONNECTION_LIMIT],
      DefaultConfig.CONNECTION_LIMIT,
      1,
      100,
      '连接池限制'
    );

    const connectTimeout = this.parseIntWithValidation(
      process.env[StringConstants.ENV_CONNECT_TIMEOUT],
      DefaultConfig.CONNECT_TIMEOUT,
      1,
      300,
      '连接超时'
    );

    return {
      host: process.env[StringConstants.ENV_MYSQL_HOST] || StringConstants.DEFAULT_HOST,
      port,
      user: process.env[StringConstants.ENV_MYSQL_USER] || StringConstants.DEFAULT_USER,
      password: process.env[StringConstants.ENV_MYSQL_PASSWORD] || StringConstants.DEFAULT_PASSWORD,
      database: process.env[StringConstants.ENV_MYSQL_DATABASE] || StringConstants.DEFAULT_DATABASE,
      connectionLimit,
      minConnections: DefaultConfig.MIN_CONNECTIONS,
      connectTimeout,
      idleTimeout: this.parseIntWithValidation(
        process.env[StringConstants.ENV_IDLE_TIMEOUT],
        DefaultConfig.IDLE_TIMEOUT,
        1,
        3600,
        '空闲超时'
      ),
      sslEnabled: (process.env[StringConstants.ENV_MYSQL_SSL] || '').toLowerCase() === StringConstants.TRUE_STRING
    };
  }

  /**
   * 加载安全配置
   *
   * 从环境变量加载安全策略，包括查询限制、
   * 速率限制和访问控制设置。
   *
   * @private
   * @returns {SecurityConfig} 已验证的安全配置对象
   */
  private loadSecurityConfig(): SecurityConfig {
    const allowedTypesStr = process.env[StringConstants.ENV_ALLOWED_QUERY_TYPES] || StringConstants.DEFAULT_ALLOWED_QUERY_TYPES;
    const allowedTypes = allowedTypesStr.split(',').map(t => t.trim().toUpperCase());

    return {
      maxQueryLength: parseInt(process.env[StringConstants.ENV_MAX_QUERY_LENGTH] || DefaultConfig.MAX_QUERY_LENGTH.toString(), 10),
      allowedQueryTypes: allowedTypes,
      maxResultRows: parseInt(process.env[StringConstants.ENV_MAX_RESULT_ROWS] || DefaultConfig.MAX_RESULT_ROWS.toString(), 10),
      queryTimeout: parseInt(process.env[StringConstants.ENV_QUERY_TIMEOUT] || DefaultConfig.QUERY_TIMEOUT.toString(), 10),
      rateLimitMax: parseInt(process.env[StringConstants.ENV_RATE_LIMIT_MAX] || DefaultConfig.RATE_LIMIT_MAX.toString(), 10),
      rateLimitWindow: parseInt(process.env[StringConstants.ENV_RATE_LIMIT_WINDOW] || DefaultConfig.RATE_LIMIT_WINDOW.toString(), 10)
    };
  }

  /**
   * 加载缓存配置
   *
   * 从环境变量加载缓存系统参数，包括缓存大小和
   * 生存时间设置以获得最佳性能。包含查询结果缓存配置。
   *
   * @private
   * @returns {CacheConfig} 已验证的缓存配置对象
   */
  private loadCacheConfig(): CacheConfig {
    return {
      schemaCacheSize: parseInt(process.env.SCHEMA_CACHE_SIZE || DefaultConfig.SCHEMA_CACHE_SIZE.toString(), 10),
      tableExistsCacheSize: parseInt(process.env.TABLE_EXISTS_CACHE_SIZE || DefaultConfig.TABLE_EXISTS_CACHE_SIZE.toString(), 10),
      indexCacheSize: parseInt(process.env.INDEX_CACHE_SIZE || DefaultConfig.INDEX_CACHE_SIZE.toString(), 10),
      cacheTTL: parseInt(process.env.CACHE_TTL || DefaultConfig.CACHE_TTL.toString(), 10),
      enableQueryCache: (process.env.ENABLE_QUERY_CACHE || 'true').toLowerCase() === 'true',
      queryCacheSize: parseInt(process.env.QUERY_CACHE_SIZE || '1000', 10),
      queryCacheTTL: parseInt(process.env.QUERY_CACHE_TTL || DefaultConfig.CACHE_TTL.toString(), 10),
      maxQueryResultSize: parseInt(process.env.MAX_QUERY_RESULT_SIZE || '1048576', 10)
      ,
      enableTieredCache: (process.env.ENABLE_TIERED_CACHE || 'false').toLowerCase() === 'true',
      enableTTLAdjustment: (process.env.ENABLE_TTL_ADJUSTMENT || 'false').toLowerCase() === 'true'
    };
  }

  /**
   * 导出配置用于诊断
   *
   * 返回适用于系统诊断和日志记录的清理配置对象。
   * 敏感信息（如密码）将被掩码以确保安全。
   *
   * @public
   * @returns {object} 清理后的配置对象，可用于监控和诊断
   *
   * @example
   * const config = manager.toObject();
   * console.log(JSON.stringify(config, null, 2));
   *
   * @example
   * // 配置对象可用于系统监控
   * const diagnosticInfo = {
   *   timestamp: Date.now(),
   *   config: manager.toObject()
   * };
   */
  public toObject(): object {
    const configObj = {
      database: { ...this.database },
      security: { ...this.security },
      cache: { ...this.cache }
    };

    // 为安全起见掩码敏感信息
    configObj.database.password = '***';

    return configObj;
  }

  /**
   * 解析带验证的整数
   *
   * 安全地解析整数值，带有范围验证和错误处理。
   *
   * @private
   * @param envValue - 环境变量值
   * @param defaultValue - 默认值
   * @param min - 最小允许值
   * @param max - 最大允许值
   * @param paramName - 参数名称（用于错误消息）
   * @returns 验证后的整数值
   */
  private parseIntWithValidation(
    envValue: string | undefined,
    defaultValue: number,
    min: number,
    max: number,
    paramName: string
  ): number {
    if (!envValue) return defaultValue;
    
    const parsed = parseInt(envValue, 10);
    if (isNaN(parsed)) {
      logger.warn(`参数值无效`, 'ConfigurationManager', {
        parameter: paramName,
        value: envValue,
        defaultValue,
        reason: 'invalid_number'
      });
      return defaultValue;
    }
    
    if (parsed < min || parsed > max) {
      logger.warn(`参数值超出范围`, 'ConfigurationManager', {
        parameter: paramName,
        value: parsed,
        min,
        max,
        defaultValue,
        reason: 'out_of_range'
      });
      return defaultValue;
    }
    
    return parsed;
  }

  /**
   * 获取配置摘要
   *
   * 返回关键配置参数的简洁摘要字符串，
   * 用于快速状态检查和监控仪表板。
   *
   * @public
   * @returns {Record<string, string>} 关键配置参数的字符串形式
   *
   * @example
   * const summary = manager.getSummary();
   * console.log(`数据库: ${summary.database_host}:${summary.database_port}`);
   */
  public getSummary(): Record<string, string> {
    return {
      database_host: this.database.host,
      database_port: this.database.port.toString(),
      connection_limit: this.database.connectionLimit.toString(),
      max_result_rows: this.security.maxResultRows.toString(),
      rate_limit_max: this.security.rateLimitMax.toString(),
      schema_cache_size: this.cache.schemaCacheSize.toString()
    };
  }
}