/**
 * 数据库相关类型定义
 *
 * @fileoverview 数据库操作、查询结果和连接状态相关类型
 * @author liyq
 * @since 1.0.0
 */

/**
 * 查询结果类型联合
 *
 * SELECT 查询返回数组格式的结果
 * INSERT/UPDATE/DELETE 等修改操作返回受影响行数和插入ID
 * 详细信息查询返回完整的查询统计信息
 */
export type QueryResult =
  /** SELECT 查询结果：数据行数组，每行是一个键值对对象 */
  | Array<Record<string, unknown>>
  /** 插入/更新/删除结果：包含受影响的行数和可选的插入ID */
  | { affectedRows: number; insertId?: number }
  /** 详细查询结果：包含字段数量、受影响行数、插入ID、服务器状态等完整信息 */
  | {
      /** 查询返回的字段数量 */
      fieldCount: number;
      /** 受影响的行数 */
      affectedRows: number;
      /** 插入操作的ID（自增主键） */
      insertId: number;
      /** 服务器返回的附加信息 */
      info: string;
      /** 服务器状态码 */
      serverStatus: number;
      /** 警告状态码 */
      warningStatus: number;
    };

/**
 * 备份选项接口
 */
export interface BackupOptions {
  /** 输出目录 */
  outputDir?: string;
  /** 是否压缩 */
  compress?: boolean;
  /** 是否包含数据 */
  includeData?: boolean;
  /** 是否包含结构 */
  includeStructure?: boolean;
  /** 要备份的表（为空则备份所有表） */
  tables?: string[];
  /** 备份文件名前缀 */
  filePrefix?: string;
  /** 最大备份文件大小（MB） */
  maxFileSize?: number;
}

/**
 * 导出选项接口
 */
export interface ExportOptions {
  /** 输出目录 */
  outputDir?: string;
  /** 导出格式 */
  format?: 'excel' | 'csv' | 'json';
  /** 工作表名称（Excel格式） */
  sheetName?: string;
  /** 是否包含列头 */
  includeHeaders?: boolean;
  /** 最大行数限制 */
  maxRows?: number;
  /** 文件名 */
  fileName?: string;
  /** 是否启用流式处理 */
  streaming?: boolean;
  /** 批处理大小 */
  batchSize?: number;
}

/**
 * 备份结果接口
 */
export interface BackupResult {
  /** 备份是否成功 */
  success: boolean;
  /** 备份文件路径（成功时存在） */
  filePath?: string;
  /** 备份文件大小（字节） */
  fileSize?: number;
  /** 备份的表数量 */
  tableCount?: number;
  /** 备份的记录总数 */
  recordCount?: number;
  /** 备份耗时（毫秒） */
  duration?: number;
  /** 错误信息（失败时存在） */
  error?: string;
}

/**
 * 导出结果接口
 */
export interface ExportResult {
  /** 导出是否成功 */
  success: boolean;
  /** 导出文件路径（成功时存在） */
  filePath?: string;
  /** 导出文件大小（字节） */
  fileSize?: number;
  /** 导出的行数 */
  rowCount?: number;
  /** 导出的列数 */
  columnCount?: number;
  /** 导出格式（excel/csv/json） */
  format?: string;
  /** 导出耗时（毫秒） */
  duration?: number;
  /** 错误信息（失败时存在） */
  error?: string;
  /** 处理模式（直接处理或流式处理） */
  processingMode?: 'direct' | 'streaming';
}

/**
 * 报表配置接口
 */
export interface ReportConfig {
  /** 报表标题 */
  title: string;
  /** 报表描述 */
  description?: string;
  /** 查询配置数组 */
  queries: Array<{
    /** 查询名称 */
    name: string;
    /** SQL查询语句 */
    query: string;
    /** 查询参数 */
    params?: unknown[];
  }>;
  /** 导出选项配置 */
  options?: ExportOptions;
}

/**
 * 重复检查配置接口
 */
