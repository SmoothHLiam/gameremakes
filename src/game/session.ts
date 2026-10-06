import type { Renderer } from 'pixi.js';
import { compileWorld, timeAtX, type World } from '../core/sim/world.ts';
import type { LevelJSON } from '../core/level.ts';
import { Simulation, type SimEvent } from '../core/sim/sim.ts';
import { cloneState, type SimState } from '../core/sim/state.ts';
import { InputQueue, InputTimeline } from '../core/sim/replay.ts';
import { fastForwardTriggers } from '../core/sim/triggers.ts';
import { AutoCheckpoints } from '../core/sim/practice.ts';
import { BLOCK, TICK_RATE } from '../core/physics.ts';
import { Kind, MODE_KEYS, OrbType, PortalType } from '../core/objects.ts';
import { GameCamera } from '../render/camera.ts';
import { captureSnap, GameView, makeSnap, type PlayerSkin, type RenderSnap } from '../render/view.ts';
import type { TextureBank } from '../render/textures.ts';
import { ORB_COLORS, PAD_COLORS, PORTAL_COLORS, SPEED_COLORS, COIN_COLOR } from '../render/draw.ts';
import { LevelClock } from './clock.ts';

export type SfxName = 'death' | 'jump' | 'orb' | 'pad' | 'portal' | 'coin' | 'complete' | 'checkpoint' | 'click' | 'flip';

/** What the session needs from the audio engine. */
export interface SessionAudio {
  /**
   * Start the level music at level time `t`. Returns the performance.now()
   * time at which `t` will actually be heard (scheduling + output latency),
   * or null if no music can play.
   */
  startMusic(levelTime: number): number | null;
  stopMusic(fadeSeconds?: number): void;
  sfx(name: SfxName): void;
  /** Audible level time while music plays, or null. */
  audibleLevelTime(perfNow: number): number | null;
  /** Practice track: loops independently of level time. */
  startPracticeMusic(): void;
}

export const NO_AUDIO: SessionAudio = {
  startMusic: () => null,
  stopMusic: () => {},
  sfx: () => {},
  audibleLevelTime: () => null,
  startPracticeMusic: () => {},
};

export interface SessionOptions {
  level: LevelJSON;
  renderer: Renderer;
  bank: TextureBank;
  skin: PlayerSkin;
  audio?: SessionAudio;
  practice?: boolean;
  /** Editor playtest: start at this x (units). */
  startX?: number;
  /** Auto-play this replay (press/release ticks). */
  replay?: readonly number[];
  hitboxes?: boolean;
  glow?: boolean;
  reducedParticles?: boolean;
  /** Delay before restarting after a death (s). */
  respawnDelay?: number;
  onDeath?: (percent: number, practice: boolean) => void;
  onComplete?: (info: CompleteInfo) => void;
  onAttempt?: (attempt: number) => void;
}

export interface CompleteInfo {
  attempts: number;
  /** Level time of the winning run (s). */
  time: number;
  coins: number;
  practice: boolean;
  replay: number[];
}

export type Phase = 'playing' | 'dead' | 'complete' | 'paused';

const hex = (s: string) => parseInt(s.slice(1), 16);
const MAX_CATCHUP_TICKS = TICK_RATE * 2;

export class GameSession {
  readonly world: World;
  readonly sim: Simulation;
  readonly view: GameView;
  readonly camera = new GameCamera();
  readonly clock = new LevelClock();
  readonly opts: SessionOptions;
  private readonly audio: SessionAudio;
  private readonly queue = new InputQueue();
  private replay: InputTimeline | null = null;
  private readonly prev: RenderSnap;
  private hasPrev = false;
  private readonly startState: SimState;
  phase: Phase = 'playing';
  attempts = 0;
  practice: boolean;
  checkpoints: SimState[] = [];
  private readonly autoCp = new AutoCheckpoints();
  private deathAt = 0;
  private pausedAt = 0;
  private pausedFrom: Phase = 'playing';
  private physicalHeld = false;
  private lastTime = 0;
  /** Seconds since the session began (visual animation time). */
  private visTime = 0;
  bestThisSession = 0;

