import { describe, expect, it } from 'vitest';
import { emptyLevel } from '../src/core/level.ts';
import { requireDef } from '../src/core/objects.ts';
import { EditorModel, snapCenter } from '../src/editor/model.ts';

const B = requireDef('block').id;
const SPIKE = requireDef('spike').id;

describe('editor model', () => {
  it('adds, removes, undoes and redoes', () => {
    const m = new EditorModel(emptyLevel());
    const [a] = m.add([[B, 10.5, 0.5]]);
    m.add([[SPIKE, 12.5, 0.5]]);
    expect(m.objs.length).toBe(2);
    m.remove([a!]);
    expect(m.objs.length).toBe(1);
    m.undo();
    expect(m.objs.length).toBe(2);
    expect(m.objs[0]!.uid).toBe(a); // restored at its original index
    m.undo();
    m.undo();
    expect(m.objs.length).toBe(0);
    m.redo();
    m.redo();
    expect(m.objs.map((e) => e.o[0])).toEqual([B, SPIKE]);
  });

  it('copy/paste and duplicate keep relative layout', () => {
    const m = new EditorModel(emptyLevel());
    m.add([[B, 10.5, 0.5], [B, 11.5, 1.5]]);
    m.copy();
    m.paste(20.5, 0.5);
    const pasted = m.selected().map((e) => [e.o[1], e.o[2]]);
    expect(pasted).toEqual([[20.5, 0.5], [21.5, 1.5]]);
    m.duplicate();
    expect(m.selected().map((e) => e.o[1])).toEqual([22.5, 23.5]);
  });

  it('rotates and flips a multi-selection around its center', () => {
    const m = new EditorModel(emptyLevel());
    const uids = m.add([[B, 10.5, 0.5], [B, 11.5, 0.5]]);
    m.rotate(uids, 1);
    const pos = m.selected().map((e) => [e.o[1], e.o[2], e.o[3]?.r]);
    expect(pos.every((p) => p[2] === 90)).toBe(true);
    // a horizontal pair becomes vertical
    expect(pos[0]![0]).toBe(pos[1]![0]);
    m.undo();
    m.flip(uids, 'x');
    expect(m.selected().map((e) => e.o[1])).toEqual([11.5, 10.5]);
    expect(m.selected().every((e) => e.o[3]?.fx === 1)).toBe(true);
  });

  it('edits extras (groups, channels, trigger fields) undoably', () => {
    const m = new EditorModel(emptyLevel());
    const [u] = m.add([[B, 5.5, 0.5]]);
    m.setExtra([u!], { g: [1, 2], c: 5 });
    expect(m.get(u!)!.o[3]).toEqual({ g: [1, 2], c: 5 });
    m.setExtra([u!], { g: undefined });
    expect(m.get(u!)!.o[3]).toEqual({ c: 5 });
    m.undo();
    m.undo();
    expect(m.get(u!)!.o[3]).toBeUndefined();
  });

  it('snaps to the 1-block and half-block grids using each object’s lattice', () => {
    expect(snapCenter(B, 10.7, 0.3, 1)).toEqual([10.5, 0.5]);
    expect(snapCenter(B, 10.7, 1.9, 0.5)).toEqual([10.5, 2]);
    const slab = requireDef('slab');
    expect(snapCenter(slab.id, 3.2, 0.1, 1)).toEqual([3.5, 0.75]);
    const saw = requireDef('saw');
    expect(snapCenter(saw.id, 3.2, 2.2, 1)).toEqual([3, 2]);
  });

  it('batches a paint stroke into one undo step and records drags once', () => {
    const m = new EditorModel(emptyLevel());
    m.beginBatch();
    for (let x = 0; x < 5; x++) m.add([[B, x + 0.5, 0.5]], false);
    m.endBatch();
    expect(m.objs.length).toBe(5);
    m.undo();
    expect(m.objs.length).toBe(0);
    m.redo();
    const uids = m.objs.map((e) => e.uid);
    const snap = m.snapshot(uids);
    m.liveMove(snap, 1, 0);
    m.liveMove(snap, 3, 1);
    m.commitLive(snap);
    expect(m.objs[0]!.o[1]).toBe(3.5);
    m.undo();
    expect(m.objs[0]!.o[1]).toBe(0.5);
  });

  it('round-trips through level JSON', () => {
    const m = new EditorModel(emptyLevel());
    m.add([[B, 1.5, 0.5, { g: [3] }]]);
    m.setMeta({ name: 'Round Trip', bpm: 150 });
    const lvl = m.toLevel();
    expect(lvl.meta.name).toBe('Round Trip');
    expect(lvl.objects[0]).toEqual([B, 1.5, 0.5, { g: [3] }]);
    m.undo();
    expect(m.meta.name).toBe('Untitled');
  });
});
