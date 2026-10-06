import { SAW_HITBOX_SCALE, SPIKE_HITBOX } from './physics.ts';

/** What an object does in the simulation. */
export const Kind = {
  Deco: 0,
  Solid: 1,
  Slope: 2,
  Hazard: 3,
  Saw: 4,
  Portal: 5,
  Orb: 6,
  Pad: 7,
  Coin: 8,
  Trigger: 9,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export type Category = 'block' | 'slope' | 'hazard' | 'portal' | 'orb' | 'pad' | 'deco' | 'trigger' | 'coin';

export const CATEGORY_LABELS: Record<Category, string> = {
  block: 'Blocks',
  slope: 'Slopes',
  hazard: 'Hazards',
  portal: 'Portals',
  orb: 'Orbs',
  pad: 'Pads',
  coin: 'Coins',
  deco: 'Deco',
  trigger: 'Triggers',
};

export const GameMode = {
  Cube: 0,
  Ship: 1,
  Ball: 2,
  Ufo: 3,
  Wave: 4,
  Robot: 5,
  Spider: 6,
  Swing: 7,
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];
export const MODE_KEYS = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'] as const;
export type ModeKey = (typeof MODE_KEYS)[number];
export const MODE_NAMES = ['Cube', 'Ship', 'Ball', 'UFO', 'Wave', 'Robot', 'Spider', 'Swing'] as const;
/** Modes whose portal defines a bounded vertical play area. */
export const BOUNDED_MODES: readonly boolean[] = [false, true, true, true, true, false, true, true];
/** Modes that slide along ceilings instead of dying on them. */
export const CEILING_MODES: readonly boolean[] = [false, true, true, true, true, false, true, true];

/** Portal subtypes. */
export const PortalType = {
  Mode: 0,
  GravityNormal: 1,
  GravityFlip: 2,
  SizeNormal: 3,
  SizeMini: 4,
  MirrorOn: 5,
  MirrorOff: 6,
  DualOn: 7,
  DualOff: 8,
  Speed: 9,
} as const;
export type PortalType = (typeof PortalType)[keyof typeof PortalType];

export const OrbType = {
  Jump: 0,
  Small: 1,
  Big: 2,
  Gravity: 3,
  FlipJump: 4,
  Slam: 5,
  Dash: 6,
} as const;
export type OrbType = (typeof OrbType)[keyof typeof OrbType];

export const PadType = {
  Jump: 0,
  Small: 1,
  Big: 2,
  Gravity: 3,
} as const;
export type PadType = (typeof PadType)[keyof typeof PadType];

export const TriggerType = {
  Color: 0,
  Move: 1,
  Alpha: 2,
  Rotate: 3,
  Pulse: 4,
  Toggle: 5,
  Shake: 6,
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

/** Which color drives a sprite part: the object's main channel, its detail channel, or none. */
export type PartSlot = 'main' | 'detail' | 'fixed';

export interface ObjPart {
  tex: string;
  slot: PartSlot;
  /** Additive blending for glowy parts. */
  add?: boolean;
  /** Override the object's z layer for this part (e.g. portal front halves). */
  layer?: number;
}

export interface ObjDef {
  id: number;
  key: string;
  name: string;
  cat: Category;
  kind: Kind;
  /** Visual footprint in blocks. */
  w: number;
  h: number;
  /** Offset of the center from the snapped grid cell center (blocks). */
  snap?: { x: number; y: number };
  /** Hitbox relative to the object center, in blocks (unrotated). Defaults to w×h. */
  hit?: { x: number; y: number; w: number; h: number };
  /** Circular hitbox radius in blocks (saws, orbs). */
  r?: number;
  /** Subtype: portal / orb / pad / trigger type. */
  sub?: number;
  /** For mode / speed portals: target mode or speed index. */
  val?: number;
  parts: ObjPart[];
  /** Default color channels (main, detail). */
  c: number;
  c2: number;
  /** Default z layer: -2..2 (player draws between 0 and 1). */
  layer: number;
  glow?: boolean;
  /** Decoration that pulses with the music beat by default. */
  beat?: boolean;
  /** Spins continuously (deg/s), visual only. */
  spin?: number;
  /** Slope rise / run (for slopes). */
  slope?: number;
}

// ---------------------------------------------------------------- color channels

/** Reserved channel ids. Custom object channels are 1..99. */
export const Channel = {
  BG: 0,
  Ground: 100,
  Line: 101,
  Obj: 102,
  Fill: 103,
  P1: 104,
  P2: 105,
  White: 106,
  Black: 107,
  Ground2: 108,
  BG2: 109,
} as const;
export const CHANNEL_COUNT = 110;

/** Names used in level JSON for the reserved channels. */
export const CHANNEL_NAMES: Record<string, number> = {
  bg: Channel.BG,
  bg2: Channel.BG2,
  g: Channel.Ground,
  g2: Channel.Ground2,
  line: Channel.Line,
  obj: Channel.Obj,
  fill: Channel.Fill,
  p1: Channel.P1,
  p2: Channel.P2,
  white: Channel.White,
  black: Channel.Black,
};

export function channelName(id: number): string {
  for (const [k, v] of Object.entries(CHANNEL_NAMES)) if (v === id) return k;
  return String(id);
}

export function parseChannel(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CHANNEL_COUNT) return v;
  if (typeof v === 'string') {
    if (v in CHANNEL_NAMES) return CHANNEL_NAMES[v]!;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && n < CHANNEL_COUNT) return n;
  }
  return fallback;
}

