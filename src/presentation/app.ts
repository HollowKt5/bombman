/**
 * presentation/app.ts —— 入口：装配所有模块，启动游戏循环（accumulator 固定步长）
 * 浏览器 API 仅存在于本层与 infrastructure；core/shared 保持纯净。
 */
import {
  Difficulty,
  GamePhase,
  PowerUpType,
  TileType,
  type GameState,
} from '../shared/types';
import { DIFFICULTY, TUNING } from '../shared/constants';
import { EventBus } from '../shared/event-bus';
import { createGameState, humanPlayer } from '../core/domain/game-state';
import { tickGame } from '../core/systems/game-loop';
import { createInputState, pollIntent } from '../infrastructure/input-router';
import { SeedRNG } from '../infrastructure/seed-rng';
import { IndexedDbStorage } from '../infrastructure/indexed-db-storage';
import { WebAudioSynth } from '../infrastructure/web-audio-synth';
import type { RNGService } from '../core/services/rng-service';
import { KeyboardInput } from './input/keyboard-input';
import { TouchInput } from './input/touch-input';
import { MainRenderer } from './renderer/main-renderer';
import { HudRenderer } from './renderer/hud-renderer';
import {
  spawnBlockParticles,
  spawnDeathParticles,
  spawnExplosionParticles,
  spawnPickupParticles,
  updateParticles,
} from './renderer/particle-renderer';
import { MainMenu } from './dom-ui/main-menu';
import { PauseMenu } from './dom-ui/settings-panel';
import { ResultScreen, type ScoreBreakdown } from './dom-ui/result-screen';

const TICK_MS = 1000 / TUNING.tickRate;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 DOM 元素 #${id}`);
  return node as T;
}

export class App {
  private state: GameState | null = null;
  private readonly events = new EventBus();
  private renderer!: MainRenderer;
  private hud!: HudRenderer;
  private menu!: MainMenu;
  private pause!: PauseMenu;
  private result!: ResultScreen;
  private hudEl!: HTMLElement;
  private readonly input = createInputState();
  private sessionRng = new SeedRNG(1);
  private readonly aiRngs = new Map<number, RNGService>();
  private readonly storage = new IndexedDbStorage();
  private readonly audio = new WebAudioSynth();
  private difficulty: Difficulty = Difficulty.EASY;
  private highScore = 0;
  private lastTime = 0;
  private accumulator = 0;
  private raf = 0;

