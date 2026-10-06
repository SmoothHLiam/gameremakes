import { Container, Sprite, Texture } from 'pixi.js';
import { defaultMeta, type LevelJSON, type LevelObject } from '../core/level.ts';
import { OBJECT_DEFS } from '../core/objects.ts';
import { GameSession } from '../game/session.ts';
import { buildSkin, destroySkin } from '../game/skin.ts';
import type { App } from './app.ts';
import { store } from './settings.ts';

/**
 * Renders one of every object, every atlas page, the player skin and the glow
 * filter once (behind the splash screen) so textures are uploaded and shaders
 * compiled before the first level starts, instead of hitching its first frame.
 */
export function prewarm(app: App): void {
  try {
    const cols = 14;
    const objects: LevelObject[] = OBJECT_DEFS.filter((d) => d.cat !== 'trigger').map((d, i) => [d.id, (i % cols) + 0.5, 2.5 + Math.floor(i / cols)]);
    const level: LevelJSON = { v: 1, meta: { ...defaultMeta(), length: 40 }, objects };
    const skin = buildSkin(store.icons);
    const session = new GameSession({ level, renderer: app.pixi.renderer, bank: app.bank, skin, glow: true });
    const now = performance.now();
    session.start(now, false);
    session.frame(now, 0);
    session.view.resize(app.width, app.height);
    const root = new Container();
    root.addChild(session.view.root);
    const pages = app.bank.pages.map((source) => new Sprite(new Texture({ source })));
    for (const s of pages) {
      s.width = 4;
      s.height = 4;
      root.addChild(s);
    }
    app.pixi.renderer.render(root);
    for (const s of pages) s.destroy();
    root.destroy();
    session.destroy();
    destroySkin(skin);
  } catch (e) {
    console.warn('prewarm skipped', e);
  }
}
