/**
 * src/test/movement.test.ts —— 移动规则（边界/墙/泡泡/推泡/自由转向/无斜穿）
 */
import { describe, it, expect } from 'vitest';
import { canEnterCell, computeMove } from '../core/rules/movement';
import { Direction, TileType, type Bomb, type Explosion } from '../shared/types';
import { fakeMap, fakePlayer } from './helpers';

/** 造一张四边都是硬墙的 5×5 地图 */
function walledMap(): ReturnType<typeof fakeMap> {
  const map = fakeMap(5, 5);
  for (let i = 0; i < 5; i++) {
    map.cells[0][i].type = TileType.WALL;
    map.cells[4][i].type = TileType.WALL;
    map.cells[i][0].type = TileType.WALL;
    map.cells[i][4].type = TileType.WALL;
  }
  return map;
}

describe('computeMove', () => {
  it('无方向返回原坐标', () => {
    const map = fakeMap(5, 5);
    const r = computeMove(fakePlayer(2, 2), Direction.NONE, 1, map, [], []);
    expect(r.x).toBe(2);
    expect(r.y).toBe(2);
  });

  it('地图边界阻挡：停在格心不越界', () => {
    const map = walledMap();
    const r = computeMove(fakePlayer(1, 2), Direction.LEFT, 1, map, [], []);
    expect(r.x).toBe(1);
  });

  it('硬墙阻挡：停在格心（不贴边滑行）', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.WALL;
    const r = computeMove(fakePlayer(2, 2), Direction.RIGHT, 1, map, [], []);
    expect(r.x).toBe(2);
  });

  it('泡泡不可穿过（无手套）', () => {
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 3, y: 2, timer: 10, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const r = computeMove(fakePlayer(2, 2), Direction.RIGHT, 1, map, bombs, []);
    expect(r.x).toBe(2);
  });

  it('有手套可推泡（推一格）', () => {
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 3, y: 2, timer: 10, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const r = computeMove(fakePlayer(2, 2, { kick: true }), Direction.RIGHT, 0.2, map, bombs, []);
    expect(r.kickedBomb).not.toBeNull();
    expect(r.kickedBomb!.x).toBe(4);
    expect(r.kickedBomb!.y).toBe(2);
    expect(r.x).toBeCloseTo(2.2);
  });

  it('推泡遇到硬墙则推不动', () => {
    const map = fakeMap(5, 5);
    map.cells[2][4].type = TileType.WALL;
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 3, y: 2, timer: 10, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const r = computeMove(fakePlayer(2, 2, { kick: true }), Direction.RIGHT, 0.2, map, bombs, []);
    expect(r.kickedBomb).toBeNull();
    expect(r.x).toBe(2);
  });

  it('推泡遇到角色（AI/玩家）挡在前进格则推不动（停在角色的前一格）', () => {
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 3, y: 2, timer: 10, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    // 前进格 (4,2) 被 AI 占据
    const players = [{ x: 4, y: 2 }, { x: 4, y: 4 }];
    const r = computeMove(fakePlayer(2, 2, { kick: true }), Direction.RIGHT, 0.2, map, bombs, [], players);
    expect(r.kickedBomb).toBeNull(); // 推不动 → 泡泡停在原格（角色的前一格）
    expect(r.x).toBe(2);
  });

  it('推泡目标格无角色时正常推动', () => {
    const map = fakeMap(5, 5);
    const bombs: Bomb[] = [
      { id: 1, ownerId: 1, x: 3, y: 2, timer: 10, range: 1, exploded: false, kickDir: null, kickT: 0, kickSlide: null },
    ];
    const players = [{ x: 4, y: 4 }]; // 不在前进路上
    const r = computeMove(fakePlayer(2, 2, { kick: true }), Direction.RIGHT, 0.2, map, bombs, [], players);
    expect(r.kickedBomb).not.toBeNull();
    expect(r.kickedBomb!.x).toBe(4);
  });

  it('平滑移动不超过目标格', () => {
    const map = fakeMap(5, 5);
    const r = computeMove(fakePlayer(2, 2), Direction.RIGHT, 0.2, map, [], []);
    expect(r.x).toBeCloseTo(2.2);
    expect(r.y).toBe(2);
  });

  it('转向时垂直轴自动吸附进车道中心（不贴砖边移动）', () => {
    const map = fakeMap(5, 5);
    // 正在横向移动途中按 UP：纵向移动 + 横向回中（2.4 → 2.2，趋向 2.0）
    const r = computeMove(fakePlayer(2.4, 2), Direction.UP, 0.2, map, [], []);
    expect(r.y).toBeCloseTo(1.8);
    expect(r.x).toBeCloseTo(2.2);
    // 持续走：最终吸附到车道中心 2.0
    let x = r.x;
    let y = r.y;
    for (let i = 0; i < 20; i++) {
      const rr = computeMove({ ...fakePlayer(x, y), lastDir: Direction.UP }, Direction.UP, 0.2, map, [], []);
      x = rr.x;
      y = rr.y;
    }
    expect(x).toBeCloseTo(2);
  });

  it('水平移动时垂直坐标保持在车道中心', () => {
    const map = fakeMap(5, 5);
    const r = computeMove(fakePlayer(2, 2), Direction.RIGHT, 0.2, map, [], []);
    expect(r.x).toBeCloseTo(2.2);
    expect(r.y).toBe(2);
  });

  it('坐骑顶软墙：标记 breakTarget 且移动被挡（破墙需 1.5s 过程）', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT;
    map.cells[2][3].hiddenPowerUp = 3; // HEART
    // 无坐骑：被软墙挡
    const blocked = computeMove(fakePlayer(2, 2), Direction.RIGHT, 0.2, map, [], []);
    expect(blocked.breakTarget).toBeNull();
    expect(blocked.x).toBe(2);
    // 有坐骑：标记破墙目标，但移动仍被挡（破墙由系统计时 1.5s 完成，不瞬移）
    const ride = computeMove(fakePlayer(2, 2, { mount: true }), Direction.RIGHT, 0.2, map, [], []);
    expect(ride.breakTarget).toEqual({ x: 3, y: 2 });
    expect(ride.x).toBe(2);
  });

  it('两墙之间不能斜穿（对角缝隙不可通过）—— 回归测试', () => {
    const map = fakeMap(5, 5);
    map.cells[1][3].type = TileType.WALL; // (3,1) 墙
    map.cells[2][4].type = TileType.WALL; // (4,2) 墙（与 (3,1) 斜对角）
    // 从 (3,2) 往右被 (4,2) 挡，往上被 (3,1) 挡 → 无法挤进对角空隙
    const right = computeMove(fakePlayer(3, 2), Direction.RIGHT, 1, map, [], []);
    expect(right.x).toBe(3);
    const up = computeMove(fakePlayer(3, 2), Direction.UP, 1, map, [], []);
    expect(up.y).toBe(2);
    // 反复尝试也不会产生边界/角落位置
    let p = { x: 3, y: 2 };
    for (let i = 0; i < 200; i++) {
      const r = computeMove({ ...fakePlayer(p.x, p.y), lastDir: Direction.RIGHT }, Direction.UP, 0.05, map, [], []);
      p = { x: r.x, y: r.y };
      expect(Math.abs(r.y - Math.round(r.y)) < 1e-6 || Math.abs(r.y - Math.round(r.y)) > 0.2).toBe(true);
    }
    expect(p.x).toBe(3);
  });

  it('被挡时回弹到当前格心（不产生边界位置）—— 回归测试', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.WALL; // (3,2) 墙
    // 移动途中被挡 → 回弹向格心 2.0
    const r = computeMove(fakePlayer(2.4, 2), Direction.RIGHT, 0.05, map, [], []);
    expect(r.x).toBeCloseTo(2.35);
    // 多次顶墙后停在格心
    let x = 2.4;
    for (let i = 0; i < 20; i++) {
      const rr = computeMove({ ...fakePlayer(x, 2), lastDir: Direction.RIGHT }, Direction.RIGHT, 0.05, map, [], []);
      x = rr.x;
    }
    expect(x).toBe(2);
  });

  it('顶墙不会挤进边界墙行（停在格心）', () => {
    const map = walledMap();
    // 按 UP 顶到顶墙 → 停在格心 y=1
    const r1 = computeMove(fakePlayer(2, 1), Direction.UP, 1, map, [], []);
    expect(r1.y).toBe(1);
    // 持续按 UP 不会穿进墙行
    const r2 = computeMove(fakePlayer(2, 1), Direction.UP, 1, map, [], []);
    expect(r2.y).toBe(1);
    // 左墙同理
    const r3 = computeMove(fakePlayer(1, 2), Direction.LEFT, 1, map, [], []);
    expect(r3.x).toBe(1);
  });
});

describe('canEnterCell', () => {
  it('软墙阻挡移动', () => {
    const map = fakeMap(5, 5);
    map.cells[2][3].type = TileType.SOFT;
    expect(canEnterCell(map, 3, 2, [], [])).toBe(false);
  });

  it('水柱覆盖格不可通行', () => {
    const map = fakeMap(5, 5);
    const ex: Explosion[] = [
      { id: 1, ownerId: 1, cells: [{ x: 3, y: 2 }], remaining: 10, total: 30, hitIds: [] },
    ];
    expect(canEnterCell(map, 3, 2, [], ex)).toBe(false);
  });

  it('越界不可通行', () => {
    const map = fakeMap(5, 5);
    expect(canEnterCell(map, -1, 0, [], [])).toBe(false);
    expect(canEnterCell(map, 5, 0, [], [])).toBe(false);
  });
});
