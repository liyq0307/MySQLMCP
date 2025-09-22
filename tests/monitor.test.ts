/**
 * 系统监控系统测试
 *
 * @description 测试内存监控器和系统监控器的核心功能，包括内存占用、性能监控和告警系统
 * @author liyq
 * @since 1.0.0
 */

import { MemoryMonitor, SystemMonitor } from '../src/monitor.js';
import { ErrorSeverity } from '../src/types.js';
import { TimeUtils } from '../src/utils/common.js';
import { logger } from '../src/logger.js';

describe('MemoryMonitor', () => {
  let memoryMonitor: MemoryMonitor;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock logger methods to suppress warnings during tests
    consoleSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    // 清理之前的监控状态
    memoryMonitor = new MemoryMonitor({
      monitoringInterval: 5000, // 更快的测试间隔
      historySize: 10
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (memoryMonitor) {
      memoryMonitor.stopMonitoring();
    }
  });

  describe('内存快照采集', () => {
    test('应该能够正确采集内存快照', () => {
      const snapshot = memoryMonitor.getCurrentSnapshot();

      expect(snapshot).toHaveProperty('usage');
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('pressureLevel');
      expect(snapshot).toHaveProperty('leakSuspicion');

      expect(snapshot.usage).toHaveProperty('heapUsed');
      expect(snapshot.usage).toHaveProperty('heapTotal');
      expect(snapshot.usage).toHaveProperty('rss');

      expect(snapshot.pressureLevel).toBeGreaterThanOrEqual(0);
      expect(snapshot.pressureLevel).toBeLessThanOrEqual(1);
    });

    test('应该正确计算内存压力级别', () => {
      const snapshot = memoryMonitor.getCurrentSnapshot();

      // 压力级别应该基于堆使用率和总内存使用计算
      expect(snapshot.pressureLevel).toBeGreaterThanOrEqual(0);
      expect(snapshot.pressureLevel).toBeLessThanOrEqual(1);
    });
  });

  describe('内存历史记录', () => {
    test('应该维护内存历史记录', () => {
      memoryMonitor.getCurrentSnapshot();
      memoryMonitor.getCurrentSnapshot();

      const history = memoryMonitor.getMemoryHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    test('应该限制历史记录大小', () => {
      // 创建一个小的历史记录限制
      const smallMonitor = new MemoryMonitor({
        historySize: 2,
        monitoringInterval: 100
      });

      // 添加3个快照，应该只保留最新的2个
      smallMonitor['takeSnapshot']();
      smallMonitor['takeSnapshot']();
      smallMonitor['takeSnapshot']();

      const history = smallMonitor.getMemoryHistory();
      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe('内存统计计算', () => {
    test('应该计算正确的内存统计信息', () => {
      // 获取一些快照以建立历史记录
      for (let i = 0; i < 3; i++) {
        memoryMonitor.getCurrentSnapshot();
      }

      const stats = memoryMonitor.getMemoryStats();

      expect(stats).toHaveProperty('current');
      expect(stats).toHaveProperty('peak');
      expect(stats).toHaveProperty('average');
      expect(stats).toHaveProperty('trend');
      expect(stats).toHaveProperty('leakSuspicions');
    });

    test('空历史记录时的统计处理', () => {
      const emptyMonitor = new MemoryMonitor();
      const stats = emptyMonitor.getMemoryStats();

      expect(stats.current).toBeDefined();
      expect(stats.peak.heapUsed).toBeGreaterThan(0);
      expect(stats.average.heapUsed).toBeGreaterThan(0);
      expect(stats.trend).toBe('stable');
      expect(stats.leakSuspicions).toBe(0);
    });
  });

  describe('监控生命周期', () => {
    test('应该能够启动和停止监控', () => {
      expect(memoryMonitor['isMonitoring']).toBe(false);

      memoryMonitor.startMonitoring();
      expect(memoryMonitor['isMonitoring']).toBe(true);

      memoryMonitor.stopMonitoring();
      expect(memoryMonitor['isMonitoring']).toBe(false);
    });

    test('应该防止重复启动监控', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug'; // 设置为debug模式以显示警告

      memoryMonitor.startMonitoring();
      memoryMonitor.startMonitoring(); // 重复启动

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );

      process.env.LOG_LEVEL = originalLogLevel; // 恢复原始值
      warnSpy.mockRestore();
    });
  });

  describe('内存泄漏检测', () => {
    test('新实例不应检测到泄漏', () => {
      const snapshot = memoryMonitor.getCurrentSnapshot();
      expect(snapshot.leakSuspicion).toBe(false);
    });

    test('应该检查内存增长趋势', () => {
      // 这个测试需要更多历史数据来可靠地检测趋势
      expect(() => {
        for (let i = 0; i < 15; i++) {
          memoryMonitor.getCurrentSnapshot();
        }
      }).not.toThrow();
    });
  });

  describe('GC统计', () => {
    test('应该跟踪GC统计信息', () => {
      const initialStats = memoryMonitor.getGCStats();

      expect(initialStats).toHaveProperty('triggered');
      expect(initialStats).toHaveProperty('lastGC');
      expect(initialStats).toHaveProperty('memoryFreed');

      expect(initialStats.triggered).toBeGreaterThanOrEqual(0);
    });
  });

  describe('告警回调系统', () => {
    let alertCallback: jest.Mock;

    beforeEach(() => {
      alertCallback = jest.fn();
      memoryMonitor.addAlertCallback(alertCallback);
    });

    test('应该能够添加和移除告警回调', () => {
      expect(memoryMonitor['alertCallbacks']).toContain(alertCallback);

      memoryMonitor.removeAlertCallback(alertCallback);
      expect(memoryMonitor['alertCallbacks']).not.toContain(alertCallback);
    });

    test('应该为高内存压力触发告警', () => {
      // 模拟高内存压力
      const highMemoryUsage: NodeJS.MemoryUsage = {
        heapUsed: 900 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024,
        rss: 1024 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      };

      const highPressureSnapshot = {
        usage: highMemoryUsage,
        timestamp: TimeUtils.now(),
        pressureLevel: 0.95,
        leakSuspicion: false
      };

      memoryMonitor['handleMemoryPressure'](highPressureSnapshot);

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'high_memory_pressure',
          severity: expect.any(String),
          message: expect.stringContaining('内存压力过高')
        })
      );
      const callArgs = alertCallback.mock.calls[0][0];
      expect([ErrorSeverity.CRITICAL, ErrorSeverity.HIGH]).toContain(callArgs.severity);
    });

    test('应该为内存泄漏怀疑触发告警', () => {
      const leakMemoryUsage: NodeJS.MemoryUsage = {
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      };

      const leakSnapshot = {
        usage: leakMemoryUsage,
        timestamp: TimeUtils.now(),
        pressureLevel: 0.5,
        leakSuspicion: true
      };

      memoryMonitor['handleLeakSuspicion'](leakSnapshot);

      expect(alertCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory_leak_suspicion',
          severity: ErrorSeverity.HIGH,
          message: expect.stringContaining('内存泄漏模式')
        })
      );
    });

    test('告警回调错误不应影响系统运行', () => {
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      memoryMonitor.addAlertCallback(faultyCallback);
      memoryMonitor.addAlertCallback(alertCallback);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // 触发告警 - 一个回调会失败，但正常的回调仍然会被调用
      const highMemoryUsage: NodeJS.MemoryUsage = {
        heapUsed: 999 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024,
        rss: 1024 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      };

      const _highPressureSnapshot = {
        usage: highMemoryUsage,
        timestamp: TimeUtils.now(),
        pressureLevel: 0.99,
        leakSuspicion: false
      };

      memoryMonitor['triggerAlert']({
        type: 'test_alert',
        severity: ErrorSeverity.HIGH,
        message: 'Test alert message',
        context: {},
        timestamp: new Date()
      });

      warnSpy.mockRestore();
    });
  });

  describe('环境变量配置', () => {
    test('应该从环境变量加载配置', () => {
      // 设置测试环境变量
      process.env.MEMORY_AUTO_GC = 'false';
      process.env.MEMORY_PRESSURE_THRESHOLD = '0.7';
      process.env.MEMORY_CACHE_CLEAR_THRESHOLD = '0.8';
      process.env.MEMORY_MONITORING_INTERVAL = '15000';
      process.env.MEMORY_HISTORY_SIZE = '50';

      const configMonitor = new MemoryMonitor();

      expect(configMonitor['options'].autoGC).toBe(false);
      expect(configMonitor['options'].pressureThreshold).toBe(0.7);
      expect(configMonitor['options'].cacheClearThreshold).toBe(0.8);
      expect(configMonitor['options'].monitoringInterval).toBe(15000);
      expect(configMonitor['options'].historySize).toBe(50);

      // 清理环境变量
      delete process.env.MEMORY_AUTO_GC;
      delete process.env.MEMORY_PRESSURE_THRESHOLD;
      delete process.env.MEMORY_CACHE_CLEAR_THRESHOLD;
      delete process.env.MEMORY_MONITORING_INTERVAL;
      delete process.env.MEMORY_HISTORY_SIZE;
    });
  });
});

