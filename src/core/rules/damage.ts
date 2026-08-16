/**
 * core/rules/damage.ts —— 受伤判定、泡封状态、死亡（纯函数，返回 patch）
 * 规则：被水柱击中 → -1 生命 → 泡封 5s + 2s 无敌；生命归 0 → 死亡。
 */
import { TUNING } from '../../shared/constants';
import type { Player } from '../../shared/types';

export type HitResult = 'blocked' | 'shielded' | 'hit' | 'died';

export interface HitOutcome {
  result: HitResult;
  patch: Partial<
    Pick<Player, 'hp' | 'alive' | 'trapped' | 'trapTimer' | 'invincibleTimer' | 'mount'>
  >;
}

export function resolveHit(p: Readonly<Player>): HitOutcome {
  if (!p.alive || p.invincibleTimer > 0 || p.rainbow) {
    // 彩虹期间无敌：不受爆炸/接触伤害，也不被泡封
    return { result: 'blocked', patch: {} };
  }
  if (p.mount) {
    // 恐龙坐骑：抵一次伤害后消失（不扣生命），附短暂无敌防连炸
    return {
      result: 'shielded',
      patch: { mount: false, invincibleTimer: TUNING.player.hitInvincibleTicks },
    };
  }
  const hp = p.hp - 1;
  if (hp <= 0) {
    return {
      result: 'died',
      patch: { hp: 0, alive: false, trapped: false, trapTimer: 0 },
    };
  }
  return {
    result: 'hit',
    patch: {
      hp,
      trapped: true,
      trapTimer: TUNING.player.trapDurationTicks,
      invincibleTimer: TUNING.player.hitInvincibleTicks,
    },
  };
}
