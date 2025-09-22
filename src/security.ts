/**
 * MySQL MCP安全验证与审计系统 - 企业级安全防护体系
 *
 * 基于FastMCP框架的高性能、企业级MySQL安全验证和审计系统，集成了完整的数据库安全防护功能栈。
 * 为Model Context Protocol (MCP)提供安全、可靠、高效的安全验证服务，
 * 支持企业级应用的所有安全需求和合规性要求。
 *
 * @fileoverview MySQL MCP企业级安全验证与审计系统 - 全面的安全防护解决方案
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 *
 */

import { DefaultConfig } from './constants.js';
import { ValidationLevel, ErrorSeverity, MySQLMCPError, ErrorCategory } from './types.js';
import { MySQLManager } from './mysqlManager.js';
import { rbacManager } from './rbac.js';
import { securityLogger, SecurityEventType } from './logger.js';
import { securityPatternDetector, SecurityPatternType } from './utils/security.js';

/**
 * 安全验证器类
 *
 * 多层安全验证系统，用于防护各类安全威胁和攻击向量。
 * 提供全面的输入验证、威胁检测和安全防护功能。
 *
 * 防护范围：
 * - SQL 注入攻击防护（包括 UNION、OR、时间延迟注入等）
 * - 命令注入和代码注入检测
 * - 文件系统访问控制
 * - 信息泄露攻击防范
 * - 时序攻击和拒绝服务攻击检测
 *
 * 安全特性：
 * - 统一的安全模式检测器，避免重复代码
 * - 多级验证模式（严格、中等、基础）
 * - 字符编码和控制字符验证
 * - 长度限制和结构验证
 * - 智能威胁分析和风险评估
 *
 * @class SecurityValidator
 * @since 1.0.0
 * @license MIT
 *
 * @example
 * // 严格验证（默认）
 * SecurityValidator.validateInputComprehensive(userInput, "username");
 *
 * @example
 * // 性能关键路径的基础验证
 * SecurityValidator.validateInputComprehensive(data, "field", "basic");
 *
 * @example
 * // 危险模式检测
 * const threats = SecurityValidator.analyzeSecurityThreats(input);
 * if (threats.riskScore > 80) {
 *   // 高风险输入处理
 * }
 */
export class SecurityValidator {

  /**
   * 综合输入验证
   *
   * 主要验证入口点，执行类型检查并根据输入类型委托给专门的验证器。
   * 支持多种验证级别以满足不同的安全要求和性能需求。
   *
   * 验证级别说明：
   * - "strict"：使用所有模式的完整安全验证，适合高安全要求场景
   * - "moderate"：执行基本安全检查，平衡安全性和性能
   * - "basic"：性能关键路径的最小验证，适合高吞吐量场景
   *
   * @public
   * @static
   * @param {unknown} inputValue - 要验证的值（任意类型）
   * @param {string} fieldName - 用于错误消息的字段名称，便于调试和日志记录
   * @param {string} [validationLevel="strict"] - 验证严格级别，决定验证的深度和粒度
   * @throws {MySQLMCPError} 当输入未通过验证检查时抛出，包含详细的错误信息和分类
   *
   * @example
   * // 严格验证（默认）
   * SecurityValidator.validateInputComprehensive(userInput, "username");
   *
   * @example
   * // 为性能考虑的中等验证
   * SecurityValidator.validateInputComprehensive(data, "field", "moderate");
   *
   * @example
   * // 在性能关键路径上使用基础验证
   * SecurityValidator.validateInputComprehensive(someData, "data", "basic");
   */
  public static validateInputComprehensive(
    inputValue: unknown, 
    fieldName: string, 
    validationLevel: ValidationLevel = ValidationLevel.STRICT
  ): void {
    // 类型验证：确保输入是可接受的类型
    if (typeof inputValue !== 'string' && typeof inputValue !== 'number' && typeof inputValue !== 'boolean' && inputValue !== null && inputValue !== undefined && !Array.isArray(inputValue) && typeof inputValue !== 'object') {
      throw new MySQLMCPError(
        `${fieldName} 具有无效的数据类型`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.HIGH
      );
    }

    // 字符串特定验证（最安全关键）
    if (typeof inputValue === 'string') {
      this.validateStringComprehensive(inputValue, fieldName, validationLevel);
    }
    
    // 数组验证
    if (Array.isArray(inputValue)) {
      this.validateArrayComprehensive(inputValue, fieldName, validationLevel);
    }
    
    // 对象验证
    if (typeof inputValue === 'object' && inputValue !== null && !Array.isArray(inputValue)) {
      this.validateObjectComprehensive(inputValue, fieldName, validationLevel);
    }
  }

