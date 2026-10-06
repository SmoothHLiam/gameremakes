/**
 * Builds the small test levels (one per mechanic) and proves each one is
 * beatable by solving it in the real simulation. The found input timeline is
 * stored in the level file as its replay.
 *
 *   node scripts/build-test-levels.ts [name...]
 */
import { writeFileSync } from 'node:fs';
import { serializeLevel, type LevelJSON } from '../src/core/level.ts';
import { compileWorld } from '../src/core/sim/world.ts';
import { solve } from '../src/core/sim/solver.ts';
import { runReplay } from '../src/core/sim/replay.ts';
import { LevelBuilder } from './lib/builder.ts';

type Maker = () => LevelBuilder;

const makers: Record<string, Maker> = {
  cube: () => {
    const b = new LevelBuilder({ name: 'Test: Cube', author: 'tests', difficulty: 'easy', song: 'test-a', bpm: 128, length: 170, id: 'test-cube' });
    b.add('spike', 14, 0);
    b.add('spike', 22, 0).add('spike', 23, 0);
    b.row('block', 30, 34, 0);
    b.add('spike', 37, 0);
    b.row('block', 40, 46, 0).row('block', 43, 46, 1);
    b.add('spike', 49, 0).add('spike', 50, 0).add('spike', 51, 0);
    b.add('spike_half', 58, 0).add('spike_half', 59, 0);
    b.row('block', 64, 66, 0).add('spike', 68, 0).row('block', 70, 72, 0).add('spike', 74, 0).row('block', 76, 78, 0);
    b.add('block', 84, 0).add('spike', 84, 1);
    b.row('slab', 90, 95, 1).row('spike_low', 89, 96, 0);
    b.row('block', 102, 103, 0).row('block', 106, 107, 1).row('block', 110, 111, 2);
    b.row('spike_low', 104, 105, 0).row('spike_low', 108, 109, 0).row('spike_low', 112, 113, 0);
    b.row('block', 114, 120, 2).row('block', 114, 120, 1).row('block', 114, 120, 0);
    b.add('spike', 122, 0).add('spike', 123, 0);
    b.add('saw', 132, 0);
    b.add('spike', 140, 0).add('spike', 146, 0).add('spike', 147, 0);
    for (const x of [16, 40, 70, 100, 130]) b.add('deco_glow', x, 4, { c: 1 });
    b.meta.colors = { ...b.meta.colors, bg: '#3b2bd6', g: '#2a1f9e', '1': '#7a6cff' };
    return b;
  },
};

/** Bounded-corridor helper: blocks hanging from the ceiling (top = 10). */
function ceil(b: LevelBuilder, x0: number, x1: number, fromY: number, top = 9): void {
  b.rect('block', x0, fromY, x1, top);
}

