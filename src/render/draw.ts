/**
 * Canvas2D drawing for every object texture. All art is original and drawn in
 * white / grey so color channels can tint it, except "fixed" parts (portals,
 * orbs, pads, coins) which carry their own palette.
 *
 * Each entry draws into a W×H pixel area (the object's logical footprint);
 * `pad` extra pixels exist on every side for strokes and glows.
 */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface TexSpec {
  /** Logical size in blocks. */
  w: number;
  h: number;
  /** Padding in blocks. */
  pad?: number;
  draw(ctx: Ctx, W: number, H: number, B: number): void;
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}

function star(ctx: Ctx, cx: number, cy: number, points: number, r0: number, r1: number, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? r1 : r0;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function poly(ctx: Ctx, pts: Array<[number, number]>): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

const WHITE = '#ffffff';

function stroke(ctx: Ctx, lw: number, alpha = 1, color = WHITE): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function fill(ctx: Ctx, alpha = 1, color = WHITE): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- blocks

type BlockPattern = (ctx: Ctx, W: number, H: number, B: number) => void;

function blockFill(radius = 0.08): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    rr(ctx, 0, 0, W, H, B * radius);
    fill(ctx);
  };
}

function blockLine(pattern: BlockPattern | null, lwScale = 1): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const lw = B * 0.075 * lwScale;
    // soft inner gradient shading for depth
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.20)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(255,255,255,0.12)');
    rr(ctx, lw / 2, lw / 2, W - lw, H - lw, B * 0.07);
    ctx.fillStyle = grad;
    ctx.fill();
    if (pattern) {
      ctx.save();
      rr(ctx, lw, lw, W - lw * 2, H - lw * 2, B * 0.05);
      ctx.clip();
      pattern(ctx, W, H, B);
      ctx.restore();
    }
    rr(ctx, lw / 2, lw / 2, W - lw, H - lw, B * 0.07);
    stroke(ctx, lw);
  };
}

const patterns: Record<string, BlockPattern | null> = {
  block: (ctx, W, H, B) => {
    const m = B * 0.2;
    rr(ctx, m, m, W - m * 2, H - m * 2, B * 0.06);
    stroke(ctx, B * 0.045, 0.55);
    // corner ticks
    const t = B * 0.12;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x - dx * t * 0.9, y - dy * t * 0.1);
      ctx.lineTo(x - dx * t * 0.1, y - dy * t * 0.9);
      stroke(ctx, B * 0.03, 0.4);
    }
  },
  brick: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.moveTo(W * 0.5, 0);
    ctx.lineTo(W * 0.5, H / 2);
    ctx.moveTo(W * 0.2, H / 2);
    ctx.lineTo(W * 0.2, H);
    ctx.moveTo(W * 0.8, H / 2);
    ctx.lineTo(W * 0.8, H);
    stroke(ctx, B * 0.045, 0.5);
  },
  panel: (ctx, W, H, B) => {
    const m = B * 0.24;
    rr(ctx, m, m, W - m * 2, H - m * 2, B * 0.04);
    fill(ctx, 0.12);
    stroke(ctx, B * 0.04, 0.6);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(m, m);
    ctx.moveTo(W, 0);
    ctx.lineTo(W - m, m);
    ctx.moveTo(0, H);
    ctx.lineTo(m, H - m);
    ctx.moveTo(W, H);
    ctx.lineTo(W - m, H - m);
    stroke(ctx, B * 0.035, 0.45);
  },
  grid: (ctx, W, H, B) => {
    ctx.beginPath();
    for (let k = 1; k < 3; k++) {
      ctx.moveTo((W * k) / 3, 0);
      ctx.lineTo((W * k) / 3, H);
      ctx.moveTo(0, (H * k) / 3);
      ctx.lineTo(W, (H * k) / 3);
    }
    stroke(ctx, B * 0.035, 0.42);
  },
  stud: (ctx, W, H, B) => {
    for (const [fx, fy] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] as const) {
      ctx.beginPath();
      ctx.arc(W * fx, H * fy, B * 0.1, 0, Math.PI * 2);
      fill(ctx, 0.25);
      stroke(ctx, B * 0.035, 0.6);
    }
  },
  plain: null,
  slab: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(B * 0.2, H / 2);
    ctx.lineTo(W - B * 0.2, H / 2);
    stroke(ctx, B * 0.04, 0.5);
  },
  pillar: (ctx, W, H, B) => {
    ctx.beginPath();
    for (let k = 1; k < 4; k++) {
      ctx.moveTo(B * 0.1, (H * k) / 4);
      ctx.lineTo(W - B * 0.1, (H * k) / 4);
    }
    stroke(ctx, B * 0.035, 0.45);
  },
};

