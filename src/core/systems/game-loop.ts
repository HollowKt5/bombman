/**
 * core/systems/game-loop.ts —— 固定步长 tick 调度（accumulator 模式）
 * 注意：rAF/performance.now 等浏览器 API 由表现层 app.ts 持有；
 * 本文件是纯逻辑驱动（core 层不引用浏览器 API），每逻辑帧调用一次。
 */
import {
  Direction,
  GamePhase,
  type GameState,
  type InputIntent,
} from '../../shared/types';
import { TUNING } from '../../shared/constants';
import type { EventBus } from '../../shared/event-bus';
import type { RNGService } from '../services/rng-service';
import { humanPlayer, enemiesAlive, findPlayer } from '../domain/game-state';
import { applyMove } from './move-system';
import { tryPlaceBomb, tickBombs } from './bomb-system';
import { tickExplosions, tickPlayerTimers, tryTrapEscape } from './explosion-system';
import { tickPowerUps } from './powerup-system';
import { tickAI } from './ai-system';
import { updateCamera } from './camera-system';

export interface TickContext {
  /** 按玩家 id 提供独立种子 RNG（AI 随机可复现） */
  rngFor: (playerId: number) => RNGService;
  /** 会话 RNG（敌人死亡掉落等全局随机） */
  sessionRng: RNGService;
}

/** 一个逻辑帧：AI → 玩家输入 → 泡泡 → 爆炸 → 道具 → 相机 → 胜负判定 */
export function tickGame(
  state: GameState,
  intents: InputIntent[],
  events: EventBus,
  ctx: TickContext,
): void {
  if (state.phase !== GamePhase.PLAYING) return;

  tickPlayerTimers(state, events, ctx.sessionRng);
  tickAI(state, events, ctx.rngFor);

  for (const intent of intents) {
    const p = findPlayer(state, intent.playerId);
    if (!p) continue;

    // 泡封挣脱：被炸后按「上下左右」各一遍即可提前突破硬直泡泡
    if (p.trapped && intent.direction !== Direction.NONE && tryTrapEscape(p, intent.direction)) {
      p.trapped = false;
      p.trapTimer = 0;
      p.invincibleTimer = Math.max(p.invincibleTimer, TUNING.player.hitInvincibleTicks);
      events.emit({ type: 'trap:release', playerId: p.id });
    }

    applyMove(state, p, intent.direction, events);
    if (intent.placeBomb) tryPlaceBomb(state, p, events);
  }

  tickBombs(state, events, ctx.sessionRng);
  tickExplosions(state, events, ctx.sessionRng);
  tickPowerUps(state, events);
  updateCamera(state);

  state.tick++;
  if (state.timeLeft > 0) state.timeLeft--;

  // 胜负判定
  const hero = humanPlayer(state);
  const foes = enemiesAlive(state);
  if (hero && hero.alive && foes.length === 0) {
    state.phase = GamePhase.VICTORY;
    events.emit({ type: 'level:clear', level: state.level });
  } else if (!hero || !hero.alive || state.timeLeft <= 0) {
    state.phase = GamePhase.DEFEAT;
    events.emit({ type: 'game:over', level: state.level });
  }
}
