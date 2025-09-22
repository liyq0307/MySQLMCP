/**
 * 统一导出器模块
 *
 * @fileoverview 提供完整的数据库导出功能，包括Excel、CSV、JSON格式支持
 * @author liyq
 * @since 1.0.0
 * @version 1.0.0
 * @category Backup
 * @subcategory Exporters
 *
 */

import fs from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { EventEmitter } from 'events';
import { MySQLManager } from '../mysqlManager.js';
import { ExportOptions } from '../types/databaseTypes.js';
import { MemoryManager } from '../types/backupTypes.js';
import { ensureDirectoryExists } from '../utils/fileUtils.js';

/**
 * 支持的导出格式类型
 */
export type ExporterType = 'csv' | 'json' | 'excel' | 'xlsx';

/**
 * 导出结果接口
 */
export interface ExportResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  rowCount?: number;
  columnCount?: number;
  format?: string;
  duration?: number;
  error?: string;
}

/**
 * 导出器构造函数类型
 */
export type ExporterConstructor = new (mysqlManager: MySQLManager, memoryManager: MemoryManager) => BaseExporter;

/**
 * 基础导出器抽象类
 *
 * 提供所有导出器的共同功能和接口定义，包括：
 * - 统一的导出流程管理
 * - 内存优化的数据处理
 * - 文件IO操作封装
 * - 事件驱动的进度通知
 * - 错误处理和恢复机制
 */
export abstract class BaseExporter extends EventEmitter {
  protected mysqlManager: MySQLManager;
  protected memoryManager: MemoryManager;
  protected defaultOptions: ExportOptions;

  constructor(mysqlManager: MySQLManager, memoryManager: MemoryManager) {
    super();
    this.mysqlManager = mysqlManager;
    this.memoryManager = memoryManager;
    this.defaultOptions = this.getDefaultOptions();
  }

  /**
   * 获取默认导出选项 - 由子类实现
   */
  protected abstract getDefaultOptions(): ExportOptions;

  /**
   * 获取文件扩展名 - 由子类实现
   */
  protected abstract getFileExtension(): string;

  /**
   * 执行具体的导出操作 - 由子类实现
   */
  protected abstract performExport(
    rows: Record<string, unknown>[],
    options: ExportOptions,
    outputPath: string
  ): Promise<void>;

  /**
   * 主导出方法 - 统一的导出流程
   */
  async export(
    query: string,
    params: unknown[] = [],
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const startTime = Date.now();
    const finalOptions = { ...this.defaultOptions, ...options };

    try {
      // 确保输出目录存在
      await ensureDirectoryExists(finalOptions.outputDir!);

      // 执行查询获取数据
      this.emit('export-start', { query, options: finalOptions });

      const rows = await this.executeQuery(query, params, finalOptions);

      if (!Array.isArray(rows)) {
        throw new Error('查询结果不是数组格式');
      }

      // 生成输出文件路径
      const outputPath = this.generateOutputPath(finalOptions);

      // 执行导出
      await this.performExport(rows, finalOptions, outputPath);

      // 获取文件统计信息
      const stats = await fs.stat(outputPath);
      const duration = Date.now() - startTime;

      const result: ExportResult = {
        success: true,
        filePath: outputPath,
        fileSize: stats.size,
        rowCount: rows.length,
        columnCount: rows.length > 0 ? Object.keys(rows[0]).length : 0,
        format: finalOptions.format,
        duration
      };

      this.emit('export-complete', result);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: ExportResult = {
        success: false,
        error: (error as Error).message,
        duration
      };

      this.emit('export-error', { error: error as Error, options: finalOptions });
      return result;
    }
  }

  /**
   * 执行查询
   */
  private async executeQuery(
    query: string,
    params: unknown[],
    options: ExportOptions
  ): Promise<Record<string, unknown>[]> {
    let finalQuery = query;

    // 应用行数限制
    if (options.maxRows && options.maxRows > 0) {
      finalQuery += ` LIMIT ${options.maxRows}`;
    }

    this.emit('query-start', { query: finalQuery, params });

    const result = await this.mysqlManager.executeQuery(finalQuery, params);

    this.emit('query-complete', { rowCount: Array.isArray(result) ? result.length : 0 });

    return result as Record<string, unknown>[];
  }

