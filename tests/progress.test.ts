import { describe, expect, it } from 'vitest';
import { getProgress, recordAttempt, recordComplete, recordProgress, totalStars } from '../src/app/progress.ts';

// No localStorage in the test environment: storage calls fail safely and progress stays in memory.
describe('level progress', () => {
  it('tracks best normal and practice percents separately', () => {
    recordAttempt('p-a');
    recordAttempt('p-a');
    expect(recordProgress('p-a', 42.7, false)).toBe(true);
    expect(recordProgress('p-a', 30, false)).toBe(false);
    expect(recordProgress('p-a', 88, true)).toBe(true);
    const p = getProgress('p-a');
    expect(p).toMatchObject({ normal: 42, practice: 88, attempts: 2, coins: 0 });
  });

  it('only awards coins for normal-mode completions', () => {
    recordComplete('p-b', true, 0b111);
    expect(getProgress('p-b')).toMatchObject({ practice: 100, normal: 0, coins: 0 });
    recordComplete('p-b', false, 0b101);
    recordComplete('p-b', false, 0b010);
    expect(getProgress('p-b')).toMatchObject({ normal: 100, coins: 0b111, completions: 2 });
    expect(totalStars()).toEqual({ completed: 1, coins: 3 });
  });

  it('returns copies so callers cannot corrupt the store', () => {
    const p = getProgress('p-b');
    p.normal = 0;
    expect(getProgress('p-b').normal).toBe(100);
  });
});
