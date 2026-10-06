import { describe, expect, it } from 'vitest';
import { BLOCK, CUBE_GRAVITY, CUBE_JUMP_VELOCITY, SPEEDS, SPEEDS_BLOCKS, TICK_RATE } from '../src/core/physics.ts';
import { Simulation } from '../src/core/sim/sim.ts';
import { makeLevel, obj, press, run, world } from './helpers.ts';
import { compileWorld } from '../src/core/sim/world.ts';

function jumpProfile() {
  const sim = new Simulation(world([]));
  let peak = 0;
  let airTicks = 0;
  let landedAt = -1;
  const startTick = 20;
  run(sim, press(startTick), 400, (s) => {
    const p = s.state.players[0]!;
    const bottom = p.y - 15;
    if (bottom > peak) peak = bottom;
    if (s.state.tick > startTick && !p.onGround) airTicks++;
    if (s.state.tick > startTick + 2 && p.onGround && landedAt < 0) landedAt = s.state.tick;
  });
  return { peakBlocks: peak / BLOCK, airSeconds: airTicks / TICK_RATE, landedAt };
}

describe('physics constants', () => {
  it('exposes the five speeds in blocks per second', () => {
    expect([...SPEEDS_BLOCKS]).toEqual([8.4, 10.4, 13.0, 15.6, 19.2]);
    expect(SPEEDS[1]).toBeCloseTo(10.4 * 30);
  });

  it('analytic jump targets: peak just over 2 blocks, ~0.43 s airtime', () => {
    const peak = (CUBE_JUMP_VELOCITY ** 2) / (2 * CUBE_GRAVITY) / BLOCK;
    expect(peak).toBeGreaterThan(2.0);
    expect(peak).toBeLessThan(2.3);
  });
});

describe('cube jump (simulated)', () => {
  it('peaks just over 2 blocks high', () => {
    const { peakBlocks } = jumpProfile();
    expect(peakBlocks).toBeGreaterThan(2.0);
    expect(peakBlocks).toBeLessThan(2.25);
  });

  it('stays airborne about 0.43 s and covers ~4.5 blocks at normal speed', () => {
    const { airSeconds } = jumpProfile();
    expect(airSeconds).toBeGreaterThan(0.41);
    expect(airSeconds).toBeLessThan(0.45);
    const blocks = airSeconds * SPEEDS_BLOCKS[1];
    expect(blocks).toBeGreaterThan(4.2);
    expect(blocks).toBeLessThan(4.8);
  });

  /** For a row of `n` spikes starting at block 20, returns the press ticks that survive. */
  function survivingPressTicks(n: number, speed = 1): number[] {
    const spikes = Array.from({ length: n }, (_, k) => obj('spike', 20.5 + k, 0.5));
    const w = compileWorld(makeLevel(spikes, { length: 40, speed }));
    const ok: number[] = [];
    // spike row starts at x = 600 units; try every press tick in a wide window
    const vx = SPEEDS[speed]!;
    const arrive = Math.floor(((20 * BLOCK) / vx) * TICK_RATE);
    for (let t = arrive - 120; t < arrive + 20; t++) {
      const sim = new Simulation(w);
      run(sim, press(t), arrive + 300);
      if (!sim.state.dead) ok.push(t);
    }
    return ok;
  }

  it('clears a 3-block spike row at normal speed with a fair timing window', () => {
    const ok = survivingPressTicks(3);
    expect(ok.length).toBeGreaterThan(0);
    // the window should be at least ~25 ms wide
    expect(ok.length / TICK_RATE).toBeGreaterThan(0.025);
  });

  it('cannot clear a 4-block spike row at normal speed', () => {
    expect(survivingPressTicks(4)).toEqual([]);
  });

  it('dies without jumping', () => {
    const sim = new Simulation(world([obj('spike', 20.5, 0.5)]));
    run(sim, () => ({ held: false, pressed: false }), 2000);
    expect(sim.state.dead).toBe(true);
  });

  it('holding auto-jumps again the instant it lands', () => {
    const sim = new Simulation(world([]));
    let jumps = 0;
    let lastGroundTick = -1;
    let gaps: number[] = [];
    while (sim.state.tick < 600) {
      sim.step({ held: true, pressed: sim.state.tick === 0 });
      for (const e of sim.events) if (e.type === 'jump') {
        jumps++;
        if (lastGroundTick >= 0) gaps.push(sim.state.tick - lastGroundTick);
      }
      for (const e of sim.events) if (e.type === 'land') lastGroundTick = sim.state.tick;
      sim.events.length = 0;
    }
    expect(jumps).toBeGreaterThanOrEqual(5);
    // re-jump happens on the very next tick after landing
    expect(Math.max(...gaps)).toBeLessThanOrEqual(1);
  });

  it('rotates 90° per jump and snaps to a multiple of 90 on landing', () => {
    const sim = new Simulation(world([]));
    run(sim, press(10), 300);
    const rot = sim.state.players[0]!.rot;
    expect(Math.abs(rot % 90)).toBeLessThan(1e-9);
    expect(Math.abs(rot)).toBe(90);
  });
});

describe('block collisions', () => {
  it('landing on top of a block is safe', () => {
    // 1-block-high platform from block 20 to 30; jump onto it
    const blocks = Array.from({ length: 10 }, (_, k) => obj('block', 20.5 + k, 0.5));
    const w = world(blocks);
    const vx = SPEEDS[1]!;
    const arrive = Math.floor(((20 * BLOCK) / vx) * TICK_RATE);
    let survived = 0;
    for (let t = arrive - 60; t < arrive; t++) {
      const sim = new Simulation(w);
      let maxBottomOnTop = 0;
      run(sim, press(t), arrive + 200, (s) => {
        const p = s.state.players[0]!;
        if (p.onGround && s.state.x > 21 * BLOCK) maxBottomOnTop = p.y - 15;
      });
      if (!sim.state.dead) {
        survived++;
        expect(maxBottomOnTop).toBeCloseTo(30, 6);
      }
    }
    expect(survived).toBeGreaterThan(10);
  });

  it('running into the side of a block kills', () => {
    const sim = new Simulation(world([obj('block', 20.5, 0.5)]));
    run(sim, () => ({ held: false, pressed: false }), 2000);
    expect(sim.state.dead).toBe(true);
    // died near the wall, not inside it
    expect(sim.state.x).toBeGreaterThan(20 * BLOCK - 15);
    expect(sim.state.x).toBeLessThan(20 * BLOCK + 5);
  });

  it('hitting the underside of a block in cube mode kills', () => {
    // ceiling 2 blocks up: a full jump hits it
    const roof = Array.from({ length: 12 }, (_, k) => obj('block', 18.5 + k, 2.5));
    const sim = new Simulation(world(roof));
    const vx = SPEEDS[1]!;
    const t = Math.floor(((20 * BLOCK) / vx) * TICK_RATE);
    run(sim, press(t), t + 300);
    expect(sim.state.dead).toBe(true);
  });

  it('a slightly late landing on a block edge still snaps on top', () => {
    // Find the latest press that survives landing on a 1-high block wall at block 20.
    const blocks = Array.from({ length: 6 }, (_, k) => obj('block', 20.5 + k, 0.5));
    const w = world(blocks);
    const vx = SPEEDS[1]!;
    const arrive = Math.floor(((20 * BLOCK) / vx) * TICK_RATE);
    let latest = -1;
    for (let t = arrive - 60; t <= arrive + 5; t++) {
      const sim = new Simulation(w);
      run(sim, press(t), arrive + 200);
      if (!sim.state.dead) latest = t;
    }
    expect(latest).toBeGreaterThan(0);
  });
});