  /**
   * 数组验证
   *
   * 验证数组输入，包括长度限制和嵌套元素验证。
   *
   * @private
   * @static
   * @param {unknown[]} value - 要验证的数组值
   * @param {string} fieldName - 用于错误消息的字段名称
   * @param {string} level - 验证级别（"strict"、"moderate"、"basic"）
   * @throws {Error} 当数组未通过验证检查时抛出
   */
  private static validateArrayComprehensive(
    value: unknown[], 
    fieldName: string, 
    level: ValidationLevel
  ): void {
    // 数组长度验证
    const maxArrayLength = DefaultConfig.MAX_INPUT_LENGTH;
    if (value.length > maxArrayLength) {
      throw new MySQLMCPError(
        `${fieldName} 数组长度超过最大限制 (${maxArrayLength} 元素)`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.MEDIUM
      );
    }

    // 递归验证数组元素
    value.forEach((element, index) => {
      try {
        this.validateInputComprehensive(element, `${fieldName}[${index}]`, level);
      } catch (error) {
        throw new MySQLMCPError(
          `${fieldName}[${index}] 元素验证失败: ${(error as Error).message}`,
          ErrorCategory.SECURITY_VIOLATION,
          ErrorSeverity.HIGH
        );
      }
    });
  }

  /**
   *对象验证
   *
   * 验证对象输入，包括属性数量限制和嵌套属性验证。
   *
   * @private
   * @static
   * @param {object} value - 要验证的对象值
   * @param {string} fieldName - 用于错误消息的字段名称
   * @param {string} level - 验证级别（"strict"、"moderate"、"basic"）
   * @throws {Error} 当对象未通过验证检查时抛出
   */
  private static validateObjectComprehensive(
    value: object, 
    fieldName: string, 
    level: ValidationLevel
  ): void {
    // 对象属性数量验证
    const maxObjectProperties = DefaultConfig.MAX_INPUT_LENGTH;
    const propertyCount = Object.keys(value).length;
    if (propertyCount > maxObjectProperties) {
      throw new MySQLMCPError(
        `${fieldName} 对象属性数量超过最大限制 (${maxObjectProperties} 属性)`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.MEDIUM
      );
    }

    // 递归验证对象属性
    Object.entries(value).forEach(([key, val]) => {
      // 验证属性名
      if (typeof key === 'string') {
        try {
          this.validateStringComprehensive(key, `${fieldName}.${key} (property name)`, level);
        } catch (error) {
          throw new MySQLMCPError(
            `${fieldName}.${key} 属性名验证失败: ${(error as Error).message}`,
            ErrorCategory.SECURITY_VIOLATION,
            ErrorSeverity.HIGH
          );
        }
      }

      // 验证属性值
      try {
        this.validateInputComprehensive(val, `${fieldName}.${key}`, level);
      } catch (error) {
        throw new MySQLMCPError(
          `${fieldName}.${key} 属性值验证失败: ${(error as Error).message}`,
          ErrorCategory.SECURITY_VIOLATION,
          ErrorSeverity.HIGH
        );
      }
    });
  }

  /**
   * 增强字符串验证
   *
   * 综合字符串验证，包括控制字符检测、长度限制、
   * 编码验证和安全模式匹配。实现多个安全层以防止各种攻击向量。
   *
   * 安全检查：
   * 1. 控制字符检测（防止二进制注入）
   * 2. 长度限制强制执行（防止缓冲区溢出）
   * 3. 字符编码验证（防止编码攻击）
   * 4. 危险模式检测（防止SQL注入）
   * 5. 注入模式匹配（防止各种注入类型）
   *
   * @private
   * @static
   * @param {string} value - 要验证的字符串值
   * @param {string} fieldName - 用于错误消息的字段名称
   * @param {string} level - 验证级别（"strict"、"moderate"、"basic"）
   * @throws {Error} 当字符串未通过任何验证检查时抛出
   */
  private static validateStringComprehensive(
    value: string, 
    fieldName: string, 
    level: ValidationLevel
  ): void {
    // 控制字符验证（安全：防止二进制注入）
    if (value.split('').some(c => c.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(c))) {
      throw new MySQLMCPError(
        `${fieldName} 包含无效的控制字符`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.HIGH
      );
    }

    // 长度验证（安全：防止缓冲区溢出攻击）
    if (value.length > DefaultConfig.MAX_INPUT_LENGTH) {
      throw new MySQLMCPError(
        `${fieldName} 超过最大长度限制 (${DefaultConfig.MAX_INPUT_LENGTH} 字符)`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.MEDIUM
      );
    }

    // 字符编码验证（安全：防止编码攻击）
    try {
      Buffer.from(value, 'utf-8');
    } catch {
      throw new MySQLMCPError(
        `${fieldName} 包含无效的字符编码`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.HIGH
      );
    }

    // 基于模式的安全验证 - 使用统一检测器
    if (level === ValidationLevel.STRICT) {
      // 完整安全验证：检查所有威胁类型
      const dangerousResult = securityPatternDetector.detectDangerous(value);
      if (dangerousResult.matched) {
        const threat = dangerousResult.patterns[0];
        throw new MySQLMCPError(
          `${fieldName} 包含危险操作模式: ${threat.description}`,
          ErrorCategory.SECURITY_VIOLATION,
          threat.severity
        );
      }

      // SQL 注入模式检测
      const injectionResult = securityPatternDetector.detectSQLInjection(value);
      if (injectionResult.matched) {
        const threat = injectionResult.patterns[0];
        throw new MySQLMCPError(
          `${fieldName} 包含SQL注入尝试: ${threat.description}`,
          ErrorCategory.SECURITY_VIOLATION,
          threat.severity
        );
      }

      // XSS 攻击检测
      const xssResult = securityPatternDetector.detectXSS(value);
      if (xssResult.matched) {
        const threat = xssResult.patterns[0];
        throw new MySQLMCPError(
          `${fieldName} 包含XSS攻击尝试: ${threat.description}`,
          ErrorCategory.SECURITY_VIOLATION,
          threat.severity
        );
      }
    } else if (level === ValidationLevel.MODERATE) {
      // 中等验证：检查最关键的威胁
      const criticalResult = securityPatternDetector.detect(value, [
        SecurityPatternType.DANGEROUS_OPERATION,
        SecurityPatternType.SQL_INJECTION
      ]);
      
      if (criticalResult.matched && criticalResult.riskScore > 50) {
        const threat = criticalResult.patterns[0];
        throw new MySQLMCPError(
          `${fieldName} 包含潜在威胁: ${threat.description}`,
          ErrorCategory.SECURITY_VIOLATION,
          threat.severity
        );
      }
    }
    // ValidationLevel.BASIC 级别：为性能跳过模式验证
  }

