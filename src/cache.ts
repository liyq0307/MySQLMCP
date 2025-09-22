/**
 * 企业级智能缓存系统 - 高性能数据库缓存解决方案
 *
 * 完整的企业级缓存系统，集成了智能缓存管理、内存压力感知、多区域隔离、
 * 性能监控和自适应优化等高级特性。为MySQL数据库操作提供高效、可靠的
 * 缓存支持，显著提升系统性能和响应速度。
 *
 * @fileoverview 企业级智能缓存系统 - MySQL数据库高性能缓存解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import { DefaultConfig, StringConstants } from './constants.js';
import { CacheConfig } from './config.js';
import { TimeUtils } from './utils/common.js';
import AsyncLock from 'async-lock';
import { CacheEntry, CacheRegion, CacheRegionStats } from './types.js';
import { logger } from './logger.js';
import { memoryPressureManager, MemoryPressureObserver } from './memoryPressureManager.js';

/**
 * 智能缓存类
 *
 * 高级缓存实现，具有多种淘汰策略：
 * - 缓存满时的 LRU（最近最少使用）淘汰
 * - TTL（生存时间）自动过期
 * - 用于性能分析的访问模式跟踪
 * - 内存压力感知的自适应缓存大小调整
 * - WeakMap内存泄漏防护（可选）
 *
 * 性能特征：
 * - O(1) 获取/放置操作
 * - O(1) LRU 淘汰
 * - 内存高效，具有自动清理功能
 * - 内存压力感知的动态调整
 * - WeakMap自动垃圾回收（防止内存泄漏）
 *
 * 线程安全：
 * - 使用AsyncLock异步锁定机制进行并发访问
 * - 在高并发环境中安全使用，支持Promise/async-await模式
 *
 * @class SmartCache
 * @template T - 要缓存的数据类型
 * @since 1.0.0
 */
export class SmartCache<T> {
  /** 缓存中允许的最大条目数 */
  private max_size: number;

  /** 缓存条目的生存时间（秒） */
  private ttl: number;

  /** 当前动态调整的最大大小（内存压力感知） */
  private dynamic_max_size: number;

  /** 存储带元数据的缓存条目的内部映射表 */
  private cache: Map<string, CacheEntry<T>>;

  /** AsyncLock异步锁实例，确保并发环境下的数据一致性 */
  private lock: AsyncLock;

  /** 成功缓存命中次数 */
  private hit_count: number;

  /** 缓存未命中次数 */
  private miss_count: number;

  /** WeakMap缓存 - 内存泄漏防护（可选） */
  private weakCache?: WeakMap<object, CacheEntry<T>>;

  /** WeakRef注册表 - 跟踪对象引用 */
  private weakRefRegistry?: Map<string, WeakRef<object>>;

  /** 是否启用WeakMap防护 */
  private enableWeakMapProtection: boolean;

  /** WeakMap统计 */
  private weakMapStats = {
    autoCollectedCount: 0,
    lastCleanupTime: 0,
    memorySaved: 0
  };

  /** 缓存预热状态 */
  private warmupStatus = {
    isWarming: false,
    warmedCount: 0,
    lastWarmupTime: 0
  };

  /** 数据加载器 */
  private dataLoader?: (key: string) => Promise<T>;

  /** 预取配置 */
  private prefetchConfig = {
    enabled: false,
    threshold: 0.7, // 访问频率阈值
    maxPrefetchItems: 10
  };

  /** 分级缓存配置 */
  private tieredCacheConfig = {
    enabled: false,
    l1Size: 100,    // L1缓存大小
    l1TTL: 300,     // L1缓存TTL
    l2Size: 1000,   // L2缓存大小
    l2TTL: 3600     // L2缓存TTL
  };

  /**
   * 配置分级缓存
   * 
   * @param {boolean} enabled - 是否启用分级缓存
   * @param {object} config - 分级缓存配置
   * @param {number} config.l1Size - L1缓存大小
   * @param {number} config.l1TTL - L1缓存TTL
   * @param {number} config.l2Size - L2缓存大小
   * @param {number} config.l2TTL - L2缓存TTL
   */
  public configureL2Cache(
    enabled: boolean,
    config?: {
      l1Size?: number;
      l1TTL?: number;
      l2Size?: number;
      l2TTL?: number;
    }
  ): void {
    this.tieredCacheConfig.enabled = enabled;

    if (enabled) {
      if (!this.l2Cache) {
        this.l2Cache = new Map();
      }

      if (config) {
        if (config.l1Size !== undefined) {
          this.tieredCacheConfig.l1Size = Math.max(1, config.l1Size);
        }
        if (config.l1TTL !== undefined) {
          this.tieredCacheConfig.l1TTL = Math.max(1, config.l1TTL);
        }
        if (config.l2Size !== undefined) {
          this.tieredCacheConfig.l2Size = Math.max(
            this.tieredCacheConfig.l1Size,
            config.l2Size
          );
        }
        if (config.l2TTL !== undefined) {
          this.tieredCacheConfig.l2TTL = Math.max(
            this.tieredCacheConfig.l1TTL,
            config.l2TTL
          );
        }
      }
    } else if (this.l2Cache) {
      this.l2Cache.clear();
      this.l2Cache = undefined;
    }

    logger.debug(
      `分级缓存配置已更新`,
      'SmartCache',
      {
        enabled,
        config: this.tieredCacheConfig
      }
    );
  }

  /** 二级缓存 */
  private l2Cache?: Map<string, CacheEntry<T>>;

  /** TTL调整配置 */
  private ttlAdjustConfig = {
    enabled: false,
    minTTL: 60,     // 最小 TTL
    maxTTL: 7200,   // 最大 TTL
    factor: 1.5     // 调整因子
  };

  /**
   * 动态调整条目的TTL
   * 
   * @private
   * @param {CacheEntry<T>} entry - 缓存条目
   */
  private adjustTTL(entry: CacheEntry<T>): void {
    if (!this.ttlAdjustConfig.enabled) return;

    // 根据访问频率动态调整TTL
    const accessRate = entry.accessCount / ((Date.now() - entry.createdAt) / 1000);
    let newTTL = this.ttl;

    if (accessRate > 0.1) { // 每10秒至少访问一次
      // 增加TTL
      newTTL = Math.min(
        this.ttlAdjustConfig.maxTTL,
        this.ttl * this.ttlAdjustConfig.factor
      );
    } else if (accessRate < 0.01) { // 每100秒不到一次访问
      // 减少TTL
      newTTL = Math.max(
        this.ttlAdjustConfig.minTTL,
        this.ttl / this.ttlAdjustConfig.factor
      );
    }

    if (newTTL !== this.ttl) {
      logger.debug(
        `动态调整TTL: ${this.ttl}s -> ${newTTL}s (访问率: ${accessRate.toFixed(4)}/s)`,
        'SmartCache',
        { accessCount: entry.accessCount, accessRate }
      );
      this.ttl = newTTL;
    }
  }

  /**
   * 配置TTL动态调整
   * 
   * @param {boolean} enabled - 是否启用TTL动态调整
   * @param {object} config - TTL调整配置
   * @param {number} config.minTTL - 最小TTL（秒）
   * @param {number} config.maxTTL - 最大TTL（秒）
   * @param {number} config.factor - 调整因子
   */
  public configureTTLAdjustment(
    enabled: boolean,
    config?: {
      minTTL?: number;
      maxTTL?: number;
      factor?: number;
    }
  ): void {
    this.ttlAdjustConfig.enabled = enabled;

    if (enabled && config) {
      if (config.minTTL !== undefined) {
        this.ttlAdjustConfig.minTTL = Math.max(1, config.minTTL);
      }
      if (config.maxTTL !== undefined) {
        this.ttlAdjustConfig.maxTTL = Math.max(
          this.ttlAdjustConfig.minTTL,
          config.maxTTL
        );
      }
      if (config.factor !== undefined) {
        this.ttlAdjustConfig.factor = Math.max(1.1, config.factor);
      }
    }

    logger.debug(
      `TTL动态调整配置已更新`,
      'SmartCache',
      {
        enabled,
        config: this.ttlAdjustConfig
      }
    );
  }

  /**
   * 智能缓存构造函数
   *
   * 使用指定的最大大小和TTL设置初始化缓存。
   * 设置内部数据结构和性能计数器。
   *
   * @constructor
   * @param {number} maxSize - 要存储的最大条目数
   * @param {number} [ttl=DefaultConfig.CACHE_TTL] - 生存时间（秒）
   * @param {boolean} [enableWeakMapProtection=false] - 是否启用WeakMap内存泄漏防护
   *
   * @example
   * // 创建具有100个条目、5分钟生存时间的缓存
   * const cache = new SmartCache<string>(100, 300);
   *
   * // 创建带WeakMap防护的缓存
   * const protectedCache = new SmartCache<string>(100, 300, true);
   */
  constructor(
    maxSize: number,
    ttl: number = DefaultConfig.CACHE_TTL,
    enableWeakMapProtection: boolean = false,
    enableTieredCache: boolean = false
  ) {
    this.max_size = maxSize;
    this.ttl = ttl;
    this.dynamic_max_size = maxSize; // 初始动态大小等于配置大小
    this.cache = new Map<string, CacheEntry<T>>();
    this.lock = new AsyncLock();
    this.hit_count = 0;
    this.miss_count = 0;
    this.enableWeakMapProtection = enableWeakMapProtection;

    // 初始化WeakMap防护（如果启用且支持）
    if (this.enableWeakMapProtection && typeof WeakMap !== 'undefined' && typeof WeakRef !== 'undefined') {
      this.weakCache = new WeakMap();
      this.weakRefRegistry = new Map();
    }

    // 如果启用分级缓存，初始化L2缓存
    if (enableTieredCache) {
      this.tieredCacheConfig.enabled = true;
      this.l2Cache = new Map();
    }
  }

  /**
   * 调整缓存大小以响应内存压力
   *
   * 根据内存压力级别动态调整缓存大小，以减少内存使用。
   *
   * @public
   * @param {number} pressureLevel - 内存压力级别 (0-1)
   */
  public adjustForMemoryPressure(pressureLevel: number): void {
    // 基于内存压力调整缓存大小
    // 内存压力级别: 0 = 无压力, 1 = 最大压力
    const scaleFactor = Math.max(0.1, 1 - pressureLevel); // 最小保持10%大小
    this.dynamic_max_size = Math.max(1, Math.floor(this.max_size * scaleFactor));
    
    // 如果当前缓存大小超过动态大小，则淘汰多余的条目
    while (this.cache.size > this.dynamic_max_size) {
      this.evictLRU();
    }
  }

