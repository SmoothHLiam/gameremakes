import { describe, expect, it } from 'vitest';
import * as P from '../src/core/physics.ts';
import { AutoCheckpoints } from '../src/core/sim/practice.ts';
import { Simulation } from '../src/core/sim/sim.ts';
import { cloneState, hashState } from '../src/core/sim/state.ts';
import { obj, world } from './helpers.ts';

describe('practice auto checkpoints', () => {
  it('commits snapshots only after the player survives a while', () => {
    const s = new Simulation(world([]));
    const auto = new AutoCheckpoints(2, 0.5);
    auto.reset(0);
    const committed: number[] = [];
    while (s.state.tick < 6 * P.TICK_RATE) {
      s.step({ held: false, pressed: false });
      s.events.length = 0;
      const c = auto.onTick(s.state);
      if (c) committed.push(c.tick);
    }
    // snapshots at ~2 s and ~4 s, each committed 0.5 s later
    expect(committed.length).toBe(2);
    expect(committed[0]).toBe(2 * P.TICK_RATE);
    expect(committed[1]).toBe(4 * P.TICK_RATE);
  });

  it('discards a pending snapshot if the player dies before surviving', () => {
    // spike placed so death happens ~0.3 s after the 2 s snapshot
    const deathX = (2.3 * P.SPEEDS[1]!) / P.BLOCK;
    const s = new Simulation(world([obj('spike', deathX + 0.5, 0.5)]));
    const auto = new AutoCheckpoints(2, 0.5);
    auto.reset(0);
    let commits = 0;
    while (!s.done && s.state.tick < 4 * P.TICK_RATE) {
      s.step({ held: false, pressed: false });
      s.events.length = 0;
      if (auto.onTick(s.state)) commits++;
    }
    expect(s.state.dead).toBe(true);
    auto.onDeath();
    expect(commits).toBe(0);
  });

  it('a checkpoint restores the complete state (mode, gravity, speed, size, dual, triggers)', () => {
    const objs = [
      obj('speed2', 6.5, 1), obj('portal_gravf', 9.5, 1.3), obj('portal_sizem', 12.5, 6), obj('portal_dualon', 15.5, 6),
      obj('trig_color', 16.5, 0.5, { t: 'bg', col: '#ff0000', d: 4 }), obj('ship', 18.5, 5),
    ];
    const w = world(objs);
    const s = new Simulation(w);
    while (s.state.tick < 3 * P.TICK_RATE && !s.done) {
      s.step({ held: false, pressed: false });
      s.events.length = 0;
    }
    const cp = cloneState(s.state);
    const h = hashState(cp);
    // play on, then restore
    while (s.state.tick < 5 * P.TICK_RATE && !s.done) s.step({ held: true, pressed: s.state.tick % 30 === 0 });
    s.reset(cp);
    expect(hashState(s.state)).toBe(h);
    expect(s.state.speed).toBe(cp.speed);
    expect(s.state.players.map((p) => [p.mode, p.g, p.mini])).toEqual(cp.players.map((p) => [p.mode, p.g, p.mini]));
    expect(Array.from(s.state.col)).toEqual(Array.from(cp.col));
  });
});