// ---------------------------------------------------------------- slopes

function slopeFill(ctx: Ctx, W: number, H: number): void {
  poly(ctx, [[0, H], [W, H], [W, 0]]);
  fill(ctx);
}

function slopeLine(ctx: Ctx, W: number, H: number, B: number): void {
  const lw = B * 0.075;
  ctx.save();
  poly(ctx, [[0, H], [W, H], [W, 0]]);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.2)');
  grad.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // hatch parallel to the slope
  ctx.beginPath();
  for (let k = 1; k < 4; k++) {
    const o = (k * B) / 4;
    ctx.moveTo(o * (W / H), H);
    ctx.lineTo(W, o);
  }
  stroke(ctx, B * 0.03, 0.3);
  ctx.restore();
  poly(ctx, [[lw * 0.6, H - lw / 2], [W - lw / 2, H - lw / 2], [W - lw / 2, lw * 0.6]]);
  stroke(ctx, lw);
}

// ---------------------------------------------------------------- spikes

function spikeShape(ctx: Ctx, W: number, H: number, inset = 0): void {
  poly(ctx, [[inset * 1.2, H - inset * 0.5], [W / 2, inset * 1.1], [W - inset * 1.2, H - inset * 0.5]]);
}

function spikeFill(ctx: Ctx, W: number, H: number): void {
  spikeShape(ctx, W, H);
  fill(ctx);
}

function spikeLine(ctx: Ctx, W: number, H: number, B: number): void {
  const lw = B * 0.07;
  spikeShape(ctx, W, H, lw / 2);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = grad;
  ctx.fill();
  stroke(ctx, lw);
  // inner chevron
  ctx.beginPath();
  ctx.moveTo(W * 0.32, H * 0.86);
  ctx.lineTo(W / 2, H * 0.42);
  ctx.lineTo(W * 0.68, H * 0.86);
  stroke(ctx, B * 0.035, 0.5);
}

function teethFill(ctx: Ctx, W: number, H: number): void {
  ctx.beginPath();
  const n = 3;
  for (let k = 0; k < n; k++) {
    const x0 = (W * k) / n;
    ctx.moveTo(x0, H);
    ctx.lineTo(x0 + W / n / 2, 0);
    ctx.lineTo(x0 + W / n, H);
  }
  ctx.closePath();
  fill(ctx);
}

function teethLine(ctx: Ctx, W: number, H: number, B: number): void {
  ctx.beginPath();
  const n = 3;
  const lw = B * 0.05;
  ctx.moveTo(lw, H - lw / 2);
  for (let k = 0; k < n; k++) {
    const x0 = (W * k) / n;
    ctx.lineTo(x0 + W / n / 2, lw);
    ctx.lineTo(x0 + W / n, H - lw / 2);
  }
  stroke(ctx, lw);
}

// ---------------------------------------------------------------- saws

function sawPath(ctx: Ctx, cx: number, cy: number, r: number, teeth: number): void {
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.55) / teeth) * Math.PI * 2;
    const a2 = ((i + 1) / teeth) * Math.PI * 2;
    const rin = r * 0.8;
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * rin, cy + Math.sin(a0) * rin);
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    ctx.lineTo(cx + Math.cos(a2) * rin, cy + Math.sin(a2) * rin);
  }
  ctx.closePath();
}

function sawFill(teeth: number): TexSpec['draw'] {
  return (ctx, W, H) => {
    sawPath(ctx, W / 2, H / 2, Math.min(W, H) / 2, teeth);
    fill(ctx);
  };
}

function sawLine(teeth: number): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const r = Math.min(W, H) / 2;
    const lw = B * 0.07;
    sawPath(ctx, W / 2, H / 2, r - lw / 2, teeth);
    stroke(ctx, lw);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r * 0.55, 0, Math.PI * 2);
    stroke(ctx, B * 0.05, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * r * 0.18, H / 2 + Math.sin(a) * r * 0.18);
      ctx.lineTo(W / 2 + Math.cos(a) * r * 0.5, H / 2 + Math.sin(a) * r * 0.5);
      stroke(ctx, B * 0.06, 0.6);
    }
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, r * 0.16, 0, Math.PI * 2);
    fill(ctx, 0.9);
  };
}

