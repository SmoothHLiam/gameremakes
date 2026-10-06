import type { EasingId } from './dmath.ts';
import { EASING_NAMES } from './dmath.ts';
import { getDef, MODE_KEYS, type ModeKey } from './objects.ts';

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'harder', 'insane', 'extreme'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  harder: 'Harder',
  insane: 'Insane',
  extreme: 'Extreme',
};

/** A color: "#rrggbb", or with opacity / additive blending. */
export type ColorDef = string | { c: string; a?: number; blend?: 1 };

/** Optional per-object properties. Keys are short to keep files compact. */
export interface ObjExtra {
  /** Rotation in degrees, clockwise. */
  r?: number;
  fx?: 1;
  fy?: 1;
  /** Uniform scale (deco only; collision objects ignore it). */
  s?: number;
  /** Main / detail color channel (number 1..99 or reserved name). */
  c?: number | string;
  c2?: number | string;
  /** Group ids (1..999). */
  g?: number[];
  /** Z layer override (-2..2). */
  z?: number;
  glow?: 0 | 1;
  beat?: 0 | 1;
  /** Portals: bounded play-area height in blocks. */
  h?: number;
  // ---- triggers
  /** Target group (move/alpha/rotate/pulse/toggle) or channel (color). */
  t?: number | string;
  /** Duration, seconds. */
  d?: number;
  e?: EasingId;
  /** Move delta in blocks. */
  dx?: number;
  dy?: number;
  /** Color trigger / pulse target color. */
  col?: string;
  /** Alpha target (alpha trigger) or color opacity (color trigger). */
  op?: number;
  /** Rotate trigger degrees. */
  deg?: number;
  /** Rotate trigger: center group (orbit around its first object). */
  cg?: number;
  /** Toggle trigger: 1 = show, 0 = hide. */
  on?: 0 | 1;
  /** Shake amplitude (blocks). */
  amp?: number;
  /** Pulse: fade in / hold / fade out (s). */
  fi?: number;
  hold?: number;
  fo?: number;
  /** Pulse: 1 = target is a group (t), else a channel (t). */
  pg?: 1;
}

/** [typeId, x, y, extra?] — x/y are the object's center in blocks. */
export type LevelObject = [number, number, number] | [number, number, number, ObjExtra];

export interface LevelMeta {
  name: string;
  author: string;
  difficulty: Difficulty;
  /** Built-in song id, or "custom:<id>" for an imported file. */
  song: string;
  /** Song time (s) at which level time 0 starts. */
  offset: number;
  /** Beat grid for pulsing and the editor (song time of first beat = beatOffset). */
  bpm: number;
  beatOffset: number;
  mode: ModeKey;
  speed: number;
  mini?: boolean;
  flipped?: boolean;
  /** Level end x in blocks. Defaults to last object + padding. */
  length?: number;
  /** Background / ground pattern ids. */
  bg?: number;
  ground?: number;
  colors: Record<string, ColorDef>;
  /** Shipped level id (for best scores); custom levels get one on save. */
  id?: string;
}

export interface ReplayJSON {
  /** Alternating press / release ticks, starting with a press. */
  ticks: number[];
  /** Tick on which the level completes, for verification. */
  end?: number;
  /** Hash of the final sim state: identical on every machine if the sim is deterministic. */
  hash?: string;
}

export interface LevelJSON {
  v: 1;
  meta: LevelMeta;
  objects: LevelObject[];
  replay?: ReplayJSON;
  coinReplay?: ReplayJSON;
}

export const DEFAULT_COLORS: Record<string, ColorDef> = {
  bg: '#3046d9',
  bg2: '#2437b3',
  g: '#2033a8',
  g2: '#16247a',
  line: '#ffffff',
  obj: '#ffffff',
  fill: '#000000',
};

export function defaultMeta(): LevelMeta {
  return {
    name: 'Untitled',
    author: 'Player',
    difficulty: 'normal',
    song: 'menu',
    offset: 0,
    bpm: 128,
    beatOffset: 0,
    mode: 'cube',
    speed: 1,
    colors: { ...DEFAULT_COLORS },
  };
}

export function emptyLevel(): LevelJSON {
  return { v: 1, meta: defaultMeta(), objects: [] };
}

function num(v: unknown, fallback: number, lo = -Infinity, hi = Infinity): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function str(v: unknown, fallback: string, maxLen = 200): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : fallback;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseColorDef(v: unknown): ColorDef | null {
  if (typeof v === 'string' && HEX.test(v)) return v.toLowerCase();
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.c === 'string' && HEX.test(o.c)) {
      const out: { c: string; a?: number; blend?: 1 } = { c: o.c.toLowerCase() };
      if (typeof o.a === 'number') out.a = num(o.a, 1, 0, 1);
      if (o.blend) out.blend = 1;
      return out;
    }
  }
  return null;
}

const EXTRA_NUM_KEYS = ['r', 's', 'z', 'h', 'd', 'dx', 'dy', 'op', 'deg', 'cg', 'amp', 'fi', 'hold', 'fo'] as const;

