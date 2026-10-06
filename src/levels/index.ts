import { type LevelJSON, parseLevel } from '../core/level.ts';

/** Shipped and test levels, bundled at build time. */
const files = import.meta.glob<{ default: unknown }>('./**/*.json', { eager: true });

export interface LevelEntry {
  id: string;
  path: string;
  level: LevelJSON;
  test: boolean;
}

export const LEVELS: LevelEntry[] = Object.entries(files)
  .map(([path, mod]) => {
    const level = parseLevel(mod.default);
    const id = level.meta.id ?? path.replace(/^\.\/|\.json$/g, '').replace(/\//g, '-');
    return { id, path, level, test: path.includes('/test/') };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

export function findLevel(id: string): LevelEntry | undefined {
  return LEVELS.find((l) => l.id === id);
}
