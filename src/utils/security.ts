/**
 * 统一安全工具集
 *
 * 整合所有安全相关功能：模式检测、敏感数据处理、批量验证等。
 * 提供统一的安全工具接口，减少文件数量，提高安全功能的内聚性。
 *
 * @fileoverview 统一安全工具集 - 模式检测、敏感数据处理、批量验证
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 *
 */

import { ErrorSeverity } from '../types.js';
import { SecurityValidator } from '../security.js';
import { ValidationLevel } from '../types/errorTypes.js';

// ============================================================================
// 安全模式检测器部分
// ============================================================================

/**
 * 安全模式类型
 */
export enum SecurityPatternType {
  DANGEROUS_OPERATION = 'dangerous_operation',
  SQL_INJECTION = 'sql_injection',
  XSS_ATTACK = 'xss_attack',
  COMMAND_INJECTION = 'command_injection',
  PATH_TRAVERSAL = 'path_traversal',
  FILE_OPERATION = 'file_operation',
  SYSTEM_FUNCTION = 'system_function'
}

/**
 * 安全模式定义
 */
export interface SecurityPattern {
  id: string;
  type: SecurityPatternType;
  pattern: RegExp;
  severity: ErrorSeverity;
  description: string;
  priority: number; // 1-10, 10 为最高优先级
}

/**
 * 检测结果
 */
export interface DetectionResult {
  matched: boolean;
  patterns: SecurityPattern[];
  highestSeverity: ErrorSeverity;
  riskScore: number; // 0-100
}

/**
 * 安全模式检测器类
 *
 * 高性能安全模式检测引擎，支持多维度威胁检测和模式管理。
 * 内置多种安全模式分类，提供快速检测和风险评分功能。
 */
export class SecurityPatternDetector {
  private patterns: Map<SecurityPatternType, SecurityPattern[]>;
  private compiledPatterns: SecurityPattern[];

  constructor() {
    this.patterns = new Map();
    this.compiledPatterns = [];
    this.initializePatterns();
  }

