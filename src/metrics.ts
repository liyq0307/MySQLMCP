/**
 * MySQL企业级性能监控系统 - 时序指标收集与智能告警中心
 *
 * 高级性能监控与指标管理系统，提供企业级的时间序列数据收集、统计分析和实时告警功能。
 * 为MySQL MCP服务器提供全方位的性能洞察、资源监控和异常检测能力，
 * 支持多维度指标跟踪、趋势分析和智能告警机制。
 *
 * @fileoverview 企业级性能监控系统 - 时序分析、智能告警、全方位监控
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-04 - 添加CPU监控功能
 * @license MIT
 */

import { StringConstants } from './constants.js';
import { ErrorSeverity } from './types.js';
import { TimeUtils, MemoryUtils } from './utils/common.js';
import { systemMonitor } from './monitor.js';
import { logger } from './logger.js';

// Import Node.js built-in modules for CPU monitoring
import * as os from 'os';

/**
 * 系统资源信息
 */
export interface SystemResources {
  /** 内存使用信息 */
  memory: {
    /** 已使用的内存量（字节） */
    used: number;
    /** 总内存量（字节） */
    total: number;
    /** 空闲内存量（字节） */
    free: number;
    /** 内存使用百分比（0-100） */
    percentage: number;
    /** 常驻内存集大小（字节） */
    rss: number;
    /** V8堆已使用的内存（字节） */
    heapUsed: number;
    /** V8堆总内存（字节） */
    heapTotal: number;
    /** V8外部内存（字节） */
    external: number;
  };
  /** CPU使用信息 */
  cpu: {
    /** CPU使用率百分比（0-100） */
    usage: number;
    /** 系统负载平均值数组（1分钟、5分钟、15分钟） */
    loadAverage: number[];
  };
  /** 事件循环信息 */
  eventLoop: {
    /** 事件循环延迟时间（毫秒） */
    delay: number;
    /** 事件循环利用率（0-1） */
    utilization: number;
  };
  /** 垃圾回收信息 */
  gc: {
    /** GC后V8堆已使用的内存（字节） */
    heapUsed: number;
    /** GC后V8堆总内存（字节） */
    heapTotal: number;
    /** GC后V8外部内存（字节） */
    external: number;
    /** GC后常驻内存集大小（字节） */
    rss: number;
  };
  /** 系统运行时间（秒） */
  uptime: number;
  /** 数据采集时间戳 */
  timestamp: number;
  // 向后兼容的别名
  /** 内存使用信息（向后兼容别名） */
  memoryUsage: {
    /** 已使用的内存量（字节） */
    used: number;
    /** 总内存量（字节） */
    total: number;
    /** 空闲内存量（字节） */
    free: number;
    /** 内存使用百分比（0-100） */
    percentage: number;
    /** 常驻内存集大小（字节） */
    rss: number;
    /** V8堆已使用的内存（字节） */
    heapUsed: number;
    /** V8堆总内存（字节） */
    heapTotal: number;
    /** V8外部内存（字节） */
    external: number;
  };
  /** 事件循环延迟（毫秒，向后兼容别名） */
  eventLoopDelay: number;
}

/**
 * 告警事件接口
 */
export interface AlertEvent {
  /** 告警类型标识符，用于分类告警（如 'high_memory_pressure', 'memory_leak_suspicion' 等） */
  type: string;
  /** 告警严重级别，使用 ErrorSeverity 枚举定义 */
  severity: ErrorSeverity;
  /** 人类可读的告警描述信息 */
  message: string;
  /** 告警发生的时间戳 */
  timestamp: Date;
  /** 可选的补充详细信息，支持任意键值对数据 */
  details?: Record<string, unknown>;
  /** 可选的告警来源标识符（如具体的监控模块名称） */
  source?: string;
  /** 可选的告警解决状态标志 */
  resolved?: boolean;
  /** 可选的告警解决时间戳 */
  resolvedAt?: Date;
  /** 可选的告警发生时的上下文环境信息 */
  context?: Record<string, unknown>;
}

