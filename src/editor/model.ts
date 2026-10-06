import type { LevelJSON, LevelMeta, LevelObject, ObjExtra } from '../core/level.ts';
import { getDef } from '../core/objects.ts';

/** An object in the editor with a stable id (indices shift; uids don't). */
export interface EdObj {
  uid: number;
  o: LevelObject;
}

type Command =
  | { type: 'add'; items: Array<{ uid: number; o: LevelObject; index: number }> }
  | { type: 'remove'; items: Array<{ uid: number; o: LevelObject; index: number }> }
  | { type: 'modify'; items: Array<{ uid: number; before: LevelObject; after: LevelObject }> }
  | { type: 'meta'; before: LevelMeta; after: LevelMeta }
  | { type: 'batch'; cmds: Command[] };

const cloneObj = (o: LevelObject): LevelObject => (o[3] ? [o[0], o[1], o[2], structuredClone(o[3])] : [o[0], o[1], o[2]]);

/**
 * Editor document: ordered objects with uids, selection, clipboard and an
 * undo/redo stack of reversible commands. No DOM; unit-tested.
 */
export class EditorModel {
  meta: LevelMeta;
  objs: EdObj[] = [];
  selection = new Set<number>();
  clipboard: LevelObject[] = [];
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private nextUid = 1;
  /** Bumped on every change (views recompile when it changes). */
  version = 0;
  dirty = false;

  constructor(level: LevelJSON) {
    this.meta = structuredClone(level.meta);
    for (const o of level.objects) this.objs.push({ uid: this.nextUid++, o: cloneObj(o) });
  }

