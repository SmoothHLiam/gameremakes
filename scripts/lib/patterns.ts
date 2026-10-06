/**
 * Section generators for the level composer. Each one decides inputs on the
 * beat grid, places structure, reads the exact trajectory from the sim and
 * then builds hazards around it.
 */
import { MODE_KEYS, type ModeKey } from '../../src/core/objects.ts';
import * as P from '../../src/core/physics.ts';
import { B, type Frame, type LevelComposer } from './composer.ts';

const modeIndex = (m: ModeKey) => MODE_KEYS.indexOf(m);

export type CubeKind = 'spike' | 'platform' | 'pad' | 'orb';

/**
 * Sections never commit all the way to their end beat: the next section's
 * portals are placed a few ticks before that beat and must lie ahead of the
 * committed history, or the composed run and a fresh run would diverge.
 */
const SECTION_TAIL = 60;

function endSection(c: LevelComposer, b1: number): void {
  c.commit(Math.max(c.cursorTick, c.tickOf(b1) - SECTION_TAIL));
}

/** Switch speed / mode at the start of a section (portals placed so they're hit on the beat). */
export function enter(c: LevelComposer, beat: number, mode: ModeKey, speed?: number, height?: number): void {
  const t = c.tickOf(beat);
  c.commit(Math.max(c.cursorTick, t - 40));
  const f = c.predict(t);
  if (speed !== undefined && f.speed !== speed) {
    c.speedPortal(t - 24, speed);
  }
  // Only the flip-based modes keep flipped gravity; everything else starts upright
  // (a flipped cube would fall into the sky, a flipped ship has inverted controls).
  if (mode !== 'ball' && mode !== 'spider' && mode !== 'swing' && f.g.some((g) => g === -1)) c.portal(t - 12, 'portal_gravn');
  if (f.mode !== modeIndex(mode)) c.modePortal(t, mode, height);
}

function pick<T extends string>(c: LevelComposer, weights: Partial<Record<T, number>>, fallback: T): T {
  let total = 0;
  for (const v of Object.values(weights) as number[]) total += v;
  let r = c.rand() * total;
  for (const [k, v] of Object.entries(weights) as Array<[T, number]>) {
    r -= v;
    if (r <= 0) return k;
  }
  return fallback;
}

/** Contiguous runs inside a sorted list of integers. */
function runs(cells: number[]): number[][] {
  const out: number[][] = [];
  for (const k of cells) {
    const last = out[out.length - 1];
    if (last && k === last[last.length - 1]! + 1) last.push(k);
    else out.push([k]);
  }
  return out;
}

/** Chooses up to `max` spike cells from the safe run nearest the apex x. */
function chooseSpikes(c: LevelComposer, cells: number[], apexX: number, max: number): number[] {
  const rs = runs(cells);
  if (!rs.length) return [];
  const apexCell = Math.floor(apexX / B);
  rs.sort((a, b) => Math.abs(mid(a) - apexCell) - Math.abs(mid(b) - apexCell));
  const run = rs[0]!;
  const n = Math.max(1, Math.min(max, run.length, 1 + Math.floor(c.rand() * max)));
  // center the chosen spikes on the apex inside the run
  let start = Math.round(apexCell - (n - 1) / 2);
  start = Math.max(run[0]!, Math.min(run[run.length - 1]! - n + 1, start));
  return Array.from({ length: n }, (_, i) => start + i);
}

const mid = (a: number[]) => (a[0]! + a[a.length - 1]!) / 2;

function apexOf(frames: Frame[], p = 0): Frame | undefined {
  let best: Frame | undefined;
  for (const f of frames) if (!best || f.bottom[p]! > best.bottom[p]!) best = f;
  return best;
}

/** Cells (on the ground row of the current floor) that are supported, so spikes never float. */
function supported(c: LevelComposer, k: number, floorY: number): boolean {
  if (floorY < 1) return true;
  const row = Math.round(floorY / B) - 1;
  return c.solidCells.has(`${k},${row}`);
}

// ---------------------------------------------------------------- cube

