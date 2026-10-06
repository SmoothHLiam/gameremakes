/**
 * A small offline synthesizer. Pure TypeScript (no Web Audio), so songs can
 * be rendered in a Web Worker, in Node for tests, and always sound identical.
 *
 * Everything renders into stereo Float32Array buses; effects (delay, reverb,
 * sidechain ducking) run per bus, then a master soft clipper normalizes.
 */

export const SR = 44100;

export class Bus {
  readonly L: Float32Array;
  readonly R: Float32Array;
  readonly length: number;
  constructor(length: number) {
    this.length = length;
    this.L = new Float32Array(length);
    this.R = new Float32Array(length);
  }
}

/** Seeded PRNG (mulberry32) so noise is reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const SINE_N = 4096;
const SINE = new Float64Array(SINE_N + 1);
for (let i = 0; i <= SINE_N; i++) SINE[i] = Math.sin((2 * Math.PI * i) / SINE_N);

/** Table sine for phase in [0, 1). */
function fsin(ph: number): number {
  const x = ph * SINE_N;
  const i = x | 0;
  const f = x - i;
  return SINE[i]! + (SINE[i + 1]! - SINE[i]!) * f;
}

function polyblep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export type OscType = 'saw' | 'square' | 'tri' | 'sine' | 'noise' | 'pulse';

export interface OscSpec {
  type: OscType;
  /** Semitone offset. */
  semi?: number;
  /** Cents detune. */
  cents?: number;
  /** Unison voices and total spread in cents. */
  voices?: number;
  spread?: number;
  level?: number;
  /** Pulse width for 'pulse'. */
  pw?: number;
}

export interface Env {
  a: number;
  d: number;
  s: number;
  r: number;
}

export interface FilterSpec {
  type: 'lp' | 'hp' | 'bp';
  cutoff: number;
  /** 0..0.95 */
  res?: number;
  /** Envelope amount in Hz added to cutoff. */
  env?: number;
  envShape?: Env;
  /** 0..1 how much cutoff follows the note pitch. */
  keytrack?: number;
}

export interface Patch {
  osc: OscSpec[];
  amp: Env;
  filter?: FilterSpec;
  gain: number;
  pan?: number;
  /** Unison stereo width 0..1. */
  width?: number;
  vibrato?: { rate: number; cents: number; delay?: number };
  /** Pitch drop/rise at note start: semitones and time (s). */
  pitchEnv?: { semi: number; time: number };
  drive?: number;
}

function envAt(e: Env, t: number, noteOff: number): number {
  let v: number;
  if (t < e.a) v = e.a > 0 ? t / e.a : 1;
  else if (t < e.a + e.d) {
    const k = (t - e.a) / Math.max(1e-4, e.d);
    v = 1 + (e.s - 1) * (1 - (1 - k) * (1 - k));
  } else v = e.s;
  if (t > noteOff) {
    // value at note off, then exponential-ish release
    const vo = noteOff < e.a ? (e.a > 0 ? noteOff / e.a : 1) : noteOff < e.a + e.d ? 1 + (e.s - 1) * (1 - Math.pow(1 - (noteOff - e.a) / Math.max(1e-4, e.d), 2)) : e.s;
    const k = (t - noteOff) / Math.max(1e-4, e.r);
    v = k >= 1 ? 0 : vo * (1 - k) * (1 - k);
  }
  return v;
}

/** State-variable filter (TPT form), coefficients refreshed every 16 samples. */
class SVF {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 2;
  set(cutoff: number, res: number): void {
    const fc = Math.min(SR * 0.45, Math.max(20, cutoff));
    const g = Math.tan((Math.PI * fc) / SR);
    this.k = 2 - 2 * Math.min(0.97, Math.max(0, res));
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x: number, mode: 0 | 1 | 2): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return mode === 0 ? v2 : mode === 1 ? x - this.k * v1 - v2 : v1;
  }
}