export interface DuplicateCheckConfig {
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
 * 数据导入选项接口
 */
export interface ImportOptions {
  /** 目标表名 */
  tableName: string;
  /** 导入文件路径 */
  filePath: string;
  /** 导入格式 */
  format: 'csv' | 'json' | 'excel' | 'sql';
  /** 是否包含表头（CSV和Excel格式） */
  hasHeaders?: boolean;
  /** 字段映射（源字段 -> 目标字段） */
  fieldMapping?: Record<string, string>;
  /** 批处理大小 */
  batchSize?: number;
  /** 是否跳过重复行 */
  skipDuplicates?: boolean;
  /** 冲突处理策略 */
  conflictStrategy?: 'skip' | 'update' | 'error';
  /** 是否启用事务 */
  useTransaction?: boolean;
  /** 是否验证数据格式 */
  validateData?: boolean;
  /** 字符编码（CSV和JSON格式） */
  encoding?: string;
  /** Excel工作表名称 */
  sheetName?: string;
  /** 分隔符（CSV格式） */
  delimiter?: string;
  /** 引号字符（CSV格式） */
  quote?: string;
  /** 是否启用进度跟踪 */
  withProgress?: boolean;
  /** 是否启用错误恢复 */
  withRecovery?: boolean;
  /** 重复检查配置 */
  duplicateCheck?: DuplicateCheckConfig;
}

/**
 * 数据导入结果接口
 */
export interface ImportResult {
  /** 导入是否成功 */
  success: boolean;
  /** 成功导入的行数 */
  importedRows: number;
  /** 跳过的行数 */
  skippedRows: number;
  /** 失败的行数 */
  failedRows: number;
  /** 更新的行数 */
  updatedRows: number;
  /** 处理的总行数 */
  totalRows: number;
  /** 导入耗时（毫秒） */
  duration: number;
  /** 处理的批次数 */
  batchesProcessed: number;
  /** 导入的文件路径 */
  filePath: string;
  /** 导入格式 */
  format: string;
  /** 目标表名 */
  tableName: string;
  /** 错误信息（失败时存在） */
  error?: string;
  /** 详细的错误列表 */
  errors?: Array<{
    row: number;
    error: string;
    data?: Record<string, unknown>;
  }>;
  /** 警告信息 */
  warnings?: string[];
  /** 导入统计信息 */
  statistics?: {
    /** 内存使用峰值 */
    peakMemoryUsage?: number;
    /** CPU使用率 */
    cpuUsage?: number;
    /** 磁盘I/O操作次数 */
    diskIO?: number;
    /** 网络传输字节数 */
    networkBytes?: number;
  };
}

/**
 * 数据验证结果接口
 */
export interface ValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
  /** 建议的修复措施 */
  suggestions: string[];
  /** 验证的行数 */
  validatedRows: number;
  /** 无效的行数 */
  invalidRows: number;
}

/**
 * 字段映射配置接口
 */
export interface FieldMapping {
   /** 源字段名 */
   sourceField: string;
   /** 目标字段名 */
   targetField: string;
   /** 数据类型转换 */
   typeConversion?: 'string' | 'number' | 'boolean' | 'date' | 'auto';
   /** 默认值（当源字段为空时使用） */
   defaultValue?: unknown;
   /** 是否必填 */
   required?: boolean;
   /** 是否参与重复检查 */
   checkDuplicate?: boolean;
   /** 验证规则 */
   validation?: {
     /** 最小长度/值 */
     min?: number;
     /** 最大长度/值 */
     max?: number;
     /** 正则表达式验证 */
     pattern?: string;
     /** 自定义验证函数 */
     customValidator?: string;
   };
}

/**
 * 导入进度信息接口
 */
export interface ImportProgress {
  /** 进度百分比（0-100） */
  progress: number;
  /** 当前处理阶段 */
  stage: string;
  /** 进度消息 */
  message: string;
  /** 已处理的行数 */
  processedRows: number;
  /** 总行数 */
  totalRows: number;
  /** 开始时间 */
  startTime: Date;
  /** 预计剩余时间（毫秒） */
  estimatedTimeRemaining?: number;
  /** 当前速度（行/秒） */
  currentSpeed?: number;
}