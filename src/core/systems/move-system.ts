/**
 * core/systems/move-system.ts —— 应用移动输入 → 调用 rules/movement
 * 含：坐骑顶开软墙（1.5s 破墙过程，期间锁移动，可取消）、踢泡初始化（滑动由 bomb-system 推进）。
 */
import { Direction, type GameState, type Player } from '../../shared/types';
import { TUNING } from '../../shared/constants';
import { computeMove } from '../rules/movement';
import { cellOf, dirToDelta } from '../domain/grid';
import type { EventBus } from '../../shared/event-bus';

const DT = 1 / TUNING.tickRate;

export function applyMove(
  state: GameState,
  player: Player,
  dir: Direction,
  events: EventBus,
): void {
  if (!player.alive || player.trapped) return;

  // 破墙中（充能/破墙）：必须持续按住朝向破墙格的方向；松开或换方向则取消
  if (player.break) {
    const d = dirToDelta(dir);
    const tx = cellOf(player.x) + d.x;
    const ty = cellOf(player.y) + d.y;
    const towardBreak =
      dir !== Direction.NONE && tx === player.break.x && ty === player.break.y;
    if (dir === Direction.NONE || !towardBreak) {
      player.break = null; // 松开/换方向 → 取消
    } else {
      return; // 按住 → 继续充能/破墙（锁移动）
    }
  }

  // 恐龙坐骑 ×0.9；彩虹光波 ×1.1（叠加）
  let speedFactor = player.mount ? TUNING.player.mountSpeedFactor : 1;
  if (player.rainbow) speedFactor *= 1.1;
  const step = player.speed * speedFactor * DT;
  const result = computeMove(
    player,
    dir,
    step,
    state.map,
    state.bombs,
    state.explosions,
    state.players,
  );

  player.x = result.x;
  player.y = result.y;

  // 顶到软墙：进入充能阶段（按住 0.5s 后才开始破墙；若已在充能/破墙同一格，上面会 return，不会走到这里）
  if (result.breakTarget) {
    player.break = {
      x: result.breakTarget.x,
      y: result.breakTarget.y,
      t: TUNING.player.mountChargeTicks,
      phase: 'charge',
    };
  }

  // 踢泡：记录滑动起点/终点与推进方向（逻辑格即时更新，渲染插值滑动）
  if (result.kickedBomb) {
    const bomb = state.bombs.find((b) => b.id === result.kickedBomb!.id);
    if (bomb) {
      bomb.kickSlide = {
        fromX: bomb.x,
        fromY: bomb.y,
        toX: result.kickedBomb.x,
        toY: result.kickedBomb.y,
        remaining: TUNING.bomb.kickTicks,
      };
      bomb.kickDir = result.kickedBomb.dir;
      bomb.kickT = TUNING.bomb.kickTicks;
      bomb.x = result.kickedBomb.x;
      bomb.y = result.kickedBomb.y;
    }
  }

  if (dir !== Direction.NONE) {
    player.facing = dir;
    player.lastDir = dir;
  }

  // 吸附最近的车道线（格心 n.0），防止浮点漂移
  player.x = snapToLane(player.x);
  player.y = snapToLane(player.y);
}

/** 吸附到最近格心 */
function snapToLane(v: number): number {
  const nearest = Math.round(v);
  return Math.abs(v - nearest) < 1e-4 ? nearest : v;
}
