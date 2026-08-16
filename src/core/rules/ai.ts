/**
 * core/rules/ai.ts —— AI 决策（纯函数，接收视野快照返回 InputIntent）
 *
 * 目标优先级（v1.4 用户要求：破墙为主、攻击为顺便）：
 *   逃跑(危险) → 破墙(炸软墙主目标) → 攻击玩家(顺带) → 漫游(巡逻)
 *
 * 防抖动/流畅性：
 *   - 追击/走向目标优先"贪心直走"，直线被挡才 BFS 绕路
 *   - 漫游只在可走且不危险的方向里选，85% 延续上次方向
 *   - 方向由 ai-system 保持（replanTicks 窗口）
 */
import {
  Direction,
  type AISenseSnapshot,
  type InputIntent,
  type Player,
} from '../../shared/types';
import { bfs, cellOf, manhattan, type CellPos } from '../domain/grid';

/** AI 寻找软墙的搜索半径（密集地图下软墙稀疏，放宽到全图） */
const WALL_RADIUS = 20;

function idle(playerId: number): InputIntent {
  return { playerId, direction: Direction.NONE, placeBomb: false };
}

function dirFor(dx: number, dy: number): Direction {
  if (dx > 0) return Direction.RIGHT;
  if (dx < 0) return Direction.LEFT;
  if (dy > 0) return Direction.DOWN;
  if (dy < 0) return Direction.UP;
  return Direction.NONE;
}

function dirToward(from: CellPos, to: CellPos): Direction {
  return dirFor(to.x - from.x, to.y - from.y);
}

const DIRS = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT];
const DELTAS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** 目标步是否可走且不处于危险区 */
function stepOk(snapshot: AISenseSnapshot, from: CellPos, dx: number, dy: number): boolean {
  const nx = from.x + dx;
  const ny = from.y + dy;
  return snapshot.walkable(nx, ny) && !snapshot.dangerCells.has(`${nx},${ny}`);
}

/** 贪心直走：朝向目标优先直线移动（先走距离更大的轴）；直线被挡返回 NONE（调用方回退 BFS）。
 *  禁止回退到 prevCell（刚离开的格）——防止死胡同口袋内逐 tick 左右乒乓；绕路交给 BFS。 */
function greedyChaseDir(
  snapshot: AISenseSnapshot,
  from: CellPos,
  target: CellPos,
  prevCell?: CellPos | null,
): Direction {
  const dx = Math.sign(target.x - from.x);
  const dy = Math.sign(target.y - from.y);
  const distX = Math.abs(target.x - from.x);
  const distY = Math.abs(target.y - from.y);
  if (distX === 0 && distY === 0) return Direction.NONE;
  const ok = (sx: number, sy: number): boolean => {
    const nx = from.x + sx;
    const ny = from.y + sy;
    if (prevCell && nx === prevCell.x && ny === prevCell.y) return false;
    return stepOk(snapshot, from, sx, sy);
  };
  if (distX >= distY) {
    if (dx !== 0 && ok(dx, 0)) return dirFor(dx, 0);
    if (dy !== 0 && ok(0, dy)) return dirFor(0, dy);
  } else {
    if (dy !== 0 && ok(0, dy)) return dirFor(0, dy);
    if (dx !== 0 && ok(dx, 0)) return dirFor(dx, 0);
  }
  return Direction.NONE;
}

/** BFS 追击（直线被挡时绕路；路径避开威胁区，不往危险区域走） */
function chaseDir(snapshot: AISenseSnapshot, from: CellPos, goal: CellPos): Direction {
  const path = bfs(
    snapshot.bounds,
    from,
    (x, y) => snapshot.walkable(x, y) && !snapshot.dangerCells.has(`${x},${y}`),
    (x, y) => x === goal.x && y === goal.y,
  );
  if (path && path.length > 0) return dirToward(from, path[0]);
  return Direction.NONE;
}

/** BFS 走向软墙的相邻可走格（贴墙放泡位置；路径避开威胁区） */
function chaseDirToWall(
  snapshot: AISenseSnapshot,
  from: CellPos,
  wall: CellPos,
): Direction {
  const path = bfs(
    snapshot.bounds,
    from,
    (x, y) => snapshot.walkable(x, y) && !snapshot.dangerCells.has(`${x},${y}`),
    (x, y) => manhattan(x, y, wall.x, wall.y) === 1,
  );
  if (path && path.length > 0) return dirToward(from, path[0]);
  return Direction.NONE;
}

