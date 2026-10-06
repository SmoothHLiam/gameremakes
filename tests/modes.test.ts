import { describe, expect, it } from 'vitest';
import { GameMode } from '../src/core/objects.ts';
import * as P from '../src/core/physics.ts';
import { Simulation, type TickInput } from '../src/core/sim/sim.ts';
import { obj, run, world } from './helpers.ts';

const hold = (from: number, to: number) => (t: number): TickInput => ({ held: t >= from && t < to, pressed: t === from });
const presses = (ticks: number[]) => (t: number): TickInput => ({ held: ticks.includes(t), pressed: ticks.includes(t) });
const none = (): TickInput => ({ held: false, pressed: false });

function sim(mode: 'cube' | 'ship' | 'ball' | 'ufo' | 'wave' | 'robot' | 'spider' | 'swing', extra: Parameters<typeof world>[1] = {}) {
  return new Simulation(world([], { mode, ...extra }));
}

describe('ship', () => {
  it('holding thrusts up to a capped rise speed; releasing falls to a capped fall speed', () => {
    const s = sim('ship');
    let maxVy = 0;
    run(s, hold(0, 120), 120, (x) => (maxVy = Math.max(maxVy, x.state.players[0]!.vy)));
    expect(maxVy).toBeCloseTo(P.SHIP_MAX_RISE, 6);
    let minVy = 0;
    run(s, none, 480, (x) => (minVy = Math.min(minVy, x.state.players[0]!.vy)));
    expect(minVy).toBeCloseTo(-P.SHIP_MAX_FALL, 6);
  });

  it('slides along the bounded ceiling and floor without dying', () => {
    const s = sim('ship');
    run(s, hold(0, 900), 900);
    expect(s.state.dead).toBe(false);
    const p = s.state.players[0]!;
    expect(p.onCeiling).toBe(true);
    expect(p.y + 21 / 2).toBeCloseTo(s.state.boundsHi, 6);
  });
});

describe('ball', () => {
  it('a press while grounded flips gravity and rolls to the other surface', () => {
    const s = sim('ball');
    run(s, presses([10]), 200);
    const p = s.state.players[0]!;
    expect(p.g).toBe(-1);
    expect(p.onGround).toBe(true);
    expect(p.y + 15).toBeCloseTo(s.state.boundsHi, 6);
  });

  it('ignores presses in mid-air (beyond the press buffer)', () => {
    const s = sim('ball');
    run(s, presses([10, 30]), 200);
    expect(s.state.players[0]!.g).toBe(-1);
  });

  it('a press just before landing is buffered', () => {
    const s = sim('ball');
    run(s, presses([10]), 400);
    // find the landing tick on the ceiling then press 1 tick early on the way back
    const s2 = sim('ball');
    let landed = -1;
    run(s2, presses([10]), 400, (x) => {
      if (landed < 0 && x.state.players[0]!.onGround && x.state.tick > 12) landed = x.state.tick;
    });
    const s3 = sim('ball');
    run(s3, presses([10, landed - 1]), landed + 60);
    expect(s3.state.players[0]!.g).toBe(1);
  });
});

describe('ufo', () => {
  it('every press hops, including mid-air', () => {
    const s = sim('ufo');
    let peak1 = 0;
    run(s, presses([10]), 80, (x) => (peak1 = Math.max(peak1, x.state.players[0]!.y)));
    const s2 = sim('ufo');
    let peak2 = 0;
    run(s2, presses([10, 50]), 160, (x) => (peak2 = Math.max(peak2, x.state.players[0]!.y)));
    expect(peak2).toBeGreaterThan(peak1 + 20);
  });
});

describe('wave', () => {
  it('moves at exactly 45° while held and -45° when released', () => {
    const s = sim('wave', { speed: 2 });
    run(s, hold(0, 40), 20);
    expect(s.state.players[0]!.vy).toBe(P.SPEEDS[2]);
    run(s, hold(0, 40), 60);
    expect(s.state.players[0]!.vy).toBe(-P.SPEEDS[2]!);
  });

  it('mini wave uses a steeper angle', () => {
    const s = sim('wave', { mini: true });
    run(s, hold(0, 40), 20);
    expect(s.state.players[0]!.vy).toBe(P.SPEEDS[1]! * P.MINI_WAVE_SLOPE);
  });

  it('has no acceleration: velocity flips instantly', () => {
    const s = sim('wave');
    run(s, hold(0, 30), 30);
    run(s, none, 31);
    expect(s.state.players[0]!.vy).toBe(-P.SPEEDS[1]!);
  });
});

