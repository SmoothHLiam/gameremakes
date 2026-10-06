import { dcosDeg, dsinDeg, tanSnapped15 } from '../dmath.ts';
import {
  BOUNDED_MODES, CEILING_MODES, GameMode, Kind, MODE_KEYS, OrbType, PadType, PortalType,
} from '../objects.ts';
import * as P from '../physics.ts';
import { cloneState, initialState, makePlayer, type PlayerState, type SimState } from './state.ts';
import { fireTriggers, updateTriggers } from './triggers.ts';
import { chunkOf, Corner, type World } from './world.ts';

export interface TickInput {
  /** Button is down during this tick. */
  held: boolean;
  /** A press edge happened at this tick. */
  pressed: boolean;
}

export type SimEvent =
  | { type: 'jump'; p: number }
  | { type: 'land'; p: number }
  | { type: 'death'; p: number; x: number; y: number }
  | { type: 'orb'; p: number; obj: number; sub: number }
  | { type: 'pad'; p: number; obj: number; sub: number }
  | { type: 'portal'; p: number; obj: number; sub: number; val: number }
  | { type: 'coin'; p: number; obj: number; slot: number }
  | { type: 'teleport'; p: number; fromY: number; toY: number }
  | { type: 'flip'; p: number }
  | { type: 'shake'; amp: number; dur: number }
  | { type: 'complete' };

const DT = P.DT;
const NO_INPUT: TickInput = { held: false, pressed: false };

interface ModeConsts {
  halfW: number;
  halfH: number;
  innerW: number;
  innerH: number;
  tol: number;
}

/** Visual angle (deg) of the slope types we have. Visual only. */
function slopeAngleDeg(k: number): number {
  return k === 1 ? 45 : k === 0.5 ? 26.565051177 : k === 2 ? 63.434948823 : 45;
}

function boundsHeight(mode: number): number {
  const key = MODE_KEYS[mode] as keyof typeof P.BOUNDS_HEIGHT;
  return P.BOUNDS_HEIGHT[key] ?? P.BOUNDS_HEIGHT.dual;
}

export function playerBox(p: PlayerState): ModeConsts {
  const hb = P.HITBOX[MODE_KEYS[p.mode]!];
  const sc = p.mini ? P.MINI_SCALE : 1;
  const halfW = (hb.w * sc) / 2;
  const halfH = (hb.h * sc) / 2;
  const inner = p.mode === GameMode.Wave ? P.WAVE_INNER_HITBOX_SCALE : P.INNER_HITBOX_SCALE;
  return { halfW, halfH, innerW: halfW * inner, innerH: halfH * inner, tol: P.SNAP_TOLERANCE * sc };
}

export class Simulation {
  readonly world: World;
  state: SimState;
  events: SimEvent[] = [];
  /** Scratch: position of the last object resolved by objPos(). */
  ox = 0;
  oy = 0;
  orot = 0;
  private stamp: Uint32Array;
  private stampN = 0;
  private cand: Int32Array = new Int32Array(256);
  private candX: Float64Array = new Float64Array(256);
  private candY: Float64Array = new Float64Array(256);
  private candR: Float64Array = new Float64Array(256);
  private candN = 0;

  constructor(world: World, state?: SimState) {
    this.world = world;
    this.stamp = new Uint32Array(world.n);
    this.state = state ? cloneState(state) : this.spawnState();
  }

  /** Fresh state at the level start. */
  spawnState(): SimState {
    const s = initialState(this.world);
    const p = s.players[0]!;
    if (BOUNDED_MODES[p.mode]) {
      s.boundsOn = true;
      s.boundsLo = 0;
      s.boundsHi = boundsHeight(p.mode) * P.BLOCK;
    }
    const box = playerBox(p);
    p.y = p.g === 1 ? box.halfH : (s.boundsOn ? s.boundsHi : 10 * P.BLOCK) - box.halfH;
    p.onGround = true;
    return s;
  }

  reset(state?: SimState): void {
    this.state = state ? cloneState(state) : this.spawnState();
    this.events.length = 0;
  }

  get done(): boolean {
    return this.state.dead || this.state.complete;
  }

  // ------------------------------------------------------------ object queries

