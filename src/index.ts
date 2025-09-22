/**
 * MySQL MCP服务器 - 数据库操作服务
 *
 * 为Model Context Protocol (MCP)提供安全、可靠的MySQL数据库访问服务。
 * 支持企业级应用的所有数据操作需求。
 * 
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-08-27
 * @license MIT
 */

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { MySQLManager } from './mysqlManager.js';
import { createMCPTool } from './utils/toolWrapper.js';
import {
  MySQLMCPError,
  ErrorCategory,
  ErrorSeverity,
  CancellationToken,
  BackupOptions,
  ExportOptions,
  ImportOptions,
  CacheRegion,
} from './types.js';
import { StringConstants } from './constants.js';
import { createSecurityAuditor } from './security.js';
import { systemMonitor, memoryMonitor } from './monitor.js';
import { MemoryUtils } from './utils/common.js';
import { ErrorHandler } from './errorHandler.js';
import { logger } from './logger.js';
import { MySQLBackupTool } from './mysqlBackupTool.js';
import { MySQLImportTool } from './mysqlImportTool.js';
import {
  PerformanceManager,
  IndexSuggestion,
  PerformanceReport,
  QueryProfileResult,
  SlowQueryAnalysis,
  SlowQueryInfo
} from './performanceManager.js';

/**
 * 全局 MySQL 连接管理器实例
 * 处理所有数据库操作，包括连接池、缓存和安全验证
 */
const mysqlManager = new MySQLManager();

/**
 * 备份工具实例
 * 处理数据库备份、数据导出和报表生成
 */
const backupTool = new MySQLBackupTool(mysqlManager);

/**
 * 导入工具实例
 * 处理数据库数据导入，支持多种格式（CSV、JSON、Excel、SQL）
 */
const importTool = new MySQLImportTool(mysqlManager);

/**
 * 性能管理器实例
 * 统一管理和优化MySQL数据库性能
 */
const performanceManager = new PerformanceManager(mysqlManager);

/**
 * FastMCP 服务器实例配置
 * 使用常量中的服务器名称和版本进行配置
 */
const mcp = new FastMCP({
  name: StringConstants.SERVER_NAME,
  version: StringConstants.SERVER_VERSION
});

/**
 * MySQL 查询执行工具
 *
 * 执行任意 MySQL 查询，支持参数绑定以确保安全性。
 * 支持 SELECT、SHOW、DESCRIBE、INSERT、UPDATE、DELETE、CREATE、DROP 和 ALTER 操作。
 *
 * @tool mysql_query
 * @param {string} query - 要执行的 SQL 查询（最大长度由安全配置强制执行）
 * @param {any[]} [params] - 预处理语句的可选参数，用于防止 SQL 注入
 * @returns {Promise<string>} JSON 格式的查询结果
 * @throws {Error} 当查询验证失败、超出速率限制或发生数据库错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_query',
  description: 'Execute MySQL queries (SELECT, SHOW, DESCRIBE, etc.)',
  parameters: z.object({
    query: z.string().describe('SQL query to execute'),
    params: z.array(z.any()).optional().describe('Optional parameters for prepared statements')
  }),
  handler: async (args) => {
    // 如果未提供参数，则初始化参数数组
    if (!args.params) {
      args.params = [];
    }

    // 安全验证：验证查询和所有参数
    mysqlManager.validateInput(args.query, "query");
    args.params.forEach((param, i) => {
      mysqlManager.validateInput(param, `param_${i}`);
    });

    // 使用重试机制和性能监控执行查询
    const result = await mysqlManager.executeQuery(args.query, args.params);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_QUERY_FAILED
}, systemMonitor));

/**
 * 显示表工具
 *
 * 使用 SHOW TABLES 命令列出当前数据库中的所有表。
 * 结果会被缓存以优化性能，提高频繁查询的响应速度。
 * 提供数据库架构的快速概览，支持开发和运维场景。
 *
 * @tool mysql_show_tables
 * @returns {Promise<string>} JSON 格式的表名列表，包含表名和相关元数据
 * @throws {Error} 当数据库连接失败、权限不足或查询执行错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_show_tables',
  description: 'Show all tables in the current database',
  parameters: z.object({}),
  handler: async () => {
    const showTablesQuery = "SHOW TABLES";
    const result = await mysqlManager.executeQuery(showTablesQuery);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_SHOW_TABLES_FAILED
}, systemMonitor));

/**
 * 描述表工具
 *
 * 检索并描述指定表的完整结构，包括列定义、数据类型、约束、
 * 索引信息和其他元数据。支持 DESCRIBE 和 INFORMATION_SCHEMA 查询。
 * 结果会被智能缓存以提高性能，支持表结构分析和文档生成。
 *
 * @tool mysql_describe_table
 * @param {string} table_name - 要描述的表名（经过安全验证和标识符转义）
 * @returns {Promise<string>} JSON 格式的详细表结构信息，包含列、约束、索引等元数据
 * @throws {Error} 当表名无效、表不存在、权限不足或查询失败时抛出
 * 
 */
mcp.addTool(createMCPTool({
  name: 'mysql_describe_table',
  description: 'Describe the structure of a specified table',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to describe')
  }),
  handler: async (args) => {
    mysqlManager.validateTableName(args.table_name);
    const result = await mysqlManager.getTableSchemaCached(args.table_name);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_DESCRIBE_TABLE_FAILED
}, systemMonitor));