  /**
   * 从缓存获取值（支持WeakMap防护）
   *
   * 从缓存中检索值，自动检查过期和更新LRU位置。
   * 更新访问统计信息并将访问的条目移动到末尾以进行LRU跟踪。
   * 使用锁机制确保线程安全。
   *
   * 时间复杂度：O(1) 平均情况
   *
   * @public
   * @param {string} key - 要检索的缓存键
   * @param {object} [keyObject] - 用于WeakMap的键对象（启用WeakMap防护时使用）
   * @returns {Promise<T | null>} 缓存值，如果未找到/过期则返回null
   *
   * @example
   * const userData = await cache.get('user:123');
   * if (userData) {
   *   console.log('缓存命中:', userData);
   * } else {
   *   console.log('缓存未命中，需要从数据库获取');
   * }
   *
   * // 使用WeakMap防护
   * const userData = await cache.get('user:123', userObj);
   */
  public async get(key: string, keyObject?: object): Promise<T | null> {
    return this.lock.acquire('cache-access', async () => {
      // 先检查L1缓存
      let entry = this.cache.get(key);

      // 尝试从WeakMap获取（如果启用且提供了keyObject）
      if (!entry && this.enableWeakMapProtection && keyObject && this.weakCache) {
        entry = this.weakCache.get(keyObject);
        if (entry) {
          // 从WeakMap恢复到主缓存
          this.cache.set(key, entry);
        }
      }

      // 检查WeakRef是否仍然有效
      if (!entry && this.enableWeakMapProtection && this.weakRefRegistry) {
        const weakRef = this.weakRefRegistry.get(key);
        if (weakRef) {
          const obj = weakRef.deref();
          if (obj && this.weakCache) {
            entry = this.weakCache.get(obj);
            if (entry) {
              // 从WeakMap恢复到主缓存
              this.cache.set(key, entry);
            }
          } else {
            // WeakRef失效，清理注册表
            this.weakRefRegistry.delete(key);
            this.weakMapStats.autoCollectedCount++;
          }
        }
      }

      // 如果未在L1中找到，尝试从L2读取并提升到L1（如果启用分级缓存）
      if (!entry && this.tieredCacheConfig.enabled && this.l2Cache) {
        const l2Entry = this.l2Cache.get(key);
        if (l2Entry) {
          // 检查L2条目是否过期
          if (!this.isExpired(l2Entry)) {
            // 从L2提升到L1
            this.l2Cache.delete(key);
            // 在提升时，确保L1不超过其限制
            this.cache.set(key, l2Entry);
            l2Entry.accessCount++;
            l2Entry.lastAccessed = TimeUtils.now();
            this.hit_count++;

            // 保证L1大小受控
            const l1Limit = Math.min(this.dynamic_max_size, this.tieredCacheConfig.l1Size);
            while (this.cache.size > Math.max(1, l1Limit)) {
              this.evictLRU();
            }

            // 动态调整TTL（如果启用）
            try {
              this.adjustTTL(l2Entry);
            } catch (_error) {
              // ignore
            }

            return l2Entry.data;
          } else {
            // L2中的条目已过期，直接删除
            this.l2Cache.delete(key);
          }
        }
      }

      // 缓存未命中：未找到键
      if (!entry) {
        this.miss_count++;
        // 如果命中率低于阈值，触发智能预取
        const total = this.hit_count + this.miss_count;
        if (total > 100 && this.hit_count / total < 0.5) {
          void this.performPrefetch();
        }
        return null;
      }

      // 检查条目是否已过期
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        // 清理WeakRef注册表
        if (this.weakRefRegistry) {
          this.weakRefRegistry.delete(key);
        }
        this.miss_count++;
        return null;
      }

      // 缓存命中：更新访问统计信息
      entry.accessCount++;
      entry.lastAccessed = TimeUtils.now();
      this.hit_count++;

      // 移动到末尾进行最近最少使用跟踪（标记为最近使用）
      this.cache.delete(key);
      this.cache.set(key, entry);

      // 动态调整TTL（如果启用）
      try {
        this.adjustTTL(entry);
      } catch (_error) {
        // ignore
      }

      return entry.data;
    });
  }

  /**
   * 将值放入缓存（支持WeakMap防护）
   *
   * 将值存储在缓存中，当缓存满时自动淘汰。
   * 更新现有条目或创建带有适当元数据的新条目。
   * 当缓存达到最大大小时实施LRU淘汰策略。
   * 使用锁机制确保线程安全。
   *
   * 时间复杂度：O(1) 平均情况，需要淘汰时为O(n)
   *
   * @public
   * @param {string} key - 值的缓存键
   * @param {T} value - 要存储在缓存中的值
   * @param {object} [keyObject] - 用于WeakMap的键对象（启用WeakMap防护时使用）
   *
   * @example
   * await cache.put('user:123', { id: 123, name: 'John Doe' });
   *
   * // 使用WeakMap防护
   * const userObj = { id: 123 };
   * await cache.put('user:123', userData, userObj);
   */
  public async put(key: string, value: T, keyObject?: object): Promise<void> {
    return this.lock.acquire('cache-access', async () => {
      // 更新现有条目并移动到末尾（最近使用）
      if (this.cache.has(key)) {
        const entry = this.cache.get(key)!;
        entry.data = value;
        entry.createdAt = TimeUtils.now();
        entry.accessCount = 0;
        entry.lastAccessed = TimeUtils.now();
        this.cache.delete(key);
        this.cache.set(key, entry);

        // 更新WeakMap（如果启用且提供了keyObject）
        if (this.enableWeakMapProtection && keyObject && this.weakCache) {
          this.weakCache.set(keyObject, entry);
          if (this.weakRefRegistry && typeof WeakRef !== 'undefined') {
            this.weakRefRegistry.set(key, new WeakRef(keyObject));
          }
        }
        return;
      }

      // 如果启用分级缓存，则以L1大小作为第一层限制
      const l1Limit = this.tieredCacheConfig.enabled
        ? Math.max(1, this.tieredCacheConfig.l1Size)
        : this.dynamic_max_size;

      // 如果L1已满（基于L1限制），将最旧的L1条目迁移到L2或直接淘汰
      if (this.cache.size >= l1Limit) {
        // 取出要淘汰的键
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          const firstEntry = this.cache.get(firstKey);
          if (firstEntry) {
            // 如果启用了分级缓存并存在L2，则将条目下沉到L2
            if (this.tieredCacheConfig.enabled && this.l2Cache) {
              // 放入L2
              this.l2Cache.set(firstKey, firstEntry);

              // 控制L2大小
              const l2Limit = Math.max(1, this.tieredCacheConfig.l2Size);
              while (this.l2Cache.size > l2Limit) {
                // 淘汰L2中最旧的
                const l2FirstKey = this.l2Cache.keys().next().value;
                if (!l2FirstKey) break;
                this.l2Cache.delete(l2FirstKey);
              }
            }
          }
        }

        // 从L1删除最旧项
        this.evictLRU();
      }

      // 创建并添加新的缓存条目
      const entry: CacheEntry<T> = {
        data: value,
        createdAt: TimeUtils.now(),
        accessCount: 0,
        lastAccessed: TimeUtils.now()
      };

      this.cache.set(key, entry);

      // 添加到WeakMap（如果启用且提供了keyObject）
      if (this.enableWeakMapProtection && keyObject && this.weakCache) {
        this.weakCache.set(keyObject, entry);
        if (this.weakRefRegistry && typeof WeakRef !== 'undefined') {
          this.weakRefRegistry.set(key, new WeakRef(keyObject));
        }
      }
    });
  }

  /**
   * 从缓存中移除指定条目
   *
   * 从缓存中移除指定键的条目，使用锁机制确保线程安全。
   *
   * @public
   * @param {string} key - 要移除的缓存键
   * @returns {Promise<boolean>} 是否成功移除
   *
   * @example
   * const removed = await cache.remove('user:123');
   */
  public async remove(key: string): Promise<boolean> {
    return this.lock.acquire('cache-access', async () => {
      return this.cache.delete(key);
    });
  }

  /**
   * 清空缓存
   *
   * 从缓存中移除所有条目并重置统计信息。
   * 用于缓存失效或内存清理。
   * 使用锁机制确保线程安全。
   *
   * 时间复杂度：O(1)
   *
   * @public
   *
   * @example
   * await cache.clear(); // 移除所有缓存数据
   */
  public async clear(): Promise<void> {
    return this.lock.acquire('cache-access', async () => {
      this.cache.clear();
      if (this.weakCache) {
        this.weakCache = new WeakMap();
      }
      if (this.weakRefRegistry) {
        this.weakRefRegistry.clear();
      }

      // 清理后触发智能预取分析
      void this.performPrefetch();
    });
  }

  /**
   * 淘汰最近最少使用的项目
   *
   * 优化的LRU淘汰策略，利用Map的插入顺序特性。
   * Map中的第一个条目就是最近最少使用的项目。
   *
   * 时间复杂度：O(1) - 因为使用Map的插入顺序特性
   * 空间复杂度：O(1)
   *
   * @private
   */
  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // 映射表中的第一个条目就是最近最少使用的项目
    const firstKey = this.cache.keys().next().value;
    if (!firstKey) return;

    const firstEntry = this.cache.get(firstKey);
    if (!firstEntry) {
      this.cache.delete(firstKey);
      return;
    }

    // 如果启用分级缓存并存在L2，则将条目移到L2
    if (this.tieredCacheConfig.enabled && this.l2Cache) {
      try {
        this.l2Cache.set(firstKey, firstEntry);

        // 控制L2大小
        const l2Limit = Math.max(1, this.tieredCacheConfig.l2Size);
        while (this.l2Cache.size > l2Limit) {
          const l2FirstKey = this.l2Cache.keys().next().value;
          if (!l2FirstKey) break;
          this.l2Cache.delete(l2FirstKey);
        }
      } catch (_error) {
        // 如果无法放入L2，则降级为直接删除
        this.cache.delete(firstKey);
        return;
      }
    }

    // 从L1中删除条目
    this.cache.delete(firstKey);
  }

  /**
   * 检查条目是否已过期
   *
   * 根据创建时间戳和配置的TTL值确定缓存条目是否已超过其生存时间。
   *
   * @private
   * @param {CacheEntry<T>} entry - 要检查的缓存条目
   * @returns {boolean} 如果条目已过期则返回true，否则返回false
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return TimeUtils.getDurationInMs(entry.createdAt) > this.ttl * 1000;
  }
  
  /**
   * 遍历当前缓存的条目（不更新访问统计）
   *
   * 返回 [key, entry] 的迭代器，用于扫描/清理用途。
   */
  public scanEntries(): IterableIterator<[string, CacheEntry<T>]> {
    return this.cache.entries();
  }

  /**
   * 判断给定缓存条目是否已过期（优先使用 entry.expiresAt，如果存在）
   *
   * 这个方法用于外部扫描时的统一过期判断：
   * - 如果条目包含 expiresAt（例如 QueryCacheEntry），则以此为准；
   * - 否则回退到基于 createdAt + ttl 的判断。
   */
  public isEntryExpired(entry: CacheEntry<T> | QueryCacheEntry): boolean {
    try {
      if (!entry) return true;
      if ('expiresAt' in entry && typeof entry.expiresAt === 'number') {
        return Date.now() >= entry.expiresAt;
      }
      // fallback to SmartCache TTL based expiration
      if ('createdAt' in entry && typeof entry.createdAt === 'number') {
        return TimeUtils.getDurationInMs(entry.createdAt) > this.ttl * 1000;
      }
      return true;
    } catch (_error) {
      // 如果判断过程中出错，认为已过期以便清理不确定的条目
      return true;
    }
  }

  /**
   * 获取缓存统计信息（包含WeakMap统计）
   *
   * 返回关于缓存性能的综合统计信息，包括命中/未命中比率、
   * 大小信息和配置详细信息。对监控和性能调优很有用。
   *
   * @public
   * @returns {Record<string, number>} 缓存统计信息对象
   *
   * @example
   * const stats = cache.getStats();
   * console.log(`命中率: ${(stats.hit_rate * 100).toFixed(2)}%`);
   * console.log(`缓存利用率: ${stats.size}/${stats.max_size}`);
   * console.log(`WeakMap自动回收: ${stats.weak_map_auto_collected}`);
   */
  public getStats(): Record<string, number> {
    const total = this.hit_count + this.miss_count;
    const baseStats = {
      [StringConstants.FIELD_SIZE]: this.cache.size,
      [StringConstants.FIELD_MAX_SIZE]: this.max_size,
      [StringConstants.FIELD_DYNAMIC_MAX_SIZE]: this.dynamic_max_size,
      [StringConstants.FIELD_HIT_COUNT]: this.hit_count,
      [StringConstants.FIELD_MISS_COUNT]: this.miss_count,
      [StringConstants.FIELD_HIT_RATE]: total > 0 ? this.hit_count / total : 0,
      [StringConstants.FIELD_TTL]: this.ttl
    };

    // 添加WeakMap统计（如果启用）
    if (this.enableWeakMapProtection) {
      return {
        ...baseStats,
        weak_map_enabled: 1,
        weak_map_auto_collected: this.weakMapStats.autoCollectedCount,
        weak_map_memory_saved: this.weakMapStats.memorySaved,
        weak_map_last_cleanup: this.weakMapStats.lastCleanupTime,
        weak_ref_registry_size: this.weakRefRegistry?.size || 0
      };
    }

    return baseStats;
  }

  /**
   * 获取所有缓存键
   *
   * 返回缓存中所有键的迭代器，用于遍历缓存条目。
   *
   * @public
   * @returns {IterableIterator<string>} 缓存键的迭代器
   */
  public keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  /**
   * 获取多余缓存键（超出动态最大大小的键）
   *
   * 返回超出当前动态大小限制的缓存键，这些键可以被认为是多余的。
   * 主要用于内存压力管理或缓存优化。
   *
   * @public
   * @returns {string[]} 多余缓存键数组
   *
   * @example
   * const excessKeys = cache.getExcessKeys();
   * console.log(`多余缓存键数量: ${excessKeys.length}`);
   */
  public getExcessKeys(): string[] {
    const keys = Array.from(this.cache.keys());
    if (keys.length <= this.dynamic_max_size) {
      return [];
    }
    
    // 返回超出动态大小的键（按LRU顺序，即最前面的键）
    return keys.slice(0, keys.length - this.dynamic_max_size);
  }

  /**
   * 清理多余缓存键
   *
   * 删除超出动态最大大小限制的缓存条目。
   * 用于主动内存管理，释放不必要的缓存占用。
   *
   * @public
   * @returns {number} 清理的条目数量
   *
   * @example
   * const cleanedCount = cache.cleanExcessKeys();
   * console.log(`清理了 ${cleanedCount} 个多余缓存条目`);
   */
  public cleanExcessKeys(): number {
    const excessKeys = this.getExcessKeys();
    for (const key of excessKeys) {
      this.cache.delete(key);
    }
    return excessKeys.length;
  }

  /**
   * 获取缓存大小
   *
   * @public
   * @returns {number} 缓存条目数量
   */
  public size(): number {
    return this.cache.size;
  }

  // 记录上次WeakMap清理时间
  private lastWeakMapCleanupTime: number = 0;

  // WeakMap清理最小间隔（毫秒），默认30秒
  private weakMapCleanupMinInterval: number = 30 * 1000;

  /**
   * 执行WeakMap清理
   *
   * 清理失效的WeakRef引用，回收内存。
   *
   * 优化策略：
   * - 基于时间间隔控制清理频率
   * - 批量处理提高性能
   * - 减少日志输出频率
   *
   * @public
   * @returns 清理统计信息
   */
  public performWeakMapCleanup(): { cleanedCount: number; memoryReclaimed: number } {
    const now = Date.now();
    const memoryPressure = memoryPressureManager.getCurrentPressure();
    
    // 根据内存压力动态调整清理频率
    // 压力越高，清理间隔越短，清理越频繁
    const dynamicInterval = Math.max(
      this.weakMapCleanupMinInterval * 0.1, // 最短间隔为最小间隔的10%
      this.weakMapCleanupMinInterval * (1 - memoryPressure * 0.9) // 根据压力调整
    );

    // 控制清理频率，避免过于频繁的清理操作
    if (now - this.lastWeakMapCleanupTime < dynamicInterval) {
      return { cleanedCount: 0, memoryReclaimed: 0 };
    }

    if (!this.enableWeakMapProtection || !this.weakRefRegistry) {
      return { cleanedCount: 0, memoryReclaimed: 0 };
    }

    let cleanedCount = 0;
    let memoryReclaimed = 0;

    try {
      // 清理失效的WeakRef
      for (const [key, weakRef] of this.weakRefRegistry.entries()) {
        const obj = weakRef.deref();
        if (!obj) {
          // WeakRef失效，清理
          this.weakRefRegistry.delete(key);
          cleanedCount++;
          memoryReclaimed += 64; // 估算每个引用64字节
        }
      }

      // 更新统计
      this.weakMapStats.autoCollectedCount += cleanedCount;
      this.weakMapStats.memorySaved += memoryReclaimed;
      this.weakMapStats.lastCleanupTime = TimeUtils.now();
      this.lastWeakMapCleanupTime = now;

      // 减少日志输出频率，只在清理到较多条目时记录
      if (cleanedCount > 10) {
        logger.info(`WeakMap cleanup: ${cleanedCount} references cleaned, ${memoryReclaimed} bytes reclaimed`, 'SmartCache');
      }

    } catch (error) {
      logger.warn('WeakMap cleanup failed', 'SmartCache', { error: (error as Error).message });
    }

    return { cleanedCount, memoryReclaimed };
  }

  /**
   * 启用或禁用WeakMap防护
   *
   * @public
   * @param enabled - 是否启用
   */
  public setWeakMapProtection(enabled: boolean): void {
    this.enableWeakMapProtection = enabled;

    if (enabled && typeof WeakMap !== 'undefined' && typeof WeakRef !== 'undefined') {
      if (!this.weakCache) {
        this.weakCache = new WeakMap();
      }
      if (!this.weakRefRegistry) {
        this.weakRefRegistry = new Map();
      }
    } else if (!enabled) {
      // 清理WeakMap相关数据
      this.weakCache = undefined;
      this.weakRefRegistry = undefined;
    }
  }

  /**
   * 配置预取策略
   * 
   * @param {boolean} enabled - 是否启用预取
   * @param {number} threshold - 访问频率阈值 (0-1)
   * @param {number} maxItems - 最大预取数量
   */
  /**
   * 配置预取功能
   * 
   * @param {boolean} enabled - 是否启用预取
   * @param {number} [threshold] - 访问频率阈值 (0-1)
   * @param {number} [maxItems] - 最大预取数量
   * @param {(key: string) => Promise<T>} [dataLoader] - 数据加载器函数
   */
  public configurePrefetch(
    enabled: boolean,
    threshold?: number,
    maxItems?: number,
    dataLoader?: (key: string) => Promise<T>
  ): void {
    this.prefetchConfig.enabled = enabled;
    if (threshold !== undefined) {
      this.prefetchConfig.threshold = Math.max(0, Math.min(1, threshold));
    }
    if (maxItems !== undefined) {
      this.prefetchConfig.maxPrefetchItems = Math.max(1, maxItems);
    }
    if (dataLoader) {
      this.dataLoader = dataLoader;
    }
  }

  /**
   * 批量预热缓存
   * 
   * @param {Map<string, T>} data - 要预热的数据
   * @returns {Promise<void>}
   */
  public async warmup(data: Map<string, T>): Promise<void> {
    if (this.warmupStatus.isWarming) {
      logger.warn('Cache warmup already in progress', 'SmartCache');
      return;
    }

    this.warmupStatus.isWarming = true;
    this.warmupStatus.warmedCount = 0;
    const startTime = TimeUtils.now();

    try {
      for (const [key, value] of data.entries()) {
        if (this.size() >= this.max_size) break;
        
        await this.put(key, value);
        this.warmupStatus.warmedCount++;
      }

      this.warmupStatus.lastWarmupTime = TimeUtils.now();
      const duration = TimeUtils.getDurationInMs(startTime);
      
      logger.info(
        `Cache warmup completed: ${this.warmupStatus.warmedCount} entries warmed up in ${duration}ms`,
        'SmartCache',
        {
          warmedCount: this.warmupStatus.warmedCount,
          duration,
          cacheSize: this.size()
        }
      );
    } catch (error) {
      logger.error(
        'Cache warmup failed',
        'SmartCache',
        error as Error
      );
      throw error;
    } finally {
      this.warmupStatus.isWarming = false;
    }
  }

  /**
   * 获取预热状态
   */
  public getWarmupStatus(): typeof this.warmupStatus {
    return { ...this.warmupStatus };
  }

  /**
   * 执行智能预取
   * 分析访问模式并预取可能需要的数据
   * 
   * @private
   * @returns {Promise<void>}
   */
  private async performPrefetch(): Promise<void> {
    if (!this.prefetchConfig.enabled) return;

    const accessPatterns = new Map<string, number>();
    let totalAccesses = 0;

    // 分析访问模式
    for (const [key, entry] of this.cache.entries()) {
      accessPatterns.set(key, entry.accessCount);
      totalAccesses += entry.accessCount;
    }

    // 没有足够的访问数据进行分析
    if (totalAccesses < 10) return;

    // 找出高频访问的键
    const highFreqKeys = Array.from(accessPatterns.entries())
      .filter(([_, count]) => count / totalAccesses >= this.prefetchConfig.threshold)
      .map(([key]) => key)
      .slice(0, this.prefetchConfig.maxPrefetchItems);

    if (highFreqKeys.length > 0) {
      logger.debug(
        `智能预取分析：识别到 ${highFreqKeys.length} 个高频访问键`,
        'SmartCache',
        {
          highFreqKeys,
          threshold: this.prefetchConfig.threshold,
          totalAccesses
        }
      );

      // 启动异步预取，但不等待完成
      void this.prefetchData(highFreqKeys);
    }
  }

  /**
   * 预取指定键的数据
   * 
   * @private
   * @param {string[]} keys - 要预取的键列表
   * @returns {Promise<void>}
   */
  private async prefetchData(keys: string[]): Promise<void> {
    if (!this.dataLoader) {
      logger.warn('未配置数据加载器，无法执行预取', 'SmartCache');
      return;
    }

    try {
      // 记录预取开始时间
      const startTime = Date.now();

      // 只预取还没有缓存的键
      const keysToFetch = keys.filter(key => !this.cache.has(key));
      
      if (keysToFetch.length === 0) return;

      // 并行加载数据
      const loadPromises = keysToFetch.map(async key => {
        try {
          const value = await this.dataLoader!(key);
          if (value !== null && value !== undefined) {
            await this.put(key, value);
            return true;
          }
          return false;
        } catch (error) {
          logger.warn('预取数据时发生错误', 'SmartCache', {
            key,
            error: (error as Error).message
          });
          return false;
        }
      });

      const results = await Promise.allSettled(loadPromises);
      const successCount = results.filter(
        result => result.status === 'fulfilled' && result.value
      ).length;

      const duration = Date.now() - startTime;
      logger.debug('智能预取完成', 'SmartCache', {
        attemptedKeys: keys.length,
        fetchedKeys: keysToFetch.length,
        successfulFetches: successCount,
        duration
      });
    } catch (error) {
      logger.warn('智能预取过程中发生错误', 'SmartCache', {
        error: (error as Error).message
      });
    }
  }
}

