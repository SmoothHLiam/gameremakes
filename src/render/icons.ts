import { MODE_KEYS, type ModeKey } from '../core/objects.ts';
import { type Ctx, rr } from './draw.ts';

/** Visual footprint per mode in blocks (icon is centered on the hitbox). */
export const ICON_SIZE: Record<ModeKey, { w: number; h: number }> = {
  cube: { w: 1, h: 1 },
  ship: { w: 1.6, h: 1.1 },
  ball: { w: 1, h: 1 },
  ufo: { w: 1.5, h: 1.15 },
  wave: { w: 1, h: 1 },
  robot: { w: 1.2, h: 1.3 },
  spider: { w: 1.6, h: 1.15 },
  swing: { w: 1.35, h: 1.25 },
};

export interface IconColors {
  p1: string;
  p2: string;
}

const OUT = '#0b0716';

function outline(ctx: Ctx, lw: number): void {
  ctx.strokeStyle = OUT;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function shine(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

type IconDraw = (ctx: Ctx, S: number, c: IconColors, frame: number) => void;

// Coordinates: (0,0) top-left of the icon's footprint, S = pixels per block.

const CUBES: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Grin',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, S * 0.2, S * 0.2, S * 0.6, S * 0.6, S * 0.05);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.fillStyle = OUT;
      ctx.fillRect(S * 0.3, S * 0.32, S * 0.12, S * 0.14);
      ctx.fillRect(S * 0.58, S * 0.32, S * 0.12, S * 0.14);
      ctx.fillRect(S * 0.3, S * 0.58, S * 0.4, S * 0.08);
    },
  },
  {
    name: 'Target',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, S * 0.18, S * 0.18, S * 0.64, S * 0.64, S * 0.04);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      rr(ctx, S * 0.34, S * 0.34, S * 0.32, S * 0.32, S * 0.03);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
  {
    name: 'Split',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.save();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.clip();
      ctx.fillStyle = c.p1;
      ctx.fillRect(0, 0, S, S);
      ctx.beginPath();
      ctx.moveTo(S, 0);
      ctx.lineTo(S, S);
      ctx.lineTo(0, S);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(S, 0);
      ctx.lineTo(0, S);
      outline(ctx, lw * 0.6);
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(S * 0.34, S * 0.36, S * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, lw * 0.5);
      ctx.beginPath();
      ctx.arc(S * 0.37, S * 0.37, S * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
    },
  },
  {
    name: 'Visor',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.1);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, S * 0.14, S * 0.28, S * 0.72, S * 0.24, S * 0.1);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      rr(ctx, S * 0.22, S * 0.32, S * 0.2, S * 0.06, S * 0.03);
      ctx.fill();
      ctx.fillStyle = OUT;
      ctx.fillRect(S * 0.36, S * 0.68, S * 0.28, S * 0.07);
    },
  },
  {
    name: 'Quad',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.save();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.clip();
      ctx.fillStyle = c.p1;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = c.p2;
      ctx.fillRect(S / 2, 0, S / 2, S / 2);
      ctx.fillRect(0, S / 2, S / 2, S / 2);
      ctx.beginPath();
      ctx.moveTo(S / 2, 0);
      ctx.lineTo(S / 2, S);
      ctx.moveTo(0, S / 2);
      ctx.lineTo(S, S / 2);
      outline(ctx, lw * 0.5);
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      outline(ctx, lw);
    },
  },
  {
    name: 'Bolt',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(S * 0.58, S * 0.12);
      ctx.lineTo(S * 0.26, S * 0.55);
      ctx.lineTo(S * 0.48, S * 0.55);
      ctx.lineTo(S * 0.38, S * 0.88);
      ctx.lineTo(S * 0.74, S * 0.42);
      ctx.lineTo(S * 0.52, S * 0.42);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
  {
    name: 'Cyclops',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(S / 2, S * 0.46, S * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.beginPath();
      ctx.arc(S * 0.54, S * 0.47, S * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(S * 0.56, S * 0.47, S * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
      ctx.fillStyle = OUT;
      ctx.fillRect(S * 0.3, S * 0.78, S * 0.4, S * 0.06);
    },
  },
  {
    name: 'Plus',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      const a = S * 0.36;
      const b = S * 0.64;
      const e = S * 0.16;
      const f = S * 0.84;
      ctx.moveTo(a, e);
      ctx.lineTo(b, e);
      ctx.lineTo(b, a);
      ctx.lineTo(f, a);
      ctx.lineTo(f, b);
      ctx.lineTo(b, b);
      ctx.lineTo(b, f);
      ctx.lineTo(a, f);
      ctx.lineTo(a, b);
      ctx.lineTo(e, b);
      ctx.lineTo(e, a);
      ctx.lineTo(a, a);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
  {
    name: 'Peak',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(S * 0.16, S * 0.8);
      ctx.lineTo(S * 0.5, S * 0.18);
      ctx.lineTo(S * 0.84, S * 0.8);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.beginPath();
      ctx.arc(S * 0.5, S * 0.58, S * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, lw * 0.4);
    },
  },
  {
    name: 'Stripes',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.save();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      ctx.clip();
      ctx.fillStyle = c.p1;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = c.p2;
      for (let k = -2; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(k * S * 0.36, 0);
        ctx.lineTo(k * S * 0.36 + S * 0.18, 0);
        ctx.lineTo(k * S * 0.36 + S * 0.18 + S, S);
        ctx.lineTo(k * S * 0.36 + S, S);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      rr(ctx, lw / 2, lw / 2, S - lw, S - lw, S * 0.08);
      outline(ctx, lw);
      rr(ctx, S * 0.3, S * 0.3, S * 0.4, S * 0.4, S * 0.05);
      ctx.fillStyle = OUT;
      ctx.fill();
      rr(ctx, S * 0.36, S * 0.36, S * 0.28, S * 0.28, S * 0.04);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    },
  },
];

const SHIPS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Dart',
    draw: (ctx, S, c) => {
      const W = S * 1.6;
      const H = S * 1.1;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.moveTo(W * 0.04, H * 0.72);
      ctx.lineTo(W * 0.2, H * 0.4);
      ctx.lineTo(W * 0.55, H * 0.42);
      ctx.lineTo(W * 0.97, H * 0.62);
      ctx.lineTo(W * 0.6, H * 0.88);
      ctx.lineTo(W * 0.1, H * 0.9);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(W * 0.14, H * 0.74);
      ctx.lineTo(W * 0.72, H * 0.72);
      ctx.lineTo(W * 0.5, H * 0.82);
      ctx.lineTo(W * 0.16, H * 0.83);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      // canopy
      rr(ctx, W * 0.3, H * 0.12, S * 0.42, S * 0.36, S * 0.06);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(W * 0.33, H * 0.17, S * 0.1, S * 0.08);
    },
  },
  {
    name: 'Finback',
    draw: (ctx, S, c) => {
      const W = S * 1.6;
      const H = S * 1.1;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.moveTo(W * 0.06, H * 0.3);
      ctx.lineTo(W * 0.22, H * 0.55);
      ctx.lineTo(W * 0.2, H * 0.62);
      ctx.closePath();
      ctx.beginPath();
      ctx.moveTo(W * 0.05, H * 0.25);
      ctx.lineTo(W * 0.3, H * 0.52);
      ctx.lineTo(W * 0.12, H * 0.6);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(W * 0.52, H * 0.66, W * 0.45, H * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(W * 0.6, H * 0.7, W * 0.25, H * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.5);
      rr(ctx, W * 0.36, H * 0.18, S * 0.38, S * 0.34, S * 0.08);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(W * 0.36 + S * 0.24, H * 0.18 + S * 0.16, S * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
    },
  },
  {
    name: 'Brick',
    draw: (ctx, S, c) => {
      const W = S * 1.6;
      const H = S * 1.1;
      const lw = S * 0.06;
      rr(ctx, W * 0.06, H * 0.5, W * 0.84, H * 0.36, S * 0.06);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(W * 0.9, H * 0.5);
      ctx.lineTo(W * 0.98, H * 0.68);
      ctx.lineTo(W * 0.9, H * 0.86);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = c.p2;
      for (let k = 0; k < 3; k++) {
        rr(ctx, W * (0.14 + k * 0.22), H * 0.6, W * 0.14, H * 0.14, S * 0.03);
        ctx.fill();
        outline(ctx, lw * 0.5);
      }
      rr(ctx, W * 0.34, H * 0.1, S * 0.4, S * 0.4, S * 0.05);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = OUT;
      ctx.fillRect(W * 0.34 + S * 0.22, H * 0.1 + S * 0.12, S * 0.08, S * 0.1);
    },
  },
  {
    name: 'Ray',
    draw: (ctx, S, c) => {
      const W = S * 1.6;
      const H = S * 1.1;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.moveTo(W * 0.98, H * 0.62);
      ctx.quadraticCurveTo(W * 0.55, H * 0.25, W * 0.15, H * 0.4);
      ctx.lineTo(W * 0.02, H * 0.3);
      ctx.lineTo(W * 0.08, H * 0.6);
      ctx.lineTo(W * 0.02, H * 0.9);
      ctx.lineTo(W * 0.18, H * 0.82);
      ctx.quadraticCurveTo(W * 0.6, H * 0.98, W * 0.98, H * 0.62);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(W * 0.62, H * 0.62, W * 0.12, H * 0.1, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.beginPath();
      ctx.arc(W * 0.64, H * 0.61, S * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    },
  },
];

const BALLS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Halves',
    draw: (ctx, S, c) => {
      const r = S * 0.46;
      const lw = S * 0.07;
      ctx.save();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = c.p1;
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = c.p2;
      ctx.fillRect(0, S / 2, S, S / 2);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(S / 2 - r, S / 2);
      ctx.lineTo(S / 2 + r, S / 2);
      outline(ctx, lw * 0.6);
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
  {
    name: 'Spokes',
    draw: (ctx, S, c) => {
      const r = S * 0.46;
      const lw = S * 0.07;
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(S / 2, S / 2);
        ctx.arc(S / 2, S / 2, r * 0.75, a, a + Math.PI / 4);
        ctx.closePath();
        ctx.fillStyle = c.p2;
        ctx.fill();
        outline(ctx, lw * 0.5);
      }
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
    },
  },
  {
    name: 'Core',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      for (const [r, col] of [[0.46, c.p1], [0.32, c.p2], [0.17, c.p1]] as const) {
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S * r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        outline(ctx, r === 0.46 ? lw : lw * 0.6);
      }
    },
  },
  {
    name: 'Notch',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? S * 0.4 : S * 0.47;
        ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.fillStyle = OUT;
      ctx.fillRect(S * 0.4, S * 0.44, S * 0.07, S * 0.1);
      ctx.fillRect(S * 0.53, S * 0.44, S * 0.07, S * 0.1);
    },
  },
];

const UFOS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Saucer',
    draw: (ctx, S, c) => {
      const W = S * 1.5;
      const H = S * 1.15;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.52, S * 0.36, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(W / 2 - S * 0.12, H * 0.38, S * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.62, W * 0.47, H * 0.16, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(W / 2 + k * W * 0.16, H * 0.64, S * 0.045, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(W * 0.3, H * 0.74);
      ctx.lineTo(W * 0.24, H * 0.92);
      ctx.moveTo(W * 0.7, H * 0.74);
      ctx.lineTo(W * 0.76, H * 0.92);
      outline(ctx, lw);
    },
  },
  {
    name: 'Bell',
    draw: (ctx, S, c) => {
      const W = S * 1.5;
      const H = S * 1.15;
      const lw = S * 0.06;
      rr(ctx, W * 0.3, H * 0.08, W * 0.4, H * 0.55, S * 0.2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = OUT;
      ctx.fillRect(W * 0.42, H * 0.3, S * 0.08, S * 0.1);
      ctx.fillRect(W * 0.54, H * 0.3, S * 0.08, S * 0.1);
      ctx.beginPath();
      ctx.moveTo(W * 0.04, H * 0.72);
      ctx.lineTo(W * 0.2, H * 0.55);
      ctx.lineTo(W * 0.8, H * 0.55);
      ctx.lineTo(W * 0.96, H * 0.72);
      ctx.lineTo(W * 0.8, H * 0.85);
      ctx.lineTo(W * 0.2, H * 0.85);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
    },
  },
  {
    name: 'Halo',
    draw: (ctx, S, c) => {
      const W = S * 1.5;
      const H = S * 1.15;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.5, S * 0.32, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.6, W * 0.47, H * 0.13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = c.p1;
      ctx.lineWidth = S * 0.14;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.6, W * 0.47 + S * 0.07, H * 0.13 + S * 0.07, 0, 0, Math.PI * 2);
      outline(ctx, lw * 0.7);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.6, W * 0.47 - S * 0.07, H * 0.13 - S * 0.05, 0, 0, Math.PI * 2);
      outline(ctx, lw * 0.7);
    },
  },
];

