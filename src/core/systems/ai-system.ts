/**
 * core/systems/ai-system.ts —— 为 AI 玩家生成 InputIntent（每 tick）
 *
 * 安全性（用户要求：别被自己炸死，找安全区等炸弹爆炸）：
 *   - 威胁区 = 泡泡/水柱即时危险 + 所有泡泡的【潜在爆炸范围】（含连锁）
 *   - AI 移动/漫游/撤离都避开威胁区；方向保持期若前方进入威胁区会立即重新决策
 *   - 放泡后：逃到爆炸范围外的安全格，并【原地等待】自己的泡泡爆炸完再行动
 *   - 放泡前 decideAI 会用 BFS 确认爆炸范围外存在安全撤离点
 *
 * 流畅性：方向保持（replanTicks 窗口）+ 基于连续位移的卡住检测。
 */
import {
  Direction,
  GamePhase,
  TileType,
  type AISenseSnapshot,
  type GameState,
  type InputIntent,
} from '../../shared/types';
import { DIFFICULTY, TUNING } from '../../shared/constants';
import { decideAI, nearestReachableSoftPos } from '../rules/ai';
import { computeExplosionCells } from '../rules/bomb';
import { canEnterCell } from '../rules/movement';
import { cellOf, manhattan } from '../domain/grid';
import { applyMove } from './move-system';
import { tryPlaceBomb } from './bomb-system';
import type { RNGService } from '../services/rng-service';
import type { EventBus } from '../../shared/event-bus';

/** 即时危险格 = 所有泡泡所在格 + 所有水柱覆盖格 */
export function computeDangerCells(state: GameState): Set<string> {
  const set = new Set<string>();
  for (const b of state.bombs) {
    if (!b.exploded) set.add(`${b.x},${b.y}`);
  }
  for (const ex of state.explosions) {
    for (const c of ex.cells) set.add(`${c.x},${c.y}`);
  }
  return set;
}

/** 所有泡泡的潜在爆炸范围（含连锁反应覆盖，软墙阻挡水柱） */
export function computeBlastZones(state: GameState): Set<string> {
  const zones = new Set<string>();
  const queue = state.bombs.filter((b) => !b.exploded);
  const done = new Set<number>();
  while (queue.length > 0) {
    const b = queue.shift()!;
    if (done.has(b.id)) continue;
    done.add(b.id);
    const cells = computeExplosionCells(b.x, b.y, b.range, state.map);
    for (const c of cells) zones.add(`${c.x},${c.y}`);
    // 连锁：被覆盖的其他泡泡也纳入
    for (const o of state.bombs) {
      if (!done.has(o.id) && cells.some((c) => c.x === o.x && c.y === o.y)) queue.push(o);
    }
  }
  return zones;
}

interface AiRuntime {
  dir: Direction;
  holdUntil: number;
  stuckTicks: number;
  lastMoved: boolean;
  /** 上次意图是否想移动（用于区分"想走但被挡"与"故意站定"，避免静止抽搐） */
  wantedMove: boolean;
  /** 连续静止 tick（非等爆炸）：超时强制换目标/移动，防死锁卡死 */
  idleTicks: number;
  /** 刚放泡后的等待（等自己的泡泡爆炸完），tick 上限 */
  waitUntil: number;
  /** 已承诺的目标墙（锁定直到被炸掉/卡住放弃，防止反复横跳忘记目标） */
  wallTarget: { x: number; y: number } | null;
  /** 徘徊自检：最近访问格（cellKey → tick） */
  lastVisit: Map<string, number>;
  /** 徘徊自检：最近尝试过的目标墙（重新设目标时排除，避免原地打转） */
  recentWalls: Array<{ x: number; y: number }>;
  /** 徘徊自检：上次破墙进展 tick / 破墙数 */
  lastProgressTick: number;
  lastBlocksBroken: number;
  /** 上一 tick 所在格（贪心防回退乒乓用） */
  prevCell: { x: number; y: number } | null;
}

const runtimes = new Map<number, AiRuntime>();

