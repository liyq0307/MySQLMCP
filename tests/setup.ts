/**
 * 测试环境设置
 *
 * @description 设置测试环境变量、模拟MySQL连接、模拟ConfigurationManager、全局测试设置
 * @author liyq
 * @since 1.0.0
 */

import { jest } from '@jest/globals';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.MYSQL_HOST = 'localhost';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_USER = 'test_user';
process.env.MYSQL_PASSWORD = 'test_password';
process.env.MYSQL_DATABASE = 'test_db';

// 模拟 MySQL 连接
jest.mock('mysql2/promise', () => ({
  createPool: jest.fn().mockReturnValue({
    // @ts-expect-error: Mocking MySQL connection for testing
    getConnection: jest.fn().mockResolvedValue({
      execute: jest.fn(),
      release: jest.fn()
    }),
    // @ts-expect-error: Mocking MySQL pool end for testing
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn()
  })
}));

// 模拟 ConfigurationManager
jest.mock('../src/config.js', () => {
  return {
    ConfigurationManager: jest.fn().mockImplementation(() => {
      return {
        database: {
          host: 'localhost',
          port: 3306,
          user: 'test_user',
          password: 'test_password',
          database: 'test_db',
          connectionLimit: 10,
          minConnections: 2,
          connectTimeout: 10,
          idleTimeout: 60,
          sslEnabled: false
        },
        security: {
          maxQueryLength: 1000,
          allowedQueryTypes: ['SELECT', 'SHOW', 'DESCRIBE'],
          maxResultRows: 1000,
          queryTimeout: 30,
          rateLimitMax: 100,
          rateLimitWindow: 60
        },
        cache: {
          schemaCacheSize: 100,
          tableExistsCacheSize: 1000,
          indexCacheSize: 500,
          cacheTTL: 300
        },
        toObject: jest.fn().mockReturnValue({
          database: {
            host: 'localhost',
            port: 3306,
            user: 'test_user',
            password: '***',
            database: 'test_db',
            connectionLimit: 10,
            minConnections: 2,
            connectTimeout: 10,
            idleTimeout: 60,
            sslEnabled: false
          },
          security: {
            maxQueryLength: 1000,
            allowedQueryTypes: ['SELECT', 'SHOW', 'DESCRIBE'],
            maxResultRows: 1000,
            queryTimeout: 30,
            rateLimitMax: 100,
            rateLimitWindow: 60
          },
          cache: {
            schemaCacheSize: 100,
            tableExistsCacheSize: 1000,
            indexCacheSize: 500,
            cacheTTL: 300
          }
        }),
        getSummary: jest.fn().mockReturnValue({
          database_host: 'localhost',
          database_port: '3306',
          connection_limit: '10',
          max_result_rows: '1000',
          rate_limit_max: '100',
          schema_cache_size: '100'
        })
      };
    })
  };
});

// 全局测试设置
beforeAll(() => {
  // 静默 console.error 用于测试
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // 恢复 console.error
  jest.restoreAllMocks();
});