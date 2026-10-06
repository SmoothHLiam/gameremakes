import {
  addInto, applyDelay, applyDuck, Bus, master, type Patch, renderClap, renderCrash, renderHat, renderImpact, renderKick,
  renderNote, renderSnare, renderSweep, reverb, rng, SR,
} from './synth.ts';

const patchKeys = new WeakMap<Patch, string>();
function patchKey(p: Patch): string {
  let k = patchKeys.get(p);
  if (!k) {
    k = JSON.stringify(p);
    patchKeys.set(p, k);
  }
  return k;
}

// ---------------------------------------------------------------- theory

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
} as const;
export type ScaleName = keyof typeof SCALES;

/** Scale degree (0-based, may exceed 7 or be negative) → MIDI note. */
export function degree(root: number, scale: ScaleName, deg: number): number {
  const s = SCALES[scale];
  const oct = Math.floor(deg / 7);
  const d = ((deg % 7) + 7) % 7;
  return root + s[d]! + 12 * oct;
}

/** Triad (or 7th) on a scale degree. */
export function chordOn(root: number, scale: ScaleName, deg: number, seventh = false): number[] {
  const out = [degree(root, scale, deg), degree(root, scale, deg + 2), degree(root, scale, deg + 4)];
  if (seventh) out.push(degree(root, scale, deg + 6));
  return out;
}

