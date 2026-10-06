import { Application, Container } from 'pixi.js';
import { Letterbox } from '../render/stage.ts';
import { TextureBank } from '../render/textures.ts';
import { InputManager } from './input.ts';

export interface Screen {
  /** Pixi content for this screen (added under the app stage). */
  readonly root: Container;
  frame(now: number, dt: number): void;
  resize?(w: number, h: number): void;
  onAction?(down: boolean, timeStamp: number): void;
  onKey?(code: string, e: KeyboardEvent): void;
  /** Tab hidden / window blurred. */
  onBlur?(now: number): void;
  destroy(): void;
}

/** Owns the renderer, the letterboxed stage, input routing and the main loop. */
export class App {
  readonly pixi: Application;
  readonly letterbox: Letterbox;
  readonly input: InputManager;
  readonly ui: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  bank!: TextureBank;
  rendererKind: 'webgl' | 'webgpu' | 'canvas' = 'webgl';
  private screen: Screen | null = null;
  private last = 0;
  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private running = false;
  /** Hooks run every frame after the screen (HUD counters etc.). */
  readonly afterFrame: Array<(now: number, dt: number) => void> = [];

  constructor() {
    const stage = document.getElementById('stage')!;
    this.ui = document.getElementById('ui')!;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.letterbox = new Letterbox(stage, this.ui);
    this.pixi = new Application();
    this.input = new InputManager(this.canvas);
    this.input.onAction((down, ts) => this.screen?.onAction?.(down, ts));
    this.input.onKey((code, e) => this.screen?.onKey?.(code, e));
  }

  async init(): Promise<void> {
    // Wait (briefly) for the display font so canvas text never renders with a fallback.
    try {
      await Promise.race([
        Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('900 20px "Nunito"')]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch {
      /* fonts are optional */
    }
    const r = this.letterbox.rect;
    await this.pixi.init({
      canvas: this.canvas,
      width: r.width,
      height: r.height,
      background: 0x000000,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      preference: ['webgl', 'canvas'],
      autoStart: false,
      sharedTicker: false,
    });
    this.pixi.ticker?.stop();
    const name = this.pixi.renderer.name;
    this.rendererKind = name === 'canvas' ? 'canvas' : name === 'webgpu' ? 'webgpu' : 'webgl';
    // Texture resolution: enough pixels per block for crisp art at the current size.
    const ppb = Math.min(128, Math.max(64, Math.round((r.height * Math.min(window.devicePixelRatio || 1, 2)) / 11 / 16) * 16));
    this.bank = new TextureBank(ppb);
    this.letterbox.onChange((rect) => {
      this.pixi.renderer.resize(rect.width, rect.height);
      this.screen?.resize?.(rect.width, rect.height);
    });
    const blur = () => this.screen?.onBlur?.(performance.now());
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) blur();
    });
  }

  get width(): number {
    return this.letterbox.rect.width;
  }

  get height(): number {
    return this.letterbox.rect.height;
  }

  setScreen(next: Screen | null): void {
    if (this.screen) {
      this.pixi.stage.removeChild(this.screen.root);
      this.screen.destroy();
    }
    this.screen = next;
    if (next) {
      this.pixi.stage.addChild(next.root);
      next.resize?.(this.width, this.height);
    }
  }

  get current(): Screen | null {
    return this.screen;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.fpsAcc += dt;
      this.fpsFrames++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsFrames = 0;
      }
      // Use the freshest timestamp for the sim so input→render latency stays minimal.
      const t = performance.now();
      this.screen?.frame(t, dt);
      for (const fn of this.afterFrame) fn(t, dt);
      this.pixi.renderer.render(this.pixi.stage);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