export interface CubeOpts {
  speed?: number;
  /** Explicit event beats (absolute) with optional kinds. */
  events?: Array<number | [number, CubeKind]>;
  density?: number;
  /** Override event weights. */
  kinds?: Partial<Record<CubeKind, number>>;
  /** Minimum beats between events. */
  spacing?: number;
  /** Beats at the start with no events (a breather; also leaves room for a secret coin). */
  calm?: number;
}

export function cube(c: LevelComposer, b0: number, b1: number, o: CubeOpts = {}): void {
  enter(c, b0, 'cube', o.speed);
  const t = c.tuning;
  const step = t.halfBeats ? 0.5 : 1;
  const air = (2 * P.CUBE_JUMP_VELOCITY) / P.CUBE_GRAVITY;
  const airBeats = air / c.spb;
  const spacing = o.spacing ?? Math.ceil((airBeats + 0.15) / step) * step;
  const weights: Partial<Record<CubeKind, number>> = o.kinds ?? { spike: 1, platform: t.platforms, pad: t.pads, orb: t.orbs };
  let events: Array<[number, CubeKind | null]>;
  if (o.events) {
    events = o.events.map((e) => (Array.isArray(e) ? [e[0], e[1]] : [e, null]));
  } else {
    // musical phrasing: each bar picks one of the tuning's rhythm patterns
    events = [];
    let last = -Infinity;
    const density = o.density ?? 1;
    for (let barStart = Math.floor(b0 / 4) * 4; barStart < b1; barStart += 4) {
      const pattern = t.bars[Math.floor(c.rand() * t.bars.length)]!;
      if (c.rand() > Math.min(1, density + 0.25)) continue;
      for (const off of pattern) {
        const b = barStart + off;
        if (b < b0 + 1 + (o.calm ?? 0) || b >= b1 - 0.75) continue;
        if (b - last < spacing) continue;
        events.push([b, null]);
        last = b;
      }
    }
    void step;
  }
  let lastKind: CubeKind | null = null;
  for (const [beat, forced] of events) {
    const tE = c.tickOf(beat);
    if (tE <= c.cursorTick + 2) continue;
    c.commit(tE - 1);
    const f = c.frameAt(c.cursorTick);
    if (f.mode !== 0 || !f.onGround[0] || f.g[0] !== 1) continue;
    let kind = forced ?? pick(c, weights, 'spike');
    // pads and orb chains need room before the next event
    if (kind === 'platform' && lastKind === 'platform') kind = 'spike';
    lastKind = kind;
    cubeEvent(c, kind, tE, f);
  }
  endSection(c, b1);
}

