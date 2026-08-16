/**
 * infrastructure/seed-rng.ts —— Mulberry32 种子化 RNG（实现 RNGService）
 * 快速、确定、可复现；游戏内所有随机必须走种子化 RNG（逻辑层禁止 Math.random）。
 */
import type { RNGService } from '../core/services/rng-service';

export class SeedRNG implements RNGService {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}
