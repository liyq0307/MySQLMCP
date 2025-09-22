/**
 * MySQL 数据导入工具 - 企业级数据导入解决方案
 *
 * 提供全面的企业级数据库数据导入功能，支持CSV、JSON、Excel、SQL等多种数据格式的高性能批量导入。
 * 集成了智能数据验证、字段映射、事务管理、错误处理、重复检查和性能优化等完整的导入生态系统。
 *
 * @fileoverview MySQL数据导入工具 - 企业级数据导入的完整解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-28
 * @license MIT
 *
 */

import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import { MySQLManager } from './mysqlManager.js';
import { withErrorHandling, withPerformanceMonitoring } from './utils/decorators.js';
import {
  ImportOptions,
  ImportResult,
  ValidationResult,
  FieldMapping,
  ImportProgress} from './types.js';
import { ErrorHandler } from './errorHandler.js';
import { EventEmitter } from 'events';

/**
 * 数据库列定义接口
 */
interface ColumnDefinition {
  Field: string;
  Type: string;
  Null: 'YES' | 'NO';
  Key?: string;
  Default?: string;
  Extra?: string;
}

/**
 * 表结构信息接口
 */
interface TableSchemaInfo {
  columns: ColumnDefinition[];
  primaryKey?: string;
  indexes?: Array<{
    Key_name: string;
    Column_name: string;
    Non_unique: number;
  }>;
}

/**
 * 重复检查候选键接口
 */
interface CandidateKey {
  /** 候选键名称 */
  keyName: string;
  /** 候选键包含的字段 */
  fields: string[];
  /** 是否唯一键 */
  isUnique: boolean;
  /** 优先级 */
  priority: number;
}

/**
 * 重复检查缓存项接口
 */
interface DuplicateCacheItem {
  /** 查询条件（序列化后的WHERE条件） */
  conditionKey: string;
  /** 是否已存在 */
  exists: boolean;
  /** 检查时间 */
  timestamp: number;
}

/**
 * 重复检查配置接口
 */
interface DuplicateCheckConfig {
  /** 是否启用重复检查 */
  enable?: boolean;
  /** 用于重复检查的候选键字段（优先级顺序） */
  candidateKeys?: string[][];
  /** 重复检查的精度等级 */
  precisionLevel?: 'exact' | 'normalized' | 'fuzzy';
  /** 重复检查范围 */
  scope?: 'all' | 'batch' | 'table';
  /** 是否缓存重复检查结果 */
  useCache?: boolean;
  /** 缓存大小限制 */
  cacheSize?: number;
}

/**
 * MySQL 数据导入工具类
 *
 * 基于 EventEmitter 的企业级导入工具，集成了智能验证、字段映射、事务管理、
 * 错误恢复等高级特性。支持CSV、JSON、Excel、SQL等多种数据格式的导入。
 *
 * 主要组件：
 * - 数据验证器：智能数据格式和类型验证
 * - 字段映射器：灵活的字段映射和转换
 * - 导入引擎：不同格式数据的专用导入器
 * - 事务管理器：确保数据一致性的事务控制
 * - 错误处理器：详细错误诊断和分类
 *
 * @class MySQLImportTool
 * @extends EventEmitter
 * @since 1.0.0
 * @version 1.0.0
 */
export class MySQLImportTool extends EventEmitter {

  /** 重复检查缓存 */
  private duplicateCache: Map<string, DuplicateCacheItem> = new Map();
  /** 默认缓存大小 */
  private maxCacheSize: number = 10000;
  /** 当前表格的候选键列表 */
  private currentCandidateKeys: CandidateKey[] = [];

  constructor(private mysqlManager: MySQLManager) {
    super();
    this.setMaxListeners(200);
  }

  /**
   * 从CSV文件导入数据
   *
   * 支持标准CSV格式和自定义分隔符，支持表头识别和字段映射。
   * 提供数据验证、批量插入和错误处理等完整功能。
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ImportResult>} 包含导入结果的JSON格式数据
   * @throws {Error} 当导入失败时抛出
   */
  @withErrorHandling('importFromCSV', 'MSG_CSV_IMPORT_FAILED')
  @withPerformanceMonitoring('csv_import')
  async importFromCSV(options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();

    try {
      const startTime = Date.now();

      // 发送开始进度事件
      if (options.withProgress) {
        const initialProgress = this.createProgress(
          0,
          'fileReading',
          '开始读取CSV文件...',
          0,
          0,
          startTime
        );
        this.emitProgress(initialProgress, options.filePath, 'csv');
      }

      // 验证输入参数
      this.validateImportOptions(options, 'csv');

      // 读取CSV文件内容
      const fileContent = await fs.readFile(options.filePath, {
        encoding: (options.encoding || 'utf8') as BufferEncoding
      });

      // 发送文件读取完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 30, dataParsing: 40, validation: 20, insertion: 10 },
          'fileReading',
          100,
          0,
          0,
          startTime,
          `CSV文件读取完成，大小: ${(fileContent.length / 1024).toFixed(1)} KB`
        );
        this.emitProgress(progress, options.filePath, 'csv');
      }