// ---------------------------------------------------------------- portals

export const PORTAL_COLORS: Record<string, string> = {
  cube: '#22e0d0',
  ship: '#ff8a1f',
  ball: '#ff3fb4',
  ufo: '#ffd23f',
  wave: '#3f7bff',
  robot: '#d8e0ff',
  spider: '#a24bff',
  swing: '#b6ff3a',
  gravn: '#49c8ff',
  gravf: '#ffb02e',
  sizen: '#5bff6a',
  sizem: '#ff6ad5',
  mirron: '#ff9d4a',
  mirroff: '#4ab8ff',
  dualon: '#ff4a6e',
  dualoff: '#58ffd0',
};

function portalGlyph(ctx: Ctx, key: string, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = s * 0.12;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (key) {
    case 'cube':
      rr(ctx, -s * 0.35, -s * 0.35, s * 0.7, s * 0.7, s * 0.1);
      ctx.stroke();
      break;
    case 'ship':
      poly(ctx, [[-s * 0.45, s * 0.25], [s * 0.45, s * 0.05], [-s * 0.1, -s * 0.35], [-s * 0.2, s * 0.02]]);
      ctx.stroke();
      break;
    case 'ball':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.38, 0);
      ctx.lineTo(s * 0.38, 0);
      ctx.stroke();
      break;
    case 'ufo':
      ctx.beginPath();
      ctx.ellipse(0, s * 0.08, s * 0.45, s * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.02, s * 0.2, Math.PI, 0);
      ctx.stroke();
      break;
    case 'wave':
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * 0.2);
      ctx.lineTo(-s * 0.15, -s * 0.2);
      ctx.lineTo(s * 0.15, s * 0.2);
      ctx.lineTo(s * 0.45, -s * 0.2);
      ctx.stroke();
      break;
    case 'robot':
      rr(ctx, -s * 0.28, -s * 0.38, s * 0.56, s * 0.4, s * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.05);
      ctx.lineTo(-s * 0.2, s * 0.38);
      ctx.moveTo(s * 0.15, s * 0.05);
      ctx.lineTo(s * 0.2, s * 0.38);
      ctx.stroke();
      break;
    case 'spider':
      ctx.beginPath();
      ctx.arc(0, -s * 0.05, s * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(d * s * 0.15, 0);
        ctx.lineTo(d * s * 0.42, -s * 0.2);
        ctx.moveTo(d * s * 0.15, s * 0.05);
        ctx.lineTo(d * s * 0.42, s * 0.35);
        ctx.stroke();
      }
      break;
    case 'swing':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, -Math.PI * 0.8, Math.PI * 0.8, false);
      ctx.stroke();
      poly(ctx, [[s * 0.1, -s * 0.42], [s * 0.42, -s * 0.18], [s * 0.05, -s * 0.05]]);
      ctx.fill();
      break;
    case 'gravn':
    case 'gravf': {
      const d = key === 'gravn' ? 1 : -1;
      for (const o of [-0.18, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, (o - d * 0.12) * s);
        ctx.lineTo(0, (o + d * 0.12) * s);
        ctx.lineTo(s * 0.3, (o - d * 0.12) * s);
        ctx.stroke();
      }
      break;
    }
    case 'sizen':
      rr(ctx, -s * 0.36, -s * 0.36, s * 0.72, s * 0.72, s * 0.1);
      ctx.stroke();
      break;
    case 'sizem':
      rr(ctx, -s * 0.18, -s * 0.18, s * 0.36, s * 0.36, s * 0.06);
      ctx.fill();
      break;
    case 'mirron':
    case 'mirroff':
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(0, s * 0.4);
      ctx.stroke();
      poly(ctx, [[-s * 0.12, -s * 0.2], [-s * 0.42, 0], [-s * 0.12, s * 0.2]]);
      if (key === 'mirron') ctx.fill();
      else ctx.stroke();
      poly(ctx, [[s * 0.12, -s * 0.2], [s * 0.42, 0], [s * 0.12, s * 0.2]]);
      if (key === 'mirron') ctx.stroke();
      else ctx.fill();
      break;
    case 'dualon':
    case 'dualoff':
      rr(ctx, -s * 0.4, -s * 0.12 - s * 0.24, s * 0.3, s * 0.3, s * 0.06);
      if (key === 'dualon') ctx.fill();
      else ctx.stroke();
      rr(ctx, s * 0.1, s * 0.06, s * 0.3, s * 0.3, s * 0.06);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Portal: a tall glowing gate. Back = rear arc + glyph, front = the near arc. */
