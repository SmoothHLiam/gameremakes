import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import { allTextureSpecs, type Ctx, rr, type TexSpec } from './draw.ts';

export interface BankTexture {
  tex: Texture;
  /** Pixel size of the full texture including padding. */
  pw: number;
  ph: number;
  /** Pixels per block this texture was drawn at. */
  ppb: number;
}

const PAGE = 2048;
const GUTTER = 3;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Draws every object texture once and packs them into atlas pages, so the
 * world renders in very few draw calls. Built before a level starts.
 */
export class TextureBank {
  readonly ppb: number;
  private readonly map = new Map<string, BankTexture>();
  private readonly sources: CanvasSource[] = [];

  constructor(ppb: number) {
    this.ppb = ppb;
    this.build(allTextureSpecs());
  }

  /** The atlas pages, so they can be uploaded to the GPU ahead of time. */
  get pages(): readonly CanvasSource[] {
    return this.sources;
  }

  private build(specs: Record<string, TexSpec>): void {
    const B = this.ppb;
    const entries = Object.entries(specs).map(([key, spec]) => {
      const pad = Math.ceil((spec.pad ?? 0.1) * B);
      const W = Math.ceil(spec.w * B);
      const H = Math.ceil(spec.h * B);
      return { key, spec, pad, W, H, pw: W + pad * 2, ph: H + pad * 2 };
    });
    entries.sort((a, b) => b.ph - a.ph);
    let canvas = makeCanvas(PAGE, PAGE);
    let ctx = canvas.getContext('2d')!;
    let x = GUTTER;
    let y = GUTTER;
    let shelf = 0;
    const pending: Array<{ key: string; x: number; y: number; pw: number; ph: number; page: number }> = [];
    const pages: HTMLCanvasElement[] = [canvas];
    for (const e of entries) {
      if (x + e.pw + GUTTER > PAGE) {
        x = GUTTER;
        y += shelf + GUTTER;
        shelf = 0;
      }
      if (y + e.ph + GUTTER > PAGE) {
        canvas = makeCanvas(PAGE, PAGE);
        ctx = canvas.getContext('2d')!;
        pages.push(canvas);
        x = GUTTER;
        y = GUTTER;
        shelf = 0;
      }
      ctx.save();
      ctx.translate(x + e.pad, y + e.pad);
      e.spec.draw(ctx, e.W, e.H, B);
      ctx.restore();
      pending.push({ key: e.key, x, y, pw: e.pw, ph: e.ph, page: pages.length - 1 });
      x += e.pw + GUTTER;
      shelf = Math.max(shelf, e.ph);
    }
    for (const page of pages) {
      this.sources.push(new CanvasSource({ resource: page, autoGenerateMipmaps: true, scaleMode: 'linear' }));
    }
    for (const p of pending) {
      const tex = new Texture({ source: this.sources[p.page]!, frame: new Rectangle(p.x, p.y, p.pw, p.ph) });
      this.map.set(p.key, { tex, pw: p.pw, ph: p.ph, ppb: B });
    }
  }

