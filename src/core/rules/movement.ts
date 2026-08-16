/**
 * core/rules/movement.ts —— 碰撞检测、移动合法性（纯函数，不修改入参）
 *
 * 移动模型（v4，格心式 + 车道吸附）：
 * - 角色只在"格心"（n.0）停留；移动时两轴同时趋向目标格心——
 *   转向时垂直轴自动吸附进车道中心，杜绝"贴着砖边/半踩到砖上"的迷惑视觉。
 * - 被阻挡时两轴回弹到当前格心，永不产生边界/角落位置（无斜穿、无卡死）。
 * - 恐龙坐骑（mount）：可直接"顶开"软墙穿过（brokeBlock 由系统摧毁软墙）。
 */
import {
  Direction,
  TileType,
  type Bomb,
  type Explosion,
  type MapData,
  type Player,
} from '../../shared/types';
import { cellOf, dirToDelta, inBounds } from '../domain/grid';

/** 该格是否可进入（边界 / 硬墙 / 软墙 / 泡泡 / 水柱均阻挡） */
export function canEnterCell(
  map: Readonly<MapData>,
  x: number,
  y: number,
  bombs: readonly Bomb[],
  explosions: readonly Explosion[],
): boolean {
  if (!inBounds(map, x, y)) return false;
  const cell = map.cells[y][x];
  if (cell.type !== TileType.EMPTY) return false;
  if (explosions.some((e) => e.cells.some((c) => c.x === x && c.y === y))) return false;
  if (bombs.some((b) => !b.exploded && b.x === x && b.y === y)) return false;
  return true;
}

export interface MoveResult {
  x: number;
  y: number;
  /** 推泡成功时返回泡泡新坐标与方向（手套 KICK，滑动由系统推进） */
  kickedBomb: { id: number; x: number; y: number; dir: Direction } | null;
  /** 坐骑顶向的软墙格（破墙需 1.5s 过程，期间移动被挡；由系统计时完成） */
  breakTarget: { x: number; y: number } | null;
}

/**
 * 计算本 tick 的位移结果。
 * @param step 本 tick 可移动距离（格）= speed × dt
 */
export function computeMove(
  p: Readonly<Player>,
  dir: Direction,
  step: number,
  map: Readonly<MapData>,
  bombs: readonly Bomb[],
  explosions: readonly Explosion[],
  players: readonly { x: number; y: number }[] = [],
): MoveResult {
  const result: MoveResult = { x: p.x, y: p.y, kickedBomb: null, breakTarget: null };
  if (dir === Direction.NONE) return result;

  const delta = dirToDelta(dir);
  const dx = delta.x;
  const dy = delta.y;
  const cx = cellOf(p.x);
  const cy = cellOf(p.y);
  const tx = cx + dx;
  const ty = cy + dy;

  // 目标格是泡泡：有手套则尝试推泡
  let blocked = false;
  const bomb = bombs.find((b) => !b.exploded && b.x === tx && b.y === ty);
  if (bomb) {
    if (!p.kick) {
      blocked = true;
    } else {
      const bx = tx + dx;
      const by = ty + dy;
      const others = bombs.filter((b) => b.id !== bomb.id);
      // 踢泡终点规则：前进格被角色（玩家/AI）挡住 → 不能再前进（停在角色的前一格）；
      // 否则被墙/软墙等挡住 → 停在挡住格的前一格（canEnterCell 判定）
      const playerBlocked = players.some(
        (pl) => cellOf(pl.x) === bx && cellOf(pl.y) === by,
      );
      if (playerBlocked || !canEnterCell(map, bx, by, others, explosions)) blocked = true;
      else result.kickedBomb = { id: bomb.id, x: bx, y: by, dir };
    }
  } else if (!inBounds(map, tx, ty)) {
    blocked = true;
  } else {
    const cell = map.cells[ty][tx];
    if (cell.type === TileType.SOFT) {
      // 软墙：坐骑可顶开，但需破墙过程（1.5s，由系统计时）——移动先被挡
      if (p.mount) result.breakTarget = { x: tx, y: ty };
      blocked = true;
    } else if (!canEnterCell(map, tx, ty, bombs, explosions)) {
      blocked = true;
    }
  }

  if (blocked) {
    // 回弹到当前格心（两轴），保证永远停在格心
    result.x = p.x + Math.sign(cx - p.x) * Math.min(step, Math.abs(cx - p.x));
    result.y = p.y + Math.sign(cy - p.y) * Math.min(step, Math.abs(cy - p.y));
    return result;
  }

  // 两轴同时趋向目标格心：转向时垂直轴自动吸附进车道中心
  result.x = p.x + Math.sign(tx - p.x) * Math.min(step, Math.abs(tx - p.x));
  result.y = p.y + Math.sign(ty - p.y) * Math.min(step, Math.abs(ty - p.y));
  return result;
}
