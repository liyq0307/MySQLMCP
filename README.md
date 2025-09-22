# MySQL MCP Server - TypeScript Version

This is a high-performance, enterprise-grade MySQL database operation server designed for the Model Context Protocol (MCP). Built on the FastMCP v2.0+ framework, it provides 29 professional database tools with three-level intelligent caching, dual-layer performance monitoring, enhanced connection pool management, RBAC permission control, and comprehensive security protection.

**🎯 Core Highlights:**
- **29 Professional Tools**: Covering database operations, backup management, system monitoring, security auditing, performance optimization, user management, advanced importing, and error recovery
- **Enterprise-level Security**: 20+ SQL injection detection patterns, multi-layer security verification, and threat analysis
- **Intelligent Performance**: Three-level LRU cache, dual-layer metrics collection, automatic memory optimization, and pressure-aware adjustments
- **Advanced Reliability**: Exponential backoff retry strategy, intelligent error classification, and automatic recovery suggestions
- **Complete Data Ecosystem**: Support for full, incremental, and large-file backups, multi-format data import/export, and progress tracking
- **Zero Configuration**: Environment variable driven, one-click deployment, and graceful degradation

The server is configured through environment variables. You can choose one of the following methods:
1. **Using .env file** (Recommended):
   - Copy `.env.example` to `.env`
   - Customize the values in `.env` according to your environment
   - The server will automatically load these values when starting
2. **Setting environment variables directly**:
   - Export variables in the shell before running the server
   - Set variables in the process manager or container configuration

## 🚀 Core Features

### ⚡ High-Performance Architecture
- **FastMCP Framework**: Built on FastMCP for superior performance and reliability.
- **Intelligent Cache System**: Multi-level LRU cache supporting TTL (Time To Live) and access statistics.
  - Table structure cache (`schemaCache`)
  - Table existence check cache (`tableExistsCache`)
  - Index information cache (`indexCache`)
- **Enhanced Connection Pool**: Based on `mysql2/promise`, using ConnectionPool class supporting pre-creation connections, health checks, auto-reconnect, and intelligent resource management.
- **Asynchronous Processing**: All database operations are asynchronous, making full use of Node.js event loop for high concurrency processing.

### 🧠 Advanced Features
- **Enhanced Retry Mechanism**: Implements SmartRetryStrategy for transient database errors (such as connection loss) using exponential backoff retry strategy with intelligent error classification and context-aware decisions.
- **Adaptive Rate Limiting**: Uses token bucket algorithm to dynamically adjust limits based on system load and automatic pressure relief.
- **Query Validation**: Strict validation of query types, lengths, and dangerous patterns, supporting configurable security levels (STRICT/MODERATE/BASIC).
- **Real-time Performance Monitoring**: Collects key indicators such as query time, cache hit rate, and error rate. Uses EnhancedMetrics and MetricsManager classes to provide time series analysis and trend detection.
- **Memory Monitoring and Optimization**: Uses MemoryMonitor class for advanced memory leak detection (using linear regression), automatic garbage collection, pressure-aware cache adjustment, and intelligent resource management.
- **Intelligent Error Classification**: Automatic error classification providing contextual recovery suggestions and preventive measures.
- **Task Queue Management**: Priority-based task scheduling supporting concurrency control and progress tracking.
- **Graceful Degradation**: Non-core functions (cache, monitoring) failure does not affect core database operations.

### 🛡️ Enterprise-level Security
- **Multi-layer Protection System**: Including SecurityValidator class for input validation, 20+ SQL injection pattern detection, dangerous statement scanning, and real-time threat analysis.
- **Secure Parameterized Queries**: All data modification operations default to prepared statements to fundamentally eliminate SQL injection.
- **Sensitive Information Protection**: Automatic masking of database passwords in diagnostic information.
- **Advanced SQL Injection Detection**: Comprehensive protection with 20+ SQL injection patterns.

