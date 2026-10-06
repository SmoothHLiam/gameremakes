/**
 * Decoration and coin passes for composed levels: section palettes via color
 * triggers, pulses and shakes on drops, background deco on beats, and three
 * secret coins reached by extra (provably safe) inputs.
 */
import type { SongSection } from '../../src/core/audio/song.ts';
import * as P from '../../src/core/physics.ts';
import { B, type Frame, type LevelComposer, mergeHolds, type Palette } from './composer.ts';

export function palettes(c: LevelComposer, sections: SongSection[], pal: Palette[], startIndex = 0): void {
  sections.forEach((sec, i) => {
    const p = pal[(i + startIndex) % pal.length]!;
    const beat = sec.bar * 4;
    const f = c.predict(c.tickOf(beat));
    const x = f.x / B + 0.5;
    const d = sec.kind === 'drop' ? 0.05 : c.spb * 2;
    // triggers sit at the section start; keep them out of the play area
    const y = 12 + (i % 3);
    c.put('trig_color', x, y, { t: 'bg', col: p.bg, d });
    c.put('trig_color', x, y + 1, { t: 'g', col: p.g, d });
    c.put('trig_color', x + 0.5, y, { t: 'line', col: p.line, d });
    c.put('trig_color', x + 0.5, y + 1, { t: 1, col: p.c1, d });
    c.put('trig_color', x + 1, y, { t: 2, col: p.c2, d });
    c.put('trig_color', x + 1, y + 1, { t: 3, col: p.c3, d });
    if (sec.kind === 'drop') {
      c.put('trig_shake', x, y + 2, { amp: 0.35, d: 0.45 });
      c.put('trig_pulse', x + 0.5, y + 2, { t: 'bg', col: '#ffffff', fi: 0.01, hold: 0.04, fo: 0.45 });
    }
  });
}

/** Line pulses on every bar of the drops (quick flashes on the downbeat). */
export function barPulses(c: LevelComposer, sections: SongSection[]): void {
  for (const sec of sections) {
    if (sec.kind !== 'drop') continue;
    for (let bar = sec.bar + 1; bar < sec.bar + sec.bars; bar++) {
      const f = c.predict(c.tickOf(bar * 4));
      c.put('trig_pulse', f.x / B + 0.5, 15, { t: 'line', col: '#ffffff', fi: 0.01, hold: 0.03, fo: 0.25 });
    }
  }
}

/** Background architecture: towers of tiles behind the play area (no collision). */
export function scenery(c: LevelComposer, frames: Frame[]): void {
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const byX = (x: number): Frame => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (frames[m]!.x < x) lo = m + 1;
      else hi = m;
    }
    return frames[lo]!;
  };
  for (let x = Math.ceil(first.x / B) + 10; x < last.x / B - 4; x += 5 + Math.floor(c.rand() * 6)) {
    const f = byX(x * B);
    const w = 1 + Math.floor(c.rand() * 3);
    if (f.boundsOn) {
      // hanging structure from the ceiling and a low one from the floor, behind everything
      const hiRow = f.hi / B;
      const loRow = f.lo / B;
      const hang = 1 + Math.floor(c.rand() * 3);
      for (let k = 0; k < w; k++) for (let r = 0; r < hang; r++) c.put('deco_square', x + k + 0.5, hiRow - r - 0.5, { c: 3, z: -2 });
      if (c.rand() < 0.5) for (let k = 0; k < w; k++) c.put('deco_square', x + k + 0.5, loRow + 0.5, { c: 3, z: -2 });
    } else {
      const h = 2 + Math.floor(c.rand() * 5);
      for (let k = 0; k < w; k++) {
        for (let r = 0; r < h; r++) c.put('deco_square', x + k + 0.5, r + 0.5, { c: 3, z: -2 });
        if (c.rand() < 0.5) c.put(c.rand() < 0.5 ? 'deco_tri' : 'deco_diamond', x + k + 0.5, h + 0.5, { c: 2, z: -2 });
      }
    }
  }
}

/** Background deco: glow orbs on beats, beat rings in drops, ground fuzz, gears. */
export function background(c: LevelComposer, sections: SongSection[], frames: Frame[]): void {
  const occupied = new Set<string>();
  for (const o of c.objects) occupied.add(`${Math.floor(o[1])},${Math.floor(o[2])}`);
  const byTick = (t: number) => frames[Math.max(0, Math.min(frames.length - 1, t - frames[0]!.tick))]!;
  for (const sec of sections) {
    const drop = sec.kind === 'drop';
    for (let beat = sec.bar * 4; beat < (sec.bar + sec.bars) * 4; beat += drop ? 2 : 4) {
      const f = byTick(c.tickOf(beat));
      const x = Math.floor(f.x / B) + 6;
      const bounded = f.boundsOn;
      const lo = bounded ? f.lo / B : 0;
      const hi = bounded ? f.hi / B : 9;
      const y = Math.floor(lo + 2 + c.rand() * Math.max(1, hi - lo - 4));
      if (occupied.has(`${x},${y}`)) continue;
      if (drop && c.rand() < 0.5) c.put('deco_beatring', x + 0.5, y + 0.5, { c: 2, z: -2 });
      else c.put('deco_glow', x + 0.5, y + 0.5, { c: 3, z: -2, s: 1 + c.rand() });
      if (!bounded && c.rand() < 0.6) {
        const gx = x + Math.floor(c.rand() * 3);
        if (!occupied.has(`${gx},0`)) c.put('deco_fuzz', gx + 0.5, 0.2, { c: 1, z: -1 });
      }
      if (bounded && c.rand() < 0.25) c.put('deco_chain', x + 0.25, hi - 0.5, { c: 1, z: -2 });
    }
    if (sec.kind === 'break') {
      const f = byTick(c.tickOf(sec.bar * 4 + 2));
      c.put('deco_gear', f.x / B + 9, 6, { c: 2, z: -2, s: 1.6 });
    }
  }
}