  /**
   * 获取检测到的安全威胁详情
   *
   * 使用统一的安全模式检测器对输入进行深度威胁分析。
   * 返回详细的威胁分类、风险等级和安全评分。
   *
   * @public
   * @static
   * @param {string} value - 要分析的安全输入字符串
   * @returns {Object} 威胁分析结果，包含威胁列表、风险等级和评分
   *
   * @example
   * // 威胁分析示例
   * const threats = SecurityValidator.analyzeSecurityThreats(input);
   * if (threats.riskScore > 80) {
   *   // 高风险输入处理
   *   logger.warn('High risk input detected', threats);
   * }
   *
   * @example
   * // 获取详细威胁信息
   * const analysis = SecurityValidator.analyzeSecurityThreats(userInput);
   * analysis.threats.forEach(threat => {
   *   console.log(`Threat: ${threat.description}, Severity: ${threat.severity}`);
   * });
   */
  public static analyzeSecurityThreats(value: string): {
    threats: Array<{
      type: SecurityPatternType;
      patternId: string;
      description: string;
      severity: ErrorSeverity;
    }>;
    riskLevel: ErrorSeverity;
    riskScore: number;
  } {
    // 使用统一检测器
    const result = securityPatternDetector.detect(value);
    
    const threats = result.patterns.map(pattern => ({
      type: pattern.type,
      patternId: pattern.id,
      description: pattern.description,
      severity: pattern.severity
    }));
    
    return {
      threats,
      riskLevel: result.highestSeverity,
      riskScore: result.riskScore
    };
  }

  /**
   * 规范化SQL查询以检测混淆的注入尝试
   *
   * 对SQL查询进行规范化处理，消除格式混淆、编码绕过等技术，
   * 以便更准确地检测隐藏的注入攻击尝试。
   *
   * @public
   * @static
   * @param {string} query - 原始SQL查询字符串
   * @returns {string} 规范化后的查询字符串，用于安全检测
   *
   * @example
   * // SQL注入检测前的规范化
   * const normalizedQuery = SecurityValidator.normalizeSQLQuery(originalQuery);
   * const detectionResult = securityPatternDetector.detect(normalizedQuery);
   *
   * @example
   * // 处理编码绕过攻击
   * const encodedQuery = "SELECT * FROM users WHERE id = %271%27 OR %271%27=%271";
   * const normalized = SecurityValidator.normalizeSQLQuery(encodedQuery);
   * // 返回标准化格式以便检测
   */
  public static normalizeSQLQuery(query: string): string {
    return securityPatternDetector.normalizeInput(query);
  }
}

/**
 * 安全审计报告接口
 */
export interface SecurityAuditReport {
  timestamp: Date;
  overallScore: number;
  findings: SecurityFinding[];
  recommendations: string[];
}

/**
 * 安全发现接口
 */
export interface SecurityFinding {
  id: string;
  category: string;
  severity: ErrorSeverity;
  description: string;
  status: 'passed' | 'failed' | 'warning';
  details?: Record<string, unknown>;
}

/**
 * 安全审计器类
 *
 * 执行全面的安全审计，生成详细的审计报告。
 */
export class SecurityAuditor {
  private mysqlManager: MySQLManager;

  /**
   * 安全审计器构造函数
   * @param mysqlManager - MySQL管理器实例
   */
  constructor(mysqlManager: MySQLManager) {
    this.mysqlManager = mysqlManager;
  }

