import type { ModeKey } from '../core/objects.ts';
import { readJSON, writeJSON } from './storage.ts';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  showPercent: boolean;
  showAttempts: boolean;
  showFps: boolean;
  hitboxes: boolean;
  reducedParticles: boolean;
  glow: boolean;
}

export interface IconChoice {
  designs: Record<ModeKey, number>;
  p1: string;
  p2: string;
  glow: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.8,
  sfxVolume: 0.7,
  showPercent: true,
  showAttempts: true,
  showFps: false,
  hitboxes: false,
  reducedParticles: false,
  glow: true,
};

const DEFAULT_ICONS: IconChoice = {
  designs: { cube: 0, ship: 0, ball: 0, ufo: 0, wave: 0, robot: 0, spider: 0, swing: 0 },
  p1: '#3dff8b',
  p2: '#38d4ff',
  glow: true,
};

function sanitizeSettings(v: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const val = v[k];
    if (typeof val === typeof DEFAULT_SETTINGS[k]) (s as Record<string, unknown>)[k] = val;
  }
  s.musicVolume = Math.min(1, Math.max(0, s.musicVolume));
  s.sfxVolume = Math.min(1, Math.max(0, s.sfxVolume));
  return s;
}

function sanitizeIcons(v: Partial<IconChoice>): IconChoice {
  const out: IconChoice = { ...DEFAULT_ICONS, designs: { ...DEFAULT_ICONS.designs } };
  if (v.designs && typeof v.designs === 'object') {
    for (const k of Object.keys(out.designs) as ModeKey[]) {
      const d = (v.designs as Record<string, unknown>)[k];
      if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d < 64) out.designs[k] = d;
    }
  }
  const hex = /^#[0-9a-f]{6}$/i;
  if (typeof v.p1 === 'string' && hex.test(v.p1)) out.p1 = v.p1;
  if (typeof v.p2 === 'string' && hex.test(v.p2)) out.p2 = v.p2;
  if (typeof v.glow === 'boolean') out.glow = v.glow;
  return out;
}

type Listener = () => void;

/** Persistent settings + icon choice, with change listeners. */
class Store {
  settings: Settings = sanitizeSettings(readJSON<Partial<Settings>>('settings', {}));
  icons: IconChoice = sanitizeIcons(readJSON<Partial<IconChoice>>('icons', {}));
  private listeners: Listener[] = [];

  update(patch: Partial<Settings>): void {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    writeJSON('settings', this.settings);
    this.emit();
  }

  updateIcons(patch: Partial<IconChoice>): void {
    this.icons = sanitizeIcons({ ...this.icons, ...patch, designs: { ...this.icons.designs, ...(patch.designs ?? {}) } });
    writeJSON('icons', this.icons);
    this.emit();
  }

  onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const store = new Store();