describe('SystemMonitor', () => {
  let systemMonitor: SystemMonitor;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock logger methods to suppress warnings during tests
    consoleSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    systemMonitor = new SystemMonitor();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    if (systemMonitor) {
      systemMonitor.stopMonitoring();
    }
  });

  describe('系统资源收集', () => {
    test('应该能收集当前系统资源', () => {
      const resources = systemMonitor.getCurrentResources();

      expect(resources).toHaveProperty('memory');
      expect(resources).toHaveProperty('cpu');
      expect(resources).toHaveProperty('eventLoop');
      expect(resources).toHaveProperty('gc');
      expect(resources).toHaveProperty('uptime');
      expect(resources).toHaveProperty('timestamp');
    });

    test('应该提供向后兼容的内存使用属性', () => {
      const resources = systemMonitor.getCurrentResources();

      expect(resources.memoryUsage).toBeDefined();
      expect(resources.eventLoopDelay).toBeDefined();
      expect(typeof resources.eventLoopDelay).toBe('number');
    });

    test('内存使用应该有正确的数据类型和值', () => {
      const resources = systemMonitor.getCurrentResources();

      expect(resources.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(resources.memory.percentage).toBeLessThanOrEqual(100);
      expect(resources.memory.used).toBeGreaterThan(0);
      expect(resources.memory.total).toBeGreaterThan(0);
    });
  });

  describe('监控生命周期管理', () => {
    test('应该能够启动和停止监控', () => {
      expect(systemMonitor['isMonitoring']).toBe(false);

      systemMonitor.startMonitoring(10000); // 10秒间隔
      expect(systemMonitor['isMonitoring']).toBe(true);

      systemMonitor.stopMonitoring();
      expect(systemMonitor['isMonitoring']).toBe(false);
    });

    test('应该防止重复启动监控', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug'; // 设置为debug模式以显示警告

      systemMonitor.startMonitoring();
      systemMonitor.startMonitoring(); // 重复启动

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already running')
      );

      process.env.LOG_LEVEL = originalLogLevel; // 恢复原始值
      warnSpy.mockRestore();
    });
  });

  describe('告警系统', () => {
    let alertCallback: jest.Mock;

    beforeEach(() => {
      alertCallback = jest.fn();
      systemMonitor.addAlertCallback(alertCallback);
    });

    test('应该能够添加和移除告警回调', () => {
      expect(systemMonitor['alertCallbacks']).toContain(alertCallback);

      systemMonitor.removeAlertCallback(alertCallback);
      expect(systemMonitor['alertCallbacks']).not.toContain(alertCallback);
    });
  });

  describe('资源历史记录', () => {
    test('应该维护资源历史记录', () => {
      systemMonitor['collectSystemResources']();
      systemMonitor['collectSystemResources']();

      const history = systemMonitor.getResourceHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    test('应该限制历史记录大小', () => {
      systemMonitor['maxHistorySize'] = 3;

      // 生成4个记录
      for (let i = 0; i < 4; i++) {
        systemMonitor['collectSystemResources']();
      }

      expect(systemMonitor.getResourceHistory().length).toBeLessThanOrEqual(3);
    });
  });

  describe('资源统计', () => {
    test('应该计算资源统计信息', () => {
      // 生成一些资源数据
      for (let i = 0; i < 3; i++) {
        systemMonitor['collectSystemResources']();
      }

      const stats = systemMonitor.getResourceStatistics();

      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('heap');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('samples');

      expect(stats.samples).toBeGreaterThanOrEqual(3);
    });

    test('空历史记录时的统计处理', () => {
      const emptyMonitor = new SystemMonitor();
      const stats = emptyMonitor.getResourceStatistics();

      expect(stats.memory.avg).toBe(0);
      expect(stats.memory.max).toBe(0);
      expect(stats.memory.min).toBe(0);
      expect(stats.heap.avgUsage).toBe(0);
      expect(stats.heap.maxUsage).toBe(0);
      expect(stats.samples).toBe(0);
    });
  });

  describe('系统健康检查', () => {
    test('应该评估系统健康状态', () => {
      const health = systemMonitor.getSystemHealth();

      expect(health.status).toMatch(/healthy|warning|critical/);
      expect(Array.isArray(health.issues)).toBe(true);
      expect(Array.isArray(health.recommendations)).toBe(true);
      expect(health.memoryOptimization).toBeDefined();
    });

    test('健康检查应返回合理的推荐信息', () => {
      const health = systemMonitor.getSystemHealth();

      if (health.issues.length > 0) {
        expect(health.recommendations.length).toBeGreaterThan(0);
      }
    });
  });

  describe('性能指标监控', () => {
    test('应该初始化性能观测器', () => {
      // 创建新的监控器实例来测试初始化
      const testMonitor = new SystemMonitor();
      expect(testMonitor['performanceObserver']).toBeDefined();
    });

    test('应该支持性能标记和测量', () => {
      systemMonitor.mark('test_start');
      systemMonitor.mark('test_end');
      systemMonitor.measure('test_operation', 'test_start', 'test_end');

      // 验证性能观测器是否被正确初始化
      expect(systemMonitor['performanceObserver']).toBeDefined();
    });
  });

  describe('配置管理', () => {
    test('应该能够更新告警阈值', () => {
      const originalThresholds = { ...systemMonitor['thresholds'] };

      systemMonitor.updateThresholds({
        memoryUsagePercent: 90,
        eventLoopDelay: 200
      });

      expect(systemMonitor['thresholds'].memoryUsagePercent).toBe(90);
      expect(systemMonitor['thresholds'].eventLoopDelay).toBe(200);

      // 其他阈值应该保持不变
      expect(systemMonitor['thresholds'].heapUsagePercent).toBe(originalThresholds.heapUsagePercent);
    });
  });

  describe('边界情况测试', () => {
    test('应该处理没有性能观察器权限的情况', () => {
      // 这个测试主要验证错误处理
      expect(() => {
        systemMonitor.mark('test');
        systemMonitor.measure('test', 'test');
      }).not.toThrow();
    });

    test('应该正确处理内存信息转换', () => {
      const resources = systemMonitor.getCurrentResources();

      // 验证内存使用计算的合理性
      const actualMB = resources.memoryUsage.used / (1024 * 1024);
      expect(actualMB).toBeGreaterThan(0);

      const percentageCalc = (resources.memoryUsage.used / resources.memoryUsage.total) * 100;
      expect(percentageCalc).toBeGreaterThanOrEqual(0);
      expect(percentageCalc).toBeLessThanOrEqual(100);
    });
  });
});

