/**
 * Music-driven level composer.
 *
 * A level is written as a list of segments on the song's beat grid. For each
 * segment the composer:
 *   1. chooses the player's inputs on beats (that's what makes jumps land on
 *      the music),
 *   2. places structural objects (portals, platforms, pads, orbs),
 *   3. runs the real simulation to get the exact trajectory,
 *   4. places hazards only where they punish deviating from that trajectory,
 *      keeping a difficulty-dependent safety margin,
 *   5. re-verifies the segment, removing any hazard that the intended run
 *      would touch.
 * The verified inputs become the level's stored winning replay, so every
 * shipped level is provably beatable.
 */
import { type ColorDef, type Difficulty, type LevelJSON, type LevelObject, type ObjExtra, serializeLevel } from '../../src/core/level.ts';
import { GameMode, getDef, Kind, MODE_KEYS, type ModeKey, requireDef } from '../../src/core/objects.ts';
import * as P from '../../src/core/physics.ts';
import { InputTimeline, runReplay } from '../../src/core/sim/replay.ts';
import { playerBox, Simulation } from '../../src/core/sim/sim.ts';
import { cloneState, type SimState } from '../../src/core/sim/state.ts';
import { compileWorld, type World } from '../../src/core/sim/world.ts';
import { songInfo, type SongInfo, type SongSpec } from '../../src/core/audio/song.ts';
import { mulberry32 } from '../../src/core/dmath.ts';

const B = P.BLOCK;

export interface Tuning {
  /** Safety margin (units) between the intended path and hazards: smaller = harder. */
  margin: number;
  /** Max spikes under one cube jump. */
  maxSpikes: number;
  /** Fraction of eligible beats that carry a cube event. */
  density: number;
  /** Allow events on half beats. */
  halfBeats: boolean;
  /** Corridor clearance (blocks) above and below the path for ship / ufo / swing. */
  flyGap: number;
  /** Corridor clearance (blocks) for the wave. */
  waveGap: number;
  /** Chance of platform steps / pads / orb chains in cube sections. */
  platforms: number;
  pads: number;
  orbs: number;
  /** Cube rhythm patterns: beats within a bar where jumps may fall. */
  bars: number[][];
}

export interface Frame {
  tick: number;
  x: number;
  y: number[];
  bottom: number[];
  top: number[];
  g: number[];
  mode: number;
  onGround: boolean[];
  mini: boolean;
  dual: boolean;
  boundsOn: boolean;
  lo: number;
  hi: number;
  speed: number;
  halfW: number;
  halfH: number;
}

export interface Palette {
  bg: string;
  g: string;
  line: string;
  c1: string;
  c2: string;
  c3: string;
}

type Hold = [number, number];

export class LevelComposer {
  readonly song: SongSpec;
  readonly info: SongInfo;
  readonly spb: number;
  readonly objects: LevelObject[] = [];
  readonly holds: Hold[] = [];
  readonly coinHolds: Hold[] = [];
  readonly tuning: Tuning;
  readonly rand: () => number;
  meta: LevelJSON['meta'];
  /** State at the composition cursor and the trajectory recorded so far. */
  private cursor: SimState;
  readonly frames: Frame[] = [];
  private world: World;
  /** Indices of objects added as hazards (removable during verification). */
  private readonly hazardSet = new Set<number>();
  private removed = new Set<number>();
  /** Cells occupied by structural blocks placed by generators ("k,row"). */
  readonly solidCells = new Set<string>();
  /** Block style used by generators (changes per section for variety). */
  blockStyle = 'block';
  /** Glow on generated structure (drops). */
  glow = false;

  constructor(opts: {
    song: SongSpec;
    id: string;
    name: string;
    difficulty: Difficulty;
    tuning: Tuning;
    speed: number;
    colors: Record<string, ColorDef>;
    bg?: number;
    ground?: number;
    seed: number;
  }) {
    this.song = opts.song;
    this.info = songInfo(opts.song);
    this.spb = 60 / this.info.bpm;
    this.tuning = opts.tuning;
    this.rand = mulberry32(opts.seed);
    this.meta = {
      id: opts.id,
      name: opts.name,
      author: 'SUPER DASH',
      difficulty: opts.difficulty,
      song: opts.song.id,
      offset: 0,
      bpm: this.info.bpm,
      beatOffset: this.info.offset,
      mode: 'cube',
      speed: opts.speed,
      colors: { ...opts.colors },
      bg: opts.bg ?? 0,
      ground: opts.ground ?? 0,
      // effectively endless while composing; set to the song's end in finish()
      length: 100000,
    };
    this.world = compileWorld(this.level());
    const sim = new Simulation(this.world);
    this.cursor = cloneState(sim.state);
    this.frames.push(frameOf(this.cursor, 0));
  }

