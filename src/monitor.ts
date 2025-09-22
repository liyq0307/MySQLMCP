
/**
 * MySQL企业级系统监控中心 - 内存管理与性能资源监控系统
 *
 * 企业级系统资源监控和内存管理解决方案，集成实时内存监控、泄漏检测和系统性能分析功能。
 * 为MySQL MCP服务器提供全面的系统健康监控、内存优化和性能诊断能力，
 * 支持自动垃圾回收、压力感知和智能资源管理。
 * @fileoverview 企业级系统监控中心 - 内存管理、性能监控、智能优化
 * 
 * @author liyq  
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import { loadavg } from 'os';
import { ErrorSeverity } from './types.js';
import { SystemResources, AlertEvent, MemorySnapshot } from './metrics.js';
import { logger } from './logger.js';
import { TimeUtils, MemoryUtils } from './utils/common.js';

/**
 * 内存优化选项
 */
export interface MemoryOptimizationOptions {
  /** 启用自动垃圾回收 */
  autoGC: boolean;
  /** 内存压力阈值 (0-1) */
  pressureThreshold: number;
  /** 缓存清理阈值 (0-1) */
  cacheClearThreshold: number;
  /** 监控间隔(毫秒) */
  monitoringInterval: number;
  /** 保留历史记录数量 */
  historySize: number;
}

/**
 * 内存监控器类
 *
 * 实时监控内存使用情况，检测内存泄漏模式，并自动触发优化措施。
 * 提供内存压力预警、垃圾回收建议和缓存清理功能。
 *
 * @class MemoryMonitor
 * @since 1.0.0
 */