/**
 * 查询数据工具
 *
 * 从表中查询数据，支持可选的过滤、列选择和行数限制。
 * 提供灵活的查询构建，具有完整的SQL注入防护和性能优化。
 * 支持条件查询、分页查询和结果缓存等高级功能。
 *
 * @tool mysql_select_data
 * @param {string} table_name - 要查询数据的表名（经过安全验证和标识符转义）
 * @param {string[]} [columns] - 可选的列名列表（默认为所有列，使用 "*" 通配符）
 * @param {string} [where_clause] - 可选的 WHERE 子句用于过滤（不包含 WHERE 关键字，经过安全验证）
 * @param {number} [limit] - 可选的返回行数限制（用于性能优化和内存管理）
 * @returns {Promise<string>} JSON 格式的查询结果，包含数据行和查询统计信息
 * @throws {Error} 当表名无效、列不存在、WHERE子句无效或查询失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_select_data',
  description: 'Select data from a table with optional conditions and limits',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to select data from'),
    columns: z.array(z.string()).optional().describe('Optional list of column names to select'),
    where_clause: z.string().optional().describe('Optional WHERE clause for filtering'),
    limit: z.number().int().optional().describe('Optional limit on number of rows returned')
  }),
  handler: async (args) => {
    // 验证表名的安全性
    mysqlManager.validateTableName(args.table_name);

    // 如果未指定列，则默认为所有列
    if (!args.columns) {
      args.columns = ["*"];
    }

    // 验证每个列名（通配符除外）
    args.columns.forEach(col => {
      if (col !== "*") {
        mysqlManager.validateInput(col, "column");
      }
    });

    // 构建带有适当转义的 SELECT 查询
    let query = `SELECT ${args.columns.join(', ')} FROM \`${args.table_name}\``;

    // 如果提供了 WHERE 子句，则添加
    if (args.where_clause) {
      mysqlManager.validateInput(args.where_clause, "where_clause");
      query += ` WHERE ${args.where_clause}`;
    }

    // 如果提供了 LIMIT 子句，则添加（确保整数值）
    if (args.limit) {
      query += ` LIMIT ${Math.floor(args.limit)}`;
    }

    const result = await mysqlManager.executeQuery(query);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_SELECT_DATA_FAILED
}, systemMonitor));

/**
 * 插入数据工具
 *
 * 使用参数化查询安全地向表中插入新数据，确保数据完整性和安全性。
 * 自动验证所有输入数据，使用预处理语句防止SQL注入攻击。
 * 支持单行插入和批量数据插入，包含事务安全保障。
 *
 * @tool mysql_insert_data
 * @param {string} table_name - 要插入数据的表名（经过安全验证和标识符转义）
 * @param {Record<string, any>} data - 要插入的列名和值的键值对（所有值都会被验证）
 * @returns {Promise<string>} 包含成功状态、插入ID和受影响行数的 JSON 格式结果
 * @throws {Error} 当表名无效、列名无效、数据类型不匹配或插入失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_insert_data',
  description: 'Insert new data into a table',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to insert data into'),
    data: z.record(z.any()).describe('Key-value pairs of column names and values')
  }),
  handler: async (args) => {
    // 验证表名的安全性
    mysqlManager.validateTableName(args.table_name);

    // 验证所有列名和值
    Object.keys(args.data).forEach(key => {
      mysqlManager.validateInput(key, "column_name");
      mysqlManager.validateInput(args.data[key], "column_value");
    });

    // 准备参数化 INSERT 查询
    const columns = Object.keys(args.data);
    const values = Object.values(args.data);
    const placeholders = columns.map(() => "?").join(", ");

    const query = `INSERT INTO \`${args.table_name}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;
    const result = await mysqlManager.executeQuery(query, values);

    return JSON.stringify({ [StringConstants.SUCCESS_KEY]: true, ...(result as Record<string, unknown> || {}) }, null, 2);
  },
  errorMessage: StringConstants.MSG_INSERT_DATA_FAILED
}, systemMonitor));

/**
 * 更新数据工具
 *
 * 使用参数化查询根据指定条件更新表中的现有数据，确保数据修改的安全性和一致性。
 * 提供完整的输入验证，具有WHERE子句验证、预处理语句和事务安全保障。
 * 支持条件更新和批量字段修改，包含详细的操作审计信息。
 *
 * @tool mysql_update_data
 * @param {string} table_name - 要更新的表名（经过安全验证和标识符转义）
 * @param {Record<string, any>} data - 列名和新值的键值对（所有值都会被验证和转义）
 * @param {string} where_clause - 指定要更新记录的 WHERE 子句（不包含 WHERE 关键字，经过安全验证）
 * @returns {Promise<string>} 包含成功状态、受影响行数和更新统计的 JSON 格式结果
 * @throws {Error} 当表名无效、WHERE子句缺失/无效、列名不存在或更新失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_update_data',
  description: 'Update existing data in a table based on specified conditions',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to update'),
    data: z.record(z.any()).describe('Key-value pairs of column names and new values'),
    where_clause: z.string().describe('WHERE clause to specify which records to update (without WHERE keyword)')
  }),
  handler: async (args) => {
    mysqlManager.validateTableName(args.table_name);
    mysqlManager.validateInput(args.where_clause, "where_clause");

    Object.keys(args.data).forEach(key => {
      mysqlManager.validateInput(key, "column_name");
      mysqlManager.validateInput(args.data[key], "column_value");
    });

    const columns = Object.keys(args.data);
    const values = Object.values(args.data);
    const setClause = columns.map(col => `\`${col}\` = ?`).join(", ");

    const query = `UPDATE \`${args.table_name}\` SET ${setClause} WHERE ${args.where_clause}`;
    const result = await mysqlManager.executeQuery(query, values);

    return JSON.stringify({ [StringConstants.SUCCESS_KEY]: true, ...(result as Record<string, unknown> || {}) }, null, 2);
  },
  errorMessage: StringConstants.MSG_UPDATE_DATA_FAILED
}, systemMonitor));

/**
 * 删除数据工具
 *
 * 根据指定条件从表中安全删除数据，确保删除操作的准确性和安全性。
 * 使用参数化查询和WHERE子句验证，防止误删除和SQL注入攻击。
 * 支持条件删除操作，包含删除确认和事务安全保障。
 *
 * @tool mysql_delete_data
 * @param {string} table_name - 要删除数据的表名（经过安全验证和标识符转义）
 * @param {string} where_clause - 指定要删除记录的 WHERE 子句（不包含 WHERE 关键字，经过安全验证）
 * @returns {Promise<string>} 包含成功状态、删除行数和操作统计的 JSON 格式结果
 * @throws {Error} 当表名无效、WHERE子句无效或删除失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_delete_data',
  description: 'Delete data from a table based on specified conditions',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to delete data from'),
    where_clause: z.string().describe('WHERE clause to specify which records to delete (without WHERE keyword)')
  }),
  handler: async (args) => {
    mysqlManager.validateTableName(args.table_name);
    mysqlManager.validateInput(args.where_clause, "where_clause");

    const query = `DELETE FROM \`${args.table_name}\` WHERE ${args.where_clause}`;
    const result = await mysqlManager.executeQuery(query);

    return JSON.stringify({ [StringConstants.SUCCESS_KEY]: true, ...(result as Record<string, unknown> || {}) }, null, 2);
  },
  errorMessage: StringConstants.MSG_DELETE_DATA_FAILED
}, systemMonitor));

/**
 * 获取数据库架构工具
 *
 * 检索数据库架构信息，包括表、列、约束、索引和关系映射。
 * 提供完整的数据库结构信息用于分析、管理和文档生成，支持特定表查询。
 * 利用 INFORMATION_SCHEMA 进行高效查询，支持缓存优化和性能监控。
 *
 * @tool mysql_get_schema
 * @param {string} [table_name] - 可选的特定表名，用于获取该表的架构信息（经过安全验证和标识符转义）
 * @returns {Promise<string>} 包含数据库架构信息的详细 JSON 格式结果，包括表结构、列定义、约束和索引信息
 * @throws {Error} 当查询失败、表名无效、权限不足或数据库连接错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_get_schema',
  description: 'Get database schema information including tables, columns, and constraints',
  parameters: z.object({
    table_name: z.string().optional().describe('Optional specific table name to get schema information for')
  }),
  handler: async (args) => {
    let query = `
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_KEY,
        EXTRA,
        COLUMN_COMMENT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `;

    const params: string[] = [];
    if (args.table_name) {
      mysqlManager.validateTableName(args.table_name);
      query += " AND TABLE_NAME = ?";
      params.push(args.table_name);
    }

    query += " ORDER BY TABLE_NAME, ORDINAL_POSITION";

    const result = await mysqlManager.executeQuery(query, params.length > 0 ? params : undefined);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_GET_SCHEMA_FAILED
}, systemMonitor));


/**
 * 获取外键工具
 *
 * 检索特定表或数据库中所有表的外键约束信息，提供表间关系映射和引用完整性约束的详细信息。
 * 利用 INFORMATION_SCHEMA.KEY_COLUMN_USAGE 进行高效查询，支持特定表查询和全局关系分析。
 * 帮助理解数据库架构中的表间依赖关系，支持数据库设计优化和数据完整性维护。
 * 提供外键约束的详细信息，包括本地列、引用表、引用列和约束名称。
 *
 * @tool mysql_get_foreign_keys
 * @param {string} [table_name] - 可选的特定表名，用于获取该表的外键信息（经过安全验证和标识符转义）
 * @returns {Promise<string>} 包含外键约束详细信息和关系映射的 JSON 格式结果，包括约束名称、本地列、引用表和引用列信息
 * @throws {Error} 当查询失败、表名无效、权限不足或数据库连接错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_get_foreign_keys',
  description: 'Get foreign key constraint information for a specific table or all tables in the database',
  parameters: z.object({
    table_name: z.string().optional().describe('Optional specific table name to get foreign key information for')
  }),
  handler: async (args) => {
    let query = `
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `;

    const params: string[] = [];
    if (args.table_name) {
      mysqlManager.validateTableName(args.table_name);
      query += " AND TABLE_NAME = ?";
      params.push(args.table_name);
    }

    query += " ORDER BY TABLE_NAME, CONSTRAINT_NAME";

    const result = await mysqlManager.executeQuery(query, params.length > 0 ? params : undefined);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_GET_FOREIGN_KEYS_FAILED
}, systemMonitor));

/**
 * 创建表工具
 *
 * 使用指定的列定义和约束创建新的数据库表，支持完整的表结构定义。
 * 提供全面的安全验证，包括表名验证、列定义验证，确保数据库操作的安全性。
 * 支持主键、自增列、默认值等高级约束，支持批量列定义和事务安全保障。
 * 创建成功后自动使相关缓存失效，确保数据一致性。
 *
 * @tool mysql_create_table
 * @param {string} table_name - 要创建的表名（经过安全验证和标识符转义）
 * @param {Array} columns - 列定义数组，每个列包含名称、类型、约束等详细信息
 * @returns {Promise<string>} 包含成功状态、创建信息和受影响表结构的 JSON 格式结果
 * @throws {Error} 当表名无效、列定义错误、约束冲突或创建失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_create_table',
  description: 'Create a new table with specified columns and constraints',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to create'),
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string(),
        nullable: z.boolean().optional(),
        default: z.string().optional(),
        primary_key: z.boolean().optional(),
        auto_increment: z.boolean().optional()
      })
    ).describe('Array of column definitions')
  }),
  handler: async (args) => {
    mysqlManager.validateTableName(args.table_name);

    const columnDefs: string[] = [];
    args.columns.forEach(col => {
      mysqlManager.validateInput(col.name, 'column_name');
      mysqlManager.validateInput(col.type, 'column_type');

      let definition = `\`${col.name}\` ${col.type}`;

      if (col.nullable === false) {
        definition += " NOT NULL";
      }
      if (col.auto_increment) {
        definition += " AUTO_INCREMENT";
      }
      if (col.default) {
        definition += ` DEFAULT ${col.default}`;
      }

      columnDefs.push(definition);
    });

    const primaryKeys = args.columns
      .filter(col => col.primary_key)
      .map(col => col.name);

    if (primaryKeys.length > 0) {
      columnDefs.push(`PRIMARY KEY (\`${primaryKeys.join('`, `')}\`)`);
    }

    const query = `CREATE TABLE \`${args.table_name}\` (${columnDefs.join(', ')})`;
    const result = await mysqlManager.executeQuery(query);

    // 表创建后使缓存失效
    mysqlManager.invalidateCaches("CREATE");

    return JSON.stringify({ [StringConstants.SUCCESS_KEY]: true, ...(result as Record<string, unknown> || {}) }, null, 2);
  },
  errorMessage: StringConstants.MSG_CREATE_TABLE_FAILED
}, systemMonitor));

/**
 * 删除表工具
 *
 * 从数据库中安全删除（丢弃）指定的表，支持条件删除选项和完整的安全验证。
 * 提供 IF EXISTS 选项避免表不存在时的错误，支持事务安全保障和缓存自动失效。
 * 删除操作前会进行严格的安全验证，确保不会误删重要数据。
 * 特别适用于开发环境中的表清理和生产环境的表维护操作。
 *
 * @tool mysql_drop_table
 * @param {string} table_name - 要删除的表名（经过安全验证和标识符转义）
 * @param {boolean} [if_exists] - 可选的 IF EXISTS 子句，设置为true时如果表不存在不会抛出错误
 * @returns {Promise<string>} 包含成功状态、删除信息和操作统计的 JSON 格式结果
 * @throws {Error} 当表名无效、删除失败或违反安全规则时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_drop_table',
  description: 'Drop (delete) a table from the database',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to drop'),
    if_exists: z.boolean().optional().describe('Use IF EXISTS clause to avoid errors if table does not exist')
  }),
  handler: async (args) => {
    mysqlManager.validateTableName(args.table_name);

    const query = `DROP TABLE ${args.if_exists ? 'IF EXISTS' : ''} \`${args.table_name}\``;
    const result = await mysqlManager.executeQuery(query);

    // 表删除后使缓存失效
    mysqlManager.invalidateCaches("DROP");

    return JSON.stringify({ [StringConstants.SUCCESS_KEY]: true, ...(result as Record<string, unknown> || {}) }, null, 2);
  },
  errorMessage: StringConstants.MSG_DROP_TABLE_FAILED
}, systemMonitor));

/**
 * 修改表工具
 *
 * 修改现有表的结构，支持添加、修改、删除列、索引和约束等高级操作。
 * 提供全面的安全验证、事务安全保障和智能错误处理机制。
 * 支持批处理多个修改操作，提高数据库架构管理的效率和安全性。
 * 包含性能监控和缓存自动失效，确保修改后的数据一致性。
 *
 * @tool mysql_alter_table
 * @param {string} table_name - 要修改的表名（经过安全验证和标识符转义）
 * @param {Array} alterations - 要执行的修改操作数组，支持ADD_COLUMN、MODIFY_COLUMN、DROP_COLUMN、ADD_INDEX、DROP_INDEX、ADD_FOREIGN_KEY、DROP_FOREIGN_KEY等多种操作类型
 * @returns {Promise<string>} 包含成功状态、修改操作数量、受影响行数和查询时间等详细信息的 JSON 格式结果
 * @throws {Error} 当表名无效、操作失败、违反安全规则或超出修改限制时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_alter_table',
  description: 'Modify table structure by adding, modifying, or dropping columns and constraints',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to alter'),
    alterations: z.array(z.object({
      type: z.enum(['ADD_COLUMN', 'MODIFY_COLUMN', 'DROP_COLUMN', 'ADD_INDEX', 'DROP_INDEX', 'ADD_FOREIGN_KEY', 'DROP_FOREIGN_KEY']).describe('Type of alteration to perform'),
      column: z.object({
        name: z.string().describe('Column name'),
        type: z.string().optional().describe('Column data type'),
        nullable: z.boolean().optional().describe('Whether column can be NULL'),
        default: z.string().optional().describe('Default value'),
        primary_key: z.boolean().optional().describe('Whether column is primary key'),
        auto_increment: z.boolean().optional().describe('Whether column is auto increment'),
        comment: z.string().optional().describe('Column comment'),
        after: z.string().optional().describe('Position after which column should be placed'),
        first: z.boolean().optional().describe('Whether column should be first'),
      }).optional().describe('Column definition for ADD/MODIFY operations'),
      index: z.object({
        name: z.string().describe('Index name'),
        columns: z.array(z.string()).describe('Column names'),
        type: z.enum(['PRIMARY', 'UNIQUE', 'INDEX', 'FULLTEXT', 'SPATIAL']).optional().describe('Index type'),
        comment: z.string().optional().describe('Index comment'),
      }).optional().describe('Index definition for ADD_INDEX/DROP_INDEX operations'),
      foreign_key: z.object({
        name: z.string().describe('Foreign key name'),
        columns: z.array(z.string()).describe('Local column names'),
        referenced_table: z.string().describe('Referenced table name'),
        referenced_columns: z.array(z.string()).describe('Referenced column names'),
        on_delete: z.enum(['RESTRICT', 'CASCADE', 'SET_NULL', 'NO_ACTION', 'SET_DEFAULT']).optional().describe('ON DELETE action'),
        on_update: z.enum(['RESTRICT', 'CASCADE', 'SET_NULL', 'NO_ACTION', 'SET_DEFAULT']).optional().describe('ON UPDATE action'),
      }).optional().describe('Foreign key definition for ADD_FOREIGN_KEY/DROP_FOREIGN_KEY operations'),
    })).describe('Array of alterations to perform')
  }),
  handler: async (args) => {
    const startTime = Date.now();
    // 验证表名（只验证一次）
    mysqlManager.validateTableName(args.table_name);

    // 检查ALTER操作数量限制
    if (args.alterations.length > mysqlManager.configManager.security.maxResultRows) {
      throw new MySQLMCPError(
        `ALTER操作数量 (${args.alterations.length}) 超过最大限制 (${mysqlManager.configManager.security.maxResultRows})`,
        ErrorCategory.CONSTRAINT_VIOLATION,
        ErrorSeverity.HIGH
      );
    }

    // 预先验证所有修改操作，减少重复验证调用
    const validationErrors: string[] = [];
    args.alterations.forEach((alteration, index) => {
      if (alteration.column) {
        try {
          mysqlManager.validateInput(alteration.column.name, `alteration_${index}_column_name`);
          if (alteration.column.type) {
            mysqlManager.validateInput(alteration.column.type, `alteration_${index}_column_type`);
          }
          if (alteration.column.default !== undefined) {
            mysqlManager.validateInput(alteration.column.default, `alteration_${index}_column_default`);
          }
        } catch (error) {
          validationErrors.push(`列定义验证失败 (索引 ${index}): ${(error as Error).message}`);
        }
      }

      if (alteration.index) {
        try {
          mysqlManager.validateInput(alteration.index.name, `alteration_${index}_index_name`);
          alteration.index.columns.forEach((col, colIndex) => {
            mysqlManager.validateInput(col, `alteration_${index}_index_column_${colIndex}`);
          });
        } catch (error) {
          validationErrors.push(`索引定义验证失败 (索引 ${index}): ${(error as Error).message}`);
        }
      }

      if (alteration.foreign_key) {
        try {
          mysqlManager.validateInput(alteration.foreign_key.name, `alteration_${index}_foreign_key_name`);
          mysqlManager.validateInput(alteration.foreign_key.referenced_table, `alteration_${index}_foreign_key_referenced_table`);
          alteration.foreign_key.columns.forEach((col, colIndex) => {
            mysqlManager.validateInput(col, `alteration_${index}_foreign_key_column_${colIndex}`);
          });
          alteration.foreign_key.referenced_columns.forEach((col, colIndex) => {
            mysqlManager.validateInput(col, `alteration_${index}_foreign_key_referenced_column_${colIndex}`);
          });
        } catch (error) {
          validationErrors.push(`外键定义验证失败 (索引 ${index}): ${(error as Error).message}`);
        }
      }
    });

    // 如果有任何验证错误，提前返回
    if (validationErrors.length > 0) {
      const error = new MySQLMCPError(
        `输入验证失败: ${validationErrors.join('; ')}`,
        ErrorCategory.SECURITY_VIOLATION,
        ErrorSeverity.HIGH
      );
      throw error;
    }

    // 构建 ALTER TABLE 语句（优化字符串拼接）
    const alterStatements: string[] = [];

    for (const [index, alteration] of args.alterations.entries()) {
      try {
        switch (alteration.type) {
          case 'ADD_COLUMN': {
            if (!alteration.column) {
              throw new MySQLMCPError(
                `ADD_COLUMN 操作必须提供列定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            const columnParts: string[] = [];
            columnParts.push(`\`${alteration.column.name}\` ${alteration.column.type}`);

            if (alteration.column.nullable === false) {
              columnParts.push('NOT NULL');
            }

            if (alteration.column.auto_increment) {
              columnParts.push('AUTO_INCREMENT');
            }

            if (alteration.column.default !== undefined) {
              columnParts.push(`DEFAULT ${alteration.column.default}`);
            }

            if (alteration.column.comment) {
              columnParts.push(`COMMENT '${alteration.column.comment}'`);
            }

            if (alteration.column.first) {
              columnParts.push('FIRST');
            } else if (alteration.column.after) {
              columnParts.push(`AFTER \`${alteration.column.after}\``);
            }

            alterStatements.push(`ADD COLUMN ${columnParts.join(' ')}`);
            break;
          }

          case 'MODIFY_COLUMN': {
            if (!alteration.column) {
              throw new MySQLMCPError(
                `MODIFY_COLUMN 操作必须提供列定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            const modifyParts: string[] = [];
            modifyParts.push(`\`${alteration.column.name}\` ${alteration.column.type}`);

            if (alteration.column.nullable === false) {
              modifyParts.push('NOT NULL');
            }

            if (alteration.column.default !== undefined) {
              modifyParts.push(`DEFAULT ${alteration.column.default}`);
            }

            if (alteration.column.comment) {
              modifyParts.push(`COMMENT '${alteration.column.comment}'`);
            }

            if (alteration.column.after) {
              modifyParts.push(`AFTER \`${alteration.column.after}\``);
            }

            alterStatements.push(`MODIFY COLUMN ${modifyParts.join(' ')}`);
            break;
          }

          case 'DROP_COLUMN': {
            if (!alteration.column) {
              throw new MySQLMCPError(
                `DROP_COLUMN 操作必须提供列定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            alterStatements.push(`DROP COLUMN \`${alteration.column.name}\``);
            break;
          }

          case 'ADD_INDEX': {
            if (!alteration.index) {
              throw new MySQLMCPError(
                `ADD_INDEX 操作必须提供索引定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            const indexType = alteration.index.type ? `${alteration.index.type} ` : '';
            const indexColumns = alteration.index.columns.map(col => `\`${col}\``).join(', ');

            const indexParts: string[] = [];
            indexParts.push(`${indexType}INDEX \`${alteration.index.name}\` (${indexColumns})`);

            if (alteration.index.comment) {
              indexParts.push(`COMMENT '${alteration.index.comment}'`);
            }

            alterStatements.push(`ADD ${indexParts.join(' ')}`);
            break;
          }

          case 'DROP_INDEX': {
            if (!alteration.index) {
              throw new MySQLMCPError(
                `DROP_INDEX 操作必须提供索引定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            alterStatements.push(`DROP INDEX \`${alteration.index.name}\``);
            break;
          }

          case 'ADD_FOREIGN_KEY': {
            if (!alteration.foreign_key) {
              throw new MySQLMCPError(
                `ADD_FOREIGN_KEY 操作必须提供外键定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            const fkColumns = alteration.foreign_key.columns.map(col => `\`${col}\``).join(', ');
            const fkReferencedColumns = alteration.foreign_key.referenced_columns.map(col => `\`${col}\``).join(', ');

            const fkParts: string[] = [];
            fkParts.push(`ADD CONSTRAINT \`${alteration.foreign_key.name}\` FOREIGN KEY (${fkColumns}) REFERENCES \`${alteration.foreign_key.referenced_table}\` (${fkReferencedColumns})`);

            if (alteration.foreign_key.on_delete) {
              fkParts.push(`ON DELETE ${alteration.foreign_key.on_delete}`);
            }

            if (alteration.foreign_key.on_update) {
              fkParts.push(`ON UPDATE ${alteration.foreign_key.on_update}`);
            }

            alterStatements.push(fkParts.join(' '));
            break;
          }

          case 'DROP_FOREIGN_KEY': {
            if (!alteration.foreign_key) {
              throw new MySQLMCPError(
                `DROP_FOREIGN_KEY 操作必须提供外键定义 (索引 ${index})`,
                ErrorCategory.SYNTAX_ERROR,
                ErrorSeverity.MEDIUM
              );
            }

            alterStatements.push(`DROP FOREIGN KEY \`${alteration.foreign_key.name}\``);
            break;
          }

          default:
            throw new MySQLMCPError(
              `未知的修改类型: ${alteration.type} (索引 ${index})`,
              ErrorCategory.SYNTAX_ERROR,
              ErrorSeverity.HIGH
            );
        }
      } catch (error) {
        if (error instanceof MySQLMCPError) {
          throw error;
        }
        throw new MySQLMCPError(
          `处理修改操作失败 (索引 ${index}): ${(error as Error).message}`,
          ErrorCategory.SYNTAX_ERROR,
          ErrorSeverity.HIGH
        );
      }
    }

    // 对于大量ALTER操作，分批处理以避免超时
    let result: unknown;
    let affectedRows = 0;
    const batchSize = 50; // 每批最多50个操作

    if (alterStatements.length <= batchSize) {
      // 少量操作，一次性执行
      const alterQuery = `ALTER TABLE \`${args.table_name}\` ${alterStatements.join(', ')}`;
      result = await mysqlManager.executeQuery(alterQuery);
      affectedRows = (result as { affectedRows?: number } | undefined)?.affectedRows || 0;
    } else {
      // 大量操作，分批执行
      const totalBatches = Math.ceil(alterStatements.length / batchSize);
      mysqlManager.enhancedMetrics.recordQueryTime(totalBatches, 'alter_table_batches');

      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, alterStatements.length);
        const batchStatements = alterStatements.slice(start, end);
        const alterQuery = `ALTER TABLE \`${args.table_name}\` ${batchStatements.join(', ')}`;
        const batchResult = await mysqlManager.executeQuery(alterQuery);
        affectedRows += (batchResult as { affectedRows?: number } | undefined)?.affectedRows || 0;
      }
    }

    // 修改表后使缓存失效
    mysqlManager.invalidateCaches("ALTER", args.table_name);

    // 记录性能指标
    const queryTime = (Date.now() - startTime) / 1000;
    mysqlManager.enhancedMetrics.recordQueryTime(queryTime);
    mysqlManager.enhancedMetrics.recordQueryTime(args.alterations.length, 'alter_table_operations');

    return JSON.stringify({
      [StringConstants.SUCCESS_KEY]: true,
      altered_table: args.table_name,
      alter_operations: args.alterations.length,
      affected_rows: affectedRows,
      query_time: queryTime,
      batches_executed: Math.ceil(alterStatements.length / batchSize)
    }, null, 2);
  },
  errorMessage: StringConstants.MSG_QUERY_FAILED
}, systemMonitor));

/**
 * 批量操作工具
 *
 * 在单个事务中执行多个SQL操作，确保原子性和数据一致性。所有查询要么全部成功执行，要么全部回滚，
 * 特别适用于需要多步骤操作的复杂业务场景，如订单处理、库存管理等。提供完整的参数验证、
 * 性能监控和错误处理机制，确保批量操作的安全性和可靠性。
 *
 * @tool mysql_batch_execute
 * @param {Array} queries - 要执行的查询数组，每个查询对象包含sql语句和可选的params参数
 * @returns {Promise<string>} 包含成功状态、查询数量和所有操作结果的 JSON 格式数据
 * @throws {Error} 当任何查询失败、验证失败或事务执行错误时抛出，所有操作都会回滚
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_batch_execute',
  description: 'Execute multiple SQL operations in a single transaction for atomicity',
  parameters: z.object({
    queries: z.array(z.object({
      sql: z.string().describe('SQL query to execute'),
      params: z.array(z.any()).optional().describe('Optional parameters for the query')
    })).describe('Array of queries to execute in transaction')
  }),
  handler: async (args) => {
    // 添加性能标记
    const batchId = `mysql_batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    systemMonitor.mark(`${batchId}_start`);

    // 验证每个查询
    args.queries.forEach((query, index) => {
      mysqlManager.validateInput(query.sql, `query_${index}`);
      if (query.params) {
        query.params.forEach((param, paramIndex) => {
          mysqlManager.validateInput(param, `query_${index}_param_${paramIndex}`);
        });
      }
    });

    // 执行批量查询
    const results = await mysqlManager.executeBatchQueries(args.queries);

    // 批量操作后使相关缓存失效
    mysqlManager.invalidateCaches("DML");

    // 添加性能测量
    systemMonitor.mark(`${batchId}_end`);
    systemMonitor.measure(`mysql_batch_execute_${args.queries.length}_queries`, `${batchId}_start`, `${batchId}_end`);

    return JSON.stringify({
      [StringConstants.SUCCESS_KEY]: true,
      query_count: args.queries.length,
      results: results
    }, null, 2);
  },
  errorMessage: `批量执行失败：`
}, systemMonitor));

/**
 * 批量插入数据工具
 *
 * 高效地向表中批量插入多行数据，支持事务安全保障和性能优化。
 * 使用优化的批量插入算法，减少数据库往返次数，提高插入性能。
 * 自动验证所有数据，确保数据完整性和安全性，支持大数据量插入。
 * 提供详细的性能指标和插入统计信息，适用于数据导入和批量数据处理场景。
 *
 * @tool mysql_batch_insert
 * @param {string} table_name - 要插入数据的目标表名（经过安全验证和标识符转义）
 * @param {Array} data - 要插入的数据数组，每个元素为包含列名和值的对象
 * @returns {Promise<string>} 包含成功状态、插入统计信息和性能指标的 JSON 格式结果
 * @throws {Error} 当表名无效、数据格式错误、列结构不匹配或插入失败时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_batch_insert',
  description: 'Efficiently insert multiple rows of data into a table',
  parameters: z.object({
    table_name: z.string().describe('Name of the table to insert data into'),
    data: z.array(z.record(z.any())).describe('Array of objects containing data to insert')
  }),
  handler: async (args) => {
    if (!args.data || args.data.length === 0) {
      throw new Error('数据数组不能为空');
    }

    // 验证表名
    mysqlManager.validateTableName(args.table_name);

    // 获取列名（假设所有行具有相同的列结构）
    const columns = Object.keys(args.data[0]);

    // 验证列名和构建数据行
    const dataRows: unknown[][] = [];
    args.data.forEach((row, index) => {
      const rowColumns = Object.keys(row);

      // 确保所有行具有相同的列结构
      if (rowColumns.length !== columns.length || !rowColumns.every(col => columns.includes(col))) {
        throw new Error(`第 ${index + 1} 行的列结构与第一行不匹配`);
      }

      // 验证列名和值
      columns.forEach(col => {
        mysqlManager.validateInput(col, `column_${col}`);
        mysqlManager.validateInput(row[col], `row_${index}_${col}`);
      });

      // 构建数据行
      const rowData = columns.map(col => row[col]);
      dataRows.push(rowData);
    });

    // 使用高效的批量插入方法
    const result = await mysqlManager.executeBatchInsert(args.table_name, columns, dataRows);

    return JSON.stringify({
      [StringConstants.SUCCESS_KEY]: true,
      inserted_rows: result.totalRowsProcessed,
      affected_rows: result.affectedRows,
      batches_processed: result.batchesProcessed,
      batch_size: result.batchSize
    }, null, 2);
  },
  errorMessage: `批量插入失败：`
}, systemMonitor));

/**
 * 数据库备份工具
 *
 * 企业级数据库备份解决方案，支持多种备份策略和高级功能。
 * 提供全量备份、增量备份、大文件备份等多种备份类型，满足不同场景的需求。
 * 集成了进度跟踪、错误恢复、队列管理等高级功能，确保备份过程的可靠性和可观测性。
 * 支持智能压缩、数据验证、备份恢复等多种企业级特性。
 *
 * @tool mysql_backup
 * @param {string} [outputDir] - 备份文件输出目录路径（可选，默认为系统配置目录）
 * @param {boolean} [compress=true] - 是否压缩备份文件以节省存储空间
 * @param {boolean} [includeData=true] - 是否包含表数据（true）还是仅结构（false）
 * @param {boolean} [includeStructure=true] - 是否包含表结构定义
 * @param {string[]} [tables] - 指定要备份的表名列表（空值表示备份所有表）
 * @param {string} [filePrefix=mysql_backup] - 备份文件名前缀，用于标识备份来源
 * @param {number} [maxFileSize=100] - 单个备份文件的最大大小（MB），超过此大小将自动分卷
 * @param {string} [backupType=full] - 备份类型：full（全量）、incremental（增量）、large-file（大文件）
 * @param {string} [baseBackupPath] - 增量备份的基础备份文件路径
 * @param {string} [lastBackupTime] - 增量备份的最后备份时间戳（ISO字符串格式）
 * @param {string} [incrementalMode=timestamp] - 增量备份模式：timestamp（时间戳）、binlog（二进制日志）、manual（手动）
 * @param {string} [trackingTable=__backup_tracking] - 增量备份使用的跟踪表名
 * @param {string} [binlogPosition] - 二进制日志位置（用于binlog-based增量备份）
 * @param {number} [chunkSize=64] - 大文件备份的块大小（MB）
 * @param {number} [maxMemoryUsage=512] - 大文件备份的最大内存使用量（MB）
 * @param {boolean} [useMemoryPool=true] - 大文件备份是否使用内存池优化
 * @param {number} [compressionLevel=6] - 压缩级别（1-9，1最快，9最佳压缩）
 * @param {number} [diskThreshold=100] - 大文件备份的磁盘阈值（MB）
 * @param {boolean} [withProgress=false] - 是否启用进度跟踪功能
 * @param {boolean} [withRecovery=false] - 是否启用错误恢复机制
 * @param {number} [retryCount=2] - 错误恢复时的重试次数
 * @param {number} [priority=1] - 备份任务优先级（数字越大优先级越高）
 * @param {boolean} [useQueue=false] - 是否使用任务队列处理备份
 * @returns {Promise<string>} 包含详细备份结果的JSON格式数据，包括备份统计、性能指标和状态信息
 * @throws {Error} 当备份失败、权限不足、磁盘空间不足或配置错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_backup',
  description: 'Create database backup with multiple backup types and advanced options',
  parameters: z.object({
    // 基本备份选项
    outputDir: z.string().optional().describe('Output directory for backup files'),
    compress: z.boolean().optional().default(true).describe('Compress backup file'),
    includeData: z.boolean().optional().default(true).describe('Include table data in backup'),
    includeStructure: z.boolean().optional().default(true).describe('Include table structure in backup'),
    tables: z.array(z.string()).optional().describe('Specific tables to backup (empty for all tables)'),
    filePrefix: z.string().optional().default('mysql_backup').describe('Backup file name prefix'),
    maxFileSize: z.number().optional().default(100).describe('Maximum file size in MB before compression'),

    // 备份类型选择
    backupType: z.enum(['full', 'incremental', 'large-file']).optional().default('full').describe('Type of backup to perform'),

    // 增量备份选项
    baseBackupPath: z.string().optional().describe('Base backup file path for incremental backup'),
    lastBackupTime: z.string().optional().describe('Last backup timestamp for incremental backup (ISO string)'),
    incrementalMode: z.enum(['timestamp', 'binlog', 'manual']).optional().default('timestamp').describe('Incremental backup mode'),
    trackingTable: z.string().optional().default('__backup_tracking').describe('Table name for tracking backup history'),
    binlogPosition: z.string().optional().describe('Binary log position for binlog-based incremental backup'),

    // 大文件备份选项
    chunkSize: z.number().optional().default(64).describe('Chunk size in MB for large file backup'),
    maxMemoryUsage: z.number().optional().default(512).describe('Maximum memory usage in MB'),
    useMemoryPool: z.boolean().optional().default(true).describe('Use memory pool for large file backup'),
    compressionLevel: z.number().optional().default(6).describe('Compression level (1-9)'),
    diskThreshold: z.number().optional().default(100).describe('Disk threshold in MB for large file backup'),

    // 高级选项
    withProgress: z.boolean().optional().default(false).describe('Enable progress tracking'),
    withRecovery: z.boolean().optional().default(false).describe('Enable error recovery'),
    retryCount: z.number().optional().default(2).describe('Number of retry attempts'),
    priority: z.number().optional().default(1).describe('Task priority (higher = more priority)'),
    useQueue: z.boolean().optional().default(false).describe('Use task queue for backup')
  }),
  handler: async (args) => {
    const baseOptions: BackupOptions = {
      outputDir: args.outputDir,
      compress: args.compress,
      includeData: args.includeData,
      includeStructure: args.includeStructure,
      tables: args.tables,
      filePrefix: args.filePrefix,
      maxFileSize: args.maxFileSize
    };

    let result: unknown;

    switch (args.backupType) {
      case 'incremental': {
        // 增量备份
        const incrementalOptions = {
          ...baseOptions,
          baseBackupPath: args.baseBackupPath,
          lastBackupTime: args.lastBackupTime,
          incrementalMode: args.incrementalMode,
          trackingTable: args.trackingTable,
          binlogPosition: args.binlogPosition
        };

        if (args.withRecovery) {
          const recoveryResult = await backupTool.createBackupWithRecovery(incrementalOptions, {
            retryCount: args.retryCount || 2,
            retryDelay: 1000,
            exponentialBackoff: true
          });
          result = recoveryResult.success ? recoveryResult.result : recoveryResult;
        } else {
          result = await backupTool.createIncrementalBackup(incrementalOptions);
        }
        break;
      }

      case 'large-file': {
        // 大文件备份
        const largeFileOptions = {
          chunkSize: (args.chunkSize || 64) * 1024 * 1024,
          maxMemoryUsage: (args.maxMemoryUsage || 512) * 1024 * 1024,
          useMemoryPool: args.useMemoryPool,
          compressionLevel: args.compressionLevel,
          diskThreshold: (args.diskThreshold || 100) * 1024 * 1024
        };

        result = await backupTool.createLargeFileBackup(baseOptions, largeFileOptions);
        break;
      }

      case 'full':
      default: {
        // 全量备份
        if (args.useQueue) {
          // 使用任务队列
          const queueResult = await backupTool.createBackupQueued(baseOptions, args.priority || 1);
          result = queueResult.result || { taskId: queueResult.taskId, queued: true };
        } else if (args.withProgress) {
          // 带进度跟踪
          const progressResult = await backupTool.createBackupWithProgress(baseOptions);
          result = {
            ...progressResult.result,
            trackerId: progressResult.tracker.id,
            progress: progressResult.tracker.progress
          };
        } else if (args.withRecovery) {
          // 带错误恢复
          const recoveryResult = await backupTool.createBackupWithRecovery(baseOptions, {
            retryCount: args.retryCount || 2,
            retryDelay: 1000,
            exponentialBackoff: true,
            fallbackOptions: {
              compress: false,
              maxFileSize: 50
            }
          });
          result = recoveryResult.success ? recoveryResult.result : recoveryResult;
        } else {
          // 标准备份
          result = await backupTool.createBackup(baseOptions);
        }
        break;
      }
    }

    // 添加备份类型和使用的选项到结果中
    const enhancedResult = {
      ...(result as Record<string, unknown>),
      backupType: args.backupType,
      options: {
        withProgress: args.withProgress,
        withRecovery: args.withRecovery,
        useQueue: args.useQueue,
        incrementalMode: args.incrementalMode
      }
    };

    return JSON.stringify(enhancedResult, null, 2);
  },
  errorMessage: `数据备份失败:`
}, systemMonitor));

/**
 * 备份文件验证工具
 *
 * 企业级备份验证解决方案，确保备份文件的完整性、有效性和可恢复性。
 * 提供全面的备份验证，包括文件格式检查、数据完整性验证、元数据验证等。
 * 支持多种验证级别和详细的验证报告，帮助确保备份数据的可靠性。
 * 集成了智能验证算法，能够检测数据损坏、格式错误和潜在的恢复问题。
 *
 * @tool mysql_verify_backup
 * @param {string} backupFilePath - 要验证的备份文件完整路径（支持绝对路径和相对路径）
 * @param {boolean} [deepValidation=false] - 是否执行深度验证（检查数据完整性，可能耗时较长）
 * @param {boolean} [validateStructure=true] - 是否验证表结构和约束的完整性
 * @param {boolean} [validateData=false] - 是否验证数据的完整性和一致性
 * @param {boolean} [checkCorruption=true] - 是否检查文件损坏和数据损坏
 * @param {number} [maxSampleSize=1000] - 数据验证的最大采样大小（行数）
 * @param {boolean} [generateReport=true] - 是否生成详细的验证报告
 * @param {string} [outputFormat=json] - 验证报告的输出格式：json、text、html
 * @returns {Promise<string>} 包含详细验证结果的JSON格式数据，包括验证状态、问题列表、统计信息和恢复建议
 * @throws {Error} 当验证过程失败、文件不存在、权限不足或验证严重错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_verify_backup',
  description: 'Verify integrity and validity of MySQL backup files',
  parameters: z.object({
    backupFilePath: z.string().describe('Path to the backup file to verify')
  }),
  handler: async (args) => {
    const result = await backupTool.verifyBackup(args.backupFilePath);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: `备份验证失败:`
}, systemMonitor));

/**
 * 数据导出工具
 *
 * 企业级数据导出解决方案，支持将MySQL查询结果导出为多种格式文件（Excel、CSV、JSON）。
 * 集成了高级错误恢复机制、实时进度跟踪、任务队列管理等企业级特性。
 * 支持大数据量导出、内存优化、多种格式转换和详细的导出统计信息。
 * 特别适用于数据分析、报表生成、数据迁移等场景。
 *
 * @tool mysql_export_data
 * @param {string} query - 要执行的数据导出SQL查询语句（经过安全验证，支持参数化查询防止SQL注入）
 * @param {any[]} [params] - 可选的查询参数数组，用于参数化查询的安全执行
 *
 * @param {string} [outputDir] - 导出文件输出目录路径（可选，支持绝对路径和相对路径）
 * @param {string} [format=excel] - 导出文件格式：excel、csv、json（默认为Excel格式）
 * @param {string} [sheetName=Data] - Excel工作表名称（仅在Excel格式时有效）
 * @param {boolean} [includeHeaders=true] - 是否在导出文件中包含列标题行
 * @param {number} [maxRows=100000] - 导出数据的最大行数限制（用于性能和内存管理）
 * @param {string} [fileName] - 自定义导出文件名（自动添加相应扩展名）
 *
 * @param {boolean} [withRecovery=false] - 启用错误恢复机制，自动处理导出失败并尝试回退策略
 * @param {boolean} [withProgress=false] - 启用实时进度跟踪，提供详细的导出进度信息
 * @param {boolean} [useQueue=false] - 使用任务队列异步执行导出，提高系统并发处理能力
 * @param {number} [priority=1] - 队列任务优先级（数字越大优先级越高）
 *
 * @param {number} [retryCount=2] - 错误恢复时的最大重试次数
 * @param {number} [retryDelay=1000] - 重试之间的延迟时间（毫秒）
 * @param {boolean} [exponentialBackoff=true] - 使用指数退避策略增加重试间隔
 * @param {string} [fallbackFormat] - 导出失败时的回退格式（csv或json）
 * @param {number} [reducedBatchSize=1000] - 回退策略下减少的批处理大小
 *
 * @param {boolean} [enableCancellation=false] - 允许取消正在进行的导出操作
 * @param {boolean} [progressCallback=false] - 启用进度回调事件（用于实时监控）
 *
 * @param {number} [queueTimeout=300] - 队列中任务的最大等待时间（秒）
 * @param {boolean} [immediateReturn=false] - 使用队列时是否立即返回任务ID而不等待完成
 *
 * @returns {Promise<string>} 包含详细导出结果的JSON格式数据，包括文件路径、导出统计、性能指标和状态信息
 * @throws {Error} 当查询验证失败、导出过程错误、权限不足或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_export_data',
  description: 'Export query results with advanced features: error recovery, progress tracking, and queue management',
  parameters: z.object({
    query: z.string().describe('SQL query to execute for data export'),
    params: z.array(z.any()).optional().describe('Optional parameters for the query'),

    // 基本导出选项
    outputDir: z.string().optional().describe('Output directory for export files'),
    format: z.enum(['excel', 'csv', 'json']).optional().default('excel').describe('Export format'),
    sheetName: z.string().optional().default('Data').describe('Excel sheet name'),
    includeHeaders: z.boolean().optional().default(true).describe('Include column headers'),
    maxRows: z.number().optional().default(100000).describe('Maximum number of rows to export'),
    fileName: z.string().optional().describe('Custom file name (with appropriate extension)'),

    // 高级功能选项
    withRecovery: z.boolean().optional().default(false).describe('Enable error recovery with fallback strategies'),
    withProgress: z.boolean().optional().default(false).describe('Enable progress tracking'),
    useQueue: z.boolean().optional().default(false).describe('Use task queue for export'),
    priority: z.number().optional().default(1).describe('Task priority when using queue (higher = more priority)'),

    // 错误恢复选项
    retryCount: z.number().optional().default(2).describe('Number of retry attempts for error recovery'),
    retryDelay: z.number().optional().default(1000).describe('Delay between retry attempts (ms)'),
    exponentialBackoff: z.boolean().optional().default(true).describe('Use exponential backoff for retries'),
    fallbackFormat: z.enum(['csv', 'json']).optional().describe('Fallback format if original format fails'),
    reducedBatchSize: z.number().optional().default(1000).describe('Reduced batch size for fallback'),

    // 进度跟踪选项
    enableCancellation: z.boolean().optional().default(false).describe('Allow operation cancellation'),
    progressCallback: z.boolean().optional().default(false).describe('Enable progress callback events'),

    // 队列选项
    queueTimeout: z.number().optional().default(300).describe('Maximum time to wait in queue (seconds)'),
    immediateReturn: z.boolean().optional().default(false).describe('Return immediately with task ID if using queue')
  }),
  handler: async (args) => {
    // 验证查询
    mysqlManager.validateInput(args.query, 'export_query');
    if (args.params) {
      args.params.forEach((param, i) => {
        mysqlManager.validateInput(param, `export_param_${i}`);
      });
    }

    const baseOptions: ExportOptions = {
      outputDir: args.outputDir,
      format: args.format,
      sheetName: args.sheetName,
      includeHeaders: args.includeHeaders,
      maxRows: args.maxRows,
      fileName: args.fileName
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;

    // 根据选择的功能组合执行导出
    if (args.useQueue) {
      // 使用队列管理
      const queueResult = await backupTool.exportDataQueued(
        args.query,
        args.params || [],
        baseOptions,
        args.priority || 1
      );

      if (args.immediateReturn) {
        // 立即返回任务ID，不等待完成
        result = {
          success: true,
          taskId: queueResult.taskId,
          status: 'queued',
          message: '导出任务已加入队列，可使用 mysql_manage_queue 工具查看进度'
        };
      } else {
        // 等待任务完成
        result = queueResult.result || { taskId: queueResult.taskId, queued: true };
      }
    } else if (args.withProgress && args.withRecovery) {
      // 同时启用进度跟踪和错误恢复
      let cancellationToken: CancellationToken | undefined = undefined;
      if (args.enableCancellation) {
        cancellationToken = {
          isCancelled: false,
          cancel: () => {
            cancellationToken!.isCancelled = true;
          },
          onCancelled: (callback: () => void) => {
            if (cancellationToken!.isCancelled) callback();
          }
        };
      }

      const recoveryStrategy = {
        retryCount: args.retryCount || 2,
        retryDelay: args.retryDelay || 1000,
        exponentialBackoff: args.exponentialBackoff !== false,
        fallbackOptions: {
          format: args.fallbackFormat || 'csv',
          maxRows: Math.min(args.maxRows || 100000, args.reducedBatchSize || 1000),
          batchSize: args.reducedBatchSize || 1000
        }
      };

      // 先创建带进度的导出
      const progressResult = await backupTool.exportDataWithProgress(
        args.query,
        args.params || [],
        baseOptions,
        cancellationToken
      );

      // 如果失败，应用错误恢复策略
      if (!progressResult.result.success) {
        const recoveryResult = await backupTool.exportDataWithRecovery(
          args.query,
          args.params || [],
          baseOptions,
          recoveryStrategy
        );
        result = {
          ...recoveryResult.result,
          trackerId: progressResult.tracker.id,
          progress: progressResult.tracker.progress,
          recoveryApplied: recoveryResult.recoveryApplied,
          attemptsUsed: recoveryResult.attemptsUsed
        };
      } else {
        result = {
          ...progressResult.result,
          trackerId: progressResult.tracker.id,
          progress: progressResult.tracker.progress
        };
      }
    } else if (args.withProgress) {
      // 仅启用进度跟踪
      let cancellationToken: CancellationToken | undefined = undefined;
      if (args.enableCancellation) {
        cancellationToken = {
          isCancelled: false,
          cancel: () => {
            cancellationToken!.isCancelled = true;
          },
          onCancelled: (callback: () => void) => {
            if (cancellationToken!.isCancelled) callback();
          }
        };
      }

      const progressResult = await backupTool.exportDataWithProgress(
        args.query,
        args.params || [],
        baseOptions,
        cancellationToken
      );

      result = {
        ...progressResult.result,
        trackerId: progressResult.tracker.id,
        progress: progressResult.tracker.progress
      };
    } else if (args.withRecovery) {
      // 仅启用错误恢复
      const recoveryStrategy = {
        retryCount: args.retryCount || 2,
        retryDelay: args.retryDelay || 1000,
        exponentialBackoff: args.exponentialBackoff !== false,
        fallbackOptions: {
          format: args.fallbackFormat || 'csv',
          maxRows: Math.min(args.maxRows || 100000, args.reducedBatchSize || 1000),
          batchSize: args.reducedBatchSize || 1000
        },
        onRetry: (attempt: number, error: Error) => {
          logger.warn(`导出重试第 ${attempt} 次: ${error.message}`);
        },
        onFallback: (error: Error) => {
          logger.warn(`应用回退策略: ${error.message}`);
        }
      };

      const recoveryResult = await backupTool.exportDataWithRecovery(
        args.query,
        args.params || [],
        baseOptions,
        recoveryStrategy
      );

      result = recoveryResult.success ? {
        ...recoveryResult.result,
        recoveryApplied: recoveryResult.recoveryApplied,
        attemptsUsed: recoveryResult.attemptsUsed
      } : {
        success: false,
        error: recoveryResult.error,
        attemptsUsed: recoveryResult.attemptsUsed,
        finalError: recoveryResult.finalError?.message
      };
    } else {
      // 标准导出
      result = await backupTool.exportData(args.query, args.params || [], baseOptions);
    }

    // 添加扩展功能信息到结果中
    const enhancedResult = {
      ...result,
      exportMode: {
        withRecovery: args.withRecovery,
        withProgress: args.withProgress,
        useQueue: args.useQueue,
        format: args.format || 'excel'
      },
      options: {
        retryCount: args.retryCount,
        priority: args.priority,
        enableCancellation: args.enableCancellation,
        fallbackFormat: args.fallbackFormat
      }
    };

    return JSON.stringify(enhancedResult, null, 2);
  },
  errorMessage: `数据导出失败:`
}, systemMonitor));

/**
 * 生成数据报表工具
 *
 * 企业级数据报表生成解决方案，支持执行多个查询并生成综合数据报表。
 * 集成了多工作表Excel文件生成、自定义报表格式、性能指标整合等高级功能。
 * 特别适用于业务分析、市场调研、运营监控、财务报告等场景。
 * 提供完整的报表生命周期管理，从数据查询到格式化输出的一站式服务。
 *
 * @tool mysql_generate_report
 * @param {string} title - 报表标题（用于文件命名和报表头部显示，经过安全验证）
 * @param {string} [description] - 可选的报表描述（提供报表背景和用途说明）
 *
 * @param {Array} queries - 查询配置数组，每个查询对象包含以下属性：
 *   • name: 工作表名称或查询标识符（用于Excel多工作表）
 *   • query: 要执行的SQL查询语句（经过安全验证，支持参数化查询）
 *   • params: 可选的查询参数数组（用于参数化查询的安全执行）
 *
 * @param {string} [outputDir] - 报表文件输出目录路径（可选，支持绝对路径和相对路径）
 * @param {string} [fileName] - 自定义报表文件名（自动添加相应扩展名）
 * @param {boolean} [includeHeaders=true] - 是否在报表中包含列标题行
 *
 * @returns {Promise<string>} 包含详细报表生成结果的JSON格式数据，包括文件路径、生成统计、性能指标和状态信息
 * @throws {Error} 当查询验证失败、报表生成错误、权限不足或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_generate_report',
  description: 'Generate comprehensive data report with multiple queries',
  parameters: z.object({
    title: z.string().describe('Report title'),
    description: z.string().optional().describe('Report description'),
    queries: z.array(z.object({
      name: z.string().describe('Query section name'),
      query: z.string().describe('SQL query to execute'),
      params: z.array(z.any()).optional().describe('Optional query parameters')
    })).describe('Array of queries to include in report'),
    outputDir: z.string().optional().describe('Output directory for report files'),
    fileName: z.string().optional().describe('Custom report file name'),
    includeHeaders: z.boolean().optional().default(true).describe('Include column headers in report')
  }),
  handler: async (args) => {
    // 验证所有查询
    args.queries.forEach((queryConfig, index) => {
      mysqlManager.validateInput(queryConfig.query, `report_query_${index}`);
      mysqlManager.validateInput(queryConfig.name, `report_name_${index}`);
      if (queryConfig.params) {
        queryConfig.params.forEach((param, paramIndex) => {
          mysqlManager.validateInput(param, `report_query_${index}_param_${paramIndex}`);
        });
      }
    });

    const options: ExportOptions = {
      outputDir: args.outputDir,
      fileName: args.fileName,
      includeHeaders: args.includeHeaders
    };

    const reportConfig = {
      title: args.title,
      description: args.description,
      queries: args.queries,
      options,
      // 添加性能指标信息到报表中
      performanceMetrics: {
        enhancedStats: mysqlManager.enhancedMetrics.getPerformanceStats(),
        timeSeriesMetrics: {
          queryTimes: mysqlManager.enhancedMetrics.queryTimes.toTimeSeriesMetric(
            'report_query_times',
            'average',
            'milliseconds',
            'Query performance during report generation'
          ),
          cacheHitRates: mysqlManager.enhancedMetrics.cacheHitRates.toTimeSeriesMetric(
            'report_cache_performance',
            'average',
            'percentage',
            'Cache efficiency during report generation'
          )
        }
      }
    };

    const result = await backupTool.generateReport(reportConfig);
    return JSON.stringify(result, null, 2);
  },
  errorMessage: `报表生成失败:`
}, systemMonitor));

/**
 * MySQL数据导入工具
 *
 * 企业级MySQL数据库数据导入解决方案，支持多种数据格式（CSV、JSON、Excel、SQL）的批量导入。
 * 集成了智能数据验证、字段映射、事务管理、错误恢复和性能监控等高级特性。
 * 提供全面的数据导入功能，支持大数据量处理和复杂数据结构的导入。
 *
 * ┌─ 事务管理特性 ────────────────────────────────────────────────────────────────┐
 * │ • 单条事务模式（use_transaction=true）：整个导入过程在一个事务中，确保完全ACID特性
 * │ • 批量事务模式（use_transaction=false）：每批数据独立事务，保证批次级别的原子性
 * │ • 自动事务回滚：导入失败时自动回滚，确保数据一致性
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * @tool mysql_import_data
 * @param {string} table_name - 要导入数据的目标表名（经过安全验证和标识符转义）
 * @param {string} file_path - 要导入的数据文件完整路径（支持绝对路径和相对路径）
 * @param {string} format - 数据文件格式：csv、json、excel、sql（默认为csv）
 * @param {boolean} [has_headers=true] - CSV/Excel文件是否包含表头（默认为true）
 * @param {Record<string, string>} [field_mapping] - 字段映射配置，将源字段映射到目标字段
 * @param {number} [batch_size=1000] - 批量处理大小，用于分批导入大数据集
 * @param {boolean} [skip_duplicates=false] - 是否跳过重复数据（基于现有数据检查）
 * @param {string} [conflict_strategy=error] - 冲突处理策略：skip（跳过）、update（更新）、error（报错）
 * @param {boolean} [use_transaction=true] - 事务控制模式：
 *   • true: 单条事务模式，整个导入在一个事务中
 *   • false: 批量事务模式，每批数据独立事务
 * @param {boolean} [validate_data=true] - 是否验证数据格式和类型
 * @param {string} [encoding=utf8] - 文件编码格式（CSV、JSON、SQL格式有效）
 * @param {string} [sheet_name] - Excel工作表名称（Excel格式有效）
 * @param {string} [delimiter=,] - CSV字段分隔符（CSV格式有效）
 * @param {string} [quote="] - CSV引号字符（CSV格式有效）
 * @param {boolean} [with_progress=false] - 是否启用进度跟踪功能
 * @param {boolean} [with_recovery=false] - 是否启用错误恢复机制
 * @returns {Promise<string>} 包含详细导入结果的JSON格式数据，包括：
 *   • success: 导入是否成功
 *   • imported_rows: 成功导入的行数
 *   • skipped_rows: 跳过的行数
 *   • failed_rows: 失败的行数
 *   • total_rows: 总行数
 *   • duration: 导入耗时（毫秒）
 *   • batches_processed: 处理的批次数
 *   • file_path: 导入文件路径
 *   • format: 导入格式
 *   • table_name: 目标表名
 *   • error: 错误信息（失败时存在）
 *   • transaction_mode: 事务模式（"single_transaction" 或 "batch_transaction"）
 * @throws {Error} 当导入失败、文件不存在、权限不足或参数无效时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_import_data',
  description: 'Import data from various file formats (CSV, JSON, Excel, SQL) with advanced validation, mapping, and error handling',
  parameters: z.object({
    table_name: z.string().describe('Name of the target table to import data into'),
    file_path: z.string().describe('Path to the data file to import'),
    format: z.enum(['csv', 'json', 'excel', 'sql']).default('csv').describe('Format of the data file'),
    has_headers: z.boolean().optional().default(true).describe('Whether the CSV/Excel file has headers'),
    field_mapping: z.record(z.string()).optional().describe('Field mapping from source to target columns'),
    batch_size: z.number().int().min(1).max(10000).optional().default(1000).describe('Number of rows to process in each batch'),
    skip_duplicates: z.boolean().optional().default(false).describe('Skip duplicate rows based on existing data'),
    conflict_strategy: z.enum(['skip', 'update', 'error']).optional().default('error').describe('How to handle conflicts with existing data'),
    use_transaction: z.boolean().optional().default(true).describe('Use transaction to ensure data consistency'),
    validate_data: z.boolean().optional().default(true).describe('Validate data types and constraints before import'),
    encoding: z.string().optional().default('utf8').describe('File encoding (for CSV, JSON, SQL formats)'),
    sheet_name: z.string().optional().describe('Excel sheet name (for Excel format only)'),
    delimiter: z.string().optional().default(',').describe('CSV delimiter character (for CSV format only)'),
    quote: z.string().optional().default('"').describe('CSV quote character (for CSV format only)'),
    with_progress: z.boolean().optional().default(false).describe('Enable progress tracking'),
    with_recovery: z.boolean().optional().default(false).describe('Enable error recovery mechanisms')
  }),
  handler: async (args) => {
    // 构建导入选项
    const importOptions: ImportOptions = {
      tableName: args.table_name,
      filePath: args.file_path,
      format: args.format || 'csv',
      hasHeaders: args.has_headers,
      fieldMapping: args.field_mapping,
      batchSize: args.batch_size,
      skipDuplicates: args.skip_duplicates,
      conflictStrategy: args.conflict_strategy,
      useTransaction: args.use_transaction,
      validateData: args.validate_data,
      encoding: args.encoding,
      sheetName: args.sheet_name,
      delimiter: args.delimiter,
      quote: args.quote,
      withProgress: args.with_progress,
      withRecovery: args.with_recovery
    };

    // 执行导入
    const result = await importTool.importData(importOptions);

    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_QUERY_FAILED
}, systemMonitor));

/**
 * 系统状态检查工具
 *
 * 企业级系统诊断解决方案，提供全面的MySQL数据库服务器健康状况检查和性能监控。
 * 集成了连接状态诊断、导出操作监控、队列管理状态、系统资源监控等全方位监控能力。
 * 支持分层诊断（全面/连接/导出/队列/内存）和详细诊断信息展示。
 * 提供智能健康评估、性能指标分析、趋势预测和优化建议。
 *
 * @tool mysql_system_status
 * @param {string} [scope=full] - 诊断检查范围，支持以下选项：
 *   • "full" - 全面诊断（默认）：检查所有组件和系统状态
 *   • "connection" - 连接诊断：重点检查数据库连接、连接池、性能指标
 *   • "export" - 导出诊断：监控导出操作、队列状态、任务统计
 *   • "queue" - 队列诊断：分析任务队列状态、并发控制、失败分析
 *   • "memory" - 内存诊断：评估系统内存使用、GC状态、泄漏检测
 * @param {boolean} [includeDetails=false] - 是否包含详细信息：
 *   • false - 基础诊断结果（默认）
 *   • true - 详细诊断结果，包含配置信息、历史数据、详细统计等
 * @returns {Promise<string>} 包含系统状态信息的详细JSON格式结果，包括：
 *   • timestamp: 检查时间戳
 *   • scope: 检查范围
 *   • summary: 健康状态摘要（connection/export/queue/memory/overall）
 *   • connection: 连接状态信息（连接测试、连接池、性能指标、配置）
 *   • export: 导出操作状态（任务统计、活跃导出、完成历史）
 *   • queue: 队列管理状态（任务统计、状态分布、诊断信息）
 *   • memory: 系统资源状态（内存使用、GC统计、压力分析）
 *   • recommendations: 优化建议列表
 * @throws {Error} 当检查过程失败、数据库连接错误或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_system_status',
  description: 'Comprehensive system status check including connection, export, queue, and resource monitoring',
  parameters: z.object({
    scope: z.enum(['full', 'connection', 'export', 'queue', 'memory']).optional().default('full').describe('Scope of status check'),
    includeDetails: z.boolean().optional().default(false).describe('Include detailed diagnostic information')
  }),
  handler: async (args) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = {
      timestamp: new Date().toISOString(),
      scope: args.scope,
      summary: {}
    };

    // 连接和数据库状态检查
    if (args.scope === 'full' || args.scope === 'connection') {
      // 添加内存压力回调以调整缓存大小
      systemMonitor.addAlertCallback((event: { type: string }) => {
        if (event.type === 'high_memory_pressure' || event.type === 'memory_leak_suspicion') {
          try {
            mysqlManager.adjustCachesForMemoryPressure();
          } catch (error) {
            logger.warn('Failed to adjust caches for memory pressure:', undefined, { error: (error as Error).message });
          }
        }
      });

      // 执行连接测试
      let connectionTest;
      try {
        const connectionTestQuery = "SELECT 1 as test_connection, NOW() as server_time, VERSION() as mysql_version";
        const testResult = await mysqlManager.executeQuery(connectionTestQuery);
        connectionTest = {
          status: StringConstants.STATUS_SUCCESS,
          result: testResult
        };
      } catch (error) {
        connectionTest = {
          status: StringConstants.STATUS_FAILED,
          error: (error as Error).message
        };
      }

      result.connection = {
        test: connectionTest,
        poolStatus: mysqlManager.connectionPool.getStats(),
        performanceMetrics: mysqlManager.getPerformanceMetrics(),
        enhancedPerformanceStats: mysqlManager.enhancedMetrics.getPerformanceStats(),
        timeSeriesMetrics: {
          queryTimes: mysqlManager.enhancedMetrics.queryTimes.toTimeSeriesMetric(
            'query_execution_time',
            'average',
            'milliseconds',
            'Average query execution time over time'
          ),
          errorCounts: mysqlManager.enhancedMetrics.errorCounts.toTimeSeriesMetric(
            'error_count',
            'count',
            'errors',
            'Number of database errors over time'
          ),
          cacheHitRates: mysqlManager.enhancedMetrics.cacheHitRates.toTimeSeriesMetric(
            'cache_hit_rate',
            'average',
            'percentage',
            'Cache hit rate over time'
          )
        },
        config: args.includeDetails ? mysqlManager.configManager.toObject() : {
          connectionLimit: mysqlManager.configManager.database.connectionLimit,
          queryTimeout: mysqlManager.configManager.security.queryTimeout,
          maxQueryLength: mysqlManager.configManager.security.maxQueryLength
        }
      };

      result.summary.connection = connectionTest.status === StringConstants.STATUS_SUCCESS ? 'healthy' : 'failed';
    }

    // 导出状态检查
    if (args.scope === 'full' || args.scope === 'export') {
      const queueStats = backupTool.getQueueStats();
      const allTasks = backupTool.getAllTasks();
      const exportTasks = allTasks.filter(task => task.type === 'export');
      const activeTrackers = backupTool.getActiveTrackers().filter(t => t.operation === 'export');

      result.export = {
        summary: {
          totalExportTasks: exportTasks.length,
          runningExports: exportTasks.filter(t => t.status === 'running').length,
          queuedExports: exportTasks.filter(t => t.status === 'queued').length,
          activeTrackers: activeTrackers.length,
          queueMetrics: {
            totalTasks: queueStats.totalTasks,
            maxConcurrent: queueStats.maxConcurrentTasks,
            averageWaitTime: Math.round(queueStats.averageWaitTime / 1000) + 's',
            averageExecutionTime: Math.round(queueStats.averageExecutionTime / 1000) + 's'
          }
        },
        activeExports: activeTrackers.map(tracker => ({
          id: tracker.id,
          stage: tracker.progress.stage,
          progress: tracker.progress.progress + '%',
          message: tracker.progress.message,
          elapsed: Math.round((Date.now() - tracker.startTime.getTime()) / 1000) + 's'
        }))
      };

      if (args.includeDetails) {
        const recentExportTasks = exportTasks
          .filter(task => task.completedAt && Date.now() - task.completedAt.getTime() < 3600000)
          .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))
          .slice(0, 5);

        result.export.recentCompleted = recentExportTasks.map(task => ({
          id: task.id,
          status: task.status,
          completedAt: task.completedAt?.toISOString(),
          duration: task.startedAt && task.completedAt
            ? Math.round((task.completedAt.getTime() - task.startedAt.getTime()) / 1000) + 's'
            : 'N/A',
          error: task.error || null
        }));
      }

      result.summary.export = activeTrackers.length > 0 ? 'active' : 'idle';
    }

    // 队列状态检查
    if (args.scope === 'full' || args.scope === 'queue') {
      const queueStats = backupTool.getQueueStats();
      const allTasks = backupTool.getAllTasks();

      result.queue = {
        statistics: queueStats,
        taskBreakdown: {
          total: allTasks.length,
          backup: allTasks.filter(t => t.type === 'backup').length,
          export: allTasks.filter(t => t.type === 'export').length,
          byStatus: {
            queued: allTasks.filter(t => t.status === 'queued').length,
            running: allTasks.filter(t => t.status === 'running').length,
            completed: allTasks.filter(t => t.status === 'completed').length,
            failed: allTasks.filter(t => t.status === 'failed').length
          }
        }
      };

      if (args.includeDetails) {
        result.queue.diagnostics = backupTool.getQueueDiagnostics();
        result.queue.recentTasks = allTasks.slice(-10);
      }

      const queueHealth = queueStats.runningTasks <= queueStats.maxConcurrentTasks &&
        queueStats.failedTasks < queueStats.completedTasks * 0.1;
      result.summary.queue = queueHealth ? 'healthy' : 'stressed';
    }

    // 内存和系统资源状态检查
    if (args.scope === 'full' || args.scope === 'memory') {
      const systemResources = systemMonitor.getCurrentResources();
      const systemHealth = systemMonitor.getSystemHealth();
      const memoryStats = memoryMonitor.getMemoryStats();
      const gcStats = memoryMonitor.getGCStats();
      const memoryUsage = backupTool.getMemoryUsage();
      const memoryPressure = backupTool.getMemoryPressure();

      result.memory = {
        current: {
          heap_used: `${(memoryStats.current.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
          heap_total: `${(memoryStats.current.usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
          rss: `${(memoryStats.current.usage.rss / 1024 / 1024).toFixed(2)} MB`,
          pressure_level: `${(memoryStats.current.pressureLevel * 100).toFixed(2)}%`
        },
        gc: {
          triggered: gcStats.triggered,
          last_gc: gcStats.lastGC ? new Date(gcStats.lastGC).toISOString() : null,
          total_freed: `${(gcStats.memoryFreed / 1024 / 1024).toFixed(2)} MB`
        },
        backupTool: {
          usage: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
          },
          pressure: Math.round(memoryPressure * 100) + '%'
        },
        systemHealth: {
          status: systemHealth.status,
          issues: systemHealth.issues,
          recommendations: systemHealth.recommendations,
          memoryOptimization: systemHealth.memoryOptimization
        },
        trend: memoryStats.trend,
        leakSuspicions: memoryStats.leakSuspicions
      };

      if (args.includeDetails) {
        const systemPerformanceMetrics = systemMonitor.getPerformanceMetrics();
        result.memory.systemPerformance = {
          measures: systemPerformanceMetrics.measures.slice(-10),
          gcEvents: systemPerformanceMetrics.gcEvents.slice(-5),
          eventLoopDelay: systemPerformanceMetrics.eventLoopDelayStats,
          slowOperations: systemPerformanceMetrics.slowOperations.slice(0, 5)
        };
        result.memory.systemResources = systemResources;

        // 添加内存相关的时间序列指标
        if (mysqlManager.enhancedMetrics.systemMetrics && mysqlManager.enhancedMetrics.systemMetrics.toTimeSeriesMetric) {
          result.memory.timeSeriesMetrics = {
            systemMetrics: mysqlManager.enhancedMetrics.systemMetrics.toTimeSeriesMetric(
              'system_memory_usage',
              'average',
              'bytes',
              'System memory usage over time'
            )
          };
        }
      }

      // 使用systemHealth的状态来更准确地评估内存健康状况
      const memoryHealth = systemHealth.status === 'healthy' || 
        (systemHealth.status === 'warning' && memoryStats.current.pressureLevel < 0.7);
      result.summary.memory = memoryHealth ? 'healthy' : 'stressed';
    }

    // 整体健康状态评估
    const healthStatus = [];
    if (result.summary.connection === 'failed') healthStatus.push('connection');
    if (result.summary.queue === 'stressed') healthStatus.push('queue');
    if (result.summary.memory === 'stressed') healthStatus.push('memory');

    result.summary.overall = healthStatus.length === 0 ? 'healthy' :
      healthStatus.length === 1 ? 'warning' : 'critical';
    result.summary.issues = healthStatus;

    // 生成建议
    const recommendations = [];
    if (result.connection?.test?.status === StringConstants.STATUS_FAILED) {
      recommendations.push('检查数据库连接配置和网络连通性');
    }
    if (result.memory?.current && parseFloat(result.memory.current.pressure_level) > 80) {
      recommendations.push('内存压力较高，考虑使用 mysql_optimize_memory 工具进行优化');
    }
    if (result.queue?.statistics && result.queue.statistics.queuedTasks > 10) {
      recommendations.push('队列任务较多，可能需要调整处理速度');
    }
    if (result.memory?.leakSuspicions && result.memory.leakSuspicions > 0) {
      recommendations.push(`检测到 ${result.memory.leakSuspicions} 次可能的内存泄漏，建议检查代码中的对象引用`);
    }

    // 添加来自systemHealth的建议
    if (result.memory?.systemHealth?.recommendations && result.memory.systemHealth.recommendations.length > 0) {
      recommendations.push(...result.memory.systemHealth.recommendations);
    }

    if (recommendations.length === 0) {
      recommendations.push('系统运行正常，无需特别关注');
    }

    result.recommendations = recommendations;

    return JSON.stringify(result, null, 2);
  },
  errorMessage: StringConstants.MSG_DIAGNOSE_FAILED
}, systemMonitor));

/**
 * 错误分析工具
 *
 * 企业级MySQL错误智能诊断解决方案，深度分析数据库错误并提供精准的恢复策略。
 * 集成了错误分类、上下文感知、自动诊断、恢复建议生成等全方位错误处理能力。
 * 支持语法错误、连接问题、权限错误、约束冲突等多种错误类型的智能识别和处理。
 *
 * @tool mysql_analyze_error
 * @param {string} error_message - 要分析的MySQL错误消息（完整错误信息，经过安全验证）
 * @param {string} [operation=unknown] - 可选的操作上下文，帮助提供更精准的诊断建议：
 *   • "connection" - 数据库连接相关操作
 *   • "query" - SQL查询执行相关
 *   • "ddl" - 数据定义语言操作（CREATE/ALTER/DROP）
 *   • "dml" - 数据操纵语言操作（INSERT/UPDATE/DELETE）
 *   • "backup" - 备份恢复操作
 *   • "export" - 数据导出操作
 *   • "import" - 数据导入操作
 *   • "security" - 安全相关操作
 *   • "unknown" - 未知操作类型（默认）
 * @returns {Promise<string>} 包含详细错误分析结果的JSON格式数据，包括：
 *   • error_category: 错误分类（语法/连接/权限/约束/性能/其他）
 *   • severity: 错误严重程度（low/medium/high/critical）
 *   • root_cause: 根本原因分析
 *   • diagnosis: 详细诊断信息
 *   • immediate_actions: 立即执行的修复步骤
 *   • preventive_measures: 预防措施建议
 *   • related_errors: 相关常见错误模式
 *   • confidence_score: 诊断置信度（0-100）
 * @throws {Error} 当分析过程失败、错误消息无效或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_analyze_error',
  description: 'Analyze MySQL errors and provide diagnostic information, recovery suggestions, and prevention tips',
  parameters: z.object({
    error_message: z.string().describe('The error message to analyze'),
    operation: z.string().optional().describe('Optional operation context')
  }),
  handler: async (args) => {
    // 创建一个错误对象用于分析
    const error = new Error(args.error_message);

    // 使用统一的错误分析功能
    const analysis = ErrorHandler.analyzeError(error, args.operation || 'unknown');

    return JSON.stringify({
      [StringConstants.SUCCESS_KEY]: true,
      analysis: analysis
    }, null, 2);
  },
  errorMessage: StringConstants.MSG_ANALYZE_ERROR_FAILED
}, systemMonitor));

/**
 * 安全审计工具
 *
 * 企业级MySQL数据库安全审计解决方案，执行全面的安全性评估和合规性检查。
 * 集成了配置安全分析、用户权限审计、数据保护评估、安全威胁检测等全方位安全诊断能力。
 * 支持多种安全标准合规检查，帮助企业识别安全风险并制定安全加固策略。
 *
 * @tool mysql_security_audit
 * @returns {Promise<string>} 包含详细安全审计报告的JSON格式数据，包括：
 *   • audit_summary: 审计摘要信息（总分、风险等级、检查项目数量）
 *   • configuration_security: 配置安全审计结果
 *   • user_access_security: 用户访问安全审计结果
 *   • data_protection: 数据保护安全评估结果
 *   • compliance_check: 合规性检查结果（SOX/GDPR/PCI-DSS等）
 *   • vulnerability_assessment: 安全漏洞评估结果
 *   • risk_assessment: 风险评估报告（风险评分、优先级排序）
 *   • recommendations: 安全修复建议列表（按优先级排序）
 *   • audit_metadata: 审计元数据（审计时间、版本、执行人等）
 * @throws {Error} 当审计过程失败、数据库连接错误或权限不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_security_audit',
  description: 'Perform comprehensive security audit and generate compliance report',
  parameters: z.object({}),
  handler: async () => {
    const securityAuditor = createSecurityAuditor(mysqlManager);
    const auditReport = await securityAuditor.performSecurityAudit();
    return JSON.stringify(auditReport, null, 2);
  },
  errorMessage: StringConstants.MSG_QUERY_FAILED
}, systemMonitor));

/**
 * 索引管理工具
 *
 * 企业级MySQL索引管理解决方案，提供完整的索引生命周期管理功能。
 * 集成了索引创建、删除、优化分析等全方位索引管理能力。
 * 支持多种索引类型，包括普通索引、唯一索引、主键索引、全文索引、空间索引。
 * 适用于数据库管理员进行索引优化、性能调优等场景。
 *
 * @tool mysql_manage_indexes
 * @param {string} action - 要执行的索引管理操作类型：
 *   • "create" - 创建新索引
 *   • "drop" - 删除索引
 *   • "analyze" - 分析索引使用情况
 *   • "optimize" - 优化索引结构
 *   • "list" - 列出索引信息
 * @param {string} table_name - 要操作的表名（所有操作都需要）
 * @param {string} [index_name] - 索引名称（create和drop操作需要）
 * @param {string} [index_type=INDEX] - 索引类型（仅create操作有效）：
 *   • "INDEX" - 普通索引
 *   • "UNIQUE" - 唯一索引
 *   • "PRIMARY" - 主键索引
 *   • "FULLTEXT" - 全文索引
 *   • "SPATIAL" - 空间索引
 * @param {string[]} [columns] - 索引列名列表（仅create操作有效，必须提供）
 * @param {boolean} [if_exists=false] - 删除索引时是否检查索引存在（仅drop操作有效）
 * @param {boolean} [invisible=false] - 是否创建不可见索引（仅create操作有效）
 * @returns {Promise<string>} 包含详细索引管理结果的JSON格式数据，根据操作类型返回不同结构：
 *   • create操作：返回索引创建结果、索引信息确认
 *   • drop操作：返回索引删除结果、影响统计
 *   • analyze操作：返回索引分析结果、使用统计、性能建议
 *   • optimize操作：返回索引优化结果、优化统计、改进建议
 *   • list操作：返回索引列表信息、缓存状态统计
 * @throws {Error} 当操作失败、索引不存在、权限不足或参数无效时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_manage_indexes',
  description: 'Manage MySQL indexes: create, drop, analyze, and optimize indexes',
  parameters: z.object({
    action: z.enum(['create', 'drop', 'analyze', 'optimize', 'list']).describe('Index management action to perform'),
    table_name: z.string().optional().describe('Name of the table to manage indexes for (required for create, drop, analyze, optimize actions)'),
    index_name: z.string().optional().describe('Index name (required for create and drop actions)'),
    index_type: z.enum(['INDEX', 'UNIQUE', 'PRIMARY', 'FULLTEXT', 'SPATIAL']).optional().default('INDEX').describe('Type of index to create (only for create action)'),
    columns: z.array(z.string()).optional().describe('Column names for the index (required for create action)'),
    if_exists: z.boolean().optional().default(false).describe('Check if index exists before dropping (only for drop action)'),
    invisible: z.boolean().optional().default(false).describe('Create invisible index (only for create action)')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      case 'create': {
        if (!args.table_name || !args.index_name || !args.columns || args.columns.length === 0) {
          throw new Error('创建索引时必须提供表名、索引名称和列名列表');
        }

        mysqlManager.validateTableName(args.table_name);
        mysqlManager.validateInput(args.index_name, 'index_name');
        args.columns.forEach(col => {
          mysqlManager.validateInput(col, 'column_name');
        });

        // 构建 CREATE INDEX 语句
        let createIndexQuery: string;
        const columnsStr = args.columns.map(col => `\`${col}\``).join(', ');

        if (args.index_type === 'PRIMARY') {
          createIndexQuery = `ALTER TABLE \`${args.table_name}\` ADD PRIMARY KEY (${columnsStr})`;
        } else {
          const indexTypeStr = args.index_type === 'UNIQUE' ? 'UNIQUE INDEX' :
            args.index_type === 'FULLTEXT' ? 'FULLTEXT INDEX' :
              args.index_type === 'SPATIAL' ? 'SPATIAL INDEX' : 'INDEX';
          const invisibleStr = args.invisible ? ' INVISIBLE' : '';
          createIndexQuery = `CREATE ${indexTypeStr} \`${args.index_name}\` ON \`${args.table_name}\` (${columnsStr})${invisibleStr}`;
        }

        await mysqlManager.executeQuery(createIndexQuery);

        result = {
          success: true,
          action: 'create',
          index: {
            name: args.index_name,
            table: args.table_name,
            type: args.index_type,
            columns: args.columns,
            invisible: args.invisible,
            created: new Date().toISOString()
          },
          message: `索引 '${args.index_name}' 创建成功`
        };
        break;
      }

      case 'drop': {
        if (!args.table_name || !args.index_name) {
          throw new Error('删除索引时必须提供表名和索引名称');
        }

        mysqlManager.validateTableName(args.table_name);
        mysqlManager.validateInput(args.index_name, 'index_name');

        let dropIndexQuery: string;

        if (args.index_name.toUpperCase() === 'PRIMARY') {
          dropIndexQuery = `ALTER TABLE \`${args.table_name}\` DROP PRIMARY KEY`;
        } else {
          dropIndexQuery = `DROP INDEX ${args.if_exists ? 'IF EXISTS' : ''} \`${args.index_name}\` ON \`${args.table_name}\``;
        }

        await mysqlManager.executeQuery(dropIndexQuery);

        result = {
          success: true,
          action: 'drop',
          index: {
            name: args.index_name,
            table: args.table_name,
            deleted: new Date().toISOString()
          },
          message: `索引 '${args.index_name}' 删除成功`
        };
        break;
      }

      case 'analyze': {
        if (!args.table_name) {
          throw new Error('分析索引时必须提供表名');
        }
        mysqlManager.validateTableName(args.table_name);

        // 获取表的索引信息
        const indexInfoQuery = `
            SELECT
              INDEX_NAME,
              COLUMN_NAME,
              NON_UNIQUE,
              SEQ_IN_INDEX,
              INDEX_TYPE,
              CARDINALITY,
              PAGES,
              FILTER_CONDITION,
              INDEX_COMMENT,
              IS_VISIBLE
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
          `;

        const indexes = await mysqlManager.executeQuery(indexInfoQuery, [args.table_name]) as Record<string, unknown>[];

        // 分析索引使用情况（需要执行EXPLAIN来获取更多信息）
        const analyzeQuery = `ANALYZE TABLE \`${args.table_name}\``;
        const analyzeResult = await mysqlManager.executeQuery(analyzeQuery);

        // 生成分析报告
        const analysis = {
          table_name: args.table_name,
          total_indexes: indexes.length,
          index_types: {
            primary: indexes.filter(idx => (idx.INDEX_NAME as string) === 'PRIMARY').length,
            unique: indexes.filter(idx => (idx.NON_UNIQUE as number) === 0 && (idx.INDEX_NAME as string) !== 'PRIMARY').length,
            regular: indexes.filter(idx => (idx.NON_UNIQUE as number) === 1).length
          },
          indexes: indexes,
          table_analysis: analyzeResult,
          recommendations: [] as string[]
        };

        // 生成建议
        if (indexes.length === 0) {
          analysis.recommendations.push('建议为经常查询的列创建索引');
        }

        const primaryIndexes = indexes.filter(idx => (idx.INDEX_NAME as string) === 'PRIMARY');
        if (primaryIndexes.length === 0) {
          analysis.recommendations.push('建议为表创建主键索引');
        }

        const duplicateIndexes = indexes.filter((idx, index, self) =>
          index !== self.findIndex(i => (i.COLUMN_NAME as string) === (idx.COLUMN_NAME as string))
        );
        if (duplicateIndexes.length > 0) {
          analysis.recommendations.push('发现重复索引，建议清理冗余索引');
        }

        result = {
          success: true,
          action: 'analyze',
          analysis: analysis,
          message: `索引分析完成，共发现 ${indexes.length} 个索引`
        };
        break;
      }

      case 'optimize': {
        if (!args.table_name) {
          throw new Error('优化索引时必须提供表名');
        }
        mysqlManager.validateTableName(args.table_name);

        // 优化表的索引
        const optimizeQuery = `OPTIMIZE TABLE \`${args.table_name}\``;
        const optimizeResult = await mysqlManager.executeQuery(optimizeQuery);

        result = {
          success: true,
          action: 'optimize',
          table: args.table_name,
          optimization_result: optimizeResult,
          optimized_at: new Date().toISOString(),
          message: `表 '${args.table_name}' 索引优化完成`
        };
        break;
      }

      case 'list': {
        if (args.table_name) {
          mysqlManager.validateTableName(args.table_name);
          // 使用缓存版本以获得更好的性能
          const cacheKey = `indexes_${args.table_name}`;
          const cachedResult = await mysqlManager.cacheManager.get<string>(CacheRegion.INDEX, cacheKey);

          if (cachedResult === null) {
            const indexesQuery = `
                SELECT
                  INDEX_NAME,
                  COLUMN_NAME,
                  NON_UNIQUE,
                  SEQ_IN_INDEX,
                  INDEX_TYPE
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                ORDER BY INDEX_NAME, SEQ_IN_INDEX
              `;
            const queryResult = await mysqlManager.executeQuery(indexesQuery, [args.table_name]) as Record<string, unknown>[];
            const resultData = JSON.stringify(queryResult, null, 2);
            mysqlManager.cacheManager.set(CacheRegion.INDEX, cacheKey, resultData);
            mysqlManager.metrics.cacheMisses++;

            result = {
              success: true,
              action: 'list',
              table_name: args.table_name,
              indexes: queryResult,
              total_indexes: queryResult.length,
              message: `找到表 '${args.table_name}' 的 ${queryResult.length} 个索引`,
              cached: false
            };
          } else {
            mysqlManager.metrics.cacheHits++;
            result = {
              success: true,
              action: 'list',
              table_name: args.table_name,
              indexes: JSON.parse(cachedResult),
              total_indexes: (JSON.parse(cachedResult) as unknown[]).length,
              message: `从缓存中找到表 '${args.table_name}' 的索引信息`,
              cached: true
            };
          }
        } else {
          // 获取所有表的索引信息（不使用缓存）
          const query = `
              SELECT
                TABLE_NAME,
                INDEX_NAME,
                COLUMN_NAME,
                NON_UNIQUE,
                SEQ_IN_INDEX,
                INDEX_TYPE
              FROM INFORMATION_SCHEMA.STATISTICS
              WHERE TABLE_SCHEMA = DATABASE()
              ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
            `;
          const allIndexes = await mysqlManager.executeQuery(query) as Record<string, unknown>[];

          result = {
            success: true,
            action: 'list',
            indexes: allIndexes,
            total_indexes: allIndexes.length,
            message: `找到所有表的 ${allIndexes.length} 个索引`,
            cached: false
          };
        }
        break;
      }

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `索引管理操作失败:`
}, systemMonitor));

/**
 * MySQL性能优化工具
 *
 * 企业级MySQL性能优化和慢查询管理解决方案，统一提供慢查询日志管理和性能优化功能。
 * 集成了慢查询启用/禁用、配置管理、实时监控、慢查询分析、索引优化建议等全方位功能。
 * 支持智能性能诊断、性能瓶颈识别、查询模式分析、索引建议生成和详细性能报告。
 * 适用于数据库管理员进行性能调优、查询优化和系统监控。
 *
 * @tool mysql_performance_optimize
 * @param {string} action - 要执行的性能优化操作类型：
 *   • "enable_slow_query_log" - 启用慢查询日志
 *   • "disable_slow_query_log" - 禁用慢查询日志
 *   • "status_slow_query_log" - 获取慢查询日志状态
 *   • "analyze_slow_queries" - 分析慢查询并生成报告
 *   • "start_monitoring" - 开始性能监控
 *   • "stop_monitoring" - 停止性能监控
 *   • "get_active_slow_queries" - 获取当前活跃的慢查询
 *   • "suggest_indexes" - 基于查询模式分析，生成索引优化建议
 *   • "performance_report" - 生成综合性能报告，包含系统状态和优化建议
 *   • "query_profiling" - 对特定查询进行性能剖析和优化建议
 * @param {string} [query] - 要进行性能剖析的SQL查询语句（仅用于query_profiling操作）
 * @param {any[]} [params] - 查询参数数组（仅用于query_profiling操作）
 * @param {number} [limit=50] - 分析结果的最大数量限制
 * @param {boolean} [include_details=true] - 是否包含详细的分析信息
 * @param {string} [time_range="1 day"] - 分析的时间范围（用于慢查询分析）
 * @param {number} [longQueryTime] - 慢查询阈值（秒，默认为全局配置）
 * @param {boolean} [logQueriesNotUsingIndexes] - 是否记录未使用索引的查询
 * @param {number} [monitoringIntervalMinutes=60] - 监控间隔（分钟）
 * @returns {Promise<string>} 包含详细性能优化结果的JSON格式数据，根据操作类型返回不同结构：
 *   • 慢查询日志操作：返回日志操作结果、配置状态
 *   • 分析操作：返回慢查询分析结果、性能瓶颈识别、最耗时查询统计
 *   • 监控操作：返回监控状态变更、配置信息
 *   • suggest_indexes操作：返回索引优化建议、缺失索引分析、查询模式统计
 *   • performance_report操作：返回综合性能报告、系统状态评估、优化建议列表
 *   • query_profiling操作：返回查询性能剖析结果、执行计划分析、优化建议
 * @throws {Error} 当性能分析失败、日志操作失败、查询执行错误或权限不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_performance_optimize',
  description: 'Enterprise MySQL performance optimization and slow query management solution',
  parameters: z.object({
    action: z.enum([
      'enable_slow_query_log', 'disable_slow_query_log', 'status_slow_query_log',
      'analyze_slow_queries', 'start_monitoring', 'stop_monitoring', 'get_active_slow_queries',
      'suggest_indexes', 'performance_report', 'query_profiling'
    ]).describe('Performance optimization action to perform'),
    query: z.string().optional().describe('SQL query to profile (required for query_profiling action)'),
    params: z.array(z.any()).optional().describe('Query parameters (for query_profiling action)'),
    limit: z.number().int().min(1).max(1000).optional().default(50).describe('Maximum number of results to return'),
    include_details: z.boolean().optional().default(true).describe('Include detailed analysis information'),
    time_range: z.string().optional().default('1 day').describe('Time range for analysis (e.g., "1 day", "1 week", "1 hour")'),
    longQueryTime: z.number().min(0).optional().describe('Slow query threshold in seconds'),
    logQueriesNotUsingIndexes: z.boolean().optional().describe('Whether to log queries not using indexes'),
    monitoringIntervalMinutes: z.number().int().min(1).max(1440).optional().default(60).describe('Monitoring interval in minutes')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      // 慢查询日志管理操作
      case 'enable_slow_query_log': {
        await performanceManager.optimizePerformance('enable_slow_query_log', {
          longQueryTime: args.longQueryTime,
          logQueriesNotUsingIndexes: args.logQueriesNotUsingIndexes
        });

        result = {
          success: true,
          action: 'enable_slow_query_log',
          message: '慢查询日志已成功启用',
          config: {
            longQueryTime: args.longQueryTime,
            logQueriesNotUsingIndexes: args.logQueriesNotUsingIndexes
          }
        };
        break;
      }

      case 'disable_slow_query_log': {
        await performanceManager.optimizePerformance('disable_slow_query_log');

        result = {
          success: true,
          action: 'disable_slow_query_log',
          message: '慢查询日志已成功禁用'
        };
        break;
      }

      case 'status_slow_query_log': {
        const config = await performanceManager.optimizePerformance('get_config') as Record<string, unknown>;
        const monitoringStatus = performanceManager.performanceMonitoring.getMonitoringStatus();

        result = {
          success: true,
          action: 'status_slow_query_log',
          configuration: config,
          monitoring_active: monitoringStatus.active,
          monitoring_config: monitoringStatus.config
        };
        break;
      }

      case 'analyze_slow_queries': {
        const analysis = await performanceManager.optimizePerformance('analyze_slow_queries', {
          limit: args.limit,
          timeRange: args.time_range
        }) as SlowQueryAnalysis;

        result = {
          success: true,
          action: 'analyze_slow_queries',
          analysis: analysis,
          timestamp: new Date().toISOString()
        };
        break;
      }

      case 'start_monitoring': {
        await performanceManager.optimizePerformance('start_monitoring', {
          longQueryTime: args.longQueryTime,
          monitoringIntervalMinutes: args.monitoringIntervalMinutes
        });

        result = {
          success: true,
          action: 'start_monitoring',
          message: `慢查询性能监控已启动，每 ${args.monitoringIntervalMinutes || 60} 分钟分析一次`,
          config: {
            longQueryTime: args.longQueryTime,
            monitoringIntervalMinutes: args.monitoringIntervalMinutes
          }
        };
        break;
      }

      case 'stop_monitoring': {
        await performanceManager.optimizePerformance('stop_monitoring');

        result = {
          success: true,
          action: 'stop_monitoring',
          message: '慢查询性能监控已停止'
        };
        break;
      }

      case 'get_active_slow_queries': {
        const activeQueries = await performanceManager.optimizePerformance('get_active_slow_queries') as SlowQueryInfo[];

        result = {
          success: true,
          action: 'get_active_slow_queries',
          active_queries: activeQueries,
          count: activeQueries.length,
          timestamp: new Date().toISOString()
        };
        break;
      }

      // 索引和查询优化操作
      case 'suggest_indexes': {
        const suggestions = await performanceManager.optimizePerformance('suggest_indexes', {
          limit: args.limit,
          timeRange: args.time_range,
          includeDetails: args.include_details
        }) as IndexSuggestion[];

        if (!suggestions || suggestions.length === 0) {
          result = {
            success: true,
            action: 'suggest_indexes',
            message: '未发现需要索引优化的查询模式',
            suggestions: [],
            recommendations: [
              '系统运行良好，大部分查询已有合适的索引',
              '建议定期运行此分析以监控查询性能'
            ]
          };
        } else {
          result = {
            success: true,
            action: 'suggest_indexes',
            total_patterns: suggestions.length,
            query_patterns: args.include_details ? suggestions : suggestions.length,
            index_suggestions: suggestions,
            implementation_priority: suggestions.filter((s: IndexSuggestion) => s.priority === 'HIGH'),
            message: `分析了查询模式，生成 ${suggestions.length} 个索引建议`
          };
        }
        break;
      }

      case 'performance_report': {
        const report = await performanceManager.optimizePerformance('performance_report', {
          limit: args.limit,
          timeRange: args.time_range,
          includeDetails: args.include_details
        }) as PerformanceReport;

        result = {
          success: true,
          action: 'performance_report',
          report: report,
          message: '性能报告生成完成'
        };
        break;
      }

      case 'query_profiling': {
        if (!args.query) {
          throw new Error('query_profiling操作必须提供query参数');
        }

        mysqlManager.validateInput(args.query, 'query');
        if (args.params) {
          args.params.forEach((param, i) => {
            mysqlManager.validateInput(param, `param_${i}`);
          });
        }

        const profilingResult = await performanceManager.optimizePerformance('query_profiling', {
          query: args.query,
          params: args.params
        }) as QueryProfileResult;

        result = {
          success: true,
          action: 'query_profiling',
          query: args.query,
          parameters: args.params || [],
          explain_json: profilingResult.explainResult,
          explain_simple: profilingResult.explainResult,
          advice: profilingResult.recommendations,
          performance_score: profilingResult.performanceScore,
          message: '查询性能剖析完成'
        };
        break;
      }

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `MySQL性能优化操作失败:`
}, systemMonitor));

/**
 * 用户管理工具
 *
 * 企业级MySQL用户管理解决方案，提供完整的用户生命周期管理功能。
 * 集成了用户创建、删除、权限授予和撤销等全方位用户管理能力。
 * 支持安全密码验证、权限精细控制、用户审计追踪等企业级特性。
 * 适用于数据库管理员进行用户权限管理、安全合规等场景。
 *
 * @tool mysql_manage_users
 * @param {string} action - 要执行的用户管理操作类型：
 *   • "create" - 创建新用户
 *   • "delete" - 删除用户
 *   • "grant" - 授予用户权限
 *   • "revoke" - 撤销用户权限
 *   • "list" - 列出所有用户
 *   • "show_grants" - 显示用户权限
 * @param {string} [username] - 用户名（除list操作外必须提供）
 * @param {string} [password] - 用户密码（仅create操作需要）
 * @param {string} [host=%] - 用户主机地址（默认为%）
 * @param {string[]} [privileges] - 权限列表（仅grant和revoke操作需要），可选值：
 *   • "ALL" - 所有权限
 *   • "SELECT" - 查询权限
 *   • "INSERT" - 插入权限
 *   • "UPDATE" - 更新权限
 *   • "DELETE" - 删除权限
 *   • "CREATE" - 创建权限
 *   • "DROP" - 删除权限
 *   • "ALTER" - 修改权限
 *   • "INDEX" - 索引权限
 *   • "GRANT OPTION" - 授权权限
 * @param {string} [database] - 目标数据库名（权限操作时可选）
 * @param {string} [table] - 目标表名（权限操作时可选）
 * @param {boolean} [if_exists=false] - 删除用户时是否检查用户存在（仅delete操作有效）
 * @returns {Promise<string>} 包含详细用户管理结果的JSON格式数据，根据操作类型返回不同结构：
 *   • create操作：返回用户创建结果、用户信息确认
 *   • delete操作：返回用户删除结果、影响统计
 *   • grant操作：返回权限授予结果、权限详情
 *   • revoke操作：返回权限撤销结果、撤销统计
 *   • list操作：返回用户列表、用户统计信息
 *   • show_grants操作：返回用户权限详情、权限分析
 * @throws {Error} 当操作失败、用户不存在、权限不足或参数无效时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_manage_users',
  description: 'Manage MySQL users: create/delete users, grant/revoke privileges',
  parameters: z.object({
    action: z.enum(['create', 'delete', 'grant', 'revoke', 'list', 'show_grants']).describe('User management action to perform'),
    username: z.string().optional().describe('Username for the operation'),
    password: z.string().optional().describe('Password (required for create action)'),
    host: z.string().optional().default('%').describe('Host address for the user'),
    privileges: z.array(z.string()).optional().describe('Privileges to grant or revoke'),
    database: z.string().optional().describe('Target database name'),
    table: z.string().optional().describe('Target table name'),
    if_exists: z.boolean().optional().default(false).describe('Check if user exists before deletion')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      case 'create': {
        if (!args.username || !args.password) {
          throw new Error('创建用户时必须提供用户名和密码');
        }

        mysqlManager.validateInput(args.username, 'username');
        mysqlManager.validateInput(args.password, 'password');
        mysqlManager.validateInput(args.host || '%', 'host');

        const createUserQuery = `CREATE USER ?@? IDENTIFIED BY ?`;
        const params = [`${args.username}`, args.host || '%', args.password];

        await mysqlManager.executeQuery(createUserQuery, params);

        result = {
          success: true,
          action: 'create',
          user: {
            username: args.username,
            host: args.host || '%',
            created: new Date().toISOString()
          },
          message: `用户 '${args.username}'@'${args.host || '%'}' 创建成功`
        };
        break;
      }

      case 'delete': {
        if (!args.username) {
          throw new Error('删除用户时必须提供用户名');
        }

        mysqlManager.validateInput(args.username, 'username');
        mysqlManager.validateInput(args.host || '%', 'host');

        const dropUserQuery = `DROP USER ${args.if_exists ? 'IF EXISTS' : ''} ?@?`;
        const params = [`${args.username}`, args.host || '%'];

        await mysqlManager.executeQuery(dropUserQuery, params);

        result = {
          success: true,
          action: 'delete',
          user: {
            username: args.username,
            host: args.host || '%',
            deleted: new Date().toISOString()
          },
          message: `用户 '${args.username}'@'${args.host || '%'}' 删除成功`
        };
        break;
      }

      case 'grant': {
        if (!args.username || !args.privileges || args.privileges.length === 0) {
          throw new Error('授予权限时必须提供用户名和权限列表');
        }

        mysqlManager.validateInput(args.username, 'username');
        mysqlManager.validateInput(args.host || '%', 'host');

        // 验证权限列表
        const validPrivileges = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'GRANT OPTION'];
        args.privileges.forEach(privilege => {
          if (!validPrivileges.includes(privilege.toUpperCase())) {
            throw new Error(`无效的权限: ${privilege}`);
          }
        });

        // 构建权限字符串
        const privilegesStr = args.privileges.join(', ');

        let grantQuery: string;
        let params: string[];

        if (args.database && args.table) {
          mysqlManager.validateInput(args.database, 'database');
          mysqlManager.validateInput(args.table, 'table');
          grantQuery = `GRANT ${privilegesStr} ON \`${args.database}\`.\`${args.table}\` TO ?@?`;
          params = [`${args.username}`, args.host || '%'];
        } else if (args.database) {
          mysqlManager.validateInput(args.database, 'database');
          grantQuery = `GRANT ${privilegesStr} ON \`${args.database}\`.* TO ?@?`;
          params = [`${args.username}`, args.host || '%'];
        } else {
          grantQuery = `GRANT ${privilegesStr} ON *.* TO ?@?`;
          params = [`${args.username}`, args.host || '%'];
        }

        await mysqlManager.executeQuery(grantQuery, params);

        result = {
          success: true,
          action: 'grant',
          user: {
            username: args.username,
            host: args.host || '%'
          },
          privileges: {
            granted: args.privileges,
            target: args.database && args.table
              ? `${args.database}.${args.table}`
              : args.database
                ? `${args.database}.*`
                : '*.*'
          },
          message: `成功授予用户 '${args.username}'@'${args.host || '%'}' ${privilegesStr} 权限`
        };
        break;
      }

      case 'revoke': {
        if (!args.username || !args.privileges || args.privileges.length === 0) {
          throw new Error('撤销权限时必须提供用户名和权限列表');
        }

        mysqlManager.validateInput(args.username, 'username');
        mysqlManager.validateInput(args.host || '%', 'host');

        // 验证权限列表
        const validPrivileges = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'GRANT OPTION'];
        args.privileges.forEach(privilege => {
          if (!validPrivileges.includes(privilege.toUpperCase())) {
            throw new Error(`无效的权限: ${privilege}`);
          }
        });

        // 构建权限字符串
        const privilegesStr = args.privileges.join(', ');

        let revokeQuery: string;
        let params: string[];

        if (args.database && args.table) {
          mysqlManager.validateInput(args.database, 'database');
          mysqlManager.validateInput(args.table, 'table');
          revokeQuery = `REVOKE ${privilegesStr} ON \`${args.database}\`.\`${args.table}\` FROM ?@?`;
          params = [`${args.username}`, args.host || '%'];
        } else if (args.database) {
          mysqlManager.validateInput(args.database, 'database');
          revokeQuery = `REVOKE ${privilegesStr} ON \`${args.database}\`.* FROM ?@?`;
          params = [`${args.username}`, args.host || '%'];
        } else {
          revokeQuery = `REVOKE ${privilegesStr} ON *.* FROM ?@?`;
          params = [`${args.username}`, args.host || '%'];
        }

        await mysqlManager.executeQuery(revokeQuery, params);

        result = {
          success: true,
          action: 'revoke',
          user: {
            username: args.username,
            host: args.host || '%'
          },
          privileges: {
            revoked: args.privileges,
            target: args.database && args.table
              ? `${args.database}.${args.table}`
              : args.database
                ? `${args.database}.*`
                : '*.*'
          },
          message: `成功撤销用户 '${args.username}'@'${args.host || '%'}' ${privilegesStr} 权限`
        };
        break;
      }

      case 'list': {
        const listUsersQuery = `
            SELECT
              User,
              Host,
              authentication_string,
              password_expired,
              password_last_changed,
              account_locked
            FROM mysql.user
            WHERE User != ''
            ORDER BY User, Host
          `;

        const users = await mysqlManager.executeQuery(listUsersQuery) as Record<string, unknown>[];

        result = {
          success: true,
          action: 'list',
          total_users: users.length,
          users: users,
          message: `找到 ${users.length} 个用户`
        };
        break;
      }

      case 'show_grants': {
        if (!args.username) {
          throw new Error('显示权限时必须提供用户名');
        }

        mysqlManager.validateInput(args.username, 'username');
        mysqlManager.validateInput(args.host || '%', 'host');

        const showGrantsQuery = `SHOW GRANTS FOR ?@?`;
        const params = [`${args.username}`, args.host || '%'];

        const grants = await mysqlManager.executeQuery(showGrantsQuery, params) as Record<string, unknown>[];

        result = {
          success: true,
          action: 'show_grants',
          user: {
            username: args.username,
            host: args.host || '%'
          },
          grants: grants,
          total_grants: grants.length,
          message: `用户 '${args.username}'@'${args.host || '%'}' 拥有 ${grants.length} 个权限`
        };
        break;
      }

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `用户管理操作失败:`
}, systemMonitor));

/**
 * 进度跟踪工具
 *
 * 企业级异步操作进度跟踪解决方案，统一管理和监控所有后台任务的执行状态。
 * 集成了实时进度更新、操作取消、详细状态查询、多操作类型支持等全方位进度管理能力。
 * 支持备份、导出等长期运行操作的进度可视化和控制，增强用户体验和操作透明度。
 *
 * @tool mysql_progress_tracker
 * @param {string} action - 要执行的操作类型：
 *   • "list" - 列出当前活跃的操作进度（默认操作）
 *   • "get" - 获取特定操作的详细信息
 *   • "cancel" - 取消正在进行的操作
 *   • "summary" - 获取操作进度汇总统计
 * @param {string} [trackerId] - 操作跟踪器ID（用于get和cancel操作，必须提供）
 * @param {string} [operationType=all] - 过滤操作类型：
 *   • "all" - 显示所有操作类型（默认）
 *   • "backup" - 只显示备份操作
 *   • "export" - 只显示导出操作
 * @param {boolean} [includeCompleted=false] - 是否包含最近完成的操作（仅用于list操作）
 * @param {string} [detailLevel=basic] - 返回信息的详细程度：
 *   • "basic" - 基础信息（默认）
 *   • "detailed" - 详细信息，包含进度详情和额外统计
 * @returns {Promise<string>} 包含详细进度信息的JSON格式数据，根据操作类型返回不同结构：
 *   • list操作：返回活跃操作列表、过滤统计、汇总信息
 *   • get操作：返回特定操作的详细信息、时间统计、估算信息
 *   • cancel操作：返回取消结果、操作状态、确认信息
 *   • summary操作：返回整体统计信息、系统状态、优化建议
 * @throws {Error} 当操作失败、跟踪器不存在或权限不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_progress_tracker',
  description: 'Unified progress tracker for all operations (backup, export, etc.) with cancellation support',
  parameters: z.object({
    action: z.enum(['list', 'get', 'cancel', 'summary']).describe('Action to perform: list all trackers, get specific tracker, cancel operation, or get summary'),
    trackerId: z.string().optional().describe('Tracker ID for get/cancel actions'),
    operationType: z.enum(['all', 'backup', 'export']).optional().default('all').describe('Filter by operation type (only for list action)'),
    includeCompleted: z.boolean().optional().default(false).describe('Include recently completed operations in list'),
    detailLevel: z.enum(['basic', 'detailed']).optional().default('basic').describe('Level of detail to return')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      case 'list': {
        const allTrackers = backupTool.getActiveTrackers();

        // 根据操作类型过滤
        let filteredTrackers = allTrackers;
        if (args.operationType !== 'all') {
          filteredTrackers = allTrackers.filter(tracker => tracker.operation === args.operationType);
        }

        // 基础跟踪器信息
        const trackerList = filteredTrackers.map(tracker => {
          const basicInfo = {
            id: tracker.id,
            operation: tracker.operation,
            startTime: tracker.startTime,
            progress: tracker.progress,
            elapsed: Date.now() - tracker.startTime.getTime(),
            canCancel: !!tracker.cancellationToken,
            status: tracker.progress.progress >= 100 ? 'completed' : 'running'
          };

          if (args.detailLevel === 'detailed') {
            return {
              ...basicInfo,
              progressDetails: {
                stage: tracker.progress.stage,
                message: tracker.progress.message,
                percentage: tracker.progress.progress
              }
            };
          }

          return basicInfo;
        });

        result = {
          totalActiveTrackers: allTrackers.length,
          filteredCount: filteredTrackers.length,
          filter: {
            operationType: args.operationType,
            includeCompleted: args.includeCompleted
          },
          trackers: trackerList,
          summary: {
            backup: allTrackers.filter(t => t.operation === 'backup').length,
            export: allTrackers.filter(t => t.operation === 'export').length,
            running: allTrackers.filter(t => t.progress.progress < 100).length,
            completed: allTrackers.filter(t => t.progress.progress >= 100).length
          }
        };
        break;
      }

      case 'get': {
        if (!args.trackerId) {
          throw new Error('Tracker ID is required for get action');
        }

        const tracker = backupTool.getActiveTrackers().find(t => t.id === args.trackerId);
        if (!tracker) {
          throw new Error(`Tracker not found: ${args.trackerId}`);
        }

        const elapsed = Date.now() - tracker.startTime.getTime();
        const estimatedTotal = tracker.progress.progress > 0
          ? (elapsed / tracker.progress.progress) * 100
          : null;
        const estimatedRemaining = estimatedTotal
          ? Math.max(0, estimatedTotal - elapsed)
          : null;

        result = {
          id: tracker.id,
          operation: tracker.operation,
          startTime: tracker.startTime,
          progress: tracker.progress,
          timing: {
            elapsed: elapsed,
            elapsedFormatted: `${Math.round(elapsed / 1000)}s`,
            estimatedTotal: estimatedTotal ? Math.round(estimatedTotal / 1000) + 's' : 'unknown',
            estimatedRemaining: estimatedRemaining ? Math.round(estimatedRemaining / 1000) + 's' : 'unknown'
          },
          canCancel: !!tracker.cancellationToken,
          status: tracker.progress.progress >= 100 ? 'completed' : 'running'
        };
        break;
      }

      case 'cancel': {
        if (!args.trackerId) {
          throw new Error('Tracker ID is required for cancel action');
        }

        const tracker = backupTool.getActiveTrackers().find(t => t.id === args.trackerId);
        if (!tracker) {
          throw new Error(`Tracker not found: ${args.trackerId}`);
        }

        if (!tracker.cancellationToken) {
          result = {
            trackerId: args.trackerId,
            cancelled: false,
            message: '该操作不支持取消'
          };
        } else {
          const cancelled = backupTool.cancelOperation(args.trackerId);
          result = {
            trackerId: args.trackerId,
            cancelled,
            operation: tracker.operation,
            message: cancelled
              ? `${tracker.operation === 'backup' ? '备份' : '导出'}操作已成功取消`
              : '操作取消失败或已完成'
          };
        }
        break;
      }

      case 'summary': {
        const allTrackers = backupTool.getActiveTrackers();
        const queueStats = backupTool.getQueueStats();
        const memoryUsage = backupTool.getMemoryUsage();
        const memoryPressure = backupTool.getMemoryPressure();

        const operationStats = {
          backup: allTrackers.filter(t => t.operation === 'backup'),
          export: allTrackers.filter(t => t.operation === 'export')
        };

        result = {
          activeOperations: {
            total: allTrackers.length,
            backup: operationStats.backup.length,
            export: operationStats.export.length,
            running: allTrackers.filter(t => t.progress.progress < 100).length,
            nearCompletion: allTrackers.filter(t => t.progress.progress >= 80 && t.progress.progress < 100).length
          },
          systemStatus: {
            queueStats: {
              runningTasks: queueStats.runningTasks,
              queuedTasks: queueStats.queuedTasks,
              maxConcurrentTasks: queueStats.maxConcurrentTasks
            },
            memoryInfo: {
              usage: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
              pressure: Math.round(memoryPressure * 100) + '%',
              status: memoryPressure > 0.8 ? 'high' : memoryPressure > 0.6 ? 'moderate' : 'normal'
            }
          },
          longestRunning: allTrackers.length > 0
            ? allTrackers.reduce((longest, current) => {
              const currentElapsed = Date.now() - current.startTime.getTime();
              const longestElapsed = Date.now() - longest.startTime.getTime();
              return currentElapsed > longestElapsed ? current : longest;
            })
            : null,
          recommendations: [
            ...(allTrackers.length > 5 ? ['运行的操作较多，注意系统资源使用情况'] : []),
            ...(memoryPressure > 0.8 ? ['内存压力较高，考虑暂停部分操作'] : []),
            ...(queueStats.queuedTasks > 10 ? ['队列任务较多，可能需要调整并发设置'] : [])
          ]
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `进度跟踪操作失败:`
}, systemMonitor));

/**
 * 内存优化工具
 *
 * 企业级内存管理解决方案，整合系统级内存优化、备份任务内存管理、
 * 垃圾回收控制和详细的内存分析功能。提供全面的内存压力监测、
 * 智能垃圾回收、内存泄漏检测和性能优化建议。
 *
 * @tool mysql_optimize_memory
 * @param {string} action - 要执行的内存管理操作类型：
 *   • "status" - 查看当前内存状态和系统健康状况（默认操作）
 *   • "cleanup" - 执行基础内存清理，释放已完成任务的资源
 *   • "optimize" - 执行全面内存优化，包括垃圾回收和缓存清理
 *   • "configure" - 配置内存监控和并发控制参数
 *   • "report" - 生成详细的内存分析报告，包含历史数据和趋势
 *   • "gc" - 专门执行垃圾回收操作，分析GC效率
 * @param {boolean} [forceGC=true] - 优化操作时是否强制执行垃圾回收（仅对optimize和gc操作有效）
 * @param {boolean} [enableMonitoring] - 启用或禁用备份操作的内存监控（仅对configure操作有效）
 * @param {number} [maxConcurrency] - 设置备份任务的最大并发数，用于控制内存使用（仅对configure操作有效）
 * @param {boolean} [includeHistory=false] - 报告中是否包含内存使用历史数据（仅对report操作有效）
 * @returns {Promise<string>} 包含详细内存状态和操作结果的JSON格式数据，根据操作类型返回不同结构：
 *   • status操作：返回系统内存状态、备份操作内存使用、队列统计、整体健康评估
 *   • cleanup操作：返回清理结果、内存释放统计、前后对比
 *   • optimize操作：返回优化结果、GC效果分析、内存改善统计
 *   • configure操作：返回配置更新结果、当前设置状态
 *   • report操作：返回详细内存分析报告、历史趋势、优化建议
 *   • gc操作：返回GC执行结果、内存释放统计、效率分析
 * @throws {Error} 当内存优化操作失败、无效操作类型或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_optimize_memory',
  description: 'Comprehensive memory management: system optimization, backup memory control, GC management, and detailed analysis',
  parameters: z.object({
    action: z.enum(['status', 'cleanup', 'optimize', 'configure', 'report', 'gc']).describe('Memory management action: status (show current state), cleanup (basic cleanup), optimize (full optimization), configure (settings), report (detailed analysis), gc (garbage collection)'),
    forceGC: z.boolean().optional().default(true).describe('Force garbage collection during optimization'),
    enableMonitoring: z.boolean().optional().describe('Enable/disable memory monitoring for backup operations'),
    maxConcurrency: z.number().optional().describe('Set maximum concurrent backup tasks'),
    includeHistory: z.boolean().optional().default(false).describe('Include memory usage history in report')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      case 'status': {
        // 获取系统内存状态
        const memoryStats = memoryMonitor.getMemoryStats();
        const gcStats = memoryMonitor.getGCStats();

        // 获取备份工具内存状态
        const backupMemoryUsage = backupTool.getMemoryUsage();
        const memoryPressure = backupTool.getMemoryPressure();
        const queueStats = backupTool.getQueueStats();

        result = {
          system: {
            current: {
              heap_used: `${(memoryStats.current.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              heap_total: `${(memoryStats.current.usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
              rss: `${(memoryStats.current.usage.rss / 1024 / 1024).toFixed(2)} MB`,
              external: `${(memoryStats.current.usage.external / 1024 / 1024).toFixed(2)} MB`,
              pressure_level: `${(memoryStats.current.pressureLevel * 100).toFixed(2)}%`
            },
            trend: memoryStats.trend,
            leak_suspicions: memoryStats.leakSuspicions,
            gc_stats: {
              triggered: gcStats.triggered,
              last_gc: gcStats.lastGC ? new Date(gcStats.lastGC).toISOString() : null,
              memory_freed: `${(gcStats.memoryFreed / 1024 / 1024).toFixed(2)} MB`
            }
          },
          backup_operations: {
            memory_usage: {
              rss: Math.round(backupMemoryUsage.rss / 1024 / 1024) + 'MB',
              heap_used: Math.round(backupMemoryUsage.heapUsed / 1024 / 1024) + 'MB',
              heap_total: Math.round(backupMemoryUsage.heapTotal / 1024 / 1024) + 'MB',
              external: Math.round(backupMemoryUsage.external / 1024 / 1024) + 'MB'
            },
            pressure: {
              level: memoryPressure,
              status: memoryPressure > 0.9 ? 'critical' :
                memoryPressure > 0.8 ? 'high' :
                  memoryPressure > 0.6 ? 'moderate' : 'normal'
            },
            queue_stats: queueStats
          },
          overall_health: {
            status: memoryStats.current.pressureLevel > 0.8 || memoryPressure > 0.8 ? 'needs_attention' : 'healthy',
            recommendations: generateMemoryRecommendations(memoryStats, memoryStats)
          }
        };
        break;
      }

      case 'cleanup': {
        // 执行基础清理
        await backupTool.cleanupMemory();
        backupTool.cleanupCompletedTrackers();

        const afterCleanup = backupTool.getMemoryUsage();
        const systemStats = memoryMonitor.getMemoryStats();

        result = {
          action: 'cleanup',
          cleanup_results: {
            backup_memory: {
              rss: Math.round(afterCleanup.rss / 1024 / 1024) + 'MB',
              heap_used: Math.round(afterCleanup.heapUsed / 1024 / 1024) + 'MB'
            },
            system_memory: {
              heap_used: `${(systemStats.current.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              pressure_level: `${(systemStats.current.pressureLevel * 100).toFixed(2)}%`
            }
          },
          message: '内存清理完成'
        };
        break;
      }

      case 'optimize': {
        // 获取优化前状态
        const beforeStats = memoryMonitor.getMemoryStats();
        const beforeBackupMemory = backupTool.getMemoryUsage();

        // 执行全面优化
        backupTool.cleanupCompletedTrackers();
        await backupTool.cleanupMemory();

        let gcOptimization: { before: NodeJS.MemoryUsage; after: NodeJS.MemoryUsage; freed: number } | null = null;

        if (args.forceGC) {
          try {
            if (global.gc) {
              gcOptimization = await memoryMonitor.optimizeMemory();
            } else {
              const before = MemoryUtils.getCurrentUsage();
              await new Promise(resolve => setTimeout(resolve, 100));
              const after = MemoryUtils.getCurrentUsage();
              gcOptimization = { before, after, freed: Math.max(0, before.heapUsed - after.heapUsed) };
            }
          } catch (error) {
            logger.warn('GC optimization warning:', (error as Error).message);
          }
        }

        // 获取优化后状态
        const afterStats = memoryMonitor.getMemoryStats();
        const afterBackupMemory = backupTool.getMemoryUsage();

        result = {
          action: 'optimize',
          optimization_results: {
            gc_optimization: gcOptimization ? {
              memory_freed: `${(gcOptimization.freed / 1024 / 1024).toFixed(2)} MB`,
              before_heap: `${(gcOptimization.before.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              after_heap: `${(gcOptimization.after.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              reduction: `${gcOptimization.before.heapUsed > 0 ? ((gcOptimization.freed / gcOptimization.before.heapUsed) * 100).toFixed(2) : '0'}%`
            } : { status: 'skipped', reason: 'GC not available or not requested' },
            backup_cleanup: {
              before: {
                heap_used: Math.round(beforeBackupMemory.heapUsed / 1024 / 1024) + 'MB'
              },
              after: {
                heap_used: Math.round(afterBackupMemory.heapUsed / 1024 / 1024) + 'MB'
              }
            },
            system_improvement: {
              before_pressure: `${(beforeStats.current.pressureLevel * 100).toFixed(2)}%`,
              after_pressure: `${(afterStats.current.pressureLevel * 100).toFixed(2)}%`
            }
          },
          recommendations: generateMemoryRecommendations(afterStats, beforeStats),
          message: '内存全面优化完成'
        };
        break;
      }

      case 'configure': {
        const configUpdates: string[] = [];

        if (args.enableMonitoring !== undefined) {
          backupTool.setMemoryMonitoring(args.enableMonitoring);
          configUpdates.push(`内存监控: ${args.enableMonitoring ? '已启用' : '已禁用'}`);
        }

        if (args.maxConcurrency !== undefined) {
          backupTool.setMaxConcurrentTasks(args.maxConcurrency);
          configUpdates.push(`最大并发数: ${args.maxConcurrency}`);
        }

        result = {
          action: 'configure',
          updates: configUpdates,
          current_config: {
            memory_monitoring: args.enableMonitoring,
            max_concurrency: args.maxConcurrency
          },
          message: '配置已更新'
        };
        break;
      }

      case 'report': {
        // 生成详细分析报告
        const memoryStats = memoryMonitor.getMemoryStats();
        const gcStats = memoryMonitor.getGCStats();
        const memoryHistory = args.includeHistory ? memoryMonitor.getMemoryHistory() : [];
        const backupMemoryUsage = backupTool.getMemoryUsage();
        const memoryPressure = backupTool.getMemoryPressure();

        result = {
          action: 'report',
          detailed_analysis: {
            system_memory: {
              current: {
                heap_used: `${(memoryStats.current.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                heap_total: `${(memoryStats.current.usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(memoryStats.current.usage.rss / 1024 / 1024).toFixed(2)} MB`,
                external: `${(memoryStats.current.usage.external / 1024 / 1024).toFixed(2)} MB`,
                pressure_level: `${(memoryStats.current.pressureLevel * 100).toFixed(2)}%`
              },
              peak: {
                heap_used: `${(memoryStats.peak.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(memoryStats.peak.rss / 1024 / 1024).toFixed(2)} MB`
              },
              average: {
                heap_used: `${(memoryStats.average.heapUsed / 1024 / 1024).toFixed(2)} MB`,
                rss: `${(memoryStats.average.rss / 1024 / 1024).toFixed(2)} MB`
              },
              trend: memoryStats.trend,
              leak_suspicions: memoryStats.leakSuspicions,
              // 添加时间序列内存指标
              timeSeriesMetrics: mysqlManager.enhancedMetrics.systemMetrics && mysqlManager.enhancedMetrics.systemMetrics.toTimeSeriesMetric ? {
                systemMetrics: mysqlManager.enhancedMetrics.systemMetrics.toTimeSeriesMetric(
                  'memory_usage_analysis',
                  'average',
                  'bytes',
                  'System memory usage trends for leak detection'
                )
              } : null
            },
            gc_statistics: {
              total_triggered: gcStats.triggered,
              last_gc: gcStats.lastGC ? new Date(gcStats.lastGC).toISOString() : null,
              total_freed: `${(gcStats.memoryFreed / 1024 / 1024).toFixed(2)} MB`,
              gc_available: typeof global.gc === 'function'
            },
            backup_operations: {
              current_usage: {
                rss: Math.round(backupMemoryUsage.rss / 1024 / 1024) + 'MB',
                heap_used: Math.round(backupMemoryUsage.heapUsed / 1024 / 1024) + 'MB'
              },
              pressure_analysis: {
                level: memoryPressure,
                status: memoryPressure > 0.9 ? 'critical' :
                  memoryPressure > 0.8 ? 'high' :
                    memoryPressure > 0.6 ? 'moderate' : 'normal'
              },
              queue_impact: backupTool.getQueueStats()
            },
            recommendations: generateMemoryRecommendations(memoryStats, memoryStats),
            history_size: memoryHistory.length,
            monitoring_status: 'active'
          }
        };

        if (args.includeHistory && memoryHistory.length > 0) {
          (result as { detailed_analysis: Record<string, unknown> }).detailed_analysis.memory_history = memoryHistory.slice(-10).map((entry: { timestamp: number; usage: NodeJS.MemoryUsage }) => ({
            timestamp: new Date(entry.timestamp).toISOString(),
            heap_used: `${(entry.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            rss: `${(entry.usage.rss / 1024 / 1024).toFixed(2)} MB`
          }));
        }
        break;
      }

      case 'gc': {
        // 专门执行垃圾回收
        const beforeGC = MemoryUtils.getCurrentUsage();
        let gcResult: {
          status: string;
          memory_freed?: string;
          before?: string;
          after?: string;
          efficiency?: string;
          message?: string;
          simulated_check?: { before: string }
        } = { status: 'not_available' };

        if (global.gc) {
          try {
            const optimization = await memoryMonitor.optimizeMemory();
            gcResult = {
              status: 'success',
              memory_freed: `${(optimization.freed / 1024 / 1024).toFixed(2)} MB`,
              before: `${(optimization.before.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              after: `${(optimization.after.heapUsed / 1024 / 1024).toFixed(2)} MB`,
              efficiency: `${optimization.before.heapUsed > 0 ? ((optimization.freed / optimization.before.heapUsed) * 100).toFixed(2) : '0'}%`
            };
          } catch (error) {
            gcResult = { status: 'error', message: (error as Error).message };
          }
        } else {
          gcResult = {
            status: 'limited',
            message: 'Full GC not available. Run with --expose-gc flag for complete functionality.',
            simulated_check: {
              before: `${(beforeGC.heapUsed / 1024 / 1024).toFixed(2)} MB`
            }
          };
        }

        const afterMemory = memoryMonitor.getMemoryStats();
        result = {
          action: 'gc',
          gc_result: gcResult,
          system_state: {
            current_heap: `${(afterMemory.current.usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
            pressure_level: `${(afterMemory.current.pressureLevel * 100).toFixed(2)}%`
          }
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `内存优化操作失败:`
}, systemMonitor));

/**
 * 队列管理工具
 *
 * 企业级任务队列管理系统，统一管理和监控所有异步操作（备份、导出、数据迁移等）的执行队列。
 * 提供全面的队列控制能力，包括任务状态监控、并发控制、队列调度、任务取消和系统诊断。
 * 集成了优先级调度、错误恢复、性能监控等高级特性，支持大规模并发任务处理。
 *
 * @tool mysql_manage_queue
 * @param {string} action - 要执行的队列管理操作类型：
 *   • "status" - 查看队列状态和任务列表（默认操作）
 *   • "pause" - 暂停队列，停止接受新任务
 *   • "resume" - 恢复队列，继续处理排队任务
 *   • "clear" - 清空队列，取消所有排队任务
 *   • "set_concurrency" - 设置最大并发任务数
 *   • "cancel" - 取消指定的单个任务
 *   • "diagnostics" - 执行队列诊断分析
 *   • "get_task" - 获取单个任务的详细信息
 * @param {string} [taskId] - 任务ID（仅用于cancel和get_task操作，必须提供）
 * @param {number} [maxConcurrency] - 设置的最大并发任务数（仅用于set_concurrency操作）
 * @param {boolean} [showDetails=false] - 是否显示任务详细信息（仅用于status操作）
 * @param {string} [filterType=all] - 任务类型过滤器（仅用于status操作）：
 *   • "all" - 显示所有类型的任务（默认）
 *   • "backup" - 只显示备份任务
 *   • "export" - 只显示导出任务
 * @returns {Promise<string>} 包含详细队列管理结果的JSON格式数据，根据操作类型返回不同结构：
 *   • status操作：返回队列统计信息、任务列表、过滤结果、活跃跟踪器
 *   • pause操作：返回暂停确认信息和当前队列状态
 *   • resume操作：返回恢复确认信息和新队列状态
 *   • clear操作：返回清理统计和操作确认
 *   • set_concurrency操作：返回新的并发设置和配置确认
 *   • cancel操作：返回任务取消结果和操作状态
 *   • diagnostics操作：返回队列诊断报告、内存信息、系统健康状态
 *   • get_task操作：返回单个任务的详细信息、执行时间、状态历史
 * @throws {Error} 当队列管理操作失败、无效参数或系统资源不足时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_manage_queue',
  description: 'Unified queue management tool for all task types (backup, export, etc.) with detailed task information including duration and formatted timestamps',
  parameters: z.object({
    action: z.enum(['status', 'pause', 'resume', 'clear', 'set_concurrency', 'cancel', 'diagnostics', 'get_task']).describe('Action to perform on the queue'),
    taskId: z.string().optional().describe('Task ID (required for cancel and get_task actions)'),
    maxConcurrency: z.number().int().min(1).optional().describe('Maximum concurrent tasks (only for set_concurrency action)'),
    showDetails: z.boolean().optional().default(false).describe('Show detailed task information (for status action)'),
    filterType: z.enum(['backup', 'export', 'all']).optional().default('all').describe('Filter tasks by type (for status action)')
  }),
  handler: async (args) => {
    interface QueueManageResult {
      action?: string;
      [key: string]: unknown;
    }

    let result: QueueManageResult = { action: args.action };

    switch (args.action) {
      case 'status': {
        const stats = backupTool.getQueueStats();
        const allTasks = backupTool.getAllTasks();

        // 根据filterType过滤任务
        let filteredTasks = allTasks;
        if (args.filterType !== 'all') {
          filteredTasks = allTasks.filter(task => task.type === args.filterType);
        }

        if (args.showDetails) {
          result = {
            stats: stats,
            filteredTasks: filteredTasks.map(task => {
              // 计算任务持续时间
              let duration = 0;
              if (task.startedAt && task.completedAt) {
                duration = task.completedAt.getTime() - task.startedAt.getTime();
              } else if (task.startedAt) {
                duration = Date.now() - task.startedAt.getTime();
              }

              return {
                id: task.id,
                type: task.type,
                status: task.status,
                progress: task.progress || 0,
                duration: duration > 0 ? `${duration}ms` : 'N/A',
                createdAt: task.createdAt.toISOString(),
                startedAt: task.startedAt?.toISOString() || null,
                completedAt: task.completedAt?.toISOString() || null,
                error: task.error
              };
            }),
            activeTrackers: backupTool.getActiveTrackers().map(tracker => ({
              id: tracker.id,
              operation: tracker.operation,
              startTime: tracker.startTime.toISOString(),
              progress: tracker.progress
            })),
            filter: args.filterType,
            totalTasks: allTasks.length,
            filteredCount: filteredTasks.length
          };
        } else {
          result = {
            ...stats,
            filter: args.filterType,
            totalTasks: allTasks.length,
            filteredTasks: {
              queued: filteredTasks.filter(t => t.status === 'queued').length,
              running: filteredTasks.filter(t => t.status === 'running').length,
              completed: filteredTasks.filter(t => t.status === 'completed').length,
              failed: filteredTasks.filter(t => t.status === 'failed').length
            }
          };
        }
        break;
      }

      case 'pause':
        backupTool.pauseQueue();
        result.message = '任务队列已暂停';
        result.status = 'paused';
        break;

      case 'resume':
        backupTool.resumeQueue();
        result.message = '任务队列已恢复';
        result.status = 'resumed';
        break;

      case 'clear': {
        const clearedCount = backupTool.clearQueue();
        result.clearedCount = clearedCount;
        result.message = `已清除 ${clearedCount} 个排队中的任务`;
        break;
      }

      case 'set_concurrency':
        if (!args.maxConcurrency) {
          throw new Error('设置并发数时必须提供 maxConcurrency 参数');
        }
        backupTool.setMaxConcurrentTasks(args.maxConcurrency);
        result.newMaxConcurrency = args.maxConcurrency;
        result.message = `最大并发任务数已设置为 ${args.maxConcurrency}`;
        break;

      case 'cancel': {
        if (!args.taskId) {
          throw new Error('取消任务时必须提供 taskId 参数');
        }
        const cancelled = backupTool.cancelTask(args.taskId);
        result.taskId = args.taskId;
        result.cancelled = cancelled;
        result.message = cancelled ? '任务已成功取消' : '任务取消失败或任务不存在';
        break;
      }

      case 'diagnostics': {
        const diagnostics = backupTool.getQueueDiagnostics();
        const memoryUsage = backupTool.getMemoryUsage();
        const memoryPressure = backupTool.getMemoryPressure();
        const currentStats = backupTool.getQueueStats();

        result = {
          ...diagnostics,
          memoryInfo: {
            usage: memoryUsage,
            pressure: {
              level: memoryPressure,
              status: memoryPressure > 0.9 ? 'critical' :
                memoryPressure > 0.8 ? 'high' :
                  memoryPressure > 0.6 ? 'moderate' : 'normal'
            }
          },
          systemHealth: {
            queuePaused: (diagnostics as { queueStatus?: { isPaused?: boolean } }).queueStatus?.isPaused || false,
            runningTasks: currentStats.runningTasks,
            queuedTasks: currentStats.queuedTasks,
            maxConcurrency: currentStats.maxConcurrentTasks
          }
        };
        break;
      }

      case 'get_task': {
        if (!args.taskId) {
          throw new Error('获取任务详情时必须提供 taskId 参数');
        }

        const task = backupTool.getTaskStatus(args.taskId);

        if (!task) {
          result = {
            success: false,
            message: '任务不存在',
            taskId: args.taskId
          };
        } else {
          // 计算任务持续时间
          let duration = 0;
          if (task.startedAt && task.completedAt) {
            duration = task.completedAt.getTime() - task.startedAt.getTime();
          } else if (task.startedAt) {
            duration = Date.now() - task.startedAt.getTime();
          }

          result = {
            success: true,
            task: {
              ...task,
              duration: duration > 0 ? `${duration}ms` : 'N/A',
              createdAt: task.createdAt.toISOString(),
              startedAt: task.startedAt?.toISOString() || null,
              completedAt: task.completedAt?.toISOString() || null
            }
          };
        }
        break;
      }

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    // 为大部分操作添加当前队列状态（除了diagnostics和get_task，因为已经包含了相关信息）
    if (args.action !== 'diagnostics' && args.action !== 'status' && args.action !== 'get_task') {
      result.queueStats = backupTool.getQueueStats();
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `队列管理失败: `
}, systemMonitor));

/**
 * MySQL复制状态工具
 *
 * 企业级MySQL主从复制监控解决方案，提供全面的复制状态监控、延迟检测、
 * 错误诊断和配置查看功能。支持主从架构的健康监控和故障排查，
 * 适用于生产环境的复制拓扑管理。
 *
 * @tool mysql_replication_status
 * @param {string} action - 要执行的复制管理操作类型：
 *   • "status" - 查看复制状态概览（默认操作）
 *   • "delay" - 检测复制延迟和性能指标
 *   • "diagnose" - 诊断复制错误和问题
 *   • "config" - 查看复制配置信息
 * @returns {Promise<string>} 包含详细复制状态信息的JSON格式数据，根据操作类型返回不同结构：
 *   • status操作：返回主从复制状态、延迟信息、健康评估、优化建议
 *   • delay操作：返回复制延迟指标、性能统计、延迟趋势分析
 *   • diagnose操作：返回复制错误诊断、问题分析、恢复建议
 *   • config操作：返回复制配置详情、拓扑信息、参数设置
 * @throws {Error} 当复制监控操作失败、无效操作类型或数据库连接错误时抛出
 *
 */