  async start(): Promise<void> {
    // 禁用移动端双击/捏合缩放（部分浏览器忽略 user-scalable / touch-action）
    document.addEventListener(
      'touchstart',
      (e) => {
        const t = e.target as HTMLElement | null;
        // 交互元素保留默认（按钮点击/摇杆拖动）；其余触摸阻止默认 → 不触发双击放大
        if (t && t.closest('button, input, label, a, #joystick')) return;
        e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());

    // 手机/触屏模式识别：主指针为粗指针（触屏）或支持触摸事件 → 显示虚拟摇杆与放泡键
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const touchEvents = 'ontouchstart' in window;
    const touchMode = coarse || touchEvents;
    if (touchMode) document.body.classList.add('is-touch');

    this.renderer = new MainRenderer(el<HTMLCanvasElement>('game-canvas'));
    this.hudEl = el('hud');
    this.hud = new HudRenderer({
      level: el('hud-level'),
      time: el('hud-time'),
      bombs: el('hud-bombs'),
      range: el('hud-range'),
      speed: el('hud-speed'),
      hp: el('hud-hp'),
      enemies: el('hud-enemies'),
      score: el('hud-score'),
      buffs: el('hud-buffs'),
    });

    this.menu = new MainMenu(el('menu'), (d) => this.startGame(d));
    this.pause = new PauseMenu(el('pause'), {
      resume: () => this.setPaused(false),
      restart: () => {
        if (this.state) this.startLevel(this.state.level);
      },
      menu: () => this.toMenu(),
    });

    // HUD 暂停按钮
    el<HTMLButtonElement>('btn-pause-hud').addEventListener('click', () => {
      if (this.state && this.state.phase === GamePhase.PLAYING) this.setPaused(true);
    });
    // 点击弹层空白处关闭说明（继续游戏）
    const pauseRoot = el('pause');
    pauseRoot.addEventListener('click', (e) => {
      if (e.target === pauseRoot && this.state?.phase === GamePhase.PAUSED) {
        this.setPaused(false);
      }
    });
    this.result = new ResultScreen(el('result'), {
      next: () => {
        if (this.state) this.startLevel(Math.min(TUNING.level.maxLevel, this.state.level + 1));
      },
      retry: () => {
        if (this.state) this.startLevel(this.state.level);
      },
      menu: () => this.toMenu(),
    });
    this.menu.wire();
    this.pause.wire();
    this.result.wire();

    new KeyboardInput(this.input).attach();
    if (touchMode) new TouchInput(this.input).attach();

    // Esc 暂停 / 继续
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || !this.state) return;
      if (this.state.phase === GamePhase.PLAYING) this.setPaused(true);
      else if (this.state.phase === GamePhase.PAUSED) this.setPaused(false);
    });

    // 【测试作弊 · 表现层，非规则】按 Z 或 Y 在玩家周围 2 格内的空地上生成坐骑和彩虹
    window.addEventListener('keydown', (e) => {
      if ((e.code !== 'KeyZ' && e.code !== 'KeyY') || !this.state) return;
      if (this.state.phase !== GamePhase.PLAYING) return;
      const hero = humanPlayer(this.state);
      if (!hero) return;
      const cx = Math.round(hero.x);
      const cy = Math.round(hero.y);
      const spots: Array<{ x: number; y: number }> = [];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= this.state.map.width || y >= this.state.map.height) continue;
          if (this.state.map.cells[y][x].type !== TileType.EMPTY) continue;
          if (this.state.bombs.some((b) => !b.exploded && b.x === x && b.y === y)) continue;
          spots.push({ x, y });
        }
      }
      if (spots.length > 0) {
        const pick = () => spots[Math.floor(Math.random() * spots.length)];
        this.state.powerUps.push({
          id: this.state.nextEntityId++,
          x: pick().x,
          y: pick().y,
          type: PowerUpType.MOUNT,
        });
        this.state.powerUps.push({
          id: this.state.nextEntityId++,
          x: pick().x,
          y: pick().y,
          type: PowerUpType.RAINBOW,
        });
      }
    });

    // 逻辑事件 → 表现（音效 / 粒子 / 屏幕震动）
    this.events.on('bomb:placed', () => this.audio.placeBomb());
    this.events.on('explosion:start', (e) => {
      this.audio.explode();
      this.renderer.addShake(1.5); // v1.5.7 震动减弱
      if (this.state) {
        spawnExplosionParticles(this.state.particles, e.cells, this.renderer.getCellSize());
      }
    });
    this.events.on('block:destroyed', (e) => {
      if (this.state) {
        spawnBlockParticles(this.state.particles, e.x, e.y, this.renderer.getCellSize());
      }
    });
    this.events.on('powerup:pickup', (e) => {
      this.audio.pickup();
      if (this.state) {
        spawnPickupParticles(this.state.particles, e.x, e.y, this.renderer.getCellSize());
      }
    });
    this.events.on('player:hit', () => this.audio.hit());
    this.events.on('player:death', () => {
      if (this.state) {
        const hero = humanPlayer(this.state);
        if (hero) {
          spawnDeathParticles(this.state.particles, hero.x, hero.y, hero.color, this.renderer.getCellSize());
        }
      }
    });
    this.events.on('enemy:death', (e) => {
      if (this.state) {
        const foe = this.state.players.find((p) => p.id === e.playerId);
        if (foe) {
          spawnDeathParticles(this.state.particles, foe.x, foe.y, foe.color, this.renderer.getCellSize());
        }
      }
    });
    this.events.on('level:clear', () => {
      this.audio.win();
      this.showResult(true);
    });
    this.events.on('game:over', () => {
      this.audio.lose(); // 短促下滑音
      this.audio.playDefeatMusic(); // 悲情钢琴战败曲（音量 -50%）
      this.showResult(false);
    });

    await this.storage.init();
    this.highScore = (await this.storage.load<number>('highScore')) ?? 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.menu.show(this.highScore);

    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);

    // 调试钩子：E2E 测试/排查时读取当前逻辑状态（不影响玩法）
    (window as unknown as { __bubbleHero?: { getState: () => GameState | null } }).__bubbleHero = {
      getState: () => this.state,
    };
  }

  // ── 流程控制 ──

  private startGame(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.audio.init(); // 用户手势内创建 AudioContext
    this.startLevel(1);
  }

  private startLevel(level: number): void {
    const seed = Date.now() >>> 0;
    this.sessionRng = new SeedRNG(seed);
    this.state = createGameState(level, this.difficulty, seed, this.sessionRng);
    this.aiRngs.clear();
    for (const p of this.state.players) this.aiRngs.set(p.id, new SeedRNG(p.rngSeed));

    this.menu.hide();
    this.pause.hide();
    this.result.hide();
    this.hudEl.classList.remove('hidden');
    this.audio.startMusic(); // 欢快背景音乐
    this.resize();
    this.renderer.layout(this.state.map.width, this.state.map.height);
  }

  private toMenu(): void {
    this.state = null;
    this.audio.stopMusic();
    this.hudEl.classList.add('hidden');
    this.pause.hide();
    this.result.hide();
    this.menu.show(this.highScore);
  }

  private setPaused(paused: boolean): void {
    if (!this.state) return;
    this.state.phase = paused ? GamePhase.PAUSED : GamePhase.PLAYING;
    // 暂停时音乐音量降为 20%，继续恢复
    this.audio.setMusicVolume(paused ? 0.2 : 1);
    if (paused) this.pause.show();
    else this.pause.hide();
  }

  private showResult(victory: boolean): void {
    if (!this.state) return;
    if (victory) {
      const hero = humanPlayer(this.state);
      if (!hero) return;
      const secsLeft = Math.max(0, this.state.timeLeft / 60);
      const timeScore = Math.round(secsLeft) * TUNING.score.timePerSecond;
      const total = hero.score + timeScore;
      const breakdown: ScoreBreakdown = {
        blocks: hero.blocksBroken * TUNING.score.block,
        kills: hero.kills * TUNING.score.kill,
        pups: hero.powerupsTaken * TUNING.powerUp.scorePerPickup,
        time: timeScore,
        total,
      };
      const maxTime = DIFFICULTY[this.difficulty].timeLimitTicks / 60;
      const ratio = Math.min(1, secsLeft / maxTime);
      const stars = ratio > 0.6 ? 3 : ratio > 0.3 ? 2 : 1;

      if (total > this.highScore) {
        this.highScore = total;
        void this.storage.save('highScore', total);
      }
      this.result.showVictory(
        this.state.level,
        breakdown,
        stars,
        this.state.level >= TUNING.level.maxLevel,
      );
    } else {
      this.result.showDefeat(this.state.level);
    }
  }

  private resize(): void {
    this.renderer.resize();
    if (this.state) this.renderer.layout(this.state.map.width, this.state.map.height);
  }

  // ── 主循环（accumulator 固定步长 60Hz） ──

  private frame = (now: number): void => {
    const delta = Math.min(now - this.lastTime, 100); // 防螺旋死亡
    this.lastTime = now;
    this.accumulator += delta;

    while (this.accumulator >= TICK_MS) {
      if (this.state && this.state.phase === GamePhase.PLAYING) {
        const intent = pollIntent(this.input, 1);
        tickGame(this.state, [intent], this.events, {
          rngFor: (id) => this.aiRngs.get(id) ?? this.sessionRng,
          sessionRng: this.sessionRng,
        });
      }
      this.accumulator -= TICK_MS;
    }

    if (this.state) {
      updateParticles(this.state.particles, delta / 1000);
      this.renderer.render(this.state);
      this.hud.render(this.state);
    }

    this.raf = requestAnimationFrame(this.frame);
  };
}