  /**
   * 生成输出文件路径
   */
  private generateOutputPath(options: ExportOptions): string {
    let fileName = options.fileName;

    if (!fileName) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fileName = `export_${timestamp}.${this.getFileExtension()}`;
    } else if (!fileName.includes('.')) {
      fileName += `.${this.getFileExtension()}`;
    }

    return path.join(options.outputDir!, fileName);
  }

  /**
   * 创建输出流
   */
  protected createOutputStream(filePath: string): WriteStream {
    return createWriteStream(filePath, { encoding: 'utf8' });
  }

  /**
   * 写入流数据
   */
  protected writeToStream(stream: WriteStream, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!stream.write(data)) {
        stream.once('drain', resolve);
      } else {
        resolve();
      }
      stream.once('error', reject);
    });
  }

  /**
   * 关闭流
   */
  protected closeStream(stream: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.end((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * CSV导出器
 *
 * 提供高效的CSV格式导出功能，支持：
 * - 流式处理大数据集
 * - 自动字符转义和格式化
 * - 批量写入性能优化
 * - 可配置的列头选项
 */
export class CsvExporter extends BaseExporter {
  /**
   * 获取默认导出选项
   */
  protected getDefaultOptions(): ExportOptions {
    return {
      outputDir: './exports',
      format: 'csv',
      includeHeaders: true,
      maxRows: 1000000,
      streaming: true,
      batchSize: 5000
    };
  }

  /**
   * 获取文件扩展名
   */
  protected getFileExtension(): string {
    return 'csv';
  }

  /**
   * 执行CSV导出
   */
  protected async performExport(
    rows: Record<string, unknown>[],
    options: ExportOptions,
    outputPath: string
  ): Promise<void> {
    const stream = this.createOutputStream(outputPath);

    try {
      // 写入CSV头部
      if (options.includeHeaders && rows.length > 0) {
        const headers = Object.keys(rows[0]);
        await this.writeToStream(stream, this.formatCSVRow(headers));
      }

      // 批量写入数据行以提高性能
      const batchSize = options.batchSize || 1000;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        let batchData = '';

        for (const row of batch) {
          const values = Object.values(row).map(val => this.formatCSVValue(val));
          batchData += this.formatCSVRow(values);
        }

        await this.writeToStream(stream, batchData);
      }

      await this.closeStream(stream);
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }

  /**
   * 格式化CSV值
   */
  private formatCSVValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // 如果包含特殊字符，需要用引号包裹
    if (stringValue.includes(',') ||
        stringValue.includes('"') ||
        stringValue.includes('\n') ||
        stringValue.includes('\r')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * 格式化CSV行
   */
  private formatCSVRow(values: string[]): string {
    return values.join(',') + '\n';
  }
}

/**
 * JSON导出器
 *
 * 提供高效的JSON格式导出功能，支持：
 * - 流式JSON数组写入
 * - 自动数据清理和格式化
 * - 批量处理性能优化
 * - 完整的JSON语法兼容
 */
export class JsonExporter extends BaseExporter {
  /**
   * 获取默认导出选项
   */
  protected getDefaultOptions(): ExportOptions {
    return {
      outputDir: './exports',
      format: 'json',
      includeHeaders: true,
      maxRows: 1000000,
      streaming: true,
      batchSize: 5000
    };
  }

  /**
   * 获取文件扩展名
   */
  protected getFileExtension(): string {
    return 'json';
  }

  /**
   * 执行JSON导出
   */
  protected async performExport(
    rows: Record<string, unknown>[],
    options: ExportOptions,
    outputPath: string
  ): Promise<void> {
    const stream = this.createOutputStream(outputPath);

    try {
      // 清理数据中的undefined值
      const cleanedRows = this.cleanData(rows);

      // 写入JSON数组开始
      await this.writeToStream(stream, '[\n');

      // 批量写入数据行以提高性能
      const batchSize = options.batchSize || 1000;
      for (let i = 0; i < cleanedRows.length; i += batchSize) {
        const batch = cleanedRows.slice(i, i + batchSize);
        let batchData = '';

        for (let j = 0; j < batch.length; j++) {
          const jsonString = JSON.stringify(batch[j], null, 2);
          const suffix = (i + j) < cleanedRows.length - 1 ? ',\n' : '\n';
          batchData += jsonString + suffix;
        }

        await this.writeToStream(stream, batchData);
      }

      // 写入JSON数组结束
      await this.writeToStream(stream, ']');

      await this.closeStream(stream);
    } catch (error) {
      stream.destroy();
      throw error;
    }
  }

  /**
   * 清理数据，移除undefined值
   */
  private cleanData(data: Record<string, unknown>[]): Record<string, unknown>[] {
    return data.map(row => {
      const cleanedRow: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value !== undefined) {
          cleanedRow[key] = value;
        }
      }
      return cleanedRow;
    });
  }
}

/**
 * Excel导出器
 *
 * 提供企业级Excel格式导出功能，支持：
 * - 丰富的样式和格式化
 * - 自动列宽调整
 * - 表头样式和冻结
 * - 自动筛选功能
 * - 批量数据处理
 */
export class ExcelExporter extends BaseExporter {
  /**
   * 获取默认导出选项
   */
  protected getDefaultOptions(): ExportOptions {
    return {
      outputDir: './exports',
      format: 'excel',
      sheetName: 'Sheet1',
      includeHeaders: true,
      maxRows: 1000000,
      streaming: true,
      batchSize: 5000
    };
  }

  /**
   * 获取文件扩展名
   */
  protected getFileExtension(): string {
    return 'xlsx';
  }

  /**
   * 执行Excel导出
   */
  protected async performExport(
    rows: Record<string, unknown>[],
    options: ExportOptions,
    outputPath: string
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(options.sheetName || 'Sheet1');

    if (rows.length === 0) {
      // 空数据集，仅保存空工作簿
      await workbook.xlsx.writeFile(outputPath);
      return;
    }

    // 设置列头
    const columns = Object.keys(rows[0]);
    worksheet.columns = columns.map(col => ({
      header: col,
      key: col,
      width: this.calculateColumnWidth(col, rows.slice(0, 100))
    }));

    // 样式化表头
    this.styleHeader(worksheet);

    // 批量添加数据行以提高性能
    const batchSize = options.batchSize || 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      worksheet.addRows(batch);
    }

    // 应用样式
    this.applyStyles(worksheet);

    // 保存文件
    await workbook.xlsx.writeFile(outputPath);
  }

  /**
   * 计算列宽
   */
  private calculateColumnWidth(column: string, sampleRows: Record<string, unknown>[]): number {
    let maxLength = column.length;

    for (const row of sampleRows) {
      const value = row[column];
      if (value != null) {
        const length = String(value).length;
        if (length > maxLength) {
          maxLength = length;
        }
      }
    }

    // 限制最大宽度为50，最小宽度为10
    return Math.min(50, Math.max(10, maxLength + 2));
  }

  /**
   * 样式化表头
   */
  private styleHeader(worksheet: ExcelJS.Worksheet): void {
    const headerRow = worksheet.getRow(1);

    headerRow.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };

    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    headerRow.alignment = {
      vertical: 'middle',
      horizontal: 'center'
    };

    headerRow.height = 25;
  }

  /**
   * 应用表格样式
   */
  private applyStyles(worksheet: ExcelJS.Worksheet): void {
    // 添加边框
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // 隔行着色（除了标题行）
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
      }
    });

    // 冻结首行
    worksheet.views = [{
      state: 'frozen',
      xSplit: 0,
      ySplit: 1
    }];

    // 启用自动筛选
    if (worksheet.rowCount > 1) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount }
      };
    }
  }
}