import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config.ts';

export interface StageRect {
  /** CSS pixel rect of the letterboxed 16:9 stage inside the window. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** DOM UI scale factor relative to the 1280×720 design size. */
  uiScale: number;
}

/** Fits a 16:9 rect into the window, centered, and applies it to the DOM. */
export class Letterbox {
  rect: StageRect = { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT, uiScale: 1 };
  private listeners: Array<(r: StageRect) => void> = [];

  private readonly stageEl: HTMLElement;
  private readonly uiEl: HTMLElement;

  constructor(stageEl: HTMLElement, uiEl: HTMLElement) {
    this.stageEl = stageEl;
    this.uiEl = uiEl;
    const update = () => this.update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('fullscreenchange', update);
    window.visualViewport?.addEventListener('resize', update);
    this.update();
  }

  onChange(fn: (r: StageRect) => void): void {
    this.listeners.push(fn);
  }

  update(): void {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const aspect = DESIGN_WIDTH / DESIGN_HEIGHT;
    let width = vw;
    let height = vw / aspect;
    if (height > vh) {
      height = vh;
      width = vh * aspect;
    }
    width = Math.floor(width);
    height = Math.floor(height);
    const x = Math.floor((vw - width) / 2);
    const y = Math.floor((vh - height) / 2);
    const uiScale = width / DESIGN_WIDTH;
    this.rect = { x, y, width, height, uiScale };
    const s = this.stageEl.style;
    s.left = `${x}px`;
    s.top = `${y}px`;
    s.width = `${width}px`;
    s.height = `${height}px`;
    this.uiEl.style.transform = `scale(${uiScale})`;
    for (const fn of this.listeners) fn(this.rect);
  }
}