mcp.addTool(createMCPTool({
  name: 'mysql_replication_status',
  description: 'MySQL replication monitoring: status overview, delay detection, error diagnostics, and configuration viewing',
  parameters: z.object({
    action: z.enum(['status', 'delay', 'diagnose', 'config']).describe('Replication monitoring action to perform')
  }),
  handler: async (args) => {
    let result: Record<string, unknown>;

    switch (args.action) {
      case 'status': {
        // 获取主库状态
        let masterStatus;
        try {
          masterStatus = await mysqlManager.executeQuery('SHOW MASTER STATUS');
        } catch (error) {
          masterStatus = { error: (error as Error).message, configured: false };
        }

        // 获取从库状态
        let slaveStatus;
        try {
          slaveStatus = await mysqlManager.executeQuery('SHOW SLAVE STATUS');
        } catch (error) {
          slaveStatus = { error: (error as Error).message, configured: false };
        }

        // 分析复制健康状态
        const replicationHealth = analyzeReplicationHealth(slaveStatus as Record<string, unknown>[]);

        // 生成优化建议
        const recommendations = generateReplicationRecommendations(slaveStatus as Record<string, unknown>[]);

        result = {
          success: true,
          action: 'status',
          master_status: masterStatus,
          slave_status: slaveStatus,
          replication_health: replicationHealth,
          recommendations: recommendations,
          timestamp: new Date().toISOString()
        };
        break;
      }

      case 'delay': {
        // 获取从库状态用于延迟分析
        let slaveStatus;
        try {
          slaveStatus = await mysqlManager.executeQuery('SHOW SLAVE STATUS');
        } catch (error) {
          result = {
            success: false,
            action: 'delay',
            error: `无法获取从库状态: ${(error as Error).message}`,
            configured: false
          };
          break;
        }

        // 分析复制延迟
        const delayAnalysis = analyzeReplicationDelay(slaveStatus as Record<string, unknown>[]);

        // 获取主从延迟统计
        const delayStats = calculateDelayStatistics(slaveStatus as Record<string, unknown>[]);

        result = {
          success: true,
          action: 'delay',
          slave_status: slaveStatus,
          delay_analysis: delayAnalysis,
          delay_statistics: delayStats,
          timestamp: new Date().toISOString()
        };
        break;
      }

      case 'diagnose': {
        // 获取从库状态用于诊断
        let slaveStatus;
        try {
          slaveStatus = await mysqlManager.executeQuery('SHOW SLAVE STATUS');
        } catch (error) {
          result = {
            success: false,
            action: 'diagnose',
            error: `无法获取从库状态: ${(error as Error).message}`,
            configured: false
          };
          break;
        }

        // 诊断复制错误
        const diagnostics = diagnoseReplicationErrors(slaveStatus as Record<string, unknown>[]);

        // 获取系统变量
        let systemVariables;
        try {
          systemVariables = await mysqlManager.executeQuery('SHOW VARIABLES LIKE "%replication%"');
        } catch (error) {
          systemVariables = { error: (error as Error).message };
        }

        result = {
          success: true,
          action: 'diagnose',
          slave_status: slaveStatus,
          diagnostics: diagnostics,
          system_variables: systemVariables,
          timestamp: new Date().toISOString()
        };
        break;
      }

      case 'config': {
        // 获取复制相关配置
        const configQueries = [
          'SHOW VARIABLES LIKE "%replication%"',
          'SHOW VARIABLES LIKE "%slave%"',
          'SHOW VARIABLES LIKE "%master%"',
          'SHOW MASTER STATUS',
          'SHOW SLAVE STATUS'
        ];

        const configResults: Record<string, unknown>[] = [];

        for (const query of configQueries) {
          try {
            const configResult = await mysqlManager.executeQuery(query);
            configResults.push({
              query: query,
              result: configResult,
              success: true
            });
          } catch (error) {
            configResults.push({
              query: query,
              error: (error as Error).message,
              success: false
            });
          }
        }

        // 分析配置一致性
        const configAnalysis = analyzeReplicationConfiguration(configResults);

        result = {
          success: true,
          action: 'config',
          configuration: configResults,
          config_analysis: configAnalysis,
          timestamp: new Date().toISOString()
        };
        break;
      }

      default:
        throw new Error(`未知的操作: ${args.action}`);
    }

    return JSON.stringify(result, null, 2);
  },
  errorMessage: `复制状态监控失败:`
}, systemMonitor));

