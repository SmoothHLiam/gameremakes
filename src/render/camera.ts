import { BLOCK } from '../core/physics.ts';

/** Visible world height in units; width follows the 16:9 stage. */
export const VIEW_H = 340;
export const VIEW_W = (VIEW_H * 16) / 9;
/** Player's horizontal screen position (fraction from the left). */
export const PLAYER_SCREEN_X = 1 / 3;
/** Lowest camera bottom: keeps the ground strip ~27% of the screen tall. */
export const CAMERA_MIN_Y = -3 * BLOCK;
/** Dead zone for vertical follow in unbounded modes (fractions of view height). */
export const DEADZONE_LO = 0.3;
export const DEADZONE_HI = 0.62;
/** Exponential smoothing rates (1/s). */
export const FOLLOW_RATE = 5.5;
export const BOUNDED_RATE = 4;

export interface CameraState {
  /** World x at the left edge of the view. */
  x: number;
  /** World y at the bottom edge of the view. */
  y: number;
  /** Zoom (1 = VIEW_H fits the screen). */
  zoom: number;
  shakeX: number;
  shakeY: number;
}

/** Gameplay camera: fixed horizontal offset, dead-zone vertical follow, bounded-area lock, shake. */
export class GameCamera {
  state: CameraState = { x: 0, y: CAMERA_MIN_Y, zoom: 1, shakeX: 0, shakeY: 0 };
  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeDur = 0;

  reset(playerX: number, playerY: number, bounds: { on: boolean; lo: number; hi: number }): void {
    this.state.x = playerX - VIEW_W * PLAYER_SCREEN_X;
    this.state.y = this.targetY(this.state.y, playerY, bounds, true);
    this.shakeAmp = 0;
    this.state.shakeX = 0;
    this.state.shakeY = 0;
  }

  private targetY(cur: number, py: number, bounds: { on: boolean; lo: number; hi: number }, snap: boolean): number {
    if (bounds.on) {
      return (bounds.lo + bounds.hi) / 2 - VIEW_H / 2;
    }
    let t = snap ? CAMERA_MIN_Y : cur;
    if (py > t + VIEW_H * DEADZONE_HI) t = py - VIEW_H * DEADZONE_HI;
    if (py < t + VIEW_H * DEADZONE_LO) t = py - VIEW_H * DEADZONE_LO;
    return Math.max(CAMERA_MIN_Y, t);
  }

  update(dt: number, playerX: number, playerY: number, bounds: { on: boolean; lo: number; hi: number }): void {
    this.state.x = playerX - VIEW_W * PLAYER_SCREEN_X;
    const target = this.targetY(this.state.y, playerY, bounds, false);
    const rate = bounds.on ? BOUNDED_RATE : FOLLOW_RATE;
    const k = 1 - Math.exp(-dt * rate);
    this.state.y += (target - this.state.y) * k;
    if (Math.abs(target - this.state.y) < 0.01) this.state.y = target;
    // shake
    if (this.shakeTime < this.shakeDur) {
      this.shakeTime += dt;
      const f = Math.max(0, 1 - this.shakeTime / this.shakeDur);
      const a = this.shakeAmp * f;
      this.state.shakeX = (Math.random() * 2 - 1) * a;
      this.state.shakeY = (Math.random() * 2 - 1) * a;
    } else {
      this.state.shakeX = 0;
      this.state.shakeY = 0;
    }
  }

  shake(amplitude: number, duration: number): void {
    if (amplitude >= this.shakeAmp * Math.max(0, 1 - this.shakeTime / Math.max(this.shakeDur, 1e-6))) {
      this.shakeAmp = amplitude;
      this.shakeDur = duration;
      this.shakeTime = 0;
    }
  }
}