/**
 * Places three secret coins. Each needs extra inputs off the main path: a jump
 * in a calm moment to reach a hidden orb, and the orb launches the player
 * through the coin high above the obvious route. The detour must land on the
 * same floor before the next main input, so the rest of the run is unchanged;
 * every candidate is verified in the real simulation.
 */
export function coins(c: LevelComposer, count = 3, minBeat = 6): number {
  const frames = c.frames;
  const holds = c.holds;
  const base = frames[0]!.tick;
  const pressTicks = holds.map((h) => h[0]);
  const total = frames[frames.length - 1]!.tick;
  const airTicks = Math.ceil(((2 * P.CUBE_JUMP_VELOCITY) / P.CUBE_GRAVITY) * P.TICK_RATE);
  // candidate beats where the player stands still on the ground with room ahead
  const candidates: Array<{ ta: number; next: number; floor: number }> = [];
  const lastBeat = Math.floor((total / P.TICK_RATE - c.info.offset) / c.spb) - 8;
  for (let beat = minBeat; beat < lastBeat; beat++) {
    const ta = c.tickOf(beat);
    const f = frames[ta - base];
    if (!f || (f.mode !== 0 && f.mode !== 5) || f.dual || f.g[0] !== 1 || !f.onGround[0]) continue;
    let next = pressTicks.find((t) => t > ta - 6) ?? total;
    // the calm window also ends the moment the player leaves the ground (pads, edges)
    for (let k = ta - base; k < Math.min(frames.length, next - base); k++) {
      const w = frames[k]!;
      if (!w.onGround[0] || Math.abs(w.bottom[0]! - f.bottom[0]!) > 0.5) {
        next = w.tick;
        break;
      }
    }
    if (next < ta + airTicks + 30) continue;
    candidates.push({ ta, next, floor: f.bottom[0]! });
  }
  if (process.env.COIN_DEBUG) console.log(`  ${c.meta.name}: ${candidates.length} coin candidates at beats ${candidates.map((cd) => ((cd.ta / P.TICK_RATE - c.info.offset) / c.spb).toFixed(0)).join(',')} (next press gaps ${candidates.map((cd) => cd.next - cd.ta).join(',')})`);
  if (!candidates.length) return 0;
  const placed: number[] = [];
  // preferred spread first, then anywhere that is still far enough from the others
  const targets = [0.2, 0.5, 0.8, 0.35, 0.65, 0.08, 0.92];
  for (const z of targets) {
    if (placed.length >= count) break;
    const goal = total * z;
    const order = candidates
      .filter((cd) => placed.every((p) => Math.abs(p - cd.ta) > total * 0.1))
      .sort((a, b) => Math.abs(a.ta - goal) - Math.abs(b.ta - goal));
    for (const cd of order.slice(0, 60)) {
      if (tryCoin(c, cd, airTicks, total, placed.length, true) || tryCoin(c, cd, airTicks, total, placed.length, false)) {
        placed.push(cd.ta);
        if (process.env.COIN_DEBUG) console.log(`  coin at beat ${((cd.ta / P.TICK_RATE - c.info.offset) / c.spb).toFixed(0)}`);
        break;
      }
    }
  }
  return placed.length;
}

function tryCoin(c: LevelComposer, cd: { ta: number; next: number; floor: number }, airTicks: number, total: number, have: number, withOrb: boolean): boolean {
  const mark = c.objects.length;
  const before = c.coinHolds.length;
  const { ta, next, floor } = cd;
  c.coinHold(ta, ta + 5);
  let apexFrames: Frame[];
  if (withOrb) {
    const r1 = c.probeFromStart(ta + airTicks + 20, mergeHolds(c.holds, c.coinHolds));
    const tO = ta + Math.round(Math.min(0.24, c.spb * 0.5) * P.TICK_RATE);
    const fo = r1.frames.find((x) => x.tick === tO);
    if (!fo || fo.onGround[0] || r1.dead) {
      rollback(c, mark, before);
      return false;
    }
    c.put('orb_big', (fo.x + 16) / B, fo.y[0]! / B);
    c.coinHold(tO, tO + 5);
    const r2 = c.probeFromStart(Math.min(total, next), mergeHolds(c.holds, c.coinHolds));
    apexFrames = r2.frames.filter((x) => x.tick > tO);
  } else {
    const r = c.probeFromStart(Math.min(total, next), mergeHolds(c.holds, c.coinHolds));
    apexFrames = r.frames.filter((x) => x.tick > ta);
  }
  let apex: Frame | undefined;
  for (const a of apexFrames) if (!apex || a.y[0]! > apex.y[0]!) apex = a;
  const landing = apexFrames.find((x) => apex && x.tick > apex.tick && x.onGround[0]);
  if (!apex || !landing || landing.tick > next - 8 || Math.abs(landing.bottom[0]! - floor) > 0.5) {
    rollback(c, mark, before);
    return false;
  }
  c.put('coin', apex.x / B + 0.15, apex.y[0]! / B + 0.1);
  const check = c.probeFromStart(Math.min(total, next + 2), mergeHolds(c.holds, c.coinHolds));
  if (check.dead || popcount(check.coins) !== have + 1) {
    rollback(c, mark, before);
    return false;
  }
  return true;
}

function rollback(c: LevelComposer, mark: number, coinHolds: number): void {
  for (let i = mark; i < c.objects.length; i++) c.removeObject(i);
  c.coinHolds.length = coinHolds;
}

function popcount(n: number): number {
  let k = 0;
  while (n) {
    k += n & 1;
    n >>>= 1;
  }
  return k;
}
