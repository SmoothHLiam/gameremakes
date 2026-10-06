/**
 * Deterministic math for the simulation.
 *
 * `Math.sin`, `Math.cos`, `Math.pow` etc. are not required by the JS spec to be
 * bit-identical across engines. Basic arithmetic and `Math.sqrt` are (IEEE-754),
 * so everything that can influence the simulation is built from those.
 */

const DEG = Math.PI / 180;

/** Taylor series for sin on [-π/4, π/4] (error < 1e-12). */
function sinPoly(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))));
}

/** Taylor series for cos on [-π/4, π/4] (error < 1e-12). */
function cosPoly(x: number): number {
  const x2 = x * x;
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 / 479001600)))));
}

/** Deterministic sine of an angle in degrees. */
export function dsinDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  // Reduce to [-45, 45] around the nearest quadrant.
  const q = Math.floor((d + 45) / 90);
  const r = (d - q * 90) * DEG;
  switch (q & 3) {
    case 0: return sinPoly(r);
    case 1: return cosPoly(r);
    case 2: return -sinPoly(r);
    default: return -cosPoly(r);
  }
}

/** Deterministic cosine of an angle in degrees. */
export function dcosDeg(deg: number): number {
  return dsinDeg(deg + 90);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------- easing

export type EasingId =
  | 'l'
  | 'qi' | 'qo' | 'qio'
  | 'ci' | 'co' | 'cio'
  | 'si' | 'so' | 'sio'
  | 'bi' | 'bo' | 'bio'
  | 'bno';

export const EASING_NAMES: Record<EasingId, string> = {
  l: 'Linear',
  qi: 'Quad in',
  qo: 'Quad out',
  qio: 'Quad in-out',
  ci: 'Cubic in',
  co: 'Cubic out',
  cio: 'Cubic in-out',
  si: 'Sine in',
  so: 'Sine out',
  sio: 'Sine in-out',
  bi: 'Back in',
  bo: 'Back out',
  bio: 'Back in-out',
  bno: 'Bounce out',
};

const BACK = 1.70158;
const BACK2 = BACK * 1.525;

function bounceOut(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) {
    const u = t - 1.5 / d;
    return n * u * u + 0.75;
  }
  if (t < 2.5 / d) {
    const u = t - 2.25 / d;
    return n * u * u + 0.9375;
  }
  const u = t - 2.625 / d;
  return n * u * u + 0.984375;
}

/** Deterministic easing. `t` is clamped to [0, 1]. */
export function ease(id: EasingId | undefined, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (id) {
    case 'qi': return t * t;
    case 'qo': return t * (2 - t);
    case 'qio': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'ci': return t * t * t;
    case 'co': {
      const u = t - 1;
      return u * u * u + 1;
    }
    case 'cio': {
      if (t < 0.5) return 4 * t * t * t;
      const u = 2 * t - 2;
      return 0.5 * u * u * u + 1;
    }
    case 'si': return 1 - dcosDeg(t * 90);
    case 'so': return dsinDeg(t * 90);
    case 'sio': return 0.5 - 0.5 * dcosDeg(t * 180);
    case 'bi': return t * t * ((BACK + 1) * t - BACK);
    case 'bo': {
      const u = t - 1;
      return u * u * ((BACK + 1) * u + BACK) + 1;
    }
    case 'bio': {
      const u = t * 2;
      if (u < 1) return 0.5 * (u * u * ((BACK2 + 1) * u - BACK2));
      const w = u - 2;
      return 0.5 * (w * w * ((BACK2 + 1) * w + BACK2) + 2);
    }
    case 'bno': return bounceOut(t);
    default: return t;
  }
}

/** Exact tan for the dash-orb angles we allow (multiples of 15°), via sqrt only. */
const SQRT3 = Math.sqrt(3);
const TAN15: Record<number, number> = {
  0: 0,
  15: 2 - SQRT3,
  30: 1 / SQRT3,
  45: 1,
  60: SQRT3,
  75: 2 + SQRT3,
};

/** tan of an angle snapped to the nearest 15°, clamped to ±maxDeg. */
export function tanSnapped15(deg: number, maxDeg: number): number {
  let a = Math.round(deg / 15) * 15;
  if (a > maxDeg) a = Math.floor(maxDeg / 15) * 15;
  if (a < -maxDeg) a = -Math.floor(maxDeg / 15) * 15;
  const v = TAN15[Math.abs(a)] ?? 0;
  return a < 0 ? -v : v;
}

/** Small deterministic PRNG (mulberry32) for anything seeded. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
