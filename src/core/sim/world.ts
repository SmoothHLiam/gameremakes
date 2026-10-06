import { type LevelJSON, type ObjExtra, colorDefHex, hexToRgb } from '../level.ts';
import {
  Channel, CHANNEL_COUNT, CHANNEL_NAMES, GameMode, getDef, Kind, MODE_KEYS, parseChannel, PortalType, TriggerType,
} from '../objects.ts';
import { BLOCK, CHUNK_WIDTH, DEFAULT_SPEED, END_PADDING, SPEEDS, SPAWN_X } from '../physics.ts';

/** Slope solid corner (where the right angle sits). */
export const Corner = { BR: 0, BL: 1, TR: 2, TL: 3 } as const;

export interface TriggerDef {
  obj: number;
  type: number;
  x: number;
  /** Target group, or channel for color/pulse-channel triggers. */
  target: number;
  dur: number;
  ease: ObjExtra['e'];
  dx: number;
  dy: number;
  rgb: [number, number, number];
  op: number;
  deg: number;
  centerGroup: number;
  on: boolean;
  amp: number;
  fi: number;
  hold: number;
  fo: number;
  pulseGroup: boolean;
}

/** Compiled, immutable level data. Positions are in units (30 per block). */
export interface World {
  level: LevelJSON;
  n: number;
  type: Uint16Array;
  kind: Uint8Array;
  sub: Uint8Array;
  val: Int16Array;
  x: Float64Array;
  y: Float64Array;
  rot: Float64Array;
  /** bit0 = flip x, bit1 = flip y */
  flip: Uint8Array;
  scale: Float32Array;
  /** Half extents of the visual footprint (unrotated), units. */
  vw: Float64Array;
  vh: Float64Array;
  /** Collision box: center offset and half size, after 90°-snapped static rotation/flip. */
  hx: Float64Array;
  hy: Float64Array;
  hw: Float64Array;
  hh: Float64Array;
  /** Circle radius (saws), units. */
  hr: Float64Array;
  corner: Uint8Array;
  slopeK: Float64Array;
  c1: Uint8Array;
  c2: Uint8Array;
  layer: Int8Array;
  glow: Uint8Array;
  beat: Uint8Array;
  /** Bounded play-area height (blocks) for portals; 0 = default. */
  boundsH: Float64Array;
  groupStart: Uint32Array;
  groupList: Uint16Array;
  /** Objects per group id. */
  groupMembers: Map<number, number[]>;
  /** Groups touched by move/rotate triggers (positions can change). */
  movingGroups: Set<number>;
  /** Collision chunks (CSR). */
  chunkCount: number;
  chunkStart: Uint32Array;
  chunkList: Uint32Array;
  /** Visual chunks (CSR) — every object (the game view skips triggers). */
  vchunkStart: Uint32Array;
  vchunkList: Uint32Array;
  triggers: TriggerDef[];
  /** Coin object indices in x order (coin 0, 1, 2). */
  coins: number[];
  endX: number;
  startX: number;
  maxY: number;
  baseColors: Float32Array;
  baseAlpha: Float32Array;
  baseBlend: Uint8Array;
  start: { mode: number; speed: number; mini: boolean; flipped: boolean };
  /** Speed-change portals by x, for time ↔ x mapping. */
  speedChanges: Array<{ x: number; speed: number }>;
  maxGroup: number;
}

function snapRot90(deg: number): number {
  const r = Math.round(deg / 90) * 90;
  return ((r % 360) + 360) % 360;
}

/** Rotates an offset (clockwise degrees, y up) by a multiple of 90. */
function rot90(x: number, y: number, deg: number): [number, number] {
  switch (deg) {
    case 90: return [y, -x];
    case 180: return [-x, -y];
    case 270: return [-y, x];
    default: return [x, y];
  }
}

export function chunkOf(x: number): number {
  return Math.floor(x / CHUNK_WIDTH);
}

