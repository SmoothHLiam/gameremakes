import { DIFFICULTIES } from '../core/level.ts';
import { MODE_KEYS } from '../core/objects.ts';
import { faceUrl } from '../render/faces.ts';
import { ICON_SETS, renderIcon } from '../render/icons.ts';
import { h } from './dom.ts';

/** Debug gallery (?gallery): every difficulty face and player icon. */
export function showGallery(root: HTMLElement): void {
  const el = h('div.gallery.interactive');
  el.append(h('div.gallery-row', ...DIFFICULTIES.map((d) => h('img', { src: faceUrl(d, 110), title: d }))));
  for (const mode of MODE_KEYS) {
    const row = h('div.gallery-row');
    ICON_SETS[mode].forEach((_, i) => {
      const c = renderIcon(mode, i, { p1: '#3dff8b', p2: '#38d4ff' }, 64, 0, 0.1);
      row.append(c);
    });
    el.append(row);
  }
  root.append(el);
}
