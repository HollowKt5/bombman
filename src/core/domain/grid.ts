/**
 * core/domain/grid.ts —— 网格工具（坐标、邻接、BFS）
 * 纯函数，无浏览器依赖。
 */
import { Direction, type MapData } from '../../shared/types';

export interface CellPos {
  x: number;
  y: number;
}

export function inBounds(map: Readonly<MapData>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function dirToDelta(dir: Direction): CellPos {
  switch (dir) {
    case Direction.UP:
      return { x: 0, y: -1 };
    case Direction.DOWN:
      return { x: 0, y: 1 };
    case Direction.LEFT:
      return { x: -1, y: 0 };
    case Direction.RIGHT:
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * 浮点坐标 → 所属格子。
 * 半格边界（x.5）归前一个格，避免角色贴墙时被 round 进位到墙格。
 */
export function cellOf(v: number): number {
  return Math.round(v - 1e-4);
}

/**
 * BFS 寻路：从 start 出发，在 isWalkable 的格子上扩散，
 * 返回通向第一个满足 target 条件的格子的路径（不含起点），找不到返回 null。
 * 无权网格图，BFS 即可（文档：A* 过度设计）。
 */
export function bfs(
  bounds: { width: number; height: number },
  start: CellPos,
  isWalkable: (x: number, y: number) => boolean,
  target: (x: number, y: number) => boolean,
): CellPos[] | null {
  if (target(start.x, start.y)) return [];
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const queue: CellPos[] = [start];
  const visited = new Set<string>([cellKey(start.x, start.y)]);
  const parent = new Map<string, string | null>();
  parent.set(cellKey(start.x, start.y), null);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const key = cellKey(nx, ny);
      if (
        visited.has(key) ||
        nx < 0 ||
        ny < 0 ||
        nx >= bounds.width ||
        ny >= bounds.height ||
        !isWalkable(nx, ny)
      ) {
        continue;
      }
      visited.add(key);
      parent.set(key, cellKey(cur.x, cur.y));
      if (target(nx, ny)) {
        // 回溯路径
        const path: CellPos[] = [];
        let node: string | null = key;
        while (node !== null) {
          const [px, py] = node.split(',').map(Number);
          path.unshift({ x: px, y: py });
          node = parent.get(node) ?? null;
        }
        path.shift(); // 去掉起点
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
