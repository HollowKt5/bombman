/**
 * src/test/map.test.ts —— 地图布局（v1.4.8）
 * 验证：固定 15×13、中心对称、矩形四边通路、四角角色、连通性、随机性。
 */
import { describe, it, expect } from 'vitest';
import { createGameState } from '../core/domain/game-state';
import { SeedRNG } from '../infrastructure/seed-rng';
import { Difficulty, TileType } from '../shared/types';

describe('地图生成（关卡2风格）', () => {
  it('每关地图固定 15×13', () => {
    for (let level = 1; level <= 5; level++) {
      const seed = 1000 + level;
      const state = createGameState(level, Difficulty.NORMAL, seed, new SeedRNG(seed));
      expect(state.map.width).toBe(15);
      expect(state.map.height).toBe(13);
    }
  });

  it('四个角各生成一个角色（1 玩家 + 3 敌人）', () => {
    const state = createGameState(1, Difficulty.NORMAL, 42, new SeedRNG(42));
    expect(state.players.length).toBe(4);
    const hero = state.players.find((p) => p.isHuman)!;
    expect(Math.round(hero.x)).toBe(1);
    expect(Math.round(hero.y)).toBe(1);
    const foes = state.players.filter((p) => !p.isHuman);
    expect(foes).toHaveLength(3);
    const pos = foes.map((f) => `${Math.round(f.x)},${Math.round(f.y)}`).sort();
    expect(pos).toEqual(['1,11', '13,1', '13,11']);
    // 出生点均为空地
    for (const p of state.players) {
      expect(state.map.cells[Math.round(p.y)][Math.round(p.x)].type).toBe(TileType.EMPTY);
    }
  });

  it('地图中心对称（180° 旋转后与自身一致）', () => {
    for (const seed of [1, 2, 3]) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const { width: w, height: h, cells } = state.map;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = cells[y][x];
          const b = cells[h - 1 - y][w - 1 - x];
          expect(a.type, `格(${x},${y}) 类型不对称`).toBe(b.type);
          expect(a.hiddenPowerUp, `格(${x},${y}) 道具不对称`).toBe(b.hiddenPowerUp);
        }
      }
    }
  });

  it('矩形四边为通路（内圈行/列为空地或可炸软墙，四角沿边连通）', () => {
    for (const seed of [1, 2, 3]) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const { width: w, height: h, cells } = state.map;
      const ok = (t: TileType, tag: string) => {
        expect(t === TileType.EMPTY || t === TileType.SOFT, tag).toBe(true);
      };
      for (let x = 1; x < w - 1; x++) {
        ok(cells[1][x].type, `上边(${x},1)`);
        ok(cells[h - 2][x].type, `下边(${x},${h - 2})`);
      }
      for (let y = 1; y < h - 1; y++) {
        ok(cells[y][1].type, `左边(1,${y})`);
        ok(cells[y][w - 2].type, `右边(${w - 2},${y})`);
      }
      // 出生区（3×3，含内圈通路格）仍必须为空（出生保护；外圈边界为硬墙不算）
      for (let y = 1; y <= 2; y++) {
        for (let x = 1; x <= 2; x++) {
          expect(cells[y][x].type, `左上出生区(${x},${y})`).toBe(TileType.EMPTY);
          expect(cells[y][w - 1 - x].type, `右上出生区(${w - 1 - x},${y})`).toBe(TileType.EMPTY);
          expect(cells[h - 1 - y][x].type, `左下出生区(${x},${h - 1 - y})`).toBe(TileType.EMPTY);
          expect(cells[h - 1 - y][w - 1 - x].type, `右下出生区(${w - 1 - x},${h - 1 - y})`).toBe(TileType.EMPTY);
        }
      }
    }
  });

  it('不同种子软墙分布不同（随机性）', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      let sig = '';
      for (const row of state.map.cells) {
        for (const c of row) sig += c.type === TileType.SOFT ? 'S' : '.';
      }
      layouts.add(sig);
    }
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('中心 3×3 广场始终空出（四周与中心有通路）', () => {
    for (const seed of [1, 2, 3]) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      for (let x = 6; x <= 8; x++) {
        for (let y = 5; y <= 7; y++) {
          expect(state.map.cells[y][x].type, `广场格(${x},${y})`).toBe(TileType.EMPTY);
        }
      }
    }
  });

  it('不可破坏硬墙占全部格子 48%–55%（散点无大块）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const { width: w, height: h, cells } = state.map;
      let walls = 0;
      let total = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          total++;
          if (cells[y][x].type === TileType.WALL) walls++;
        }
      }
      const pct = walls / total;
      expect(pct, `seed=${seed} 硬墙 ${walls}/${total} = ${(pct * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.48);
      expect(pct, `seed=${seed} 硬墙 ${walls}/${total} = ${(pct * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.55);
    }
  });

  it('不出现 3×3 连续硬方块，2×2 也尽量少', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const { width: w, height: h, cells } = state.map;
      const isW = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < w && y < h && cells[y][x].type === TileType.WALL;
      let c3 = 0;
      let c2 = 0;
      for (let y = 0; y <= h - 3; y++) {
        for (let x = 0; x <= w - 3; x++) {
          let all = true;
          for (let j = 0; j < 3 && all; j++)
            for (let i = 0; i < 3 && all; i++) if (!isW(x + i, y + j)) all = false;
          if (all) c3++;
        }
      }
      for (let y = 0; y <= h - 2; y++) {
        for (let x = 0; x <= w - 2; x++) {
          let all = true;
          for (let j = 0; j < 2 && all; j++)
            for (let i = 0; i < 2 && all; i++) if (!isW(x + i, y + j)) all = false;
          if (all) c2++;
        }
      }
      expect(c3, `seed=${seed} 出现 ${c3} 个 3×3 硬块`).toBe(0);
      expect(c2, `seed=${seed} 2×2 硬块过多 ${c2} 个`).toBeLessThanOrEqual(14);
    }
  });

  it('软墙充足（可炸障碍多）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      let soft = 0;
      for (const row of state.map.cells) {
        for (const c of row) if (c.type === TileType.SOFT) soft++;
      }
      expect(soft, `seed=${seed}`).toBeGreaterThanOrEqual(40);
    }
  });

  it('每个软墙至少有一个相邻空地（放炸弹的人有安全格可站）', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const { width: w, height: h, cells } = state.map;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (cells[y][x].type !== TileType.SOFT) continue;
          const safe = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => {
            const nx = x + dx;
            const ny = y + dy;
            return (
              nx >= 0 && ny >= 0 && nx < w && ny < h &&
              cells[ny][nx].type === TileType.EMPTY
            );
          });
          expect(safe, `seed=${seed} 软墙(${x},${y}) 无安全格可站`).toBe(true);
        }
      }
    }
  });

  it('所有空地格连通（可破坏通行区域保持连通）', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const state = createGameState(1, Difficulty.NORMAL, seed, new SeedRNG(seed));
      const hero = state.players.find((p) => p.isHuman)!;
      const start = { x: Math.round(hero.x), y: Math.round(hero.y) };
      const reachable = new Set<string>([`${start.x},${start.y}`]);
      const stack = [{ x: start.x, y: start.y }];
      while (stack.length > 0) {
        const c = stack.pop()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          const k = `${nx},${ny}`;
          if (
            nx >= 0 && ny >= 0 && nx < state.map.width && ny < state.map.height &&
            !reachable.has(k) &&
            state.map.cells[ny][nx].type !== TileType.WALL
          ) {
            reachable.add(k);
            stack.push({ x: nx, y: ny });
          }
        }
      }
      for (let y = 0; y < state.map.height; y++) {
        for (let x = 0; x < state.map.width; x++) {
          if (state.map.cells[y][x].type === TileType.EMPTY) {
            expect(reachable.has(`${x},${y}`), `seed=${seed} 格(${x},${y}) 不可达`).toBe(true);
          }
        }
      }
    }
  });
});