describe('robot', () => {
  function peakFor(holdTicks: number): number {
    const s = sim('robot');
    let peak = 0;
    run(s, hold(10, 10 + holdTicks), 400, (x) => (peak = Math.max(peak, x.state.players[0]!.y)));
    return peak - 15;
  }
  it('holding longer jumps higher, up to a cap', () => {
    const tap = peakFor(1);
    const mid = peakFor(20);
    // the jump tick itself plus the max boost ticks
    const full = peakFor(Math.round(P.ROBOT_MAX_BOOST_TIME * P.TICK_RATE) + 1);
    const over = peakFor(200);
    expect(mid).toBeGreaterThan(tap + 10);
    expect(full).toBeGreaterThan(mid);
    expect(over).toBeCloseTo(full, 0);
    expect(tap / P.BLOCK).toBeGreaterThan(0.9);
    expect(full / P.BLOCK).toBeLessThan(4);
  });
});

describe('spider', () => {
  it('a press teleports instantly to the opposite surface and flips gravity', () => {
    const s = sim('spider');
    run(s, presses([10]), 11);
    const p = s.state.players[0]!;
    expect(p.g).toBe(-1);
    expect(p.y + 11).toBeCloseTo(s.state.boundsHi, 6);
  });

  it('teleports to the underside of a block above instead of the ceiling', () => {
    const s = new Simulation(world([obj('block', 3.5, 4.5), obj('block', 4.5, 4.5)], { mode: 'spider' }));
    // at speed 1, x reaches ~3.5 blocks after ~0.34 s
    run(s, presses([82]), 83);
    const p = s.state.players[0]!;
    expect(p.y + 11).toBeCloseTo(4 * P.BLOCK, 6);
  });
});

describe('swing', () => {
  it('a press flips gravity mid-air', () => {
    const s = sim('swing');
    run(s, none, 40);
    run(s, presses([40]), 41);
    expect(s.state.players[0]!.g).toBe(-1);
    run(s, none, 120);
    expect(s.state.players[0]!.vy).toBeGreaterThan(0);
  });
});

describe('portals', () => {
  it('mode portal switches mode and bounds the play area around it', () => {
    const s2 = new Simulation(world([obj('ship', 10.5, 1.5)]));
    run(s2, none, 300);
    expect(s2.state.players[0]!.mode).toBe(GameMode.Ship);
    expect(s2.state.boundsOn).toBe(true);
    expect(s2.state.boundsLo).toBe(0);
    expect(s2.state.boundsHi).toBe(300);
  });

  function runUntilX(s: Simulation, blocks: number) {
    while (s.state.x < blocks * P.BLOCK && !s.done) {
      s.step(none());
      s.events.length = 0;
    }
  }
  it('gravity, speed, size and mirror portals change state', () => {
    const g = new Simulation(world([obj('portal_gravf', 6.5, 1.3)]));
    runUntilX(g, 8);
    expect(g.state.players[0]!.g).toBe(-1);
    const sp = new Simulation(world([obj('speed3', 6.5, 1)]));
    runUntilX(sp, 8);
    expect(sp.state.speed).toBe(3);
    const mini = new Simulation(world([obj('portal_sizem', 6.5, 1.3)]));
    runUntilX(mini, 8);
    expect(mini.state.players[0]!.mini).toBe(true);
    const m = new Simulation(world([obj('portal_mirron', 6.5, 1.3)]));
    runUntilX(m, 8);
    expect(m.state.mirror).toBe(true);
    for (const s of [g, sp, mini, m]) expect(s.state.dead).toBe(false);
  });

  it('dual portal spawns a mirrored twin with opposite gravity', () => {
    const s = new Simulation(world([obj('portal_dualon', 8.5, 1.3)]));
    run(s, none, 300);
    expect(s.state.dual).toBe(true);
    expect(s.state.players.length).toBe(2);
    const [a, b] = s.state.players;
    expect(b!.g).toBe(-a!.g);
    expect(a!.y + b!.y).toBeCloseTo(s.state.boundsLo + s.state.boundsHi, 6);
  });
});
