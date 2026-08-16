/**
 * src/test/smoke.test.ts —— 核心管线集成冒烟测试（无 DOM）
 * 走完整流程：建局 → 每 tick 放泡 → 引信到期 → 十字水柱 → 炸软墙/击杀 → 胜利。
 */
import { describe, it, expect } from 'vitest';
import { createGameState } from '../core/domain/game-state';
import { tickGame } from '../core/systems/game-loop';
import { destroySoftBlock } from '../core/systems/bomb-system';
import { EventBus } from '../shared/event-bus';
import { SeedRNG } from '../infrastructure/seed-rng';
import { DIFFICULTY } from '../shared/constants';
import type { RNGService } from '../core/services/rng-service';
import {
  Difficulty,
  Direction,
  GamePhase,
  PowerUpType,
  TileType,
  type GameState,
} from '../shared/types';

interface SimResult {
  state: GameState;
  events: string[];
}

function runSim(
  ticks: number,
  dir: Direction,
  setup?: (s: GameState) => void,
): SimResult {
  const seed = 42;
  const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
  setup?.(state);
  const events = new EventBus();
  const seen: string[] = [];
  const watch = [
    'bomb:placed',
    'explosion:start',
    'block:destroyed',
    'powerup:pickup',
    'enemy:death',
    'level:clear',
    'game:over',
  ] as const;
  for (const t of watch) events.on(t, () => seen.push(t));
  const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));

  for (let i = 0; i < ticks; i++) {
    if (state.phase !== GamePhase.PLAYING) break;
    tickGame(
      state,
      [{ playerId: 1, direction: dir, placeBomb: true }],
      events,
      { rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)! },
    );
  }
  return { state, events: seen };
}

