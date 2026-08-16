/**
 * src/test/ai-smoothness.test.ts —— AI 移动平滑度（不卡顿/不抖动）
 * 关键指标：60fps 粒度下"位移方向切换次数"要低 —— 修复前每 3 tick 误判卡住强制重决策，
 * 方向频繁翻转（肉眼可见卡顿）；修复后方向保持窗口内直线移动。
 */
import { describe, it, expect } from 'vitest';
import { createGameState } from '../core/domain/game-state';
import { tickGame } from '../core/systems/game-loop';
import { EventBus } from '../shared/event-bus';
import { SeedRNG } from '../infrastructure/seed-rng';
import { Difficulty, Direction, GamePhase, type GameState } from '../shared/types';

function runAi(ticks: number, difficulty: Difficulty, seed: number, clearSoft = false): number[][] {
  const state = createGameState(1, difficulty, seed, new SeedRNG(seed));
  if (clearSoft) {
    // 清掉软墙：测纯移动平滑度（破墙等待行为由其他测试覆盖）
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (state.map.cells[y][x].type === 2) state.map.cells[y][x].type = 0;
      }
    }
  }
  const events = new EventBus();
  const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
  // 冻结玩家（3 个敌人会追/炸玩家，冻结避免对局提前结束干扰测量）
  const hero = state.players.find((p) => p.isHuman)!;
  hero.trapped = true;
  hero.trapTimer = 1e9;
  hero.invincibleTimer = 1e9;
  const foe = state.players.find((p) => !p.isHuman)!;
  const pts: number[][] = [];
  for (let i = 0; i < ticks; i++) {
    if (state.phase !== GamePhase.PLAYING) break;
    tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: false }], events, {
      rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
    });
    pts.push([foe.x, foe.y]);
  }
  return pts;
}

function metrics(pts: number[][]) {
  // 每 tick 位移向量
  const moves = pts.slice(1).map((p, i) => ({
    dx: p[0] - pts[i][0],
    dy: p[1] - pts[i][1],
  }));
  // 方向切换：相邻两个"移动中"的 tick 位移方向不同
  let dirChanges = 0;
  let prevDir: string | null = null;
  let movedTicks = 0;
  for (const m of moves) {
    const key = (m.dx > 0.001 ? 'R' : m.dx < -0.001 ? 'L' : '') +
      (m.dy > 0.001 ? 'D' : m.dy < -0.001 ? 'U' : '');
    if (key === '') continue; // 静止 tick
    movedTicks++;
    if (prevDir !== null && key !== prevDir) dirChanges++;
    prevDir = key;
  }
  // 立即掉头（A→B→A 格级往返）
  let reversals = 0;
  for (let i = 2; i < pts.length; i++) {
    const d1 = [pts[i - 1][0] - pts[i - 2][0], pts[i - 1][1] - pts[i - 2][1]];
    const d2 = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
    if ((d1[0] || d1[1]) && (d2[0] || d2[1]) && Math.sign(d1[0]) === -Math.sign(d2[0]) && Math.sign(d1[1]) === -Math.sign(d2[1])) {
      reversals++;
    }
  }
  return { dirChanges, reversals, movedTicks };
}

describe('AI 移动平滑度', () => {
  it('简单难度漫游：300 tick 内方向切换很少（不卡顿、不抖动）', () => {
    // 无软墙地图：测纯移动平滑度
    const pts = runAi(300, Difficulty.EASY, 20240816, true);
    expect(pts.length).toBeGreaterThan(250);
    const m = metrics(pts);
    expect(m.movedTicks).toBeGreaterThan(150); // 确实在移动
    expect(m.dirChanges).toBeLessThan(25); // 修复前 ~40+，修复后个位数到十几
    expect(m.reversals).toBeLessThan(12); // 追逐玩家时的正常转向，非病态抖动
  });

  it('一般难度追击：直线走廊上不频繁变向（贪心直走生效）', () => {
    const seed = 777;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    const foe = state.players.find((p) => !p.isHuman)!;
    // 清空整张图的软墙（无墙可破 → AI 只追玩家），并清出直线走廊
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        if (state.map.cells[y][x].type === 2) state.map.cells[y][x].type = 0; // SOFT → EMPTY
      }
    }
    hero.x = 6; // 玩家在 AI 视野（5 格）内
    hero.y = 1;
    hero.trapped = true; // 玩家不动，便于测追击
    foe.x = 1;
    foe.y = 1;

    const pts: number[][] = [];
    for (let i = 0; i < 150; i++) {
      if (state.phase !== GamePhase.PLAYING) break;
      tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });
      pts.push([foe.x, foe.y]);
    }
    const m = metrics(pts);
    // 直线追击：方向切换应极少
    expect(m.dirChanges).toBeLessThan(6);
    // 明显靠近玩家
    expect(Math.abs(foe.x - hero.x)).toBeLessThan(4);
  });
});
