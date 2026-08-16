/**
 * src/test/bomb.test.ts —— 水柱计算 / 连锁爆炸 / 墙阻挡 / 纯函数性
 */
import { describe, it, expect } from 'vitest';
import { computeExplosionCells, resolveChainExplosions } from '../core/rules/bomb';
import { TileType, type Bomb } from '../shared/types';
import { fakeMap } from './helpers';

describe('computeExplosionCells', () => {
  it('炸弹中心始终在结果中', () => {
    const map = fakeMap(5, 5);
    const cells = computeExplosionCells(2, 2, 1, map);
    expect(cells).toContainEqual({ x: 2, y: 2 });
  });

  it('硬墙完全阻挡爆炸', () => {
    const map = fakeMap(5, 5);
    map.cells[2][4].type = TileType.WALL;
    const cells = computeExplosionCells(2, 2, 3, map);
    expect(cells.some((c) => c.x === 4 && c.y === 2)).toBe(false);
  });

  it('软墙被包含但不延伸', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT;
    const cells = computeExplosionCells(2, 2, 3, map);
    expect(cells.some((c) => c.x === 3 && c.y === 2)).toBe(true);
    expect(cells.some((c) => c.x === 4 && c.y === 2)).toBe(false);
  });

  it('地图边界截断', () => {
    const map = fakeMap(5, 5);
    const cells = computeExplosionCells(0, 0, 5, map);
    // 中心 + 下 + 右 各至边界
    expect(cells.length).toBe(1 + 4 + 4);
  });

  it('爆炸范围受 range 限制', () => {
    const map = fakeMap(11, 11);
    const cells = computeExplosionCells(5, 5, 2, map);
    expect(cells.length).toBe(1 + 2 * 4);
  });
});

describe('resolveChainExplosions', () => {
  it('连锁反应：水柱碰到其他泡泡触发', () => {
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 2, y: 2, timer: 0, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
      { id: 2, ownerId: 1, x: 3, y: 2, timer: 100, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const result = resolveChainExplosions(map, bombs, [1]);
    expect(result.explodedBombIds).toContain(1);
    expect(result.explodedBombIds).toContain(2);
    expect(result.explosions.length).toBe(2);
  });

  it('纯函数：不修改入参', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT;
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 2, y: 2, timer: 0, range: 2, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    resolveChainExplosions(map, bombs, [1]);
    expect(map.cells[2][3].type).toBe(TileType.SOFT);
    expect(bombs[0].exploded).toBe(false);
  });

  it('软墙摧毁记录 hiddenPowerUp 且不穿透', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT;
    map.cells[2][3].hiddenPowerUp = 1; // BOMB_COUNT
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 2, y: 2, timer: 0, range: 3, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const result = resolveChainExplosions(map, bombs, [1]);
    const block = result.destroyedBlocks.find((b) => b.x === 3 && b.y === 2);
    expect(block).toBeDefined();
    expect(block!.hiddenPowerUp).toBe(1);
    expect(result.explosions[0].cells.some((c) => c.x === 4 && c.y === 2)).toBe(false);
  });

  it('连锁去重：不会无限递归', () => {
    // 两个泡泡互相覆盖
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 2, y: 2, timer: 0, range: 2, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
      { id: 2, ownerId: 1, x: 3, y: 2, timer: 0, range: 2, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const result = resolveChainExplosions(map, bombs, [1]);
    expect(result.explosions.length).toBe(2);
  });
});