// ---------------------------------------------------------------- registry

const defs: ObjDef[] = [];
const byId = new Map<number, ObjDef>();
const byKey = new Map<string, ObjDef>();

function def(d: ObjDef): void {
  if (byId.has(d.id)) throw new Error(`duplicate object id ${d.id}`);
  defs.push(d);
  byId.set(d.id, d);
  byKey.set(d.key, d);
}

const solid = (id: number, key: string, name: string, tex: string, w = 1, h = 1, snap?: { x: number; y: number }) =>
  def({
    id, key, name, cat: 'block', kind: Kind.Solid, w, h, snap,
    parts: [{ tex: `${tex}_fill`, slot: 'detail' }, { tex: `${tex}_line`, slot: 'main' }],
    c: Channel.Obj, c2: Channel.Fill, layer: 0,
  });

solid(1, 'block', 'Block', 'block');
solid(2, 'block_brick', 'Brick block', 'brick');
solid(3, 'block_panel', 'Panel block', 'panel');
solid(4, 'block_grid', 'Grid block', 'grid');
solid(5, 'block_stud', 'Stud block', 'stud');
solid(6, 'slab', 'Slab', 'slab', 1, 0.5, { x: 0, y: 0.25 });
solid(7, 'block_plain', 'Plain block', 'plain');
solid(8, 'pillar', 'Pillar', 'pillar', 0.5, 1, { x: 0, y: 0 });
def({
  id: 9, key: 'block_outline', name: 'Outline block', cat: 'block', kind: Kind.Solid, w: 1, h: 1,
  parts: [{ tex: 'outline_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});

def({
  id: 10, key: 'slope45', name: 'Slope 45°', cat: 'slope', kind: Kind.Slope, w: 1, h: 1, slope: 1,
  parts: [{ tex: 'slope45_fill', slot: 'detail' }, { tex: 'slope45_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});
def({
  id: 11, key: 'slope26', name: 'Slope 2:1', cat: 'slope', kind: Kind.Slope, w: 2, h: 1, slope: 0.5,
  snap: { x: 0.5, y: 0 },
  parts: [{ tex: 'slope26_fill', slot: 'detail' }, { tex: 'slope26_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});

const spikeHit = (scaleH: number) => ({
  x: 0,
  y: (SPIKE_HITBOX.cy - 0.5) * scaleH,
  w: SPIKE_HITBOX.w,
  h: SPIKE_HITBOX.h * scaleH,
});

def({
  id: 20, key: 'spike', name: 'Spike', cat: 'hazard', kind: Kind.Hazard, w: 1, h: 1,
  hit: spikeHit(1),
  parts: [{ tex: 'spike_fill', slot: 'detail' }, { tex: 'spike_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});
def({
  id: 21, key: 'spike_half', name: 'Half spike', cat: 'hazard', kind: Kind.Hazard, w: 1, h: 0.5,
  snap: { x: 0, y: -0.25 },
  hit: spikeHit(0.5),
  parts: [{ tex: 'spikehalf_fill', slot: 'detail' }, { tex: 'spikehalf_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});
def({
  id: 22, key: 'spike_low', name: 'Low teeth', cat: 'hazard', kind: Kind.Hazard, w: 1, h: 0.3,
  snap: { x: 0, y: -0.35 },
  hit: { x: 0, y: -0.03, w: 0.7, h: 0.12 },
  parts: [{ tex: 'spikelow_fill', slot: 'detail' }, { tex: 'spikelow_line', slot: 'main' }],
  c: Channel.Obj, c2: Channel.Fill, layer: 0,
});
const saw = (id: number, key: string, name: string, r: number, tex: string) =>
  def({
    id, key, name, cat: 'hazard', kind: Kind.Saw, w: r * 2, h: r * 2, r: r * SAW_HITBOX_SCALE,
    snap: r * 2 % 2 === 0 ? { x: 0.5, y: 0.5 } : undefined,
    parts: [{ tex: `${tex}_fill`, slot: 'detail' }, { tex: `${tex}_line`, slot: 'main' }],
    c: Channel.Obj, c2: Channel.Fill, layer: 0, spin: 360,
  });
saw(23, 'saw_small', 'Small saw', 0.75, 'saw1');
saw(24, 'saw', 'Saw', 1, 'saw2');
saw(25, 'saw_big', 'Big saw', 1.5, 'saw3');

// Portals. Hitboxes are generous so they're never missed.
const MODE_PORTAL_HIT = { x: 0, y: 0, w: 1.2, h: 3 };
const modePortal = (id: number, mode: number, key: string, name: string) =>
  def({
    id, key, name, cat: 'portal', kind: Kind.Portal, sub: PortalType.Mode, val: mode,
    w: 1.4, h: 3, hit: MODE_PORTAL_HIT,
    parts: [{ tex: `portal_${key}_back`, slot: 'fixed' }, { tex: `portal_${key}_front`, slot: 'fixed', layer: 2 }],
    c: Channel.White, c2: Channel.White, layer: -1, glow: true,
  });
modePortal(40, GameMode.Cube, 'cube', 'Cube portal');
modePortal(41, GameMode.Ship, 'ship', 'Ship portal');
modePortal(42, GameMode.Ball, 'ball', 'Ball portal');
modePortal(43, GameMode.Ufo, 'ufo', 'UFO portal');
modePortal(44, GameMode.Wave, 'wave', 'Wave portal');
modePortal(45, GameMode.Robot, 'robot', 'Robot portal');
modePortal(46, GameMode.Spider, 'spider', 'Spider portal');
modePortal(47, GameMode.Swing, 'swing', 'Swing portal');

const modPortal = (id: number, sub: PortalType, key: string, name: string) =>
  def({
    id, key: `portal_${key}`, name, cat: 'portal', kind: Kind.Portal, sub,
    w: 1.2, h: 2.6, hit: { x: 0, y: 0, w: 1.1, h: 2.6 },
    parts: [{ tex: `portal_${key}_back`, slot: 'fixed' }, { tex: `portal_${key}_front`, slot: 'fixed', layer: 2 }],
    c: Channel.White, c2: Channel.White, layer: -1, glow: true,
  });
modPortal(50, PortalType.GravityNormal, 'gravn', 'Gravity: normal');
modPortal(51, PortalType.GravityFlip, 'gravf', 'Gravity: flip');
modPortal(52, PortalType.SizeNormal, 'sizen', 'Size: normal');
modPortal(53, PortalType.SizeMini, 'sizem', 'Size: mini');
modPortal(54, PortalType.MirrorOn, 'mirron', 'Mirror on');
modPortal(55, PortalType.MirrorOff, 'mirroff', 'Mirror off');
modPortal(56, PortalType.DualOn, 'dualon', 'Dual on');
modPortal(57, PortalType.DualOff, 'dualoff', 'Dual off');

const SPEED_NAMES = ['Speed: slow', 'Speed: normal', 'Speed: fast', 'Speed: faster', 'Speed: fastest'];
for (let s = 0; s < 5; s++) {
  def({
    id: 60 + s, key: `speed${s}`, name: SPEED_NAMES[s]!, cat: 'portal', kind: Kind.Portal,
    sub: PortalType.Speed, val: s, w: 1.4, h: 2, hit: { x: 0, y: 0, w: 1.2, h: 2.4 },
    parts: [{ tex: `speed${s}`, slot: 'fixed' }],
    c: Channel.White, c2: Channel.White, layer: 1, glow: true,
  });
}

const ORB_KEYS = ['jump', 'small', 'big', 'gravity', 'flipjump', 'slam', 'dash'];
const ORB_NAMES = ['Jump orb', 'Small orb', 'Big orb', 'Gravity orb', 'Flip-jump orb', 'Slam orb', 'Dash orb'];
for (let o = 0; o < ORB_KEYS.length; o++) {
  def({
    id: 70 + o, key: `orb_${ORB_KEYS[o]}`, name: ORB_NAMES[o]!, cat: 'orb', kind: Kind.Orb, sub: o,
    w: 1, h: 1, hit: { x: 0, y: 0, w: 1.2, h: 1.2 },
    parts: [{ tex: `orb_${ORB_KEYS[o]}`, slot: 'fixed' }],
    c: Channel.White, c2: Channel.White, layer: 1, glow: true,
  });
}

const PAD_KEYS = ['jump', 'small', 'big', 'gravity'];
const PAD_NAMES = ['Jump pad', 'Small pad', 'Big pad', 'Gravity pad'];
for (let p = 0; p < PAD_KEYS.length; p++) {
  def({
    id: 80 + p, key: `pad_${PAD_KEYS[p]}`, name: PAD_NAMES[p]!, cat: 'pad', kind: Kind.Pad, sub: p,
    w: 1, h: 0.3, snap: { x: 0, y: -0.35 }, hit: { x: 0, y: -0.05, w: 0.9, h: 0.2 },
    parts: [{ tex: `pad_${PAD_KEYS[p]}`, slot: 'fixed' }],
    c: Channel.White, c2: Channel.White, layer: 1, glow: true,
  });
}

def({
  id: 90, key: 'coin', name: 'Secret coin', cat: 'coin', kind: Kind.Coin, w: 1.2, h: 1.2,
  hit: { x: 0, y: 0, w: 1.1, h: 1.1 }, snap: { x: 0, y: 0 },
  parts: [{ tex: 'coin', slot: 'fixed' }],
  c: Channel.White, c2: Channel.White, layer: 1, glow: true,
});

const TRIGGER_KEYS = ['color', 'move', 'alpha', 'rotate', 'pulse', 'toggle', 'shake'];
const TRIGGER_NAMES = ['Color trigger', 'Move trigger', 'Alpha trigger', 'Rotate trigger', 'Pulse trigger', 'Toggle trigger', 'Shake trigger'];
for (let t = 0; t < TRIGGER_KEYS.length; t++) {
  def({
    id: 100 + t, key: `trig_${TRIGGER_KEYS[t]}`, name: TRIGGER_NAMES[t]!, cat: 'trigger', kind: Kind.Trigger,
    sub: t, w: 1, h: 1,
    parts: [{ tex: `trig_${TRIGGER_KEYS[t]}`, slot: 'fixed' }],
    c: Channel.White, c2: Channel.White, layer: 2,
  });
}

const deco = (id: number, key: string, name: string, w: number, h: number, extra: Partial<ObjDef> = {}) =>
  def({
    id, key: `deco_${key}`, name, cat: 'deco', kind: Kind.Deco, w, h,
    parts: [{ tex: `deco_${key}`, slot: 'main' }],
    c: 1, c2: Channel.Fill, layer: -1, ...extra,
  });
deco(200, 'ring', 'Ring', 1, 1);
deco(201, 'burst', 'Burst', 2, 2, { spin: 40, snap: { x: 0.5, y: 0.5 } });
deco(202, 'chevron', 'Chevron', 1, 1);
deco(203, 'dots', 'Dot grid', 1, 1);
deco(204, 'diamond', 'Diamond', 1, 1);
deco(205, 'zigzag', 'Zigzag', 1, 0.5, { snap: { x: 0, y: -0.25 } });
deco(206, 'glow', 'Glow orb', 2, 2, { beat: true, parts: [{ tex: 'deco_glow', slot: 'main', add: true }], snap: { x: 0.5, y: 0.5 } });
deco(207, 'bar', 'Bar', 0.25, 1);
deco(208, 'tri', 'Triangle', 1, 1);
deco(209, 'beatring', 'Beat ring', 2, 2, { beat: true, snap: { x: 0.5, y: 0.5 } });
deco(210, 'cross', 'Cross', 1, 1);
deco(211, 'bump', 'Bump', 1, 0.5, { snap: { x: 0, y: -0.25 } });
deco(212, 'fuzz', 'Fuzz', 1, 0.4, { snap: { x: 0, y: -0.3 } });
deco(213, 'chain', 'Chain', 0.5, 1);
deco(214, 'square', 'Square tile', 1, 1, { layer: -2 });
deco(215, 'arrow', 'Arrow', 1, 1, { layer: 1 });
deco(216, 'eq', 'Beat bars', 1, 1, { beat: true });
deco(217, 'halo', 'Halo', 3, 3, { beat: true, parts: [{ tex: 'deco_halo', slot: 'main', add: true }] });
deco(218, 'gear', 'Gear', 2, 2, { spin: 60, snap: { x: 0.5, y: 0.5 } });
deco(219, 'star', 'Star', 1, 1, { beat: true });

export const OBJECT_DEFS: readonly ObjDef[] = defs;

export function getDef(id: number): ObjDef | undefined {
  return byId.get(id);
}

export function getDefByKey(key: string): ObjDef | undefined {
  return byKey.get(key);
}

export function requireDef(key: string): ObjDef {
  const d = byKey.get(key);
  if (!d) throw new Error(`unknown object ${key}`);
  return d;
}
