import type { ReplayJSON } from '../level.ts';
import { TICK_RATE } from '../physics.ts';
import { Simulation, type SimEvent, type TickInput } from './sim.ts';
import { hashState, type SimState } from './state.ts';
import type { World } from './world.ts';

/**
 * Plays back a replay: `ticks` alternates press, release, press, … A press at
 * tick t means the button is down for the step that starts at tick t.
 */
export class InputTimeline {
  private readonly ticks: readonly number[];
  private idx = 0;
  private held = false;
  private readonly out: TickInput = { held: false, pressed: false };

  constructor(ticks: readonly number[]) {
    this.ticks = ticks;
  }

  /** Input for the step starting at `tick`. Ticks must be requested in increasing order. */
  at(tick: number): TickInput {
    let pressed = false;
    while (this.idx < this.ticks.length && this.ticks[this.idx]! <= tick) {
      const isPress = (this.idx & 1) === 0;
      if (isPress) pressed = true;
      this.held = isPress;
      this.idx++;
    }
    this.out.held = this.held || pressed;
    this.out.pressed = pressed;
    return this.out;
  }

  /** Skips forward so the next `at()` continues correctly from `tick`. */
  seek(tick: number): void {
    this.idx = 0;
    this.held = false;
    while (this.idx < this.ticks.length && this.ticks[this.idx]! < tick) {
      this.held = (this.idx & 1) === 0;
      this.idx++;
    }
  }
}

/**
 * Collects live input edges (already converted to ticks) and turns them into
 * per-tick input. A press and release landing on the same tick still counts as
 * a one-tick press. Also records the effective edges as a replay.
 */
export class InputQueue {
  private pending: Array<{ tick: number; down: boolean }> = [];
  private held = false;
  private deferRelease = false;
  readonly recorded: number[] = [];
  private readonly out: TickInput = { held: false, pressed: false };

  push(tick: number, down: boolean): void {
    this.pending.push({ tick, down });
  }

  /** Input for the step starting at `tick`. Edges scheduled in the past apply now. */
  at(tick: number): TickInput {
    let pressed = false;
    if (this.deferRelease) {
      this.deferRelease = false;
      if (this.held) {
        this.held = false;
        this.recorded.push(tick);
      }
    }
    let n = 0;
    for (const e of this.pending) {
      if (e.tick > tick) {
        this.pending[n++] = e;
        continue;
      }
      if (e.down) {
        if (!this.held) {
          this.held = true;
          pressed = true;
          this.recorded.push(tick);
        }
      } else if (this.held) {
        if (pressed) this.deferRelease = true;
        else {
          this.held = false;
          this.recorded.push(tick);
        }
      }
    }
    this.pending.length = n;
    this.out.held = this.held;
    this.out.pressed = pressed;
    return this.out;
  }

  /** Forget everything (new attempt). Keeps the hold state if the button is still physically down. */
  reset(physicallyDown: boolean, tick: number): void {
    this.pending.length = 0;
    this.recorded.length = 0;
    this.deferRelease = false;
    this.held = false;
    if (physicallyDown) this.push(tick, true);
  }
}

export interface ReplayResult {
  outcome: 'complete' | 'dead' | 'timeout';
  tick: number;
  state: SimState;
  hash: string;
  events: SimEvent[];
  coins: number;
  deathX: number;
}

/** Runs a replay headlessly from the level start. */
export function runReplay(
  world: World,
  replay: ReplayJSON | readonly number[],
  opts: { maxSeconds?: number; collectEvents?: boolean; start?: SimState } = {},
): ReplayResult {
  const ticks = Array.isArray(replay) ? (replay as readonly number[]) : (replay as ReplayJSON).ticks;
  const sim = new Simulation(world, opts.start);
  const input = new InputTimeline(ticks);
  if (opts.start) input.seek(opts.start.tick);
  const maxTicks = Math.ceil((opts.maxSeconds ?? 600) * TICK_RATE);
  const events: SimEvent[] = [];
  while (!sim.done && sim.state.tick < maxTicks) {
    sim.step(input.at(sim.state.tick));
    if (opts.collectEvents) events.push(...sim.events);
    sim.events.length = 0;
  }
  const s = sim.state;
  return {
    outcome: s.complete ? 'complete' : s.dead ? 'dead' : 'timeout',
    tick: s.tick,
    state: s,
    hash: hashState(s),
    events,
    coins: s.coins,
    deathX: s.x,
  };
}
