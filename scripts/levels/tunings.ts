import type { Tuning } from '../lib/composer.ts';

/** Difficulty knobs. Margins are units of clearance between the intended path and hazards. */
export const TUNINGS: Record<string, Tuning> = {
  easy: {
    margin: 9, maxSpikes: 1, density: 0.42, halfBeats: false, flyGap: 2.3, waveGap: 1.9, platforms: 0.3, pads: 0.12, orbs: 0.08,
    bars: [[0, 2], [0, 2], [0], [1, 3], [0, 2, 3]],
  },
  normal: {
    margin: 7, maxSpikes: 2, density: 0.55, halfBeats: false, flyGap: 1.9, waveGap: 1.6, platforms: 0.3, pads: 0.15, orbs: 0.15,
    bars: [[0, 2], [0, 1, 2], [0, 2, 3], [1, 3], [0, 1.5, 3]],
  },
  hard: {
    margin: 5, maxSpikes: 2, density: 0.65, halfBeats: true, flyGap: 1.6, waveGap: 1.35, platforms: 0.3, pads: 0.15, orbs: 0.2,
    bars: [[0, 1, 2, 3], [0, 1.5, 3], [0, 2, 2.5], [0.5, 2, 3], [0, 1, 2.5]],
  },
  harder: {
    margin: 4, maxSpikes: 3, density: 0.72, halfBeats: true, flyGap: 1.4, waveGap: 1.15, platforms: 0.25, pads: 0.15, orbs: 0.25,
    bars: [[0, 1, 2, 3], [0, 1.5, 2.5, 3.5], [0, 1, 1.5, 3], [0.5, 1.5, 2.5, 3.5]],
  },
  insane: {
    margin: 3, maxSpikes: 3, density: 0.8, halfBeats: true, flyGap: 1.2, waveGap: 1.0, platforms: 0.25, pads: 0.15, orbs: 0.3,
    bars: [[0, 1, 2, 3], [0, 1, 1.5, 2.5, 3.5], [0, 1.5, 2.5, 3.5], [0.5, 1.5, 2, 3]],
  },
  extreme: {
    margin: 2, maxSpikes: 3, density: 0.88, halfBeats: true, flyGap: 1.0, waveGap: 0.85, platforms: 0.2, pads: 0.15, orbs: 0.35,
    bars: [[0, 1, 1.5, 2.5, 3.5], [0, 1, 2, 3], [0.5, 1.5, 2.5, 3.5], [0, 1.5, 2, 3]],
  },
};