function portalPart(key: string, front: boolean): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const col = PORTAL_COLORS[key] ?? '#ffffff';
    const cx = W / 2;
    const cy = H / 2;
    const rx = W * 0.32;
    const ry = H * 0.47;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = B * 0.35;
    if (!front) {
      // inner energy gradient
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
      g.addColorStop(0, `${col}88`);
      g.addColorStop(0.6, `${col}33`);
      g.addColorStop(1, `${col}00`);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      // back half of the rim (left side)
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.5, Math.PI * 1.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = B * 0.16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      portalGlyph(ctx, key, cx, cy, B * 0.7);
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = B * 0.2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = B * 0.06;
      ctx.stroke();
      // chevron studs on the rim
      for (const t of [-0.3, 0, 0.3]) {
        const a = t * Math.PI;
        const px = cx + Math.cos(a) * rx;
        const py = cy + Math.sin(a) * ry;
        ctx.beginPath();
        ctx.arc(px, py, B * 0.09, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
    }
    ctx.restore();
  };
}

export const SPEED_COLORS = ['#ffcf3d', '#5ad1ff', '#5bff7a', '#ff5fd2', '#ff4545'];

function speedPortal(level: number): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const col = SPEED_COLORS[level]!;
    const n = level + 1;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = B * 0.3;
    const span = W * 0.8;
    const step = span / (n + 1);
    for (let k = 0; k < n; k++) {
      const x = W * 0.1 + step * (k + 0.5);
      ctx.beginPath();
      ctx.moveTo(x, H * 0.18);
      ctx.lineTo(x + step * 0.9, H / 2);
      ctx.lineTo(x, H * 0.82);
      ctx.strokeStyle = col;
      ctx.lineWidth = B * 0.17;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = B * 0.06;
      ctx.stroke();
    }
    ctx.restore();
  };
}

// ---------------------------------------------------------------- orbs / pads / coin

export const ORB_COLORS: Record<string, string> = {
  jump: '#ff9f1c',
  small: '#ff7ad9',
  big: '#ff3b3b',
  gravity: '#39b6ff',
  flipjump: '#2ee6a6',
  slam: '#7b4bff',
  dash: '#e8f4ff',
};

function orb(key: string): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const col = ORB_COLORS[key]!;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.4;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = B * 0.3;
    // outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = B * 0.1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // core
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, r * 0.05, cx, cy, r * 0.75);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, col);
    g.addColorStop(1, key === 'slam' ? '#120830' : `${col}aa`);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = B * 0.035;
    ctx.stroke();
    // type marks
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = B * 0.06;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const s = r * 0.42;
    switch (key) {
      case 'small':
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'big':
        star(ctx, cx, cy, 4, s * 0.35, s * 0.95);
        ctx.fill();
        break;
      case 'gravity':
      case 'flipjump':
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.6, cy - s * 0.25);
        ctx.lineTo(cx, cy - s * 0.85);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.25);
        ctx.moveTo(cx - s * 0.6, cy + s * 0.25);
        ctx.lineTo(cx, cy + s * 0.85);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.25);
        ctx.stroke();
        if (key === 'flipjump') {
          ctx.beginPath();
          ctx.arc(cx, cy, s * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'slam':
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.6, cy - s * 0.2);
        ctx.lineTo(cx, cy + s * 0.5);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.2);
        ctx.stroke();
        break;
      case 'dash':
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.7, cy);
        ctx.lineTo(cx + s * 0.7, cy);
        ctx.moveTo(cx + s * 0.2, cy - s * 0.5);
        ctx.lineTo(cx + s * 0.7, cy);
        ctx.lineTo(cx + s * 0.2, cy + s * 0.5);
        ctx.strokeStyle = '#3a3f66';
        ctx.stroke();
        break;
      default:
        break;
    }
    // orbiting ticks
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r * 1.12, B * 0.035, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
    ctx.restore();
  };
}

export const PAD_COLORS: Record<string, string> = {
  jump: '#ff9f1c',
  small: '#ff7ad9',
  big: '#ff3b3b',
  gravity: '#39b6ff',
};

