import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level.ts';
import { runReplay } from '../src/core/sim/replay.ts';
import { compileWorld } from '../src/core/sim/world.ts';

function levelFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...levelFiles(p));
    else if (f.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

const files = levelFiles('src/levels');

describe('every level ships a winning replay', () => {
  it('has level files', () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(`${file} is beatable with its stored replay`, () => {
      const level = parseLevel(readFileSync(file, 'utf8'));
      expect(level.replay, 'level has no replay').toBeTruthy();
      const world = compileWorld(level);
      const res = runReplay(world, level.replay!);
      expect(res.outcome, `died at ${(res.deathX / 30).toFixed(1)} blocks`).toBe('complete');
      if (level.replay!.end != null) expect(res.tick).toBe(level.replay!.end);
      // golden hash recorded when the level was built: catches cross-machine drift
      if (level.replay!.hash) expect(res.hash).toBe(level.replay!.hash);
      if (level.coinReplay) {
        const c = runReplay(world, level.coinReplay);
        expect(c.outcome).toBe('complete');
        expect(c.coins).toBe((1 << world.coins.length) - 1);
      }
    });
  }
});

describe('determinism', () => {
  it('same level + same inputs = identical state, every run', () => {
    for (const file of files) {
      const level = parseLevel(readFileSync(file, 'utf8'));
      if (!level.replay) continue;
      const a = runReplay(compileWorld(level), level.replay);
      const b = runReplay(compileWorld(level), level.replay);
      expect(a.hash).toBe(b.hash);
      expect(a.tick).toBe(b.tick);
    }
  });
});
