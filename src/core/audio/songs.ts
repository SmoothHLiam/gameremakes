import type { SongSpec } from './song.ts';

/**
 * The original soundtrack. Every song is composed here from a spec (tempo,
 * key, progression, arrangement, instruments, motif seed) and rendered by
 * the in-house synth. Section layouts double as the level designers' map.
 */
export const SONGS: Record<string, SongSpec> = {
  'test-a': {
    id: 'test-a', title: 'Test Pattern', bpm: 128, root: 57, scale: 'minor', seed: 11,
    prog: [0, 5, 2, 6], sections: [
      { kind: 'intro', bars: 2 }, { kind: 'build', bars: 2 }, { kind: 'drop', bars: 4 }, { kind: 'outro', bars: 2 },
    ],
    drums: 'four', bassStyle: 'offbeat', arp: [0, 1, 2, 1, 3, 2, 1, 2], leadPatch: 'supersaw',
  },
  menu: {
    id: 'menu', title: 'Lobby Lights', bpm: 122, root: 53, scale: 'dorian', seed: 4, loop: true,
    prog: [0, 3, 4, 3], chordBars: 2, sevenths: true,
    sections: [{ kind: 'groove', bars: 8 }, { kind: 'break', bars: 4 }, { kind: 'groove', bars: 4 }],
    drums: 'four', bassStyle: 'octave', arp: [0, 2, 1, 3, 2, 4, 3, 1], arpRate: 2, leadPatch: 'square', breakPatch: 'bell',
  },
  practice: {
    id: 'practice', title: 'Patient Steps', bpm: 104, root: 55, scale: 'major', seed: 21, loop: true,
    prog: [0, 4, 5, 3], chordBars: 2, sevenths: true,
    sections: [{ kind: 'break', bars: 8 }, { kind: 'groove', bars: 8 }],
    drums: 'half', bassStyle: 'sustain', arp: [0, 1, 2, 3], arpRate: 2, arpPatch: 'pluck', leadPatch: 'bell', breakPatch: 'bell',
  },
  // ---------------------------------------------------------------- level songs
  'neon-footsteps': {
    id: 'neon-footsteps', title: 'Neon Footsteps', bpm: 128, root: 57, scale: 'minor', seed: 101,
    prog: [0, 5, 2, 6],
    sections: [
      { kind: 'intro', bars: 4 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'break', bars: 4 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'outro', bars: 5 },
    ],
    drums: 'four', bassStyle: 'offbeat', arp: [0, 1, 2, 1, 3, 2, 1, 2], leadPatch: 'supersaw', chordPatch: 'pad',
    rhythm: [0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 28],
  },
  'pocket-orbit': {
    id: 'pocket-orbit', title: 'Pocket Orbit', bpm: 132, root: 55, scale: 'major', seed: 202,
    prog: [0, 4, 5, 3],
    sections: [
      { kind: 'intro', bars: 4 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 8 }, { kind: 'break', bars: 6 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 12 }, { kind: 'outro', bars: 4 },
    ],
    drums: 'four', bassStyle: 'pulse', arp: [0, 2, 1, 3, 2, 4, 3, 1], leadPatch: 'chip', breakPatch: 'bell', chordPatch: 'stab',
    rhythm: [0, 2, 4, 7, 10, 12, 16, 18, 20, 23, 26, 28, 30],
  },
  'static-bloom': {
    id: 'static-bloom', title: 'Static Bloom', bpm: 136, root: 50, scale: 'dorian', seed: 303, sevenths: true,
    prog: [0, 3, 0, 4],
    sections: [
      { kind: 'intro', bars: 6 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 12 }, { kind: 'break', bars: 6 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 10 }, { kind: 'outro', bars: 4 },
    ],
    drums: 'electro', bassStyle: 'rolling', arp: [0, 1, 2, 3, 2, 1], leadPatch: 'square', chordPatch: 'stab',
    rhythm: [0, 3, 6, 10, 12, 14, 16, 19, 22, 26, 28],
  },
  'kite-circuit': {
    id: 'kite-circuit', title: 'Kite Circuit', bpm: 140, root: 52, scale: 'minor', seed: 404,
    prog: [0, 6, 5, 6],
    sections: [
      { kind: 'intro', bars: 4 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 12 }, { kind: 'break', bars: 8 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 14 }, { kind: 'outro', bars: 4 },
    ],
    drums: 'break', bassStyle: 'octave', arp: [0, 2, 4, 2], leadPatch: 'supersaw', chordPatch: 'pad',
    rhythm: [0, 4, 6, 8, 11, 14, 16, 20, 22, 24, 27, 30],
  },
  'glass-cascade': {
    id: 'glass-cascade', title: 'Glass Cascade', bpm: 146, root: 56, scale: 'harmonic', seed: 505,
    prog: [0, 5, 3, 4],
    sections: [
      { kind: 'intro', bars: 4 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 16 }, { kind: 'break', bars: 8 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 16 }, { kind: 'outro', bars: 4 },
    ],
    drums: 'four', bassStyle: 'rolling', arp: [0, 1, 2, 3, 4, 3, 2, 1], arpPatch: 'pluck', leadPatch: 'square', breakPatch: 'bell', chordPatch: 'stab',
    rhythm: [0, 2, 3, 6, 8, 10, 12, 16, 18, 19, 22, 24, 26, 28],
  },
  'velvet-overdrive': {
    id: 'velvet-overdrive', title: 'Velvet Overdrive', bpm: 152, root: 53, scale: 'phrygian', seed: 606,
    prog: [0, 1, 0, 6],
    sections: [
      { kind: 'intro', bars: 6 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 16 }, { kind: 'break', bars: 8 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 18 }, { kind: 'outro', bars: 6 },
    ],
    drums: 'electro', bassStyle: 'pulse', bassPatch: 'reese', arp: [0, 2, 1, 2, 3, 2, 1, 0], leadPatch: 'supersaw', chordPatch: 'pad',
    rhythm: [0, 3, 6, 9, 12, 14, 16, 19, 22, 25, 28, 30],
  },
  'thunder-ladder': {
    id: 'thunder-ladder', title: 'Thunder Ladder', bpm: 160, root: 49, scale: 'minor', seed: 707,
    prog: [0, 3, 6, 2],
    sections: [
      { kind: 'intro', bars: 4 }, { kind: 'build', bars: 4 }, { kind: 'drop', bars: 16 }, { kind: 'break', bars: 8 },
      { kind: 'build', bars: 4 }, { kind: 'drop', bars: 24 }, { kind: 'outro', bars: 8 },
    ],
    drums: 'half', bassStyle: 'sustain', bassPatch: 'reese', arp: [0, 1, 2, 4, 2, 1], leadPatch: 'chip', breakPatch: 'bell', chordPatch: 'stab',
    rhythm: [0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 28],
  },
  'prism-breaker': {
    id: 'prism-breaker', title: 'Prism Breaker', bpm: 174, root: 54, scale: 'minor', seed: 808,
    prog: [0, 5, 2, 6],
    sections: [
      { kind: 'intro', bars: 8 }, { kind: 'build', bars: 8 }, { kind: 'drop', bars: 24 }, { kind: 'break', bars: 8 },
      { kind: 'build', bars: 8 }, { kind: 'drop', bars: 20 }, { kind: 'outro', bars: 4 },
    ],
    drums: 'dnb', bassStyle: 'rolling', bassPatch: 'reese', arp: [0, 2, 4, 5, 4, 2], leadPatch: 'supersaw', chordPatch: 'pad', delayBeats: 0.5,
    rhythm: [0, 2, 4, 7, 10, 12, 16, 18, 20, 23, 26, 28, 30],
  },
};

/** The eight level songs in campaign order. */
export const LEVEL_SONGS = ['neon-footsteps', 'pocket-orbit', 'static-bloom', 'kite-circuit', 'glass-cascade', 'velvet-overdrive', 'thunder-ladder', 'prism-breaker'] as const;

export function getSong(id: string): SongSpec | undefined {
  return SONGS[id];
}