export function compileWorld(level: LevelJSON): World {
  const objs = level.objects;
  const n = objs.length;
  const w: World = {
    level,
    n,
    type: new Uint16Array(n),
    kind: new Uint8Array(n),
    sub: new Uint8Array(n),
    val: new Int16Array(n),
    x: new Float64Array(n),
    y: new Float64Array(n),
    rot: new Float64Array(n),
    flip: new Uint8Array(n),
    scale: new Float32Array(n),
    vw: new Float64Array(n),
    vh: new Float64Array(n),
    hx: new Float64Array(n),
    hy: new Float64Array(n),
    hw: new Float64Array(n),
    hh: new Float64Array(n),
    hr: new Float64Array(n),
    corner: new Uint8Array(n),
    slopeK: new Float64Array(n),
    c1: new Uint8Array(n),
    c2: new Uint8Array(n),
    layer: new Int8Array(n),
    glow: new Uint8Array(n),
    beat: new Uint8Array(n),
    boundsH: new Float64Array(n),
    groupStart: new Uint32Array(n + 1),
    groupList: new Uint16Array(0),
    groupMembers: new Map(),
    movingGroups: new Set(),
    chunkCount: 0,
    chunkStart: new Uint32Array(1),
    chunkList: new Uint32Array(0),
    vchunkStart: new Uint32Array(1),
    vchunkList: new Uint32Array(0),
    triggers: [],
    coins: [],
    endX: 0,
    startX: SPAWN_X,
    maxY: 0,
    baseColors: new Float32Array(CHANNEL_COUNT * 3),
    baseAlpha: new Float32Array(CHANNEL_COUNT),
    baseBlend: new Uint8Array(CHANNEL_COUNT),
    start: {
      mode: Math.max(0, MODE_KEYS.indexOf(level.meta.mode)),
      speed: level.meta.speed ?? DEFAULT_SPEED,
      mini: !!level.meta.mini,
      flipped: !!level.meta.flipped,
    },
    speedChanges: [],
    maxGroup: 0,
  };

  // ---- colors
  w.baseAlpha.fill(1);
  const setColor = (ch: number, hex: string, a = 1, blend = false) => {
    const [r, g, b] = hexToRgb(hex);
    w.baseColors[ch * 3] = r;
    w.baseColors[ch * 3 + 1] = g;
    w.baseColors[ch * 3 + 2] = b;
    w.baseAlpha[ch] = a;
    w.baseBlend[ch] = blend ? 1 : 0;
  };
  for (let ch = 0; ch < CHANNEL_COUNT; ch++) setColor(ch, '#ffffff');
  setColor(Channel.Black, '#000000');
  setColor(Channel.Fill, '#000000');
  for (const [key, def] of Object.entries(level.meta.colors)) {
    const ch = key in CHANNEL_NAMES ? CHANNEL_NAMES[key]! : Number(key);
    if (!Number.isInteger(ch) || ch < 0 || ch >= CHANNEL_COUNT) continue;
    const a = typeof def === 'string' ? 1 : (def.a ?? 1);
    const blend = typeof def === 'string' ? false : !!def.blend;
    setColor(ch, colorDefHex(def), a, blend);
  }

  // ---- objects
  const groupLists: number[][] = [];
  let maxRight = 0;
  let maxY = 0;
  const coinList: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = objs[i]!;
    const def = getDef(o[0])!;
    const ex = o[3];
    w.type[i] = def.id;
    w.kind[i] = def.kind;
    w.sub[i] = def.sub ?? 0;
    w.val[i] = def.val ?? 0;
    w.x[i] = o[1] * BLOCK;
    w.y[i] = o[2] * BLOCK;
    const rot = ex?.r ?? 0;
    w.rot[i] = rot;
    const fx = ex?.fx ? 1 : 0;
    const fy = ex?.fy ? 1 : 0;
    w.flip[i] = fx | (fy << 1);
    const isDeco = def.kind === Kind.Deco;
    w.scale[i] = isDeco ? (ex?.s ?? 1) : 1;
    w.vw[i] = (def.w * BLOCK * w.scale[i]!) / 2;
    w.vh[i] = (def.h * BLOCK * w.scale[i]!) / 2;
    w.c1[i] = parseChannel(ex?.c, def.c);
    w.c2[i] = parseChannel(ex?.c2, def.c2);
    w.layer[i] = Math.max(-2, Math.min(2, Math.round(ex?.z ?? def.layer)));
    w.glow[i] = (ex?.glow ?? (def.glow ? 1 : 0)) ? 1 : 0;
    w.beat[i] = (ex?.beat ?? (def.beat ? 1 : 0)) ? 1 : 0;
    w.boundsH[i] = ex?.h ?? 0;

    // collision geometry (static rotation snapped to 90°)
    const r90 = snapRot90(rot);
    const hit = def.hit ?? { x: 0, y: 0, w: def.w, h: def.h };
    let ox = hit.x * BLOCK;
    let oy = hit.y * BLOCK;
    if (fx) ox = -ox;
    if (fy) oy = -oy;
    const [rx, ry] = rot90(ox, oy, r90);
    w.hx[i] = rx;
    w.hy[i] = ry;
    const swap = r90 === 90 || r90 === 270;
    w.hw[i] = ((swap ? hit.h : hit.w) * BLOCK) / 2;
    w.hh[i] = ((swap ? hit.w : hit.h) * BLOCK) / 2;
    w.hr[i] = (def.r ?? 0) * BLOCK;
    if (def.kind === Kind.Slope) {
      // Base orientation: right angle at bottom-right (floor rising to the right).
      // Express the corner as a vector, flip, rotate, then read it back.
      let cx = 1;
      let cy = -1;
      if (fx) cx = -cx;
      if (fy) cy = -cy;
      const [qx, qy] = rot90(cx, cy, r90);
      w.corner[i] = qy < 0 ? (qx > 0 ? Corner.BR : Corner.BL) : qx > 0 ? Corner.TR : Corner.TL;
      w.slopeK[i] = w.hh[i]! / w.hw[i]!;
    }

    const groups = ex?.g ?? [];
    groupLists.push(groups);
    for (const g of groups) {
      let list = w.groupMembers.get(g);
      if (!list) w.groupMembers.set(g, (list = []));
      list.push(i);
      if (g > w.maxGroup) w.maxGroup = g;
    }

    if (def.kind === Kind.Trigger) {
      w.triggers.push(makeTrigger(i, def.sub ?? 0, w.x[i]!, ex ?? {}));
    } else {
      const right = w.x[i]! + Math.max(w.vw[i]!, w.vh[i]!);
      if (right > maxRight) maxRight = right;
      const top = w.y[i]! + Math.max(w.vw[i]!, w.vh[i]!);
      if (top > maxY) maxY = top;
    }
    if (def.kind === Kind.Coin) coinList.push(i);
    if (def.kind === Kind.Portal && def.sub === PortalType.Speed) {
      w.speedChanges.push({ x: w.x[i]! - w.hw[i]!, speed: def.val ?? 1 });
    }
  }
  w.maxY = maxY;
  w.speedChanges.sort((a, b) => a.x - b.x);
  coinList.sort((a, b) => w.x[a]! - w.x[b]!);
  w.coins = coinList.slice(0, 3);

  // group CSR
  let total = 0;
  for (const g of groupLists) total += g.length;
  w.groupList = new Uint16Array(total);
  let p = 0;
  for (let i = 0; i < n; i++) {
    w.groupStart[i] = p;
    for (const g of groupLists[i]!) w.groupList[p++] = g;
  }
  w.groupStart[n] = p;

  // triggers sorted by x (stable by index)
  w.triggers.sort((a, b) => a.x - b.x || a.obj - b.obj);
  for (const t of w.triggers) {
    if (t.type === TriggerType.Move || t.type === TriggerType.Rotate) w.movingGroups.add(t.target);
  }

  w.endX = level.meta.length ? level.meta.length * BLOCK : Math.max(maxRight + END_PADDING, 20 * BLOCK);

  buildChunks(w);
  return w;
}