  /** Resolves the current position (and extra rotation) of object i into ox/oy/orot. */
  objPos(i: number): void {
    const w = this.world;
    const s = this.state;
    const gs = w.groupStart[i]!;
    const ge = w.groupStart[i + 1]!;
    let x = w.x[i]!;
    let y = w.y[i]!;
    let r = 0;
    if (gs !== ge) {
      for (let k = gs; k < ge; k++) {
        const g = w.groupList[k]!;
        x += s.gdx[g]!;
        y += s.gdy[g]!;
      }
      for (let k = gs; k < ge; k++) {
        const g = w.groupList[k]!;
        const deg = s.grot[g]!;
        if (deg === 0) continue;
        r += deg;
        const cg = s.gcenter[g]!;
        if (!cg) continue;
        const members = w.groupMembers.get(cg);
        if (!members || !members.length) continue;
        const c = members[0]!;
        if (c === i) continue;
        // center object's own translation
        let cx = w.x[c]!;
        let cy = w.y[c]!;
        for (let q = w.groupStart[c]!; q < w.groupStart[c + 1]!; q++) {
          const cgq = w.groupList[q]!;
          cx += s.gdx[cgq]!;
          cy += s.gdy[cgq]!;
        }
        // clockwise rotation in a y-up world
        const sn = dsinDeg(deg);
        const cs = dcosDeg(deg);
        const dx = x - cx;
        const dy = y - cy;
        x = cx + dx * cs + dy * sn;
        y = cy - dx * sn + dy * cs;
      }
    }
    this.ox = x;
    this.oy = y;
    this.orot = r;
  }

  objHidden(i: number): boolean {
    const w = this.world;
    const s = this.state;
    for (let k = w.groupStart[i]!; k < w.groupStart[i + 1]!; k++) {
      if (s.ghidden[w.groupList[k]!]) return true;
    }
    return false;
  }

  /** Gathers collidable objects in chunks overlapping [x0, x1] with resolved positions. */
  private gather(x0: number, x1: number): void {
    const w = this.world;
    const c0 = Math.max(0, chunkOf(x0));
    const c1 = Math.min(w.chunkCount - 1, chunkOf(x1));
    this.stampN = (this.stampN + 1) >>> 0;
    if (this.stampN === 0) {
      this.stamp.fill(0);
      this.stampN = 1;
    }
    let n = 0;
    for (let c = c0; c <= c1; c++) {
      for (let k = w.chunkStart[c]!; k < w.chunkStart[c + 1]!; k++) {
        const i = w.chunkList[k]!;
        if (this.stamp[i] === this.stampN) continue;
        this.stamp[i] = this.stampN;
        if (w.groupStart[i] !== w.groupStart[i + 1] && this.objHidden(i)) continue;
        if (n >= this.cand.length) this.growCand();
        this.objPos(i);
        this.cand[n] = i;
        this.candX[n] = this.ox;
        this.candY[n] = this.oy;
        this.candR[n] = this.orot;
        n++;
      }
    }
    this.candN = n;
  }

  private growCand(): void {
    const size = this.cand.length * 2;
    const grow = <T extends Int32Array | Float64Array>(a: T, make: (n: number) => T): T => {
      const b = make(size);
      b.set(a);
      return b;
    };
    this.cand = grow(this.cand, (n) => new Int32Array(n));
    this.candX = grow(this.candX, (n) => new Float64Array(n));
    this.candY = grow(this.candY, (n) => new Float64Array(n));
    this.candR = grow(this.candR, (n) => new Float64Array(n));
  }

  /** Hitbox center/half-size of a box object at a resolved position (handles group rotation). */
  private boxOf(i: number, cx: number, cy: number, extraRot: number): [number, number, number, number] {
    const w = this.world;
    let hx = w.hx[i]!;
    let hy = w.hy[i]!;
    let hw = w.hw[i]!;
    let hh = w.hh[i]!;
    if (extraRot !== 0) {
      const sn = dsinDeg(extraRot);
      const cs = dcosDeg(extraRot);
      const rx = hx * cs + hy * sn;
      const ry = -hx * sn + hy * cs;
      hx = rx;
      hy = ry;
      const q = Math.round(extraRot / 90) & 1;
      if (q) {
        const t = hw;
        hw = hh;
        hh = t;
      }
    }
    return [cx + hx, cy + hy, hw, hh];
  }

  // ------------------------------------------------------------ stepping

  /** Advances exactly one tick. */
  step(input: TickInput = NO_INPUT): void {
    const s = this.state;
    if (s.dead || s.complete) return;
    const w = this.world;
    s.held = input.held;
    s.x += P.SPEEDS[s.speed]! * DT;

    for (let pi = 0; pi < s.players.length; pi++) {
      this.stepPlayer(pi, input);
      if (s.dead) break;
    }
    s.tick++;

    if (!s.dead) {
      fireTriggers(w, s, (t) => this.events.push({ type: 'shake', amp: t.amp, dur: t.dur }));
      updateTriggers(w, s);
      if (s.x >= w.endX) {
        s.complete = true;
        s.endTick = s.tick;
        this.events.push({ type: 'complete' });
      }
    }
  }

