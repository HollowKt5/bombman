/**
 * presentation/renderer/hud-renderer.ts —— HUD（生命心数、道具栏、倒计时、分数）
 * 采用 DOM 更新（文档建议：DOM + CSS 动画更流畅）。
 */
import type { GameState } from '../../shared/types';
import { enemiesAlive, humanPlayer } from '../../core/domain/game-state';

export interface HudEls {
  level: HTMLElement;
  time: HTMLElement;
  bombs: HTMLElement;
  range: HTMLElement;
  speed: HTMLElement;
  hp: HTMLElement;
  enemies: HTMLElement;
  score: HTMLElement;
  buffs: HTMLElement;
}

/** 塞尔达式 8-bit 像素心（7×6 像素矩阵，SVG crispEdges 渲染，v1.5.9） */
function pixelHeart(filled: boolean, size = 13): string {
  const color = filled ? '#ff5252' : '#697080'; // 红心 / 灰空心
  const rows = ['.##..##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const rects: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`);
    }
  });
  return `<svg viewBox="0 0 7 6" width="${size}" height="${(size * 6) / 7}" shape-rendering="crispEdges" style="display:inline-block;vertical-align:-2px;margin:0 1px">${rects.join('')}</svg>`;
}

export class HudRenderer {
  constructor(private readonly els: HudEls) {}

  render(state: GameState): void {
    const hero = humanPlayer(state);
    if (!hero) return;
    this.els.level.textContent = String(state.level);

    const secs = Math.max(0, Math.ceil(state.timeLeft / 60));
    this.els.time.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(
      secs % 60,
    ).padStart(2, '0')}`;

    const placed = state.bombs.filter((b) => b.ownerId === hero.id && !b.exploded).length;
    this.els.bombs.textContent = `${placed}/${hero.maxBombs}`;
    this.els.range.textContent = String(hero.bombRange);
    this.els.speed.textContent = hero.speed.toFixed(1);
    // 像素红心（塞尔达式 8-bit）：实心=满血，灰色空心=损失
    this.els.hp.innerHTML = Array.from({ length: hero.maxHp }, (_, i) =>
      pixelHeart(i < hero.hp),
    ).join('');
    this.els.enemies.textContent = String(enemiesAlive(state).length);
    this.els.score.textContent = String(hero.score);
    this.els.buffs.textContent = [hero.kick ? '🧤' : ''].join('');
  }
}