/**
 * 告警回调函数类型
 */
export type AlertCallback = (event: AlertEvent) => void | Promise<void>;

/**
 * 性能指标数据点
 */
export interface MetricDataPoint {
  /** 数据点时间戳（毫秒） */
  timestamp: number;
  /** 指标数值 */
  value: number;
  /** 标签，用于分类和过滤 */
  tags?: Record<string, string>;
}

/**
 * 时间序列指标
 */
export interface TimeSeriesMetric {
  /** 指标名称 */
  name: string;
  /** 数据点数组 */
  dataPoints: MetricDataPoint[];
  /** 聚合函数类型 */
  aggregation: 'sum' | 'average' | 'min' | 'max' | 'count';
  /** 指标单位 */
  unit: string;
  /** 指标描述 */
  description?: string;
}

/**
 * 性能统计摘要
 */
export interface PerformanceStats {
  /** 查询时间统计（毫秒） */
  queryTime: {
    /** 平均查询时间 */
    avg: number;
    /** 最小查询时间 */
    min: number;
    /** 最大查询时间 */
    max: number;
    /** 95分位数查询时间 */
    p95: number;
    /** 99分位数查询时间 */
    p99: number;
  };
  /** 错误率（0-1） */
  errorRate: number;
  /** 吞吐量（每秒请求数） */
  throughput: number;
  /** 缓存命中率（0-1） */
  cacheHitRate: number;
  /** 连接池利用率（0-1） */
  connectionPoolUtilization: number;
}

/**
 * 内存快照
 */
export interface MemorySnapshot {
  /** 内存使用信息 */
  usage: NodeJS.MemoryUsage;
  /** 内存压力级别 0-1 */
  pressureLevel: number;
  /** 快照时间戳 */
  timestamp: number;
  /** 是否检测到内存泄漏迹象 */
  leakSuspicion: boolean;
}

/**
 * 时间序列指标类
 *
 * 管理具有自动保留、统计分析和高效存储的时间序列数据。
 * 提供百分位数计算、趋势分析和内存高效的数据管理。
 *
 * 功能特性：
 * - 基于时间和数量限制的自动数据保留
 * - 统计分析（最小值、最大值、平均值、百分位数）
 * - 内存高效的循环缓冲区实现
 * - 基于标签的维度分析
 * - 实时数据聚合
 *
 * @class TimeSeriesMetrics
 * @since 1.0.0
 */
export class TimeSeriesMetrics {
  /** 要保留的最大数据点数 */
  private maxPoints: number;

  /** 数据保留期（秒） */
  private retentionSeconds: number;

  /** 指标数据点数组 */
  private points: MetricDataPoint[];

  /**
   * 时间序列指标构造函数
   *
   * 使用指定的保留限制初始化时间序列。
   * 数据会根据时间和数量自动清理。
   *
   * @constructor
   * @param {number} [maxPoints=1000] - 要保留的最大数据点数
   * @param {number} [retentionSeconds=3600] - 数据保留期（秒）
   *
   * @example
   * // 创建具有1小时保留期、最多500个数据点的指标
   * const metrics = new TimeSeriesMetrics(500, 3600);
   */
  constructor(maxPoints: number = 1000, retentionSeconds: number = 3600) {
    this.maxPoints = maxPoints;
    this.retentionSeconds = retentionSeconds;
    this.points = [];
  }

