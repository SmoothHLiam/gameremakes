import { STORAGE_PREFIX } from '../config.ts';

/** localStorage wrappers. Every access is guarded: storage can be missing, full, or blocked. */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Minimal IndexedDB key/value store for large blobs (imported songs). */
const DB_NAME = `${STORAGE_PREFIX}blobs`;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function blobPut(key: string, value: ArrayBuffer): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function blobGet(key: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
