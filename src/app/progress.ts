import { readJSON, writeJSON } from './storage.ts';

export interface LevelProgress {
  /** Best percent in normal mode (0-100). */
  normal: number;
  /** Best percent in practice mode. */
  practice: number;
  /** Collected coin slots (bitmask), only from completed normal runs. */
  coins: number;
  attempts: number;
  completions: number;
}

const KEY = 'progress';
const empty = (): LevelProgress => ({ normal: 0, practice: 0, coins: 0, attempts: 0, completions: 0 });

function load(): Record<string, LevelProgress> {
  const raw = readJSON<Record<string, Partial<LevelProgress>>>(KEY, {});
  const out: Record<string, LevelProgress> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, p] of Object.entries(raw)) {
      if (!p || typeof p !== 'object') continue;
      const e = empty();
      for (const k of Object.keys(e) as Array<keyof LevelProgress>) {
        const v = p[k];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) e[k] = v;
      }
      e.normal = Math.min(100, e.normal);
      e.practice = Math.min(100, e.practice);
      out[id] = e;
    }
  }
  return out;
}

let cache: Record<string, LevelProgress> | null = null;

function all(): Record<string, LevelProgress> {
  cache ??= load();
  return cache;
}

function save(): void {
  writeJSON(KEY, all());
}

export function getProgress(id: string): LevelProgress {
  return { ...(all()[id] ?? empty()) };
}

export function recordAttempt(id: string): void {
  const p = (all()[id] ??= empty());
  p.attempts++;
  save();
}

/** A death (or quit) at `percent`. Returns true if it's a new best. */
export function recordProgress(id: string, percent: number, practice: boolean): boolean {
  const p = (all()[id] ??= empty());
  const key = practice ? 'practice' : 'normal';
  const pct = Math.floor(Math.min(100, Math.max(0, percent)));
  if (pct <= p[key]) return false;
  p[key] = pct;
  save();
  return true;
}

/** Level completed. Coins only count when completing in normal mode. */
export function recordComplete(id: string, practice: boolean, coins: number): void {
  const p = (all()[id] ??= empty());
  if (practice) p.practice = 100;
  else {
    p.normal = 100;
    p.coins |= coins;
    p.completions++;
  }
  save();
}

export function totalStars(): { completed: number; coins: number } {
  let completed = 0;
  let coins = 0;
  for (const p of Object.values(all())) {
    if (p.normal >= 100) completed++;
    let c = p.coins;
    while (c) {
      coins += c & 1;
      c >>= 1;
    }
  }
  return { completed, coins };
}
