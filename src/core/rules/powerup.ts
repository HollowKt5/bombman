/**
 * core/rules/powerup.ts —— 道具拾取、效果应用（纯函数，返回 patch）
 * v1.4.7 道具表：💣炸弹(可用数+1) / 🧪爆炸药(威力+1) / 👟疾跑鞋(×1.08) / 🧤手套 / ❤️心 / 🦖坐骑
 */
import { PowerUpType, type Player } from '../../shared/types';
import { TUNING } from '../../shared/constants';

/** 对玩家属性的局部修改（由系统应用到 state） */
export type PlayerPatch = Partial<
  Pick<Player, 'speed' | 'maxBombs' | 'bombRange' | 'kick' | 'hp' | 'mount' | 'rainbow' | 'rainbowTimer'>
>;

export interface PowerUpEffect {
  patch: PlayerPatch;
  maxedOut: boolean; // 已达上限，效果不生效
}

/** 计算吃道具后的属性变化（不修改入参） */
export function powerUpEffect(p: Readonly<Player>, type: PowerUpType): PowerUpEffect {
  const patch: PlayerPatch = {};
  switch (type) {
    case PowerUpType.SPEED: {
      if (p.speed >= TUNING.player.maxSpeed) return { patch, maxedOut: true };
      patch.speed = Math.min(TUNING.player.maxSpeed, p.speed * 1.08); // 疾跑鞋 +8%（加成减小）
      break;
    }
    case PowerUpType.BOMB_COUNT: {
      if (p.maxBombs >= TUNING.bomb.maxMaxBombs) return { patch, maxedOut: true };
      patch.maxBombs = p.maxBombs + 1; // 炸弹：可用炸弹数 +1
      break;
    }
    case PowerUpType.BOMB_RANGE: {
      if (p.bombRange >= TUNING.bomb.maxRange) return { patch, maxedOut: true };
      patch.bombRange = p.bombRange + TUNING.bomb.rangeStep; // 爆炸药：爆炸格子 +1（四方向）
      break;
    }
    case PowerUpType.KICK: {
      if (p.kick) return { patch, maxedOut: true };
      patch.kick = true; // 手套：可踢泡
      break;
    }
    case PowerUpType.HEART: {
      if (p.hp >= p.maxHp) return { patch, maxedOut: true };
      patch.hp = Math.min(p.maxHp, p.hp + 1); // 心：回复 1 点生命
      break;
    }
    case PowerUpType.MOUNT: {
      if (p.mount) return { patch, maxedOut: true };
      patch.mount = true; // 恐龙坐骑：自动顶开软墙（移速 ×0.9 在移动系统中生效）
      break;
    }
    case PowerUpType.RAINBOW: {
      // 彩虹光波：身体覆彩虹 20s（重复吃刷新时长），碰者掉血，移速 +10%
      patch.rainbow = true;
      patch.rainbowTimer = TUNING.enemyLoot.rainbowDurationTicks;
      break;
    }
  }
  return { patch, maxedOut: false };
}
