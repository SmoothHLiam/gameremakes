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

const only = process.argv.slice(2);
for (const [name, make] of Object.entries(makers)) {
  if (only.length && !only.includes(name)) continue;
  const level: LevelJSON = make().level();
  const world = compileWorld(level);
  const t0 = Date.now();
  const res = solve(world, { step: 4, beam: 64 });
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
