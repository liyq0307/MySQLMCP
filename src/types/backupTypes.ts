/**
 * 备份相关类型定义
 *
 * 该文件定义了备份和导出工具所需的各种接口和类型。
 * 包括任务队列、进度跟踪、内存管理、增量备份等类型定义。
 *
 * @fileoverview 备份工具相关的接口和类型定义
 * @author liyq
 * @since 1.0.0
 * @version 1.0.0
 * @category Backup
 * @subcategory Types
 * @description 备份和导出工具所需的接口和类型定义
 */

import { BackupOptions, ExportOptions, BackupResult } from './databaseTypes.js';

// 为其他模块重新导出BackupResult
export { BackupResult } from './databaseTypes.js';

/**
 * 备份进度信息接口
 * 用于跟踪备份操作的各个阶段和进度状态
 */
export interface BackupProgress {
  /** 当前备份阶段 */
  stage: 'preparing' | 'dumping' | 'compressing' | 'verifying' | 'completed' | 'error' | 'processing';
  /** 进度百分比 (0-100) */
  progress: number;
  /** 当前进度消息 */
  message: string;
  /** 当前处理的表名 */
  currentTable?: string;
  /** 已完成的表数量 */
  tablesCompleted?: number;
  /** 总表数量 */
  totalTables?: number;
  /** 已处理的字节数 */
  bytesProcessed?: number;
  /** 总字节数 */
  totalBytes?: number;
}

/**
 * 任务队列接口
 * 用于管理备份和导出任务的队列状态和相关信息
 */
export interface TaskQueue {
  /** 任务唯一标识符 */
  id: string;
  /** 任务类型 */
  type: 'backup' | 'export' | 'report';
  /** 任务状态 */
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** 任务优先级 */
  priority: number;
  /** 任务创建时间 */
  createdAt: Date;
  /** 任务开始时间 */
  startedAt?: Date;
  /** 任务完成时间 */
  completedAt?: Date;
  /** 任务进度 */
  progress?: BackupProgress;
  /** 任务结果 */
  result?: BackupResult;
  /** 任务错误信息 */
  error?: string;
}

/**
 * 增量备份选项接口
 * 扩展基础备份选项，支持增量备份相关配置
 */
export interface IncrementalBackupOptions extends BackupOptions {
  /** 基础备份路径 */
  baseBackupPath?: string;
  /** 上次备份时间 */
  lastBackupTime?: string | Date;
  /** 跟踪表名 */
  trackingTable?: string;
  /** 增量模式 */
  incrementalMode?: 'timestamp' | 'binlog' | 'manual';
  /** 二进制日志位置 */
  binlogPosition?: string;
}

/**
 * 恢复策略接口
 * 定义备份/导出操作失败时的恢复机制
 */
export interface RecoveryStrategy {
  /** 重试次数 */
  retryCount: number;
  /** 重试延迟时间（毫秒） */
  retryDelay: number;
  /** 是否使用指数退避 */
  exponentialBackoff: boolean;
  /** 回退选项 */
  fallbackOptions?: Partial<BackupOptions | ExportOptions>;
  /** 重试回调函数 */
  onRetry?: (attempt: number, error: Error) => void;
  /** 回退回调函数 */
  onFallback?: (originalError: Error) => void;
}

/**
 * 错误恢复结果接口
 * 表示错误恢复操作的结果
 */
export interface ErrorRecoveryResult<T> {
  /** 操作是否成功 */
  success: boolean;
  /** 成功时的结果 */
  result?: T;
  /** 错误信息 */
  error?: string;
  /** 应用的恢复措施 */
  recoveryApplied?: string;
  /** 使用的尝试次数 */
  attemptsUsed?: number;
  /** 最终错误 */
  finalError?: Error;
}

/**
 * 取消令牌接口
 * 用于控制异步操作的取消
 */
export interface CancellationToken {
  /** 是否已取消 */
  isCancelled: boolean;
  /** 取消操作 */
  cancel(): void;
  /** 注册取消回调 */
  onCancelled(callback: () => void): void;
}

/**
 * 进度追踪器接口
 * 用于追踪操作进度并提供回调机制
 */
export interface ProgressTracker {
  /** 进度追踪器ID */
  id: string;
  /** 操作描述 */
  operation: string;
  /** 开始时间 */
  startTime: Date;
  /** 当前进度 */
  progress: BackupProgress;
  /** 取消令牌 */
  cancellationToken?: CancellationToken;
  /** 进度回调函数 */
  onProgress?: (progress: BackupProgress) => void;
  /** 完成回调函数 */
  onComplete?: (result: BackupResult) => void;
  /** 错误回调函数 */
  onError?: (error: Error) => void;
}

/**
 * 简单取消令牌实现
 * 提供基本的取消功能和回调注册机制
 */
export class SimpleCancellationToken implements CancellationToken {
  private _isCancelled = false;
  private _callbacks: (() => void)[] = [];

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  cancel(): void {
    if (!this._isCancelled) {
      this._isCancelled = true;
      this._callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.warn('Error in cancellation callback:', error);
        }
      });
    }
  }

  onCancelled(callback: () => void): void {
    if (this._isCancelled) {
      callback();
    } else {
      this._callbacks.push(callback);
    }
  }
}

/**
 * 内存使用情况接口
 * 描述进程内存使用详情
 */