  get(key: string): BankTexture {
    const t = this.map.get(key);
    if (t) return t;
    const fallback = this.map.get('white');
    if (!fallback) throw new Error(`missing texture ${key}`);
    return fallback;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  destroy(): void {
    for (const s of this.sources) s.destroy();
    this.map.clear();
  }
}

/** Standalone repeating texture (backgrounds / ground), drawn in greys for tinting. */
export function makeTileTexture(size: number, draw: (ctx: Ctx, S: number) => void): Texture {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const source = new CanvasSource({ resource: c, autoGenerateMipmaps: true, scaleMode: 'linear', addressMode: 'repeat' });
  return new Texture({ source });
}

/** Background patterns, one per `meta.bg` id. Values near white keep the channel color. */
export const BACKGROUNDS: Array<(ctx: Ctx, S: number) => void> = [
  // 0: big soft squares in a staggered lattice
  (ctx, S) => {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, S, S);
    const n = 4;
    const cell = S / n;
    for (let j = 0; j < n; j++) {
      const off = j % 2 ? cell / 2 : 0;
      for (let i = off ? -1 : 0; i < n; i++) {
        const ii = (i + n) % n;
        const shade = 200 + ((ii * 7 + j * 13) % 5) * 10;
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        rr(ctx, i * cell + off + cell * 0.06, j * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.12);
        ctx.fill();
      }
    }
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  },
  // 1: diamond lattice (tiles exactly: diamonds on a grid + half-offset grid)
  (ctx, S) => {
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, S, S);
    const n = 3;
    const c = S / n;
    const drawDiamond = (cx: number, cy: number, r: number, shade: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fill();
    };
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) {
        drawDiamond(i * c + c / 2, j * c + c / 2, c * 0.46, 236);
        drawDiamond(i * c, j * c, c * 0.2, 214);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = S * 0.008;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx = i * c + c / 2;
        const cy = j * c + c / 2;
        const r = c * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.stroke();
      }
    }
  },
  // 2: diagonal bands with rings
  (ctx, S) => {
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    for (let k = -4; k < 8; k++) {
      ctx.fillStyle = k % 2 ? '#e6e6e6' : '#cfcfcf';
      ctx.beginPath();
      const w = S / 4;
      ctx.moveTo(k * w, 0);
      ctx.lineTo(k * w + w, 0);
      ctx.lineTo(k * w + w - S, S);
      ctx.lineTo(k * w - S, S);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = S * 0.012;
    for (const [x, y, r] of [[0.25, 0.3, 0.12], [0.75, 0.75, 0.18], [0.8, 0.2, 0.06], [0.2, 0.85, 0.08]] as const) {
      ctx.beginPath();
      ctx.arc(x * S, y * S, r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  // 3: circuit grid
  (ctx, S) => {
    ctx.fillStyle = '#d2d2d2';
    ctx.fillRect(0, 0, S, S);
    const n = 8;
    const c = S / n;
    ctx.strokeStyle = '#e4e4e4';
    ctx.lineWidth = S * 0.006;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath();
      ctx.moveTo(i * c, 0);
      ctx.lineTo(i * c, S);
      ctx.moveTo(0, i * c);
      ctx.lineTo(S, i * c);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = S * 0.014;
    const path: Array<[number, number]> = [[1, 0], [1, 2], [3, 2], [3, 5], [6, 5], [6, 8]];
    ctx.beginPath();
    path.forEach(([x, y], i) => (i ? ctx.lineTo(x * c, y * c) : ctx.moveTo(x * c, y * c)));
    ctx.stroke();
    ctx.beginPath();
    [[0, 6], [2, 6], [2, 7], [5, 7], [5, 3], [8, 3]].forEach(([x, y], i) => (i ? ctx.lineTo(x! * c, y! * c) : ctx.moveTo(x! * c, y! * c)));
    ctx.stroke();
    ctx.fillStyle = '#f6f6f6';
    for (const [x, y] of [[3, 2], [6, 5], [2, 6], [5, 3]] as const) {
      ctx.beginPath();
      ctx.arc(x * c, y * c, c * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  },
];

/** Ground tile patterns (one block tall repeating square; tinted by the ground channel). */
export const GROUNDS: Array<(ctx: Ctx, S: number) => void> = [
  (ctx, S) => {
    ctx.fillStyle = '#d8d8d8';
    ctx.fillRect(0, 0, S, S);
    const m = S * 0.04;
    rr(ctx, m, m, S - m * 2, S - m * 2, S * 0.08);
    ctx.fillStyle = '#c4c4c4';
    ctx.fill();
    rr(ctx, S * 0.2, S * 0.2, S * 0.6, S * 0.6, S * 0.06);
    ctx.fillStyle = '#d0d0d0';
    ctx.fill();
  },
  (ctx, S) => {
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#dedede';
    ctx.beginPath();
    ctx.moveTo(0, S);
    ctx.lineTo(S / 2, 0);
    ctx.lineTo(S, S);
    ctx.closePath();
    ctx.fill();
  },
  (ctx, S) => {
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#c2c2c2';
    ctx.fillRect(0, 0, S / 2, S / 2);
    ctx.fillRect(S / 2, S / 2, S / 2, S / 2);
  },
];