export class MemoryMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private memoryHistory: MemorySnapshot[] = [];
  private isMonitoring = false;
  private options: MemoryOptimizationOptions;

  // 告警回调
  private alertCallbacks: Array<(event: AlertEvent) => void> = [];

  // GC 统计
  private gcStats = {
    triggered: 0,
    lastGC: 0,
    memoryFreed: 0
  };

  // 自动清理跟踪
  private autoCleanupStats = {
    totalCleanups: 0,
    lastCleanupTime: 0,
    objectsCollected: 0,
    memoryReclaimed: 0
  };

  // 无引用对象跟踪
  private orphanedObjects: Map<string, {
    object: WeakRef<object>;
    createdAt: number;
    lastAccessed: number;
    size: number;
  }> = new Map();

  /**
   * 默认配置
   */
  private static readonly DEFAULT_OPTIONS: MemoryOptimizationOptions = {
    autoGC: true,
    pressureThreshold: 0.8,
    cacheClearThreshold: 0.85,
    monitoringInterval: 30000, // 30秒
    historySize: 100
  };

  /**
   * 构造函数
   *
   * @param options - 内存优化选项
   */
  constructor(options: Partial<MemoryOptimizationOptions> = {}) {
    // 从环境变量加载配置
    const envOptions: Partial<MemoryOptimizationOptions> = {};

    // 内存监控间隔
    const memoryMonitoringInterval = process.env.MEMORY_MONITORING_INTERVAL;
    if (memoryMonitoringInterval) {
      const interval = parseInt(memoryMonitoringInterval, 10);
      if (!isNaN(interval) && interval > 0) {
        envOptions.monitoringInterval = interval;
      }
    }

    // 内存历史记录大小
    const memoryHistorySize = process.env.MEMORY_HISTORY_SIZE;
    if (memoryHistorySize) {
      const historySize = parseInt(memoryHistorySize, 10);
      if (!isNaN(historySize) && historySize > 0) {
        envOptions.historySize = historySize;
      }
    }

    // 内存压力阈值
    const memoryPressureThreshold = process.env.MEMORY_PRESSURE_THRESHOLD;
    if (memoryPressureThreshold) {
      const threshold = parseFloat(memoryPressureThreshold);
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
        envOptions.pressureThreshold = threshold;
      }
    }

    // 缓存清理阈值
    const memoryCacheClearThreshold = process.env.MEMORY_CACHE_CLEAR_THRESHOLD;
    if (memoryCacheClearThreshold) {
      const threshold = parseFloat(memoryCacheClearThreshold);
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
        envOptions.cacheClearThreshold = threshold;
      }
    }

    // 启用自动垃圾回收
    const memoryAutoGc = process.env.MEMORY_AUTO_GC;
    if (memoryAutoGc) {
      envOptions.autoGC = memoryAutoGc.toLowerCase() === 'true';
    }

    this.options = { ...MemoryMonitor.DEFAULT_OPTIONS, ...envOptions, ...options };
  }

  /**
   * 开始内存监控
   *
   * @public
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      // 显示重复启动监控的消息，确保测试能够捕获
      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
        logger.warn('Memory monitoring is already running');
      }
      return;
    }

    this.isMonitoring = true;

    // 立即采集一次快照
    this.takeSnapshot();

    // 定期监控
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCycle();
    }, this.options.monitoringInterval);

    // 显示启动监控的消息，确保测试能够捕获
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      logger.warn(`Memory monitoring started with ${this.options.monitoringInterval}ms interval`);
    }
  }

  /**
   * 停止内存监控
   *
   * @public
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isMonitoring = false;
    // Only show stop message in debug mode
    if (process.env.LOG_LEVEL === 'debug') {
      logger.warn('Memory monitoring stopped');
    }
  }

  /**
   * 获取当前内存快照
   *
   * @public
   * @returns 内存快照
   */
  public getCurrentSnapshot(): MemorySnapshot {
    return this.takeSnapshot();
  }

  /**
   * 获取内存历史数据
   *
   * @public
   * @returns 内存历史快照数组
   */
  public getMemoryHistory(): MemorySnapshot[] {
    return [...this.memoryHistory];
  }

  /**
   * 获取内存统计信息
   *
   * @public
   * @returns 内存使用统计
   */
  public getMemoryStats(): {
    current: MemorySnapshot;
    peak: { rss: number; heapUsed: number; heapTotal: number };
    average: { rss: number; heapUsed: number; heapTotal: number };
    trend: 'increasing' | 'decreasing' | 'stable';
    leakSuspicions: number;
  } {
    if (this.memoryHistory.length === 0) {
      const current = this.getCurrentSnapshot();
      return {
        current,
        peak: { rss: current.usage.rss, heapUsed: current.usage.heapUsed, heapTotal: current.usage.heapTotal },
        average: { rss: current.usage.rss, heapUsed: current.usage.heapUsed, heapTotal: current.usage.heapTotal },
        trend: 'stable',
        leakSuspicions: 0
      };
    }

    const current = this.memoryHistory[this.memoryHistory.length - 1];
    const peak = this.calculatePeak();
    const average = this.calculateAverage();
    const trend = this.analyzeTrend();
    const leakSuspicions = this.memoryHistory.filter(s => s.leakSuspicion).length;

    return { current, peak, average, trend, leakSuspicions };
  }

  /**
   * 手动触发内存优化
   *
   * @public
   * @returns 优化前后的内存使用情况
   */
  public async optimizeMemory(): Promise<{
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    freed: number;
  }> {
    const before = MemoryUtils.getCurrentUsage();
    
    // 触发垃圾回收
    await this.triggerGC();
    
    // 等待一小段时间让GC完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const after = MemoryUtils.getCurrentUsage();
    const freed = before.heapUsed - after.heapUsed;
    
    this.gcStats.memoryFreed += freed;
    
    return { before, after, freed };
  }

  /**
   * 添加告警回调
   *
   * @public
   * @param callback - 告警回调函数
   */
  public addAlertCallback(callback: (event: AlertEvent) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 移除告警回调
   *
   * @public
   * @param callback - 要移除的回调函数
   */
  public removeAlertCallback(callback: (event: AlertEvent) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index !== -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * 获取垃圾回收统计
   *
   * @public
   * @returns GC统计信息
   */
  public getGCStats(): typeof MemoryMonitor.prototype.gcStats {
    return { ...this.gcStats };
  }

  /**
   * 注册对象以进行自动清理跟踪
   *
   * @public
   * @param id - 对象标识符
   * @param object - 要跟踪的对象
   * @param estimatedSize - 估算的对象大小（字节）
   */
  public registerObjectForCleanup(id: string, object: object, estimatedSize: number = 64): void {
    try {
      if (typeof WeakRef !== 'undefined') {
        this.orphanedObjects.set(id, {
          object: new WeakRef(object),
          createdAt: TimeUtils.now(),
          lastAccessed: TimeUtils.now(),
          size: estimatedSize
        });

        if (process.env.LOG_LEVEL === 'debug') {
          logger.warn(`Registered object for cleanup tracking: ${id} (${estimatedSize} bytes)`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to register object for cleanup: ${id}`, undefined, { error: (error as Error).message });
    }
  }

  /**
   * 访问已注册的对象（更新最后访问时间）
   *
   * @public
   * @param id - 对象标识符
   */
  public touchObject(id: string): void {
    const tracked = this.orphanedObjects.get(id);
    if (tracked) {
      tracked.lastAccessed = TimeUtils.now();
    }
  }

  /**
   * 手动取消注册对象
   *
   * @public
   * @param id - 对象标识符
   * @returns 是否成功取消注册
   */
  public unregisterObject(id: string): boolean {
    return this.orphanedObjects.delete(id);
  }

  /**
   * 执行自动清理无引用对象
   *
   * @public
   * @returns 清理统计信息
   */
  public performAutomaticCleanup(): {
    cleanedCount: number;
    memoryReclaimed: number;
    duration: number;
  } {
    const startTime = TimeUtils.now();
    let cleanedCount = 0;
    let memoryReclaimed = 0;

    try {
      const currentTime = TimeUtils.now();
      const cleanupThreshold = 300000; // 5分钟无访问则清理

      for (const [id, tracked] of this.orphanedObjects.entries()) {
        // 检查WeakRef是否已失效
        const object = tracked.object.deref();
        if (!object) {
          // 对象已被垃圾回收
          this.orphanedObjects.delete(id);
          cleanedCount++;
          memoryReclaimed += tracked.size;
          continue;
        }

        // 检查是否长时间未访问
        const timeSinceAccess = currentTime - tracked.lastAccessed;
        if (timeSinceAccess > cleanupThreshold) {
          // 标记为孤立对象，让GC处理
          this.orphanedObjects.delete(id);
          cleanedCount++;
          memoryReclaimed += tracked.size;

          if (process.env.LOG_LEVEL === 'debug') {
            logger.warn(`Cleaned up orphaned object: ${id} (last accessed ${timeSinceAccess}ms ago)`);
          }
        }
      }

      // 限制跟踪对象数量
      const maxTrackedObjects = 1000;
      if (this.orphanedObjects.size > maxTrackedObjects) {
        const excessCount = this.orphanedObjects.size - maxTrackedObjects;
        const oldestEntries = Array.from(this.orphanedObjects.entries())
          .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
          .slice(0, excessCount);

        for (const [id, tracked] of oldestEntries) {
          this.orphanedObjects.delete(id);
          cleanedCount++;
          memoryReclaimed += tracked.size;
        }
      }

      // 触发WeakMap缓存清理
      // 注意：这里不再调用独立的WeakMapCacheManager，改为通过CacheManager处理

      // 更新自动清理统计
      this.autoCleanupStats.totalCleanups++;
      this.autoCleanupStats.lastCleanupTime = currentTime;
      this.autoCleanupStats.objectsCollected += cleanedCount;
      this.autoCleanupStats.memoryReclaimed += memoryReclaimed;

      const duration = TimeUtils.now() - startTime;

      if (process.env.LOG_LEVEL === 'debug' && cleanedCount > 0) {
        logger.warn(`Automatic cleanup completed: ${cleanedCount} objects cleaned, ${(memoryReclaimed / 1024).toFixed(2)}KB reclaimed in ${duration}ms`);
      }

      return { cleanedCount, memoryReclaimed, duration };

    } catch (error) {
      logger.warn('Automatic cleanup failed:', undefined, { error: (error as Error).message });
      return { cleanedCount: 0, memoryReclaimed: 0, duration: TimeUtils.now() - startTime };
    }
  }

  /**
   * 获取自动清理统计信息
   *
   * @public
   * @returns 自动清理统计
   */
  public getAutoCleanupStats(): typeof MemoryMonitor.prototype.autoCleanupStats & {
    trackedObjects: number;
  } {
    return {
      ...this.autoCleanupStats,
      trackedObjects: this.orphanedObjects.size
    };
  }

  /**
   * 执行监控周期
   *
   * @private
   */
  private performMonitoringCycle(): void {
    try {
      const snapshot = this.takeSnapshot();

      // 检查内存压力
      if (snapshot.pressureLevel >= this.options.pressureThreshold) {
        this.handleMemoryPressure(snapshot);
      }

      // 检查内存泄漏迹象
      if (snapshot.leakSuspicion) {
        this.handleLeakSuspicion(snapshot);
      }

      // 定期执行自动清理
      const timeSinceLastCleanup = TimeUtils.now() - this.autoCleanupStats.lastCleanupTime;
      const cleanupInterval = this.options.monitoringInterval * 2; // 每2个监控周期执行一次清理

      if (timeSinceLastCleanup >= cleanupInterval) {
        this.performAutomaticCleanup();
      }

      // 注意：WeakMap缓存清理现在由CacheManager负责，不在这里处理

    } catch (error) {
      logger.warn('Memory monitoring cycle failed:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 采集内存快照
   *
   * @private
   * @returns 内存快照
   */
  private takeSnapshot(): MemorySnapshot {
    const usage = MemoryUtils.getCurrentUsage();
    const timestamp = TimeUtils.now();
    const pressureLevel = this.calculatePressureLevel(usage);
    const leakSuspicion = this.detectLeakSuspicion(usage);

    const snapshot: MemorySnapshot = {
      usage,
      timestamp,
      pressureLevel,
      leakSuspicion
    };

    // 添加到历史记录
    this.memoryHistory.push(snapshot);
    
    // 维持历史记录大小限制
    if (this.memoryHistory.length > this.options.historySize) {
      this.memoryHistory.shift();
    }

    return snapshot;
  }

  /**
   * 计算内存压力级别
   *
   * @private
   * @param usage - 内存使用情况
   * @returns 压力级别 (0-1)
   */
  private calculatePressureLevel(usage: NodeJS.MemoryUsage): number {
    // 基于堆使用率计算压力
    const heapPressure = usage.heapUsed / usage.heapTotal;
    
    // 基于总内存使用计算压力 (假设系统总内存为2GB作为基准)
    const totalMemoryBase = 2 * 1024 * 1024 * 1024; // 2GB
    const rssPressure = usage.rss / totalMemoryBase;
    
    // 综合压力级别
    return Math.min(Math.max(heapPressure, rssPressure), 1.0);
  }

  /**
   * 检测内存泄漏迹象
   *
   * @private
   * @param usage - 当前内存使用情况
   * @returns 是否怀疑内存泄漏
   */
  private detectLeakSuspicion(_usage: NodeJS.MemoryUsage): boolean {
    if (this.memoryHistory.length < 10) {
      return false; // 需要足够的历史数据
    }

    // 检查过去10个快照的趋势
    const recent = this.memoryHistory.slice(-10);
    const trend = this.calculateMemoryTrend(recent.map(s => s.usage.heapUsed));
    
    // 如果内存持续增长且增长率超过阈值，怀疑泄漏
    const growthRate = trend.slope / (recent[0].usage.heapUsed || 1);
    const suspiciousGrowthRate = 0.05; // 5%增长率阈值
    
    return trend.isIncreasing && Math.abs(growthRate) > suspiciousGrowthRate;
  }

  /**
   * 处理内存压力
   *
   * @private
   * @param snapshot - 内存快照
   */
  private async handleMemoryPressure(snapshot: MemorySnapshot): Promise<void> {
    // 触发告警
    this.triggerAlert({
      type: 'high_memory_pressure',
      severity: snapshot.pressureLevel > 0.9 ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
      message: `内存压力过高: ${(snapshot.pressureLevel * 100).toFixed(2)}%`,
      context: {
        pressureLevel: snapshot.pressureLevel,
        heapUsed: snapshot.usage.heapUsed,
        heapTotal: snapshot.usage.heapTotal,
        rss: snapshot.usage.rss
      },
      timestamp: new Date()
    });

    // 自动优化（如果启用）
    if (this.options.autoGC && snapshot.pressureLevel >= this.options.cacheClearThreshold) {
      try {
        await this.performMemoryOptimization(snapshot);
      } catch (error) {
        logger.warn('Automatic memory optimization failed:', undefined, { error: (error as Error).message });
        // 在优化失败时尝试紧急清理
        try {
          await this.emergencyCacheCleanup(snapshot);
          if (process.env.LOG_LEVEL === 'debug') {
            logger.warn('Emergency cache cleanup performed after optimization failure');
          }
        } catch (cleanupError) {
          logger.error('Emergency cache cleanup also failed', 'MemoryMonitor', cleanupError as Error);
        }
      }
    }
  }

  /**
   * 执行内存优化
   *
   * @private
   * @param snapshot - 内存快照
   */
  private async performMemoryOptimization(snapshot: MemorySnapshot): Promise<void> {
    // 检查是否可以执行垃圾回收
    if (global.gc) {
      const optimizeResult = await this.optimizeMemory();

      // 更新GC统计
      this.gcStats.triggered++;
      this.gcStats.lastGC = TimeUtils.now();
      this.gcStats.memoryFreed += optimizeResult.freed;

      if (process.env.LOG_LEVEL === 'debug') {
        logger.warn(`Automatic memory optimization triggered due to high pressure. Freed: ${(optimizeResult.freed / 1024 / 1024).toFixed(2)}MB`);
      }
    } else {
      // 如果无法执行垃圾回收，至少清理缓存
      await this.fallbackCacheCleanup(snapshot);

      if (process.env.LOG_LEVEL === 'debug') {
        logger.warn('Automatic memory optimization skipped due to unavailable gc. Cache cleanup performed instead. Consider running with --expose-gc flag.');
      }
    }

    // 在严重内存压力下尝试额外的优化措施
    if (snapshot.pressureLevel > 0.95) {
      await this.performCriticalMemoryOptimization(snapshot);
    }
  }

  /**
   * 处理内存泄漏怀疑
   *
   * @private
   * @param snapshot - 内存快照
   */
  private handleLeakSuspicion(snapshot: MemorySnapshot): void {
    this.triggerAlert({
      type: 'memory_leak_suspicion',
      severity: ErrorSeverity.HIGH,
      message: '检测到可能的内存泄漏模式',
      context: {
        currentHeapUsed: snapshot.usage.heapUsed,
        trend: this.analyzeTrend(),
        historySize: this.memoryHistory.length
      },
      timestamp: new Date()
    });
  }

  /**
   * 触发垃圾回收
   *
   * @private
   */
  private async triggerGC(): Promise<void> {
    try {
      if (global.gc) {
        global.gc();
        this.gcStats.triggered++;
        this.gcStats.lastGC = TimeUtils.now();
      } else {
        // 如果没有global.gc，不显示警告除非在调试模式下
        // This reduces noise in normal operation while still providing info when needed
        if (process.env.LOG_LEVEL === 'debug') {
          logger.warn('global.gc is not available. Run with --expose-gc to enable manual garbage collection. ' +
                       'Memory optimization will be limited without manual garbage collection.');
        }
      }
    } catch (error) {
      logger.warn('Failed to trigger garbage collection:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 触发告警
   *
   * @private
   * @param event - 告警事件
   */
  private triggerAlert(event: AlertEvent): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.error('Memory alert callback failed:', 'MemoryMonitor', error as Error);
      }
    });
  }

  /**
   * 计算内存使用峰值
   *
   * @private
   * @returns 峰值内存使用
   */
  private calculatePeak(): { rss: number; heapUsed: number; heapTotal: number } {
    if (this.memoryHistory.length === 0) {
      const current = MemoryUtils.getCurrentUsage();
      return { rss: current.rss, heapUsed: current.heapUsed, heapTotal: current.heapTotal };
    }

    return this.memoryHistory.reduce((peak, snapshot) => ({
      rss: Math.max(peak.rss, snapshot.usage.rss),
      heapUsed: Math.max(peak.heapUsed, snapshot.usage.heapUsed),
      heapTotal: Math.max(peak.heapTotal, snapshot.usage.heapTotal)
    }), { rss: 0, heapUsed: 0, heapTotal: 0 });
  }

  /**
   * 计算平均内存使用
   *
   * @private
   * @returns 平均内存使用
   */
  private calculateAverage(): { rss: number; heapUsed: number; heapTotal: number } {
    if (this.memoryHistory.length === 0) {
      const current = MemoryUtils.getCurrentUsage();
      return { rss: current.rss, heapUsed: current.heapUsed, heapTotal: current.heapTotal };
    }

    const sum = this.memoryHistory.reduce((acc, snapshot) => ({
      rss: acc.rss + snapshot.usage.rss,
      heapUsed: acc.heapUsed + snapshot.usage.heapUsed,
      heapTotal: acc.heapTotal + snapshot.usage.heapTotal
    }), { rss: 0, heapUsed: 0, heapTotal: 0 });

    const count = this.memoryHistory.length;
    return {
      rss: sum.rss / count,
      heapUsed: sum.heapUsed / count,
      heapTotal: sum.heapTotal / count
    };
  }

  /**
   * 分析内存使用趋势
   *
   * @private
   * @returns 趋势分析结果
   */
  private analyzeTrend(): 'increasing' | 'decreasing' | 'stable' {
    if (this.memoryHistory.length < 5) {
      return 'stable';
    }

    const recentUsage = this.memoryHistory.slice(-5).map(s => s.usage.heapUsed);
    const trend = this.calculateMemoryTrend(recentUsage);
    
    const threshold = 1024 * 1024; // 1MB 阈值
    
    if (Math.abs(trend.slope) < threshold) {
      return 'stable';
    }
    
    return trend.isIncreasing ? 'increasing' : 'decreasing';
  }

  /**
   * 计算内存趋势
   *
   * @private
   * @param values - 内存使用值数组
   * @returns 趋势计算结果
   */
  private calculateMemoryTrend(values: number[]): { slope: number; isIncreasing: boolean } {
    if (values.length < 2) {
      return { slope: 0, isIncreasing: false };
    }

    // 使用简单线性回归计算趋势
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    return {
      slope,
      isIncreasing: slope > 0
    };
  }

  /**
   * 后备缓存清理方案 - 当GC不可用时进行内存清理
   *
   * @private
   * @param snapshot - 当前内存快照
   */
  private async fallbackCacheCleanup(snapshot: MemorySnapshot): Promise<void> {
    try {
      // 获取清理前的内存状态
      const beforeCleanup = MemoryUtils.getCurrentUsage();

      // 方案1：清理旧的历史记录（保留20%最接近的值）
      const historyKeepPercent = 0.2;
      const keepCount = Math.floor(this.memoryHistory.length * historyKeepPercent);
      if (this.memoryHistory.length > keepCount && this.memoryHistory.length > 10) {
        // 保留最近的历史记录
        const recentHistory = this.memoryHistory.slice(-keepCount);
        const currentIndex = this.memoryHistory.indexOf(snapshot);
        // 如果当前快照不在保留列表中，添加到开头
        if (currentIndex === -1 || currentIndex >= keepCount) {
          recentHistory.unshift(snapshot);
        }
        this.memoryHistory = recentHistory;
      }

      // 方案2：强制清理老的GC统计数据
      const statsKeepPercent = 0.5;
      const gcTriggersToKeep = Math.floor(this.gcStats.triggered * statsKeepPercent);
      if (this.gcStats.triggered > gcTriggersToKeep && this.gcStats.triggered > 50) {
        // 重置GC统计，只保留基础信息
        const oldMemoryFreed = this.gcStats.memoryFreed;
        this.gcStats = {
          triggered: Math.floor(this.gcStats.triggered * statsKeepPercent),
          lastGC: this.gcStats.lastGC,
          memoryFreed: Math.floor(oldMemoryFreed * statsKeepPercent)
        };
      }

      // 等待清理生效
      await new Promise(resolve => setTimeout(resolve, 50));

      // 获取清理后的内存状态
      const afterCleanup = MemoryUtils.getCurrentUsage();
      const memoryFreed = beforeCleanup.heapUsed - afterCleanup.heapUsed;

      // 更新统计信息
      if (memoryFreed > 0) {
        this.gcStats.memoryFreed += memoryFreed;
      }

      if (process.env.LOG_LEVEL === 'debug') {
        logger.warn(`Fallback cache cleanup completed. History size reduced from ${beforeCleanup.heapUsed} to ${afterCleanup.heapUsed} bytes`);
      }

    } catch (error) {
      logger.warn('Fallback cache cleanup failed:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 严重内存压力下的额外优化措施
   *
   * @private
   * @param snapshot - 当前内存快照
   */
  private async performCriticalMemoryOptimization(snapshot: MemorySnapshot): Promise<void> {
    try {
      if (snapshot.pressureLevel > 0.98) {
        // 极端情况：清空所有非必要的内存数据
        const historyCount = this.memoryHistory.length;
        this.memoryHistory.length = 0;
        this.memoryHistory.push(snapshot); // 只保留当前快照

        // 停止内存监控5分钟后重新启动
        if (this.isMonitoring && process.env.LOG_LEVEL === 'debug') {
          logger.warn('Critical memory pressure detected. Temporarily stopping monitoring to free resources.');
        }

        // 短暂延迟后可能会重新启动监控
        setTimeout(() => {
          if (!this.isMonitoring) {
            this.startMonitoring();
            if (process.env.LOG_LEVEL === 'debug') {
              logger.warn('Memory monitoring restarted after critical optimization');
            }
          }
        }, 300000); // 5分钟后检查是否需要重启

        if (process.env.LOG_LEVEL === 'debug') {
          logger.warn(`Critical memory optimization: Cleared ${historyCount} history entries`);
        }
      } else if (snapshot.pressureLevel > 0.95) {
        // 高压力但非极端情况：清理部分数据
        const cleanupCount = Math.floor(this.memoryHistory.length * 0.5);
        if (this.memoryHistory.length > cleanupCount && cleanupCount > 0) {
          // 合并历史记录，保留最近的一半
          const keepHistory = this.memoryHistory.slice(-cleanupCount);
          this.memoryHistory = keepHistory;

          if (process.env.LOG_LEVEL === 'debug') {
            logger.warn(`High memory optimization: Retained ${cleanupCount} recent history entries`);
          }
        }

        // 强制触发多次清理
        for (let i = 0; i < 3; i++) {
          if (global.gc) {
            global.gc();
          }
          await new Promise(resolve => setTimeout(resolve, 20));
        }
      }

    } catch (error) {
      logger.error('Critical memory optimization failed:', 'MemoryMonitor', error as Error);
    }
  }

  /**
   * 紧急缓存清理 - 在优化失败时的最后手段
   *
   * @private
   * @param snapshot - 当前内存快照
   */
  private async emergencyCacheCleanup(snapshot: MemorySnapshot): Promise<void> {
    try {
      logger.warn('Starting emergency cache cleanup due to optimization failure');

      // 紧急方案1：清除所有历史记录
      const clearedEntries = this.memoryHistory.length;
      this.memoryHistory.length = 0;
      this.memoryHistory.push(snapshot); // 只保留当前快照

      // 紧急方案2：重置所有统计信息
      const originalGCStats = { ...this.gcStats };
      this.gcStats = {
        triggered: 0,
        lastGC: TimeUtils.now(), // 只保留最后一次GC时间
        memoryFreed: 0
      };

      // 紧急方案3：强制停止同步操作
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
        this.isMonitoring = false;

        // 10秒后重新启动
        setTimeout(() => {
          if (this.options.autoGC) {
            this.startMonitoring();
            logger.warn('Memory monitoring restarted after emergency cleanup');
          }
        }, 10000);
      }

      // 触发告警
      this.triggerAlert({
        type: 'emergency_memory_cleanup',
        severity: ErrorSeverity.CRITICAL,
        message: '执行紧急内存清理以防止系统崩溃',
        context: {
          originalHistorySize: clearedEntries,
          originalGCTriggered: originalGCStats.triggered,
          originalMemoryFreed: originalGCStats.memoryFreed,
          pressureLevel: snapshot.pressureLevel,
          timestamp: TimeUtils.now()
        },
        timestamp: new Date()
      });

      logger.warn(`Emergency cleanup completed. Cleared ${clearedEntries} history entries and reset statistics.`);

    } catch (error) {
      logger.error('Emergency cache cleanup failed:', 'MemoryMonitor', error as Error);

      // 如果紧急清理也失败，提示手动干预
      logger.error('CRITICAL: All memory optimization methods failed. Manual intervention required!');
      this.triggerAlert({
        type: 'memory_optimization_failed',
        severity: ErrorSeverity.CRITICAL,
        message: '内存优化完全失败，可能需要重启应用程序',
        context: {
          error: error instanceof Error ? error.message : String(error),
          pressureLevel: snapshot.pressureLevel,
          timestamp: TimeUtils.now()
        },
        timestamp: new Date()
      });
    }
  }
}

/**
 * 系统监控器类
 *
 * 监控Node.js进程的系统资源使用情况，提供内存、CPU、
 * 事件循环等关键指标的实时收集和历史分析。
 *
 * @class SystemMonitor
 * @since 1.0.0
 */
export class SystemMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  private isMonitoring = false;
  
  // 历史数据存储
  private resourceHistory: SystemResources[] = [];
  private maxHistorySize = 100;
  
  // 性能指标收集
  private performanceMetrics = {
    measures: [] as Array<{ name: string; duration: number; timestamp: number }>,
    marks: new Map<string, number>(),
    gcEvents: [] as Array<{ type: string; duration: number; timestamp: number }>
  };
  
  // 事件循环延迟监控
  private eventLoopDelayHistory: number[] = [];
  private lastEventLoopCheck = performance.now();
  
  // 告警阈值
  private thresholds = {
    memoryUsagePercent: 80,  // 内存使用率阈值
    heapUsagePercent: 85,    // 堆内存使用率阈值
    eventLoopDelay: 100,     // 事件循环延迟阈值(ms)
    cpuUsageHigh: 90         // CPU使用率阈值(%)
  };
  
  // 告警回调
  private alertCallbacks: Array<(event: AlertEvent) => void> = [];

  /**
   * 系统监控器构造函数
   */
  constructor() {
    this.initializePerformanceObserver();
    this.initializeEventLoopDelay();
    // 延迟启动内存监控器，避免循环依赖
    this.initializeMemoryMonitoring();
  }

  /**
   * 延迟初始化内存监控
   * 
   * @private
   */
  private initializeMemoryMonitoring(): void {
    // 使用 setTimeout 延迟执行，确保所有模块都已初始化
    setTimeout(() => {
      const memoryMonitoringEnabled = process.env.MEMORY_MONITORING_ENABLED;
      if (!memoryMonitoringEnabled || memoryMonitoringEnabled.toLowerCase() === 'true') {
        try {
          // 在运行时访问，避免循环依赖
          if (typeof memoryMonitor !== 'undefined') {
            memoryMonitor.startMonitoring();
            
            // 添加内存监控的告警回调
            memoryMonitor.addAlertCallback((event: AlertEvent) => {
              this.alertCallbacks.forEach(callback => {
                try {
                  callback(event);
                } catch (error) {
                  logger.error('Memory alert callback failed:', 'SystemMonitor', error as Error);
                }
              });
            });
            
            if (process.env.LOG_LEVEL === 'debug') {
              logger.warn('Memory monitoring initialized successfully');
            }
          }
        } catch (error) {
          logger.warn('Failed to start memory monitoring:', undefined, { error: (error as Error).message });
        }
      }
    }, 100); // 增加延迟时间确保初始化完成
  }

  /**
   * 初始化性能观察器
   *
   * @private
   */
  private initializePerformanceObserver(): void {
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        
        entries.forEach(entry => {
          const timestamp = TimeUtils.now();
          
          if (entry.entryType === 'measure') {
            // 收集测量指标
            this.performanceMetrics.measures.push({
              name: entry.name,
              duration: entry.duration,
              timestamp
            });
            
            // 保持历史记录大小限制
            if (this.performanceMetrics.measures.length > 1000) {
              this.performanceMetrics.measures = this.performanceMetrics.measures.slice(-500);
            }
            
            // 检查慢操作告警
            if (entry.duration > 1000) { // 超过1秒的操作
              this.triggerPerformanceAlert({
                type: 'slow_operation',
                severity: ErrorSeverity.MEDIUM,
                message: `检测到慢操作: ${entry.name} 耗时 ${entry.duration.toFixed(2)}ms`,
                context: {
                  operationName: entry.name,
                  duration: entry.duration,
                  timestamp
                },
                timestamp: new Date()
              });
            }
          } else if (entry.entryType === 'mark') {
            // 收集标记点
            this.performanceMetrics.marks.set(entry.name, entry.startTime);
          } else if (entry.entryType === 'gc') {
            // 收集垃圾回收事件 (Node.js 16+) - 避免直接访问废弃属性
            const gcType = this.extractGCType(entry);
            
            this.performanceMetrics.gcEvents.push({
              type: gcType,
              duration: entry.duration || 0,
              timestamp
            });
            
            // 保持GC事件历史记录限制
            if (this.performanceMetrics.gcEvents.length > 100) {
              this.performanceMetrics.gcEvents = this.performanceMetrics.gcEvents.slice(-50);
            }
            
            // GC频率告警
            if (entry.duration && entry.duration > 100) { // GC超过100ms
              this.triggerPerformanceAlert({
                type: 'long_gc',
                severity: ErrorSeverity.MEDIUM,
                message: `垃圾回收时间过长: ${entry.duration.toFixed(2)}ms`,
                context: {
                  gcType,
                  duration: entry.duration,
                  timestamp
                },
                timestamp: new Date()
              });
            }
          }
        });
      });
      
      // 观察多种性能事件类型
      const entryTypes = ['measure', 'mark'];
      
      // 如果支持GC事件观察 (Node.js 16+)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.performanceObserver.observe({ entryTypes: [...entryTypes, 'gc'] } as any);
      } catch {
        // 降级到基本的测量和标记观察
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.performanceObserver.observe({ entryTypes } as any);
      }
      
      if (process.env.LOG_LEVEL === 'debug') {
        logger.warn('Performance observer initialized successfully');
      }
      
    } catch (error) {
      logger.warn('Performance observer initialization failed:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 安全地提取GC类型，避免废弃警告
   * @private
   * @param entry - 性能条目
   * @returns GC事件类型
   */
  private extractGCType(entry: unknown): string {
    try {
      // 使用JSON序列化来安全访问属性，避免直接访问废弃的kind属性
      const entryData = JSON.parse(JSON.stringify(entry));
      
      // 优先使用新的detail.kind属性
      if (entryData.detail && typeof entryData.detail.kind === 'string') {
        return entryData.detail.kind;
      }
      
      // 向后兼容：检查是否有kind属性
      if (entryData.kind && typeof entryData.kind === 'string') {
        return entryData.kind;
      }
      
      // 基于entry.name的后备方案
      if (entryData.name && typeof entryData.name === 'string' && entryData.name.includes('gc')) {
        return entryData.name;
      }
      
      return 'unknown';
    } catch {
      // 如果JSON序列化失败，返回默认值
      return 'gc';
    }
  }

  /**
   * 初始化事件循环延迟监控
   *
   * @private
   */
  private initializeEventLoopDelay(): void {
    try {
      // 初始化事件循环延迟历史记录
      this.eventLoopDelayHistory = [];
      this.lastEventLoopCheck = performance.now();
      
      // 使用Node.js的性能监控API
      if (typeof performance.eventLoopUtilization === 'function') {
        // Node.js 14.10.0+支持
        // 定期检查事件循环利用率
        setInterval(() => {
          try {
            const current = performance.now();
            const timeDiff = current - this.lastEventLoopCheck;
            this.lastEventLoopCheck = current;
            
            // 简单的事件循环延迟检测
            const expectedDelay = 10; // 预期10ms间隔
            const actualDelay = timeDiff;
            const delay = Math.max(0, actualDelay - expectedDelay);
            
            this.eventLoopDelayHistory.push(delay);
            
            // 保持历史记录大小限制
            if (this.eventLoopDelayHistory.length > 100) {
              this.eventLoopDelayHistory = this.eventLoopDelayHistory.slice(-50);
            }
            
            // 检查事件循环延迟告警
            if (delay > this.thresholds.eventLoopDelay) {
              this.triggerPerformanceAlert({
                type: 'high_event_loop_delay',
                severity: delay > 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
                message: `事件循环延迟过高: ${delay.toFixed(2)}ms`,
                context: {
                  eventLoopDelay: delay,
                  expectedDelay,
                  actualDelay,
                  timestamp: TimeUtils.now()
                },
                timestamp: new Date()
              });
            }
          } catch (error) {
            if (process.env.LOG_LEVEL === 'debug') {
              logger.warn('Event loop delay check failed:', undefined, { error: (error as Error).message });
            }
          }
        }, 10); // 每10ms检查一次
      } else {
        // 降级方案：使用简单的setTimeout延迟检测
        const checkEventLoopDelay = () => {
          const start = performance.now();
          setTimeout(() => {
            const end = performance.now();
            const delay = end - start;
            
            this.eventLoopDelayHistory.push(delay);
            
            if (this.eventLoopDelayHistory.length > 100) {
              this.eventLoopDelayHistory = this.eventLoopDelayHistory.slice(-50);
            }
            
            // 递归检查
            checkEventLoopDelay();
          }, 0);
        };
        
        checkEventLoopDelay();
      }
      
      if (process.env.LOG_LEVEL === 'debug') {
        logger.warn('Event loop delay monitoring initialized successfully');
      }
      
    } catch (error) {
      logger.warn('Event loop delay monitoring initialization failed:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 开始系统监控
   *
   * @param intervalMs - 监控间隔(毫秒)
   * @public
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      // 显示重复启动监控的消息，确保测试能够捕获
      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
        logger.warn('System monitoring is already running');
      }
      return;
    }

    this.isMonitoring = true;

    // 立即收集一次数据
    this.collectSystemResources();

    // 定期收集系统资源数据
    this.monitoringInterval = setInterval(() => {
      this.collectSystemResources();
    }, intervalMs);

    // 显示启动监控的消息，确保测试能够捕获
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      logger.warn(`System monitoring started with ${intervalMs}ms interval`);
    }
  }

  /**
   * 停止系统监控
   *
   * @public
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    // 停止内存监控
    memoryMonitor.stopMonitoring();

    this.isMonitoring = false;
    // 仅在调试模式下显示停止消息
    if (process.env.LOG_LEVEL === 'debug') {
      logger.warn('System monitoring stopped');
    }
  }

  /**
   * 获取系统负载平均值
   *
   * @private
   * @returns 系统负载平均值数组 [1分钟, 5分钟, 15分钟]
   */
  private getSystemLoadAverage(): number[] {
    try {
      // 使用 Node.js 的 os.loadavg() 函数获取系统负载平均值
      // 返回 [1分钟平均负载, 5分钟平均负载, 15分钟平均负载]
      const loadAverage = loadavg();

      // 保留三位小数精度，避免过多的精度
      return loadAverage.map(load => Math.round(load * 1000) / 1000);
    } catch (error) {
      // 如果获取失败，返回默认值并记录警告
      logger.warn('获取系统负载平均值失败:', undefined, { error: (error as Error).message });
      return [0, 0, 0]; // 返回默认值防止系统崩溃
    }
  }

  /**
   * 收集系统资源数据
   *
   * @private
   * @returns 当前系统资源快照
   */
  private collectSystemResources(): SystemResources {
    const memoryUsage = MemoryUtils.getCurrentUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();

    // 计算事件循环延迟
    let eventLoopDelay: number | undefined;
    try {
      // 使用收集的延迟历史数据
      if (this.eventLoopDelayHistory.length > 0) {
        // 获取最近的延迟值
        eventLoopDelay = this.eventLoopDelayHistory[this.eventLoopDelayHistory.length - 1];
      } else if (typeof performance.eventLoopUtilization === 'function') {
        // 降级方案：使用Node.js内置API
        const elu = performance.eventLoopUtilization();
        // 简化的事件循环延迟估算
        eventLoopDelay = (elu.idle + elu.active) > 0 ? 
          (elu.active / (elu.idle + elu.active)) * 1000 : 0;
      }
    } catch {
      // 忽略事件循环延迟收集错误
    }

    const resources: SystemResources = {
      memory: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        free: memoryUsage.heapTotal - memoryUsage.heapUsed,
        percentage: MemoryUtils.calculateMemoryUsagePercent(memoryUsage.heapUsed, memoryUsage.heapTotal),
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000, // 转换为毫秒
        loadAverage: this.getSystemLoadAverage()
      },
      eventLoop: {
        delay: eventLoopDelay || 0,
        utilization: eventLoopDelay ? eventLoopDelay / 1000 : 0
      },
      gc: {
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      uptime,
      timestamp: TimeUtils.now(),
      // 向后兼容的别名
      memoryUsage: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        free: memoryUsage.heapTotal - memoryUsage.heapUsed,
        percentage: MemoryUtils.calculateMemoryUsagePercent(memoryUsage.heapUsed, memoryUsage.heapTotal),
        rss: memoryUsage.rss,
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external
      },
      eventLoopDelay: eventLoopDelay || 0
    };

    // 添加到历史记录
    this.addToHistory(resources);

    // 检查告警条件
    this.checkAlerts(resources);

    return resources;
  }

  /**
   * 添加资源数据到历史记录
   *
   * @private
   * @param resources - 系统资源数据
   */
  private addToHistory(resources: SystemResources): void {
    this.resourceHistory.push(resources);
    
    // 保持历史记录大小限制
    if (this.resourceHistory.length > this.maxHistorySize) {
      this.resourceHistory.shift();
    }
  }

  /**
   * 检查告警条件
   *
   * @private
   * @param resources - 当前系统资源数据
   */
  private checkAlerts(resources: SystemResources): void {
    const alerts: AlertEvent[] = [];

    // 检查内存使用率
    const memoryUsagePercent = (resources.memoryUsage.rss / (1024 * 1024 * 1024)) * 100; // 转换为GB并计算百分比
    if (memoryUsagePercent > this.thresholds.memoryUsagePercent) {
      alerts.push({
        type: 'high_memory_usage',
        severity: ErrorSeverity.HIGH,
        message: `内存使用率过高: ${memoryUsagePercent.toFixed(2)}%`,
        context: { memoryUsagePercent, rss: resources.memoryUsage.rss },
        timestamp: new Date()
      });
    }

    // 检查堆内存使用率
    const heapUsagePercent = (resources.memoryUsage.heapUsed / resources.memoryUsage.heapTotal) * 100;
    if (heapUsagePercent > this.thresholds.heapUsagePercent) {
      alerts.push({
        type: 'high_heap_usage',
        severity: ErrorSeverity.HIGH,
        message: `堆内存使用率过高: ${heapUsagePercent.toFixed(2)}%`,
        context: { 
          heapUsagePercent, 
          heapUsed: resources.memoryUsage.heapUsed,
          heapTotal: resources.memoryUsage.heapTotal
        },
        timestamp: new Date()
      });
    }

    // 检查事件循环延迟
    if (resources.eventLoopDelay && resources.eventLoopDelay > this.thresholds.eventLoopDelay) {
      alerts.push({
        type: 'high_event_loop_delay',
        severity: ErrorSeverity.MEDIUM,
        message: `事件循环延迟过高: ${resources.eventLoopDelay.toFixed(2)}ms`,
        context: { eventLoopDelay: resources.eventLoopDelay },
        timestamp: new Date()
      });
    }

    // 触发告警回调
    alerts.forEach(alert => {
      this.alertCallbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          logger.error('Alert callback failed:', 'SystemMonitor', error as Error);
        }
      });
    });
  }

  /**
   * 触发性能告警
   *
   * @private
   * @param event - 告警事件
   */
  private triggerPerformanceAlert(event: AlertEvent): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.error('Performance alert callback failed:', 'SystemMonitor', error as Error);
      }
    });
  }

  /**
   * 获取当前系统资源
   *
   * @public
   * @returns 当前系统资源快照
   */
  public getCurrentResources(): SystemResources {
    return this.collectSystemResources();
  }

  /**
   * 获取资源历史数据
   *
   * @public
   * @returns 系统资源历史数据
   */
  public getResourceHistory(): SystemResources[] {
    return [...this.resourceHistory];
  }

  /**
   * 获取资源使用统计
   *
   * @public
   * @returns 资源使用统计信息
   */
  public getResourceStatistics(): {
    memory: { avg: number; max: number; min: number };
    heap: { avgUsage: number; maxUsage: number };
    uptime: number;
    samples: number;
  } {
    if (this.resourceHistory.length === 0) {
      return {
        memory: { avg: 0, max: 0, min: 0 },
        heap: { avgUsage: 0, maxUsage: 0 },
        uptime: process.uptime(),
        samples: 0
      };
    }

    const memoryValues = this.resourceHistory.map(r => r.memoryUsage.rss);
    const heapUsages = this.resourceHistory.map(r => 
      (r.memoryUsage.heapUsed / r.memoryUsage.heapTotal) * 100
    );

    return {
      memory: {
        avg: memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length,
        max: Math.max(...memoryValues),
        min: Math.min(...memoryValues)
      },
      heap: {
        avgUsage: heapUsages.reduce((a, b) => a + b, 0) / heapUsages.length,
        maxUsage: Math.max(...heapUsages)
      },
      uptime: process.uptime(),
      samples: this.resourceHistory.length
    };
  }

  /**
   * 添加告警回调
   *
   * @public
   * @param callback - 告警回调函数
   */
  public addAlertCallback(callback: (event: AlertEvent) => void): void {
    this.alertCallbacks.push(callback);
    // 也为内存监控器添加回调
    memoryMonitor.addAlertCallback(callback);
  }

  /**
   * 移除告警回调
   *
   * @public
   * @param callback - 要移除的告警回调函数
   */
  public removeAlertCallback(callback: (event: AlertEvent) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index !== -1) {
      this.alertCallbacks.splice(index, 1);
    }
    // 也从内存监控器移除回调
    memoryMonitor.removeAlertCallback(callback);
  }

  /**
   * 更新告警阈值
   *
   * @public
   * @param thresholds - 新的告警阈值
   */
  public updateThresholds(thresholds: Partial<typeof SystemMonitor.prototype.thresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * 检查系统健康状态
   *
   * @public
   * @returns 系统健康状态分析
   */
  public getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
    memoryOptimization?: {
      canOptimize: boolean;
      potentialSavings: string;
      lastOptimization: number;
    };
  } {
    const current = this.getCurrentResources();
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 获取内存监控统计
    const memoryStats = memoryMonitor.getMemoryStats();
    const gcStats = memoryMonitor.getGCStats();

    // 检查内存使用
    const memoryUsageGB = current.memoryUsage.rss / (1024 * 1024 * 1024);
    if (memoryUsageGB > 1) {
      issues.push(`高内存使用: ${memoryUsageGB.toFixed(2)}GB`);
      recommendations.push('考虑增加可用内存或优化内存使用');
    }

    // 检查堆内存使用率
    const heapUsage = (current.memoryUsage.heapUsed / current.memoryUsage.heapTotal) * 100;
    if (heapUsage > 85) {
      issues.push(`堆内存使用率过高: ${heapUsage.toFixed(2)}%`);
      recommendations.push('考虑优化内存管理或调整堆大小');
    }

    // 检查内存泄漏想象
    if (memoryStats.leakSuspicions > 0) {
      issues.push(`可能存在内存泄漏: ${memoryStats.leakSuspicions}次检测`);
      recommendations.push('检查应用程序的内存使用模式和对象生命周期管理');
    }

    // 检查事件循环延迟
    if (current.eventLoopDelay && current.eventLoopDelay > 50) {
      issues.push(`事件循环延迟: ${current.eventLoopDelay.toFixed(2)}ms`);
      recommendations.push('检查是否有阻塞的同步操作');
    }

    // 内存优化建议
    const memoryOptimization = {
      canOptimize: heapUsage > 70 || memoryStats.current.pressureLevel > 0.7,
      potentialSavings: `预计可释放 ${(current.memoryUsage.heapTotal - current.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      lastOptimization: gcStats.lastGC
    };

    // 确定整体状态
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = heapUsage > 90 || memoryUsageGB > 2 || memoryStats.leakSuspicions > 3 ? 'critical' : 'warning';
    }

    return { status, issues, recommendations, memoryOptimization };
  }

  /**
   * 获取性能指标统计
   *
   * @public
   * @returns 性能指标统计信息
   */
  public getPerformanceMetrics(): {
    measures: Array<{ name: string; duration: number; timestamp: number }>;
    gcEvents: Array<{ type: string; duration: number; timestamp: number }>;
    eventLoopDelayStats: {
      current: number;
      average: number;
      max: number;
      samples: number;
    };
    slowOperations: Array<{ name: string; duration: number; timestamp: number }>;
  } {
    const eventLoopDelayStats = {
      current: this.eventLoopDelayHistory.length > 0 ? 
        this.eventLoopDelayHistory[this.eventLoopDelayHistory.length - 1] : 0,
      average: this.eventLoopDelayHistory.length > 0 ? 
        this.eventLoopDelayHistory.reduce((a, b) => a + b, 0) / this.eventLoopDelayHistory.length : 0,
      max: this.eventLoopDelayHistory.length > 0 ? 
        Math.max(...this.eventLoopDelayHistory) : 0,
      samples: this.eventLoopDelayHistory.length
    };

    const slowOperations = this.performanceMetrics.measures
      .filter(m => m.duration > 1000)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10); // 最慢的10个操作

    return {
      measures: [...this.performanceMetrics.measures],
      gcEvents: [...this.performanceMetrics.gcEvents],
      eventLoopDelayStats,
      slowOperations
    };
  }

  /**
   * 创建性能标记
   *
   * @public
   * @param name - 标记名称
   */
  public mark(name: string): void {
    try {
      performance.mark(name);
    } catch (error) {
      logger.warn(`Failed to create performance mark '${name}':`, undefined, { error: (error as Error).message });
    }
  }

  /**
   * 创建性能测量
   *
   * @public
   * @param name - 测量名称
   * @param startMark - 起始标记名称
   * @param endMark - 结束标记名称（可选，默认为当前时间）
   */
  public measure(name: string, startMark: string, endMark?: string): void {
    try {
      if (endMark) {
        performance.measure(name, startMark, endMark);
      } else {
        performance.measure(name, startMark);
      }
    } catch (error) {
      logger.warn(`Failed to create performance measure '${name}':`, undefined, { error: (error as Error).message });
    }
  }

  /**
   * 清理性能数据
   *
   * @public
   * @param olderThanMs - 清理早于指定时间的数据（毫秒）
   */
  public cleanupPerformanceData(olderThanMs: number = 300000): void { // 默认5分钟
    const cutoffTime = TimeUtils.now() - olderThanMs;
    
    this.performanceMetrics.measures = this.performanceMetrics.measures
      .filter(m => m.timestamp > cutoffTime);
    
    this.performanceMetrics.gcEvents = this.performanceMetrics.gcEvents
      .filter(gc => gc.timestamp > cutoffTime);
    
    // 清理事件循环延迟历史（保留最近的50个样本）
    if (this.eventLoopDelayHistory.length > 50) {
      this.eventLoopDelayHistory = this.eventLoopDelayHistory.slice(-50);
    }
  }
}

/**
 * 导出单例实例
 */
export const systemMonitor = new SystemMonitor();

/**
 * 导出单例实例
 */
export const memoryMonitor = new MemoryMonitor();