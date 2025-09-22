/**
 * 文件操作工具函数
 * 
 * 提供项目中常用的文件操作工具函数，避免代码重复。
 * 
 * @fileoverview 文件操作工具函数集合
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * 确保目录存在
 * 
 * 创建目录（包括必要的父目录），如果目录已存在则不执行任何操作。
 * 这是一个安全的目录创建方法，避免重复创建目录时的错误。
 * 
 * @param dirPath - 要确保存在的目录路径
 * @returns Promise<void>
 * 
 * @example
 * await ensureDirectoryExists('./backups');
 * await ensureDirectoryExists('/path/to/nested/directory');
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // 如果目录已存在，忽略错误
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * 安全地删除文件
 * 
 * 删除文件，如果文件不存在则不执行任何操作。
 * 
 * @param filePath - 要删除的文件路径
 * @returns Promise<boolean> 是否成功删除
 * 
 * @example
 * await safeDeleteFile('./temp.txt');
 */
export async function safeDeleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    // 如果文件不存在，忽略错误
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return false;
  }
}

/**
 * 获取文件扩展名
 * 
 * 安全地获取文件扩展名，处理边界情况。
 * 
 * @param filePath - 文件路径
 * @returns string 文件扩展名（包括点号），如果没有扩展名则返回空字符串
 * 
 * @example
 * getFileExtension('file.txt'); // '.txt'
 * getFileExtension('file'); // ''
 */
export function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.toLowerCase();
}

/**
 * 生成安全的文件名
 * 
 * 根据给定的名称生成安全的文件名，移除非法字符。
 * 
 * @param name - 原始名称
 * @param extension - 文件扩展名（可选）
 * @returns string 安全的文件名
 * 
 * @example
 * generateSafeFileName('my file name', '.txt'); // 'my_file_name.txt'
 */
export function generateSafeFileName(name: string, extension: string = ''): string {
  // 移除非法字符，替换为空格，然后将空格替换为下划线
  // 非法字符包括：< > : " / \ | ? * 以及控制字符(0-31)
  let safeName = name
    .replace(/[<>:"/\\|?*]/g, ' ');  // 移除常见非法字符
  
  // 逐个移除控制字符(0-31)
  for (let i = 0; i < 32; i++) {
    safeName = safeName.replace(new RegExp(String.fromCharCode(i), 'g'), ' ');
  }
  
  safeName = safeName
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
  
  // 限制长度
  const maxLength = 255 - extension.length;
  const truncatedName = safeName.substring(0, maxLength);
  
  return truncatedName + extension;
}