export interface MemoryUsage {
  /** 常驻集大小 */
  rss: number;
  /** 堆总大小 */
  heapTotal: number;
  /** 堆已使用大小 */
  heapUsed: number;
  /** 外部内存使用 */
  external: number;
  /** 数组缓冲区使用 */
  arrayBuffers: number;
}

/**
 * 大文件处理选项接口
 * 定义处理大文件时的配置选项
 */
export interface LargeFileOptions {
  /** 文件块大小（字节） */
  chunkSize?: number;
  /** 最大内存使用限制（字节） */
  maxMemoryUsage?: number;
  /** 是否使用内存池 */
  useMemoryPool?: boolean;
  /** 压缩级别 1-9 */
  compressionLevel?: number;
  /** 超过此大小使用磁盘缓存（字节） */
  diskThreshold?: number;
}

/**
 * 内存管理器
 * 提供内存使用监控、压力检测和自动清理功能，用于备份和导出操作的内存优化。
 */
export class MemoryManager {
  private monitoringInterval?: NodeJS.Timeout;
  private maxMemoryThreshold: number;
  private memoryPressureCallbacks: ((pressure: number) => void)[] = [];

  constructor(maxMemoryThreshold = 1024 * 1024 * 1024) { // 1GB default
    this.maxMemoryThreshold = maxMemoryThreshold;
  }

  /**
   * 获取当前内存使用情况
   * 
   * 获取Node.js进程当前的内存使用详情，包括堆、外部内存等各项指标。
   * 
   * @returns 当前内存使用情况对象
   * @category Backup
   * @subcategory Utilities
   */
  getCurrentUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers
    };
  }

  /**
   * 检查当前内存压力
   * 
   * 计算当前内存使用量与设定的最大阈值之间的比率，用于评估内存压力。
   * 压力值范围从 0.0 (无压力) 到 1.0 (达到或超过阈值)。
   * 
   * @returns 内存压力值 (0.0 到 1.0)
   * @category Backup
   * @subcategory Utilities
   */
  checkMemoryPressure(): number {
    const usage = this.getCurrentUsage();
    const totalUsed = usage.heapUsed + usage.external;
    return Math.min(totalUsed / this.maxMemoryThreshold, 1.0);
  }

  /**
   * 请求执行内存清理
   * 
   * 尝试通过强制垃圾回收 (GC) 来释放不再使用的内存。
   * 这是一个尽力而为的操作，实际效果取决于JavaScript引擎。
   * 
   * @returns 在垃圾回收后解析的 Promise
   * @category Backup
   * @subcategory Utilities
   */
  async requestMemoryCleanup(): Promise<void> {
    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }

    // 等待一个事件循环周期
    await new Promise(resolve => setImmediate(resolve));

    // 记录清理后的内存使用情况
    const usage = this.getCurrentUsage();
    console.warn('Memory cleanup completed:', {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
      rss: Math.round(usage.rss / 1024 / 1024) + 'MB'
    });
  }

  /**
   * 启用内存监控
   * 
   * 启动一个定时器，定期检查内存压力。
   * 如果压力超过阈值，将触发已注册的压力回调，并在压力过高时自动请求内存清理。
   * 
   * @category Backup
   * @subcategory Utilities
   */
  enableMemoryMonitoring(): void {
    if (this.monitoringInterval) return;

    this.monitoringInterval = setInterval(() => {
      const pressure = this.checkMemoryPressure();
      
      if (pressure > 0.8) {
        this.memoryPressureCallbacks.forEach(callback => {
          try {
            callback(pressure);
          } catch (error) {
            console.warn('Memory pressure callback error:', error);
          }
        });

        // 自动触发内存清理
        if (pressure > 0.9) {
          this.requestMemoryCleanup();
        }
      }
    }, 5000); // 每5秒检查一次
  }

  /**
   * 禁用内存监控
   * 
   * 停止内存压力监控定时器。
   * 
   * @category Backup
   * @subcategory Utilities
   */
  disableMemoryMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * 注册内存压力回调
   * 
   * 添加一个回调函数，当内存压力超过阈值时将被调用。
   * 
   * @param callback 当内存压力过高时调用的函数，接收压力值作为参数
   * @category Backup
   * @subcategory Utilities
   */
  onMemoryPressure(callback: (pressure: number) => void): void {
    this.memoryPressureCallbacks.push(callback);
  }

  /**
   * 移除内存压力回调
   * 
   * 从回调列表中移除指定的函数，使其不再接收内存压力通知。
   * 
   * @param callback 需要移除的回调函数
   * @category Backup
   * @subcategory Utilities
   */
  removeMemoryPressureCallback(callback: (pressure: number) => void): void {
    const index = this.memoryPressureCallbacks.indexOf(callback);
    if (index > -1) {
      this.memoryPressureCallbacks.splice(index, 1);
    }
  }
}

/**
 * 增量备份结果接口
 * 扩展基础备份结果，添加增量备份特有信息
 */
export interface IncrementalBackupResult extends BackupResult {
  /** 备份类型 */
  backupType: 'full' | 'incremental';
  /** 基础备份路径 */
  baseBackupPath?: string;
  /** 增量备份起始时间 */
  incrementalSince?: string;
  /** 改变的表列表 */
  changedTables?: string[];
  /** 总变更数量 */
  totalChanges?: number;
  /** 备份消息 */
  message?: string;
}