/** BFS 逃生：最近的不处于危险区的可走格 */
function nearestSafeDir(snapshot: AISenseSnapshot, from: CellPos): Direction | null {
  const path = bfs(
    snapshot.bounds,
    from,
    (x, y) => snapshot.walkable(x, y),
    (x, y) => !snapshot.dangerCells.has(`${x},${y}`),
  );
  if (path && path.length > 0) return dirToward(from, path[0]);
  return null;
}

function nearestEnemy(snapshot: AISenseSnapshot, from: CellPos): CellPos | null {
  let best: CellPos | null = null;
  let bestDist = Infinity;
  for (const e of snapshot.enemies) {
    const d = manhattan(from.x, from.y, e.x, e.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

/** 最近的软墙（破墙主目标，半径内；exclude 用于卡住后换目标） */
export function nearestSoftPos(
  softBlocks: Array<{ x: number; y: number }>,
  from: CellPos,
  exclude?: CellPos,
  radius = WALL_RADIUS,
): CellPos | null {
  let best: CellPos | null = null;
  let bestDist = Infinity;
  for (const w of softBlocks) {
    if (exclude && w.x === exclude.x && w.y === exclude.y) continue;
    const d = manhattan(from.x, from.y, w.x, w.y);
    if (d < bestDist && d <= radius) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

/**
 * 最近且"可到达"的软墙：必须存在可走的相邻格（否则永远无法贴墙放泡/顶墙，
 * 会导致 AI 对着不可达墙发呆卡死）。exclude 支持单个或多个（卡住/徘徊后换目标）。
 */
export function nearestReachableSoftPos(
  softBlocks: Array<{ x: number; y: number }>,
  from: CellPos,
  walkable: (x: number, y: number) => boolean,
  exclude?: CellPos | CellPos[],
  radius = WALL_RADIUS,
): CellPos | null {
  const excluded = exclude
    ? (Array.isArray(exclude) ? exclude : [exclude]).map((e) => `${e.x},${e.y}`)
    : [];
  let best: CellPos | null = null;
  let bestDist = Infinity;
  for (const w of softBlocks) {
    if (excluded.includes(`${w.x},${w.y}`)) continue;
    const d = manhattan(from.x, from.y, w.x, w.y);
    if (d >= bestDist || d > radius) continue;
    const reachable = DIRS.some(
      (i) => walkable(w.x + DELTAS[i][0], w.y + DELTAS[i][1]),
    );
    if (reachable) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

function nearestReachableSoft(snapshot: AISenseSnapshot, from: CellPos): CellPos | null {
  return nearestReachableSoftPos(snapshot.softBlocks, from, snapshot.walkable);
}

/** 到最近软墙的曼哈顿距离（无墙 → Infinity） */
function nearestSoftDist(snapshot: AISenseSnapshot, from: CellPos): number {
  let best = Infinity;
  for (const w of snapshot.softBlocks) {
    const d = manhattan(from.x, from.y, w.x, w.y);
    if (d < best) best = d;
  }
  return best;
}

/** 是否贴着任意软墙（贴到就炸，清场主目标） */
function hasAdjacentWall(snapshot: AISenseSnapshot, from: CellPos): boolean {
  return snapshot.softBlocks.some((w) => manhattan(from.x, from.y, w.x, w.y) === 1);
}

/** 最近贴邻软墙的方向（坐骑 AI 顶墙用） */
function adjacentSoftDir(snapshot: AISenseSnapshot, from: CellPos): Direction {
  let best: Direction = Direction.NONE;
  for (const w of snapshot.softBlocks) {
    if (manhattan(from.x, from.y, w.x, w.y) === 1) {
      best = dirToward(from, w);
      break;
    }
  }
  return best;
}

/**
 * 坐骑 AI 走向软墙：中间步要求可走，最后一步允许"顶"墙（触发破墙充能）。
 */
function greedyChaseDirMount(
  snapshot: AISenseSnapshot,
  from: CellPos,
  wall: CellPos,
  prevCell?: CellPos | null,
): Direction {
  const dx = Math.sign(wall.x - from.x);
  const dy = Math.sign(wall.y - from.y);
  const distX = Math.abs(wall.x - from.x);
  const distY = Math.abs(wall.y - from.y);
  if (distX === 0 && distY === 0) return Direction.NONE;
  const tryStep = (sx: number, sy: number): Direction | null => {
    const nx = from.x + sx;
    const ny = from.y + sy;
    if (nx === wall.x && ny === wall.y) return dirFor(sx, sy); // 目标格就是墙 → 顶它
    if (prevCell && nx === prevCell.x && ny === prevCell.y) return null; // 不回退
    if (snapshot.walkable(nx, ny) && !snapshot.dangerCells.has(`${nx},${ny}`)) {
      return dirFor(sx, sy);
    }
    return null;
  };
  if (distX >= distY) {
    if (dx !== 0) {
      const r = tryStep(dx, 0);
      if (r) return r;
    }
    if (dy !== 0) {
      const r = tryStep(0, dy);
      if (r) return r;
    }
  } else {
    if (dy !== 0) {
      const r = tryStep(0, dy);
      if (r) return r;
    }
    if (dx !== 0) {
      const r = tryStep(dx, 0);
      if (r) return r;
    }
  }
  return Direction.NONE;
}

/** 当前格可走且不处于危险区的方向（漫游候选） */
function walkableDirs(snapshot: AISenseSnapshot, from: CellPos): Direction[] {
  const out: Direction[] = [];
  for (let i = 0; i < DIRS.length; i++) {
    if (stepOk(snapshot, from, DELTAS[i][0], DELTAS[i][1])) out.push(DIRS[i]);
  }
  return out;
}

/**
 * 放泡前安全检查：以自身为中心放一颗 range 半径的泡泡，
 * BFS 确认爆炸范围外存在可撤离的安全格（自身格除外）——避免把自己炸死。
 * 中间步允许穿过爆炸范围（引信 2.5s 足够走开），但终点必须在爆炸范围外。
 */
function canBombSafely(snapshot: AISenseSnapshot, from: CellPos, range: number): boolean {
  const willBlast = snapshot.blastCells(from.x, from.y, range);
  const path = bfs(
    snapshot.bounds,
    from,
    (x, y) => snapshot.walkable(x, y) && !snapshot.dangerCells.has(`${x},${y}`),
    (x, y) => !willBlast.has(`${x},${y}`) && !(x === from.x && y === from.y),
  );
  return path !== null && path.length > 0;
}

export function decideAI(
  self: Readonly<Player>,
  snapshot: AISenseSnapshot,
  rng: () => number,
): InputIntent {
  const myId = self.id;
  if (!self.alive || self.trapped) return idle(myId);

  const cx = cellOf(self.x);
  const cy = cellOf(self.y);
  const from: CellPos = { x: cx, y: cy };
  const selfKey = `${cx},${cy}`;
  const inDanger = snapshot.dangerCells.has(selfKey);
  const { aggressiveness, placeBombChance } = snapshot.difficulty;

  const target = nearestEnemy(snapshot, from);
  const targetDist = target ? manhattan(cx, cy, target.x, target.y) : Infinity;

  // 1) 危险 → 立即逃向最近安全格；无路可逃则原地放泡自救
  if (inDanger) {
    const safeDir = nearestSafeDir(snapshot, from);
    if (safeDir !== null) {
      return { playerId: myId, direction: safeDir, placeBomb: false };
    }
    return { playerId: myId, direction: Direction.NONE, placeBomb: !snapshot.hasBombAtSelf };
  }

  // 2) 破墙（主目标：清掉所有可炸格子）
  // 2a) 坐骑 AI：直接顶墙破（按住方向充能 0.5s → 破墙 1.5s），不依赖放泡，持续操作不停摆
  if (self.mount) {
    if (self.break) {
      // 充能/破墙中：持续按住朝向破墙格的方向（危险时上面的逃生分支优先）
      const bd = dirToward(from, { x: self.break.x, y: self.break.y });
      if (bd !== Direction.NONE) return { playerId: myId, direction: bd, placeBomb: false };
    }
    // 贴到任意软墙 → 顶它
    const adj = adjacentSoftDir(snapshot, from);
    if (adj !== Direction.NONE) return { playerId: myId, direction: adj, placeBomb: false };
    // 不贴墙：走向最近"可到达"软墙（顶墙目标）
    if (!snapshot.stuck) {
      let wall = snapshot.wallTarget;
      if (wall && !snapshot.softBlocks.some((w) => w.x === wall!.x && w.y === wall!.y)) {
        wall = null;
      }
      if (!wall) wall = nearestReachableSoft(snapshot, from);
      if (wall) {
        const g = greedyChaseDirMount(snapshot, from, wall, snapshot.prevCell);
        if (g !== Direction.NONE) return { playerId: myId, direction: g, placeBomb: false };
      }
    }
  } else if (hasAdjacentWall(snapshot, from)) {
    // 2b) 无坐骑：贴着任意软墙 → 放泡（确认安全撤离点）或原地等待
    if (
      !snapshot.hasBombAtSelf &&
      rng() < 0.7 &&
      canBombSafely(snapshot, from, self.bombRange)
    ) {
      return { playerId: myId, direction: Direction.NONE, placeBomb: true };
    }
    if (!snapshot.stuck) {
      return idle(myId); // 正常：原地等待下一次放泡机会（不抽搐）
    }
    // 卡住且放不了泡：退开（交给漫游），ai-system 会换目标
  } else if (!snapshot.stuck) {
    // 2c) 无坐骑不贴墙：走向目标墙（承诺制，且只选"可到达"墙，防卡死）
    let wall = snapshot.wallTarget;
    if (wall && !snapshot.softBlocks.some((w) => w.x === wall!.x && w.y === wall!.y)) {
      wall = null; // 目标已被炸掉
    }
    if (!wall) wall = nearestReachableSoft(snapshot, from);
    if (wall) {
      const g = greedyChaseDir(snapshot, from, wall, snapshot.prevCell);
      if (g !== Direction.NONE) return { playerId: myId, direction: g, placeBomb: false };
      const b = chaseDirToWall(snapshot, from, wall);
      if (b !== Direction.NONE) return { playerId: myId, direction: b, placeBomb: false };
      return idle(myId); // 目标墙不可达：原地等（ai-system 静止超时会换目标）
    }
  }

  // 3) 攻击玩家：没有墙可炸 → 主动追着炸（互相攻击/攻击玩家）；有墙但玩家在视野内且比墙近 → 追一下
  const noReachableWall = nearestReachableSoft(snapshot, from) === null;
  const nearestWallDist = snapshot.softBlocks.length > 0 ? nearestSoftDist(snapshot, from) : Infinity;
  const wallCloser = targetDist > nearestWallDist;
  if (target && (noReachableWall || (targetDist <= 5 && !wallCloser))) {
    if (
      targetDist <= 2 &&
      !snapshot.hasBombAtSelf &&
      rng() < placeBombChance &&
      canBombSafely(snapshot, from, self.bombRange)
    ) {
      return { playerId: myId, direction: Direction.NONE, placeBomb: true };
    }
    if (noReachableWall || aggressiveness > 0.3 || rng() < 0.3) {
      const g = greedyChaseDir(snapshot, from, target, snapshot.prevCell);
      if (g !== Direction.NONE) return { playerId: myId, direction: g, placeBomb: false };
      const b = chaseDir(snapshot, from, target);
      if (b !== Direction.NONE) return { playerId: myId, direction: b, placeBomb: false };
    }
  }

  // 4) 漫游（巡逻）：只在可走方向里选；85% 延续上次方向；卡住/方向不可走时强制换向
  const candidates = walkableDirs(snapshot, from);
  if (candidates.length > 0) {
    if (snapshot.stuck || !candidates.includes(self.lastDir)) {
      return {
        playerId: myId,
        direction: candidates[Math.floor(rng() * candidates.length)],
        placeBomb: false,
      };
    }
    if (rng() < 0.85) {
      return { playerId: myId, direction: self.lastDir, placeBomb: false };
    }
    return {
      playerId: myId,
      direction: candidates[Math.floor(rng() * candidates.length)],
      placeBomb: false,
    };
  }
  return idle(myId);
}
