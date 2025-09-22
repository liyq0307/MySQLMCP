/**
 * RBAC (基于角色的访问控制) 系统 - MySQL MCP权限管理模块
 *
 * 专为MySQL Model Context Protocol (MCP) 服务设计的权限管理系统，
 * 提供完整的用户、角色、权限管理功能，支持角色继承和权限验证。
 * 通过RBACManager类实现企业级的访问控制机制。
 *
 * ┌─ 默认配置 ──────────────────────────────────────────────────────────────┐
 * │ 👑 内置角色
 * │   • admin: 系统管理员，拥有所有权限
 * │   • user: 普通用户，拥有查询权限
 * │   • editor: 编辑者，拥有CRUD操作权限
 * │
 * │ 🔑 内置权限
 * │   • SELECT: 执行SELECT查询
 * │   • INSERT: 执行INSERT操作
 * │   • UPDATE: 执行UPDATE操作
 * │   • DELETE: 执行DELETE操作
 * │   • CREATE: 执行CREATE操作
 * │   • DROP: 执行DROP操作
 * │   • ALTER: 执行ALTER操作
 * │   • SHOW_TABLES: 查看表列表
 * │   • DESCRIBE_TABLE: 查看表结构
 * │
 * │ 👤 默认用户
 * │   • admin: 系统管理员用户
 * │   • user: 普通用户示例
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * @fileoverview RBAC权限管理系统 - MySQL MCP模块核心组件
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @updated 2025-09-04
 * @license MIT
 *
 */

import { MySQLMCPError, ErrorCategory, ErrorSeverity } from './types.js';

/**
 * 用户权限枚举
 */
export enum Permission {
  /** 读取权限 */
  READ = 'read',
  /** 写入权限 */
  WRITE = 'write',
  /** 删除权限 */
  DELETE = 'DELETE',
  /** 管理员权限 */
  ADMIN = 'admin',
  /** 模式读取权限 */
  SCHEMA_READ = 'schema_read',
  /** 模式写入权限 */
  SCHEMA_WRITE = 'schema_write',
  /** 用户管理权限 */
  USER_MANAGEMENT = 'user_management',
  /** 系统监控权限 */
  SYSTEM_MONITORING = 'system_monitoring',
  /** SQL SELECT 权限 */
  SELECT = 'SELECT',
  /** SQL INSERT 权限 */
  INSERT = 'INSERT',
  /** SQL UPDATE 权限 */
  UPDATE = 'UPDATE',
  /** SQL CREATE 权限 */
  CREATE = 'CREATE',
  /** SQL DROP 权限 */
  DROP = 'DROP',
  /** SQL ALTER 权限 */
  ALTER = 'ALTER',
  /** 显示表列表权限 */
  SHOW_TABLES = 'SHOW_TABLES',
  /** 描述表结构权限 */
  DESCRIBE_TABLE = 'DESCRIBE_TABLE'
}

/**
 * 权限详细信息接口
 */
export interface PermissionInfo {
  /** 权限ID */
  id: string;
  /** 权限名称 */
  name: string;
  /** 权限描述 */
  description: string;
}

/**
 * 用户角色接口
 */
export interface Role {
  /** 角色ID */
  id: string;
  /** 角色名称 */
  name: string;
  /** 角色描述 */
  description?: string;
  /** 角色拥有的权限列表 */
  permissions: Permission[];
  /** 是否为系统角色 */
  isSystem?: boolean;
  /** 角色创建时间 */
  createdAt: Date;
  /** 角色更新时间 */
  updatedAt: Date;
}

/**
 * 用户接口
 */