/**
 * 查询类型枚举 - 用于缓存策略决策
 */
export enum QueryType {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CREATE = 'CREATE',
  DROP = 'DROP',
  ALTER = 'ALTER',
  SHOW = 'SHOW',
  DESCRIBE = 'DESCRIBE',
  EXPLAIN = 'EXPLAIN'
}

/**
 * 查询缓存配置
 */
export interface QueryCacheConfig {
  /** 是否启用查询缓存 */
  enabled: boolean;
  /** 默认TTL（秒） */
  defaultTTL: number;
  /** 最大缓存大小 */
  maxSize: number;
  /** 基于查询类型的TTL配置 */
  typeTTL: Record<QueryType, number>;
  /** 可缓存的查询模式 */
  cacheablePatterns: RegExp[];
  /** 不可缓存的查询模式 */
  nonCacheablePatterns: RegExp[];
  /** 最小结果集大小阈值（小于此值才缓存） */
  maxResultSize: number;
  /** 缓存键包含参数的最大长度 */
  maxKeyLength: number;
}

/**
 * 查询缓存元数据
 */
export interface QueryCacheMetadata {
  /** 查询类型 */
  queryType: QueryType;
  /** 涉及的表名 */
  tables: string[];
  /** 查询复杂度评分 */
  complexity: number;
  /** 结果集大小 */
  resultSize: number;
  /** 缓存创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** 访问次数 */
  accessCount: number;
}

