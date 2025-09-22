/**
 * 通用工具函数
 *
 * 提供项目中常用的工具函数，避免代码重复。
 *
 * @fileoverview 通用工具函数集合
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 */

import fs from 'fs/promises';
import { spawn } from "child_process";
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import archiver from 'archiver';
import unzipper from 'unzipper';
import zlib from 'zlib';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * 时间相关工具函数
 */
export class TimeUtils {
  /**
   * 获取当前时间戳（毫秒）
   */
  static now(): number {
    return Date.now();
  }

  /**
   * 获取当前时间戳（秒）
   */
  static nowInSeconds(): number {
    return Date.now() / 1000;
  }

  /**
   * 计算持续时间（秒）
   */
  static getDurationInSeconds(startTime: number): number {
    return (Date.now() - startTime) / 1000;
  }

  /**
   * 计算持续时间（毫秒）
   */
  static getDurationInMs(startTime: number): number {
    return Date.now() - startTime;
  }

  /**
   * 生成时间戳字符串（36进制）
   */
  static generateTimestampId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

/**
 * 内存相关工具函数
 */
export class MemoryUtils {
  /**
   * 获取当前内存使用情况
   */
  static getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * 格式化内存大小为可读字符串
   */
  static formatMemorySize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 计算内存使用率
   */
  static calculateMemoryUsagePercent(used: number, total: number): number {
    return total > 0 ? (used / total) * 100 : 0;
  }
}

/**
 * ID生成工具
 */
export class IdUtils {
  /**
   * 生成UUID
   */
  static generateUUID(): string {
    return randomUUID();
  }

  /**
   * 生成短ID（基于时间戳和随机数）
   */
  static generateShortId(): string {
    return TimeUtils.generateTimestampId();
  }
}

/**
 * 性能监控工具
 */
export class PerformanceUtils {
  /**
   * 创建性能计时器
   */
  static createTimer(): { start: number; getElapsed: () => number; getElapsedMs: () => number } {
    const start = TimeUtils.now();
    return {
      start,
      getElapsed: () => TimeUtils.getDurationInSeconds(start),
      getElapsedMs: () => TimeUtils.getDurationInMs(start)
    };
  }

  /**
   * 异步函数执行时间测量
   */
  static async measureAsyncExecution<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number; durationSeconds: number }> {
    const timer = PerformanceUtils.createTimer();
    const result = await fn();
    return {
      result,
      durationMs: timer.getElapsedMs(),
      durationSeconds: timer.getElapsed()
    };
  }
}

/**
 * 通用工具函数
 *
 * 提供项目中常用的工具函数，避免代码重复。
 *
 * @fileoverview 通用工具函数集合
 * @author liyq
 * @since 1.0.0
 */
export class CommonUtils {
  /**
   * 生成计数查询
   *
   * @param {string} originalQuery - 原始查询
   * @returns {string} 计数查询
   * @private
   */
  static generateCountQuery(originalQuery: string): string {
    // 简单的查询包装为计数查询
    const trimmedQuery = originalQuery.trim();
    if (trimmedQuery.toLowerCase().startsWith('select')) {
      // 移除ORDER BY和LIMIT子句
      let countQuery = trimmedQuery.replace(/\s+ORDER\s+BY\s+[^;]+/gi, '');
      countQuery = countQuery.replace(/\s+LIMIT\s+[^;]+/gi, '');

      return `SELECT COUNT(*) as count FROM (${countQuery}) as count_subquery`;
    }

    return `SELECT COUNT(*) as count FROM (${originalQuery}) as count_subquery`;
  }

  /**
   * 为查询添加LIMIT和OFFSET
   *
   * @param {string} query - 原始查询
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {string} 修改后的查询
   * @private
   */
  static addLimitToQuery(query: string, limit: number, offset: number): string {
    let modifiedQuery = query.trim();

    // 移除现有的LIMIT子句
    modifiedQuery = modifiedQuery.replace(/\s+LIMIT\s+[^;]+/gi, '');

    // 添加新的LIMIT和OFFSET
    if (modifiedQuery.endsWith(';')) {
      modifiedQuery = modifiedQuery.slice(0, -1);
    }

    return `${modifiedQuery} LIMIT ${limit} OFFSET ${offset}`;
  }