/** Re-voices a chord into [lo, lo+12) keeping it close to the previous voicing. */
export function voice(chord: number[], lo: number, prev?: number[]): number[] {
  const pcs = chord.map((n) => ((n % 12) + 12) % 12);
  const candidates: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const v: number[] = [];
    let last = lo - 1;
    for (let k = 0; k < pcs.length; k++) {
      const pc = pcs[(k + inv) % pcs.length]!;
      let n = lo + ((pc - lo) % 12 + 12) % 12;
      while (n <= last) n += 12;
      v.push(n);
      last = n;
    }
    candidates.push(v);
  }
  if (!prev) return candidates[0]!;
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = c.reduce((a, n, i) => a + Math.abs(n - (prev[i] ?? prev[prev.length - 1]!)), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------- patches

export const PATCHES: Record<string, Patch> = {
  bass: {
    osc: [{ type: 'saw' }, { type: 'square', semi: -12, level: 0.6 }],
    amp: { a: 0.003, d: 0.18, s: 0.65, r: 0.05 },
    filter: { type: 'lp', cutoff: 320, res: 0.32, env: 1700, envShape: { a: 0.001, d: 0.14, s: 0.1, r: 0.05 } },
    gain: 0.2, drive: 0.6,
  },
  reese: {
    osc: [{ type: 'saw', cents: -14 }, { type: 'saw', cents: 14 }, { type: 'sine', semi: -12, level: 0.8 }],
    amp: { a: 0.005, d: 0.1, s: 0.9, r: 0.08 },
    filter: { type: 'lp', cutoff: 620, res: 0.25, env: 500, envShape: { a: 0.02, d: 0.3, s: 0.3, r: 0.1 } },
    gain: 0.2, drive: 0.9, width: 0.3,
  },
  sub: {
    osc: [{ type: 'sine' }],
    amp: { a: 0.004, d: 0.1, s: 0.9, r: 0.06 },
    gain: 0.2,
  },
  pluck: {
    osc: [{ type: 'saw', voices: 3, spread: 18 }, { type: 'square', semi: 12, level: 0.25 }],
    amp: { a: 0.002, d: 0.26, s: 0, r: 0.12 },
    filter: { type: 'lp', cutoff: 700, res: 0.2, env: 4200, envShape: { a: 0.001, d: 0.16, s: 0, r: 0.1 }, keytrack: 0.4 },
    gain: 0.3, width: 0.7,
  },
  supersaw: {
    osc: [{ type: 'saw', voices: 7, spread: 42 }, { type: 'saw', semi: -12, level: 0.35 }],
    amp: { a: 0.008, d: 0.3, s: 0.78, r: 0.16 },
    filter: { type: 'lp', cutoff: 5200, res: 0.12, env: 1800, envShape: { a: 0.005, d: 0.25, s: 0.2, r: 0.1 } },
    gain: 0.3, width: 0.9, vibrato: { rate: 5.2, cents: 10, delay: 0.25 },
  },
  square: {
    osc: [{ type: 'square' }, { type: 'pulse', pw: 0.25, semi: 12, level: 0.3 }],
    amp: { a: 0.004, d: 0.18, s: 0.7, r: 0.1 },
    filter: { type: 'lp', cutoff: 4200, res: 0.15 },
    gain: 0.22, vibrato: { rate: 6, cents: 14, delay: 0.18 },
  },
  pad: {
    osc: [{ type: 'saw', voices: 5, spread: 30 }, { type: 'tri', semi: 12, level: 0.3 }],
    amp: { a: 0.4, d: 0.6, s: 0.8, r: 0.9 },
    filter: { type: 'lp', cutoff: 1600, res: 0.12, keytrack: 0.3 },
    gain: 0.17, width: 1,
  },
  stab: {
    osc: [{ type: 'saw', voices: 5, spread: 26 }],
    amp: { a: 0.003, d: 0.22, s: 0.15, r: 0.1 },
    filter: { type: 'lp', cutoff: 1400, res: 0.2, env: 3600, envShape: { a: 0.001, d: 0.14, s: 0, r: 0.1 } },
    gain: 0.24, width: 0.9,
  },
  bell: {
    osc: [{ type: 'sine' }, { type: 'sine', semi: 24, cents: 2, level: 0.35 }, { type: 'tri', semi: 12, level: 0.25 }],
    amp: { a: 0.002, d: 0.5, s: 0.15, r: 0.4 },
    gain: 0.3,
  },
  chip: {
    osc: [{ type: 'pulse', pw: 0.125 }, { type: 'square', semi: -12, level: 0.3 }],
    amp: { a: 0.002, d: 0.1, s: 0.6, r: 0.05 },
    filter: { type: 'lp', cutoff: 6000, res: 0.05 },
    gain: 0.2, vibrato: { rate: 7, cents: 18, delay: 0.12 },
  },
  arp: {
    osc: [{ type: 'saw', voices: 2, spread: 12 }, { type: 'pulse', pw: 0.3, level: 0.5 }],
    amp: { a: 0.002, d: 0.14, s: 0.1, r: 0.06 },
    filter: { type: 'lp', cutoff: 1200, res: 0.35, env: 2600, envShape: { a: 0.001, d: 0.1, s: 0, r: 0.05 } },
    gain: 0.24, width: 0.6,
  },
};

// ---------------------------------------------------------------- composer

export type BusName = 'drums' | 'bass' | 'music' | 'lead' | 'fx';

export class Composer {
  readonly bpm: number;
  readonly spb: number;
  readonly length: number;
  readonly buses: Record<BusName, Bus>;
  readonly send: Bus;
  readonly kicks: number[] = [];
  /** Per-bus reverb send amount. */
  sends: Record<BusName, number> = { drums: 0.06, bass: 0, music: 0.22, lead: 0.28, fx: 0.35 };
  seed: number;

  constructor(bpm: number, seconds: number, seed = 1) {
    this.bpm = bpm;
    this.spb = 60 / bpm;
    this.length = Math.ceil(seconds * SR);
    this.seed = seed;
    this.buses = { drums: new Bus(this.length), bass: new Bus(this.length), music: new Bus(this.length), lead: new Bus(this.length), fx: new Bus(this.length) };
    this.send = new Bus(this.length);
  }

  t(beat: number): number {
    return beat * this.spb;
  }

  /**
   * Dance music repeats itself constantly; identical hits and notes are
   * rendered once and stamped wherever they occur.
   */
  private readonly cache = new Map<string, Bus>();

  private stamp(bus: Bus, key: string, start: number, seconds: number, render: (b: Bus) => void): void {
    let src = this.cache.get(key);
    if (!src) {
      src = new Bus(Math.ceil(seconds * SR));
      render(src);
      this.cache.set(key, src);
    }
    const s0 = Math.floor(start * SR);
    const n = Math.min(src.length, bus.length - s0);
    for (let i = Math.max(0, -s0); i < n; i++) {
      bus.L[s0 + i]! += src.L[i]!;
      bus.R[s0 + i]! += src.R[i]!;
    }
  }

  kick(beat: number, vel = 1, opt?: Parameters<typeof renderKick>[3]): void {
    this.kicks.push(this.t(beat));
    this.stamp(this.buses.drums, `k${vel}${JSON.stringify(opt ?? {})}`, this.t(beat), 0.5, (b) => renderKick(b, 0, vel * 0.72, { decay: 0.3, p1: 50, ...opt }));
  }
  snare(beat: number, vel = 0.7): void {
    this.stamp(this.buses.drums, `s${vel.toFixed(3)}`, this.t(beat), 0.5, (b) => renderSnare(b, 0, vel));
  }
  clap(beat: number, vel = 0.7): void {
    this.stamp(this.buses.drums, `c${vel}`, this.t(beat), 0.42, (b) => renderClap(b, 0, vel));
  }
  hat(beat: number, vel = 0.3, open = false): void {
    this.stamp(this.buses.drums, `h${vel}${open}`, this.t(beat), open ? 0.9 : 0.16, (b) => renderHat(b, 0, vel, open, open ? -0.2 : 0.2));
  }
  crash(beat: number, vel = 0.6): void {
    this.stamp(this.buses.drums, `x${vel}`, this.t(beat), 4.9, (b) => renderCrash(b, 0, vel));
  }
  riser(beat: number, beats: number, vel = 0.6): void {
    renderSweep(this.buses.fx, this.t(beat), this.t(beats), vel, true);
  }
  downer(beat: number, beats: number, vel = 0.5): void {
    renderSweep(this.buses.fx, this.t(beat), this.t(beats), vel, false);
  }
  impact(beat: number, vel = 0.8): void {
    this.stamp(this.buses.fx, `i${vel}`, this.t(beat), 1.6, (b) => renderImpact(b, 0, vel));
  }

  note(patch: Patch | string, beat: number, beats: number, midi: number, vel = 1, bus: BusName = 'music'): void {
    const p = typeof patch === 'string' ? PATCHES[patch]! : patch;
    const dur = this.t(beats);
    const key = `n${patchKey(p)}|${midi}|${Math.round(dur * SR)}|${vel.toFixed(3)}`;
    this.stamp(this.buses[bus], key, this.t(beat), dur + p.amp.r + 0.01, (b) => renderNote(b, 0, dur, midi, vel, p, this.seed));
  }

  chord(patch: Patch | string, beat: number, beats: number, midis: number[], vel = 1, bus: BusName = 'music'): void {
    for (const m of midis) this.note(patch, beat, beats, m, vel, bus);
  }

  /** Mixes buses with effects and returns final stereo data. */
  mixdown(opts: { delayBeats?: number; duckDepth?: number; foldAt?: number } = {}): { L: Float32Array; R: Float32Array } {
    const b = this.buses;
    if (opts.delayBeats) applyDelay(b.lead, this.t(opts.delayBeats), 0.32, 0.28);
    const duck = opts.duckDepth ?? 0.65;
    applyDuck(b.bass, this.kicks, Math.min(0.95, duck + 0.2), this.spb * 0.45);
    applyDuck(b.music, this.kicks, duck, this.spb * 0.6);
    applyDuck(b.lead, this.kicks, duck * 0.45, this.spb * 0.5);
    for (const name of Object.keys(b) as BusName[]) addInto(this.send, b[name], this.sends[name]);
    const wet = reverb(this.send, 0.84, 0.3, 1);
    const out = new Bus(this.length);
    addInto(out, b.drums, 1);
    addInto(out, b.bass, 1);
    addInto(out, b.music, 1);
    addInto(out, b.lead, 1);
    addInto(out, b.fx, 1);
    addInto(out, wet, 0.9);
    let final = out;
    if (opts.foldAt) {
      // seamless loop: fold the tail (reverb/delay ring-out) back onto the start
      const n = Math.floor(opts.foldAt * SR);
      final = new Bus(n);
      for (let i = 0; i < out.length; i++) {
        final.L[i % n]! += out.L[i]!;
        final.R[i % n]! += out.R[i]!;
      }
    }
    master(final, 0.89);
    return { L: final.L, R: final.R };
  }
}

// ---------------------------------------------------------------- song generator

export type SectionKind = 'intro' | 'build' | 'drop' | 'break' | 'outro' | 'groove';

export interface SectionSpec {
  kind: SectionKind;
  bars: number;
  /** Optional per-section progression override. */
  prog?: number[];
}

export interface SongSpec {
  id: string;
  title: string;
  bpm: number;
  root: number;
  scale: ScaleName;
  seed: number;
  /** Scale degrees, one chord per `chordBars` bars. */
  prog: number[];
  chordBars?: number;
  sevenths?: boolean;
  sections: SectionSpec[];
  drums: 'four' | 'break' | 'half' | 'dnb' | 'electro';
  bassStyle: 'offbeat' | 'rolling' | 'pulse' | 'sustain' | 'octave';
  bassPatch?: string;
  arp: number[];
  arpPatch?: string;
  /** 16th steps per arp note (1 = 16ths, 2 = 8ths). */
  arpRate?: number;
  leadPatch: string;
  breakPatch?: string;
  chordPatch?: 'pad' | 'stab';
  /** Melody rhythm (16th-step onsets within 2 bars) — chosen from presets when absent. */
  rhythm?: number[];
  loop?: boolean;
  /** Seconds of silence/lead-in before beat 0. */
  lead?: number;
  delayBeats?: number;
}

export interface SongSection {
  kind: SectionKind;
  /** First bar and bar count. */
  bar: number;
  bars: number;
  /** Start time in seconds (song time). */
  time: number;
}

export interface SongInfo {
  id: string;
  title: string;
  bpm: number;
  /** Song time (s) of beat 0. */
  offset: number;
  bars: number;
  duration: number;
  sections: SongSection[];
  loop: boolean;
}

export function songInfo(spec: SongSpec): SongInfo {
  const spb = 60 / spec.bpm;
  const offset = spec.lead ?? 0;
  let bar = 0;
  const sections: SongSection[] = [];
  for (const s of spec.sections) {
    sections.push({ kind: s.kind, bar, bars: s.bars, time: offset + bar * 4 * spb });
    bar += s.bars;
  }
  return {
    id: spec.id,
    title: spec.title,
    bpm: spec.bpm,
    offset,
    bars: bar,
    duration: offset + bar * 4 * spb + (spec.loop ? 0 : 2.5),
    sections,
    loop: !!spec.loop,
  };
}

const RHYTHMS: number[][] = [
  [0, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 28],
  [0, 2, 4, 7, 10, 12, 16, 18, 20, 23, 26, 28, 30],
  [0, 3, 6, 10, 12, 14, 16, 19, 22, 26, 28],
  [0, 4, 6, 8, 11, 14, 16, 20, 22, 24, 27, 30],
  [0, 2, 3, 6, 8, 10, 12, 16, 18, 19, 22, 24, 26, 28],
  [0, 3, 6, 9, 12, 14, 16, 19, 22, 25, 28, 30],
];

interface MelNote { step: number; len: number; deg: number }

/** Generates a 2-bar motif: chord tones on strong steps, stepwise motion elsewhere. */
function makeMotif(rand: () => number, rhythm: number[], chordDegs: (bar: number) => number, lift: number): MelNote[] {
  const notes: MelNote[] = [];
  let cur = chordDegs(0) + 7 + lift;
  for (let k = 0; k < rhythm.length; k++) {
    const step = rhythm[k]!;
    const next = rhythm[k + 1] ?? 32;
    const bar = step >= 16 ? 1 : 0;
    const strong = step % 4 === 0;
    const base = chordDegs(bar) + 7;
    if (strong) {
      // nearest chord tone (root / 3rd / 5th / octave) to the current pitch
      const tones = [base, base + 2, base + 4, base + 7, base - 3];
      let best = tones[0]!;
      for (const t of tones) if (Math.abs(t - cur) < Math.abs(best - cur) || (Math.abs(t - cur) === Math.abs(best - cur) && rand() < 0.5)) best = t;
      cur = best;
    } else {
      const r = rand();
      cur += r < 0.4 ? 1 : r < 0.8 ? -1 : r < 0.9 ? 2 : -2;
    }
    if (cur > base + 9) cur -= 2;
    if (cur < base - 2) cur += 2;
    notes.push({ step, len: Math.max(1, Math.min(next - step, 4)), deg: cur });
  }
  return notes;
}

/** Renders a song spec to stereo PCM at SR. */
export function renderSong(spec: SongSpec): { L: Float32Array; R: Float32Array; info: SongInfo } {
  const info = songInfo(spec);
  const tail = spec.loop ? 3 : 0;
  const c = new Composer(spec.bpm, info.duration + tail, spec.seed);
  const rand = rng(spec.seed);
  const lead = spec.lead ?? 0;
  const B = (bar: number, step = 0) => (lead / c.spb) + bar * 4 + step / 4;
  const chordBars = spec.chordBars ?? 1;
  const rhythm = spec.rhythm ?? RHYTHMS[Math.floor(rand() * RHYTHMS.length)]!;
  const root = spec.root;
  const sc = spec.scale;
  const motifA = makeMotif(rand, rhythm, (b) => spec.prog[b % spec.prog.length]!, 0);
  const motifB = makeMotif(rand, rhythm, (b) => spec.prog[(b + 2) % spec.prog.length]!, 2);
  let prevVoicing: number[] | undefined;
  const arpPatch = spec.arpPatch ?? 'arp';
  const bassPatch = spec.bassPatch ?? 'bass';
  const arpRate = spec.arpRate ?? 1;

  for (let si = 0; si < info.sections.length; si++) {
    const sec = info.sections[si]!;
    const prog = spec.sections[si]!.prog ?? spec.prog;
    const energy = sec.kind === 'drop' ? 3 : sec.kind === 'build' || sec.kind === 'groove' ? 2 : 1;
    for (let b = 0; b < sec.bars; b++) {
      const bar = sec.bar + b;
      const ci = Math.floor(b / chordBars) % prog.length;
      const deg = prog[ci]!;
      const chord = chordOn(root, sc, deg, spec.sevenths);
      const voiced = voice(chord, root + 12 - 5, prevVoicing);
      prevVoicing = voiced;
      const bassRoot = degree(root, sc, deg) - 24 + (degree(root, sc, deg) - root > 7 ? -12 : 0);
      const lastBar = b === sec.bars - 1;
      const fillBar = lastBar && sec.kind !== 'outro';

      // ---------------- drums
      const kickOn = sec.kind === 'drop' || sec.kind === 'build' || sec.kind === 'groove' || (sec.kind === 'outro' && b < sec.bars - 2);
      if (kickOn) {
        const style = sec.kind === 'build' ? 'four' : spec.drums;
        const kicks =
          style === 'four' ? [0, 4, 8, 12]
          : style === 'break' ? [0, 6, 10]
          : style === 'half' ? [0, 10]
          : style === 'dnb' ? [0, 10]
          : [0, 3, 8, 11];
        for (const k of kicks) if (!(fillBar && sec.kind === 'build' && k >= 8)) c.kick(B(bar, k), 1);
        if (sec.kind !== 'build') {
          const snares = style === 'half' ? [8] : [4, 12];
          for (const s of snares) {
            c.clap(B(bar, s), 0.62);
            if (style === 'dnb' || style === 'break') c.snare(B(bar, s), 0.55);
          }
          if (style === 'dnb') c.snare(B(bar, 7), 0.18);
        }
      }
      if (energy >= 2 || (sec.kind === 'intro' && b >= sec.bars / 2) || sec.kind === 'outro') {
        const sixteenths = energy >= 3 && (spec.drums === 'electro' || spec.drums === 'dnb' || spec.bpm < 140);
        for (let s = 0; s < 16; s += sixteenths ? 1 : 2) {
          const off = s % 4 === 2;
          if (sec.kind === 'intro' && !off) continue;
          c.hat(B(bar, s), off ? 0.32 : 0.16, off && energy >= 3 && s % 8 === 6 && spec.drums === 'four');
        }
      }
      // build-up snare roll
      if (sec.kind === 'build' && b >= sec.bars - 2) {
        const dense = b === sec.bars - 1;
        for (let s = 0; s < 16; s += dense ? 1 : 2) c.snare(B(bar, s), 0.25 + 0.45 * ((b - (sec.bars - 2)) * 16 + s) / 32);
      }
      if (b === 0 && (sec.kind === 'drop' || sec.kind === 'groove')) {
        c.crash(B(bar), 0.7);
        if (sec.kind === 'drop') c.impact(B(bar), 0.7);
      }
      if (b === 0 && sec.kind === 'break') c.downer(B(bar), 8, 0.5);
      if (sec.kind === 'build' && b === 0) c.riser(B(bar), sec.bars * 4, 0.7);
      if (sec.kind === 'intro' && b === sec.bars - 2) c.riser(B(bar), 8, 0.4);

      // ---------------- bass
      if (energy >= 2 || sec.kind === 'outro') {
        const style = sec.kind === 'build' ? 'sustain' : spec.bassStyle;
        const n = bassRoot;
        if (style === 'offbeat') {
          for (const s of [2, 6, 10, 14]) c.note(bassPatch, B(bar, s), 0.4, n, 1, 'bass');
        } else if (style === 'rolling') {
          for (let s = 0; s < 16; s++) if (s % 4 !== 0) c.note(bassPatch, B(bar, s), 0.22, n, s % 4 === 2 ? 1 : 0.8, 'bass');
        } else if (style === 'pulse') {
          for (let s = 0; s < 16; s += 2) c.note(bassPatch, B(bar, s), 0.4, s % 4 === 2 ? n + 12 : n, 1, 'bass');
        } else if (style === 'octave') {
          for (let s = 0; s < 16; s += 2) c.note(bassPatch, B(bar, s), 0.35, s % 4 === 0 ? n : n + 12, 1, 'bass');
        } else {
          c.note(bassPatch, B(bar), 3.8, n, 0.9, 'bass');
        }
        if (energy >= 3) c.note('sub', B(bar), 3.9, n, 0.8, 'bass');
      }

      // ---------------- chords
      const chordPatch = spec.chordPatch ?? 'pad';
      if (sec.kind !== 'drop' || chordPatch === 'pad') {
        if (b % chordBars === 0) c.chord('pad', B(bar), 4 * chordBars - 0.1, voiced, sec.kind === 'drop' ? 0.7 : 1);
      }
      if (sec.kind === 'drop' && chordPatch === 'stab') {
        for (const s of [0, 3, 6, 10, 12]) c.chord('stab', B(bar, s), 0.5, voiced, 0.9);
      }

      // ---------------- arp
      if (sec.kind !== 'break' && spec.arp.length && !(sec.kind === 'outro' && b >= sec.bars - 1)) {
        const tones = [...voiced, voiced[0]! + 12, voiced[1]! + 12];
        const cut = sec.kind === 'intro' ? 0.45 : sec.kind === 'build' ? 0.6 + 0.4 * (b / sec.bars) : 1;
        const patch = { ...PATCHES[arpPatch]!, filter: { ...PATCHES[arpPatch]!.filter!, cutoff: PATCHES[arpPatch]!.filter!.cutoff * cut, env: (PATCHES[arpPatch]!.filter!.env ?? 0) * cut } };
        for (let s = 0, k = 0; s < 16; s += arpRate, k++) {
          const idx = spec.arp[k % spec.arp.length]!;
          c.note(patch, B(bar, s), 0.22 * arpRate, tones[idx % tones.length]! + 12, 0.85, 'music');
        }
      }

      // ---------------- lead melody (2-bar motifs, phrase A A B A')
      if ((sec.kind === 'drop' || sec.kind === 'break' || sec.kind === 'groove') && b % 2 === 0) {
        const phrase = Math.floor(b / 2) % 4;
        const motif = phrase === 2 ? motifB : motifA;
        const patch = sec.kind === 'break' ? (spec.breakPatch ?? 'bell') : spec.leadPatch;
        const vel = sec.kind === 'break' ? 0.8 : 1;
        for (let k = 0; k < motif.length; k++) {
          const m = motif[k]!;
          let d = m.deg;
          if (phrase === 3 && k >= motif.length - 3) d = spec.prog[0]! + 7 + (k === motif.length - 1 ? 0 : 2);
          if (b + 1 >= sec.bars && m.step >= 16) continue;
          const oct = sec.kind === 'break' ? 12 : 0;
          c.note(patch, B(bar, m.step), m.len * 0.25 * 0.92, degree(root, sc, d) + oct, vel, 'lead');
        }
      }
    }
  }

  const { L, R } = c.mixdown({ delayBeats: spec.delayBeats ?? 0.75, duckDepth: 0.6, foldAt: spec.loop ? info.duration : undefined });
  return { L, R, info };
}
