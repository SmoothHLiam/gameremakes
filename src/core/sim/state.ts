import { CHANNEL_COUNT } from '../objects.ts';
import type { World } from './world.ts';

export interface PlayerState {
  y: number;
  /** World-space vertical velocity (units/s, + = up). */
  vy: number;
  /** Gravity sign: 1 = falls down, -1 = falls up. */
  g: 1 | -1;
  mode: number;
  mini: boolean;
  onGround: boolean;
  onCeiling: boolean;
  /** Slope under the player when grounded (visual tilt, deg, clockwise), 0 on flat. */
  slopeDeg: number;
  /** Visual rotation (deg, clockwise). */
  rot: number;
  /** Ticks a press stays usable for orbs / surface presses. */
  buffer: number;
  /** Robot boost ticks used; -1 when not boosting. */
  boost: number;
  dashing: boolean;
  /** Dash vertical velocity relative to gravity. */
  dashU: number;
  dead: boolean;
  /** Ticks since leaving the ground (visual squash, coyote-free). */
  airTicks: number;
}

export interface ActiveTrigger {
  /** Index into world.triggers. */
  t: number;
  /** Tick the trigger fired. */
  start: number;
}

export interface SimState {
  tick: number;
  /** Shared horizontal position (player center), units. */
  x: number;
  speed: number;
  players: PlayerState[];
  dual: boolean;
  mirror: boolean;
  /** Tick mirror last changed (for the visual flip animation). */
  mirrorTick: number;
  boundsOn: boolean;
  boundsLo: number;
  boundsHi: number;
  held: boolean;
  /** Per-object use flags: bit0 player 0, bit1 player 1. */
  used: Uint8Array;
  trigPtr: number;
  /** Group translation: current and "settled" (finished moves). */
  gdx: Float64Array;
  gdy: Float64Array;
  gbx: Float64Array;
  gby: Float64Array;
  /** Group rotation (deg), current and settled, plus center group. */
  grot: Float64Array;
  gbrot: Float64Array;
  gcenter: Uint16Array;
  /** Group alpha fade. */
  galpha: Float32Array;
  gaFrom: Float32Array;
  gaTo: Float32Array;
  gaStart: Int32Array;
  gaDur: Int32Array;
  ghidden: Uint8Array;
  moves: ActiveTrigger[];
  rots: ActiveTrigger[];
  pulses: ActiveTrigger[];
  shakes: ActiveTrigger[];
  /** Channel colors: rgb*3 and alpha. */
  col: Float32Array;
  calpha: Float32Array;
  cfFrom: Float32Array;
  cfTo: Float32Array;
  cfStart: Int32Array;
  cfDur: Int32Array;
  /** Coins touched this attempt (bitmask of coin slots 0..2). */
  coins: number;
  dead: boolean;
  complete: boolean;
  endTick: number;
}

export function makePlayer(mode: number, mini: boolean, flipped: boolean): PlayerState {
  return {
    y: 0,
    vy: 0,
    g: flipped ? -1 : 1,
    mode,
    mini,
    onGround: false,
    onCeiling: false,
    slopeDeg: 0,
    rot: 0,
    buffer: 0,
    boost: -1,
    dashing: false,
    dashU: 0,
    dead: false,
    airTicks: 0,
  };
}

export function initialState(w: World): SimState {
  const groups = w.maxGroup + 1;
  const s: SimState = {
    tick: 0,
    x: w.startX,
    speed: w.start.speed,
    players: [makePlayer(w.start.mode, w.start.mini, w.start.flipped)],
    dual: false,
    mirror: false,
    mirrorTick: -100000,
    boundsOn: false,
    boundsLo: 0,
    boundsHi: 0,
    held: false,
    used: new Uint8Array(w.n),
    trigPtr: 0,
    gdx: new Float64Array(groups),
    gdy: new Float64Array(groups),
    gbx: new Float64Array(groups),
    gby: new Float64Array(groups),
    grot: new Float64Array(groups),
    gbrot: new Float64Array(groups),
    gcenter: new Uint16Array(groups),
    galpha: new Float32Array(groups).fill(1),
    gaFrom: new Float32Array(groups).fill(1),
    gaTo: new Float32Array(groups).fill(1),
    gaStart: new Int32Array(groups).fill(-1),
    gaDur: new Int32Array(groups),
    ghidden: new Uint8Array(groups),
    moves: [],
    rots: [],
    pulses: [],
    shakes: [],
    col: Float32Array.from(w.baseColors),
    calpha: Float32Array.from(w.baseAlpha),
    cfFrom: new Float32Array(CHANNEL_COUNT * 4),
    cfTo: new Float32Array(CHANNEL_COUNT * 4),
    cfStart: new Int32Array(CHANNEL_COUNT).fill(-1),
    cfDur: new Int32Array(CHANNEL_COUNT),
    coins: 0,
    dead: false,
    complete: false,
    endTick: -1,
  };
  return s;
}

const clonePlayer = (p: PlayerState): PlayerState => ({ ...p });
const cloneActive = (a: ActiveTrigger[]): ActiveTrigger[] => a.map((t) => ({ t: t.t, start: t.start }));

/** Deep copy. Used for checkpoints and interpolation snapshots. */
export function cloneState(s: SimState): SimState {
  return {
    ...s,
    players: s.players.map(clonePlayer),
    used: s.used.slice(),
    gdx: s.gdx.slice(),
    gdy: s.gdy.slice(),
    gbx: s.gbx.slice(),
    gby: s.gby.slice(),
    grot: s.grot.slice(),
    gbrot: s.gbrot.slice(),
    gcenter: s.gcenter.slice(),
    galpha: s.galpha.slice(),
    gaFrom: s.gaFrom.slice(),
    gaTo: s.gaTo.slice(),
    gaStart: s.gaStart.slice(),
    gaDur: s.gaDur.slice(),
    ghidden: s.ghidden.slice(),
    moves: cloneActive(s.moves),
    rots: cloneActive(s.rots),
    pulses: cloneActive(s.pulses),
    shakes: cloneActive(s.shakes),
    col: s.col.slice(),
    calpha: s.calpha.slice(),
    cfFrom: s.cfFrom.slice(),
    cfTo: s.cfTo.slice(),
    cfStart: s.cfStart.slice(),
    cfDur: s.cfDur.slice(),
  };
}

/** Stable hash of the gameplay-relevant state (for determinism tests). */
export function hashState(s: SimState): string {
  const parts: number[] = [s.tick, s.x, s.speed, s.dual ? 1 : 0, s.mirror ? 1 : 0, s.boundsLo, s.boundsHi, s.coins, s.trigPtr];
  for (const p of s.players) parts.push(p.y, p.vy, p.g, p.mode, p.mini ? 1 : 0, p.dead ? 1 : 0, p.rot);
  for (let i = 0; i < s.gdx.length; i++) parts.push(s.gdx[i]!, s.gdy[i]!, s.grot[i]!);
  // FNV-1a over the float bit patterns.
  const buf = new Float64Array(parts);
  const bytes = new Uint8Array(buf.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
