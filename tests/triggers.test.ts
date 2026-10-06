import { describe, expect, it } from 'vitest';
import { Channel } from '../src/core/objects.ts';
import * as P from '../src/core/physics.ts';
import { Simulation, type TickInput } from '../src/core/sim/sim.ts';
import { cloneState, hashState } from '../src/core/sim/state.ts';
import { obj, run, world } from './helpers.ts';

const none = (): TickInput => ({ held: false, pressed: false });
/** Tick at which the player center reaches x (blocks) at normal speed. */
const tickAt = (blocks: number) => Math.ceil(((blocks * P.BLOCK) / P.SPEEDS[1]!) * P.TICK_RATE);

describe('color trigger', () => {
  it('fades a channel over its duration', () => {
    const s = new Simulation(world([obj('trig_color', 5.5, 0.5, { t: 'bg', col: '#ff0000', d: 1 })], { colors: { bg: '#0000ff' } }));
    const fire = tickAt(5.5);
    run(s, none, fire + 120);
    const ch = Channel.BG * 3;
    expect(s.state.col[ch]).toBeGreaterThan(0.4);
    expect(s.state.col[ch]).toBeLessThan(0.6);
    expect(s.state.col[ch + 2]).toBeGreaterThan(0.4);
    run(s, none, fire + 300);
    expect(s.state.col[ch]).toBeCloseTo(1, 5);
    expect(s.state.col[ch + 2]).toBeCloseTo(0, 5);
  });
});

describe('move trigger', () => {
  it('moves a group with easing, and moved solids collide where they are', () => {
    // A wall at block 20 that a move trigger lifts out of the way before the player arrives.
    const wall = [obj('block', 20.5, 0.5, { g: [1] }), obj('block', 20.5, 1.5, { g: [1] })];
    const without = new Simulation(world(wall));
    run(without, none, 3000);
    expect(without.state.dead).toBe(true);

    const trig = obj('trig_move', 8.5, 0.5, { t: 1, dy: 5, d: 0.5, e: 'l' });
    const s = new Simulation(world([...wall, trig]));
    const fire = tickAt(8.5);
    run(s, none, fire + 60);
    expect(s.state.gdy[1]).toBeCloseTo(2.5 * P.BLOCK, 0);
    run(s, none, 3000);
    expect(s.state.dead).toBe(false);
    expect(s.state.gdy[1]).toBeCloseTo(5 * P.BLOCK, 6);
  });

  it('eases (cubic out moves faster early)', () => {
    const mk = (e: 'l' | 'co') => {
      const s = new Simulation(world([obj('deco_ring', 30.5, 5, { g: [2] }), obj('trig_move', 4.5, 0.5, { t: 2, dx: 4, d: 1, e })]));
      run(s, none, tickAt(4.5) + 60);
      return s.state.gdx[2]!;
    };
    expect(mk('co')).toBeGreaterThan(mk('l'));
  });
});

describe('toggle and alpha triggers', () => {
  it('toggling a group off removes its collision', () => {
    const wall = [obj('block', 20.5, 0.5, { g: [3] })];
    const s = new Simulation(world([...wall, obj('trig_toggle', 10.5, 0.5, { t: 3, on: 0 })]));
    run(s, none, 3000);
    expect(s.state.dead).toBe(false);
    expect(s.state.ghidden[3]).toBe(1);
  });

  it('alpha fades a group but keeps it solid', () => {
    const wall = [obj('block', 20.5, 0.5, { g: [4] })];
    const s = new Simulation(world([...wall, obj('trig_alpha', 10.5, 0.5, { t: 4, op: 0, d: 0.2 })]));
    run(s, none, 3000);
    expect(s.state.galpha[4]).toBe(0);
    expect(s.state.dead).toBe(true);
  });
});

describe('rotate, pulse, shake', () => {
  it('rotates a group around a center group', () => {
    const objs = [
      obj('deco_ring', 30.5, 5.5, { g: [6] }), // center
      obj('saw', 33.5, 5.5, { g: [5] }), // orbits 3 blocks to the right
      obj('trig_rotate', 4.5, 0.5, { t: 5, deg: 90, d: 0, cg: 6 }),
    ];
    const s = new Simulation(world(objs));
    run(s, none, tickAt(5));
    s.objPos(1);
    // 90° clockwise: right of center → below center
    expect(s.ox).toBeCloseTo(30.5 * P.BLOCK, 6);
    expect(s.oy).toBeCloseTo(2.5 * P.BLOCK, 6);
  });

  it('pulse triggers are active for fade-in + hold + fade-out, shake emits an event', () => {
    const s = new Simulation(world([obj('trig_pulse', 4.5, 0.5, { t: 'bg', col: '#ffffff', fi: 0.1, hold: 0.2, fo: 0.2 }), obj('trig_shake', 4.5, 1.5, { amp: 0.5, d: 0.3 })]));
    let shook = false;
    while (s.state.tick < tickAt(4.5) + 10) {
      s.step(none());
      if (s.events.some((e) => e.type === 'shake')) shook = true;
      s.events.length = 0;
    }
    expect(shook).toBe(true);
    expect(s.state.pulses.length).toBe(1);
    run(s, none, tickAt(4.5) + 200);
    expect(s.state.pulses.length).toBe(0);
  });
});

describe('checkpoint determinism through running triggers', () => {
  it('restoring a snapshot taken mid-trigger reproduces the exact same future', () => {
    const objs = [
      obj('block', 26.5, 2.5, { g: [1] }),
      obj('trig_move', 8.5, 0.5, { t: 1, dy: -2, d: 2, e: 'sio' }),
      obj('trig_color', 9.5, 0.5, { t: 'g', col: '#ff8800', d: 3 }),
      obj('trig_alpha', 10.5, 0.5, { t: 1, op: 0.3, d: 2 }),
      obj('spike', 34.5, 0.5),
    ];
    const w = world(objs);
    const input = (t: number) => ({ held: t >= 800 && t < 806, pressed: t === 800 });
    const s = new Simulation(w);
    run(s, input, tickAt(12));
    expect(s.state.moves.length).toBe(1);
    const snap = cloneState(s.state);
    run(s, input, 2000);
    const ref = hashState(s.state);
    const s2 = new Simulation(w, snap);
    run(s2, input, 2000);
    expect(hashState(s2.state)).toBe(ref);
    expect(Array.from(s2.state.col)).toEqual(Array.from(s.state.col));
  });
});
