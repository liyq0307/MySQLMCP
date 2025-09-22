/**
 * 中央化内存压力管理器
 *
 * 统一的内存压力计算和分发系统，避免多个组件重复计算内存压力。
 * 使用观察者模式通知所有订阅组件压力变化。
 *
 * @fileoverview 中央化内存压力管理
 * @author liyq
 * @version 1.0.0
 * @since 1.0.0
 * @license MIT
 */

import { MemoryUtils } from './utils/common.js';
import { logger } from './logger.js';

/**
 * 内存压力观察者接口
 */
export interface MemoryPressureObserver {
  onPressureChange(pressure: number): void;
}

/**
 * 内存压力管理器
 *
 * 单例模式的内存压力计算和分发中心
 *
 * @class MemoryPressureManager
 */
export class MemoryPressureManager {
  private static instance: MemoryPressureManager | null = null;
  private observers: MemoryPressureObserver[] = [];
  private currentPressure: number = 0;
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_THRESHOLD = 0.05; // 5%变化才通知
  private readonly UPDATE_INTERVAL = 10000; // 10秒更新间隔

  private constructor() {
    this.startMonitoring();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MemoryPressureManager {
    if (!MemoryPressureManager.instance) {
      MemoryPressureManager.instance = new MemoryPressureManager();
    }
    return MemoryPressureManager.instance;
  }

  /**
   * 订阅内存压力变化
   */
  public subscribe(observer: MemoryPressureObserver): void {
    this.observers.push(observer);
    // 立即通知当前压力
    observer.onPressureChange(this.currentPressure);
  }

  /**
   * 取消订阅
   */
  public unsubscribe(observer: MemoryPressureObserver): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * 获取当前内存压力级别
   */
  public getCurrentPressure(): number {
    return this.currentPressure;
  }

  /**
   * 强制更新内存压力
   */
  public forceUpdate(): void {
    this.updatePressure();
  }

  /**
   * 开始监控
   */
  private startMonitoring(): void {
    if (this.updateInterval) {
      return;
    }

    // 立即计算一次
    this.updatePressure();

    // 定期更新，使用unref避免阻止进程退出
    this.updateInterval = setInterval(() => {
      this.updatePressure();
    }, this.UPDATE_INTERVAL);
    this.updateInterval.unref();
  }

  /**
   * 停止监控
   */
  public stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * 计算内存压力级别
   */
  private calculatePressure(): number {
    try {
      const memUsage = MemoryUtils.getCurrentUsage();
      
      // 基于堆使用率计算压力
      const heapPressure = memUsage.heapUsed / memUsage.heapTotal;
      
      // 基于RSS和系统内存计算压力（假设2GB基准）
      const totalMemoryBase = 2 * 1024 * 1024 * 1024; // 2GB
      const rssPressure = memUsage.rss / totalMemoryBase;
      
      // 综合压力级别，确保在0.2-1范围内
      const combinedPressure = Math.max(heapPressure, rssPressure);
      return Math.max(0.2, Math.min(1, combinedPressure * 1.2));
    } catch (error) {
      logger.warn('Failed to calculate memory pressure:', undefined, { error: (error as Error).message });
      return 0.5; // 默认中等压力
    }
  }

  /**
   * 更新内存压力并通知观察者
   */
  private updatePressure(): void {
    try {
      const newPressure = this.calculatePressure();
      const pressureChange = Math.abs(newPressure - this.currentPressure);
      
      // 只有变化超过阈值才通知
      if (pressureChange > this.UPDATE_THRESHOLD) {
        this.currentPressure = newPressure;
        this.notifyObservers(newPressure);
      }
    } catch (error) {
      logger.warn('Failed to update memory pressure:', undefined, { error: (error as Error).message });
    }
  }

  /**
   * 通知所有观察者
   */
  private notifyObservers(pressure: number): void {
    this.observers.forEach(observer => {
      try {
        observer.onPressureChange(pressure);
      } catch (error) {
        logger.warn('Memory pressure observer failed:', undefined, { error: (error as Error).message });
      }
    });
  }
}

/**
 * 导出单例实例
 */
export const memoryPressureManager = MemoryPressureManager.getInstance();