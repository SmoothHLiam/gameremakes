import { CanvasSource, Texture } from 'pixi.js';
import { MODE_KEYS, type ModeKey } from '../core/objects.ts';
import type { IconChoice } from '../app/settings.ts';
import { ICON_FRAMES, renderIcon } from '../render/icons.ts';
import type { PlayerSkin } from '../render/view.ts';

const hexNum = (h: string) => parseInt(h.slice(1), 16);

/** Pre-generates every mode icon (all frames) for the chosen colors before a level starts. */
export function buildSkin(icons: IconChoice, ppb = 128): PlayerSkin {
  const pad = 0.1;
  const tex = {} as Record<ModeKey, Texture[]>;
  for (const mode of MODE_KEYS) {
    const frames: Texture[] = [];
    for (let f = 0; f < ICON_FRAMES[mode]; f++) {
      const canvas = renderIcon(mode, icons.designs[mode], { p1: icons.p1, p2: icons.p2 }, ppb, f, pad);
      frames.push(new Texture({ source: new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' }) }));
    }
    tex[mode] = frames;
  }
  return { tex, ppb, pad, p1: hexNum(icons.p1), p2: hexNum(icons.p2), glow: icons.glow };
}

export function destroySkin(skin: PlayerSkin): void {
  for (const mode of MODE_KEYS) for (const t of skin.tex[mode]) t.destroy(true);
}
