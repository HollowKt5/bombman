/**
 * src/test/powerup.test.ts —— 道具掉落权重 / 拾取效果 / 上限
 * v1.4.7 道具表：💣炸弹(可用数+1) / 🧪爆炸药(威力+1) / 👟疾跑鞋(×1.08) / 🧤手套 / ❤️心(回血) / 🦖坐骑
 */
import { describe, it, expect } from 'vitest';
import { powerUpEffect } from '../core/rules/powerup';
import { rollBlockDrop } from '../core/domain/entity';
import { SeedRNG } from '../infrastructure/seed-rng';
import { PowerUpType } from '../shared/types';
import { BLOCK_DROP_TABLE, BLOCK_DROP_TABLE_AI, TUNING } from '../shared/constants';
import type { RNGService } from '../core/services/rng-service';
import { fakePlayer } from './helpers';

describe('powerUpEffect', () => {
  it('炸弹：可用炸弹数 +1（不修改入参）', () => {
    const p = fakePlayer();
    const e = powerUpEffect(p, PowerUpType.BOMB_COUNT);
    expect(e.patch.maxBombs).toBe(2);
    expect(p.maxBombs).toBe(1);
  });

  it('炸弹：上限截断', () => {
    const p = fakePlayer({ maxBombs: TUNING.bomb.maxMaxBombs });
    const e = powerUpEffect(p, PowerUpType.BOMB_COUNT);
    expect(e.maxedOut).toBe(true);
  });

  it('爆炸药：威力 +1（爆炸格子 +1）', () => {
    const p = fakePlayer();
    const e = powerUpEffect(p, PowerUpType.BOMB_RANGE);
    expect(e.patch.bombRange).toBe(2);
    expect(p.bombRange).toBe(1);
  });

  it('疾跑鞋：移速 ×1.08（加成减小）', () => {
    const e = powerUpEffect(fakePlayer(), PowerUpType.SPEED);
    expect(e.patch.speed).toBeCloseTo(3.24);
  });

  it('疾跑鞋：上限截断', () => {
    const p = fakePlayer({ speed: TUNING.player.maxSpeed });
    const e = powerUpEffect(p, PowerUpType.SPEED);
    expect(e.maxedOut).toBe(true);
  });

  it('手套：解锁踢泡', () => {
    const e = powerUpEffect(fakePlayer(), PowerUpType.KICK);
    expect(e.patch.kick).toBe(true);
  });

  it('心：回复 1 点生命', () => {
    const p = fakePlayer({ hp: 1 });
    const e = powerUpEffect(p, PowerUpType.HEART);
    expect(e.patch.hp).toBe(2);
  });

  it('心：满血时无效', () => {
    const p = fakePlayer({ hp: 3, maxHp: 3 });
    const e = powerUpEffect(p, PowerUpType.HEART);
    expect(e.maxedOut).toBe(true);
  });
});

describe('rollBlockDrop', () => {
  it('固定种子可复现', () => {
    const rng1 = new SeedRNG(12345);
    const rng2 = new SeedRNG(12345);
    for (let i = 0; i < 100; i++) {
      expect(rollBlockDrop(rng1)).toBe(rollBlockDrop(rng2));
    }
  });

  it('只产出掉落表内的类型或 null', () => {
    const rng = new SeedRNG(999);
    const valid = new Set<number | null>(BLOCK_DROP_TABLE.map(([t]) => t));
    for (let i = 0; i < 200; i++) {
      expect(valid.has(rollBlockDrop(rng))).toBe(true);
    }
  });

  it('掉落权重合计为 100（彩虹概率降至 0.01%）', () => {
    const total = BLOCK_DROP_TABLE.reduce((s, [, w]) => s + w, 0);
    expect(total).toBeCloseTo(100, 6);
    const none = BLOCK_DROP_TABLE.find(([t]) => t === null)?.[1] ?? 0;
    expect(none).toBe(54.99);
    const bomb = BLOCK_DROP_TABLE.find(([t]) => t === PowerUpType.BOMB_COUNT)?.[1] ?? 0;
    expect(bomb).toBe(15); // 10 → +5
    const potion = BLOCK_DROP_TABLE.find(([t]) => t === PowerUpType.BOMB_RANGE)?.[1] ?? 0;
    expect(potion).toBe(2); // 7 → -5
    const rainbow = BLOCK_DROP_TABLE.find(([t]) => t === PowerUpType.RAINBOW)?.[1] ?? 0;
    expect(rainbow).toBe(0.01);
  });

  it('AI 掉落表（仅针对 AI）：坐骑 -2/3、无敌 -1/2、靴子 -2/3、其它各 -1/2', () => {
    const total = BLOCK_DROP_TABLE_AI.reduce((s, [, w]) => s + w, 0);
    expect(total).toBeCloseTo(100, 1);
    const w = (t: PowerUpType | null) => BLOCK_DROP_TABLE_AI.find(([x]) => x === t)?.[1] ?? 0;
    expect(w(null)).toBeCloseTo(79.83, 2); // 无道具（吸收差额）
    expect(w(PowerUpType.MOUNT)).toBeCloseTo(1 / 3, 2); // 坐骑 -2/3
    expect(w(PowerUpType.RAINBOW)).toBeCloseTo(0.005, 3); // 无敌(彩虹) -1/2
    expect(w(PowerUpType.SPEED)).toBeCloseTo(13 / 3, 2); // 靴子 -2/3
    expect(w(PowerUpType.BOMB_RANGE)).toBe(1); // 爆炸药 -1/2
    expect(w(PowerUpType.BOMB_COUNT)).toBe(7.5); // 炸弹 -1/2
    expect(w(PowerUpType.KICK)).toBe(3.5); // 手套 -1/2
    expect(w(PowerUpType.HEART)).toBe(3.5); // 心 -1/2
  });

  it('rollBlockDrop 支持传入掉落表（AI 表：高随机值落在低概率区间）', () => {
    // 假 RNG 恒返回 0.99 → roll = 99 → 走过 NONE(79.83) RANGE(1) COUNT(7.5) SPEED(4.33)
    // KICK(3.5) 后剩余 < HEART(3.5) → HEART（验证走表正确，且不会被当作玩家表）
    const rng: RNGService = { next: () => 0.99, chance: () => true, int: () => 0, pick: <T>(a: readonly T[]) => a[0] };
    expect(rollBlockDrop(rng, BLOCK_DROP_TABLE_AI)).toBe(PowerUpType.HEART);
    // 玩家表：roll=99 → 走过 NONE(54.99) RANGE(2) COUNT(15) SPEED(13) KICK(7) HEART(7) → MOUNT(1)
    const rng2: RNGService = { next: () => 0.99, chance: () => true, int: () => 0, pick: <T>(a: readonly T[]) => a[0] };
    expect(rollBlockDrop(rng2, BLOCK_DROP_TABLE)).toBe(PowerUpType.MOUNT);
  });

  it('彩虹光波：覆上彩虹', () => {
    const e = powerUpEffect(fakePlayer(), PowerUpType.RAINBOW);
    expect(e.patch.rainbow).toBe(true);
  });
});