const WAVES: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Dart',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.beginPath();
      ctx.moveTo(S * 0.95, S * 0.5);
      ctx.lineTo(S * 0.12, S * 0.12);
      ctx.lineTo(S * 0.3, S * 0.5);
      ctx.lineTo(S * 0.12, S * 0.88);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(S * 0.75, S * 0.5);
      ctx.lineTo(S * 0.36, S * 0.32);
      ctx.lineTo(S * 0.44, S * 0.5);
      ctx.lineTo(S * 0.36, S * 0.68);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.5);
    },
  },
  {
    name: 'Kite',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.beginPath();
      ctx.moveTo(S * 0.95, S * 0.5);
      ctx.lineTo(S * 0.4, S * 0.18);
      ctx.lineTo(S * 0.08, S * 0.5);
      ctx.lineTo(S * 0.4, S * 0.82);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.moveTo(S * 0.4, S * 0.18);
      ctx.lineTo(S * 0.4, S * 0.82);
      outline(ctx, lw * 0.5);
      ctx.beginPath();
      ctx.moveTo(S * 0.8, S * 0.5);
      ctx.lineTo(S * 0.4, S * 0.3);
      ctx.lineTo(S * 0.4, S * 0.7);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
    },
  },
  {
    name: 'Fang',
    draw: (ctx, S, c) => {
      const lw = S * 0.07;
      ctx.beginPath();
      ctx.moveTo(S * 0.96, S * 0.5);
      ctx.quadraticCurveTo(S * 0.5, S * 0.05, S * 0.06, S * 0.22);
      ctx.lineTo(S * 0.3, S * 0.5);
      ctx.lineTo(S * 0.06, S * 0.78);
      ctx.quadraticCurveTo(S * 0.5, S * 0.95, S * 0.96, S * 0.5);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(S * 0.58, S * 0.5, S * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.5);
    },
  },
];

