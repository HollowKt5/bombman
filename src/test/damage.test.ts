/**
 * src/test/damage.test.ts —— 受伤 / 泡封 / 护盾 / 死亡
 */
import { describe, it, expect } from 'vitest';
import { resolveHit } from '../core/rules/damage';
import { TUNING } from '../shared/constants';
import { fakePlayer } from './helpers';

describe('resolveHit', () => {
  it('无敌状态免疫伤害', () => {
    const p = fakePlayer({ invincibleTimer: 60 });
    const r = resolveHit(p);
    expect(r.result).toBe('blocked');
  });

  it('彩虹期间无敌（不扣血、不被泡封，坐骑也不消耗）', () => {
    const p = fakePlayer({ rainbow: true, mount: true });
    const r = resolveHit(p);
    expect(r.result).toBe('blocked');
    expect(r.patch.hp).toBeUndefined();
    expect(r.patch.trapped).toBeUndefined();
    expect(r.patch.mount).toBeUndefined(); // 坐骑保留
  });

  it('受伤扣血并进入泡封', () => {
    const p = fakePlayer();
    const r = resolveHit(p);
    expect(r.result).toBe('hit');
    expect(r.patch.hp).toBe(2);
    expect(r.patch.trapped).toBe(true);
    expect(r.patch.trapTimer).toBe(TUNING.player.trapDurationTicks);
    expect(r.patch.invincibleTimer).toBe(TUNING.player.hitInvincibleTicks);
  });

  it('恐龙坐骑抵一次伤害后消失（不扣生命）', () => {
    const p = fakePlayer({ mount: true });
    const r = resolveHit(p);
    expect(r.result).toBe('shielded');
    expect(r.patch.hp).toBeUndefined(); // 不扣血
    expect(r.patch.mount).toBe(false); // 恐龙消失
    expect(r.patch.invincibleTimer).toBe(TUNING.player.hitInvincibleTicks);
  });

  it('生命归零死亡', () => {
    const p = fakePlayer({ hp: 1 });
    const r = resolveHit(p);
    expect(r.result).toBe('died');
    expect(r.patch.hp).toBe(0);
    expect(r.patch.alive).toBe(false);
  });

  it('纯函数：不修改入参', () => {
    const p = fakePlayer();
    resolveHit(p);
    expect(p.hp).toBe(3);
    expect(p.trapped).toBe(false);
  });
});