export interface User {
  /** 用户ID */
  id: string;
  /** 用户名 */
  username: string;
  /** 邮箱地址 */
  email?: string;
  /** 用户角色列表 */
  roles: string[];
  /** 用户是否激活 */
  isActive: boolean;
  /** 最后登录时间 */
  lastLogin?: Date;
  /** 用户创建时间 */
  createdAt: Date;
  /** 用户更新时间 */
  updatedAt: Date;
  /** 用户元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 会话信息接口
 */
export interface Session {
  /** 会话ID */
  id: string;
  /** 用户ID */
  userId: string;
  /** 会话令牌 */
  token: string;
  /** 会话创建时间 */
  createdAt: Date;
  /** 会话过期时间 */
  expiresAt: Date;
  /** 最后活动时间 */
  lastActivity: Date;
  /** 客户端IP地址 */
  ipAddress?: string;
  /** 用户代理字符串 */
  userAgent?: string;
  /** 会话权限列表 */
  permissions: Permission[];
}

/**
 * 安全威胁分析结果
 */
export interface SecurityThreatAnalysis {
  /** 检测到的威胁列表 */
  threats: Array<{
    /** 威胁类型 */
    type: string;
    /** 威胁严重程度 */
    severity: string;
    /** 威胁描述 */
    description: string;
    /** 匹配的模式ID */
    patternId: string;
    /** 检测置信度（0-1） */
    confidence: number;
    /** 在输入中的位置 */
    position?: number;
  }>;
  /** 整体风险等级 */
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  /** 整体分析置信度（0-1） */
  confidence: number;
  /** 分析详细信息 */
  details: {
    /** 分析耗时（毫秒） */
    analysisTime: number;
    /** 检查的模式数量 */
    patternsChecked: number;
    /** 发现的威胁数量 */
    threatsFound: number;
  };
}

/**
 * RBAC管理器类
 *
 * 管理用户、角色和权限，提供访问控制功能。
 */
export class RBACManager {
  private roles: Map<string, Role> = new Map();
  private users: Map<string, User> = new Map();
  private permissions: Map<string, PermissionInfo> = new Map();
  private roleHierarchy: Map<string, string[]> = new Map(); // 角色继承关系

  /**
   * 添加角色
   * @param role - 角色对象
   */
  public addRole(role: Role): void {
    this.roles.set(role.id, role);
  }

  /**
   * 添加用户
   * @param user - 用户对象
   */
  public addUser(user: User): void {
    this.users.set(user.id, user);
  }

  /**
   * 添加权限
   * @param permission - 权限对象
   */
  public addPermission(permission: PermissionInfo): void {
    this.permissions.set(permission.id, permission);
  }