function legs(ctx: Ctx, pts: Array<[number, number, number, number, number, number]>, lw: number, col: string): void {
  for (const [x0, y0, x1, y1, x2, y2] of pts) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw * 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

const ROBOTS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Boxer',
    draw: (ctx, S, c, f) => {
      const W = S * 1.2;
      const H = S * 1.3;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.38, H * 0.66, W * (0.38 + 0.08 * s), H * 0.82, W * (0.36 + 0.12 * s), H * 0.97],
        [W * 0.62, H * 0.66, W * (0.62 - 0.08 * s), H * 0.82, W * (0.64 - 0.12 * s), H * 0.97],
      ], S * 0.09, c.p2);
      rr(ctx, W * 0.14, H * 0.06, W * 0.72, H * 0.62, S * 0.1);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, W * 0.24, H * 0.16, W * 0.52, H * 0.24, S * 0.06);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.fillStyle = OUT;
      ctx.fillRect(W * 0.52, H * 0.22, S * 0.1, S * 0.1);
      ctx.fillRect(W * 0.3, H * 0.5, W * 0.4, S * 0.06);
    },
  },
  {
    name: 'Dome',
    draw: (ctx, S, c, f) => {
      const W = S * 1.2;
      const H = S * 1.3;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.4, H * 0.68, W * (0.34 + 0.1 * s), H * 0.84, W * (0.36 + 0.1 * s), H * 0.97],
        [W * 0.6, H * 0.68, W * (0.66 - 0.1 * s), H * 0.84, W * (0.64 - 0.1 * s), H * 0.97],
      ], S * 0.08, c.p1);
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.44, W * 0.36, Math.PI, 0);
      ctx.lineTo(W * 0.86, H * 0.66);
      ctx.lineTo(W * 0.14, H * 0.66);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(W * 0.6, H * 0.38, S * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
      ctx.beginPath();
      ctx.arc(W * 0.63, H * 0.38, S * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
    },
  },
  {
    name: 'Strider',
    draw: (ctx, S, c, f) => {
      const W = S * 1.2;
      const H = S * 1.3;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.3, H * 0.6, W * (0.2 + 0.08 * s), H * 0.8, W * (0.24 + 0.12 * s), H * 0.97],
        [W * 0.7, H * 0.6, W * (0.8 - 0.08 * s), H * 0.8, W * (0.76 - 0.12 * s), H * 0.97],
      ], S * 0.08, c.p2);
      ctx.beginPath();
      ctx.moveTo(W * 0.1, H * 0.2);
      ctx.lineTo(W * 0.9, H * 0.12);
      ctx.lineTo(W * 0.82, H * 0.62);
      ctx.lineTo(W * 0.18, H * 0.62);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, W * 0.5, H * 0.24, S * 0.32, S * 0.16, S * 0.05);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
];

