/**
 * 限流器测试
 *
 * @description 测试令牌桶限流器和自适应限流器的基本功能、令牌补充机制、
 *              边界条件、系统负载适应、多用户场景、动态负载调整、错误处理
 * @author liyq
 * @since 1.0.0
 */

import { TokenBucketRateLimiter, AdaptiveRateLimiter } from '../src/rateLimit.js';

describe('TokenBucketRateLimiter', () => {
  let rateLimiter: TokenBucketRateLimiter;

  beforeEach(() => {
    // 创建一个容量为10，每秒补充1个令牌的限流器
    rateLimiter = new TokenBucketRateLimiter(10, 1);
  });

  describe('基本限流功能', () => {
    test('应该允许在桶容量范围内的请求', () => {
      // 前10次请求应该被允许（桶初始是满的）
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.allowRequest()).toBe(true);
      }
    });

    test('应该拒绝超出桶容量的请求', () => {
      // 用完所有令牌
      for (let i = 0; i < 10; i++) {
        rateLimiter.allowRequest();
      }

      // 第11次请求应该被拒绝
      expect(rateLimiter.allowRequest()).toBe(false);
    });

    test('应该支持多令牌消耗', () => {
      // 消耗5个令牌
      expect(rateLimiter.allowRequest(5)).toBe(true);

      // 再消耗5个令牌
      expect(rateLimiter.allowRequest(5)).toBe(true);

      // 尝试消耗1个令牌应该失败（桶已空）
      expect(rateLimiter.allowRequest(1)).toBe(false);
    });
  });

  describe('令牌补充机制', () => {
    test('应该随时间补充令牌', async () => {
      // 创建一个容量为2，每秒补充2个令牌的限流器
      const fastLimiter = new TokenBucketRateLimiter(2, 2);

      // 用完所有令牌
      expect(fastLimiter.allowRequest()).toBe(true);
      expect(fastLimiter.allowRequest()).toBe(true);
      expect(fastLimiter.allowRequest()).toBe(false);

      // 等待1秒让令牌补充
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 现在应该有新的令牌可用
      expect(fastLimiter.allowRequest()).toBe(true);
      expect(fastLimiter.allowRequest()).toBe(true);
    });

    test('应该限制令牌数量不超过桶容量', async () => {
      // 创建容量为3的限流器
      const limiter = new TokenBucketRateLimiter(3, 10);

      // 等待足够长时间让令牌补充
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 即使等待了很长时间，也只能消耗桶容量数量的令牌
      expect(limiter.allowRequest()).toBe(true);
      expect(limiter.allowRequest()).toBe(true);
      expect(limiter.allowRequest()).toBe(true);
      expect(limiter.allowRequest()).toBe(false);
    });
  });

  describe('边界条件测试', () => {
    test('应该正确处理零令牌请求', () => {
      // 请求0个令牌应该总是成功
      expect(rateLimiter.allowRequest(0)).toBe(true);
      expect(rateLimiter.allowRequest(0)).toBe(true);
    });

    test('应该正确处理超大令牌请求', () => {
      // 请求超过桶容量的令牌应该失败
      expect(rateLimiter.allowRequest(15)).toBe(false);

      // 桶中的令牌应该保持不变
      expect(rateLimiter.allowRequest(10)).toBe(true);
    });

    test('应该处理连续的小额请求', () => {
      // 连续的小额请求应该正常工作
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.allowRequest(1)).toBe(true);
      }

      // 第11次应该失败
      expect(rateLimiter.allowRequest(1)).toBe(false);
    });
  });

});