/** Renders one synth note into a bus. */
export function renderNote(bus: Bus, start: number, dur: number, midi: number, vel: number, p: Patch, seed = 1): void {
  const s0 = Math.floor(start * SR);
  const total = Math.ceil((dur + p.amp.r) * SR);
  const end = Math.min(bus.length, s0 + total);
  if (s0 >= bus.length || end <= 0) return;
  const baseHz = midiToHz(midi);
  const rand = rng(seed * 7919 + midi * 131 + Math.floor(start * 1000));

  // Unison oscillators as parallel arrays (fast inner loop).
  const width = p.width ?? 0.6;
  let count = 0;
  for (const o of p.osc) count += Math.max(1, o.voices ?? 1);
  const type = new Uint8Array(count);
  const ratio = new Float64Array(count);
  const phase = new Float64Array(count);
  const level = new Float64Array(count);
  const gL = new Float64Array(count);
  const gR = new Float64Array(count);
  const pw = new Float64Array(count);
  let k = 0;
  for (const o of p.osc) {
    const n = Math.max(1, o.voices ?? 1);
    const spread = o.spread ?? 0;
    const code = o.type === 'saw' ? 0 : o.type === 'square' ? 1 : o.type === 'pulse' ? 1 : o.type === 'tri' ? 2 : o.type === 'sine' ? 3 : 4;
    for (let v = 0; v < n; v++, k++) {
      const off = n === 1 ? 0 : (v / (n - 1) - 0.5) * spread;
      const cents = (o.cents ?? 0) + off + (o.semi ?? 0) * 100;
      const pos = n === 1 ? 0 : (v / (n - 1) - 0.5) * 2 * width;
      const pan = Math.max(-1, Math.min(1, (p.pan ?? 0) + pos));
      type[k] = code;
      ratio[k] = Math.pow(2, cents / 1200);
      phase[k] = rand();
      level[k] = (o.level ?? 1) / Math.sqrt(n);
      gL[k] = Math.cos(((pan + 1) * Math.PI) / 4) * level[k]!;
      gR[k] = Math.sin(((pan + 1) * Math.PI) / 4) * level[k]!;
      pw[k] = o.type === 'pulse' ? (o.pw ?? 0.5) : 0.5;
    }
  }
  const fL = new SVF();
  const fR = new SVF();
  const f = p.filter;
  const mode: 0 | 1 | 2 = !f ? 0 : f.type === 'lp' ? 0 : f.type === 'hp' ? 1 : 2;
  const drive = p.drive ?? 0;
  const driveNorm = drive > 0 ? 1 / Math.tanh(1 + drive) : 1;
  const gain = p.gain * vel;
  const vib = p.vibrato;
  const pe = p.pitchEnv;
  const keyTrack = f?.keytrack ? Math.pow(baseHz / 261.63, f.keytrack) : 1;
  let hz = baseHz;
  const TWO_PI = 2 * Math.PI;
  let envA = 0;
  let envStep = 0;
  for (let i = s0 < 0 ? -s0 : 0, s = Math.max(0, s0); s < end; i++, s++) {
    if ((i & 15) === 0) {
      // envelope evaluated per 16-sample block, linearly interpolated inside it
      const t = i / SR;
      envA = envAt(p.amp, t, dur);
      const envB = envAt(p.amp, (i + 16) / SR, dur);
      envStep = (envB - envA) / 16;
      if (envA <= 0 && envB <= 0 && t > dur) break;
      hz = baseHz;
      if (vib && t > (vib.delay ?? 0)) hz *= Math.pow(2, (Math.sin(TWO_PI * vib.rate * t) * vib.cents) / 1200);
      if (pe && t < pe.time) hz *= Math.pow(2, (pe.semi * (1 - t / pe.time)) / 12);
      if (f) {
        let cut = f.cutoff * keyTrack;
        if (f.env && f.envShape) cut += f.env * envAt(f.envShape, t, dur);
        fL.set(cut, f.res ?? 0);
        fR.set(cut, f.res ?? 0);
      }
    }
    const baseDt = hz / SR;
    let L = 0;
    let R = 0;
    for (let o = 0; o < count; o++) {
      const dt = baseDt * ratio[o]!;
      let ph = phase[o]! + dt;
      if (ph >= 1) ph -= 1;
      phase[o] = ph;
      let v: number;
      switch (type[o]) {
        case 0:
          v = 2 * ph - 1 - polyblep(ph, dt);
          break;
        case 1: {
          const w = pw[o]!;
          v = (ph < w ? 1 : -1) + polyblep(ph, dt);
          let t2 = ph - w;
          if (t2 < 0) t2 += 1;
          v -= polyblep(t2, dt);
          break;
        }
        case 2:
          v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
          break;
        case 3:
          v = fsin(ph);
          break;
        default:
          v = rand() * 2 - 1;
      }
      L += v * gL[o]!;
      R += v * gR[o]!;
    }
    if (f) {
      L = fL.run(L, mode);
      R = fR.run(R, mode);
    }
    if (drive > 0) {
      L = Math.tanh(L * (1 + drive)) * driveNorm;
      R = Math.tanh(R * (1 + drive)) * driveNorm;
    }
    const g = envA * gain * (i < 32 ? i / 32 : 1);
    envA += envStep;
    bus.L[s]! += L * g;
    bus.R[s]! += R * g;
  }
}

