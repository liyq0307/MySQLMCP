/**
 * 装饰器定义类，主要包含错误处理装饰器和性能监控装饰器
 * 
 * 提供统一的错误处理机制，减少重复代码和性能度量机制
 * 
 * @fileoverview 缓存失效管理工具
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 */

import { ErrorHandler } from '../errorHandler.js';
import { StringConstants } from '../constants.js';
import { SystemMonitor } from '../monitor.js';
import { MySQLMCPError } from '../types.js';

type AsyncFunction = (...args: unknown[]) => Promise<unknown>;

let systemMonitor: SystemMonitor | null = null;

/**
 * 设置系统监控器实例
 */
export function setSystemMonitor(monitor: SystemMonitor) {
  systemMonitor = monitor;
}

/**
 * 方法错误处理装饰器
 * 自动捕获异常并转换为安全错误格式
 */
export function withErrorHandling(toolName: string, errorMessageKey?: keyof typeof StringConstants) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        // 保留MySQLMCPError类型，只增强消息
        if (error instanceof MySQLMCPError) {
          const errorMessage = errorMessageKey 
            ? StringConstants[errorMessageKey] 
            : `Operation ${toolName} failed`;
          error.message = `${errorMessage}: ${error.message}`;
          throw error;
        }
        // 只对非分类错误进行转换
        const safeError = ErrorHandler.safeError(error, toolName);
        const errorMessage = errorMessageKey 
          ? StringConstants[errorMessageKey] 
          : `Operation ${toolName} failed`;
        safeError.message = `${errorMessage}: ${safeError.message}`;
        throw safeError;
      }
    };

    return descriptor;
  };
}

/**
 * 工具函数错误包装器
 * 用于包装独立函数的错误处理
 */
export function wrapWithErrorHandling<T extends AsyncFunction>(
  fn: T,
  toolName: string,
  errorMessage: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      // 保留MySQLMCPError类型，只增强消息
      if (error instanceof MySQLMCPError) {
        error.message = `${errorMessage}: ${error.message}`;
        throw error;
      }
      // 只对非分类错误进行转换
      const safeError = ErrorHandler.safeError(error, toolName);
      safeError.message = `${errorMessage}: ${safeError.message}`;
      throw safeError;
    }
  }) as T;
}

/**
 * 性能监控装饰器
 * 自动记录方法执行时间和性能指标
 */
export function withPerformanceMonitoring(operationType: string) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      if (!systemMonitor) {
        // 如果没有监控器，直接执行原方法
        return await originalMethod.apply(this, args);
      }

      const queryId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      systemMonitor.mark(`${queryId}_start`);

      try {
        const result = await originalMethod.apply(this, args);
        
        systemMonitor.mark(`${queryId}_end`);
        systemMonitor.measure(
          `${operationType}_execution`,
          `${queryId}_start`,
          `${queryId}_end`
        );
        
        return result;
      } catch (error) {
        systemMonitor.mark(`${queryId}_error`);
        systemMonitor.measure(
          `${operationType}_error`,
          `${queryId}_start`,
          `${queryId}_error`
        );
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * 性能包装器
 * 用于包装独立函数的性能监控
 */
export function wrapWithPerformanceMonitoring<T extends AsyncFunction>(
  fn: T,
  operationType: string
): T {
  return (async (...args: Parameters<T>) => {
    if (!systemMonitor) {
      return await fn(...args);
    }

    const queryId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    systemMonitor.mark(`${queryId}_start`);

    try {
      const result = await fn(...args);
      
      systemMonitor.mark(`${queryId}_end`);
      systemMonitor.measure(
        `${operationType}_execution`,
        `${queryId}_start`,
        `${queryId}_end`
      );
      
      return result;
    } catch (error) {
      systemMonitor.mark(`${queryId}_error`);
      systemMonitor.measure(
        `${operationType}_error`,
        `${queryId}_start`,
        `${queryId}_error`
      );
      throw error;
    }
  }) as T;
}