import { describe, expect, it } from 'vitest';
import { detectBeats } from '../src/core/audio/beats.ts';
import { renderSong } from '../src/core/audio/song.ts';
import { SONGS } from '../src/core/audio/songs.ts';

function clickTrack(bpm: number, offset: number, seconds: number, sr = 44100): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr));
  const period = 60 / bpm;
  let seed = 3;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  for (let i = 0; i < out.length; i++) out[i] = noise();
  for (let t = offset, k = 0; t < seconds; t += period, k++) {
    const s0 = Math.floor(t * sr);
    for (let i = 0; i < 2000 && s0 + i < out.length; i++) out[s0 + i]! += Math.sin(i * 0.15) * Math.exp(-i / 300) * (k % 4 === 0 ? 1 : 0.7);
  }
  return out;
}

describe('beat detection', () => {
  it('finds tempo and phase of a click track', () => {
    const r = detectBeats(clickTrack(140, 0.3, 30), null, 44100);
    expect(r.bpm).toBeCloseTo(140, 0);
    const period = 60 / 140;
    const phaseErr = Math.abs(((r.offset - 0.3) % period + period * 1.5) % period - period / 2);
    expect(phaseErr).toBeLessThan(0.02);
  });

  it('finds the tempo of one of our own songs', () => {
    const { L, R, info } = renderSong(SONGS['test-a']!);
    const r = detectBeats(L, R, 44100);
    expect(Math.abs(r.bpm - info.bpm)).toBeLessThan(1.01);
  });
});