// ---------------------------------------------------------------- drums

export function renderKick(bus: Bus, start: number, vel: number, opt: { p0?: number; p1?: number; decay?: number; punch?: number; drive?: number } = {}): void {
  const s0 = Math.floor(start * SR);
  const p0 = opt.p0 ?? 160;
  const p1 = opt.p1 ?? 46;
  const decay = opt.decay ?? 0.42;
  const len = Math.floor((decay + 0.05) * SR);
  const drive = opt.drive ?? 1.5;
  let ph = 0;
  const rand = rng(Math.floor(start * 997));
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    const f = p1 + (p0 - p1) * Math.exp(-t * 32);
    ph += f / SR;
    let v = Math.sin(2 * Math.PI * ph);
    const amp = Math.exp(-t / (decay * 0.42)) * (t < 0.002 ? t / 0.002 : 1);
    v *= amp;
    // click / punch
    if (t < 0.012) v += (rand() * 2 - 1) * (1 - t / 0.012) * 0.35 * (opt.punch ?? 1);
    v = Math.tanh(v * (1 + drive)) / Math.tanh(1 + drive);
    const out = v * vel * 0.95;
    bus.L[s0 + i]! += out;
    bus.R[s0 + i]! += out;
  }
}

export function renderSnare(bus: Bus, start: number, vel: number, opt: { tone?: number; decay?: number; bright?: number } = {}): void {
  const s0 = Math.floor(start * SR);
  const decay = opt.decay ?? 0.2;
  const len = Math.floor((decay * 2.2) * SR);
  const rand = rng(Math.floor(start * 1543) + 7);
  const hp = new SVF();
  hp.set(1200 * (opt.bright ?? 1), 0.1);
  const bp = new SVF();
  bp.set(5200 * (opt.bright ?? 1), 0.3);
  let ph = 0;
  const tone = opt.tone ?? 185;
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    const n = rand() * 2 - 1;
    let noise = hp.run(n, 1);
    noise = noise * 0.9 + bp.run(noise, 2) * 0.8;
    const nAmp = Math.exp(-t / (decay * 0.45));
    ph += (tone * (1 + 0.5 * Math.exp(-t * 60))) / SR;
    const body = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.045);
    const v = (noise * nAmp * 0.75 + body * 0.6) * vel;
    const sp = (rand() - 0.5) * 0.15;
    bus.L[s0 + i]! += v * (1 - sp);
    bus.R[s0 + i]! += v * (1 + sp);
  }
}

export function renderClap(bus: Bus, start: number, vel: number): void {
  const s0 = Math.floor(start * SR);
  const len = Math.floor(0.4 * SR);
  const rand = rng(Math.floor(start * 2111) + 3);
  const bp = new SVF();
  bp.set(1300, 0.45);
  const bpR = new SVF();
  bpR.set(1450, 0.45);
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    let env = 0;
    for (const off of [0, 0.011, 0.022]) if (t >= off) env = Math.max(env, Math.exp(-(t - off) / 0.006));
    if (t >= 0.031) env = Math.max(env, Math.exp(-(t - 0.031) / 0.11));
    const n = rand() * 2 - 1;
    const l = bp.run(n, 2) * env * vel * 2.4;
    const r = bpR.run(n, 2) * env * vel * 2.4;
    bus.L[s0 + i]! += l;
    bus.R[s0 + i]! += r;
  }
}

