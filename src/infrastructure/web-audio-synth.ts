/**
 * infrastructure/web-audio-synth.ts —— Web Audio 合成音效（实现 AudioService）
 * 零音频资源，程序化合成（文档第 7 章音频方向：方波/噪声/下滑音）。
 */
import type { AudioService } from '../core/services/audio-service';

export class WebAudioSynth implements AudioService {
  private ctx: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicVolume = 1;

  /** 欢快的 C 大调五声音阶旋律（16 步循环） */
  private static readonly MELODY = [
    523, 659, 784, 659, 587, 659, 784, 880,
    784, 659, 587, 523, 587, 659, 784, 659,
  ];
  /** 低音（0 = 休止） */
  private static readonly BASS = [
    262, 0, 330, 0, 294, 0, 330, 0,
    262, 0, 294, 0, 330, 0, 392, 0,
  ];

  init(): void {
    if (this.ctx) {
      void this.ctx.resume?.();
      return;
    }
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch {
      this.ctx = null;
    }
  }

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => this.playMusicStep(), 150);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** 背景音乐音量（0~1）；暂停时降为 20%，继续恢复 */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
  }

  /** 播放一小节（旋律 + 低音 + 铃铛点缀），音量轻以免盖过音效 */
  private playMusicStep(): void {
    const vol = this.musicVolume;
    const step = this.musicStep % 16;
    this.musicStep++;
    const mel = WebAudioSynth.MELODY[step];
    if (mel) this.tone(mel, 0.14, 'square', 0.03 * vol);
    const bass = WebAudioSynth.BASS[step];
    if (bass) this.tone(bass, 0.24, 'triangle', 0.045 * vol);
    if (step % 4 === 0) this.tone(1047, 0.1, 'sine', 0.02 * vol, 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol = 0.2,
    when = 0,
    slideTo?: number,
  ): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol = 0.25): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * vol;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
  }

  placeBomb(): void {
    this.tone(240, 0.09, 'square', 0.12, 0, 150); // 短促"啵"
  }

  explode(): void {
    this.noise(0.32, 0.3);
    this.tone(100, 0.28, 'sawtooth', 0.16, 0, 38); // 低频下扫
  }

  pickup(): void {
    this.tone(660, 0.07, 'triangle', 0.14);
    this.tone(880, 0.08, 'triangle', 0.14, 0.07);
    this.tone(1320, 0.12, 'triangle', 0.14, 0.14); // 上升琶音"叮"
  }

  hit(): void {
    this.tone(420, 0.24, 'sine', 0.18, 0, 110); // 下滑音"哇"
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.13, 'triangle', 0.16, i * 0.09));
  }

  lose(): void {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.16, i * 0.16));
  }

  /** 战败音乐：悲情钢琴（小调下行哀歌，Dm→♭B→F→Dm），音量 = 主 BGM 的 50% */
  playDefeatMusic(): void {
    if (!this.ctx) return;
    this.stopMusic();
    const v = 0.015; // 主 BGM 旋律单音 0.03 的一半
    // 旋律：钢琴音色（三角波主音 + 高八度泛音），慢速下行
    const mel: Array<[number, number]> = [
      [523, 0], [494, 0], [440, 0], [392, 0], // C5 B4 A4 G4
      [440, 0], [349, 0], [392, 0.3], // A4 F4 G4(稍长)
      [440, 0], [392, 0], [349, 0], [330, 0], [294, 0.8], // A4 G4 F4 E4 D4(结尾拉长)
    ];
    let t = 0;
    const step = 0.62;
    for (const [f, hold] of mel) {
      this.tone(f, 0.5 + hold, 'triangle', v, t);
      this.tone(f * 2, 0.32 + hold * 0.5, 'sine', v * 0.35, t); // 钢琴泛音
      t += step + hold;
    }
    // 低音铺垫（很轻的根音，Dm → ♭B → F → Dm，烘托悲情）
    const bass: Array<[number, number]> = [
      [147, 0], [117, 0], [87, 0], [147, 0.5],
    ];
    let bt = 0;
    for (const [f, hold] of bass) {
      this.tone(f, 2.1 + hold, 'sine', v * 1.1, bt);
      bt += 2.4 + hold;
    }
  }
}
