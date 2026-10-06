import { Container, Graphics, Sprite } from 'pixi.js';
import type { App, Screen } from '../app/app.ts';
import { audio } from '../app/audio.ts';
import { saveCustomLevel } from '../app/levelStore.ts';
import { blobPut } from '../app/storage.ts';
import { detectBeats } from '../core/audio/beats.ts';
import { SONGS } from '../core/audio/songs.ts';
import { EASING_NAMES, type EasingId } from '../core/dmath.ts';
import {
  colorDefHex, DIFFICULTIES, DIFFICULTY_NAMES, type LevelJSON, type LevelObject, type ObjExtra, parseLevel, serializeLevel,
} from '../core/level.ts';
import {
  CATEGORY_LABELS, type Category, channelName, getDef, Kind, MODE_KEYS, MODE_NAMES, OBJECT_DEFS, PortalType, TriggerType,
} from '../core/objects.ts';
import { BLOCK } from '../core/physics.ts';
import { initialState, type SimState } from '../core/sim/state.ts';
import { chunkOf, compileWorld, timeAtX, type World, xAtTime } from '../core/sim/world.ts';
import { type CameraState, VIEW_H, VIEW_W } from '../render/camera.ts';
import { GameView } from '../render/view.ts';
import { button, clear, h } from '../ui/dom.ts';
import { svg } from '../ui/gameScreen.ts';
import { ICONS } from '../ui/svgIcons.ts';
import { EditorModel, snapCenter } from './model.ts';
import { thumbnail } from './thumbs.ts';

export interface EditorOptions {
  model: EditorModel;
  cam?: CameraState;
  onExit: () => void;
  onPlaytest: (level: LevelJSON, startX: number | null, cam: CameraState) => void;
}

type Tool = 'build' | 'edit' | 'erase';

const TIMELINE = 46;
const BOTTOM = 190;
const CATS: Category[] = ['block', 'slope', 'hazard', 'portal', 'orb', 'pad', 'coin', 'deco', 'trigger'];
const NAMED_CHANNELS = ['obj', 'fill', 'line', 'bg', 'g', 'white', 'black'];

function chanOptions(): Array<[string, string]> {
  const out: Array<[string, string]> = NAMED_CHANNELS.map((n) => [n, n]);
  for (let i = 1; i <= 24; i++) out.push([String(i), `Channel ${i}`]);
  return out;
}

export class EditorScreen implements Screen {
  readonly root = new Container();
  private readonly app: App;
  private readonly opts: EditorOptions;
  readonly model: EditorModel;
  private world: World;
  private state: SimState;
  private view: GameView;
  private readonly overlay = new Graphics();
  private readonly ghost = new Container();
  cam: CameraState;
  private compiledVersion = -1;
  private lastCompile = 0;
  private tool: Tool = 'build';
  private grid = 1;
  private cat: Category = 'block';
  private current = 1;
  private placeRot = 0;
  private placeFx = false;
  private placeFy = false;
  private hover: { x: number; y: number } | null = null;

  // pointer state
  private pan: { x: number; y: number; camX: number; camY: number } | null = null;
  private drag: { start: [number, number]; originals: Map<number, LevelObject>; dx: number; dy: number } | null = null;
  private box: { x0: number; y0: number; x1: number; y1: number; add: boolean } | null = null;
  private painting = false;
  private paintCells = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();

  // DOM
  private readonly el: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly props: HTMLElement;
  private readonly timeline: HTMLCanvasElement;
  private readonly nameLabel: HTMLElement;
  private readonly toolButtons: Record<Tool, HTMLButtonElement>;
  private readonly gridBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly toastEl: HTMLElement;
  private dialog: HTMLElement | null = null;
  private propsVersion = -1;
  private readonly cleanup: Array<() => void> = [];
  private peaks: { data: Float32Array; rate: number; song: string } | null = null;

