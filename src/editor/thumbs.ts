import { type ObjDef } from '../core/objects.ts';
import { allTextureSpecs, type TexSpec } from '../render/draw.ts';

let specs: Record<string, TexSpec> | null = null;
const cache = new Map<number, string>();

/** Palette thumbnail for an object, drawn with the same code as the in-game atlas. */
export function thumbnail(def: ObjDef, size = 56): string {
  const hit = cache.get(def.id);
  if (hit) return hit;
  specs ??= allTextureSpecs();
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const maxDim = Math.max(def.w, def.h, 1);
  const B = (size * 0.78) / maxDim;
  for (const part of def.parts) {
    const spec = specs[part.tex];
    if (!spec) continue;
    const pad = Math.ceil((spec.pad ?? 0.1) * B);
    const W = Math.ceil(spec.w * B);
    const H = Math.ceil(spec.h * B);
    const off = document.createElement('canvas');
    off.width = W + pad * 2;
    off.height = H + pad * 2;
    const octx = off.getContext('2d')!;
    octx.translate(pad, pad);
    spec.draw(octx, W, H, B);
    if (part.slot !== 'fixed') {
      // tint: detail parts dark, main parts white (default channel look)
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'source-atop';
      octx.fillStyle = part.slot === 'detail' ? '#140c2c' : '#ffffff';
      octx.fillRect(0, 0, off.width, off.height);
    }
    ctx.drawImage(off, (size - off.width) / 2, (size - off.height) / 2);
  }
  const url = c.toDataURL();
  cache.set(def.id, url);
  return url;
}