  constructor(opts: SessionOptions) {
    this.opts = opts;
    this.audio = opts.audio ?? NO_AUDIO;
    this.practice = !!opts.practice;
    this.world = compileWorld(opts.level);
    this.sim = new Simulation(this.world);
    this.startState = this.makeStartState(opts.startX);
    this.prev = makeSnap(this.world.maxGroup + 1);
    this.view = new GameView(opts.renderer, opts.bank, this.world, {
      showTriggers: false,
      hitboxes: !!opts.hitboxes,
      glow: opts.glow ?? true,
      reducedParticles: !!opts.reducedParticles,
      editor: false,
    });
    this.view.setSkin(opts.skin);
    if (opts.replay) this.replay = new InputTimeline(opts.replay);
    this.clock.audio = { audibleLevelTime: (p) => (this.practice ? null : this.audio.audibleLevelTime(p)) };
  }

  /** Start state at the level start, or at an x position (editor playtest). */
  private makeStartState(startX?: number): SimState {
    const s = this.sim.spawnState();
    if (startX == null || startX <= this.world.startX) return s;
    const w = this.world;
    // Apply every portal and trigger before startX so the player starts in the right state.
    const probe = new Simulation(w, s);
    const st = probe.state;
    const portals: number[] = [];
    for (let i = 0; i < w.n; i++) if (w.kind[i] === Kind.Portal && w.x[i]! < startX) portals.push(i);
    portals.sort((a, b) => w.x[a]! - w.x[b]!);
    let modeY = st.players[0]!.y;
    for (const i of portals) {
      const sub = w.sub[i]!;
      const val = w.val[i]!;
      const p = st.players[0]!;
      if (sub === PortalType.Mode) {
        p.mode = val;
        modeY = w.y[i]!;
      } else if (sub === PortalType.Speed) st.speed = val;
      else if (sub === PortalType.GravityFlip) p.g = -1;
      else if (sub === PortalType.GravityNormal) p.g = 1;
      else if (sub === PortalType.SizeMini) p.mini = true;
      else if (sub === PortalType.SizeNormal) p.mini = false;
      else if (sub === PortalType.MirrorOn) st.mirror = true;
      else if (sub === PortalType.MirrorOff) st.mirror = false;
    }
    const p = st.players[0]!;
    const bounded = [false, true, true, true, true, false, true, true][p.mode]!;
    if (bounded) {
      const H = ([0, 10, 8, 10, 10, 0, 8, 10][p.mode] ?? 10) * BLOCK;
      let lo = Math.round((modeY - H / 2) / BLOCK) * BLOCK;
      if (lo < 0) lo = 0;
      st.boundsOn = true;
      st.boundsLo = lo;
      st.boundsHi = lo + H;
      p.y = (lo + lo + H) / 2;
    } else {
      st.boundsOn = false;
      p.y = p.g === 1 ? 15 : 300;
    }
    p.onGround = false;
    st.x = startX;
    st.tick = Math.round(timeAtX(w, startX) * TICK_RATE);
    fastForwardTriggers(w, st, startX);
    void MODE_KEYS;
    return cloneState(st);
  }

  get percent(): number {
    const w = this.world;
    const s = this.sim.state;
    const p = ((s.x - w.startX) / (w.endX - w.startX)) * 100;
    return Math.max(0, Math.min(100, p));
  }

  /** Level time of the current sim tick. */
  get levelTime(): number {
    return this.sim.state.tick / TICK_RATE;
  }

  start(now: number, physicallyHeld: boolean): void {
    this.physicalHeld = physicallyHeld;
    this.newAttempt(now);
  }

  private newAttempt(now: number): void {
    this.attempts++;
    const from = this.practice && this.checkpoints.length ? this.checkpoints[this.checkpoints.length - 1]! : this.startState;
    this.sim.reset(from);
    this.autoCp.reset(from.tick);
    this.syncCheckpointMarkers();
    this.queue.reset(this.replay ? false : this.physicalHeld, from.tick);
    this.replay?.seek(from.tick);
    this.hasPrev = false;
    this.view.resetEffects();
    this.view.setAttempt(this.attempts, this.startState.x);
    const s = this.sim.state;
    this.camera.reset(s.x, s.players[0]!.y, { on: s.boundsOn, lo: s.boundsLo, hi: s.boundsHi });
    const t = from.tick / TICK_RATE;
    if (this.practice) {
      this.audio.startPracticeMusic();
      this.clock.start(t, now);
    } else {
      // The sim holds at t until the music is actually audible, so they start together.
      const audibleAt = this.audio.startMusic(t);
      this.clock.start(t, audibleAt ?? now);
    }
    this.phase = 'playing';
    this.opts.onAttempt?.(this.attempts);
  }