function parseExtra(v: unknown): ObjExtra | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: ObjExtra = {};
  for (const k of EXTRA_NUM_KEYS) {
    if (typeof o[k] === 'number' && Number.isFinite(o[k])) (out as Record<string, number>)[k] = o[k] as number;
  }
  if (o.fx) out.fx = 1;
  if (o.fy) out.fy = 1;
  if (o.pg) out.pg = 1;
  if (o.glow === 0 || o.glow === 1) out.glow = o.glow;
  if (o.beat === 0 || o.beat === 1) out.beat = o.beat;
  if (o.on === 0 || o.on === 1) out.on = o.on;
  if (typeof o.c === 'number' || typeof o.c === 'string') out.c = o.c;
  if (typeof o.c2 === 'number' || typeof o.c2 === 'string') out.c2 = o.c2;
  if (typeof o.t === 'number' || typeof o.t === 'string') out.t = o.t;
  if (typeof o.col === 'string' && HEX.test(o.col)) out.col = o.col.toLowerCase();
  if (typeof o.e === 'string' && o.e in EASING_NAMES) out.e = o.e as EasingId;
  if (Array.isArray(o.g)) {
    const groups = o.g.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 999);
    if (groups.length) out.g = groups.slice(0, 8);
  }
  return Object.keys(out).length ? out : undefined;
}

function parseReplay(v: unknown): ReplayJSON | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.ticks)) return undefined;
  const ticks: number[] = [];
  let last = -1;
  for (const t of o.ticks) {
    if (typeof t !== 'number' || !Number.isInteger(t) || t <= last) return undefined;
    ticks.push(t);
    last = t;
  }
  const out: ReplayJSON = { ticks };
  if (typeof o.end === 'number') out.end = o.end;
  if (typeof o.hash === 'string' && /^[0-9a-f]{8}$/.test(o.hash)) out.hash = o.hash;
  return out;
}

/** Parses untrusted level JSON (from a file, storage, or the network). Throws on garbage. */
export function parseLevel(input: unknown): LevelJSON {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!raw || typeof raw !== 'object') throw new Error('Level file is not an object');
  const o = raw as Record<string, unknown>;
  const m = (o.meta ?? {}) as Record<string, unknown>;
  const base = defaultMeta();
  const colors: Record<string, ColorDef> = { ...DEFAULT_COLORS };
  if (m.colors && typeof m.colors === 'object') {
    for (const [k, v] of Object.entries(m.colors as Record<string, unknown>)) {
      const c = parseColorDef(v);
      if (c) colors[k] = c;
    }
  }
  const meta: LevelMeta = {
    name: str(m.name, base.name, 40) || base.name,
    author: str(m.author, base.author, 40),
    difficulty: (DIFFICULTIES as readonly string[]).includes(m.difficulty as string) ? (m.difficulty as Difficulty) : base.difficulty,
    song: str(m.song, base.song, 80),
    offset: num(m.offset, 0, 0, 3600),
    bpm: num(m.bpm, base.bpm, 30, 300),
    beatOffset: num(m.beatOffset, 0, -60, 3600),
    mode: (MODE_KEYS as readonly string[]).includes(m.mode as string) ? (m.mode as ModeKey) : 'cube',
    speed: Math.round(num(m.speed, 1, 0, 4)),
    colors,
  };
  if (m.mini === true) meta.mini = true;
  if (m.flipped === true) meta.flipped = true;
  if (typeof m.length === 'number' && m.length > 0) meta.length = num(m.length, 0, 1, 100000);
  if (typeof m.bg === 'number') meta.bg = Math.round(num(m.bg, 0, 0, 99));
  if (typeof m.ground === 'number') meta.ground = Math.round(num(m.ground, 0, 0, 99));
  if (typeof m.id === 'string') meta.id = str(m.id, '', 80);

  const objects: LevelObject[] = [];
  if (Array.isArray(o.objects)) {
    for (const item of o.objects) {
      if (!Array.isArray(item) || item.length < 3) continue;
      const [type, x, y, extra] = item as unknown[];
      if (typeof type !== 'number' || !getDef(type)) continue;
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < -1000 || x > 100000 || y < -100 || y > 2000) continue;
      const ex = parseExtra(extra);
      objects.push(ex ? [type, x, y, ex] : [type, x, y]);
    }
  }
  const level: LevelJSON = { v: 1, meta, objects };
  const replay = parseReplay(o.replay);
  if (replay) level.replay = replay;
  const coinReplay = parseReplay(o.coinReplay);
  if (coinReplay) level.coinReplay = coinReplay;
  return level;
}

/** Round to 1/1000 block so files stay short and stable. */
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Serializes compactly: one object per line keeps diffs readable. */
export function serializeLevel(level: LevelJSON): string {
  const objs = level.objects.map((o) => {
    const arr: unknown[] = [o[0], r3(o[1]), r3(o[2])];
    if (o[3] && Object.keys(o[3]).length) arr.push(o[3]);
    return JSON.stringify(arr);
  });
  const head: Record<string, unknown> = { v: 1, meta: level.meta };
  const parts = [`${JSON.stringify(head).slice(0, -1)},"objects":[\n${objs.join(',\n')}\n]`];
  if (level.replay) parts.push(`"replay":${JSON.stringify(level.replay)}`);
  if (level.coinReplay) parts.push(`"coinReplay":${JSON.stringify(level.coinReplay)}`);
  return `${parts.join(',\n')}}\n`;
}

export function colorDefHex(c: ColorDef | undefined): string {
  if (!c) return '#ffffff';
  return typeof c === 'string' ? c : c.c;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