  /**
   * 添加指标点
   *
   * 向时间序列添加新的数据点，自动清理过期数据。
   * 维护基于时间和计数的限制。
   *
   * @public
   * @param {number} value - 要记录的数值
   * @param {Record<string, string>} [tags] - 用于维度分析的可选标签
   *
   * @example
   * // 记录查询执行时间
   * metrics.addPoint(1.25, { query_type: 'SELECT', table: 'users' });
   *
   * @example
   * // 记录简单指标
   * metrics.addPoint(42);
   */
  public addPoint(value: number, tags?: Record<string, string>): void {
    const now = TimeUtils.nowInSeconds();

    // 根据保留策略清理过期数据点
    this.points = this.points.filter(point => (now - point.timestamp) <= this.retentionSeconds);

    // 添加新数据点
    this.points.push({
      timestamp: now,
      value: value,
      tags: tags
    });

    // 维持最大数据点限制（循环缓冲区行为）
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(-this.maxPoints);
    }
  }

  /**
   * 获取最近时间段的统计信息
   *
   * 计算指定时间窗口内数据点的综合统计信息。
   * 包括基本统计和百分位数计算。
   *
   * @public
   * @param {number} [sinceSeconds=300] - 时间窗口（秒）（默认：5分钟）
   * @returns {Record<string, number>} 最近数据的统计摘要
   *
   * @example
   * // 获取最近10分钟的统计信息
   * const stats = metrics.getStats(600);
   * console.log(`平均值: ${stats.avg}, P95: ${stats.p95}`);
   */
  public getStats(sinceSeconds: number = 300): Record<string, number> {
    const cutoff = TimeUtils.nowInSeconds() - sinceSeconds;
    const recentPoints = this.points.filter(p => p.timestamp >= cutoff).map(p => p.value);

    // 处理空数据集
    if (recentPoints.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        sum: 0
      };
    }

    // 计算基本统计信息
    const sum = recentPoints.reduce((a, b) => a + b, 0);
    const avg = sum / recentPoints.length;
    const min = Math.min(...recentPoints);
    const max = Math.max(...recentPoints);
    const p95 = this.percentile(recentPoints, 0.95);
    const p99 = this.percentile(recentPoints, 0.99);

    return {
      count: recentPoints.length,
      avg: avg,
      min: min,
      max: max,
      sum: sum,
      p95: p95,
      p99: p99
    };
  }

  /**
   * 计算百分位数
   *
   * 使用线性插值方法计算百分位数，提供更准确的百分位数估计。
   * 当需要的精确位置介于两个数据点之间时进行插值。
   *
   * @private
   * @param {number[]} values - 数值数组
   * @param {number} p - 要计算的百分位数（0.0 到 1.0）
   * @returns {number} 百分位数值
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = p * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sorted[lower];
    }
    
    // 线性插值
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * 导出为标准化的TimeSeriesMetric格式
   * 
   * @public
   * @param {string} name - 指标名称
   * @param {'sum' | 'average' | 'min' | 'max' | 'count'} aggregation - 聚合方式
   * @param {string} unit - 单位
   * @param {string} [description] - 描述
   * @returns {TimeSeriesMetric} 标准化格式的时间序列指标
   */
  public toTimeSeriesMetric(
    name: string, 
    aggregation: 'sum' | 'average' | 'min' | 'max' | 'count', 
    unit: string,
    description?: string
  ): TimeSeriesMetric {
    return {
      name,
      dataPoints: [...this.points], // 返回数据点的副本
      aggregation,
      unit,
      description
    };
  }
}

/**
 * 指标管理器
 *
 * 具有时间序列数据收集、告警和综合性能监控的高级指标管理系统。
 * 管理多种指标类型，具有自动系统监控和告警生成功能。
 *
 * 功能特性：
 * - 多维时间序列指标
 * - 可配置的告警系统，支持回调
 * - 自动系统资源监控
 * - 性能趋势分析
 * - 实时指标聚合
 * - 内存高效的数据保留
 * - 单例启动模式，避免重复初始化
 *
 * @class MetricsManager
 * @since 1.0.0
 */
export class MetricsManager {
  /** 查询执行时间指标 */
  public queryTimes: TimeSeriesMetrics;

  /** 错误发生指标 */
  public errorCounts: TimeSeriesMetrics;

  /** 缓存命中率指标 */
  public cacheHitRates: TimeSeriesMetrics;

  /** 系统资源利用率指标 */
  public systemMetrics: TimeSeriesMetrics;

  /** 告警回调函数数组 */
  private alertCallbacks: AlertCallback[] = [];