  /** Raw action input from the InputManager. */
  action(down: boolean, timeStamp: number): void {
    this.physicalHeld = down;
    if (this.phase !== 'playing' || this.replay) return;
    const t = this.clock.at(timeStamp);
    const tick = Math.max(this.sim.state.tick, Math.floor(t * TICK_RATE));
    this.queue.push(tick, down);
  }

  pause(now: number): void {
    if (this.phase === 'paused') return;
    this.pausedFrom = this.phase;
    this.pausedAt = this.clock.at(now);
    this.clock.stop(now);
    this.phase = 'paused';
    if (!this.practice) this.audio.stopMusic(0.05);
  }

  resume(now: number, physicallyHeld: boolean): void {
    if (this.phase !== 'paused') return;
    this.physicalHeld = physicallyHeld;
    this.phase = this.pausedFrom;
    if (this.phase === 'playing') {
      const t = this.sim.state.tick / TICK_RATE;
      const audibleAt = this.practice ? null : this.audio.startMusic(t);
      this.clock.start(t, audibleAt ?? now);
      this.queue.reset(physicallyHeld && !this.replay, this.sim.state.tick);
    } else if (this.phase === 'dead') {
      this.deathAt = now;
    }
    void this.pausedAt;
  }

  restart(now: number): void {
    this.checkpointsClearIfNormal();
    this.newAttempt(now);
  }

  private checkpointsClearIfNormal(): void {
    if (!this.practice) this.checkpoints = [];
  }

  setPractice(on: boolean, now: number): void {
    if (this.practice === on) return;
    this.practice = on;
    this.checkpoints = [];
    this.attempts = 0;
    this.audio.stopMusic(0.1);
    this.newAttempt(now);
  }

  /** Practice: restart from the last checkpoint right away (no death delay). */
  get checkpointCount(): number {
    return this.checkpoints.length;
  }

  placeCheckpoint(): void {
    if (!this.practice || this.phase !== 'playing') return;
    const s = this.sim.state;
    if (s.players.some((p) => p.dead)) return;
    this.checkpoints.push(cloneState(s));
    // manual placement restarts the auto timer
    this.autoCp.reset(s.tick);
    this.syncCheckpointMarkers();
    this.audio.sfx('checkpoint');
  }

  removeCheckpoint(): void {
    if (!this.practice) return;
    this.checkpoints.pop();
    this.syncCheckpointMarkers();
  }

  private syncCheckpointMarkers(): void {
    this.view.setCheckpoints(this.practice ? this.checkpoints.map((c) => ({ x: c.x, y: c.players[0]!.y })) : []);
  }

  // ------------------------------------------------------------ frame

  frame(now: number, dt: number): void {
    this.visTime += dt;
    const s0 = this.sim.state;
    if (this.phase === 'playing') {
      const t = this.clock.frame(now);
      this.lastTime = t;
      const targetTick = Math.floor(t * TICK_RATE + 1e-7);
      let steps = 0;
      while (this.sim.state.tick < targetTick && !this.sim.done && steps < MAX_CATCHUP_TICKS) {
        captureSnap(this.sim.state, this.prev);
        this.hasPrev = true;
        const tick = this.sim.state.tick;
        const input = this.replay ? this.replay.at(tick) : this.queue.at(tick);
        this.sim.step(input);
        this.handleEvents(now);
        if (this.practice && this.phase === 'playing') {
          const cp = this.autoCp.onTick(this.sim.state);
          if (cp) {
            this.checkpoints.push(cp);
            this.syncCheckpointMarkers();
          }
        }
        steps++;
      }
      if (steps >= MAX_CATCHUP_TICKS && !this.sim.done) {
        // Fell far behind (tab hitch). Re-anchor rather than fast-forwarding through the level.
        const t = this.sim.state.tick / TICK_RATE;
        const audibleAt = this.practice ? null : this.audio.startMusic(t);
        this.clock.start(t, audibleAt ?? now);
      }
    } else if (this.phase === 'dead') {
      if (now - this.deathAt >= (this.opts.respawnDelay ?? 1) * 1000) this.newAttempt(now);
    }
    void s0;

    const s = this.sim.state;
    const playing = this.phase === 'playing';
    const alpha = playing && this.hasPrev ? Math.max(0, Math.min(1, this.lastTime * TICK_RATE - s.tick)) : 1;
    const prev = playing && this.hasPrev ? this.prev : null;
    const px = prev ? prev.x + (s.x - prev.x) * alpha : s.x;
    const p0 = s.players[0]!;
    const py = prev ? prev.py[0]! + (p0.y - prev.py[0]!) * alpha : p0.y;
    if (this.phase !== 'paused') this.camera.update(dt, px, py, { on: s.boundsOn, lo: s.boundsLo, hi: s.boundsHi });

    const mirrorT = Math.min(1, (s.tick - s.mirrorTick) / (TICK_RATE * 0.5));
    const eased = mirrorT < 1 ? mirrorT * mirrorT * (3 - 2 * mirrorT) : 1;
    const from = s.mirror ? 1 : -1;
    const to = s.mirror ? -1 : 1;
    const mirror = Math.cos(Math.acos(from) + (Math.acos(to) - Math.acos(from)) * eased);

    this.view.render({
      state: s,
      prev,
      alpha,
      dt: this.phase === 'paused' ? 0 : dt,
      time: this.visTime,
      cam: this.camera.state,
      beat: this.practice || this.phase !== 'playing' ? 0 : this.beatPulse(this.lastTime),
      mirror,
      hidePlayers: this.phase === 'dead',
    });
  }

