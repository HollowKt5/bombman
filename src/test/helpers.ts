/**
 * src/test/helpers.ts —— 单测公共工厂（固定种子可复现）
 */
import {
  Direction,
  TileType,
  type CellData,
  type MapData,
  type Player,
} from '../shared/types';

export function fakeMap(w: number, h: number): MapData {
  const cells: CellData[][] = [];
  for (let y = 0; y < h; y++) {
    cells.push([]);
    for (let x = 0; x < w; x++) {
      cells[y].push({ type: TileType.EMPTY, hiddenPowerUp: null });
    }
  }
  return { width: w, height: h, cells, theme: 'forest' };
}

export function fakePlayer(
  xOrExtra: number | Partial<Player> = 2,
  y = 2,
  extra: Partial<Player> = {},
): Player {
  const x = typeof xOrExtra === 'number' ? xOrExtra : 2;
  const merged: Partial<Player> =
    typeof xOrExtra === 'number' ? extra : (xOrExtra as Partial<Player>);
  return {
    id: 1,
    x,
    y,
    facing: Direction.NONE,
    speed: 3,
    baseSpeed: 3,
    bombRange: 1,
    maxBombs: 1,
    alive: true,
    trapped: false,
    trapTimer: 0,
    trapDirs: [],
    invincibleTimer: 0,
    kick: false,
    mount: false,
    rainbow: false,
    rainbowTimer: 0,
    eaten: [],
    break: null,
    bombCooldown: 0,
    hp: 3,
    maxHp: 3,
    score: 0,
    blocksBroken: 0,
    kills: 0,
    powerupsTaken: 0,
    isHuman: true,
    color: '#4285F4',
    rngSeed: 12345,
    lastDir: Direction.NONE,
    ...merged,
  };
}
