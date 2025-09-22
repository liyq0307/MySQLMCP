/**
 * RBAC (基于角色的访问控制) 系统测试
 *
 * @description 测试RBAC系统的核心功能，包括角色管理、用户管理、权限分配和访问控制
 * @author liyq
 * @since 1.0.0
 */

import { RBACManager, rbacManager } from '../src/rbac.js';
import { Role, User, Permission, PermissionInfo } from '../src/rbac.js';
import { MySQLMCPError } from '../src/types.js';

describe('RBACManager', () => {
  let rbac: RBACManager;

  beforeEach(() => {
    // 为每个测试创建新的RBAC实例
    rbac = new RBACManager();
  });

  describe('基础的CRUD操作', () => {
    test('应该能够添加和检索角色', () => {
      const role: Role = {
        id: 'test_role',
        name: '测试角色',
        permissions: [Permission.SELECT, Permission.INSERT],
        description: '用于测试的角色',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      rbac.addRole(role);

      expect(rbac.getRoleById('test_role')).toEqual(role);
      expect(rbac.getRoles()).toContain(role);
    });

    test('应该能够添加和检索用户', () => {
      const user: User = {
        id: 'test_user',
        username: 'testuser',
        roles: ['user'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      rbac.addUser(user);

      expect(rbac.getUserById('test_user')).toEqual(user);
      expect(rbac.getUsers()).toContain(user);
    });

    test('应该能够添加和检索权限', () => {
      const permission: PermissionInfo = {
        id: 'TEST_PERMISSION',
        name: '测试权限',
        description: '用于测试的权限'
      };

      rbac.addPermission(permission);

      expect(rbac.getPermissionById('TEST_PERMISSION')).toEqual(permission);
      expect(rbac.getPermissions()).toContain(permission);
    });
  });

  describe('角色和权限分配', () => {
    const testRole: Role = {
      id: 'editor',
      name: '编辑者',
      permissions: [Permission.SELECT, Permission.INSERT],
      description: '编辑者角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const testUser: User = {
      id: 'user123',
      username: 'testuser',
      roles: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('应该能够为角色分配权限', () => {
      // 首先添加权限到系统
      rbac.addPermission({
        id: Permission.UPDATE,
        name: 'UPDATE',
        description: '执行UPDATE操作'
      });
      
      rbac.addRole(testRole);
      rbac.assignPermissionToRole('editor', Permission.UPDATE);

      const updatedRole = rbac.getRoleById('editor');
      expect(updatedRole?.permissions).toContain(Permission.UPDATE);
    });

    test('应该能够为用户分配角色', () => {
      rbac.addRole(testRole);
      rbac.addUser(testUser);

      rbac.assignRoleToUser('user123', 'editor');

      const updatedUser = rbac.getUserById('user123');
      expect(updatedUser?.roles).toContain('editor');
    });

    test('对于不存在的角色分配权限应该抛出错误', () => {
      rbac.addRole(testRole);
      rbac.addUser(testUser);

      expect(() => {
        rbac.assignRoleToUser('user123', 'nonexistent_role');
      }).toThrow(MySQLMCPError);

      expect(() => {
        rbac.assignRoleToUser('nonexistent_user', 'editor');
      }).toThrow(MySQLMCPError);

      expect(() => {
        rbac.assignPermissionToRole('nonexistent_role', Permission.UPDATE);
      }).toThrow(MySQLMCPError);
    });
  });

  describe('权限检查', () => {
    const adminRole: Role = {
      id: 'admin',
      name: '管理员',
      permissions: [Permission.SELECT, Permission.INSERT, Permission.UPDATE, Permission.DELETE],
      description: '管理员角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const userRole: Role = {
      id: 'user',
      name: '普通用户',
      permissions: [Permission.SELECT],
      description: '普通用户角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const normalUser: User = {
      id: 'normal_user',
      username: 'normaluser',
      roles: ['user'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const adminUser: User = {
      id: 'admin_user',
      username: 'adminuser',
      roles: ['admin'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const inactiveUser: User = {
      id: 'inactive_user',
      username: 'inactiveuser',
      roles: ['user'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    beforeEach(() => {
      rbac.addRole(adminRole);
      rbac.addRole(userRole);
      rbac.addUser(normalUser);
      rbac.addUser(adminUser);
      rbac.addUser(inactiveUser);
    });

    test('应该能够正确检查用户权限', () => {
      expect(rbac.checkPermission('normal_user', Permission.SELECT)).toBe(true);
      expect(rbac.checkPermission('normal_user', Permission.UPDATE)).toBe(false);

      expect(rbac.checkPermission('admin_user', Permission.SELECT)).toBe(true);
      expect(rbac.checkPermission('admin_user', Permission.UPDATE)).toBe(true);
      expect(rbac.checkPermission('admin_user', Permission.DELETE)).toBe(true);
    });

    test('对于非活跃用户的权限检查应该返回false', () => {
      expect(rbac.checkPermission('inactive_user', Permission.SELECT)).toBe(false);
    });

    test('对于不存在的用户的权限检查应该返回false', () => {
      expect(rbac.checkPermission('nonexistent_user', Permission.SELECT)).toBe(false);
    });
  });

  describe('角色继承', () => {
    const adminRole: Role = {
      id: 'admin',
      name: '管理员',
      permissions: [Permission.INSERT, Permission.UPDATE, Permission.DELETE],
      description: '管理员角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const editorRole: Role = {
      id: 'editor',
      name: '编辑者',
      permissions: [Permission.SELECT, Permission.INSERT],
      description: '编辑者角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const readerRole: Role = {
      id: 'reader',
      name: '读者',
      permissions: [Permission.SELECT],
      description: '读者角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const user: User = {
      id: 'user_with_inheritance',
      username: 'inheritanceuser',
      roles: ['reader'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    beforeEach(() => {
      rbac.addRole(adminRole);
      rbac.addRole(editorRole);
      rbac.addRole(readerRole);
      rbac.addUser(user);

      // 设置角色继承：reader -> editor -> admin
      rbac.setRoleInheritance('reader', 'editor');
      rbac.setRoleInheritance('editor', 'admin');
    });

    test('应该通过角色继承获得上级角色的权限', () => {
      expect(rbac.checkPermission('user_with_inheritance', Permission.SELECT)).toBe(true); // 直接权限
      expect(rbac.checkPermission('user_with_inheritance', Permission.INSERT)).toBe(true); // 继承自editor
      expect(rbac.checkPermission('user_with_inheritance', Permission.UPDATE)).toBe(true); // 继承自admin
      expect(rbac.checkPermission('user_with_inheritance', Permission.DELETE)).toBe(true); // 继承自admin
    });

    test('getUserPermissions应该包含继承的权限', () => {
      const userPermissions = rbac.getUserPermissions('user_with_inheritance');

      expect(userPermissions).toContain(Permission.SELECT);
      expect(userPermissions).toContain(Permission.INSERT);
      expect(userPermissions).toContain(Permission.UPDATE);
      expect(userPermissions).toContain(Permission.DELETE);
    });
  });

  describe('角色继承错误处理', () => {
    test('为不存在的角色设置继承应该抛出错误', () => {
      expect(() => {
        rbac.setRoleInheritance('nonexistent_child', 'nonexistent_parent');
      }).toThrow(MySQLMCPError);

      expect(() => {
        rbac.setRoleInheritance('child', 'parent');
      }).toThrow(MySQLMCPError);
    });
  });

  describe('权限聚合', () => {
    const selectOnlyRole: Role = {
      id: 'select_role',
      name: '只读角色',
      permissions: [Permission.SELECT, Permission.SHOW_TABLES],
      description: '只读角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const writeOnlyRole: Role = {
      id: 'write_role',
      name: '只写角色',
      permissions: [Permission.INSERT, Permission.UPDATE, Permission.DELETE],
      description: '只写角色',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const multiRoleUser: User = {
      id: 'multi_role_user',
      username: 'multiroleuser',
      roles: ['select_role', 'write_role'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    beforeEach(() => {
      rbac.addRole(selectOnlyRole);
      rbac.addRole(writeOnlyRole);
      rbac.addUser(multiRoleUser);
    });

    test('用户应该聚合多个角色的权限', () => {
      expect(rbac.checkPermission('multi_role_user', Permission.SELECT)).toBe(true);
      expect(rbac.checkPermission('multi_role_user', Permission.SHOW_TABLES)).toBe(true);
      expect(rbac.checkPermission('multi_role_user', Permission.INSERT)).toBe(true);
      expect(rbac.checkPermission('multi_role_user', Permission.UPDATE)).toBe(true);
      expect(rbac.checkPermission('multi_role_user', Permission.DELETE)).toBe(true);
      expect(rbac.checkPermission('multi_role_user', Permission.CREATE)).toBe(false);
    });

    test('getUserPermissions应该返回所有角色的权限集合', () => {
      const userPermissions = rbac.getUserPermissions('multi_role_user');

      expect(userPermissions).toEqual(
        expect.arrayContaining([
          Permission.SELECT,
          Permission.SHOW_TABLES,
          Permission.INSERT,
          Permission.UPDATE,
          Permission.DELETE
        ])
      );
      expect(userPermissions).not.toContain(Permission.CREATE);
    });
  });

  describe('默认配置初始化', () => {
    test('应该能够初始化默认RBAC配置', () => {
      rbac.initializeDefaultConfiguration();

      // 检查默认角色是否创建
      const adminRole = rbac.getRoleById('admin');
      const userRole = rbac.getRoleById('user');
      const editorRole = rbac.getRoleById('editor');

      expect(adminRole).toBeDefined();
      expect(userRole).toBeDefined();
      expect(editorRole).toBeDefined();

      // 检查默认用户是否创建
      const adminUser = rbac.getUserById('admin');
      const defaultUser = rbac.getUserById('user');

      expect(adminUser).toBeDefined();
      expect(defaultUser).toBeDefined();

      // 检查管理员角色是否有所有权限
      expect(adminRole?.permissions).toContain(Permission.SELECT);
      expect(adminRole?.permissions).toContain(Permission.INSERT);
      expect(adminRole?.permissions).toContain(Permission.UPDATE);
      expect(adminRole?.permissions).toContain(Permission.DELETE);

      // 检查普通用户角色只有查询权限
      expect(userRole?.permissions).toContain(Permission.SELECT);
      expect(userRole?.permissions).toContain(Permission.SHOW_TABLES);
      expect(userRole?.permissions).toContain(Permission.DESCRIBE_TABLE);

      // 检查编辑者角色有CRUD权限
      expect(editorRole?.permissions).toEqual(
        expect.arrayContaining([
          Permission.SELECT,
          Permission.INSERT,
          Permission.UPDATE,
          Permission.DELETE,
          Permission.SHOW_TABLES,
          Permission.DESCRIBE_TABLE
        ])
      );
    });

    test('重复初始化不应该导致重复创建', () => {
      rbac.initializeDefaultConfiguration();

      // 获取初始化后的角色数量
      const initialRoleCount = rbac.getRoles().length;
      const initialUserCount = rbac.getUsers().length;

      // 再次初始化
      rbac.initializeDefaultConfiguration();

      // 数量应该保持不变
      expect(rbac.getRoles().length).toBe(initialRoleCount);
      expect(rbac.getUsers().length).toBe(initialUserCount);
    });
  });

  describe('权限验证集成测试', () => {
    beforeEach(() => {
      // 设置完整的RBAC场景
      rbac.initializeDefaultConfiguration();
    });

    test('管理员应该拥有所有权限', () => {
      const adminPermissions = rbac.getUserPermissions('admin');

      // 管理员应该拥有所有默认权限
      expect(adminPermissions).toContain(Permission.SELECT);
      expect(adminPermissions).toContain(Permission.INSERT);
      expect(adminPermissions).toContain(Permission.UPDATE);
      expect(adminPermissions).toContain(Permission.DELETE);
      expect(adminPermissions).toContain(Permission.CREATE);
      expect(adminPermissions).toContain(Permission.DROP);
      expect(adminPermissions).toContain(Permission.ALTER);
      expect(adminPermissions).toContain(Permission.SHOW_TABLES);
      expect(adminPermissions).toContain(Permission.DESCRIBE_TABLE);

      // 权限检查也应该通过
      expect(rbac.checkPermission('admin', Permission.SELECT)).toBe(true);
      expect(rbac.checkPermission('admin', Permission.UPDATE)).toBe(true);
      expect(rbac.checkPermission('admin', Permission.DROP)).toBe(true);
    });

    test('普通用户只能拥有查询相关权限', () => {
      const userPermissions = rbac.getUserPermissions('user');

      // 普通用户只能拥有查询权限
      expect(userPermissions).toEqual(
        expect.arrayContaining([
          Permission.SELECT,
          Permission.SHOW_TABLES,
          Permission.DESCRIBE_TABLE
        ])
      );

      // 不应该拥有修改权限
      expect(userPermissions).not.toContain(Permission.INSERT);
      expect(userPermissions).not.toContain(Permission.UPDATE);
      expect(userPermissions).not.toContain(Permission.DELETE);

      // 权限检查验证
      expect(rbac.checkPermission('user', Permission.SELECT)).toBe(true);
      expect(rbac.checkPermission('user', Permission.INSERT)).toBe(false);
    });
  });
});

describe('rbacManager 单例实例', () => {
  test('应该能够访问全局RBAC管理器实例', () => {
    expect(rbacManager).toBeInstanceOf(RBACManager);

    // 应该能够正常使用全局实例
    rbacManager.initializeDefaultConfiguration();

    const adminRole = rbacManager.getRoleById('admin');
    expect(adminRole).toBeDefined();

    const adminUser = rbacManager.getUserById('admin');
    expect(adminUser).toBeDefined();
  });
});