  toLevel(): LevelJSON {
    return { v: 1, meta: structuredClone(this.meta), objects: this.objs.map((e) => cloneObj(e.o)) };
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  indexOf(uid: number): number {
    return this.objs.findIndex((e) => e.uid === uid);
  }

  get(uid: number): EdObj | undefined {
    return this.objs.find((e) => e.uid === uid);
  }

  selected(): EdObj[] {
    return this.objs.filter((e) => this.selection.has(e.uid));
  }

  private batch: Command[] | null = null;

  /** Group subsequent edits (a paint stroke, an erase drag) into one undo step. */
  beginBatch(): void {
    if (!this.batch) this.batch = [];
  }

  endBatch(): void {
    const b = this.batch;
    this.batch = null;
    if (b && b.length) {
      this.undoStack.push(b.length === 1 ? b[0]! : { type: 'batch', cmds: b });
      if (this.undoStack.length > 500) this.undoStack.shift();
      this.redoStack.length = 0;
    }
  }

  private push(cmd: Command): void {
    if (this.batch) {
      this.batch.push(cmd);
      this.changed();
      return;
    }
    this.undoStack.push(cmd);
    if (this.undoStack.length > 500) this.undoStack.shift();
    this.redoStack.length = 0;
    this.changed();
  }

  private changed(): void {
    this.version++;
    this.dirty = true;
  }

  // ------------------------------------------------------------ edits

  add(list: LevelObject[], select = true): number[] {
    if (!list.length) return [];
    const items = list.map((o) => ({ uid: this.nextUid++, o: cloneObj(o), index: this.objs.length }));
    items.forEach((it, k) => (it.index = this.objs.length + k));
    for (const it of items) this.objs.push({ uid: it.uid, o: cloneObj(it.o) });
    if (select) {
      this.selection.clear();
      for (const it of items) this.selection.add(it.uid);
    }
    this.push({ type: 'add', items });
    return items.map((i) => i.uid);
  }

  remove(uids: Iterable<number>): void {
    const set = new Set(uids);
    const items: Array<{ uid: number; o: LevelObject; index: number }> = [];
    this.objs.forEach((e, index) => {
      if (set.has(e.uid)) items.push({ uid: e.uid, o: cloneObj(e.o), index });
    });
    if (!items.length) return;
    this.objs = this.objs.filter((e) => !set.has(e.uid));
    for (const u of set) this.selection.delete(u);
    this.push({ type: 'remove', items });
  }

  /** Apply a transformation to objects; recorded as one undoable step. */
  modify(uids: Iterable<number>, fn: (o: LevelObject) => LevelObject): void {
    const items: Array<{ uid: number; before: LevelObject; after: LevelObject }> = [];
    for (const uid of uids) {
      const e = this.get(uid);
      if (!e) continue;
      const before = cloneObj(e.o);
      const after = fn(cloneObj(e.o));
      e.o = after;
      items.push({ uid, before, after: cloneObj(after) });
    }
    if (items.length) this.push({ type: 'modify', items });
  }

  setMeta(patch: Partial<LevelMeta>): void {
    const before = structuredClone(this.meta);
    this.meta = { ...this.meta, ...structuredClone(patch) };
    this.push({ type: 'meta', before, after: structuredClone(this.meta) });
  }

  undo(): void {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    this.apply(cmd, true);
    this.redoStack.push(cmd);
    this.changed();
  }

  redo(): void {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    this.apply(cmd, false);
    this.undoStack.push(cmd);
    this.changed();
  }

  private apply(cmd: Command, inverse: boolean): void {
    switch (cmd.type) {
      case 'batch': {
        const list = inverse ? [...cmd.cmds].reverse() : cmd.cmds;
        for (const c of list) this.apply(c, inverse);
        break;
      }
      case 'add':
      case 'remove': {
        const adding = (cmd.type === 'add') !== inverse;
        if (adding) {
          const sorted = [...cmd.items].sort((a, b) => a.index - b.index);
          for (const it of sorted) this.objs.splice(Math.min(it.index, this.objs.length), 0, { uid: it.uid, o: cloneObj(it.o) });
          this.selection = new Set(cmd.items.map((i) => i.uid));
        } else {
          const set = new Set(cmd.items.map((i) => i.uid));
          this.objs = this.objs.filter((e) => !set.has(e.uid));
          for (const u of set) this.selection.delete(u);
        }
        break;
      }
      case 'modify':
        for (const it of cmd.items) {
          const e = this.get(it.uid);
          if (e) e.o = cloneObj(inverse ? it.before : it.after);
        }
        break;
      case 'meta':
        this.meta = structuredClone(inverse ? cmd.before : cmd.after);
        break;
    }
  }

  // ------------------------------------------------------------ live edits (drag)

  /** Snapshot positions before a drag. */
  snapshot(uids: Iterable<number>): Map<number, LevelObject> {
    const m = new Map<number, LevelObject>();
    for (const u of uids) {
      const e = this.get(u);
      if (e) m.set(u, cloneObj(e.o));
    }
    return m;
  }

  /** Move without recording (preview while dragging). */
  liveMove(originals: Map<number, LevelObject>, dx: number, dy: number): void {
    for (const [u, o] of originals) {
      const e = this.get(u);
      if (e) e.o = moved(o, dx, dy);
    }
    this.version++;
  }

  /** Record the drag as one undoable step. */
  commitLive(originals: Map<number, LevelObject>): void {
    const items: Array<{ uid: number; before: LevelObject; after: LevelObject }> = [];
    for (const [u, before] of originals) {
      const e = this.get(u);
      if (e && (e.o[1] !== before[1] || e.o[2] !== before[2])) items.push({ uid: u, before, after: cloneObj(e.o) });
    }
    if (items.length) this.push({ type: 'modify', items });
  }

  // ------------------------------------------------------------ clipboard

  copy(): void {
    this.clipboard = this.selected().map((e) => cloneObj(e.o));
  }

  /** Pastes the clipboard so its left edge lands at x (blocks), keeping relative layout. */
  paste(atX?: number, atY?: number): number[] {
    if (!this.clipboard.length) return [];
    let minX = Infinity;
    let minY = Infinity;
    for (const o of this.clipboard) {
      minX = Math.min(minX, o[1]);
      minY = Math.min(minY, o[2]);
    }
    const dx = atX == null ? 2 : Math.round(atX - minX);
    const dy = atY == null ? 0 : Math.round(atY - minY);
    return this.add(this.clipboard.map((o) => moved(o, dx, dy)));
  }

  duplicate(): number[] {
    const sel = this.selected();
    if (!sel.length) return [];
    let minX = Infinity;
    let maxX = -Infinity;
    for (const e of sel) {
      minX = Math.min(minX, e.o[1]);
      maxX = Math.max(maxX, e.o[1]);
    }
    const dx = Math.max(1, Math.ceil(maxX - minX + 1));
    return this.add(sel.map((e) => moved(e.o, dx, 0)));
  }

  // ------------------------------------------------------------ transforms

  move(uids: Iterable<number>, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.modify(uids, (o) => moved(o, dx, dy));
  }

  /** Rotate by ±90 around the selection center (positions and object rotations). */
  rotate(uids: number[], dir: 1 | -1): void {
    const sel = uids.map((u) => this.get(u)).filter((e): e is EdObj => !!e);
    if (!sel.length) return;
    const cx = sel.reduce((a, e) => a + e.o[1], 0) / sel.length;
    const cy = sel.reduce((a, e) => a + e.o[2], 0) / sel.length;
    const pcx = Math.round(cx * 2) / 2;
    const pcy = Math.round(cy * 2) / 2;
    this.modify(uids, (o) => {
      const ex: ObjExtra = { ...(o[3] ?? {}) };
      ex.r = (((ex.r ?? 0) + 90 * dir) % 360 + 360) % 360;
      if (ex.r === 0) delete ex.r;
      let x = o[1];
      let y = o[2];
      if (sel.length > 1) {
        // clockwise in a y-up world: (dx, dy) → (dy, -dx)
        const dx = x - pcx;
        const dy = y - pcy;
        x = pcx + (dir === 1 ? dy : -dy);
        y = pcy + (dir === 1 ? -dx : dx);
      }
      return withExtra([o[0], x, y], ex);
    });
  }

  flip(uids: number[], axis: 'x' | 'y'): void {
    const sel = uids.map((u) => this.get(u)).filter((e): e is EdObj => !!e);
    if (!sel.length) return;
    const c = axis === 'x' ? sel.reduce((a, e) => a + e.o[1], 0) / sel.length : sel.reduce((a, e) => a + e.o[2], 0) / sel.length;
    const pc = Math.round(c * 2) / 2;
    this.modify(uids, (o) => {
      const ex: ObjExtra = { ...(o[3] ?? {}) };
      const key = axis === 'x' ? 'fx' : 'fy';
      if (ex[key]) delete ex[key];
      else ex[key] = 1;
      const x = axis === 'x' && sel.length > 1 ? 2 * pc - o[1] : o[1];
      const y = axis === 'y' && sel.length > 1 ? 2 * pc - o[2] : o[2];
      return withExtra([o[0], x, y], ex);
    });
  }

  setExtra(uids: Iterable<number>, patch: Partial<ObjExtra>): void {
    this.modify(uids, (o) => {
      const ex: ObjExtra = { ...(o[3] ?? {}), ...patch };
      for (const [k, v] of Object.entries(ex)) if (v === undefined || v === null || (Array.isArray(v) && !v.length)) delete (ex as Record<string, unknown>)[k];
      return withExtra([o[0], o[1], o[2]], ex);
    });
  }
}

export function moved(o: LevelObject, dx: number, dy: number): LevelObject {
  const x = round3(o[1] + dx);
  const y = round3(Math.max(-5, o[2] + dy));
  return o[3] ? [o[0], x, y, structuredClone(o[3])] : [o[0], x, y];
}

export function withExtra(o: [number, number, number], ex: ObjExtra): LevelObject {
  return Object.keys(ex).length ? [o[0], o[1], o[2], ex] : o;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Grid snapping: an object's center lands on its definition's lattice
 * (cell center + snap offset) at the chosen grid step (1 or 0.5 blocks).
 */
export function snapCenter(type: number, xBlocks: number, yBlocks: number, grid: number): [number, number] {
  const def = getDef(type);
  const bx = 0.5 + (def?.snap?.x ?? 0);
  const by = 0.5 + (def?.snap?.y ?? 0);
  const x = bx + Math.round((xBlocks - bx) / grid) * grid;
  const y = by + Math.round((yBlocks - by) / grid) * grid;
  return [round3(x), round3(Math.max(by, y))];
}
