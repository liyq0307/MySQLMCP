# MySQL MCP 服务器 - TypeScript 版本

这是一个为模型上下文协议（Model Context Protocol, MCP）设计的高性能、企业级MySQL数据库操作服务器。基于FastMCP v2.0+框架构建，提供29个专业数据库工具，集成了三级智能缓存、双层性能监控、增强的连接池管理、RBAC权限控制和全面的安全保护机制。

**🎯 核心亮点：**
- **29个专业工具**: 涵盖核心数据操作、架构管理、高性能批量操作、备份导出、系统监控和维护等全场景
- **企业级安全**: 20+种SQL注入检测模式，多层安全验证、智能威胁分析和RBAC权限控制
- **智能性能**: 三级LRU缓存系统(O(1)复杂度)、双层指标收集、自动内存压力感知优化
- **高级可靠性**: 指数退避重试策略、智能错误分类、上下文恢复建议和优雅降级
- **完整数据生态**: 全量/增量/大文件备份、多格式(Excel/CSV/JSON/SQL)导入导出、智能进度跟踪
- **零配置**: 环境变量驱动配置，支持不同环境的一键部署和动态配置更新

服务器通过环境变量进行配置。您可以选择以下方式之一：
1. **使用 .env 文件**（推荐）：
   - 将 `.env.example` 复制为 `.env`
   - 根据您的环境自定义 `.env` 中的值
   - 服务器启动时会自动加载这些值
2. **直接设置环境变量**：
   - 在运行服务器之前在 shell 中导出变量
   - 在进程管理器或容器配置中设置变量

## 🚀 核心特性

### ⚡ 高性能架构
- **FastMCP 框架**: 采用现代化的 FastMCP 构建，提供卓越的性能和可靠性。
- **智能缓存系统**: 多级 LRU 缓存，支持 TTL（生存时间）和访问统计。
  - 表结构缓存 (`schemaCache`)
  - 表存在性检查缓存 (`tableExistsCache`)
  - 索引信息缓存 (`indexCache`)
- **增强型连接池**: 基于 `mysql2/promise`，使用ConnectionPool类，支持预创建连接、健康检查、自动重连和智能资源管理。
- **异步处理**: 所有数据库操作均为异步，充分利用 Node.js 事件循环，实现高并发处理。

### 🧠 高级功能
- **增强重试机制**: SmartRetryStrategy实现指数退避算法，智能错误分类，上下文感知的自动重试策略，最大重试次数可配置。
- **自适应速率限制**: 基于令牌桶算法的动态频控，支持系统负载感知和自动压力释放机制，包含详细的限流统计和预防措施。
- **查询验证与安全**: 多层查询验证，包括参数化查询强制、威胁模式检测、可配置安全级别(STRICT/MODERATE/BASIC)，支持实时威胁检测。
- **智能缓存系统**: 三级LRU缓存架构，支持O(1)复杂度、TTL管理、内存压力自适应和自动失效机制，包含缓存预热和智能清理。
- **实时性能监控**: EnhancedMetrics系统提供双层指标收集、时间序列分析、趋势检测和实时性能报告，支持慢查询检测和性能回归分析。
- **内存优化管理**: 高级内存泄漏检测（线性回归算法）、自动垃圾回收、压力感知缓存调整和智能资源优化，支持内存压力分级和自动优化。
- **智能错误分类**: 自动错误分类引擎，提供修复建议、预防措施和上下文恢复策略，支持多种数据库错误类型的智能诊断。
- **任务队列系统**: 支持优先级调度、并发控制、任务取消和详细进度跟踪，包含队列状态监控和智能重试机制。
- **MySQL复制监控**: 主从复制状态检测、延迟分析、错误诊断和配置验证，支持复制延迟趋势分析和自动告警。
- **全面安全审计**: 20+种SQL注入检测模式、用户权限审计、数据保护评估和合规性检查，支持SOX/GDPR/PCI-DSS合规性验证。
- **备份恢复优化**: 全量/增量/大文件备份策略、智能压缩、备份验证和错误恢复机制，支持备份进度跟踪和恢复点验证。
- **MySQL索引管理**: 完整的索引生命周期管理，支持创建、删除、分析和优化多种索引类型（普通/唯一/主键/全文/空间索引）。
- **用户权限管理**: 企业级用户管理解决方案，支持用户创建、删除、权限授予和撤销，包含安全密码验证和审计追踪。
- **数据报表生成**: 智能数据报表生成，支持多查询整合、多格式输出（Excel/CSV/JSON）和自定义报表模板。
- **优雅降级机制**: 多层降级策略，确保核心功能与辅助功能的隔离运行，支持临时功能禁用和自动恢复。

### 🛡️ 企业级安全
- **多层防护体系**: 包括SecurityValidator类进行输入验证、20+SQL注入模式检测、危险语句扫描和实时威胁分析。
- **安全的参数化查询**: 所有数据修改操作默认使用预处理语句，从根本上杜绝SQL注入。
- **敏感信息保护**: 诊断信息中自动屏蔽数据库密码。
- **高级SQL注入检测**: 实现20多种SQL注入模式的全面保护。

### 🔧 零配置与易用性
- **常量化设计**: 所有配置项和固定字符串在 `constants.ts` 中统一定义，提高代码可读性和可维护性。
- **配置分离**: 数据库、安全和缓存配置在 `config.ts` 中集中管理。
- **环境变量驱动**: 完全支持通过环境变量进行配置，轻松实现开发、测试和生产环境的切换。

## 目录

