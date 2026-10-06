import type { Difficulty } from '../core/level.ts';

/** Original difficulty badges: a hex token whose face gets fiercer with each tier. */
export const FACE_COLORS: Record<Difficulty, [string, string]> = {
  easy: ['#5cf2a0', '#1f9e5c'],
  normal: ['#4fb8ff', '#1d6fc4'],
  hard: ['#ffd23f', '#c48f0c'],
  harder: ['#ff8a2a', '#b84d06'],
  insane: ['#ff4fd8', '#a01f86'],
  extreme: ['#ff3048', '#7a0a1a'],
};

type C2D = CanvasRenderingContext2D;

function hexPath(ctx: C2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function eye(ctx: C2D, x: number, y: number, r: number, look = 0.25): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 1.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = r * 0.28;
  ctx.strokeStyle = '#0b0716';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + r * look, y + r * 0.1, r * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0716';
  ctx.fill();
}

function brow(ctx: C2D, x: number, y: number, w: number, tilt: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - tilt);
  ctx.lineTo(x + w / 2, y + tilt);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0b0716';
  ctx.stroke();
}

export function drawFace(ctx: C2D, d: Difficulty, size: number): void {
  const s = size;
  const cx = s / 2;
  const cy = d === 'extreme' ? s * 0.58 : s / 2 + s * 0.04;
  const r = d === 'extreme' ? s * 0.36 : s * 0.4;
  const [c1, c2] = FACE_COLORS[d];
  ctx.save();
  if (d === 'extreme') {
    // a crown of five flame tongues rising from the top of the token
    const tongues = [
      { x: -0.62, h: 0.55, w: 0.34 },
      { x: -0.3, h: 0.85, w: 0.36 },
      { x: 0, h: 1.05, w: 0.4 },
      { x: 0.3, h: 0.85, w: 0.36 },
      { x: 0.62, h: 0.55, w: 0.34 },
    ];
    for (const t of tongues) {
      const bx = cx + t.x * r;
      const by = cy - r * 0.55;
      ctx.beginPath();
      ctx.moveTo(bx - t.w * r * 0.5, by);
      ctx.quadraticCurveTo(bx - t.w * r * 0.55, by - t.h * r * 0.55, bx, by - t.h * r);
      ctx.quadraticCurveTo(bx + t.w * r * 0.55, by - t.h * r * 0.55, bx + t.w * r * 0.5, by);
      ctx.closePath();
      const fg = ctx.createLinearGradient(0, by - t.h * r, 0, by);
      fg.addColorStop(0, '#fff3a0');
      fg.addColorStop(0.5, '#ffb02e');
      fg.addColorStop(1, '#ff4a1f');
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.lineWidth = s * 0.025;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b0716';
      ctx.stroke();
    }
  }
  hexPath(ctx, cx, cy, r);
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = s * 0.045;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b0716';
  ctx.stroke();
  // gloss
  ctx.save();
  hexPath(ctx, cx, cy, r * 0.86);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.2, cy - r * 0.55, r * 0.7, r * 0.3, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ex = r * 0.38;
  const ey = cy - r * 0.12;
  const er = r * 0.17;
  const lw = s * 0.035;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0b0716';
  switch (d) {
    case 'easy':
      eye(ctx, cx - ex, ey, er, 0.2);
      eye(ctx, cx + ex, ey, er, 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.12, r * 0.38, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
      break;
    case 'normal':
      eye(ctx, cx - ex, ey, er, 0.3);
      eye(ctx, cx + ex, ey, er, 0.3);
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.2, r * 0.25, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.lineWidth = lw * 1.1;
      ctx.stroke();
      break;
    case 'hard':
      eye(ctx, cx - ex, ey, er, 0.35);
      eye(ctx, cx + ex, ey, er, 0.35);
      brow(ctx, cx - ex, ey - er * 1.7, er * 2.2, -er * 0.35, lw);
      brow(ctx, cx + ex, ey - er * 1.7, er * 2.2, er * 0.35, lw);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.25, cy + r * 0.38);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.38);
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
      break;
    case 'harder':
      eye(ctx, cx - ex, ey, er, 0.4);
      eye(ctx, cx + ex, ey, er, 0.4);
      brow(ctx, cx - ex, ey - er * 1.5, er * 2.4, er * 0.7, lw * 1.2);
      brow(ctx, cx + ex, ey - er * 1.5, er * 2.4, -er * 0.7, lw * 1.2);
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.62, r * 0.28, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.lineWidth = lw * 1.2;
      ctx.stroke();
      // sweat drop
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.72, cy - r * 0.42);
      ctx.quadraticCurveTo(cx + r * 0.86, cy - r * 0.18, cx + r * 0.72, cy - r * 0.12);
      ctx.quadraticCurveTo(cx + r * 0.58, cy - r * 0.18, cx + r * 0.72, cy - r * 0.42);
      ctx.fillStyle = '#9fe8ff';
      ctx.fill();
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      break;
    case 'insane': {
      // star eyes
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? er * 0.55 : er * 1.35;
          const x = cx + sx * ex + Math.cos(a) * rr;
          const y = ey + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = lw * 0.8;
        ctx.stroke();
      }
      ctx.beginPath();
      const mw = r * 0.6;
      ctx.moveTo(cx - mw / 2, cy + r * 0.38);
      for (let i = 1; i <= 6; i++) ctx.lineTo(cx - mw / 2 + (i * mw) / 6, cy + r * (i % 2 ? 0.28 : 0.42));
      ctx.lineWidth = lw * 1.1;
      ctx.stroke();
      break;
    }
    case 'extreme': {
      // glowing slit eyes
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.shadowColor = '#ffe14d';
        ctx.shadowBlur = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(cx + sx * ex - er * 1.3, ey - er * 0.5 * sx * -1);
        ctx.lineTo(cx + sx * ex + er * 1.3, ey + er * 0.5 * sx * -1);
        ctx.lineTo(cx + sx * ex, ey + er * 0.9);
        ctx.closePath();
        ctx.fillStyle = '#ffe14d';
        ctx.fill();
        ctx.restore();
        ctx.lineWidth = lw * 0.7;
        ctx.stroke();
      }
      // jagged grin
      ctx.beginPath();
      const mw = r * 0.84;
      const my = cy + r * 0.32;
      ctx.moveTo(cx - mw / 2, my);
      ctx.quadraticCurveTo(cx, my + r * 0.42, cx + mw / 2, my);
      ctx.closePath();
      ctx.fillStyle = '#0b0716';
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const x0 = cx - mw / 2 + (i * mw) / 5 + mw * 0.03;
        ctx.moveTo(x0, my + r * 0.02);
        ctx.lineTo(x0 + mw / 10, my + r * 0.15);
        ctx.lineTo(x0 + mw / 5 - mw * 0.06, my + r * 0.02);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

const cache = new Map<string, string>();

/** Data URL of a face for DOM use. */
export function faceUrl(d: Difficulty, size = 96): string {
  const key = `${d}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  drawFace(c.getContext('2d')!, d, size);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
