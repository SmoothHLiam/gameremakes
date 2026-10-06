import { SONGS } from '../../src/core/audio/songs.ts';
import type { Difficulty, LevelJSON } from '../../src/core/level.ts';
import { LevelComposer, type Palette } from '../lib/composer.ts';
import { background, barPulses, coins, palettes, scenery } from '../lib/deco.ts';
import { cube, dualCube, fly, rest, robot, surfaces, wave } from '../lib/patterns.ts';
import { TUNINGS } from './tunings.ts';

export interface LevelDef {
  file: string;
  build(): { level: LevelJSON; composer: LevelComposer; coins: number };
}

function make(id: string, name: string, difficulty: Difficulty, songId: string, seed: number, speed: number, pal: Palette[], bg: number, ground: number) {
  const song = SONGS[songId]!;
  return new LevelComposer({
    song, id, name, difficulty, tuning: TUNINGS[difficulty]!, speed, seed, bg, ground,
    colors: { bg: pal[0]!.bg, g: pal[0]!.g, line: pal[0]!.line, '1': pal[0]!.c1, '2': pal[0]!.c2, '3': pal[0]!.c3, obj: '#ffffff', fill: '#000000' },
  });
}

function finish(c: LevelComposer, pal: Palette[], endBeat: number): { level: LevelJSON; composer: LevelComposer; coins: number } {
  const got = coins(c);
  palettes(c, c.info.sections, pal);
  barPulses(c, c.info.sections);
  background(c, c.info.sections, c.frames);
  scenery(c, c.frames);
  return { level: c.finish(endBeat), composer: c, coins: got };
}

const bar = (n: number) => n * 4;

/** Section styling: block style + glow on drops. */
function style(c: LevelComposer, block: string, glow = false): void {
  c.blockStyle = block;
  c.glow = glow;
}

function portalAt(c: LevelComposer, beat: number, key: string): void {
  const t = c.tickOf(beat);
  c.commit(Math.max(c.cursorTick, t - 30));
  c.portal(t, key);
}

