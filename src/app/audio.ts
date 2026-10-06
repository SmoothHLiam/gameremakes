import type { SongInfo } from '../core/audio/song.ts';
import { getSong } from '../core/audio/songs.ts';
import { Bus, renderClap, renderHat, renderNote, renderSweep, SR, type Patch } from '../core/audio/synth.ts';
import { blobGet } from './storage.ts';

export interface SongData {
  id: string;
  buffer: AudioBuffer | null;
  pcm: { L: Float32Array; R: Float32Array; sampleRate: number } | null;
  info: SongInfo | null;
  duration: number;
}

type Sfx = 'death' | 'jump' | 'orb' | 'pad' | 'portal' | 'coin' | 'complete' | 'checkpoint' | 'click' | 'flip';

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** Context time at which `songTime` plays. */
  ctxStart: number;
  songTime: number;
  loop: boolean;
  duration: number;
  id: string;
}

/**
 * Web Audio engine. Songs are pre-rendered (worker) into AudioBuffers; playback
 * is scheduled on the audio clock and the engine reports the *audible* song
 * time, compensating output latency via getOutputTimestamp().
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private readonly songs = new Map<string, SongData>();
  private readonly pending = new Map<string, Promise<SongData>>();
  private worker: Worker | null = null;
  private readonly waiters = new Map<string, Array<(d: { L: Float32Array; R: Float32Array; info: SongInfo; sampleRate: number } | null) => void>>();
  private sfx = new Map<Sfx, AudioBuffer>();
  private playing: Playing | null = null;
  private musicVol = 0.8;
  private sfxVol = 0.7;
  /** Fallback when getOutputTimestamp is unavailable. */
  private latency = 0;

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Must run inside a user gesture (autoplay rules). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.applyVolumes();
      this.buildSfx();
      for (const d of this.songs.values()) this.materialize(d);
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.musicGain) this.musicGain.gain.value = this.musicVol * this.musicVol;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol * this.sfxVol;
  }

  // ------------------------------------------------------------ loading

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./songWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ id: string; L?: Float32Array; R?: Float32Array; info?: SongInfo; sampleRate?: number; error?: string }>) => {
        const w = this.waiters.get(e.data.id) ?? [];
        this.waiters.delete(e.data.id);
        const d = e.data.L && e.data.R && e.data.info ? { L: e.data.L, R: e.data.R, info: e.data.info, sampleRate: e.data.sampleRate ?? SR } : null;
        for (const fn of w) fn(d);
      };
    }
    return this.worker;
  }

  private materialize(d: SongData): void {
    if (!this.ctx || d.buffer || !d.pcm) return;
    const buf = this.ctx.createBuffer(2, d.pcm.L.length, d.pcm.sampleRate);
    buf.copyToChannel(d.pcm.L as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(d.pcm.R as Float32Array<ArrayBuffer>, 1);
    d.buffer = buf;
  }

  has(id: string): boolean {
    return this.songs.has(id);
  }

  get(id: string): SongData | undefined {
    return this.songs.get(id);
  }

  /** Renders (built-in) or decodes (custom) a song; cached for the session. */
  load(id: string): Promise<SongData> {
    const have = this.songs.get(id);
    if (have) return Promise.resolve(have);
    const p = this.pending.get(id);
    if (p) return p;
    const job = (async (): Promise<SongData> => {
      let data: SongData;
      if (id.startsWith('custom:')) {
        data = await this.loadCustom(id);
      } else if (getSong(id)) {
        const r = await new Promise<{ L: Float32Array; R: Float32Array; info: SongInfo; sampleRate: number } | null>((resolve) => {
          const list = this.waiters.get(id) ?? [];
          list.push(resolve);
          this.waiters.set(id, list);
          if (list.length === 1) this.getWorker().postMessage({ id });
        });
        data = { id, buffer: null, pcm: r ? { L: r.L, R: r.R, sampleRate: r.sampleRate } : null, info: r?.info ?? null, duration: r ? r.L.length / r.sampleRate : 0 };
      } else {
        data = { id, buffer: null, pcm: null, info: null, duration: 0 };
      }
      this.materialize(data);
      this.songs.set(id, data);
      this.pending.delete(id);
      return data;
    })();
    this.pending.set(id, job);
    return job;
  }

  private async loadCustom(id: string): Promise<SongData> {
    const raw = await blobGet(id);
    const empty: SongData = { id, buffer: null, pcm: null, info: null, duration: 0 };
    if (!raw) return empty;
    return this.decode(id, raw.slice(0));
  }

  /** Decodes an audio file (editor import). Needs an unlocked context. */
  async decode(id: string, data: ArrayBuffer): Promise<SongData> {
    const ctx = this.ctx ?? new OfflineAudioContext(2, 1, 44100);
    try {
      const buffer = await ctx.decodeAudioData(data);
      const L = buffer.getChannelData(0).slice();
      const R = (buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)).slice();
      const d: SongData = { id, buffer: this.ctx ? buffer : null, pcm: { L, R, sampleRate: buffer.sampleRate }, info: null, duration: buffer.duration };
      this.materialize(d);
      this.songs.set(id, d);
      return d;
    } catch {
      return { id, buffer: null, pcm: null, info: null, duration: 0 };
    }
  }

  // ------------------------------------------------------------ playback

  /** Audible context time right now, compensating output latency. */
  audibleCtxTime(perfNow: number): number | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0 && ts.contextTime > 0) {
        return ts.contextTime + (perfNow - ts.performanceTime) / 1000;
      }
    }
    return ctx.currentTime - this.latency;
  }

  /**
   * Plays a loaded song from `songTime`. Returns the performance.now() time at
   * which that song time becomes audible, or null if nothing can play.
   */
  play(id: string, songTime: number, opts: { loop?: boolean; fadeIn?: number } = {}): number | null {
    this.stop(0.03);
    const ctx = this.ctx;
    const d = this.songs.get(id);
    if (!ctx || ctx.state !== 'running' || !d?.buffer) return null;
    const now = performance.now();
    const audible = this.audibleCtxTime(now) ?? ctx.currentTime;
    const lead = 0.06;
    const when = ctx.currentTime + lead;
    const src = ctx.createBufferSource();
    src.buffer = d.buffer;
    src.loop = !!opts.loop;
    const gain = ctx.createGain();
    src.connect(gain);
    gain.connect(this.musicGain!);
    const dur = d.buffer.duration;
    let offset = songTime;
    if (opts.loop) offset = ((offset % dur) + dur) % dur;
    if (offset < 0) {
      // song starts after a delay (negative song time = silence before the song)
      src.start(when - offset, 0);
    } else if (offset < dur) {
      src.start(when, offset);
    } else {
      return now + (when - audible) * 1000;
    }
    if (opts.fadeIn) {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, when + opts.fadeIn);
    }
    this.playing = { src, gain, ctxStart: when, songTime, loop: !!opts.loop, duration: dur, id };
    return now + (when - audible) * 1000;
  }

  stop(fade = 0.05): void {
    const p = this.playing;
    if (!p || !this.ctx) return;
    this.playing = null;
    const t = this.ctx.currentTime;
    try {
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(p.gain.gain.value, t);
      p.gain.gain.linearRampToValueAtTime(0, t + fade);
      p.src.stop(t + fade + 0.01);
    } catch {
      /* already stopped */
    }
  }

  get playingId(): string | null {
    return this.playing?.id ?? null;
  }

  /** Song time currently audible, or null. */
  audibleSongTime(perfNow: number): number | null {
    const p = this.playing;
    if (!p) return null;
    const a = this.audibleCtxTime(perfNow);
    if (a == null || a < p.ctxStart) return null;
    let t = p.songTime + (a - p.ctxStart);
    if (p.loop) t = t % p.duration;
    return t;
  }

  // ------------------------------------------------------------ sfx

  playSfx(name: Sfx, gain = 1): void {
    const ctx = this.ctx;
    const buf = this.sfx.get(name);
    if (!ctx || !buf || ctx.state !== 'running') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.sfxGain!);
    src.start();
  }

  private buildSfx(): void {
    const ctx = this.ctx!;
    const make = (seconds: number, fn: (b: Bus) => void): AudioBuffer => {
      const bus = new Bus(Math.ceil(seconds * SR));
      fn(bus);
      let peak = 1e-6;
      for (let i = 0; i < bus.length; i++) peak = Math.max(peak, Math.abs(bus.L[i]!), Math.abs(bus.R[i]!));
      const g = 0.8 / peak;
      const buf = ctx.createBuffer(2, bus.length, SR);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      for (let i = 0; i < bus.length; i++) {
        L[i] = bus.L[i]! * g;
        R[i] = bus.R[i]! * g;
      }
      return buf;
    };
    const blip: Patch = { osc: [{ type: 'square' }], amp: { a: 0.001, d: 0.08, s: 0.3, r: 0.05 }, filter: { type: 'lp', cutoff: 5000, res: 0.1 }, gain: 0.3 };
    const bell: Patch = { osc: [{ type: 'sine' }, { type: 'sine', semi: 19, level: 0.3 }], amp: { a: 0.001, d: 0.3, s: 0.1, r: 0.3 }, gain: 0.4 };
    const crunch: Patch = { osc: [{ type: 'saw', voices: 3, spread: 60 }, { type: 'noise', level: 0.6 }], amp: { a: 0.001, d: 0.25, s: 0, r: 0.1 }, filter: { type: 'lp', cutoff: 3500, res: 0.3, env: -3000, envShape: { a: 0.001, d: 0.25, s: 0, r: 0.1 } }, gain: 0.5, drive: 2, pitchEnv: { semi: 12, time: 0.25 } };
    this.sfx.set('death', make(0.5, (b) => {
      renderNote(b, 0, 0.18, 40, 1, crunch);
      renderClap(b, 0, 0.6);
      renderNote(b, 0.02, 0.12, 64, 0.6, { ...blip, pitchEnv: { semi: -14, time: 0.14 } });
    }));
    this.sfx.set('checkpoint', make(0.35, (b) => {
      renderNote(b, 0, 0.06, 76, 0.8, blip);
      renderNote(b, 0.07, 0.1, 83, 0.8, blip);
    }));
    this.sfx.set('coin', make(0.9, (b) => {
      [84, 88, 91, 96].forEach((m, i) => renderNote(b, i * 0.06, 0.15, m, 0.8, bell));
    }));
    this.sfx.set('complete', make(2.2, (b) => {
      [60, 64, 67, 72].forEach((m, i) => renderNote(b, i * 0.08, 1.1, m, 0.7, { ...bell, amp: { a: 0.01, d: 0.6, s: 0.4, r: 0.8 } }));
      renderSweep(b, 0, 0.6, 0.4, true);
      renderHat(b, 0.32, 0.6, true);
    }));
    this.sfx.set('click', make(0.08, (b) => renderNote(b, 0, 0.02, 88, 0.5, { ...blip, amp: { a: 0.001, d: 0.02, s: 0, r: 0.02 } })));
  }
}

export const audio = new AudioEngine();