  /** 0..1 pulse that peaks on every beat of the level's song (from its beat grid). */
  private beatPulse(levelTime: number): number {
    const m = this.opts.level.meta;
    const beats = ((m.offset + levelTime - m.beatOffset) * m.bpm) / 60;
    if (beats < 0) return 0;
    const phase = beats - Math.floor(beats);
    return Math.exp(-phase * 6);
  }

  private emitAt(x: number, y: number, color: number, kind: 'ring' | 'burst' | 'dust' | 'sparks'): void {
    const P = this.view.particles;
    switch (kind) {
      case 'ring':
        P.emit({ tex: 'p_ring', x, y, count: 1, speed: [0, 0], life: [0.35, 0.35], size: [0.4, 0.4], endSize: 4, alpha: 0.9, endAlpha: 0, tint: color, add: true });
        break;
      case 'burst':
        P.emit({ tex: 'p_square', x, y, count: 14, speed: [80, 260], life: [0.25, 0.5], size: [0.5, 1], endSize: 0, tint: color, spin: 8, add: true });
        break;
      case 'dust':
        P.emit({ tex: 'p_square', x, y, count: 5, speed: [20, 70], angle: [100, 170], life: [0.15, 0.35], size: [0.35, 0.6], endSize: 0, alpha: 0.7, tint: color, gravity: 200 });
        break;
      case 'sparks':
        P.emit({ tex: 'p_spark', x, y, count: 10, speed: [120, 280], angle: [50, 130], life: [0.2, 0.4], size: [0.6, 1], endSize: 0.2, tint: color, add: true });
        break;
    }
  }

  private handleEvents(now: number): void {
    const sim = this.sim;
    if (!sim.events.length) return;
    const w = this.world;
    const s = sim.state;
    const skin = this.opts.skin;
    for (const e of sim.events) this.onEvent(e, now, w, s, skin.p1, skin.p2);
    sim.events.length = 0;
  }

