/**
 * MCP 工具包装器
 * 
 * 提供统一的工具处理程序包装功能，减少代码重复
 * 
 * @fileoverview 缓存失效管理工具
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 */

import { z } from 'zod';
import { ErrorHandler } from '../errorHandler.js';
import { SystemMonitor } from '../monitor.js';
import { StringConstants } from '../constants.js';

type ToolHandler<T> = (args: T) => Promise<string>;

interface ToolWrapperOptions {
  toolName: string;
  errorMessage?: string;
  enablePerformanceMonitoring?: boolean;
  systemMonitor?: SystemMonitor;
}

/**
 * 创建包装的工具处理程序
 * 集成错误处理和性能监控
 */
export function createToolHandler<T>(
  handler: ToolHandler<T>,
  options: ToolWrapperOptions
): ToolHandler<T> {
  return async (args: T): Promise<string> => {
    const {
      toolName,
      errorMessage,
      enablePerformanceMonitoring = true,
      systemMonitor
    } = options;

    let queryId: string | undefined;

    // 性能监控开始
    if (enablePerformanceMonitoring && systemMonitor) {
      queryId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      systemMonitor.mark(`${queryId}_start`);
    }
    try {
      const result = await handler(args);

      // 性能监控结束
      if (queryId && systemMonitor) {
        systemMonitor.mark(`${queryId}_end`);
        systemMonitor.measure(
          `${toolName}_execution`,
          `${queryId}_start`,
          `${queryId}_end`
        );
      }
      return result;
    } catch (error) {
      // 性能监控错误
      if (queryId && systemMonitor) {
        systemMonitor.mark(`${queryId}_error`);
        systemMonitor.measure(
          `${toolName}_error`,
          `${queryId}_start`,
          `${queryId}_error`
        );
      }
      
      // 错误处理
      const safeError = ErrorHandler.safeError(error, toolName);
      const finalErrorMessage = errorMessage ||
        StringConstants[`MSG_${toolName.toUpperCase().replace(/-/g, '_')}_FAILED` as keyof typeof StringConstants] ||
        `Operation ${toolName} failed`;

      throw new Error(`${finalErrorMessage} ${safeError.message}`);
    }
  };
}

/**
 * 工具定义助手
 */
export interface ToolDefinition<T> {
  name: string;
  description: string;
  parameters: z.ZodSchema<T>;
  handler: ToolHandler<T>;
  errorMessage?: string;
}

/**
 * 创建 MCP 工具
 */
export function createMCPTool<T>(
  definition: ToolDefinition<T>,
  systemMonitor?: SystemMonitor
) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    execute: createToolHandler(
      definition.handler,
      {
        toolName: definition.name,
        errorMessage: definition.errorMessage,
        systemMonitor
      }
    )
  };
}