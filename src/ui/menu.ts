import { Container } from 'pixi.js';
import type { App, Screen } from '../app/app.ts';
import { audio } from '../app/audio.ts';
import { deleteCustomLevel, listCustomLevels, loadCustomLevel } from '../app/levelStore.ts';
import { getProgress, totalStars } from '../app/progress.ts';
import { store } from '../app/settings.ts';
import { GAME_TITLE } from '../config.ts';
import { colorDefHex, DIFFICULTY_NAMES, type LevelJSON, parseLevel } from '../core/level.ts';
import { MODE_KEYS, MODE_NAMES, type ModeKey } from '../core/objects.ts';
import { compileWorld } from '../core/sim/world.ts';
import { menuLevel } from '../game/menuLevel.ts';
import { GameSession } from '../game/session.ts';
import { buildSkin, destroySkin } from '../game/skin.ts';
import { LEVELS } from '../levels/index.ts';
import { faceUrl } from '../render/faces.ts';
import { ICON_SETS, renderIcon } from '../render/icons.ts';
import type { PlayerSkin } from '../render/view.ts';
import { button, clear, h } from './dom.ts';
import { svg } from './gameScreen.ts';
import { openSettings, toggleFullscreen } from './settings.ts';
import { ICONS } from './svgIcons.ts';

export type MenuPage = 'main' | 'select' | 'icons' | 'create';

export interface PlayableLevel {
  id: string;
  level: LevelJSON;
  custom: boolean;
}

export interface MenuOptions {
  page?: MenuPage;
  focus?: string;
  onPlay: (entry: PlayableLevel, from: MenuPage) => void;
  onEdit: (level: LevelJSON | null) => void;
}

const PRIMARY = ['#3dff8b', '#38d4ff', '#ffe14d', '#ff5fd2', '#ff7a3d', '#b06cff', '#ffffff', '#ff3b5c', '#2bd6c4', '#9dff3d', '#5c7aff', '#1a1a2e'];

export function shippedLevels(): PlayableLevel[] {
  return LEVELS.filter((l) => !l.test).map((l) => ({ id: l.level.meta.id ?? l.id, level: l.level, custom: false }));
}

export function customLevels(): PlayableLevel[] {
  return listCustomLevels()
    .map((info) => ({ info, level: loadCustomLevel(info.id) }))
    .filter((x): x is { info: typeof x.info; level: LevelJSON } => !!x.level)
    .map(({ info, level }) => ({ id: info.id, level, custom: true }));
}

export class MenuScreen implements Screen {
  readonly root = new Container();
  private readonly app: App;
  private readonly opts: MenuOptions;
  private readonly session: GameSession;
  private skin: PlayerSkin;
  private readonly el: HTMLElement;
  private page: MenuPage = 'main';
  private overlay: HTMLElement | null = null;
  private carouselIndex = 0;
  private levels: PlayableLevel[] = [];
  private iconMode: ModeKey = 'cube';
  private onKeyPage: ((code: string) => void) | null = null;
  private readonly unsub: () => void;
  private readonly cleanups: Array<() => void> = [];

  constructor(app: App, opts: MenuOptions) {
    this.app = app;
    this.opts = opts;
    this.skin = buildSkin(store.icons, 96);
    const { level, replay } = menuLevel();
    this.session = new GameSession({
      level,
      renderer: app.pixi.renderer,
      bank: app.bank,
      skin: this.skin,
      replay,
      glow: store.settings.glow,
      reducedParticles: store.settings.reducedParticles,
      respawnDelay: 0.2,
    });
    this.session.view.setAttempt(0, 0);
    this.root.addChild(this.session.view.root);
    this.el = h('div.menu');
    this.el.dataset.testid = 'menu';
    app.ui.appendChild(this.el);
    if (audio.playingId !== 'menu') {
      if (audio.get('menu')?.buffer) audio.play('menu', 0, { loop: true, fadeIn: 0.8 });
      else void audio.load('menu').then(() => {
        if (this.app.current === this && audio.playingId !== 'menu') audio.play('menu', 0, { loop: true, fadeIn: 0.8 });
      });
    }
    this.unsub = store.onChange(() => this.refreshSkin());
    this.show(opts.page ?? 'main', opts.focus);
  }

  private started = false;

  resize(w: number, hgt: number): void {
    this.session.view.resize(w, hgt);
  }

