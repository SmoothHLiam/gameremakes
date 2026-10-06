/**
 * Level clock. The sim clock is extrapolated from performance.now() so input
 * timestamps map cleanly onto ticks; when an audio source is attached, the
 * sim clock is continuously compared with the audio clock and pulled back in
 * line: small errors are slewed out, anything over RESYNC_THRESHOLD snaps.
 */
export const RESYNC_THRESHOLD = 1 / 60;
const SLEW = 0.15;

export interface AudioTimeSource {
  /** Level time (s) the listener is hearing right now, or null if not playing. */
  audibleLevelTime(perfNow: number): number | null;
}

export class LevelClock {
  private baseTime = 0;
  private basePerf = 0;
  private running = false;
  private frozenAt = 0;
  audio: AudioTimeSource | null = null;
  /** Diagnostics. */
  lastError = 0;
  resyncs = 0;
  /** Playback rate (tests may run faster than real time when there is no audio). */
  rate = 1;

  start(levelTime: number, perfNow: number): void {
    this.baseTime = levelTime;
    this.basePerf = perfNow;
    this.running = true;
    this.lastError = 0;
  }

  stop(perfNow: number): void {
    if (!this.running) return;
    this.frozenAt = this.at(perfNow);
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Level time at a performance timestamp (ms). */
  at(perfMs: number): number {
    if (!this.running) return this.frozenAt;
    return this.baseTime + ((perfMs - this.basePerf) / 1000) * this.rate;
  }

  /** Called once per frame. Applies audio sync and returns this frame's level time. */
  frame(perfNow: number): number {
    if (!this.running) return this.frozenAt;
    const sim = this.at(perfNow);
    const audio = this.audio?.audibleLevelTime(perfNow);
    if (audio != null) {
      const err = audio - sim;
      this.lastError = err;
      if (Math.abs(err) > RESYNC_THRESHOLD) {
        this.baseTime = audio;
        this.basePerf = perfNow;
        this.resyncs++;
        return audio;
      }
      // gentle slew toward the audio clock
      this.baseTime += err * SLEW;
      return this.at(perfNow);
    }
    return sim;
  }
}
