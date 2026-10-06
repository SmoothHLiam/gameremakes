/** The one action button: Space, Up, W, left click, or touch. Holding counts. */
const ACTION_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

export interface ActionListener {
  (down: boolean, timeStamp: number): void;
}

export interface KeyListener {
  (code: string, e: KeyboardEvent): void;
}

/**
 * Reads input on the DOM events themselves (not a polling loop) and forwards
 * them with their event timestamps so the sim can place them on the right tick.
 */
export class InputManager {
  private readonly sources = new Set<string>();
  private action: ActionListener | null = null;
  private key: KeyListener | null = null;
  enabled = true;

  constructor(pointerTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
        e.preventDefault();
        if (!e.repeat) this.down(`k:${e.code}`, e.timeStamp);
        return;
      }
      if (!e.repeat) this.key?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      if (ACTION_KEYS.has(e.code)) {
        e.preventDefault();
        this.up(`k:${e.code}`, e.timeStamp);
      }
    });
    pointerTarget.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try {
        pointerTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.down(`p:${e.pointerId}`, e.timeStamp);
    });
    const release = (e: PointerEvent) => this.up(`p:${e.pointerId}`, e.timeStamp);
    pointerTarget.addEventListener('pointerup', release);
    pointerTarget.addEventListener('pointercancel', release);
    pointerTarget.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll(performance.now()));
  }

  get held(): boolean {
    return this.sources.size > 0;
  }

  onAction(fn: ActionListener | null): void {
    this.action = fn;
  }

  onKey(fn: KeyListener | null): void {
    this.key = fn;
  }

  private down(src: string, ts: number): void {
    const was = this.sources.size > 0;
    this.sources.add(src);
    if (!was && this.enabled) this.action?.(true, ts);
  }

  private up(src: string, ts: number): void {
    if (!this.sources.delete(src)) return;
    if (this.sources.size === 0 && this.enabled) this.action?.(false, ts);
  }

  releaseAll(ts: number): void {
    if (this.sources.size === 0) return;
    this.sources.clear();
    if (this.enabled) this.action?.(false, ts);
  }
}
