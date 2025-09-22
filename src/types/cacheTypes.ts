/**
 * 缓存相关类型定义
 *
 * @fileoverview 缓存系统、策略和统计相关类型
 * @author liyq
 * @since 1.0.0
 */

/**
 * 缓存条目接口
 *
 * 表示单个缓存条目，包含用于 LRU 跟踪、TTL 过期和访问模式分析的元数据。
 *
 * @interface CacheEntry
 * @template T - 缓存数据的类型
 * @since 1.0.0
 */
export interface CacheEntry<T> {
  /** 实际缓存的数据 */
  data: T;

  /** 条目创建时的时间戳（用于生存时间TTL计算） */
  createdAt: number;

  /** 此条目被访问的次数 */
  accessCount: number;

  /** 最后访问的时间戳（用于最近最少使用LRU计算） */
  lastAccessed: number;
}

/**
 * 缓存区域枚举
 *
 * 定义不同类型的缓存区域，用于分离和管理不同类型的缓存数据。
 */
export enum CacheRegion {
  /** 数据库表结构缓存 */
  SCHEMA = 'schema',
  /** 表存在性检查缓存 */
  TABLE_EXISTS = 'table_exists',
  /** 索引信息缓存 */
  INDEX = 'index',
  /** 查询结果缓存 */
  QUERY_RESULT = 'query_result'
}

/**
 * 缓存统计信息接口
 *
 * 提供缓存区域的详细统计信息，用于性能监控和优化。
 */
export interface CacheRegionStats {
  /** 当前缓存条目数 */
  size: number;
  /** 最大缓存条目数 */
  maxSize: number;
  /** 动态调整的最大缓存条目数 */
  dynamicMaxSize: number;
  /** 缓存命中次数 */
  hitCount: number;
  /** 缓存未命中次数 */
  missCount: number;
  /** 缓存命中率 (0-1) */
  hitRate: number;
  /** 缓存条目生存时间（秒） */
  ttl: number;
}