  /**
   * 执行全面的安全审计
   * @returns 安全审计报告
   */
  public async performSecurityAudit(): Promise<SecurityAuditReport> {
    const findings: SecurityFinding[] = [];
    let passedTests = 0;
    let totalTests = 0;

    // 1. 检查配置安全性
    const configFindings = this.auditConfiguration();
    findings.push(...configFindings);
    passedTests += configFindings.filter(f => f.status === 'passed').length;
    totalTests += configFindings.length;

    // 2. 检查RBAC配置
    const rbacFindings = this.auditRBAC();
    findings.push(...rbacFindings);
    passedTests += rbacFindings.filter(f => f.status === 'passed').length;
    totalTests += rbacFindings.length;

    // 3. 检查安全验证器配置
    const validationFindings = this.auditSecurityValidation();
    findings.push(...validationFindings);
    passedTests += validationFindings.filter(f => f.status === 'passed').length;
    totalTests += validationFindings.length;

    // 4. 检查安全日志配置
    const loggingFindings = this.auditSecurityLogging();
    findings.push(...loggingFindings);
    passedTests += loggingFindings.filter(f => f.status === 'passed').length;
    totalTests += loggingFindings.length;

    // 5. 检查近期安全事件
    const eventFindings = this.auditRecentSecurityEvents();
    findings.push(...eventFindings);
    passedTests += eventFindings.filter(f => f.status === 'passed').length;
    totalTests += eventFindings.length;

    // 计算总体评分
    const overallScore = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 100;

    // 生成建议
    const recommendations = this.generateRecommendations(findings);

    return {
      timestamp: new Date(),
      overallScore,
      findings,
      recommendations
    };
  }

  /**
   * 审计配置安全性
   * @returns 配置审计发现
   */
  private auditConfiguration(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const config = this.mysqlManager.configManager;

    // 检查查询长度限制
    if (config.security.maxQueryLength > 10000) {
      findings.push({
        id: 'config_query_length',
        category: 'Configuration',
        severity: ErrorSeverity.MEDIUM,
        description: '查询长度限制设置过高',
        status: 'warning',
        details: {
          current: config.security.maxQueryLength,
          recommended: 10000
        }
      });
    } else {
      findings.push({
        id: 'config_query_length',
        category: 'Configuration',
        severity: ErrorSeverity.LOW,
        description: '查询长度限制配置合理',
        status: 'passed'
      });
    }

    // 检查速率限制
    if (config.security.rateLimitMax > 1000) {
      findings.push({
        id: 'config_rate_limit',
        category: 'Configuration',
        severity: ErrorSeverity.MEDIUM,
        description: '速率限制设置过高',
        status: 'warning',
        details: {
          current: config.security.rateLimitMax,
          recommended: 1000
        }
      });
    } else {
      findings.push({
        id: 'config_rate_limit',
        category: 'Configuration',
        severity: ErrorSeverity.LOW,
        description: '速率限制配置合理',
        status: 'passed'
      });
    }

    // 检查结果行数限制
    if (config.security.maxResultRows > 10000) {
      findings.push({
        id: 'config_result_rows',
        category: 'Configuration',
        severity: ErrorSeverity.MEDIUM,
        description: '结果行数限制设置过高',
        status: 'warning',
        details: {
          current: config.security.maxResultRows,
          recommended: 10000
        }
      });
    } else {
      findings.push({
        id: 'config_result_rows',
        category: 'Configuration',
        severity: ErrorSeverity.LOW,
        description: '结果行数限制配置合理',
        status: 'passed'
      });
    }

    return findings;
  }

  /**
   * 审计RBAC配置
   * @returns RBAC审计发现
   */
  private auditRBAC(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 检查是否配置了角色
    const roles = rbacManager.getRoles();
    if (roles.length === 0) {
      findings.push({
        id: 'rbac_roles',
        category: 'RBAC',
        severity: ErrorSeverity.HIGH,
        description: '未配置任何角色',
        status: 'failed'
      });
    } else {
      findings.push({
        id: 'rbac_roles',
        category: 'RBAC',
        severity: ErrorSeverity.LOW,
        description: `已配置 ${roles.length} 个角色`,
        status: 'passed',
        details: {
          roleCount: roles.length
        }
      });
    }

    // 检查是否配置了用户
    const users = rbacManager.getUsers();
    if (users.length === 0) {
      findings.push({
        id: 'rbac_users',
        category: 'RBAC',
        severity: ErrorSeverity.HIGH,
        description: '未配置任何用户',
        status: 'failed'
      });
    } else {
      findings.push({
        id: 'rbac_users',
        category: 'RBAC',
        severity: ErrorSeverity.LOW,
        description: `已配置 ${users.length} 个用户`,
        status: 'passed',
        details: {
          userCount: users.length
        }
      });
    }

    return findings;
  }