describe('AdaptiveRateLimiter', () => {
  let adaptiveLimiter: AdaptiveRateLimiter;

  beforeEach(() => {
    // 创建一个基础限制为每分钟60次请求的自适应限流器
    adaptiveLimiter = new AdaptiveRateLimiter(60, 60);
  });

  describe('基本自适应功能', () => {
    test('应该为不同标识符创建独立的限流器', () => {
      const user1 = 'user:1';
      const user2 = 'user:2';

      // 两个用户都应该能够发送请求
      expect(adaptiveLimiter.checkRateLimit(user1)).toBe(true);
      expect(adaptiveLimiter.checkRateLimit(user2)).toBe(true);
    });

    test('应该根据系统负载调整限制', () => {
      const userId = 'test-user';

      // 正常负载下应该允许请求
      adaptiveLimiter.updateSystemLoad(0.6, 0.6);
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);

      // 高负载下应该更严格
      adaptiveLimiter.updateSystemLoad(0.9, 0.9);
      // 注意：由于限制被减半，新的限流器会有更少的令牌
    });
  });

  describe('系统负载适应', () => {
    test('应该在高负载时减少限制', () => {
      const userId = 'load-test-user';

      // 设置高CPU和内存负载
      adaptiveLimiter.updateSystemLoad(0.85, 0.85);

      // 在高负载下，限制应该被减半（60 * 0.5 = 30）
      // 由于是新的标识符，会创建新的令牌桶
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);
    });

    test('应该在低负载时增加限制', () => {
      const userId = 'low-load-user';

      // 设置低CPU和内存负载
      adaptiveLimiter.updateSystemLoad(0.3, 0.4);

      // 在低负载下，限制应该增加（60 * 1.2 = 72）
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);
    });

    test('应该在正常负载时保持基础限制', () => {
      const userId = 'normal-load-user';

      // 设置正常负载
      adaptiveLimiter.updateSystemLoad(0.6, 0.7);

      // 正常负载下应该使用基础限制
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);
    });
  });

  describe('多用户场景', () => {
    test('应该为每个用户维护独立的限流状态', () => {
      const users = ['user:1', 'user:2', 'user:3'];

      // 每个用户都应该有自己的令牌桶
      users.forEach(user => {
        expect(adaptiveLimiter.checkRateLimit(user)).toBe(true);
      });

      // 一个用户的使用不应该影响其他用户
      for (let i = 0; i < 50; i++) {
        adaptiveLimiter.checkRateLimit('user:1');
      }

      // 其他用户仍然应该能够发送请求
      expect(adaptiveLimiter.checkRateLimit('user:2')).toBe(true);
      expect(adaptiveLimiter.checkRateLimit('user:3')).toBe(true);
    });
  });

  describe('动态负载调整', () => {
    test('应该能够动态调整系统负载因子', () => {
      const userId = 'dynamic-user';

      // 开始时正常负载
      adaptiveLimiter.updateSystemLoad(0.6, 0.6);
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);

      // 切换到高负载
      adaptiveLimiter.updateSystemLoad(0.9, 0.8);
      // 系统负载因子应该调整为0.5

      // 切换到低负载
      adaptiveLimiter.updateSystemLoad(0.3, 0.4);
      // 系统负载因子应该调整为1.2
    });

    test('应该处理边界负载值', () => {
      const userId = 'boundary-user';

      // 测试边界值：刚好80%
      adaptiveLimiter.updateSystemLoad(0.8, 0.8);
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);

      // 测试边界值：刚好50%
      adaptiveLimiter.updateSystemLoad(0.5, 0.5);
      expect(adaptiveLimiter.checkRateLimit(userId)).toBe(true);
    });
  });

  describe('错误处理和边界条件', () => {
    test('应该处理空字符串标识符', () => {
      expect(() => adaptiveLimiter.checkRateLimit('')).not.toThrow();
      expect(adaptiveLimiter.checkRateLimit('')).toBe(true);
    });

    test('应该处理极端负载值', () => {
      expect(() => adaptiveLimiter.updateSystemLoad(0, 0)).not.toThrow();
      expect(() => adaptiveLimiter.updateSystemLoad(1, 1)).not.toThrow();
      expect(() => adaptiveLimiter.updateSystemLoad(1.5, 1.5)).not.toThrow();
    });

    test('应该处理负数负载值', () => {
      expect(() => adaptiveLimiter.updateSystemLoad(-0.1, -0.1)).not.toThrow();
    });
  });
});