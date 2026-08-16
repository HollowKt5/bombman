/**
 * presentation/renderer/map-renderer.ts —— 网格地图绘制（程序化瓦片 + 假阴影）
 */
import { TileType, type GameState, type ThemeSpec } from '../../shared/types';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cs: number,
  theme: ThemeSpec,
): void {
  const { width, height, cells } = state.map;
  // 被恐龙顶撞的软墙：格 -> 破墙进度（仅破墙阶段，充能阶段不动）
  const breaking = new Map<string, number>();
  for (const p of state.players) {
    if (p.break && p.break.phase === 'hit') {
      const total = 90; // 与 TUNING.player.mountBreakTicks 一致
      breaking.set(`${p.break.x},${p.break.y}`, 1 - p.break.t / total);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x * cs;
      const py = y * cs;
      const cell = cells[y][x];

      // 地板（棋盘格微差 + 细格线）
      ctx.fillStyle = (x + y) % 2 === 0 ? theme.floor : theme.floorAlt;
      ctx.fillRect(px, py, cs, cs);
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);

      if (cell.type === TileType.WALL) drawWall(ctx, px, py, cs, theme);
      else if (cell.type === TileType.SOFT) {
        drawSoft(ctx, px, py, cs, theme, state.tick, breaking.get(`${x},${y}`) ?? 0);
      }
    }
  }
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
  theme: ThemeSpec,
): void {
  const m = cs * 0.07;
  const w = cs - m * 2;
  // 底部假阴影
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(ctx, px + m, py + m + cs * 0.04, w, w, cs * 0.14);
  ctx.fill();
  // 主体
  ctx.fillStyle = theme.wall;
  roundRect(ctx, px + m, py + m, w, w, cs * 0.14);
  ctx.fill();
  // 顶部高光
  ctx.fillStyle = theme.wallLight;
  roundRect(ctx, px + m, py + m, w, cs * 0.24, cs * 0.12);
  ctx.fill();
  // 底部暗部
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, px + m, py + cs - m - cs * 0.13, w, cs * 0.13, cs * 0.08);
  ctx.fill();
  // 中心装饰
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.arc(px + cs / 2, py + cs * 0.6, cs * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function drawSoft(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cs: number,
  theme: ThemeSpec,
  tick: number,
  breakProgress: number,
): void {
  const m = cs * 0.09;
  const w = cs - m * 2;
  const pulse = 1 + 0.025 * Math.sin(tick * 0.06 + px * 0.01);

  // 被恐龙顶撞：抖动 + 裂纹（破墙过程动画，进度越高震得越凶、裂纹越多）
  let shakeX = 0;
  let shakeY = 0;
  if (breakProgress > 0) {
    const amp = breakProgress * cs * 0.045;
    shakeX = Math.sin(tick * 0.9 + py * 0.13) * amp;
    shakeY = Math.cos(tick * 0.85 + px * 0.11) * amp * 0.6;
  }
  const sx = px + shakeX;
  const sy = py + shakeY;

  // 底部阴影
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, sx + m, sy + m + cs * 0.03, w, w, cs * 0.12);
  ctx.fill();
  // 主体
  ctx.fillStyle = theme.block;
  roundRect(ctx, sx + m + ((w * (1 - pulse)) / 2), sy + m + ((w * (1 - pulse)) / 2), w * pulse, w * pulse, cs * 0.12);
  ctx.fill();
  // 顶部高光斜面
  ctx.fillStyle = theme.blockLight;
  roundRect(
    ctx,
    sx + m + ((w * (1 - pulse)) / 2),
    sy + m + ((w * (1 - pulse)) / 2),
    w * pulse,
    w * pulse * 0.4,
    cs * 0.1,
  );
  ctx.fill();
  // 圆点图案
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(sx + cs * 0.34, sy + cs * 0.62, cs * 0.06, 0, Math.PI * 2);
  ctx.arc(sx + cs * 0.66, sy + cs * 0.68, cs * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // 裂纹（随破墙进度增多）
  if (breakProgress > 0.2) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + cs * 0.42, sy + cs * 0.2);
    ctx.lineTo(sx + cs * 0.5, sy + cs * 0.4);
    ctx.lineTo(sx + cs * 0.42, sy + cs * 0.55);
    if (breakProgress > 0.5) {
      ctx.moveTo(sx + cs * 0.62, sy + cs * 0.3);
      ctx.lineTo(sx + cs * 0.55, sy + cs * 0.5);
      ctx.lineTo(sx + cs * 0.6, sy + cs * 0.68);
    }
    if (breakProgress > 0.8) {
      ctx.moveTo(sx + cs * 0.3, sy + cs * 0.45);
      ctx.lineTo(sx + cs * 0.44, sy + cs * 0.6);
      ctx.lineTo(sx + cs * 0.4, sy + cs * 0.75);
    }
    ctx.stroke();
  }

  // 描边
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, sx + m + ((w * (1 - pulse)) / 2), sy + m + ((w * (1 - pulse)) / 2), w * pulse, w * pulse, cs * 0.12);
  ctx.stroke();
}
