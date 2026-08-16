/**
 * presentation/input/touch-input.ts —— 虚拟摇杆 + 放泡键（移动端）
 * 摇杆：按下后以基座中心为原点，位移向量按"主轴"映射为四方向（死区 10px，
 * 摇杆帽跟手、限制最大半径）。放泡键按住期间持续输出 placeBomb。
 */
import { Direction } from '../../shared/types';
import type { InputState } from '../../infrastructure/input-router';

const DEAD_ZONE = 10; // px：死区内不输出方向
const MAX_RADIUS = 48; // px：摇杆帽最大偏移

export class TouchInput {
  private joyActive = false;
  private joyPointerId: number | null = null;
  private knob: HTMLElement | null = null;
  private joyRect: (() => DOMRect) | null = null;

  constructor(private readonly state: InputState) {}

  attach(): void {
    const joy = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    const bombBtn = document.getElementById('tbtn-bomb');
    if (!joy || !knob) return;
    this.knob = knob;
    this.joyRect = () => joy.getBoundingClientRect();

    joy.addEventListener('pointerdown', this.onJoyDown);
    joy.addEventListener('pointermove', this.onJoyMove);
    joy.addEventListener('pointerup', this.onJoyEnd);
    joy.addEventListener('pointercancel', this.onJoyEnd);
    joy.addEventListener('lostpointercapture', this.onJoyEnd);

    if (bombBtn) {
      const set = (v: boolean) => (e: Event) => {
        e.preventDefault();
        this.state.bomb = v;
      };
      bombBtn.addEventListener('pointerdown', set(true));
      bombBtn.addEventListener('pointerup', set(false));
      bombBtn.addEventListener('pointerleave', set(false));
      bombBtn.addEventListener('pointercancel', set(false));
    }
  }

  private onJoyDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.joyActive = true;
    this.joyPointerId = e.pointerId;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      /* 合成事件/浏览器不支持时忽略 */
    }
    this.updateFromEvent(e);
  };

  private onJoyMove = (e: PointerEvent): void => {
    if (!this.joyActive || e.pointerId !== this.joyPointerId) return;
    e.preventDefault();
    this.updateFromEvent(e);
  };

  private onJoyEnd = (e: Event): void => {
    if (e instanceof PointerEvent && e.pointerId !== this.joyPointerId) return;
    this.joyActive = false;
    this.joyPointerId = null;
    this.state.dirs.clear();
    this.knob?.style.setProperty('transform', 'translate(0,0)');
  };

  /** 根据指针位置更新方向与摇杆帽 */
  private updateFromEvent(e: PointerEvent): void {
    if (!this.joyRect) return;
    const rect = this.joyRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);

    this.state.dirs.clear();
    if (len < DEAD_ZONE) {
      this.knob?.style.setProperty('transform', 'translate(0,0)');
      return; // 死区内：不输出方向
    }

    // 摇杆帽跟手（限制最大半径）
    const clamp = Math.min(len, MAX_RADIUS);
    const kx = (dx / len) * clamp;
    const ky = (dy / len) * clamp;
    this.knob?.style.setProperty('transform', `translate(${kx}px, ${ky}px)`);

    // 主轴映射四方向
    const dir =
      Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? Direction.RIGHT
          : Direction.LEFT
        : dy >= 0
          ? Direction.DOWN
          : Direction.UP;
    this.state.dirs.add(dir);
  }
}