export function renderHat(bus: Bus, start: number, vel: number, open = false, pan = 0.15): void {
  const s0 = Math.floor(start * SR);
  const decay = open ? 0.22 : 0.035;
  const len = Math.floor(decay * 4 * SR);
  const rand = rng(Math.floor(start * 3011) + 11);
  const hp = new SVF();
  hp.set(7600, 0.2);
  // metallic partials
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
  const phs = ratios.map(() => rand());
  const base = 330;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    let m = 0;
    for (let k = 0; k < ratios.length; k++) {
      phs[k]! += (base * ratios[k]!) / SR;
      if (phs[k]! >= 1) phs[k]! -= 1;
      m += phs[k]! < 0.5 ? 1 : -1;
    }
    const n = (rand() * 2 - 1) * 0.6 + m * 0.08;
    const v = hp.run(n, 1) * Math.exp(-t / decay) * vel * 0.95;
    bus.L[s0 + i]! += v * gl;
    bus.R[s0 + i]! += v * gr;
  }
}

export function renderCrash(bus: Bus, start: number, vel: number, decay = 1.6): void {
  const s0 = Math.floor(start * SR);
  const len = Math.floor(decay * 3 * SR);
  const rand = rng(Math.floor(start * 4093) + 5);
  const hpL = new SVF();
  hpL.set(4200, 0.1);
  const hpR = new SVF();
  hpR.set(4600, 0.1);
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    const env = Math.exp(-t / (decay * 0.5)) * (t < 0.003 ? t / 0.003 : 1);
    bus.L[s0 + i]! += hpL.run(rand() * 2 - 1, 1) * env * vel * 0.4;
    bus.R[s0 + i]! += hpR.run(rand() * 2 - 1, 1) * env * vel * 0.4;
  }
}

/** Filtered-noise sweep: riser (up) or downlifter (down). */
export function renderSweep(bus: Bus, start: number, dur: number, vel: number, up: boolean): void {
  const s0 = Math.floor(start * SR);
  const len = Math.floor(dur * SR);
  const rand = rng(Math.floor(start * 577) + 13);
  const fL = new SVF();
  const fR = new SVF();
  let ph = 0;
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / len;
    const k = up ? t : 1 - t;
    if ((i & 15) === 0) {
      const cut = 300 * Math.pow(40, k);
      fL.set(cut, 0.55);
      fR.set(cut * 1.05, 0.55);
    }
    const amp = (up ? t * t : (1 - t) * (1 - t)) * vel * 0.5;
    ph += (220 * Math.pow(4, k)) / SR;
    const tone = Math.sin(2 * Math.PI * ph) * 0.15;
    bus.L[s0 + i]! += (fL.run(rand() * 2 - 1, 2) + tone) * amp;
    bus.R[s0 + i]! += (fR.run(rand() * 2 - 1, 2) + tone) * amp;
  }
}

/** Low boom for drops. */
export function renderImpact(bus: Bus, start: number, vel: number): void {
  const s0 = Math.floor(start * SR);
  const len = Math.floor(1.6 * SR);
  let ph = 0;
  const rand = rng(Math.floor(start * 911));
  const lp = new SVF();
  lp.set(900, 0.1);
  for (let i = 0; i < len && s0 + i < bus.length; i++) {
    if (s0 + i < 0) continue;
    const t = i / SR;
    ph += (55 * (1 + 1.5 * Math.exp(-t * 8))) / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.5) + lp.run(rand() * 2 - 1, 0) * Math.exp(-t / 0.25) * 0.5;
    bus.L[s0 + i]! += v * vel * 0.8;
    bus.R[s0 + i]! += v * vel * 0.8;
  }
}

// ---------------------------------------------------------------- effects

