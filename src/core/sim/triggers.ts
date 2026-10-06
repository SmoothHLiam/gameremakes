import { ease } from '../dmath.ts';
import { TriggerType } from '../objects.ts';
import { TICK_RATE } from '../physics.ts';
import type { SimState } from './state.ts';
import type { TriggerDef, World } from './world.ts';

export const durTicks = (seconds: number): number => Math.max(0, Math.round(seconds * TICK_RATE));

/** Fire every trigger whose x the player has reached. Returns shake triggers fired. */
export function fireTriggers(w: World, s: SimState, onShake?: (t: TriggerDef) => void): void {
  const list = w.triggers;
  while (s.trigPtr < list.length && list[s.trigPtr]!.x <= s.x) {
    fireTrigger(w, s, s.trigPtr, onShake);
    s.trigPtr++;
  }
}

export function fireTrigger(w: World, s: SimState, index: number, onShake?: (t: TriggerDef) => void): void {
  const t = w.triggers[index]!;
  const tick = s.tick;
  switch (t.type) {
    case TriggerType.Color: {
      const ch = t.target;
      for (let k = 0; k < 3; k++) {
        s.cfFrom[ch * 4 + k] = s.col[ch * 3 + k]!;
        s.cfTo[ch * 4 + k] = t.rgb[k]!;
      }
      s.cfFrom[ch * 4 + 3] = s.calpha[ch]!;
      s.cfTo[ch * 4 + 3] = t.op;
      s.cfStart[ch] = tick;
      s.cfDur[ch] = durTicks(t.dur);
      break;
    }
    case TriggerType.Move:
      if (t.target > 0 && t.target < s.gdx.length) s.moves.push({ t: index, start: tick });
      break;
    case TriggerType.Rotate:
      if (t.target > 0 && t.target < s.grot.length) {
        s.rots.push({ t: index, start: tick });
        if (t.centerGroup) s.gcenter[t.target] = t.centerGroup;
      }
      break;
    case TriggerType.Alpha: {
      const g = t.target;
      if (g <= 0 || g >= s.galpha.length) break;
      s.gaFrom[g] = s.galpha[g]!;
      s.gaTo[g] = t.op;
      s.gaStart[g] = tick;
      s.gaDur[g] = durTicks(t.dur);
      break;
    }
    case TriggerType.Toggle:
      if (t.target > 0 && t.target < s.ghidden.length) s.ghidden[t.target] = t.on ? 0 : 1;
      break;
    case TriggerType.Pulse:
      s.pulses.push({ t: index, start: tick });
      break;
    case TriggerType.Shake:
      s.shakes.push({ t: index, start: tick });
      onShake?.(t);
      break;
  }
}

/** Advance every running trigger effect to the current tick. */
export function updateTriggers(w: World, s: SimState): void {
  const tick = s.tick;

  // Moves: offset = settled + Σ eased partial deltas.
  if (s.moves.length) {
    for (const a of s.moves) {
      const g = w.triggers[a.t]!.target;
      s.gdx[g] = s.gbx[g]!;
      s.gdy[g] = s.gby[g]!;
    }
    let write = 0;
    for (let i = 0; i < s.moves.length; i++) {
      const a = s.moves[i]!;
      const t = w.triggers[a.t]!;
      const dur = durTicks(t.dur);
      const p = dur === 0 ? 1 : (tick - a.start) / dur;
      const g = t.target;
      if (p >= 1) {
        s.gbx[g]! += t.dx;
        s.gby[g]! += t.dy;
        s.gdx[g]! += t.dx;
        s.gdy[g]! += t.dy;
      } else {
        const e = ease(t.ease, p);
        s.gdx[g]! += t.dx * e;
        s.gdy[g]! += t.dy * e;
        s.moves[write++] = a;
      }
    }
    s.moves.length = write;
  }

  if (s.rots.length) {
    for (const a of s.rots) {
      const g = w.triggers[a.t]!.target;
      s.grot[g] = s.gbrot[g]!;
    }
    let write = 0;
    for (let i = 0; i < s.rots.length; i++) {
      const a = s.rots[i]!;
      const t = w.triggers[a.t]!;
      const dur = durTicks(t.dur);
      const p = dur === 0 ? 1 : (tick - a.start) / dur;
      const g = t.target;
      if (p >= 1) {
        s.gbrot[g]! += t.deg;
        s.grot[g]! += t.deg;
      } else {
        s.grot[g]! += t.deg * ease(t.ease, p);
        s.rots[write++] = a;
      }
    }
    s.rots.length = write;
  }

  // Alpha fades.
  for (let g = 1; g < s.gaStart.length; g++) {
    const st = s.gaStart[g]!;
    if (st < 0) continue;
    const dur = s.gaDur[g]!;
    const p = dur === 0 ? 1 : (tick - st) / dur;
    if (p >= 1) {
      s.galpha[g] = s.gaTo[g]!;
      s.gaStart[g] = -1;
    } else {
      s.galpha[g] = s.gaFrom[g]! + (s.gaTo[g]! - s.gaFrom[g]!) * p;
    }
  }

  // Color fades (linear, like a crossfade).
  for (let ch = 0; ch < s.cfStart.length; ch++) {
    const st = s.cfStart[ch]!;
    if (st < 0) continue;
    const dur = s.cfDur[ch]!;
    const p = dur === 0 ? 1 : Math.min(1, (tick - st) / dur);
    for (let k = 0; k < 3; k++) {
      const a = s.cfFrom[ch * 4 + k]!;
      s.col[ch * 3 + k] = a + (s.cfTo[ch * 4 + k]! - a) * p;
    }
    const a0 = s.cfFrom[ch * 4 + 3]!;
    s.calpha[ch] = a0 + (s.cfTo[ch * 4 + 3]! - a0) * p;
    if (p >= 1) s.cfStart[ch] = -1;
  }

  // Expire pulses and shakes.
  if (s.pulses.length) {
    s.pulses = s.pulses.filter((a) => {
      const t = w.triggers[a.t]!;
      return tick - a.start <= durTicks(t.fi + t.hold + t.fo);
    });
  }
  if (s.shakes.length) {
    s.shakes = s.shakes.filter((a) => tick - a.start <= durTicks(w.triggers[a.t]!.dur));
  }
}

/** Pulse intensity (0..1) at a tick for an active pulse. Visual only. */
export function pulseIntensity(t: TriggerDef, startTick: number, tick: number): number {
  const e = (tick - startTick) / TICK_RATE;
  if (e < 0) return 0;
  if (e < t.fi) return t.fi > 0 ? e / t.fi : 1;
  if (e < t.fi + t.hold) return 1;
  const out = e - t.fi - t.hold;
  if (out < t.fo) return 1 - out / t.fo;
  return 0;
}

/** Instantly applies every trigger with x < upToX (editor playtest from a position). */
export function fastForwardTriggers(w: World, s: SimState, upToX: number): void {
  const far = 1e9;
  while (s.trigPtr < w.triggers.length && w.triggers[s.trigPtr]!.x <= upToX) {
    fireTrigger(w, s, s.trigPtr);
    s.trigPtr++;
  }
  // Collapse every effect to its end state.
  const saved = s.tick;
  s.tick = saved + far;
  updateTriggers(w, s);
  s.tick = saved;
  s.pulses = [];
  s.shakes = [];
}