  /** 告警规则配置 */
  private alertRules: Record<string, Record<string, unknown>>;

  /** 优雅终止的关闭事件标志 */
  private shutdownEvent: boolean = false;

  /** 系统监控间隔计时器 */
  private metricsInterval: NodeJS.Timeout | null = null;

  /** 静态实例用于单例模式 */
  private static instance: MetricsManager | null = null;

  /** 是否已经启动监控 */
  private isMonitoringStarted: boolean = false;

  /**
   * 指标管理器构造函数
   *
   * 初始化所有指标收集器并设置默认告警规则。
   * 为不同指标类型创建时间序列实例。
   *
   * @constructor
   */
  constructor() {
    this.queryTimes = new TimeSeriesMetrics();
    this.errorCounts = new TimeSeriesMetrics();
    this.cacheHitRates = new TimeSeriesMetrics();
    this.systemMetrics = new TimeSeriesMetrics();
    this.alertRules = this.setupDefaultAlertRules();
  }

  /**
   * 获取单例实例
   * 确保整个应用只有一个 MetricsManager 实例
   */
  public static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  /**
   * 开始监控
   *
   * 开始定期自动收集系统指标。
   * 收集CPU、内存和其他系统指标用于性能分析。
   * 使用单例模式避免重复启动。
   *
   * @public
   */
  public startMonitoring(): void {
    if (this.isMonitoringStarted) {
      if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
        logger.warn('MetricsManager monitoring already started, skipping duplicate initialization');
      }
      return;
    }

    this.isMonitoringStarted = true;