  // ------------------------------------------------------------ time / space

  tickOf(beat: number): number {
    return Math.round((this.info.offset + beat * this.spb) * P.TICK_RATE);
  }

  get cursorTick(): number {
    return this.cursor.tick;
  }

  get cursorState(): SimState {
    return this.cursor;
  }

  frameAt(tick: number): Frame {
    const f = this.frames[Math.max(0, Math.min(this.frames.length - 1, tick - this.frames[0]!.tick))];
    return f!;
  }

  /**
   * During composition removed hazards stay in the list as inert placeholders
   * so object indices (and per-object sim state) never shift; the final level
   * drops them and is re-verified from scratch.
   */
  level(final = false): LevelJSON {
    const placeholder = requireDef('deco_dots').id;
    const objects = final
      ? this.objects.filter((_, i) => !this.removed.has(i))
      : this.objects.map((o, i): LevelObject => (this.removed.has(i) ? [placeholder, o[1], -50] : o));
    return { v: 1, meta: { ...this.meta, colors: { ...this.meta.colors } }, objects };
  }

  // ------------------------------------------------------------ objects

  /** Add by exact center (blocks). Returns the object index. */
  put(key: string, x: number, y: number, extra?: ObjExtra, hazard = false): number {
    const def = requireDef(key);
    // Invariant: collidable objects must lie ahead of the committed trajectory,
    // otherwise the composed run and a fresh replay could disagree.
    if (def.kind !== Kind.Deco && def.kind !== Kind.Trigger && def.kind !== Kind.Coin && def.key !== 'orb_big') {
      const hit = def.hit ?? { x: 0, y: 0, w: def.w, h: def.h };
      const left = (x - Math.max(hit.w, hit.h) / 2) * B;
      const reach = this.cursor.x + 15;
      if (left < reach && y > -10) {
        throw new Error(`${this.meta?.name}: ${key} at x=${x.toFixed(2)} placed behind the committed trajectory (cursor x=${(this.cursor.x / B).toFixed(2)})`);
      }
    }
    const o: LevelObject = extra && Object.keys(extra).length ? [def.id, round3(x), round3(y), extra] : [def.id, round3(x), round3(y)];
    this.objects.push(o);
    const i = this.objects.length - 1;
    if (hazard) this.hazardSet.add(i);
    return i;
  }

  /** Add on the grid: cell (cx, cy) plus the definition's snap offset. */
  cell(key: string, cx: number, cy: number, extra?: ObjExtra, hazard = false): number {
    const def = requireDef(key);
    return this.put(key, cx + 0.5 + (def.snap?.x ?? 0), cy + 0.5 + (def.snap?.y ?? 0), extra, hazard);
  }

  hold(from: number, to: number): void {
    const last = this.holds[this.holds.length - 1];
    if (last && from <= last[1]) from = last[1] + 1;
    if (to <= from) to = from + 1;
    this.holds.push([from, to]);
  }

  tap(tick: number, len = 5): void {
    this.hold(tick, tick + len);
  }

  /** Replay ticks: alternating press / release. */
  ticks(holds: Hold[] = this.holds): number[] {
    const out: number[] = [];
    for (const [a, b] of holds) out.push(a, b);
    return out;
  }

  // ------------------------------------------------------------ simulation

  private recompile(): void {
    this.world = compileWorld(this.level());
  }

