import { TICK_RATE } from '../physics.ts';
import { Simulation, type TickInput } from './sim.ts';
import { cloneState, type SimState } from './state.ts';
import type { World } from './world.ts';

/**
 * Finds an input timeline that beats a level, using a beam search over
 * hold/release decisions every `step` ticks. Because every player state at a
 * given tick shares the same x, the beam is just the set of distinct vertical
 * states, which stays small. Used to generate and prove the shipped replays.
 */
export interface SolveOptions {
  step?: number;
  beam?: number;
  /** Prefer states that collected more coins (for coin routes). */
  wantCoins?: boolean;
  /** Required coin mask; states that pass a coin without it are pruned. */
  maxSeconds?: number;
  start?: SimState;
  /** Called occasionally with progress 0..1. */
  progress?: (p: number) => void;
  /** Penalize presses (cleaner, more human-like runs). */
  pressCost?: number;
}

interface Node {
  parent: Node | null;
  /** Tick at which this node's action starts. */
  tick: number;
  hold: boolean;
  presses: number;
}

interface BeamEntry {
  state: SimState;
  node: Node;
  hold: boolean;
  score: number;
}

export interface SolveResult {
  ok: boolean;
  ticks: number[];
  endTick: number;
  furthestX: number;
  coins: number;
}

function keyOf(s: SimState): string {
  let k = `${s.speed}|${s.dual ? 1 : 0}|${s.coins}|${s.boundsOn ? s.boundsLo : -1}`;
  for (const p of s.players) {
    k += `|${p.mode}${p.g}${p.mini ? 1 : 0}${p.onGround ? 1 : 0}${p.boost}${p.dashing ? 1 : 0}:${Math.round(p.y * 4)}:${Math.round(p.vy)}`;
  }
  return k;
}

function toTicks(node: Node): number[] {
  const seq: Node[] = [];
  for (let n: Node | null = node; n; n = n.parent) seq.push(n);
  seq.reverse();
  const ticks: number[] = [];
  let held = false;
  for (const n of seq) {
    if (n.hold !== held) {
      ticks.push(n.tick);
      held = n.hold;
    }
  }
  return ticks;
}

export function solve(world: World, opts: SolveOptions = {}): SolveResult {
  const step = opts.step ?? 4;
  const beamSize = opts.beam ?? 48;
  const maxTicks = Math.ceil((opts.maxSeconds ?? 400) * TICK_RATE);
  const sim = new Simulation(world, opts.start);
  const startTick = sim.state.tick;
  const root: Node = { parent: null, tick: startTick, hold: false, presses: 0 };
  let beam: BeamEntry[] = [{ state: cloneState(sim.state), node: root, hold: false, score: 0 }];
  let furthestX = sim.state.x;
  const input: TickInput = { held: false, pressed: false };
  const pressCost = opts.pressCost ?? 1;
  let lastReport = 0;

  while (beam.length) {
    const next = new Map<string, BeamEntry>();
    let done: BeamEntry | null = null;
    for (const entry of beam) {
      for (const hold of entry.hold ? [true, false] : [false, true]) {
        sim.reset(entry.state);
        const t0 = sim.state.tick;
        for (let k = 0; k < step; k++) {
          input.held = hold;
          input.pressed = hold && !entry.hold && k === 0;
          sim.step(input);
          sim.events.length = 0;
          if (sim.done) break;
        }
        const s = sim.state;
        if (s.dead) {
          if (s.x > furthestX) furthestX = s.x;
          continue;
        }
        const changed = hold !== entry.hold;
        const presses = entry.node.presses + (changed && hold ? 1 : 0);
        const node: Node = changed ? { parent: entry.node, tick: t0, hold, presses } : entry.node;
        const coinsN = popcount(s.coins);
        const score = (opts.wantCoins ? coinsN * 1000 : 0) - presses * pressCost;
        if (s.complete) {
          const e: BeamEntry = { state: s, node, hold, score };
          if (!done || score > done.score) done = e;
          continue;
        }
        if (s.x > furthestX) furthestX = s.x;
        const key = keyOf(s) + (hold ? 'H' : 'R');
        const prev = next.get(key);
        if (!prev || prev.score < score) next.set(key, { state: cloneState(s), node, hold, score });
      }
    }
    if (done && (!opts.wantCoins || next.size === 0 || popcount(done.state.coins) >= bestCoins(next))) {
      return { ok: true, ticks: toTicks(done.node), endTick: done.state.tick, furthestX, coins: done.state.coins };
    }
    let list = [...next.values()];
    if (list.length > beamSize) list = prune(list, beamSize);
    beam = list;
    if (beam.length && beam[0]!.state.tick > maxTicks) break;
    if (opts.progress && beam.length) {
      const p = (beam[0]!.state.x - world.startX) / (world.endX - world.startX);
      if (p - lastReport > 0.05) {
        lastReport = p;
        opts.progress(p);
      }
    }
  }
  return { ok: false, ticks: [], endTick: -1, furthestX, coins: 0 };
}

/** Coarse bucket: keeps the beam spread over the vertical space instead of collapsing onto one route. */
function bucketOf(s: SimState): string {
  let k = `${s.speed}|${s.dual ? 1 : 0}|${s.coins}`;
  for (const p of s.players) k += `|${p.mode}${p.g}${p.mini ? 1 : 0}${p.onGround ? 1 : 0}:${Math.round(p.y / 6)}:${Math.round(p.vy / 50)}`;
  return k;
}

function prune(list: BeamEntry[], beamSize: number): BeamEntry[] {
  const buckets = new Map<string, BeamEntry>();
  for (const e of list) {
    const k = bucketOf(e.state);
    const b = buckets.get(k);
    if (!b || e.score > b.score) buckets.set(k, e);
  }
  let out = [...buckets.values()];
  if (out.length <= beamSize) {
    // room left: refill with the best remaining entries
    const chosen = new Set(out);
    const rest = list.filter((e) => !chosen.has(e)).sort((a, b) => b.score - a.score);
    out.push(...rest.slice(0, beamSize - out.length));
    return out;
  }
  // too many buckets: always keep the best scores, then sample evenly by height
  out.sort((a, b) => b.score - a.score);
  const keep = out.slice(0, Math.floor(beamSize / 4));
  const rest = out.slice(keep.length).sort((a, b) => a.state.players[0]!.y - b.state.players[0]!.y);
  const need = beamSize - keep.length;
  const stride = rest.length / need;
  for (let i = 0; i < need; i++) keep.push(rest[Math.floor(i * stride)]!);
  return keep;
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

function bestCoins(m: Map<string, BeamEntry>): number {
  let b = 0;
  for (const e of m.values()) b = Math.max(b, popcount(e.state.coins));
  return b;
}
