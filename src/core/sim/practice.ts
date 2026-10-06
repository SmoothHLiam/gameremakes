import { GameMode } from '../objects.ts';
import { TICK_RATE } from '../physics.ts';
import { cloneState, type SimState } from './state.ts';

export const AUTO_CHECKPOINT_INTERVAL = 2;
export const AUTO_CHECKPOINT_SURVIVE = 0.5;
/** Max time to wait for a "safe" moment (grounded) before taking the snapshot anyway. */
const SAFE_WAIT = 1;

/** Modes where a mid-air snapshot is often a doomed one; wait until grounded. */
const GROUND_MODES = new Set<number>([GameMode.Cube, GameMode.Robot, GameMode.Ball, GameMode.Spider]);

/**
 * Practice-mode auto checkpoints. A snapshot is taken every interval (at a
 * safe moment when possible) but only committed once the player has survived
 * the next AUTO_CHECKPOINT_SURVIVE seconds, so checkpoints don't land right
 * before an unavoidable death.
 */
export class AutoCheckpoints {
  private readonly interval: number;
  private readonly survive: number;
  private lastTick = 0;
  private pending: SimState | null = null;
  private pendingTick = 0;

  constructor(intervalSeconds = AUTO_CHECKPOINT_INTERVAL, surviveSeconds = AUTO_CHECKPOINT_SURVIVE) {
    this.interval = Math.round(intervalSeconds * TICK_RATE);
    this.survive = Math.round(surviveSeconds * TICK_RATE);
  }

  reset(fromTick: number): void {
    this.lastTick = fromTick;
    this.pending = null;
  }

  onDeath(): void {
    this.pending = null;
  }

  /** Call after every sim step. Returns a snapshot to commit, or null. */
  onTick(s: SimState): SimState | null {
    if (s.dead || s.complete) return null;
    let commit: SimState | null = null;
    if (this.pending && s.tick - this.pendingTick >= this.survive) {
      commit = this.pending;
      this.pending = null;
    }
    if (!this.pending && s.tick - this.lastTick >= this.interval) {
      const safe = s.players.every((p) => !GROUND_MODES.has(p.mode) || p.onGround);
      if (safe || s.tick - this.lastTick >= this.interval + SAFE_WAIT * TICK_RATE) {
        this.pending = cloneState(s);
        this.pendingTick = s.tick;
        this.lastTick = s.tick;
      }
    }
    return commit;
  }
}