/**
 * 分析复制健康状态
 */
function analyzeReplicationHealth(slaveStatus: Record<string, unknown>[]): Record<string, unknown> {
  if (!slaveStatus || slaveStatus.length === 0) {
    return {
      status: 'not_configured',
      health_score: 0,
      issues: ['复制未配置或无法获取状态'],
      recommendations: ['检查复制是否已正确配置']
    };
  }

  const slave = slaveStatus[0];
  const issues: string[] = [];
  const recommendations: string[] = [];
  let healthScore = 100;

  // 检查Slave_IO_Running
  if ((slave.Slave_IO_Running as string) !== 'Yes') {
    issues.push('Slave IO线程未运行');
    healthScore -= 50;
    recommendations.push('检查网络连接和权限，重新启动Slave IO线程');
  }

  // 检查Slave_SQL_Running
  if ((slave.Slave_SQL_Running as string) !== 'Yes') {
    issues.push('Slave SQL线程未运行');
    healthScore -= 50;
    recommendations.push('检查SQL错误，修复后重新启动Slave SQL线程');
  }

  // 检查Last_Error
  if (slave.Last_Error as string) {
    issues.push(`复制错误: ${slave.Last_Error}`);
    healthScore -= 30;
    recommendations.push('查看详细错误信息并修复问题');
  }

  // 检查延迟
  const secondsBehind = slave.Seconds_Behind_Master as number || 0;
  if (secondsBehind > 60) {
    issues.push(`复制延迟严重: ${secondsBehind}秒`);
    healthScore -= 20;
    recommendations.push('优化网络和从库性能，考虑使用并行复制');
  } else if (secondsBehind > 10) {
    issues.push(`复制延迟: ${secondsBehind}秒`);
    healthScore -= 10;
    recommendations.push('监控延迟趋势，优化查询性能');
  }

  // 检查连接状态
  if ((slave.Slave_IO_State as string) !== 'Waiting for master to send event') {
    issues.push('Slave IO连接状态异常');
    healthScore -= 15;
  }

  const status = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical';

  return {
    status,
    health_score: Math.max(0, healthScore),
    issues,
    recommendations,
    summary: {
      io_running: slave.Slave_IO_Running,
      sql_running: slave.Slave_SQL_Running,
      seconds_behind_master: secondsBehind,
      last_error: slave.Last_Error || null
    }
  };
}