function makeTrigger(obj: number, type: number, x: number, ex: ObjExtra): TriggerDef {
  const isColorTarget = type === TriggerType.Color || (type === TriggerType.Pulse && !ex.pg);
  const target = isColorTarget ? parseChannel(ex.t, 1) : typeof ex.t === 'number' ? Math.round(ex.t) : Number(ex.t) || 0;
  return {
    obj,
    type,
    x,
    target,
    dur: Math.max(0, ex.d ?? (type === TriggerType.Shake ? 0.3 : 0.5)),
    ease: ex.e,
    dx: (ex.dx ?? 0) * BLOCK,
    dy: (ex.dy ?? 0) * BLOCK,
    rgb: hexToRgb(ex.col ?? '#ffffff'),
    op: ex.op ?? (type === TriggerType.Alpha ? 0 : 1),
    deg: ex.deg ?? 90,
    centerGroup: ex.cg ?? 0,
    on: ex.on !== 0,
    amp: (ex.amp ?? 0.3) * BLOCK,
    fi: Math.max(0, ex.fi ?? 0.05),
    hold: Math.max(0, ex.hold ?? 0.1),
    fo: Math.max(0, ex.fo ?? 0.3),
    pulseGroup: !!ex.pg,
  };
}

/** Max distance (units) any object of a group can be displaced by triggers. */
function groupEnvelopes(w: World): Map<number, { x0: number; x1: number; y0: number; y1: number; rad: number }> {
  const env = new Map<number, { x0: number; x1: number; y0: number; y1: number; rad: number }>();
  const get = (g: number) => {
    let e = env.get(g);
    if (!e) env.set(g, (e = { x0: 0, x1: 0, y0: 0, y1: 0, rad: 0 }));
    return e;
  };
  for (const t of w.triggers) {
    if (t.type === TriggerType.Move) {
      const e = get(t.target);
      // Back easing overshoots ~10%; be generous.
      const k = t.ease && t.ease.startsWith('b') ? 1.2 : 1;
      if (t.dx < 0) e.x0 += t.dx * k; else e.x1 += t.dx * k;
      if (t.dy < 0) e.y0 += t.dy * k; else e.y1 += t.dy * k;
    } else if (t.type === TriggerType.Rotate && t.centerGroup) {
      const e = get(t.target);
      const centers = w.groupMembers.get(t.centerGroup);
      const members = w.groupMembers.get(t.target);
      if (!centers?.length || !members) continue;
      const c = centers[0]!;
      let rad = 0;
      for (const m of members) {
        const dx = w.x[m]! - w.x[c]!;
        const dy = w.y[m]! - w.y[c]!;
        rad = Math.max(rad, Math.sqrt(dx * dx + dy * dy));
      }
      e.rad = Math.max(e.rad, rad);
    }
  }
  return env;
}