  frame(now: number, dt: number): void {
    if (!this.started) {
      this.started = true;
      this.session.start(now, false);
      this.session.view.setAttempt(0, 0);
    }
    if (this.session.phase === 'complete') {
      this.session.restart(now);
      this.session.view.setAttempt(0, 0);
    }
    this.session.frame(now, dt);
  }

  private refreshSkin(): void {
    const old = this.skin;
    this.skin = buildSkin(store.icons, 96);
    this.session.view.setSkin(this.skin);
    (this.session.opts as { skin: PlayerSkin }).skin = this.skin;
    destroySkin(old);
  }

  onKey(code: string): void {
    if (this.overlay) return;
    if (code === 'Escape' && this.page !== 'main') {
      this.show('main');
      return;
    }
    this.onKeyPage?.(code);
  }

  // ------------------------------------------------------------ pages

  show(page: MenuPage, focus?: string): void {
    this.page = page;
    this.onKeyPage = null;
    for (const off of this.cleanups.splice(0)) off();
    clear(this.el);
    this.el.className = `menu menu-${page}`;
    if (page === 'main') this.mainPage();
    else if (page === 'select') this.selectPage(focus);
    else if (page === 'icons') this.iconPage();
    else this.createPage();
  }

  private topBar(back: boolean): HTMLElement {
    return h(
      'div.menu-top',
      back ? button(svg(ICONS.back), () => this.show('main'), 'icon small red menu-back') : h('div'),
      h(
        'div.menu-top-right',
        button(svg(ICONS.fullscreen), toggleFullscreen, 'icon small gray'),
        button(svg(ICONS.gear), () => this.openSettings(), 'icon small gray'),
      ),
    );
  }

  private openSettings(): void {
    this.overlay = openSettings(this.app.ui, () => (this.overlay = null));
  }

  private mainPage(): void {
    const stars = totalStars();
    const title = h('div.title');
    for (const [i, ch] of [...GAME_TITLE].entries()) {
      const c = ch === ' ' ? '\u00a0' : ch;
      title.append(h('span.title-ch', { style: `--i:${i}`, 'data-ch': c }, c));
    }
    const play = button(svg(ICONS.play), () => this.show('select'), 'play-btn');
    play.dataset.testid = 'play';
    this.el.append(
      this.topBar(false),
      title,
      h(
        'div.menu-main-row',
        h('div.menu-side', button(svg(ICONS.palette), () => this.show('icons'), 'icon big-icon pink'), h('div.menu-cap.outlined', 'Icons')),
        play,
        h('div.menu-side', button(svg(ICONS.build), () => this.show('create'), 'icon big-icon blue'), h('div.menu-cap.outlined', 'Create')),
      ),
      h('div.menu-stats.outlined', `${stars.completed}/8 levels  ·  ${stars.coins}/24 coins`),
    );
    this.onKeyPage = (code) => {
      if (code === 'Enter' || code === 'Space') this.show('select');
    };
  }

  // ------------------------------------------------------------ level select

