/**
 * MySQL企业级智能限流系统 - 令牌桶与自适应流量控制中心
 *
 * 企业级速率限制和流量控制解决方案，集成令牌桶算法和系统负载自适应机制。
 * 为MySQL MCP服务器提供智能流量管控、突发处理和资源保护能力，
 * 支持固定速率限制、自适应调整和系统压力感知流量控制。
 * 
 * @fileoverview 企业级智能限流系统 - 令牌桶算法、自适应控制、系统保护
 * @author liyq  
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 */

import { TimeUtils } from './utils/common.js';

/**
 * 令牌桶速率限制器
 *
 * 实现用于速率限制的令牌桶算法。该算法允许突发流量，
 * 同时在一段时间内维持平均速率限制。
 *
 * 算法详情：
 * - 令牌以恒定速率（补充速率）添加到桶中
 * - 每个请求消耗一个或多个令牌
 * - 只有在有足够令牌可用时才允许请求
 * - 桶有最大容量以限制突发大小
 *
 * 优势：
 * - 允许高达桶容量的突发流量
 * - 平滑的速率限制，无严格的时间窗口
 * - 内存高效，具有 O(1) 空间复杂度
 * - 基于实际使用模式的自我调节
 *
 * @class TokenBucketRateLimiter
 * @since 1.0.0
 */
export class TokenBucketRateLimiter {
  /** 桶可以容纳的最大令牌数 */
  private capacity: number;

  /** 桶中当前的令牌数 */
  private tokens: number;

  /** 添加令牌的速率（每秒令牌数） */
  private refillRate: number;

  /** 速率计算的时间窗口（秒） */
  private window: number;

  /** 最后一次令牌补充操作的时间戳 */
  private lastRefill: number;

  /**
   * 令牌桶构造函数
   *
   * 使用指定的容量和补充速率初始化令牌桶。
   * 桶开始时是满的，以允许立即处理请求。
   *
   * @constructor
   * @param {number} capacity - 桶可以容纳的最大令牌数
   * @param {number} refillRate - 每秒添加的令牌数
   * @param {number} [window=60] - 时间窗口（秒）（用于兼容性）
   *
   * @example
   * // 允许100个请求，每秒补充10个令牌
   * const limiter = new TokenBucketRateLimiter(100, 10);
   */
  constructor(capacity: number, refillRate: number, window: number = 60) {
    this.capacity = capacity;
    this.tokens = capacity; // 开始时桶是满的
    this.refillRate = refillRate;
    this.window = window;
    this.lastRefill = TimeUtils.now();
  }

  /**
   * 检查请求是否被允许
   *
   * 根据令牌可用性确定是否可以处理请求。
   * 根据经过的时间自动补充令牌，并为允许的请求消耗令牌。
   *
   * 算法步骤：
   * 1. 计算自上次补充以来的经过时间
   * 2. 根据补充速率和经过时间添加令牌
   * 3. 检查是否有足够的令牌可用
   * 4. 如果请求被允许则消耗令牌
   *
   * 时间复杂度：O(1)
   * 空间复杂度：O(1)
   *
   * @public
   * @param {number} [tokensRequested=1] - 要消耗的令牌数
   * @returns {boolean} 如果请求被允许返回true，如果被速率限制返回false
   *
   * @example
   * if (limiter.allowRequest()) {
   *   // 处理请求
   *   processRequest();
   * } else {
   *   // 被速率限制
   *   throw new Error('Rate limit exceeded');
   * }
   */
  public allowRequest(tokensRequested: number = 1): boolean {
    const now = TimeUtils.now();

    // 根据经过的时间计算要添加的令牌数
    const elapsed = (now - this.lastRefill) / 1000; // 转换为秒
    const tokensToAdd = elapsed * this.refillRate;

    // 将桶补充到容量上限
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;

    // 检查是否有足够的令牌可用
    if (this.tokens >= tokensRequested) {
      this.tokens -= tokensRequested;
      return true;
    }

    return false;
  }
}

