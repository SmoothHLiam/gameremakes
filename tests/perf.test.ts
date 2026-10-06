import { describe, expect, it } from 'vitest';
import { parseLevel } from '../src/core/level.ts';
import { TICK_RATE } from '../src/core/physics.ts';
import { runReplay } from '../src/core/sim/replay.ts';
import { compileWorld } from '../src/core/sim/world.ts';
import { stressLevel } from '../src/game/stressLevel.ts';

describe('large levels', () => {
  const level = parseLevel(JSON.parse(JSON.stringify(stressLevel(24000))));

  it('the stress level has 24k+ objects and is cleared with no input', () => {
    expect(level.objects.length).toBeGreaterThanOrEqual(24000);
    const res = runReplay(compileWorld(level), []);
    expect(res.outcome).toBe('complete');
  });

  it('compiles quickly and simulates far faster than real time', () => {
    const t0 = performance.now();
    const world = compileWorld(level);
    const compileMs = performance.now() - t0;
    const t1 = performance.now();
    const res = runReplay(world, []);
    const simMs = performance.now() - t1;
    const gameSeconds = res.tick / TICK_RATE;
    const realtime = (gameSeconds * 1000) / simMs;
    console.log(`stress: ${level.objects.length} objects, compile ${compileMs.toFixed(1)} ms, ${gameSeconds.toFixed(1)} s of play simulated in ${simMs.toFixed(0)} ms (${realtime.toFixed(0)}x real time)`);
    // generous bounds so slow CI machines don't flake; typical numbers are ~10x better
    expect(compileMs).toBeLessThan(1500);
    expect(realtime).toBeGreaterThan(20);
  });
});