function cubeEvent(c: LevelComposer, kind: CubeKind, tE: number, f: Frame): void {
  const t = c.tuning;
  const floor = f.bottom[0]!;
  const row = Math.round(floor / B);
  const airTicks = Math.ceil(((2 * P.CUBE_JUMP_VELOCITY) / P.CUBE_GRAVITY) * P.TICK_RATE);
  if (kind === 'pad') {
    const padX = (f.x + f.halfW + 16) / B;
    c.put('pad_jump', padX, row + 0.15);
    const r = c.probe(tE + airTicks * 2 + 40);
    const airborne = r.frames.filter((fr) => !fr.onGround[0] && fr.tick > tE);
    const land = r.frames.find((fr) => fr.tick > tE + 20 && fr.onGround[0]);
    const cells = c.safeSpikeCells(airborne, floor).filter((k) => supported(c, k, floor) && k * B > padX * B + 20);
    const apex = apexOf(airborne);
    if (apex) for (const k of chooseSpikes(c, cells, apex.x, t.maxSpikes + 2)) c.cell('spike', k, row, {}, true);
    void land;
    return;
  }
  if (kind === 'orb') {
    c.tap(tE);
    const probe1 = c.probe(tE + airTicks + 10);
    // second press half a beat later, while airborne
    const delay = Math.round(c.spb * P.TICK_RATE * (c.spb < 0.42 ? 1 : 0.5));
    const tO = tE + delay;
    const fo = probe1.frames.find((fr) => fr.tick === tO);
    if (!fo || fo.onGround[0] || fo.bottom[0]! - floor < 18) {
      cubeSpikes(c, probe1.frames, tE, floor, row);
      return;
    }
    c.put('orb_jump', (fo.x + 16) / B, fo.y[0]! / B);
    c.tap(tO);
    const r = c.probe(tO + airTicks + 40);
    const airborne = r.frames.filter((fr) => !fr.onGround[0] && fr.tick > tE);
    cubeSpikes(c, airborne, tE, floor, row, t.maxSpikes + 2);
    return;
  }
  if (kind === 'platform') {
    c.tap(tE);
    const r = c.probe(tE + airTicks + 30);
    const apex = apexOf(r.frames.filter((fr) => fr.tick > tE));
    if (!apex || apex.bottom[0]! - floor < B + 10) {
      cubeSpikes(c, r.frames, tE, floor, row);
      return;
    }
    const after = r.frames.filter((fr) => fr.tick > apex.tick);
    const land = after.find((fr) => fr.bottom[0]! <= floor + B + 3);
    if (!land) {
      cubeSpikes(c, r.frames, tE, floor, row);
      return;
    }
    let k0 = Math.floor((land.x + land.halfW - 5) / B);
    // make sure the front edge passes the platform corner above it
    for (let guard = 0; guard < 3; guard++) {
      const edge = k0 * B;
      const pass = r.frames.find((fr) => fr.x + fr.halfW >= edge && fr.tick > tE);
      if (pass && pass.bottom[0]! >= floor + B - 5) break;
      k0++;
    }
    const len = 3 + Math.floor(c.rand() * 4);
    for (let k = k0; k < k0 + len; k++) {
      for (let r2 = 0; r2 <= row; r2++) {
        c.cell(c.blockStyle, k, r2, c.glow && r2 === row ? { glow: 1 } : {});
        c.solidCells.add(`${k},${r2}`);
      }
    }
    // spikes under the jump before the platform
    const preFrames = r.frames.filter((fr) => fr.tick > tE && fr.tick <= land.tick);
    const cells = c.safeSpikeCells(preFrames, floor).filter((k) => k < k0 - 1 && supported(c, k, floor));
    if (apex) for (const k of chooseSpikes(c, cells, apex.x, Math.min(2, t.maxSpikes))) c.cell('spike', k, row, {}, true);
    return;
  }
  c.tap(tE);
  const r = c.probe(tE + airTicks + 30);
  cubeSpikes(c, r.frames, tE, floor, row);
}

function cubeSpikes(c: LevelComposer, frames: Frame[], tE: number, floor: number, row: number, max = c.tuning.maxSpikes): void {
  const airborne = frames.filter((fr) => fr.tick > tE && !fr.onGround[0]);
  // only the part of the flight that stays above this floor
  const cells = c.safeSpikeCells(airborne, floor).filter((k) => supported(c, k, floor));
  const apex = apexOf(airborne);
  if (!apex) return;
  for (const k of chooseSpikes(c, cells, apex.x, max)) c.cell(row === 0 || c.rand() < 0.8 ? 'spike' : 'spike_half', k, row, {}, true);
}

// ---------------------------------------------------------------- robot