    if (!this.metricsInterval) {
      this.metricsInterval = setInterval(async () => {
        try {
          await this.collectSystemMetrics();
        } catch (error) {
          logger.warn('System metrics collection failed:', undefined, { error: (error as Error).message });
        }
      }, 30000); // 每30秒收集一次
    }

    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      logger.warn('MetricsManager monitoring started');
    }
  }

  /**
  /**
   * 停止监控
   *
   * 停止自动系统指标收集并清理资源。
   * 应在应用程序关闭期间调用。
   *
   * @public
   */
  public stopMonitoring(): void {
    this.shutdownEvent = true;
    this.isMonitoringStarted = false;

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      logger.warn('MetricsManager monitoring stopped');
    }
  }

  /**
   * 强制销毁
   *
   * 强制停止所有异步操作，彻底清理资源。
   * 用于测试环境保证完全清理。
   *
   * @public
   */
  public forceDestroy(): void {
    this.shutdownEvent = true;
    this.isMonitoringStarted = false;

    if (this.metricsInterval) {
      try {
        clearInterval(this.metricsInterval);
        this.metricsInterval = null;
      } catch (error) {
        logger.warn("clearInterval:", undefined, { error: (error as Error).message })
      }
    }

    // 清除告警回调
    this.alertCallbacks.length = 0;

    // 清除所有指标数据
    this.queryTimes = new TimeSeriesMetrics();
    this.errorCounts = new TimeSeriesMetrics();
    this.cacheHitRates = new TimeSeriesMetrics();
    this.systemMetrics = new TimeSeriesMetrics();

    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'test') {
      logger.warn('MetricsManager forcibly destroyed');
    }
  }

  /**
   * 记录查询时间
   *
   * 记录查询执行时间，可选择查询类型标签。
   * 自动为慢查询触发告警。
   *
   * @public
   * @param {number} duration - 查询执行时间（秒）
   * @param {string} [queryType] - 用于分类的可选查询类型
   *
   * @example
   * manager.recordQueryTime(1.25, 'SELECT');
   */
  public recordQueryTime(duration: number, queryType?: string): void {
    const tags = queryType ? { query_type: queryType } : undefined;
    this.queryTimes.addPoint(duration, tags);

    // 自动慢查询检测和告警
    if (duration > 2.0) { // 慢查询阈值：2秒
      this.triggerAlert("slow_query", ErrorSeverity.MEDIUM, {
        message: `慢查询检测: ${duration.toFixed(3)}秒`,
        context: { duration: duration, query_type: queryType }
      });
    }
  }

  /**
   * 记录错误
   *
   * 记录错误发生情况，包含类型和严重性分类。
   * 自动为高严重性错误触发告警。
   *
   * @public
   * @param {string} errorType - 错误的类型/类别
   * @param {ErrorSeverity} [severity=ErrorSeverity.MEDIUM] - 错误严重性级别
   *
   * @example
   * manager.recordError('connection_timeout', ErrorSeverity.HIGH);
   */
  public recordError(errorType: string, severity: ErrorSeverity = ErrorSeverity.MEDIUM): void {
    const severityStr = severity;
    this.errorCounts.addPoint(1, { error_type: errorType, severity: severityStr });

    // 自动高严重性错误告警
    if (severity === ErrorSeverity.HIGH || severity === ErrorSeverity.CRITICAL) {
      this.triggerAlert("error_occurred", severity, {
        message: `${severity}严重性错误发生: ${errorType}`,
        context: { error_type: errorType, severity: severity }
      });
    }
  }

  /**
   * 记录缓存命中率
   *
   * 记录缓存性能指标，可选择缓存类型标签。
   * 自动为缓存性能差触发告警。
   *
   * @public
   * @param {number} hitRate - 缓存命中率（0.0 到 1.0）
   * @param {string} [cacheType] - 用于分类的可选缓存类型
   *
   * @example
   * manager.recordCacheHitRate(0.85, 'schema_cache');
   */
  public recordCacheHitRate(hitRate: number, cacheType?: string): void {
    const tags = cacheType ? { cache_type: cacheType } : undefined;
    this.cacheHitRates.addPoint(hitRate, tags);

    // 自动低缓存命中率告警
    if (hitRate < 0.6) { // 命中率阈值：60%
      this.triggerAlert("low_cache_hit_rate", ErrorSeverity.MEDIUM, {
        message: `缓存命中率过低: ${(hitRate * 100).toFixed(2)}%`,
        context: { hit_rate: hitRate, cache_type: cacheType }
      });
    }
  }

  /**
   * 收集系统指标
   *
   * 收集系统资源使用情况指标，如CPU使用率、内存、堆使用率等。
   * 在实际实现中会收集真实的系统指标。
   *
   * @private
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // 使用SystemMonitor收集真实的系统指标
      const resources = systemMonitor.getCurrentResources();

      // 记录CPU使用率指标
      try {
        const cpuLoad1min = os.loadavg()[0]; // 1分钟负载平均值
        const cpuLoad5min = os.loadavg()[1]; // 5分钟负载平均值
        const cpuLoad15min = os.loadavg()[2]; // 15分钟负载平均值
        const cpuCount = os.cpus().length;

        // 记录CPU负载指标
        this.systemMetrics.addPoint(cpuLoad1min, { metric_type: 'cpu_load_1m' });
        this.systemMetrics.addPoint(cpuLoad5min, { metric_type: 'cpu_load_5m' });
        this.systemMetrics.addPoint(cpuLoad15min, { metric_type: 'cpu_load_15m' });
        this.systemMetrics.addPoint(cpuCount, { metric_type: 'cpu_core_count' });

        // 自动高CPU负载告警
        const criticalThreshold = 10.0; // CPU负载超出核心数10倍时严重告警
        const warningThreshold = 5.0; // CPU负载超出核心数5倍时普通告警

        if (cpuLoad5min > criticalThreshold) {
          this.triggerAlert("high_cpu_load", ErrorSeverity.CRITICAL, {
            message: `CPU负载严重过高: ${cpuLoad5min.toFixed(2)} (5分钟平均)`,
            context: { cpu_load_5min: cpuLoad5min, cpu_load_1min: cpuLoad1min, cpu_core_count: cpuCount }
          });
        } else if (cpuLoad5min > warningThreshold) {
          this.triggerAlert("high_cpu_load", ErrorSeverity.HIGH, {
            message: `CPU负载过高: ${cpuLoad5min.toFixed(2)} (5分钟平均)`,
            context: { cpu_load_5min: cpuLoad5min, cpu_load_1min: cpuLoad1min, cpu_core_count: cpuCount }
          });
        }
      } catch (cpuError) {
        logger.warn('CPU metrics collection failed:', "SystemMonitor", { error: (cpuError as Error).message });
      }

      // 记录内存使用率指标
      const memoryUsagePercent = (resources.memoryUsage.rss / (1024 * 1024 * 1024)); // GB
      this.systemMetrics.addPoint(memoryUsagePercent, { metric_type: 'memory_usage' });

      // 记录堆内存使用率
      const heapUsagePercent = MemoryUtils.calculateMemoryUsagePercent(resources.memoryUsage.heapUsed, resources.memoryUsage.heapTotal);
      this.systemMetrics.addPoint(heapUsagePercent, { metric_type: 'heap_usage' });

      // 记录事件循环延迟（如果可用）
      if (resources.eventLoopDelay) {
        this.systemMetrics.addPoint(resources.eventLoopDelay, { metric_type: 'event_loop_delay' });
      }

      // 记录进程运行时间
      this.systemMetrics.addPoint(resources.uptime, { metric_type: 'uptime' });

    } catch (error) {
      // 不要让指标收集影响系统运行
      logger.warn('System metrics collection failed:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 设置默认告警规则
   *
   * 配置各种指标的默认告警阈值和窗口。
   *
   * @private
   * @returns {Record<string, Record<string, unknown>>} 告警规则配置
   */
  private setupDefaultAlertRules(): Record<string, Record<string, unknown>> {
    return {
      "Slow Query": { threshold: 2.0, window: 300, count: 5 },
      "High Error Rate": { threshold: 0.05, window: 300 },
      "Low Cache Hit Rate": { threshold: 0.6, window: 600 },
      "High CPU Load": { threshold: 5.0, window: 600 }, // CPU负载超出CPU核心数5倍时告警
      "Critical CPU Load": { threshold: 10.0, window: 300 } // CPU负载超出CPU核心数10倍时严重告警
    };
  }

  /**
   * 添加告警回调
   *
   * 注册告警触发时要调用的回调函数。
   *
   * @public
   * @param {AlertCallback} callback - 告警回调函数
   */
  public addAlertCallback(callback: AlertCallback): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * 触发告警
   *
   * 执行所有注册的告警回调函数。
   *
   * @private
   * @param {string} alertType - 告警类型
   * @param {ErrorSeverity} severity - 告警严重程度
   * @param {Partial<AlertEvent>} eventData - 告警事件数据
   */
  private triggerAlert(
    alertType: string, 
    severity: ErrorSeverity, 
    eventData: Partial<Pick<AlertEvent, 'message' | 'context'>>
  ): void {
    const alertEvent: AlertEvent = {
      type: alertType,
      severity,
      message: eventData.message || `Alert triggered: ${alertType}`,
      context: eventData.context || {},
      timestamp: new Date()
    };

    for (const callback of this.alertCallbacks) {
      try {
        callback(alertEvent);
      } catch (error) {
        // 不要让告警失败影响系统，但记录错误
        logger.warn(`Alert callback failed for ${alertType}:`, undefined, { error: (error as Error).message });
      }
    }
  }

  /**
   * 获取综合指标
   *
   * 返回所有指标类型的综合统计信息。
   *
   * @public
   * @returns {Record<string, unknown>} 综合指标数据
   */
  public getComprehensiveMetrics(): Record<string, unknown> {
    return {
      query_performance: this.queryTimes.getStats(),
      error_statistics: this.errorCounts.getStats(),
      cache_performance: this.cacheHitRates.getStats(),
      system_metrics: this.systemMetrics.getStats(),
      alert_rules: this.alertRules
    };
  }

  /**
   * 获取标准化性能统计
   * 
   * 返回符合PerformanceStats接口的标准化性能统计数据
   * 
   * @public
   * @returns {PerformanceStats} 标准化性能统计数据
   */
  public getPerformanceStats(): PerformanceStats {
    const queryStats = this.queryTimes.getStats();
    const errorStats = this.errorCounts.getStats();
    const cacheStats = this.cacheHitRates.getStats();
    
    return {
      queryTime: {
        avg: queryStats.avg,
        min: queryStats.min,
        max: queryStats.max,
        p95: queryStats.p95,
        p99: queryStats.p99
      },
      errorRate: errorStats.count > 0 ? errorStats.avg : 0,
      throughput: queryStats.count / (queryStats.count > 0 ? queryStats.avg : 1),
      cacheHitRate: cacheStats.avg,
      connectionPoolUtilization: 0 // This would need to be passed in or calculated elsewhere
    };
  }
}