/**
 * 自适应速率限制器
 *
 * 高级速率限制系统，根据系统负载和资源利用率自动调整限制。
 * 为不同标识符维护独立的令牌桶，同时适应系统条件。
 *
 * 功能特性：
 * - 基于 CPU 和内存使用情况的动态速率调整
 * - 具有隔离桶的按标识符速率限制
 * - 自动桶创建和管理
 * - 负载感知缩放以获得最佳性能
 *
 * 使用场景：
 * - 具有系统负载感知的 API 速率限制
 * - 数据库连接节流
 * - 资源感知的请求处理
 * - 多租户速率限制
 *
 * @class AdaptiveRateLimiter
 * @since 1.0.0
 */
export class AdaptiveRateLimiter {
  /** 系统负载调整前的基础速率限制 */
  private baseLimit: number;

  /** 速率计算的时间窗口（秒） */
  private window: number;

  /** 当前系统负载因子（0.5 到 1.2） */
  private systemLoadFactor: number;

  /** 标识符特定令牌桶限制器的映射 */
  private buckets: Map<string, TokenBucketRateLimiter>;

  /**
   * 自适应速率限制器构造函数
   *
   * 使用基础限制和时间窗口初始化自适应速率限制器。
   * 系统负载因子从1.0开始（无调整）。
   *
   * @constructor
   * @param {number} baseLimit - 负载调整前的基础速率限制
   * @param {number} [window=60] - 时间窗口（秒）
   *
   * @example
   * // 创建每分钟100个请求的自适应限制器
   * const limiter = new AdaptiveRateLimiter(100, 60);
   */
  constructor(baseLimit: number, window: number = 60) {
    this.baseLimit = baseLimit;
    this.window = window;
    this.systemLoadFactor = 1.0; // 开始时无调整
    this.buckets = new Map<string, TokenBucketRateLimiter>();
  }

  /**
   * 更新系统负载
   *
   * 根据CPU和内存利用率调整系统负载因子。
   * 这通过向上或向下缩放基础限制来影响所有速率限制。
   *
   * 负载因子规则：
   * - 高负载（CPU > 80% 或 内存 > 80%）：因子 = 0.5（减少限制）
   * - 低负载（CPU < 50% 且 内存 < 50%）：因子 = 1.2（增加限制）
   * - 正常负载：因子 = 1.0（无调整）
   *
   * @public
   * @param {number} cpuUsage - CPU利用率（0.0 到 1.0）
   * @param {number} memoryUsage - 内存利用率（0.0 到 1.0）
   *
   * @example
   * // 根据系统指标更新
   * limiter.updateSystemLoad(0.75, 0.60); // 正常负载
   * limiter.updateSystemLoad(0.90, 0.85); // 高负载 - 减少限制
   */
  public updateSystemLoad(cpuUsage: number, memoryUsage: number): void {
    if (cpuUsage > 0.8 || memoryUsage > 0.8) {
      // 高系统负载：减少速率限制以保护系统
      this.systemLoadFactor = 0.5;
    } else if (cpuUsage < 0.5 && memoryUsage < 0.5) {
      // 低系统负载：增加速率限制以获得更好的吞吐量
      this.systemLoadFactor = 1.2;
    } else {
      // 正常系统负载：使用基础速率限制
      this.systemLoadFactor = 1.0;
    }
  }

  /**
   * 检查标识符的速率限制
   *
   * 根据当前速率限制和系统负载检查来自指定标识符的请求是否应被允许。
   * 自动为新标识符创建新的令牌桶。
   *
   * @public
   * @param {string} identifier - 用于速率限制的唯一标识符
   * @returns {boolean} 如果请求被允许返回true，如果被速率限制返回false
   *
   * @example
   * // 检查特定用户的速率限制
   * if (limiter.checkRateLimit('user:123')) {
   *   // 处理请求
   *   handleRequest();
   * } else {
   *   // 被速率限制
   *   throw new Error('Rate limit exceeded for user');
   * }
   */
  public checkRateLimit(identifier: string): boolean {
    // 根据当前系统负载计算调整后的限制
    const adjustedLimit = Math.floor(this.baseLimit * this.systemLoadFactor);

    // 为新标识符创建新的令牌桶
    if (!this.buckets.has(identifier)) {
      const refillRate = adjustedLimit / this.window;
      this.buckets.set(identifier, new TokenBucketRateLimiter(
        adjustedLimit,
        refillRate,
        this.window
      ));
    }

    // 使用标识符的令牌桶检查速率限制
    return this.buckets.get(identifier)!.allowRequest();
  }
}