function pad(key: string): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const col = PAD_COLORS[key]!;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = B * 0.25;
    ctx.beginPath();
    ctx.moveTo(W * 0.04, H);
    ctx.bezierCurveTo(W * 0.15, H * 0.05, W * 0.85, H * 0.05, W * 0.96, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, col);
    g.addColorStop(1, `${col}99`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = B * 0.03;
    ctx.stroke();
    ctx.restore();
  };
}

export const COIN_COLOR = '#ffc93c';

function coin(ctx: Ctx, W: number, H: number, B: number): void {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.44;
  ctx.save();
  ctx.shadowColor = COIN_COLOR;
  ctx.shadowBlur = B * 0.3;
  // hexagonal chip
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.5, COIN_COLOR);
  g.addColorStop(1, '#c47a12');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = B * 0.05;
  ctx.lineJoin = 'round';
  ctx.stroke();
  star(ctx, cx, cy, 4, r * 0.18, r * 0.62, -Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#a35d00';
  ctx.lineWidth = B * 0.025;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- triggers (editor only)

export const TRIGGER_COLORS: Record<string, string> = {
  color: '#ff5fa2',
  move: '#4fd2ff',
  alpha: '#c9c9ff',
  rotate: '#ffb84f',
  pulse: '#ff4fd8',
  toggle: '#7dff6b',
  shake: '#ff6b4f',
};
const TRIGGER_LETTER: Record<string, string> = {
  color: 'C',
  move: 'M',
  alpha: 'A',
  rotate: 'R',
  pulse: 'P',
  toggle: 'T',
  shake: 'S',
};

function trigger(key: string): TexSpec['draw'] {
  return (ctx, W, H, B) => {
    const col = TRIGGER_COLORS[key]!;
    rr(ctx, W * 0.08, H * 0.08, W * 0.84, H * 0.84, B * 0.18);
    ctx.fillStyle = '#1a1033';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = B * 0.08;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `${Math.round(B * 0.56)}px "Lilita One", "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TRIGGER_LETTER[key]!, W / 2, H / 2 + B * 0.03);
  };
}

// ---------------------------------------------------------------- deco

const decoDraw: Record<string, TexSpec['draw']> = {
  ring: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.36, 0, Math.PI * 2);
    stroke(ctx, B * 0.08);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.2, 0, Math.PI * 2);
    stroke(ctx, B * 0.04, 0.5);
  },
  burst: (ctx, W, H, B) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(a) * W * 0.12, H / 2 + Math.sin(a) * H * 0.12);
      ctx.lineTo(W / 2 + Math.cos(a) * W * (i % 2 ? 0.32 : 0.46), H / 2 + Math.sin(a) * H * (i % 2 ? 0.32 : 0.46));
      stroke(ctx, B * 0.08, i % 2 ? 0.6 : 1);
    }
  },
  chevron: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(W * 0.25, H * 0.2);
    ctx.lineTo(W * 0.65, H * 0.5);
    ctx.lineTo(W * 0.25, H * 0.8);
    stroke(ctx, B * 0.12);
  },
  dots: (ctx, W, H, B) => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc(W * (0.2 + i * 0.3), H * (0.2 + j * 0.3), B * 0.06, 0, Math.PI * 2);
        fill(ctx, 0.8);
      }
    }
  },
  diamond: (ctx, W, H, B) => {
    poly(ctx, [[W / 2, H * 0.1], [W * 0.9, H / 2], [W / 2, H * 0.9], [W * 0.1, H / 2]]);
    fill(ctx, 0.25);
    stroke(ctx, B * 0.07);
  },
  zigzag: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(0, H * 0.7);
    for (let k = 0; k < 4; k++) {
      ctx.lineTo((W * (k + 0.5)) / 4, H * 0.3);
      ctx.lineTo((W * (k + 1)) / 4, H * 0.7);
    }
    stroke(ctx, B * 0.07);
  },
  glow: (ctx, W, H) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  bar: (ctx, W, H) => {
    rr(ctx, W * 0.15, 0, W * 0.7, H, W * 0.3);
    fill(ctx, 0.85);
  },
  tri: (ctx, W, H, B) => {
    poly(ctx, [[W * 0.1, H * 0.9], [W / 2, H * 0.1], [W * 0.9, H * 0.9]]);
    stroke(ctx, B * 0.07);
  },
  beatring: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.42, 0, Math.PI * 2);
    stroke(ctx, B * 0.1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(a) * W * 0.28, H / 2 + Math.sin(a) * H * 0.28, B * 0.07, 0, Math.PI * 2);
      fill(ctx, 0.8);
    }
  },
  cross: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(W * 0.25, H * 0.25);
    ctx.lineTo(W * 0.75, H * 0.75);
    ctx.moveTo(W * 0.75, H * 0.25);
    ctx.lineTo(W * 0.25, H * 0.75);
    stroke(ctx, B * 0.09);
  },
  bump: (ctx, W, H, B) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.quadraticCurveTo(W / 2, -H * 0.6, W, H);
    ctx.closePath();
    fill(ctx, 0.35);
    stroke(ctx, B * 0.05, 0.9);
  },
  fuzz: (ctx, W, H, B) => {
    ctx.beginPath();
    const n = 7;
    ctx.moveTo(0, H);
    for (let k = 0; k < n; k++) {
      const x = (W * (k + 0.5)) / n;
      ctx.lineTo(x, H * (k % 2 ? 0.35 : 0.05));
      ctx.lineTo((W * (k + 1)) / n, H);
    }
    ctx.closePath();
    fill(ctx, 0.7);
    stroke(ctx, B * 0.02, 0.9);
  },
  chain: (ctx, W, H, B) => {
    for (let k = 0; k < 3; k++) {
      rr(ctx, W * 0.2, (H * k) / 3 + H * 0.02, W * 0.6, H / 3 - H * 0.04, W * 0.3);
      stroke(ctx, B * 0.05, 0.9);
    }
  },
  square: (ctx, W, H, B) => {
    rr(ctx, W * 0.06, H * 0.06, W * 0.88, H * 0.88, B * 0.1);
    fill(ctx, 0.18);
    stroke(ctx, B * 0.04, 0.5);
  },
  arrow: (ctx, W, H, B) => {
    poly(ctx, [[W * 0.15, H * 0.38], [W * 0.55, H * 0.38], [W * 0.55, H * 0.18], [W * 0.88, H * 0.5], [W * 0.55, H * 0.82], [W * 0.55, H * 0.62], [W * 0.15, H * 0.62]]);
    fill(ctx, 0.85);
    stroke(ctx, B * 0.03);
  },
  eq: (ctx, W, H) => {
    const heights = [0.5, 0.85, 0.65, 0.95];
    heights.forEach((h, k) => {
      rr(ctx, W * (0.1 + k * 0.21), H * (1 - h), W * 0.15, H * h, W * 0.04);
      fill(ctx, 0.9);
    });
  },
  halo: (ctx, W, H) => {
    const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  },
  gear: (ctx, W, H, B) => {
    const cx = W / 2;
    const cy = H / 2;
    ctx.beginPath();
    const teeth = 10;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? W * 0.36 : W * 0.46;
      const a2 = a + Math.PI / (teeth * 2);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
    }
    ctx.closePath();
    fill(ctx, 0.2);
    stroke(ctx, B * 0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, W * 0.14, 0, Math.PI * 2);
    stroke(ctx, B * 0.06);
  },
  star: (ctx, W, H, B) => {
    star(ctx, W / 2, H / 2, 5, W * 0.18, W * 0.44);
    fill(ctx, 0.35);
    stroke(ctx, B * 0.05);
  },
};

// ---------------------------------------------------------------- particles

const particleDraw: Record<string, TexSpec> = {
  p_square: { w: 0.3, h: 0.3, draw: (ctx, W, H) => { ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H); } },
  p_circle: {
    w: 0.4, h: 0.4,
    draw: (ctx, W, H) => {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2);
      fill(ctx);
    },
  },
  p_glow: {
    w: 1, h: 1,
    draw: (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
  p_ring: {
    w: 2, h: 2, pad: 0.1,
    draw: (ctx, W, H, B) => {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, W * 0.46, 0, Math.PI * 2);
      stroke(ctx, B * 0.08);
    },
  },
  p_spark: {
    w: 0.6, h: 0.15,
    draw: (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      rr(ctx, 0, 0, W, H, H / 2);
      ctx.fill();
    },
  },
  white: { w: 0.25, h: 0.25, pad: 0, draw: (ctx, W, H) => { ctx.fillStyle = WHITE; ctx.fillRect(0, 0, W, H); } },
  p_line: {
    w: 4, h: 0.12, pad: 0,
    draw: (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.18, 'rgba(255,255,255,1)');
      g.addColorStop(0.82, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    },
  },
};

// ---------------------------------------------------------------- registry

export function allTextureSpecs(): Record<string, TexSpec> {
  const specs: Record<string, TexSpec> = {};
  const P = 0.1;
  const blockSizes: Record<string, [number, number]> = {
    block: [1, 1], brick: [1, 1], panel: [1, 1], grid: [1, 1], stud: [1, 1], plain: [1, 1], slab: [1, 0.5], pillar: [0.5, 1],
  };
  for (const [key, [w, h]] of Object.entries(blockSizes)) {
    specs[`${key}_fill`] = { w, h, pad: P, draw: blockFill() };
    specs[`${key}_line`] = { w, h, pad: P, draw: blockLine(patterns[key] ?? null, key === 'plain' ? 1.4 : 1) };
  }
  specs.outline_line = { w: 1, h: 1, pad: P, draw: blockLine(null, 1.2) };
  specs.slope45_fill = { w: 1, h: 1, pad: P, draw: slopeFill };
  specs.slope45_line = { w: 1, h: 1, pad: P, draw: slopeLine };
  specs.slope26_fill = { w: 2, h: 1, pad: P, draw: slopeFill };
  specs.slope26_line = { w: 2, h: 1, pad: P, draw: slopeLine };
  specs.spike_fill = { w: 1, h: 1, pad: P, draw: spikeFill };
  specs.spike_line = { w: 1, h: 1, pad: P, draw: spikeLine };
  specs.spikehalf_fill = { w: 1, h: 0.5, pad: P, draw: spikeFill };
  specs.spikehalf_line = { w: 1, h: 0.5, pad: P, draw: spikeLine };
  specs.spikelow_fill = { w: 1, h: 0.3, pad: P, draw: teethFill };
  specs.spikelow_line = { w: 1, h: 0.3, pad: P, draw: teethLine };
  for (const [key, size, teeth] of [['saw1', 1.5, 10], ['saw2', 2, 12], ['saw3', 3, 16]] as const) {
    specs[`${key}_fill`] = { w: size, h: size, pad: P, draw: sawFill(teeth) };
    specs[`${key}_line`] = { w: size, h: size, pad: P, draw: sawLine(teeth) };
  }
  for (const key of ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing']) {
    specs[`portal_${key}_back`] = { w: 1.4, h: 3, pad: 0.4, draw: portalPart(key, false) };
    specs[`portal_${key}_front`] = { w: 1.4, h: 3, pad: 0.4, draw: portalPart(key, true) };
  }
  for (const key of ['gravn', 'gravf', 'sizen', 'sizem', 'mirron', 'mirroff', 'dualon', 'dualoff']) {
    specs[`portal_${key}_back`] = { w: 1.2, h: 2.6, pad: 0.4, draw: portalPart(key, false) };
    specs[`portal_${key}_front`] = { w: 1.2, h: 2.6, pad: 0.4, draw: portalPart(key, true) };
  }
  for (let s = 0; s < 5; s++) specs[`speed${s}`] = { w: 1.4, h: 2, pad: 0.35, draw: speedPortal(s) };
  for (const key of Object.keys(ORB_COLORS)) specs[`orb_${key}`] = { w: 1, h: 1, pad: 0.35, draw: orb(key) };
  for (const key of Object.keys(PAD_COLORS)) specs[`pad_${key}`] = { w: 1, h: 0.3, pad: 0.3, draw: pad(key) };
  specs.coin = { w: 1.2, h: 1.2, pad: 0.35, draw: coin };
  for (const key of Object.keys(TRIGGER_COLORS)) specs[`trig_${key}`] = { w: 1, h: 1, pad: 0.05, draw: trigger(key) };
  const decoSizes: Record<string, [number, number]> = {
    ring: [1, 1], burst: [2, 2], chevron: [1, 1], dots: [1, 1], diamond: [1, 1], zigzag: [1, 0.5], glow: [2, 2], bar: [0.25, 1],
    tri: [1, 1], beatring: [2, 2], cross: [1, 1], bump: [1, 0.5], fuzz: [1, 0.4], chain: [0.5, 1], square: [1, 1], arrow: [1, 1],
    eq: [1, 1], halo: [3, 3], gear: [2, 2], star: [1, 1],
  };
  for (const [key, [w, h]] of Object.entries(decoSizes)) specs[`deco_${key}`] = { w, h, pad: P, draw: decoDraw[key]! };
  Object.assign(specs, particleDraw);
  return specs;
}
