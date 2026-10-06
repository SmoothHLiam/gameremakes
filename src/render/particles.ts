import { Container, Sprite } from 'pixi.js';
import type { TextureBank } from './textures.ts';

interface Particle {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  rot: number;
  vrot: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
}

export interface EmitOptions {
  tex?: string;
  x: number;
  y: number;
  count?: number;
  speed?: [number, number];
  angle?: [number, number];
  life?: [number, number];
  size?: [number, number];
  endSize?: number;
  alpha?: number;
  endAlpha?: number;
  gravity?: number;
  drag?: number;
  tint?: number | number[];
  spin?: number;
  add?: boolean;
  spread?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Pooled, render-time-only particles in world units (y up). */
export class Particles {
  readonly layer = new Container();
  private readonly bank: TextureBank;
  private readonly live: Particle[] = [];
  private readonly pool: Sprite[] = [];
  reduced = false;
  private readonly max = 1500;

  constructor(bank: TextureBank) {
    this.bank = bank;
  }

  emit(o: EmitOptions): void {
    let count = o.count ?? 10;
    if (this.reduced) count = Math.ceil(count / 4);
    const tex = this.bank.get(o.tex ?? 'p_square');
    const scaleBase = 30 / tex.ppb;
    for (let i = 0; i < count && this.live.length < this.max; i++) {
      const s = this.pool.pop() ?? new Sprite();
      s.texture = tex.tex;
      s.anchor.set(0.5);
      s.blendMode = o.add ? 'add' : 'normal';
      const tint = Array.isArray(o.tint) ? o.tint[i % o.tint.length]! : (o.tint ?? 0xffffff);
      s.tint = tint;
      s.visible = true;
      if (!s.parent) this.layer.addChild(s);
      const ang = (rand(o.angle?.[0] ?? 0, o.angle?.[1] ?? 360) * Math.PI) / 180;
      const sp = rand(o.speed?.[0] ?? 40, o.speed?.[1] ?? 160);
      const size = rand(o.size?.[0] ?? 0.6, o.size?.[1] ?? 1.2) * scaleBase;
      const spread = o.spread ?? 0;
      const p: Particle = {
        s,
        x: o.x + rand(-spread, spread),
        y: o.y + rand(-spread, spread),
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        g: o.gravity ?? 0,
        drag: o.drag ?? 0,
        life: 0,
        max: rand(o.life?.[0] ?? 0.3, o.life?.[1] ?? 0.7),
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() * 2 - 1) * (o.spin ?? 0),
        s0: size,
        s1: size * (o.endSize ?? 0),
        a0: o.alpha ?? 1,
        a1: o.endAlpha ?? 0,
      };
      this.live.push(p);
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const p = this.live[i]!;
      p.life += dt;
      if (p.life >= p.max) {
        p.s.visible = false;
        this.pool.push(p.s);
        continue;
      }
      const t = p.life / p.max;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.s.position.set(p.x, -p.y);
      p.s.rotation = p.rot;
      const sc = p.s0 + (p.s1 - p.s0) * t;
      p.s.scale.set(sc);
      p.s.alpha = p.a0 + (p.a1 - p.a0) * t;
      this.live[w++] = p;
    }
    this.live.length = w;
  }

  clear(): void {
    for (const p of this.live) {
      p.s.visible = false;
      this.pool.push(p.s);
    }
    this.live.length = 0;
  }

  get count(): number {
    return this.live.length;
  }
}
