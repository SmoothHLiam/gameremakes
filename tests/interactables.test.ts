import { describe, expect, it } from 'vitest';
import * as P from '../src/core/physics.ts';
import { Simulation, type SimEvent, type TickInput } from '../src/core/sim/sim.ts';
import { obj, run, world } from './helpers.ts';

const none = (): TickInput => ({ held: false, pressed: false });

function collect(s: Simulation, input: (t: number) => TickInput, maxTicks: number, each?: (s: Simulation) => void): SimEvent[] {
  const ev: SimEvent[] = [];
  while (!s.done && s.state.tick < maxTicks) {
    s.step(input(s.state.tick));
    ev.push(...s.events);
    s.events.length = 0;
    each?.(s);
  }
  return ev;
}

/** Step index during which the player's x first overlaps a 1.2-block orb box at bx (blocks). */
function firstOverlapStep(bx: number, halfW: number, speed = 1): number {
  const vx = P.SPEEDS[speed]!;
  for (let k = 0; k < 100000; k++) {
    const x = ((k + 1) * vx) / P.TICK_RATE;
    if (Math.abs(bx * P.BLOCK - x) < 0.6 * P.BLOCK + halfW) return k;
  }
  return -1;
}

describe('orbs', () => {
  const orbWorld = () => world([obj('orb_jump', 10.5, 0.5)], { mode: 'ship' });
  const T = firstOverlapStep(10.5, 15);

  it('fire on a fresh press while overlapping', () => {
    const ev = collect(new Simulation(orbWorld()), (t) => ({ held: t >= T + 3 && t < T + 20, pressed: t === T + 3 }), T + 60);
    expect(ev.some((e) => e.type === 'orb')).toBe(true);
  });

  it('do not fire when the button was already held before reaching them', () => {
    const ev = collect(new Simulation(orbWorld()), (t) => ({ held: t >= T - 40, pressed: t === T - 40 }), T + 60);
    expect(ev.some((e) => e.type === 'orb')).toBe(false);
  });

  it('buffer a press for 2 ticks: slightly early clicks still count', () => {
    const press = (at: number) => collect(new Simulation(orbWorld()), (t) => ({ held: t >= at && t < at + 30, pressed: t === at }), T + 60);
    expect(press(T - 2).some((e) => e.type === 'orb')).toBe(true);
    expect(press(T - 3).some((e) => e.type === 'orb')).toBe(false);
  });

  function cubePeakWithOrb(key: string): { peak: number; ev: SimEvent[]; g: number } {
    // cube walks on the ground into an orb sitting at ground level
    const s = new Simulation(world([obj(key, 10.5, 0.5)]));
    const T0 = firstOverlapStep(10.5, 15);
    let peak = 0;
    const ev = collect(s, (t) => ({ held: t === T0 + 2, pressed: t === T0 + 2 }), T0 + 300, (x) => {
      peak = Math.max(peak, x.state.players[0]!.y - 15);
    });
    return { peak, ev, g: s.state.players[0]!.g };
  }

  it('take priority over a ground jump, and their strengths are ordered small < jump < big', () => {
    const small = cubePeakWithOrb('orb_small');
    const jump = cubePeakWithOrb('orb_jump');
    const big = cubePeakWithOrb('orb_big');
    for (const r of [small, jump, big]) expect(r.ev.some((e) => e.type === 'orb')).toBe(true);
    expect(small.peak).toBeLessThan(jump.peak);
    expect(jump.peak).toBeLessThan(big.peak);
    expect(big.peak / P.BLOCK).toBeGreaterThan(3.5);
  });

  it('gravity orb flips gravity; flip-jump flips and launches; slam drives down', () => {
    expect(cubePeakWithOrb('orb_gravity').g).toBe(-1);
    // flip-jump in mid-air: jump at tick 190 so the cube passes an orb hanging at 2.6 blocks
    const fj = new Simulation(world([obj('orb_flipjump', 10.5, 2.6)]));
    let vyAfter = 0;
    collect(fj, (t) => ({ held: t === 190 || t === 220, pressed: t === 190 || t === 220 }), 223, (x) => (vyAfter = x.state.players[0]!.vy));
    expect(fj.state.players[0]!.g).toBe(-1);
    // launched away from the new floor (downward in the world)
    expect(vyAfter).toBeLessThan(-400);
    const slam = new Simulation(world([obj('orb_slam', 10.5, 2.6)]));
    let slamVy = 0;
    collect(slam, (t) => ({ held: t === 190 || t === 220, pressed: t === 190 || t === 220 }), 222, (x) => (slamVy = x.state.players[0]!.vy));
    expect(slamVy).toBeLessThan(-P.ORB_SLAM_VELOCITY + 30);
  });

  it('dash orb dashes in its direction while held', () => {
    const s = new Simulation(world([obj('orb_dash', 10.5, 0.5, { r: -45 })]));
    const T0 = firstOverlapStep(10.5, 15);
    collect(s, (t) => ({ held: t >= T0 + 1 && t < T0 + 40, pressed: t === T0 + 1 }), T0 + 20);
    const p = s.state.players[0]!;
    expect(p.dashing).toBe(true);
    expect(p.vy).toBeCloseTo(P.SPEEDS[1]!, 6);
    collect(s, none, T0 + 60);
    expect(s.state.players[0]!.dashing).toBe(false);
  });
});