/**
 * 查询缓存条目
 */
export interface QueryCacheEntry {
  /** 查询结果数据 */
  data: unknown;
  /** 缓存元数据 */
  metadata: QueryCacheMetadata;
  /** 过期时间戳 */
  expiresAt: number;
}

/**
 * 查询缓存统计
 */
export interface QueryCacheStats {
  /** 总查询数 */
  totalQueries: number;
  /** 缓存命中数 */
  cacheHits: number;
  /** 缓存未命中数 */
  cacheMisses: number;
  /** 缓存命中率 */
  hitRate: number;
  /** 跳过缓存的查询数 */
  skippedQueries: number;
  /** 当前缓存条目数 */
  currentEntries: number;
  /** 缓存大小（字节） */
  cacheSize: number;
  /** 按查询类型分组的统计 */
  typeStats: Record<QueryType, {
    queries: number;
    hits: number;
    misses: number;
  }>;
}

/**
 * 操作类型枚举
 */
export enum OperationType {
  DDL = 'DDL',
  DML = 'DML',
  CREATE = 'CREATE',
  DROP = 'DROP',
  ALTER = 'ALTER',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

/**
 * 缓存失效策略
 */
export interface InvalidationStrategy {
  /** 操作类型 */
  operationType: OperationType;
  /** 是否清除所有缓存 */
  clearAll: boolean;
  /** 要清除的特定缓存区域 */
  regions?: CacheRegion[];
  /** 表特定的清除 */
  tableSpecific?: boolean;
}

/**
 * 统一缓存管理器类
 *
 * 提供集中式的缓存管理，支持多种缓存区域和高级缓存策略。
 * 现在集成了查询结果缓存功能，统一管理所有类型的缓存。
 *
 * 主要特性：
 * - 多区域缓存管理（Schema, TableExists, Index, QueryResult）
 * - 统一的缓存接口和配置
 * - 智能查询结果缓存，支持基于查询特征的缓存决策
 * - 智能缓存失效和预加载
 * - 详细的性能统计和监控
 * - 内存压力感知的动态调整
 * - 批量缓存操作支持
 *
 * @class CacheManager
 * @since 1.0.0
 */
export class CacheManager implements MemoryPressureObserver {
  /** 各区域的缓存实例映射 */
  private caches: Map<CacheRegion, SmartCache<unknown>>;

  /** 各区域的配置参数映射 */
  private cacheConfigs: Map<CacheRegion, { size: number; ttl: number }>;

  /** 全局统计信息（补充智能缓存内部统计） */
  private globalStats: Map<CacheRegion, { hits: number; misses: number }>;

  /** 查询缓存配置 */
  private queryCacheConfig: QueryCacheConfig;

  /** 查询缓存统计 */
  private queryCacheStats: QueryCacheStats;

  /** 缓存失效策略 */
  private invalidationStrategies: Map<OperationType, InvalidationStrategy>;

  /** 当前内存压力级别 */
  private currentMemoryPressure: number = 0;

  /**
   * 获取指定区域的缓存实例
   *
   * 统一的缓存区域访问方法，避免重复的空值检查代码。
   *
   * @private
   * @param {CacheRegion} region - 缓存区域
   * @returns {SmartCache<unknown> | undefined} 缓存实例或undefined
   */
  private getCacheForRegion(region: CacheRegion): SmartCache<unknown> | undefined {
    return this.caches.get(region);
  }

  /** 预编译的表名提取正则表达式 */
  private compiledTableExtractionPatterns!: {
    fromPattern: RegExp;
    joinPattern: RegExp;
    insertPattern: RegExp;
    updatePattern: RegExp;
    deletePattern: RegExp;
    dropPattern: RegExp;
    createPattern: RegExp;
    alterPattern: RegExp;
  };

  /**
   * 初始化查询缓存配置
   *
   * @private
   * @param {Partial<QueryCacheConfig>} [config] - 用户提供的查询缓存配置
   * @returns {QueryCacheConfig} 完整的查询缓存配置对象
   */
  private initializeQueryCacheConfig(config?: Partial<QueryCacheConfig>): QueryCacheConfig {
    const defaultConfig: QueryCacheConfig = {
      enabled: true,
      defaultTTL: 300, // 5分钟
      maxSize: 1000,
      typeTTL: {
        [QueryType.SELECT]: 300,     // 5分钟
        [QueryType.SHOW]: 600,       // 10分钟（元数据查询）
        [QueryType.DESCRIBE]: 1800,  // 30分钟（结构查询）
        [QueryType.EXPLAIN]: 900,    // 15分钟（执行计划）
        [QueryType.INSERT]: 0,       // 不缓存
        [QueryType.UPDATE]: 0,       // 不缓存
        [QueryType.DELETE]: 0,       // 不缓存
        [QueryType.CREATE]: 0,       // 不缓存
        [QueryType.DROP]: 0,         // 不缓存
        [QueryType.ALTER]: 0         // 不缓存
      },
      cacheablePatterns: [
        /^SELECT\s+.*\s+FROM\s+\w+(\s+WHERE\s+.*)?(\s+ORDER\s+BY\s+.*)?(\s+LIMIT\s+\d+)?$/i,
        /^SHOW\s+(TABLES|COLUMNS|INDEX|STATUS)/i,
        /^DESCRIBE\s+\w+$/i,
        /^EXPLAIN\s+SELECT/i
      ],
      nonCacheablePatterns: [
        /NOW\(\)|CURRENT_TIMESTAMP|RAND\(\)|UUID\(\)/i,
        /LAST_INSERT_ID\(\)/i,
        /CONNECTION_ID\(\)/i,
        /USER\(\)|DATABASE\(\)/i,
        /FOR\s+UPDATE/i,
        /LOCK\s+IN\s+SHARE\s+MODE/i
      ],
      maxResultSize: 1024 * 1024, // 1MB
      maxKeyLength: 500
    };


    // 预编译表名提取正则表达式
    this.compiledTableExtractionPatterns = {
      fromPattern: /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      joinPattern: /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      insertPattern: /INSERT\s+(?:IGNORE\s+)?INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      updatePattern: /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      deletePattern: /DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      dropPattern: /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      createPattern: /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      alterPattern: /ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
    };

    return { ...defaultConfig, ...config };
  }

