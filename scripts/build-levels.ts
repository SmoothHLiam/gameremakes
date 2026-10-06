/**
 * Builds the shipped levels from their composer scripts, verifies each one's
 * winning replay (and coin replay) in the real simulation, and writes the
 * level JSON to src/levels/main/.
 *
 *   node scripts/build-levels.ts [file-prefix...]
 */
import { writeFileSync } from 'node:fs';
import { compileWorld } from '../src/core/sim/world.ts';
import { runReplay } from '../src/core/sim/replay.ts';
import { parseLevel } from '../src/core/level.ts';
import { LEVELS } from './levels/levels.ts';

const only = process.argv.slice(2);
for (const def of LEVELS) {
  if (only.length && !only.some((o) => def.file.startsWith(o))) continue;
  const t0 = Date.now();
  try {
    const { level, composer, coins } = def.build();
    const json = composer.json(level);
    // round-trip through the parser and re-verify exactly what ships
    const parsed = parseLevel(json);
    const world = compileWorld(parsed);
    const r = runReplay(world, parsed.replay!);
    if (r.outcome !== 'complete') throw new Error(`shipped replay ${r.outcome} at ${(r.deathX / 30).toFixed(1)}`);
    let coinInfo = 'no coin replay';
    if (parsed.coinReplay) {
      const cr = runReplay(world, parsed.coinReplay);
      coinInfo = `coin replay ${cr.outcome}, coins ${cr.coins.toString(2)}`;
    }
    writeFileSync(`src/levels/main/${def.file}.json`, json);
    const secs = (r.tick / 240).toFixed(1);
    console.log(`✓ ${def.file}: ${parsed.objects.length} objects, ${parsed.replay!.ticks.length / 2} presses, ${secs}s, ${coins} coins (${coinInfo}), ${composer.removedCount} objects dropped, ${Date.now() - t0} ms`);
  } catch (e) {
    console.error(`✗ ${def.file}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