- [快速开始](#快速开始)
- [安装说明](#安装说明)
- [环境变量配置](#环境变量配置)
- [Claude Desktop集成](#claude-desktop集成)
- [API工具参考](#🔧-完整工具生态-29个专业工具)
- [使用示例](#使用示例)
- [架构设计](#架构设计)
- [性能监控](#性能监控)
- [缓存策略](#缓存策略)
- [安全特性](#安全特性)
- [内存管理](#内存管理)
- [故障排除](#故障排除)
- [性能调优](#性能调优)
- [开发指南](#开发指南)
- [许可证](#许可证)

## 快速开始

### 1. 环境要求
- Node.js v20.0.0 或更高版本
- npm v10.0.0 或更高版本
- MySQL 5.7 或更高版本 (推荐 MySQL 8.0+)

### 2. 克隆项目
```bash
git clone https://github.com/your-username/mysql-mcp-server.git
cd mysql-mcp-server
```

### 3. 安装依赖
```bash
npm install
```

### 4. 配置环境变量
复制 `.env.example` 文件并创建 `.env` 文件：
```bash
cp .env.example .env
```
然后编辑 `.env` 文件，填入您的数据库凭据。
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

### 5. 编译并运行服务器
```bash
# 编译 TypeScript 代码
npm run build

# 启动服务器
npm start
```

或者用于开发：
```bash
# 使用 ts-node 直接运行进行开发
npm run dev
```

### 6. 验证安装
服务器运行后，您可以使用系统状态工具验证其是否正常工作：
```json
{
  "scope": "full",
  "includeDetails": true
}
```

## 安装说明

### 系统要求
- Node.js v20.0.0 或更高版本
- npm v10.0.0 或更高版本
- MySQL 5.7 或更高版本 (推荐 MySQL 8.0+)
- 最低 2GB 内存 (生产环境推荐 4GB+)
- 最少 500MB 可用磁盘空间

### 核心依赖
- `fastmcp`: 核心的 MCP 框架 (v2.0+)。高性能模型上下文协议服务器实现。
- `mysql2`: 高性能 MySQL 驱动，支持连接池和 Promise API，支持预处理语句。
- `zod`: 用于工具参数的类型声明和验证，支持运行时类型安全。
- `dotenv`: 用于从 `.env` 文件加载环境变量，支持安全配置管理。

### 开发依赖
- `typescript`: TypeScript 语言编译器，支持严格类型检查。
- `ts-node`: 直接运行 TypeScript 代码的工具，无需编译。
- `eslint`: 用于代码规范和质量检查，支持自定义规则。
- `jest`: 用于单元测试和集成测试的框架，支持代码覆盖率分析。
- `@types/node`: Node.js API 的 TypeScript 定义。
- `@types/jest`: Jest 测试框架的 TypeScript 定义。

### 可选性能依赖
为了增强性能监控和系统分析：
- 带 `--expose-gc` 标志的 Node.js，用于垃圾回收监控
- 用于 CPU 和内存分析的系统监控工具
- 用于安全连接的 SSL/TLS 证书

## 环境变量配置

### 🔗 数据库连接配置
| 环境变量 | 描述 | 默认值 |
|---|---|---|
| `MYSQL_HOST` | 数据库主机地址 | `localhost` |
| `MYSQL_PORT` | 数据库端口 | `3306` |
| `MYSQL_USER` | 数据库用户名 | `root` |
| `MYSQL_PASSWORD` | 数据库密码 | `""` |
| `MYSQL_DATABASE` | 数据库名称 | `test` |
| `MYSQL_CONNECTION_LIMIT` | 连接池最大连接数 | `20` |
| `MYSQL_CONNECT_TIMEOUT` | 连接超时时间(毫秒) | `60000` |
| `MYSQL_IDLE_TIMEOUT` | 空闲连接超时时间(毫秒) | `300000` |
| `MYSQL_SSL` | 是否启用SSL连接 | `false` |
| `MYSQL_CHARSET` | 数据库字符集 | `utf8mb4` |
| `MYSQL_TIMEZONE` | 数据库时区 | `+00:00` |
| `QUERY_TIMEOUT` | 查询执行超时时间(毫秒) | `30000` |

### 🛡️ 安全配置
| 环境变量 | 描述 | 默认值 |
|---|---|---|
| `SECURITY_MAX_QUERY_LENGTH` | 最大查询长度（字符数） | `10000` |
| `SECURITY_MAX_INPUT_LENGTH` | 最大输入长度（字符数） | `1000` |
| `SECURITY_MAX_TABLE_NAME_LENGTH` | 最大表名长度（字符数） | `64` |
| `SECURITY_ALLOWED_QUERY_TYPES` | 允许的查询类型（逗号分隔） | `SELECT,INSERT,UPDATE,DELETE,SHOW,DESCRIBE,EXPLAIN,CREATE,DROP,ALTER` |
| `SECURITY_ENABLE_QUERY_TYPE_RESTRICTIONS` | 启用查询类型限制 | `true` |
| `SECURITY_MAX_RESULT_ROWS` | 每次查询最大返回行数 | `1000` |
| `SECURITY_QUERY_TIMEOUT` | 查询执行超时时间(毫秒) | `30000` |
| `RATE_LIMIT_MAX` | 时间窗口内最大请求数 | `100` |
| `RATE_LIMIT_WINDOW` | 频率限制时间窗口(毫秒) | `60000` |
| `RATE_LIMIT_ENABLED` | 启用频率限制 | `true` |

### ⚡ 性能配置
| 环境变量 | 描述 | 默认值 |
|---|---|---|
| `SCHEMA_CACHE_SIZE` | 表结构缓存大小 | `128` |
| `TABLE_EXISTS_CACHE_SIZE` | 表存在性缓存大小 | `64` |
| `INDEX_CACHE_SIZE` | 索引信息缓存大小 | `64` |
| `CACHE_TTL` | 缓存过期时间(秒) | `300` |
| `BATCH_SIZE` | 批量操作大小 | `1000` |
| `MONITORING_ENABLED` | 启用性能监控 | `true` |
| `MONITORING_SNAPSHOT_INTERVAL` | 性能快照间隔(毫秒) | `30000` |
| `MONITORING_HISTORY_SIZE` | 指标历史记录大小 | `1000` |
| `MONITORING_SLOW_QUERY_THRESHOLD` | 慢查询阈值(毫秒) | `1000` |
| `MEMORY_MONITORING_ENABLED` | 启用内存监控 | `true` |
| `MEMORY_MONITORING_INTERVAL` | 内存监控间隔(毫秒) | `30000` |
| `MEMORY_HISTORY_SIZE` | 内存历史记录大小 | `100` |
| `MEMORY_PRESSURE_THRESHOLD` | 内存压力阈值(0-1) | `0.8` |
| `MEMORY_CACHE_CLEAR_THRESHOLD` | 内存缓存清除阈值(0-1) | `0.85` |
| `MEMORY_AUTO_GC` | 启用自动垃圾回收 | `true` |
| `SYSTEM_MONITORING_INTERVAL` | 系统监控间隔(毫秒) | `30000` |

### 🖥️ 服务器配置
| 环境变量 | 描述 | 默认值 |
|---|---|---|
| `SERVER_NAME` | 服务器名称 | `MySQL-MCP-Server` |
| `SERVER_VERSION` | 服务器版本 | `1.0.0` |
| `NODE_ENV` | Node环境 (development, production, test) | `development` |
| `LOG_LEVEL` | 日志级别 (debug, info, warn, error) | `info` |
| `DEBUG` | 启用调试模式 | `false` |
| `MCP_TRANSPORT` | MCP传输协议 | `stdio` |

## Claude Desktop集成

要将此服务器添加到您的Claude Desktop配置中，请编辑您的 `claude_desktop_config.json` 文件。

### 基础配置示例
```json
{
  "mcpServers": {
    "mysql-mcp-ts": {
      "command": "node",
      "args": ["/path/to/your/MySQL_MCP_TS/dist/index.js"], // 编译后的JS文件绝对路径
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "your_username",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database"
      }
    }
  }
}
```

### 高性能生产环境配置
```json
{
  "mcpServers": {
    "mysql-prod": {
      "command": "node",
      "args": ["/path/to/your/project/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "MYSQL_HOST": "prod-db-host",
        "MYSQL_USER": "app_user",
        "MYSQL_PASSWORD": "secure_password",
        "MYSQL_DATABASE": "production_db",
        "MYSQL_CONNECTION_LIMIT": "50",
        "RATE_LIMIT_MAX": "1000",
        "SCHEMA_CACHE_SIZE": "256",
        "CACHE_TTL": "600",
        "MYSQL_SSL": "true"
      }
    }
  }
}
```

## 🔧 完整工具生态 (29个专业工具)

本系统提供29个专业级数据库工具，覆盖企业应用的全部需求：

### 📊 核心数据库操作 (7个工具)

#### `mysql_query`
执行原始SQL查询，具有全面的验证和安全检查。支持参数化查询以确保安全。  
支持 SELECT、SHOW、DESCRIBE、INSERT、UPDATE、DELETE、CREATE、DROP 和 ALTER 操作。  
**示例：**
##### 简单的 SELECT 查询
```json
{
  "query": "SELECT * FROM users LIMIT 10",
}
```
##### 安全的参数化查询
```json
{
  "query": "SELECT * FROM users WHERE id = ? AND status = ?",
  "params": [123, "active"]
}
```
  
#### `mysql_show_tables`
列出当前数据库中的所有表，支持智能缓存。  
结果会被缓存以优化性能，提高频繁查询的响应速度。  
提供数据库架构的快速概览，支持开发和运维场景。  
**示例：**
```json
{}
```

#### `mysql_describe_table` 
获取指定表的完整结构，包括列定义、数据类型、约束、索引信息和其他元数据。  
支持 DESCRIBE 和 INFORMATION_SCHEMA 查询。  
**示例：**
```json
{
  "table_name": "users"
}
```

#### `mysql_select_data`
从表中查询数据，支持可选的过滤、列选择和行数限制。  
提供灵活的查询构建，具有完整的SQL注入防护和性能优化。  
支持条件查询、分页查询和结果缓存等高级功能。  
**示例：**
##### 查询表中的所有数据
```json
{
  "table_name": "products",
}
```
##### 查询特定列并进行过滤和限制
```json
{
  "table_name": "users",
  "columns": ["id", "name", "email"],
  "where_clause": "status = 'active'",
  "limit": 50,
  "order_by": "price DESC"
}
```
##### 复杂条件查询
```json
{
  "table_name": "orders",
  "columns": ["order_id", "customer_id", "total_amount"],
  "where_clause": "created_at >= '2024-01-01' AND status IN ('pending', 'processing')",
  "limit": 100
}
```

#### `mysql_insert_data`
使用参数化查询安全地向表中插入新数据，确保数据完整性和安全性。  
自动验证所有输入数据，使用预处理语句防止SQL注入攻击。  
支持单行插入和批量数据插入，包含事务安全保障。  
**示例：**
```json
{
  "table_name": "users",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "status": "active"
  }
}
```

#### `mysql_update_data`
根据指定条件更新表中的现有数据，确保数据修改的安全性和一致性。  
提供完整的输入验证，具有WHERE子句验证、预处理语句和事务安全保障。  
支持条件更新和批量字段修改，包含详细的操作审计信息。  
**示例：**
```json
{
  "table_name": "users",
  "data": { "status": "inactive", "updated_at": "2024-01-01" },
  "where_clause": "id = ?",
  "params": [123]
}
```

#### `mysql_delete_data`
根据指定条件从表中安全删除数据，确保删除操作的准确性和安全性。  
使用参数化查询和WHERE子句验证，防止误删除和SQL注入攻击。  
支持条件删除操作，包含删除确认和事务安全保障。   
**示例：**
```json
{
  "table_name": "users",
  "where_clause": "id = ?",
  "params": [123]
}
```

### ⚡ 高性能批量操作 (2个工具)

#### `mysql_batch_execute`
在单个事务中执行多个SQL操作，确保原子性和数据一致性。所有查询要么全部成功执行，要么全部回滚，
特别适用于需要多步骤操作的复杂业务场景，如订单处理、库存管理等。提供完整的参数验证、
性能监控和错误处理机制，确保批量操作的安全性和可靠性。  
**示例：**
```json
{
  "queries": [
    {"sql": "INSERT INTO users (name, email) VALUES (?, ?)", "params": ["John", "john@example.com"]},
    {"sql": "UPDATE profiles SET user_id = ? WHERE email = ?", "params": [1, "john@example.com"]},
    {"sql": "INSERT INTO user_logs (user_id, action) VALUES (LAST_INSERT_ID(), ?)", "params": ["user_created"]}
  ]
}
```
```json
{
  "queries": [
    { "sql": "INSERT INTO new_users SELECT * FROM temp_users WHERE processed = 0" },
    { "sql": "UPDATE temp_users SET processed = 1 WHERE processed = 0" },
    { "sql": "DELETE FROM temp_users WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)" }
  ]
}
```

#### `mysql_batch_insert`
高效地向表中批量插入多行数据，支持事务安全保障和性能优化。  
使用优化的批量插入算法，减少数据库往返次数，提高插入性能。  
动验证所有数据，确保数据完整性和安全性，支持大数据量插入。  
提供详细的性能指标和插入统计信息，适用于数据导入和批量数据处理场景。  
**示例：**
```json
{
  "table_name": "products",
  "data": [
    {"name": "Product A", "price": 29.99, "category": "Electronics"},
    {"name": "Product B", "price": 49.99, "category": "Books"},
    {"name": "Product C", "price": 19.99, "category": "Home"}
  ]
}
```

### 🏗️ 数据库架构管理 (6个工具)

#### `mysql_create_table`
使用指定的列定义和约束创建新的数据库表，支持完整的表结构定义。  
提供全面的安全验证，包括表名验证、列定义验证，确保数据库操作的安全性。  
支持主键、自增列、默认值等高级约束，支持批量列定义和事务安全保障。  
创建成功后自动使相关缓存失效，确保数据一致性。  
**示例：**

##### 创建简单的用户表
```json
{
  "table_name": "users",
  "columns": [
    { "name": "id", "type": "INT", "primary_key": true, "auto_increment": true },
    { "name": "username", "type": "VARCHAR(50)", "nullable": false },
    { "name": "email", "type": "VARCHAR(100)", "nullable": false },
    { "name": "created_at", "type": "TIMESTAMP", "default": "CURRENT_TIMESTAMP" }
  ]
}
```
##### 指定索引创建
```json
{
  "table_name": "users",
  "columns": [
    {"name": "id", "type": "INT", "primary_key": true, "auto_increment": true},
    {"name": "name", "type": "VARCHAR(255)", "nullable": false},
    {"name": "email", "type": "VARCHAR(255)", "nullable": false, "unique": true},
    {"name": "created_at", "type": "TIMESTAMP", "default": "CURRENT_TIMESTAMP"}
  ],
  "indexes": [
    {"name": "idx_email", "columns": ["email"], "type": "UNIQUE"},
    {"name": "idx_created_at", "columns": ["created_at"], "type": "INDEX"}
  ]
}
```

#### `mysql_drop_table`
从数据库中安全删除（丢弃）指定的表，支持条件删除选项和完整的安全验证。  
提供 IF EXISTS 选项避免表不存在时的错误，支持事务安全保障和缓存自动失效。  
删除操作前会进行严格的安全验证，确保不会误删重要数据。  
特别适用于开发环境中的表清理和生产环境的表维护操作。  
**示例：**
##### 删除表
```json
{
  "table_name": "temp_table",
}
```

##### 安全删除表
```json
{
  "table_name": "temp_table",
  "if_exists": true
}
```

#### `mysql_get_schema`
检索数据库架构信息，包括表、列、约束、索引和关系映射。  
提供完整的数据库结构信息用于分析、管理和文档生成，支持特定表查询。  
利用 INFORMATION_SCHEMA 进行高效查询，支持缓存优化和性能监控。  
**示例：**
##### 获取整个数据库的架构信息
```json
{}
```
##### 获取特定表的架构信息
```json
{
  "table_name": "users"
}
```

#### `mysql_get_foreign_keys`
检索特定表或数据库中所有表的外键约束信息，提供表间关系映射和引用完整性约束的详细信息。  
利用 INFORMATION_SCHEMA.KEY_COLUMN_USAGE 进行高效查询，支持特定表查询和全局关系分析。  
帮助理解数据库架构中的表间依赖关系，支持数据库设计优化和数据完整性维护。  
提供外键约束的详细信息，包括本地列、引用表、引用列和约束名称。  
**示例：**
```json
{
  "table_name": "orders"
}
```

#### `mysql_alter_table`
修改现有表的结构，支持添加、修改、删除列、索引和约束等高级操作。  
提供全面的安全验证、事务安全保障和智能错误处理机制。  
支持批处理多个修改操作，提高数据库架构管理的效率和安全性。  
包含性能监控和缓存自动失效，确保修改后的数据一致性。  
**示例：**
```json
{
  "table_name": "users",
  "alterations": [
    { "type": "ADD_COLUMN", "column": { "name": "age", "type": "INT", "nullable": true } }
  ]
}
```

#### `mysql_performance_optimize`
性能优化工具，提供企业级MySQL性能优化解决方案，提供全方位数据库性能诊断和优化功能。
集成了慢查询分析、索引优化建议、性能报告生成等高级性能优化能力。
支持智能分析查询模式、识别性能瓶颈、生成优化建议和详细性能报告。
适用于数据库管理员进行性能调优、查询优化、系统监控等场景。
**操作类型：**
- **analyze_slow_queries**: 分析慢查询日志
- **suggest_indexes**: 生成索引优化建议
- **performance_report**: 生成性能综合报告
- **query_profiling**: 对特定查询进行性能剖析

**示例：**
```json
// 启用慢查询日志
{
  "action": "enable_slow_query_log",
  "longQueryTime": 2,
  "logQueriesNotUsingIndexes": true
}

// 分析慢查询
{
  "action": "analyze_slow_queries",
  "limit": 10,
  "include_details": true
}

// 生成综合性能报告
{
  "action": "suggest_indexes",
  "time_range": "1 week"
}

// 对特定查询进行性能剖析
{
  "action": "query_profiling",
  "query": "SELECT * FROM users WHERE email = ? AND status = ?",
  "params": ["user@example.com", "active"],
  "include_details": true
}
```

### 💾 数据备份与导出 (5个工具)

#### `mysql_backup`
数据库备份，支持多种备份策略和高级功能。  
提供全量备份、增量备份、大文件备份等多种备份类型，满足不同场景的需求。  
集成了进度跟踪、错误恢复、队列管理等高级功能，确保备份过程的可靠性和可观测性。  
支持智能压缩、数据验证、备份恢复等多种企业级特性。  
**示例：**
##### 全量备份所有表
```json
{
  "outputDir": "/backup",
  "compress": true,
  "includeData": true,
  "includeStructure": true,
  "filePrefix": "daily_backup"
}
```
##### 仅备份表结构
```json
{
  "includeData": false,
  "includeStructure": true,
  "tables": ["users", "products", "orders"],
  "filePrefix": "schema_only"
}
```
##### 增量备份（基于时间戳）
```json
{
  "backupType": "incremental",
  "incrementalMode": "timestamp",
  "lastBackupTime": "2024-01-15T00:00:00Z",
  "trackingTable": "backup_history",
  "filePrefix": "incremental_backup"
}
```
##### 大文件备份（适用于超大数据集）
```json
{
  "backupType": "large-file",
  "chunkSize": 128,
  "maxMemoryUsage": 1024,
  "compressionLevel": 9,
  "diskThreshold": 500,
  "filePrefix": "large_dataset_backup"
}
```
##### 带进度跟踪的备份
```json
{
  "withProgress": true,
  "priority": 5,
  "useQueue": true,
  "filePrefix": "progress_tracked_backup"
}
```
##### 高可靠性的备份（带错误恢复）
```json
{
  "withRecovery": true,
  "retryCount": 3,
  "compress": true,
  "maxFileSize": 200,
  "filePrefix": "reliable_backup"
}
```

#### `mysql_verify_backup`
备份验证，确保备份文件的完整性、有效性和可恢复性。  
提供全面的备份验证，包括文件格式检查、数据完整性验证、元数据验证等。  
支持多种验证级别和详细的验证报告，帮助确保备份数据的可靠性。   
集成了智能验证算法，能够检测数据损坏、格式错误和潜在的恢复问题。  

**示例：**
##### 基础备份验证
```json
{
  "backupFilePath": "/backup/mysql_backup_2024.sql"
}
```
##### 深度验证（全面检查）
```json
{
  "backupFilePath": "/backup/mysql_backup_2024.sql",
  "deepValidation": true,
  "validateStructure": true,
  "validateData": true,
  "checkCorruption": true,
  "maxSampleSize": 5000 
}
```
##### 快速结构验证
```json
{
  "backupFilePath": "/backup/schema_only_backup.sql",
  "deepValidation": false,
  "validateStructure": true,
  "validateData": false,
  "generateReport": true,
  "outputFormat": "text"
}
```
##### 生产环境验证（平衡速度和准确性）
```json
{
  "backupFilePath": "/backup/production_backup.sql",
  "deepValidation": true,
  "validateStructure": true,
  "validateData": true,
  "checkCorruption": true,
  "maxSampleSize": 10000,
  "generateReport": true,
  "outputFormat": "json" 
}
```
##### 大文件验证（优化内存使用）
```json
{
  "backupFilePath": "/backup/large_backup.sql",
  "deepValidation": false,
  "validateStructure": true,
  "validateData": false,
  "checkCorruption": true,
  "maxSampleSize": 1000,
  "generateReport": false 
}
```

#### `mysql_export_data`
数据导出，支持将MySQL查询结果导出为多种格式文件（Excel、CSV、JSON）。  
集成了高级错误恢复机制、实时进度跟踪、任务队列管理等企业级特性。  
支持大数据量导出、内存优化、多种格式转换和详细的导出统计信息。  
特别适用于数据分析、报表生成、数据迁移等场景。

主要特性：  
- **多格式支持**：Excel（.xlsx）、CSV（.csv）、JSON（.json）  
- **高级导出选项**：自定义文件名、工作表名、包含表头等  
- **错误恢复机制**：自动重试、回退策略、详细错误诊断  
- **进度跟踪**：实时进度更新、取消支持、详细统计信息  
- **队列管理**：异步执行、优先级调度、并发控制  
- **内存优化**：流式处理、大文件分块、内存使用监控  
- **企业级功能**：详细日志、性能指标、操作审计    


**示例：**
##### 基础数据导出（Excel格式）
```json
{
  "query": "SELECT id, name, email, created_at FROM users WHERE status = ?",
  "params": ["active"]
}
```
##### 导出为CSV格式（大数据量优化）
```json
{
  "query": "SELECT * FROM orders WHERE order_date >= ?",
  "params": ["2024-01-01"],
  "format": "csv",
  "maxRows": 500000,
  "fileName": "orders_2024"
}
```
##### JSON格式导出（API数据准备）
```json
{
  "query": "SELECT product_id, name, price, inventory FROM products",
  "format": "json",
  "includeHeaders": false,
  "outputDir": "/api/data"
}
``` 
##### 带进度跟踪的导出
```json
{
  "query": "SELECT * FROM large_dataset",
  "withProgress": true,
  "enableCancellation": true,
  "maxRows": 1000000
}
``` 
##### 异步队列导出（高并发场景）
```json
{
  "query": "SELECT * FROM analytics_data",
  "useQueue": true,
  "priority": 5,
  "immediateReturn": true,
  "fileName": "analytics_report"
}
``` 
##### 高可靠性导出（带错误恢复）
 ```json
{
  "query": "SELECT * FROM critical_data",
  "withRecovery": true,
  "retryCount": 3,
  "exponentialBackoff": true,
  "fallbackFormat": "csv",
  "reducedBatchSize": 5000
}
```
##### 自定义Excel导出（多工作表样式）
 ```json
{
  "query": "SELECT customer_id, order_total, order_date FROM customer_orders",
  "format": "excel",
  "sheetName": "CustomerOrders",
  "includeHeaders": true,
  "fileName": "customer_analysis_Q1"
}
```
##### 企业级大数据导出
```json
{
  "query": "SELECT * FROM enterprise_logs WHERE timestamp >= ? AND timestamp <= ?",
  "params": ["2024-01-01 00:00:00", "2024-01-31 23:59:59"],
  "format": "csv",
  "maxRows": 5000000,
  "withRecovery": true,
  "withProgress": true,
  "useQueue": true,
  "priority": 10,
  "fileName": "enterprise_logs_january"
}
```

#### `mysql_import_data`
企业级数据导入解决方案，支持多种数据格式（CSV、JSON、Excel、SQL）的批量导入。
集成了智能数据验证、字段映射、事务管理、错误处理和性能监控等完整导入生态系统。
提供从简单文件到复杂多格式数据导入的全方位支持。

主要特性：
  - **多格式支持**：CSV（自定义分隔符）、JSON（含嵌套数据）、Excel（多工作表）、SQL脚本
  - **智能验证**：类型检查、约束验证、重复检测、数据完整性保障
  - **字段映射**：自动映射和手动配置，支持复杂数据结构转换
  - **事务控制**：单条和批量事务模式，确保数据一致性和ACID特性
  - **错误处理**：详细错误诊断、分级错误报告、自动错误恢复
  - **批量优化**：内存分块处理、大文件分批写入、性能监控
  - **重复处理**：智能重复检测，支持跳过、更新、错误处理策略
  - **进度跟踪**：实时导入进度、性能统计、预估完成时间

应用场景：
  - **企业数据迁移**：大规模数据集迁移，异构系统数据同步
  - **ETL流程**：数据仓库装载，增量/全量数据更新
  - **系统集成**：第三方系统数据导入，企业应用数据交换
  - **业务处理**：用户数据导入、产品目录更新、订单批量处理
  - **开发环境**：测试数据导入，开发环境数据初始化
  
**示例：**

##### 单条事务模式 - 完全ACID保证
```json
{
  "table_name": "users",
  "file_path": "/data/users.csv",
  "format": "csv",
  "has_headers": true,
  "field_mapping": {
    "姓名": "name",
    "邮箱": "email",
    "年龄": "age"
  },
  "batch_size": 500,
  "use_transaction": true,
  "validate_data": true,
  "skip_duplicates": false,
  "conflict_strategy": "error"
}
```
##### 批量事务模式 - 批次级别原子性
```json
{
  "table_name": "products",
  "file_path": "/data/products.json",
  "format": "json",
  "field_mapping": {
    "productName": "name",
    "productPrice": "price",
    "inventory": "stock"
  },
  "batch_size": 1000,
  "use_transaction": false,
  "with_progress": true,
  "validate_data": true
}
```

##### Excel格式智能导入
```json
{
  "table_name": "orders",
  "file_path": "/data/orders.xlsx",
  "format": "excel",
  "sheet_name": "Sheet1",
  "has_headers": true,
  "field_mapping": {
    "订单号": "order_id",
    "金额": "amount",
    "日期": "created_at"
  },
  "use_transaction": true,
  "with_recovery": true,
  "validate_data": true
}
```
##### 导入SQL文件 - 事务安全
```json
{
  "table_name": "backup_data",
  "file_path": "/data/backup.sql",
  "format": "sql",
  "use_transaction": true,  // SQL语句批量执行在一个事务中
  "with_recovery": true
}
```

#### `mysql_generate_report`
数据报表生成，支持执行多个查询并生成综合数据报表。    
集成了多工作表Excel文件生成、自定义报表格式、性能指标整合等高级功能。    
特别适用于业务分析、市场调研、运营监控、财务报告等场景。    
提供完整的报表生命周期管理，从数据查询到格式化输出的一站式服务。

主要特性：  
  - **多查询整合**：支持同时执行多个相关查询，自动整合结果  
  - **多格式支持**：Excel（多工作表）、CSV、JSON等格式*  
  - **性能监控**：内置查询性能统计和优化建议  
  - **智能布局**：自动优化报表结构和数据展示  
  - **企业级功能**：详细日志、错误恢复、操作审计  
  - **缓存优化**：查询结果智能缓存，提高重复报表生成效率

应用场景  
  - **业务综合报表**：销售数据、市场分析、用户行为等  
  - **财务分析报表**：收入支出、成本分析、预算执行等  
  - **运营监控报表**：系统状态、性能指标、错误统计等  
  - **管理决策报表**：KPI指标、趋势分析、预测数据等
  
**示例：**

```json
{
  "title": "月度销售报表",
  "queries": [
    {
      "name": "销售总览",
      "query": "SELECT SUM(amount) FROM sales WHERE month = ?",
      "params": ["2023-12"]
    }
  ],
  "includeHeaders": true,
  "fileName": "monthly_sales_report"
}
```

### 🛠️ 系统管理与监控 (8个工具)

#### `mysql_system_status`
全面系统诊断，提供全面的MySQL数据库服务器健康状况检查和性能监控。  
集成了连接状态诊断、导出操作监控、队列管理状态、系统资源监控等全方位监控能力。  
支持分层诊断（全面/连接/导出/队列/内存）和详细诊断信息展示。  
提供智能健康评估、性能指标分析、趋势预测和优化建议。

主要特性：  
- **分层诊断**：支持full（全面）、connection（连接）、export（导出）、queue（队列）、memory（内存）五种检查范围  
- **连接监控**：数据库连接池状态、连接测试、性能指标、配置信息  
- **导出监控**：活跃导出任务、队列状态、完成历史、性能统计  
- **队列监控**：任务队列状态、并发控制、失败任务分析、诊断信息  
- **内存监控**：系统内存使用、GC状态、内存泄漏检测、压力分析  
- **健康评估**：整体健康状态评估、问题识别、优化建议生成

诊断范围说明：  
- **full**: 全面诊断所有组件和系统状态  
- **connection**: 重点检查数据库连接和性能指标    
- **export**: 监控导出操作状态和队列情况  
- **queue**: 分析任务队列状态和并发控制  
- **memory**: 评估系统内存使用和GC状态

应用场景：  
- **日常运维监控**：定期检查系统健康状况  
- **故障排查**：快速定位系统瓶颈和问题  
- **性能调优**：分析性能指标，制定优化策略  
- **容量规划**：监控资源使用趋势，预测容量需求  
- **自动化监控**：集成到监控系统中，实现自动告警
  
**示例：**
##### 全面系统诊断（推荐日常使用）
```json
{
  "scope": "full",
  "includeDetails": true
}
```
##### 连接状态检查（数据库连接问题排查）
```json
{
  "scope": "connection",
  "includeDetails": false
}
```      
##### 导出操作监控（导出任务状态查看）
```json
{
  "scope": "export",
  "includeDetails": true
}
```
##### 队列状态分析（任务队列性能调优）
```json
{
  "scope": "queue",
  "includeDetails": true
}
```
##### 内存使用评估（内存泄漏检测）
```json
{
  "scope": "memory",
  "includeDetails": true
}
```
##### 快速健康检查（运维监控）
```json
{
  "scope": "full",
  "includeDetails": false
}
```
##### 详细系统分析（故障排查）
```json
{
  "scope": "full",
  "includeDetails": true
}
```
##### 性能监控集成（自动化监控）
```json
{
  "scope": "connection",
  "includeDetails": true
}
```

#### `mysql_analyze_error`
错误智能诊断，深度分析数据库错误并提供精准的恢复策略。  
集成了错误分类、上下文感知、自动诊断、恢复建议生成等全方位错误处理能力。  
支持语法错误、连接问题、权限错误、约束冲突等多种错误类型的智能识别和处理。

主要特性：  
- **智能错误分类**：自动识别错误类型（语法/连接/权限/约束/性能等）  
- **上下文感知分析**：根据操作上下文提供针对性诊断建议  
- **自动诊断引擎**：深度分析错误根因，提供多层次诊断信息  
- **恢复策略生成**：基于错误类型生成具体的修复步骤和预防措施  
- **安全增强**：错误信息脱敏处理，防止敏感信息泄露  
- **学习型系统**：持续学习常见错误模式，提高诊断准确性

诊断范围：  
- **语法错误**：SQL语法错误、关键字拼写错误、语句结构问题  
- **连接错误**：网络连接、认证失败、连接池问题、超时问题  
- **权限错误**：访问拒绝、权限不足、用户不存在  
- **约束错误**：主键冲突、外键约束、唯一性约束、数据类型不匹配  
- **性能错误**：查询超时、死锁、资源不足  
- **其他错误**：未知错误类型的一般性处理和建议

应用场景：  
- **开发调试**：快速定位SQL语法错误和逻辑问题  
- **生产运维**：快速诊断数据库连接和权限问题  
- **数据迁移**：识别和解决数据导入导出过程中的错误  
- **性能调优**：分析查询性能问题和超时错  
- **安全审计**：检测和分析安全相关的数据库错误  
  
**示例：**
##### 分析连接访问拒绝错误
 ```json 
{
  "error_message": "Access denied for user 'root'@'localhost' (using password: YES)",
  "operation": "connection"
}
```
##### 分析SQL语法错误
 ```json
{
  "error_message": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'SELEC * FROM users' at line 1",
  "operation": "query"
}
```
##### 分析外键约束冲突
 ```json
{
  "error_message": "Cannot delete or update a parent row: a foreign key constraint fails (`shop`.`orders`, CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`))",
  "operation": "dml"
}
```
##### 分析表不存在错误
 ```json
{
  "error_message": "Table 'database.users' doesn't exist",
  "operation": "query"
}
```
##### 分析重复键错误
 ```json
{
  "error_message": "Duplicate entry 'john@example.com' for key 'email'",
  "operation": "dml"
}
```
##### 分析权限不足错误
 ```json
{
  "error_message": "SELECT command denied to user 'readonly'@'localhost' for table 'sensitive_data'",
  "operation": "security"
}
```
##### 分析查询超时错误
 ```json
{
  "error_message": "Query execution was interrupted, maximum statement execution time exceeded",
  "operation": "query"
}
```
##### 分析死锁错误
 ```json
{
  "error_message": "Lock wait timeout exceeded; try restarting transaction",
  "operation": "dml"
}
```
##### 分析数据类型不匹配错误
 ```json
{
  "error_message": "Incorrect integer value: 'abc' for column 'user_id' at row 1",
  "operation": "dml"
}
```

#### `mysql_security_audit`
数据库安全审计，执行全面的安全性评估和合规性检查。  
集成了配置安全分析、用户权限审计、数据保护评估、安全威胁检测等全方位安全诊断能力。  
支持多种安全标准合规检查，帮助企业识别安全风险并制定安全加固策略。

主要特性：  
- **配置安全审计**：检查数据库配置的安全性设置和最佳实践。  
- **用户权限审计**：分析用户角色、权限分配和最小权限原则执行情况  
- **数据保护评估**：评估敏感数据保护措施和加密机制  
- **安全威胁检测**：识别潜在的安全漏洞和攻击向量  
- **合规性检查**：支持SOX、GDPR、PCI-DSS等标准的安全合规评估  
- **风险评分系统**：提供安全风险量化评分和优先级排序  
- **修复建议生成**：基于审计结果提供具体的修复步骤和安全加固建议

审计范围：  
- **数据库配置安全**：连接限制、超时设置、安全协议、日志配置    
- **用户账户安全**：密码策略、账户锁定、过期策略、权限最小化  
- **访问控制安全**：角色定义、权限分配、审计日志、访问模式  
- **数据保护安全**：加密机制、敏感数据识别、数据脱敏、备份安全  
- **网络安全**：连接安全、防火墙配置、入侵检测  
- **合规性评估**：行业标准符合性、多框架对比分析

应用场景：  
- **安全基线评估**：定期进行安全状况评估，建立安全基线  
- **合规性审计**：满足监管要求，进行合规性检查和报告  
- **安全事件响应**：安全事件发生后进行全面安全评估  
- **第三方审计**：为外部审计师提供详细的安全报告  
- **安全优化**：识别安全薄弱环节，制定改进措施  
- **渗透测试后评估**：评估渗透测试发现的安全问题  
  
**示例：**
```json
{}
```

#### `mysql_progress_tracker`
异步操作进度跟踪，统一管理和监控所有后台任务的执行状态。  
集成了实时进度更新、操作取消、详细状态查询、多操作类型支持等全方位进度管理能力。  
支持备份、导出等长期运行操作的进度可视化和控制，增强用户体验和操作透明度。

主要特性：  
- **统一进度管理**：集中管理所有异步操作的进度状态  
- **实时进度更新**：提供实时的执行进度和状态信息  
- **操作取消支持**：支持取消正在进行的操作（需要操作支持）  
- **详细状态查询**：提供操作的详细信息、时间戳、持续时间等  
- **多操作类型**：支持备份、导出等多种操作类型的进度跟踪  
- **性能指标**：提供操作的性能统计和时间估算  
- **批量操作**：支持同时查看多个操作的进度状态

支持的操作类型：  
- **backup**：数据库备份操作进度跟踪  
- **export**：数据导出操作进度跟踪  
- **all**：所有操作类型的进度跟踪（默认）

应用场景：  
- **备份监控**：实时监控数据库备份进度，及时发现问题  
- **导出跟踪**：跟踪大数据量导出操作的执行状态  
- **批量操作管理**：管理多个并发操作的进度和状态  
- **运维监控**：为运维人员提供操作进度可视化  
- **用户体验**：为用户提供操作进度的实时反馈  
- **问题诊断**：通过进度信息快速定位操作问题  
  
**示例：**
##### 列出所有活跃操作的基本进度信息
```json
{
  "action": "list"
}
```
##### 查看备份操作的进度（详细信息）
```json
{
  "action": "list",
  "operationType": "backup",
  "detailLevel": "detailed"
}
```
##### 获取特定操作的详细信息
```json
{
  "action": "get",
  "trackerId": "backup_123456"
}
```
##### 取消正在进行的导出操作
```json
{
  "action": "cancel",
  "trackerId": "export_789012"
}
```
##### 获取所有操作的进度汇总统计
```json
{
  "action": "summary"
}
```
##### 查看包含已完成操作的详细列表
```json
{
  "action": "list",
  "includeCompleted": true,
  "detailLevel": "detailed"
}
```
##### 监控特定类型的操作进度
```json
{
  "action": "list",
  "operationType": "export",
  "detailLevel": "detailed"
}
```
##### 运维监控场景：定期检查系统状态
```json
{
  "action": "summary"
}
```
##### 问题诊断：查看长时间运行的操作
```json
{
  "action": "list",
  "detailLevel": "detailed"
}
```

#### `mysql_optimize_memory`
内存管理，整合系统级内存优化、备份任务内存管理、垃圾回收控制和详细的内存分析功能。  
提供全面的内存压力监测、智能垃圾回收、内存泄漏检测和性能优化建议。

主要特性：  
- **系统级内存监控**：实时监测堆内存、RSS、外部内存使用情况  
- **智能垃圾回收**：支持强制GC执行，内存优化和效率分析  
- **内存压力管理**：自动检测内存压力水平，提供优化建议  
- **备份操作优化**：专门优化备份任务的内存使用和管理  
- **内存泄漏检测**：持续监控内存使用趋势，识别潜在泄漏  
- **并发控制优化**：动态调整任务并发数，平衡性能和内存使用  
- **详细性能报告**：提供内存使用历史、趋势分析和优化建议

支持的操作类型：  
- **status**：查看当前内存状态和系统健康状况  
- **cleanup**：执行基础内存清理，释放已完成任务的资源  
- **optimize**：执行全面内存优化，包括GC和缓存清理  
- **configure**：配置内存监控和并发控制参数  
- **report**：生成详细的内存分析报告  
- **gc**：专门执行垃圾回收操作

应用场景：  
- **内存压力监控**：实时监控系统内存使用，预防内存不足  
- **性能优化**：定期执行内存清理，提高系统响应速度  
- **故障排查**：分析内存泄漏，定位性能瓶颈  
- **资源管理**：优化备份和导出操作的内存使用  
- **系统维护**：定期内存优化，保持系统健康状态  
- **容量规划**：基于内存使用趋势制定扩容计划  
  
**示例：**
###### 查看当前内存状态
```json
{
 "action": "status"
}
```
###### 执行基础内存清理
```json
{
 "action": "cleanup"
}
```
###### 执行全面内存优化（包括强制GC）
```json
{
 "action": "optimize",
 "forceGC": true
}
```
###### 配置内存监控参数
```json
{
 "action": "configure",
 "enableMonitoring": true,
"maxConcurrency": 3
}
```
###### 生成详细内存分析报告
```json
{
 "action": "report",
 "includeHistory": true
}
```
###### 执行专门的垃圾回收
```json
{
 "action": "gc"
}
```
###### 快速内存优化（不强制GC）
```json
{
 "action": "optimize",
 "forceGC": false
}
```
###### 内存压力监控场景
```json
{
 "action": "status"
}
```
###### 定期维护任务
```json
{
 "action": "cleanup"
}
```
###### 故障排查支持
```json
{
 "action": "report",
 "includeHistory": true
}
```

#### `mysql_manage_queue`
任务队列管理，统一管理和监控所有异步操作（备份、导出、数据迁移等）的执行队列。  
提供全面的队列控制能力，包括任务状态监控、并发控制、队列调度、任务取消和系统诊断。  
集成了优先级调度、错误恢复、性能监控等高级特性，支持大规模并发任务处理。

主要特性：  
- **统一队列管理**：集中管理所有类型的异步任务队列  
- **实时状态监控**：提供队列状态、任务进度、性能指标的实时监控  
- **并发控制优化**：动态调整任务并发数，平衡系统负载  
- **任务生命周期管理**：完整的任务创建、执行、完成、取消生命周期  
- **优先级调度**：支持任务优先级调度，确保重要任务优先执行  
- **错误恢复机制**：自动处理失败任务的重试和错误恢复  
- **详细诊断功能**：提供队列健康状态分析和性能诊断  
- **灵活过滤查询**：支持按任务类型、状态等维度过滤和查询

支持的操作类型：  
- **status**：查看队列状态和任务列表，支持详细信息展示和类型过滤  
- **pause**：暂停队列，停止新任务执行，已运行任务继续完成  
- **resume**：恢复队列，继续执行排队任务  
- **clear**：清空队列，取消所有排队中的任务  
- **set_concurrency**：设置最大并发任务数，控制系统负载  
- **cancel**：取消指定的单个任务  
- **diagnostics**：执行队列诊断，提供健康状态和优化建议  
- **get_task**：获取单个任务的详细信息，包括执行时间和状态历史

应用场景：  
- **生产环境监控**：实时监控任务队列状态，确保系统稳定运行  
- **负载均衡控制**：动态调整并发数，应对不同的负载情况  
- **任务调度管理**：管理备份、导出等批量任务的执行顺序  
- **故障排查诊断**：快速定位队列问题和性能瓶颈  
- **运维自动化**：集成到运维脚本中进行自动化的队列管理  
- **资源优化**：根据系统资源情况调整任务执行策略  

**示例：**
##### 查看队列状态概览
```json
{
  "action": "status",
  "showDetails": true
}
```
##### 查看详细的队列状态（包含所有任务信息）
```json
{
  "action": "status",
  "showDetails": true
}
```
##### 查看特定类型的任务（仅备份任务）
```json
{
  "action": "status",
  "filterType": "backup",
  "showDetails": true
}
```
##### 暂停队列处理
```json
{
  "action": "pause"
}
```
##### 恢复队列处理
```json
{
  "action": "resume"
}
```
##### 清空队列中的所有任务
```json
{
  "action": "clear"
}
```
##### 设置最大并发任务数为5
```json
{
  "action": "set_concurrency",
  "maxConcurrency": 5
}
```
##### 取消指定的任务
```json
{
  "action": "cancel",
  "taskId": "backup_123456"
}
```
##### 执行队列诊断
```json
{
  "action": "diagnostics"
}
```
##### 获取单个任务的详细信息
```json
{
  "action": "get_task",
  "taskId": "export_789012"
}
```
##### 生产环境监控场景
```json
{
  "action": "status",
  "showDetails": true
}
```
##### 紧急情况下的队列控制
```json
{
  "action" "pause"
}
```
##### 然后清空队列
```json
{
  "action" "clear"
}
```
##### 负载优化调整
```json
{
  "action": "set_concurrency",
  "maxConcurrency": 3
}
```
##### 故障排查支持
```json
{
  "action": "diagnostics"
}
```

#### `mysql_manage_indexes`
索引管理工具，提供企业级MySQL索引管理解决方案，提供完整的索引生命周期管理功能。
集成了索引创建、删除、优化分析等全方位索引管理能力。
支持多种索引类型，包括普通索引、唯一索引、主键索引、全文索引、空间索引。
适用于数据库管理员进行索引优化、性能调优等场景。

**操作类型：**
- **create**: 创建新索引
- **drop**: 删除索引
- **analyze**: 分析索引使用情况
- **optimize**: 优化索引结构
- **list**: 列出索引信息

**示例：**
```json
// 创建普通索引
{
  "action": "create",
  "table_name": "users",
  "index_name": "idx_users_email",
  "columns": ["email"]
}

// 创建复合索引
{
  "action": "create",
  "table_name": "orders",
  "index_name": "idx_orders_user_date",
  "columns": ["user_id", "created_at"]
  }

// 创建唯一索引
{
  "action": "create",
  "table_name": "products",
  "index_name": "idx_products_sku",
  "index_type": "UNIQUE",
  "columns": ["sku"]
}

// 删除索引
{
  "action": "drop",
  "table_name": "users",
  "index_name": "idx_users_email",
  "if_exists": true
}

// 分析索引使用情况
{
  "action": "analyze",
  "table_name": "users"
}

// 优化索引结构
{
  "action": "optimize",
  "table_name": "users"
}

// 列出表的所有索引
{
  "action": "list",
  "table_name": "users"
}

// 列出数据库中所有表的索引
{
  "action": "list"
}
```

#### `mysql_manage_users`
用户管理工具，提供企业级MySQL用户管理解决方案，提供完整的用户生命周期管理功能。
集成了用户创建、删除、权限授予和撤销等全方位用户管理能力。
支持安全密码验证、权限精细控制、用户审计追踪等企业级特性。
适用于数据库管理员进行用户权限管理、安全合规等场景。

**操作类型：**
- **create**: 创建新用户
- **delete**: 删除用户
- **grant**: 授予用户权限
- **revoke**: 撤销用户权限
- **list**: 列出所有用户
- **show_grants**: 显示用户权限

**示例：**
```json
// 创建新用户
{
  "action": "create",
  "username": "newuser",
  "password": "secure_password",
  "host": "localhost"
}
 
// 删除用户
{
  "action": "delete",
  "username": "olduser",
  "if_exists": true
}

// 授予权限
{
  "action": "grant",
  "username": "appuser",
  "privileges": ["SELECT", "INSERT", "UPDATE"],
  "database": "myapp",
  "table": "users"
}
 
// 撤销权限
{
  "action": "revoke",
  "username": "appuser",
  "privileges": ["DELETE"],
  "database": "myapp"
}
 
// 列出所有用户
{
  "action": "list"
}

// 显示用户权限
{
  "action": "show_grants",
  "username": "appuser"
}
```

#### `mysql_replication_status`
复制状态工具，提供企业级MySQL主从复制监控解决方案，提供全面的复制状态监控、延迟检测、错误诊断和配置查看功能。
支持主从架构的健康监控和故障排查，适用于生产环境的复制拓扑管理。

**操作类型：**
- **status**: 查看复制状态概览
- **delay**: 检测复制延迟
- **diagnose**: 诊断复制错误
- **config**: 查看复制配置

**示例：**
```json
// 查看复制状态概览
{
  "action": "status"
}

// 检测复制延迟
{
  "action": "delay"
}
```

## 使用示例

### 📝 基础查询操作
```bash
# 连接到 Claude Desktop 并使用以下示例：

# 查询用户数据
{
  "query": "SELECT id, name, email, created_at FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10",
  "params": []
}

# 获取表结构
{
  "table_name": "orders"
}

# 带参数的复杂连接查询
{
  "query": "SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.created_at > ? GROUP BY u.id HAVING order_count > 0 ORDER BY total_spent DESC",
  "params": ["2023-01-01"]
}
```

### 🔄 CRUD操作
```bash
# 插入新用户
{
  "table_name": "users",
  "data": {
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "status": "active"
  }
}

# 更新用户状态
{
  "table_name": "users",
  "data": {
    "status": "inactive"
  },
  "where_clause": "email = 'john@example.com'"
}

# 删除用户
{
  "table_name": "users",
  "where_clause": "id = 123"
}
```

### 🔄 批量操作
```bash
# 批量事务示例
{
  "queries": [
    {"sql": "INSERT INTO users (name, email) VALUES (?, ?)", "params": ["Alice Johnson", "alice@example.com"]},
    {"sql": "INSERT INTO profiles (user_id, bio) VALUES (LAST_INSERT_ID(), ?)", "params": ["Software Engineer"]},
    {"sql": "UPDATE user_stats SET total_users = total_users + 1"}
  ]
}

# 批量插入示例
{
  "table_name": "products",
  "data": [
    {"name": "Laptop Pro", "price": 1299.99, "category": "Electronics", "stock": 50},
    {"name": "Wireless Mouse", "price": 29.99, "category": "Electronics", "stock": 200},
    {"name": "Office Chair", "price": 199.99, "category": "Furniture", "stock": 25}
  ]
}
```

### 🛡️ 系统健康监控
```bash
# 获取全面的系统状态
{
  "scope": "full",
  "includeDetails": true
}

# 内存优化和分析
{
  "action": "optimize",
  "forceGC": true,
  "includeHistory": true
}

# 队列管理
{
  "action": "status",
  "showDetails": true,
  "filterType": "all"
}

# 进度跟踪
{
  "action": "summary"
}

# 安全审计
{} # 无需参数
```

## 架构设计

### 🏗️ 核心组件架构
```
MySQLManager (中央引擎) - mysqlManager.ts
├── 配置管理层 - config.ts
│   ├── ConfigurationManager             # 中央配置管理
│   ├── DatabaseConfig                   # 数据库连接配置
│   ├── SecurityConfig                   # 安全配置管理
│   └── CacheConfig                      # 缓存配置管理
├── 数据访问层
│   ├── ConnectionPool                   # 增强连接池管理 - connection.ts
│   │   ├── preCreateConnections()       # 预创建连接
│   │   ├── performHealthCheck()         # 健康检查
│   │   └── adjustPoolSize()             # 动态调整池大小
│   └── SmartCache                       # 三级LRU缓存系统 - cache.ts
│       ├── SchemaCache                  # 表结构缓存 (128条目)
│       ├── TableExistsCache             # 表存在性缓存 (64条目)
│       └── IndexCache                   # 索引信息缓存 (64条目)
├── 安全防护层
│   ├── SecurityValidator                # 安全验证器 - security.ts
│   │   ├── validateInputComprehensive() # 全面输入验证
│   │   └── analyzeSecurityThreats()     # 威胁分析
│   ├── RBACManager                      # 权限管理 - rbac.ts
│   │   ├── checkPermission()            # 权限检查
│   │   └── assignRoleToUser()           # 角色分配
│   ├── AdaptiveRateLimiter              # 自适应速率限制 - rateLimit.ts
│   │   └── checkRateLimit()             # 令牌桶算法限流
│   └── SecurityAuditor                  # 安全审计员 - security.ts
├── 监控分析层
│   ├── PerformanceManager               # 性能管理器 - performanceManager.ts
│   │   ├── SlowQueryAnalysis            # 慢查询分析
│   │   ├── IndexOptimization            # 索引优化建议
│   │   └── QueryProfiling               # 查询性能剖析
│   ├── MetricsManager                   # 指标管理器 - metrics.ts
│   │   ├── TimeSeriesMetrics            # 时间序列指标
│   │   ├── PerformanceMetrics           # 性能指标
│   │   └── recordQueryTime()            # 查询时间记录
│   ├── MemoryMonitor                    # 内存监控 - monitor.ts
│   │   ├── getMemoryStats()             # 内存使用统计
│   │   └── optimizeMemory()             # 内存优化
│   ├── SystemMonitor                    # 系统监控 - monitor.ts
│   │   ├── collectSystemResources()     # 系统资源收集
│   │   └── checkAlerts()                # 告警检查
│   ├── ErrorHandler                     # 错误处理器 - errorHandler.ts
│   │   ├── safeError()                  # 安全错误处理
│   │   └── analyzeError()               # 错误分析
│   └── SmartRetryStrategy               # 智能重试策略 - retryStrategy.ts
├── 备份管理层
│   ├── MySQLBackupTool                  # 备份工具 - mysqlBackupTool.ts
│   │   ├── createBackup()               # 多模式备份
│   │   └── createIncrementalBackup()    # 增量备份
│   ├── MySQLImportTool                  # 导入工具 - mysqlImportTool.ts
│   │   ├── importData()                 # 多格式导入
│   │   └── validateImport()             # 导入验证
│   └── DataExporter                     # 数据导出器 - mysqlBackupTool.ts
├── 系统管理工具 (index.ts中的工具)
│   ├── mysql_system_status              # 系统状态检查
│   ├── mysql_analyze_error              # 错误智能分析
│   ├── mysql_security_audit             # 安全审计
│   ├── mysql_manage_indexes             # 索引管理
│   ├── mysql_manage_users               # 用户管理
│   ├── mysql_replication_status         # 复制状态监控
│   ├── mysql_progress_tracker           # 进度跟踪器
│   └── mysql_optimize_memory            # 内存优化
└── 日志与工具层
    ├── StructuredLogger                 # 结构化日志器
    ├── Constants                        # 常量定义 - constants.ts
    ├── Types                            # 类型定义 - types.ts
    ├── CommonUtils                      # 通用工具 - utils/common.ts
    └── CacheInvalidator                 # 缓存失效器 - utils/cacheInvalidator.ts
```

### MySQLManager - 中央引擎
位于 `src/mysqlManager.ts` 的 `MySQLManager` 类是核心协调器，集成所有企业级数据库功能：

**核心功能集成：**
- **连接池管理**: 增强型连接池 (`ConnectionPool`)，支持自动重连和健康检查
- **智能缓存**: 三级LRU缓存系统 (`SmartCache`)，O(1)复杂度，支持TTL和自动失效
- **安全验证**: 多层输入验证和SQL注入检测 (`SecurityValidator`)
- **权限控制**: RBAC权限管理 (`RBACManager`)，细粒度权限验证
- **性能监控**: 双层指标收集 (`MetricsManager`)，实时性能统计
- **错误处理**: 智能错误分类和恢复建议 (`ErrorHandler`)
- **重试机制**: 自适应重试策略 (`SmartRetryStrategy`)，指数退避算法

**高级功能：**
- **内存优化**: 压力感知的内存管理，自动垃圾回收
- **批处理支持**: 事务安全的批量操作，支持并行处理
- **审计日志**: 完整的操作审计和安全事件记录

### 🔄 数据流优化
1. **请求接收**: MCP服务器 (`index.ts`) 接收工具调用请求
2. **权限验证**: 通过RBAC系统检查用户权限
3. **安全检查**: 多层安全验证，包括SQL注入检测和输入清洗
4. **缓存查询**: 三级缓存系统 (Schema/TableExists/Index) 快速获取数据
5. **数据库操作**: 智能重试策略执行异步查询，支持事务安全
6. **性能监控**: 实时收集查询指标，监控系统资源使用
7. **结果处理**: 高级内存管理和流式结果处理
8. **安全响应**: 敏感数据脱敏和安全响应生成
9. **日志记录**: 结构化日志记录和审计追踪
10. **资源清理**: 自动释放连接，回池管理

**性能指标收集点：**
- 查询响应时间统计
- 缓存命中率监控
- 连接池使用情况
- 内存压力监控
- 错误分类统计

## 性能监控

### 🎯 关键性能指标 (KPIs)
通过 `mysql_system_status`、`mysql_optimize_memory` 和其他专业工具进行全面性能监控。

- **查询性能**: 平均查询时间、总查询数、慢查询数和智能错误分类
- **缓存效率**: 多层缓存统计（schema、tableExists、index），支持命中率和智能失效
- **连接池状态**: 健康监控，支持超时保护和连接生命周期跟踪
- **系统资源**: 实时CPU、内存和事件循环延迟监控
- **内存分析**: 内存使用趋势、泄漏检测和垃圾回收统计
- **错误分类**: 智能分类，附带恢复建议和诊断报告

### 高级监控功能
- 线性插值用于准确的百分位数计算（P95、P99）
- 增强的连接池监控，支持等待时间跟踪和健康检查
- 慢查询检测，阈值可配置（默认1秒）
- 缓存效率指标（目标>80%命中率），支持智能失效和内存压力自适应
- 错误率，支持智能分类和上下文恢复建议
- 系统资源使用情况监控（CPU、内存、事件循环延迟、磁盘I/O）
- 内存压力检测使用线性回归，支持自动垃圾回收触发
- 内存泄漏模式检测，支持趋势分析和自动警报
- 时间序列数据保留，窗口大小可配置，支持数据老化
- 实时警报系统，支持结构化回调和通知渠道
- 性能回归检测，支持历史比较和异常检测

### 📈 性能指标示例 (JSON输出)
```json
{
  "performance_metrics": {
    "performance": {
      "queryCount": 50,
      "totalQueryTime": 2.5,
      "errorCount": 1,
      "slowQueryCount": 3,
      "avg_query_time": 0.05,
      "cache_hit_rate": 0.8
    },
    "cache_stats": {
      "schema_cache": {
        "size": 10,
        "max_size": 100,
        "hit_count": 40,
        "miss_count": 10,
        "hit_rate": 0.8,
        "ttl": 300
      }
    }
  },
  "connection_pool_status": {
    "status": "Healthy",
    "totalConnections": 10,
    "idleConnections": 8,
    "waitingConnections": 0
  }
}
```

## 缓存策略

### 🧠 高级多层缓存架构

系统实现了企业级、多层级的智能缓存系统，集成了先进的内存管理和性能优化功能：

#### 1. 分层缓存架构 (L1/L2)
`SmartCache` 类实现了复杂的分层缓存架构，优化性能和内存利用率：

**L1 缓存 (热数据 - 基于Map):**
- **用途**: 存储频繁访问的数据，提供O(1)访问时间
- **实现**: 高性能Map数据结构，支持自动LRU驱逐算法
- **大小**: 可配置（默认：总缓存大小的80%）
- **TTL支持**: 每个条目独立TTL，支持自动过期
- **性能**: 亚毫秒级访问时间，适用于高频访问数据

**L2 缓存 (温数据 - 基于Object):**
- **用途**: 存储次频繁访问的数据作为二级缓存
- **实现**: Object基础存储，支持可配置的驱逐策略
- **大小**: 可配置（默认：总缓存大小的20%）
- **提升机制**: 基于访问模式自动从L2提升到L1
- **持久化**: 支持更长的TTL值，提高缓存利用率

#### 2. 高级缓存特性

**动态TTL调整:**
- **访问模式分析**: 监控访问频率和模式
- **自动TTL扩展**: 自动延长频繁访问条目的TTL
- **可配置参数**: 可调节的灵敏度和扩展系数
- **性能影响**: 减少热门数据的缓存未命中率

**WeakMap内存保护:**
- **内存泄漏防护**: 使用WeakMap实现对象引用管理
- **自动垃圾回收**: 对象不再被引用时自动清理
- **引用管理**: 支持WeakRef的高级内存管理
- **零内存开销**: 缓存元数据不产生额外内存成本

**智能预取系统:**
- **模式识别**: 分析访问模式预测未来需求
- **主动加载**: 在请求前预加载相关数据
- **可配置阈值**: 可调节的预取触发条件和限制
- **性能提升**: 减少可预测访问模式的延迟

#### 3. 缓存预热系统
- **启动预加载**: 系统启动时自动加载频繁访问的数据
- **进度跟踪**: 实时进度监控，支持完成时间估算
- **错误处理**: 完善的错误处理和回退策略
- **性能指标**: 详细的预热性能统计数据

### 🏗️ 内存压力感知缓存管理

系统与集中的`MemoryPressureManager`深度集成，实现智能缓存大小调整：

#### 自动缓存调整
```typescript
// 基于MemoryPressureManager的自动内存压力处理
adjustForMemoryPressure(pressureLevel: number): void {
  // 内存压力超过70%时减少缓存大小
  if (pressureLevel > 0.7) {
    this.adjustTierSizes(-0.3); // 按比例减少L1/L2大小
    this.evictLowPriorityEntries();
  }

  // 压力超过85%时启用压缩
  if (pressureLevel > 0.85) {
    this.enableCacheCompression();
    this.aggressiveCleanup();
  }
}
```

#### 智能驱逐策略
- **优先级驱逐**: LRU结合访问频率评分算法
- **分层清理**: L1和L2缓存采用不同的驱逐策略
- **内存压力响应**: 高压力下的主动驱逐机制
- **热数据保护**: 频繁访问数据在清理时得到保护

### 📊 高级缓存性能监控

全面的缓存性能分析通过增强的监控系统实现：

```json
{
  "cache_performance": {
    "global_hit_rate": 0.923,
    "tier_efficiency": {
      "l1_hit_rate": 0.945,
      "l2_hit_rate": 0.678,
      "promotion_rate": 0.234
    },
    "memory_usage": {
      "l1_size": "8.2 MB",
      "l2_size": "4.1 MB",
      "total_memory": "12.3 MB",
      "compression_ratio": 0.85
    },
    "advanced_metrics": {
      "prefetch_accuracy": 0.789,
      "ttl_adjustment_rate": 0.156,
      "weakmap_protection": 0.923,
      "eviction_efficiency": 0.867
    }
  },
  "region_stats": {
    "SCHEMA": {
      "entries_count": 45,
      "max_entries": 128,
      "hit_rate": 0.956,
      "memory_usage": "2.3 MB",
      "avg_access_time": "0.03ms",
      "prefetch_count": 23,
      "ttl_extensions": 156
    },
    "TABLE_EXISTS": {
      "entries_count": 78,
      "max_entries": 64,
      "hit_rate": 0.912,
      "avg_lookup_time": "0.05ms",
      "weakmap_protected": true
    },
    "INDEX": {
      "entries_count": 23,
      "max_entries": 64,
      "hit_rate": 0.885,
      "last_refresh": "2025-09-03T08:26:00Z",
      "warm_up_time": "45ms"
    }
  }
}
```

### ⚡ 企业级缓存优化特性

#### 缓存预热系统
- **智能预加载**: 基于历史访问模式的最优预加载策略
- **优先级加载**: 高价值数据优先加载，提供即时性能提升
- **后台处理**: 非阻塞预热操作，不影响系统启动时间
- **进度监控**: 实时进度跟踪，支持完成回调机制

#### 高级内存管理
- **WeakMap集成**: 自动内存泄漏防护，使用WeakMap/WeakRef
- **引用跟踪**: 智能引用计数机制实现缓存条目管理
- **自动清理**: 零配置内存管理，自动资源释放
- **内存压力响应**: 基于系统内存状态的动态调整

#### 性能优化
- **预取智能**: 机器学习驱动的预取预测算法
- **TTL自适应**: 基于访问模式的动态TTL调整
- **批量操作**: 针对高吞吐量场景的优化批量操作
- **压缩支持**: 内存受限环境的可选数据压缩功能

### 🔍 高级缓存管理工具

#### 缓存分析与优化
```typescript
// 获取详细缓存分析
const analysis = cache.getDetailedAnalysis();

// 分析访问模式
const patterns = cache.analyzeAccessPatterns();

// 获取优化建议
const recommendations = cache.getOptimizationRecommendations();

// 执行智能清理
const cleanupResult = cache.performIntelligentCleanup();
```

#### 内存压力集成
```typescript
// 订阅内存压力变化
memoryPressureManager.subscribe((pressure: number) => {
  cache.adjustForPressure(pressure);
});

// 获取缓存健康状态
const health = cache.getHealthStatus();
console.log(`缓存健康度: ${health.score}/100`);
```

### 🛠️ 缓存配置示例

#### 高性能配置
```bash
# 高性能环境的环境变量配置
SMART_CACHE_L1_SIZE=256
SMART_CACHE_L2_SIZE=128
CACHE_TTL_BASE=600
CACHE_TTL_MAX=3600
PREFETCH_ENABLED=true
PREFETCH_THRESHOLD=0.7
TTL_DYNAMIC_ADJUSTMENT=true
WEAKMAP_PROTECTION=true
```

#### 内存受限配置
```bash
# 内存受限环境的环境变量配置
SMART_CACHE_L1_SIZE=64
SMART_CACHE_L2_SIZE=32
CACHE_TTL_BASE=300
CACHE_COMPRESSION=true
COMPRESSION_LEVEL=6
AGGRESSIVE_EVICTION=true
WEAKMAP_PROTECTION=true
```

这个高级缓存架构提供企业级的性能、智能的内存管理和全面的监控能力，确保数据库操作的最佳效率。

## 安全特性

### 🔒 多层安全架构

#### 输入验证与清洗
- **空字节过滤**: 防止空字节注入攻击
- **长度验证**: 可配置的最大查询长度（默认：10000字符）
- **字符编码**: UTF-8验证和清洗
- **参数绑定**: 所有查询使用预处理语句
- **可配置安全级别**: 三级验证（STRICT/MODERATE/BASIC）

#### 🛡️ 高级SQL注入检测（20+模式）
系统实现了全面的SQL注入检测，包含20多种具体的模式，支持实时威胁分析：

**危险操作检测（6种模式）：**
- 文件系统访问尝试（LOAD_FILE、INTO OUTFILE、INTO DUMPFILE）
- 命令执行尝试（SYSTEM、EXEC、SHELL、xp_cmdshell）
- 信息泄露（UNION SELECT with INFORMATION_SCHEMA）
- 带破坏性操作的堆叠查询（DROP、DELETE、TRUNCATE、ALTER）
- 基于时间的攻击和DoS尝试（BENCHMARK、SLEEP、WAITFOR）
- 系统变量访问（@@version、@@datadir、@@basedir、@@tmpdir）

**SQL注入模式检测（15+种模式）：**
- 基本的OR/AND注入（带引号和比较操作符）
- 联合查询注入（UNION SELECT变体）
- 认证绕过模式（' OR '1'='1、" OR "1"="1）
- 基于注释的规避（--、/* */、#）
- 时间延迟攻击（SLEEP、BENCHMARK、WAITFOR、pg_sleep、dbms_pipe.receive_message）
- 基于错误的注入（CAST、CONVERT、EXTRACTVALUE、UPDATEXML）
- 数学错误注入（EXP、POW与位运算）
- 堆叠查询注入（; SELECT、; INSERT等）
- 函数调用注入（CHAR、ASCII、ORD、HEX、UNHEX、CONCAT、GROUP_CONCAT）
- 系统信息收集（USER、VERSION、DATABASE、SCHEMA函数）
- 逻辑运算符绕过（||、&&、^^）
- 经典注入模式（带数字、字符串和NULL值）
- 增强的危险操作和注入尝试检测

#### 🎯 多级安全验证
- **严格模式**: 最高安全性，阻止所有可疑模式（推荐用于生产环境）
- **中等模式**: 平衡安全性与生产力（默认设置）
- **基础模式**: 用于开发环境的最小验证

#### 🚨 实时威胁分析
```json
{
  "security_analysis": {
    "threat_level": "LOW",
    "detected_patterns": [],
    "risk_score": 0.1,
    "recommendations": [
      "输入验证通过了所有安全检查"
    ],
    "blocked_attempts": 0,
    "validation_time": "0.8ms"
  }
}
```

#### 🔐 全面安全功能
- **速率限制**: 自适应令牌桶算法，支持系统负载感知（60秒窗口，默认100请求/分钟）
- **查询类型限制**: 基于白名单的查询类型过滤，支持可配置的允许类型
- **结果集限制**: 防止通过大结果集进行数据泄露（默认1000行）
- **凭据保护**: 日志和诊断中自动脱敏
- **审计追踪**: 安全事件的全面记录，支持脱敏输出
- **连接安全**: 支持SSL/TLS和证书验证
- **查询超时保护**: 可配置的查询执行超时，防止资源耗尽
- **危险操作检测**: 增强的DROP、DELETE、UPDATE操作检测（无WHERE子句）
- **模式检测**: 实时威胁检测，支持风险评估和恢复建议

## 内存管理

### 🧠 企业级内存管理系统
系统实现了全面的内存管理解决方案，集成了多种内存优化技术和智能监控功能，支持自动检测和优化内存使用模式：

#### 内存监控核心功能
- **实时多维度监控**: 全面跟踪RSS、堆内存、外部内存使用情况，提供高精度实时监控
- **智能泄漏检测**: 采用线性回归算法的先进趋势分析，自动识别内存泄漏模式和异常增长趋势
- **动态压力评估**: 基于0-1范围的智能压力级别计算，支持多阈值优化触发机制
- **垃圾回收统计**: 详细跟踪GC事件统计、内存释放量和时间戳，支持性能分析
- **历史数据存储**: 可配置的历史内存数据保留，支持趋势分析和预测
- **自动泄漏怀疑识别**: 基于机器学习算法的实时内存泄漏检测，提供智能告警
- **综合指标体系**: 集成的多指标监控面板，覆盖所有关键内存参数

#### 内存优化工具集
- **mysql_optimize_memory工具**: 企业级内存优化集成，支持状态查看、清理优化、配置管理和详细报告
- **智能垃圾回收**: 支持强制GC执行，结合内存压力感知的自动触发机制
- **压力自适应调整**: 基于使用模式的动态内存调整算法，优化缓存和资源分配
- **内存清理策略**: 全面的内存清理机制，包括缓存清理、连接释放和资源回收
- **性能影响评估**: 前后对比分析，提供内存优化效果的详细统计报告

#### 内存安全防护机制
- **高内存压力告警**: 支持结构化告警回调的多级内存压力检测系统
- **自动优化防护**: 内存压力下的自动防护机制，防止内存溢出和系统崩溃
- **异常检测反馈**: 实时内存异常检测，实现快速定位和修复
- **历史趋势分析**: 基于历史数据的内存使用趋势预测和优化建议

#### 内存管理架构特性
- **无缝系统集成**: 与系统诊断和性能监控深度集成，提供统一监控界面
- **释放嫌疑检测**: 基于统计分析的内存释放模式检测和优化建议
- **缓存协同优化**: 与三级缓存系统协同工作，实现内存使用最优化
- **连接池内存管理**: 智能连接池内存管理，防止连接对象内存泄漏
- **垃圾回收调度**: 基于系统负载的智能GC调度算法，平衡性能和内存使用

### 📊 内存分析示例
```json
{
  "memory_analysis": {
    "current_stats": {
      "heap_used": "45.2 MB",
      "heap_total": "64.0 MB",
      "rss": "85.7 MB",
      "external": "2.1 MB",
      "peak_heap": "52.1 MB",
      "average_heap": "42.8 MB",
      "trend": "stable"
    },
    "optimization": {
      "canOptimize": true,
      "potentialSavings": "3.2 MB",
      "lastOptimization": 1623456789000,
      "recommendedAction": "内存使用稳定，无需立即操作"
    },
    "gc_stats": {
      "triggered": 5,
      "last_gc": "2023-06-15T10:30:45.123Z",
      "total_freed": "12.5 MB",
      "last_gc_freed": "2.3 MB"
    },
    "pressure_level": 0.42,
    "leak_suspicions": 0,
    "historical_data_points": 100
  }
}
```

## 故障排除

### 🔧 常见问题解决

1.  **数据库连接失败**: `Error: connect ECONNREFUSED`
    - **解决方案**: 确认MySQL服务正在运行；检查 `.env` 文件中的 `MYSQL_HOST` 和 `MYSQL_PORT` 是否正确；检查防火墙设置。
    - **补充**: 确保MySQL接受来自您的主机的连接；验证 `.env` 文件中的凭据；检查MySQL错误日志获取详细信息。

2.  **缓存命中率低**:
    - **症状**: `mysql_system_status` 显示缓存 `hit_rate` 低于 60%。
    - **解决方案**: 适当增大 `SCHEMA_CACHE_SIZE` 等缓存相关环境变量的值；延长 `CACHE_TTL` 的时间。
    - **补充**: 使用 `mysql_system_status` 分析查询模式；考虑为频繁访问的表实现缓存预热策略。

3.  **连接池耗尽**: `Error: Pool is closed.` 或 `Error: Timeout acquiring connection`
    - **症状**: 应用在高并发下无响应或报错。
    - **解决方案**: 增大 `MYSQL_CONNECTION_LIMIT` 的值；检查代码中是否有未释放的连接（本项目已处理好）。
    - **补充**: 使用 `mysql_system_status` 监控连接池统计信息；检查查询超时设置；考虑为高频操作实现请求批处理。

4.  **频率限制触发**: `Error: Rate limit exceeded`
    - **解决方案**: 优化客户端调用逻辑，降低请求频率；适当增大 `RATE_LIMIT_MAX` 或 `RATE_LIMIT_WINDOW`。
    - **补充**: 在客户端应用程序中实现指数退避；使用批处理操作减少请求数量；考虑升级到更高性能的层级。

5.  **高内存使用**:
    - **症状**: Node.js进程消耗过多内存
    - **解决方案**: 使用 `mysql_optimize_memory` 工具触发垃圾回收；减少缓存大小；使用 `mysql_system_status` 监控内存趋势。
    - **补充**: 使用 `NODE_OPTIONS="--expose-gc"` 启用自动垃圾回收；检查缓存配置参数；实现内存压力监控。

6.  **慢查询性能**:
    - **症状**: 查询耗时超过预期，`mysql_system_status` 显示高平均查询时间。
    - **解决方案**: 使用 `mysql_system_status` 分析慢查询；为表添加适当的索引；优化查询结构。
    - **补充**: 检查MySQL慢查询日志；考虑查询结果缓存；为大数据集实现分页。

7.  **安全验证失败**:
    - **症状**: `Error: Query validation failed` 或被阻止的查询
    - **解决方案**: 根据安全规则检查查询模式；如果合适，调整安全级别（STRICT/MODERATE/BASIC）。
    - **补充**: 检查查询长度限制；验证允许的查询类型；检查诊断中的注入模式检测结果。

8.  **SSL连接问题**:
    - **症状**: `Error: SSL connection failed` 或证书验证错误
    - **解决方案**: 验证 `.env` 文件中的SSL配置；确保SSL证书有效且配置正确。
    - **补充**: 检查MySQL SSL设置；验证证书路径和权限；考虑在开发环境中使用 `MYSQL_SSL=false`。

### 诊断工具
- 使用 `mysql_system_status` 进行全面的系统健康分析
- 使用 `mysql_optimize_memory` 进行内存分析和优化
- 使用 `mysql_analyze_error` 进行智能错误诊断
- 使用 `mysql_progress_tracker` 监控异步操作进度
- 使用 `mysql_manage_queue` 管理任务队列状态
- 使用 `npx tsc --noEmit` 监控 TypeScript 编译错误

## 性能调优

### ⚡ 配置模板

三个预定义的配置模板：

#### 企业环境 (高并发)
- 高并发（50个连接，512缓存大小）

#### 中等规模应用 (平衡)
- 平衡（20个连接，128缓存大小）

#### 资源受限环境 (低内存)
- 低内存占用（5个连接，32缓存大小）

请参阅 `.env.example` 获取包含所有可用选项的完整配置示例。

## 开发指南

### 🏗️ 架构原则
1. **性能优先**: 所有设计决策优先考虑性能影响。
2. **安全第一**: 多层安全验证，永不信任用户输入。
3. **可观测性**: 全面的监控和诊断能力。
4. **配置驱动**: 通过环境变量实现灵活配置。
5. **优雅降级**: 缓存或监控等非核心功能失败不影响核心数据库操作。

### � 贡献指南

#### 开发环境命令
```bash
# 安装所有依赖
npm install

# 复制环境模板并配置
cp .env.example .env

# 编译和运行服务器
npm run build
npm start

# 或者使用 ts-node 直接运行进行开发
npm run dev

# 代码格式化和检查
npm run lint
npm run lint:fix

# 类型检查
npx tsc --noEmit

# 测试
npm test
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage

# 可选的性能依赖
# 启用垃圾回收监控 (使用 --expose-gc 标志运行)
node --expose-gc dist/index.js

# 用于增强调试的开发模式
npm run dev -- --expose-gc

# 替代方案: 设置环境变量用于内存监控
export NODE_OPTIONS="--expose-gc"
```

### TypeScript 最佳实践
- 启用严格类型检查，包括 `noImplicitAny` 和 `strictNullChecks`
- 使用 Zod 模式进行 MCP 工具参数的运行时验证
- 利用联合类型和类型守卫进行健壮的错误处理
- 使用 TypeScript 的 Promise 类型实现适当的 async/await 模式
- 为缓存实现和数据库结果处理使用泛型类型

### 错误处理
- **MySQLErrorClassifier**: 智能错误分类，附带上下文恢复建议和预防措施
- **ErrorHandler**: 安全错误转换，敏感信息屏蔽和安全事件记录
- MySQL 错误按错误代码分类，基于错误类别和严重性的智能重试逻辑
- 安全事件记录，输出已清理（凭据屏蔽）和结构化审计追踪
- 全面的诊断报告，包含可能的原因、恢复策略和预防措施
- 使用自定义 MySQLMCPError 类和结构化接口的类型安全错误处理
- 自动错误恢复，支持可配置回退策略

### 资源管理
- 连接池自动管理 MySQL 连接
- 在整个过程中使用适当的 async/await 模式进行清理
- 通过信号处理程序实现优雅关闭
- 退出时缓存清理和内存管理

### 线程安全
- 使用 async/await 模式进行基于事件循环的并发，实现非阻塞操作
- 使用 UUID 进行会话基础的并发操作跟踪
- 利用 JavaScript 的单线程特性与异步处理的无锁设计
- 对共享资源（缓存、指标、限速器）的原子操作
- 使用 setInterval/setTimeout 独立运行后台监控任务
- 具有线程安全访问模式的连接池管理

#### 日志和调试
要启用调试日志，请设置 LOG_LEVEL 环境变量:
```bash
# 在 .env 文件或环境中设置
LOG_LEVEL=DEBUG
```

在开发过程中实时查看日志:
```bash
# 在一个终端中运行服务器
npm run dev

# 在另一个终端中，如果记录到文件
# (注意: TypeScript 版本可能默认不记录到文件)
```

#### 贡献流程
- 遵循当前代码风格。
- 为新功能添加对应的单元测试或集成测试。
- 如果添加或修改了工具、配置，请更新本文档。
- 确保所有测试和代码检查通过后再提交拉取请求。

## 许可证

本项目采用 MIT 许可证。
</content>
</function>
