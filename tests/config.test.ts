/**
 * 配置管理器测试套件
 *
 * @description 测试配置初始化、访问、验证、环境变量支持和配置导出等功能
 * @author liyq
 * @since 1.0.0
 */

import { ConfigurationManager } from '../src/config.js';

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
  });

  describe('配置初始化', () => {
    test('应该使用默认配置初始化', () => {
      expect(configManager.database).toBeDefined();
      expect(configManager.security).toBeDefined();
      expect(configManager.cache).toBeDefined();
    });

    test('应该正确设置数据库默认配置', () => {
      const dbConfig = configManager.database;
      
      expect(dbConfig).toHaveProperty('host');
      expect(dbConfig).toHaveProperty('port');
      expect(dbConfig).toHaveProperty('connectionLimit');
      expect(dbConfig.port).toBe(3306);
      expect(dbConfig.connectionLimit).toBeGreaterThan(0);
    });

    test('应该正确设置安全默认配置', () => {
      const securityConfig = configManager.security;
      
      expect(securityConfig).toHaveProperty('allowedQueryTypes');
      expect(securityConfig).toHaveProperty('maxQueryLength');
      expect(securityConfig.maxQueryLength).toBeGreaterThan(0);
    });
  });

  describe('配置访问', () => {
    test('应该能够访问数据库配置', () => {
      const dbConfig = configManager.database;
      
      expect(dbConfig.host).toBeDefined();
      expect(dbConfig.port).toBeDefined();
      expect(dbConfig.user).toBeDefined();
      expect(dbConfig.database).toBeDefined();
      expect(dbConfig.connectionLimit).toBeDefined();
    });

    test('应该能够访问安全配置', () => {
      const securityConfig = configManager.security;
      
      expect(securityConfig.maxQueryLength).toBeDefined();
      expect(securityConfig.allowedQueryTypes).toBeDefined();
      expect(securityConfig.maxResultRows).toBeDefined();
      expect(securityConfig.queryTimeout).toBeDefined();
    });

    test('应该能够访问缓存配置', () => {
      const cacheConfig = configManager.cache;
      
      expect(cacheConfig.schemaCacheSize).toBeDefined();
      expect(cacheConfig.tableExistsCacheSize).toBeDefined();
      expect(cacheConfig.indexCacheSize).toBeDefined();
      expect(cacheConfig.cacheTTL).toBeDefined();
    });
  });

  describe('配置验证', () => {
    test('应该有有效的数据库配置值', () => {
      const dbConfig = configManager.database;
      
      expect(dbConfig.port).toBeGreaterThan(0);
      expect(dbConfig.port).toBeLessThan(65536);
      expect(dbConfig.connectionLimit).toBeGreaterThan(0);
      expect(dbConfig.host).toBeTruthy();
    });

    test('应该有有效的安全配置值', () => {
      const securityConfig = configManager.security;
      
      expect(securityConfig.maxQueryLength).toBeGreaterThan(0);
      expect(securityConfig.allowedQueryTypes.length).toBeGreaterThan(0);
      expect(securityConfig.maxResultRows).toBeGreaterThan(0);
    });

    test('应该有有效的缓存配置值', () => {
      const cacheConfig = configManager.cache;
      
      expect(cacheConfig.schemaCacheSize).toBeGreaterThan(0);
      expect(cacheConfig.tableExistsCacheSize).toBeGreaterThan(0);
      expect(cacheConfig.cacheTTL).toBeGreaterThan(0);
    });
  });

  describe('环境变量支持', () => {
    test('应该支持环境变量配置', () => {
      // 测试环境变量是否被正确处理
      const dbConfig = configManager.database;
      
      // 验证配置值是合理的（可能来自环境变量或默认值）
      expect(typeof dbConfig.host).toBe('string');
      expect(typeof dbConfig.port).toBe('number');
      expect(typeof dbConfig.user).toBe('string');
    });
  });

  describe('配置导出', () => {
    test('应该能够导出当前配置', () => {
      // 先验证配置管理器是否正确初始化
      expect(configManager.database).toBeDefined();
      expect(configManager.security).toBeDefined();
      expect(configManager.cache).toBeDefined();

      // 检查toObject方法是否存在
      expect(typeof configManager.toObject).toBe('function');

      const exported = configManager.toObject() as Record<string, unknown>;

      // 验证导出的配置包含所有必要的部分
      expect(exported).toHaveProperty('database');
      expect(exported).toHaveProperty('security');
      expect(exported).toHaveProperty('cache');
      expect(Object.keys(exported).length).toBe(3);
    });

    test('导出的配置应该不包含敏感信息', () => {
      const exported = configManager.toObject() as Record<string, unknown>;

      const database = exported.database as Record<string, unknown>;
      expect(database).toBeDefined();
      expect(database.password).toBe('***');
    });

    test('应该能够获取配置摘要', () => {
      // 检查getSummary方法是否存在
      expect(typeof configManager.getSummary).toBe('function');

      const summary = configManager.getSummary();

      // 验证摘要包含所有必要的字段
      expect(summary).toHaveProperty('database_host');
      expect(summary).toHaveProperty('database_port');
      expect(summary).toHaveProperty('connection_limit');
      expect(summary).toHaveProperty('max_result_rows');
      expect(summary).toHaveProperty('rate_limit_max');
      expect(summary).toHaveProperty('schema_cache_size');
      expect(Object.keys(summary).length).toBe(6);
    });
  });
});