/**
 * 性能指标类（兼容适配器）
 *
 * 为向后兼容性提供的适配器，将请求委托给统一的 MetricsManager。
 * 减少代码重复，统一指标管理。
 *
 * @class PerformanceMetrics
 * @since 1.0.0
 */
export class PerformanceMetrics {
  private metricsManager: MetricsManager;

  // 简单计数器用于基本统计
  public queryCount: number = 0;
  public totalQueryTime: number = 0.0;
  public slowQueryCount: number = 0;
  public errorCount: number = 0;
  public cacheHits: number = 0;
  public cacheMisses: number = 0;
  public connectionPoolHits: number = 0;
  public connectionPoolWaits: number = 0;

  constructor(metricsManager?: MetricsManager) {
    this.metricsManager = metricsManager || new MetricsManager();
  }

  /**
   * 获取平均查询时间
   * 优先使用 MetricsManager 的高级统计，回退到简单计算
   */
  public getAvgQueryTime(): number {
    try {
      const stats = this.metricsManager.queryTimes.getStats();
      return stats.avg || (this.totalQueryTime / Math.max(this.queryCount, 1));
    } catch {
      return this.totalQueryTime / Math.max(this.queryCount, 1);
    }
  }

  /**
   * 获取缓存命中率
   * 优先使用 MetricsManager 的高级统计
   */
  public getCacheHitRate(): number {
    try {
      const stats = this.metricsManager.cacheHitRates.getStats();
      return stats.avg || (this.cacheHits / Math.max(this.cacheHits + this.cacheMisses, 1));
    } catch {
      const total = this.cacheHits + this.cacheMisses;
      return this.cacheHits / Math.max(total, 1);
    }
  }