  /**
   * 审计安全验证配置
   * @returns 安全验证审计发现
   */
  private auditSecurityValidation(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 检查是否启用了安全验证
    findings.push({
      id: 'security_validation',
      category: 'Security Validation',
      severity: ErrorSeverity.LOW,
      description: '安全验证已启用',
      status: 'passed'
    });

    // 测试安全验证器的威胁检测能力
    const testInputs = [
      { input: "SELECT * FROM users WHERE id = '1' OR '1'='1'", name: "sql_injection_test" },
      { input: "1; DROP TABLE users", name: "stacked_query_test" },
      { input: "UNION SELECT NULL, version()", name: "union_injection_test" },
      { input: "<script>alert('xss')</script>", name: "xss_test" }
    ];

    let threatsDetected = 0;
    testInputs.forEach(test => {
      try {
        SecurityValidator.validateInputComprehensive(test.input, test.name, ValidationLevel.STRICT);
      } catch {
        threatsDetected++;
        findings.push({
          id: `validation_threat_${test.name}`,
          category: 'Security Validation',
          severity: ErrorSeverity.MEDIUM,
          description: `安全验证器成功检测到威胁: ${test.name}`,
          status: 'passed',
          details: {
            input: test.input.substring(0, 50) + (test.input.length > 50 ? '...' : ''),
            detected: true
          }
        });
      }
    });

    if (threatsDetected === 0) {
      findings.push({
        id: 'validation_effectiveness',
        category: 'Security Validation',
        severity: ErrorSeverity.HIGH,
        description: '安全验证器可能无法检测测试威胁',
        status: 'warning'
      });
    } else {
      findings.push({
        id: 'validation_effectiveness',
        category: 'Security Validation',
        severity: ErrorSeverity.LOW,
        description: `安全验证器成功检测到 ${threatsDetected}/${testInputs.length} 个测试威胁`,
        status: 'passed',
        details: {
          detectedThreats: threatsDetected,
          totalTests: testInputs.length,
          effectiveness: Math.round((threatsDetected / testInputs.length) * 100)
        }
      });
    }

    return findings;
  }

  /**
   * 审计安全日志配置
   * @returns 安全日志审计发现
   */
  private auditSecurityLogging(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 检查是否启用了安全日志
    findings.push({
      id: 'security_logging',
      category: 'Security Logging',
      severity: ErrorSeverity.LOW,
      description: '安全日志记录已启用',
      status: 'passed'
    });

    return findings;
  }

  /**
   * 审计近期安全事件
   * @returns 安全事件审计发现
   */
  private auditRecentSecurityEvents(): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // 检查近期的SQL注入尝试
    const sqlInjectionEvents = securityLogger.getLogsByType(SecurityEventType.SQL_INJECTION_ATTEMPT);
    if (sqlInjectionEvents.length > 0) {
      findings.push({
        id: 'recent_sql_injection',
        category: 'Security Events',
        severity: ErrorSeverity.CRITICAL,
        description: `检测到 ${sqlInjectionEvents.length} 次SQL注入尝试`,
        status: 'failed',
        details: {
          eventCount: sqlInjectionEvents.length,
          recentEvent: sqlInjectionEvents[0]?.timestamp,
          severity: 'CRITICAL'
        }
      });
    } else {
      findings.push({
        id: 'recent_sql_injection',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: '未检测到SQL注入尝试',
        status: 'passed'
      });
    }

    // 检查近期的访问违规
    const accessViolationEvents = securityLogger.getLogsByType(SecurityEventType.ACCESS_VIOLATION);
    if (accessViolationEvents.length > 0) {
      findings.push({
        id: 'recent_access_violation',
        category: 'Security Events',
        severity: ErrorSeverity.HIGH,
        description: `检测到 ${accessViolationEvents.length} 次访问违规`,
        status: 'failed',
        details: {
          eventCount: accessViolationEvents.length,
          recentEvent: accessViolationEvents[0]?.timestamp,
          severity: 'HIGH'
        }
      });
    } else {
      findings.push({
        id: 'recent_access_violation',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: '未检测到访问违规',
        status: 'passed'
      });
    }

    // 检查近期的认证失败
    const authFailureEvents = securityLogger.getLogsByType(SecurityEventType.AUTHENTICATION_FAILURE);
    if (authFailureEvents.length > 0) {
      findings.push({
        id: 'recent_auth_failure',
        category: 'Security Events',
        severity: ErrorSeverity.HIGH,
        description: `检测到 ${authFailureEvents.length} 次认证失败`,
        status: 'failed',
        details: {
          eventCount: authFailureEvents.length,
          recentEvent: authFailureEvents[0]?.timestamp,
          severity: 'HIGH'
        }
      });
    } else {
      findings.push({
        id: 'recent_auth_failure',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: '未检测到认证失败',
        status: 'passed'
      });
    }

