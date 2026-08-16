/**
 * shared/event-bus.ts —— 泛型发布/订阅（逻辑层 → 表现层单向通知）
 * 无浏览器依赖，可在 node 环境单测。
 */
import type { GameEvent } from './types';

type AnyListener = (event: GameEvent) => void;

export class EventBus {
  private listeners = new Map<GameEvent['type'], Set<AnyListener>>();

  /** 订阅特定事件类型，回调参数自动收窄为对应 payload */
  on<E extends GameEvent['type']>(
    type: E,
    fn: (event: Extract<GameEvent, { type: E }>) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const wrapped = fn as AnyListener;
    set.add(wrapped);
    return () => {
      set!.delete(wrapped);
    };
  }

  emit(event: GameEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const fn of set) fn(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
