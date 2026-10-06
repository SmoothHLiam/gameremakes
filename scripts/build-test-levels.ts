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
