import type { AudioEngine } from '../app/audio.ts';
import type { LevelJSON } from '../core/level.ts';
import type { SessionAudio, SfxName } from './session.ts';

export const PRACTICE_SONG = 'practice';

/** Binds the audio engine to one level's song and offset. */
export class LevelAudio implements SessionAudio {
  private readonly engine: AudioEngine;
  readonly songId: string;
  readonly offset: number;

  constructor(engine: AudioEngine, level: LevelJSON) {
    this.engine = engine;
    this.songId = level.meta.song;
    this.offset = level.meta.offset;
  }

  startMusic(levelTime: number): number | null {
    this.wantPractice = false;
    return this.engine.play(this.songId, this.offset + levelTime);
  }

  stopMusic(fade = 0.05): void {
    this.wantPractice = false;
    this.engine.stop(fade);
  }

  sfx(name: SfxName): void {
    if (name === 'death' || name === 'coin' || name === 'checkpoint' || name === 'complete' || name === 'click') this.engine.playSfx(name);
  }

  audibleLevelTime(perfNow: number): number | null {
    if (this.engine.playingId !== this.songId) return null;
    const t = this.engine.audibleSongTime(perfNow);
    return t == null ? null : t - this.offset;
  }

  private wantPractice = false;

  startPracticeMusic(): void {
    this.wantPractice = true;
    if (this.engine.playingId === PRACTICE_SONG) return;
    if (this.engine.get(PRACTICE_SONG)?.buffer) {
      this.engine.play(PRACTICE_SONG, 0, { loop: true, fadeIn: 0.6 });
      return;
    }
    // still rendering: start it the moment it's ready (if practice is still on)
    void this.engine.load(PRACTICE_SONG).then(() => {
      if (this.wantPractice && this.engine.playingId !== PRACTICE_SONG) this.engine.play(PRACTICE_SONG, 0, { loop: true, fadeIn: 0.6 });
    });
  }
}