describe('pads', () => {
  function padPeak(key: string): { peak: number; g: number; ev: SimEvent[] } {
    const s = new Simulation(world([obj(key, 10, 0)].map((o) => [o[0], 10.5, 0.15] as typeof o)));
    let peak = 0;
    const ev = collect(s, none, 600, (x) => (peak = Math.max(peak, x.state.players[0]!.y - 15)));
    return { peak, g: s.state.players[0]!.g, ev };
  }
  it('fire on contact with no input, ordered small < jump < big', () => {
    const small = padPeak('pad_small');
    const jump = padPeak('pad_jump');
    const big = padPeak('pad_big');
    for (const r of [small, jump, big]) expect(r.ev.some((e) => e.type === 'pad')).toBe(true);
    expect(small.peak).toBeLessThan(jump.peak);
    expect(jump.peak).toBeLessThan(big.peak);
    // a jump pad launches higher than a normal jump
    expect(jump.peak).toBeGreaterThan((P.CUBE_JUMP_VELOCITY ** 2) / (2 * P.CUBE_GRAVITY));
  });
  it('gravity pad flips gravity', () => {
    const s = new Simulation(world([[83, 10.5, 0.15]]));
    collect(s, none, 400);
    expect(s.state.players[0]!.g).toBe(-1);
  });
});

describe('slopes', () => {
  it('the cube rides a 45° slope up onto blocks and back down', () => {
    const objs = [obj('slope45', 10.5, 0.5), ...Array.from({ length: 5 }, (_, k) => obj('block', 11.5 + k, 0.5)), obj('slope45', 16.5, 0.5, { fx: 1 })];
    const s = new Simulation(world(objs));
    let maxErr = 0;
    run(s, none, 900, (x) => {
      const st = x.state;
      const p = st.players[0]!;
      const xb = st.x / P.BLOCK;
      if (xb > 10.1 && xb < 10.9 && p.onGround) {
        // bottom rides the surface: surface = (x - 10) blocks
        maxErr = Math.max(maxErr, Math.abs(p.y - 15 - (st.x - 10 * P.BLOCK)));
      }
    });
    expect(s.state.dead).toBe(false);
    expect(maxErr).toBeLessThan(3);
  });

  it('rides a 2:1 slope', () => {
    const s = new Simulation(world([obj('slope26', 11, 0.5), ...Array.from({ length: 4 }, (_, k) => obj('block', 12.5 + k, 0.5))]));
    run(s, none, 900);
    expect(s.state.dead).toBe(false);
  });

  it('leaving the top of a slope into the air launches the cube upward', () => {
    const s = new Simulation(world([obj('slope45', 10.5, 0.5)]));
    let peak = 0;
    run(s, none, 600, (x) => (peak = Math.max(peak, x.state.players[0]!.y - 15)));
    expect(s.state.dead).toBe(false);
    expect(peak).toBeGreaterThan(P.BLOCK + 10);
  });

  it('running into the tall side of a slope kills', () => {
    const s = new Simulation(world([obj('slope45', 10.5, 0.5, { fx: 1 })]));
    run(s, none, 600);
    expect(s.state.dead).toBe(true);
  });
});

describe('dual, mini, mirror', () => {
  it('dual: one input drives both players; either dying kills', () => {
    // spike on the ceiling side only: the twin must jump (downwards) to survive
    const base = [obj('portal_dualon', 8.5, 1.3)];
    const ceilSpike = obj('spike', 20.5, 9.5, { r: 180 });
    const sNo = new Simulation(world([...base, ceilSpike]));
    run(sNo, none, 1200);
    expect(sNo.state.dead).toBe(true);
    const vx = P.SPEEDS[1]!;
    let ok = false;
    for (let t = Math.floor(((19 * P.BLOCK) / vx) * P.TICK_RATE) - 40; t < ((20 * P.BLOCK) / vx) * P.TICK_RATE && !ok; t++) {
      const s = new Simulation(world([...base, ceilSpike]));
      run(s, (k) => ({ held: k === t, pressed: k === t }), 1200);
      ok = !s.state.dead && s.state.players.length === 2;
    }
    expect(ok).toBe(true);
  });

  it('mini: smaller hitbox and a lower jump', () => {
    const s = new Simulation(world([obj('portal_sizem', 5.5, 1.3)]));
    let peak = 0;
    const T0 = Math.floor(((8 * P.BLOCK) / P.SPEEDS[1]!) * P.TICK_RATE);
    run(s, (t) => ({ held: t === T0, pressed: t === T0 }), T0 + 200, (x) => (peak = Math.max(peak, x.state.players[0]!.y - 9)));
    expect(s.state.players[0]!.mini).toBe(true);
    expect(peak).toBeLessThan(((P.CUBE_JUMP_VELOCITY ** 2) / (2 * P.CUBE_GRAVITY)) * 0.75);
  });

  it('mirror portals toggle the mirror flag (visual only; physics unchanged)', () => {
    const a = new Simulation(world([obj('portal_mirron', 6.5, 1.3), obj('spike', 14.5, 0.5)]));
    const b = new Simulation(world([obj('spike', 14.5, 0.5)]));
    const input = (t: number) => ({ held: t === 270, pressed: t === 270 });
    run(a, input, 800);
    run(b, input, 800);
    expect(a.state.mirror).toBe(true);
    expect(a.state.dead).toBe(b.state.dead);
    expect(a.state.players[0]!.y).toBe(b.state.players[0]!.y);
  });
});
