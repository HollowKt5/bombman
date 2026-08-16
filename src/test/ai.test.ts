/**
 * src/test/ai.test.ts —— AI 决策（逃生 / 放泡 / 漫游）
 */
import { describe, it, expect } from 'vitest';
import { decideAI } from '../core/rules/ai';
import { Direction, Difficulty, type AISenseSnapshot } from '../shared/types';
import { DIFFICULTY } from '../shared/constants';
import { fakePlayer } from './helpers';

function snapshot(over: Partial<AISenseSnapshot> = {}): AISenseSnapshot {
  return {
    self: { x: 2, y: 2, trapped: false, lastDir: Direction.DOWN },
    bounds: { width: 15, height: 13 },
    dangerCells: new Set<string>(),
    enemies: [],
    powerUps: [],
    difficulty: DIFFICULTY[Difficulty.NORMAL],
    hasBombAtSelf: false,
    softBlocks: [],
    wallTarget: null,
    walkable: (x, y) => x > 0 && y > 0 && x < 14 && y < 12,
    // 默认爆炸范围：曼哈顿十字（与真实规则近似，单测用）
    blastCells: (x, y, range) => {
      const s = new Set<string>();
      for (let dx = -range; dx <= range; dx++) {
        s.add(`${x + dx},${y}`);
        s.add(`${x},${y + dx}`);
      }
      return s;
    },
    stuck: false,
    prevCell: null,
    ...over,
  };
}

describe('decideAI', () => {
  it('泡封时不移动不放泡', () => {
    const p = fakePlayer({ trapped: true });
    const i = decideAI(p, snapshot(), () => 0.5);
    expect(i.direction).toBe(Direction.NONE);
    expect(i.placeBomb).toBe(false);
  });

  it('处于危险格时逃向安全格', () => {
    const p = fakePlayer();
    const s = snapshot({ dangerCells: new Set(['2,2']) });
    const i = decideAI(p, s, () => 0.5);
    expect(i.placeBomb).toBe(false);
    expect(i.direction).not.toBe(Direction.NONE);
  });

  it('无路可逃时放泡自救', () => {
    const p = fakePlayer();
    const s = snapshot({
      dangerCells: new Set(['2,2']),
      walkable: (x, y) => x === 2 && y === 2, // 只有自身格可走
    });
    const i = decideAI(p, s, () => 0.5);
    expect(i.placeBomb).toBe(true);
  });

  it('靠近目标且有逃生格时可能放泡（困难 AI）', () => {
    const p = fakePlayer();
    const s = snapshot({
      enemies: [{ x: 3, y: 2 }],
      difficulty: DIFFICULTY[Difficulty.HARD],
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.01);
    expect(i.placeBomb).toBe(true);
  });

  it('目标格有泡时不再放泡', () => {
    const p = fakePlayer();
    const s = snapshot({
      enemies: [{ x: 3, y: 2 }],
      difficulty: DIFFICULTY[Difficulty.HARD],
      hasBombAtSelf: true,
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.01);
    expect(i.placeBomb).toBe(false);
  });

  it('返回合法意图结构', () => {
    const p = fakePlayer();
    const i = decideAI(p, snapshot({ enemies: [{ x: 5, y: 5 }] }), () => 0.9);
    expect(i.playerId).toBe(p.id);
    expect([
      Direction.UP,
      Direction.DOWN,
      Direction.LEFT,
      Direction.RIGHT,
      Direction.NONE,
    ]).toContain(i.direction);
  });

  it('破墙为主目标：优先走向最近的软墙（而非远处玩家）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [{ x: 4, y: 2 }], // 近处软墙
      enemies: [{ x: 9, y: 9 }], // 远处玩家
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.9);
    expect(i.direction).toBe(Direction.RIGHT); // 走向软墙
    expect(i.placeBomb).toBe(false);
  });

  it('贴着软墙时放泡破墙', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [{ x: 3, y: 2 }], // 相邻软墙
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.01);
    expect(i.placeBomb).toBe(true);
  });

  it('无软墙时才追击玩家（破墙优先于攻击）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [], // 没有墙可破
      enemies: [{ x: 4, y: 2 }],
      difficulty: DIFFICULTY[Difficulty.NORMAL],
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.5);
    expect(i.direction).toBe(Direction.RIGHT); // 追击玩家
  });

  it('贴着任意软墙就放泡（清场主目标，不等目标墙）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [{ x: 3, y: 2 }], // 相邻软墙（未承诺为目标也炸）
      enemies: [{ x: 9, y: 9 }], // 远处玩家不在视野
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.01);
    expect(i.placeBomb).toBe(true);
  });

  it('坐骑 AI：贴到软墙直接顶墙破（不放泡、不停摆）', () => {
    const p = fakePlayer({ mount: true });
    const s = snapshot({
      softBlocks: [{ x: 3, y: 2 }], // 相邻软墙
      enemies: [{ x: 9, y: 9 }],
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.9);
    expect(i.direction).toBe(Direction.RIGHT); // 顶向右边的墙
    expect(i.placeBomb).toBe(false); // 不依赖放泡
  });

  it('坐骑 AI 破墙中：持续按住朝向破墙格的方向', () => {
    const p = fakePlayer({ mount: true, break: { x: 3, y: 2, t: 40, phase: 'hit' } });
    const s = snapshot({
      softBlocks: [{ x: 3, y: 2 }],
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.5);
    expect(i.direction).toBe(Direction.RIGHT); // 保持顶墙方向
    expect(i.placeBomb).toBe(false);
  });

  it('没有墙可炸时主动攻击玩家（无视距离追着炸）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [], // 没有墙
      enemies: [{ x: 13, y: 13 }], // 玩家很远（>12 格，旧逻辑不会追）
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.9);
    expect(i.direction).toBe(Direction.RIGHT); // 追向玩家
    expect(i.placeBomb).toBe(false);
  });

  it('有墙可炸时仍以破墙为主（不追远处玩家）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [{ x: 4, y: 2 }], // 有墙
      enemies: [{ x: 13, y: 13 }], // 玩家很远
      walkable: () => true,
    });
    const i = decideAI(p, s, () => 0.9);
    expect(i.direction).toBe(Direction.RIGHT); // 走向墙（同样向右，但意图是破墙）
    expect(i.placeBomb).toBe(false);
  });

  it('放泡前确认爆炸范围外有安全撤离点（被围住时不自爆）', () => {
    const p = fakePlayer();
    const s = snapshot({
      softBlocks: [{ x: 3, y: 2 }], // 相邻软墙想破
      walkable: (x, y) => x === 2 && y === 2, // 被围死：无处可逃
    });
    const i = decideAI(p, s, () => 0.01); // 即使想放泡
    expect(i.placeBomb).toBe(false); // 也不放（会把自己炸死）
  });
});