### 🔧 Zero Configuration and Ease of Use
- **Constant Design**: All configuration items and fixed strings defined in `constants.ts` for improved code readability and maintainability.
- **Configuration Separation**: Database, security, and cache configurations centralized in `config.ts`.
- **Environment Variable Driven**: Fully supports configuration via environment variables for easy switching between development, testing, and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Installation Instructions](#installation-instructions)
- [Environment Variable Configuration](#environment-variable-configuration)
- [Claude Desktop Integration](#claude-desktop-integration)
- [Complete Tool Ecosystem (29 Professional Tools)](#🔧-complete-tool-ecosystem-29-professional-tools)
- [Usage Examples](#usage-examples)
- [Architecture Design](#architecture-design)
- [Performance Monitoring](#performance-monitoring)
- [Cache Strategy](#cache-strategy)
- [Security Features](#security-features)
- [Memory Management](#memory-management)
- [Troubleshooting](#troubleshooting)
- [Performance Tuning](#performance-tuning)
- [Development Guide](#development-guide)
- [License](#license)

## Quick Start

### 1. Environment Requirements
- Node.js v20.0.0 or higher
- npm v10.0.0 or higher
- MySQL 5.7 or higher (MySQL 8.0+ recommended)

### 2. Clone the Project
```bash
git clone https://github.com/your-username/mysql-mcp-server.git
cd mysql-mcp-server
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Configure Environment Variables
Copy the `.env.example` file and create a `.env` file:
```bash
cp .env.example .env
```
Then edit the `.env` file and fill in your database credentials.
```bash
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database
```

### 5. Compile and Run the Server
```bash
# Compile TypeScript code
npm run build

# Start the server
npm start
```

Alternatively for development:
```bash
# Run directly with ts-node for development
npm run dev
```

### 6. Verify Installation
After the server is running, you can use the system status tool to verify it is working properly:
```json
{
  "scope": "full",
  "includeDetails": true
}
```

## Installation Instructions

### System Requirements
- Node.js v20.0.0 or higher
- npm v10.0.0 or higher
- MySQL 5.7 or higher (MySQL 8.0+ recommended)
- Minimum 2GB RAM (4GB+ recommended for production)
- At least 500MB available disk space

### Core Dependencies
- `fastmcp`: Core MCP framework (v2.0+). High-performance model context protocol server implementation.
- `mysql2`: High-performance MySQL driver supporting connection pools and Promise API, supporting prepared statements.
- `zod`: Used for runtime type safety and validation of tool parameters.
- `dotenv`: Used to load environment variables from `.env` files, supporting secure configuration management.

### Development Dependencies
- `typescript`: TypeScript language compiler with strict type checking.
- `ts-node`: Tool to run TypeScript code directly without compilation.
- `eslint`: Used for code style and quality checks with custom rules.
- `jest`: Framework for unit and integration testing with code coverage analysis.
- `@types/node`: TypeScript definitions for Node.js API.
- `@types/jest`: TypeScript definitions for Jest testing framework.

### Optional Performance Dependencies
For enhanced performance monitoring and system analysis:
- Node.js with `--expose-gc` flag for garbage collection monitoring
- System monitoring tools for CPU and memory analysis
- SSL/TLS certificates for secure connections

## Environment Variable Configuration

### 🔗 Database Connection Configuration
| Environment Variable | Description | Default Value |
|---|---|---|
| `MYSQL_HOST` | Database host address | `localhost` |
| `MYSQL_PORT` | Database port | `3306` |
| `MYSQL_USER` | Database username | `root` |
| `MYSQL_PASSWORD` | Database password | `""` |
| `MYSQL_DATABASE` | Database name | `test` |
| `MYSQL_CONNECTION_LIMIT` | Maximum connections in pool | `20` |
| `MYSQL_CONNECT_TIMEOUT` | Connection timeout (ms) | `60000` |
| `MYSQL_IDLE_TIMEOUT` | Idle connection timeout (ms) | `300000` |
| `MYSQL_SSL` | Enable SSL connection | `false` |
| `MYSQL_CHARSET` | Database character set | `utf8mb4` |
| `MYSQL_TIMEZONE` | Database timezone | `+00:00` |
| `QUERY_TIMEOUT` | Query execution timeout (ms) | `30000` |

### 🛡️ Security Configuration
| Environment Variable | Description | Default Value |
|---|---|---|
| `SECURITY_MAX_QUERY_LENGTH` | Maximum query length (characters) | `10000` |
| `SECURITY_MAX_INPUT_LENGTH` | Maximum input length (characters) | `1000` |
| `SECURITY_MAX_TABLE_NAME_LENGTH` | Maximum table name length (characters) | `64` |
| `SECURITY_ALLOWED_QUERY_TYPES` | Allowed query types (comma-separated) | `SELECT,INSERT,UPDATE,DELETE,SHOW,DESCRIBE,EXPLAIN,CREATE,DROP,ALTER` |
| `SECURITY_ENABLE_QUERY_TYPE_RESTRICTIONS` | Enable query type restrictions | `true` |
| `SECURITY_MAX_RESULT_ROWS` | Maximum rows per query | `1000` |
| `SECURITY_QUERY_TIMEOUT` | Query execution timeout (ms) | `30000` |
| `RATE_LIMIT_MAX` | Maximum requests per window | `100` |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | `60000` |
| `RATE_LIMIT_ENABLED` | Enable rate limiting | `true` |

### ⚡ Performance Configuration
| Environment Variable | Description | Default Value |
|---|---|---|
| `SCHEMA_CACHE_SIZE` | Schema cache size | `128` |
| `TABLE_EXISTS_CACHE_SIZE` | Table existence cache size | `64` |
| `INDEX_CACHE_SIZE` | Index information cache size | `64` |
| `CACHE_TTL` | Cache expiration time (seconds) | `300` |
| `BATCH_SIZE` | Batch operation size | `1000` |
| `MONITORING_ENABLED` | Enable performance monitoring | `true` |
| `MONITORING_SNAPSHOT_INTERVAL` | Performance snapshot interval (ms) | `30000` |
| `MONITORING_HISTORY_SIZE` | Metrics history size | `1000` |
| `MONITORING_SLOW_QUERY_THRESHOLD` | Slow query threshold (ms) | `1000` |
| `MEMORY_MONITORING_ENABLED` | Enable memory monitoring | `true` |
| `MEMORY_MONITORING_INTERVAL` | Memory monitoring interval (ms) | `30000` |
| `MEMORY_HISTORY_SIZE` | Memory history size | `100` |
| `MEMORY_PRESSURE_THRESHOLD` | Memory pressure threshold (0-1) | `0.8` |
| `MEMORY_CACHE_CLEAR_THRESHOLD` | Memory cache clear threshold (0-1) | `0.85` |
| `MEMORY_AUTO_GC` | Enable automatic garbage collection | `true` |
| `SYSTEM_MONITORING_INTERVAL` | System monitoring interval (ms) | `30000` |

### 🖥️ Server Configuration
| Environment Variable | Description | Default Value |
|---|---|---|
| `SERVER_NAME` | Server name | `MySQL-MCP-Server` |
| `SERVER_VERSION` | Server version | `1.0.0` |
| `NODE_ENV` | Node environment (development, production, test) | `development` |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | `info` |
| `DEBUG` | Enable debug mode | `false` |
| `MCP_TRANSPORT` | MCP transport protocol | `stdio` |

## Claude Desktop Integration

To add this server to your Claude Desktop configuration, edit your `claude_desktop_config.json` file.

### Basic Configuration Example
```json
{
  "mcpServers": {
    "mysql-mcp-ts": {
      "command": "node",
      "args": ["/path/to/your/MySQL_MCP_TS/dist/index.js"], // Absolute path to compiled JS file
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

### High-Performance Production Environment Configuration
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

## 🔧 Complete Tool Ecosystem (29 Professional Tools)

This system provides 29 professional-level database tools covering all enterprise application needs:

### 📊 Core Database Operations (7 Tools)

#### `mysql_query`
Executes raw SQL queries with comprehensive validation and security checks. Supports parameterized queries for security.
Supports SELECT, SHOW, DESCRIBE, INSERT, UPDATE, DELETE, CREATE, DROP, and ALTER operations.
**Examples:**
##### Simple SELECT query
```json
{
  "query": "SELECT * FROM users LIMIT 10",
}
```
##### Secure parameterized query
```json
{
  "query": "SELECT * FROM users WHERE id = ? AND status = ?",
  "params": [123, "active"]
}
```

#### `mysql_show_tables`
Lists all tables in the current database with intelligent caching.
Results are cached to optimize performance, improving response speed for frequent queries.
Provides a quick overview of database architecture, supporting development and operational scenarios.
**Example:**
```json
{}
```

#### `mysql_describe_table`
Retrieves the complete structure of a specified table, including columns, data types, constraints, indexes, and other metadata.
Supports DESCRIBE and INFORMATION_SCHEMA queries.
**Example:**
```json
{
  "table_name": "users"
}
```

#### `mysql_select_data`
Queries data from tables with optional filtering, column selection, and row limits.
Provides flexible query building with complete SQL injection protection and performance optimizations.
Supports advanced features like conditional queries, pagination, and result caching.
**Examples:**
##### Query all data from table
```json
{
  "table_name": "products",
}
```
##### Query specific columns with filtering and limiting
```json
{
  "table_name": "users",
  "columns": ["id", "name", "email"],
  "where_clause": "status = 'active'",
  "limit": 50,
  "order_by": "price DESC"
}
```
##### Complex conditional query
```json
{
  "table_name": "orders",
  "columns": ["order_id", "customer_id", "total_amount"],
  "where_clause": "created_at >= '2024-01-01' AND status IN ('pending', 'processing')",
  "limit": 100
}
```

#### `mysql_insert_data`
Inserts new data into tables safely using parameterized queries, ensuring data integrity and security.
Automatically validates all input data using prepared statements to prevent SQL injection attacks.
Supports single-row and bulk data insertion with transaction safety guarantees.
**Example:**
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
Updates existing data in tables based on specified conditions, ensuring security and consistency of data modifications.
Provides complete input validation with WHERE clause validation, prepared statements, and transaction safety guarantees.
Supports conditional updates and bulk field modifications with detailed operational audit information.
**Example:**
```json
{
  "table_name": "users",
  "data": { "status": "inactive", "updated_at": "2024-01-01" },
  "where_clause": "id = ?",
  "params": [123]
}
```

#### `mysql_delete_data`
Safely deletes data from tables based on specified conditions, ensuring accuracy and security of deletion operations.
Uses parameterized queries and WHERE clause validation to prevent accidental deletions and SQL injection attacks.
Supports conditional deletion operations with deletion confirmation and transaction safety guarantees.
**Example:**
```json
{
  "table_name": "users",
  "where_clause": "id = ?",
  "params": [123]
}
```

### ⚡ High-Performance Batch Operations (2 Tools)

#### `mysql_batch_execute`
Executes multiple SQL operations in a single transaction for atomicity. All queries must either all succeed or all rollback.
Especially suitable for complex business scenarios requiring multi-step operations like order processing, inventory management, etc. Provides complete parameter validation, performance monitoring, and error handling mechanisms to ensure security and reliability of batch operations.
**Examples:**
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
Efficiently inserts multiple rows of data into a table with transaction safety guarantees and performance optimizations.
Uses optimized bulk insert algorithms to reduce database round trips and improve insertion performance.
Automatically validates all data to ensure data integrity and security, and provides detailed performance metrics and insertion statistics for data import and bulk data processing scenarios.
**Example:**
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

### 🏗️ Database Schema Management (6 Tools)

#### `mysql_create_table`
Creates new database tables with specified column definitions and constraints for complete table structure definition.
Provides comprehensive security validation including table name validation, column definition validation to ensure database operation security.
Supports primary keys, auto-increment columns, defaults, etc., with batch column definitions and transaction safety guarantees.
Cache invalidation for related caches upon successful creation to ensure data consistency.
**Examples:**

##### Create a simple user table
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
##### Create with index specification
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
Safely deletes (drops) specified tables from the database with conditional deletion options and comprehensive security validation.
Provides IF EXISTS option to avoid errors when table doesn't exist, with transaction safety guarantees and automatic cache invalidation.
Strict security validation before deletion operations to ensure no important data is accidentally deleted.
Particularly suitable for table cleanup in development environments and table maintenance in production environments.
**Examples:**
##### Drop table
```json
{
  "table_name": "temp_table",
}
```
##### Safely drop table
```json
{
  "table_name": "temp_table",
  "if_exists": true
}
```

#### `mysql_get_schema`
Retrieves database schema information including tables, columns, constraints, indexes, and relationship mappings.
Provides complete database structure information for analysis, management, and documentation generation, supporting specific table queries.
Queries using INFORMATION_SCHEMA for efficient operations with cache optimization and performance monitoring.
**Examples:**
##### Get schema for entire database
```json
{}
```
##### Get schema for specific table
```json
{
  "table_name": "users"
}
```

#### `mysql_get_foreign_keys`
Retrieves foreign key constraint information for a specified table or all tables in the database, providing relationship mappings and referential integrity constraint details.
Queries using INFORMATION_SCHEMA.KEY_COLUMN_USAGE for efficient operations with support for specific table queries and global relationship analysis.
Helps understand table relationships in database architecture, supporting database design optimization and data integrity maintenance.
Provides detailed information about foreign key constraints including local columns, referenced tables, referenced columns, and constraint names.
**Example:**
```json
{
  "table_name": "orders"
}
```

#### `mysql_alter_table`
Modifies the structure of existing tables supporting advanced operations such as adding, modifying, deleting columns, indexes, and constraints.
Provides comprehensive security validation, transaction safety guarantees, and intelligent error handling mechanisms.
Supports batch processing of multiple modifications to improve database schema management efficiency and security.
Includes performance monitoring and automatic cache invalidation to ensure data consistency after modifications.
**Example:**
```json
{
  "table_name": "users",
  "alterations": [
    { "type": "ADD_COLUMN", "column": { "name": "age", "type": "INT", "nullable": true } }
  ]
}
```

#### `mysql_performance_optimize`
Performance optimization tool providing enterprise-level MySQL performance optimization solutions.
Integrated with slow query analysis, index optimization suggestions, and comprehensive report generation.
Supports intelligent query pattern analysis, bottleneck identification, optimization suggestion generation, and detailed performance reports.
Suitable for database administrators to perform performance tuning, query optimization, and system monitoring.

**Action Types:**
- **analyze_slow_queries**: Analyze slow query logs
- **suggest_indexes**: Generate index optimization suggestions
- **performance_report**: Generate comprehensive performance reports
- **query_profiling**: Perform performance profiling on specific queries

**Examples:**
```json
// Enable slow query log
{
  "action": "enable_slow_query_log",
  "longQueryTime": 2,
  "logQueriesNotUsingIndexes": true
}

// Analyze slow queries
{
  "action": "analyze_slow_queries",
  "limit": 10,
  "include_details": true
}

// Generate comprehensive performance report
{
  "action": "suggest_indexes",
  "time_range": "1 week"
}

// Performance profiling on specific query
{
  "action": "query_profiling",
  "query": "SELECT * FROM users WHERE email = ? AND status = ?",
  "params": ["user@example.com", "active"],
  "include_details": true
}
```

### 💾 Data Backup and Export (5 Tools)

#### `mysql_backup`
Database backup supporting multiple backup strategies and advanced features.
Provides full backups, incremental backups, and large-file backups to meet different scenario needs.
Integrated with progress tracking, error recovery, queue management, and other advanced features to ensure backup process reliability and observability.
Supports intelligent compression, data verification, multiple enterprise-level characteristics of backup recovery.

**Examples:**
##### Full backup of all tables
```json
{
  "outputDir": "/backup",
  "compress": true,
  "includeData": true,
  "includeStructure": true,
  "filePrefix": "daily_backup"
}
```
##### Backup only table structure
```json
{
  "includeData": false,
  "includeStructure": true,
  "tables": ["users", "products", "orders"],
  "filePrefix": "schema_only"
}
```
##### Incremental backup (timestamp-based)
```json
{
  "backupType": "incremental",
  "incrementalMode": "timestamp",
  "lastBackupTime": "2024-01-15T00:00:00Z",
  "trackingTable": "__backup_tracking",
  "filePrefix": "incremental_backup"
}
```
##### Large-file backup (for large datasets)
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
##### Backup with progress tracking
```json
{
  "withProgress": true,
  "priority": 5,
  "useQueue": true,
  "filePrefix": "progress_tracked_backup"
}
```
##### High-reliability backup (with error recovery)
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
Verifies integrity and validity of backup files to ensure backup data reliability.
Provides comprehensive backup verification including file format checks, data integrity validation, metadata validation, etc.
Supports multiple verification levels and detailed verification reports to help ensure reliability of backup data.
Integrated with intelligent verification algorithms that can detect data corruption, format errors, and potential recovery issues.

**Examples:**
##### Basic backup verification
```json
{
  "backupFilePath": "/backup/mysql_backup_2024.sql"
}
```
##### Deep verification (comprehensive check)
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
##### Fast structure verification
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
##### Production environment verification (balance speed and accuracy)
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
##### Large-file verification (optimize memory usage)
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
Exports query results in multiple formats (Excel, CSV, JSON) with advanced features: error recovery, real-time progress tracking, and queue management.
Integrated with enterprise-level characteristics such as comprehensive data export solutions.
Supports large-scale data export, memory optimization, multiple format conversions, and detailed export statistics.
Particularly suitable for data analysis, report generation, and data migration scenarios.

Main Features:
- **Multi-format support**: Excel (.xlsx), CSV (.csv), JSON (.json)
- **Advanced export options**: Custom filenames, worksheet names, include headers, etc.
- **Error recovery mechanisms**: Automatic retries, fallback strategies, detailed error diagnostics
- **Progress tracking**: Real-time progress updates, cancellation support, detailed statistics
- **Queue management**: Asynchronous execution, priority scheduling, concurrency control
- **Memory optimization**: Streaming processing, large file chunking, memory usage monitoring
- **Enterprise features**: Detailed logging, performance metrics, operation auditing

**Examples:**
##### Basic data export (Excel format)
```json
{
  "query": "SELECT id, name, email, created_at FROM users WHERE status = ?",
  "params": ["active"]
}
```
##### Export to CSV format (large data optimization)
```json
{
  "query": "SELECT * FROM orders WHERE order_date >= ?",
  "params": ["2024-01-01"],
  "format": "csv",
  "maxRows": 500000,
  "fileName": "orders_2024"
}
```
##### JSON format export (API data preparation)
```json
{
  "query": "SELECT product_id, name, price, inventory FROM products",
  "format": "json",
  "includeHeaders": false,
  "outputDir": "/api/data"
}
```
##### Export with progress tracking
```json
{
  "query": "SELECT * FROM large_dataset",
  "withProgress": true,
  "enableCancellation": true,
  "maxRows": 1000000
}
```
##### Asynchronous queue export (high concurrency scenario)
```json
{
  "query": "SELECT * FROM analytics_data",
  "useQueue": true,
  "priority": 5,
  "immediateReturn": true,
  "fileName": "analytics_report"
}
```
##### High-reliability export (with error recovery)
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
##### Custom Excel export (multi-sheet style)
```json
{
  "query": "SELECT customer_id, order_total, order_date FROM customer_orders",
  "format": "excel",
  "sheetName": "CustomerOrders",
  "includeHeaders": true,
  "fileName": "customer_analysis_Q1"
}
```
##### Enterprise-level large data export
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
Enterprise-level data import solution supporting multiple file formats (CSV, JSON, Excel, SQL) with advanced validation, mapping, and error handling.
Integrated with a complete import ecosystem including intelligent data validation, field mapping, transaction management, and performance monitoring.

Main Features:
  - **Multi-format support**: CSV (custom delimiters), JSON (with nested data), Excel (multi-sheets), SQL scripts
  - **Intelligent validation**: Type checking, constraint validation, duplication detection, data integrity assurance
  - **Field mapping**: Automatic mapping and manual configuration, supporting complex data structure transformations
  - **Transaction control**: Single-row and batch transaction modes, ensuring data consistency and ACID properties
  - **Error handling**: Detailed error diagnostics, classified error reports, automatic error recovery
  - **Batch optimization**: Memory chunking processing, large file batch writing, performance monitoring
  - **Duplication handling**: Intelligent duplication detection, supporting skip, update, and error handling strategies
  - **Progress tracking**: Real-time import progress, performance statistics, estimated completion time

Application Scenarios:
  - **Enterprise data migration**: Large-scale data migration, heterogeneous system data synchronization
  - **ETL processes**: Data warehouse loading, incremental/full data updates
  - **System integration**: Importing data from third-party systems, enterprise application data exchange
  - **Business processing**: User data import, product catalog updates, order bulk processing
  - **Development environment**: Test data import, development environment data initialization

**Examples:**

##### Single transaction mode - Complete ACID guarantee
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
##### Batch transaction mode - Batch-level atomicity
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

##### Excel format smart import
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
##### Import SQL file - Transaction security
```json
{
  "table_name": "backup_data",
  "file_path": "/data/backup.sql",
  "format": "sql",
  "use_transaction": true,  // SQL statements executed in batch within one transaction
  "with_recovery": true
}
```

#### `mysql_generate_report`
Data report generation, executing multiple queries and generating comprehensive data reports.
Integrated with Excel file generation with multiple worksheets, custom report formats, performance metrics integration, etc.
Particularly suitable for business analysis, market research, operational monitoring, and financial reports.
Provides a one-stop service from data queries to formatted output for complete report lifecycle management.

Main Features:
  - **Multi-query integration**: Supports simultaneous execution of multiple related queries, automatic result integration
  - **Multi-format support**: Excel (multi-worksheet), CSV, JSON formats*
  - **Performance monitoring**: Built-in query performance statistics and optimization suggestions
  - **Intelligent layout**: Automatic optimization of report structure and data display
  - **Enterprise features**: Detailed logging, error recovery, operation auditing
  - **Cache optimization**: Query result intelligent caching to improve efficiency of repeated report generation

Application Scenarios
  - **Integrated business reports**: Sales data, market analysis, user behavior, etc.
  - **Financial analysis reports**: Income and expenditure, cost analysis, budget execution, etc.
  - **Operational monitoring reports**: System status, performance indicators, error statistics, etc.
  - **Management decision reports**: KPI indicators, trend analysis, prediction data, etc.

**Example:**

```json
{
  "title": "Monthly Sales Report",
  "queries": [
    {
      "name": "Sales Overview",
      "query": "SELECT SUM(amount) FROM sales WHERE month = ?",
      "params": ["2023-12"]
    }
  ],
  "includeHeaders": true,
  "fileName": "monthly_sales_report"
}
```

### 🛠️ System Management and Monitoring (8 Tools)

#### `mysql_system_status`
Comprehensive system diagnostics providing comprehensive MySQL database server health checks and performance monitoring.
Integrated with connection status diagnostics, export operation monitoring, queue management status, system resource monitoring, etc. for full monitoring capabilities.
Supports hierarchical diagnosis (full/comprehensive, connection/connection, export/export, queue/queue, memory/memory) and detailed diagnostic information display.
Provides intelligent health assessment, performance metrics analysis, trend prediction, and optimization suggestions.

Main Features:
- **Hierarchical Diagnosis**: Supports full/comprehensive (full diagnosis of all components and system status), connection/connection (focus on database connection and performance indicators), export/export (monitoring export operation status and queue conditions), queue/queue (analysis of task queue status and concurrency control), memory/memory (assessment of system memory usage and GC status) five diagnostic ranges
- **Connection Monitoring**: Database connection pool status, connection testing, performance indicators, configuration information
- **Export Monitoring**: Active export tasks, queue status, completion history, performance statistics
- **Queue Monitoring**: Task queue status, concurrency control, failure task analysis, diagnostic information
- **Memory Monitoring**: System memory usage, GC status, memory leak detection, pressure analysis
- **Health Assessment**: Overall health status assessment, problem identification, optimization suggestion generation

Application Scenarios:
- **Daily Operational Monitoring**: Regular checks of system health status
- **Fault Troubleshooting**: Quick identification of system bottlenecks and problems
- **Performance Tuning**: Analysis of performance indicators, formulation of optimization strategies
- **Capacity Planning**: Monitoring resource usage trends, predicting capacity needs
- **Automated Monitoring**: Integration into monitoring systems for automatic alerting

**Examples:**
Complete system diagnosis (recommended for daily use)
```json
{
  "scope": "full",
  "includeDetails": true
}
```
Connection status check (database connection problem troubleshooting)
```json
{
  "scope": "connection",
  "includeDetails": false
}
```
Export operation monitoring (export task status viewing)
```json
{
  "scope": "export",
  "includeDetails": true
}
```
Queue status analysis (task queue performance tuning)
```json
{
  "scope": "queue",
  "includeDetails": true
}
```
Memory usage assessment (memory leak detection)
```json
{
  "scope": "memory",
  "includeDetails": true
}
```
Quick health check (operational monitoring)
```json
{
  "scope": "full",
  "includeDetails": false
}
```
Detailed system analysis (fault troubleshooting)
```json
{
  "scope": "full",
  "includeDetails": true
}
```
Performance monitoring integration (automated monitoring)
```json
{
  "scope": "connection",
  "includeDetails": true
}
```

#### `mysql_analyze_error`
Smart error diagnostics that deeply analyze database errors and provide accurate recovery strategies.
Integrated with error classification, context awareness, automatic diagnostics, recovery suggestion generation, etc. for comprehensive error handling capabilities.
Supports multiple error types such as syntax errors, connection problems, permission errors, constraint conflicts, etc., with intelligent identification and handling.

Main Features:
- **Smart Error Classification**: Automatic identification of error types (syntax/connection/permission/constraints/performance, etc.)
- **Context-aware Analysis**: Provides targeted diagnostic suggestions based on operation context
- **Automatic Diagnostic Engine**: Deep analysis of error root causes, providing multi-level diagnostic information
- **Recovery Strategy Generation**: Generates specific repair steps and preventive measures based on error types
- **Security Enhancement**: Error information desensitization processing to prevent sensitive information leakage
- **Learning System**: Continuous learning of common error patterns to improve diagnostic accuracy

Diagnostic Scope:
- **Syntax Errors**: SQL syntax errors, keyword misspellings, statement structure issues
- **Connection Errors**: Network connections, authentication failures, connection pool issues, timeout issues
- **Permission Errors**: Access denials, insufficient permissions, non-existent users
- **Constraint Errors**: Primary key conflicts, foreign key constraints, unique constraints, data type mismatches
- **Performance Errors**: Query timeouts, deadlocks, resource shortages
- **Other Errors**: General processing for unknown error types and suggestions

Application Scenarios:
- **Development Debugging**: Quickly locate SQL syntax errors and logical issues
- **Production Operations**: Quickly diagnose database connections and permission issues
- **Data Migration**: Identify and resolve errors in data import/export processes
- **Performance Tuning**: Analyze query performance issues and timeouts
- **Security Auditing**: Detect and analyze security-related database errors

**Examples:**
##### Analyze connection access denial error
 ```json 
{
  "error_message": "Access denied for user 'root'@'localhost' (using password: YES)",
  "operation": "connection"
}
```
##### Analyze SQL syntax error
 ```json
{
  "error_message": "You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near 'SELEC * FROM users' at line 1",
  "operation": "query"
}
```
##### Analyze foreign key constraint conflict
 ```json
{
  "error_message": "Cannot delete or update a parent row: a foreign key constraint fails (`shop`.`orders`, CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`))",
  "operation": "dml"
}
```
##### Analyze table not exists error
 ```json
{
  "error_message": "Table 'database.users' doesn't exist",
  "operation": "query"
}
```
##### Analyze duplicate key error
 ```json
{
  "error_message": "Duplicate entry 'john@example.com' for key 'email'",
  "operation": "dml"
}
```
##### Analyze insufficient permissions error
 ```json
{
  "error_message": "SELECT command denied to user 'readonly'@'localhost' for table 'sensitive_data'",
  "operation": "security"
}
```
##### Analyze query timeout error
 ```json
{
  "error_message": "Query execution was interrupted, maximum statement execution time exceeded",
  "operation": "query"
}
```
##### Analyze deadlock error
 ```json
{
  "error_message": "Lock wait timeout exceeded; try restarting transaction",
  "operation": "dml"
}
```
##### Analyze data type mismatch error
 ```json
{
  "error_message": "Incorrect integer value: 'abc' for column 'user_id' at row 1",
  "operation": "dml"
}
```

#### `mysql_security_audit`
Database security audit that performs comprehensive security assessments and generates compliance reports.
Integrated with configuration security analysis, user permission auditing, data protection assessment, security threat detection, etc. for comprehensive security diagnostic capabilities.
Supports multiple security standard compliance checks to help enterprises identify security risks and formulate security hardening strategies.

Main Features:
- **Configuration Security Audit**: Checks database configuration security settings and best practices
- **User Permission Audit**: Analyzes user roles, permission assignments, and principle of least privilege implementation
- **Data Protection Assessment**: Evaluates sensitive data protection measures and encryption mechanisms
- **Security Threat Detection**: Identifies potential security vulnerabilities and attack vectors
- **Compliance Checks**: Supports SOX, GDPR, PCI-DSS, etc. security compliance assessments
- **Risk Scoring System**: Provides security risk quantitative scoring and priority sorting
- **Remediation Suggestions Generation**: Based on audit results, provides specific repair steps and security hardening suggestions

Audit Scope:
- **Database Configuration Security**: Connection limits, timeout settings, security protocols, log configuration
- **User Account Security**: Password policies, account locking, expiration policies, permission minimization
- **Access Control Security**: Role definitions, permission allocation, audit logs, access patterns
- **Data Protection Security**: Encryption mechanisms, sensitive data identification, data desensitization, backup security
- **Network Security**: Connection security, firewall configuration, intrusion detection
- **Compliance Assessment**: Industry standard conformity, multi-framework comparative analysis

Application Scenarios:
- **Security Baseline Assessment**: Regular security status assessments to establish security baselines
- **Compliance Auditing**: Meet regulatory requirements, conduct compliance checks and reports
- **Security Incident Response**: Comprehensive security assessments after security events occur
- **Third-party Auditing**: Provide detailed security reports for external auditors
- **Security Optimization**: Identify security weak points and formulate improvement measures
- **Penetration Testing Post-assessment**: Evaluate security problems found through penetration testing

**Example:**
```json
{}
```

#### `mysql_progress_tracker`
Asynchronous operation progress tracking that uniformly manages and monitors the execution status of all background tasks.
Integrated with real-time progress updates, operation cancellation, detailed status queries, multi-operation types support, etc. for comprehensive progress management capabilities.
Supports progress visualization and control of long-running operations like backups and exports to enhance user experience and operation transparency.

Main Features:
- **Unified Progress Management**: Centralized management of all asynchronous operation progress status
- **Real-time Progress Updates**: Provides real-time execution progress and status information
- **Operation Cancellation Support**: Supports cancellation of ongoing operations (requiring operation support)
- **Detailed Status Queries**: Provides operation details, timestamps, and duration
- **Multi-operation Types**: Supports backup, export, and other operation types for progress tracking
- **Performance Indicators**: Provides operation performance statistics and time estimates
- **Batch Operations**: Supports simultaneous viewing of multiple operation progress status

Supported Operation Types:
- **backup**: Database backup operation progress tracking
- **export**: Data export operation progress tracking
- **all**: All operation type progress tracking (default)

Application Scenarios:
- **Backup Monitoring**: Real-time monitoring of database backup progress, timely discovery of issues
- **Export Tracking**: Tracking execution status of large data volume export operations
- **Batch Operation Management**: Management of multiple concurrent operation progress and status
- **Operational Monitoring**: Providing operation progress visualization for operations personnel
- **User Experience**: Providing real-time feedback of operation progress for users
- **Problem Diagnosis**: Quickly locating operation problems through progress information

**Examples:**
##### List basic progress information for all active operations
```json
{
  "action": "list"
}
```
##### View backup operation progress (detailed information)
```json
{
  "action": "list",
  "operationType": "backup",
  "detailLevel": "detailed"
}
```
##### Get detailed information for a specific operation
```json
{
  "action": "get",
  "trackerId": "backup_123456"
}
```
##### Cancel ongoing export operation
```json
{
  "action": "cancel",
  "trackerId": "export_789012"
}
```
##### Get progress summary statistics for all operations
```json
{
  "action": "summary"
}
```

#### `mysql_optimize_memory`
Memory management that integrates system-level memory optimization, backup operation memory control, garbage collection control, and detailed memory analysis functions.
Provides comprehensive memory pressure monitoring, intelligent garbage collection, memory leak detection, and performance optimization suggestions.

Main Features:
- **System-level Memory Monitoring**: Real-time monitoring of heap memory, RSS, and external memory usage
- **Intelligent Garbage Collection**: Supports forced GC execution, memory optimization, and efficiency analysis
- **Memory Pressure Management**: Automatic detection of memory pressure levels with optimization suggestions
- **Backup Operation Optimization**: Specialized optimization for backup task memory usage and management
- **Memory Leak Detection**: Continuous monitoring of memory usage trends to identify potential leaks
- **Concurrency Control Optimization**: Dynamic adjustment of task concurrency to balance performance and memory usage
- **Detailed Performance Reports**: Comprehensive memory usage history, trend analysis, and optimization suggestions

Supported Operations:
- **status**: View current memory status and system health
- **cleanup**: Perform basic memory cleanup, releasing resources from completed tasks
- **optimize**: Execute comprehensive memory optimization, including GC and cache cleanup
- **configure**: Configure memory monitoring and concurrency control parameters
- **report**: Generate detailed memory analysis reports
- **gc**: Execute specialized garbage collection operations

Application Scenarios:
- **Memory Pressure Monitoring**: Real-time monitoring of system memory usage to prevent memory shortages
- **Performance Optimization**: Regular memory cleanup to improve system response speed
- **Fault Troubleshooting**: Analyze memory leaks to identify performance bottlenecks
- **Resource Management**: Optimize backup and export operations memory usage
- **System Maintenance**: Regular memory optimization to maintain system health
- **Capacity Planning**: Develop expansion plans based on memory usage trends

**Examples:**
###### View current memory status
```json
{
  "action": "status"
}
```
###### Perform basic memory cleanup
```json
{
  "action": "cleanup"
}
```
###### Execute comprehensive memory optimization (including forced GC)
```json
{
  "action": "optimize",
  "forceGC": true,
  "includeHistory": true
}
```
###### Configure memory monitoring parameters
```json
{
  "action": "configure",
  "enableMonitoring": true,
  "maxConcurrency": 3
}
```
###### Generate detailed memory analysis report
```json
{
  "action": "report",
  "includeHistory": true
}
```
###### Execute specialized garbage collection
```json
{
  "action": "gc"
}
```
###### Quick memory optimization (without forced GC)
```json
{
  "action": "optimize",
  "forceGC": false
}
```
###### Memory pressure monitoring scenario
```json
{
  "action": "status"
}
```
###### Regular maintenance tasks
```json
{
  "action": "cleanup"
}
```
###### Fault troubleshooting support
```json
{
  "action": "report",
  "includeHistory": true
}
```

#### `mysql_manage_queue`
Task queue management that uniformly manages and monitors asynchronous operations (backups, exports, data migration, etc.) execution queues.
Provides comprehensive queue control capabilities including task status monitoring, concurrency control, queue scheduling, task cancellation, and system diagnostics.
Integrated with priority scheduling, error recovery, performance monitoring, etc. for large-scale concurrent task processing.

Main Features:
- **Unified Queue Management**: Centralized management of all asynchronous task queue types
- **Real-time Status Monitoring**: Real-time monitoring of queue status, task progress, performance indicators
- **Concurrency Control Optimization**: Dynamic adjustment of task concurrency to balance system load
- **Task Lifecycle Management**: Complete task creation, execution, completion, cancellation lifecycle
- **Priority Scheduling**: Support for task priority scheduling to ensure important tasks execute first
- **Error Recovery Mechanisms**: Automatic handling of failed task retries and error recovery
- **Detailed Diagnostic Functions**: System health status analysis and performance diagnostics
- **Flexible Filtering Queries**: Support for filtering and querying by task type, status dimensions

Supported Operations:
- **status**: View queue status and task list with detailed display and type filtering
- **pause**: Pause queue, stop new task execution, completed executing tasks continue
- **resume**: Resume queue, continue executing queued tasks
- **clear**: Clear queue, cancel all queued tasks
- **set_concurrency**: Set maximum concurrent tasks to control system load
- **cancel**: Cancel specified individual task
- **diagnostics**: Execute queue diagnostics, provide health status and optimization suggestions
- **get_task**: Get detailed information for single task including execution time and status history

Application Scenarios:
- **Production Environment Monitoring**: Real-time monitoring of task queue status to ensure system stability
- **Load Balancing Control**: Dynamic adjustment of concurrency based on different load conditions
- **Task Scheduling Management**: Manage execution order of backups, exports, etc. batch tasks
- **Fault Diagnosis**: Quick identification of queue problems and performance bottlenecks
- **Operations Automation**: Integration into operational scripts for automated queue management
- **Resource Optimization**: Adjust task execution strategies based on system resource conditions

**Examples:**
##### View queue status overview
```json
{
  "action": "status",
  "showDetails": true
}
```
##### View detailed queue status (includes all task information)
```json
{
  "action": "status",
  "showDetails": true
}
```
##### View specific type of tasks (backup tasks only)
```json
{
  "action": "status",
  "filterType": "backup",
  "showDetails": true
}
```
##### Pause queue processing
```json
{
  "action": "pause"
}
```
##### Resume queue processing
```json
{
  "action": "resume"
}
```
##### Clear all tasks in queue
```json
{
  "action": "clear"
}
```
##### Set maximum concurrent tasks to 5
```json
{
  "action": "set_concurrency",
  "maxConcurrency": 5
}
```
##### Cancel specified task
```json
{
  "action": "cancel",
  "taskId": "backup_123456"
}
```
##### Execute queue diagnostics
```json
{
  "action": "diagnostics"
}
```
##### Get detailed information for single task
```json
{
  "action": "get_task",
  "taskId": "export_789012"
}
```
##### Production environment monitoring scenario
```json
{
  "action": "status",
  "showDetails": true
}
```
##### Emergency situations queue control
```json
{
  "action": "pause"
}
```
Then clear queue
```json
{
  "action": "clear"
}
```
##### Load optimization adjustment
```json
{
  "action": "set_concurrency",
  "maxConcurrency": 3
}
```
##### Fault troubleshooting support
```json
{
  "action": "diagnostics"
}
```

#### `mysql_manage_indexes`
Index management tool providing enterprise-level MySQL index management solutions with complete index lifecycle management functions.
Integrated with index creation, deletion, optimization analysis, etc. for comprehensive index management capabilities.
Supports various index types including regular indexes, unique indexes, primary keys, full-text indexes, spatial indexes.
Suitable for database administrators performing index optimization, performance tuning, etc.

**Actions:**
- **create**: Create new indexes
- **drop**: Delete indexes
- **analyze**: Analyze index usage
- **optimize**: Optimize index structure
- **list**: List index information

**Examples:**
```json
// Create regular index
{
  "action": "create",
  "table_name": "users",
  "index_name": "idx_users_email",
  "columns": ["email"]
}

// Create composite index
{
  "action": "create",
  "table_name": "orders",
  "index_name": "idx_orders_user_date",
  "columns": ["user_id", "created_at"]
}

// Create unique index
{
  "action": "create",
  "table_name": "products",
  "index_name": "idx_products_sku",
  "index_type": "UNIQUE",
  "columns": ["sku"]
}

// Drop index
{
  "action": "drop",
  "table_name": "users",
  "index_name": "idx_users_email",
  "if_exists": true
}

// Analyze index usage
{
  "action": "analyze",
  "table_name": "users"
}

// Optimize index structure
{
  "action": "optimize",
  "table_name": "users"
}

// List all indexes for table
{
  "action": "list",
  "table_name": "users"
}

// List indexes for all tables in database
{
  "action": "list"
}
```

#### `mysql_manage_users`
User management tool providing enterprise-level MySQL user management solutions with complete user lifecycle management functions.
Integrated with user creation, deletion, permission granting and revoking, etc. for comprehensive user management capabilities.
Supports secure password validation, fine-grained permission control, user audit tracking, etc. for enterprise-level characteristics.
Suitable for database administrators performing user permission management, security compliance, etc.

**Actions:**
- **create**: Create new users
- **delete**: Delete users
- **grant**: Grant permissions to users
- **revoke**: Revoke permissions from users
- **list**: List all users
- **show_grants**: Show user permissions

**Examples:**
```json
// Create new user
{
  "action": "create",
  "username": "newuser",
  "password": "secure_password",
  "host": "localhost"
}

// Delete user
{
  "action": "delete",
  "username": "olduser",
  "if_exists": true
}

// Grant permissions
{
  "action": "grant",
  "username": "appuser",
  "privileges": ["SELECT", "INSERT", "UPDATE"],
  "database": "myapp",
  "table": "users"
}

// Revoke permissions
{
  "action": "revoke",
  "username": "appuser",
  "privileges": ["DELETE"],
  "database": "myapp"
}

// List all users
{
  "action": "list"
}

// Show user permissions
{
  "action": "show_grants",
  "username": "appuser"
}
```

#### `mysql_replication_status`
Replication status tool providing enterprise-level MySQL master-slave replication monitoring solutions with comprehensive replication status monitoring, delay detection, error diagnostics, and configuration viewing functions.
Supports production environment replication topology management.

**Actions:**
- **status**: View replication status overview
- **delay**: Detect replication delay
- **diagnose**: Diagnose replication errors
- **config**: View replication configuration

**Examples:**
```json
// View replication status overview
{
  "action": "status"
}

// Detect replication delay
{
  "action": "delay"
}
```

## Usage Examples

### 📝 Basic Query Operations
```bash
# Connect to Claude Desktop and use the following examples:

# Query user data
{
  "query": "SELECT id, name, email, created_at FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10",
  "params": []
}

# Get table structure
{
  "table_name": "orders"
}

# Complex connection query with parameters
{
  "query": "SELECT u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.created_at > ? GROUP BY u.id HAVING order_count > 0 ORDER BY total_spent DESC",
  "params": ["2023-01-01"]
}
```

### 🔄 CRUD Operations
```bash
# Insert new user
{
  "table_name": "users",
  "data": {
    "name": "Alice Johnson",
    "email": "alice@example.com",
    "status": "active"
  }
}

# Update user status
{
  "table_name": "users",
  "data": {
    "status": "inactive"
  },
  "where_clause": "email = 'john@example.com'"
}

# Delete user
{
  "table_name": "users",
  "where_clause": "id = 123"
}
```

### 🔄 Batch Operations
```bash
# Batch transaction example
{
  "queries": [
    {"sql": "INSERT INTO users (name, email) VALUES (?, ?)", "params": ["Alice Johnson", "alice@example.com"]},
    {"sql": "UPDATE profiles SET user_id = ? WHERE email = ?", "params": [1, "alice@example.com"]},
    {"sql": "INSERT INTO user_logs (user_id, action) VALUES (LAST_INSERT_ID(), ?)", "params": ["user_created"]}
  ]
}

# Batch insert example
{
  "table_name": "products",
  "data": [
    {"name": "Laptop Pro", "price": 1299.99, "category": "Electronics", "stock": 50},
    {"name": "Wireless Mouse", "price": 29.99, "category": "Electronics", "stock": 200},
    {"name": "Office Chair", "price": 199.99, "category": "Furniture", "stock": 25}
  ]
}
```

### 🛡️ System Health Monitoring
```bash
# Get comprehensive system status
{
  "scope": "full",
  "includeDetails": true
}

# Memory optimization and analysis
{
  "action": "optimize",
  "forceGC": true,
  "includeHistory": true
}

# Queue management
{
  "action": "status",
  "showDetails": true,
  "filterType": "all"
}

# Progress tracking
{
  "action": "summary"
}

# Security audit
{} # No parameters required
```

## Architecture Design

### 🏗️ Core Component Architecture
```
MySQLManager (Central Engine) - mysqlManager.ts
├── Configuration Management Layer - config.ts
│   ├── ConfigurationManager             # Central configuration management
│   ├── DatabaseConfig                   # Database connection configuration
│   ├── SecurityConfig                   # Security configuration management
│   └── CacheConfig                      # Cache configuration management
├── Data Access Layer
│   ├── ConnectionPool                   # Enhanced connection pool management - connection.ts
│   │   ├── preCreateConnections()       # Pre-create connections
│   │   ├── performHealthCheck()         # Health checks
│   │   └── adjustPoolSize()             # Dynamically adjust pool size
│   └── SmartCache                       # Three-level LRU cache system - cache.ts
│       ├── SchemaCache                  # Table structure cache (128 entries)
│       ├── TableExistsCache             # Table existence check cache (64 entries)
│       └── IndexCache                   # Index information cache (64 entries)
├── Security Protection Layer
│   ├── SecurityValidator                # Security validator - security.ts
│   │   ├── validateInputComprehensive() # Comprehensive input validation
│   │   └── analyzeSecurityThreats()     # Threat analysis
│   ├── RBACManager                      # Permission management - rbac.ts
│   │   ├── checkPermission()            # Permission checking
│   │   └── assignRoleToUser()           # Role assignment
│   ├── AdaptiveRateLimiter              # Adaptive rate limiting - rateLimit.ts
│   │   └── checkRateLimit()             # Token bucket algorithm rate limiting
│   └── SecurityAuditor                  # Security auditor - security.ts
├── Monitoring Analysis Layer
│   ├── PerformanceManager               # Performance manager - performanceManager.ts
│   │   ├── SlowQueryAnalysis            # Slow query analysis
│   │   ├── IndexOptimization            # Index optimization suggestions
│   │   └── QueryProfiling               # Query performance profiling
│   ├── MetricsManager                   # Metrics manager - metrics.ts
│   │   ├── TimeSeriesMetrics            # Time series metrics
│   │   ├── PerformanceMetrics           # Performance metrics
│   │   └── recordQueryTime()            # Query time recording
│   ├── MemoryMonitor                    # Memory monitor - monitor.ts
│   │   ├── getMemoryStats()             # Memory usage statistics
│   │   └── optimizeMemory()             # Memory optimization
│   ├── SystemMonitor                    # System monitor - monitor.ts
│   │   ├── collectSystemResources()     # System resource collection
│   │   └── checkAlerts()                # Alert checking
│   ├── ErrorHandler                     # Error handler - errorHandler.ts
│   │   ├── safeError()                  # Secure error handling
│   │   └── analyzeError()               # Error analysis
│   └── SmartRetryStrategy               # Smart retry strategy - retryStrategy.ts
├── Backup Management Layer
│   ├── MySQLBackupTool                  # Backup tool - mysqlBackupTool.ts
│   │   ├── createBackup()               # Multi-mode backup
│   │   └── createIncrementalBackup()    # Incremental backup
│   ├── MySQLImportTool                  # Import tool - mysqlImportTool.ts
│   │   ├── importData()                 # Multi-format import
│   │   └── validateImport()             # Import validation
│   └── DataExporter                     # Data exporter - mysqlBackupTool.ts
├── System Management Tools (index.ts tools)
│   ├── mysql_system_status              # System status check
│   ├── mysql_analyze_error              # Smart error analysis
│   ├── mysql_security_audit             # Security audit
│   ├── mysql_manage_indexes             # Index management
│   ├── mysql_manage_users               # User management
│   ├── mysql_replication_status         # Replication status monitoring
│   ├── mysql_progress_tracker           # Progress tracker
│   └── mysql_optimize_memory            # Memory optimization
└── Logging and Tool Layer
    ├── StructuredLogger                 # Structured logger
    ├── Constants                        # Constant definitions - constants.ts
    ├── Types                            # Type definitions - types.ts
    ├── CommonUtils                      # Common utilities - utils/common.ts
    └── CacheInvalidator                 # Cache invalidator - utils/cacheInvalidator.ts
```

### MySQLManager - Central Engine
The `MySQLManager` class located in `src/mysqlManager.ts` acts as the core coordinator integrating all enterprise-level database features:

**Core Feature Integration:**
- **Connection Pool Management**: Enhanced connection pool (`ConnectionPool`) with automatic reconnection and health checks
- **Intelligent Caching**: Three-level LRU cache system (`SmartCache`) with O(1) performance and automatic memory management
- **Security Validation**: Multi-layer input validation and SQL injection detection (`SecurityValidator`)
- **Permission Control**: RBAC permission management (`RBACManager`) with fine-grained permission validation
- **Performance Monitoring**: Dual-layer metrics collection (`MetricsManager`) with real-time performance statistics
- **Error Handling**: Intelligent error classification and recovery suggestions (`ErrorHandler`)
- **Retry Mechanism**: Adaptive retry strategy (`SmartRetryStrategy`) with exponential backoff algorithm

**Advanced Features:**
- **Memory Optimization**: Pressure-aware memory management with automatic garbage collection
- **Batch Operation Support**: Transaction-safe batch operations with parallel processing support
- **Audit Logging**: Comprehensive operation auditing and security event recording

### 🔄 Data Flow Optimization
1. **Request Reception**: MCP server (`index.ts`) receives tool call requests
2. **Permission Verification**: RBAC system checks user permissions
3. **Security Check**: Multi-layer security validation including SQL injection detection and input sanitization
4. **Cache Query**: Three-level cache system (Schema/TableExists/Index) provides fast data access
5. **Database Operation**: Smart retry strategy executes asynchronous queries with transaction safety
6. **Performance Monitoring**: Real-time collection of query metrics and system resource monitoring
7. **Result Processing**: Advanced memory management and streaming result processing
8. **Secure Response**: Sensitive data masking and secure response generation
9. **Audit Logging**: Structured logging recording and audit tracking
10. **Resource Cleanup**: Automatic connection release and pool management

**Performance Metric Collection Points:**
- Query response time statistics
- Cache hit rate monitoring
- Connection pool usage monitoring
- Memory pressure monitoring
- Error classification statistics

## Performance Monitoring

### 🎯 Key Performance Indicators (KPIs)
Through `mysql_system_status`, `mysql_optimize_memory`, and other professional tools for comprehensive performance monitoring.

- **Query Performance**: Average query time, total queries, slow query count, and intelligent error classification
- **Cache Efficiency**: Multi-level cache statistics (schema, tableExists, index), with hit rate and intelligent invalidation
- **Connection Pool Status**: Health monitoring with timeout protection and connection lifecycle tracking
- **System Resources**: Real-time CPU, memory, and event loop delay monitoring
- **Memory Analysis**: Memory usage trends, leak detection, and garbage collection statistics
- **Error Classification**: Intelligent classification with recovery suggestions and diagnostic reports

### Advanced Monitoring Features
- Linear interpolation for accurate P95, P99 percentile calculations
- Enhanced connection pool monitoring with waiting time tracking and health checks
- Slow query detection with configurable thresholds (default 1 second)
- Cache efficiency metrics (target >80% hit rate) with intelligent invalidation and memory pressure self-adaptation
- Error rate with intelligent classification and contextual recovery suggestions
- System resource usage monitoring (CPU, memory, event loop delays, disk I/O)
- Memory pressure detection using linear regression with automatic garbage collection triggering
- Memory leak pattern detection with trend analysis and automatic alerts
- Time series data retention with configurable window size, data aging, and real-time alert system
- Performance regression detection with historical comparison and anomaly detection

### 📈 Performance Metrics Example (JSON Output)
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

## Cache Strategy

### 🧠 Advanced Multi-Level Cache Architecture

The system implements an enterprise-grade, multi-tiered intelligent caching system with advanced memory management and performance optimization capabilities:

#### 1. Tiered Cache Architecture (L1/L2)
The `SmartCache` class implements a sophisticated two-tier cache architecture for optimal performance:

**L1 Cache (Hot Data - Map-based):**
- **Purpose**: Stores frequently accessed data with O(1) access time
- **Implementation**: High-performance Map data structure with automatic LRU eviction
- **Size**: Configurable (default: 80% of total cache size)
- **TTL Support**: Individual TTL for each entry with automatic expiration
- **Performance**: Sub-millisecond access times for cached data

**L2 Cache (Warm Data - Object-based):**
- **Purpose**: Secondary cache layer for less frequently accessed data
- **Implementation**: Object-based storage with configurable eviction policies
- **Size**: Configurable (default: 20% of total cache size)
- **Promotion**: Automatic promotion from L2 to L1 based on access patterns
- **Persistence**: Longer TTL values for improved cache utilization

#### 2. Advanced Cache Features

**Dynamic TTL Adjustment:**
- **Access Pattern Analysis**: Monitors access frequency and patterns
- **Automatic TTL Extension**: Extends TTL for frequently accessed entries
- **Configurable Parameters**: Adjustable sensitivity and extension factors
- **Performance Impact**: Reduces cache misses for popular data

**Memory Protection with WeakMap:**
- **Memory Leak Prevention**: Uses WeakMap for object references
- **Automatic Garbage Collection**: Objects are automatically cleaned when no longer referenced
- **Reference Management**: WeakRef support for advanced memory management
- **Zero Memory Overhead**: No additional memory cost for cache metadata

**Intelligent Prefetch System:**
- **Pattern Recognition**: Analyzes access patterns to predict future needs
- **Proactive Loading**: Pre-loads related data before it's requested
- **Configurable Thresholds**: Adjustable prefetch triggers and limits
- **Performance Boost**: Reduces latency for predictable access patterns

#### 3. Cache Warm-up System
- **Startup Preloading**: Automatically loads frequently accessed data on startup
- **Progress Tracking**: Real-time progress monitoring with completion estimates
- **Error Handling**: Robust error handling with fallback strategies
- **Performance Metrics**: Detailed statistics on warm-up performance

### 🏗️ Memory Pressure-Aware Cache Management

The system integrates with the centralized `MemoryPressureManager` for intelligent cache sizing:

#### Automatic Cache Adjustment
```typescript
// Automatic memory pressure handling based on MemoryPressureManager
adjustForMemoryPressure(pressureLevel: number): void {
  // Reduce cache sizes when memory pressure exceeds 70%
  if (pressureLevel > 0.7) {
    this.adjustTierSizes(-0.3); // Reduce L1/L2 sizes proportionally
    this.evictLowPriorityEntries();
  }

  // Enable compression when pressure exceeds 85%
  if (pressureLevel > 0.85) {
    this.enableCacheCompression();
    this.aggressiveCleanup();
  }
}
```

#### Intelligent Eviction Strategies
- **Priority-Based Eviction**: LRU combined with access frequency scoring
- **Tier-Aware Cleanup**: Different eviction policies for L1 vs L2 cache
- **Memory Pressure Response**: Aggressive eviction under high pressure
- **Preservation of Hot Data**: Frequently accessed data is protected during cleanup

### 📊 Advanced Cache Performance Monitoring

Comprehensive cache performance analytics via enhanced monitoring:

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

### ⚡ Enterprise Cache Optimization Features

#### Cache Warm-up System
- **Intelligent Preloading**: Analyzes historical access patterns for optimal preloading
- **Priority-Based Loading**: Loads high-value data first for immediate performance benefits
- **Background Processing**: Non-blocking warm-up operations that don't affect system startup
- **Progress Monitoring**: Real-time progress tracking with completion callbacks

#### Advanced Memory Management
- **WeakMap Integration**: Automatic memory leak prevention using WeakMap/WeakRef
- **Reference Tracking**: Intelligent reference counting for cache entries
- **Automatic Cleanup**: Zero-configuration memory management with automatic cleanup
- **Memory Pressure Response**: Dynamic adjustment based on system memory conditions

#### Performance Optimization
- **Prefetch Intelligence**: Machine learning-based prefetch predictions
- **TTL Auto-Adjustment**: Dynamic TTL modification based on access patterns
- **Batch Operations**: Optimized batch get/set operations for high-throughput scenarios
- **Compression Support**: Optional data compression for memory-constrained environments

### 🔍 Advanced Cache Management Tools

#### Cache Analysis and Optimization
```typescript
// Get detailed cache analysis
const analysis = cache.getDetailedAnalysis();

// Analyze access patterns
const patterns = cache.analyzeAccessPatterns();

// Optimize cache configuration
const recommendations = cache.getOptimizationRecommendations();

// Perform intelligent cleanup
const cleanupResult = cache.performIntelligentCleanup();
```

#### Memory Pressure Integration
```typescript
// Subscribe to memory pressure changes
memoryPressureManager.subscribe((pressure: number) => {
  cache.adjustForPressure(pressure);
});

// Get cache health status
const health = cache.getHealthStatus();
console.log(`Cache health: ${health.score}/100`);
```

### 🛠️ Cache Configuration Examples

#### High-Performance Configuration
```bash
# Environment variables for high-performance setup
SMART_CACHE_L1_SIZE=256
SMART_CACHE_L2_SIZE=128
CACHE_TTL_BASE=600
CACHE_TTL_MAX=3600
PREFETCH_ENABLED=true
PREFETCH_THRESHOLD=0.7
TTL_DYNAMIC_ADJUSTMENT=true
WEAKMAP_PROTECTION=true
```

#### Memory-Constrained Configuration
```bash
# Environment variables for memory-constrained environments
SMART_CACHE_L1_SIZE=64
SMART_CACHE_L2_SIZE=32
CACHE_TTL_BASE=300
CACHE_COMPRESSION=true
COMPRESSION_LEVEL=6
AGGRESSIVE_EVICTION=true
WEAKMAP_PROTECTION=true
```

This advanced cache architecture provides enterprise-grade performance, intelligent memory management, and comprehensive monitoring capabilities for optimal database operation efficiency.

## Security Features

### 🔒 Multi-Layer Security Architecture

#### Input Validation and Sanitization
- **Null Byte Filtering**: Prevents null byte injection attacks
- **Length Validation**: Configurable maximum query length (default: 10,000 characters)
- **Character Encoding**: UTF-8 validation and sanitization
- **Parameter Binding**: All queries use prepared statements
- **Configurable Security Levels**: Three-level validation (STRICT/MODERATE/BASIC)

#### 🛡️ Advanced SQL Injection Detection (20+ Patterns)
The system implements comprehensive SQL injection detection with 20+ specific patterns and real-time threat analysis:

**Dangerous Operation Detection (6 patterns):**
- File system access attempts (LOAD_FILE, INTO OUTFILE, INTO DUMPFILE)
- Command execution attempts (SYSTEM, EXEC, SHELL, xp_cmdshell)
- Information disclosure (UNION SELECT with INFORMATION_SCHEMA)
- Destructive operations with stacked queries (DROP, DELETE, TRUNCATE, ALTER)
- Time-based attacks and DoS attempts (BENCHMARK, SLEEP, WAITFOR)
- System variable access (@@version, @@datadir, @@basedir, @@tmpdir)

**SQL Injection Patterns (15+ patterns):**
- Basic OR/AND injections (with quotes and comparison operators)
- Union query injections (UNION SELECT variants)
- Authentication bypass patterns (' OR '1'='1, " OR "1"="1)
- Comment-based evasion (--, /* */, #)
- Time delay attacks (SLEEP, BENCHMARK, WAITFOR, pg_sleep, dbms_pipe.receive_message)
- Error-based injections (CAST, CONVERT, EXTRACTVALUE, UPDATEXML)
- Mathematical errors with bit operations (EXP, POW)
- Stacked query injections (; SELECT, ; INSERT, etc.)
- Function call injections (CHAR, ASCII, ORD, HEX, UNHEX, CONCAT, GROUP_CONCAT)
- System information collection (USER, VERSION, DATABASE, SCHEMA functions)
- Logical operator bypass (||, &&, ^^)
- Classic injection patterns (numeric, string, NULL values)
- Enhanced dangerous operations and injection attempt detection

#### 🎯 Multi-Level Security Validation
- **Strict Mode**: Highest security, blocks all suspicious patterns (recommended for production)
- **Moderate Mode**: Balances security and productivity (default)
- **Basic Mode**: Minimal validation for development environments

#### 🚨 Real-Time Threat Analysis
```json
{
  "security_analysis": {
    "threat_level": "LOW",
    "detected_patterns": [],
    "risk_score": 0.1,
    "recommendations": [
      "Input validation passed all security checks"
    ],
    "blocked_attempts": 0,
    "validation_time": "0.8ms"
  }
}
```

#### 🔐 Comprehensive Security Features
- **Rate Limiting**: Adaptive token bucket algorithm with system load awareness (60-second window, 100 requests/minute default)
- **Query Type Restrictions**: Whitelist-based query type filtering with configurable allowed types
- **Result Set Limiting**: Prevents data leakage through large result sets (default 1,000 rows)
- **Credential Protection**: Automatic masking in diagnostic information
- **Audit Trails**: Comprehensive operation recording with desensitized output
- **Connection Security**: SSL/TLS support and certificate validation
- **Query Timeout Protection**: Configurable query execution timeouts to prevent resource exhaustion
- **Dangerous Operation Detection**: Enhanced DROP, DELETE, UPDATE detection (no WHERE clause)
- **Pattern Detection**: Real-time threat detection with risk assessment and recovery suggestions

## Memory Management

### 🧠 Advanced Memory Monitoring
The system features comprehensive memory monitoring and optimization with advanced leak detection using linear regression and automatic pressure-aware adjustments:

#### Memory Monitoring Features
- **Real-time Memory Tracking**: RSS, heap memory, and external memory monitoring
- **Memory Leak Detection**: Pattern analysis using trend calculation and growth rate monitoring with linear regression
- **Pressure Level Calculation**: 0-1 range memory pressure assessment for automatic optimization triggering
- **Garbage Collection Statistics**: Tracking of triggered GC events, freed memory, and last GC time
- **Historical Data Retention**: Configurable memory usage history storage with trend analysis
- **Automatic Leak Suspicion Detection**: Real-time leak detection using automated trend analysis
- **Multi-Metric Monitoring**: Comprehensive heap usage, heap total, RSS, and external memory monitoring

#### Memory Optimization Tools
- **Manual GC Triggering**: Use `mysql_optimize_memory` tool for garbage collection when needed
- **Automatic Optimization**: Configurable automatic GC based on memory pressure thresholds (default 0.8)
- **Memory Suggestions**: Actionable suggestions based on usage patterns and historical analysis
- **Performance Impact Analysis**: Detailed statistical before/after memory usage comparison
- **Cache Clearing**: Automatic cache clearing when memory pressure exceeds configuration thresholds

#### Memory Alert System
- **High Memory Usage Alerts**: Real-time notifications when memory usage exceeds configuration thresholds
- **Leak Suspicion Alerts**: Notifications when potential memory leaks detected
- **Pressure Level Alerts**: Alerts based on memory pressure levels with structured callback support

### 🏗️ Centralized Memory Pressure Management
The system implements a centralized memory pressure management system using the `MemoryPressureManager` class:

#### Core Features
- **Singleton Pattern**: Centralized memory pressure calculation and distribution system
- **Observer Pattern**: Automatic notification to all subscribed components when pressure changes
- **Intelligent Thresholds**: Only notifies observers when pressure changes exceed 5% threshold
- **Automatic Monitoring**: 10-second monitoring intervals with efficient resource usage
- **Memory Pressure Calculation**: Based on heap usage ratio and RSS vs system memory (2GB baseline)

#### Memory Pressure Calculation Algorithm
```typescript
private calculatePressure(): number {
  const memUsage = MemoryUtils.getCurrentUsage();

  // Based on heap usage ratio
  const heapPressure = memUsage.heapUsed / memUsage.heapTotal;

  // Based on RSS vs system memory (2GB baseline)
  const totalMemoryBase = 2 * 1024 * 1024 * 1024; // 2GB
  const rssPressure = memUsage.rss / totalMemoryBase;

  // Combined pressure level, ensuring 0.2-1 range
  const combinedPressure = Math.max(heapPressure, rssPressure);
  return Math.max(0.2, Math.min(1, combinedPressure * 1.2));
}
```

#### Subscription Management
- **Automatic Subscription**: Cache components automatically subscribe to memory pressure changes
- **Dynamic Adjustment**: Cache sizes automatically adjust based on memory pressure levels
- **Unsubscription Support**: Clean unsubscription mechanism to prevent memory leaks
- **Immediate Notification**: New subscribers immediately receive current pressure level

#### Integration with Cache System
- **Pressure-Aware Cache Sizing**: Automatic cache size reduction under memory pressure
- **Intelligent Eviction**: Priority-based eviction when memory pressure exceeds 70%
- **Cache Compression**: Advanced cache compression when pressure exceeds 85%
- **Real-time Adaptation**: Continuous monitoring and adjustment of cache behavior

### Memory Functions
- Real-time memory usage tracking (RSS, heap, external)
- Memory pressure level calculation (0-1 range)
- Automatic leak detection using linear regression patterns
- GC statistics tracking (trigger count, freed memory, last GC time)
- Memory optimization suggestions based on usage patterns
- High memory usage and leak suspicion alert system
- Configurable history memory data retention
- Integration with system diagnostics for comprehensive health analysis

### 📊 Memory Analysis Example
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
      "recommendedAction": "Memory usage stable, immediate action not required"
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

## Troubleshooting

### 🔧 Common Problem Solutions

1. **Database Connection Failure**: `Error: connect ECONNREFUSED`
   - **Solution**: Confirm MySQL service is running; check `.env` file `MYSQL_HOST` and `MYSQL_PORT` are correct; check firewall settings.
   - **Additional**: Ensure MySQL accepts connections from your host; validate credentials in `.env` file; check MySQL error logs for detailed information.

2. **Low Cache Hit Rate**:
   - **Symptoms**: `mysql_system_status` shows cache `hit_rate` below 60%.
   - **Solution**: Appropriately increase `SCHEMA_CACHE_SIZE` etc. cache-related environment variables; extend `CACHE_TTL` duration.
   - **Additional**: Use `mysql_system_status` to analyze query patterns; consider implementing cache warm-up strategy for frequently accessed tables.

3. **Connection Pool Exhaustion**: `Error: Pool is closed.` or `Error: Timeout acquiring connection`
   - **Symptoms**: Application unresponsive or errors under high concurrency.
   - **Solution**: Increase `MYSQL_CONNECTION_LIMIT` value; check if code releases connections (this project handles this properly).
   - **Additional**: Use `mysql_system_status` to monitor connection pool statistics; check query timeout settings; consider implementing request batching for frequent operations.

4. **Rate Limiting Triggered**: `Error: Rate limit exceeded`
   - **Solution**: Optimize client call logic to reduce request frequency; appropriately increase `RATE_LIMIT_MAX` or `RATE_LIMIT_WINDOW`.
   - **Additional**: Implement exponential backoff in client applications; use batch operations to reduce requests; consider upgrading to higher performance tiers.

5. **High Memory Usage**:
   - **Symptoms**: Node.js process consumes excessive memory
   - **Solution**: Use `mysql_optimize_memory` tool to trigger garbage collection; reduce cache sizes; use `mysql_system_status` to monitor memory trends.
   - **Additional**: Use `NODE_OPTIONS="--expose-gc"` to enable automatic garbage collection; check cache configuration parameters; implement memory pressure monitoring.

6. **Slow Query Performance**:
   - **Symptoms**: Queries taking longer than expected, `mysql_system_status` showing high average query time.
   - **Solution**: Use `mysql_system_status` to analyze slow queries; add appropriate indexes to tables; optimize query structure.
   - **Additional**: Check MySQL slow query log; consider caching query results; implement pagination for large datasets.

7. **Security Validation Failures**:
   - **Symptoms**: `Error: Query validation failed` or blocked queries
   - **Solution**: Check query patterns against security rules; if appropriate, adjust security level (STRICT/MODERATE/BASIC).
   - **Additional**: Check query length limits; validate allowed query types; check injection pattern detection results in diagnostics.

8. **SSL Connection Problems**:
   - **Symptoms**: `Error: SSL connection failed` or certificate validation errors
   - **Solution**: Verify SSL configuration in `.env` file; ensure SSL certificates are valid and configured correctly.
   - **Additional**: Check MySQL SSL settings; validate certificate paths and permissions; consider using `MYSQL_SSL=false` in development environments.

### Diagnosis Tools
- Use `mysql_system_status` for comprehensive system health analysis
- Use `mysql_optimize_memory` for memory analysis and optimization
- Use `mysql_analyze_error` for smart error diagnostics
- Use `mysql_progress_tracker` to monitor asynchronous operation progress
- Use `mysql_manage_queue` for task queue status management
- Use `npx tsc --noEmit` to monitor TypeScript compilation errors

## Performance Tuning

### ⚡ Configuration Templates

Three predefined configuration templates:

#### Enterprise Environment (High Concurrency)
- High concurrency (50 connections, 256 cache size)

#### Medium Scale Application (Balanced)
- Balanced (20 connections, 128 cache size)

#### Resource Constrained Environment (Low Memory)
- Low memory usage (5 connections, 32 cache size)

Refer to `.env.example` for a complete configuration example with all available options.

## Development Guide

### 🏗️ Architecture Principles
1. **Performance First**: All design decisions prioritize performance impact.
2. **Security First**: Multi-layer security validation, never trust user input.
3. **Observability**: Comprehensive monitoring and diagnostic capabilities.
4. **Configuration Driven**: Flexible configuration through environment variables.
5. **Graceful Degradation**: Non-core functions (cache, monitoring) do not affect core database operations when they fail.

###  Contribution Guidelines

#### Development Environment Commands
```bash
# Install all dependencies
npm install

# Copy environment template and configure
cp .env.example .env

# Compile and run server
npm run build
npm start

# Or run directly with ts-node for development
npm run dev

# Code formatting and checking
npm run lint
npm run lint:fix

# Type checking
npx tsc --noEmit

# Testing
npm test
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage

# Optional performance dependencies
# Enable garbage collection monitoring (run with --expose-gc flag)
node --expose-gc dist/index.js

# Development mode with debugging enhancements
npm run dev -- --expose-gc

# Alternative: Set environment variables for memory monitoring
export NODE_OPTIONS="--expose-gc"
```

### TypeScript Best Practices
- Enable strict type checking including `noImplicitAny` and `strictNullChecks`
- Use Zod schemas for runtime type safety and validation of tool parameters
- Utilize union types and type guards for robust error handling
- Use TypeScript's Promise types for proper async/await patterns
- Implement generics for cache implementation and database result processing

### Error Handling
- **MySQLErrorClassifier**: Smart error classification with contextual recovery suggestions and preventive measures
- **ErrorHandler**: Secure error transformation with sensitive information masking and secure event logging
- MySQL errors classified by error codes with context-aware and severity-based intelligent retry logic
- Secure event logging with cleaned output (credential masking) and structured audit trails
- Comprehensive diagnostic reports with possible causes, recovery strategies, and preventive measures
- Type-safe error handling using custom MySQLMCPError class and structured interfaces
- Automatic error recovery with configurable fallback strategies

### Resource Management
- Connection pool automatic MySQL connection management
- Proper async/await patterns for cleanup throughout the process
- Graceful shutdown through signal handlers
- Cache cleanup and memory management on exit

### Thread Safety
- Event-loop based concurrency using async/await patterns for non-blocking operations
- Session-based concurrent operation tracking using UUIDs
- Single-threaded JavaScript characteristics with asynchronous processing design free of lock contention
- Atomic operations on shared resources (cache, metrics, rate limiters)
- Independent background monitoring tasks run using setInterval/setTimeout
- Thread-safe access pattern connection pool management

#### Logging and Debugging
To enable debugging logs, set the LOG_LEVEL environment variable:
```bash
# In .env file or environment
LOG_LEVEL=DEBUG
```

View logs in real-time during development:
```bash
# Run server in one terminal
npm run dev

# In another terminal, if logs go to files
# (Note: TypeScript version may not log to files by default)
```

#### Contribution Process
- Follow existing code style.
- Add relevant unit tests or integration tests for new features.
- Update this documentation if adding or modifying tools or configurations.
- Ensure all tests and checks pass before submitting pull requests.

## License

This project is licensed under the MIT License.