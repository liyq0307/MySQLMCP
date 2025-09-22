/**
 * 性能管理器测试
 *
 * @description 测试PerformanceManager类及其所有子模块的功能
 * @author liyq
 * @since 1.0.0
 */

import { PerformanceManager } from '../src/performanceManager.js';
import { MySQLManager } from '../src/mysqlManager.js';
import { 
  SlowQueryAnalysis, 
  IndexSuggestion, 
  QueryProfileResult, 
  PerformanceReport 
} from '../src/performanceManager.js';

// 模拟依赖项
jest.mock('../src/mysqlManager.js');

describe('PerformanceManager', () => {
  let performanceManager: PerformanceManager;
  let mockMysqlManager: jest.Mocked<MySQLManager>;

  beforeEach(() => {
    // 创建MySQLManager的模拟实例
    mockMysqlManager = new MySQLManager() as jest.Mocked<MySQLManager>;
    
    // 创建PerformanceManager实例
    performanceManager = new PerformanceManager(mockMysqlManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize all components', () => {
      expect(performanceManager).toBeInstanceOf(PerformanceManager);
      expect(performanceManager.slowQueryAnalysis).toBeDefined();
      expect(performanceManager.indexOptimization).toBeDefined();
      expect(performanceManager.queryProfiling).toBeDefined();
      expect(performanceManager.performanceMonitoring).toBeDefined();
      expect(performanceManager.reporting).toBeDefined();
    });
  });

  describe('Slow Query Analysis', () => {
    it('should analyze slow queries', async () => {
      // 模拟慢查询分析结果
      const mockAnalysis: SlowQueryAnalysis = {
        totalSlowQueries: 5,
        averageExecutionTime: 2.5,
        commonPatterns: [
          { pattern: 'SELECT * FROM users WHERE id = ?', count: 3, avgTime: 2.1 }
        ],
        indexSuggestions: [
          {
            table: 'users',
            columns: ['id'],
            indexType: 'INDEX',
            expectedImprovement: '70-90%',
            priority: 'HIGH',
            reason: 'WHERE子句中频繁使用id字段进行查询'
          }
        ],
        performanceIssues: ['平均扫描行数过高'],
        recommendations: ['建议添加适当索引']
      };

      // 模拟slowQueryAnalysis模块的analyzeSlowQueries方法
      performanceManager.slowQueryAnalysis.analyzeSlowQueries = jest.fn().mockResolvedValue(mockAnalysis);

      const result = await performanceManager.optimizePerformance('analyze_slow_queries', {
        limit: 10,
        timeRange: '1 hour'
      });

      expect(performanceManager.slowQueryAnalysis.analyzeSlowQueries).toHaveBeenCalledWith(10, '1 hour');
      expect(result).toEqual(mockAnalysis);
    });

    it('should get active slow queries', async () => {
      const mockActiveQueries = [
        {
          sqlText: 'SELECT * FROM users WHERE status = ?',
          executionTime: 5.2,
          lockTime: 0,
          rowsExamined: 10000,
          rowsReturned: 50,
          startTime: new Date(),
          user: 'test_user',
          database: 'test_db',
          ipAddress: '127.0.0.1',
          threadId: 123,
          usesIndex: false
        }
      ];

      // 模拟slowQueryAnalysis模块的getActiveSlowQueries方法
      performanceManager.slowQueryAnalysis.getActiveSlowQueries = jest.fn().mockResolvedValue(mockActiveQueries);

      const result = await performanceManager.optimizePerformance('get_active_slow_queries');

      expect(performanceManager.slowQueryAnalysis.getActiveSlowQueries).toHaveBeenCalled();
      expect(result).toEqual(mockActiveQueries);
    });
  });

  describe('Index Optimization', () => {
    it('should generate index suggestions', async () => {
      const mockSuggestions: IndexSuggestion[] = [
        {
          table: 'users',
          columns: ['email'],
          indexType: 'INDEX',
          expectedImprovement: '50-80%',
          priority: 'MEDIUM',
          reason: 'WHERE条件中频繁使用email字段进行等值查询'
        }
      ];

      // 模拟indexOptimization模块的generateIndexSuggestions方法
      performanceManager.indexOptimization.generateIndexSuggestions = jest.fn().mockResolvedValue(mockSuggestions);

      const result = await performanceManager.optimizePerformance('suggest_indexes', {
        limit: 5,
        timeRange: '1 day'
      });

      expect(performanceManager.indexOptimization.generateIndexSuggestions).toHaveBeenCalledWith(5, '1 day');
      expect(result).toEqual(mockSuggestions);
    });
  });

  describe('Query Profiling', () => {
    it('should profile a query', async () => {
      const mockProfile: QueryProfileResult = {
        explainResult: [{ id: 1, select_type: 'SIMPLE', table: 'users' }],
        executionStats: {
          executionTime: 100,
          rowsExamined: 1000,
          rowsReturned: 50
        },
        recommendations: ['查询执行计划正常'],
        performanceScore: 85
      };

      // 模拟queryProfiling模块的profileQuery方法
      performanceManager.queryProfiling.profileQuery = jest.fn().mockResolvedValue(mockProfile);

      const result = await performanceManager.optimizePerformance('query_profiling', {
        query: 'SELECT * FROM users WHERE id = ?',
        params: [{ id: 123 }]
      });

      expect(performanceManager.queryProfiling.profileQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ?',
        [{ id: 123 }]
      );
      expect(result).toEqual(mockProfile);
    });

    it('should throw error when query is not provided for profiling', async () => {
      await expect(performanceManager.optimizePerformance('query_profiling'))
        .rejects
        .toThrow('query_profiling操作必须提供query参数');
    });
  });

  describe('Performance Reporting', () => {
    it('should generate performance report', async () => {
      const mockReport: PerformanceReport = {
        generatedAt: new Date(),
        summary: {
          slowQueriesCount: 3,
          averageExecutionTime: 1.8,
          recommendationsCount: 2
        },
        slowQueryAnalysis: {
          totalSlowQueries: 3,
          averageExecutionTime: 1.8,
          commonPatterns: [],
          indexSuggestions: [],
          performanceIssues: [],
          recommendations: ['查询性能相对良好']
        },
        systemStatus: {
          connectionHealth: 'healthy',
          memoryUsage: '正常',
          activeConnections: 5
        },
        recommendations: ['查询性能相对良好']
      };

      // 模拟reporting模块的generateReport方法
      performanceManager.reporting.generateReport = jest.fn().mockResolvedValue(mockReport);

      const result = await performanceManager.optimizePerformance('performance_report', {
        limit: 10,
        timeRange: '1 week',
        includeDetails: true
      });

      expect(performanceManager.reporting.generateReport).toHaveBeenCalledWith(10, '1 week', true);
      expect(result).toEqual(mockReport);
    });
  });

  describe('Slow Query Log Configuration', () => {
    it('should configure slow query log', async () => {
      mockMysqlManager.executeQuery = jest.fn().mockResolvedValue(undefined);

      await performanceManager.optimizePerformance('enable_slow_query_log', {
        longQueryTime: 2
      });

      // 验证是否调用了正确的SQL命令
      expect(mockMysqlManager.executeQuery).toHaveBeenCalledWith('SET GLOBAL slow_query_log = "ON"');
      expect(mockMysqlManager.executeQuery).toHaveBeenCalledWith('SET GLOBAL long_query_time = 2');
      expect(mockMysqlManager.executeQuery).toHaveBeenCalledWith('SET GLOBAL log_queries_not_using_indexes = "ON"');
      expect(mockMysqlManager.executeQuery).toHaveBeenCalledWith('SET GLOBAL log_slow_admin_statements = "ON"');
    });

    it('should disable slow query log', async () => {
      mockMysqlManager.executeQuery = jest.fn().mockResolvedValue(undefined);

      await performanceManager.optimizePerformance('disable_slow_query_log');

      expect(mockMysqlManager.executeQuery).toHaveBeenCalledWith('SET GLOBAL slow_query_log = "OFF"');
    });

    it('should get slow query log config', async () => {
      const mockConfig = {
        enabled: 1,
        threshold: 1,
        log_file: '/var/log/mysql/slow.log',
        log_no_index: 1
      };

      mockMysqlManager.executeQuery = jest.fn()
        .mockResolvedValueOnce([{ enabled: 1 }])
        .mockResolvedValueOnce([{ threshold: 1 }])
        .mockResolvedValueOnce([{ log_file: '/var/log/mysql/slow.log' }])
        .mockResolvedValueOnce([{ log_no_index: 1 }]);

      const result = await performanceManager.optimizePerformance('get_config');

      expect(result).toEqual(mockConfig);
    });
  });

  describe('Performance Monitoring', () => {
    it('should start monitoring', async () => {
      // 模拟performanceMonitoring模块的startMonitoring方法
      performanceManager.performanceMonitoring.startMonitoring = jest.fn().mockResolvedValue(undefined);

      await performanceManager.optimizePerformance('start_monitoring', {
        longQueryTime: 2,
        monitoringIntervalMinutes: 30
      });

      expect(performanceManager.performanceMonitoring.startMonitoring).toHaveBeenCalledWith(
        {
          longQueryTime: 2,
          logQueriesNotUsingIndexes: undefined
        },
        30
      );
    });

    it('should stop monitoring', async () => {
      // 模拟performanceMonitoring模块的stopMonitoring方法
      performanceManager.performanceMonitoring.stopMonitoring = jest.fn();

      const result = await performanceManager.optimizePerformance('stop_monitoring');

      expect(performanceManager.performanceMonitoring.stopMonitoring).toHaveBeenCalled();
      expect(result).toEqual({ message: '性能监控已停止' });
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown action', async () => {
      await expect(performanceManager.optimizePerformance('unknown_action'))
        .rejects
        .toThrow('未知的性能优化操作: unknown_action');
    });
  });
});