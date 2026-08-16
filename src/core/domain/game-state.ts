/**
 * core/domain/game-state.ts —— GameState（状态容器 + 工厂）
 * 地图布局（用户 v1.4.8）：固定 15×13；四个角各一个角色（玩家 + 3 敌人），
 * 中心对称生成（见 map.ts）。
 */
import {
  Difficulty,
  GamePhase,
  type GameState,
  type Player,
} from '../../shared/types';
import { DIFFICULTY, PLAYER_COLORS, THEMES, TUNING } from '../../shared/constants';
import type { RNGService } from '../services/rng-service';
import { createMap } from './map';
import { createPlayer } from './entity';
import type { CellPos } from './grid';

const W = 15;
const H = 13;

/** 四个角出生点（1=玩家左上，2/3/4=敌人，顺时针形成矩形） */
function cornerSpawns(): CellPos[] {
  return [
    { x: 1, y: 1 }, // 1 左上（玩家）
    { x: W - 2, y: 1 }, // 2 右上
    { x: W - 2, y: H - 2 }, // 3 右下
    { x: 1, y: H - 2 }, // 4 左下
  ];
}

/** 根据关卡与难度构建全新 GameState */
export function createGameState(
  level: number,
  difficulty: Difficulty,
  seed: number,
  rng: RNGService,
): GameState {
  // 四个角各生成一个人物（1 玩家 + 3 敌人）
  const spawns = cornerSpawns();
  const enemyCount = 3;

  const map = createMap(difficulty, rng, spawns, W, H);
  map.theme = THEMES[(level - 1) % THEMES.length].id;

  const players: Player[] = [];
  players.push(
    createPlayer(1, spawns[0].x, spawns[0].y, true, PLAYER_COLORS.hero, seed ^ 0x9e3779b9),
  );
  for (let i = 0; i < enemyCount; i++) {
    const s = spawns[i + 1];
    const enemy = createPlayer(
      2 + i,
      s.x,
      s.y,
      false,
      PLAYER_COLORS.enemy[i % PLAYER_COLORS.enemy.length],
      (seed ^ (0x1234567 * (i + 1))) >>> 0,
    );
    // 文档 5.4.1：敌人生命值 1 点，被水柱/道具击中即死
    enemy.hp = 1;
    enemy.maxHp = 1;
    players.push(enemy);
  }

  return {
    phase: GamePhase.PLAYING,
    map,
    players,
    bombs: [],
    explosions: [],
    powerUps: [],
    particles: [],
    tick: 0,
    level,
    timeLeft: DIFFICULTY[difficulty].timeLimitTicks,
    nextEntityId: 1,
    camera: { x: 0, y: 0, width: W, height: H },
    difficulty,
    rngSeed: seed,
  };
}

export function findPlayer(state: GameState, id: number): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function humanPlayer(state: GameState): Player | undefined {
  return state.players.find((p) => p.isHuman);
}

export function enemiesAlive(state: GameState): Player[] {
  return state.players.filter((p) => !p.isHuman && p.alive);
}

export function enemiesTotal(state: GameState): number {
  return state.players.filter((p) => !p.isHuman).length;
}