  private selectPage(focus?: string): void {
    this.levels = [...shippedLevels(), ...customLevels()];
    const idx = focus ? this.levels.findIndex((l) => l.id === focus) : -1;
    if (idx >= 0) this.carouselIndex = idx;
    this.carouselIndex = Math.max(0, Math.min(this.levels.length - 1, this.carouselIndex));
    const track = h('div.carousel-track');
    this.levels.forEach((entry, i) => track.append(this.card(entry, i)));
    const dots = h('div.carousel-dots');
    this.levels.forEach((_, i) => {
      const d = h('button.dot', { type: 'button', 'aria-label': `Level ${i + 1}` });
      d.addEventListener('click', () => this.goTo(i));
      dots.append(d);
    });
    const carousel = h('div.carousel.interactive', track);
    const prev = button(svg(ICONS.back), () => this.goTo(this.carouselIndex - 1), 'icon arrow-btn gray');
    const next = button(svg(ICONS.next), () => this.goTo(this.carouselIndex + 1), 'icon arrow-btn gray');
    this.el.append(this.topBar(true), h('div.select-row', prev, carousel, next), dots);
    // swipe
    let sx = 0;
    let dragging = false;
    let moved = 0;
    carousel.addEventListener('pointerdown', (e) => {
      dragging = true;
      sx = e.clientX;
      moved = 0;
      track.style.transition = 'none';
    });
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      moved = e.clientX - sx;
      const scale = this.app.letterbox.rect.uiScale;
      track.style.transform = `translateX(${-this.carouselIndex * CARD_STEP + moved / scale}px)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      track.style.transition = '';
      const scale = this.app.letterbox.rect.uiScale;
      const d = moved / scale;
      if (Math.abs(d) > 60) this.goTo(this.carouselIndex + (d < 0 ? 1 : -1));
      else this.goTo(this.carouselIndex);
      this.suppressClick = Math.abs(d) > 8;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    this.cleanups.push(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    });
    this.onKeyPage = (code) => {
      if (code === 'ArrowLeft' || code === 'KeyA') this.goTo(this.carouselIndex - 1);
      else if (code === 'ArrowRight' || code === 'KeyD') this.goTo(this.carouselIndex + 1);
      else if (code === 'Enter' || code === 'Space') this.playIndex(this.carouselIndex);
    };
    this.goTo(this.carouselIndex, true);
  }

  private suppressClick = false;

  private card(entry: PlayableLevel, i: number): HTMLElement {
    const m = entry.level.meta;
    const p = getProgress(entry.id);
    const world = compileWorld(entry.level);
    const coinCount = world.coins.length;
    const bg = colorDefHex(m.colors.bg);
    const coins = h('div.card-coins');
    for (let k = 0; k < coinCount; k++) {
      const got = (p.coins & (1 << k)) !== 0;
      coins.append(h('span.card-coin', { class: got ? 'card-coin got' : 'card-coin' }, svg(ICONS.coin)));
    }
    const bar = (v: number, cls: string, label: string) => h(`div.bar.${cls}`, h('i', { style: `width:${v}%` }), h('span', `${label} ${Math.floor(v)}%`));
    const card = h(
      'div.level-card',
      { style: `--card:${bg}` },
      h('div.card-num.outlined', entry.custom ? 'Created' : `${i + 1} / 8`),
      h('img.card-face', { src: faceUrl(m.difficulty, 128), alt: DIFFICULTY_NAMES[m.difficulty], draggable: 'false' }),
      h('div.card-name.outlined', m.name),
      h('div.card-diff.outlined', entry.custom ? `by ${m.author || 'you'}` : DIFFICULTY_NAMES[m.difficulty]),
      h('div.card-bars', bar(p.normal, 'normal', 'Normal'), bar(p.practice, 'practice', 'Practice')),
      coins,
    );
    card.dataset.testid = `level-card-${entry.id}`;
    card.addEventListener('click', () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      if (i === this.carouselIndex) this.playIndex(i);
      else this.goTo(i);
    });
    return card;
  }

  private goTo(i: number, instant = false): void {
    const n = this.levels.length;
    if (!n) return;
    this.carouselIndex = Math.max(0, Math.min(n - 1, i));
    const track = this.el.querySelector('.carousel-track') as HTMLElement | null;
    if (!track) return;
    if (instant) track.style.transition = 'none';
    track.style.transform = `translateX(${-this.carouselIndex * CARD_STEP}px)`;
    if (instant) {
      void track.offsetWidth;
      track.style.transition = '';
    }
    track.querySelectorAll('.level-card').forEach((c, k) => c.classList.toggle('active', k === this.carouselIndex));
    this.el.querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('active', k === this.carouselIndex));
    // warm up the focused level's music so starting is instant
    const song = this.levels[this.carouselIndex]!.level.meta.song;
    void audio.load(song);
  }

  private playIndex(i: number): void {
    const entry = this.levels[i];
    if (entry) this.opts.onPlay(entry, this.page);
  }

  // ------------------------------------------------------------ icons

  private iconPage(): void {
    const choice = store.icons;
    const preview = h('div.kit-preview');
    const modeTabs = h('div.kit-modes');
    const grid = h('div.kit-grid');
    const draw = () => {
      const c = store.icons;
      clear(preview);
      preview.append(renderIcon(this.iconMode, c.designs[this.iconMode], { p1: c.p1, p2: c.p2 }, 150, 0, 0.1));
      preview.classList.toggle('glow', c.glow);
      clear(modeTabs);
      for (const [mi, mode] of MODE_KEYS.entries()) {
        const b = h('button.kit-mode', { type: 'button', title: MODE_NAMES[mi] }, renderIcon(mode, c.designs[mode], { p1: c.p1, p2: c.p2 }, 40, 0, 0.06));
        b.classList.toggle('active', mode === this.iconMode);
        b.addEventListener('click', () => {
          this.iconMode = mode;
          draw();
        });
        modeTabs.append(b);
      }
      clear(grid);
      ICON_SETS[this.iconMode].forEach((d, k) => {
        const b = h('button.kit-icon', { type: 'button', title: d.name }, renderIcon(this.iconMode, k, { p1: c.p1, p2: c.p2 }, 64, 0, 0.08));
        b.classList.toggle('active', k === c.designs[this.iconMode]);
        b.addEventListener('click', () => {
          store.updateIcons({ designs: { ...store.icons.designs, [this.iconMode]: k } });
          draw();
        });
        grid.append(b);
      });
    };
    const swatches = (key: 'p1' | 'p2') => {
      const row = h('div.kit-swatches');
      for (const col of PRIMARY) {
        const s = h('button.swatch', { type: 'button', style: `background:${col}`, 'aria-label': col });
        s.addEventListener('click', () => {
          store.updateIcons({ [key]: col });
          draw();
          refreshSw();
        });
        row.append(s);
      }
      const custom = h('input.swatch-custom', { type: 'color', value: choice[key], 'aria-label': 'Custom color' });
      custom.addEventListener('input', () => {
        store.updateIcons({ [key]: custom.value });
        draw();
        refreshSw();
      });
      row.append(custom);
      return row;
    };
    const p1Row = swatches('p1');
    const p2Row = swatches('p2');
    const refreshSw = () => {
      for (const [row, key] of [[p1Row, 'p1'], [p2Row, 'p2']] as const) {
        row.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', (s as HTMLElement).getAttribute('aria-label') === store.icons[key]));
      }
    };
    const glow = h('input', { type: 'checkbox', checked: choice.glow });
    glow.addEventListener('change', () => {
      store.updateIcons({ glow: glow.checked });
      draw();
    });
    this.el.append(
      this.topBar(true),
      h(
        'div.kit',
        h('div.kit-left.panel', preview, h('label.set-row.set-toggle', h('span.set-label', 'Glow'), h('span.switch', glow, h('i'))), h('div.kit-hint', 'Your icons are used in every level.')),
        h('div.kit-right.panel', modeTabs, grid, h('div.kit-sub.outlined', 'Primary'), p1Row, h('div.kit-sub.outlined', 'Secondary'), p2Row),
      ),
    );
    draw();
    refreshSw();
  }

  // ------------------------------------------------------------ created levels

  private createPage(): void {
    const list = h('div.create-list');
    const render = () => {
      clear(list);
      const items = listCustomLevels();
      if (!items.length) list.append(h('div.create-empty.outlined', 'No saved levels yet. Make your first one!'));
      for (const info of items) {
        const row = h(
          'div.create-row',
          h('div.create-name.outlined', info.name),
          h('div.create-meta', `${info.objects} objects · ${new Date(info.updated).toLocaleDateString()}`),
          button('Edit', () => this.opts.onEdit(loadCustomLevel(info.id)), 'small blue'),
          button('Play', () => {
            const level = loadCustomLevel(info.id);
            if (level) this.opts.onPlay({ id: info.id, level, custom: true }, this.page);
          }, 'small green'),
          button(svg(ICONS.trash), () => {
            if (row.classList.contains('confirm')) {
              deleteCustomLevel(info.id);
              render();
            } else {
              row.classList.add('confirm');
              setTimeout(() => row.classList.remove('confirm'), 3000);
            }
          }, 'icon small red'),
        );
        list.append(row);
      }
    };
    render();
    const importBtn = button('Import JSON', () => {
      const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        input.remove();
        if (!f) return;
        try {
          this.opts.onEdit(parseLevel(await f.text()));
        } catch (e) {
          alert(`That file is not a valid level: ${(e as Error).message}`);
        }
      });
      document.body.appendChild(input);
      input.click();
    }, 'small gray');
    this.el.append(
      this.topBar(true),
      h('div.create.panel', h('h2.outlined', 'Created levels'), h('div.row', button('New level', () => this.opts.onEdit(null), 'green'), importBtn), list),
    );
  }

  destroy(): void {
    this.unsub();
    for (const off of this.cleanups.splice(0)) off();
    this.overlay?.remove();
    this.el.remove();
    this.session.destroy();
    destroySkin(this.skin);
  }
}

const CARD_STEP = 420;
