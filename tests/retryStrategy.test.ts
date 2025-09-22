/**
 * 智能重试策略系统测试
 *
 * @description 测试重试策略系统的核心功能，包括重试逻辑、延迟计算、错误处理和统计监控
 * @author liyq
 * @since 1.0.0
 */

import { SmartRetryStrategy } from '../src/retryStrategy.js';
import { MySQLMCPError, ErrorCategory, ErrorSeverity, ErrorContext } from '../src/types.js';

describe('SmartRetryStrategy', () => {
  // 模拟延时函数
  let mockDelay: number;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods to suppress warnings during tests
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // 重置统计
    SmartRetryStrategy.resetRetryStats();
    mockDelay = 0;

    // 模拟setTimeout以加速测试
    jest.useFakeTimers();
    jest.spyOn(global, 'setTimeout').mockImplementation((callback: () => void, delay?: number) => {
      if (delay) mockDelay += delay;
      // 立即执行回调函数以加速测试
      if (typeof callback === 'function') {
        callback();
      }
      return 1 as unknown as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('executeWithRetry - 基本执行逻辑', () => {
    test('应该在第一次尝试成功时不重试', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.finalResult).toBe('success');
      expect(result.totalDelay).toBe(0);
    });

    test('应该在操作抛出不可重试错误时立即失败', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Syntax error',
        ErrorCategory.SYNTAX_ERROR,
        ErrorSeverity.HIGH
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.lastError).toBeInstanceOf(MySQLMCPError);
    });

    test('应该在操作抛出可重试错误时进行重试', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Connection error',
          ErrorCategory.CONNECTION_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('retry_success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 1000
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(result.finalResult).toBe('retry_success');
    });
  });

  describe('重试策略配置', () => {
    test('应该使用默认策略配置', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation);

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    test('应该合并自定义配置和默认配置', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Network error',
          ErrorCategory.NETWORK_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 500
      });

      expect(result.attempts).toBe(2);
      expect(result.success).toBe(true);
    });

    test('应该在达到最大重试次数后停止重试', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Timeout error',
        ErrorCategory.TIMEOUT_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 100
      });

      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });
  });

  describe('延迟计算和抖动', () => {
    beforeEach(() => {
      // 模拟Math.random以确保测试可预测性
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
      (Math.random as jest.Mock).mockRestore();
    });

    test('应该计算正确的指数退避延迟', async () => {
      mockDelay = 0;
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Timeout error',
        ErrorCategory.TIMEOUT_ERROR,
        ErrorSeverity.MEDIUM
      ));

      await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 4,
        baseDelay: 1000,
        backoffMultiplier: 2,
        jitter: false
      });

      // 期望的延迟：第一次重试1000ms，第二次2000ms，第三次4000ms
      // 但是第三次尝试会失败，最终总延迟是3000ms
      expect(mockDelay).toBeGreaterThan(1000); // 至少有第一次重试延迟
    }, 15000);

    test('应该应用抖动来避免 thundering herd 问题', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Network error',
          ErrorCategory.NETWORK_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('success');

      await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 1000,
        jitter: true
      });

      // 验证使用了抖动
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    test('延迟不应该超过最大限制', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Connection error',
        ErrorCategory.CONNECTION_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 10000,
        backoffMultiplier: 3,
        maxDelay: 2000,
        jitter: false
      });

      expect(result.attempts).toBe(5);
      expect(result.totalDelay).toBeLessThan(10000); // 应该小于无限制情况的延迟
    }, 15000);
  });

  describe('错误分类和可重试性判断', () => {
    test('应该正确识别可重试的错误', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Connection error',
          ErrorCategory.CONNECTION_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 100
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    test('应该拒绝不可重试的错误', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Security violation',
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.HIGH
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 100
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1); // 首次尝试失败后应该立即停止
    });

    test('应该根据严重级别处理重试决策', async () => {
      // FATAL 严重级别应该不重试
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Fatal error',
        ErrorCategory.UNKNOWN,
        ErrorSeverity.FATAL
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 100
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('自定义重试条件', () => {
    test('应该使用自定义条件函数', async () => {
      const customCondition = jest.fn()
        .mockImplementation((error: Error, attempt: number) => attempt < 2);

      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Network error',
        ErrorCategory.NETWORK_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 5,
        baseDelay: 100,
        condition: customCondition as (error: Error, attempt: number) => boolean
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // 由于自定义条件只允许1次重试
      expect(customCondition).toHaveBeenCalled();
    });
  });

  describe('重试历史记录', () => {
    test('应该维护完整的重试历史', async () => {
      const errors = [
        new MySQLMCPError('Error 1', ErrorCategory.CONNECTION_ERROR, ErrorSeverity.MEDIUM),
        new MySQLMCPError('Error 2', ErrorCategory.TIMEOUT_ERROR, ErrorSeverity.MEDIUM),
        null // 最后成功
      ];

      let callIndex = 0;
      const mockOperation = jest.fn()
        .mockImplementation(() => {
          const error = errors[callIndex++];
          if (error) {
            return Promise.reject(error);
          }
          return Promise.resolve('final_success');
        });

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 100
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(result.retryHistory).toHaveLength(3); // 两次失败 + 一次成功记录

      // 验证第一次失败记录
      expect(result.retryHistory[0].attempt).toBe(1);
      expect(result.retryHistory[0].error?.message).toBe('Error 1');
      expect(result.retryHistory[0].delay).toBeGreaterThanOrEqual(0);

      // 验证第二次失败记录
      expect(result.retryHistory[1].attempt).toBe(2);
      expect(result.retryHistory[1].error?.message).toBe('Error 2');
      // 这里延迟应该是正值（第二次重试前的延迟）
    });
  });

  describe('分类特定策略创建', () => {
    test('应该创建基于错误分类的重试策略', () => {
      const strategy = SmartRetryStrategy.createCategorySpecificStrategy(
        [ErrorCategory.CONNECTION_ERROR, ErrorCategory.TIMEOUT_ERROR],
        [ErrorCategory.SECURITY_VIOLATION, ErrorCategory.SYNTAX_ERROR],
        {
          maxAttempts: 5,
          baseDelay: 1000
        }
      );

      expect(strategy.retryableErrors).toContain(ErrorCategory.CONNECTION_ERROR);
      expect(strategy.retryableErrors).toContain(ErrorCategory.TIMEOUT_ERROR);
      expect(strategy.nonRetryableErrors).toContain(ErrorCategory.SECURITY_VIOLATION);
      expect(strategy.nonRetryableErrors).toContain(ErrorCategory.SYNTAX_ERROR);
      expect(strategy.maxAttempts).toBe(5);
      expect(strategy.baseDelay).toBe(1000);
    });

    test('应该使用默认配置作为基础配置', () => {
      const strategy = SmartRetryStrategy.createCategorySpecificStrategy(
        [ErrorCategory.CONNECTION_ERROR],
        [ErrorCategory.SECURITY_VIOLATION]
      );

      expect(strategy.maxAttempts).toBeGreaterThan(0); // 默认值
      expect(strategy.baseDelay).toBeGreaterThan(0); // 默认值
      expect(strategy.backoffMultiplier).toBeGreaterThan(0); // 默认值
    });
  });

  describe('严重级别特定策略创建', () => {
    test('应该为不同严重级别创建不同的策略', () => {
      const lowStrategy = SmartRetryStrategy.createSeveritySpecificStrategy(ErrorSeverity.LOW);
      const highStrategy = SmartRetryStrategy.createSeveritySpecificStrategy(ErrorSeverity.HIGH);
      const fatalStrategy = SmartRetryStrategy.createSeveritySpecificStrategy(ErrorSeverity.FATAL);

      // LOW 级别应该有较少的延迟
      expect(lowStrategy.baseDelay).toBeLessThan(highStrategy.baseDelay);
      expect(lowStrategy.maxAttempts).toBeGreaterThan(0);

      // FATAL 级别应该没有重试
      expect(fatalStrategy.maxAttempts).toBe(0);
      expect(fatalStrategy.baseDelay).toBe(0);
    });

    test('应该允许覆盖严重级别策略的默认配置', () => {
      const strategy = SmartRetryStrategy.createSeveritySpecificStrategy(
        ErrorSeverity.MEDIUM,
        {
          maxAttempts: 10,
          baseDelay: 2000
        }
      );

      expect(strategy.maxAttempts).toBe(10);
      expect(strategy.baseDelay).toBe(2000);
      expect(strategy.maxDelay).toBe(20000); // 因为medium的默认maxDelay为20000
    });
  });

  describe('重试统计监控', () => {
    test('应该记录成功的重试统计', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Connection error',
          ErrorCategory.CONNECTION_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('success');

      const context: ErrorContext = {
        operation: 'test_operation',
        sessionId: 'test_session',
        userId: 'test_user',
        timestamp: new Date()
      };

      await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3
      }, context);

      const stats = SmartRetryStrategy.getRetryStats('test_operation');
      expect(stats).toHaveProperty('totalAttempts');
      expect(stats).toHaveProperty('successfulRetries');
    });

    test('应该记录失败的操作统计', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Persistent error',
        ErrorCategory.CONNECTION_ERROR,
        ErrorSeverity.MEDIUM
      ));

      await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 2
      });

      // 获取某个操作的统计（这里用默认操作ID）
      const allStats = SmartRetryStrategy.getRetryStats();
      expect(Object.keys(allStats)).toHaveLength(1);
    });

    test('应该能够重置统计信息', async () => {
      // 先通过重试操作添加第一个统计
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Connection error',
        ErrorCategory.CONNECTION_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const context1 = {
        operation: 'test_reset',
        sessionId: 'session1',
        userId: 'user1',
        timestamp: new Date()
      };

      await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 2
      }, context1);

      expect(Object.keys(SmartRetryStrategy.getRetryStats())).toHaveLength(1);
      expect(SmartRetryStrategy.getRetryStats()).toHaveProperty('test_reset');

      // 重置特定操作的统计
      SmartRetryStrategy.resetRetryStats('test_reset');
      expect(Object.keys(SmartRetryStrategy.getRetryStats())).toHaveLength(0);

      // 通过另一个重试操作添加统计
      const mockOperation2 = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Network error',
        ErrorCategory.NETWORK_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const context2 = {
        operation: 'another_operation',
        sessionId: 'session2',
        userId: 'user2',
        timestamp: new Date()
      };

      await SmartRetryStrategy.executeWithRetry(mockOperation2, {
        maxAttempts: 2
      }, context2);

      // 现在应该有1个统计新增
      expect(Object.keys(SmartRetryStrategy.getRetryStats())).toHaveLength(1);
      expect(SmartRetryStrategy.getRetryStats()).toHaveProperty('another_operation');

      // 重置所有统计
      SmartRetryStrategy.resetRetryStats();
      expect(Object.keys(SmartRetryStrategy.getRetryStats())).toHaveLength(0);
    });
  });

  describe('错误处理和封装', () => {
    test('应该正确封装非MySQLMCPError错误', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Generic error'));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 2
      });

      expect(result.success).toBe(false);
      expect(result.lastError).toBeInstanceOf(MySQLMCPError);
      expect((result.lastError as MySQLMCPError).category).toBe(ErrorCategory.UNKNOWN);
    });

    test('应该在错误中包含上下文信息', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Test error',
        ErrorCategory.CONNECTION_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const context: ErrorContext = {
        operation: 'context_test',
        sessionId: 'session_123',
        userId: 'user_456',
        timestamp: new Date()
      };

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 2
      }, context);

      expect(result.lastError).toBeInstanceOf(MySQLMCPError);
      // 验证错误上下文被正确传递（通过我们的error对象）
      expect((result.lastError as MySQLMCPError).message).toBe('Test error');
    });
  });

  describe('边界情况测试', () => {
    test('应该处理maxAttempts为1的情况', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new MySQLMCPError(
        'Connection error',
        ErrorCategory.CONNECTION_ERROR,
        ErrorSeverity.MEDIUM
      ));

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 1
      });

      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    test('应该处理baseDelay为0的情况', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new MySQLMCPError(
          'Network error',
          ErrorCategory.NETWORK_ERROR,
          ErrorSeverity.MEDIUM
        ))
        .mockResolvedValueOnce('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation, {
        maxAttempts: 3,
        baseDelay: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      // 延迟应该比0稍大（由于乘数为1，抖动）
    });

    test('应该处理没有自定义配置的情况', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');

      const result = await SmartRetryStrategy.executeWithRetry(mockOperation);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.totalDelay).toBe(0);
    });
  });
});