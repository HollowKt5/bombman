/**
 * core/systems/powerup-system.ts —— 道具拾取检测、效果应用、过期清理
 */
import { type GameState, type PowerUp } from '../../shared/types';
import { TUNING } from '../../shared/constants';
import { powerUpEffect } from '../rules/powerup';
import { resolveHit } from '../rules/damage';
import { cellOf } from '../domain/grid';
import type { EventBus } from '../../shared/event-bus';

export function tickPowerUps(state: GameState, events: EventBus): void {
  const remaining: PowerUp[] = [];
  for (const pu of state.powerUps) {
    let picked = false;
    for (const p of state.players) {
      if (!p.alive || p.trapped) continue;
      if (cellOf(p.x) === pu.x && cellOf(p.y) === pu.y) {
        const effect = powerUpEffect(p, pu.type);
        if (!effect.maxedOut) Object.assign(p, effect.patch);
        p.eaten.push(pu.type); // 记录吃过的道具（死亡掉落用）
        p.powerupsTaken++;
        p.score += TUNING.powerUp.scorePerPickup;
        events.emit({
          type: 'powerup:pickup',
          x: pu.x,
          y: pu.y,
          powerUp: pu.type,
          playerId: p.id,
        });
        picked = true;
        break;
      }
    }
    if (!picked) remaining.push(pu);
  }
  state.powerUps = remaining;

  // 彩虹光波接触伤害：与"彩虹玩家"同格的其他角色掉 1 格命（无敌可挡）
  for (const a of state.players) {
    if (!a.alive || !a.rainbow) continue;
    const ax = cellOf(a.x);
    const ay = cellOf(a.y);
    for (const b of state.players) {
      if (a.id === b.id || !b.alive) continue;
      if (cellOf(b.x) !== ax || cellOf(b.y) !== ay) continue;
      if (b.invincibleTimer > 0) continue;
      const outcome = resolveHit(b);
      if (outcome.result === 'blocked') continue;
      Object.assign(b, outcome.patch);
      events.emit({ type: 'player:hit', playerId: b.id, hp: b.hp, trapped: b.trapped });
      if (outcome.result === 'died') {
        events.emit(
          b.isHuman
            ? { type: 'player:death', playerId: b.id }
            : { type: 'enemy:death', playerId: b.id },
        );
      }
    }
  }
}