Object.assign(makers, {
  ship: () => {
    const b = new LevelBuilder({ name: 'Test: Ship', author: 'tests', song: 'test-a', bpm: 128, length: 130, id: 'test-ship' });
    b.add('ship', 10, 1);
    b.rect('block', 20, 0, 21, 3);
    ceil(b, 28, 29, 6);
    b.rect('block', 36, 0, 37, 4);
    ceil(b, 44, 45, 5);
    b.rect('block', 52, 0, 60, 2);
    ceil(b, 52, 60, 7);
    b.row('spike', 52, 60, 3);
    b.rect('block', 68, 0, 69, 5);
    ceil(b, 76, 77, 4);
    b.rect('block', 84, 0, 86, 3).rect('block', 87, 0, 89, 5).rect('block', 90, 0, 92, 3);
    ceil(b, 98, 100, 6);
    b.add('saw', 108, 4);
    b.meta.colors = { ...b.meta.colors, bg: '#c93a8a', g: '#7a1f55' };
    return b;
  },
  ball: () => {
    const b = new LevelBuilder({ name: 'Test: Ball', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-ball' });
    b.add('ball', 10, 1);
    b.row('spike', 20, 22, 0);
    b.row('spike', 30, 32, 7, { r: 180 });
    b.row('spike', 40, 42, 0);
    b.row('spike', 48, 50, 7, { r: 180 });
    b.row('block', 56, 62, 0).row('spike', 56, 62, 1);
    b.row('block', 68, 74, 7).row('spike', 68, 74, 6, { r: 180 });
    b.row('spike', 82, 83, 0).row('spike', 88, 89, 7, { r: 180 }).row('spike', 94, 95, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#d13b3b', g: '#7d1c1c' };
    return b;
  },
  ufo: () => {
    const b = new LevelBuilder({ name: 'Test: UFO', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-ufo' });
    b.add('ufo', 10, 1);
    b.rect('block', 20, 0, 21, 2);
    b.rect('block', 28, 0, 29, 1);
    ceil(b, 28, 29, 5);
    b.rect('block', 36, 0, 37, 4);
    b.rect('block', 44, 0, 45, 0);
    ceil(b, 44, 45, 4);
    b.rect('block', 52, 0, 54, 3).row('spike', 52, 54, 4);
    ceil(b, 60, 62, 6);
    b.row('spike', 60, 62, 0);
    b.rect('block', 70, 0, 71, 5);
    b.row('spike', 76, 84, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#d68a1e', g: '#7a4c0c' };
    return b;
  },
  wave: () => {
    const b = new LevelBuilder({ name: 'Test: Wave', author: 'tests', song: 'test-a', bpm: 128, length: 110, id: 'test-wave' });
    b.add('wave', 10, 1);
    b.rect('block', 20, 0, 22, 4);
    ceil(b, 30, 32, 5);
    b.rect('block', 40, 0, 41, 5);
    ceil(b, 46, 47, 4);
    b.rect('block', 52, 0, 53, 5);
    b.row('spike', 58, 64, 0);
    ceil(b, 58, 64, 6);
    b.row('spike', 58, 64, 5, { r: 180 });
    b.rect('block', 72, 0, 73, 6);
    ceil(b, 82, 83, 3);
    b.meta.colors = { ...b.meta.colors, bg: '#2a6bd6', g: '#123c80' };
    return b;
  },
  robot: () => {
    const b = new LevelBuilder({ name: 'Test: Robot', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-robot' });
    b.add('robot', 10, 1);
    b.add('spike', 18, 0);
    b.rect('block', 26, 0, 30, 0);
    b.rect('block', 31, 0, 35, 2);
    b.row('spike', 38, 41, 0);
    b.rect('block', 46, 0, 50, 2);
    b.row('spike', 51, 54, 0);
    b.rect('block', 55, 0, 58, 1);
    b.add('spike', 63, 0).add('spike', 64, 0);
    b.add('spike', 70, 0);
    b.add('spike', 74, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#5c5f7a', g: '#2c2e40' };
    return b;
  },
  spider: () => {
    const b = new LevelBuilder({ name: 'Test: Spider', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-spider' });
    b.add('spider', 10, 1);
    b.row('spike', 20, 22, 0);
    b.row('spike', 27, 29, 7, { r: 180 });
    b.row('spike', 33, 35, 0);
    b.row('spike', 38, 40, 7, { r: 180 });
    b.row('spike', 43, 44, 0);
    b.row('block', 50, 56, 3).row('spike', 50, 56, 0).row('spike', 50, 56, 7, { r: 180 });
    b.row('spike', 62, 64, 0).row('spike', 67, 69, 7, { r: 180 }).row('spike', 72, 74, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#7b3cd6', g: '#3f1a73' };
    return b;
  },
  swing: () => {
    const b = new LevelBuilder({ name: 'Test: Swing', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-swing' });
    b.add('swing', 10, 1);
    b.rect('block', 20, 0, 21, 3);
    ceil(b, 28, 29, 6);
    b.rect('block', 36, 0, 37, 4);
    ceil(b, 44, 45, 5);
    b.row('spike', 50, 56, 0);
    b.row('spike', 50, 56, 9, { r: 180 });
    b.rect('block', 62, 0, 63, 5);
    ceil(b, 70, 71, 4);
    b.add('saw', 80, 5);
    b.meta.colors = { ...b.meta.colors, bg: '#5aa318', g: '#2c5a08' };
    return b;
  },
  portals: () => {
    const b = new LevelBuilder({ name: 'Test: Portals', author: 'tests', song: 'test-a', bpm: 128, length: 140, id: 'test-portals' });
    b.add('speed0', 8, 0).add('spike', 16, 0);
    b.add('speed2', 22, 0).add('spike', 30, 0).add('spike', 31, 0);
    b.add('speed3', 38, 0).row('spike', 46, 48, 0);
    b.add('speed4', 56, 0).row('spike', 66, 69, 0);
    b.add('speed1', 76, 0);
    b.add('portal_gravf', 84, 0, { });
    b.row('block', 84, 112, 6);
    b.add('spike', 94, 5, { r: 180 }).add('spike', 102, 5, { r: 180 }).add('spike', 103, 5, { r: 180 });
    b.add('portal_gravn', 110, 4);
    b.add('spike', 122, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#1f8f8a', g: '#0e4d4a' };
    return b;
  },
  orbs: () => {
    const b = new LevelBuilder({ name: 'Test: Orbs', author: 'tests', song: 'test-a', bpm: 128, length: 130, id: 'test-orbs' });
    b.row('spike', 13, 18, 0).add('orb_jump', 15, 2);
    b.add('orb_big', 25, 1).rect('block', 29, 0, 34, 3).row('spike', 24, 28, 0);
    b.row('block', 40, 56, 7);
    b.add('orb_gravity', 38, 2).row('spike', 37, 41, 0);
    b.add('spike', 47, 6, { r: 180 });
    b.add('orb_gravity', 53, 5);
    b.row('spike', 52, 56, 0);
    b.add('orb_dash', 64, 1).row('spike', 63, 71, 0);
    b.add('orb_small', 80, 1).add('spike', 82, 0);
    b.add('orb_flipjump', 92, 1).row('block', 92, 104, 6).row('spike', 91, 97, 0);
    b.add('portal_gravn', 104, 4);
    b.meta.colors = { ...b.meta.colors, bg: '#b8572a', g: '#6b2c10' };
    return b;
  },
  pads: () => {
    const b = new LevelBuilder({ name: 'Test: Pads', author: 'tests', song: 'test-a', bpm: 128, length: 110, id: 'test-pads' });
    b.add('pad_jump', 12, 0).row('spike', 13, 17, 0);
    b.add('pad_small', 24, 0).add('spike', 26, 0);
    b.add('pad_big', 32, 0).rect('block', 37, 0, 42, 4).row('spike', 33, 36, 0);
    b.add('pad_gravity', 50, 0).row('block', 48, 66, 6).row('spike', 51, 56, 0);
    b.add('spike', 60, 5, { r: 180 });
    b.add('portal_gravn', 66, 4);
    b.add('spike', 76, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#a03b8f', g: '#5a1a50' };
    return b;
  },
  slopes: () => {
    const b = new LevelBuilder({ name: 'Test: Slopes', author: 'tests', song: 'test-a', bpm: 128, length: 120, id: 'test-slopes' });
    b.add('slope45', 12, 0).row('block', 13, 18, 0).add('slope45', 19, 0, { fx: 1 });
    b.add('slope26', 26, 0).row('block', 28, 30, 0);
    b.add('slope26', 31, 1).rect('block', 31, 0, 32, 0).row('block', 33, 36, 1).rect('block', 33, 0, 36, 0);
    b.add('slope26', 37, 1, { fx: 1 }).add('block', 37, 0).add('block', 38, 0).add('slope26', 39, 0, { fx: 1 });
    b.add('slope45', 48, 0).add('slope45', 49, 1).add('block', 49, 0).row('spike', 51, 53, 0);
    b.row('block', 62, 66, 0).add('slope45', 61, 0);
    b.add('slope45', 67, 0, { fx: 1 });
    b.meta.colors = { ...b.meta.colors, bg: '#3a8f5c', g: '#1d5434' };
    return b;
  },
  dual: () => {
    const b = new LevelBuilder({ name: 'Test: Dual', author: 'tests', song: 'test-a', bpm: 128, length: 110, id: 'test-dual' });
    b.add('portal_dualon', 10, 0);
    b.add('spike', 20, 0).add('spike', 28, 9, { r: 180 }).add('spike', 36, 0).add('spike', 36, 9, { r: 180 });
    b.add('spike', 44, 0).add('spike', 45, 0).add('spike', 52, 9, { r: 180 });
    b.add('portal_dualoff', 62, 0, { });
    b.add('spike', 72, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#c4364f', g: '#6e1626' };
    return b;
  },
  minimirror: () => {
    const b = new LevelBuilder({ name: 'Test: Mini & Mirror', author: 'tests', song: 'test-a', bpm: 128, length: 110, id: 'test-minimirror' });
    b.add('portal_sizem', 10, 0);
    b.add('spike_half', 18, 0).add('spike_half', 24, 0).add('spike_half', 25, 0);
    b.add('portal_mirron', 30, 0);
    b.add('spike', 38, 0).row('block', 44, 47, 0).add('spike_half', 50, 0);
    b.add('portal_mirroff', 56, 0);
    b.add('portal_sizen', 62, 0);
    b.add('spike', 70, 0);
    b.meta.colors = { ...b.meta.colors, bg: '#3d5fc4', g: '#1d2f6e' };
    return b;
  },
});

const only = process.argv.slice(2);
for (const [name, make] of Object.entries(makers)) {
  if (only.length && !only.includes(name)) continue;
  const level: LevelJSON = make().level();
  const world = compileWorld(level);
  const t0 = Date.now();
  const step = Number(process.env.STEP ?? 4);
  const beam = Number(process.env.BEAM ?? 64);
  let res = solve(world, { step, beam });
  if (!res.ok) res = solve(world, { step: 2, beam: beam * 3 });
  if (!res.ok) {
    console.error(`✗ ${name}: unsolvable, furthest x = ${(res.furthestX / 30).toFixed(1)} blocks`);
    process.exitCode = 1;
    continue;
  }
  level.replay = { ticks: res.ticks, end: res.endTick };
  const check = runReplay(world, level.replay);
  if (check.outcome !== 'complete' || check.tick !== res.endTick) {
    console.error(`✗ ${name}: replay verification failed (${check.outcome} at ${check.tick})`);
    process.exitCode = 1;
    continue;
  }
  level.replay.hash = check.hash;
  writeFileSync(`src/levels/test/${name}.json`, serializeLevel(level));
  console.log(`✓ ${name}: ${res.ticks.length / 2} presses, ${(res.endTick / 240).toFixed(1)} s, solved in ${Date.now() - t0} ms`);
}