  /** Adapt a state captured against an older (smaller) world. */
  private adapt(s: SimState): SimState {
    const out = cloneState(s);
    const w = this.world;
    if (out.used.length !== w.n) {
      // objects are only ever appended during composition, so indices are stable
      const u = new Uint8Array(w.n);
      u.set(out.used.subarray(0, Math.min(out.used.length, w.n)));
      out.used = u;
    }
    const G = w.maxGroup + 1;
    if (out.gdx.length < G) {
      const grow = <T extends Float64Array | Float32Array | Int32Array | Uint8Array | Uint16Array>(a: T, make: (n: number) => T, fill?: number): T => {
        const b = make(G);
        if (fill !== undefined) b.fill(fill as never);
        b.set(a as never);
        return b;
      };
      out.gdx = grow(out.gdx, (n) => new Float64Array(n));
      out.gdy = grow(out.gdy, (n) => new Float64Array(n));
      out.gbx = grow(out.gbx, (n) => new Float64Array(n));
      out.gby = grow(out.gby, (n) => new Float64Array(n));
      out.grot = grow(out.grot, (n) => new Float64Array(n));
      out.gbrot = grow(out.gbrot, (n) => new Float64Array(n));
      out.gcenter = grow(out.gcenter, (n) => new Uint16Array(n));
      out.galpha = grow(out.galpha, (n) => new Float32Array(n), 1);
      out.gaFrom = grow(out.gaFrom, (n) => new Float32Array(n), 1);
      out.gaTo = grow(out.gaTo, (n) => new Float32Array(n), 1);
      out.gaStart = grow(out.gaStart, (n) => new Int32Array(n), -1);
      out.gaDur = grow(out.gaDur, (n) => new Int32Array(n));
      out.ghidden = grow(out.ghidden, (n) => new Uint8Array(n));
    }
    // triggers fired so far: everything with x <= player x
    let ptr = 0;
    while (ptr < w.triggers.length && w.triggers[ptr]!.x <= out.x) ptr++;
    out.trigPtr = ptr;
    return out;
  }

  /**
   * Simulates from the cursor to `untilTick` with the current objects and
   * inputs. Returns the frames and the death point (if any). Does not move
   * the cursor.
   */
  probe(untilTick: number, holds: Hold[] = this.holds, from: SimState = this.cursor): { frames: Frame[]; dead: { tick: number; x: number; y: number; p: number } | null; end: SimState } {
    this.recompile();
    const sim = new Simulation(this.world, this.adapt(from));
    const input = new InputTimeline(this.ticks(holds));
    input.seek(sim.state.tick);
    const frames: Frame[] = [];
    let dead: { tick: number; x: number; y: number; p: number } | null = null;
    while (sim.state.tick < untilTick && !sim.done) {
      sim.step(input.at(sim.state.tick));
      for (const e of sim.events) if (e.type === 'death') dead = { tick: sim.state.tick, x: e.x, y: e.y, p: e.p };
      sim.events.length = 0;
      frames.push(frameOf(sim.state, sim.state.tick));
    }
    return { frames, dead, end: cloneState(sim.state) };
  }

