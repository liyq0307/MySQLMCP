/**
 * MySQL管理器测试
 *
 * @description 测试MySQL管理器的构造函数、查询验证、表名验证、输入验证、性能指标、缓存管理、关闭功能
 * @author liyq
 * @since 1.0.0
 */

import { MySQLManager } from '../src/mysqlManager.js';
import { StringConstants } from '../src/constants.js';

// 模拟依赖项
jest.mock('../src/connection.js');
jest.mock('../src/config.js');
jest.mock('../src/cache.js');
jest.mock('../src/security.js');
jest.mock('../src/rateLimit.js');
jest.mock('../src/metrics.js');

describe('MySQLManager', () => {
  let mysqlManager: MySQLManager;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods to suppress warnings during tests
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mysqlManager = new MySQLManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should initialize all components', () => {
      expect(mysqlManager).toBeInstanceOf(MySQLManager);
      expect(mysqlManager['sessionId']).toBeDefined();
    });
  });

  describe('validateQuery', () => {
    it('should accept valid SELECT query', () => {
      expect(() => {
        mysqlManager['validateQuery']('SELECT * FROM users');
      }).not.toThrow();
    });

    it('should accept valid SHOW query', () => {
      expect(() => {
        mysqlManager['validateQuery']('SHOW TABLES');
      }).not.toThrow();
    });

    it('should accept valid DESCRIBE query', () => {
      expect(() => {
        mysqlManager['validateQuery']('DESCRIBE users');
      }).not.toThrow();
    });

    it('should reject queries with dangerous patterns', () => {
      expect(() => {
        mysqlManager['validateQuery']('SELECT LOAD_FILE("/etc/passwd")');
      }).toThrow(StringConstants.MSG_PROHIBITED_OPERATIONS);
    });

    it('should reject very long queries', () => {
      const longQuery = 'SELECT * FROM users WHERE ' + 'a'.repeat(20000);
      expect(() => {
        mysqlManager['validateQuery'](longQuery);
      }).toThrow(StringConstants.MSG_QUERY_TOO_LONG);
    });

    it('should reject disallowed query types', () => {
      // 模拟配置只允许 SELECT 查询
      mysqlManager['configManager'].security.allowedQueryTypes = ['SELECT'];
      expect(() => {
        mysqlManager['validateQuery']('DROP TABLE users');
      }).toThrow();
    });

    it('should handle multiline queries correctly', () => {
      const multilineQuery = `
        SELECT 
          id, 
          name, 
          email 
        FROM users 
        WHERE active = 1
      `;
      expect(() => {
        mysqlManager['validateQuery'](multilineQuery);
      }).not.toThrow();
    });

    it('should handle empty query type', () => {
      expect(() => {
        mysqlManager['validateQuery']('   ');
      }).toThrow();
    });
  });

  describe('validateTableName', () => {
    it('should accept valid table names', () => {
      expect(() => {
        mysqlManager['validateTableName']('users');
      }).not.toThrow();

      expect(() => {
        mysqlManager['validateTableName']('user_profiles');
      }).not.toThrow();

      expect(() => {
        mysqlManager['validateTableName']('table123');
      }).not.toThrow();
    });

    it('should reject invalid table names', () => {
      expect(() => {
        mysqlManager['validateTableName']('users; DROP TABLE admin;');
      }).toThrow(StringConstants.MSG_INVALID_TABLE_NAME);

      expect(() => {
        mysqlManager['validateTableName']('users"');
      }).toThrow(StringConstants.MSG_INVALID_TABLE_NAME);

      expect(() => {
        mysqlManager['validateTableName']('users with spaces');
      }).toThrow(StringConstants.MSG_INVALID_TABLE_NAME);
    });

    it('should reject table names that are too long', () => {
      const longTableName = 'a'.repeat(100);
      expect(() => {
        mysqlManager['validateTableName'](longTableName);
      }).toThrow(StringConstants.MSG_TABLE_NAME_TOO_LONG);
    });
  });

  describe('validateInput', () => {
    it('should accept valid string inputs', () => {
      expect(() => {
        mysqlManager['validateInput']('valid string', 'test_field');
      }).not.toThrow();
    });

    it('should accept valid number inputs', () => {
      expect(() => {
        mysqlManager['validateInput'](123, 'test_field');
      }).not.toThrow();
    });

    it('should accept valid boolean inputs', () => {
      expect(() => {
        mysqlManager['validateInput'](true, 'test_field');
      }).not.toThrow();
    });

    it('should accept null inputs', () => {
      expect(() => {
        mysqlManager['validateInput'](null, 'test_field');
      }).not.toThrow();
    });
  });

  describe('Performance Metrics', () => {
    it('should return performance metrics', () => {
      const metrics = mysqlManager.getPerformanceMetrics();
      expect(metrics).toHaveProperty(StringConstants.SECTION_PERFORMANCE);
      expect(metrics).toHaveProperty(StringConstants.SECTION_CACHE_STATS);
      expect(metrics).toHaveProperty(StringConstants.SECTION_CONNECTION_POOL);
    });
  });

  describe('Cache Management', () => {
    it('should have cache management methods', () => {
      // 测试缓存管理方法是否存在
      expect(typeof mysqlManager.invalidateCaches).toBe('function');
    });

    it('should handle cache invalidation', () => {
      // 由于无法直接访问私有属性，我们只测试方法调用不抛出错误
      expect(() => {
        mysqlManager.invalidateCaches('DDL');
      }).not.toThrow();
    });

    it('should handle table-specific cache invalidation', () => {
      expect(() => {
        mysqlManager.invalidateCaches('DML', 'users');
      }).not.toThrow();
    });
  });

  describe('Close', () => {
    it('should close all components gracefully', async () => {
      // 测试关闭方法不抛出错误
      await expect(mysqlManager.close()).resolves.not.toThrow();
    });
  });
});