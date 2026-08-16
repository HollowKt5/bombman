/**
 * infrastructure/input-router.ts —— 输入合并：键盘/触控 → InputIntent（纯数据转换）
 * v1 为单人模式：P1 使用 WASD/方向键 移动 + 空格/回车 放泡（文档 14.1）。
 */
import { Direction, type InputIntent } from '../shared/types';

export interface InputState {
  /** 当前按下的方向（Set 迭代顺序 = 插入顺序，最后按下者优先） */
  dirs: Set<Direction>;
  bomb: boolean;
}

export function createInputState(): InputState {
  return { dirs: new Set<Direction>(), bomb: false };
}

export function pollIntent(state: InputState, playerId: number): InputIntent {
  let direction = Direction.NONE;
  for (const d of state.dirs) direction = d;
  return { playerId, direction, placeBomb: state.bomb };
}
