/**
 * presentation/renderer/main-renderer.ts —— 主渲染循环：清屏 → 地图 → 实体 → 粒子
 */
import type { GameState } from '../../shared/types';
import { THEMES } from '../../shared/constants';
import { drawMap } from './map-renderer';
import { drawBomb, drawExplosion, drawPlayer, drawPowerUp } from './entity-renderer';
import { drawParticles } from './particle-renderer';

export class MainRenderer {
  private ctx: CanvasRenderingContext2D;
  private cellSize = 48;
  private offsetX = 0;
  private offsetY = 0;
  private shake = 0;
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.floor(this.viewW * this.dpr);
    this.canvas.height = Math.floor(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
  }

  /** 计算格宽并居中地图 */
  layout(mapW: number, mapH: number): void {
    this.cellSize = Math.max(16, Math.floor(Math.min(this.viewW / mapW, this.viewH / mapH)));
    this.offsetX = Math.floor((this.viewW - mapW * this.cellSize) / 2);
    this.offsetY = Math.floor((this.viewH - mapH * this.cellSize) / 2);
  }

  getCellSize(): number {
    return this.cellSize;
  }

  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  render(state: GameState): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const theme = THEMES.find((t) => t.id === state.map.theme) ?? THEMES[0];

    // 场景背景
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.save();
    if (this.shake > 0.15) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.translate(this.offsetX, this.offsetY);

    drawMap(ctx, state, this.cellSize, theme);
    for (const pu of state.powerUps) drawPowerUp(ctx, pu, this.cellSize, state.tick);
    for (const b of state.bombs) drawBomb(ctx, b, this.cellSize, state.tick);
    for (const p of state.players) drawPlayer(ctx, p, this.cellSize, state.tick);
    for (const ex of state.explosions) drawExplosion(ctx, ex, this.cellSize);
    drawParticles(ctx, state.particles);

    ctx.restore();

    this.shake *= 0.82;
    if (this.shake < 0.15) this.shake = 0;
  }
}