describe('集成测试', () => {
  describe('MemoryMonitor 和 SystemMonitor 协同工作', () => {
    test('两个监控器应该能够同时运行', () => {
      const memMonitor = new MemoryMonitor();
      const sysMonitor = new SystemMonitor();

      memMonitor.startMonitoring();
      sysMonitor.startMonitoring();

      expect(memMonitor['isMonitoring']).toBe(true);
      expect(sysMonitor['isMonitoring']).toBe(true);

      // 清理
      memMonitor.stopMonitoring();
      sysMonitor.stopMonitoring();
    });
  });

  describe('环境变量和系统性能', () => {
    test('应该处理无效的环境变量配置', () => {
      // 设置无效的环境变量
      process.env.MEMORY_MONITORING_INTERVAL = 'invalid';
      process.env.MEMORY_HISTORY_SIZE = 'not_a_number';

      // 不应该抛出错误
      expect(() => {
        new MemoryMonitor();
      }).not.toThrow();

      // 清理
      delete process.env.MEMORY_MONITORING_INTERVAL;
      delete process.env.MEMORY_HISTORY_SIZE;
    });

    test('监控系统应该能够在低内存环境下稳定运行', () => {
      const monitor = new MemoryMonitor();

      // 模拟多次监控周期
      for (let i = 0; i < 5; i++) {
        monitor.getCurrentSnapshot();
      }

      expect(() => {
        const stats = monitor.getMemoryStats();
        return stats;
      }).not.toThrow();
    });
  });

  describe('错误恢复和容错性', () => {
    test('应该在GC不可用时降级处理', () => {
      const monitor = new MemoryMonitor();

      // 不应该抛出错误，即使GC不可用
      expect(() => {
        return monitor.optimizeMemory();
      }).not.toThrow();
    });

    test('监控失败不应影响主应用流程', async () => {
      const monitor = new MemoryMonitor();

      // 创建Mock spy
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      // 保存原始方法
      const originalTakeSnapshot = monitor['takeSnapshot'];
      const originalHandleMemoryPressure = monitor['handleMemoryPressure'];
      const originalHandleLeakSuspicion = monitor['handleLeakSuspicion'];

      // Mock takeSnapshot 方法抛出错误
      monitor['takeSnapshot'] = jest.fn().mockImplementation(() => {
        throw new Error('测试快照获取错误');
      });

      // 通过监控间隔方法间接调用，这样的错误应该被catch块处理
      // 不直接调用Mock方法，而是调用包含try-catch的performMonitoringCycle方法
      monitor['performMonitoringCycle']();

      // 验证logger.warn被调用了，表示错误被正确捕获
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'Memory monitoring cycle failed:',
        undefined,
        { error: '测试快照获取错误' }
      );

      // 恢复原始方法以避免影响其他测试
      monitor['takeSnapshot'] = originalTakeSnapshot;
      monitor['handleMemoryPressure'] = originalHandleMemoryPressure;
      monitor['handleLeakSuspicion'] = originalHandleLeakSuspicion;

      // 恢复logger.warn
      warnSpy.mockRestore();
    });
  });
});