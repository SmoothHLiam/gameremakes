import { type LevelJSON, parseLevel, serializeLevel } from '../core/level.ts';
import { readJSON, removeKey, writeJSON } from './storage.ts';

export interface StoredLevelInfo {
  id: string;
  name: string;
  updated: number;
  objects: number;
}

const INDEX = 'customLevels';

/** Saved custom levels live in localStorage (index + one key per level). */
export function listCustomLevels(): StoredLevelInfo[] {
  const list = readJSON<StoredLevelInfo[]>(INDEX, []);
  return Array.isArray(list) ? list.filter((l) => l && typeof l.id === 'string').sort((a, b) => b.updated - a.updated) : [];
}

export function loadCustomLevel(id: string): LevelJSON | null {
  const raw = readJSON<string | null>(`level:${id}`, null);
  if (typeof raw !== 'string') return null;
  try {
    return parseLevel(raw);
  } catch {
    return null;
  }
}

/** Returns the level id, or null if storage is full or unavailable. */
export function saveCustomLevel(level: LevelJSON): string | null {
  const id = level.meta.id && level.meta.id.startsWith('c-') ? level.meta.id : `c-${Date.now().toString(36)}`;
  level.meta.id = id;
  if (!writeJSON(`level:${id}`, serializeLevel(level))) return null;
  const list = listCustomLevels().filter((l) => l.id !== id);
  list.push({ id, name: level.meta.name, updated: Date.now(), objects: level.objects.length });
  if (!writeJSON(INDEX, list)) return null;
  return id;
}

export function deleteCustomLevel(id: string): void {
  removeKey(`level:${id}`);
  writeJSON(INDEX, listCustomLevels().filter((l) => l.id !== id));
}
