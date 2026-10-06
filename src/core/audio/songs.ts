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
};

export function getSong(id: string): SongSpec | undefined {
  return SONGS[id];
}