const SPIDERS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Mite',
    draw: (ctx, S, c, f) => {
      const W = S * 1.6;
      const H = S * 1.15;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.35, H * 0.55, W * 0.18, H * (0.62 - 0.06 * s), W * 0.08, H * 0.97],
        [W * 0.42, H * 0.6, W * 0.32, H * (0.78 + 0.05 * s), W * 0.3, H * 0.97],
        [W * 0.58, H * 0.6, W * 0.68, H * (0.78 - 0.05 * s), W * 0.7, H * 0.97],
        [W * 0.65, H * 0.55, W * 0.82, H * (0.62 + 0.06 * s), W * 0.92, H * 0.97],
      ], S * 0.07, c.p2);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.46, W * 0.26, H * 0.26, 0, 0, Math.PI * 2);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(W * 0.56, H * 0.4, S * 0.09, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx, lw * 0.5);
      ctx.beginPath();
      ctx.arc(W * 0.58, H * 0.4, S * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = OUT;
      ctx.fill();
    },
  },
  {
    name: 'Crawler',
    draw: (ctx, S, c, f) => {
      const W = S * 1.6;
      const H = S * 1.15;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.3, H * 0.6, W * 0.16, H * (0.5 + 0.06 * s), W * 0.06, H * 0.97],
        [W * 0.45, H * 0.65, W * 0.38, H * (0.8 - 0.04 * s), W * 0.34, H * 0.97],
        [W * 0.55, H * 0.65, W * 0.62, H * (0.8 + 0.04 * s), W * 0.66, H * 0.97],
        [W * 0.7, H * 0.6, W * 0.84, H * (0.5 - 0.06 * s), W * 0.94, H * 0.97],
      ], S * 0.07, c.p1);
      rr(ctx, W * 0.24, H * 0.24, W * 0.52, H * 0.44, S * 0.12);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, W * 0.34, H * 0.32, W * 0.32, H * 0.16, S * 0.05);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw * 0.5);
    },
  },
  {
    name: 'Tick',
    draw: (ctx, S, c, f) => {
      const W = S * 1.6;
      const H = S * 1.15;
      const lw = S * 0.06;
      const s = f === 0 ? 1 : -1;
      legs(ctx, [
        [W * 0.36, H * 0.6, W * 0.2, H * (0.72 + 0.04 * s), W * 0.12, H * 0.97],
        [W * 0.64, H * 0.6, W * 0.8, H * (0.72 - 0.04 * s), W * 0.88, H * 0.97],
      ], S * 0.09, c.p2);
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.08);
      ctx.lineTo(W * 0.78, H * 0.42);
      ctx.lineTo(W * 0.5, H * 0.74);
      ctx.lineTo(W * 0.22, H * 0.42);
      ctx.closePath();
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(W * 0.5, H * 0.42, S * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.5);
    },
  },
];

