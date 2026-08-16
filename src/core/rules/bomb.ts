/**
 * core/rules/bomb.ts —— 放置泡泡、爆炸水柱计算、连锁传播（纯函数）
 */
import {
  TileType,
  type Bomb,
  type MapData,
  type PowerUpType,
} from '../../shared/types';

export interface ExplosionCell {
  x: number;
  y: number;
}

/** 十字水柱：从中心向四方向延伸，硬墙阻挡、软墙自身被毁但挡住延伸 */
export function computeExplosionCells(
  bx: number,
  by: number,
  range: number,
  map: Readonly<MapData>,
): ExplosionCell[] {
  const cells: ExplosionCell[] = [{ x: bx, y: by }];
  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const d of dirs) {
    for (let r = 1; r <= range; r++) {
      const nx = bx + d.x * r;
      const ny = by + d.y * r;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) break;
      const cell = map.cells[ny][nx];
      if (cell.type === TileType.WALL) break; // 硬墙阻挡
      cells.push({ x: nx, y: ny });
      if (cell.type === TileType.SOFT) break; // 软墙被毁但水柱不穿透
    }
  }
  return cells;
}

export interface ChainResult {
  /** 新生成的水柱（无 id，由系统分配） */
  explosions: Array<{ ownerId: number; cells: ExplosionCell[] }>;
  /** 被炸毁的软方块（含隐藏道具） */
  destroyedBlocks: Array<{ x: number; y: number; hiddenPowerUp: PowerUpType | null }>;
  /** 参与爆炸的所有泡泡 id */
  explodedBombIds: number[];
}

/**
 * 连锁爆炸：BFS 遍历所有被引爆的泡泡（去重，不无限递归）。
 * 纯函数：不修改入参；内部使用工作副本，后续连锁可见已摧毁的软墙（文档实现）。
 */
export function resolveChainExplosions(
  map: Readonly<MapData>,
  bombs: readonly Bomb[],
  initialBombIds: number[],
): ChainResult {
  // 工作副本（仅软墙会被改写）
  const workCells = map.cells.map((row) => row.map((c) => ({ ...c })));
  const workMap: MapData = { width: map.width, height: map.height, cells: workCells, theme: map.theme };

  const queue = bombs.filter((b) => initialBombIds.includes(b.id));
  const exploded = new Set<number>();
  const result: ChainResult = { explosions: [], destroyedBlocks: [], explodedBombIds: [] };
  const destroyedKeys = new Set<string>();

  while (queue.length > 0) {
    const bomb = queue.shift()!;
    if (exploded.has(bomb.id)) continue;
    exploded.add(bomb.id);

    const cells = computeExplosionCells(bomb.x, bomb.y, bomb.range, workMap);
    result.explosions.push({ ownerId: bomb.ownerId, cells });

    for (const c of cells) {
      const key = `${c.x},${c.y}`;
      const cell = workCells[c.y][c.x];
      if (cell.type === TileType.SOFT && !destroyedKeys.has(key)) {
        destroyedKeys.add(key);
        result.destroyedBlocks.push({ x: c.x, y: c.y, hiddenPowerUp: cell.hiddenPowerUp });
        cell.type = TileType.EMPTY; // 后续连锁可见
      }
    }

    for (const other of bombs) {
      if (exploded.has(other.id)) continue;
      if (cells.some((c) => c.x === other.x && c.y === other.y)) queue.push(other);
    }
  }

  result.explodedBombIds = [...exploded];
  return result;
}
