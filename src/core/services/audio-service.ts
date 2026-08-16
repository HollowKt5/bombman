/** core/services/audio-service.ts —— 音频服务接口（Web Audio 合成契约） */
export interface AudioService {
  /** 需在用户手势中调用（创建/恢复 AudioContext） */
  init(): void;
  /** 欢快背景音乐（循环） */
  startMusic(): void;
  stopMusic(): void;
  /** 背景音乐音量（0~1；暂停时降为 20%） */
  setMusicVolume(v: number): void;
  placeBomb(): void;
  explode(): void;
  pickup(): void;
  hit(): void;
  win(): void;
  lose(): void;
}
