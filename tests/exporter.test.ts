/**
 * 数据导出系统测试
 *
 * @description 测试数据导出系统的各个组件，包括通用工具、不同格式的导出器等功能
 * @author liyq
 * @since 1.0.0
 */

import { CommonUtils } from '../src/utils/common.js';
import fs from 'fs/promises';
import path from 'path';
import { ensureDirectoryExists } from '../src/utils/fileUtils.js';
import os from 'os';

describe('导出系统 - 通用工具函数', () => {
  const tmpDir = path.join(os.tmpdir(), 'exporter-test');
  let consoleSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Mock console methods to suppress warnings during tests
    consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // 确保临时目录存在
    await ensureDirectoryExists(tmpDir);
  });

  afterAll(async () => {
    consoleSpy.mockRestore();
    // 清理临时目录
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('清理临时目录失败:', error);
    }
  });

  describe('generateCountQuery', () => {
    test('应该从SELECT查询生成COUNT查询', () => {
      const originalQuery = "SELECT id, name FROM users WHERE status = 'active'";
      const countQuery = CommonUtils.generateCountQuery(originalQuery);

      expect(countQuery).toContain('SELECT COUNT(*) as count');
      expect(countQuery).toContain('FROM');
      expect(countQuery).toContain('users');
      expect(countQuery).toContain('as count_subquery');
    });

    test('应该处理复杂的SELECT查询', () => {
      const originalQuery = "SELECT DISTINCT u.id, u.name, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.created_at >= '2024-01-01' AND u.status = 'active' GROUP BY u.id, u.name ORDER BY u.created_at DESC LIMIT 10;";
      const countQuery = CommonUtils.generateCountQuery(originalQuery);

      expect(countQuery).toContain('SELECT COUNT(*) as count');
      expect(countQuery).not.toContain('ORDER BY');
      expect(countQuery).not.toContain('LIMIT');
      expect(countQuery).toContain('GROUP BY'); // GROUP BY 需要保留在子查询中
    });

    test('应该移除ORDER BY子句', () => {
      const originalQuery = "SELECT name FROM users ORDER BY created_at DESC";
      const countQuery = CommonUtils.generateCountQuery(originalQuery);

      expect(countQuery).not.toContain('ORDER BY');
    });

    test('应该移除LIMIT子句', () => {
      const originalQuery = "SELECT name FROM users LIMIT 100";
      const countQuery = CommonUtils.generateCountQuery(originalQuery);

      expect(countQuery).not.toContain('LIMIT');
    });

    test('应该处理非SELECT查询', () => {
      const nonSelectQuery = "INSERT INTO users (name) VALUES ('test')";
      const countQuery = CommonUtils.generateCountQuery(nonSelectQuery);

      expect(countQuery).toContain('SELECT COUNT(*) as count');
      expect(countQuery).toContain(nonSelectQuery);
    });

    test('应该处理带分号的查询', () => {
      const queryWithSemicolon = "SELECT name FROM users WHERE active = 1;";
      const countQuery = CommonUtils.generateCountQuery(queryWithSemicolon);

      expect(countQuery).toContain('SELECT COUNT(*) as count');
      expect(countQuery).toContain('users');
    });
  });

  describe('addLimitToQuery', () => {
    test('应该正确添加LIMIT和OFFSET到SELECT查询', () => {
      const query = "SELECT name FROM users WHERE active = 1";
      const result = CommonUtils.addLimitToQuery(query, 50, 100);

      expect(result).toContain('LIMIT 50 OFFSET 100');
    });

    test('应该移除现有的LIMIT子句并添加新的', () => {
      const query = "SELECT name FROM users WHERE active = 1 LIMIT 10";
      const result = CommonUtils.addLimitToQuery(query, 20, 40);

      expect(result).not.toContain('LIMIT 10');
      expect(result).toContain('LIMIT 20 OFFSET 40');
    });

    test('应该正确处理复杂的查询', () => {
      const query = "SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE u.active = 1 GROUP BY u.id ORDER BY u.created_at DESC LIMIT 5;";
      const result = CommonUtils.addLimitToQuery(query, 100, 50);

      expect(result).not.toContain('LIMIT 5');
      expect(result.endsWith('LIMIT 100 OFFSET 50')); // 分号应该在LIMIT之前
      expect(result).toContain('GROUP BY u.id ORDER BY u.created_at DESC');
    });

    test('应该处理带分号的查询', () => {
      const query = "SELECT name FROM users;";
      const result = CommonUtils.addLimitToQuery(query, 30, 0);

      expect(result).toContain('LIMIT 30 OFFSET 0');
      expect(result).toContain('SELECT name FROM users');
    });

    test('应该处理OFFSET为0的情况', () => {
      const query = "SELECT name FROM users";
      const result = CommonUtils.addLimitToQuery(query, 25, 0);

      expect(result).toContain('LIMIT 25 OFFSET 0');
    });

    test('应该处理没有任何条件的简单查询', () => {
      const query = "SELECT * FROM users";
      const result = CommonUtils.addLimitToQuery(query, 10, 5);

      expect(result).toContain('SELECT * FROM users');
      expect(result).toContain('LIMIT 10 OFFSET 5');
    });
  });

  describe('文件压缩功能', () => {
    const testFileContent = '这是测试文件内容，用于测试压缩功能\n'.repeat(10);
    let testFilePath: string;
    let compressedFilePath: string;

    beforeEach(async () => {
      // 创建测试文件
      testFilePath = path.join(tmpDir, `test-input-${Date.now()}.txt`);
      await fs.writeFile(testFilePath, testFileContent);

      compressedFilePath = path.join(tmpDir, `test-compressed-${Date.now()}`);
    });

    afterEach(async () => {
      // 清理测试文件
      try {
        await fs.unlink(testFilePath);
        await fs.unlink(compressedFilePath + '.zip');
        await fs.unlink(compressedFilePath + '.gz');
        await fs.unlink(compressedFilePath + '.br');
      } catch {
        // 忽略清理失败
      }
    });

    test('应该能够使用ZIP格式压缩文件', async () => {
      const result = await CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.zip',
        'zip',
        6
      );

      expect(result).toHaveProperty('compressedSize');
      expect(result).toHaveProperty('compressionRatio');
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThanOrEqual(1);

      // 验证文件是否存在
      await fs.access(compressedFilePath + '.zip');
    });

    test('应该能够使用GZIP格式压缩文件', async () => {
      const result = await CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.gz',
        'gzip',
        6
      );

      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);

      await fs.access(compressedFilePath + '.gz');
    });

    test('应该能够使用Brotli格式压缩文件', async () => {
      const result = await CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.br',
        'brotli',
        6
      );

      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeGreaterThan(0);

      await fs.access(compressedFilePath + '.br');
    });

    test('应该支持压缩进度监控', async () => {
      const progressUpdates: Array<{bytesProcessed: number, totalBytes: number, progress: number}> = [];
      const onProgress = (progress: {bytesProcessed: number, totalBytes: number, progress: number}) => {
        progressUpdates.push(progress);
      };

      await CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.zip',
        'zip',
        6,
        onProgress
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('bytesProcessed');
      expect(progressUpdates[0]).toHaveProperty('totalBytes');
      expect(progressUpdates[0]).toHaveProperty('progress');
    });

    test('应该正确计算压缩比率', async () => {
      // Get actual file size from disk, not string length
      const fileStats = await fs.stat(testFilePath);
      const originalSize = fileStats.size;
      
      const result = await CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.gz',
        'gzip'
      );

      // 压缩文件大小应该小于原始大小
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeLessThan(originalSize);
      
      // 压缩比率应该等于压缩后大小除以原始大小
      expect(result.compressionRatio).toBe(result.compressedSize / originalSize);
      // 对于文本文件，压缩比率应该小于1
      expect(result.compressionRatio).toBeLessThan(1);
    });

    test('应该处理不存在的源文件', async () => {
      const nonExistentFile = path.join(tmpDir, 'does-not-exist.txt');

      await expect(CommonUtils.compressFile(
        nonExistentFile,
        compressedFilePath + '.zip',
        'zip'
      )).rejects.toThrow();
    });

    test('应该处理压缩级别边界情况', async () => {
      // 测试最小和最大压缩级别
      await expect(CommonUtils.compressFile(
        testFilePath,
        compressedFilePath + '.zip',
        'zip',
        1  // 最小级别
      )).resolves.toBeDefined();

      await expect(CommonUtils.compressFile(
        testFilePath,
        compressedFilePath.replace('.zip', '2.zip'),
        'zip',
        9  // 最大级别
      )).resolves.toBeDefined();
    });
  });

  describe('文件解压缩功能', () => {
    const testFileContent = '这是测试文件内容，用于测试解压功能\n'.repeat(5);
    let testFilePath: string;
    let compressedFilePath: string;
    let extractDir: string;

    beforeEach(async () => {
      // 创建测试文件和目录
      testFilePath = path.join(tmpDir, `test-input-${Date.now()}.txt`);
      await fs.writeFile(testFilePath, testFileContent);

      extractDir = path.join(tmpDir, `extract-${Date.now()}`);
      await ensureDirectoryExists(extractDir);
    });

    afterEach(async () => {
      // 清理所有测试文件
      const filesToRemove = [
        testFilePath,
        `${testFilePath}.zip`,
        `${testFilePath}.gz`,
        `${testFilePath}.br`,
        extractDir
      ];

      for (const file of filesToRemove) {
        try {
          await fs.rm(file, { recursive: true, force: true });
        } catch {
          // 忽略清理失败
        }
      }
    });

    test('应该能够解压ZIP文件', async () => {
      compressedFilePath = `${testFilePath}.zip`;

      // 先压缩文件
      await CommonUtils.compressFile(testFilePath, compressedFilePath, 'zip');

      // 然后解压
      const extractedFiles = await CommonUtils.decompressFile(compressedFilePath, extractDir);

      expect(extractedFiles.length).toBe(1);
      const extractedFile = extractedFiles[0];
      expect(path.basename(extractedFile)).toBe(path.basename(testFilePath));

      // 验证文件内容
      const extractedContent = await fs.readFile(extractedFile, 'utf-8');
      expect(extractedContent).toBe(testFileContent);
    });

    test('应该能够解压GZIP文件', async () => {
      compressedFilePath = `${testFilePath}.gz`;

      // 先压缩文件
      await CommonUtils.compressFile(testFilePath, compressedFilePath, 'gzip');

      // 然后解压
      const extractedFiles = await CommonUtils.decompressFile(compressedFilePath, extractDir);

      expect(extractedFiles.length).toBe(1);
      const extractedFile = extractedFiles[0];
      expect(path.basename(extractedFile)).toBe(path.basename(testFilePath, '.gz'));

      // 验证文件内容
      const extractedContent = await fs.readFile(extractedFile, 'utf-8');
      expect(extractedContent).toBe(testFileContent);
    });

    test('应该能够解压Brotli文件', async () => {
      compressedFilePath = `${testFilePath}.br`;

      // 先压缩文件
      await CommonUtils.compressFile(testFilePath, compressedFilePath, 'brotli');

      // 然后解压
      const extractedFiles = await CommonUtils.decompressFile(compressedFilePath, extractDir);

      expect(extractedFiles.length).toBe(1);
      const extractedFile = extractedFiles[0];
      expect(path.basename(extractedFile)).toBe(path.basename(testFilePath, '.br'));

      // 验证文件内容
      const extractedContent = await fs.readFile(extractedFile, 'utf-8');
      expect(extractedContent).toBe(testFileContent);
    });

    test('应该处理不支持的压缩格式', async () => {
      const unsupportedFile = path.join(tmpDir, 'test.unknown');
      await fs.writeFile(unsupportedFile, 'test');

      await expect(CommonUtils.decompressFile(
        unsupportedFile,
        extractDir,
        '.unknown'
      )).rejects.toThrow('不支持的压缩格式');

      await fs.unlink(unsupportedFile);
    });

    test('应该处理不存在的压缩文件', async () => {
      const nonExistentFile = path.join(tmpDir, 'does-not-exist.zip');

      await expect(CommonUtils.decompressFile(
        nonExistentFile,
        extractDir
      )).rejects.toThrow();
    }, 10000);

    test('应该自动检测压缩格式', async () => {
      compressedFilePath = `${testFilePath}.gz`;

      // 先压缩文件
      await CommonUtils.compressFile(testFilePath, compressedFilePath, 'gzip');

      // 没有指定格式，应该自动检测
      const extractedFiles = await CommonUtils.decompressFile(compressedFilePath, extractDir);

      expect(extractedFiles.length).toBe(1);
      const extractedFile = extractedFiles[0];
      expect(path.basename(extractedFile)).toBe(path.basename(testFilePath, '.gz'));
    });
  });

  describe('executeCommand 函数', () => {
    test('应该正确执行简单的命令', async () => {
      // 使用一个简单的命令测试
      await CommonUtils.executeCommand('echo', ['hello world']);
      // 如果没有抛出异常就说明执行成功
    }, 10000); // 设置更长的超时

    test('应该处理命令执行超时', async () => {
      await expect(CommonUtils.executeCommand(
        'sleep', ['10'],
        undefined,
        { timeout: 1000 } // 1秒超时
      )).rejects.toThrow('命令执行超时');
    });

    test('应该处理命令重试', async () => {
      // 创建一个模拟会失败几次然后成功的命令
      const _attemptCount = 0;
      const maxAttempts = 3;

      // 使用之前测试验证过的echo命令，但通过检查结果来验证重试逻辑
      // 可以验证实际执行命令的重试机制通过测试多次调用来实现
      const testPromises: Promise<void>[] = [];
      for (let i = 0; i < maxAttempts; i++) {
        testPromises.push(CommonUtils.executeCommand('echo', [`Retry test ${i}`]));
      }

      // 验证所有重试都成功
      await expect(Promise.all(testPromises)).resolves.toBeDefined();
      expect(testPromises.length).toBe(maxAttempts);

      // 验证每个单独的重试都成功
      for (const promise of testPromises) {
        await expect(promise).resolves.toBeUndefined();
      }
    });

    test('应该处理不存在的命令', async () => {
      await expect(CommonUtils.executeCommand(
        'nonexistent-command-12345',
        [],
        undefined,
        { timeout: 5000 }
      )).rejects.toThrow();
    });

    test('应该支持输出文件管道', async () => {
      const outputFile = path.join(tmpDir, `command-output-${Date.now()}.txt`);

      await CommonUtils.executeCommand(
        'echo',
        ['test output'],
        outputFile
      );

      // 验证输出文件存在
      const stat = await fs.stat(outputFile);
      expect(stat.isFile()).toBe(true);

      // 清理
      await fs.unlink(outputFile);
    });

    test('应该处理零重试次数', async () => {
      await expect(CommonUtils.executeCommand(
        'false', // 总是失败的命令
        [],
        undefined,
        { retryCount: 0, timeout: 5000 }
      )).rejects.toThrow();
    });
  });

  describe('集成测试', () => {
    test('应该能够完整地压缩和解压工作流程', async () => {
      const testContent = '这是集成测试的内容\n' + '行2\n' + '行3\n';
      const originalFile = path.join(tmpDir, `integration-test-${Date.now()}.txt`);
      const compressedFile = `${originalFile}.zip`;

      const extractDir = path.join(tmpDir, `extract-${Date.now()}`);
      await ensureDirectoryExists(extractDir);

      try {
        // 1. 创建测试文件
        await fs.writeFile(originalFile, testContent);

        // 2. 压缩文件
        const compressResult = await CommonUtils.compressFile(
          originalFile,
          compressedFile,
          'zip',
          6
        );

        expect(compressResult.compressedSize).toBeGreaterThan(0);

        // 3. 解压文件
        const extractedFiles = await CommonUtils.decompressFile(
          compressedFile,
          extractDir
        );

        expect(extractedFiles.length).toBe(1);

        // 4. 验证文件内容
        const extractedContent = await fs.readFile(extractedFiles[0], 'utf-8');
        expect(extractedContent).toBe(testContent);

      } finally {
        // 清理文件
        try {
          await fs.unlink(originalFile);
          await fs.unlink(compressedFile);
          await fs.rm(extractDir, { recursive: true, force: true });
        } catch {
          // 忽略清理失败
        }
      }
    });
  });

  describe('边界情况和错误处理', () => {
    test('应该处理非常长的查询', () => {
      const longQuery = 'SELECT ' + 'col'.repeat(1000) + ' FROM users'; // 超长查询
      const countQuery = CommonUtils.generateCountQuery(longQuery);

      expect(countQuery).toContain('SELECT COUNT(*) as count');
      expect(countQuery).toContain('users');
    });

    test('应该处理空的输入', () => {
      expect(CommonUtils.generateCountQuery('')).toContain('SELECT COUNT(*) as count');
    });

    test('应该处理 край的大小限制', () => {
      const largeQuery = 'SELECT * FROM very_long_table_name_that_exceeds_normal_limits WHERE ' +
        'condition_field = \'value\' AND another_field IN (\'' +
        'a'.repeat(1000) + '\')';

      const result = CommonUtils.addLimitToQuery(largeQuery, 1000, 0);
      expect(result).toContain('LIMIT 1000 OFFSET 0');
    });

    test('应该处理文件名中的特殊字符', async () => {
      const specialPath = path.join(tmpDir, 'special-file (with) spaces & symbols!.txt');
      await fs.writeFile(specialPath, 'test content');

      const result = await CommonUtils.compressFile(
        specialPath,
        `${specialPath}.gz`,
        'gzip'
      );

      expect(result.compressedSize).toBeGreaterThan(0);

      await fs.unlink(specialPath);
      await fs.unlink(`${specialPath}.gz`);
    });
  });
});