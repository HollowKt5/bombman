/**
 * core/systems/camera-system.ts —— 屏外休眠判断、可视区计算
 * v1 为单屏小地图（15×13），可视区恒为全图；接口保留供后续大图扩展。
 */
import type { GameState } from '../../shared/types';

export function updateCamera(state: GameState): void {
  state.camera = {
    x: 0,
    y: 0,
    width: state.map.width,
    height: state.map.height,
  };
}

export function isVisible(state: GameState, x: number, y: number): boolean {
  const c = state.camera;
  return x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height;
}