  /**
   * 为用户分配角色
   * @param userId - 用户ID
   * @param roleId - 角色ID
   */
  public assignRoleToUser(userId: string, roleId: string): void {
    const user = this.users.get(userId);
    if (!user) {
      throw new MySQLMCPError(
        `用户 ${userId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    const role = this.roles.get(roleId);
    if (!role) {
      throw new MySQLMCPError(
        `角色 ${roleId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    if (!user.roles.includes(roleId)) {
      user.roles.push(roleId);
    }
  }

  /**
   * 为角色分配权限
   * @param roleId - 角色ID
   * @param permissionId - 权限ID
   */
  public assignPermissionToRole(roleId: string, permissionId: string): void {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new MySQLMCPError(
        `角色 ${roleId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new MySQLMCPError(
        `权限 ${permissionId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    if (!role.permissions.includes(permissionId as Permission)) {
      role.permissions.push(permissionId as Permission);
    }
  }

  /**
   * 设置角色继承关系
   * @param childRoleId - 子角色ID
   * @param parentRoleId - 父角色ID
   */
  public setRoleInheritance(childRoleId: string, parentRoleId: string): void {
    const childRole = this.roles.get(childRoleId);
    const parentRole = this.roles.get(parentRoleId);

    if (!childRole) {
      throw new MySQLMCPError(
        `子角色 ${childRoleId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    if (!parentRole) {
      throw new MySQLMCPError(
        `父角色 ${parentRoleId} 不存在`,
        ErrorCategory.ACCESS_DENIED,
        ErrorSeverity.HIGH
      );
    }

    if (!this.roleHierarchy.has(childRoleId)) {
      this.roleHierarchy.set(childRoleId, []);
    }

    const parents = this.roleHierarchy.get(childRoleId)!;
    if (!parents.includes(parentRoleId)) {
      parents.push(parentRoleId);
    }
  }

  /**
   * 检查用户是否具有指定权限
   * @param userId - 用户ID
   * @param permissionId - 权限ID
   * @returns 如果用户具有权限则返回true，否则返回false
   */
  public checkPermission(userId: string, permissionId: string): boolean {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      return false;
    }

    // 检查用户直接拥有的角色
    for (const roleId of user.roles) {
      if (this.hasPermissionInRole(roleId, permissionId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查角色是否具有指定权限（包括继承的权限）
   * @param roleId - 角色ID
   * @param permissionId - 权限ID
   * @returns 如果角色具有权限则返回true，否则返回false
   */
  private hasPermissionInRole(roleId: string, permissionId: string): boolean {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    // 检查角色直接拥有的权限
    if (role.permissions.includes(permissionId as Permission)) {
      return true;
    }

    // 检查继承的角色权限
    const parentRoles = this.roleHierarchy.get(roleId) || [];
    for (const parentRoleId of parentRoles) {
      if (this.hasPermissionInRole(parentRoleId, permissionId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取用户的所有权限
   * @param userId - 用户ID
   * @returns 用户的所有权限ID数组
   */
  public getUserPermissions(userId: string): string[] {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      return [];
    }

    const permissions = new Set<string>();

    // 收集用户所有角色的权限
    for (const roleId of user.roles) {
      this.collectRolePermissions(roleId, permissions);
    }

    return Array.from(permissions);
  }

  /**
   * 递归收集角色的所有权限（包括继承的权限）
   * @param roleId - 角色ID
   * @param permissions - 权限集合
   */
  private collectRolePermissions(roleId: string, permissions: Set<string>): void {
    const role = this.roles.get(roleId);
    if (!role) {
      return;
    }

    // 添加角色直接拥有的权限
    role.permissions.forEach(permissionId => permissions.add(permissionId));

    // 添加继承角色的权限
    const parentRoles = this.roleHierarchy.get(roleId) || [];
    for (const parentRoleId of parentRoles) {
      this.collectRolePermissions(parentRoleId, permissions);
    }
  }

  /**
   * 获取所有角色
   * @returns 角色数组
   */
  public getRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  /**
   * 获取所有用户
   * @returns 用户数组
   */
  public getUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * 获取所有权限
   * @returns 权限数组
   */
  public getPermissions(): PermissionInfo[] {
    return Array.from(this.permissions.values());
  }

  /**
   * 根据ID获取角色
   * @param roleId - 角色ID
   * @returns 角色对象或undefined
   */
  public getRoleById(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  /**
   * 根据ID获取用户
   * @param userId - 用户ID
   * @returns 用户对象或undefined
   */
  public getUserById(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /**
   * 根据ID获取权限
   * @param permissionId - 权限ID
   * @returns 权限对象或undefined
   */
  public getPermissionById(permissionId: string): PermissionInfo | undefined {
    return this.permissions.get(permissionId);
  }

  /**
   * 初始化默认RBAC配置
   * 创建常用的角色、用户和权限
   */
  public initializeDefaultConfiguration(): void {
    // 添加基本权限
    const permissions: PermissionInfo[] = [
      { id: 'SELECT', name: 'SELECT', description: '执行SELECT查询' },
      { id: 'INSERT', name: 'INSERT', description: '执行INSERT操作' },
      { id: 'UPDATE', name: 'UPDATE', description: '执行UPDATE操作' },
      { id: 'DELETE', name: 'DELETE', description: '执行DELETE操作' },
      { id: 'CREATE', name: 'CREATE', description: '执行CREATE操作' },
      { id: 'DROP', name: 'DROP', description: '执行DROP操作' },
      { id: 'ALTER', name: 'ALTER', description: '执行ALTER操作' },
      { id: 'SHOW_TABLES', name: 'SHOW_TABLES', description: '查看表列表' },
      { id: 'DESCRIBE_TABLE', name: 'DESCRIBE_TABLE', description: '查看表结构' }
    ];

    // 添加权限到系统
    permissions.forEach(permission => {
      if (!this.getPermissionById(permission.id)) {
        this.addPermission(permission);
      }
    });

    // 添加基本角色
    const now = new Date();
    const adminRole: Role = {
      id: 'admin',
      name: '管理员',
      permissions: permissions.map(p => p.id as Permission),
      description: '系统管理员，拥有所有权限',
      createdAt: now,
      updatedAt: now
    };

    const userRole: Role = {
      id: 'user',
      name: '普通用户',
      permissions: [Permission.SELECT, Permission.SHOW_TABLES, Permission.DESCRIBE_TABLE],
      description: '普通用户，只能执行查询操作',
      createdAt: now,
      updatedAt: now
    };

    const editorRole: Role = {
      id: 'editor',
      name: '编辑者',
      permissions: [Permission.SELECT, Permission.INSERT, Permission.UPDATE, Permission.DELETE, Permission.SHOW_TABLES, Permission.DESCRIBE_TABLE],
      description: '编辑者，可以执行CRUD操作',
      createdAt: now,
      updatedAt: now
    };

    // 添加角色到系统
    if (!this.getRoleById('admin')) {
      this.addRole(adminRole);
    }
    if (!this.getRoleById('user')) {
      this.addRole(userRole);
    }
    if (!this.getRoleById('editor')) {
      this.addRole(editorRole);
    }

    // 添加默认用户
    const adminUser: User = {
      id: 'admin',
      username: 'admin',
      roles: ['admin'],
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    const defaultUser: User = {
      id: 'user',
      username: 'user',
      roles: ['user'],
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    // 添加用户到系统
    if (!this.getUserById('admin')) {
      this.addUser(adminUser);
    }
    if (!this.getUserById('user')) {
      this.addUser(defaultUser);
    }
  }
}

/**
 * 导出RBAC管理器实例
 */
export const rbacManager = new RBACManager();