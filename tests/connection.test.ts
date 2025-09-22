/**
 * 连接池测试
 *
 * @description 测试连接池的初始化和基本功能、连接的获取和释放、
 *              错误处理和恢复机制、健康检查和定时任务、高级恢复机制
 * @author liyq
 * @since 1.0.0
 */

import { ConnectionPool } from '../src/connection.js';
import { DatabaseConfig } from '../src/config.js';
import { logger } from '../src/logger.js';

// 模拟 mysql2
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(),
  default: {
    createPool: jest.fn()
  }
}));

// 模拟 logger 方法来捕获日志输出
const mockConsoleError = jest.spyOn(logger, 'error').mockImplementation(() => {});
const mockConsoleWarn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

describe('ConnectionPool', () => {
  let connectionPool: ConnectionPool;
  let mockConfig: DatabaseConfig;

  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();

    mockConfig = {
      host: 'localhost',
      port: 3306,
      user: 'test_user',
      password: 'test_password',
      database: 'test_db',
      connectionLimit: 10,
      minConnections: 2,
      connectTimeout: 60,
      idleTimeout: 60,
      sslEnabled: false
    };

    // 设置基础模拟 - 连接池返回带有 ping 方法的连接对象
    const mockConnection = {
      ping: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn(),
      release: jest.fn()
    };

    const mockPool = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      on: jest.fn(),
      end: jest.fn()
    };

    const { createPool } = jest.requireMock('mysql2/promise') as { createPool: jest.Mock };
    createPool.mockReturnValue(mockPool);

    connectionPool = new ConnectionPool(mockConfig);
  });

  afterEach(async () => {
    jest.clearAllMocks();

    // 确保在每次测试后清理连接池和定时器
    try {
      if (connectionPool) {
        // 停止所有定时器
        if (connectionPool) {
          const pool = connectionPool as unknown as {
            healthCheckInterval?: NodeJS.Timeout;
            leakDetectionInterval?: NodeJS.Timeout;
            statsSaveInterval?: NodeJS.Timeout;
          };
          if (pool.healthCheckInterval) {
            clearInterval(pool.healthCheckInterval);
            pool.healthCheckInterval = null as unknown as NodeJS.Timeout;
          }
          if (pool.leakDetectionInterval) {
            clearInterval(pool.leakDetectionInterval);
            pool.leakDetectionInterval = null as unknown as NodeJS.Timeout;
          }
          if (pool.statsSaveInterval) {
            clearInterval(pool.statsSaveInterval);
            pool.statsSaveInterval = null as unknown as NodeJS.Timeout;
          }
        }

        // 强制关闭连接池
        await connectionPool.close();
      }
    } catch (error) {
      // 在清理过程中忽略错误
      logger.warn('清理连接池失败:', (error as Error).message);
    }
  });

  afterAll(() => {
    // 确保在所有测试结束后清理任何剩余的异步操作
    jest.useFakeTimers();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('连接池初始化', () => {
    test('应该能够创建连接池实例', () => {
      expect(connectionPool).toBeInstanceOf(ConnectionPool);
    });

    test('应该能够获取连接池统计信息', () => {
      const stats = connectionPool.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });
  });

  describe('连接池管理', () => {
    test('应该能够关闭连接池', async () => {
      await expect(connectionPool.close()).resolves.not.toThrow();
    });

    test('应该能够初始化连接池', async () => {
      // 模拟成功的连接池创建
      const mockConnection = {
        ping: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn(),
        release: jest.fn()
      };

      const mockPool = {
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        on: jest.fn(),
        end: jest.fn()
      };

      const { createPool } = jest.requireMock('mysql2/promise') as { createPool: jest.Mock };
      createPool.mockReturnValue(mockPool);

      await expect(connectionPool.initialize()).resolves.not.toThrow();
    });
  });

  describe('错误处理', () => {
    test('应该处理连接池创建失败', async () => {
      const { createPool } = jest.requireMock('mysql2/promise') as { createPool: jest.Mock };
      createPool.mockImplementation(() => {
        throw new Error('连接失败');
      });

      // 这将导致 initialize() 立即抛出错误，不会触发健康检查
      await expect(connectionPool.initialize()).rejects.toThrow();
    });
  });

  describe('高级恢复机制', () => {
    let mockPool: {
      getConnection: jest.Mock;
      end: jest.Mock;
      on?: jest.Mock;
      execute?: jest.Mock;
    };
    let mockConnection: {
      ping: jest.Mock;
      release: jest.Mock;
      execute?: jest.Mock;
    };
    let mockHealthCheck: jest.SpyInstance;

    beforeEach(async () => {
      // 重置模拟
      jest.clearAllMocks();

      // 创建模拟连接池，包含 ping 方法
      mockConnection = {
        ping: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        execute: jest.fn()
      };

      mockPool = {
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        end: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        execute: jest.fn().mockResolvedValue([[]])
      };

      // 模拟已经包含 on 和 execute 方法

      const { createPool } = jest.requireMock('mysql2/promise') as { createPool: jest.Mock };
      createPool.mockReturnValue(mockPool);

      // 初始化连接池
      await connectionPool.initialize();

      // 模拟performHealthCheck方法以便测试触发恢复机制
      mockHealthCheck = jest.spyOn(connectionPool as unknown as { performHealthCheck: () => Promise<void> }, 'performHealthCheck');

      // 设置健康检查失败计数
      (connectionPool as unknown as { healthCheckFailures: number }).healthCheckFailures = 5;
    });

    afterEach(() => {
      mockConsoleError.mockClear();
      mockConsoleWarn.mockClear();
      if (mockHealthCheck) {
        mockHealthCheck.mockRestore();
      }
    });

    test('应该在健康检查失败5次时触发高级恢复机制', async () => {
      // 设置健康检查失败计数为5
      (connectionPool as unknown as { healthCheckFailures: number }).healthCheckFailures = 5;

      // 模拟健康检查失败
      mockPool.getConnection.mockRejectedValueOnce(new Error('连接失败'));
      mockConnection.ping.mockRejectedValueOnce(new Error('ping 失败'));

      // 手动调用健康检查
      await (connectionPool as unknown as { performHealthCheck: () => Promise<void> }).performHealthCheck();

      // 验证是否调用了触发恢复机制的方法
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('健康检查连续失败 5 次，触发高级恢复机制')
      );
    });

    test('应该成功执行一级恢复策略', async () => {
      const recreatePoolSpy = jest.spyOn(connectionPool as unknown as { recreatePool: () => Promise<void> }, 'recreatePool');
      recreatePoolSpy.mockResolvedValue(undefined);

      // 调用二级恢复以触发一级恢复
      await (connectionPool as unknown as { executePrimaryRecovery: () => Promise<void> }).executePrimaryRecovery();

      expect(recreatePoolSpy).toHaveBeenCalled();
      expect((connectionPool as unknown as { circuitBreakerState: string }).circuitBreakerState).toBe('closed');
      expect((connectionPool as unknown as { circuitBreakerFailures: number }).circuitBreakerFailures).toBe(0);
    });

    test('应该在恢复失败时触发紧急告警', async () => {
      // 模拟所有恢复方法失败
      const triggerCriticalAlertSpy = jest.spyOn(connectionPool as unknown as { triggerCriticalAlert: () => Promise<void> }, 'triggerCriticalAlert');
      triggerCriticalAlertSpy.mockResolvedValue(undefined);

      // 模拟验证恢复失败
      const validateRecoverySpy = jest.spyOn(connectionPool as unknown as { validateRecovery: () => Promise<{ success: boolean; strategy?: string }> }, 'validateRecovery');
      validateRecoverySpy.mockResolvedValue({ success: false });

      // 触发高级恢复
      await (connectionPool as unknown as { triggerAdvancedRecovery: () => Promise<void> }).triggerAdvancedRecovery();

      expect(triggerCriticalAlertSpy).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('所有恢复机制均失败')
      );
    });

    test('应该正确记录恢复事件', async () => {
      const saveEventToFileSpy = jest.spyOn(connectionPool as unknown as { saveEventToFile: () => Promise<void> }, 'saveEventToFile');
      saveEventToFileSpy.mockResolvedValue(undefined);

      await (connectionPool as unknown as { recordRecoveryEvent: (event: { type: string; timestamp: number; severity: string }) => Promise<void> }).recordRecoveryEvent({
        type: 'TEST_EVENT',
        timestamp: Date.now(),
        severity: 'INFO'
      });

      expect(saveEventToFileSpy).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('记录恢复事件:'),
        'ConnectionPool',
        undefined,
        expect.objectContaining({
          type: 'TEST_EVENT',
          severity: 'INFO'
        })
      );
    });

    test('应该在验证恢复时正确处理成功情况', async () => {
      const result = await (connectionPool as unknown as { validateRecovery: () => Promise<{ success: boolean; strategy?: string }> }).validateRecovery();

      expect(result.success).toBe(true);
      expect(result.strategy).toBe('PRIMARY');
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('恢复验证通过')
      );
    });

    test('应该正确执行强制清理连接', async () => {
      // 添加模拟活跃连接
      (connectionPool as unknown as { activeConnections: Map<string, { connection: typeof mockConnection; acquiredAt: number; stackTrace: string; connectionId: string }> }).activeConnections.set('test_conn', {
        connection: mockConnection,
        acquiredAt: Date.now() - 1000,
        stackTrace: 'test stack',
        connectionId: 'test_conn'
      });

      await (connectionPool as unknown as { forceCleanupConnections: () => Promise<void> }).forceCleanupConnections();

      expect(mockConnection.release).toHaveBeenCalled();
      expect((connectionPool as unknown as { activeConnections: Map<string, unknown> }).activeConnections.size).toBe(0);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('连接清理完成')
      );
    });

    test('应该在恢复成功后重置失败计数器', async () => {
      // 模拟验证恢复成功
      const validateRecoverySpy = jest.spyOn(connectionPool as unknown as { validateRecovery: () => Promise<{ success: boolean; strategy?: string }> }, 'validateRecovery');
      validateRecoverySpy.mockResolvedValue({ success: true, strategy: 'PRIMARY' });

      // 模拟成功的一级恢复
      const executePrimaryRecoverySpy = jest.spyOn(connectionPool as unknown as { executePrimaryRecovery: () => Promise<void> }, 'executePrimaryRecovery');
      executePrimaryRecoverySpy.mockResolvedValue(undefined);

      // 触发恢复
      await (connectionPool as unknown as { triggerAdvancedRecovery: () => Promise<void> }).triggerAdvancedRecovery();

      expect((connectionPool as unknown as { healthCheckFailures: number }).healthCheckFailures).toBe(0);
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('连接池恢复成功')
      );
    });
  });
});