export function robot(c: LevelComposer, b0: number, b1: number, o: { speed?: number; density?: number; calm?: number } = {}): void {
  enter(c, b0, 'robot', o.speed);
  const t = c.tuning;
  let last = -Infinity;
  const step = t.halfBeats ? 0.5 : 1;
  for (let b = b0 + 1 + (o.calm ?? 0); b < b1 - 1; b += step) {
    if (b - last < 1.5) continue;
    if (c.rand() > (o.density ?? t.density)) continue;
    const tE = c.tickOf(b);
    if (tE <= c.cursorTick + 2) continue;
    c.commit(tE - 1);
    const f = c.frameAt(c.cursorTick);
    if (f.mode !== modeIndex('robot') || !f.onGround[0] || f.g[0] !== 1) continue;
    last = b;
    const floor = f.bottom[0]!;
    const row = Math.round(floor / B);
    // hold length on the musical grid: an eighth, a quarter or a dotted quarter
    const holdBeats = [0.06, 0.25, 0.5][Math.floor(c.rand() * 3)]!;
    const holdTicks = Math.max(2, Math.round(holdBeats * c.spb * P.TICK_RATE));
    c.hold(tE, tE + holdTicks);
    const r = c.probe(tE + holdTicks + 220);
    const airborne = r.frames.filter((fr) => fr.tick > tE && !fr.onGround[0]);
    const apex = apexOf(airborne);
    if (!apex) continue;
    const height = apex.bottom[0]! - floor;
    if (height > 2.2 * B && c.rand() < 0.6) {
      // tall jump onto a 2-high platform
      const after = airborne.filter((fr) => fr.tick > apex.tick);
      const land = after.find((fr) => fr.bottom[0]! <= floor + 2 * B + 3);
      if (land) {
        const k0 = Math.floor((land.x + land.halfW - 5) / B) + 1;
        const pass = r.frames.find((fr) => fr.x + fr.halfW >= k0 * B && fr.tick > tE);
        if (pass && pass.bottom[0]! >= floor + 2 * B - 4) {
          const len = 3 + Math.floor(c.rand() * 3);
          for (let k = k0; k < k0 + len; k++) {
            for (let r2 = 0; r2 <= row + 1; r2++) {
              c.cell(c.blockStyle, k, r2, c.glow && r2 === row + 1 ? { glow: 1 } : {});
              c.solidCells.add(`${k},${r2}`);
            }
          }
          continue;
        }
      }
    }
    const cells = c.safeSpikeCells(airborne, floor).filter((k) => supported(c, k, floor));
    for (const k of chooseSpikes(c, cells, apex.x, t.maxSpikes + (height > 2 * B ? 1 : 0))) c.cell('spike', k, row, {}, true);
  }
  endSection(c, b1);
}

// ---------------------------------------------------------------- flying modes

export interface FlyOpts {
  speed?: number;
  gap?: number;
  /** Beats between obstacle columns. */
  every?: number;
  /** Target path amplitude (fraction of the play area). */
  amp?: number;
  height?: number;
}

/** Ship / UFO / swing: follow a musical target path, then build pillars around the actual path. */
export function fly(c: LevelComposer, b0: number, b1: number, mode: 'ship' | 'ufo' | 'swing', o: FlyOpts = {}): void {
  enter(c, b0, mode, o.speed, o.height);
  const t0 = c.tickOf(b0);
  c.commit(t0 + 2);
  const f0 = c.frameAt(c.cursorTick);
  const lo = f0.lo;
  const hi = f0.hi;
  const H = hi - lo;
  const amp = (o.amp ?? 0.28) * H;
  const phase = c.rand() * Math.PI * 2;
  const target = (beat: number) => {
    const bar = Math.floor((beat - b0) / 4);
    const wobble = Math.sin(((beat - b0) / 8) * Math.PI * 2 + phase) * amp;
    const stepUp = ((bar * 7919) % 5) / 4 - 0.5;
    return lo + H / 2 + wobble + stepUp * amp * 0.6;
  };
  const dec = mode === 'ship' ? 0.5 : 0.5;
  for (let b = b0 + 0.5; b < b1; b += dec) {
    const td = c.tickOf(b);
    const tn = c.tickOf(b + dec);
    const f = c.predict(td);
    if (f.mode !== modeIndex(mode)) break;
    const y = f.y[0]!;
    const goal = target(b + dec);
    if (mode === 'ship') {
      const vy = (c.predict(td + 1).y[0]! - y) * P.TICK_RATE;
      const predicted = y + vy * dec * c.spb * 0.6;
      if (predicted < goal) c.hold(td, Math.max(td + 2, tn - 1));
    } else if (mode === 'ufo') {
      if (y < goal - 6) c.tap(td, 4);
    } else {
      // swing: flip toward the target side
      const g = f.g[0]!;
      const vy = (c.predict(td + 1).y[0]! - y) * P.TICK_RATE;
      const wantUp = y + vy * 0.18 < goal;
      if ((wantUp && g === 1) || (!wantUp && g === -1)) c.tap(td, 4);
    }
  }
  const t1 = c.tickOf(b1);
  const r = c.probe(t1);
  pillars(c, r.frames, b0 + 1, b1 - 0.5, o.every ?? 2, (o.gap ?? c.tuning.flyGap) * B);
  endSection(c, b1);
}