const SWINGS: Array<{ name: string; draw: IconDraw }> = [
  {
    name: 'Pod',
    draw: (ctx, S, c) => {
      const W = S * 1.35;
      const H = S * 1.25;
      const lw = S * 0.06;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(W * 0.35, H / 2 + d * H * 0.18);
        ctx.lineTo(W * 0.08, H / 2 + d * H * 0.46);
        ctx.lineTo(W * 0.62, H / 2 + d * H * 0.26);
        ctx.closePath();
        ctx.fillStyle = c.p2;
        ctx.fill();
        outline(ctx, lw);
      }
      ctx.beginPath();
      ctx.arc(W * 0.55, H / 2, S * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(W * 0.62, H / 2, S * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw * 0.6);
    },
  },
  {
    name: 'Glider',
    draw: (ctx, S, c) => {
      const W = S * 1.35;
      const H = S * 1.25;
      const lw = S * 0.06;
      ctx.beginPath();
      ctx.moveTo(W * 0.95, H / 2);
      ctx.lineTo(W * 0.3, H * 0.06);
      ctx.lineTo(W * 0.42, H / 2);
      ctx.lineTo(W * 0.3, H * 0.94);
      ctx.closePath();
      ctx.fillStyle = c.p2;
      ctx.fill();
      outline(ctx, lw);
      rr(ctx, W * 0.12, H * 0.3, S * 0.6, S * 0.5, S * 0.18);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.fillStyle = OUT;
      ctx.fillRect(W * 0.38, H * 0.42, S * 0.08, S * 0.12);
    },
  },
  {
    name: 'Rotor',
    draw: (ctx, S, c) => {
      const W = S * 1.35;
      const H = S * 1.25;
      const lw = S * 0.06;
      for (const d of [-1, 1]) {
        rr(ctx, W * 0.15, H / 2 + d * H * 0.36 - S * 0.08, W * 0.7, S * 0.16, S * 0.08);
        ctx.fillStyle = c.p2;
        ctx.fill();
        outline(ctx, lw);
      }
      rr(ctx, W * 0.22, H * 0.24, W * 0.56, H * 0.52, S * 0.14);
      ctx.fillStyle = c.p1;
      ctx.fill();
      outline(ctx, lw);
      ctx.beginPath();
      ctx.arc(W * 0.58, H / 2, S * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      outline(ctx, lw * 0.5);
    },
  },
];

export const ICON_SETS: Record<ModeKey, Array<{ name: string; draw: IconDraw }>> = {
  cube: CUBES,
  ship: SHIPS,
  ball: BALLS,
  ufo: UFOS,
  wave: WAVES,
  robot: ROBOTS,
  spider: SPIDERS,
  swing: SWINGS,
};

/** Number of animation frames per mode icon (robot / spider legs alternate). */
export const ICON_FRAMES: Record<ModeKey, number> = {
  cube: 1, ship: 1, ball: 1, ufo: 1, wave: 1, robot: 2, spider: 2, swing: 1,
};

/** Draws an icon into a new canvas at `ppb` pixels per block, with padding. */
export function renderIcon(mode: ModeKey, design: number, colors: IconColors, ppb: number, frame = 0, pad = 0.1): HTMLCanvasElement {
  const size = ICON_SIZE[mode];
  const set = ICON_SETS[mode];
  const d = set[((design % set.length) + set.length) % set.length]!;
  const p = Math.ceil(pad * ppb);
  const c = document.createElement('canvas');
  c.width = Math.ceil(size.w * ppb) + p * 2;
  c.height = Math.ceil(size.h * ppb) + p * 2;
  const ctx = c.getContext('2d')!;
  ctx.translate(p, p);
  d.draw(ctx, ppb, colors, frame);
  // shared top highlight for a glossy finish
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  shine(ctx, 0, 0, size.w * ppb, size.h * ppb * 0.35);
  ctx.restore();
  return c;
}

export const MODE_ORDER = MODE_KEYS;