      // 发送开始解析进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 30, dataParsing: 40, validation: 20, insertion: 10 },
          'dataParsing',
          0,
          0,
          0,
          startTime,
          '开始解析CSV数据...'
        );
        this.emitProgress(progress, options.filePath, 'csv');
      }

      // 解析CSV数据
      const csvData = await this.parseCSV(fileContent, {
        delimiter: options.delimiter || ',',
        quote: options.quote || '"',
        hasHeaders: options.hasHeaders !== false,
        encoding: options.encoding || 'utf8'
      });

      // 发送解析完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 30, dataParsing: 40, validation: 20, insertion: 10 },
          'dataParsing',
          100,
          csvData.length,
          csvData.length,
          startTime,
          `CSV解析完成，共解析 ${csvData.length} 行数据`
        );
        this.emitProgress(progress, options.filePath, 'csv');
      }

      // 执行导入
      const result = await this.executeImport(options.tableName, csvData, options);

      return {
        success: true,
        importedRows: result.importedRows,
        skippedRows: result.skippedRows,
        failedRows: result.failedRows,
        updatedRows: result.updatedRows,
        totalRows: csvData.length,
        duration: Date.now() - startTime,
        batchesProcessed: result.batchesProcessed,
        filePath: options.filePath,
        format: 'csv',
        tableName: options.tableName
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'importFromCSV');
      return {
        success: false,
        importedRows: 0,
        skippedRows: 0,
        failedRows: 0,
        updatedRows: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        batchesProcessed: 0,
        filePath: options.filePath,
        format: 'csv',
        tableName: options.tableName,
        error: safeError.message
      };
    }
  }

  /**
   * 从JSON文件导入数据
   *
   * 支持JSON数组和对象格式，支持嵌套数据结构的扁平化处理。
   * 提供灵活的字段映射和数据转换功能。
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ImportResult>} 包含导入结果的JSON格式数据
   * @throws {Error} 当导入失败时抛出
   */
  @withErrorHandling('importFromJSON', 'MSG_JSON_IMPORT_FAILED')
  @withPerformanceMonitoring('json_import')
  async importFromJSON(options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();

    try {
      const startTime = Date.now();

      // 发送开始进度事件
      if (options.withProgress) {
        const initialProgress = this.createProgress(
          0,
          'fileReading',
          '开始读取JSON文件...',
          0,
          0,
          startTime
        );
        this.emitProgress(initialProgress, options.filePath, 'json');
      }

      // 验证输入参数
      this.validateImportOptions(options, 'json');

      // 读取JSON文件内容
      const fileContent = await fs.readFile(options.filePath, {
        encoding: (options.encoding || 'utf8') as BufferEncoding
      });

      // 发送文件读取完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 60, validation: 15, insertion: 5 },
          'fileReading',
          100,
          0,
          0,
          startTime,
          `JSON文件读取完成，大小: ${(fileContent.length / 1024).toFixed(1)} KB`
        );
        this.emitProgress(progress, options.filePath, 'json');
      }

      // 发送开始解析进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 60, validation: 15, insertion: 5 },
          'dataParsing',
          0,
          0,
          0,
          startTime,
          '开始解析JSON数据...'
        );
        this.emitProgress(progress, options.filePath, 'json');
      }

      // 解析JSON数据
      const jsonData = JSON.parse(fileContent);

      // 处理不同JSON格式
      let processedData: Record<string, unknown>[] = [];
      if (Array.isArray(jsonData)) {
        processedData = jsonData;
      } else if (typeof jsonData === 'object' && jsonData !== null) {
        // 如果是单个对象，转换为数组
        processedData = [jsonData];
      } else {
        throw new Error('JSON文件必须包含对象数组或单个对象');
      }

      // 扁平化嵌套数据（如果需要）
      const flattenStartTime = Date.now();
      processedData = processedData.map(item => this.flattenObject(item));
      const flattenTime = Date.now() - flattenStartTime;

      // 发送解析完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 60, validation: 15, insertion: 5 },
          'dataParsing',
          100,
          processedData.length,
          processedData.length,
          startTime,
          `JSON解析完成，共解析 ${processedData.length} 个对象 ${flattenTime > 0 ? `(扁平化耗时: ${flattenTime}ms)` : ''}`
        );
        this.emitProgress(progress, options.filePath, 'json');
      }

      // 执行导入
      const result = await this.executeImport(options.tableName, processedData, options);

      return {
        success: true,
        importedRows: result.importedRows,
        skippedRows: result.skippedRows,
        failedRows: result.failedRows,
        updatedRows: result.updatedRows,
        totalRows: processedData.length,
        duration: Date.now() - startTime,
        batchesProcessed: result.batchesProcessed,
        filePath: options.filePath,
        format: 'json',
        tableName: options.tableName
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'importFromJSON');
      return {
        success: false,
        importedRows: 0,
        skippedRows: 0,
        failedRows: 0,
        updatedRows: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        batchesProcessed: 0,
        filePath: options.filePath,
        format: 'json',
        tableName: options.tableName,
        error: safeError.message
      };
    }
  }

  /**
   * 从Excel文件导入数据
   *
   * 支持多工作表Excel文件，支持样式保留和复杂数据类型处理。
   * 提供工作表选择和字段映射等高级功能。
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ImportResult>} 包含导入结果的JSON格式数据
   * @throws {Error} 当导入失败时抛出
   */
  @withErrorHandling('importFromExcel', 'MSG_EXCEL_IMPORT_FAILED')
  @withPerformanceMonitoring('excel_import')
  async importFromExcel(options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();

    try {
      const startTime = Date.now();

      // 发送开始进度事件
      if (options.withProgress) {
        const initialProgress = this.createProgress(
          0,
          'fileReading',
          '开始读取Excel文件...',
          0,
          0,
          startTime
        );
        this.emitProgress(initialProgress, options.filePath, 'excel');
      }

      // 验证输入参数
      this.validateImportOptions(options, 'excel');

      // 发送开始加载进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 40, dataParsing: 50, validation: 7, insertion: 3 },
          'fileReading',
          10,
          0,
          0,
          startTime,
          '正在加载Excel工作簿...'
        );
        this.emitProgress(progress, options.filePath, 'excel');
      }

      // 加载Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(options.filePath);

      // 发送加载完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 40, dataParsing: 50, validation: 7, insertion: 3 },
          'fileReading',
          100,
          0,
          0,
          startTime,
          'Excel文件加载完成，正在选择工作表...'
        );
        this.emitProgress(progress, options.filePath, 'excel');
      }

      // 选择工作表
      const worksheetName = options.sheetName || workbook.worksheets[0].name;
      const worksheet = workbook.getWorksheet(worksheetName);

      if (!worksheet) {
        throw new Error(`工作表 '${worksheetName}' 不存在`);
      }

      // 发送开始解析进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 40, dataParsing: 50, validation: 7, insertion: 3 },
          'dataParsing',
          0,
          0,
          0,
          startTime,
          '开始解析Excel数据...'
        );
        this.emitProgress(progress, options.filePath, 'excel');
      }

      // 解析Excel数据
      const excelData: Record<string, unknown>[] = [];
      const rows = worksheet.getSheetValues();

      if (rows.length === 0) {
        throw new Error('Excel文件为空或不包含数据');
      }

      // 处理表头
      const hasHeaders = options.hasHeaders !== false;
      const headers: string[] = [];

      // 发送开始解析进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 40, dataParsing: 50, validation: 7, insertion: 3 },
          'dataParsing',
          0,
          0,
          0,
          startTime,
          '开始解析Excel数据...'
        );
        this.emitProgress(progress, options.filePath, 'excel');
      }

      if (hasHeaders) {
        // 第一行作为表头
        const headerRow = rows[1] as unknown[];
        for (let i = 1; i < headerRow.length; i++) {
          headers.push(String(headerRow[i] || `column_${i}`));
        }
      } else {
        // 生成列名
        const firstDataRow = rows[1] as unknown[];
        for (let i = 1; i < firstDataRow.length; i++) {
          headers.push(`column_${i}`);
        }
      }

      // 处理数据行
      const startRowIndex = hasHeaders ? 2 : 1;
      for (let rowIndex = startRowIndex; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex] as unknown[];
        if (!row || row.length === 0) continue;

        const rowData: Record<string, unknown> = {};
        for (let colIndex = 1; colIndex < headers.length + 1; colIndex++) {
          const value = row[colIndex];
          rowData[headers[colIndex - 1]] = value;
        }

        excelData.push(rowData);
      }

      // 执行导入
      const result = await this.executeImport(options.tableName, excelData, options);

      return {
        success: true,
        importedRows: result.importedRows,
        skippedRows: result.skippedRows,
        failedRows: result.failedRows,
        updatedRows: result.updatedRows,
        totalRows: excelData.length,
        duration: Date.now() - startTime,
        batchesProcessed: result.batchesProcessed,
        filePath: options.filePath,
        format: 'excel',
        tableName: options.tableName
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'importFromExcel');
      return {
        success: false,
        importedRows: 0,
        skippedRows: 0,
        failedRows: 0,
        updatedRows: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        batchesProcessed: 0,
        filePath: options.filePath,
        format: 'excel',
        tableName: options.tableName,
        error: safeError.message
      };
    }
  }

  /**
   * 从SQL文件导入数据
   *
   * 支持SQL脚本文件执行，支持事务管理和错误处理。
   * 提供SQL语句解析和批量执行功能。
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ImportResult>} 包含导入结果的JSON格式数据
   * @throws {Error} 当导入失败时抛出
   */
  @withErrorHandling('importFromSQL', 'MSG_SQL_IMPORT_FAILED')
  @withPerformanceMonitoring('sql_import')
  async importFromSQL(options: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now();

    try {
      const startTime = Date.now();

      // 发送开始进度事件
      if (options.withProgress) {
        const initialProgress = this.createProgress(
          0,
          'fileReading',
          '开始读取SQL文件...',
          0,
          0,
          startTime
        );
        this.emitProgress(initialProgress, options.filePath, 'sql');
      }

      // 验证输入参数
      this.validateImportOptions(options, 'sql');

      // 读取SQL文件内容
      const fileContent = await fs.readFile(options.filePath, {
        encoding: (options.encoding || 'utf8') as BufferEncoding
      });

      // 发送文件读取完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 70, validation: 5, insertion: 5 },
          'fileReading',
          100,
          0,
          0,
          startTime,
          `SQL文件读取完成，大小: ${(fileContent.length / 1024).toFixed(1)} KB`
        );
        this.emitProgress(progress, options.filePath, 'sql');
      }

      // 发送开始解析进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 70, validation: 5, insertion: 5 },
          'dataParsing',
          0,
          0,
          0,
          startTime,
          '开始解析SQL语句...'
        );
        this.emitProgress(progress, options.filePath, 'sql');
      }

      // 解析SQL语句
      const parsingStartTime = Date.now();
      const sqlStatements = this.parseSQLStatements(fileContent);
      const parsingTime = Date.now() - parsingStartTime;

      // 发送解析完成进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 20, dataParsing: 70, validation: 5, insertion: 5 },
          'dataParsing',
          100,
          sqlStatements.length,
          sqlStatements.length,
          startTime,
          `SQL解析完成，共解析 ${sqlStatements.length} 条语句 (耗时: ${parsingTime}ms)`
        );
        this.emitProgress(progress, options.filePath, 'sql');
      }

      // 执行SQL语句
      const result = await this.executeSQLStatements(sqlStatements, options);

      return {
        success: true,
        importedRows: result.affectedRows,
        skippedRows: 0,
        failedRows: result.failedStatements,
        updatedRows: 0,
        totalRows: sqlStatements.length,
        duration: Date.now() - startTime,
        batchesProcessed: 1,
        filePath: options.filePath,
        format: 'sql',
        tableName: options.tableName || 'multiple'
      };

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'importFromSQL');
      return {
        success: false,
        importedRows: 0,
        skippedRows: 0,
        failedRows: 0,
        updatedRows: 0,
        totalRows: 0,
        duration: Date.now() - startTime,
        batchesProcessed: 0,
        filePath: options.filePath,
        format: 'sql',
        tableName: options.tableName || 'multiple',
        error: safeError.message
      };
    }
  }

  /**
   * 通用导入方法 - 根据文件格式自动选择导入方式
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ImportResult>} 导入结果
   */
  @withPerformanceMonitoring('import_data')
  async importData(options: ImportOptions): Promise<ImportResult> {
    const format = options.format || this.detectFileFormat(options.filePath);

    switch (format) {
      case 'csv':
        return this.importFromCSV(options);
      case 'json':
        return this.importFromJSON(options);
      case 'excel':
        return this.importFromExcel(options);
      case 'sql':
        return this.importFromSQL(options);
      default:
        throw new Error(`不支持的文件格式: ${format}`);
    }
  }

  /**
   * 验证数据并生成预览
   *
   * @param {ImportOptions} options - 导入选项配置
   * @returns {Promise<ValidationResult>} 验证结果
   */
  @withPerformanceMonitoring('import_validate')
  async validateImport(options: ImportOptions): Promise<ValidationResult> {
    try {
      // 检测文件格式
      const format = options.format || this.detectFileFormat(options.filePath);

      // 读取文件样本
      const sampleData = await this.readSampleData(options.filePath, format, 10);

      // 验证表结构
      const tableSchema = await this.mysqlManager.getTableSchemaCached(options.tableName);

      // 验证字段映射
      const fieldMapping = this.createFieldMapping(options.fieldMapping || {}, sampleData, tableSchema as TableSchemaInfo);

      // 验证数据类型和约束
      const validationErrors: string[] = [];
      const validationWarnings: string[] = [];

      for (const row of sampleData) {
        const validation = this.validateDataRow(row, fieldMapping, tableSchema as TableSchemaInfo);
        validationErrors.push(...validation.errors);
        validationWarnings.push(...validation.warnings);
      }

      return {
        isValid: validationErrors.length === 0,
        errors: [...new Set(validationErrors)],
        warnings: [...new Set(validationWarnings)],
        suggestions: this.generateValidationSuggestions(validationErrors, validationWarnings),
        validatedRows: sampleData.length,
        invalidRows: validationErrors.length
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [(error as Error).message],
        warnings: [],
        suggestions: ['检查文件格式和表结构是否正确'],
        validatedRows: 0,
        invalidRows: 1
      };
    }
  }

  /**
   * 验证导入选项
   * @private
   */
  private validateImportOptions(options: ImportOptions, format: string): void {
    if (!options.tableName) {
      throw new Error('必须指定目标表名');
    }

    if (!options.filePath) {
      throw new Error('必须指定文件路径');
    }

    // 验证文件是否存在
    // 注意：这里我们不进行同步文件检查，因为fs.access是异步的

    // 格式特定验证
    switch (format) {
      case 'csv':
        if (options.delimiter && options.delimiter.length !== 1) {
          throw new Error('CSV分隔符必须是单个字符');
        }
        break;
      case 'excel':
        if (options.sheetName && typeof options.sheetName !== 'string') {
          throw new Error('Excel工作表名称必须是字符串');
        }
        break;
    }
  }

  /**
   * 解析CSV数据
   * @private
   */
  private async parseCSV(
    content: string,
    options: {
      delimiter: string;
      quote: string;
      hasHeaders: boolean;
      encoding: string;
    }
  ): Promise<Record<string, unknown>[]> {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const result: Record<string, unknown>[] = [];

    if (lines.length === 0) {
      return result;
    }

    // 解析表头
    let headers: string[] = [];
    if (options.hasHeaders) {
      headers = this.parseCSVLine(lines[0], options.delimiter, options.quote);
    }

    // 解析数据行
    const startIndex = options.hasHeaders ? 1 : 0;
    for (let i = startIndex; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], options.delimiter, options.quote);

      if (values.length === 0) continue;

      const row: Record<string, unknown> = {};

      if (options.hasHeaders && headers.length > 0) {
        // 使用表头作为键
        for (let j = 0; j < values.length && j < headers.length; j++) {
          row[headers[j]] = values[j];
        }
      } else {
        // 生成列名
        for (let j = 0; j < values.length; j++) {
          row[`column_${j + 1}`] = values[j];
        }
      }

      result.push(row);
    }

    return result;
  }

  /**
   * 解析CSV行
   * @private
   */
  private parseCSVLine(line: string, delimiter: string, quote: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === quote) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // 添加最后一个值
    result.push(current.trim());

    return result;
  }

  /**
   * 扁平化对象
   * @private
   */
  private flattenObject(obj: unknown, prefix = '', result: Record<string, unknown> = {}): Record<string, unknown> {
    if (!obj || typeof obj !== 'object') {
      return result;
    }

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenObject(value as Record<string, unknown>, newKey, result);
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * 执行导入操作
   * @private
   */
  private async executeImport(
    tableName: string,
    data: Record<string, unknown>[],
    options: ImportOptions
  ): Promise<{
    importedRows: number;
    skippedRows: number;
    failedRows: number;
    updatedRows: number;
    batchesProcessed: number;
  }> {
    const startTime = Date.now();

    // 发送开始进度事件
    if (options.withProgress) {
      const initialProgress = this.createProgress(
        0,
        'initialization',
        '开始导入操作...',
        0,
        data.length,
        startTime
      );
      this.emitProgress(initialProgress, options.filePath, options.format);
    }

    // 获取表结构
    const tableSchema = await this.mysqlManager.getTableSchemaCached(tableName);

    // 发送表结构获取完成进度
    if (options.withProgress) {
      const progress = this.calculateOverallProgress(
        { fileReading: 10, dataParsing: 20, validation: 30, insertion: 40 },
        'validation',
        10,
        0,
        data.length,
        startTime,
        `已获取表 "${tableName}" 的结构信息`
      );
      this.emitProgress(progress, options.filePath, options.format);
    }

    // 初始化候选键信息（用于重复检查优化）
    const duplicateConfig = options.duplicateCheck || {
      enable: !!options.skipDuplicates,
      useCache: true,
      candidateKeys: this.currentCandidateKeys.map(key => key.fields)
    };

    if (duplicateConfig.enable) {
      await this.initializeCandidateKeys(tableName);
    }

     // 创建字段映射
     const fieldMapping = this.createFieldMapping(options.fieldMapping || {}, data, tableSchema as TableSchemaInfo);

     // 发送字段映射完成进度
     if (options.withProgress) {
       const progress = this.calculateOverallProgress(
         { fileReading: 10, dataParsing: 20, validation: 30, insertion: 40 },
         'validation',
         30,
         0,
         data.length,
         startTime,
         '字段映射配置完成'
       );
       this.emitProgress(progress, options.filePath, options.format);
     }

     // 验证所有数据并处理冲突
     const validatedData = [];
     const duplicateData = [];
     let skippedRows = 0;
     let failedRows = 0;

     // 开始数据验证阶段

    // 首先进行数据验证
    const validatedRowsWithIndex: Array<{ row: Record<string, unknown>; index: number }> = [];
    const validationErrors: Array<{ index: number; errors: string[]; row: Record<string, unknown> }> = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const validation = this.validateDataRow(row, fieldMapping, tableSchema as TableSchemaInfo);

      // 发送验证进度（每处理10%或100行发送一次）
      if (options.withProgress && (i % Math.max(100, Math.floor(data.length / 20)) === 0 || i === data.length - 1)) {
        const validationProgress = ((i + 1) / data.length * 50); // 验证占50%的进度
        const progress = this.calculateOverallProgress(
          { fileReading: 10, dataParsing: 20, validation: 70, insertion: 20 },
          'validation',
          validationProgress,
          i + 1,
          data.length,
          startTime,
          `正在验证数据格式... (${i + 1}/${data.length})`
        );
        this.emitProgress(progress, options.filePath, options.format);
      }

      // 如果数据验证失败，根据策略处理
      if (validation.errors.length > 0) {
        if (options.conflictStrategy === 'error') {
          this.emit('importError', {
            rowIndex: i + 1,
            errors: validation.errors,
            row: row
          });
          throw new Error(`数据验证失败（第${i + 1}行）: ${validation.errors.join(', ')}`);
        } else {
          failedRows++;
          validationErrors.push({
            index: i,
            errors: validation.errors,
            row: row
          });
          continue;
        }
      }

      // 记录验证通过的行及其索引
      validatedRowsWithIndex.push({ row, index: i });
    }

    // 执行批量重复检查
    let duplicateResults: boolean[] = [];
    if (duplicateConfig.enable && validatedRowsWithIndex.length > 0) {
      this.emit('bulk-duplicate-check-started', {
        tableName,
        rowCount: validatedRowsWithIndex.length,
        config: duplicateConfig
      });

      // 发送重复检查进度
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 10, dataParsing: 20, validation: 70, insertion: 20 },
          'validation',
          60,
          validatedRowsWithIndex.length,
          data.length,
          startTime,
          `正在进行重复数据检查...`
        );
        this.emitProgress(progress, options.filePath, options.format);
      }

      try {
        const rowsToCheck = validatedRowsWithIndex.map(item => item.row);
        duplicateResults = await this.batchCheckDuplicates(
          tableName,
          rowsToCheck,
          fieldMapping,
          { config: duplicateConfig, batchSize: options.batchSize || 200 }
        );

        this.emit('bulk-duplicate-check-completed', {
          tableName,
          processedRows: duplicateResults.length,
          duplicateCount: duplicateResults.filter(exists => exists).length,
          duration: Date.now() - startTime
        });
      } catch (error) {
        this.emit('bulk-duplicate-check-error', {
          tableName,
          error: ErrorHandler.safeError(error, 'executeImport').message
        });

        if (duplicateConfig.precisionLevel === 'exact') {
          throw error;
        }
      }
    }

    // 处理验证结果
    for (let i = 0; i < validatedRowsWithIndex.length; i++) {
      const { row, index } = validatedRowsWithIndex[i];
      const isDuplicate = duplicateResults[i];

      if (isDuplicate) {
        // 根据冲突处理策略执行相应操作
        switch (options.conflictStrategy) {
          case 'skip':
            skippedRows++;
            this.emit('duplicateSkipped', {
              rowIndex: index + 1,
              row: row,
              strategy: 'skip'
            });
            continue;

          case 'update':
            duplicateData.push(this.mapDataRow(row, fieldMapping));
            this.emit('duplicateDetected', {
              rowIndex: index + 1,
              row: row,
              strategy: 'update'
            });
            break;

          case 'error':
          default:
            throw new Error(`检测到重复数据（第${index + 1}行），策略设置为停止导入`);
        }
      } else {
        // 非重复数据，直接添加
        validatedData.push(this.mapDataRow(row, fieldMapping));
      }
    }

    // 批量插入新数据和更新重复数据
    const batchSize = options.batchSize || 1000;
    let importedRows = 0;
    let updatedRows = 0;
    let batchesProcessed = 0;

    // 发送验证完成，开始插入阶段
    if (options.withProgress) {
      const progress = this.calculateOverallProgress(
        { fileReading: 10, dataParsing: 20, validation: 50, insertion: 20 },
        'insertion',
        0,
        data.length,
        data.length,
        startTime,
        `数据验证完成，开始插入数据... (${validatedData.length} 行待插入)`
      );
      this.emitProgress(progress, options.filePath, options.format);
    }

    // 首先处理新数据的插入
    if (validatedData.length > 0) {
      if (options.useTransaction) {
        // 使用事务
        const dataRows: unknown[][] = validatedData.map(row => Object.values(row));
        const result = await this.mysqlManager.executeBatchInsert(tableName, Object.keys(validatedData[0]), dataRows);
        importedRows = result.totalRowsProcessed;
        batchesProcessed = result.batchesProcessed;

        // 发送事务插入完成进度
        if (options.withProgress) {
          const progress = this.calculateOverallProgress(
            { fileReading: 10, dataParsing: 20, validation: 50, insertion: 20 },
            'insertion',
            100,
            data.length,
            data.length,
            startTime,
            `事务中成功插入 ${importedRows} 行数据`
          );
          this.emitProgress(progress, options.filePath, options.format);
        }
      } else {
        // 逐批插入
        for (let i = 0; i < validatedData.length; i += batchSize) {
          const batch = validatedData.slice(i, i + batchSize);
          const dataRows: unknown[][] = batch.map(row => Object.values(row));
          const result = await this.mysqlManager.executeBatchInsert(tableName, Object.keys(batch[0]), dataRows);
          importedRows += result.totalRowsProcessed;
          batchesProcessed++;

          // 发送批量插入进度
          if (options.withProgress) {
            const insertionProgress = (i + batch.length) / validatedData.length * 100;
            const progress = this.calculateOverallProgress(
              { fileReading: 10, dataParsing: 20, validation: 50, insertion: 20 },
              'insertion',
              insertionProgress,
              data.length - (validatedData.length - (i + batch.length)),
              data.length,
              startTime,
              `正在插入数据... (${Math.floor(insertionProgress)}%) - 已处理 ${i + batch.length}/${validatedData.length} 行`
            );
            this.emitProgress(progress, options.filePath, options.format);
          }
        }
      }
    }

    // 处理重复数据的更新
    if (duplicateData.length > 0) {
      if (options.withProgress) {
        const progress = this.calculateOverallProgress(
          { fileReading: 10, dataParsing: 20, validation: 50, insertion: 20 },
          'insertion',
          90,
          data.length,
          data.length,
          startTime,
          `正在更新 ${duplicateData.length} 行重复数据...`
        );
        this.emitProgress(progress, options.filePath, options.format);
      }

      updatedRows = await this.handleDuplicateUpdates(tableName, duplicateData, fieldMapping, options);
    }

    // 发送完成进度事件
    if (options.withProgress) {
      const finalProgress = this.createProgress(
        100,
        'completed',
        `导入完成! 总共处理 ${data.length} 行数据，成功导入 ${importedRows + updatedRows} 行`,
        data.length,
        data.length,
        startTime
      );
      this.emitProgress(finalProgress, options.filePath, options.format);
    }

    return {
      importedRows,
      skippedRows,
      failedRows,
      updatedRows,
      batchesProcessed
    };
  }

  /**
   * 解析SQL语句
   * @private
   */
  private parseSQLStatements(content: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const nextChar = content[i + 1];

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar && content[i - 1] !== '\\') {
        inQuotes = false;
      } else if (!inQuotes && char === ';' && nextChar && !nextChar.match(/\s/)) {
        currentStatement += char;
        statements.push(currentStatement.trim());
        currentStatement = '';
        continue;
      }

      currentStatement += char;
    }

    // 添加最后一个语句（如果没有分号）
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim());
    }

    return statements.filter(stmt => stmt.length > 0);
  }

  /**
   * 执行SQL语句
   * @private
   */
  private async executeSQLStatements(
    statements: string[],
    options: ImportOptions
  ): Promise<{
    affectedRows: number;
    failedStatements: number;
  }> {
    let totalAffectedRows = 0;
    let failedStatements = 0;

    if (options.useTransaction) {
      // 使用事务批量执行
      const queries = statements.map(sql => ({ sql, params: [] }));
      const result = await this.mysqlManager.executeBatchQueries(queries);
      totalAffectedRows = (result as Record<string, unknown>[]).reduce((sum: number, r) => {
        if (r && typeof r === 'object' && 'affectedRows' in r) {
          return sum + ((r.affectedRows as number) || 0);
        }
        return sum;
      }, 0);
    } else {
      // 逐条执行
      for (const statement of statements) {
        try {
          const result = await this.mysqlManager.executeQuery(statement);
          if (result && typeof result === 'object' && 'affectedRows' in result) {
            totalAffectedRows += (result as { affectedRows: number }).affectedRows || 0;
          }
        } catch (error) {
          failedStatements++;
          console.warn(`SQL语句执行失败: ${(error as Error).message}`);
        }
      }
    }

    return {
      affectedRows: totalAffectedRows,
      failedStatements
    };
  }

  /**
   * 检测文件格式
   * @private
   */
  private detectFileFormat(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.csv':
        return 'csv';
      case '.json':
        return 'json';
      case '.xlsx':
      case '.xls':
        return 'excel';
      case '.sql':
        return 'sql';
      default:
        throw new Error(`无法检测文件格式: ${ext}`);
    }
  }

  /**
   * 读取样本数据
   * @private
   */
  private async readSampleData(
    filePath: string,
    format: string,
    sampleSize: number
  ): Promise<Record<string, unknown>[]> {
    switch (format) {
      case 'csv': {
        const csvContent = await fs.readFile(filePath, 'utf8');
        const csvLines = csvContent.split('\n').slice(0, sampleSize + 1);
        return this.parseCSV(csvLines.join('\n'), {
          delimiter: ',',
          quote: '"',
          hasHeaders: true,
          encoding: 'utf8'
        });
      }

      case 'json': {
        const jsonContent = await fs.readFile(filePath, 'utf8');
        const jsonData = JSON.parse(jsonContent);
        if (Array.isArray(jsonData)) {
          return jsonData.slice(0, sampleSize);
        } else {
          return [jsonData];
        }
      }

      case 'excel': {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        const rows = worksheet.getSheetValues();
        const sampleRows: Record<string, unknown>[] = [];

        for (let i = 1; i < Math.min(rows.length, sampleSize + 1); i++) {
          const row = rows[i] as unknown[];
          const rowData: Record<string, unknown> = {};
          for (let j = 1; j < row.length; j++) {
            rowData[`column_${j}`] = row[j];
          }
          sampleRows.push(rowData);
        }
        return sampleRows;
      }

      default:
        return [];
    }
  }

  /**
   * 创建字段映射
   * @private
   */
  private createFieldMapping(
    userMapping: Record<string, string>,
    sampleData: Record<string, unknown>[],
    tableSchema: TableSchemaInfo
  ): FieldMapping[] {
    const mappings: FieldMapping[] = [];
    const tableColumns = tableSchema.columns || [];

    // 如果提供了用户映射，使用用户映射
    if (Object.keys(userMapping).length > 0) {
      for (const [sourceField, targetField] of Object.entries(userMapping)) {
        const column = tableColumns.find((col) => col.Field === targetField);
        if (column) {
          mappings.push({
            sourceField,
            targetField,
            typeConversion: 'auto',
            required: column.Null === 'NO'
          });
        }
      }
    } else {
      // 自动映射：使用相同的字段名
      const sourceFields = Object.keys(sampleData[0] || {});
      for (const sourceField of sourceFields) {
        const column = tableColumns.find((col) => col.Field === sourceField);
        if (column) {
          mappings.push({
            sourceField,
            targetField: sourceField,
            typeConversion: 'auto',
            required: column.Null === 'NO'
          });
        }
      }
    }

    return mappings;
  }

  /**
   * 验证数据行
   * @private
   */
  private validateDataRow(
    row: Record<string, unknown>,
    fieldMapping: FieldMapping[],
    tableSchema: TableSchemaInfo
  ): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const tableColumns = tableSchema.columns || [];

    for (const mapping of fieldMapping) {
      const sourceValue = row[mapping.sourceField];
      const column = tableColumns.find((col) => col.Field === mapping.targetField);

      if (!column) {
        errors.push(`目标字段不存在: ${mapping.targetField}`);
        continue;
      }

      // 检查必填字段
      if (mapping.required && (sourceValue === null || sourceValue === undefined || sourceValue === '')) {
        errors.push(`必填字段为空: ${mapping.targetField}`);
      }

      // 类型验证
      if (sourceValue !== null && sourceValue !== undefined) {
        const typeError = this.validateDataType(sourceValue, column.Type, mapping.targetField);
        if (typeError) {
          errors.push(typeError);
        }
      }

      // 长度验证
      if (typeof sourceValue === 'string' && column.Type.includes('varchar')) {
        const maxLength = parseInt(column.Type.match(/varchar\((\d+)\)/)?.[1] || '255');
        if (sourceValue.length > maxLength) {
          errors.push(`字段长度超过限制: ${mapping.targetField} (${sourceValue.length} > ${maxLength})`);
        }
      }
    }

    return { errors, warnings };
  }

  /**
   * 验证数据类型
   * @private
   */
  private validateDataType(value: unknown, columnType: string, fieldName: string): string | null {
    const valueType = typeof value;

    if (columnType.includes('int') && valueType !== 'number' && !/^\d+$/.test(String(value))) {
      return `字段类型不匹配: ${fieldName} 期望数字，得到 ${valueType}`;
    }

    if (columnType.includes('varchar') && valueType !== 'string') {
      return `字段类型不匹配: ${fieldName} 期望字符串，得到 ${valueType}`;
    }

    if (columnType.includes('decimal') && valueType !== 'number') {
      return `字段类型不匹配: ${fieldName} 期望数字，得到 ${valueType}`;
    }

    return null;
  }

  /**
   * 检查重复数据
   * @private
   */
  private async checkDuplicate(
    tableName: string,
    row: Record<string, unknown>,
    fieldMapping: FieldMapping[],
    options?: { config?: DuplicateCheckConfig; useCache?: boolean }
  ): Promise<boolean> {
    const startTime = Date.now();
    const useCache = options?.useCache ?? options?.config?.useCache ?? true;
    const config = options?.config;

    try {
      // 获取用于重复检查的字段列表
      const duplicateFields = this.getDuplicateCheckFields(fieldMapping, config);

      if (duplicateFields.length === 0) {
        this.emit('duplicate-check-info', {
          message: '未找到用于重复检查的字段',
          tableName,
          rowIndex: row._rowIndex || 'unknown'
        });
        return false;
      }

      // 生成查询条件
      const conditionData = this.buildDuplicateCondition(row, duplicateFields);

      // 没有任何可用于检查的条件
      if (conditionData.queryConditions.length === 0) {
        return false; 
      }

      // 检查缓存
      if (useCache) {
        const cacheHit = this.checkDuplicateCache(conditionData.queryKey);
        if (cacheHit !== null) {
          return cacheHit;
        }
      }

      // 执行数据库查询检查
      const isDuplicate = await this.executeDuplicateQuery(tableName, conditionData);

      // 缓存查询结果
      if (useCache) {
        this.setDuplicateCache(conditionData.queryKey, isDuplicate);
      }

      // 记录重复检查性能
      const duration = Date.now() - startTime;
      // 检查耗时超过100ms时记录
      if (duration > 100) { 
        this.emit('duplicate-check-slow', {
          tableName,
          duration,
          fieldCount: duplicateFields.length,
          queryConditions: conditionData.queryConditions.length
        });
      }

      return isDuplicate;

    } catch (error) {
      const safeError = ErrorHandler.safeError(error, 'checkDuplicate');
      this.emit('duplicate-check-error', {
        error: safeError.message,
        tableName,
        originalError: error
      });

      // 根据配置决定是否在出错时返回true
      return config?.precisionLevel === 'exact' ? true : false;
    }
  }

  /**
   * 获取用于重复检查的字段列表
   * @private
   */
  private getDuplicateCheckFields(fieldMapping: FieldMapping[], config?: DuplicateCheckConfig): FieldMapping[] {
    // 首先尝试使用配置中指定的候选键
    if (config?.candidateKeys && config.candidateKeys.length > 0) {
      const candidateFields: FieldMapping[] = [];

      for (const keyFields of config.candidateKeys) {
        const keyMappings: FieldMapping[] = [];

        for (const fieldName of keyFields) {
          const mapping = fieldMapping.find(f => f.targetField === fieldName);
          if (mapping) {
            keyMappings.push(mapping);
          }
        }

        if (keyMappings.length === keyFields.length) {
          candidateFields.push(...keyMappings);
          break; // 使用第一个完整匹配的候选键
        }
      }

      if (candidateFields.length > 0) {
        return candidateFields;
      }
    }

    // 使用映射中指定用于重复检查的字段
    const explicitFields = fieldMapping.filter(mapping => mapping.checkDuplicate === true);
    if (explicitFields.length > 0) {
      return explicitFields;
    }

    // 最后使用主键或非空必填字段
    const primaryKeyFields = fieldMapping.filter(mapping =>
      mapping.required && mapping.targetField
    );

    if (primaryKeyFields.length > 0) {
      return primaryKeyFields;
    }

    // 作为最后的备选，使用所有映射字段
    return fieldMapping.filter(mapping => mapping.sourceField && mapping.targetField);
  }

  /**
   * 构建重复检查查询条件
   * @private
   */
  private buildDuplicateCondition(
    row: Record<string, unknown>,
    duplicateFields: FieldMapping[]
  ): {
    queryConditions: string[];
    queryParams: unknown[];
    queryKey: string;
  } {
    const queryConditions: string[] = [];
    const queryParams: unknown[] = [];
    const conditionParts: string[] = [];

    for (const mapping of duplicateFields) {
      const value = row[mapping.sourceField];

      if (value !== null && value !== undefined) {
        let paramValue = value;

        // 根据精度等级处理值
        if (value instanceof Date) {
          paramValue = value.toISOString();
        } else if (typeof value === 'string') {
          paramValue = value.trim();
        }

        queryConditions.push(`\`${mapping.targetField}\` = ?`);
        queryParams.push(paramValue);
        conditionParts.push(`${mapping.targetField}:${String(paramValue)}`);
      }
    }

    // 生成查询键用于缓存
    const queryKey = conditionParts.join('|');

    return {
      queryConditions,
      queryParams,
      queryKey
    };
  }

  /**
   * 执行重复检查数据库查询
   * @private
   */
  private async executeDuplicateQuery(
    tableName: string,
    conditionData: { queryConditions: string[]; queryParams: unknown[] }
  ): Promise<boolean> {
    if (conditionData.queryConditions.length === 0) {
      return false;
    }

    const query = `SELECT 1 FROM \`${tableName}\` WHERE ${conditionData.queryConditions.join(' AND ')} LIMIT 1`;
    const result = await this.mysqlManager.executeQuery(query, conditionData.queryParams);

    return Array.isArray(result) && result.length > 0;
  }

  /**
   * 检查重复检查缓存
   * @private
   */
  private checkDuplicateCache(conditionKey: string): boolean | null {
    const cacheItem = this.duplicateCache.get(conditionKey);

    if (!cacheItem) {
      return null; // 未缓存
    }

    // 检查缓存是否过期（例如，可扩展为时间-based过期）
    const now = Date.now();

    // 如果缓存项存在且未过期，返回结果
    if (now - cacheItem.timestamp < 3600000) { // 1小时缓存
      return cacheItem.exists;
    } else {
      // 过期，移除缓存条目
      this.duplicateCache.delete(conditionKey);
      return null;
    }
  }

  /**
   * 设置重复检查缓存
   * @private
   */
  private setDuplicateCache(conditionKey: string, exists: boolean): void {
    // 检查缓存大小限制
    if (this.duplicateCache.size >= this.maxCacheSize) {
      // 使用LRU策略清除最老的项目
      const firstKey = this.duplicateCache.keys().next().value;
      if (firstKey) {
        this.duplicateCache.delete(firstKey);
      }
    }

    this.duplicateCache.set(conditionKey, {
      conditionKey,
      exists,
      timestamp: Date.now()
    });
  }

  /**
   * 批量重复检查
   * @private
   */
  private async batchCheckDuplicates(
    tableName: string,
    rows: Record<string, unknown>[],
    fieldMapping: FieldMapping[],
    options?: { config?: DuplicateCheckConfig; batchSize?: number }
  ): Promise<boolean[]> {
    const results: boolean[] = [];
    const batchSize = options?.batchSize || 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(row => this.checkDuplicate(tableName, row, fieldMapping, options))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // 处理 Promise 失败的情况
          this.emit('duplicate-check-batch-error', {
            error: result.reason.message,
            rowIndex: i + j,
            batchIndex: Math.floor(i / batchSize)
          });
          results.push(false); // 出错时默认返回不重复
        }
      }
    }

    return results;
  }

  /**
   * 初始化表格的候选键信息
   * @private
   */
  private async initializeCandidateKeys(tableName: string): Promise<void> {
    try {
      const schema = await this.mysqlManager.getTableSchemaCached(tableName);

      if (!schema) {
        return;
      }

      const candidateKeys: CandidateKey[] = [];

      // 首先收集主键
      const primaryKeyColumns = (schema as TableSchemaInfo).indexes?.filter(
        idx => idx.Key_name === 'PRIMARY'
      ) || [];

      if (primaryKeyColumns.length > 0) {
        const primaryKey: CandidateKey = {
          keyName: 'PRIMARY',
          fields: primaryKeyColumns.map(idx => idx.Column_name),
          isUnique: true,
          priority: 100
        };
        candidateKeys.push(primaryKey);
      }

      // 收集唯一索引
      const uniqueIndexes = (schema as TableSchemaInfo).indexes?.filter(
        idx => idx.Non_unique === 0 && idx.Key_name !== 'PRIMARY'
      ) || [];

      const uniqueIndexGroups = uniqueIndexes.reduce((groups, idx) => {
        if (!groups[idx.Key_name]) {
          groups[idx.Key_name] = [];
        }
        groups[idx.Key_name].push(idx.Column_name);
        return groups;
      }, {} as Record<string, string[]>);

      Object.entries(uniqueIndexGroups).forEach(([keyName, fields], index) => {
        const candidateKey: CandidateKey = {
          keyName: keyName,
          fields: fields,
          isUnique: true,
          priority: 90 - index
        };
        candidateKeys.push(candidateKey);
      });

      // 收集普通索引（优先级较低）
      const regularIndexes = (schema as TableSchemaInfo).indexes?.filter(
        idx => idx.Non_unique === 1
      ) || [];

      const regularIndexGroups = regularIndexes.reduce((groups, idx) => {
        if (!groups[idx.Key_name]) {
          groups[idx.Key_name] = [];
        }
        groups[idx.Key_name].push(idx.Column_name);
        return groups;
      }, {} as Record<string, string[]>);

      Object.entries(regularIndexGroups).forEach(([keyName, fields], index) => {
        const candidateKey: CandidateKey = {
          keyName: keyName,
          fields: fields,
          isUnique: false,
          priority: 50 - index
        };
        candidateKeys.push(candidateKey);
      });

      candidateKeys.sort((a, b) => b.priority - a.priority);
      this.currentCandidateKeys = candidateKeys;

      this.emit('candidate-keys-initialized', {
        tableName,
        candidateKeys: candidateKeys.map(key => ({
          keyName: key.keyName,
          fields: key.fields,
          isUniqueKey: key.isUnique,
          priority: key.priority
        }))
      });

    } catch (error) {
      this.emit('candidate-keys-error', {
        tableName,
        error: ErrorHandler.safeError(error, 'initializeCandidateKeys').message
      });
    }
  }

  /**
   * 清理重复检查缓存
   */
  public clearDuplicateCache(): void {
    this.duplicateCache.clear();
    this.currentCandidateKeys = [];
    this.emit('cache-cleared', {
      cacheType: 'duplicate-cache',
      itemsCleared: this.duplicateCache.size
    });
  }

  /**
   * 获取重复检查缓存统计信息
   */
  public getDuplicateCacheStats(): {
    cacheSize: number;
    maxCacheSize: number;
    cacheHitRatio: number;
    candidateKeysCount: number;
  } {
    return {
      cacheSize: this.duplicateCache.size,
      maxCacheSize: this.maxCacheSize,
      cacheHitRatio: 0, // 可以后续扩展跟踪hit/miss统计
      candidateKeysCount: this.currentCandidateKeys.length
    };
  }

  /**
   * 映射数据行
   * @private
   */
  private mapDataRow(
    row: Record<string, unknown>,
    fieldMapping: FieldMapping[]
  ): Record<string, unknown> {
    const mappedRow: Record<string, unknown> = {};

    for (const mapping of fieldMapping) {
      const value = row[mapping.sourceField];

      // 类型转换
      let convertedValue = value;
      if (mapping.typeConversion === 'number' && typeof value === 'string') {
        convertedValue = parseFloat(value as string);
      } else if (mapping.typeConversion === 'boolean' && typeof value === 'string') {
        convertedValue = value === 'true' || value === '1';
      }

      mappedRow[mapping.targetField] = convertedValue;
    }

    return mappedRow;
  }

  /**
   * 处理重复数据更新
   * @private
   */
  private async handleDuplicateUpdates(
    tableName: string,
    duplicateData: Record<string, unknown>[],
    fieldMapping: FieldMapping[],
    options: ImportOptions
  ): Promise<number> {
    let updatedRows = 0;

    // 获取表的键字段（用于WHERE条件）
    const primaryKeyFields = fieldMapping.filter(mapping => mapping.required && mapping.sourceField);

    if (primaryKeyFields.length === 0) {
      this.emit('error', new Error('无法更新记录：未找到主键或必需字段'));
      return 0;
    }

    // 批量更新重复数据
    for (const row of duplicateData) {
      try {
        const whereConditions: string[] = [];
        const whereParams: unknown[] = [];
        const setValues: Record<string, unknown> = {};

        // 构建WHERE条件（基于主键）
        for (const mapping of primaryKeyFields) {
          const value = row[mapping.targetField];
          if (value !== null && value !== undefined) {
            whereConditions.push(`\`${mapping.targetField}\` = ?`);
            whereParams.push(value);
          }
        }

        // 构建SET值（排除主键字段）
        for (const mapping of fieldMapping) {
          if (!primaryKeyFields.some(pk => pk.targetField === mapping.targetField)) {
            setValues[mapping.targetField] = row[mapping.targetField];
          }
        }

        if (whereConditions.length === 0 || Object.keys(setValues).length === 0) {
          continue; // 跳过无法更新的行
        }

        const setClause = Object.keys(setValues).map(field => `\`${field}\` = ?`).join(', ');
        const setParams = Object.values(setValues);
        const query = `UPDATE \`${tableName}\` SET ${setClause} WHERE ${whereConditions.join(' AND ')}`;

        await this.mysqlManager.executeQuery(query, [...setParams, ...whereParams]);
        updatedRows++;

        this.emit('rowUpdated', {
          tableName,
          updatedValues: setValues,
          whereConditions: whereConditions.join(' AND ')
        });

      } catch (error) {
        this.emit('updateError', {
          error: ErrorHandler.safeError(error, 'handleDuplicateUpdates'),
          row: row
        });
        // 根据策略处理更新错误
        if (options.conflictStrategy === 'error') {
          throw new Error(`更新重复数据失败: ${ErrorHandler.safeError(error, 'handleDuplicateUpdates').message}`);
        }
      }
    }

    return updatedRows;
  }

  /**
   /**
    * 生成验证建议
    * @private
    */
   private generateValidationSuggestions(errors: string[], warnings: string[]): string[] {
     const suggestions: string[] = [];

     if (errors.some(e => e.includes('类型不匹配'))) {
       suggestions.push('检查数据类型是否与表结构匹配');
     }

     if (errors.some(e => e.includes('必填字段为空'))) {
       suggestions.push('确保所有必填字段都有值');
     }

     if (errors.some(e => e.includes('长度超过限制'))) {
       suggestions.push('调整字段长度或截断数据');
     }

     if (warnings.length > 0) {
       suggestions.push('考虑清理或转换警告的数据');
     }

     return suggestions;
   }

   /**
    * 创建进度信息对象
    * @private
    */
   private createProgress(
     progress: number,
     stage: string,
     message: string,
     processedRows: number,
     totalRows: number,
     startTime: number
   ): ImportProgress {
     const currentTime = Date.now();
     const elapsed = currentTime - startTime;

     let estimatedTimeRemaining: number | undefined;
     let currentSpeed: number | undefined;

     if (progress > 0 && progress < 100) {
       const remainingProgress = 100 - progress;
       const timePerPercent = elapsed / progress;
       estimatedTimeRemaining = timePerPercent * remainingProgress;
       currentSpeed = (processedRows / elapsed) * 1000; // 行/秒
     }

     return {
       progress,
       stage,
       message,
       processedRows,
       totalRows,
       startTime: new Date(startTime),
       estimatedTimeRemaining,
       currentSpeed
     };
   }

   /**
    * 发送进度事件
    * @private
    */
   private emitProgress(progress: ImportProgress, filePath: string, format: string): void {
     this.emit('progress', {
       ...progress,
       filePath,
       format
     });
   }

   /**
    * 计算总体进度
    * @private
    */
   private calculateOverallProgress(
     stageWeights: { fileReading: number; dataParsing: number; validation: number; insertion: number },
     currentStage: keyof typeof stageWeights,
     stageProgress: number,
     processedRows: number,
     totalRows: number,
     startTime: number,
     message: string
   ): ImportProgress {
     const weights = Object.values(stageWeights);
     const stages = Object.keys(stageWeights) as (keyof typeof stageWeights)[];

     let overallProgress = 0;
     for (let i = 0; i < stages.length; i++) {
       const stage = stages[i];
       const weight = weights[i];
       if (stage === currentStage) {
         overallProgress += weight * (stageProgress / 100);
         break;
       } else {
         overallProgress += weight;
       }
     }

     return this.createProgress(
       overallProgress,
       currentStage,
       message,
       processedRows,
       totalRows,
       startTime
     );
   }
}