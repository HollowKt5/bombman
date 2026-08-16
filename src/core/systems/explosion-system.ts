/**
 * core/systems/explosion-system.ts —— 水柱扩散表现 tick、伤害结算、状态计时
 */
import {
  Direction,
  PowerUpType,
  type GameState,
  type Player,
} from '../../shared/types';
import { TUNING } from '../../shared/constants';
import { resolveHit } from '../rules/damage';
import { cellOf } from '../domain/grid';
import { createPowerUp } from '../domain/entity';
import { destroySoftBlock } from './bomb-system';
import type { RNGService } from '../services/rng-service';
import type { EventBus } from '../../shared/event-bus';

/** 玩家状态计时：无敌 / 泡封倒计时 / 坐骑破墙过程 */
export function tickPlayerTimers(state: GameState, events: EventBus, rng: RNGService): void {
  for (const p of state.players) {
    if (p.invincibleTimer > 0) p.invincibleTimer--;
    if (p.trapped) {
      p.trapTimer--;
      if (p.trapTimer <= 0) {
        p.trapped = false;
        p.trapTimer = 0;
        p.trapDirs.length = 0;
        events.emit({ type: 'trap:release', playerId: p.id });
      }
    }
    // 彩虹光波计时：20s 后消失
    if (p.rainbowTimer > 0) {
      p.rainbowTimer--;
      if (p.rainbowTimer <= 0) p.rainbow = false;
    }
    // 骑恐龙破墙：充能 0.5s（按住）→ 破墙 1.5s（完成才顶开软墙，掉道具 + 计分）
    if (p.break) {
      p.break.t--;
      if (p.break.t <= 0) {
        if (p.break.phase === 'charge') {
          p.break = {
            x: p.break.x,
            y: p.break.y,
            t: TUNING.player.mountBreakTicks,
            phase: 'hit',
          };
        } else {
          destroySoftBlock(state, p.break.x, p.break.y, p.id, events, rng);
          p.break = null;
        }
      }
    }
  }
}

/**
 * 泡封挣脱：被炸后的硬直泡泡，把「上下左右」四个方向各按一遍即可提前突破。
 * 返回是否挣脱成功（成功后由调用方解除泡封并给短暂无敌）。
 */
export function tryTrapEscape(p: Player, dir: Direction): boolean {
  if (!p.trapped || dir === Direction.NONE || p.trapDirs.includes(dir)) return false;
  p.trapDirs.push(dir);
  if (p.trapDirs.length >= 4) {
    p.trapDirs.length = 0;
    return true;
  }
  return false;
}

/** 每 tick 推进水柱：伤害结算（同一爆炸每实体一次）+ 过期清理 */
/** 炸死敌人时掉落道具：吃过的掉率高、没吃的小概率掉、没吃任何东西不掉 */
export function dropEnemyLoot(state: GameState, enemy: Player, rng: RNGService): void {
  if (enemy.eaten.length === 0) return; // 什么也没吃 → 不掉落
  const eatenSet = new Set(enemy.eaten);
  const allTypes: PowerUpType[] = [
    PowerUpType.SPEED,
    PowerUpType.BOMB_COUNT,
    PowerUpType.BOMB_RANGE,
    PowerUpType.KICK,
    PowerUpType.HEART,
    PowerUpType.MOUNT,
    PowerUpType.RAINBOW,
  ];
  const ex = cellOf(enemy.x);
  const ey = cellOf(enemy.y);
  for (const t of allTypes) {
    const chance = eatenSet.has(t) ? TUNING.enemyLoot.eatenChance : TUNING.enemyLoot.notEatenChance;
    if (rng.chance(chance)) {
      state.powerUps.push(createPowerUp(state.nextEntityId++, ex, ey, t));
    }
  }
}

export function tickExplosions(
  state: GameState,
  events: EventBus,
  rng: RNGService,
): void {
  for (const ex of state.explosions) {
    ex.remaining--;
    for (const p of state.players) {
      if (!p.alive || ex.hitIds.includes(p.id)) continue;
      const onFlame = ex.cells.some(
        (c) => cellOf(p.x) === c.x && cellOf(p.y) === c.y,
      );
      if (!onFlame) continue;

      const outcome = resolveHit(p);
      Object.assign(p, outcome.patch);
      if (outcome.result === 'blocked') continue;
      ex.hitIds.push(p.id);
      if (p.trapped) p.trapDirs.length = 0; // 新泡封：清空挣脱进度
      if (p.trapped || !p.alive || outcome.result === 'shielded') p.break = null; // 被炸/死亡/坐骑抵伤：中断破墙

      if (outcome.result === 'shielded') {
        // 恐龙坐骑抵一次伤害后消失（不扣生命）
        events.emit({ type: 'player:hit', playerId: p.id, hp: p.hp, trapped: false });
      } else if (outcome.result === 'hit') {
        events.emit({ type: 'player:hit', playerId: p.id, hp: p.hp, trapped: true });
      } else if (outcome.result === 'died') {
        events.emit(
          p.isHuman
            ? { type: 'player:death', playerId: p.id }
            : { type: 'enemy:death', playerId: p.id },
        );
        // 炸死敌人 → 掉落其吃过的道具
        if (!p.isHuman) dropEnemyLoot(state, p, rng);
        // 击杀计分归属水柱 owner
        const killer = state.players.find((pp) => pp.id === ex.ownerId);
        if (killer && killer.id !== p.id) {
          killer.kills++;
          killer.score += TUNING.score.kill;
        }
      }
    }
  }
  state.explosions = state.explosions.filter((ex) => ex.remaining > 0);
}