describe('核心管线冒烟测试', () => {
  it('放泡 → 爆炸 → 炸毁软墙（完整核心循环）', () => {
    // 玩家出生点右侧放一块软墙：被挡 → 原地放泡 → 引信到期炸毁它
    const { state, events } = runSim(400, Direction.RIGHT, (s) => {
      s.map.cells[1][2].type = TileType.SOFT;
    });
    expect(state.tick).toBeGreaterThan(0);
    expect(events).toContain('bomb:placed');
    expect(events).toContain('explosion:start');
    expect(events).toContain('block:destroyed');
    expect(state.players[0].blocksBroken).toBeGreaterThan(0);
    expect(state.map.cells[1][2].type).toBe(TileType.EMPTY);
  });

  it('引信到期爆炸可击杀所有敌人并胜利', () => {
    const { state } = runSim(400, Direction.NONE, (s) => {
      const hero = s.players.find((p) => p.isHuman)!;
      for (const foe of s.players) {
        if (foe.isHuman) continue;
        // 所有敌人定在玩家右侧一格、已过出生无敌、长期泡封（不移动）；玩家原地放泡
        foe.x = Math.round(hero.x) + 1;
        foe.y = Math.round(hero.y);
        foe.trapped = true;
        foe.trapTimer = 1e9;
        foe.invincibleTimer = 0;
      }
    });
    expect(state.phase).toBe(GamePhase.VICTORY);
    const hero = state.players.find((p) => p.isHuman)!;
    expect(hero.kills).toBe(3);
    // 玩家自己也站在爆炸中心 → 受伤扣血（验证伤害系统）
    expect(hero.hp).toBeLessThan(hero.maxHp);
  });

  it('炸毁软方块掉落道具（刚露出的道具不被同一轮水柱销毁）—— 回归测试', () => {
    const { state } = runSim(400, Direction.RIGHT, (s) => {
      // 玩家 (1,1) 右侧放一块带隐藏道具的软墙
      s.map.cells[1][2] = { type: TileType.SOFT, hiddenPowerUp: PowerUpType.SPEED };
    });
    // 软墙被炸毁
    expect(state.map.cells[1][2].type).toBe(TileType.EMPTY);
    // 道具真实出现在场地上（修复前会被同一轮水柱过滤掉）
    const pu = state.powerUps.find((p) => p.x === 2 && p.y === 1);
    expect(pu).toBeDefined();
    expect(pu!.type).toBe(PowerUpType.SPEED);
  });

  it('踢泡有过程：一格一格滑动推进，撞到障碍停下 —— 回归测试', () => {
    const seed = 5;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) {
      if (!p.isHuman) {
        p.trapped = true;
        p.trapTimer = 1e9;
        p.invincibleTimer = 0;
      }
    }
    hero.kick = true;
    hero.x = 1;
    hero.y = 1;
    // 路径：(2,1)(3,1) 空地，(4,1) 软墙 → 泡泡踢到 3 后应撞软墙停下
    state.map.cells[1][2] = { type: TileType.EMPTY, hiddenPowerUp: null };
    state.map.cells[1][3] = { type: TileType.EMPTY, hiddenPowerUp: null };
    state.map.cells[1][4] = { type: TileType.SOFT, hiddenPowerUp: null };
    state.bombs.push({
      id: 99,
      ownerId: hero.id,
      x: 2,
      y: 1,
      timer: 2000,
      range: 1,
      exploded: false,
      kickDir: null,
      kickT: 0,
      kickSlide: null,
    });

    const tick = () =>
      tickGame(state, [{ playerId: 1, direction: Direction.RIGHT, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });

    // 踢一脚：逻辑格前进一格（2→3），进入滑动状态
    tick();
    let bomb = state.bombs.find((b) => b.id === 99)!;
    expect(bomb.kickDir).toBe(Direction.RIGHT);
    expect(bomb.x).toBe(3);

    // 滑行中不会瞬移：4 tick 内仍在本格（kickTicks=8 才推进）
    for (let i = 0; i < 4; i++) tick();
    bomb = state.bombs.find((b) => b.id === 99)!;
    expect(bomb.x).toBe(3);

    // 跑满后：尝试前进到 (4,1) 被软墙挡住 → 停下
    for (let i = 0; i < 30; i++) tick();
    bomb = state.bombs.find((b) => b.id === 99)!;
    expect(bomb.kickDir).toBeNull();
    expect(bomb.x).toBe(3);
  });

  it('踢泡滑行被角色挡住：停在角色的前一格（终点规则）', () => {
    const seed = 5;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) {
      if (!p.isHuman) {
        p.trapped = true;
        p.trapTimer = 1e9;
        p.invincibleTimer = 0;
      }
    }
    hero.kick = true;
    hero.x = 1;
    hero.y = 1;
    // 路径：(2,1)(3,1) 空地，(4,1) 站着一个 AI → 泡泡应停在 (3,1)（AI 的前一格）
    state.map.cells[1][2] = { type: TileType.EMPTY, hiddenPowerUp: null };
    state.map.cells[1][3] = { type: TileType.EMPTY, hiddenPowerUp: null };
    state.map.cells[1][4] = { type: TileType.EMPTY, hiddenPowerUp: null };
    const foe = state.players.find((p) => !p.isHuman)!;
    foe.x = 4;
    foe.y = 1;
    state.bombs.push({
      id: 98,
      ownerId: hero.id,
      x: 2,
      y: 1,
      timer: 2000,
      range: 1,
      exploded: false,
      kickDir: null,
      kickT: 0,
      kickSlide: null,
    });

    const tick = () =>
      tickGame(state, [{ playerId: 1, direction: Direction.RIGHT, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });

    tick(); // 踢一脚：2 → 3
    let bomb = state.bombs.find((b) => b.id === 98)!;
    expect(bomb.x).toBe(3);
    // 滑行尝试前进到 (4,1) 被 AI 挡住 → 停在 (3,1)（AI 的前一格），不再前进
    for (let i = 0; i < 30; i++) tick();
    bomb = state.bombs.find((b) => b.id === 98)!;
    expect(bomb.kickDir).toBeNull();
    expect(bomb.x).toBe(3);
    expect(bomb.y).toBe(1);
  });

  it('泡封后按「上下左右」各一遍可提前突破（挣脱硬直泡泡）', () => {
    const seed = 11;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) {
      if (!p.isHuman) {
        p.trapped = true;
        p.trapTimer = 1e9;
        p.invincibleTimer = 0;
      }
    }
    // 玩家进入泡封（模拟被炸到）
    hero.trapped = true;
    hero.trapTimer = 300;
    hero.invincibleTimer = 0;
    hero.trapDirs = [];

    // 上→下→左→右 各按一遍（每 tick 一个方向）
    const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
    let released = false;
    for (const d of dirs) {
      tickGame(state, [{ playerId: 1, direction: d, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });
      if (!hero.trapped) {
        released = true;
        break;
      }
    }
    expect(released).toBe(true); // 四个方向按完即挣脱
    expect(hero.trapped).toBe(false);
  });

  it('骑恐龙破一格：需按住方向充能 0.5s + 破墙 1.5s（松开取消）', () => {
    const seed = 3;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) {
      if (!p.isHuman) {
        p.trapped = true;
        p.trapTimer = 1e9;
        p.invincibleTimer = 0;
      }
    }
    hero.mount = true;
    hero.x = 1;
    hero.y = 1;
    hero.invincibleTimer = 0;
    state.map.cells[1][2] = { type: TileType.SOFT, hiddenPowerUp: null };

    const tick = () =>
      tickGame(state, [{ playerId: 1, direction: Direction.RIGHT, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });

    // 按住右 → 进入充能（不放泡不自动破）
    for (let i = 0; i < 10; i++) tick();
    expect(hero.break).not.toBeNull();
    expect(hero.break!.phase).toBe('charge');
    expect(state.map.cells[1][2].type).toBe(TileType.SOFT);
    expect(hero.x).toBe(1); // 移动被挡，未穿墙

    // 充能中松开（NONE）→ 取消，软墙未破
    tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: false }], events, {
      rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
    });
    expect(hero.break).toBeNull();
    expect(state.map.cells[1][2].type).toBe(TileType.SOFT);

    // 重新按住：充能 0.5s（31 tick 含创建帧）→ 破墙 1.5s（90 tick）后顶开
    for (let i = 0; i < 31; i++) tick();
    expect(hero.break!.phase).toBe('hit'); // 充能完成，进入破墙
    for (let i = 0; i < 95; i++) tick();
    expect(state.map.cells[1][2].type).toBe(TileType.EMPTY); // 破开
    expect(hero.break).toBeNull();
    expect(hero.blocksBroken).toBeGreaterThan(0);
  });

  it('彩虹光波：同格接触令敌人掉 1 格命（即死）', () => {
    const seed = 5;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    const foe = state.players.find((p) => !p.isHuman)!;
    hero.rainbow = true;
    hero.x = 2;
    hero.y = 2;
    foe.x = 2;
    foe.y = 2;
    foe.invincibleTimer = 0;
    foe.trapped = true; // 不移动，站同格
    foe.trapTimer = 1e9;
    for (let i = 0; i < 5; i++) {
      tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });
      if (!foe.alive) break;
    }
    expect(foe.alive).toBe(false); // 接触即死（敌人 1 血）
  });

  it('彩虹光波持续 20 秒后消失', () => {
    const seed = 3;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) if (!p.isHuman) { p.trapped = true; p.trapTimer = 1e9; p.invincibleTimer = 1e9; }
    hero.rainbow = true;
    hero.rainbowTimer = 1200; // 20s
    hero.invincibleTimer = 1e9;
    const tick = () =>
      tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: false }], events, {
        rngFor: (id) => rngs.get(id)!,
        sessionRng: rngs.get(1)!,
      });
    for (let i = 0; i < 1199; i++) tick();
    expect(hero.rainbow).toBe(true); // 未到 20s 仍有
    tick();
    expect(hero.rainbow).toBe(false); // 20s 后消失
  });

  it('炸死敌人掉落其吃过的道具（没吃任何东西不掉）', () => {
    const seed = 9;
    const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    const hero = state.players.find((p) => p.isHuman)!;
    const foes = state.players.filter((p) => !p.isHuman);
    for (const f of foes) {
      f.trapped = true;
      f.trapTimer = 1e9;
      f.invincibleTimer = 0;
      f.x = Math.round(hero.x) + 1;
      f.y = Math.round(hero.y);
    }
    foes[0].eaten = [PowerUpType.BOMB_COUNT]; // 吃过炸弹
    foes[1].eaten = []; // 什么都没吃
    foes[2].eaten = [];
    for (let i = 0; i < 250; i++) {
      tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: true }], events, {
        rngFor: (id) => rngs.get(id)!,
        sessionRng: rngs.get(1)!,
      });
      if (state.phase !== 1) break;
    }
    expect(state.phase).toBe(GamePhase.VICTORY);
    const dropped = state.powerUps.map((p) => p.type);
    expect(dropped).toContain(PowerUpType.BOMB_COUNT); // 吃过的道具掉落了
    expect(dropped.length).toBeLessThanOrEqual(7); // 只可能来自吃过道具的敌人
  });

  it('敌人全灭后不再 tick（胜利冻结）', () => {
    const seed = 7;
    const state = createGameState(1, Difficulty.EASY, seed, new SeedRNG(seed));
    const hero = state.players.find((p) => p.isHuman)!;
    for (const p of state.players) {
      if (!p.isHuman) {
        p.trapped = true;
        p.trapTimer = 1e9; // 泡封不解除，保证位置确定
        p.invincibleTimer = 0;
        p.x = Math.round(hero.x);
        p.y = Math.round(hero.y); // 与玩家同格，放泡可炸到
      }
    }
    const events = new EventBus();
    const rngs = new Map(state.players.map((p) => [p.id, new SeedRNG(p.rngSeed)]));
    for (let i = 0; i < 500; i++) {
      if (state.phase !== GamePhase.PLAYING) break;
      tickGame(state, [{ playerId: 1, direction: Direction.NONE, placeBomb: true }], events, {
        rngFor: (id) => rngs.get(id)!, sessionRng: rngs.get(1)!,
      });
    }
    expect(state.phase).toBe(GamePhase.VICTORY);
    expect(state.tick).toBeLessThan(500); // 提前结束，未跑满
  });

  it('AI 炸软块按 AI 掉落表重掷（隐藏道具 MOUNT 不会直接给 AI）', () => {
    const state = createGameState(1, Difficulty.NORMAL, 7, new SeedRNG(7));
    const events = new EventBus();
    const foe = state.players.find((p) => !p.isHuman)!;
    const hero = state.players.find((p) => p.isHuman)!;
    // 软墙格 (4,4)，隐藏道具为 MOUNT
    state.map.cells[4][4] = { type: TileType.SOFT, hiddenPowerUp: PowerUpType.MOUNT };
    // 假 RNG 恒 0.99 → AI 表走完 NONE/RANGE/COUNT/SPEED/KICK 落在 HEART
    const stub: RNGService = { next: () => 0.99, chance: () => true, int: () => 0, pick: <T>(a: readonly T[]) => a[0] };
    destroySoftBlock(state, 4, 4, foe.id, events, stub);
    const drop = state.powerUps.find((pu) => pu.x === 4 && pu.y === 4);
    expect(drop?.type).toBe(PowerUpType.HEART); // AI 表重掷，不是 MOUNT
    expect(foe.blocksBroken).toBe(1);
    // 玩家炸同一格：保留隐藏道具 MOUNT
    state.map.cells[4][4] = { type: TileType.SOFT, hiddenPowerUp: PowerUpType.MOUNT };
    const stub2: RNGService = { next: () => 0.99, chance: () => true, int: () => 0, pick: <T>(a: readonly T[]) => a[0] };
    destroySoftBlock(state, 4, 4, hero.id, events, stub2);
    const drop2 = state.powerUps.filter((pu) => pu.x === 4 && pu.y === 4);
    expect(drop2.some((pu) => pu.type === PowerUpType.MOUNT)).toBe(true);
  });

  it('每局时长统一为 5 分钟（18000 tick）', () => {
    for (const d of [Difficulty.EASY, Difficulty.NORMAL, Difficulty.HARD]) {
      expect(DIFFICULTY[d].timeLimitTicks).toBe(300 * 60);
    }
  });
});
