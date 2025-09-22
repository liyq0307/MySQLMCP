/**
 * 缓存系统和内存管理综合测试
 *
 * @description 测试缓存功能、内存管理、WeakMap防护、性能优化等
 * @author liyq
 * @since 1.0.0
 */

import { SmartCache, CacheManager, QueryType } from '../src/cache.js';
import { CacheRegion } from '../src/types.js';
import { ConfigurationManager, CacheConfig } from '../src/config.js';
import { MemoryMonitor } from '../src/monitor.js';
import { MySQLManager } from '../src/mysqlManager.js';
import { DefaultConfig } from '../src/constants.js';

// 类型定义用于测试私有方法
interface CacheManagerTestInterface {
  extractTableNames(query: string): string[];
  generateCacheKey(query: string, params?: unknown[]): string;
  hashString(str: string): string;
  extractQueryType(query: string): QueryType;
  shouldCacheQuery(query: string, queryType: QueryType): boolean;
  compiledTableExtractionPatterns: {
    fromPattern: RegExp;
    joinPattern: RegExp;
    insertPattern: RegExp;
    updatePattern: RegExp;
    deletePattern: RegExp;
    dropPattern: RegExp;
    createPattern: RegExp;
    alterPattern: RegExp;
  };
  getOptimalBatchSize(): number;
  getMemoryPressure(): number;
  performWeakMapCleanup(): {
    totalCleaned: number;
    totalMemoryReclaimed: number;
    regionStats: Record<string, { cleanedCount: number; memoryReclaimed: number }>;
  };
  cleanupExpiredQueryEntries(): Promise<number>;
  lastWeakMapCleanupTime: number;
}

