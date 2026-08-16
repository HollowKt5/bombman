/**
 * presentation/renderer/entity-renderer.ts —— 角色/泡泡/水柱/道具（程序化矢量绘制）
 */
import {
  Direction,
  type Bomb,
  type Explosion,
  type Player,
  type PowerUp,
} from '../../shared/types';
import { POWERUP_META, TUNING } from '../../shared/constants';

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

/** 十六进制颜色变暗/变亮（amt < 0 变暗） */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

const EYE_DIR: Record<Direction, [number, number]> = {
  [Direction.UP]: [0, -1],
  [Direction.DOWN]: [0, 1],
  [Direction.LEFT]: [-1, 0],
  [Direction.RIGHT]: [1, 0],
  [Direction.NONE]: [0, 1],
};

export function drawBomb(ctx: CanvasRenderingContext2D, b: Bomb, cs: number, tick: number): void {
  // 踢泡滑动插值（逻辑格已即时更新，渲染平滑滑过）
  let rx = b.x;
  let ry = b.y;
  if (b.kickDir !== null && b.kickSlide) {
    const t = 1 - Math.max(0, b.kickT) / TUNING.bomb.kickTicks;
    rx = b.kickSlide.fromX + (b.kickSlide.toX - b.kickSlide.fromX) * t;
    ry = b.kickSlide.fromY + (b.kickSlide.toY - b.kickSlide.fromY) * t;
  }
  const cx = (rx + 0.5) * cs;
  const cy = (ry + 0.5) * cs;
  const r = cs * 0.33;
  const scale = 1 + 0.07 * Math.sin(tick * 0.35);
  const dangerRatio = Math.max(0, 1 - b.timer / 150);

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.85, r * 0.8, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  // 弹体
  ctx.fillStyle = '#2A2F3A';
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.1, r * scale, 0, Math.PI * 2);
  ctx.fill();

  // 高光
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.28, 0, Math.PI * 2);
  ctx.fill();

  // 引信
  ctx.strokeStyle = '#8B5A2B';
  ctx.lineWidth = Math.max(2, cs * 0.05);
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.6);
  ctx.quadraticCurveTo(cx + r * 0.4, cy - r * 1.05, cx + r * 0.55, cy - r * 0.8);
  ctx.stroke();

  // 火花（快炸时加速闪烁）
  const sparkSpeed = dangerRatio > 0.7 ? 0.9 : 0.25;
  const sparkOn = Math.sin(tick * sparkSpeed) > -0.2;
  if (sparkOn) {
    ctx.fillStyle = dangerRatio > 0.7 ? '#FF5722' : '#FFD700';
    ctx.beginPath();
    ctx.arc(cx + r * 0.55, cy - r * 0.8, cs * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // 快炸泛红
  if (dangerRatio > 0.7) {
    ctx.globalAlpha = ((dangerRatio - 0.7) / 0.3) * 0.4;
    ctx.fillStyle = '#FF1744';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.1, r * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/** 恐龙坐骑：Q 版恐龙 + 小人骑手（破墙时朝目标顶撞摆动） */
function drawDinoRider(
  ctx: CanvasRenderingContext2D,
  p: Player,
  cx: number,
  cy: number,
  cs: number,
  tick: number,
): void {
  const [ex, ey] = EYE_DIR[p.facing];
  // 破墙顶撞动画：充能阶段（按住蓄力）蹲伏，破墙阶段朝目标前后顶撞
  let lungeX = 0;
  let lungeY = 0;
  let headLunge = 0;
  let crouch = 0;
  if (p.break) {
    if (p.break.phase === 'hit') {
      const bx = Math.sign(p.break.x - Math.round(p.x)) || ex;
      const by = Math.sign(p.break.y - Math.round(p.y)) || ey;
      const amp = Math.abs(Math.sin(tick * 0.7)) * cs * 0.05;
      lungeX = bx * amp;
      lungeY = by * amp;
      headLunge = cs * 0.04;
    } else {
      // 充能：蹲伏蓄力（随进度越蹲越低）
      crouch = (1 - p.break.t / 30) * cs * 0.03;
    }
  }
  const breathe = Math.sin(tick * 0.3) * cs * 0.02;
  const bodyCX = cx + lungeX;
  const bodyCY = cy + cs * 0.04 + crouch + breathe;

  // 四条短腿（支撑更高大的身体）
  ctx.fillStyle = '#4E7A26';
  for (const lx of [-0.2, 0.15]) {
    ctx.beginPath();
    ctx.arc(bodyCX + lx * cs, bodyCY + cs * 0.2, cs * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#558B2F';
  for (const lx of [-0.2, 0.15]) {
    ctx.beginPath();
    ctx.arc(bodyCX + lx * cs + cs * 0.1, bodyCY + cs * 0.22, cs * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // 尾巴（向后上方翘起）
  ctx.fillStyle = '#689F38';
  ctx.beginPath();
  ctx.moveTo(bodyCX - ex * cs * 0.24, bodyCY - cs * 0.08);
  ctx.quadraticCurveTo(
    bodyCX - ex * cs * 0.6,
    bodyCY - cs * 0.28,
    bodyCX - ex * cs * 0.78,
    bodyCY - cs * 0.34,
  );
  ctx.quadraticCurveTo(
    bodyCX - ex * cs * 0.7,
    bodyCY - cs * 0.12,
    bodyCX - ex * cs * 0.5,
    bodyCY - cs * 0.02,
  );
  ctx.closePath();
  ctx.fill();

  // 身体（更高更圆润的躯干，不再像狗）
  ctx.fillStyle = '#7CB342';
  ctx.beginPath();
  ctx.ellipse(bodyCX, bodyCY - cs * 0.04, cs * 0.27, cs * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 脖子（连接身体与头）
  const neckX = bodyCX + ex * cs * 0.24;
  const neckY = bodyCY - cs * 0.28;
  ctx.fillStyle = '#8BC34A';
  ctx.beginPath();
  ctx.ellipse(neckX, neckY, cs * 0.1, cs * 0.16, ex * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // 头（更大，破墙时向前伸）
  const headX = bodyCX + ex * cs * 0.3 + ex * headLunge;
  const headY = bodyCY - cs * 0.38 + ey * headLunge * 0.5;
  ctx.fillStyle = '#8BC34A';
  ctx.beginPath();
  ctx.arc(headX, headY, cs * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 头冠（脑后小棘刺，恐龙感）
  ctx.fillStyle = '#9CCC65';
  for (const spike of [-0.15, -0.03]) {
    ctx.beginPath();
    ctx.moveTo(headX - ex * cs * 0.12 + spike * cs, headY - cs * 0.16);
    ctx.lineTo(headX - ex * cs * 0.05 + spike * cs, headY - cs * 0.27);
    ctx.lineTo(headX - ex * cs * 0.01 + spike * cs, headY - cs * 0.13);
    ctx.closePath();
    ctx.fill();
  }

  // 吻部
  ctx.fillStyle = '#9CCC65';
  ctx.beginPath();
  ctx.arc(headX + ex * cs * 0.16, headY + ey * cs * 0.14, cs * 0.09, 0, Math.PI * 2);
  ctx.fill();
  // 眼睛（朝上 = 背面视角，不画脸，避免吓人）
  if (p.facing !== Direction.UP) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(headX + ex * cs * 0.08, headY - cs * 0.06, cs * 0.065, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(headX + ex * cs * 0.11, headY - cs * 0.06, cs * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }

  // 背上的小人（骑手，缩小版，骑在更高的背上）
  const rr = cs * 0.21;
  const riderCY = bodyCY - cs * 0.28;
  ctx.fillStyle = shade(p.color, -25);
  ctx.beginPath();
  ctx.arc(bodyCX, riderCY + rr * 0.45, rr * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(bodyCX, riderCY - rr * 0.12, rr * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 骑手眼睛（朝上 = 背面视角，不画脸，避免吓人）
  if (p.facing !== Direction.UP) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bodyCX + ex * rr * 0.15 - rr * 0.3, riderCY - rr * 0.1, rr * 0.2, 0, Math.PI * 2);
    ctx.arc(bodyCX + ex * rr * 0.15 + rr * 0.3, riderCY - rr * 0.1, rr * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(bodyCX + ex * rr * 0.15 - rr * 0.3 + ex * rr * 0.1, riderCY - rr * 0.1, rr * 0.1, 0, Math.PI * 2);
    ctx.arc(bodyCX + ex * rr * 0.15 + rr * 0.3 + ex * rr * 0.1, riderCY - rr * 0.1, rr * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255,120,140,0.5)';
    ctx.beginPath();
    ctx.arc(bodyCX - rr * 0.55, riderCY, rr * 0.12, 0, Math.PI * 2);
    ctx.arc(bodyCX + rr * 0.55, riderCY, rr * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, cs: number, tick: number): void {
  const cx = (p.x + 0.5) * cs;
  const cy = (p.y + 0.5) * cs;
  const r = cs * 0.42;
  const dead = !p.alive;

  // 死亡：整体半透明（幽灵质感）
  if (dead) ctx.globalAlpha = 0.35;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.9, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 无敌闪烁
  const invincible = p.invincibleTimer > 0;
  ctx.save();
  if (invincible) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(tick * 0.6);

  const bob = Math.sin(tick * 0.45) * cs * 0.035;
  const headR = r * 0.6;
  const bodyR = r * 0.5;
  const headCY = cy + bob - r * 0.15;

  if (p.mount && !dead) {
    // 恐龙坐骑：小人骑在恐龙背上（具象化）
    drawDinoRider(ctx, p, cx, cy, cs, tick);
  } else {
    // 身体
    ctx.fillStyle = shade(p.color, -30);
    ctx.beginPath();
    ctx.arc(cx, cy + bob + r * 0.28, bodyR * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // 头（大头 Q 版，占 40%+）
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 眼睛（朝向偏移；朝上时是背面视角，不画脸——避免"背后有眼睛"的吓人效果）
    const [ex, ey] = EYE_DIR[p.facing];
    const eyeY = headCY - headR * 0.12;
    const pupilDX = ex * headR * 0.16;
    const pupilDY = ey * headR * 0.16;
    if (p.facing !== Direction.UP) {
      for (const side of [-1, 1]) {
        const exx = cx + side * headR * 0.32;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(exx + pupilDX * 0.3, eyeY + pupilDY * 0.3, headR * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(exx + pupilDX, eyeY + pupilDY, headR * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 腮红（朝上同样隐藏）
    if (p.facing !== Direction.UP) {
      ctx.fillStyle = 'rgba(255,120,140,0.45)';
      ctx.beginPath();
      ctx.arc(cx - headR * 0.55, eyeY + headR * 0.3, headR * 0.12, 0, Math.PI * 2);
      ctx.arc(cx + headR * 0.55, eyeY + headR * 0.3, headR * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    // 嘴（朝上同样隐藏——背面视角不画脸）
    if (p.facing !== Direction.UP) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, eyeY + headR * 0.42, headR * 0.14, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }

  ctx.restore();

  if (dead) ctx.globalAlpha = 1;

  // 死亡：头顶天使光环
  if (dead) {
    const haloY = headCY - headR - cs * 0.1;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
    ctx.lineWidth = Math.max(2, cs * 0.05);
    ctx.beginPath();
    ctx.ellipse(cx, haloY, headR * 0.45, headR * 0.16, 0, Math.PI, Math.PI * 2); // 上半椭圆
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 244, 180, 0.95)';
    ctx.beginPath();
    ctx.arc(cx, haloY, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // 玩家光环：脚下发光圆环，提示哪个是自己
  if (p.isHuman && !dead) {
    const pulse = 0.55 + 0.25 * Math.sin(tick * 0.2);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.14 * pulse})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.88, r * 0.95, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.88, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 彩虹光波：身体覆盖彩虹光环（红橙黄绿蓝紫，环绕旋转脉冲）
  if (p.rainbow && !dead) {
    const colors = ['#FF5252', '#FF9800', '#FFEB3B', '#4CAF50', '#2196F3', '#9C27B0'];
    const rot = tick * 0.03;
    for (let i = 0; i < 6; i++) {
      const arcR = r * 1.2 + i * cs * 0.05;
      ctx.strokeStyle = colors[i];
      ctx.globalAlpha = 0.5 + 0.25 * Math.sin(tick * 0.15 + i * 1.2);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.5, arcR, rot + i * 0.5, rot + i * 0.5 + Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // 泡封（半透明泡泡罩住）
  if (p.trapped) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#81D4FA';
    ctx.beginPath();
    ctx.arc(cx, cy + bob * 0.5, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#E1F5FE';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + bob * 0.5, r * 1.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy - r * 0.55, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawExplosion(ctx: CanvasRenderingContext2D, ex: Explosion, cs: number): void {
  const ratio = ex.remaining / ex.total;
  const alpha = Math.min(1, ratio * 1.5 + 0.2);
  const grow = 0.75 + 0.25 * (1 - ratio); // 从中心扩张
  const center = ex.cells[0];
  const ccx = (center.x + 0.5) * cs;
  const ccy = (center.y + 0.5) * cs;

  // 红色爆炸主体（中心白热 → 边缘橙红）
  for (const c of ex.cells) {
    const isCenter = c.x === center.x && c.y === center.y;
    const size = cs * 0.8 * grow; // v1.5.7 特效缩小
    const x = (c.x + 0.5) * cs - size / 2;
    const y = (c.y + 0.5) * cs - size / 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = isCenter ? '#FFF176' : '#FF5252';
    roundRect(ctx, x, y, size, size, cs * 0.18);
    ctx.fill();
    ctx.strokeStyle = isCenter ? '#FFFFFF' : '#FFCDD2';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, size, size, cs * 0.18);
    ctx.stroke();
  }

  // 中心 💥 表情（爆炸前半程）
  if (ratio > 0.35) {
    ctx.globalAlpha = Math.min(1, alpha * 1.2);
    ctx.font = `${cs * 0.6}px "Segoe UI Emoji", "Apple Color Emoji", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💥', ccx, ccy);
  }

  // 冲击波：从中心向外扩散的圆环（衰减淡出）
  const shockRadius = cs * (0.28 + (1 - ratio) * 0.8); // 冲击波缩小
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = '#FFD54F';
  ctx.lineWidth = Math.max(1.5, cs * 0.035);
  ctx.beginPath();
  ctx.arc(ccx, ccy, shockRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = '#FFF9C4';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ccx, ccy, shockRadius * 0.75, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 1;
}

export function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp, cs: number, tick: number): void {
  const meta = POWERUP_META[pu.type];
  const cx = (pu.x + 0.5) * cs;
  const cy = (pu.y + 0.5) * cs + Math.sin(tick * 0.08 + pu.x) * cs * 0.05;
  const r = cs * 0.32;

  // 底板
  ctx.fillStyle = meta.color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 图标
  ctx.font = `${cs * 0.42}px "Segoe UI Emoji", "Apple Color Emoji", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(meta.emoji, cx, cy + 1);
}