  constructor(app: App, opts: EditorOptions) {
    this.app = app;
    this.opts = opts;
    this.model = opts.model;
    this.world = compileWorld(this.model.toLevel());
    this.state = initialState(this.world);
    this.view = new GameView(app.pixi.renderer, app.bank, this.world, { showTriggers: true, hitboxes: false, glow: true, reducedParticles: false, editor: true });
    this.view.overlay.addChild(this.overlay, this.ghost);
    this.ghost.alpha = 0.5;
    this.root.addChild(this.view.root);
    this.cam = opts.cam ?? { x: -4 * BLOCK, y: -((BOTTOM + TIMELINE) / 720) * VIEW_H - BLOCK, zoom: 1, shakeX: 0, shakeY: 0 };

    // ---------------- DOM
    this.nameLabel = h('button.ed-name', { type: 'button', title: 'Level settings' }, '');
    this.nameLabel.addEventListener('click', () => this.openSettings());
    const toolBtn = (t: Tool, label: string, icon: string) => {
      const b = button(h('span.ed-tool', svg(icon), label), () => this.setTool(t), 'small gray');
      b.dataset.tool = t;
      return b;
    };
    this.toolButtons = { build: toolBtn('build', 'Build', ICONS.plus), edit: toolBtn('edit', 'Edit', ICONS.select), erase: toolBtn('erase', 'Erase', ICONS.trash) };
    this.undoBtn = button(svg(ICONS.undo), () => this.model.undo(), 'icon small gray');
    this.redoBtn = button(svg(ICONS.redo), () => this.model.redo(), 'icon small gray');
    this.gridBtn = button('Grid 1', () => {
      this.grid = this.grid === 1 ? 0.5 : 1;
      this.gridBtn.textContent = this.grid === 1 ? 'Grid 1' : 'Grid ½';
    }, 'small gray');
    const top = h(
      'div.ed-top',
      button(svg(ICONS.back), () => this.exit(), 'icon small red'),
      this.nameLabel,
      h('div.ed-sep'),
      this.undoBtn,
      this.redoBtn,
      this.gridBtn,
      h('div.ed-sep'),
      this.toolButtons.build,
      this.toolButtons.edit,
      this.toolButtons.erase,
      h('div.ed-grow'),
      button(h('span.ed-tool', svg(ICONS.play), 'Start'), () => this.playtest(null), 'small green'),
      button(h('span.ed-tool', svg(ICONS.play), 'Here'), () => this.playtest(this.playheadX()), 'small green'),
      button(svg(ICONS.save), () => this.save(), 'icon small blue'),
      button(svg(ICONS.download), () => this.exportJson(), 'icon small blue'),
      button(svg(ICONS.upload), () => this.importJson(), 'icon small blue'),
      button(svg(ICONS.gear), () => this.openSettings(), 'icon small gray'),
    );
    this.tabs = h('div.ed-tabs');
    for (const c of CATS) {
      const t = h('button.ed-tab', { type: 'button' }, CATEGORY_LABELS[c]);
      t.dataset.cat = c;
      t.addEventListener('click', () => {
        this.cat = c;
        this.renderPalette();
        if (this.tool !== 'build') this.setTool('build');
      });
      this.tabs.append(t);
    }
    this.palette = h('div.ed-palette');
    const actions = h(
      'div.ed-actions',
      button(svg(ICONS.rotate), () => this.rotate(1), 'icon small gray'),
      button(h('span', { style: 'display:inline-block;transform:scaleX(-1)' }, svg(ICONS.rotate)), () => this.rotate(-1), 'icon small gray'),
      button(svg(ICONS.flipH), () => this.flip('x'), 'icon small gray'),
      button(svg(ICONS.flipV), () => this.flip('y'), 'icon small gray'),
      button(svg(ICONS.copy), () => this.model.copy(), 'icon small gray'),
      button(svg(ICONS.paste), () => this.paste(), 'icon small gray'),
      button(h('span.ed-dup', '×2'), () => this.model.duplicate(), 'icon small gray'),
      button(svg(ICONS.trash), () => this.model.remove([...this.model.selection]), 'icon small red'),
    );
    this.timeline = h('canvas.ed-timeline', { width: 1280, height: TIMELINE });
    this.timeline.addEventListener('pointerdown', (e) => this.timelineClick(e));
    this.props = h('div.ed-props');
    this.toastEl = h('div.ed-toast');
    const bottom = h('div.ed-bottom', h('div.ed-left', this.tabs, this.palette), actions);
    this.el = h('div.editor', top, this.timeline, bottom, this.props, this.toastEl);
    this.el.dataset.testid = 'editor';
    for (const n of [top, bottom, this.props, this.timeline]) n.addEventListener('pointerdown', (e) => e.stopPropagation());
    app.ui.appendChild(this.el);
    this.renderPalette();
    this.setTool('build');

    // ---------------- canvas input
    const c = app.canvas;
    const down = (e: PointerEvent) => this.onPointerDown(e);
    const move = (e: PointerEvent) => this.onPointerMove(e);
    const up = (e: PointerEvent) => this.onPointerUp(e);
    const wheel = (e: WheelEvent) => this.onWheel(e);
    c.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    this.cleanup.push(() => {
      c.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
    });
    void this.loadPeaks();
  }

  // ------------------------------------------------------------ helpers

  private get scale(): number {
    return (this.app.height / VIEW_H) * this.cam.zoom;
  }