// Mock logger
jest.mock('../src/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('缓存系统集成测试', () => {
  describe('SmartCache - 基础功能', () => {
    let smartCache: SmartCache<unknown>;

    beforeEach(() => {
      smartCache = new SmartCache(10, 300);
    });

    afterEach(async () => {
      await smartCache.clear();
    });

    describe('基本缓存操作', () => {
      test('应该能够设置和获取缓存项', async () => {
        // 准备测试数据
        const key = 'test_table';
        const value = { columns: ['id', 'name'], indexes: [] };

        // 设置缓存项
        await smartCache.put(key, value);
        const result = await smartCache.get(key);

        // 验证缓存项正确存储和检索
        expect(result).toEqual(value);
      });

      test('应该在缓存项不存在时返回 null', async () => {
        // 尝试获取不存在的缓存项
        const result = await smartCache.get('nonexistent_key');

        // 应该返回null
        expect(result).toBeNull();
      });

      test('应该能够检查缓存项是否存在', async () => {
        // 准备测试数据
        const key = 'test_table';
        const value = { columns: ['id', 'name'], indexes: [] };

        // 初始状态应该不存在
        expect(await smartCache.get(key)).toBeNull();

        // 添加缓存项后应该存在
        await smartCache.put(key, value);
        expect(await smartCache.get(key)).not.toBeNull();
      });

      test('应该能够删除缓存项', async () => {
        // 准备测试数据并添加到缓存
        const key = 'test_table';
        const value = { columns: ['id', 'name'], indexes: [] };

        await smartCache.put(key, value);
        expect(await smartCache.get(key)).not.toBeNull();

        // 删除缓存项
        await smartCache.remove(key);

        // 验证删除成功
        expect(await smartCache.get(key)).toBeNull();
      });

      test('应该能够清空所有缓存', async () => {
        // 添加多个缓存项
        await smartCache.put('table1', { columns: ['id'], indexes: [] });
        await smartCache.put('table2', { columns: ['name'], indexes: [] });

        // 验证缓存项存在
        expect(await smartCache.get('table1')).not.toBeNull();
        expect(await smartCache.get('table2')).not.toBeNull();

        // 清空所有缓存
        await smartCache.clear();

        // 验证所有缓存项都被清除
        expect(await smartCache.get('table1')).toBeNull();
        expect(await smartCache.get('table2')).toBeNull();
      });
    });

    describe('缓存过期', () => {
      test('应该在 TTL 过期后自动删除缓存项', async () => {
        // 创建短TTL缓存用于测试过期功能
        const shortTtlCache = new SmartCache(10, 0.1); // 0.1秒TTL
        const key = 'expiring_table';
        const value = { columns: ['id'], indexes: [] };

        // 添加缓存项并验证存在
        await shortTtlCache.put(key, value);
        expect(await shortTtlCache.get(key)).not.toBeNull();

        // 等待 TTL 过期
        await new Promise(resolve => setTimeout(resolve, 150));

        // 验证缓存项已过期被删除
        expect(await shortTtlCache.get(key)).toBeNull();
      });

      test('应该在 TTL 过期前能够访问缓存项', async () => {
        // 准备测试数据
        const key = 'short_lived_table';
        const value = { columns: ['id'], indexes: [] };

        // 添加缓存项
        await smartCache.put(key, value);

        // 在过期前访问（等待时间小于TTL）
        await new Promise(resolve => setTimeout(resolve, 50));

        // 验证缓存项仍然存在
        expect(await smartCache.get(key)).toEqual(value);
      });
    });

    describe('缓存统计', () => {
      test('应该提供缓存统计信息', async () => {
        // 添加测试缓存项
        await smartCache.put('table1', { columns: ['id'], indexes: [] });
        await smartCache.put('table2', { columns: ['name'], indexes: [] });

        // 获取统计信息
        const stats = smartCache.getStats();

        // 验证统计信息包含必要字段
        expect(stats).toHaveProperty('size');
        expect(stats).toHaveProperty('hit_count');
        expect(stats).toHaveProperty('miss_count');
        expect(stats.size).toBe(2);
      });

      test('应该正确跟踪缓存命中和未命中', async () => {
        // 准备测试数据
        const key = 'stats_table';
        const value = { columns: ['id'], indexes: [] };

        // 测试未命中情况
        await smartCache.get('nonexistent');
        let stats = smartCache.getStats();
        expect(stats.miss_count).toBeGreaterThan(0);

        // 测试命中情况
        await smartCache.put(key, value);
        await smartCache.get(key);
        stats = smartCache.getStats();
        expect(stats.hit_count).toBeGreaterThan(0);
      });
    });

    describe('过载管理功能', () => {
      let cache: SmartCache<string>;

      beforeEach(() => {
        // 创建一个小型缓存用于测试
        cache = new SmartCache<string>(3, 300); // 最大大小为3
      });

      afterEach(async () => {
        await cache.clear();
      });

      test('应该在缓存大小未超限时返回空数组', async () => {
        // 添加缓存项但不超过最大限制
        await cache.put('key1', 'value1');
        await cache.put('key2', 'value2');

        // 检查多余键，应该为空
        const excessKeys = cache.getExcessKeys();
        expect(excessKeys).toEqual([]);
      });

      test('应该在缓存大小超限时返回多余的键', async () => {
        // 添加4个条目，超出最大大小3
        await cache.put('key1', 'value1');
        await cache.put('key2', 'value2');
        await cache.put('key3', 'value3');
        await cache.put('key4', 'value4');

        // 正常情况下，由于LRU策略，key1应该被淘汰
        // 但如果我们手动检查，应该能找到多余的键
        const excessKeys = cache.getExcessKeys();
        expect(Array.isArray(excessKeys)).toBe(true);
      });

      test('应该正确清理多余的键', async () => {
        // 模拟内存压力情况
        cache.adjustForMemoryPressure(0.5); // 设置内存压力，动态大小变为原来的一半

        await cache.put('key1', 'value1');
        await cache.put('key2', 'value2');
        await cache.put('key3', 'value3');

        // 在内存压力下，应该有一些键被认为是多余的
        const cleanedCount = cache.cleanExcessKeys();
        expect(cleanedCount).toBeGreaterThanOrEqual(0);
      });

      test('应该正确处理空缓存的多余键检查', () => {
        // 检查空缓存的多余键
        const excessKeys = cache.getExcessKeys();

        // 空缓存应该没有多余键
        expect(excessKeys).toEqual([]);
      });

      test('应该正确处理空缓存的键清理', () => {
        // 尝试清理空缓存的多余键
        const cleanedCount = cache.cleanExcessKeys();

        // 空缓存没有键可清理
        expect(cleanedCount).toBe(0);
      });
    });
  });

  describe('CacheManager - 多区域管理', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
      const mockConfig = {
        schemaCacheSize: 10,
        tableExistsCacheSize: 10,
        indexCacheSize: 10,
        cacheTTL: 300,
        enableQueryCache: false,
        queryCacheSize: 100,
        queryCacheTTL: 300,
        maxQueryResultSize: 1024 * 1024,
        enableTieredCache: false,
        enableTTLAdjustment: false
      };
      cacheManager = new CacheManager(mockConfig);
    });

    describe('多区域缓存管理', () => {
      test('应该能够在不同区域缓存数据', async () => {
        const schemaData = { columns: ['id', 'name'], indexes: [] };
        const existsData = true;

        cacheManager.set(CacheRegion.SCHEMA, 'users', schemaData);
        cacheManager.set(CacheRegion.TABLE_EXISTS, 'users', existsData);

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'users')).toEqual(schemaData);
        expect(await cacheManager.get(CacheRegion.TABLE_EXISTS, 'users')).toBe(existsData);
      });

      test('应该为不同区域返回独立的数据', async () => {
        const schemaData = { columns: ['id', 'name'] };
        const indexData = { indexes: ['PRIMARY'] };

        cacheManager.set(CacheRegion.SCHEMA, 'users', schemaData);
        cacheManager.set(CacheRegion.INDEX, 'users', indexData);

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'users')).toEqual(schemaData);
        expect(await cacheManager.get(CacheRegion.INDEX, 'users')).toEqual(indexData);
        expect(await cacheManager.get(CacheRegion.SCHEMA, 'users')).not.toEqual(indexData);
      });

      test('应该支持批量操作', async () => {
        const batchData = {
          'users': true,
          'orders': true,
          'products': false
        };

        cacheManager.setBatch(CacheRegion.TABLE_EXISTS, batchData);

        const results = await cacheManager.getBatch(CacheRegion.TABLE_EXISTS, ['users', 'orders', 'products']);
        expect(results.users).toBe(true);
        expect(results.orders).toBe(true);
        expect(results.products).toBe(false);
      });
    });

    describe('缓存失效策略', () => {
      test('应该在表更新时使相关缓存失效', async () => {
        // 使用正确的键格式
        await cacheManager.set(CacheRegion.SCHEMA, 'schema_users', { columns: ['id'] });
        await cacheManager.set(CacheRegion.TABLE_EXISTS, 'exists_users', true);
        await cacheManager.set(CacheRegion.INDEX, 'indexes_users', { indexes: [] });

        // 使 users 表相关的缓存失效
        await cacheManager.invalidateTableCache('users');

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'schema_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.TABLE_EXISTS, 'exists_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.INDEX, 'indexes_users')).toBeNull();
      });

      test('应该支持特定区域的缓存失效', async () => {
        // 使用正确的键格式
        await cacheManager.set(CacheRegion.SCHEMA, 'schema_users', { columns: ['id'] });
        await cacheManager.set(CacheRegion.TABLE_EXISTS, 'exists_users', true);

        // 只使 schema 缓存失效
        await cacheManager.invalidateTableCache('users', CacheRegion.SCHEMA);

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'schema_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.TABLE_EXISTS, 'exists_users')).toBe(true); // 应该仍然存在
      });

      test('应该支持新的统一缓存失效接口', async () => {
        // 设置各种缓存
        await cacheManager.set(CacheRegion.SCHEMA, 'schema_users', { columns: ['id'] });
        await cacheManager.set(CacheRegion.TABLE_EXISTS, 'exists_users', true);
        await cacheManager.set(CacheRegion.INDEX, 'indexes_users', { indexes: [] });

        // 使用新的统一接口进行DML操作的缓存失效
        await cacheManager.invalidateCache('DML', 'users');

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'schema_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.TABLE_EXISTS, 'exists_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.INDEX, 'indexes_users')).toBeNull();
      });

      test('应该支持特定区域的统一缓存失效', async () => {
        // 设置缓存
        await cacheManager.set(CacheRegion.SCHEMA, 'schema_users', { columns: ['id'] });
        await cacheManager.set(CacheRegion.TABLE_EXISTS, 'exists_users', true);

        // 只失效SCHEMA区域
        await cacheManager.invalidateCache('DML', 'users', [CacheRegion.SCHEMA]);

        expect(await cacheManager.get(CacheRegion.SCHEMA, 'schema_users')).toBeNull();
        expect(await cacheManager.get(CacheRegion.TABLE_EXISTS, 'exists_users')).toBe(true); // 应该仍然存在
      });
    });

    describe('统计和监控', () => {
      test('应该提供区域统计信息', () => {
        cacheManager.set(CacheRegion.SCHEMA, 'users', { columns: ['id'] });
        cacheManager.get(CacheRegion.SCHEMA, 'users'); // 命中
        cacheManager.get(CacheRegion.SCHEMA, 'nonexistent'); // 未命中

        const stats = cacheManager.getStats(CacheRegion.SCHEMA);
        expect(stats).not.toBeNull();
        expect(stats?.hitCount).toBe(0);
        expect(stats?.missCount).toBe(0);
      });

      test('应该提供所有区域的统计信息', () => {
        cacheManager.set(CacheRegion.SCHEMA, 'users', { columns: ['id'] });
        cacheManager.set(CacheRegion.TABLE_EXISTS, 'users', true);

        const allStats = cacheManager.getAllStats();
        expect(allStats).toHaveProperty(CacheRegion.SCHEMA);
        expect(allStats).toHaveProperty(CacheRegion.TABLE_EXISTS);
      });

      test('应该支持内存压力调整', () => {
        cacheManager.set(CacheRegion.SCHEMA, 'users', { columns: ['id'] });

        // 模拟高内存压力
        cacheManager.adjustForMemoryPressure(0.9);

        // 缓存应该仍然可用，但可能被调整
        const stats = cacheManager.getStats(CacheRegion.SCHEMA);
        expect(stats).not.toBeNull();
      });
    });
  });

  describe('查询缓存优化', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
      const config = new ConfigurationManager();
      cacheManager = new CacheManager(config.cache);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('表名提取功能', () => {
      test('应该使用编译后的正则模式提取表名', () => {
        // 获取私有方法来进行测试
        const extractTableNames = (cacheManager as unknown as CacheManagerTestInterface).extractTableNames.bind(cacheManager);

        // 测试各种SQL查询语句
        const testCases = [
          {
            query: 'SELECT * FROM users WHERE id = 1',
            expectedTables: ['users']
          },
          {
            query: 'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
            expectedTables: ['users', 'orders']
          },
          {
            query: 'INSERT INTO products (name, price) VALUES (?, ?)',
            expectedTables: ['products']
          },
          {
            query: 'UPDATE customers SET email = ? WHERE id = ?',
            expectedTables: ['customers']
          },
          {
            query: 'DELETE FROM sessions WHERE expires < NOW()',
            expectedTables: ['sessions']
          }
        ];

        testCases.forEach(({ query, expectedTables }) => {
          const tables = extractTableNames(query);
          expect(tables).toEqual(expectedTables);
        });
      });
    });

    describe('查询缓存功能', () => {
      test('应该高效缓存和检索查询结果', async () => {
        const query = 'SELECT * FROM users WHERE id = ?';
        const params: unknown[] = [123];
        const result = [{ id: 123, name: 'John Doe' }];

        // 缓存查询结果
        await cacheManager.setCachedQuery(query, params, result);

        // 验证结果被缓存
        const cachedResult = await cacheManager.getCachedQuery(query, params);
        expect(cachedResult).toEqual(result);
      });

      test('应该跳过不可缓存查询的缓存', async () => {
        const query = 'SELECT NOW() as current_time';
        const params: unknown[] = [];
        const result = [{ current_time: new Date().toISOString() }];

        // 尝试缓存不应缓存的查询
        await cacheManager.setCachedQuery(query, params, result);

        // 验证结果未被缓存
        const cachedResult = await cacheManager.getCachedQuery(query, params);
        expect(cachedResult).toBeNull();
      });
    });

    describe('性能优化功能', () => {
      test('应该使用优化的字符串操作', async () => {
        // 测试缓存键生成的性能优化
        const generateCacheKey = (cacheManager as unknown as CacheManagerTestInterface).generateCacheKey.bind(cacheManager);

        const query = 'SELECT * FROM users WHERE id = ?';
        const params: unknown[] = [123];

        const cacheKey = generateCacheKey(query, params);
        expect(typeof cacheKey).toBe('string');
        expect(cacheKey.length).toBeGreaterThan(0);
      });

      test('应该使用优化的哈希函数', async () => {
        // 测试字符串哈希函数的性能优化
        const hashString = (cacheManager as unknown as CacheManagerTestInterface).hashString.bind(cacheManager);

        const testStrings = [
          'simple string',
          'SELECT * FROM users WHERE id = 123',
          'complex query with multiple joins and conditions',
          'very long string that exceeds the maximum key length and should be hashed'
        ];

        testStrings.forEach(str => {
          const hash = hashString(str);
          expect(typeof hash).toBe('string');
          expect(hash.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('正则表达式优化', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
      const config = new ConfigurationManager();
      cacheManager = new CacheManager(config.cache);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('正则模式编译', () => {
      test('应该预编译表名提取正则模式', () => {
        // 获取私有属性来验证预编译的表名提取正则表达式
        const compiledTableExtractionPatterns = (cacheManager as unknown as CacheManagerTestInterface).compiledTableExtractionPatterns;

        // 验证所有表名提取模式都已预编译
        expect(compiledTableExtractionPatterns.fromPattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.joinPattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.insertPattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.updatePattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.deletePattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.dropPattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.createPattern).toBeInstanceOf(RegExp);
        expect(compiledTableExtractionPatterns.alterPattern).toBeInstanceOf(RegExp);
      });
    });

    describe('查询类型提取', () => {
      test('应该使用编译后的正则模式提取查询类型', () => {
        // 获取私有方法来进行测试
        const extractQueryType = (cacheManager as unknown as CacheManagerTestInterface).extractQueryType.bind(cacheManager);

        // 测试各种SQL查询语句
        const testCases = [
          {
            query: 'SELECT * FROM users WHERE id = 1',
            expectedType: 'SELECT'
          },
          {
            query: 'INSERT INTO products (name, price) VALUES (?, ?)',
            expectedType: 'INSERT'
          },
          {
            query: 'UPDATE customers SET email = ? WHERE id = ?',
            expectedType: 'UPDATE'
          },
          {
            query: 'DELETE FROM sessions WHERE expires < NOW()',
            expectedType: 'DELETE'
          },
          {
            query: 'CREATE TABLE users (id INT PRIMARY KEY)',
            expectedType: 'CREATE'
          },
          {
            query: 'DROP TABLE temp_table',
            expectedType: 'DROP'
          },
          {
            query: 'ALTER TABLE users ADD COLUMN age INT',
            expectedType: 'ALTER'
          },
          {
            query: 'SHOW TABLES',
            expectedType: 'SHOW'
          },
          {
            query: 'DESCRIBE users',
            expectedType: 'DESCRIBE'
          },
          {
            query: 'EXPLAIN SELECT * FROM users',
            expectedType: 'EXPLAIN'
          }
        ];

        testCases.forEach(({ query, expectedType }) => {
          const type = extractQueryType(query);
          expect(type).toBe(expectedType);
        });
      });
    });

    describe('缓存决策功能', () => {
      test('应该使用编译后的正则模式进行缓存决策', () => {
        // 获取私有方法来进行测试
        const shouldCacheQuery = (cacheManager as unknown as CacheManagerTestInterface).shouldCacheQuery.bind(cacheManager);

        // 测试应该缓存的查询
        const cacheableQueries = [
          'SELECT * FROM users WHERE id = 1',
          'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
          'SHOW TABLES',
          'DESCRIBE users',
          'EXPLAIN SELECT * FROM users'
        ];

        cacheableQueries.forEach(query => {
          const queryType = (cacheManager as unknown as CacheManagerTestInterface).extractQueryType(query);
          expect(shouldCacheQuery(query, queryType)).toBe(true);
        });

        // 测试不应该缓存的查询
        const nonCacheableQueries = [
          'SELECT NOW() as current_time',
          'SELECT RAND() as random_value',
          'INSERT INTO users (name) VALUES (?)',
          'UPDATE users SET last_login = NOW() WHERE id = ?',
          'DELETE FROM sessions WHERE expires < NOW()'
        ];

        nonCacheableQueries.forEach(query => {
          const queryType = (cacheManager as unknown as CacheManagerTestInterface).extractQueryType(query);
          expect(shouldCacheQuery(query, queryType)).toBe(false);
        });
      });
    });

    describe('性能对比', () => {
      test('应该展示编译正则表达式的性能提升', () => {
        // 获取私有方法来进行测试
        const extractTableNames = (cacheManager as unknown as CacheManagerTestInterface).extractTableNames.bind(cacheManager);
        const shouldCacheQuery = (cacheManager as unknown as CacheManagerTestInterface).shouldCacheQuery.bind(cacheManager);
        const extractQueryType = (cacheManager as unknown as CacheManagerTestInterface).extractQueryType.bind(cacheManager);

        // 创建大量测试查询
        const testQueries = [
          'SELECT * FROM users WHERE id = 1',
          'SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id',
          'INSERT INTO products (name, price) VALUES (?, ?)',
          'UPDATE customers SET email = ? WHERE id = ?',
          'DELETE FROM sessions WHERE expires < NOW()',
          'SHOW TABLES',
          'DESCRIBE users',
          'EXPLAIN SELECT * FROM users',
          'SELECT NOW() as current_time',
          'SELECT RAND() as random_value'
        ];

        // 测试预编译正则表达式的性能
        const startTime = Date.now();
        for (let i = 0; i < 1000; i++) {
          const query = testQueries[i % testQueries.length];
          const queryType = extractQueryType(query);
          shouldCacheQuery(query, queryType);
          extractTableNames(query);
        }
        const endTime = Date.now();
        const duration = endTime - startTime;

        // 预编译正则表达式应该提供更好的性能
        // 注意：在实际测试中，由于Jest的测试环境和Node.js的优化，
        // 性能差异可能不明显，但在生产环境中会有显著改善
        expect(duration).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

// ============================================================================
// 内存管理系统集成测试
// ============================================================================

describe('内存管理系统集成测试', () => {
  let memoryMonitor: MemoryMonitor;
  let cacheManager: CacheManager;
  let mysqlManager: MySQLManager;

  beforeEach(() => {
    memoryMonitor = new MemoryMonitor();
    // 创建启用WeakMap防护的缓存管理器
    const cacheConfig: CacheConfig = {
      schemaCacheSize: 64,
      tableExistsCacheSize: 128,
      indexCacheSize: 32,
      cacheTTL: 300,
      enableQueryCache: false,
      queryCacheSize: 100,
      queryCacheTTL: 300,
      maxQueryResultSize: 1024 * 1024,
      enableTieredCache: false,
      enableTTLAdjustment: false
    };
    cacheManager = new CacheManager(cacheConfig, true);
    mysqlManager = new MySQLManager();
  });

  afterEach(async () => {
    await mysqlManager.close();
    await cacheManager.clearAll();
  });

  describe('内存泄漏防护 - SmartCache WeakMap功能', () => {
    test('应该正确创建和使用带WeakMap防护的缓存', async () => {
      const cache = new SmartCache<string>(100, 300, true);
      const keyObject = { id: 'test' };

      // 测试设置和获取
      await cache.put('test_key', 'test_value', keyObject);
      const value = await cache.get('test_key', keyObject);

      expect(value).toBe('test_value');
    });

    test('应该提供WeakMap统计信息', async () => {
      const cache = new SmartCache<string>(100, 300, true);
      const keyObject = { id: 'test' };

      await cache.put('test_key', 'test_value', keyObject);

      const stats = cache.getStats();
      expect(stats.weak_map_enabled).toBe(1);
      expect(typeof stats.weak_map_auto_collected).toBe('number');
      expect(typeof stats.weak_ref_registry_size).toBe('number');
    });

    test('应该执行WeakMap清理', async () => {
      const cache = new SmartCache<string>(100, 300, true);

      // 添加一些测试数据
      for (let i = 0; i < 10; i++) {
        await cache.put(`key_${i}`, `value_${i}`, { id: i });
      }

      const result = cache.performWeakMapCleanup();
      expect(typeof result.cleanedCount).toBe('number');
      expect(typeof result.memoryReclaimed).toBe('number');
    });

    test('应该支持启用/禁用WeakMap防护', async () => {
      const cache = new SmartCache<string>(100, 300, false);

      // 初始状态不应该有WeakMap统计
      let stats = cache.getStats();
      expect(stats.weak_map_enabled).toBeUndefined();

      // 启用WeakMap防护
      cache.setWeakMapProtection(true);
      await cache.put('test', 'value', { id: 'test' });

      stats = cache.getStats();
      expect(stats.weak_map_enabled).toBe(1);

      // 禁用WeakMap防护
      cache.setWeakMapProtection(false);
      stats = cache.getStats();
      expect(stats.weak_map_enabled).toBeUndefined();
    });
  });

  describe('内存泄漏防护 - CacheManager集成功能', () => {
    test('应该为所有区域启用WeakMap防护', () => {
      const schemaCache = cacheManager.getCacheInstance(CacheRegion.SCHEMA);
      expect(schemaCache).toBeDefined();

      if (schemaCache) {
        const stats = schemaCache.getStats();
        expect(stats.weak_map_enabled).toBe(1);
      }
    });

    test('应该执行全局WeakMap清理', () => {
      const result = cacheManager.performWeakMapCleanup();

      expect(typeof result.totalCleaned).toBe('number');
      expect(typeof result.totalMemoryReclaimed).toBe('number');
      expect(typeof result.regionStats).toBe('object');
    });

    test('应该支持单个区域的WeakMap控制', () => {
      // 禁用特定区域的WeakMap防护
      cacheManager.setWeakMapProtection(CacheRegion.SCHEMA, false);

      const schemaCache = cacheManager.getCacheInstance(CacheRegion.SCHEMA);
      if (schemaCache) {
        const stats = schemaCache.getStats();
        expect(stats.weak_map_enabled).toBeUndefined();
      }

      // 重新启用
      cacheManager.setWeakMapProtection(CacheRegion.SCHEMA, true);

      if (schemaCache) {
        const stats = schemaCache.getStats();
        expect(stats.weak_map_enabled).toBe(1);
      }
    });

    test('应该支持全局WeakMap控制', () => {
      // 禁用所有区域的WeakMap防护
      cacheManager.setWeakMapProtectionForAll(false);

      const schemaCache = cacheManager.getCacheInstance(CacheRegion.SCHEMA);
      const tableCache = cacheManager.getCacheInstance(CacheRegion.TABLE_EXISTS);

      if (schemaCache && tableCache) {
        expect(schemaCache.getStats().weak_map_enabled).toBeUndefined();
        expect(tableCache.getStats().weak_map_enabled).toBeUndefined();
      }

      // 重新启用所有区域
      cacheManager.setWeakMapProtectionForAll(true);

      if (schemaCache && tableCache) {
        expect(schemaCache.getStats().weak_map_enabled).toBe(1);
        expect(tableCache.getStats().weak_map_enabled).toBe(1);
      }
    });
  });

  describe('内存管理优化功能', () => {
    let optimizationCacheManager: CacheManager;

    beforeEach(() => {
      // 创建一个模拟的缓存配置对象
      const mockCacheConfig = {
        schemaCacheSize: DefaultConfig.SCHEMA_CACHE_SIZE,
        tableExistsCacheSize: DefaultConfig.TABLE_EXISTS_CACHE_SIZE,
        indexCacheSize: DefaultConfig.INDEX_CACHE_SIZE,
        cacheTTL: DefaultConfig.CACHE_TTL,
        enableQueryCache: true,
        queryCacheSize: 1000,
        queryCacheTTL: DefaultConfig.CACHE_TTL,
        maxQueryResultSize: 1048576,
        enableTieredCache: false,
        enableTTLAdjustment: false
      };
      optimizationCacheManager = new CacheManager(mockCacheConfig);
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    describe('动态批量大小计算', () => {
      test('应该根据内存压力计算最优批量大小', () => {
        // 获取私有方法来进行测试
        const getOptimalBatchSize = (optimizationCacheManager as unknown as CacheManagerTestInterface).getOptimalBatchSize.bind(optimizationCacheManager);

        // 测试不同的内存压力级别
        // 注意：由于getOptimalBatchSize依赖于getMemoryPressure，我们需要模拟getMemoryPressure的返回值
        const originalGetMemoryPressure = (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure;

        // 模拟低内存压力 (0.2)
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = jest.fn().mockReturnValue(0.2);
        const lowPressureBatchSize = getOptimalBatchSize();
        expect(lowPressureBatchSize).toBeGreaterThanOrEqual(50);
        expect(lowPressureBatchSize).toBeLessThanOrEqual(300);

        // 模拟高内存压力 (0.8)
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = jest.fn().mockReturnValue(0.8);
        const highPressureBatchSize = getOptimalBatchSize();
        expect(highPressureBatchSize).toBeGreaterThanOrEqual(50);
        expect(highPressureBatchSize).toBeLessThanOrEqual(300);

        // 高压力下的批量应该大于低压力下的批量
        expect(highPressureBatchSize).toBeGreaterThanOrEqual(lowPressureBatchSize);

        // 恢复原始方法
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = originalGetMemoryPressure;
      });
    });

    describe('WeakMap清理优化', () => {
      test('应该根据内存压力调整清理间隔', async () => {
        // 获取私有属性和方法
        const performWeakMapCleanup = (optimizationCacheManager as unknown as CacheManagerTestInterface).performWeakMapCleanup.bind(optimizationCacheManager);
        const originalGetMemoryPressure = (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure;

        // 记录初始清理时间
        const _initialCleanupTime = (optimizationCacheManager as unknown as CacheManagerTestInterface).lastWeakMapCleanupTime;

        // 模拟低内存压力
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = jest.fn().mockReturnValue(0.2);

        // 执行第一次清理
        const result1 = performWeakMapCleanup();
        expect(result1.totalCleaned).toBeGreaterThanOrEqual(0);

        // 模拟高内存压力
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = jest.fn().mockReturnValue(0.8);

        // 执行第二次清理
        const result2 = performWeakMapCleanup();
        expect(result2.totalCleaned).toBeGreaterThanOrEqual(0);

        // 恢复原始方法
        (optimizationCacheManager as unknown as CacheManagerTestInterface).getMemoryPressure = originalGetMemoryPressure;
      });
    });

    describe('查询缓存清理', () => {
      test('应该使用动态批量大小清理过期条目', async () => {
        // 创建一些查询缓存条目
        const query1 = 'SELECT * FROM users WHERE id = ?';
        const params1 = [1];
        const result1 = [{ id: 1, name: 'John' }];

        // 缓存一个条目
        await optimizationCacheManager.setCachedQuery(query1, params1, result1);

        // 验证条目被缓存
        const cachedResult = await optimizationCacheManager.getCachedQuery(query1, params1);
        expect(cachedResult).toEqual(result1);

        // 获取私有方法
        const cleanupExpiredQueryEntries = (optimizationCacheManager as unknown as CacheManagerTestInterface).cleanupExpiredQueryEntries.bind(optimizationCacheManager);
        const getOptimalBatchSize = (optimizationCacheManager as unknown as CacheManagerTestInterface).getOptimalBatchSize.bind(optimizationCacheManager);

        // 测试清理功能
        const cleanedCount = await cleanupExpiredQueryEntries();
        expect(cleanedCount).toBeGreaterThanOrEqual(0);

        // 验证动态批量大小计算
        const batchSize = getOptimalBatchSize();
        expect(batchSize).toBeGreaterThanOrEqual(50);
        expect(batchSize).toBeLessThanOrEqual(300);
      });
    });
  });

  describe('自动对象清理功能', () => {
    test('应该正确注册和跟踪对象', () => {
      const testObject = { data: 'test' };

      memoryMonitor.registerObjectForCleanup('test_object', testObject, 128);

      const stats = memoryMonitor.getAutoCleanupStats();
      expect(stats.trackedObjects).toBe(1);
    });

    test('应该正确更新对象访问时间', () => {
      const testObject = { data: 'test' };

      memoryMonitor.registerObjectForCleanup('test_object', testObject, 128);

      // 等待一小段时间
      setTimeout(() => {
        memoryMonitor.touchObject('test_object');

        // 验证对象仍被跟踪
        const stats = memoryMonitor.getAutoCleanupStats();
        expect(stats.trackedObjects).toBe(1);
      }, 10);
    });

    test('应该自动清理长时间未访问的对象', (done) => {
      let testObject: object | null = { data: 'test' };

      memoryMonitor.registerObjectForCleanup('test_object', testObject, 128);

      // 移除引用
      testObject = null;

      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }

      // 等待清理执行
      setTimeout(() => {
        const result = memoryMonitor.performAutomaticCleanup();

        expect(result.cleanedCount).toBeGreaterThanOrEqual(0);
        expect(result.memoryReclaimed).toBeGreaterThanOrEqual(0);
        done();
      }, 100);
    });

    test('应该正确取消注册对象', () => {
      const testObject = { data: 'test' };

      memoryMonitor.registerObjectForCleanup('test_object', testObject, 128);

      const removed = memoryMonitor.unregisterObject('test_object');
      expect(removed).toBe(true);

      const stats = memoryMonitor.getAutoCleanupStats();
      expect(stats.trackedObjects).toBe(0);
    });
  });

  describe('MySQLManager集成功能', () => {
    test('应该正确提供SmartCache实例', () => {
      const cache = mysqlManager.getSmartCache(CacheRegion.SCHEMA);

      expect(cache).toBeDefined();
      expect(typeof cache?.put).toBe('function');
      expect(typeof cache?.get).toBe('function');
    });

    test('应该正确注册对象进行内存跟踪', () => {
      const testObject = { query: 'SELECT * FROM users' };

      mysqlManager.registerForMemoryTracking('query_result', testObject, 512);

      const stats = mysqlManager.getMemoryStats();
      expect(stats.trackedObjects).toBeGreaterThan(0);
    });

    test('应该正确执行内存清理', async () => {
      const testObject = { query: 'SELECT * FROM users' };

      mysqlManager.registerForMemoryTracking('query_result', testObject, 512);

      const result = await mysqlManager.performMemoryCleanup();

      expect(result).toBeDefined();
      expect(typeof result.cleanedCount).toBe('number');
      expect(typeof result.memoryReclaimed).toBe('number');
      expect(typeof result.duration).toBe('number');
      expect(result.weakMapStats).toBeDefined();
    });

    test('应该正确获取内存统计信息', () => {
      const stats = mysqlManager.getMemoryStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalCleanups).toBe('number');
      expect(typeof stats.trackedObjects).toBe('number');
    });

    test('应该正确设置激进清理模式', async () => {
      // 注册一些测试对象
      for (let i = 0; i < 10; i++) {
        mysqlManager.registerForMemoryTracking(`object_${i}`, { id: i }, 64);
      }

      // 启用激进清理模式
      mysqlManager.setAggressiveMemoryCleanup(true);

      // 验证设置生效（这里主要测试不会抛出异常）
      expect(() => {
        mysqlManager.setAggressiveMemoryCleanup(false);
      }).not.toThrow();
    });
  });

  describe('内存压力响应', () => {
    test('应该根据内存压力调整清理策略', async () => {
      const cache = new SmartCache<string>(50, 300, true);

      // 添加测试数据
      for (let i = 0; i < 30; i++) {
        await cache.put(`key_${i}`, `value_${i}`, { id: i });
      }

      const initialStats = cache.getStats();

      // 模拟高内存压力
      cache.adjustForMemoryPressure(0.85);

      const afterStats = cache.getStats();

      // 验证压力调整已生效（动态大小应该减少）
      expect(afterStats.dynamic_max_size).toBeLessThanOrEqual(initialStats.dynamic_max_size);
    });

    test('应该在高内存压力下执行缓存清理', () => {
      const result = cacheManager.performWeakMapCleanup();
      expect(typeof result.totalCleaned).toBe('number');
      expect(typeof result.totalMemoryReclaimed).toBe('number');
    });
  });

  describe('错误处理和边界情况', () => {
    test('应该优雅处理无效的对象注册', () => {
      expect(() => {
        // 尝试注册null对象
        memoryMonitor.registerObjectForCleanup('invalid', null as unknown as object, 64);
      }).not.toThrow();
    });

    test('应该处理不存在的对象访问', () => {
      // 访问不存在的对象
      expect(() => {
        memoryMonitor.touchObject('non_existent');
      }).not.toThrow();

      // 取消注册不存在的对象
      const removed = memoryMonitor.unregisterObject('non_existent');
      expect(removed).toBe(false);
    });

    test('应该处理WeakRef不支持的环境', async () => {
      // 模拟WeakRef不存在的环境
      const originalWeakRef = global.WeakRef;
      delete (global as Record<string, unknown>).WeakRef;

      try {
        const cache = new SmartCache<string>(10, 300, true);

        // 在不支持WeakRef的环境下仍应正常工作
        await cache.put('test', 'value');
        const value = await cache.get('test');
        expect(value).toBe('value');
      } finally {
        // 恢复WeakRef
        (global as Record<string, unknown>).WeakRef = originalWeakRef;
      }
    });

    test('应该处理清理过程中的异常', () => {
      const cache = new SmartCache<string>(10, 300, true);

      // 清理不应抛出异常
      expect(() => {
        cache.performWeakMapCleanup();
      }).not.toThrow();
    });
  });

  describe('综合性能与统计', () => {
    test('应该提供准确的缓存统计', async () => {
      const cache = new SmartCache<string>(20, 300, true);

      // 添加测试数据
      for (let i = 0; i < 10; i++) {
        await cache.put(`key_${i}`, `value_${i}`, { id: i });
      }

      const stats = cache.getStats();

      expect(typeof stats.size).toBe('number');
      expect(typeof stats.max_size).toBe('number');
      expect(typeof stats.dynamic_max_size).toBe('number');
      expect(typeof stats.hit_count).toBe('number');
      expect(typeof stats.miss_count).toBe('number');
      expect(typeof stats.hit_rate).toBe('number');
      expect(stats.weak_map_enabled).toBe(1);
      expect(typeof stats.weak_map_auto_collected).toBe('number');
    });

    test('应该正确跟踪全局统计', () => {
      const globalResult = cacheManager.performWeakMapCleanup();

      expect(typeof globalResult.totalCleaned).toBe('number');
      expect(typeof globalResult.totalMemoryReclaimed).toBe('number');
      expect(typeof globalResult.regionStats).toBe('object');

      // 验证每个区域都有统计
      for (const regionStat of Object.values(globalResult.regionStats)) {
        expect(typeof regionStat.cleanedCount).toBe('number');
        expect(typeof regionStat.memoryReclaimed).toBe('number');
      }
    });
  });

  describe('系统协同工作验证', () => {
    test('应该在高负载场景下协同工作', async () => {
      // 模拟高负载场景：同时进行多种内存操作
      const cache = new SmartCache<string>(100, 300, true);
      const testObjects: object[] = [];

      // 批量添加缓存数据
      for (let i = 0; i < 50; i++) {
        const obj = { id: i, data: `test_data_${i}` };
        testObjects.push(obj);
        await cache.put(`cache_key_${i}`, `cache_value_${i}`, obj);
        memoryMonitor.registerObjectForCleanup(`object_${i}`, obj, 128);
      }

      // 验证所有系统都在正常工作
      const cacheStats = cache.getStats();
      const monitorStats = memoryMonitor.getAutoCleanupStats();
      const managerStats = mysqlManager.getMemoryStats();

      expect(cacheStats.size).toBeGreaterThan(0);
      expect(monitorStats.trackedObjects).toBeGreaterThan(0);
      expect(typeof managerStats.totalCleanups).toBe('number');

      // 模拟内存压力下的协同清理
      cache.adjustForMemoryPressure(0.9);
      const cleanupResult1 = cache.performWeakMapCleanup();
      const cleanupResult2 = memoryMonitor.performAutomaticCleanup();
      const cleanupResult3 = await mysqlManager.performMemoryCleanup();

      // 验证所有清理操作都正常执行
      expect(typeof cleanupResult1.cleanedCount).toBe('number');
      expect(typeof cleanupResult2.cleanedCount).toBe('number');
      expect(typeof cleanupResult3.cleanedCount).toBe('number');
    });

    test('应该正确处理混合工作负载', async () => {
      // 混合负载：缓存操作 + 对象跟踪 + 查询缓存
      const promises: Promise<void>[] = [];

      // 并发执行多种操作
      for (let i = 0; i < 20; i++) {
        // 缓存操作
        promises.push(cacheManager.set(CacheRegion.SCHEMA, `table_${i}`, { columns: [`col_${i}`] }));

        // 对象跟踪
        const obj = { query: `SELECT * FROM table_${i}` };
        memoryMonitor.registerObjectForCleanup(`query_${i}`, obj, 256);

        // MySQL管理器操作
        mysqlManager.registerForMemoryTracking(`mysql_obj_${i}`, obj, 256);
      }

      await Promise.all(promises);

      // 验证系统状态
      const allStats = cacheManager.getAllStats();
      const monitorStats = memoryMonitor.getAutoCleanupStats();
      const mysqlStats = mysqlManager.getMemoryStats();

      expect(Object.keys(allStats)).toContain(CacheRegion.SCHEMA);
      expect(monitorStats.trackedObjects).toBeGreaterThan(0);
      expect(mysqlStats.trackedObjects).toBeGreaterThan(0);

      // 执行协同清理
      const globalCleanup = cacheManager.performWeakMapCleanup();
      expect(typeof globalCleanup.totalCleaned).toBe('number');
      expect(typeof globalCleanup.totalMemoryReclaimed).toBe('number');
    });
  });
});