  /**
   * Commits the segment up to `untilTick`: verifies the intended run survives,
   * removing hazards that it touches, then advances the cursor.
   */
  commit(untilTick: number): void {
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = this.probe(untilTick);
      if (!r.dead) {
        this.frames.push(...r.frames);
        this.cursor = r.end;
        return;
      }
      if (!this.removeHazardNear(r.dead)) {
        const d = r.dead;
        const before = r.frames[Math.max(0, r.frames.length - 6)];
        const near = this.objects
          .map((o, i) => ({ o, i }))
          .filter(({ o, i }) => !this.removed.has(i) && Math.abs(o[1] * B - d.x) < 2.5 * B && Math.abs(o[2] * B - d.y) < 3 * B)
          .map(({ o }) => `${getDef(o[0])?.key}@${o[1]},${o[2]}`)
          .join(' ');
        const beat = ((d.tick / P.TICK_RATE - this.info.offset) / this.spb).toFixed(2);
        throw new Error(
          `${this.meta.name}: intended run dies at x=${(d.x / B).toFixed(2)} y=${(d.y / B).toFixed(2)} beat ${beat} (bar ${(Number(beat) / 4).toFixed(1)}) ` +
            `mode=${before ? MODE_KEYS[before.mode] : '?'} g=${before?.g.join('/')} bounds=${before?.boundsOn ? `${before.lo / B}-${before.hi / B}` : 'none'} near: ${near}`,
        );
      }
    }
    throw new Error(`${this.meta.name}: could not make segment safe`);
  }

  /** Removes the hazard nearest to a death point. */
  private removeHazardNear(d: { x: number; y: number }): boolean {
    let best = -1;
    let bestDist = Infinity;
    for (const i of this.hazardSet) {
      if (this.removed.has(i)) continue;
      const o = this.objects[i]!;
      const dx = o[1] * B - d.x;
      const dy = o[2] * B - d.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist && Math.abs(dx) < 4 * B && Math.abs(dy) < 4 * B) {
        bestDist = dist;
        best = i;
      }
    }
    if (best < 0) return false;
    this.removed.add(best);
    return true;
  }

  // ------------------------------------------------------------ portals

  /** Places a mode portal so the player enters it on the given tick. */
  modePortal(tick: number, mode: ModeKey, heightBlocks?: number): void {
    const f = this.predict(Math.max(tick, this.cursor.tick + 25));
    const key = mode;
    const def = getDef(requireDef(key).id)!;
    void def;
    const y = Math.max(1.5, f.y[0]! / B);
    const extra: ObjExtra = heightBlocks ? { h: heightBlocks } : {};
    this.put(key, f.x / B + 0.9, y, extra);
  }

  speedPortal(tick: number, speed: number): void {
    const f = this.predict(Math.max(tick, this.cursor.tick + 25));
    this.put(`speed${speed}`, f.x / B + 0.9, Math.max(1, f.y[0]! / B));
  }

  portal(tick: number, key: string): void {
    const f = this.predict(Math.max(tick, this.cursor.tick + 25));
    this.put(key, f.x / B + 0.85, Math.max(1.3, f.y[0]! / B));
  }

  /** Position the player will have at `tick` given current objects/inputs. */
  predict(tick: number): Frame {
    if (tick <= this.cursor.tick) return this.frameAt(tick);
    const r = this.probe(tick);
    return r.frames[r.frames.length - 1] ?? frameOf(this.cursor, this.cursor.tick);
  }

  // ------------------------------------------------------------ hazards from trajectory

  /**
   * Spike cells (on a floor at floorY units, pointing up for g=1 floors) that
   * the given frames clear with the tuning margin. Returns cell indices.
   */
  safeSpikeCells(frames: Frame[], floorY: number, p = 0, ceiling = false): number[] {
    if (!frames.length) return [];
    const x0 = Math.floor(frames[0]!.x / B) - 1;
    const x1 = Math.ceil(frames[frames.length - 1]!.x / B) + 1;
    const out: number[] = [];
    const m = this.tuning.margin;
    for (let k = x0; k <= x1; k++) {
      const c = (k + 0.5) * B;
      let ok = true;
      let touched = false;
      for (const f of frames) {
        const dx = Math.abs(f.x - c);
        if (dx > 3 + f.halfW + 1.5) continue;
        touched = true;
        // clearance above the spike hitbox (16 units) and visually over the tip
        const need = dx < 8 ? 25 : 16 + m;
        const h = ceiling ? floorY - f.top[p]! : f.bottom[p]! - floorY;
        if (h < need + (dx < 8 ? m * 0.5 : 0)) {
          ok = false;
          break;
        }
      }
      if (ok && touched) out.push(k);
    }
    return out;
  }

  /** Index of frames within [t0, t1). */
  framesBetween(t0: number, t1: number): Frame[] {
    const base = this.frames[0]!.tick;
    return this.frames.slice(Math.max(0, t0 - base), Math.max(0, t1 - base));
  }

  // ------------------------------------------------------------ output

  /** Debug: first tick where a fresh run of the current level diverges from the composed frames. */
  divergence(): string {
    this.recompile();
    const sim = new Simulation(compileWorld(this.level(true)));
    const input = new InputTimeline(this.ticks());
    const base = this.frames[0]!.tick;
    while (!sim.done && sim.state.tick < this.frames[this.frames.length - 1]!.tick) {
      sim.step(input.at(sim.state.tick));
      sim.events.length = 0;
      const f = this.frames[sim.state.tick - base];
      if (!f) break;
      const p = sim.state.players[0]!;
      if (Math.abs(p.y - f.y[0]!) > 1e-6 || Math.abs(sim.state.x - f.x) > 1e-6) {
        return `diverges at tick ${sim.state.tick} (beat ${((sim.state.tick / P.TICK_RATE - this.info.offset) / this.spb).toFixed(2)}): fresh x=${(sim.state.x / B).toFixed(3)} y=${(p.y / B).toFixed(3)} vy=${p.vy.toFixed(1)} mode=${MODE_KEYS[p.mode]} gnd=${p.onGround} boost=${p.boost} | composed x=${(f.x / B).toFixed(3)} y=${(f.y[0]! / B).toFixed(3)} mode=${MODE_KEYS[f.mode]} gnd=${f.onGround[0]}`;
      }
    }
    return 'no divergence';
  }

  finish(endBeat: number): LevelJSON {
    const f = this.predict(this.tickOf(endBeat));
    this.meta.length = Math.round(f.x / B) + 1;
    const level = this.level(true);
    const world = compileWorld(level);
    const main = runReplay(world, this.ticks());
    if (main.outcome !== 'complete') {
      console.error('  ' + this.divergence());
      // diagnose: compare against the composition trajectory
      const fr = this.frames.find((f) => f.tick === main.tick);
      const near = level.objects
        .filter((o) => Math.abs(o[1] * B - main.deathX) < 2.5 * B)
        .map((o) => `${getDef(o[0])?.key}@${o[1]},${o[2]}`)
        .join(' ');
      const p0 = main.state.players[0]!;
      throw new Error(
        `${this.meta.name}: final replay ${main.outcome} at x=${(main.deathX / B).toFixed(1)} tick ${main.tick} y=${(p0.y / B).toFixed(2)} mode=${MODE_KEYS[p0.mode]} g=${p0.g} ` +
          `| composed y=${fr ? (fr.y[0]! / B).toFixed(2) : '?'} mode=${fr ? MODE_KEYS[fr.mode] : '?'} | near: ${near}`,
      );
    }
    level.replay = { ticks: this.ticks(), end: main.tick, hash: main.hash };
    if (this.coinHolds.length) {
      const all = mergeHolds(this.holds, this.coinHolds);
      const c = runReplay(world, this.ticks(all));
      if (c.outcome !== 'complete') throw new Error(`${this.meta.name}: coin replay ${c.outcome} at x=${(c.deathX / B).toFixed(1)}`);
      level.coinReplay = { ticks: this.ticks(all), end: c.tick, hash: c.hash };
      level.coinReplay.end = c.tick;
      (level as LevelJSON & { _coins?: number }) ._coins = c.coins;
    }
    return level;
  }

  json(level: LevelJSON): string {
    const l = { ...level } as LevelJSON & { _coins?: number };
    delete l._coins;
    return serializeLevel(l);
  }

  removeObject(i: number): void {
    this.removed.add(i);
  }

  /** Full simulation from the level start with the given inputs. */
  probeFromStart(untilTick: number, holds: Hold[]): { frames: Frame[]; dead: { tick: number; x: number; y: number; p: number } | null; end: SimState; coins: number } {
    this.recompile();
    const sim = new Simulation(this.world);
    const r = this.probe(untilTick, holds, sim.state);
    return { ...r, coins: r.end.coins };
  }

  get removedCount(): number {
    return this.removed.size;
  }

  get objectCount(): number {
    return this.objects.length - this.removed.size;
  }

  /** Coin route: extra inputs merged with the main ones, verified at the end. */
  coinHold(from: number, to: number): void {
    this.coinHolds.push([from, to]);
  }

  isHazardRemoved(i: number): boolean {
    return this.removed.has(i);
  }

  get currentWorld(): World {
    return this.world;
  }
}

export function mergeHolds(a: Hold[], b: Hold[]): Hold[] {
  const all = [...a, ...b].sort((x, y) => x[0] - y[0]);
  const out: Hold[] = [];
  for (const h of all) {
    const last = out[out.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else out.push([h[0], h[1]]);
  }
  return out;
}

function frameOf(s: SimState, tick: number): Frame {
  const p0 = s.players[0]!;
  const box = playerBox(p0);
  return {
    tick,
    x: s.x,
    y: s.players.map((p) => p.y),
    bottom: s.players.map((p) => p.y - playerBox(p).halfH),
    top: s.players.map((p) => p.y + playerBox(p).halfH),
    g: s.players.map((p) => p.g),
    mode: p0.mode,
    onGround: s.players.map((p) => p.onGround),
    mini: p0.mini,
    dual: s.dual,
    boundsOn: s.boundsOn,
    lo: s.boundsLo,
    hi: s.boundsHi,
    speed: s.speed,
    halfW: box.halfW,
    halfH: box.halfH,
  };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export { B, GameMode, Kind, MODE_KEYS };