  /** Canvas-relative CSS pixel → world units. */
  private toWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.app.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    return { x: this.cam.x + px / this.scale, y: this.cam.y + (r.height - py) / this.scale };
  }

  private playheadX(): number {
    return Math.max(0, this.cam.x + (VIEW_W / this.cam.zoom) / 3);
  }

  private toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
  }

  private setTool(t: Tool): void {
    this.tool = t;
    for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', k === t);
    if (t !== 'edit') {
      this.model.selection.clear();
      this.propsVersion = -1;
    }
  }

  private renderPalette(): void {
    clear(this.palette);
    for (const t of this.tabs.children) (t as HTMLElement).classList.toggle('active', (t as HTMLElement).dataset.cat === this.cat);
    for (const def of OBJECT_DEFS) {
      if (def.cat !== this.cat) continue;
      const b = h('button.ed-obj', { type: 'button', title: def.name }, h('img', { src: thumbnail(def), alt: def.name, draggable: 'false' }));
      b.classList.toggle('active', def.id === this.current);
      b.addEventListener('click', () => {
        this.current = def.id;
        this.renderPalette();
        this.setTool('build');
      });
      this.palette.append(b);
    }
  }

  // ------------------------------------------------------------ world

  private recompile(force = false): void {
    if (!force && this.compiledVersion === this.model.version) return;
    this.world = compileWorld(this.model.toLevel());
    this.state = initialState(this.world);
    this.view.setWorld(this.world);
    this.compiledVersion = this.model.version;
    this.lastCompile = performance.now();
  }

  /** Index of the topmost object under a world point. */
  private hitTest(x: number, y: number): number {
    const w = this.world;
    let best = -1;
    let bestLayer = -99;
    const c = chunkOf(x);
    for (let cc = Math.max(0, c - 1); cc <= Math.min(w.chunkCount - 1, c + 1); cc++) {
      for (let k = w.vchunkStart[cc]!; k < w.vchunkStart[cc + 1]!; k++) this.hitOne(k, x, y, (i, layer) => {
        if (layer > bestLayer || (layer === bestLayer && i > best)) {
          best = i;
          bestLayer = layer;
        }
      });
    }
    return best;
  }

  private hitOne(k: number, x: number, y: number, cb: (i: number, layer: number) => void): void {
    const w = this.world;
    const i = w.vchunkList[k]!;
    const r = (((Math.round(w.rot[i]! / 90) % 4) + 4) % 4) & 1;
    const hw = (r ? w.vh[i]! : w.vw[i]!) + 1;
    const hh = (r ? w.vw[i]! : w.vh[i]!) + 1;
    if (Math.abs(w.x[i]! - x) <= hw && Math.abs(w.y[i]! - y) <= hh) cb(i, w.layer[i]!);
  }

  // ------------------------------------------------------------ pointer input

  private onPointerDown(e: PointerEvent): void {
    if (this.dialog) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.toWorld(e);
    if (e.button === 1 || e.button === 2 || this.pointers.size >= 2 || (e.button === 0 && e.altKey)) {
      this.pan = { x: e.clientX, y: e.clientY, camX: this.cam.x, camY: this.cam.y };
      this.painting = false;
      this.drag = null;
      this.box = null;
      return;
    }
    if (e.button !== 0) return;
    if (this.tool === 'build') {
      this.model.beginBatch();
      this.painting = true;
      this.paintCells.clear();
      this.placeAt(p.x, p.y);
    } else if (this.tool === 'erase') {
      this.model.beginBatch();
      this.painting = true;
      this.eraseAt(p.x, p.y);
    } else {
      this.recompile(true);
      const hit = this.hitTest(p.x, p.y);
      const uid = hit >= 0 ? this.model.objs[hit]?.uid : undefined;
      if (uid != null) {
        if (e.shiftKey) {
          if (this.model.selection.has(uid)) this.model.selection.delete(uid);
          else this.model.selection.add(uid);
        } else if (!this.model.selection.has(uid)) {
          this.model.selection.clear();
          this.model.selection.add(uid);
        }
        this.propsVersion = -1;
        if (this.model.selection.has(uid)) this.drag = { start: [p.x, p.y], originals: this.model.snapshot(this.model.selection), dx: 0, dy: 0 };
      } else {
        if (!e.shiftKey) this.model.selection.clear();
        this.propsVersion = -1;
        this.box = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = this.app.canvas.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const p = this.toWorld(e);
    this.hover = inside ? p : null;
    if (this.pan) {
      this.cam.x = this.pan.camX - (e.clientX - this.pan.x) / this.scale;
      this.cam.y = Math.max(-12 * BLOCK, this.pan.camY + (e.clientY - this.pan.y) / this.scale);
      return;
    }
    if (this.painting && this.tool === 'build') this.placeAt(p.x, p.y);
    else if (this.painting && this.tool === 'erase') this.eraseAt(p.x, p.y);
    else if (this.drag) {
      const g = this.grid;
      const dx = Math.round((p.x - this.drag.start[0]) / BLOCK / g) * g;
      const dy = Math.round((p.y - this.drag.start[1]) / BLOCK / g) * g;
      if (dx !== this.drag.dx || dy !== this.drag.dy) {
        this.drag.dx = dx;
        this.drag.dy = dy;
        this.model.liveMove(this.drag.originals, dx, dy);
      }
    } else if (this.box) {
      this.box.x1 = p.x;
      this.box.y1 = p.y;
    }
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pan) {
      if (this.pointers.size === 0) this.pan = null;
      return;
    }
    if (this.painting) {
      this.painting = false;
      this.model.endBatch();
    }
    if (this.drag) {
      this.model.commitLive(this.drag.originals);
      this.drag = null;
      this.propsVersion = -1;
    }
    if (this.box) {
      const b = this.box;
      const x0 = Math.min(b.x0, b.x1);
      const x1 = Math.max(b.x0, b.x1);
      const y0 = Math.min(b.y0, b.y1);
      const y1 = Math.max(b.y0, b.y1);
      this.recompile(true);
      const w = this.world;
      for (let i = 0; i < w.n; i++) {
        if (w.x[i]! >= x0 && w.x[i]! <= x1 && w.y[i]! >= y0 && w.y[i]! <= y1) this.model.selection.add(this.model.objs[i]!.uid);
      }
      this.box = null;
      this.propsVersion = -1;
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const before = this.toWorld(e);
      this.cam.zoom = Math.max(0.35, Math.min(2.5, this.cam.zoom * Math.exp(-e.deltaY * 0.0015)));
      const after = this.toWorld(e);
      this.cam.x += before.x - after.x;
      this.cam.y += before.y - after.y;
      return;
    }
    if (e.shiftKey) this.cam.y = Math.max(-12 * BLOCK, this.cam.y - e.deltaY / this.scale);
    else this.cam.x += (e.deltaY + e.deltaX) / this.scale;
  }

  private placeAt(wx: number, wy: number): void {
    const [x, y] = snapCenter(this.current, wx / BLOCK, wy / BLOCK, this.grid);
    const key = `${x},${y}`;
    if (this.paintCells.has(key)) return;
    this.paintCells.add(key);
    // don't stack identical objects in the same spot
    if (this.model.objs.some((e) => e.o[0] === this.current && e.o[1] === x && e.o[2] === y)) return;
    const ex: ObjExtra = {};
    if (this.placeRot) ex.r = this.placeRot;
    if (this.placeFx) ex.fx = 1;
    if (this.placeFy) ex.fy = 1;
    this.model.add([Object.keys(ex).length ? [this.current, x, y, ex] : [this.current, x, y]], false);
  }

  private eraseAt(wx: number, wy: number): void {
    this.recompile(true);
    const hit = this.hitTest(wx, wy);
    if (hit >= 0) this.model.remove([this.model.objs[hit]!.uid]);
  }

  private rotate(dir: 1 | -1): void {
    if (this.tool === 'edit' && this.model.selection.size) this.model.rotate([...this.model.selection], dir);
    else this.placeRot = (((this.placeRot + 90 * dir) % 360) + 360) % 360;
  }

  private flip(axis: 'x' | 'y'): void {
    if (this.tool === 'edit' && this.model.selection.size) this.model.flip([...this.model.selection], axis);
    else if (axis === 'x') this.placeFx = !this.placeFx;
    else this.placeFy = !this.placeFy;
  }

  private paste(): void {
    const at = this.hover ?? { x: this.playheadX(), y: 0 };
    this.model.paste(Math.round(at.x / BLOCK - 0.5) + 0.5, undefined);
    this.setTool('edit');
    for (const e of this.model.objs.slice(-this.model.clipboard.length)) this.model.selection.add(e.uid);
    this.propsVersion = -1;
  }

  onKey(code: string, e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (this.dialog) {
      if (code === 'Escape') this.closeDialog();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const sel = [...this.model.selection];
    const g = this.grid * (e.shiftKey ? 5 : 1);
    if (mod && code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.model.redo();
      else this.model.undo();
    } else if (mod && code === 'KeyY') {
      e.preventDefault();
      this.model.redo();
    } else if (mod && code === 'KeyC') this.model.copy();
    else if (mod && code === 'KeyV') this.paste();
    else if (mod && code === 'KeyD') {
      e.preventDefault();
      this.model.duplicate();
    } else if (mod && code === 'KeyS') {
      e.preventDefault();
      this.save();
    } else if (mod && code === 'KeyA') {
      e.preventDefault();
      this.setTool('edit');
      for (const o of this.model.objs) this.model.selection.add(o.uid);
      this.propsVersion = -1;
    } else if (code === 'Delete' || code === 'Backspace') this.model.remove(sel);
    else if (code === 'Escape') {
      this.model.selection.clear();
      this.propsVersion = -1;
    } else if (code === 'Digit1') this.setTool('build');
    else if (code === 'Digit2') this.setTool('edit');
    else if (code === 'Digit3') this.setTool('erase');
    else if (code === 'KeyR') this.rotate(e.shiftKey ? -1 : 1);
    else if (code === 'KeyF') this.flip(e.shiftKey ? 'y' : 'x');
    else if (code === 'KeyG') this.gridBtn.click();
    else if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
      e.preventDefault();
      const dx = code === 'ArrowLeft' ? -g : code === 'ArrowRight' ? g : 0;
      const dy = code === 'ArrowDown' ? -g : code === 'ArrowUp' ? g : 0;
      if (sel.length) this.model.move(sel, dx, dy);
      else {
        this.cam.x += dx * BLOCK * 2;
        this.cam.y = Math.max(-12 * BLOCK, this.cam.y + dy * BLOCK * 2);
      }
    }
  }

  onAction(): void {
    /* the jump button does nothing in the editor */
  }

  // ------------------------------------------------------------ frame

  resize(w: number, hgt: number): void {
    this.view.resize(w, hgt);
  }

  frame(now: number): void {
    if (this.model.version !== this.compiledVersion && (now - this.lastCompile > 33 || !this.drag)) this.recompile();
    this.view.render({ state: this.state, prev: null, alpha: 1, dt: 0, time: now / 1000, cam: this.cam, beat: 0, mirror: 1 });
    this.drawOverlay();
    this.drawTimeline();
    this.undoBtn.disabled = !this.model.canUndo;
    this.redoBtn.disabled = !this.model.canRedo;
    const name = `${this.model.meta.name}${this.model.dirty ? ' •' : ''}`;
    if (this.nameLabel.textContent !== name) this.nameLabel.textContent = name;
    if (this.propsVersion !== this.model.version) this.renderProps();
  }

  private beatXs(x0: number, x1: number): Array<{ x: number; bar: boolean }> {
    const m = this.model.meta;
    const spb = 60 / m.bpm;
    const t0 = timeAtX(this.world, Math.max(0, x0));
    const t1 = timeAtX(this.world, Math.max(0, x1));
    const out: Array<{ x: number; bar: boolean }> = [];
    // song time = offset + level time; beats at beatOffset + k*spb
    const k0 = Math.ceil((m.offset + t0 - m.beatOffset) / spb);
    const k1 = Math.floor((m.offset + t1 - m.beatOffset) / spb);
    for (let k = Math.max(0, k0); k <= k1 && out.length < 400; k++) {
      const lt = m.beatOffset + k * spb - m.offset;
      if (lt < 0) continue;
      out.push({ x: xAtTime(this.world, lt), bar: k % 4 === 0 });
    }
    return out;
  }

  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    const s = this.scale;
    const viewW = this.app.width / s;
    const viewH = this.app.height / s;
    const x0 = this.cam.x;
    const x1 = this.cam.x + viewW;
    const y0 = Math.max(0, this.cam.y);
    const y1 = this.cam.y + viewH;
    const step = this.grid * BLOCK;
    // grid
    if (this.cam.zoom > 0.5) {
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
        const major = Math.abs(x % BLOCK) < 0.01;
        g.moveTo(x, -y0).lineTo(x, -y1).stroke({ width: 1 / s, color: 0xffffff, alpha: major ? 0.16 : 0.07 });
      }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
        const major = Math.abs(y % BLOCK) < 0.01;
        g.moveTo(x0, -y).lineTo(x1, -y).stroke({ width: 1 / s, color: 0xffffff, alpha: major ? 0.16 : 0.07 });
      }
    }
    // beat guides
    for (const b of this.beatXs(x0, x1)) {
      g.moveTo(b.x, -y0).lineTo(b.x, -y1).stroke({ width: (b.bar ? 2.5 : 1.2) / s, color: b.bar ? 0xffe14d : 0x7ef7ff, alpha: b.bar ? 0.5 : 0.28 });
    }
    // level end
    g.moveTo(this.world.endX, -y0).lineTo(this.world.endX, -y1).stroke({ width: 3 / s, color: 0xff4fd8, alpha: 0.8 });
    // playhead (play-from-here)
    const ph = this.playheadX();
    g.moveTo(ph, -y0).lineTo(ph, -y1).stroke({ width: 2 / s, color: 0x5cff7a, alpha: 0.7 });
    // selection boxes
    const w = this.world;
    const sel = this.model.selection;
    if (sel.size) {
      for (let i = 0; i < w.n; i++) {
        const uid = this.model.objs[i]?.uid;
        if (uid == null || !sel.has(uid)) continue;
        const x = w.x[i]!;
        if (x < x0 - 100 || x > x1 + 100) continue;
        const r = (((Math.round(w.rot[i]! / 90) % 4) + 4) % 4) & 1;
        const hw = (r ? w.vh[i]! : w.vw[i]!) + 1.5;
        const hh = (r ? w.vw[i]! : w.vh[i]!) + 1.5;
        g.rect(x - hw, -(w.y[i]! + hh), hw * 2, hh * 2).stroke({ width: 2 / s, color: 0x3df2ff, alpha: 0.95 });
      }
    }
    if (this.box) {
      const b = this.box;
      g.rect(Math.min(b.x0, b.x1), -Math.max(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)).fill({ color: 0x3df2ff, alpha: 0.12 }).stroke({ width: 1.5 / s, color: 0x3df2ff });
    }
    this.updateGhost();
  }

  private updateGhost(): void {
    const show = this.tool === 'build' && !!this.hover && !this.pan && !this.dialog;
    this.ghost.visible = show;
    if (!show || !this.hover) return;
    const def = getDef(this.current);
    if (!def) return;
    const [x, y] = snapCenter(this.current, this.hover.x / BLOCK, this.hover.y / BLOCK, this.grid);
    while (this.ghost.children.length < def.parts.length) this.ghost.addChild(new Sprite());
    this.ghost.children.forEach((c, k) => {
      const sp = c as Sprite;
      const part = def.parts[k];
      sp.visible = !!part;
      if (!part) return;
      const bt = this.app.bank.get(part.tex);
      sp.texture = bt.tex;
      sp.anchor.set(0.5);
      const sc = BLOCK / bt.ppb;
      sp.scale.set(sc * (this.placeFx ? -1 : 1), sc * (this.placeFy ? -1 : 1));
      sp.rotation = (this.placeRot * Math.PI) / 180;
      sp.position.set(x * BLOCK, -y * BLOCK);
      sp.tint = part.slot === 'detail' ? 0x140c2c : 0xffffff;
    });
  }

  // ------------------------------------------------------------ timeline

  private async loadPeaks(): Promise<void> {
    const song = this.model.meta.song;
    const d = await audio.load(song);
    if (!d.pcm) {
      this.peaks = null;
      return;
    }
    const rate = 100;
    const hop = Math.floor(d.pcm.sampleRate / rate);
    const n = Math.floor(d.pcm.L.length / hop);
    const data = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      for (let k = i * hop; k < (i + 1) * hop; k += 4) m = Math.max(m, Math.abs(d.pcm.L[k]!), Math.abs(d.pcm.R[k]!));
      data[i] = m;
    }
    this.peaks = { data, rate, song };
  }

  private drawTimeline(): void {
    const c = this.timeline;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,6,28,0.85)';
    ctx.fillRect(0, 0, W, H);
    const viewW = (this.app.width / this.scale);
    const x0 = this.cam.x;
    const pxPerUnit = W / viewW;
    const m = this.model.meta;
    if (this.peaks && this.peaks.song === m.song) {
      ctx.fillStyle = '#7ef7ff';
      ctx.globalAlpha = 0.75;
      for (let px = 0; px < W; px += 2) {
        const wx = x0 + px / pxPerUnit;
        if (wx < 0) continue;
        const st = m.offset + timeAtX(this.world, wx);
        const v = this.peaks.data[Math.floor(st * this.peaks.rate)] ?? 0;
        const hgt = v * (H - 8);
        ctx.fillRect(px, (H - hgt) / 2, 2, Math.max(1, hgt));
      }
      ctx.globalAlpha = 1;
    } else if (this.peaks?.song !== m.song) {
      void this.loadPeaks();
    }
    for (const b of this.beatXs(x0, x0 + viewW)) {
      const px = (b.x - x0) * pxPerUnit;
      ctx.fillStyle = b.bar ? '#ffe14d' : 'rgba(255,255,255,0.35)';
      ctx.fillRect(px, b.bar ? 0 : H - 8, b.bar ? 2 : 1, b.bar ? H : 8);
    }
    const ph = (this.playheadX() - x0) * pxPerUnit;
    ctx.fillStyle = '#5cff7a';
    ctx.fillRect(ph - 1, 0, 3, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '15px "Lilita One", sans-serif';
    const t = timeAtX(this.world, this.playheadX());
    ctx.fillText(`${t.toFixed(2)}s · ${(this.playheadX() / BLOCK).toFixed(1)}b`, Math.min(W - 120, ph + 6), 16);
  }

  private timelineClick(e: PointerEvent): void {
    const r = this.timeline.getBoundingClientRect();
    const frac = (e.clientX - r.left) / r.width;
    const viewW = this.app.width / this.scale;
    // put the playhead where the user clicked
    const target = this.cam.x + frac * viewW;
    this.cam.x = target - viewW / 3;
  }

  // ------------------------------------------------------------ properties panel

  private renderProps(): void {
    this.propsVersion = this.model.version;
    const sel = this.model.selected();
    clear(this.props);
    this.props.classList.toggle('open', sel.length > 0 && this.tool === 'edit');
    if (!sel.length) return;
    const uids = sel.map((e) => e.uid);
    const defs = sel.map((e) => getDef(e.o[0])!);
    const same = defs.every((d) => d.id === defs[0]!.id);
    const first = sel[0]!.o[3] ?? {};
    const common = <K extends keyof ObjExtra>(k: K): ObjExtra[K] | undefined => {
      const v = first[k];
      return sel.every((e) => JSON.stringify((e.o[3] ?? {})[k]) === JSON.stringify(v)) ? v : undefined;
    };
    const set = (patch: Partial<ObjExtra>) => this.model.setExtra(uids, patch);
    this.props.append(h('div.ed-props-title.outlined', same ? `${defs[0]!.name}${sel.length > 1 ? ` ×${sel.length}` : ''}` : `${sel.length} objects`));

    const row = (label: string, input: HTMLElement) => this.props.append(h('label.ed-row', h('span', label), input));
    const num = (v: number | undefined, onChange: (n: number | undefined) => void, step = 1, placeholder = '') => {
      const i = h('input', { type: 'number', step, value: v ?? '', placeholder });
      i.addEventListener('change', () => onChange(i.value === '' ? undefined : Number(i.value)));
      return i;
    };
    const select = (options: Array<[string, string]>, v: string | undefined, onChange: (s: string) => void) => {
      const s = h('select');
      if (v === undefined) s.append(h('option', { value: '' }, '—'));
      for (const [val, label] of options) s.append(h('option', { value: val, selected: val === v }, label));
      s.addEventListener('change', () => onChange(s.value));
      return s;
    };
    const check = (v: boolean | undefined, onChange: (b: boolean) => void) => {
      const i = h('input', { type: 'checkbox', checked: !!v });
      i.addEventListener('change', () => onChange(i.checked));
      return i;
    };
    const color = (v: string | undefined, onChange: (s: string) => void) => {
      const i = h('input', { type: 'color', value: v ?? '#ffffff' });
      i.addEventListener('change', () => onChange(i.value));
      return i;
    };
    const chanVal = (v: number | string | undefined, fallback: number) => (v === undefined ? channelName(fallback) : typeof v === 'number' ? (v >= 100 ? channelName(v) : String(v)) : v);
    const toChan = (s: string): number | string => (/^\d+$/.test(s) ? Number(s) : s);

    // groups
    const groups = common('g');
    const gi = h('input', { type: 'text', value: groups ? groups.join(', ') : '', placeholder: 'e.g. 1, 2' });
    gi.addEventListener('change', () => {
      const list = gi.value.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 999);
      set({ g: list.length ? list : undefined });
    });
    row('Groups', gi);

    const allTriggers = defs.every((d) => d.kind === Kind.Trigger);
    if (!allTriggers) {
      const d0 = defs[0]!;
      row('Main color', select(chanOptions(), same ? chanVal(common('c'), d0.c) : undefined, (v) => set({ c: toChan(v) })));
      if (defs.some((d) => d.parts.some((p) => p.slot === 'detail'))) row('Detail color', select(chanOptions(), same ? chanVal(common('c2'), d0.c2) : undefined, (v) => set({ c2: toChan(v) })));
      row('Layer', select([['-2', 'Back 2'], ['-1', 'Back 1'], ['0', 'Main'], ['1', 'Front 1'], ['2', 'Front 2']], common('z') !== undefined ? String(common('z')) : same ? String(d0.layer) : undefined, (v) => set({ z: Number(v) })));
      row('Glow', check(common('glow') !== undefined ? common('glow') === 1 : same ? !!d0.glow : false, (b) => set({ glow: b ? 1 : 0 })));
      row('Rotation°', num(common('r'), (n) => set({ r: n ? ((Math.round(n) % 360) + 360) % 360 : undefined }), 15));
      if (defs.every((d) => d.kind === Kind.Deco)) {
        row('Beat pulse', check(common('beat') !== undefined ? common('beat') === 1 : same ? !!d0.beat : false, (b) => set({ beat: b ? 1 : 0 })));
        row('Scale', num(common('s'), (n) => set({ s: n && n > 0 ? Math.min(8, n) : undefined }), 0.1, '1'));
      }
      if (defs.every((d) => d.kind === Kind.Portal && (d.sub === PortalType.Mode || d.sub === PortalType.DualOn))) {
        row('Area height', num(common('h'), (n) => set({ h: n && n >= 4 ? Math.min(20, Math.round(n)) : undefined }), 1, 'default'));
      }
      return;
    }

    // ---- trigger panel
    if (!same) {
      this.props.append(h('div.ed-hint', 'Select triggers of one type to edit their settings.'));
      return;
    }
    const type = defs[0]!.sub!;
    const ease = (v: EasingId | undefined) => select(Object.entries(EASING_NAMES), v ?? 'l', (s) => set({ e: s as EasingId }));
    const t = common('t');
    switch (type) {
      case TriggerType.Color:
        row('Channel', select(chanOptions().concat([['g2', 'g2'], ['bg2', 'bg2']]), t !== undefined ? String(t) : undefined, (v) => set({ t: toChan(v) })));
        row('Color', color(common('col'), (v) => set({ col: v })));
        row('Opacity', num(common('op'), (n) => set({ op: n === undefined ? undefined : Math.max(0, Math.min(1, n)) }), 0.05, '1'));
        row('Duration s', num(common('d'), (n) => set({ d: n }), 0.05, '0.5'));
        break;
      case TriggerType.Move:
        row('Group', num(typeof t === 'number' ? t : undefined, (n) => set({ t: n })));
        row('Move X (blocks)', num(common('dx'), (n) => set({ dx: n }), 0.5));
        row('Move Y (blocks)', num(common('dy'), (n) => set({ dy: n }), 0.5));
        row('Duration s', num(common('d'), (n) => set({ d: n }), 0.05, '0.5'));
        row('Easing', ease(common('e')));
        break;
      case TriggerType.Alpha:
        row('Group', num(typeof t === 'number' ? t : undefined, (n) => set({ t: n })));
        row('Opacity', num(common('op'), (n) => set({ op: n === undefined ? undefined : Math.max(0, Math.min(1, n)) }), 0.05, '0'));
        row('Duration s', num(common('d'), (n) => set({ d: n }), 0.05, '0.5'));
        break;
      case TriggerType.Rotate:
        row('Group', num(typeof t === 'number' ? t : undefined, (n) => set({ t: n })));
        row('Degrees', num(common('deg'), (n) => set({ deg: n }), 15, '90'));
        row('Center group', num(common('cg'), (n) => set({ cg: n })));
        row('Duration s', num(common('d'), (n) => set({ d: n }), 0.05, '0.5'));
        row('Easing', ease(common('e')));
        break;
      case TriggerType.Pulse:
        row('Target group', check(common('pg') === 1, (b) => set({ pg: b ? 1 : undefined })));
        row(common('pg') === 1 ? 'Group' : 'Channel', common('pg') === 1 ? num(typeof t === 'number' ? t : undefined, (n) => set({ t: n })) : select(chanOptions(), t !== undefined ? String(t) : undefined, (v) => set({ t: toChan(v) })));
        row('Color', color(common('col'), (v) => set({ col: v })));
        row('Fade in s', num(common('fi'), (n) => set({ fi: n }), 0.05, '0.05'));
        row('Hold s', num(common('hold'), (n) => set({ hold: n }), 0.05, '0.1'));
        row('Fade out s', num(common('fo'), (n) => set({ fo: n }), 0.05, '0.3'));
        break;
      case TriggerType.Toggle:
        row('Group', num(typeof t === 'number' ? t : undefined, (n) => set({ t: n })));
        row('Show', check(common('on') !== 0, (b) => set({ on: b ? 1 : 0 })));
        break;
      case TriggerType.Shake:
        row('Strength (blocks)', num(common('amp'), (n) => set({ amp: n }), 0.1, '0.3'));
        row('Duration s', num(common('d'), (n) => set({ d: n }), 0.05, '0.3'));
        break;
    }
    this.props.append(h('div.ed-hint', 'Triggers fire when the player passes their x position.'));
  }

  // ------------------------------------------------------------ dialogs

  private closeDialog(): void {
    this.dialog?.remove();
    this.dialog = null;
  }

  private openSettings(): void {
    this.closeDialog();
    const m = this.model.meta;
    const field = (label: string, input: HTMLElement) => h('label.ed-row', h('span', label), input);
    const text = (v: string, max = 40) => h('input', { type: 'text', value: v, maxlength: max });
    const numIn = (v: number | undefined, step: number) => h('input', { type: 'number', step, value: v ?? '' });
    const name = text(m.name);
    const author = text(m.author);
    const diff = h('select', ...DIFFICULTIES.map((d) => h('option', { value: d, selected: d === m.difficulty }, DIFFICULTY_NAMES[d])));
    const songSel = h('select');
    const songs = Object.values(SONGS).filter((s) => !s.id.startsWith('test') || s.id === m.song);
    for (const s of songs) songSel.append(h('option', { value: s.id, selected: s.id === m.song }, `${s.title} (${s.bpm} BPM)`));
    if (!SONGS[m.song]) songSel.append(h('option', { value: m.song, selected: true }, m.song.startsWith('custom:') ? 'Imported song' : m.song));
    const offset = numIn(m.offset, 0.01);
    const bpm = numIn(m.bpm, 0.1);
    const beatOffset = numIn(m.beatOffset, 0.001);
    const mode = h('select', ...MODE_KEYS.map((k, i) => h('option', { value: k, selected: k === m.mode }, MODE_NAMES[i]!)));
    const speed = h('select', ...['Slow', 'Normal', 'Fast', 'Faster', 'Fastest'].map((l, i) => h('option', { value: String(i), selected: i === m.speed }, l)));
    const mini = h('input', { type: 'checkbox', checked: !!m.mini });
    const flipped = h('input', { type: 'checkbox', checked: !!m.flipped });
    const bg = h('select', ...[0, 1, 2, 3].map((i) => h('option', { value: String(i), selected: i === (m.bg ?? 0) }, `Pattern ${i + 1}`)));
    const ground = h('select', ...[0, 1, 2].map((i) => h('option', { value: String(i), selected: i === (m.ground ?? 0) }, `Pattern ${i + 1}`)));
    const length = numIn(m.length, 1);
    length.setAttribute('placeholder', 'auto');
    const colorRows = h('div.ed-colors');
    const colorKeys = ['bg', 'g', 'line', 'obj', 'fill', ...Object.keys(m.colors).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))];
    const colorInputs = new Map<string, HTMLInputElement>();
    const addColorRow = (k: string) => {
      if (colorInputs.has(k)) return;
      const input = h('input', { type: 'color', value: colorDefHex(m.colors[k]) });
      colorInputs.set(k, input);
      colorRows.append(h('label.ed-color', h('span', k === 'g' ? 'ground' : k), input));
    };
    for (const k of colorKeys) addColorRow(k);
    const addChan = button('+ channel', () => {
      let n = 1;
      while (colorInputs.has(String(n))) n++;
      addColorRow(String(n));
    }, 'small gray');
    const detect = button('Detect BPM', async () => {
      const d = await audio.load(songSel.value);
      if (!d.pcm) return this.toast('Song not loaded');
      const r = detectBeats(d.pcm.L, d.pcm.R, d.pcm.sampleRate);
      bpm.value = String(Math.round(r.bpm * 100) / 100);
      beatOffset.value = String(Math.round(r.offset * 1000) / 1000);
      this.toast(`Detected ${r.bpm.toFixed(1)} BPM`);
    }, 'small gray');
    const importSong = button('Import audio…', () => this.importAudio((id) => {
      songSel.append(h('option', { value: id, selected: true }, 'Imported song'));
      songSel.value = id;
    }), 'small blue');
    songSel.addEventListener('change', () => {
      const s = SONGS[songSel.value];
      if (s) {
        bpm.value = String(s.bpm);
        beatOffset.value = String(s.lead ?? 0);
      }
    });
    const apply = () => {
      const colors = { ...m.colors };
      for (const [k, input] of colorInputs) colors[k] = input.value;
      this.model.setMeta({
        name: name.value.trim() || 'Untitled',
        author: author.value.trim(),
        difficulty: diff.value as typeof m.difficulty,
        song: songSel.value,
        offset: Math.max(0, Number(offset.value) || 0),
        bpm: Math.min(300, Math.max(30, Number(bpm.value) || 120)),
        beatOffset: Number(beatOffset.value) || 0,
        mode: mode.value as typeof m.mode,
        speed: Number(speed.value),
        mini: mini.checked || undefined,
        flipped: flipped.checked || undefined,
        bg: Number(bg.value),
        ground: Number(ground.value),
        length: length.value ? Math.max(10, Number(length.value)) : undefined,
        colors,
      });
      // background / ground patterns live in the view: rebuild it next frame
      this.rebuildView();
      void this.loadPeaks();
      this.closeDialog();
    };
    const panel = h(
      'div.panel.ed-dialog.pop',
      h('h2.outlined', 'Level settings'),
      h(
        'div.ed-dialog-cols',
        h('div', field('Name', name), field('Author', author), field('Difficulty', diff), field('Song', songSel), h('div.ed-row-btns', importSong, detect), field('Song offset s', offset), field('BPM', bpm), field('First beat s', beatOffset)),
        h('div', field('Start mode', mode), field('Start speed', speed), field('Start mini', mini), field('Start flipped', flipped), field('Background', bg), field('Ground', ground), field('Length (blocks)', length)),
        h('div', h('div.ed-sub', 'Colors'), colorRows, addChan),
      ),
      h('div.row', button('Apply', apply, 'green'), button('Cancel', () => this.closeDialog(), 'gray')),
    );
    this.dialog = h('div.overlay', panel);
    this.dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.dialog.dataset.testid = 'editor-settings';
    this.app.ui.appendChild(this.dialog);
  }

  private rebuildView(): void {
    // patterns are baked into the view's tiling sprites; recreate it
    this.root.removeChild(this.view.root);
    const view = new GameView(this.app.pixi.renderer, this.app.bank, compileWorld(this.model.toLevel()), { showTriggers: true, hitboxes: false, glow: true, reducedParticles: false, editor: true });
    view.overlay.addChild(this.overlay, this.ghost);
    view.resize(this.app.width, this.app.height);
    this.view.destroy();
    this.view = view;
    this.root.addChild(view.root);
    this.recompile(true);
  }

  private pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept, style: 'display:none' });
      input.addEventListener('change', () => {
        resolve(input.files?.[0] ?? null);
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  private async importAudio(onDone: (id: string) => void): Promise<void> {
    const file = await this.pickFile('audio/*');
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) return this.toast('Audio file too large (40 MB max)');
    const data = await file.arrayBuffer();
    let hash = 0x811c9dc5;
    const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 1 << 20));
    for (let i = 0; i < bytes.length; i += 7) hash = Math.imul(hash ^ bytes[i]!, 0x01000193) >>> 0;
    const id = `custom:${hash.toString(16)}${data.byteLength.toString(36)}`;
    const stored = await blobPut(id, data.slice(0));
    const d = await audio.decode(id, data);
    if (!d.pcm) return this.toast('Could not decode that audio file');
    onDone(id);
    this.toast(stored ? 'Song imported' : 'Song imported for this session (storage unavailable)');
  }

  private save(): void {
    const level = this.model.toLevel();
    const id = saveCustomLevel(level);
    if (!id) return this.toast('Could not save: browser storage is full or blocked');
    this.model.meta.id = id;
    this.model.dirty = false;
    this.toast('Saved');
  }

  private exportJson(): void {
    const level = this.model.toLevel();
    const blob = new Blob([serializeLevel(level)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `${level.meta.name.replace(/[^\w-]+/g, '_') || 'level'}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private async importJson(): Promise<void> {
    const file = await this.pickFile('application/json,.json');
    if (!file) return;
    try {
      const level = parseLevel(await file.text());
      const fresh = new EditorModel(level);
      fresh.dirty = true;
      // swap documents in place
      Object.assign(this.model, { meta: fresh.meta, objs: fresh.objs, selection: new Set<number>() });
      this.model.version++;
      this.rebuildView();
      void this.loadPeaks();
      this.toast(`Imported "${level.meta.name}" (${level.objects.length} objects)`);
    } catch (err) {
      this.toast(`Not a valid level file: ${(err as Error).message}`);
    }
  }

  private playtest(startX: number | null): void {
    this.opts.onPlaytest(this.model.toLevel(), startX, { ...this.cam });
  }

  private exit(): void {
    if (!this.model.dirty) {
      this.opts.onExit();
      return;
    }
    this.closeDialog();
    const panel = h(
      'div.panel.ed-dialog.ed-confirm.pop',
      h('h2.outlined', 'Unsaved changes'),
      h('p', 'Save this level before leaving the editor?'),
      h(
        'div.row',
        button('Save & exit', () => {
          this.save();
          if (!this.model.dirty) this.opts.onExit();
        }, 'green'),
        button('Discard', () => this.opts.onExit(), 'red'),
        button('Cancel', () => this.closeDialog(), 'gray'),
      ),
    );
    this.dialog = h('div.overlay', panel);
    this.dialog.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.dialog.dataset.testid = 'editor-confirm';
    this.app.ui.appendChild(this.dialog);
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.closeDialog();
    this.el.remove();
    this.view.destroy();
  }
}