  /**
   * 执行外部命令 - 增强版本，支持超时和重试
   *
   * 执行外部命令（如mysqldump），用于数据库备份等操作。
   * 支持超时控制、重试机制和进度监控。
   *
   * @param {string} command - 要执行的命令
   * @param {string[]} args - 命令参数
   * @param {string} [outputFile] - 输出文件路径
   * @param {object} [options] - 执行选项
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static executeCommand(
    command: string,
    args: string[],
    outputFile?: string,
    options: {
      timeout?: number;
      retryCount?: number;
      onProgress?: (progress: { bytesWritten: number }) => void;
    } = {}
  ): Promise<void> {
    const { timeout = 300000, retryCount = 2, onProgress } = options; // 5分钟默认超时

    return new Promise((resolve, reject) => {
      let attempts = 0;

      const executeWithRetry = async (): Promise<void> => {
        attempts++;

        return new Promise<void>((resolveAttempt, rejectAttempt) => {
          const childProcess = spawn(command, args, {
            stdio: ['pipe', 'pipe', 'pipe']
          });

          let stderr = '';
          let bytesWritten = 0;
          let writeStream: NodeJS.WritableStream | undefined;

          // 设置超时处理
          const timeoutId = setTimeout(() => {
            childProcess.kill('SIGTERM');
            rejectAttempt(new Error(`命令执行超时: ${command} (${timeout}ms)`));
          }, timeout);

          if (outputFile) {
            writeStream = createWriteStream(outputFile);
            childProcess.stdout.pipe(writeStream);

            // 监控写入进度
            if (onProgress) {
              writeStream.on('write', (chunk: Buffer) => {
                bytesWritten += chunk.length;
                onProgress({ bytesWritten });
              });
            }
          }

          childProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          childProcess.on('close', (code, signal) => {
            clearTimeout(timeoutId);

            if (signal === 'SIGTERM') {
              rejectAttempt(new Error(`命令被终止: ${command}`));
              return;
            }

            if (code === 0) {
              resolveAttempt();
            } else {
              const error = new Error(`命令执行失败 (code ${code}): ${command} ${args.join(' ')}\n错误: ${stderr}`);
              rejectAttempt(error);
            }
          });

          childProcess.on('error', (error) => {
            clearTimeout(timeoutId);
            rejectAttempt(new Error(`无法执行命令 ${command}: ${error.message}`));
          });
        });
      };

      const attemptWithRetry = async (): Promise<void> => {
        try {
          await executeWithRetry();
          resolve();
        } catch (error) {
          if (attempts < retryCount) {
            console.warn(`命令执行失败，重试第 ${attempts} 次:`, (error as Error).message);
            // 指数退避延迟
            const delay = Math.pow(2, attempts - 1) * 1000;
            setTimeout(() => {
              attemptWithRetry();
            }, delay);
          } else {
            reject(error);
          }
        }
      };

      attemptWithRetry();
    });
  }

  /**
   * 压缩文件 - 增强版本，支持多种压缩格式和进度监控
   *
   * @param {string} sourceFile - 源文件路径
   * @param {string} targetFile - 目标文件路径
   * @param {string} [format='zip'] - 压缩格式: 'zip', 'gzip', 'brotli'
   * @param {number} [level=9] - 压缩级别 (1-9)
   * @returns {Promise<{compressedSize: number, compressionRatio: number}>}
   * @static
   */
  static async compressFile(
    sourceFile: string,
    targetFile: string,
    format: 'zip' | 'gzip' | 'brotli' = 'zip',
    level: number = 9,
    onProgress?: (progress: { bytesProcessed: number, totalBytes: number, progress: number }) => void
  ): Promise<{ compressedSize: number, compressionRatio: number }> {
    const stats = await fs.stat(sourceFile);
    const originalSize = stats.size;

    return new Promise((resolve, reject) => {
      if (format === 'zip') {
        const output = createWriteStream(targetFile);
        const archive = archiver('zip', { zlib: { level } });

        let bytesProcessed = 0;

        output.on('close', () => {
          fs.stat(targetFile).then(compressedStats => {
            resolve({
              compressedSize: compressedStats.size,
              compressionRatio: compressedStats.size / originalSize
            });
          }).catch(reject);
        });

        archive.on('error', reject);
        archive.on('progress', (progress) => {
          bytesProcessed = progress.fs.processedBytes;
          if (onProgress) {
            onProgress({
              bytesProcessed,
              totalBytes: originalSize,
              progress: Math.round((bytesProcessed / originalSize) * 100)
            });
          }
        });

        archive.pipe(output);
        archive.file(sourceFile, { name: path.basename(sourceFile) });
        archive.finalize();
      } else {
        const input = createReadStream(sourceFile);
        const output = createWriteStream(targetFile);

        let compressStream: Transform;
        if (format === 'gzip') {
          compressStream = zlib.createGzip({ level });
        } else {
          compressStream = zlib.createBrotliCompress({
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: level
            }
          });
        }

        let bytesProcessed = 0;
        const progressTransform = new Transform({
          transform(chunk, encoding, callback) {
            bytesProcessed += chunk.length;
            if (onProgress) {
              onProgress({
                bytesProcessed,
                totalBytes: originalSize,
                progress: Math.round((bytesProcessed / originalSize) * 100)
              });
            }
            callback(null, chunk);
          }
        });

        pipeline(input, progressTransform, compressStream, output)
          .then(() => {
            fs.stat(targetFile).then(compressedStats => {
              resolve({
                compressedSize: compressedStats.size,
                compressionRatio: compressedStats.size / originalSize
              });
            }).catch(reject);
          })
          .catch(reject);
      }
    });
  }

  /**
   * 解压缩文件
   *
   * @param {string} compressedFile - 压缩文件路径
   * @param {string} extractDir - 解压缩目录
   * @param {string} [format] - 压缩格式（自动检测）
   * @returns {Promise<string[]>} 解压缩后的文件列表
   * @static
   */
  static async decompressFile(
    compressedFile: string,
    extractDir: string,
    format?: string
  ): Promise<string[]> {
    // 在处理前检查源文件是否存在
    try {
      await fs.access(compressedFile);
    } catch {
      throw new Error(`压缩文件不存在: ${compressedFile}`);
    }

    await fs.mkdir(extractDir, { recursive: true });

    const fileExt = format || path.extname(compressedFile).toLowerCase();
    const extractedFiles: string[] = [];

    if (fileExt === '.zip') {
      return new Promise((resolve, reject) => {
        createReadStream(compressedFile)
          .pipe(unzipper.Parse())
          .on('entry', (entry: unzipper.Entry) => {
            const fileName = entry.path;
            const type = entry.type;
            
            if (type === 'File') {
              const outputPath = path.join(extractDir, fileName);
              extractedFiles.push(outputPath);
              entry.pipe(createWriteStream(outputPath));
            } else {
              entry.autodrain();
            }
          })
          .on('close', () => resolve(extractedFiles))
          .on('error', reject);
      });
    } else if (fileExt === '.gz' || fileExt === '.gzip') {
      const outputFile = path.join(extractDir, path.basename(compressedFile, '.gz'));
      const input = createReadStream(compressedFile);
      const output = createWriteStream(outputFile);

      await pipeline(input, zlib.createGunzip(), output);
      return [outputFile];
    } else if (fileExt === '.br') {
      const outputFile = path.join(extractDir, path.basename(compressedFile, '.br'));
      const input = createReadStream(compressedFile);
      const output = createWriteStream(outputFile);

      await pipeline(input, zlib.createBrotliDecompress(), output);
      return [outputFile];
    } else {
      throw new Error(`不支持的压缩格式: ${fileExt}`);
    }
  }
}