  /**
   * 初始化安全检测模式
   */
  private initializePatterns(): void {
    // 危险操作模式
    this.addPatterns(SecurityPatternType.DANGEROUS_OPERATION, [
      {
        id: 'file_load',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /\b(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\b/i,
        severity: ErrorSeverity.CRITICAL,
        description: '文件系统访问操作',
        priority: 10
      },
      {
        id: 'system_exec',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /\b(SYSTEM|EXEC|SHELL|xp_cmdshell)\b/i,
        severity: ErrorSeverity.CRITICAL,
        description: '系统命令执行',
        priority: 10
      },
      {
        id: 'information_schema',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /\b(UNION\s+SELECT).*(\bFROM\s+INFORMATION_SCHEMA)\b/i,
        severity: ErrorSeverity.HIGH,
        description: '信息架构访问',
        priority: 8
      },
      {
        id: 'stacked_query',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /;\s*(DROP|DELETE|TRUNCATE|ALTER)\b/i,
        severity: ErrorSeverity.CRITICAL,
        description: '堆叠查询DDL操作',
        priority: 9
      },
      {
        id: 'timing_attack',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /\b(BENCHMARK|SLEEP|WAITFOR)\s*\(/i,
        severity: ErrorSeverity.HIGH,
        description: '时序攻击模式',
        priority: 7
      },
      {
        id: 'system_vars',
        type: SecurityPatternType.DANGEROUS_OPERATION,
        pattern: /@@(version|datadir|basedir|tmpdir)/i,
        severity: ErrorSeverity.MEDIUM,
        description: '系统变量访问',
        priority: 6
      }
    ]);

    // SQL注入模式
    this.addPatterns(SecurityPatternType.SQL_INJECTION, [
      {
        id: 'or_injection',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /(\s|^)('|")\s*(OR|AND)\s*(\d+|'[^']*'|")[^><=!]*(\s)*[><=!]{1,2}.*/i,
        severity: ErrorSeverity.CRITICAL,
        description: 'OR/AND条件注入',
        priority: 10
      },
      {
        id: 'union_injection',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /('|").*(\s|^)(UNION|SELECT|INSERT|DELETE|UPDATE|DROP|CREATE|ALTER)(\s)/i,
        severity: ErrorSeverity.CRITICAL,
        description: 'UNION查询注入',
        priority: 10
      },
      {
        id: 'boolean_injection',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /\b(AND\s+1=1|OR\s+1=1)\b/i,
        severity: ErrorSeverity.HIGH,
        description: '布尔注入',
        priority: 8
      },
      {
        id: 'auth_bypass',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /('\s*OR\s*'\d+'\s*=\s*'\d'|"\s*OR\s*"\d+"\s*=\s*"\d")/i,
        severity: ErrorSeverity.CRITICAL,
        description: '认证绕过',
        priority: 10
      },
      {
        id: 'comment_injection',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /.*'\s*--.*$/i,
        severity: ErrorSeverity.HIGH,
        description: '注释注入',
        priority: 7
      },
      {
        id: 'union_select',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /\bUNION\s+(ALL\s+)?SELECT\b/i,
        severity: ErrorSeverity.CRITICAL,
        description: 'UNION SELECT注入',
        priority: 9
      },
      {
        id: 'time_based',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /\b(SLEEP|BENCHMARK|WAITFOR|pg_sleep|dbms_pipe\.receive_message)\s*\(/i,
        severity: ErrorSeverity.HIGH,
        description: '基于时间的注入',
        priority: 8
      },
      {
        id: 'error_based',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /\b(CAST|CONVERT|EXTRACTVALUE|UPDATEXML|EXP|POW)\s*\(/i,
        severity: ErrorSeverity.HIGH,
        description: '基于错误的注入',
        priority: 7
      },
      {
        id: 'stacked_queries',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b/i,
        severity: ErrorSeverity.CRITICAL,
        description: '堆叠查询注入',
        priority: 9
      },
      {
        id: 'function_injection',
        type: SecurityPatternType.SQL_INJECTION,
        pattern: /\b(CHAR|ASCII|ORD|HEX|UNHEX|CONCAT|GROUP_CONCAT)\s*\(/i,
        severity: ErrorSeverity.MEDIUM,
        description: '函数调用注入',
        priority: 5
      }
    ]);

    // XSS攻击模式
    this.addPatterns(SecurityPatternType.XSS_ATTACK, [
      {
        id: 'script_tag',
        type: SecurityPatternType.XSS_ATTACK,
        pattern: /<script[^>]*>.*?<\/script>/i,
        severity: ErrorSeverity.HIGH,
        description: 'Script标签注入',
        priority: 8
      },
      {
        id: 'javascript_event',
        type: SecurityPatternType.XSS_ATTACK,
        pattern: /on\w+\s*=\s*["'][^"']*["']?/i,
        severity: ErrorSeverity.HIGH,
        description: 'JavaScript事件注入',
        priority: 7
      },
      {
        id: 'javascript_protocol',
        type: SecurityPatternType.XSS_ATTACK,
        pattern: /javascript:/i,
        severity: ErrorSeverity.MEDIUM,
        description: 'JavaScript协议注入',
        priority: 6
      }
    ]);

    // 编译所有模式以提高检测性能
    this.compileAllPatterns();
  }

  /**
   * 添加模式到指定类型
   */
  private addPatterns(type: SecurityPatternType, patterns: SecurityPattern[]): void {
    if (!this.patterns.has(type)) {
      this.patterns.set(type, []);
    }
    const existingPatterns = this.patterns.get(type)!;
    existingPatterns.push(...patterns);
    this.patterns.set(type, existingPatterns);
  }

  /**
   * 编译所有模式
   */
  private compileAllPatterns(): void {
    this.compiledPatterns = [];
    for (const patterns of this.patterns.values()) {
      this.compiledPatterns.push(...patterns);
    }
    // 按优先级排序，高优先级的模式先检测
    this.compiledPatterns.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 检测输入中的安全威胁
   */
  public detect(input: string, types?: SecurityPatternType[]): DetectionResult {
    const result: DetectionResult = {
      matched: false,
      patterns: [],
      highestSeverity: ErrorSeverity.INFO,
      riskScore: 0
    };

    const patternsToCheck = types
      ? this.compiledPatterns.filter(p => types.includes(p.type))
      : this.compiledPatterns;

    for (const pattern of patternsToCheck) {
      if (pattern.pattern.test(input)) {
        result.matched = true;
        result.patterns.push(pattern);

        // 更新最高严重级别
        if (this.getSeverityLevel(pattern.severity) > this.getSeverityLevel(result.highestSeverity)) {
          result.highestSeverity = pattern.severity;
        }
      }
    }

    // 计算风险评分
    result.riskScore = this.calculateRiskScore(result.patterns);

    return result;
  }

  /**
   * 快速检测危险操作
   */
  public detectDangerous(input: string): DetectionResult {
    return this.detect(input, [SecurityPatternType.DANGEROUS_OPERATION]);
  }

  /**
   * 快速检测SQL注入
   */
  public detectSQLInjection(input: string): DetectionResult {
    return this.detect(input, [SecurityPatternType.SQL_INJECTION]);
  }

  /**
   * 快速检测XSS攻击
   */
  public detectXSS(input: string): DetectionResult {
    return this.detect(input, [SecurityPatternType.XSS_ATTACK]);
  }

  /**
   * 检测并返回第一个匹配的模式（用于兼容性）
   */
  public findFirstMatch(input: string, types?: SecurityPatternType[]): SecurityPattern | null {
    const result = this.detect(input, types);
    return result.patterns.length > 0 ? result.patterns[0] : null;
  }

  /**
   * 规范化输入以改善检测
   */
  public normalizeInput(input: string): string {
    let normalized = input;

    // 移除多余的空白字符
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // 移除行注释
    normalized = normalized.replace(/--.*$/gm, '');

    // 移除块注释
    normalized = normalized.replace(/\/\*.*?\*\//gs, '');

    // 替换常见的编码绕过技术
    normalized = normalized.replace(/0x[0-9a-fA-F]+/g, 'HEX_VALUE');

    // 替换常见的函数调用混淆
    normalized = normalized.replace(/\bCHAR\s*\(\s*\d+\s*\)/gi, 'CHAR_FUNC');
    normalized = normalized.replace(/\bCHR\s*\(\s*\d+\s*\)/gi, 'CHR_FUNC');

    // 统一小写关键字
    normalized = normalized.toLowerCase();

    return normalized;
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(patterns: SecurityPattern[]): number {
    if (patterns.length === 0) return 0;

    let totalScore = 0;
    const severityWeights = {
      [ErrorSeverity.CRITICAL]: 25,
      [ErrorSeverity.HIGH]: 15,
      [ErrorSeverity.MEDIUM]: 8,
      [ErrorSeverity.LOW]: 3,
      [ErrorSeverity.INFO]: 1,
      [ErrorSeverity.FATAL]: 30
    };

    for (const pattern of patterns) {
      const severityWeight = severityWeights[pattern.severity] || 1;
      const priorityWeight = pattern.priority / 10;
      totalScore += severityWeight * priorityWeight;
    }

    // 限制在0-100范围内
    return Math.min(100, totalScore);
  }

  /**
   * 获取严重级别数值
   */
  private getSeverityLevel(severity: ErrorSeverity): number {
    const levels = {
      [ErrorSeverity.INFO]: 1,
      [ErrorSeverity.LOW]: 2,
      [ErrorSeverity.MEDIUM]: 3,
      [ErrorSeverity.HIGH]: 4,
      [ErrorSeverity.CRITICAL]: 5,
      [ErrorSeverity.FATAL]: 6
    };
    return levels[severity] || 0;
  }

  /**
   * 添加自定义模式
   */
  public addCustomPattern(pattern: SecurityPattern): void {
    if (!this.patterns.has(pattern.type)) {
      this.patterns.set(pattern.type, []);
    }
    this.patterns.get(pattern.type)!.push(pattern);
    this.compileAllPatterns();
  }

  /**
   * 获取模式统计信息
   */
  public getPatternStats(): Record<SecurityPatternType, number> {
    const stats: Record<SecurityPatternType, number> = {} as Record<SecurityPatternType, number>;

    for (const [type, patterns] of this.patterns.entries()) {
      stats[type] = patterns.length;
    }

    return stats;
  }

  /**
   * 获取所有模式信息
   */
  public getAllPatterns(): Map<SecurityPatternType, SecurityPattern[]> {
    return new Map(this.patterns);
  }
}

// ============================================================================
// 敏感数据处理器部分
// ============================================================================

/**
 * 敏感数据类型枚举
 */
export enum SensitiveDataType {
  // 认证相关
  PASSWORD = 'password',
  TOKEN = 'token',
  API_KEY = 'api_key',
  SECRET = 'secret',

  // 个人信息
  EMAIL = 'email',
  PHONE = 'phone',
  SSN = 'ssn',
  CREDIT_CARD = 'credit_card',
  ADDRESS = 'address',
  NAME = 'name',

  // 数据库相关
  CONNECTION_STRING = 'connection_string',
  DATABASE_URL = 'database_url',
  HOST = 'host',
  USERNAME = 'username',

  // 自定义
  CUSTOM = 'custom'
}

/**
 * 掩码策略枚举
 */
export enum MaskingStrategy {
  FULL = 'full',           // 完全掩码: ***
  PARTIAL = 'partial',     // 部分掩码: a***d
  PRESERVE_FIRST = 'preserve_first',  // 保留首字符: a***
  PRESERVE_LAST = 'preserve_last',    // 保留末字符: ***d
  PRESERVE_DOMAIN = 'preserve_domain', // 保留域名: ***@domain.com
  LENGTH_BASED = 'length_based'       // 基于长度的掩码
}

/**
 * 敏感数据模式配置
 */
export interface SensitivePattern {
  type: SensitiveDataType;
  patterns: RegExp[];
  strategy: MaskingStrategy;
  priority: number;
  description: string;
}

/**
 * 掩码配置选项
 */
export interface MaskingOptions {
  strategy?: MaskingStrategy;
  maskChar?: string;
  minVisibleChars?: number;
  maxVisibleChars?: number;
  preserveLength?: boolean;
  caseSensitive?: boolean;
}

/**
 * 检测结果接口
 */
export interface SensitiveDataDetection {
  type: SensitiveDataType;
  startIndex: number;
  endIndex: number;
  originalValue: string;
  maskedValue: string;
  confidence: number;
  pattern: string;
}

/**
 * 处理结果接口
 */
export interface ProcessingResult {
  originalText: string;
  processedText: string;
  detections: SensitiveDataDetection[];
  summary: {
    totalDetections: number;
    typesCounts: Record<SensitiveDataType, number>;
    riskLevel: ErrorSeverity;
  };
}

/**
 * 统一敏感数据处理器类
 */
export class SensitiveDataHandler {
  private patterns: Map<SensitiveDataType, SensitivePattern>;
  private defaultMaskingOptions: MaskingOptions;
  private customPatterns: Map<string, SensitivePattern>;

  constructor(defaultOptions?: Partial<MaskingOptions>) {
    this.patterns = new Map();
    this.customPatterns = new Map();

    this.defaultMaskingOptions = {
      strategy: MaskingStrategy.PARTIAL,
      maskChar: '*',
      minVisibleChars: 1,
      maxVisibleChars: 3,
      preserveLength: true,
      caseSensitive: false,
      ...defaultOptions
    };

    this.initializeDefaultPatterns();
  }

  /**
   * 初始化默认敏感数据模式
   */
  private initializeDefaultPatterns(): void {
    // 密码相关模式
    this.patterns.set(SensitiveDataType.PASSWORD, {
      type: SensitiveDataType.PASSWORD,
      patterns: [
        /password[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /pwd[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /passwd[=\s:]['"]?([^'"\s]+)['"]?/gi
      ],
      strategy: MaskingStrategy.FULL,
      priority: 100,
      description: '密码字段检测'
    });

    // Token 和 API Key
    this.patterns.set(SensitiveDataType.TOKEN, {
      type: SensitiveDataType.TOKEN,
      patterns: [
        /token[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /access_token[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /bearer[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /jwt[=\s:]['"]?([^'"\s]+)['"]?/gi
      ],
      strategy: MaskingStrategy.PRESERVE_FIRST,
      priority: 95,
      description: '令牌字段检测'
    });

    this.patterns.set(SensitiveDataType.API_KEY, {
      type: SensitiveDataType.API_KEY,
      patterns: [
        /api[_-]?key[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /apikey[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /secret[_-]?key[=\s:]['"]?([^'"\s]+)['"]?/gi
      ],
      strategy: MaskingStrategy.PRESERVE_FIRST,
      priority: 95,
      description: 'API密钥检测'
    });

    // 数据库连接相关
    this.patterns.set(SensitiveDataType.CONNECTION_STRING, {
      type: SensitiveDataType.CONNECTION_STRING,
      patterns: [
        /mysql:\/\/([^:]+):([^@]+)@([^:/]+)/gi,
        /mongodb:\/\/([^:]+):([^@]+)@([^:/]+)/gi,
        /postgres:\/\/([^:]+):([^@]+)@([^:/]+)/gi
      ],
      strategy: MaskingStrategy.PARTIAL,
      priority: 90,
      description: '数据库连接字符串检测'
    });

    this.patterns.set(SensitiveDataType.USERNAME, {
      type: SensitiveDataType.USERNAME,
      patterns: [
        /user[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /username[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /uid[=\s:]['"]?([^'"\s]+)['"]?/gi
      ],
      strategy: MaskingStrategy.PRESERVE_FIRST,
      priority: 80,
      description: '用户名字段检测'
    });

    this.patterns.set(SensitiveDataType.HOST, {
      type: SensitiveDataType.HOST,
      patterns: [
        /host[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /hostname[=\s:]['"]?([^'"\s]+)['"]?/gi,
        /server[=\s:]['"]?([^'"\s]+)['"]?/gi
      ],
      strategy: MaskingStrategy.PRESERVE_LAST,
      priority: 70,
      description: '主机名字段检测'
    });

    // 个人信息
    this.patterns.set(SensitiveDataType.EMAIL, {
      type: SensitiveDataType.EMAIL,
      patterns: [
        /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g
      ],
      strategy: MaskingStrategy.PRESERVE_DOMAIN,
      priority: 85,
      description: '电子邮件地址检测'
    });

    this.patterns.set(SensitiveDataType.PHONE, {
      type: SensitiveDataType.PHONE,
      patterns: [
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        /\b\+?1?[-.]?\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
        /\b\+86[-.]?\d{11}\b/g
      ],
      strategy: MaskingStrategy.PRESERVE_LAST,
      priority: 75,
      description: '电话号码检测'
    });

    this.patterns.set(SensitiveDataType.CREDIT_CARD, {
      type: SensitiveDataType.CREDIT_CARD,
      patterns: [
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        /\b\d{16}\b/g
      ],
      strategy: MaskingStrategy.PRESERVE_LAST,
      priority: 100,
      description: '信用卡号检测'
    });

    this.patterns.set(SensitiveDataType.SSN, {
      type: SensitiveDataType.SSN,
      patterns: [
        /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g
      ],
      strategy: MaskingStrategy.PRESERVE_LAST,
      priority: 100,
      description: '社会安全号码检测'
    });
  }

  /**
   * 检测文本中的敏感数据
   */
  public detectSensitiveData(
    text: string,
    enabledTypes?: SensitiveDataType[]
  ): SensitiveDataDetection[] {
    const detections: SensitiveDataDetection[] = [];

    if (!text || typeof text !== 'string') {
      return detections;
    }

    // 确定要检测的模式
    const patternsToCheck = enabledTypes
      ? Array.from(this.patterns.entries()).filter(([type]) => enabledTypes.includes(type))
      : Array.from(this.patterns.entries());

    // 按优先级排序
    patternsToCheck.sort(([, a], [, b]) => b.priority - a.priority);

    for (const [type, patternConfig] of patternsToCheck) {
      for (const pattern of patternConfig.patterns) {
        let match;

        // 重置正则表达式的 lastIndex
        pattern.lastIndex = 0;

        while ((match = pattern.exec(text)) !== null) {
          const originalValue = match[0];
          const startIndex = match.index;
          const endIndex = startIndex + originalValue.length;

          // 避免重复检测同一位置
          const isOverlapping = detections.some(detection =>
            (startIndex >= detection.startIndex && startIndex < detection.endIndex) ||
            (endIndex > detection.startIndex && endIndex <= detection.endIndex)
          );

          if (!isOverlapping) {
            const maskedValue = this.applyMasking(originalValue, patternConfig.strategy);

            detections.push({
              type,
              startIndex,
              endIndex,
              originalValue,
              maskedValue,
              confidence: this.calculateConfidence(originalValue, pattern),
              pattern: pattern.source
            });
          }

          // 防止无限循环
          if (!pattern.global) break;
        }
      }
    }

    // 按位置排序
    return detections.sort((a, b) => a.startIndex - b.startIndex);
  }

  /**
   * 处理文本中的敏感数据
   */
  public processSensitiveData(
    text: string,
    options?: {
      enabledTypes?: SensitiveDataType[];
      customMasking?: Record<SensitiveDataType, MaskingOptions>;
    }
  ): ProcessingResult {
    if (!text || typeof text !== 'string') {
      return {
        originalText: text,
        processedText: text,
        detections: [],
        summary: {
          totalDetections: 0,
          typesCounts: {} as Record<SensitiveDataType, number>,
          riskLevel: ErrorSeverity.LOW
        }
      };
    }

    const detections = this.detectSensitiveData(text, options?.enabledTypes);

    // 应用自定义掩码策略
    if (options?.customMasking) {
      detections.forEach(detection => {
        const customMaskingOption = options.customMasking![detection.type];
        if (customMaskingOption) {
          detection.maskedValue = this.applyMasking(
            detection.originalValue,
            customMaskingOption.strategy || MaskingStrategy.PARTIAL,
            customMaskingOption
          );
        }
      });
    }

    // 替换文本中的敏感数据
    let processedText = text;

    // 从后往前替换，避免索引偏移问题
    for (let i = detections.length - 1; i >= 0; i--) {
      const detection = detections[i];
      processedText = processedText.substring(0, detection.startIndex) +
                    detection.maskedValue +
                    processedText.substring(detection.endIndex);
    }

    // 生成统计信息
    const typesCounts = detections.reduce((counts, detection) => {
      counts[detection.type] = (counts[detection.type] || 0) + 1;
      return counts;
    }, {} as Record<SensitiveDataType, number>);

    const riskLevel = this.calculateRiskLevel(detections);

    return {
      originalText: text,
      processedText,
      detections,
      summary: {
        totalDetections: detections.length,
        typesCounts,
        riskLevel
      }
    };
  }

  /**
   * 应用掩码策略
   */
  private applyMasking(
    value: string,
    strategy: MaskingStrategy,
    options?: MaskingOptions
  ): string {
    const opts = { ...this.defaultMaskingOptions, ...options };

    if (!value || value.length === 0) {
      return value;
    }

    switch (strategy) {
      case MaskingStrategy.FULL:
        return opts.preserveLength ? opts.maskChar!.repeat(value.length) : '***';

      case MaskingStrategy.PARTIAL: {
        if (value.length <= 2) {
          return opts.maskChar!.repeat(value.length);
        }
        const visibleChars = Math.min(
          Math.max(opts.minVisibleChars!, 1),
          Math.min(opts.maxVisibleChars!, Math.floor(value.length / 2))
        );
        const maskLength = value.length - (visibleChars * 2);
        return value.substring(0, visibleChars) +
               opts.maskChar!.repeat(Math.max(maskLength, 1)) +
               value.substring(value.length - visibleChars);
      }

      case MaskingStrategy.PRESERVE_FIRST: {
        const firstChars = Math.min(opts.minVisibleChars!, value.length - 1);
        return value.substring(0, firstChars) +
               opts.maskChar!.repeat(Math.max(value.length - firstChars, 1));
      }

      case MaskingStrategy.PRESERVE_LAST: {
        const lastChars = Math.min(opts.minVisibleChars!, value.length - 1);
        return opts.maskChar!.repeat(Math.max(value.length - lastChars, 1)) +
               value.substring(value.length - lastChars);
      }

      case MaskingStrategy.PRESERVE_DOMAIN: {
        // 专用于邮箱地址
        if (value.includes('@')) {
          const [localPart, domain] = value.split('@');
          const maskedLocal = this.applyMasking(localPart, MaskingStrategy.PARTIAL, opts);
          return `${maskedLocal}@${domain}`;
        }
        return this.applyMasking(value, MaskingStrategy.PARTIAL, opts);
      }

      case MaskingStrategy.LENGTH_BASED:
        if (value.length <= 4) {
          return opts.maskChar!.repeat(value.length);
        } else if (value.length <= 8) {
          return value[0] + opts.maskChar!.repeat(value.length - 2) + value[value.length - 1];
        } else {
          return value.substring(0, 2) +
                 opts.maskChar!.repeat(value.length - 4) +
                 value.substring(value.length - 2);
        }

      default:
        return this.applyMasking(value, MaskingStrategy.PARTIAL, opts);
    }
  }

  /**
   * 计算检测置信度
   */
  private calculateConfidence(value: string, pattern: RegExp): number {
    // 基础置信度根据模式复杂度
    let confidence = 0.5;

    // 模式复杂度越高，置信度越高
    const patternComplexity = pattern.source.length;
    confidence += Math.min(patternComplexity / 100, 0.3);

    // 值的长度合理性
    if (value.length >= 6 && value.length <= 50) {
      confidence += 0.1;
    }

    // 特定类型的额外验证
    if (pattern.source.includes('@') && value.includes('@')) {
      // 邮箱格式验证
      const parts = value.split('@');
      if (parts.length === 2 && parts[1].includes('.')) {
        confidence += 0.2;
      }
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 计算风险级别
   */
  private calculateRiskLevel(detections: SensitiveDataDetection[]): ErrorSeverity {
    if (detections.length === 0) {
      return ErrorSeverity.LOW;
    }

    const criticalTypes = [
      SensitiveDataType.PASSWORD,
      SensitiveDataType.API_KEY,
      SensitiveDataType.TOKEN,
      SensitiveDataType.CREDIT_CARD,
      SensitiveDataType.SSN
    ];

    const hasCritical = detections.some(d => criticalTypes.includes(d.type));
    if (hasCritical) {
      return ErrorSeverity.CRITICAL;
    }

    if (detections.length >= 5) {
      return ErrorSeverity.HIGH;
    }

    if (detections.length >= 2) {
      return ErrorSeverity.MEDIUM;
    }

    return ErrorSeverity.LOW;
  }

  /**
   * 添加自定义敏感数据模式
   */
  public addCustomPattern(name: string, pattern: SensitivePattern): void {
    this.customPatterns.set(name, pattern);
  }

  /**
   * 移除自定义模式
   */
  public removeCustomPattern(name: string): void {
    this.customPatterns.delete(name);
  }

  /**
   * 获取所有已注册的模式类型
   */
  public getRegisteredTypes(): SensitiveDataType[] {
    return Array.from(this.patterns.keys());
  }

  /**
   * 批量处理多个文本
   */
  public batchProcess(
    texts: string[],
    options?: {
      enabledTypes?: SensitiveDataType[];
      customMasking?: Record<SensitiveDataType, MaskingOptions>;
    }
  ): ProcessingResult[] {
    return texts.map(text => this.processSensitiveData(text, options));
  }

  /**
   * 验证掩码配置
   */
  public validateMaskingOptions(options: MaskingOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.minVisibleChars !== undefined && options.minVisibleChars < 0) {
      errors.push('minVisibleChars 不能小于 0');
    }

    if (options.maxVisibleChars !== undefined && options.maxVisibleChars < 0) {
      errors.push('maxVisibleChars 不能小于 0');
    }

    if (
      options.minVisibleChars !== undefined &&
      options.maxVisibleChars !== undefined &&
      options.minVisibleChars > options.maxVisibleChars
    ) {
      errors.push('minVisibleChars 不能大于 maxVisibleChars');
    }

    if (options.maskChar && options.maskChar.length !== 1) {
      errors.push('maskChar 必须是单个字符');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成检测报告
   */
  public generateReport(results: ProcessingResult[]): string {
    const totalTexts = results.length;
    const totalDetections = results.reduce((sum, r) => sum + r.summary.totalDetections, 0);

    const typeStats = results.reduce((stats, r) => {
      Object.entries(r.summary.typesCounts).forEach(([type, count]) => {
        stats[type as SensitiveDataType] = (stats[type as SensitiveDataType] || 0) + count;
      });
      return stats;
    }, {} as Record<SensitiveDataType, number>);

    const riskDistribution = results.reduce((dist, r) => {
      dist[r.summary.riskLevel] = (dist[r.summary.riskLevel] || 0) + 1;
      return dist;
    }, {} as Record<ErrorSeverity, number>);

    let report = `敏感数据检测报告\n`;
    report += `${'='.repeat(50)}\n`;
    report += `处理文本数量: ${totalTexts}\n`;
    report += `检测到敏感数据: ${totalDetections} 处\n`;
    report += `平均每文本: ${totalTexts > 0 ? (totalDetections / totalTexts).toFixed(2) : 0} 处\n\n`;

    report += `类型分布:\n`;
    Object.entries(typeStats)
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, count]) => {
        report += `  ${type}: ${count} 处\n`;
      });

    report += `\n风险级别分布:\n`;
    Object.entries(riskDistribution).forEach(([risk, count]) => {
      report += `  ${risk}: ${count} 个文本\n`;
    });

    return report;
  }
}

// ============================================================================
// 批量验证器部分
// ============================================================================

export class BatchValidator {
  /**
   * 批量验证输入数据
   * 优化的批量验证，减少重复的验证开销
   */
  static validateBatch(
    items: Array<{ value: unknown; fieldName: string; level?: ValidationLevel }>,
    batchSize: number = 100
  ): void {
    // 分批处理，避免阻塞事件循环
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, Math.min(i + batchSize, items.length));

      for (const item of batch) {
        SecurityValidator.validateInputComprehensive(
          item.value,
          item.fieldName,
          item.level || ValidationLevel.STRICT
        );
      }
    }
  }

  /**
   * 验证列名数组
   */
  static validateColumns(columns: string[]): void {
    const items = columns.map((col, index) => ({
      value: col,
      fieldName: `column_${index}`,
      level: ValidationLevel.STRICT
    }));

    this.validateBatch(items);
  }

  /**
   * 验证数据行
   * 优化的二维数组验证
   */
  static validateDataRows(
    dataRows: unknown[][],
    columns: string[],
    validationLevel: ValidationLevel = ValidationLevel.BASIC
  ): void {
    // 首先验证数据结构
    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      if (row.length !== columns.length) {
        throw new Error(
          `Row ${rowIdx} has ${row.length} values but ${columns.length} columns expected`
        );
      }
    }

    // 批量构建验证项
    const items: Array<{ value: unknown; fieldName: string; level: ValidationLevel }> = [];

    // 使用单次遍历收集所有验证项
    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        items.push({
          value: row[colIdx],
          fieldName: `row_${rowIdx}_${columns[colIdx]}`,
          level: validationLevel
        });
      }
    }

    // 批量验证
    this.validateBatch(items);
  }

  /**
   * 验证键值对数据
   */
  static validateKeyValuePairs(
    data: Record<string, unknown>,
    keyPrefix: string = 'field'
  ): void {
    const items = Object.entries(data).flatMap(([key, value]) => [
      {
        value: key,
        fieldName: `${keyPrefix}_key_${key}`,
        level: ValidationLevel.STRICT
      },
      {
        value: value,
        fieldName: `${keyPrefix}_value_${key}`,
        level: ValidationLevel.STRICT
      }
    ]);

    this.validateBatch(items);
  }

  /**
   * 验证查询参数
   */
  static validateQueryParams(params: unknown[]): void {
    const items = params.map((param, index) => ({
      value: param,
      fieldName: `param_${index}`,
      level: ValidationLevel.STRICT
    }));

    this.validateBatch(items);
  }
}

// ============================================================================
// 单例实例和便捷方法
// ============================================================================

/**
 * 单例实例
 */
export const securityPatternDetector = new SecurityPatternDetector();
export const sensitiveDataHandler = new SensitiveDataHandler();

/**
 * 便捷方法：快速掩码文本
 */
export function maskSensitiveText(
  text: string,
  types?: SensitiveDataType[]
): string {
  return sensitiveDataHandler.processSensitiveData(text, { enabledTypes: types }).processedText;
}

/**
 * 便捷方法：检测敏感数据
 */
export function detectSensitive(
  text: string,
  types?: SensitiveDataType[]
): SensitiveDataDetection[] {
  return sensitiveDataHandler.detectSensitiveData(text, types);
}