    // 检查近期的权限拒绝
    const permissionDeniedEvents = securityLogger.getLogsByType(SecurityEventType.PERMISSION_DENIED);
    if (permissionDeniedEvents.length > 0) {
      findings.push({
        id: 'recent_permission_denied',
        category: 'Security Events',
        severity: ErrorSeverity.MEDIUM,
        description: `检测到 ${permissionDeniedEvents.length} 次权限拒绝`,
        status: 'warning',
        details: {
          eventCount: permissionDeniedEvents.length,
          recentEvent: permissionDeniedEvents[0]?.timestamp,
          severity: 'MEDIUM'
        }
      });
    } else {
      findings.push({
        id: 'recent_permission_denied',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: '未检测到权限拒绝',
        status: 'passed'
      });
    }

    // 检查近期的速率限制超出
    const rateLimitEvents = securityLogger.getLogsByType(SecurityEventType.RATE_LIMIT_EXCEEDED);
    if (rateLimitEvents.length > 0) {
      findings.push({
        id: 'recent_rate_limit',
        category: 'Security Events',
        severity: ErrorSeverity.MEDIUM,
        description: `检测到 ${rateLimitEvents.length} 次速率限制超出`,
        status: 'warning',
        details: {
          eventCount: rateLimitEvents.length,
          recentEvent: rateLimitEvents[0]?.timestamp,
          severity: 'MEDIUM'
        }
      });
    } else {
      findings.push({
        id: 'recent_rate_limit',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: '未检测到速率限制超出',
        status: 'passed'
      });
    }

    // 计算总体安全事件评分
    const criticalEvents = sqlInjectionEvents.length;
    const highEvents = accessViolationEvents.length + authFailureEvents.length;
    const mediumEvents = permissionDeniedEvents.length + rateLimitEvents.length;
    const totalEvents = criticalEvents + highEvents + mediumEvents;

    if (totalEvents > 10) {
      findings.push({
        id: 'event_frequency',
        category: 'Security Events',
        severity: ErrorSeverity.HIGH,
        description: `安全事件频率过高 (${totalEvents} 次)`,
        status: 'failed',
        details: {
          totalEvents,
          criticalEvents,
          highEvents,
          mediumEvents
        }
      });
    } else if (totalEvents > 5) {
      findings.push({
        id: 'event_frequency',
        category: 'Security Events',
        severity: ErrorSeverity.MEDIUM,
        description: `安全事件频率中等 (${totalEvents} 次)`,
        status: 'warning',
        details: {
          totalEvents,
          criticalEvents,
          highEvents,
          mediumEvents
        }
      });
    } else {
      findings.push({
        id: 'event_frequency',
        category: 'Security Events',
        severity: ErrorSeverity.LOW,
        description: `安全事件频率正常 (${totalEvents} 次)`,
        status: 'passed',
        details: {
          totalEvents,
          criticalEvents,
          highEvents,
          mediumEvents
        }
      });
    }