export const LEVELS: LevelDef[] = [
  {
    file: '01-neon-footsteps',
    build() {
      const pal: Palette[] = [
        { bg: '#2b2fd6', g: '#1a1c8f', line: '#c8f0ff', c1: '#5cc8ff', c2: '#ff6ad5', c3: '#7a6cff' },
        { bg: '#3b1fb8', g: '#22106e', line: '#ffd6f5', c1: '#ff7ad9', c2: '#5cf2ff', c3: '#b06cff' },
        { bg: '#7a1fa8', g: '#3f0d5c', line: '#ffffff', c1: '#ffe14d', c2: '#5cf2ff', c3: '#ff6ad5' },
        { bg: '#1f3fa8', g: '#0f1f5c', line: '#c8f0ff', c1: '#5cf2a0', c2: '#ffe14d', c3: '#5c8cff' },
      ];
      const c = make('neon-footsteps', 'Neon Footsteps', 'easy', 'neon-footsteps', 11, 1, pal, 0, 0);
      rest(c, 8);
      cube(c, 8, bar(4), { events: [9, 11, 13, 15], kinds: { spike: 1 } });
      style(c, 'block_panel');
      cube(c, bar(4), bar(8));
      style(c, 'block', true);
      cube(c, bar(8), bar(10));
      fly(c, bar(10), bar(14), 'ship', { every: 2, amp: 0.22 });
      cube(c, bar(14), bar(16));
      style(c, 'block_brick');
      cube(c, bar(16), bar(20), { density: 0.6 });
      cube(c, bar(20), bar(24), { kinds: { spike: 1, pad: 0.5, platform: 0.4 } });
      style(c, 'block_grid', true);
      cube(c, bar(24), bar(28));
      fly(c, bar(28), bar(32), 'ship', { every: 2, amp: 0.26 });
      style(c, 'block_panel');
      cube(c, bar(32), bar(36), { density: 0.5 });
      rest(c, bar(37));
      return finish(c, pal, bar(37));
    },
  },
  {
    file: '02-pocket-orbit',
    build() {
      const pal: Palette[] = [
        { bg: '#1f8f6b', g: '#0d4d3a', line: '#d6fff0', c1: '#5cf2a0', c2: '#ffe14d', c3: '#2fb88a' },
        { bg: '#1f6b8f', g: '#0d3a4d', line: '#d6f5ff', c1: '#5cc8ff', c2: '#ff9f1c', c3: '#2f8ab8' },
        { bg: '#2fa86b', g: '#145c38', line: '#ffffff', c1: '#ffe14d', c2: '#ff6ad5', c3: '#5cf2a0' },
        { bg: '#3a5fd6', g: '#1a2c73', line: '#e0e8ff', c1: '#7ab8ff', c2: '#5cf2a0', c3: '#4f6cd6' },
      ];
      const c = make('pocket-orbit', 'Pocket Orbit', 'normal', 'pocket-orbit', 22, 1, pal, 1, 1);
      rest(c, 6);
      style(c, 'block_stud');
      cube(c, 6, bar(4));
      cube(c, bar(4), bar(8), { kinds: { spike: 1, platform: 0.6, pad: 0.3 } });
      style(c, 'block', true);
      fly(c, bar(8), bar(12), 'ship', { every: 2 });
      cube(c, bar(12), bar(16), { kinds: { spike: 1, orb: 0.6, pad: 0.3 } });
      style(c, 'block_panel');
      surfaces(c, bar(16), bar(22), 'ball', { every: [2, 2, 1, 1, 2] });
      cube(c, bar(22), bar(26));
      style(c, 'block_grid', true);
      fly(c, bar(26), bar(32), 'ship', { every: 2, amp: 0.3 });
      cube(c, bar(32), bar(38), { kinds: { spike: 1, orb: 0.4, pad: 0.4, platform: 0.3 } });
      style(c, 'block_stud');
      cube(c, bar(38), bar(41), { density: 0.5 });
      rest(c, bar(42));
      return finish(c, pal, bar(42));
    },
  },
  {
    file: '03-static-bloom',
    build() {
      const pal: Palette[] = [
        { bg: '#8f3a1f', g: '#4d1d0d', line: '#fff0d6', c1: '#ff9f4f', c2: '#5cf2ff', c3: '#b8572f' },
        { bg: '#a82f5c', g: '#5c1430', line: '#ffd6e8', c1: '#ff6aa0', c2: '#ffe14d', c3: '#d64f8a' },
        { bg: '#6b2fa8', g: '#38145c', line: '#ffffff', c1: '#c86cff', c2: '#5cf2a0', c3: '#8a4fd6' },
        { bg: '#a8572f', g: '#5c2c14', line: '#fff0d6', c1: '#ffd24f', c2: '#ff6ad5', c3: '#d6824f' },
      ];
      const c = make('static-bloom', 'Static Bloom', 'normal', 'static-bloom', 33, 1, pal, 2, 0);
      rest(c, 6);
      style(c, 'block_brick');
      cube(c, 6, bar(6));
      cube(c, bar(6), bar(10), { kinds: { spike: 1, platform: 0.5, orb: 0.3 } });
      style(c, 'block_panel', true);
      fly(c, bar(10), bar(16), 'ufo', { every: 2 });
      fly(c, bar(16), bar(22), 'ship', { every: 2, amp: 0.3 });
      style(c, 'block_grid');
      surfaces(c, bar(22), bar(28), 'ball', { every: [1, 2, 1, 2, 2] });
      cube(c, bar(28), bar(32), { kinds: { spike: 1, pad: 0.4, orb: 0.4 } });
      style(c, 'block', true);
      fly(c, bar(32), bar(37), 'ufo', { every: 1.5 });
      cube(c, bar(37), bar(42));
      style(c, 'block_brick');
      cube(c, bar(42), bar(45), { density: 0.4 });
      rest(c, bar(46));
      return finish(c, pal, bar(46));
    },
  },
  {
    file: '04-kite-circuit',
    build() {
      const pal: Palette[] = [
        { bg: '#14307a', g: '#0a1840', line: '#a0e8ff', c1: '#3df2ff', c2: '#ff4fd8', c3: '#2a52b8' },
        { bg: '#0d5c7a', g: '#062e3d', line: '#c8fff8', c1: '#5cf2d0', c2: '#ffe14d', c3: '#1f8aa8' },
        { bg: '#3a147a', g: '#1d0a3d', line: '#ffffff', c1: '#ff4fd8', c2: '#3df2ff', c3: '#6a2fb8' },
        { bg: '#14507a', g: '#0a283d', line: '#d6f0ff', c1: '#7ab8ff', c2: '#ff9f1c', c3: '#2f78b8' },
      ];
      const c = make('kite-circuit', 'Kite Circuit', 'hard', 'kite-circuit', 44, 1, pal, 3, 2);
      rest(c, 4);
      style(c, 'block_grid');
      cube(c, 4, bar(4));
      cube(c, bar(4), bar(8), { speed: 2 });
      style(c, 'block', true);
      wave(c, bar(8), bar(14), { speed: 2 });
      cube(c, bar(14), bar(20), { speed: 2, kinds: { spike: 1, orb: 0.5, pad: 0.3, platform: 0.3 } });
      style(c, 'block_panel');
      robot(c, bar(20), bar(28), { speed: 1, calm: 4 });
      surfaces(c, bar(28), bar(32), 'ball', { speed: 2, every: [1, 1, 2, 1, 1.5, 1.5] });
      style(c, 'block_grid', true);
      fly(c, bar(32), bar(38), 'ship', { speed: 2, every: 1 });
      wave(c, bar(38), bar(42), { speed: 2 });
      cube(c, bar(42), bar(46), { speed: 2, calm: 3 });
      style(c, 'block');
      cube(c, bar(46), bar(49), { speed: 1, density: 0.4 });
      rest(c, bar(50));
      return finish(c, pal, bar(50));
    },
  },
  {
    file: '05-glass-cascade',
    build() {
      const pal: Palette[] = [
        { bg: '#0d6b6b', g: '#063838', line: '#d6ffff', c1: '#5cf2f2', c2: '#ffd24f', c3: '#1fa8a8' },
        { bg: '#2f2fa8', g: '#14145c', line: '#e0e0ff', c1: '#8a8aff', c2: '#5cf2f2', c3: '#4f4fd6' },
        { bg: '#0d4d6b', g: '#062838', line: '#ffffff', c1: '#3dc8ff', c2: '#ff6ad5', c3: '#1f78a8' },
        { bg: '#4d2fa8', g: '#28145c', line: '#f0e0ff', c1: '#c08aff', c2: '#ffe14d', c3: '#7a4fd6' },
      ];
      const c = make('glass-cascade', 'Glass Cascade', 'hard', 'glass-cascade', 55, 1, pal, 1, 2);
      rest(c, 4);
      style(c, 'block_panel');
      cube(c, 4, bar(4), { calm: 3 });
      robot(c, bar(4), bar(8));
      style(c, 'block', true);
      fly(c, bar(8), bar(14), 'ship', { speed: 2, every: 1 });
      dualCube(c, bar(14), bar(18), { speed: 1 });
      wave(c, bar(18), bar(24), { speed: 2 });
      style(c, 'block_grid');
      fly(c, bar(24), bar(32), 'ufo', { speed: 1, every: 1.5 });
      portalAt(c, bar(32), 'portal_mirron');
      cube(c, bar(32), bar(36), { speed: 2, calm: 4 });
      style(c, 'block_brick', true);
      surfaces(c, bar(36), bar(42), 'ball', { every: [1, 1, 1, 2, 1] });
      fly(c, bar(42), bar(48), 'ship', { every: 1 });
      portalAt(c, bar(48), 'portal_mirroff');
      cube(c, bar(48), bar(52), { kinds: { spike: 1, orb: 0.5, pad: 0.3 }, calm: 4 });
      style(c, 'block_panel');
      cube(c, bar(52), bar(55), { speed: 1, density: 0.4 });
      rest(c, bar(56));
      return finish(c, pal, bar(56));
    },
  },
  {
    file: '06-velvet-overdrive',
    build() {
      const pal: Palette[] = [
        { bg: '#5c0d3a', g: '#2e061d', line: '#ffd6ec', c1: '#ff4f9f', c2: '#ffb84f', c3: '#8a1f5c' },
        { bg: '#3a0d5c', g: '#1d062e', line: '#ecd6ff', c1: '#b84fff', c2: '#ff4f9f', c3: '#5c1f8a' },
        { bg: '#7a0d2f', g: '#3d0618', line: '#ffffff', c1: '#ff6a4f', c2: '#ffe14d', c3: '#a81f3a' },
        { bg: '#2f0d7a', g: '#18063d', line: '#e0d6ff', c1: '#7a4fff', c2: '#3df2ff', c3: '#4a1fa8' },
      ];
      const c = make('velvet-overdrive', 'Velvet Overdrive', 'harder', 'velvet-overdrive', 66, 1, pal, 0, 1);
      rest(c, 4);
      style(c, 'block_brick');
      cube(c, 4, bar(6), { calm: 3 });
      surfaces(c, bar(6), bar(10), 'spider', { every: [2, 1, 1, 2] });
      style(c, 'block', true);
      fly(c, bar(10), bar(16), 'swing', { speed: 2, every: 1.5 });
      wave(c, bar(16), bar(21), { speed: 2 });
      cube(c, bar(21), bar(26), { speed: 3 });
      style(c, 'block_panel');
      fly(c, bar(26), bar(34), 'ufo', { speed: 1, every: 1 });
      robot(c, bar(34), bar(38), { speed: 1, calm: 3 });
      style(c, 'block_grid', true);
      surfaces(c, bar(38), bar(44), 'spider', { speed: 2, every: [1, 1, 0.5, 1.5, 1] });
      fly(c, bar(44), bar(50), 'ship', { speed: 2, every: 1 });
      portalAt(c, bar(50), 'portal_sizem');
      wave(c, bar(50), bar(56), { speed: 2 });
      portalAt(c, bar(56), 'portal_sizen');
      style(c, 'block_brick');
      cube(c, bar(56), bar(61), { speed: 1, density: 0.5, calm: 3 });
      rest(c, bar(62));
      return finish(c, pal, bar(62));
    },
  },
  {
    file: '07-thunder-ladder',
    build() {
      const pal: Palette[] = [
        { bg: '#1d1d2e', g: '#0e0e17', line: '#ffe14d', c1: '#ffe14d', c2: '#5cc8ff', c3: '#3a3a5c' },
        { bg: '#2e1d1d', g: '#170e0e', line: '#ff8a4f', c1: '#ff8a4f', c2: '#ffe14d', c3: '#5c3a3a' },
        { bg: '#1d2e2e', g: '#0e1717', line: '#5cf2ff', c1: '#5cf2ff', c2: '#ff4fd8', c3: '#3a5c5c' },
        { bg: '#261d3a', g: '#130e1d', line: '#c86cff', c1: '#c86cff', c2: '#ffe14d', c3: '#4a3a6b' },
      ];
      const c = make('thunder-ladder', 'Thunder Ladder', 'insane', 'thunder-ladder', 77, 1, pal, 3, 2);
      rest(c, 4);
      style(c, 'block_grid');
      cube(c, 4, bar(4), { calm: 3 });
      surfaces(c, bar(4), bar(8), 'ball', { every: [1, 1, 1.5, 0.5, 2] });
      style(c, 'block', true);
      wave(c, bar(8), bar(14), { speed: 2 });
      dualCube(c, bar(14), bar(19), { speed: 2 });
      fly(c, bar(19), bar(24), 'swing', { speed: 2, every: 1 });
      style(c, 'block_panel');
      fly(c, bar(24), bar(32), 'ship', { speed: 1, every: 1 });
      surfaces(c, bar(32), bar(36), 'spider', { speed: 2, every: [1, 0.5, 1, 0.5, 1] });
      style(c, 'block_grid', true);
      wave(c, bar(36), bar(42), { speed: 3 });
      cube(c, bar(42), bar(48), { speed: 3, calm: 4 });
      fly(c, bar(48), bar(54), 'ufo', { speed: 2, every: 1 });
      fly(c, bar(54), bar(60), 'swing', { speed: 2, every: 1 });
      style(c, 'block');
      cube(c, bar(60), bar(67), { speed: 1, density: 0.5, calm: 4 });
      rest(c, bar(68));
      return finish(c, pal, bar(68));
    },
  },
  {
    file: '08-prism-breaker',
    build() {
      const pal: Palette[] = [
        { bg: '#0d0d1d', g: '#06060e', line: '#ff4fd8', c1: '#ff4fd8', c2: '#3df2ff', c3: '#2a2a4a' },
        { bg: '#1d0d0d', g: '#0e0606', line: '#ff3048', c1: '#ff3048', c2: '#ffe14d', c3: '#4a2a2a' },
        { bg: '#0d1d1d', g: '#060e0e', line: '#3df2ff', c1: '#3df2ff', c2: '#5cff7a', c3: '#2a4a4a' },
        { bg: '#150d1d', g: '#0a060e', line: '#ffe14d', c1: '#ffe14d', c2: '#ff4fd8', c3: '#3a2a4a' },
      ];
      const c = make('prism-breaker', 'Prism Breaker', 'extreme', 'prism-breaker', 88, 1, pal, 2, 1);
      rest(c, 4);
      style(c, 'block_grid');
      cube(c, 4, bar(8), { calm: 4 });
      robot(c, bar(8), bar(12));
      surfaces(c, bar(12), bar(16), 'spider', { every: [1, 0.5, 0.5, 1, 1] });
      style(c, 'block', true);
      wave(c, bar(16), bar(22), { speed: 3 });
      cube(c, bar(22), bar(28), { speed: 3, calm: 4 });
      fly(c, bar(28), bar(34), 'swing', { speed: 3, every: 1 });
      fly(c, bar(34), bar(40), 'ship', { speed: 3, every: 1 });
      style(c, 'block_panel');
      cube(c, bar(40), bar(42), { speed: 1, calm: 5 });
      fly(c, bar(42), bar(48), 'ufo', { speed: 1, every: 1 });
      surfaces(c, bar(48), bar(56), 'ball', { speed: 2, every: [1, 0.5, 1, 1, 0.5] });
      style(c, 'block_grid', true);
      portalAt(c, bar(56), 'portal_sizem');
      wave(c, bar(56), bar(62), { speed: 4 });
      portalAt(c, bar(62), 'portal_sizen');
      dualCube(c, bar(62), bar(68), { speed: 2 });
      surfaces(c, bar(68), bar(72), 'spider', { speed: 3, every: [0.5, 1, 0.5, 1] });
      fly(c, bar(72), bar(76), 'ship', { speed: 3, every: 1 });
      style(c, 'block');
      cube(c, bar(76), bar(79), { speed: 1, density: 0.5, calm: 3 });
      rest(c, bar(80));
      return finish(c, pal, bar(80));
    },
  },
];
