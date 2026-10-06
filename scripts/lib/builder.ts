import { defaultMeta, type LevelJSON, type LevelMeta, type LevelObject, type ObjExtra, serializeLevel } from '../../src/core/level.ts';
import { requireDef } from '../../src/core/objects.ts';

/**
 * Programmatic level construction. Coordinates are grid cells in blocks
 * (cell (0,0) is the first cell above the ground at the start line); objects
 * are centered in their cell plus their definition's snap offset, exactly like
 * the editor's grid snapping.
 */
export class LevelBuilder {
  readonly objects: LevelObject[] = [];
  meta: LevelMeta;

  constructor(meta: Partial<LevelMeta>) {
    this.meta = { ...defaultMeta(), ...meta, colors: { ...defaultMeta().colors, ...(meta.colors ?? {}) } };
  }

  /** Place by grid cell. */
  add(key: string, cx: number, cy: number, extra?: ObjExtra): this {
    const def = requireDef(key);
    const x = cx + 0.5 + (def.snap?.x ?? 0);
    const y = cy + 0.5 + (def.snap?.y ?? 0);
    this.objects.push(extra && Object.keys(extra).length ? [def.id, x, y, extra] : [def.id, x, y]);
    return this;
  }

  /** Place by exact center (blocks). */
  at(key: string, x: number, y: number, extra?: ObjExtra): this {
    const def = requireDef(key);
    this.objects.push(extra && Object.keys(extra).length ? [def.id, x, y, extra] : [def.id, x, y]);
    return this;
  }

  row(key: string, x0: number, x1: number, y: number, extra?: ObjExtra): this {
    for (let x = x0; x <= x1; x++) this.add(key, x, y, extra);
    return this;
  }

  rect(key: string, x0: number, y0: number, x1: number, y1: number, extra?: ObjExtra): this {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.add(key, x, y, extra);
    return this;
  }

  level(): LevelJSON {
    return { v: 1, meta: this.meta, objects: this.objects };
  }

  json(): string {
    return serializeLevel(this.level());
  }
}