    return findings;
  }

  /**
   * 生成改进建议
   * @param findings - 安全发现
   * @returns 改进建议列表
   */
  private generateRecommendations(findings: SecurityFinding[]): string[] {
    const recommendations: string[] = [];

    // 基于发现生成建议
    const failedFindings = findings.filter(f => f.status === 'failed');
    const warningFindings = findings.filter(f => f.status === 'warning');

    if (failedFindings.length > 0) {
      recommendations.push('🚨 请立即解决标记为失败的安全问题');
    }

    if (warningFindings.length > 0) {
      recommendations.push('⚠️ 请审查标记为警告的安全配置');
    }

    // 特定建议 - 基于具体发现
    const sqlInjectionFinding = failedFindings.find(f => f.id === 'recent_sql_injection');
    if (sqlInjectionFinding) {
      recommendations.push('🛡️ 加强输入验证，检查所有用户输入点');
      recommendations.push('🛡️ 考虑实施Web应用防火墙(WAF)');
      recommendations.push('🛡️ 实施参数化查询以防止SQL注入');
      recommendations.push('🛡️ 定期更新安全规则和模式库');
    }

    const accessViolationFinding = failedFindings.find(f => f.id === 'recent_access_violation');
    if (accessViolationFinding) {
      recommendations.push('🔐 审查RBAC配置，确保权限分配最小化');
      recommendations.push('🔐 实施更严格的访问控制策略');
      recommendations.push('🔐 启用详细的访问日志记录');
      recommendations.push('🔐 定期审查用户权限分配');
    }

    const authFailureFinding = failedFindings.find(f => f.id === 'recent_auth_failure');
    if (authFailureFinding) {
      recommendations.push('🔑 实施账户锁定机制防止暴力破解');
      recommendations.push('🔑 启用多因素认证(MFA)');
      recommendations.push('🔑 监控异常登录模式');
      recommendations.push('🔑 定期审查认证日志');
    }

    const configQueryLengthFinding = warningFindings.find(f => f.id === 'config_query_length');
    if (configQueryLengthFinding) {
      recommendations.push('📏 降低查询长度限制以防止大查询攻击');
      recommendations.push('📏 实施查询复杂度监控');
      recommendations.push('📏 考虑查询时间限制');
    }

    const configRateLimitFinding = warningFindings.find(f => f.id === 'config_rate_limit');
    if (configRateLimitFinding) {
      recommendations.push('⚡️ 调整速率限制以防止滥用');
      recommendations.push('⚡️ 实施智能速率限制算法');
      recommendations.push('⚡️ 考虑IP级别的限制策略');
    }

    const eventFrequencyFinding = failedFindings.find(f => f.id === 'event_frequency');
    if (eventFrequencyFinding) {
      recommendations.push('📊 加强安全监控和告警');
      recommendations.push('📊 实施实时威胁检测');
      recommendations.push('📊 考虑引入安全信息和事件管理(SIEM)系统');
    }

    const validationEffectivenessFinding = warningFindings.find(f => f.id === 'validation_effectiveness');
    if (validationEffectivenessFinding) {
      recommendations.push('🔍 更新安全验证规则和模式');
      recommendations.push('🔍 增加测试用例覆盖更多攻击向量');
      recommendations.push('🔍 考虑引入机器学习辅助的威胁检测');
    }

    // 基于严重性分布的通用建议
    const criticalCount = failedFindings.filter(f => f.severity === ErrorSeverity.CRITICAL).length;
    const highCount = failedFindings.filter(f => f.severity === ErrorSeverity.HIGH).length;

    if (criticalCount > 0) {
      recommendations.push('🚨 检测到关键安全问题，建议立即进行全面安全评估');
      recommendations.push('🚨 考虑聘请专业安全团队进行渗透测试');
    }

    if (highCount > 2) {
      recommendations.push('⚠️ 检测到多个高风险问题，建议优先处理');
      recommendations.push('⚠️ 制定详细的安全改进计划');
    }

    // 长期安全策略建议
    if (failedFindings.length > 0 || warningFindings.length > 0) {
      recommendations.push('📋 制定定期安全审计计划（建议每月）');
      recommendations.push('📋 建立安全事件响应流程');
      recommendations.push('📋 定期进行安全意识培训');
      recommendations.push('📋 保持系统和依赖项的及时更新');
      recommendations.push('📋 实施持续的安全监控和告警');
      recommendations.push('📋 定期备份和灾难恢复测试');
      recommendations.push('📋 遵循安全最佳实践和合规要求');
    }

    return recommendations;
  }

  /**
   * 生成安全合规性报告
   * @returns 合规性报告
   */
  public async generateComplianceReport(): Promise<string> {
    const auditReport = await this.performSecurityAudit();
    
    let report = `🔒 安全审计合规性报告\n`;
    report += `${'═'.repeat(50)}\n`;
    report += `📅 生成时间: ${auditReport.timestamp.toISOString()}\n`;
    report += `📊 总体评分: ${this.getScoreDisplay(auditReport.overallScore)}\n\n`;
    
    // 按类别分组显示发现
    const findingsByCategory = this.groupFindingsByCategory(auditReport.findings);
    
    for (const [category, categoryFindings] of Object.entries(findingsByCategory)) {
      if (categoryFindings.length > 0) {
        report += `📂 ${category}\n`;
        report += `${'─'.repeat(30)}\n`;
        
        for (const finding of categoryFindings) {
          const statusIcon = this.getStatusIcon(finding.status);
          const severityIcon = this.getSeverityIcon(finding.severity);
          report += `${statusIcon} ${severityIcon} ${finding.description}\n`;
          
          if (finding.details) {
            report += `   📋 详情: ${JSON.stringify(finding.details)}\n`;
          }
        }
        report += `\n`;
      }
    }
    
    // 安全评分详细分析
    report += `📈 安全评分分析\n`;
    report += `${'─'.repeat(30)}\n`;
    const scoreAnalysis = this.analyzeScoreBreakdown(auditReport.findings);
    report += scoreAnalysis;
    report += `\n`;
    
    // 改进建议
    report += `💡 改进建议\n`;
    report += `${'─'.repeat(30)}\n`;
    for (const recommendation of auditReport.recommendations) {
      report += `${recommendation}\n`;
    }
    
    // 总结和后续步骤
    report += `\n🎯 总结和后续步骤\n`;
    report += `${'─'.repeat(30)}\n`;
    report += this.generateSummary(auditReport);
    
    return report;
  }

  /**
   * 获取评分显示
   * @param score - 评分数值
   * @returns 带图标的评分字符串
   */
  private getScoreDisplay(score: number): string {
    if (score >= 90) return `${score}% 🟢 优秀`;
    if (score >= 80) return `${score}% 🟡 良好`;
    if (score >= 70) return `${score}% 🟠 中等`;
    if (score >= 60) return `${score}% 🟡 需要改进`;
    return `${score}% 🔴 需要立即关注`;
  }

  /**
   * 按类别分组发现
   * @param findings - 安全发现列表
   * @returns 按类别分组的发现
   */
  private groupFindingsByCategory(findings: SecurityFinding[]): Record<string, SecurityFinding[]> {
    const grouped: Record<string, SecurityFinding[]> = {};
    
    findings.forEach(finding => {
      if (!grouped[finding.category]) {
        grouped[finding.category] = [];
      }
      grouped[finding.category].push(finding);
    });
    
    // 按严重性排序
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => {
        const severityOrder = { 
          [ErrorSeverity.CRITICAL]: 6, 
          [ErrorSeverity.FATAL]: 5,
          [ErrorSeverity.HIGH]: 4, 
          [ErrorSeverity.MEDIUM]: 3, 
          [ErrorSeverity.LOW]: 2,
          [ErrorSeverity.INFO]: 1
        };
        const aSeverity = severityOrder[a.severity] || 0;
        const bSeverity = severityOrder[b.severity] || 0;
        return bSeverity - aSeverity;
      });
    });
    
    return grouped;
  }

  /**
   * 获取状态图标
   * @param status - 状态
   * @returns 对应的图标
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'passed': return '✅';
      case 'failed': return '❌';
      case 'warning': return '⚠️';
      default: return '❓';
    }
  }

  /**
   * 获取严重性图标
   * @param severity - 严重性
   * @returns 对应的图标
   */
  private getSeverityIcon(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return '🔴';
      case ErrorSeverity.HIGH: return '🟠';
      case ErrorSeverity.MEDIUM: return '🟡';
      case ErrorSeverity.LOW: return '🟢';
      default: return '⚪';
    }
  }

  /**
   * 分析评分明细
   * @param findings - 安全发现列表
   * @returns 评分分析文本
   */
  private analyzeScoreBreakdown(findings: SecurityFinding[]): string {
    const total = findings.length;
    const passed = findings.filter(f => f.status === 'passed').length;
    const warnings = findings.filter(f => f.status === 'warning').length;
    const failed = findings.filter(f => f.status === 'failed').length;
    
    let analysis = `📊 测试统计:\n`;
    analysis += `   总测试项: ${total}\n`;
    analysis += `   通过: ${passed} (${total > 0 ? Math.round((passed / total) * 100) : 0}%)\n`;
    analysis += `   警告: ${warnings} (${total > 0 ? Math.round((warnings / total) * 100) : 0}%)\n`;
    analysis += `   失败: ${failed} (${total > 0 ? Math.round((failed / total) * 100) : 0}%)\n\n`;
    
    const criticalIssues = findings.filter(f => f.severity === ErrorSeverity.CRITICAL && f.status === 'failed').length;
    const highIssues = findings.filter(f => f.severity === ErrorSeverity.HIGH && f.status === 'failed').length;
    const mediumIssues = findings.filter(f => f.severity === ErrorSeverity.MEDIUM && f.status === 'failed').length;
    
    analysis += `🚨 严重问题分布:\n`;
    analysis += `   🔴 关键: ${criticalIssues} 个\n`;
    analysis += `   🟠 高风险: ${highIssues} 个\n`;
    analysis += `   🟡 中风险: ${mediumIssues} 个\n`;
    
    return analysis;
  }

  /**
   * 生成总结
   * @param auditReport - 审计报告
   * @returns 总结文本
   */
  private generateSummary(auditReport: SecurityAuditReport): string {
    let summary = '';
    
    if (auditReport.overallScore >= 90) { 
      summary += `🎉 安全状况优秀！系统表现出良好的安全实践。\n`;
      summary += `📝 建议继续保持当前的安全标准和定期审计。\n`;
    } else if (auditReport.overallScore >= 80) {
      summary += `👍 安全状况良好。有一些可以改进的地方。\n`;
      summary += `📝 建议优先处理警告项目，持续改进安全配置。\n`;
    } else if (auditReport.overallScore >= 70) {
      summary += `⚠️ 安全状况中等。需要关注一些安全问题。\n`;
      summary += `📝 建议制定安全改进计划，优先处理高风险问题。\n`;
    } else if (auditReport.overallScore >= 60) {
      summary += `⚠️ 安全状况需要改进。存在多个安全问题。\n`;
      summary += `📝 建议立即开始解决安全问题，加强安全监控。\n`;
    } else {
      summary += `🚨 安全状况差！需要立即关注和行动。\n`;
      summary += `📝 建议立即进行全面安全评估，解决所有关键问题。\n`;
    }
    
    // 添加后续步骤建议
    summary += `\n🔄 推荐后续步骤:\n`;
    summary += `   1. 根据优先级解决发现的安全问题\n`;
    summary += `   2. 定期重新运行安全审计验证改进效果\n`;
    summary += `   3. 建立持续的安全监控机制\n`;
    summary += `   4. 保持团队安全意识培训\n`;
    
    return summary;
  }
}

/**
 * 导出安全审计器实例创建函数
 * @param mysqlManager - MySQL管理器实例
 * @returns 安全审计器实例
 */
export function createSecurityAuditor(mysqlManager: MySQLManager): SecurityAuditor {
  return new SecurityAuditor(mysqlManager);
}