/** Obstacle columns that leave `gap` units of clearance around the actual path. */
function pillars(c: LevelComposer, frames: Frame[], fromBeat: number, toBeat: number, every: number, gap: number, width = 1): void {
  const byTick = new Map(frames.map((f) => [f.tick, f]));
  for (let b = fromBeat; b < toBeat; b += every) {
    const f = byTick.get(c.tickOf(b));
    if (!f || !f.boundsOn) continue;
    const k0 = Math.floor(f.x / B) + 2;
    column(c, frames, k0, width, gap, f.lo, f.hi);
  }
}

function column(c: LevelComposer, frames: Frame[], k0: number, width: number, gap: number, lo: number, hi: number, spikes = true): void {
  const xa = k0 * B;
  const xb = (k0 + width) * B;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const f of frames) {
    if (f.x + f.halfW + 2 < xa || f.x - f.halfW - 2 > xb) continue;
    for (let p = 0; p < f.y.length; p++) {
      yMin = Math.min(yMin, f.bottom[p]!);
      yMax = Math.max(yMax, f.top[p]!);
    }
  }
  if (yMin === Infinity) return;
  const lowTop = Math.floor((yMin - gap) / (B / 2)) * (B / 2);
  const highBot = Math.ceil((yMax + gap) / (B / 2)) * (B / 2);
  for (let k = k0; k < k0 + width; k++) {
    // lower pillar
    for (let y = lo; y + B <= lowTop + 0.01; y += B) c.cell(c.blockStyle, k, y / B, c.glow && y + 2 * B > lowTop ? { glow: 1 } : {}, true);
    const remLow = lowTop - (lo + Math.floor((lowTop - lo) / B) * B);
    if (lowTop - lo >= B / 2 && remLow >= B / 2 - 0.01) c.put('slab', k + 0.5, (lowTop - B / 4) / B, {}, true);
    else if (spikes && lowTop - lo >= B && c.rand() < 0.35 && lowTop + B <= yMin - c.tuning.margin - 10) c.cell('spike', k, lowTop / B, {}, true);
    // upper pillar
    for (let y = hi - B; y >= highBot - 0.01; y -= B) c.cell(c.blockStyle, k, y / B, c.glow && y - B < highBot ? { glow: 1 } : {}, true);
    const firstFull = hi - Math.floor((hi - highBot) / B) * B;
    if (hi - highBot >= B / 2 && firstFull - highBot >= B / 2 - 0.01) c.put('slab', k + 0.5, (highBot + B / 4) / B, {}, true);
    else if (spikes && hi - highBot >= B && c.rand() < 0.35 && highBot - B >= yMax + c.tuning.margin + 10) c.cell('spike', k, highBot / B - 1, { r: 180 }, true);
  }
}

// ---------------------------------------------------------------- wave

export function wave(c: LevelComposer, b0: number, b1: number, o: { speed?: number; gap?: number; mini?: boolean; zig?: number } = {}): void {
  enter(c, b0, 'wave', o.speed);
  const t0 = c.tickOf(b0);
  c.commit(t0 + 2);
  const f0 = c.frameAt(c.cursorTick);
  const lo = f0.lo;
  const hi = f0.hi;
  // zigzag between bands; flips on half beats (quarter beats when zig < 0.5)
  const zig = o.zig ?? 0.5;
  let up = true;
  for (let b = b0 + zig; b < b1; b += zig) {
    const td = c.tickOf(b);
    const f = c.predict(td);
    if (f.mode !== modeIndex('wave')) break;
    const y = f.y[0]!;
    const margin = 2.2 * B;
    if (y > hi - margin) up = false;
    else if (y < lo + margin) up = true;
    else if (c.rand() < 0.55) up = !up;
    if (up) c.hold(td, c.tickOf(b + zig) - 1);
  }
  const t1 = c.tickOf(b1);
  const r = c.probe(t1);
  const gap = (o.gap ?? c.tuning.waveGap) * B;
  const kStart = Math.floor(r.frames[0]!.x / B) + 3;
  const kEnd = Math.floor(r.frames[r.frames.length - 1]!.x / B) - 2;
  for (let k = kStart; k < kEnd; k++) column(c, r.frames, k, 1, gap, lo, hi, false);
  endSection(c, b1);
}

// ---------------------------------------------------------------- ball / spider

