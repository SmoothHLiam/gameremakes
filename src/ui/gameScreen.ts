import { Container } from 'pixi.js';
import type { App, Screen } from '../app/app.ts';
import type { LevelJSON } from '../core/level.ts';
import { store } from '../app/settings.ts';
import { GameSession, type CompleteInfo, type SessionAudio } from '../game/session.ts';
import { buildSkin, destroySkin } from '../game/skin.ts';
import type { PlayerSkin } from '../render/view.ts';
import { button, h } from './dom.ts';
import { ICONS } from './svgIcons.ts';

export interface GameScreenOptions {
  level: LevelJSON;
  practice?: boolean;
  startX?: number;
  replay?: readonly number[];
  audio?: SessionAudio;
  /** Called when the player leaves (quit, or after completing). */
  onExit: (result: { completed: boolean; info?: CompleteInfo }) => void;
  onDeath?: (percent: number, practice: boolean) => void;
  onComplete?: (info: CompleteInfo) => void;
  /** A new attempt began (fires for the first one too). */
  onAttempt?: (attempt: number, practice: boolean) => void;
  openSettings?: (onClose: () => void) => void;
  /** Editor playtest: Escape returns instead of pausing. */
  playtest?: boolean;
  bestNormal?: () => number;
  bestPractice?: () => number;
}

export class GameScreen implements Screen {
  readonly root = new Container();
  readonly session: GameSession;
  private readonly app: App;
  private readonly opts: GameScreenOptions;
  private readonly skin: PlayerSkin;
  private readonly hud: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly practiceBar: HTMLElement;
  private readonly practiceTag: HTMLElement;
  private overlay: HTMLElement | null = null;
  private started = false;
  private unsub: () => void;

  constructor(app: App, opts: GameScreenOptions) {
    this.app = app;
    this.opts = opts;
    const st = store.settings;
    this.skin = buildSkin(store.icons);
    this.session = new GameSession({
      level: opts.level,
      renderer: app.pixi.renderer,
      bank: app.bank,
      skin: this.skin,
      audio: opts.audio,
      practice: opts.practice,
      startX: opts.startX,
      replay: opts.replay,
      hitboxes: st.hitboxes,
      glow: st.glow,
      reducedParticles: st.reducedParticles,
      onDeath: (p, practice) => opts.onDeath?.(p, practice),
      onComplete: (info) => this.onComplete(info),
      onAttempt: (n) => opts.onAttempt?.(n, this.session.practice),
    });
    this.root.addChild(this.session.view.root);

    this.fill = h('div.fill');
    this.pct = h('div.percent.outlined', '0%');
    this.fps = h('div.fps.outlined', '');
    this.practiceTag = h('div.practice-tag.outlined', 'PRACTICE');
    this.practiceBar = h(
      'div.practice-bar',
      button(h('span', { title: 'Place checkpoint (Z)' }, svg(ICONS.flag)), () => this.session.placeCheckpoint(), 'icon green'),
      button(h('span', { title: 'Remove checkpoint (X)' }, svg(ICONS.unflag)), () => this.session.removeCheckpoint(), 'icon red'),
    );
    this.hud = h(
      'div.hud',
      h('div.progress', this.fill),
      this.pct,
      this.fps,
      this.practiceTag,
      this.practiceBar,
      button(svg(ICONS.pause), () => this.togglePause(), 'icon small pause-btn gray'),
    );
    this.hud.dataset.testid = 'hud';
    app.ui.appendChild(this.hud);
    this.applySettings();
    this.unsub = store.onChange(() => this.applySettings());
  }

  private applySettings(): void {
    const st = store.settings;
    this.pct.style.display = st.showPercent ? '' : 'none';
    this.fps.style.display = st.showFps ? '' : 'none';
    this.session.view.opts.hitboxes = st.hitboxes;
    this.session.view.opts.reducedParticles = st.reducedParticles;
    this.practiceBar.style.display = this.session.practice ? '' : 'none';
    this.practiceTag.style.display = this.session.practice ? '' : 'none';
    this.session.view.setAttempt(st.showAttempts ? this.session.attempts : 0, this.session.world.startX);
  }

  resize(w: number, h: number): void {
    this.session.view.resize(w, h);
  }

  frame(now: number, dt: number): void {
    if (!this.started) {
      this.started = true;
      this.session.start(now, this.app.input.held);
      this.applySettings();
    }
    this.session.frame(now, dt);
    const p = this.session.percent;
    this.fill.style.width = `${p.toFixed(2)}%`;
    this.pct.textContent = `${Math.floor(p)}%`;
    if (store.settings.showFps) this.fps.textContent = `${Math.round(this.app.fps)} FPS · ${this.app.frameStats().avg.toFixed(1)} ms`;
  }

  onAction(down: boolean, ts: number): void {
    if (this.overlay) return;
    this.session.action(down, ts);
  }