  private onEvent(e: SimEvent, now: number, w: World, s: SimState, p1: number, p2: number): void {
    switch (e.type) {
      case 'death': {
        const P = this.view.particles;
        const x = s.x;
        const y = e.y;
        P.emit({ tex: 'p_square', x, y, count: 22, speed: [90, 380], life: [0.35, 0.8], size: [0.6, 1.4], endSize: 0.1, tint: [p1, p2, 0xffffff], spin: 10, gravity: 300, drag: 1.5 });
        P.emit({ tex: 'p_ring', x, y, count: 1, speed: [0, 0], life: [0.45, 0.45], size: [0.5, 0.5], endSize: 5, alpha: 1, endAlpha: 0, tint: p1, add: true });
        P.emit({ tex: 'p_glow', x, y, count: 1, speed: [0, 0], life: [0.25, 0.25], size: [3, 3], endSize: 0.2, alpha: 1, endAlpha: 0, tint: 0xffffff, add: true });
        this.camera.shake(5, 0.35);
        // practice music keeps looping through deaths
        if (!this.practice) this.audio.stopMusic(0.05);
        this.autoCp.onDeath();
        this.audio.sfx('death');
        this.phase = 'dead';
        this.deathAt = now;
        const pct = this.percent;
        this.bestThisSession = Math.max(this.bestThisSession, pct);
        this.opts.onDeath?.(pct, this.practice);
        break;
      }
      case 'jump': {
        const p = s.players[e.p];
        if (p) this.emitAt(s.x - 6, p.y - 14 * p.g, e.p === 0 ? p1 : p2, 'dust');
        break;
      }
      case 'land': {
        const p = s.players[e.p];
        if (p && p.mode === 0) this.emitAt(s.x - 6, p.y - 14 * p.g, e.p === 0 ? p1 : p2, 'dust');
        break;
      }
      case 'orb': {
        const key = ['jump', 'small', 'big', 'gravity', 'flipjump', 'slam', 'dash'][e.sub] ?? 'jump';
        const c = hex(ORB_COLORS[key]!);
        this.emitAt(w.x[e.obj]!, w.y[e.obj]!, c, 'ring');
        if (e.sub === OrbType.Dash) this.emitAt(s.x, s.players[e.p]!.y, c, 'burst');
        this.audio.sfx('orb');
        break;
      }
      case 'pad': {
        const key = ['jump', 'small', 'big', 'gravity'][e.sub] ?? 'jump';
        this.emitAt(w.x[e.obj]!, w.y[e.obj]!, hex(PAD_COLORS[key]!), 'sparks');
        this.audio.sfx('pad');
        break;
      }
      case 'portal': {
        let col = 0xffffff;
        if (e.sub === PortalType.Mode) col = hex(PORTAL_COLORS[MODE_KEYS[e.val]!] ?? '#ffffff');
        else if (e.sub === PortalType.Speed) col = hex(SPEED_COLORS[e.val] ?? '#ffffff');
        else {
          const keys = ['', 'gravn', 'gravf', 'sizen', 'sizem', 'mirron', 'mirroff', 'dualon', 'dualoff'];
          col = hex(PORTAL_COLORS[keys[e.sub]!] ?? '#ffffff');
        }
        this.emitAt(w.x[e.obj]!, s.players[e.p]?.y ?? w.y[e.obj]!, col, 'ring');
        this.audio.sfx('portal');
        break;
      }
      case 'coin':
        this.emitAt(w.x[e.obj]!, w.y[e.obj]!, hex(COIN_COLOR), 'burst');
        this.emitAt(w.x[e.obj]!, w.y[e.obj]!, hex(COIN_COLOR), 'ring');
        this.audio.sfx('coin');
        break;
      case 'teleport': {
        const P = this.view.particles;
        const steps = 6;
        for (let k = 0; k <= steps; k++) {
          const y = e.fromY + ((e.toY - e.fromY) * k) / steps;
          P.emit({ tex: 'p_glow', x: s.x, y, count: 1, speed: [0, 10], life: [0.2, 0.3], size: [0.8, 0.8], endSize: 0.1, tint: e.p === 0 ? p1 : p2, add: true });
        }
        break;
      }
      case 'flip':
        break;
      case 'shake':
        this.camera.shake(e.amp, e.dur);
        break;
      case 'complete': {
        this.phase = 'complete';
        const P = this.view.particles;
        const cam = this.camera.state;
        for (let k = 0; k < 6; k++) {
          P.emit({
            tex: k % 2 ? 'p_square' : 'p_spark', x: s.x + 40 + k * 30, y: cam.y + 170 + (k % 3) * 40, count: 30,
            speed: [150, 520], life: [0.6, 1.4], size: [0.6, 1.6], endSize: 0, tint: [p1, p2, 0xffffff, 0xffe14d], spin: 8, gravity: 260, add: true,
          });
        }
        P.emit({ tex: 'p_ring', x: s.x, y: s.players[0]!.y, count: 3, speed: [0, 0], life: [0.6, 0.9], size: [0.5, 0.5], endSize: 9, tint: 0xffffff, add: true });
        this.audio.sfx('complete');
        this.opts.onComplete?.({
          attempts: this.attempts,
          time: s.tick / TICK_RATE,
          coins: s.coins,
          practice: this.practice,
          replay: this.queue.recorded.slice(),
        });
        break;
      }
    }
  }

  destroy(): void {
    this.view.destroy();
  }
}