function getRuntime(id: number): AiRuntime {
  let r = runtimes.get(id);
  if (!r) {
    r = {
      dir: Direction.NONE,
      holdUntil: 0,
      stuckTicks: 0,
      lastMoved: false,
      wantedMove: false,
      idleTicks: 0,
      waitUntil: 0,
      wallTarget: null,
      lastVisit: new Map(),
      recentWalls: [],
      lastProgressTick: 0,
      lastBlocksBroken: 0,
      prevCell: null,
    };
    runtimes.set(id, r);
  }
  return r;
}

function dirDelta(dir: Direction): { x: number; y: number } {
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

export function tickAI(
  state: GameState,
  events: EventBus,
  rngFor: (playerId: number) => RNGService,
): void {
  if (state.phase !== GamePhase.PLAYING) return;
  if (state.tick === 0) runtimes.clear(); // 新关卡：重置状态
  const difficultyCfg = DIFFICULTY[state.difficulty];
  const bounds = { width: state.map.width, height: state.map.height };

  // 威胁区 = 即时危险 + 所有泡泡潜在爆炸范围（合并后供 AI 全程避开）
  const immediate = computeDangerCells(state);
  const blast = computeBlastZones(state);
  const threat = new Set<string>([...immediate, ...blast]);

  const walkable = (x: number, y: number) =>
    canEnterCell(state.map, x, y, state.bombs, state.explosions);
  const blastCells = (x: number, y: number, range: number) =>
    new Set(computeExplosionCells(x, y, range, state.map).map((c) => `${c.x},${c.y}`));

  // 软墙清单（AI 破墙主目标用）
  const softBlocks: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      if (state.map.cells[y][x].type === TileType.SOFT) softBlocks.push({ x, y });
    }
  }

  for (const p of state.players) {
    if (p.isHuman || !p.alive) continue;
    const rt = getRuntime(p.id);
    const cx = cellOf(p.x);
    const cy = cellOf(p.y);
    const posKey = `${cx},${cy}`;

    // 卡住检测：仅当"想移动却没能移动"才累计；故意站定不累计 → 静止不抽搐
    if (rt.waitUntil <= state.tick) {
      if (rt.wantedMove && !rt.lastMoved) {
        rt.stuckTicks++;
      } else {
        rt.stuckTicks = 0;
      }
      // 连续静止超时（非等爆炸）→ 视为死锁：强制换目标/移动
      if (rt.lastMoved) {
        rt.idleTicks = 0;
      } else {
        rt.idleTicks++;
      }
    }
    const stuck = rt.stuckTicks >= 3 || rt.idleTicks >= 15;

    // 徘徊自检：最近 80 tick 内回到同一格，且 80 tick 内没有破墙进展 → 判定在徘徊，
    // 重新设定目标（把当前目标记入"最近尝试过的墙"并排除，换一堵新墙）
    const lastVisitTick = rt.lastVisit.get(posKey);
    rt.lastVisit.set(posKey, state.tick);
    const revisiting = lastVisitTick !== undefined && state.tick - lastVisitTick < 80;
    const noProgress = state.tick - rt.lastProgressTick > 80;
    const pacing = revisiting && noProgress && !(rt.waitUntil > state.tick);
    if (pacing) {
      if (rt.wallTarget) rt.recentWalls.push(rt.wallTarget);
      if (rt.recentWalls.length > 4) rt.recentWalls.shift();
      rt.wallTarget = null;
      rt.lastVisit.clear();
    }
    // 破墙进展记录
    if (p.blocksBroken !== rt.lastBlocksBroken) {
      rt.lastBlocksBroken = p.blocksBroken;
      rt.lastProgressTick = state.tick;
    }

    // 目标墙承诺：继续炸同一堵墙直到被炸掉；卡住（静止超时/被挡）或徘徊则放弃并换一堵
    // （只选"可到达"的墙，且排除最近尝试过的，防止对着不可达墙发呆/原地打转）
    let wallTarget = rt.wallTarget;
    if (wallTarget && !softBlocks.some((w) => w.x === wallTarget!.x && w.y === wallTarget!.y)) {
      wallTarget = null; // 已被炸掉
    }
    if ((stuck || pacing) && wallTarget) {
      wallTarget = nearestReachableSoftPos(softBlocks, { x: cx, y: cy }, walkable, [
        wallTarget,
        ...rt.recentWalls,
      ]);
    }
    if (!wallTarget) {
      wallTarget = nearestReachableSoftPos(
        softBlocks,
        { x: cx, y: cy },
        walkable,
        rt.recentWalls.length > 0 ? rt.recentWalls : undefined,
      );
    }
    rt.wallTarget = wallTarget;

    const snapshot: AISenseSnapshot = {
      self: { x: p.x, y: p.y, trapped: p.trapped, lastDir: p.lastDir },
      bounds,
      dangerCells: threat,
      enemies: state.players
        .filter((pp) => pp.alive && pp.id !== p.id)
        .map((pp) => ({ x: cellOf(pp.x), y: cellOf(pp.y) })),
      powerUps: state.powerUps.map((pu) => ({ x: pu.x, y: pu.y, type: pu.type })),
      difficulty: difficultyCfg,
      hasBombAtSelf: state.bombs.some((b) => !b.exploded && b.x === cx && b.y === cy),
      softBlocks,
      wallTarget,
      walkable,
      blastCells,
      stuck,
      prevCell: rt.prevCell,
    };

    // 决策：危险/等待中/卡住/保持期到期 → 重新决策；否则复用已决定方向（平滑）
    let intent: InputIntent;
    if (p.trapped) {
      intent = { playerId: p.id, direction: Direction.NONE, placeBomb: false };
    } else if (threat.has(posKey)) {
      // 在威胁区内 → 立即逃生（decideAI 内部处理）
      intent = decideAI(p, snapshot, () => rngFor(p.id).next());
      if (intent.direction !== Direction.NONE) rt.holdUntil = state.tick + TUNING.ai.replanTicks;
    } else if (state.tick < rt.waitUntil) {
      // 已逃到安全区：等待自己的泡泡爆炸完——不直接吸附，若正处在两格之间
      // 先沿当前方向滑到格心站定，保持移动连贯（无跳格子感），再原地等待
      const atCenter =
        Math.abs(p.x - Math.round(p.x)) < 1e-4 && Math.abs(p.y - Math.round(p.y)) < 1e-4;
      intent = {
        playerId: p.id,
        direction: atCenter || rt.dir === Direction.NONE ? Direction.NONE : rt.dir,
        placeBomb: false,
      };
    } else if (stuck || state.tick >= rt.holdUntil) {
      intent = decideAI(p, snapshot, () => rngFor(p.id).next());
      if (intent.direction !== Direction.NONE) rt.holdUntil = state.tick + TUNING.ai.replanTicks;
    } else {
      // 方向保持期内复用；但前方进入威胁区/不可走，或已贴到目标墙 → 立即重新决策
      // （防止保持旧方向走过目标墙错过放泡窗口）
      const d = dirDelta(rt.dir);
      const nx = cx + d.x;
      const ny = cy + d.y;
      const nearTarget =
        rt.wallTarget !== null && manhattan(cx, cy, rt.wallTarget.x, rt.wallTarget.y) <= 1;
      const targetOk = walkable(nx, ny) && !threat.has(`${nx},${ny}`);
      if (targetOk && !nearTarget) {
        intent = { playerId: p.id, direction: rt.dir, placeBomb: false };
      } else {
        intent = decideAI(p, snapshot, () => rngFor(p.id).next());
        if (intent.direction !== Direction.NONE) rt.holdUntil = state.tick + TUNING.ai.replanTicks;
      }
    }

    // 应用
    const px = p.x;
    const py = p.y;
    applyMove(state, p, intent.direction, events);
    if (intent.placeBomb && tryPlaceBomb(state, p, events)) {
      // 放泡成功：等待自己的泡泡爆炸（引信时长），期间原地等；爆炸后水柱格会阻挡通行，天然安全
      rt.waitUntil = state.tick + TUNING.bomb.fuseTicks;
    }
    rt.lastMoved = p.x !== px || p.y !== py;
    rt.wantedMove = intent.direction !== Direction.NONE;
    if (intent.direction !== Direction.NONE) rt.dir = intent.direction;
    // 记录本 tick 起始格：下一 tick 决策时作为"刚离开的格"（贪心禁止回退）
    rt.prevCell = { x: cx, y: cy };
  }
}
