import './styles.css';
import { Application } from 'pixi.js';
import { GAME_TITLE } from './config.ts';
import { Letterbox } from './render/stage.ts';

async function boot(): Promise<void> {
  document.title = GAME_TITLE;
  const stageEl = document.getElementById('stage')!;
  const uiEl = document.getElementById('ui')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const letterbox = new Letterbox(stageEl, uiEl);

  const app = new Application();
  await app.init({
    canvas,
    width: letterbox.rect.width,
    height: letterbox.rect.height,
    background: 0x000000,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: true,
    preference: ['webgl', 'canvas'],
  });
  letterbox.onChange((r) => app.renderer.resize(r.width, r.height));
}

void boot();