function buildChunks(w: World): void {
  const count = Math.max(1, chunkOf(w.endX + 40 * BLOCK) + 2);
  w.chunkCount = count;
  const env = groupEnvelopes(w);
  const ranges: Array<[number, number]> = new Array(w.n);
  for (let i = 0; i < w.n; i++) {
    const ext = Math.max(w.vw[i]!, w.vh[i]!, w.hw[i]! + Math.abs(w.hx[i]!), w.hh[i]! + Math.abs(w.hy[i]!), w.hr[i]!) + 2;
    let x0 = w.x[i]! - ext;
    let x1 = w.x[i]! + ext;
    for (let k = w.groupStart[i]!; k < w.groupStart[i + 1]!; k++) {
      const e = env.get(w.groupList[k]!);
      if (!e) continue;
      x0 += e.x0 - e.rad * 2;
      x1 += e.x1 + e.rad * 2;
    }
    ranges[i] = [Math.max(0, chunkOf(x0)), Math.max(0, Math.min(count - 1, chunkOf(x1)))];
  }
  const build = (include: (i: number) => boolean): [Uint32Array, Uint32Array] => {
    const counts = new Uint32Array(count + 1);
    for (let i = 0; i < w.n; i++) {
      if (!include(i)) continue;
      const [a, b] = ranges[i]!;
      for (let c = a; c <= b; c++) counts[c + 1]!++;
    }
    for (let c = 0; c < count; c++) counts[c + 1]! += counts[c]!;
    const list = new Uint32Array(counts[count]!);
    const fill = counts.slice(0, count);
    for (let i = 0; i < w.n; i++) {
      if (!include(i)) continue;
      const [a, b] = ranges[i]!;
      for (let c = a; c <= b; c++) list[fill[c]!++] = i;
    }
    return [counts, list];
  };
  [w.chunkStart, w.chunkList] = build((i) => w.kind[i] !== Kind.Deco && w.kind[i] !== Kind.Trigger);
  // visual chunks include triggers so the editor can show them (gameplay skips them)
  [w.vchunkStart, w.vchunkList] = build(() => true);
}

/** Level time (seconds) at which the player reaches x, following speed portals. */
export function timeAtX(w: World, x: number, startSpeed = w.start.speed): number {
  let t = 0;
  let cx = w.startX;
  let speed = SPEEDS[startSpeed]!;
  for (const sc of w.speedChanges) {
    if (sc.x >= x) break;
    if (sc.x > cx) {
      t += (sc.x - cx) / speed;
      cx = sc.x;
    }
    speed = SPEEDS[sc.speed]!;
  }
  return t + Math.max(0, x - cx) / speed;
}

/** Inverse of timeAtX. */
export function xAtTime(w: World, time: number, startSpeed = w.start.speed): number {
  let t = 0;
  let cx = w.startX;
  let speed = SPEEDS[startSpeed]!;
  for (const sc of w.speedChanges) {
    if (sc.x <= cx) {
      speed = SPEEDS[sc.speed]!;
      continue;
    }
    const segT = (sc.x - cx) / speed;
    if (t + segT >= time) break;
    t += segT;
    cx = sc.x;
    speed = SPEEDS[sc.speed]!;
  }
  return cx + (time - t) * speed;
}

export const START_MODE_CUBE = GameMode.Cube;