export function surfaces(c: LevelComposer, b0: number, b1: number, mode: 'ball' | 'spider', o: { speed?: number; every?: number[] } = {}): void {
  enter(c, b0, mode, o.speed);
  const pattern = o.every ?? [2, 1, 1, 2, 2, 1];
  let b = b0 + 1;
  let i = 0;
  while (b < b1 - 1) {
    const tE = c.tickOf(b);
    if (tE > c.cursorTick + 2) {
      c.commit(tE - 1);
      const f = c.frameAt(c.cursorTick);
      if (f.mode === modeIndex(mode) && f.onGround[0]) c.tap(tE, 4);
    }
    b += pattern[i++ % pattern.length]!;
  }
  const t1 = c.tickOf(b1);
  const r = c.probe(t1);
  // spikes on whichever surface the player is NOT resting on
  const first = r.frames[0];
  if (!first) return;
  const kStart = Math.floor(first.x / B) + 3;
  const kEnd = Math.floor(r.frames[r.frames.length - 1]!.x / B) - 2;
  for (let k = kStart; k < kEnd; k++) {
    const xa = k * B - 18;
    const xb = (k + 1) * B + 18;
    const over = r.frames.filter((f) => f.x + f.halfW >= xa && f.x - f.halfW <= xb);
    if (!over.length) continue;
    const allFloor = over.every((f) => f.onGround[0] && f.g[0] === 1);
    const allCeil = over.every((f) => f.onGround[0] && f.g[0] === -1);
    if (!allFloor && !allCeil) continue;
    if (c.rand() > 0.7) continue;
    if (allCeil) c.cell('spike', k, over[0]!.lo / B, {}, true);
    else c.cell('spike', k, over[0]!.hi / B - 1, { r: 180 }, true);
  }
  endSection(c, b1);
}

// ---------------------------------------------------------------- dual cube

export function dualCube(c: LevelComposer, b0: number, b1: number, o: { speed?: number; height?: number } = {}): void {
  enter(c, b0, 'cube', o.speed);
  const t0 = c.tickOf(b0);
  c.commit(Math.max(c.cursorTick, t0 - 30));
  c.portal(t0, 'portal_dualon');
  if (o.height) {
    const last = c.objects[c.objects.length - 1]!;
    last[3] = { h: o.height };
  }
  c.commit(t0 + 60);
  const airBeats = (2 * P.CUBE_JUMP_VELOCITY) / P.CUBE_GRAVITY / c.spb;
  const spacing = Math.ceil(airBeats + 0.25);
  for (let b = b0 + 2; b < b1 - 1.5; b += spacing + (c.rand() < 0.4 ? 1 : 0)) {
    const tE = c.tickOf(b);
    if (tE <= c.cursorTick + 2) continue;
    c.commit(tE - 1);
    const f = c.frameAt(c.cursorTick);
    if (!f.dual || !f.onGround.every(Boolean)) continue;
    c.tap(tE);
    const r = c.probe(tE + 160);
    const air = r.frames.filter((fr) => fr.tick > tE && fr.onGround.some((g) => !g));
    const apex = apexOf(air);
    if (!apex) continue;
    // floor-side spikes for the bottom player, ceiling-side for the twin
    const bottomP = f.g[0] === 1 ? 0 : 1;
    const topP = 1 - bottomP;
    const floorCells = c.safeSpikeCells(air, f.lo, bottomP);
    const ceilCells = c.safeSpikeCells(air, f.hi, topP, true);
    const both = floorCells.filter((k) => ceilCells.includes(k));
    const pickSide = c.rand();
    const ks = chooseSpikes(c, pickSide < 0.4 ? floorCells : pickSide < 0.7 ? ceilCells : both, apex.x, c.tuning.maxSpikes);
    for (const k of ks) {
      if (pickSide < 0.4 || pickSide >= 0.7) c.cell('spike', k, f.lo / B, {}, true);
      if (pickSide >= 0.4) c.cell('spike', k, f.hi / B - 1, { r: 180 }, true);
    }
  }
  const t1 = c.tickOf(b1);
  c.commit(Math.max(c.cursorTick, t1 - 120));
  c.portal(t1 - 70, 'portal_dualoff');
  endSection(c, b1);
}

// ---------------------------------------------------------------- calm stretch

export function rest(c: LevelComposer, b1: number): void {
  endSection(c, b1);
}
