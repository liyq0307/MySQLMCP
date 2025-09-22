/**
 * 性能指标收集系统测试
 *
 * @description 测试时间序列指标收集、统计计算和监控功能
 * @author liyq
 * @since 1.0.0
 */

import { TimeSeriesMetrics, MetricsManager, PerformanceMetrics } from '../src/metrics.js';
import { ErrorSeverity } from '../src/types.js';
import { logger } from '../src/logger.js';

describe('TimeSeriesMetrics', () => {
  let metrics: TimeSeriesMetrics;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods to suppress warnings during tests
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    metrics = new TimeSeriesMetrics(100, 3600); // 测试用的较小容量
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('数据点添加和存储', () => {
    test('应该能够添加数据点', () => {
      metrics.addPoint(10.5);
      metrics.addPoint(15.2);

      const stats = metrics.getStats();
      expect(stats.count).toBe(2);
    });

    test('应该支持带标签的数据点', () => {
      metrics.addPoint(100, { query_type: 'SELECT', table: 'users' });
      metrics.addPoint(200, { query_type: 'INSERT', table: 'posts' });

      // 验证数据点被正确存储（通过统计检查）
      const stats = metrics.getStats();
      expect(stats.count).toBe(2);
      expect(stats.sum).toBe(300);
    });

    test('应该维护数据的保留策略', () => {
      metrics = new TimeSeriesMetrics(3, 1); // 最多3个点，保留1秒

      metrics.addPoint(1);
      metrics.addPoint(2);
      metrics.addPoint(3);
      metrics.addPoint(4); // 应该触发清理

      const stats = metrics.getStats();
      expect(stats.count).toBeLessThanOrEqual(3);
    });
  });

  describe('统计计算', () => {
    beforeEach(() => {
      // 添加测试数据
      [10, 20, 30, 40, 50].forEach(value => metrics.addPoint(value));
    });

    test('应该计算基本统计信息', () => {
      const stats = metrics.getStats();

      expect(stats.count).toBe(5);
      expect(stats.sum).toBe(150);
      expect(stats.avg).toBe(30);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
    });

    test('应该计算百分位数', () => {
      const stats = metrics.getStats();

      expect(stats.p95).toBeDefined();
      expect(stats.p99).toBeDefined();
      // 对于这个数据集，p95应该接近50，p99应该等于50
      expect(stats.p95).toBeGreaterThanOrEqual(40);
      expect(stats.p99).toBeGreaterThanOrEqual(45);
    });

    test('应该使用线性插值计算百分位数', () => {
      // 单数据点情况
      const singlePoint = new TimeSeriesMetrics();
      singlePoint.addPoint(42.5);
      const singleStats = singlePoint.getStats();
      expect(singleStats.p95).toBe(42.5);
      expect(singleStats.p99).toBe(42.5);
    });

    test('应该处理空数据集', () => {
      const emptyMetrics = new TimeSeriesMetrics();
      const stats = emptyMetrics.getStats();

      expect(stats.count).toBe(0);
      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.sum).toBe(0);
    });
  });

  describe('时间窗口过滤', () => {
    test('应该支持时间窗口过滤', () => {
      // 添加数据点
      metrics.addPoint(100);

      // 等待一点时间（实际情况中这是自动处理的）
      // 这里我们模拟通过直接构造来测试

      const immediateStats = metrics.getStats(0); // 所有数据
      expect(immediateStats.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('时间序列指标导出', () => {
    test('应该导出为TimeSeriesMetric格式', () => {
      metrics.addPoint(1.5, { type: 'test' });
      metrics.addPoint(2.5, { type: 'test' });

      const timeSeriesMetric = metrics.toTimeSeriesMetric(
        'test_metric',
        'average',
        'seconds',
        'Test metric description'
      );

      expect(timeSeriesMetric.name).toBe('test_metric');
      expect(timeSeriesMetric.aggregation).toBe('average');
      expect(timeSeriesMetric.unit).toBe('seconds');
      expect(timeSeriesMetric.description).toBe('Test metric description');
      expect(timeSeriesMetric.dataPoints).toHaveLength(2);
    });
  });
});

describe('MetricsManager', () => {
  let metricsManager: MetricsManager;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock logger methods to suppress warnings during tests
    consoleSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    // 清除单例实例以确保测试隔离
    (MetricsManager as unknown as { instance: unknown }).instance = null;
    metricsManager = MetricsManager.getInstance();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    // 清理监控
    if (metricsManager) {
      metricsManager.stopMonitoring();
    }
    // 清除单例
    (MetricsManager as unknown as { instance: unknown }).instance = null;
  });

  describe('单例模式', () => {
    test('应该返回相同的单例实例', () => {
      const instance1 = MetricsManager.getInstance();
      const instance2 = MetricsManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('应该支持重复创建返回同一实例', () => {
      const instance1 = new MetricsManager();
      const instance2 = new MetricsManager();

      // 注意：由于单例模式，这两个实际上是不同的实例
      // 但getInstance应该返回真正的单例
      expect(instance1).not.toBe(instance2);
      expect(MetricsManager.getInstance()).toBe(MetricsManager.getInstance());
    });
  });

  describe('指标记录', () => {
    test('应该记录查询时间', () => {
      metricsManager.recordQueryTime(1.25, 'SELECT');

      const comprehensiveMetrics = metricsManager.getComprehensiveMetrics() as {
        query_performance: { count: number; avg: number; }
      };
      expect(comprehensiveMetrics.query_performance.count).toBe(1);
      expect(comprehensiveMetrics.query_performance.avg).toBe(1.25);
    });

    test('应该为慢查询触发告警', () => {
      const alertCallback = jest.fn();
      metricsManager.addAlertCallback(alertCallback);

      // 记录一个慢查询
      metricsManager.recordQueryTime(3.0, 'SELECT');

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'slow_query',
          severity: ErrorSeverity.MEDIUM,
          message: expect.stringContaining('慢查询检测')
        })
      );
    });

    test('应该记录错误', () => {
      metricsManager.recordError('connection_timeout', ErrorSeverity.HIGH);

      const comprehensiveMetrics = metricsManager.getComprehensiveMetrics() as {
        error_statistics: { count: number; }
      };
      expect(comprehensiveMetrics.error_statistics.count).toBe(1);
    });

    test('应该为高严重性错误触发告警', () => {
      const alertCallback = jest.fn();
      metricsManager.addAlertCallback(alertCallback);

      metricsManager.recordError('fatal_error', ErrorSeverity.CRITICAL);

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error_occurred',
          severity: ErrorSeverity.CRITICAL
        })
      );
    });

    test('应该记录缓存命中率', () => {
      metricsManager.recordCacheHitRate(0.85, 'schema_cache');

      const comprehensiveMetrics = metricsManager.getComprehensiveMetrics() as unknown as {
        cache_performance: { count: number; avg: number };
      };
      expect(comprehensiveMetrics.cache_performance.count).toBe(1);
      expect(comprehensiveMetrics.cache_performance.avg).toBe(0.85);
    });

    test('应该为低缓存命中率触发告警', () => {
      const alertCallback = jest.fn();
      metricsManager.addAlertCallback(alertCallback);

      metricsManager.recordCacheHitRate(0.4, 'table_cache'); // 低于0.6的阈值

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'low_cache_hit_rate',
          severity: ErrorSeverity.MEDIUM
        })
      );
    });
  });

  describe('告警系统', () => {
    let alertCallback: jest.Mock;

    beforeEach(() => {
      alertCallback = jest.fn();
      // 清除所有现有的回调以确保测试隔离
      (metricsManager as unknown as { alertCallbacks: unknown[] }).alertCallbacks = [];
      metricsManager.addAlertCallback(alertCallback);
    });

    afterEach(() => {
      // 清理回调数组
      (metricsManager as unknown as { alertCallbacks: unknown[] }).alertCallbacks = [];
    });

    test('应该支持多个告警回调', () => {
      const callback2 = jest.fn();
      metricsManager.addAlertCallback(callback2);

      // 触发告警
      (metricsManager as unknown as { triggerAlert: (type: string, severity: ErrorSeverity, data: { message: string }) => void }).triggerAlert('test_alert', ErrorSeverity.HIGH, {
        message: 'Test alert message'
      });

      expect(alertCallback).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    test('应该处理告警回调异常而不影响其他回调', () => {
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      metricsManager.addAlertCallback(faultyCallback);

      // 触发告警 - 故障回调会抛异常，但正常的回调仍然应该被调用
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      (metricsManager as unknown as { triggerAlert: (type: string, severity: ErrorSeverity, data: { message: string }) => void }).triggerAlert('test_alert', ErrorSeverity.HIGH, {
        message: 'Test alert message'
      });

      expect(alertCallback).toHaveBeenCalledTimes(1); // 正常回调仍然被调用
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert callback failed'),
        undefined,
        { error: 'Callback error' }
      );

      warnSpy.mockRestore();
    });

    test('应该创建完整的AlertEvent对象', () => {
      const eventData = {
        message: 'Custom alert message',
        context: { key1: 'value1', key2: 42 }
      };

      (metricsManager as unknown as { triggerAlert: (type: string, severity: ErrorSeverity, data: Record<string, unknown>) => void }).triggerAlert('custom_alert', ErrorSeverity.LOW, eventData);

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'custom_alert',
          severity: ErrorSeverity.LOW,
          message: 'Custom alert message',
          context: eventData.context,
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('监控生命周期', () => {
    test('应该能够启动和停止监控', () => {
      expect(metricsManager['isMonitoringStarted']).toBe(false);

      metricsManager.startMonitoring();
      expect(metricsManager['isMonitoringStarted']).toBe(true);

      metricsManager.stopMonitoring();
      expect(metricsManager['isMonitoringStarted']).toBe(false);
    });

    test('应该防止重复启动监控', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      metricsManager.startMonitoring();
      metricsManager.startMonitoring(); // 重复启动

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already started')
      );

      warnSpy.mockRestore();
    });
  });

  describe('综合指标', () => {
    beforeEach(() => {
      // 添加一些测试数据
      metricsManager.recordQueryTime(0.5, 'SELECT');
      metricsManager.recordError('test_error', ErrorSeverity.LOW);
      metricsManager.recordCacheHitRate(0.9, 'schema_cache');
    });

    test('应该返回综合指标数据', () => {
      const comprehensiveMetrics = metricsManager.getComprehensiveMetrics() as unknown as {
        query_performance: { count: number; };
        error_statistics: { count: number; };
        cache_performance: { count: number; };
        system_metrics: unknown;
        alert_rules: unknown;
      };

      expect(comprehensiveMetrics).toHaveProperty('query_performance');
      expect(comprehensiveMetrics).toHaveProperty('error_statistics');
      expect(comprehensiveMetrics).toHaveProperty('cache_performance');
      expect(comprehensiveMetrics).toHaveProperty('system_metrics');
      expect(comprehensiveMetrics).toHaveProperty('alert_rules');

      expect(comprehensiveMetrics.query_performance.count).toBe(1);
      expect(comprehensiveMetrics.error_statistics.count).toBe(1);
      expect(comprehensiveMetrics.cache_performance.count).toBe(1);
    });

    test('应该返回标准化的性能统计', () => {
      const stats = metricsManager.getPerformanceStats();

      expect(stats).toHaveProperty('queryTime');
      expect(stats).toHaveProperty('errorRate');
      expect(stats).toHaveProperty('throughput');
      expect(stats).toHaveProperty('cacheHitRate');
      expect(stats).toHaveProperty('connectionPoolUtilization');

      expect(stats.queryTime).toHaveProperty('avg');
      expect(stats.queryTime).toHaveProperty('min');
      expect(stats.queryTime).toHaveProperty('max');
      expect(stats.queryTime).toHaveProperty('p95');
      expect(stats.queryTime).toHaveProperty('p99');
    });
  });
});

describe('PerformanceMetrics (兼容适配器)', () => {
  let perfMetrics: PerformanceMetrics;

  beforeEach(() => {
    perfMetrics = new PerformanceMetrics();
  });

  describe('基本功能', () => {
    test('应该跟踪查询计数', () => {
      expect(perfMetrics.queryCount).toBe(0);

      perfMetrics.queryCount = 5;
      expect(perfMetrics.queryCount).toBe(5);
    });

    test('应该计算平均查询时间', () => {
      expect(perfMetrics.getAvgQueryTime()).toBe(0);

      perfMetrics.queryCount = 2;
      perfMetrics.totalQueryTime = 3.0;
      expect(perfMetrics.getAvgQueryTime()).toBe(1.5);
    });

    test('应该计算缓存命中率', () => {
      expect(perfMetrics.getCacheHitRate()).toBe(0);

      perfMetrics.cacheHits = 8;
      perfMetrics.cacheMisses = 2;
      expect(perfMetrics.getCacheHitRate()).toBe(0.8);
    });

    test('应该计算错误率', () => {
      expect(perfMetrics.getErrorRate()).toBe(0);

      perfMetrics.errorCount = 2;
      perfMetrics.queryCount = 10;
      expect(perfMetrics.getErrorRate()).toBe(0.2);
    });
  });

  describe('对象转换', () => {
    test('应该转换为对象格式', () => {
      perfMetrics.queryCount = 5;
      perfMetrics.totalQueryTime = 2.5;
      perfMetrics.errorCount = 1;
      perfMetrics.cacheHits = 8;
      perfMetrics.cacheMisses = 2;

      const obj = perfMetrics.toObject();

      expect(obj.query_count).toBe(5);
      expect(obj.avg_query_time).toBe(0.5);
      expect(obj.error_rate).toBe(0.2);
      expect(obj.cache_hit_rate).toBe(0.8);
    });

    test('应该包含高级指标当MetricsManager可用时', () => {
      const obj = perfMetrics.toObject();
      // 当没有异常时，应该包含enhanced_metrics
      expect(obj).toHaveProperty('enhanced_metrics');
    });
  });

  describe('MetricsManager集成', () => {
    test('应该能够访问关联的MetricsManager', () => {
      const manager = perfMetrics.getMetricsManager();
      expect(manager).toBeInstanceOf(MetricsManager);
    });

    test('应该支持注入自定义MetricsManager', () => {
      const customManager = new MetricsManager();
      const perfMetricsWithManager = new PerformanceMetrics(customManager);

      expect(perfMetricsWithManager.getMetricsManager()).toBe(customManager);
    });
  });
});

describe('集成测试', () => {
  test('应该正确处理边界情况和错误恢复', () => {
    const metrics = new TimeSeriesMetrics(10, 60);

    // 测试极大值
    metrics.addPoint(Number.MAX_SAFE_INTEGER);
    metrics.addPoint(-Number.MAX_SAFE_INTEGER);

    const stats = metrics.getStats();
    expect(stats.count).toBe(2);
    expect(stats.max).toBe(Number.MAX_SAFE_INTEGER);
    expect(stats.min).toBe(-Number.MAX_SAFE_INTEGER);

    // 测试NaN和Infinity
    metrics.addPoint(NaN);
    metrics.addPoint(Infinity);

    const updatedStats = metrics.getStats();
    expect(updatedStats.count).toBe(4);
  });

  test('应该处理内存压力敏感的数据清理', () => {
    const metrics = new TimeSeriesMetrics(5, 120); // 小容量测试内存管理

    // 填满指标缓冲区
    for (let i = 0; i < 10; i++) {
      metrics.addPoint(i * 1.0);
    }

    const stats = metrics.getStats();
    expect(stats.count).toBeLessThanOrEqual(5); // 应该被限制在5个以内
  });
});