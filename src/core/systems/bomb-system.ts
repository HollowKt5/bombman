/**
 * core/systems/bomb-system.ts —— 泡泡计时器递减、到期触发爆炸、软墙摧毁与道具掉落、踢泡推进
 */
import {
  Direction,
  TileType,
  type GameState,
  type Player,
} from '../../shared/types';
import { TUNING, BLOCK_DROP_TABLE_AI } from '../../shared/constants';
import { resolveChainExplosions } from '../rules/bomb';
import { createPowerUp, rollBlockDrop } from '../domain/entity';
import { cellOf } from '../domain/grid';
import type { RNGService } from '../services/rng-service';
import type { EventBus } from '../../shared/event-bus';

/** 摧毁一格软墙：清空 + 掉道具 + 计分（爆炸与坐骑顶开共用）。
 *  掉落规则：玩家炸出 → 用隐藏道具（地图生成时按玩家表预掷）；
 *  **AI 炸出 → 按 AI 掉落表重掷**（坐骑/无敌/靴子等概率缩水，仅针对 AI）。 */
export function destroySoftBlock(
  state: GameState,
  x: number,
  y: number,
  ownerId: number,
  events: EventBus,
  rng: RNGService,
): void {
  const cell = state.map.cells[y][x];
  const hidden = cell.hiddenPowerUp;
  cell.type = TileType.EMPTY;
  cell.hiddenPowerUp = null;
  events.emit({ type: 'block:destroyed', x, y });

  const owner = state.players.find((p) => p.id === ownerId);
  if (owner) {
    owner.blocksBroken++;
    owner.score += TUNING.score.block;
  }
  if (owner && !owner.isHuman) {
    const aiDrop = rollBlockDrop(rng, BLOCK_DROP_TABLE_AI);
    if (aiDrop !== null) state.powerUps.push(createPowerUp(state.nextEntityId++, x, y, aiDrop));
  } else if (hidden !== null) {
    state.powerUps.push(createPowerUp(state.nextEntityId++, x, y, hidden));
  }
}

/** 玩家尝试放泡（冷却 / 上限 / 同格去重 / 仅空地）；返回是否放置成功 */
export function tryPlaceBomb(state: GameState, player: Player, events: EventBus): boolean {
  if (!player.alive || player.trapped || player.bombCooldown > 0) return false;
  const cx = cellOf(player.x);
  const cy = cellOf(player.y);
  if (state.map.cells[cy][cx].type !== TileType.EMPTY) return false; // 不能放在墙上
  const ownCount = state.bombs.filter((b) => b.ownerId === player.id && !b.exploded).length;
  if (ownCount >= player.maxBombs) return false;
  if (state.bombs.some((b) => !b.exploded && b.x === cx && b.y === cy)) return false;

  state.bombs.push({
    id: state.nextEntityId++,
    ownerId: player.id,
    x: cx,
    y: cy,
    timer: TUNING.bomb.fuseTicks,
    range: player.bombRange,
    exploded: false,
    kickDir: null,
    kickT: 0,
    kickSlide: null,
  });
  player.bombCooldown = TUNING.player.bombCooldownTicks;
  events.emit({ type: 'bomb:placed', x: cx, y: cy, ownerId: player.id });
  return true;
}

/** 每 tick 推进泡泡：冷却、引信、踢泡滑动、到期连锁爆炸 */
export function tickBombs(state: GameState, events: EventBus, rng: RNGService): void {
  for (const p of state.players) {
    if (p.bombCooldown > 0) p.bombCooldown--;
  }

  // 踢泡推进：被踢的泡泡按固定节奏一格一格滑动，直到撞到障碍停下（有过程感）
  for (const b of state.bombs) {
    if (b.kickDir === null) continue;
    b.kickT--;
    if (b.kickT <= 0) {
      const d = dirDelta(b.kickDir);
      const nx = b.x + d.x;
      const ny = b.y + d.y;
      const others = state.bombs.filter((o) => o.id !== b.id);
      if (canEnterCellForKick(state, nx, ny, others)) {
        b.kickSlide = {
          fromX: b.x,
          fromY: b.y,
          toX: nx,
          toY: ny,
          remaining: TUNING.bomb.kickTicks,
        };
        b.x = nx;
        b.y = ny;
        b.kickT = TUNING.bomb.kickTicks;
      } else {
        b.kickDir = null; // 撞墙/软墙/其他泡泡/水柱 → 停下
        b.kickSlide = null;
      }
    }
  }

  const due: number[] = [];
  for (const b of state.bombs) {
    b.timer--;
    if (b.timer <= 0) due.push(b.id);
  }
  if (due.length === 0) return;

  const primaryOwner =
    state.bombs.find((b) => b.id === due[0])?.ownerId ?? state.players[0]?.id ?? 0;

  const result = resolveChainExplosions(state.map, state.bombs, due);

  // 移除已爆炸泡泡
  const explodedSet = new Set(result.explodedBombIds);
  state.bombs = state.bombs.filter((b) => !explodedSet.has(b.id));

  // 计分（爆破分）
  const owner = state.players.find((p) => p.id === primaryOwner);
  if (owner && result.destroyedBlocks.length > 0) {
    owner.score += result.destroyedBlocks.length * TUNING.score.block;
  }

  // 生成水柱
  for (const ex of result.explosions) {
    state.explosions.push({
      id: state.nextEntityId++,
      ownerId: ex.ownerId,
      cells: ex.cells,
      remaining: TUNING.bomb.explosionDurationTicks,
      total: TUNING.bomb.explosionDurationTicks,
      hitIds: [],
    });
    events.emit({ type: 'explosion:start', cells: ex.cells, ownerId: ex.ownerId });
  }

  // 先销毁"本轮水柱覆盖"的【旧】道具（GDD 5.3.3：道具可被水柱摧毁）
  const flameCells = new Set<string>();
  for (const ex of result.explosions) {
    for (const c of ex.cells) flameCells.add(`${c.x},${c.y}`);
  }
  state.powerUps = state.powerUps.filter((pu) => !flameCells.has(`${pu.x},${pu.y}`));

  // 再生成本轮露出的道具 —— 刚露出的道具不在上述过滤中，不会被同一轮水柱销毁
  for (const blk of result.destroyedBlocks) {
    destroySoftBlock(state, blk.x, blk.y, primaryOwner, events, rng);
  }
}

/** 踢泡目标格是否可进：只允许空地、无其他泡泡/水柱，且**不被角色（玩家/AI）占据**——
 *  前进格被角色挡住时泡泡不能再前进（停在角色的前一格，即当前格） */
function canEnterCellForKick(
  state: GameState,
  x: number,
  y: number,
  others: readonly { x: number; y: number }[],
): boolean {
  if (x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return false;
  if (state.map.cells[y][x].type !== TileType.EMPTY) return false;
  if (state.explosions.some((e) => e.cells.some((c) => c.x === x && c.y === y))) return false;
  if (others.some((o) => o.x === x && o.y === y)) return false;
  if (state.players.some((pl) => pl.alive && cellOf(pl.x) === x && cellOf(pl.y) === y)) return false;
  return true;
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