  private setU(p: PlayerState, u: number): void {
    p.vy = u * p.g;
  }

  private die(pi: number): void {
    const s = this.state;
    const p = s.players[pi]!;
    if (p.dead) return;
    p.dead = true;
    s.dead = true;
    s.endTick = s.tick;
    this.events.push({ type: 'death', p: pi, x: s.x, y: p.y });
  }

  private stepPlayer(pi: number, input: TickInput): void {
    const s = this.state;
    const w = this.world;
    const p = s.players[pi]!;
    const vx = P.SPEEDS[s.speed]!;
    const wasGrounded = p.onGround;
    const wasCeiling = p.onCeiling;
    let groundedForSnap = wasGrounded;
    let box = playerBox(p);

    if (input.pressed) p.buffer = P.PRESS_BUFFER_TICKS + 1;
    let consumed = false;

    // ---------------------------------------------------- orbs (need a fresh / buffered press)
    if (p.buffer > 0) {
      this.gather(s.x - box.halfW - 60, s.x + box.halfW + 60);
      const bit = 1 << pi;
      for (let c = 0; c < this.candN; c++) {
        const i = this.cand[c]!;
        if (w.kind[i] !== Kind.Orb || s.used[i]! & bit) continue;
        const [bx, by, bw, bh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
        if (Math.abs(bx - s.x) < bw + box.halfW && Math.abs(by - p.y) < bh + box.halfH) {
          s.used[i]! |= bit;
          this.applyOrb(pi, p, i, w.sub[i]!, w.rot[i]! + this.candR[c]!);
          consumed = true;
          p.buffer = 0;
          groundedForSnap = false;
          break;
        }
      }
    }

    if (p.dashing && !input.held) p.dashing = false;

    // ---------------------------------------------------- mode input & gravity
    let u = p.vy * p.g;
    const mini = p.mini;
    switch (p.mode) {
      case GameMode.Cube: {
        if (!consumed && input.held && wasGrounded && !p.dashing) {
          u = mini ? P.MINI_CUBE_JUMP_VELOCITY : P.CUBE_JUMP_VELOCITY;
          groundedForSnap = false;
          p.buffer = 0;
          this.events.push({ type: 'jump', p: pi });
        }
        u -= (mini ? P.MINI_CUBE_GRAVITY : P.CUBE_GRAVITY) * DT;
        if (u < -P.CUBE_TERMINAL_VELOCITY) u = -P.CUBE_TERMINAL_VELOCITY;
        break;
      }
      case GameMode.Ship: {
        const maxRise = mini ? P.MINI_SHIP_MAX_RISE : P.SHIP_MAX_RISE;
        const maxFall = mini ? P.MINI_SHIP_MAX_FALL : P.SHIP_MAX_FALL;
        if (input.held) u += (mini ? P.MINI_SHIP_THRUST : P.SHIP_THRUST) * DT;
        else u -= (mini ? P.MINI_SHIP_GRAVITY : P.SHIP_GRAVITY) * DT;
        u = capSoft(u, maxRise, maxFall);
        if (input.held && wasGrounded) groundedForSnap = false;
        break;
      }
      case GameMode.Ball: {
        if (!consumed && p.buffer > 0 && wasGrounded) {
          p.g = p.g === 1 ? -1 : 1;
          u = -P.BALL_FLIP_VELOCITY;
          p.buffer = 0;
          groundedForSnap = false;
          this.events.push({ type: 'flip', p: pi });
        }
        u -= (mini ? P.MINI_BALL_GRAVITY : P.BALL_GRAVITY) * DT;
        const term = mini ? P.MINI_BALL_TERMINAL_VELOCITY : P.BALL_TERMINAL_VELOCITY;
        if (u < -term) u = -term;
        break;
      }
      case GameMode.Ufo: {
        if (!consumed && input.pressed) {
          u = mini ? P.MINI_UFO_HOP_VELOCITY : P.UFO_HOP_VELOCITY;
          p.buffer = 0;
          groundedForSnap = false;
          this.events.push({ type: 'jump', p: pi });
        }
        u -= (mini ? P.MINI_UFO_GRAVITY : P.UFO_GRAVITY) * DT;
        const term = mini ? P.MINI_UFO_TERMINAL_VELOCITY : P.UFO_TERMINAL_VELOCITY;
        if (u < -term) u = -term;
        break;
      }
      case GameMode.Wave: {
        const v = vx * (mini ? P.MINI_WAVE_SLOPE : P.WAVE_SLOPE);
        u = input.held ? v : -v;
        if (input.held) groundedForSnap = false;
        break;
      }
      case GameMode.Robot: {
        const jumpV = mini ? P.MINI_ROBOT_JUMP_VELOCITY : P.ROBOT_JUMP_VELOCITY;
        const maxBoost = Math.round((mini ? P.MINI_ROBOT_MAX_BOOST_TIME : P.ROBOT_MAX_BOOST_TIME) * P.TICK_RATE);
        if (!consumed && input.held && wasGrounded && !p.dashing) {
          u = jumpV;
          p.boost = 0;
          groundedForSnap = false;
          p.buffer = 0;
          this.events.push({ type: 'jump', p: pi });
        } else if (p.boost >= 0) {
          if (input.held && p.boost < maxBoost) {
            u = jumpV;
            p.boost++;
          } else {
            p.boost = -1;
          }
        }
        if (p.boost < 0) {
          u -= P.ROBOT_GRAVITY * DT;
          if (u < -P.ROBOT_TERMINAL_VELOCITY) u = -P.ROBOT_TERMINAL_VELOCITY;
        }
        break;
      }
      case GameMode.Spider: {
        if (!consumed && p.buffer > 0 && wasGrounded) {
          p.buffer = 0;
          this.spiderTeleport(pi, p, box);
          u = p.vy * p.g;
          groundedForSnap = p.onGround;
        } else {
          u -= P.SPIDER_GRAVITY * DT;
          if (u < -P.SPIDER_TERMINAL_VELOCITY) u = -P.SPIDER_TERMINAL_VELOCITY;
        }
        break;
      }
      case GameMode.Swing: {
        if (!consumed && input.pressed) {
          p.g = p.g === 1 ? -1 : 1;
          // keep world velocity direction, damped
          u = -u * P.SWING_FLIP_KEEP;
          p.buffer = 0;
          groundedForSnap = false;
          this.events.push({ type: 'flip', p: pi });
        }
        u -= (mini ? P.MINI_SWING_GRAVITY : P.SWING_GRAVITY) * DT;
        const max = mini ? P.MINI_SWING_MAX_VELOCITY : P.SWING_MAX_VELOCITY;
        u = capSoft(u, max, max);
        break;
      }
    }
    if (p.dashing) {
      u = p.dashU;
      groundedForSnap = false;
    }
    p.vy = u * p.g;

    // ---------------------------------------------------- integrate
    p.y += p.vy * DT;
    box = playerBox(p);
    this.resolve(pi, p, box, groundedForSnap, wasCeiling, vx);
    if (p.dead) return;

    if (p.onGround && !wasGrounded) this.events.push({ type: 'land', p: pi });
    if (p.onGround && p.dashing && p.dashU <= 0) p.dashing = false;
    p.airTicks = p.onGround ? 0 : p.airTicks + 1;
    if (p.buffer > 0) p.buffer--;

    // ---------------------------------------------------- visual rotation
    switch (p.mode) {
      case GameMode.Cube: {
        if (p.onGround) {
          const base = p.slopeDeg;
          const target = base + Math.round((p.rot - base) / 90) * 90;
          const stepDeg = P.LAND_SNAP_SPIN_RATE * DT;
          const d = target - p.rot;
          p.rot = Math.abs(d) <= stepDeg ? target : p.rot + (d > 0 ? stepDeg : -stepDeg);
        } else {
          p.rot += p.g * (mini ? P.MINI_CUBE_SPIN_RATE : P.CUBE_SPIN_RATE) * DT;
        }
        break;
      }
      case GameMode.Ball:
        p.rot += p.g * P.BALL_SPIN_RATE * (vx / P.SPEEDS[1]!) * DT;
        break;
      default:
        break;
    }
  }

  /** Collision resolution, death checks, and contact interactions for one player. */
  private resolve(pi: number, p: PlayerState, box: ModeConsts, grounded: boolean, wasCeiling: boolean, vx: number): void {
    const s = this.state;
    const w = this.world;
    const g = p.g;
    const x = s.x;
    const hasCeiling = CEILING_MODES[p.mode]!;
    const { halfW, halfH, tol } = box;
    let u = p.vy * g;

    // relative frame: ry is "height above the floor direction"
    let ry = g * p.y;
    let bot = ry - halfH;
    let top = ry + halfH;

    let floorRel = -Infinity;
    let floorU = 0;
    let floorSlope = 0;
    let ceilRel = Infinity;
    let ceilU = 0;

    this.gather(x - halfW - 4, x + halfW + 4);
    const n = this.candN;
    const stick = grounded ? Math.max(0, u) * DT + P.SLOPE_STICK : 0;

    for (let c = 0; c < n; c++) {
      const i = this.cand[c]!;
      const kind = w.kind[i]!;
      if (kind === Kind.Solid) {
        const [cx, cy, hw, hh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
        if (Math.abs(cx - x) >= hw + halfW) continue;
        const y0 = cy - hh;
        const y1 = cy + hh;
        const sTop = g === 1 ? y1 : -y0;
        const sBot = g === 1 ? y0 : -y1;
        // floor
        const pen = sTop - bot;
        if (pen <= tol && (pen > 0 || (grounded && pen > -stick)) && (u <= 0 || grounded) && sTop > floorRel) {
          floorRel = sTop;
          floorU = 0;
          floorSlope = 0;
        }
        // ceiling
        if (hasCeiling) {
          const pen2 = top - sBot;
          if (pen2 > 0 && pen2 <= tol && (u >= 0 || wasCeiling) && sBot < ceilRel && bot < sTop) {
            ceilRel = sBot;
            ceilU = 0;
          }
        }
      } else if (kind === Kind.Slope) {
        const cx = this.candX[c]!;
        const cy = this.candY[c]!;
        const hw = w.hw[i]!;
        const hh = w.hh[i]!;
        const x0 = cx - hw;
        const x1 = cx + hw;
        if (x < x0 || x > x1) continue;
        const corner = w.corner[i]!;
        const k = w.slopeK[i]!;
        const rising = corner === Corner.BR || corner === Corner.TL;
        const surfWorld = rising ? cy - hh + (x - x0) * k : cy + hh - (x - x0) * k;
        const worldFloor = corner === Corner.BR || corner === Corner.BL;
        const surfRel = g * surfWorld;
        const relDir = g * (rising ? 1 : -1);
        const slopeU = vx * k * relDir;
        const isFloor = (g === 1) === worldFloor;
        if (isFloor) {
          const pen = surfRel - bot;
          const reach = grounded ? Math.abs(slopeU) * DT + P.SLOPE_STICK + stick : 0;
          if (pen <= tol + Math.abs(slopeU) * DT && (pen > 0 || pen > -reach) && (u <= Math.max(slopeU, 0) + 1 || grounded) && surfRel > floorRel) {
            floorRel = surfRel;
            floorU = slopeU;
            // visual tilt: clockwise degrees of the surface
            floorSlope = (rising ? -1 : 1) * slopeAngleDeg(k);
          }
        } else if (hasCeiling) {
          const pen2 = top - surfRel;
          if (pen2 > 0 && pen2 <= tol + Math.abs(slopeU) * DT && (u >= Math.min(slopeU, 0) - 1 || wasCeiling) && surfRel < ceilRel) {
            ceilRel = surfRel;
            ceilU = slopeU;
          }
        }
      }
    }

    // implicit planes: ground / play-area bounds (always solid, never deadly)
    const worldFloor = s.boundsOn ? s.boundsLo : 0;
    const worldCeil = s.boundsOn ? s.boundsHi : Infinity;
    const planeFloor = g === 1 ? worldFloor : -worldCeil;
    const planeCeil = g === 1 ? worldCeil : -worldFloor;

    let onGround = false;
    let onCeiling = false;
    if (floorRel > -Infinity) {
      ry = floorRel + halfH;
      u = floorU;
      onGround = true;
      p.slopeDeg = floorSlope;
    }
    if (ceilRel < Infinity && ry + halfH > ceilRel) {
      ry = ceilRel - halfH;
      if (u > ceilU) u = ceilU;
      onCeiling = true;
    }
    bot = ry - halfH;
    top = ry + halfH;
    if (bot <= planeFloor && planeFloor > -Infinity) {
      if (bot < planeFloor || u <= 0) {
        ry = planeFloor + halfH;
        if (u < 0) u = 0;
        onGround = true;
        p.slopeDeg = 0;
      }
    }
    if (top >= planeCeil && planeCeil < Infinity) {
      if (top > planeCeil || u >= 0) {
        ry = planeCeil - halfH;
        if (u > 0) u = 0;
        onCeiling = true;
      }
    }
    if (!onGround) p.slopeDeg = 0;
    p.y = g * ry;
    p.vy = u * g;
    p.onGround = onGround;
    p.onCeiling = onCeiling;
    if (onGround && p.boost >= 0 && u <= 0) p.boost = -1;

    // world top limit (flipped cube flying away)
    if (!s.boundsOn && p.y > w.maxY + P.WORLD_TOP_MARGIN) {
      this.die(pi);
      return;
    }

    // ---------------------------------------------------- deaths
    const iw = box.innerW;
    const ih = box.innerH;
    const ix0 = x - iw;
    const ix1 = x + iw;
    const iy0 = p.y - ih;
    const iy1 = p.y + ih;
    const ox0 = x - halfW;
    const ox1 = x + halfW;
    const oy0 = p.y - halfH;
    const oy1 = p.y + halfH;
    for (let c = 0; c < n; c++) {
      const i = this.cand[c]!;
      const kind = w.kind[i]!;
      if (kind === Kind.Solid) {
        const [cx, cy, hw, hh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
        if (ix1 > cx - hw && ix0 < cx + hw && iy1 > cy - hh && iy0 < cy + hh) {
          this.die(pi);
          return;
        }
      } else if (kind === Kind.Slope) {
        const cx = this.candX[c]!;
        const cy = this.candY[c]!;
        if (boxHitsSlope(ix0, ix1, iy0, iy1, cx - w.hw[i]!, cx + w.hw[i]!, cy - w.hh[i]!, cy + w.hh[i]!, w.corner[i]!, w.slopeK[i]!)) {
          this.die(pi);
          return;
        }
      } else if (kind === Kind.Hazard) {
        const [cx, cy, hw, hh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
        if (ox1 > cx - hw && ox0 < cx + hw && oy1 > cy - hh && oy0 < cy + hh) {
          this.die(pi);
          return;
        }
      } else if (kind === Kind.Saw) {
        const cx = this.candX[c]!;
        const cy = this.candY[c]!;
        const r = w.hr[i]!;
        const nx = cx < ox0 ? ox0 : cx > ox1 ? ox1 : cx;
        const ny = cy < oy0 ? oy0 : cy > oy1 ? oy1 : cy;
        const dx = cx - nx;
        const dy = cy - ny;
        if (dx * dx + dy * dy < r * r) {
          this.die(pi);
          return;
        }
      }
    }

    // ---------------------------------------------------- contact interactions
    const bit = 1 << pi;
    for (let c = 0; c < n; c++) {
      const i = this.cand[c]!;
      const kind = w.kind[i]!;
      if (kind !== Kind.Pad && kind !== Kind.Portal && kind !== Kind.Coin) continue;
      if (s.used[i]! & bit) continue;
      const [cx, cy, hw, hh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
      // re-read: an earlier interaction this tick may have changed size or mode
      const bb = playerBox(p);
      if (!(Math.abs(cx - x) < hw + bb.halfW && Math.abs(cy - p.y) < hh + bb.halfH)) continue;
      if (kind === Kind.Pad) {
        s.used[i]! |= bit;
        this.applyPad(pi, p, i, w.sub[i]!);
      } else if (kind === Kind.Portal) {
        this.applyPortal(pi, p, i, cy);
      } else {
        s.used[i]! |= 3;
        const slot = w.coins.indexOf(i);
        if (slot >= 0) s.coins |= 1 << slot;
        this.events.push({ type: 'coin', p: pi, obj: i, slot });
      }
      if (s.dead) return;
    }
  }

  private impulseScale(p: PlayerState): number {
    return P.IMPULSE_MODE_SCALE[MODE_KEYS[p.mode]!] * (p.mini ? P.MINI_IMPULSE_SCALE : 1);
  }

  private applyOrb(pi: number, p: PlayerState, obj: number, sub: number, rot: number): void {
    const sc = this.impulseScale(p);
    const wave = p.mode === GameMode.Wave;
    p.boost = -1;
    p.dashing = false;
    switch (sub) {
      case OrbType.Jump:
        if (!wave) this.setU(p, P.ORB_JUMP_VELOCITY * sc);
        break;
      case OrbType.Small:
        if (!wave) this.setU(p, P.ORB_SMALL_VELOCITY * sc);
        break;
      case OrbType.Big:
        if (!wave) this.setU(p, P.ORB_BIG_VELOCITY * sc);
        break;
      case OrbType.Gravity:
        p.g = p.g === 1 ? -1 : 1;
        this.setU(p, wave ? 0 : -P.ORB_GRAVITY_PUSH * Math.max(sc, 0.5));
        break;
      case OrbType.FlipJump:
        p.g = p.g === 1 ? -1 : 1;
        this.setU(p, wave ? 0 : P.ORB_FLIP_JUMP_VELOCITY * sc);
        break;
      case OrbType.Slam:
        if (!wave) this.setU(p, -P.ORB_SLAM_VELOCITY * Math.max(sc, 0.6));
        break;
      case OrbType.Dash: {
        const vx = P.SPEEDS[this.state.speed]!;
        p.dashing = true;
        p.dashU = p.g * vx * tanSnapped15(-rot, P.DASH_MAX_ANGLE);
        break;
      }
    }
    p.onGround = false;
    this.events.push({ type: 'orb', p: pi, obj, sub });
  }

  private applyPad(pi: number, p: PlayerState, obj: number, sub: number): void {
    const sc = this.impulseScale(p);
    const wave = p.mode === GameMode.Wave;
    p.boost = -1;
    switch (sub) {
      case PadType.Jump:
        if (!wave) this.setU(p, P.PAD_JUMP_VELOCITY * sc);
        break;
      case PadType.Small:
        if (!wave) this.setU(p, P.PAD_SMALL_VELOCITY * sc);
        break;
      case PadType.Big:
        if (!wave) this.setU(p, P.PAD_BIG_VELOCITY * sc);
        break;
      case PadType.Gravity:
        p.g = p.g === 1 ? -1 : 1;
        this.setU(p, wave ? 0 : -P.PAD_GRAVITY_PUSH * Math.max(sc, 0.5));
        break;
    }
    p.onGround = false;
    this.events.push({ type: 'pad', p: pi, obj, sub });
  }

  private applyPortal(pi: number, p: PlayerState, obj: number, portalY: number): void {
    const s = this.state;
    const w = this.world;
    const sub = w.sub[obj]!;
    const val = w.val[obj]!;
    const global = sub !== PortalType.GravityNormal && sub !== PortalType.GravityFlip;
    s.used[obj]! |= global ? 3 : 1 << pi;
    this.events.push({ type: 'portal', p: pi, obj, sub, val });
    switch (sub) {
      case PortalType.Mode: {
        for (const q of s.players) this.changeMode(q, val);
        if (BOUNDED_MODES[val]) {
          const H = (w.boundsH[obj] || boundsHeight(val)) * P.BLOCK;
          let lo = Math.round((portalY - H / 2) / P.BLOCK) * P.BLOCK;
          if (lo < 0) lo = 0;
          s.boundsOn = true;
          s.boundsLo = lo;
          s.boundsHi = lo + H;
        } else if (!s.dual) {
          s.boundsOn = false;
        }
        break;
      }
      case PortalType.GravityNormal:
      case PortalType.GravityFlip: {
        const ng = sub === PortalType.GravityNormal ? 1 : -1;
        if (p.g !== ng) {
          p.g = ng;
          p.vy *= P.GRAVITY_PORTAL_VELOCITY_KEEP;
          p.onGround = false;
          p.boost = -1;
          this.events.push({ type: 'flip', p: pi });
        }
        break;
      }
      case PortalType.SizeNormal:
      case PortalType.SizeMini: {
        const mini = sub === PortalType.SizeMini;
        for (const q of s.players) {
          if (q.mini === mini) continue;
          const before = playerBox(q).halfH;
          q.mini = mini;
          const after = playerBox(q).halfH;
          if (q.onGround) q.y -= q.g * (before - after);
        }
        break;
      }
      case PortalType.MirrorOn:
      case PortalType.MirrorOff: {
        const m = sub === PortalType.MirrorOn;
        if (s.mirror !== m) {
          s.mirror = m;
          s.mirrorTick = s.tick;
        }
        break;
      }
      case PortalType.DualOn: {
        if (s.dual) break;
        s.dual = true;
        if (!s.boundsOn) {
          const H = (w.boundsH[obj] || P.BOUNDS_HEIGHT.dual) * P.BLOCK;
          let lo = Math.round((portalY - H / 2) / P.BLOCK) * P.BLOCK;
          if (lo < 0) lo = 0;
          s.boundsOn = true;
          s.boundsLo = lo;
          s.boundsHi = lo + H;
        }
        const p0 = s.players[0]!;
        const twin = makePlayer(p0.mode, p0.mini, p0.g === 1);
        twin.y = s.boundsLo + s.boundsHi - p0.y;
        twin.vy = -p0.vy;
        twin.rot = -p0.rot;
        twin.onGround = false;
        s.players.push(twin);
        break;
      }
      case PortalType.DualOff: {
        if (!s.dual) break;
        s.dual = false;
        s.players.length = 1;
        if (!BOUNDED_MODES[s.players[0]!.mode]) s.boundsOn = false;
        break;
      }
      case PortalType.Speed:
        s.speed = Math.max(0, Math.min(4, val));
        break;
    }
  }

  private changeMode(p: PlayerState, mode: number): void {
    if (p.mode === mode) return;
    const before = playerBox(p).halfH;
    p.mode = mode;
    const after = playerBox(p).halfH;
    if (p.onGround) p.y -= p.g * (before - after);
    if (mode !== GameMode.Wave) p.vy *= P.MODE_CHANGE_VELOCITY_KEEP;
    p.boost = -1;
    p.dashing = false;
    p.rot = 0;
  }

  /** Spider: jump instantly to the opposite surface and flip gravity. */
  private spiderTeleport(pi: number, p: PlayerState, box: ModeConsts): void {
    const s = this.state;
    const w = this.world;
    const g = p.g;
    const x = s.x;
    const { halfW, halfH } = box;
    const topRel = g * p.y + halfH;
    let best = Infinity;
    // scan solids in the column above (relative)
    this.gather(x - halfW, x + halfW);
    for (let c = 0; c < this.candN; c++) {
      const i = this.cand[c]!;
      const kind = w.kind[i]!;
      if (kind === Kind.Solid) {
        const [cx, cy, hw, hh] = this.boxOf(i, this.candX[c]!, this.candY[c]!, this.candR[c]!);
        if (Math.abs(cx - x) >= hw + halfW) continue;
        const sBot = g === 1 ? cy - hh : -(cy + hh);
        if (sBot >= topRel - 0.001 && sBot < best) best = sBot;
      } else if (kind === Kind.Slope) {
        const cx = this.candX[c]!;
        const cy = this.candY[c]!;
        const hw = w.hw[i]!;
        const hh = w.hh[i]!;
        if (x < cx - hw || x > cx + hw) continue;
        const corner = w.corner[i]!;
        const worldFloor = corner === Corner.BR || corner === Corner.BL;
        if ((g === 1) === worldFloor) continue;
        const rising = corner === Corner.BR || corner === Corner.TL;
        const k = w.slopeK[i]!;
        const surf = g * (rising ? cy - hh + (x - (cx - hw)) * k : cy + hh - (x - (cx - hw)) * k);
        if (surf >= topRel - 0.001 && surf < best) best = surf;
      }
    }
    const worldCeil = s.boundsOn ? s.boundsHi : Infinity;
    const worldFloor = s.boundsOn ? s.boundsLo : 0;
    const plane = g === 1 ? worldCeil : -worldFloor;
    if (plane < best) best = plane;
    const fromY = p.y;
    p.g = g === 1 ? -1 : 1;
    if (best < Infinity) {
      p.y = g * (best - halfH);
      p.vy = 0;
      p.onGround = true;
    } else {
      p.vy = -p.g * P.SPIDER_NO_SURFACE_VELOCITY;
      p.onGround = false;
    }
    this.events.push({ type: 'teleport', p: pi, fromY, toY: p.y });
  }
}

/** Velocity cap that bleeds off overspeed (from orbs/pads) instead of clipping it. */
function capSoft(u: number, maxUp: number, maxDown: number): number {
  if (u > maxUp) {
    const v = u - P.OVERSPEED_DECAY * DT;
    return v < maxUp ? maxUp : v;
  }
  if (u < -maxDown) {
    const v = u + P.OVERSPEED_DECAY * DT;
    return v > -maxDown ? -maxDown : v;
  }
  return u;
}

/** AABB vs right-triangle (slope) overlap, strict. */
export function boxHitsSlope(
  ax0: number, ax1: number, ay0: number, ay1: number,
  x0: number, x1: number, y0: number, y1: number,
  corner: number, k: number,
): boolean {
  const ix0 = ax0 > x0 ? ax0 : x0;
  const ix1 = ax1 < x1 ? ax1 : x1;
  const iy0 = ay0 > y0 ? ay0 : y0;
  const iy1 = ay1 < y1 ? ay1 : y1;
  if (ix0 >= ix1 || iy0 >= iy1) return false;
  switch (corner) {
    case Corner.BR: return iy0 < y0 + (ix1 - x0) * k;
    case Corner.BL: return iy0 < y1 - (ix0 - x0) * k;
    case Corner.TR: return iy1 > y1 - (ix1 - x0) * k;
    default: return iy1 > y0 + (ix0 - x0) * k;
  }
}