/**
 * 生成复制优化建议
 */
function generateReplicationRecommendations(slaveStatus: Record<string, unknown>[]): string[] {
  const recommendations: string[] = [];

  if (!slaveStatus || slaveStatus.length === 0) {
    return ['配置MySQL主从复制以提高可用性和性能'];
  }

  const slave = slaveStatus[0];
  const secondsBehind = slave.Seconds_Behind_Master as number || 0;

  // 延迟相关建议
  if (secondsBehind > 300) {
    recommendations.push('复制延迟超过5分钟，建议：');
    recommendations.push('  1. 检查从库硬件资源是否充足');
    recommendations.push('  2. 考虑启用并行复制 (slave_parallel_workers > 1)');
    recommendations.push('  3. 优化从库上的慢查询');
  } else if (secondsBehind > 60) {
    recommendations.push('复制延迟超过1分钟，建议优化性能');
  }

  // IO线程建议
  if ((slave.Slave_IO_Running as string) !== 'Yes') {
    recommendations.push('Slave IO线程未运行，检查：');
    recommendations.push('  1. 主从库网络连通性');
    recommendations.push('  2. 复制用户权限');
    recommendations.push('  3. 主库防火墙设置');
  }

  // SQL线程建议
  if ((slave.Slave_SQL_Running as string) !== 'Yes') {
    recommendations.push('Slave SQL线程未运行，检查：');
    recommendations.push('  1. SQL执行错误');
    recommendations.push('  2. 从库磁盘空间');
    recommendations.push('  3. 表结构一致性');
  }

  // 性能优化建议
  if (slave.Exec_Master_Log_Pos && slave.Read_Master_Log_Pos) {
    const relayLogGap = (slave.Read_Master_Log_Pos as number) - (slave.Exec_Master_Log_Pos as number);
    if (relayLogGap > 1000000) { // 1MB
      recommendations.push('Relay log积压较大，考虑增加slave_net_timeout');
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('复制运行正常，建议定期监控延迟和错误日志');
  }

  return recommendations;
}

/**
 * 分析复制延迟
 */
function analyzeReplicationDelay(slaveStatus: Record<string, unknown>[]): Record<string, unknown> {
  if (!slaveStatus || slaveStatus.length === 0) {
    return {
      configured: false,
      message: '复制未配置或无法获取状态'
    };
  }

  const slave = slaveStatus[0];
  const secondsBehind = slave.Seconds_Behind_Master as number || 0;

  let delayLevel = 'none';
  let status = 'healthy';

  if (secondsBehind === 0) {
    delayLevel = 'none';
    status = 'healthy';
  } else if (secondsBehind <= 10) {
    delayLevel = 'minimal';
    status = 'healthy';
  } else if (secondsBehind <= 60) {
    delayLevel = 'moderate';
    status = 'warning';
  } else if (secondsBehind <= 300) {
    delayLevel = 'high';
    status = 'warning';
  } else {
    delayLevel = 'critical';
    status = 'critical';
  }

  return {
    configured: true,
    seconds_behind_master: secondsBehind,
    delay_level: delayLevel,
    status,
    analysis: {
      io_state: slave.Slave_IO_State,
      master_log_file: slave.Master_Log_File,
      read_master_log_pos: slave.Read_Master_Log_Pos,
      exec_master_log_pos: slave.Exec_Master_Log_Pos,
      relay_log_file: slave.Relay_Log_File,
      relay_log_pos: slave.Relay_Log_Pos,
      relay_master_log_file: slave.Relay_Master_Log_File
    }
  };
}

/**
 * 计算延迟统计
 */
function calculateDelayStatistics(slaveStatus: Record<string, unknown>[]): Record<string, unknown> {
  if (!slaveStatus || slaveStatus.length === 0) {
    return {
      configured: false,
      message: '复制未配置或无法获取状态'
    };
  }

  const slave = slaveStatus[0];

  return {
    configured: true,
    current_delay: {
      seconds_behind_master: slave.Seconds_Behind_Master || 0,
      timestamp: new Date().toISOString()
    },
    relay_log_info: {
      gap: (slave.Read_Master_Log_Pos as number || 0) - (slave.Exec_Master_Log_Pos as number || 0),
      read_position: slave.Read_Master_Log_Pos,
      exec_position: slave.Exec_Master_Log_Pos
    },
    master_info: {
      host: slave.Master_Host,
      port: slave.Master_Port,
      user: slave.Master_User,
      log_file: slave.Master_Log_File
    }
  };
}

/**
 * 诊断复制错误
 */
function diagnoseReplicationErrors(slaveStatus: Record<string, unknown>[]): Record<string, unknown> {
  const diagnostics = {
    has_errors: false,
    errors: [] as string[],
    warnings: [] as string[],
    recommendations: [] as string[],
    detailed_analysis: {} as Record<string, unknown>
  };

  if (!slaveStatus || slaveStatus.length === 0) {
    diagnostics.errors.push('无法获取从库状态');
    diagnostics.has_errors = true;
    return diagnostics;
  }

  const slave = slaveStatus[0];

  // 检查IO线程错误
  if ((slave.Slave_IO_Running as string) !== 'Yes') {
    diagnostics.has_errors = true;
    diagnostics.errors.push(`Slave IO线程未运行: ${slave.Last_IO_Error || '未知错误'}`);
    diagnostics.recommendations.push('检查网络连接、权限和主库状态');
  }

  // 检查SQL线程错误
  if ((slave.Slave_SQL_Running as string) !== 'Yes') {
    diagnostics.has_errors = true;
    diagnostics.errors.push(`Slave SQL线程未运行: ${slave.Last_SQL_Error || '未知错误'}`);
    diagnostics.recommendations.push('检查SQL语法错误、表结构不一致或权限问题');
  }

  // 检查连接状态警告
  if (slave.Last_IO_Error) {
    diagnostics.warnings.push(`IO错误: ${slave.Last_IO_Error}`);
  }

  if (slave.Last_SQL_Error) {
    diagnostics.warnings.push(`SQL错误: ${slave.Last_SQL_Error}`);
  }

  // 分析复制延迟
  const secondsBehind = slave.Seconds_Behind_Master as number || 0;
  if (secondsBehind > 60) {
    diagnostics.warnings.push(`复制延迟严重: ${secondsBehind}秒`);
    diagnostics.recommendations.push('优化从库性能或考虑重建复制');
  }

  // 详细分析
  diagnostics.detailed_analysis = {
    io_thread_state: slave.Slave_IO_State,
    sql_thread_state: slave.Slave_SQL_Running,
    last_error_no: slave.Last_Errno,
    last_error_timestamp: slave.Last_Error_Time,
    skip_counter: slave.Skip_Counter,
    until_condition: {
      log_file: slave.Until_Log_File,
      log_pos: slave.Until_Log_Pos
    }
  };

  return diagnostics;
}

/**
 * 分析复制配置
 */
function analyzeReplicationConfiguration(configResults: Record<string, unknown>[]): Record<string, unknown> {
  const analysis = {
    is_master: false,
    is_slave: false,
    master_config: {} as Record<string, unknown>,
    slave_config: {} as Record<string, unknown>,
    issues: [] as string[],
    recommendations: [] as string[]
  };

  // 分析配置结果
  configResults.forEach(result => {
    if ((result as { success: boolean }).success && (result as { result: unknown[] }).result) {
      const query = (result as { query: string }).query;
      const data = (result as { result: unknown[] }).result;

      if (query.includes('MASTER STATUS')) {
        if (data.length > 0) {
          analysis.is_master = true;
          analysis.master_config = data[0] as Record<string, unknown>;
        }
      } else if (query.includes('SLAVE STATUS')) {
        if (data.length > 0) {
          analysis.is_slave = true;
          analysis.slave_config = data[0] as Record<string, unknown>;
        }
      }
    }
  });

  // 分析配置一致性
  if (analysis.is_master && analysis.is_slave) {
    analysis.issues.push('服务器同时配置为主库和从库，可能存在配置问题');
    analysis.recommendations.push('检查复制拓扑，确保服务器角色配置正确');
  } else if (!analysis.is_master && !analysis.is_slave) {
    analysis.issues.push('服务器未配置任何复制角色');
    analysis.recommendations.push('如需使用复制，请配置主库或从库');
  }

  return analysis;
}

/**
 * 生成内存优化建议
 */
function generateMemoryRecommendations(current: {
  current: { usage: NodeJS.MemoryUsage; pressureLevel: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  leakSuspicions: number;
}, _previous: {
  current: { usage: NodeJS.MemoryUsage; pressureLevel: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  leakSuspicions: number;
}): string[] {
  const recommendations: string[] = [];

  if (current.current?.pressureLevel > 0.8) {
    recommendations.push('内存压力较高，建议定期执行垃圾回收');
  }

  if (current.trend === 'increasing') {
    recommendations.push('内存使用呈上升趋势，请检查是否存在内存泄漏');
  }

  if (current.leakSuspicions > 0) {
    recommendations.push(`检测到 ${current.leakSuspicions} 次可能的内存泄漏，建议检查代码中的对象引用`);
  }

  const heapUsagePercent = (current.current.usage.heapUsed / current.current.usage.heapTotal) * 100;
  if (heapUsagePercent > 85) {
    recommendations.push('堆内存使用率较高，考虑调整 --max-old-space-size 参数');
  }

  // 添加关于GC可用性的推荐
  if (typeof global.gc !== 'function') {
    recommendations.push('建议使用 --expose-gc 参数启动服务器以启用完整的内存优化功能。' +
      '请确保使用 npm run dev 或 npm start 命令启动服务器。');
  }

  if (recommendations.length === 0) {
    recommendations.push('内存使用情况良好，无需特别优化');
  }

  return recommendations;
}

/**
 * 优雅关闭的信号处理器
 *
 * 当进程被SIGINT或SIGTERM信号终止时，确保正确清理数据库连接、
 * 清除缓存和释放资源。这可以防止连接泄漏并确保数据完整性。
 */
process.on('SIGINT', async () => {
  logger.error(`\n${StringConstants.MSG_SIGNAL_RECEIVED} SIGINT, ${StringConstants.MSG_GRACEFUL_SHUTDOWN}`, 'SignalHandler');

  // 清理备份工具
  try {
    backupTool.clearQueue();
    logger.warn('Backup tool cleaned up successfully');
  } catch (error) {
    logger.warn('Failed to cleanup backup tool:', undefined, { error: (error as Error).message });
  }

  systemMonitor.stopMonitoring();
  await mysqlManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.error(`\n${StringConstants.MSG_SIGNAL_RECEIVED} SIGTERM, ${StringConstants.MSG_GRACEFUL_SHUTDOWN}`, 'SignalHandler');

  // 清理备份工具
  try {
    backupTool.clearQueue();
    logger.warn('Backup tool cleaned up successfully');
  } catch (error) {
    logger.warn('Failed to cleanup backup tool:', undefined, { error: (error as Error).message });
  }

  systemMonitor.stopMonitoring();
  await mysqlManager.close();
  process.exit(0);
});

/**
 * 模块导出
 *
 * 导出配置的MCP服务器实例和MySQL管理器，
 * 用于外部使用、测试或与其他模块集成。
 */
export { mcp, mysqlManager };

/**
 * 服务器启动函数
 *
 * 初始化并启动MySQL MCP服务器，包含错误处理。
 * 确保在启动失败时进行适当的清理。
 *
 * @async
 * @function startServer
 * @returns {Promise<void>} 当服务器成功启动时解析的Promise
 * @throws {Error} 当服务器初始化失败时抛出
 */
export async function startServer(): Promise<void> {
  try {
    // 启动系统监控
    systemMonitor.startMonitoring();

    // 定期清理性能数据（每10分钟清理一次）
    setInterval(() => {
      try {
        systemMonitor.cleanupPerformanceData();
      } catch (error) {
        logger.warn('Failed to cleanup performance data:', undefined, { error: (error as Error).message });
      }
    }, 600000); // 10分钟

    logger.error(StringConstants.MSG_SERVER_RUNNING);
    await mcp.start();
  } catch (error) {
    logger.error(`${StringConstants.MSG_SERVER_ERROR}`, 'ServerInit', error as Error);
    systemMonitor.stopMonitoring();
    await mysqlManager.close();
    process.exit(1);
  }
}

/**
 * 自动启动服务器
 *
 * 当此模块直接执行时自动启动服务器。
 * 这使得服务器可以作为独立应用程序运行。
 */
startServer();