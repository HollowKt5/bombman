/**
 * core/domain/entity.ts —— 纯数据模型工厂函数（不 import 浏览器 API）
 */
import {
  Direction,
  PowerUpType,
  type Particle,
  type Player,
  type PowerUp,
} from '../../shared/types';
import { BLOCK_DROP_TABLE, TUNING } from '../../shared/constants';
import type { RNGService } from '../services/rng-service';

export function createPlayer(
  id: number,
  x: number,
  y: number,
  isHuman: boolean,
  color: string,
  rngSeed: number,
): Player {
  const baseSpeed = TUNING.player.baseSpeed;
  return {
    id,
    x,
    y,
    facing: Direction.DOWN,
    speed: baseSpeed,
    baseSpeed,
    bombRange: TUNING.bomb.defaultRange,
    maxBombs: TUNING.bomb.defaultMaxBombs,
    alive: true,
    trapped: false,
    trapTimer: 0,
    trapDirs: [],
    invincibleTimer: TUNING.player.spawnInvincibleTicks, // 出生安全时间
    kick: false,
    mount: false,
    rainbow: false,
    rainbowTimer: 0,
    eaten: [],
    break: null,
    bombCooldown: 0,
    hp: TUNING.player.baseHp,
    maxHp: TUNING.player.baseHp,
    score: 0,
    blocksBroken: 0,
    kills: 0,
    powerupsTaken: 0,
    isHuman,
    color,
    rngSeed: rngSeed >>> 0,
    lastDir: Direction.NONE,
  };
}

/** 按权重随机一种道具（含"无道具"；table 可传 AI 掉落表 → 概率缩水） */
export function rollBlockDrop(
  rng: RNGService,
  table: ReadonlyArray<[PowerUpType | null, number]> = BLOCK_DROP_TABLE,
): PowerUpType | null {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [type, w] of table) {
    roll -= w;
    if (roll < 0) return type;
  }
  return null;
}

export function createPowerUp(id: number, x: number, y: number, type: PowerUpType): PowerUp {
  return { id, x, y, type };
}

export function createParticle(
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
  size: number,
  lifeTicks: number,
  gravity = 0,
): Particle {
  return { x, y, vx, vy, life: lifeTicks, maxLife: lifeTicks, color, size, gravity };
}