/** Ping-pong delay, in place. */
export function applyDelay(bus: Bus, time: number, feedback: number, mix: number, damp = 0.3): void {
  const d = Math.max(1, Math.floor(time * SR));
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  let w = 0;
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < bus.length; i++) {
    const dl = bl[w]!;
    const dr = br[w]!;
    lpL += (dl - lpL) * (1 - damp);
    lpR += (dr - lpR) * (1 - damp);
    const inL = bus.L[i]!;
    const inR = bus.R[i]!;
    bl[w] = inR * 0.7 + lpR * feedback;
    br[w] = inL * 0.7 + lpL * feedback;
    bus.L[i] = inL + dl * mix;
    bus.R[i] = inR + dr * mix;
    w = w + 1 === d ? 0 : w + 1;
  }
}

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS = [556, 441, 341, 225];

/** Freeverb-style reverb: returns a new wet bus from the input (send) bus. */
export function reverb(input: Bus, room = 0.82, damp = 0.25, wet = 0.3): Bus {
  const out = new Bus(input.length);
  const scale = SR / 44100;
  for (let ch = 0; ch < 2; ch++) {
    const x = ch === 0 ? input.L : input.R;
    const y = ch === 0 ? out.L : out.R;
    const spread = ch === 0 ? 0 : 23;
    const combs = COMBS.map((c) => ({ buf: new Float32Array(Math.floor((c + spread) * scale)), i: 0, f: 0 }));
    const aps = ALLPASS.map((a) => ({ buf: new Float32Array(Math.floor((a + spread) * scale)), i: 0 }));
    for (let n = 0; n < x.length; n++) {
      const inp = x[n]! * 0.015;
      let acc = 0;
      for (const c of combs) {
        const o = c.buf[c.i]!;
        c.f = o * (1 - damp) + c.f * damp;
        c.buf[c.i] = inp + c.f * room;
        if (++c.i >= c.buf.length) c.i = 0;
        acc += o;
      }
      for (const a of aps) {
        const b = a.buf[a.i]!;
        a.buf[a.i] = acc + b * 0.5;
        acc = b - acc;
        if (++a.i >= a.buf.length) a.i = 0;
      }
      y[n] = acc * wet;
    }
  }
  return out;
}

/** Sidechain-style ducking driven by trigger times (seconds). */
export function applyDuck(bus: Bus, triggers: number[], depth: number, release: number): void {
  const sorted = [...triggers].sort((a, b) => a - b);
  let k = 0;
  let last = -1e9;
  for (let i = 0; i < bus.length; i++) {
    const t = i / SR;
    while (k < sorted.length && sorted[k]! <= t) last = sorted[k++]!;
    const e = t - last;
    let g = 1;
    if (e >= 0 && e < release) {
      const x = e / release;
      g = 1 - depth * (1 - x) * (1 - x);
    }
    bus.L[i]! *= g;
    bus.R[i]! *= g;
  }
}

export function addInto(dst: Bus, src: Bus, gain = 1): void {
  for (let i = 0; i < dst.length; i++) {
    dst.L[i]! += src.L[i]! * gain;
    dst.R[i]! += src.R[i]! * gain;
  }
}

/** Highpass DC removal, soft clip and normalize to the target peak. */
export function master(bus: Bus, peak = 0.9): void {
  let xl = 0;
  let yl = 0;
  let xr = 0;
  let yr = 0;
  const a = 0.9995;
  let max = 1e-9;
  for (let i = 0; i < bus.length; i++) {
    const l = bus.L[i]!;
    const r = bus.R[i]!;
    yl = l - xl + a * yl;
    xl = l;
    yr = r - xr + a * yr;
    xr = r;
    bus.L[i] = yl;
    bus.R[i] = yr;
    max = Math.max(max, Math.abs(yl), Math.abs(yr));
  }
  // gain into a gentle soft clipper so peaks are tamed but transients survive
  const pre = 1.25 / max;
  let max2 = 1e-9;
  for (let i = 0; i < bus.length; i++) {
    const l = Math.tanh(bus.L[i]! * pre);
    const r = Math.tanh(bus.R[i]! * pre);
    bus.L[i] = l;
    bus.R[i] = r;
    max2 = Math.max(max2, Math.abs(l), Math.abs(r));
  }
  const g = peak / max2;
  for (let i = 0; i < bus.length; i++) {
    bus.L[i]! *= g;
    bus.R[i]! *= g;
  }
}
