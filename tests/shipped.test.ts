import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { songInfo } from '../src/core/audio/song.ts';
import { SONGS } from '../src/core/audio/songs.ts';
import { DIFFICULTIES, parseLevel } from '../src/core/level.ts';
import { TICK_RATE } from '../src/core/physics.ts';
import { compileWorld } from '../src/core/sim/world.ts';

const files = readdirSync('src/levels/main').filter((f) => f.endsWith('.json')).sort();
const levels = files.map((f) => parseLevel(readFileSync(`src/levels/main/${f}`, 'utf8')));

describe('shipped content', () => {
  it('has 8 levels with increasing difficulty and every tier used', () => {
    expect(levels.length).toBe(8);
    const rank = levels.map((l) => DIFFICULTIES.indexOf(l.meta.difficulty));
    for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeGreaterThanOrEqual(rank[i - 1]!);
    expect(new Set(levels.map((l) => l.meta.difficulty)).size).toBe(DIFFICULTIES.length);
  });

  it('each level has its own song, 128–175 BPM, 60–120 s', () => {
    const songs = new Set<string>();
    for (const l of levels) {
      const spec = SONGS[l.meta.song]!;
      expect(spec, l.meta.song).toBeTruthy();
      songs.add(l.meta.song);
      const info = songInfo(spec);
      expect(info.bpm).toBeGreaterThanOrEqual(128);
      expect(info.bpm).toBeLessThanOrEqual(175);
      expect(info.duration).toBeGreaterThanOrEqual(60);
      expect(info.duration).toBeLessThanOrEqual(120);
      // the level ends before its song does
      const end = (l.replay!.end! / TICK_RATE);
      expect(end).toBeLessThanOrEqual(info.duration);
    }
    expect(songs.size).toBe(8);
  });

  it('every input in every winning replay lands on the beat grid', () => {
    for (const l of levels) {
      const spb = 60 / l.meta.bpm;
      for (const replay of [l.replay!, l.coinReplay!]) {
        for (let i = 0; i < replay.ticks.length; i += 2) {
          const t = replay.ticks[i]! / TICK_RATE - l.meta.beatOffset;
          const beats = t / spb;
          const grid = Math.round(beats * 2) / 2;
          // within one sim tick of a half-beat
          expect(Math.abs(beats - grid) * spb, `${l.meta.name} press at beat ${beats.toFixed(3)}`).toBeLessThanOrEqual(1 / TICK_RATE + 1e-9);
        }
      }
    }
  });

  it('three coins per level', () => {
    for (const l of levels) expect(compileWorld(l).coins.length, l.meta.name).toBe(3);
  });

  it('names are unique and levels have ids', () => {
    expect(new Set(levels.map((l) => l.meta.name)).size).toBe(8);
    for (const l of levels) expect(l.meta.id).toBeTruthy();
  });
});
