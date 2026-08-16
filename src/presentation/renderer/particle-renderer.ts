/**
 * presentation/renderer/particle-renderer.ts —— 粒子系统渲染 + 生成
 * 表现层允许 Math.random（文档仅禁止逻辑层随机）。
 */
import type { Particle } from '../../shared/types';
import type { ExplosionCell } from '../../core/rules/bomb';

const MAX_PARTICLES = 200;

export function updateParticles(particles: Particle[], dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 60;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.6, p.size * a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function push(
  particles: Particle[],
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
  size: number,
  life: number,
  gravity: number,
): void {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push({ x, y, vx, vy, life, maxLife: life, color, size, gravity });
}

/** 爆炸火珠（红色 💥 主题 + 少量橙黄火星） */
export function spawnExplosionParticles(
  particles: Particle[],
  cells: ExplosionCell[],
  cs: number,
): void {
  const colors = ['#FF5252', '#FF8A65', '#FFD54F', '#FFEB3B'];
  for (const c of cells) {
    const cx = (c.x + 0.5) * cs;
    const cy = (c.y + 0.5) * cs;
    for (let i = 0; i < 2; i++) { // v1.5.7 粒子减少
      push(
        particles,
        cx,
        cy,
        (Math.random() - 0.5) * 140,
        (Math.random() - 0.5) * 140 - 40,
        colors[Math.floor(Math.random() * colors.length)],
        1.5 + Math.random() * 2,
        10 + Math.random() * 10,
        240,
      );
    }
  }
}

/** 炸方块碎片 */
export function spawnBlockParticles(particles: Particle[], x: number, y: number, cs: number): void {
  const cx = (x + 0.5) * cs;
  const cy = (y + 0.5) * cs;
  for (let i = 0; i < 5; i++) {
    push(
      particles,
      cx,
      cy,
      (Math.random() - 0.5) * 130,
      -Math.random() * 120,
      Math.random() < 0.5 ? '#C9A227' : '#E0B93E',
      2 + Math.random() * 2.5,
      12 + Math.random() * 8,
      260,
    );
  }
}

/** 拾取道具星屑 */
export function spawnPickupParticles(particles: Particle[], x: number, y: number, cs: number): void {
  const cx = (x + 0.5) * cs;
  const cy = (y + 0.5) * cs;
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    push(
      particles,
      cx,
      cy,
      Math.cos(angle) * 90,
      Math.sin(angle) * 90,
      ['#FFD700', '#FF6B6B', '#4FC3F7', '#81C784'][i % 4],
      2.5,
      16,
      60,
    );
  }
}

/** 死亡喷气 */
export function spawnDeathParticles(
  particles: Particle[],
  x: number,
  y: number,
  color: string,
  cs: number,
): void {
  const cx = (x + 0.5) * cs;
  const cy = (y + 0.5) * cs;
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    push(
      particles,
      cx,
      cy,
      Math.cos(angle) * (40 + Math.random() * 70),
      Math.sin(angle) * (40 + Math.random() * 70),
      color,
      2 + Math.random() * 2.5,
      18 + Math.random() * 12,
      120,
    );
  }
}
