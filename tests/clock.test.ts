import { describe, expect, it } from 'vitest';
import { LevelClock, RESYNC_THRESHOLD } from '../src/game/clock.ts';

describe('LevelClock audio sync', () => {
  it('holds at the start time until the music becomes audible', () => {
    const c = new LevelClock();
    c.start(2, 1000);
    expect(c.at(900)).toBe(2);
    expect(c.at(1000)).toBe(2);
    expect(c.at(1500)).toBeCloseTo(2.5, 9);
  });

  it('slews small disagreements without snapping', () => {
    const c = new LevelClock();
    c.start(0, 0);
    // audio runs 5 ms ahead of the perf clock (below the 1-frame threshold)
    c.audio = { audibleLevelTime: (p) => p / 1000 + 0.005 };
    let err = 0;
    for (let f = 1; f <= 120; f++) {
      const t = c.frame(f * 16.6667);
      err = f * 0.0166667 + 0.005 - t;
    }
    expect(c.resyncs).toBe(0);
    expect(Math.abs(err)).toBeLessThan(0.0005);
  });

  it('resyncs when sim and audio disagree by more than one frame', () => {
    const c = new LevelClock();
    c.start(0, 0);
    let skew = 0;
    c.audio = { audibleLevelTime: (p) => p / 1000 + skew };
    c.frame(16);
    skew = RESYNC_THRESHOLD * 2; // e.g. the audio thread hiccuped
    const t = c.frame(32);
    expect(c.resyncs).toBe(1);
    expect(t).toBeCloseTo(0.032 + skew, 9);
  });

  it('tracks a drifting audio clock over a long song', () => {
    const c = new LevelClock();
    c.start(0, 0);
    // audio clock runs 0.1% fast (sample-rate mismatch) with ±2 ms jitter
    let seed = 1;
    const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.004;
    c.audio = { audibleLevelTime: (p) => (p / 1000) * 1.001 + jitter() };
    let maxErr = 0;
    for (let f = 1; f <= 60 * 90; f++) {
      const p = f * 16.6667;
      const t = c.frame(p);
      maxErr = Math.max(maxErr, Math.abs(t - (p / 1000) * 1.001));
    }
    expect(maxErr).toBeLessThan(RESYNC_THRESHOLD);
  });
});