  /**
   * 获取错误率
   */
  public getErrorRate(): number {
    return this.errorCount / Math.max(this.queryCount, 1);
  }

  /**
   * 转换为对象
   * 合并传统指标和高级指标
   */
  public toObject(): Record<string, unknown> {
    const basicMetrics = {
      [StringConstants.FIELD_QUERY_COUNT]: this.queryCount,
      [StringConstants.FIELD_AVG_QUERY_TIME]: this.getAvgQueryTime(),
      [StringConstants.FIELD_SLOW_QUERY_COUNT]: this.slowQueryCount,
      [StringConstants.FIELD_ERROR_COUNT]: this.errorCount,
      [StringConstants.FIELD_ERROR_RATE]: this.getErrorRate(),
      [StringConstants.FIELD_CACHE_HIT_RATE]: this.getCacheHitRate(),
      [StringConstants.FIELD_CONNECTION_POOL_HITS]: this.connectionPoolHits,
      [StringConstants.FIELD_CONNECTION_POOL_WAITS]: this.connectionPoolWaits
    };

    try {
      // 添加高级指标
      const enhancedMetrics = this.metricsManager.getComprehensiveMetrics();
      return {
        ...basicMetrics,
        enhanced_metrics: enhancedMetrics
      };
    } catch {
      return basicMetrics;
    }
  }

  /**
   * 获取关联的 MetricsManager 实例
   */
  public getMetricsManager(): MetricsManager {
    return this.metricsManager;
  }
}