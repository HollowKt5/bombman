/**
 * presentation/input/keyboard-input.ts —— 键鼠监听 → InputState
 */
import { Direction } from '../../shared/types';
import type { InputState } from '../../infrastructure/input-router';

const KEY_DIRS: Record<string, Direction> = {
  KeyW: Direction.UP,
  ArrowUp: Direction.UP,
  KeyS: Direction.DOWN,
  ArrowDown: Direction.DOWN,
  KeyA: Direction.LEFT,
  ArrowLeft: Direction.LEFT,
  KeyD: Direction.RIGHT,
  ArrowRight: Direction.RIGHT,
};

export class KeyboardInput {
  constructor(private readonly state: InputState) {}

  attach(): void {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    // 窗口失焦时清空按键状态，避免 keyup 丢失导致角色一直往某个方向跑/一直放泡
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  private onBlur = (): void => {
    this.state.dirs.clear();
    this.state.bomb = false;
  };

  private onDown = (e: KeyboardEvent): void => {
    const dir = KEY_DIRS[e.code];
    if (dir !== undefined) {
      // 重按 = 最近优先：先删再加，让该方向排到末尾
      this.state.dirs.delete(dir);
      this.state.dirs.add(dir);
      e.preventDefault();
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      this.state.bomb = true;
      e.preventDefault();
    }
  };

  private onUp = (e: KeyboardEvent): void => {
    const dir = KEY_DIRS[e.code];
    if (dir !== undefined) {
      this.state.dirs.delete(dir);
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') this.state.bomb = false;
  };
}