  onKey(code: string): void {
    if (code === 'Escape' || code === 'KeyP') {
      if (this.opts.playtest && code === 'Escape') {
        this.exit(false);
        return;
      }
      this.togglePause();
      return;
    }
    if (this.overlay) return;
    if (code === 'KeyZ') this.session.placeCheckpoint();
    else if (code === 'KeyX') this.session.removeCheckpoint();
    else if (code === 'KeyR') this.session.restart(performance.now());
  }

  onBlur(now: number): void {
    if (this.session.phase === 'playing' || this.session.phase === 'dead') {
      if (!this.overlay) this.openPause(now);
    }
  }

  private togglePause(): void {
    const now = performance.now();
    if (this.overlay && this.session.phase === 'paused') this.closePause(now);
    else if (!this.overlay) this.openPause(now);
  }

  private openPause(now: number): void {
    if (this.session.phase === 'complete') return;
    this.session.pause(now);
    const lvl = this.opts.level.meta;
    const bests = h('div.bests');
    if (this.opts.bestNormal) {
      const n = this.opts.bestNormal();
      const pr = this.opts.bestPractice?.() ?? 0;
      bests.append(
        h('div', h('div.bar', h('i', { style: `width:${n}%` }), h('span', `Normal ${Math.floor(n)}%`))),
        h('div', h('div.bar.practice', h('i', { style: `width:${pr}%` }), h('span', `Practice ${Math.floor(pr)}%`))),
      );
    }
    const practiceLabel = this.session.practice ? 'Normal mode' : 'Practice mode';
    const menu = h(
      'div.panel.pause-menu.pop',
      h('h2.outlined', 'Paused'),
      h('div.level-name.outlined', lvl.name),
      bests,
      h(
        'div.row',
        button('Resume', () => this.closePause(performance.now()), 'green'),
        button('Restart', () => {
          this.closeOverlay();
          this.session.resume(performance.now(), false);
          this.session.restart(performance.now());
        }, 'blue'),
      ),
      h(
        'div.row',
        this.opts.playtest ? null : button(practiceLabel, () => {
          this.closeOverlay();
          this.session.resume(performance.now(), false);
          this.session.setPractice(!this.session.practice, performance.now());
          this.applySettings();
        }, 'pink small'),
        this.opts.openSettings ? button('Settings', () => {
          this.overlay?.remove();
          this.opts.openSettings!(() => {
            this.overlay = null;
            this.openPause(performance.now());
          });
        }, 'gray small') : null,
        button(this.opts.playtest ? 'Back to editor' : 'Quit', () => this.exit(false), 'red small'),
      ),
    );
    this.overlay = h('div.overlay', menu);
    this.overlay.dataset.testid = 'pause-menu';
    this.overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.app.ui.appendChild(this.overlay);
  }

  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private closePause(now: number): void {
    this.closeOverlay();
    this.session.resume(now, this.app.input.held);
  }

  private onComplete(info: CompleteInfo): void {
    this.opts.onComplete?.(info);
    // stats appear after the celebration burst
    window.setTimeout(() => this.showComplete(info), 1100);
  }

  private showComplete(info: CompleteInfo): void {
    if (this.overlay) this.closeOverlay();
    const coinTotal = this.session.world.coins.length;
    const coins = h('div.coins');
    for (let i = 0; i < coinTotal; i++) {
      const got = (info.coins & (1 << i)) !== 0;
      coins.append(h('div.coin-slot', { style: got ? '' : 'opacity:0.25;filter:grayscale(1)' }, svg(ICONS.coin)));
    }
    const secs = info.time;
    const mm = Math.floor(secs / 60);
    const ss = (secs % 60).toFixed(1).padStart(4, '0');
    const panel = h(
      'div.panel.complete.pop',
      h('h1.outlined', info.practice ? 'Practice Complete!' : 'Level Complete!'),
      h(
        'div.stats.outlined',
        h('span', 'Attempts'), h('span', String(info.attempts)),
        h('span', 'Time'), h('span', `${mm}:${ss}`),
        coinTotal ? h('span', 'Coins') : null, coinTotal ? h('span', `${countBits(info.coins)} / ${coinTotal}`) : null,
      ),
      coinTotal ? coins : null,
      h('div.row', button(this.opts.playtest ? 'Back to editor' : 'Back to menu', () => this.exit(true, info), 'green'), this.opts.playtest ? null : button('Replay', () => {
        this.closeOverlay();
        this.session.restart(performance.now());
      }, 'blue')),
    );
    this.overlay = h('div.overlay', panel);
    this.overlay.dataset.testid = 'level-complete';
    this.overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.app.ui.appendChild(this.overlay);
  }

  private exit(completed: boolean, info?: CompleteInfo): void {
    this.opts.audio?.stopMusic(0.2);
    this.opts.onExit({ completed, info });
  }

  destroy(): void {
    this.unsub();
    this.closeOverlay();
    this.hud.remove();
    this.session.destroy();
    destroySkin(this.skin);
  }
}

function countBits(n: number): number {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

export function svg(markup: string): SVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild as SVGElement;
}