  /**
   * 初始化查询缓存统计
   *
   * @private
   * @returns {QueryCacheStats} 初始化的查询缓存统计对象
   */
  private initializeQueryCacheStats(): QueryCacheStats {
    const typeStats: Record<QueryType, { queries: number; hits: number; misses: number }> = {
      [QueryType.SELECT]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.INSERT]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.UPDATE]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.DELETE]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.CREATE]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.DROP]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.ALTER]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.SHOW]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.DESCRIBE]: { queries: 0, hits: 0, misses: 0 },
      [QueryType.EXPLAIN]: { queries: 0, hits: 0, misses: 0 }
    };

    return {
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      hitRate: 0,
      skippedQueries: 0,
      currentEntries: 0,
      cacheSize: 0,
      typeStats
    };
  }

  /**
   * 初始化失效策略
   *
   * @private
   * @returns {Map<OperationType, InvalidationStrategy>} 失效策略映射
   */
  private initializeInvalidationStrategies(): Map<OperationType, InvalidationStrategy> {
    const strategies = new Map<OperationType, InvalidationStrategy>();

    // DDL 操作清除所有缓存
    strategies.set(OperationType.DDL, {
      operationType: OperationType.DDL,
      clearAll: true
    });

    strategies.set(OperationType.CREATE, {
      operationType: OperationType.CREATE,
      clearAll: true
    });

    strategies.set(OperationType.DROP, {
      operationType: OperationType.DROP,
      clearAll: true
    });

    strategies.set(OperationType.ALTER, {
      operationType: OperationType.ALTER,
      clearAll: false,
      regions: [CacheRegion.SCHEMA, CacheRegion.INDEX],
      tableSpecific: true
    });

    // DML 操作清除查询结果缓存和表结构缓存
    strategies.set(OperationType.DML, {
      operationType: OperationType.DML,
      clearAll: false,
      regions: [CacheRegion.QUERY_RESULT, CacheRegion.SCHEMA, CacheRegion.TABLE_EXISTS, CacheRegion.INDEX],
      tableSpecific: true
    });

    strategies.set(OperationType.INSERT, {
      operationType: OperationType.INSERT,
      clearAll: false,
      regions: [CacheRegion.QUERY_RESULT, CacheRegion.SCHEMA, CacheRegion.TABLE_EXISTS, CacheRegion.INDEX],
      tableSpecific: true
    });

    strategies.set(OperationType.UPDATE, {
      operationType: OperationType.UPDATE,
      clearAll: false,
      regions: [CacheRegion.QUERY_RESULT, CacheRegion.SCHEMA, CacheRegion.TABLE_EXISTS, CacheRegion.INDEX],
      tableSpecific: true
    });

    strategies.set(OperationType.DELETE, {
      operationType: OperationType.DELETE,
      clearAll: false,
      regions: [CacheRegion.QUERY_RESULT, CacheRegion.SCHEMA, CacheRegion.TABLE_EXISTS, CacheRegion.INDEX],
      tableSpecific: true
    });

    return strategies;
  }

  /**
   * 缓存管理器构造函数 - 增强版
   *
   * 根据提供的配置初始化各个缓存区域，设置合理的默认值。
   * 现在集成了查询缓存配置初始化。
   *
   * @constructor
   * @param {CacheConfig} cacheConfig - 缓存配置对象
   * @param {Partial<QueryCacheConfig>} [queryCacheConfig] - 查询缓存配置
   * @param {boolean} [enableWeakMapProtection=false] - 是否为所有缓存启用WeakMap防护
   *
   * @example
   * const config = new CacheConfig();
   * const cacheManager = new CacheManager(config, { enabled: true });
   */
  constructor(
    cacheConfig: CacheConfig,
    queryCacheConfig?: Partial<QueryCacheConfig> | boolean,
    enableWeakMapProtection: boolean = false,
    enableTieredCache: boolean = false,
    enableTTLAdjustment: boolean = false
  ) {
    this.caches = new Map();
    this.cacheConfigs = new Map();
    this.globalStats = new Map();

    // 兼容：如果第二个参数被传为 boolean，则它实际上是 enableWeakMapProtection
    let normalizedQueryCacheConfig: Partial<QueryCacheConfig> | undefined;
    if (typeof queryCacheConfig === 'boolean') {
      enableWeakMapProtection = Boolean(queryCacheConfig);
      normalizedQueryCacheConfig = undefined;
    } else {
      normalizedQueryCacheConfig = queryCacheConfig;
    }

    // 初始化查询缓存配置
    this.queryCacheConfig = this.initializeQueryCacheConfig(normalizedQueryCacheConfig);

    // 初始化查询缓存统计
    this.queryCacheStats = this.initializeQueryCacheStats();

    // 初始化失效策略
    this.invalidationStrategies = this.initializeInvalidationStrategies();

    // 订阅内存压力变化
    memoryPressureManager.subscribe(this);

    // 初始化各区域缓存配置
    this.cacheConfigs.set(CacheRegion.SCHEMA, {
      size: cacheConfig.schemaCacheSize,
      ttl: cacheConfig.cacheTTL
    });

    this.cacheConfigs.set(CacheRegion.TABLE_EXISTS, {
      size: cacheConfig.tableExistsCacheSize,
      ttl: cacheConfig.cacheTTL
    });

    this.cacheConfigs.set(CacheRegion.INDEX, {
      size: cacheConfig.indexCacheSize,
      ttl: cacheConfig.cacheTTL
    });

    this.cacheConfigs.set(CacheRegion.QUERY_RESULT, {
      size: cacheConfig.queryCacheSize,
      ttl: cacheConfig.queryCacheTTL
    });

    // 初始化各区域缓存实例（支持WeakMap防护）
    for (const [region, config] of this.cacheConfigs.entries()) {
      const sc = new SmartCache(config.size, config.ttl, enableWeakMapProtection, enableTieredCache);

      // 如果启用了分级缓存的全局开关，使用基于区域配置的默认 L1/L2 设置
      if (enableTieredCache) {
        try {
          sc.configureL2Cache(true, {
            l1Size: config.size,
            l1TTL: config.ttl,
            l2Size: Math.max(config.size * 4, config.size),
            l2TTL: Math.max(config.ttl * 4, config.ttl)
          });
        } catch (_error) {
          // 忽略配置失败，保留默认行为
        }
      }

      // 如果启用了TTL动态调整则使用合理的默认参数
      if (enableTTLAdjustment) {
        try {
          sc.configureTTLAdjustment(true, {
            minTTL: Math.max(1, Math.floor(config.ttl / 10)),
            maxTTL: Math.max(config.ttl * 4, config.ttl),
            factor: 1.5
          });
        } catch (_error) {
          // ignore
        }
      }

      this.caches.set(region, sc);
      this.globalStats.set(region, { hits: 0, misses: 0 });
    }
  }

  /**
   * 从指定区域获取缓存值
   *
   * 线程安全的缓存检索，自动更新统计信息。
   *
   * @public
   * @template T - 缓存数据的类型
   * @param {CacheRegion} region - 缓存区域
   * @param {string} key - 缓存键
   * @returns {Promise<T | null>} 缓存值或null（如果未找到或过期）
   *
   * @example
   * const schema = await cacheManager.get<TableSchema>(CacheRegion.SCHEMA, 'users');
   * if (schema) {
   *   console.log('从缓存获取表结构:', schema);
   * }
   */
  public async get<T>(region: CacheRegion, key: string): Promise<T | null> {
    const cache = this.getCacheForRegion(region);
    if (!cache) {
      return null;
    }

    const result = await cache.get(key);
    const stats = this.globalStats.get(region);
    if (stats) {
      if (result !== null) {
        stats.hits++;
      } else {
        stats.misses++;
      }
    }

    return result as T | null;
  }

  /**
   * 向指定区域设置缓存值
   *
   * 线程安全的缓存存储操作。
   *
   * @public
   * @template T - 缓存数据的类型
   * @param {CacheRegion} region - 缓存区域
   * @param {string} key - 缓存键
   * @param {T} value - 要缓存的值
   *
   * @example
   * await cacheManager.set(CacheRegion.SCHEMA, 'users', tableSchema);
   */
  public async set<T>(region: CacheRegion, key: string, value: T): Promise<void> {
    const cache = this.getCacheForRegion(region);
    if (cache) {
      await cache.put(key, value);
    }
  }

  /**
   * 从指定区域删除缓存项
   *
   * @public
   * @param {CacheRegion} region - 缓存区域
   * @param {string} key - 要删除的缓存键
   * @returns {Promise<boolean>} 是否成功删除
   *
   * @example
   * const removed = await cacheManager.remove(CacheRegion.SCHEMA, 'users');
   */
  public async remove(region: CacheRegion, key: string): Promise<boolean> {
    const cache = this.getCacheForRegion(region);
    if (cache) {
      const removed = await cache.remove(key);

      // 如果是查询结果缓存，保持统计一致（更安全的做法是以实际大小为准）
      if (region === CacheRegion.QUERY_RESULT) {
        try {
          // 尽量使用实际的缓存大小来校准统计值
          this.queryCacheStats.currentEntries = cache.size();
          if (this.queryCacheStats.currentEntries < 0) this.queryCacheStats.currentEntries = 0;
        } catch (_error) {
          // 兜底：如果无法读取大小，则根据删除结果做减法
          if (removed) {
            this.queryCacheStats.currentEntries = Math.max(0, this.queryCacheStats.currentEntries - 1);
          }
        }
      }

      return removed;
    }
    return false;
  }

  /**
   * 清空指定区域的所有缓存
   *
   * @public
   * @param {CacheRegion} region - 要清空的缓存区域
   *
   * @example
   * await cacheManager.clearRegion(CacheRegion.SCHEMA);
   */
  public async clearRegion(region: CacheRegion): Promise<void> {
    const cache = this.getCacheForRegion(region);
    if (cache) {
      await cache.clear();
      const stats = this.globalStats.get(region);
      if (stats) {
        stats.hits = 0;
        stats.misses = 0;
      }
      // 如果清空的是查询结果缓存区域，更新查询缓存统计
      if (region === CacheRegion.QUERY_RESULT) {
        this.queryCacheStats.currentEntries = 0;
      }
    }
  }

  /**
   * 清空所有区域的缓存
   *
   * @public
   *
   * @example
   * await cacheManager.clearAll(); // 重置所有缓存
   */
  public async clearAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const cache of this.caches.values()) {
      promises.push(cache.clear());
    }
    await Promise.all(promises);
    for (const stats of this.globalStats.values()) {
      stats.hits = 0;
      stats.misses = 0;
    }
    // 清空所有缓存时重置查询缓存统计
    this.queryCacheStats.currentEntries = 0;
  }

  /**
   * 获取指定区域的缓存统计信息
   *
   * 结合SmartCache内部统计和全局统计信息。
   *
   * @public
   * @param {CacheRegion} region - 缓存区域
   * @returns {CacheRegionStats | null} 缓存统计信息或null
   *
   * @example
   * const stats = cacheManager.getStats(CacheRegion.SCHEMA);
   * console.log(`命中率: ${(stats.hitRate * 100).toFixed(2)}%`);
   */
  public getStats(region: CacheRegion): CacheRegionStats | null {
    const cache = this.getCacheForRegion(region);
    if (!cache) {
      return null;
    }

    const baseStats = cache.getStats();
    const globalStats = this.globalStats.get(region);
    
    if (!globalStats) {
      return null;
    }

    const total = globalStats.hits + globalStats.misses;
    const hitRate = total > 0 ? globalStats.hits / total : 0;

    return {
      size: baseStats[StringConstants.FIELD_SIZE],
      maxSize: baseStats[StringConstants.FIELD_MAX_SIZE],
      dynamicMaxSize: baseStats[StringConstants.FIELD_DYNAMIC_MAX_SIZE],
      hitCount: globalStats.hits,
      missCount: globalStats.misses,
      hitRate: hitRate,
      ttl: baseStats[StringConstants.FIELD_TTL]
    };
  }

  /**
   * 获取所有区域的统计信息
   *
   * @public
   * @returns {Record<string, CacheRegionStats>} 所有区域的统计信息映射
   *
   * @example
   * const allStats = cacheManager.getAllStats();
   * for (const [region, stats] of Object.entries(allStats)) {
   *   console.log(`${region}: 命中率 ${(stats.hitRate * 100).toFixed(2)}%`);
   * }
   */
  public getAllStats(): Record<string, CacheRegionStats> {
    const stats: Record<string, CacheRegionStats> = {};
    
    for (const region of Object.values(CacheRegion)) {
      const regionStats = this.getStats(region);
      if (regionStats) {
        stats[region] = regionStats;
      }
    }
    
    return stats;
  }

  /**
   * 统一缓存失效接口
   *
   * 根据操作类型和表名智能失效相关缓存区域。
   * 这是主要的缓存失效入口，整合了所有失效逻辑。
   *
   * @public
   * @param {OperationType | string} operationType - 操作类型
   * @param {string} [tableName] - 表名，用于表特定的失效
   * @param {CacheRegion[]} [specificRegions] - 特定区域，如果提供则只清除这些区域
   *
   * @example
   * await cacheManager.invalidateCache('DDL', 'users'); // DDL操作后失效users表相关缓存
   * await cacheManager.invalidateCache('DML', 'users', [CacheRegion.QUERY_RESULT]); // 只失效查询缓存
   * await cacheManager.invalidateCache('CREATE'); // 创建操作后清除所有缓存
   */
  public async invalidateCache(operationType: OperationType | string, tableName?: string, specificRegions?: CacheRegion[]): Promise<void> {
    // 处理字符串类型的操作
    const opType = typeof operationType === 'string'
      ? this.mapStringToOperationType(operationType)
      : operationType;

    // 如果指定了特定区域，只清除这些区域
    if (specificRegions && specificRegions.length > 0) {
      if (tableName) {
        await this.invalidateTableSpecificRegions(tableName, specificRegions);
      } else {
        await this.invalidateRegions(specificRegions);
      }
      return;
    }

    // 获取失效策略
    const strategy = this.invalidationStrategies.get(opType);
    if (!strategy) {
      // 默认策略：清除所有缓存
      await this.clearAll();
      return;
    }

    if (strategy.clearAll) {
      await this.clearAll();
      return;
    }

    // 执行表特定或区域特定的失效
    if (strategy.tableSpecific && tableName) {
      await this.invalidateTableSpecificRegions(tableName, strategy.regions);
    } else if (strategy.regions) {
      await this.invalidateRegions(strategy.regions);
    }

    // 处理查询缓存的特殊逻辑
    const queryAffectingOperations = [OperationType.DDL, OperationType.DML, OperationType.INSERT, OperationType.UPDATE, OperationType.DELETE, OperationType.CREATE, OperationType.ALTER, OperationType.DROP];
    if (queryAffectingOperations.includes(opType)) {
      if (tableName) {
        await this.invalidateQueryCacheByTable(tableName);
      } else {
        await this.clearRegion(CacheRegion.QUERY_RESULT);
      }
    }
  }

  /**
   * 批量失效所有表相关缓存
   *
   * 用于DDL操作后的全面缓存清理。
   *
   * @public
   * @deprecated 使用 invalidateCache('DDL') 代替
   *
   * @example
   * await cacheManager.invalidateAllTableCache(); // 清理所有表缓存
   */
  public async invalidateAllTableCache(): Promise<void> {
    await this.invalidateCache('DDL');
  }

  /**
   * 兼容性方法：按表失效缓存
   *
   * @public
   * @deprecated 使用 invalidateCache() 代替
   * @param {string} tableName - 表名
   * @param {CacheRegion} [specificRegion] - 特定区域
   */
  public async invalidateTableCache(tableName: string, specificRegion?: CacheRegion): Promise<void> {
    if (specificRegion) {
      await this.invalidateCache('DML', tableName, [specificRegion]);
    } else {
      await this.invalidateCache('DML', tableName);
    }
  }

  /**
   * 应用内存压力调整
   *
   * 根据系统内存压力动态调整所有缓存区域的大小。
   *
   * @public
   * @param {number} pressureLevel - 内存压力级别 (0-1)
   *
   * @example
   * cacheManager.adjustForMemoryPressure(0.8); // 高内存压力
   */
  public adjustForMemoryPressure(pressureLevel: number): void {
    for (const cache of this.caches.values()) {
      cache.adjustForMemoryPressure(pressureLevel);
    }
  }

  /**
   * 预加载表相关信息
   *
   * 异步预加载指定表的相关缓存信息，提升后续访问性能。
   *
   * @public
   * @param {string} tableName - 表名
   * @param {() => Promise<any>} schemaLoader - 表结构加载函数
   * @param {() => Promise<boolean>} existsLoader - 表存在性检查函数
   * @param {() => Promise<any>} indexLoader - 索引信息加载函数
   * @returns {Promise<void>}
   *
   * @example
   * await cacheManager.preloadTableInfo('users',
   *   () => getTableSchema('users'),
   *   () => checkTableExists('users'),
   *   () => getTableIndexes('users')
   * );
   */
  public async preloadTableInfo(
    tableName: string,
    schemaLoader?: () => Promise<unknown>,
    existsLoader?: () => Promise<boolean>,
    indexLoader?: () => Promise<unknown>
  ): Promise<void> {
    try {
      const promises: Promise<void>[] = [];

      if (schemaLoader) {
        promises.push(
          schemaLoader().then(schema => {
            this.set(CacheRegion.SCHEMA, `schema_${tableName}`, schema);
          })
        );
      }

      if (existsLoader) {
        promises.push(
          existsLoader().then(exists => {
            this.set(CacheRegion.TABLE_EXISTS, `exists_${tableName}`, exists);
          })
        );
      }

      if (indexLoader) {
        promises.push(
          indexLoader().then(indexes => {
            this.set(CacheRegion.INDEX, `indexes_${tableName}`, indexes);
          })
        );
      }

      await Promise.all(promises);
    } catch (error) {
      // 预加载失败不应该影响主流程，记录错误即可
      logger.warn(`预加载表 ${tableName} 的缓存信息失败`, 'CacheManager', { error: (error as Error).message });
    }
  }

  /**
   * 获取缓存区域实例
   *
   * 为高级用户提供直接访问底层缓存实例的能力。
   *
   * @public
   * @param {CacheRegion} region - 缓存区域
   * @returns {SmartCache<unknown> | null} 缓存实例或null
   *
   * @example
   * const schemaCache = cacheManager.getCacheInstance(CacheRegion.SCHEMA);
   */
  public getCacheInstance(region: CacheRegion): SmartCache<unknown> | null {
    return this.caches.get(region) || null;
  }

  /**
   * 检查是否包含指定键
   *
   * @public
   * @param {CacheRegion} region - 缓存区域
   * @param {string} key - 缓存键
   * @returns {Promise<boolean>} 是否包含该键（不考虑过期）
   */
  public async has(region: CacheRegion, key: string): Promise<boolean> {
    const cache = this.caches.get(region);
    if (!cache) {
      return false;
    }
    const result = await cache.get(key);
    return result !== null;
  }

  /**
   * 批量设置缓存
   *
   * @public
   * @param {CacheRegion} region - 缓存区域
   * @param {Record<string, T>} entries - 键值对映射
   *
   * @example
   * await cacheManager.setBatch(CacheRegion.TABLE_EXISTS, {
   *   'users': true,
   *   'orders': true,
   *   'temp_table': false
   * });
   */
  public async setBatch<T>(region: CacheRegion, entries: Record<string, T>): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [key, value] of Object.entries(entries)) {
      promises.push(this.set(region, key, value));
    }
    await Promise.all(promises);
  }

  /**
   * 批量获取缓存
   *
   * @public
   * @template T - 缓存数据的类型
   * @param {CacheRegion} region - 缓存区域
   * @param {string[]} keys - 缓存键数组
   * @returns {Promise<Record<string, T | null>>} 键值对映射，未找到的键对应null
   *
   * @example
   * const results = await cacheManager.getBatch<boolean>(
   *   CacheRegion.TABLE_EXISTS,
   *   ['users', 'orders', 'products']
   * );
   */
  public async getBatch<T>(region: CacheRegion, keys: string[]): Promise<Record<string, T | null>> {
    const results: Record<string, T | null> = {};
    for (const key of keys) {
      results[key] = await this.get<T>(region, key);
    }
    return results;
  }

  /**
   * 执行WeakMap清理
   *
   * 清理所有缓存区域的WeakMap失效引用。
   *
   * 优化策略：
   * - 基于时间间隔控制清理频率
   * - 基于内存压力动态调整清理策略
   * - 减少不必要的清理操作
   *
   * @public
   * @returns 清理统计信息
   */
  public performWeakMapCleanup(): {
    totalCleaned: number;
    totalMemoryReclaimed: number;
    regionStats: Record<string, { cleanedCount: number; memoryReclaimed: number }>;
  } {
    const now = Date.now();

    // 获取当前内存压力
    const memoryPressure = this.getMemoryPressure();
    
    // 根据内存压力动态调整清理频率
    // 压力越高，清理间隔越短，清理越频繁
    const dynamicInterval = Math.max(
      this.weakMapCleanupMinInterval * 0.1, // 最短间隔为最小间隔的10%
      this.weakMapCleanupMinInterval * (1 - memoryPressure * 0.9) // 根据压力调整
    );

    // 控制清理频率，避免过于频繁的清理操作
    if (now - this.lastWeakMapCleanupTime < dynamicInterval) {
      return {
        totalCleaned: 0,
        totalMemoryReclaimed: 0,
        regionStats: {}
      };
    }

    let totalCleaned = 0;
    let totalMemoryReclaimed = 0;
    const regionStats: Record<string, { cleanedCount: number; memoryReclaimed: number }> = {};

    for (const [region, cache] of this.caches.entries()) {
      const result = cache.performWeakMapCleanup();
      regionStats[region] = result;
      totalCleaned += result.cleanedCount;
      totalMemoryReclaimed += result.memoryReclaimed;
    }

    // 更新最后清理时间
    this.lastWeakMapCleanupTime = now;

    return { totalCleaned, totalMemoryReclaimed, regionStats };
  }

  /**
   * 启用或禁用指定区域的WeakMap防护
   *
   * @public
   * @param region - 缓存区域
   * @param enabled - 是否启用
   */
  public setWeakMapProtection(region: CacheRegion, enabled: boolean): void {
    const cache = this.getCacheForRegion(region);
    if (cache) {
      cache.setWeakMapProtection(enabled);
    }
  }

  /**
   * 为所有区域启用或禁用WeakMap防护
   *
   * @public
   * @param enabled - 是否启用
   */
  public setWeakMapProtectionForAll(enabled: boolean): void {
    for (const cache of this.caches.values()) {
      cache.setWeakMapProtection(enabled);
    }
  }

  // ============================================================================
  // 查询缓存方法
  // ============================================================================

  /**
   * 尝试从缓存获取查询结果
   *
   * @public
   * @param {string} query - SQL查询语句
   * @param {unknown[]} [params] - 查询参数
   * @returns {Promise<unknown | null>} 缓存的查询结果，未找到返回null
   */
  public async getCachedQuery(query: string, params?: unknown[]): Promise<unknown | null> {
    if (!this.queryCacheConfig.enabled) {
      return null;
    }

    const queryType = this.extractQueryType(query);
    this.queryCacheStats.totalQueries++;
    this.queryCacheStats.typeStats[queryType].queries++;

    // 检查是否应该缓存此查询
    if (!this.shouldCacheQuery(query, queryType)) {
      this.queryCacheStats.skippedQueries++;
      return null;
    }

    const cacheKey = this.generateCacheKey(query, params);
    const cached = await this.get<QueryCacheEntry>(CacheRegion.QUERY_RESULT, cacheKey);

    if (cached && this.isValidCacheEntry(cached)) {
      // 更新访问统计
      cached.metadata.lastAccessed = Date.now();
      cached.metadata.accessCount++;

      // 更新缓存以保存新的元数据
      await this.set(CacheRegion.QUERY_RESULT, cacheKey, cached);

      this.queryCacheStats.cacheHits++;
      this.queryCacheStats.typeStats[queryType].hits++;
      this.updateQueryCacheHitRate();

      return cached.data;
    }

    this.queryCacheStats.cacheMisses++;
    this.queryCacheStats.typeStats[queryType].misses++;
    this.updateQueryCacheHitRate();

    return null;
  }

  /**
   * 缓存查询结果
   *
   * @public
   * @param {string} query - SQL查询语句
   * @param {unknown[]} [params] - 查询参数
   * @param {unknown} result - 查询结果
   * @returns {Promise<void>}
   */
  public async setCachedQuery(
    query: string,
    params: unknown[] | undefined,
    result: unknown
  ): Promise<void> {
    if (!this.queryCacheConfig.enabled) {
      return;
    }

    const queryType = this.extractQueryType(query);

    // 检查是否应该缓存此查询
    if (!this.shouldCacheQuery(query, queryType)) {
      return;
    }

    // 检查结果大小
    const resultSize = this.estimateResultSize(result);
    if (resultSize > this.queryCacheConfig.maxResultSize) {
      return;
    }

    const cacheKey = this.generateCacheKey(query, params);
    const ttl = this.queryCacheConfig.typeTTL[queryType] || this.queryCacheConfig.defaultTTL;

    const cacheEntry: QueryCacheEntry = {
      data: result,
      metadata: {
        queryType,
        tables: this.extractTableNames(query),
        complexity: this.calculateQueryComplexity(query),
        resultSize,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1
      },
      expiresAt: Date.now() + (ttl * 1000)
    };

    // 在写入前检查是否已存在此键，避免重复计数
    const existing = await this.get<QueryCacheEntry>(CacheRegion.QUERY_RESULT, cacheKey);
    await this.set(CacheRegion.QUERY_RESULT, cacheKey, cacheEntry);
    if (!existing) {
      this.queryCacheStats.currentEntries = (this.queryCacheStats.currentEntries || 0) + 1;
    }
  }

  /**
   * 按表名失效查询缓存
   *
   * 精确地只清除与指定表相关的查询缓存条目，而不是清空整个查询结果缓存区域。
   * 通过检查每个缓存条目的元数据中涉及的表名来实现精确清除。
   *
   * @public
   * @param {string} tableName - 表名
   * @returns {Promise<void>}
   */
  public async invalidateQueryCacheByTable(tableName: string): Promise<void> {
    // 参数验证
    if (!tableName || typeof tableName !== 'string') {
      logger.warn('Invalid table name provided for query cache invalidation', 'CacheManager');
      return;
    }

    // 获取查询结果缓存实例
    const queryCache = this.getCacheInstance(CacheRegion.QUERY_RESULT);
    if (!queryCache) {
      logger.warn('Query result cache instance not found', 'CacheManager');
      return;
    }

    // 标准化表名以进行大小写不敏感的比较
    const normalizedTableName = tableName.toLowerCase();

    try {
      // 收集需要删除的缓存键
      const keysToRemove: string[] = [];
      
      // 遍历所有缓存条目
      for (const [key, entry] of queryCache.scanEntries()) {
        // 检查条目是否为查询缓存条目且包含元数据
        if (this.isQueryCacheEntry(entry)) {
          const queryEntry = entry as QueryCacheEntry;
          
          // 检查元数据中是否包含指定的表名
          if (Array.isArray(queryEntry.metadata?.tables)) {
            if (queryEntry.metadata.tables.some(table => table.toLowerCase() === normalizedTableName)) {
              keysToRemove.push(key);
            }
          }
        }
      }

      // 批量删除匹配的缓存条目
      const removedCount = await this.batchRemoveCacheEntries(queryCache, keysToRemove);

      // 更新查询缓存统计信息
      this.queryCacheStats.currentEntries = Math.max(0, this.queryCacheStats.currentEntries - removedCount);
      
      logger.debug(
        `Invalidated ${removedCount} query cache entries for table: ${tableName}`,
        'CacheManager',
        { tableName, removedCount, totalEntries: this.queryCacheStats.currentEntries }
      );
    } catch (error) {
      logger.error(
        `Error invalidating query cache by table: ${tableName}`,
        'CacheManager',
        error as Error
      );
      // 出错时回退到原来的清空整个缓存区域的实现
      await this.clearRegion(CacheRegion.QUERY_RESULT);
      this.queryCacheStats.currentEntries = 0;
    }
  }

  /**
   * 检查条目是否为查询缓存条目
   *
   * @private
   * @param {unknown} entry - 缓存条目
   * @returns {boolean} 是否为查询缓存条目
   */
  private isQueryCacheEntry(entry: unknown): entry is QueryCacheEntry {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const queryEntry = entry as Record<string, unknown>;
    return 'data' in queryEntry && 'metadata' in queryEntry && 'expiresAt' in queryEntry;
  }

  /**
   * 批量删除缓存条目
   *
   * @private
   * @param {SmartCache<unknown>} cache - 缓存实例
   * @param {string[]} keys - 要删除的键列表
   * @returns {Promise<number>} 删除的条目数
   */
  private async batchRemoveCacheEntries(cache: SmartCache<unknown>, keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    // 使用 Promise.allSettled 来并行处理删除操作，即使某些操作失败也不会影响其他操作
    const results = await Promise.allSettled(
      keys.map(key => cache.remove(key))
    );

    // 统计成功删除的条目数
    return results.filter(result =>
      result.status === 'fulfilled' && result.value === true
    ).length;
  }

  /**
   * 获取查询缓存统计
   *
   * @public
   * @returns {QueryCacheStats} 查询缓存统计信息
   */
  public getQueryCacheStats(): QueryCacheStats {
    return { ...this.queryCacheStats };
  }

  /**
   * 重置查询缓存统计
   *
   * @public
   */
  public resetQueryCacheStats(): void {
    this.queryCacheStats = this.initializeQueryCacheStats();
  }

  /**
   * 更新查询缓存配置
   *
   * @public
   * @param {Partial<QueryCacheConfig>} newConfig - 新的配置
   */
  public updateQueryCacheConfig(newConfig: Partial<QueryCacheConfig>): void {
    this.queryCacheConfig = { ...this.queryCacheConfig, ...newConfig };
  }

  // 记录上次清理时间，用于优化清理频率
  private lastCleanupTime: number = 0;

  // 清理间隔（毫秒），默认5分钟
  private cleanupInterval: number = 5 * 60 * 1000;

  // 记录上次WeakMap清理时间
  private lastWeakMapCleanupTime: number = 0;
  
  // WeakMap清理最小间隔（毫秒），默认1分钟
  private weakMapCleanupMinInterval: number = 60 * 1000;

  /**
   * 内存压力变化回调
   * 实现MemoryPressureObserver接口
   */
  public onPressureChange(pressure: number): void {
    this.currentMemoryPressure = pressure;
    
    // 根据压力级别自动调整所有缓存
    if (pressure > 0.8) {
      this.adjustForMemoryPressure(pressure);
    }
  }

  /**
   * 根据内存压力计算最优批量清理大小
   * 
   * @private
   * @returns {number} 最优批量大小
   */
  private getOptimalBatchSize(): number {
    // 获取当前内存压力
    const memoryPressure = this.getMemoryPressure();
    
    // 压力越高，批量越大，以提高清理效率
    // 基础大小为50，最大为300
    return Math.min(50 + Math.floor(250 * memoryPressure), 300);
  }

  /**
   * 获取当前内存压力级别 (0-1)
   * 使用中央化的内存压力管理器
   */
  private getMemoryPressure(): number {
    return this.currentMemoryPressure;
  }

  /**
   * 清理过期的查询缓存条目
   *
   * 扫描并移除所有过期的查询缓存条目，包括：
   * - 过期的条目（超过TTL）
   * - 无效的条目（空值或已被GC）
   *
   * 优化策略：
   * - 基于时间间隔的增量清理，避免频繁全量扫描
   * - 批量处理提高性能
   * - 异步清理减少阻塞
   *
   * @public
   * @returns {Promise<number>} 清理的条目数
   *
   * @throws {Error} 当清理过程中发生错误时抛出
   */
  public async cleanupExpiredQueryEntries(): Promise<number> {
    // 检查查询缓存是否启用
    if (!this.queryCacheConfig.enabled) {
      logger.debug('Query cache is disabled, skipping cleanup');
      return 0;
    }

    // 检查是否需要执行清理（基于时间间隔）
    const now = Date.now();
    if (now - this.lastCleanupTime < this.cleanupInterval) {
      return 0; // 未到清理时间，跳过
    }

    let cleanedCount = 0;
    const startTime = TimeUtils.now();

    try {
      // 获取查询缓存实例并检查过期条目
      const cacheInstance = this.getCacheInstance(CacheRegion.QUERY_RESULT);
      if (!cacheInstance) {
        logger.warn('Query cache instance not found', 'CacheManager');
        return 0;
      }

      // 创建一个数组来存储过期的键，避免在迭代时修改集合
      const expiredKeys: string[] = [];
      let processedKeys = 0;

      // 使用 SmartCache 提供的安全扫描接口来遍历条目
      for (const [key, entry] of cacheInstance.scanEntries()) {
        try {
          // 统一使用 SmartCache.isEntryExpired（会优先使用 entry.expiresAt）判断
          if (cacheInstance.isEntryExpired(entry)) {
            expiredKeys.push(key);
          }
          processedKeys++;
        } catch (error) {
          logger.warn(`Error checking cache entry ${key}`, 'CacheManager', { error: (error as Error).message });
          continue;
        }
      }

      // 如果没有过期条目，直接返回
      if (expiredKeys.length === 0) {
        this.lastCleanupTime = now;
        return 0;
      }

      // 使用动态批量大小优化删除过期条目，根据内存压力调整批量大小以提高性能
      const batchSize = this.getOptimalBatchSize();
      for (let i = 0; i < expiredKeys.length; i += batchSize) {
        const batch = expiredKeys.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(key => cacheInstance.remove(key))
        );

        // 统计成功删除的条目数
        cleanedCount += results.filter(
          result => result.status === 'fulfilled' && result.value
        ).length;
      }

      // 以实际缓存大小重新校准查询缓存统计
      try {
        this.queryCacheStats.currentEntries = cacheInstance.size();
        if (this.queryCacheStats.currentEntries < 0) this.queryCacheStats.currentEntries = 0;
      } catch (_error) {
        // 如果无法读取大小则回退为手动减法
        this.queryCacheStats.currentEntries = Math.max(0, this.queryCacheStats.currentEntries - cleanedCount);
      }

      // 更新最后清理时间
      this.lastCleanupTime = now;

      const duration = TimeUtils.getDurationInMs(startTime);
      logger.info(
        `Cleaned ${cleanedCount} expired entries out of ${processedKeys} total entries in ${duration}ms`,
        'CacheManager',
        {
          cleanedCount,
          totalEntries: processedKeys,
          duration,
          remainingEntries: this.queryCacheStats.currentEntries
        }
      );

    } catch (error) {
      logger.error('Error during query cache cleanup', 'CacheManager', error as Error);
      throw new Error(`Failed to cleanup expired query entries: ${(error as Error).message}`);
    }

    return cleanedCount;
  }

  // ============================================================================
  // 查询缓存私有辅助方法
  // ============================================================================

  /**
   * 生成缓存键
   *
   * 使用优化的哈希算法提高性能，减少字符串操作
   *
   * @private
   * @param {string} query - SQL查询语句
   * @param {unknown[]} [params] - 查询参数
   * @returns {string} 缓存键
   */
  private generateCacheKey(query: string, params?: unknown[]): string {
    // 快速路径：无参数且长度适中
    if ((!params || params.length === 0) && query.length <= this.queryCacheConfig.maxKeyLength) {
      return query.trim().replace(/\s+/g, ' ').toLowerCase();
    }

    // 规范化查询（移除多余空格，统一大小写）
    const normalizedQuery = query.trim().replace(/\s+/g, ' ').toLowerCase();

    // 生成参数哈希
    let paramsHash = '';
    if (params && params.length > 0) {
      paramsHash = this.hashParams(params);
    }

    // 组合查询和参数生成键
    let baseKey: string;
    if (paramsHash) {
      baseKey = `${normalizedQuery}|${paramsHash}`;
    } else {
      baseKey = normalizedQuery;
    }

    // 确保键长度不超过限制
    if (baseKey.length > this.queryCacheConfig.maxKeyLength) {
      return this.hashString(baseKey);
    }

    return baseKey;
  }

  /**
   * 检查是否应该缓存查询
   *
   * @private
   * @param {string} query - SQL查询语句
   * @param {QueryType} queryType - 查询类型
   * @returns {boolean} 是否应该缓存
   */
  private shouldCacheQuery(query: string, queryType: QueryType): boolean {
    // 检查查询类型是否可缓存
    const ttl = this.queryCacheConfig.typeTTL[queryType];
    if (!ttl || ttl <= 0) {
      return false;
    }

    // 检查非缓存模式
    for (const pattern of this.queryCacheConfig.nonCacheablePatterns) {
      if (pattern.test(query)) {
        return false;
      }
    }

    // 检查可缓存模式
    for (const pattern of this.queryCacheConfig.cacheablePatterns) {
      if (pattern.test(query)) {
        return true;
      }
    }

    // 默认SELECT查询可缓存
    return queryType === QueryType.SELECT;
  }

  /**
   * 提取查询类型
   *
   * @private
   * @param {string} query - SQL查询语句
   * @returns {QueryType} 查询类型
   */
  private extractQueryType(query: string): QueryType {
    const trimmedQuery = query.trim().toUpperCase();

    for (const type of Object.values(QueryType)) {
      if (trimmedQuery.startsWith(type)) {
        return type as QueryType;
      }
    }

    return QueryType.SELECT; // 默认类型
  }

  /**
   * 提取表名
   *
   * 使用预编译的正则表达式优化性能，减少字符串操作
   *
   * @private
   * @param {string} query - SQL查询语句
   * @returns {string[]} 表名数组
   */
  private extractTableNames(query: string): string[] {
    const tables: string[] = [];
    const upperQuery = query.toUpperCase();

    // 使用预编译的正则表达式优化表名提取性能，支持更复杂的SQL语句
    // 匹配 FROM 子句中的表名（包括带别名的情况）
    const fromMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.fromPattern);
    for (const match of fromMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 JOIN 子句中的表名（包括带别名的情况）
    const joinMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.joinPattern);
    for (const match of joinMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 INSERT INTO 子句中的表名
    const insertMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.insertPattern);
    for (const match of insertMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 UPDATE 子句中的表名
    const updateMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.updatePattern);
    for (const match of updateMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 DELETE FROM 子句中的表名
    const deleteMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.deletePattern);
    for (const match of deleteMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 DROP TABLE 子句中的表名
    const dropMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.dropPattern);
    for (const match of dropMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 CREATE TABLE 子句中的表名
    const createMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.createPattern);
    for (const match of createMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    // 匹配 ALTER TABLE 子句中的表名
    const alterMatches = upperQuery.matchAll(this.compiledTableExtractionPatterns.alterPattern);
    for (const match of alterMatches) {
      const tableName = match[1];
      if (tableName && !tables.includes(tableName.toLowerCase())) {
        tables.push(tableName.toLowerCase());
      }
    }

    return tables;
  }

  /**
   * 计算查询复杂度
   *
   * @private
   * @param {string} query - SQL查询语句
   * @returns {number} 复杂度评分
   */
  private calculateQueryComplexity(query: string): number {
    let complexity = 1;
    const upperQuery = query.toUpperCase();

    // 基于查询特征计算复杂度
    if (upperQuery.includes('JOIN')) complexity += 2;
    if (upperQuery.includes('SUBQUERY') || upperQuery.includes('EXISTS')) complexity += 3;
    if (upperQuery.includes('GROUP BY')) complexity += 2;
    if (upperQuery.includes('ORDER BY')) complexity += 1;
    if (upperQuery.includes('HAVING')) complexity += 2;

    return complexity;
  }

  /**
   * 估算结果大小
   *
   * @private
   * @param {unknown} result - 查询结果
   * @returns {number} 估算的字节大小
   */
  private estimateResultSize(result: unknown): number {
    try {
      return JSON.stringify(result).length;
    } catch {
      return 0;
    }
  }

  /**
   * 验证缓存条目
   *
   * @private
   * @param {QueryCacheEntry} entry - 缓存条目
   * @returns {boolean} 是否有效
   */
  private isValidCacheEntry(entry: QueryCacheEntry): boolean {
    return Date.now() < entry.expiresAt;
  }

  /**
   * 生成参数哈希
   *
   * @private
   * @param {unknown[]} params - 参数数组
   * @returns {string} 参数哈希值
   */
  private hashParams(params: unknown[]): string {
    try {
      // 使用稳定的序列化算法，确保对象属性顺序一致
      const paramStr = this.stableStringify(params);
      return this.hashString(paramStr);
    } catch {
      return 'invalid_params';
    }
  }

  /**
   * 稳定的JSON序列化
   *
   * 确保对象属性按固定顺序序列化，避免缓存键不一致
   *
   * @private
   * @param {unknown} obj - 要序列化的对象
   * @returns {string} 稳定的JSON字符串
   */
  private stableStringify(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return String(obj);
    }
    if (typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.stableStringify(item)).join(',') + ']';
    }
    
    // 对象按键名排序后序列化
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys.map(key => {
      const value = (obj as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + this.stableStringify(value);
    });
    return '{' + pairs.join(',') + '}';
  }

  /**
   * 优化的字符串哈希函数
   *
   * 使用djb2哈希算法的变体，提供更好的分布和更少的冲突
   *
   * @private
   * @param {string} str - 要哈希的字符串
   * @returns {string} 哈希值
   */
  private hashString(str: string): string {
    let hash1 = 5381;
    let hash2 = 5381;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash1 = (hash1 * 33) ^ char;
      hash2 = (hash2 * 33) ^ char;
    }
    // 转换为32位无符号整数并转换为36进制字符串
    return (hash1 >>> 0).toString(36) + (hash2 >>> 0).toString(36);
  }

  /**
   * 更新查询缓存命中率
   *
   * @private
   */
  private updateQueryCacheHitRate(): void {
    const total = this.queryCacheStats.cacheHits + this.queryCacheStats.cacheMisses;
    this.queryCacheStats.hitRate = total > 0 ? this.queryCacheStats.cacheHits / total : 0;
  }

  /**
   * 执行缓存失效（同步版本）
   *
   * @deprecated 使用 invalidateCache() 代替，该方法提供更好的异步支持
   * @param operationType - 操作类型
   * @param tableName - 可选的表名
   */
  public invalidate(operationType: OperationType | string, tableName?: string): void {
    // 异步执行失效逻辑，但不等待结果
    this.invalidateCache(operationType, tableName).catch(error => {
      logger.error(`Cache invalidation failed: ${error.message}`, 'CacheManager');
    });
  }

  /**
   * 使特定表的指定区域缓存失效
   */
  private async invalidateTableSpecificRegions(tableName: string, regions?: CacheRegion[]): Promise<void> {
    if (!regions || regions.length === 0) {
      // 清除所有表相关缓存
      await Promise.all([
        this.remove(CacheRegion.SCHEMA, `schema_${tableName}`),
        this.remove(CacheRegion.TABLE_EXISTS, `exists_${tableName}`),
        this.remove(CacheRegion.INDEX, `indexes_${tableName}`)
      ]);
      return;
    }

    // 清除指定区域的表相关缓存
    const tasks = regions.map(async region => {
      switch (region) {
        case CacheRegion.SCHEMA:
          await this.remove(CacheRegion.SCHEMA, `schema_${tableName}`);
          break;
        case CacheRegion.TABLE_EXISTS:
          await this.remove(CacheRegion.TABLE_EXISTS, `exists_${tableName}`);
          break;
        case CacheRegion.INDEX:
          await this.remove(CacheRegion.INDEX, `indexes_${tableName}`);
          break;
        case CacheRegion.QUERY_RESULT:
          await this.invalidateQueryCacheByTable(tableName);
          break;
      }
    });

    await Promise.all(tasks);
  }

  /**
   * 使指定区域缓存失效
   */
  private async invalidateRegions(regions: CacheRegion[]): Promise<void> {
    const tasks = regions.map(region => this.clearRegion(region));
    await Promise.all(tasks);
  }

  /**
   * 将字符串映射到操作类型
   */
  private mapStringToOperationType(operation: string): OperationType {
    const upperOp = operation.toUpperCase();

    switch (upperOp) {
      case 'DDL':
      case 'CREATE':
      case 'DROP':
      case 'ALTER':
        return OperationType[upperOp as keyof typeof OperationType];
      case 'DML':
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
        return OperationType[upperOp as keyof typeof OperationType];
      default:
        return OperationType.DDL; // 默认使用最安全的策略
    }
  }
}

