/**
 * ErrorHandler类的单元测试文件
 *
 * @description 测试基本错误处理功能、带上下文的错误处理、错误分析功能、
 *              可恢复错误判断、敏感信息处理和掩码、错误分类功能
 * @author liyq
 * @since 1.0.0
 */

import { ErrorHandler } from '../src/errorHandler.js';

describe('ErrorHandler', () => {
  describe('错误处理', () => {
    test('应该能够安全处理错误', () => {
      const error = new Error('测试错误');
      const result = ErrorHandler.safeError(error);

      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });

    test('应该能够处理带上下文的错误', () => {
      const error = new Error('数据库连接失败');
      const result = ErrorHandler.safeError(error, 'database_connection');

      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });

    test('应该能够分析错误', () => {
      const error = new Error('Access denied for user');
      const analysis = ErrorHandler.analyzeError(error, 'authentication');

      expect(analysis).toBeDefined();
      expect(analysis.category).toBeDefined();
      expect(analysis.severity).toBeDefined();
      expect(analysis.suggestions).toBeDefined();
      expect(Array.isArray(analysis.suggestions)).toBe(true);
    });

    test('应该能够判断错误是否可恢复', () => {
      const recoverableError = new Error('Connection timeout');
      const nonRecoverableError = new Error('Syntax error');

      expect(ErrorHandler.isRecoverableError(recoverableError)).toBe(true);
      expect(ErrorHandler.isRecoverableError(nonRecoverableError)).toBe(false);
    });
  });

  describe('敏感信息处理', () => {
    test('应该默认掩码敏感信息', () => {
      const error = new Error('Access denied for user "admin" with password "secret123"');
      const result = ErrorHandler.safeError(error);

      expect(result.message).not.toContain('secret123');
      expect(result.message).not.toContain('admin');
    });

    test('应该能够禁用敏感信息掩码', () => {
      const error = new Error('Connection failed');
      const result = ErrorHandler.safeError(error, 'debug', false);

      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
    });
  });

  describe('错误分类', () => {
    test('应该正确分类连接错误', () => {
      const connectionError = new Error('Connection refused');
      const analysis = ErrorHandler.analyzeError(connectionError);

      expect(analysis.category).toBe('connection');
    });

    test('应该正确分类权限错误', () => {
      const permissionError = new Error('Access denied');
      const analysis = ErrorHandler.analyzeError(permissionError);

      expect(analysis.category).toBe('permission');
    });

    test('应该正确分类语法错误', () => {
      const syntaxError = new Error('Syntax error in SQL');
      const analysis = ErrorHandler.analyzeError(syntaxError);

      expect(analysis.category).toBe('syntax');
    });
  });
});