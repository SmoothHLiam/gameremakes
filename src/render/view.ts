import { BlurFilter, Container, Graphics, Sprite, Text, Texture, TilingSprite, type Renderer } from 'pixi.js';
import { getDef, Kind, MODE_KEYS, type ModeKey, Channel, CHANNEL_COUNT, GameMode } from '../core/objects.ts';
import { BLOCK, CHUNK_WIDTH, MINI_SCALE, SPEEDS } from '../core/physics.ts';
import { playerBox } from '../core/sim/sim.ts';
import type { SimState } from '../core/sim/state.ts';
import { pulseIntensity } from '../core/sim/triggers.ts';
import { Corner, type World } from '../core/sim/world.ts';
import { dcosDeg, dsinDeg } from '../core/dmath.ts';
import type { CameraState } from './camera.ts';
import { VIEW_H } from './camera.ts';
import { Particles } from './particles.ts';
import { BACKGROUNDS, GROUNDS, makeTileTexture, type TextureBank } from './textures.ts';
import { ICON_FRAMES, ICON_SIZE } from './icons.ts';

export interface ViewOptions {
  showTriggers: boolean;
  hitboxes: boolean;
  glow: boolean;
  reducedParticles: boolean;
  /** Editor: show everything, no player. */
  editor: boolean;
}

/** Snapshot of the interpolatable state at the previous tick. */
export interface RenderSnap {
  x: number;
  py: number[];
  prot: number[];
  pvy: number[];
  gdx: Float64Array;
  gdy: Float64Array;
  grot: Float64Array;
}

export function makeSnap(groups: number): RenderSnap {
  return {
    x: 0,
    py: [0, 0],
    prot: [0, 0],
    pvy: [0, 0],
    gdx: new Float64Array(groups),
    gdy: new Float64Array(groups),
    grot: new Float64Array(groups),
  };
}

export function captureSnap(s: SimState, out: RenderSnap): void {
  out.x = s.x;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[i]!;
    out.py[i] = p.y;
    out.prot[i] = p.rot;
    out.pvy[i] = p.vy;
  }
  if (s.moves.length || s.rots.length || out.gdx.length !== s.gdx.length) {
    if (out.gdx.length !== s.gdx.length) {
      out.gdx = new Float64Array(s.gdx.length);
      out.gdy = new Float64Array(s.gdx.length);
      out.grot = new Float64Array(s.gdx.length);
    }
    out.gdx.set(s.gdx);
    out.gdy.set(s.gdy);
    out.grot.set(s.grot);
  } else {
    // no active motion: previous == current
    out.gdx.set(s.gdx);
    out.gdy.set(s.gdy);
    out.grot.set(s.grot);
  }
}

export interface FrameInput {
  state: SimState;
  prev: RenderSnap | null;
  alpha: number;
  dt: number;
  time: number;
  cam: CameraState;
  /** 0..1 beat pulse (1 right on the beat, decaying). */
  beat: number;
  /** Mirror factor: 1 normal, -1 mirrored, in between while flipping. */
  mirror: number;
  /** Hide players (dead / editor). */
  hidePlayers?: boolean;
}

export interface PlayerSkin {
  /** Icon textures per mode (frames). */
  tex: Record<ModeKey, Texture[]>;
  /** Pixel scale the icons were drawn at (pixels per block) and their padding. */
  ppb: number;
  pad: number;
  p1: number;
  p2: number;
  glow: boolean;
}

interface ObjSprites {
  parts: Sprite[];
  slots: number[];
  layers: number[];
  glow: Sprite | null;
  ver: number;
  dynamic: boolean;
  baseScaleX: number;
  baseScaleY: number;
}

const LAYERS = 5;

function hexOf(r: number, g: number, b: number): number {
  return ((Math.round(r * 255) & 255) << 16) | ((Math.round(g * 255) & 255) << 8) | (Math.round(b * 255) & 255);
}

export class GameView {
  readonly root = new Container();
  readonly world: World;
  private readonly bank: TextureBank;
  opts: ViewOptions;

  private readonly bgLayer = new Container();
  private readonly bg: TilingSprite;
  private readonly worldLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly objLayers: Container[] = [];
  /** Per z-layer: [fill sub-layer, outline sub-layer] so fills never cover outlines. */
  private readonly subLayers: Container[] = [];
  private readonly trailLayer = new Graphics();
  private readonly playerLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly debug = new Graphics();
  readonly overlay = new Container();
  readonly particles: Particles;
  private readonly floor: TilingSprite;
  private readonly floorShade: Sprite;
  private readonly floorLine: Sprite;
  private readonly ceil: TilingSprite;
  private readonly ceilShade: Sprite;
  private readonly ceilLine: Sprite;
  private readonly attemptText: Text;
  private attemptX = 0;
  private readonly blur: BlurFilter | null;

  private screenW = 1280;
  private screenH = 720;

  // sprite pools per layer, plus glow pool
  private readonly pools: Sprite[][] = [];
  private readonly glowPool: Sprite[] = [];
  private readonly sprites: Array<ObjSprites | null>;
  private readonly refs: Uint16Array;
  private c0 = 0;
  private c1 = -1;
  private readonly allocated: number[] = [];
  private readonly allocPos: Int32Array;

  // channel colors as seen this frame
  private readonly chanHex = new Uint32Array(CHANNEL_COUNT);
  private readonly chanAlpha = new Float32Array(CHANNEL_COUNT);
  private readonly chanBlend = new Uint8Array(CHANNEL_COUNT);
  private colorVer = 1;

  // players
  private skin: PlayerSkin | null = null;
  private readonly playerSprites: Sprite[] = [];
  private readonly playerGlows: Sprite[] = [];
  private readonly trails: Array<Array<{ x: number; y: number }>> = [[], []];
  private trailFade = [0, 0];

  // ground visual positions (eased)
  private floorY = 0;
  private ceilY = 2000;
  private ceilOn = 0;

  constructor(renderer: Renderer, bank: TextureBank, world: World, opts: ViewOptions) {
    this.world = world;
    this.bank = bank;
    this.opts = opts;
    const isCanvas = renderer.name === 'canvas';

    // background
    const bgId = Math.max(0, Math.min(BACKGROUNDS.length - 1, world.level.meta.bg ?? 0));
    const bgTex = makeTileTexture(512, BACKGROUNDS[bgId]!);
    this.bg = new TilingSprite({ texture: bgTex, width: 1280, height: 720 });
    this.bgLayer.addChild(this.bg);
    this.root.addChild(this.bgLayer);

    this.root.addChild(this.worldLayer);
    this.blur = !isCanvas ? new BlurFilter({ strength: 6, quality: 3 }) : null;
    if (this.blur) {
      this.blur.resolution = 0.5;
      this.glowLayer.filters = [this.blur];
    }
    this.glowLayer.blendMode = 'add';
    this.worldLayer.addChild(this.glowLayer);
    for (let l = 0; l < LAYERS; l++) {
      const c = new Container();
      const back = new Container();
      const front = new Container();
      c.addChild(back, front);
      this.objLayers.push(c);
      this.subLayers.push(back, front);
      this.pools.push([], []);
    }
    this.worldLayer.addChild(this.objLayers[0]!, this.objLayers[1]!, this.objLayers[2]!);
    this.worldLayer.addChild(this.trailLayer);
    this.worldLayer.addChild(this.playerLayer);
    this.worldLayer.addChild(this.objLayers[3]!, this.objLayers[4]!);
    this.particles = new Particles(bank);
    this.worldLayer.addChild(this.particles.layer);

    // ground
    const gId = Math.max(0, Math.min(GROUNDS.length - 1, world.level.meta.ground ?? 0));
    const gTex = makeTileTexture(256, GROUNDS[gId]!);
    const shade = Texture.WHITE;
    this.floor = new TilingSprite({ texture: gTex, width: 100, height: 100 });
    this.floorShade = new Sprite(shade);
    this.floorLine = new Sprite(bank.get('p_line').tex);
    this.ceil = new TilingSprite({ texture: gTex, width: 100, height: 100 });
    this.ceilShade = new Sprite(shade);
    this.ceilLine = new Sprite(bank.get('p_line').tex);
    for (const t of [this.floor, this.ceil]) t.tileScale.set((4 * BLOCK) / 256);
    this.groundLayer.addChild(this.floor, this.floorShade, this.floorLine, this.ceil, this.ceilShade, this.ceilLine);
    this.worldLayer.addChild(this.groundLayer);
    this.worldLayer.addChild(this.debug);
    this.worldLayer.addChild(this.overlay);

    this.attemptText = new Text({
      text: '',
      style: {
        fontFamily: '"Lilita One", "Arial Black", sans-serif',
        fontSize: 64,
        fill: 0xffffff,
        stroke: { color: 0x0b0716, width: 10, join: 'round' },
        align: 'center',
      },
    });
    this.attemptText.anchor.set(0.5);
    this.attemptText.scale.set(0.4);
    this.worldLayer.addChild(this.attemptText);

    this.sprites = new Array(world.n).fill(null);
    this.refs = new Uint16Array(world.n);
    this.allocPos = new Int32Array(world.n).fill(-1);
  }

  resize(w: number, h: number): void {
    this.screenW = w;
    this.screenH = h;
    this.bg.width = w;
    this.bg.height = h;
  }

  setSkin(skin: PlayerSkin): void {
    this.skin = skin;
    for (let i = 0; i < 2; i++) {
      if (!this.playerSprites[i]) {
        const s = new Sprite();
        s.anchor.set(0.5);
        this.playerSprites.push(s);
        this.playerLayer.addChild(s);
        const g = new Sprite();
        g.anchor.set(0.5);
        g.blendMode = 'add';
        this.playerGlows.push(g);
        this.glowLayer.addChild(g);
      }
    }
  }

  setAttempt(n: number, x: number): void {
    this.attemptText.text = `Attempt ${n}`;
    this.attemptX = x;
    this.attemptText.visible = n > 0;
  }

  resetEffects(): void {
    this.particles.clear();
    this.trails[0]!.length = 0;
    this.trails[1]!.length = 0;
    this.trailLayer.clear();
  }

  // ------------------------------------------------------------ allocation

  /** Pool index = layer * 2 + sub (0 fill, 1 outline). */
  private take(pool: number): Sprite {
    const s = this.pools[pool]!.pop();
    if (s) {
      s.visible = true;
      return s;
    }
    const n = new Sprite();
    n.anchor.set(0.5);
    this.subLayers[pool]!.addChild(n);
    return n;
  }

  private alloc(i: number): void {
    const w = this.world;
    const def = getDef(w.type[i]!)!;
    const kind = w.kind[i]!;
    if (kind === Kind.Trigger && !this.opts.showTriggers) return;
    const parts: Sprite[] = [];
    const slots: number[] = [];
    const layers: number[] = [];
    const sc = w.scale[i]!;
    const fx = w.flip[i]! & 1 ? -1 : 1;
    const fy = w.flip[i]! & 2 ? -1 : 1;
    let baseScale = 1;
    for (const part of def.parts) {
      const bt = this.bank.get(part.tex);
      const layer = Math.max(0, Math.min(LAYERS - 1, (part.layer ?? w.layer[i]!) + 2));
      const pool = layer * 2 + (part.slot === 'detail' ? 0 : 1);
      const s = this.take(pool);
      s.texture = bt.tex;
      baseScale = (BLOCK / bt.ppb) * sc;
      s.scale.set(baseScale * fx, baseScale * fy);
      s.rotation = (w.rot[i]! * Math.PI) / 180;
      s.position.set(w.x[i]!, -w.y[i]!);
      s.blendMode = part.add ? 'add' : 'normal';
      s.alpha = 1;
      parts.push(s);
      slots.push(part.slot === 'main' ? 0 : part.slot === 'detail' ? 1 : 2);
      layers.push(pool);
    }
    let glow: Sprite | null = null;
    if (w.glow[i] && this.opts.glow && this.blur) {
      glow = this.glowPool.pop() ?? null;
      if (!glow) {
        glow = new Sprite();
        glow.anchor.set(0.5);
        this.glowLayer.addChild(glow);
      }
      glow.visible = true;
      const src = parts[parts.length - 1]!;
      glow.texture = src.texture;
      glow.scale.copyFrom(src.scale);
      glow.rotation = src.rotation;
      glow.position.copyFrom(src.position);
    }
    const dynamic = w.groupStart[i] !== w.groupStart[i + 1] || !!def.spin || !!w.beat[i] || kind === Kind.Orb || kind === Kind.Coin;
    const rec: ObjSprites = { parts, slots, layers, glow, ver: 0, dynamic, baseScaleX: baseScale * fx, baseScaleY: baseScale * fy };
    this.sprites[i] = rec;
    this.applyColor(i, rec);
    this.allocPos[i] = this.allocated.length;
    this.allocated.push(i);
  }

  private release(i: number): void {
    const rec = this.sprites[i];
    if (!rec) return;
    for (let k = 0; k < rec.parts.length; k++) {
      const s = rec.parts[k]!;
      s.visible = false;
      this.pools[rec.layers[k]!]!.push(s);
    }
    if (rec.glow) {
      rec.glow.visible = false;
      this.glowPool.push(rec.glow);
    }
    this.sprites[i] = null;
    const pos = this.allocPos[i]!;
    const last = this.allocated.pop()!;
    if (last !== i) {
      this.allocated[pos] = last;
      this.allocPos[last] = pos;
    }
    this.allocPos[i] = -1;
  }

  private setChunkRange(c0: number, c1: number): void {
    const w = this.world;
    c0 = Math.max(0, c0);
    c1 = Math.min(w.chunkCount - 1, c1);
    if (c0 === this.c0 && c1 === this.c1) return;
    // release chunks leaving
    for (let c = this.c0; c <= this.c1; c++) {
      if (c >= c0 && c <= c1) continue;
      for (let k = w.vchunkStart[c]!; k < w.vchunkStart[c + 1]!; k++) {
        const i = w.vchunkList[k]!;
        if (--this.refs[i]! === 0) this.release(i);
      }
    }
    for (let c = c0; c <= c1; c++) {
      if (c >= this.c0 && c <= this.c1) continue;
      for (let k = w.vchunkStart[c]!; k < w.vchunkStart[c + 1]!; k++) {
        const i = w.vchunkList[k]!;
        if (this.refs[i]!++ === 0) this.alloc(i);
      }
    }
    this.c0 = c0;
    this.c1 = c1;
  }

  /** Release everything (e.g. editor changed the level). */
  clearObjects(): void {
    while (this.allocated.length) this.release(this.allocated[this.allocated.length - 1]!);
    this.refs.fill(0);
    this.c0 = 0;
    this.c1 = -1;
  }

  // ------------------------------------------------------------ colors

  private computeChannels(s: SimState, tick: number): boolean {
    let changed = false;
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      let r = s.col[ch * 3]!;
      let g = s.col[ch * 3 + 1]!;
      let b = s.col[ch * 3 + 2]!;
      // channel pulses
      for (const a of s.pulses) {
        const t = this.world.triggers[a.t]!;
        if (t.pulseGroup || t.target !== ch) continue;
        const k = pulseIntensity(t, a.start, tick);
        r += (t.rgb[0] - r) * k;
        g += (t.rgb[1] - g) * k;
        b += (t.rgb[2] - b) * k;
      }
      const hex = hexOf(r, g, b);
      const alpha = s.calpha[ch]!;
      if (hex !== this.chanHex[ch] || alpha !== this.chanAlpha[ch]) {
        this.chanHex[ch] = hex;
        this.chanAlpha[ch] = alpha;
        changed = true;
      }
      this.chanBlend[ch] = this.world.baseBlend[ch]!;
    }
    if (changed) this.colorVer++;
    return changed;
  }

  channelHex(ch: number): number {
    return this.chanHex[ch]!;
  }

  private applyColor(i: number, rec: ObjSprites): void {
    const w = this.world;
    for (let k = 0; k < rec.parts.length; k++) {
      const slot = rec.slots[k]!;
      const s = rec.parts[k]!;
      if (slot === 2) {
        s.tint = 0xffffff;
        continue;
      }
      const ch = slot === 0 ? w.c1[i]! : w.c2[i]!;
      s.tint = this.chanHex[ch]!;
      if (this.chanBlend[ch]) s.blendMode = 'add';
    }
    if (rec.glow) {
      const ch = w.c1[i]!;
      const slot = rec.slots[rec.parts.length - 1]!;
      rec.glow.tint = slot === 2 ? 0xffffff : this.chanHex[ch]!;
    }
    rec.ver = this.colorVer;
  }

  // ------------------------------------------------------------ frame

  render(f: FrameInput): void {
    const s = f.state;
    const zoom = f.cam.zoom;
    const scale = (this.screenH / VIEW_H) * zoom;
    const viewW = this.screenW / scale;
    const viewH = this.screenH / scale;
    const camX = f.cam.x + f.cam.shakeX;
    const camY = f.cam.y + f.cam.shakeY;
    const m = f.mirror;
    const tick = s.tick;

    // world transform (mirror around the screen center)
    this.worldLayer.scale.set(scale * m, scale);
    this.worldLayer.position.set(this.screenW / 2 + m * (-camX * scale - this.screenW / 2), this.screenH + camY * scale);
    this.bgLayer.scale.x = m;
    this.bgLayer.position.x = m < 0 ? this.screenW : 0;
    if (m > -1 && m < 1) this.bgLayer.position.x = this.screenW / 2 - (this.screenW / 2) * m;

    // channels
    const colorsChanged = this.computeChannels(s, tick);
    this.bg.tint = this.chanHex[Channel.BG]!;
    const bgTile = this.screenH * 0.85;
    this.bg.tileScale.set(bgTile / 512);
    this.bg.tilePosition.set(-camX * scale * 0.12, camY * scale * 0.06 + this.screenH * 0.1);

    // visible chunks
    const margin = 2 * BLOCK;
    this.setChunkRange(Math.floor((camX - margin) / CHUNK_WIDTH), Math.floor((camX + viewW + margin) / CHUNK_WIDTH));

    // per-object updates
    const alpha = f.alpha;
    const prev = f.prev;
    const beatScale = 1 + 0.14 * f.beat;
    for (let n = 0; n < this.allocated.length; n++) {
      const i = this.allocated[n]!;
      const rec = this.sprites[i]!;
      if (colorsChanged && rec.ver !== this.colorVer) this.applyColor(i, rec);
      if (!rec.dynamic) continue;
      this.updateDynamic(i, rec, s, prev, alpha, f.time, beatScale, tick);
    }

    this.updateGround(f, camX, camY, viewW, viewH);
    this.updatePlayers(f);
    this.particles.reduced = this.opts.reducedParticles;
    this.particles.update(f.dt);

    // attempt counter: anchored in the world, fades as the player moves on
    if (this.attemptText.visible) {
      this.attemptText.position.set(this.attemptX + 7 * BLOCK, -Math.max(4.4 * BLOCK, camY + viewH * 0.56));
      this.attemptText.scale.x = m < 0 ? -0.4 : 0.4;
      const px = prev ? prev.x + (s.x - prev.x) * alpha : s.x;
      const d = px - this.attemptX;
      this.attemptText.alpha = Math.max(0, Math.min(1, 1 - (d - 4 * BLOCK) / (10 * BLOCK)));
    }

    if (this.opts.hitboxes) this.drawHitboxes(s, camX, viewW);
    else if (this.debug.visible) {
      this.debug.clear();
      this.debug.visible = false;
    }
  }

  private updateDynamic(i: number, rec: ObjSprites, s: SimState, prev: RenderSnap | null, alpha: number, time: number, beatScale: number, tick: number): void {
    const w = this.world;
    const def = getDef(w.type[i]!)!;
    let x = w.x[i]!;
    let y = w.y[i]!;
    let rot = w.rot[i]!;
    let a = 1;
    let hidden = false;
    let pulseTint = -1;
    const gs = w.groupStart[i]!;
    const ge = w.groupStart[i + 1]!;
    if (gs !== ge) {
      let dx = 0;
      let dy = 0;
      let dr = 0;
      for (let k = gs; k < ge; k++) {
        const g = w.groupList[k]!;
        const cx = s.gdx[g]!;
        const cy = s.gdy[g]!;
        const cr = s.grot[g]!;
        if (prev) {
          dx += prev.gdx[g]! + (cx - prev.gdx[g]!) * alpha;
          dy += prev.gdy[g]! + (cy - prev.gdy[g]!) * alpha;
          dr += prev.grot[g]! + (cr - prev.grot[g]!) * alpha;
        } else {
          dx += cx;
          dy += cy;
          dr += cr;
        }
        a *= s.galpha[g]!;
        if (s.ghidden[g]) hidden = true;
      }
      x += dx;
      y += dy;
      if (dr !== 0) {
        rot += dr;
        // orbit around center group if set
        for (let k = gs; k < ge; k++) {
          const g = w.groupList[k]!;
          const cg = s.gcenter[g]!;
          if (!cg || s.grot[g] === 0) continue;
          const members = w.groupMembers.get(cg);
          if (!members?.length || members[0] === i) continue;
          const c = members[0]!;
          let cx = w.x[c]!;
          let cy = w.y[c]!;
          for (let q = w.groupStart[c]!; q < w.groupStart[c + 1]!; q++) {
            const cgq = w.groupList[q]!;
            cx += s.gdx[cgq]!;
            cy += s.gdy[cgq]!;
          }
          const deg = prev ? prev.grot[g]! + (s.grot[g]! - prev.grot[g]!) * alpha : s.grot[g]!;
          const sn = dsinDeg(deg);
          const cs = dcosDeg(deg);
          const ox = x - cx;
          const oy = y - cy;
          x = cx + ox * cs + oy * sn;
          y = cy - ox * sn + oy * cs;
        }
      }
      // group pulses
      for (const p of s.pulses) {
        const t = w.triggers[p.t]!;
        if (!t.pulseGroup) continue;
        let inGroup = false;
        for (let k = gs; k < ge; k++) if (w.groupList[k] === t.target) inGroup = true;
        if (!inGroup) continue;
        const k = pulseIntensity(t, p.start, tick);
        if (k > 0) pulseTint = hexOf(t.rgb[0] * k + (1 - k), t.rgb[1] * k + (1 - k), t.rgb[2] * k + (1 - k));
      }
    }
    if (def.spin) rot += def.spin * time;
    let sx = rec.baseScaleX;
    let sy = rec.baseScaleY;
    if (w.beat[i]) {
      sx *= beatScale;
      sy *= beatScale;
    }
    if (w.kind[i] === Kind.Orb || w.kind[i] === Kind.Coin) {
      const used = s.used[i]! !== 0;
      const pulse = 1 + 0.06 * Math.sin(time * 6 + i);
      sx *= pulse;
      sy *= pulse;
      if (w.kind[i] === Kind.Coin && used) a *= 0.25;
    }
    const r = (rot * Math.PI) / 180;
    for (let k = 0; k < rec.parts.length; k++) {
      const sp = rec.parts[k]!;
      sp.visible = !hidden;
      sp.position.set(x, -y);
      sp.rotation = r;
      sp.scale.set(sx, sy);
      const ch = rec.slots[k] === 0 ? w.c1[i]! : rec.slots[k] === 1 ? w.c2[i]! : -1;
      sp.alpha = a * (ch >= 0 ? this.chanAlpha[ch]! : 1);
      if (pulseTint >= 0) sp.tint = pulseTint;
      else if (rec.slots[k] !== 2 && pulseTint === -1 && gs !== ge) sp.tint = this.chanHex[ch]!;
    }
    if (rec.glow) {
      rec.glow.visible = !hidden;
      rec.glow.position.set(x, -y);
      rec.glow.rotation = r;
      rec.glow.scale.set(sx, sy);
      rec.glow.alpha = a;
    }
  }

  private updateGround(f: FrameInput, camX: number, camY: number, viewW: number, viewH: number): void {
    const s = f.state;
    const targetFloor = s.boundsOn ? s.boundsLo : 0;
    const targetCeil = s.boundsOn ? s.boundsHi : targetFloor + viewH + 4 * BLOCK;
    const k = 1 - Math.exp(-f.dt * 9);
    this.floorY += (targetFloor - this.floorY) * k;
    if (Math.abs(this.floorY - targetFloor) < 0.05) this.floorY = targetFloor;
    this.ceilY += (targetCeil - this.ceilY) * k;
    this.ceilOn += ((s.boundsOn ? 1 : 0) - this.ceilOn) * k;
    if (this.opts.editor) {
      this.floorY = 0;
      this.ceilOn = 0;
    }
    const tile = 4 * BLOCK;
    const x0 = Math.floor((camX - tile) / tile) * tile;
    const width = viewW + tile * 3;
    const groundHex = this.chanHex[Channel.Ground]!;
    const lineHex = this.chanHex[Channel.Line]!;
    // floor
    const floorBottom = Math.min(camY, this.floorY) - BLOCK;
    this.floor.position.set(x0, -this.floorY);
    this.floor.width = width;
    this.floor.height = Math.max(1, this.floorY - floorBottom);
    this.floor.tint = groundHex;
    this.floor.tilePosition.set(0, 0);
    this.floorShade.position.set(x0, -this.floorY);
    this.floorShade.width = width;
    this.floorShade.height = Math.max(1, this.floorY - floorBottom);
    this.floorShade.tint = 0x000000;
    this.floorShade.alpha = 0.18;
    const lineW = viewW * 0.95;
    this.floorLine.position.set(camX + viewW / 2 - lineW / 2, -this.floorY - 1.2);
    this.floorLine.width = lineW;
    this.floorLine.height = 2.4;
    this.floorLine.tint = lineHex;
    // ceiling
    const showCeil = this.ceilOn > 0.01;
    this.ceil.visible = this.ceilShade.visible = this.ceilLine.visible = showCeil;
    if (showCeil) {
      const top = camY + viewH + BLOCK;
      this.ceil.position.set(x0, -top);
      this.ceil.width = width;
      this.ceil.height = Math.max(1, top - this.ceilY);
      this.ceil.tint = groundHex;
      this.ceilShade.position.set(x0, -top);
      this.ceilShade.width = width;
      this.ceilShade.height = Math.max(1, top - this.ceilY);
      this.ceilShade.tint = 0x000000;
      this.ceilShade.alpha = 0.18;
      this.ceilLine.position.set(camX + viewW / 2 - lineW / 2, -this.ceilY - 1.2);
      this.ceilLine.width = lineW;
      this.ceilLine.height = 2.4;
      this.ceilLine.tint = lineHex;
      this.ceilLine.alpha = 0.95 * this.ceilOn;
      this.ceil.alpha = this.ceilShade.alpha = Math.min(1, this.ceilOn * 1.2);
    }
  }

  private updatePlayers(f: FrameInput): void {
    const s = f.state;
    const skin = this.skin;
    if (!skin) return;
    const alpha = f.alpha;
    const prev = f.prev;
    const px = prev ? prev.x + (s.x - prev.x) * alpha : s.x;
    for (let i = 0; i < 2; i++) {
      const sp = this.playerSprites[i]!;
      const gl = this.playerGlows[i]!;
      const p = s.players[i];
      const show = !!p && !p.dead && !f.hidePlayers && !this.opts.editor;
      sp.visible = show;
      gl.visible = show && skin.glow && !!this.blur;
      const trail = this.trails[i]!;
      if (!show || !p) {
        trail.length = 0;
        continue;
      }
      const mode = MODE_KEYS[p.mode]!;
      const frames = skin.tex[mode];
      let frame = 0;
      if (ICON_FRAMES[mode] > 1 && p.onGround) frame = Math.floor(f.time * 10) % ICON_FRAMES[mode];
      sp.texture = frames[frame] ?? frames[0]!;
      const y = prev && prev.py[i] !== undefined ? prev.py[i]! + (p.y - prev.py[i]!) * alpha : p.y;
      const vy = prev && prev.pvy[i] !== undefined ? prev.pvy[i]! + (p.vy - prev.pvy[i]!) * alpha : p.vy;
      let rotDeg = prev && prev.prot[i] !== undefined ? prev.prot[i]! + (p.rot - prev.prot[i]!) * alpha : p.rot;
      const vx = SPEEDS[s.speed]!;
      const sc = (BLOCK / skin.ppb) * (p.mini ? MINI_SCALE : 1);
      let sy = sc;
      if (p.mode === GameMode.Ship || p.mode === GameMode.Ufo || p.mode === GameMode.Swing || p.mode === GameMode.Wave) {
        // tilt toward velocity (visual only)
        let tilt = (-Math.atan2(vy, vx) * 180) / Math.PI;
        if (p.mode === GameMode.Ufo) tilt *= 0.15;
        if (p.mode === GameMode.Swing) tilt *= 0.6;
        if (p.mode === GameMode.Ship) tilt = Math.max(-50, Math.min(50, tilt));
        if (p.mode === GameMode.Wave) tilt = vy > 0.1 ? -45 * (p.mini ? 1.4 : 1) : vy < -0.1 ? 45 * (p.mini ? 1.4 : 1) : 0;
        rotDeg = tilt;
        if (p.g < 0 && p.mode !== GameMode.Wave) sy = -sc;
      } else if (p.mode === GameMode.Robot || p.mode === GameMode.Spider) {
        rotDeg = 0;
        if (p.g < 0) sy = -sc;
      }
      // icon is drawn centered on the hitbox; shift so the visual bottom sits on the floor
      const icon = ICON_SIZE[mode];
      const box = playerBox(p);
      let yOff = 0;
      if (p.mode === GameMode.Robot || p.mode === GameMode.Spider) {
        const visHalf = (icon.h * BLOCK * (p.mini ? MINI_SCALE : 1)) / 2;
        yOff = (visHalf - box.halfH) * p.g;
      }
      if (p.mode === GameMode.Cube && p.slopeDeg !== 0 && p.onGround) {
        // lift so the tilted cube rests on the slope surface
        const rad = (Math.abs(p.slopeDeg) * Math.PI) / 180;
        yOff = box.halfH * (1 / Math.cos(rad) - 1) * p.g;
      }
      sp.position.set(px, -(y + yOff));
      sp.rotation = (rotDeg * Math.PI) / 180;
      sp.scale.set(sc, sy);
      gl.texture = sp.texture;
      gl.position.copyFrom(sp.position);
      gl.rotation = sp.rotation;
      gl.scale.set(sc * 1.15, sy * 1.15);
      gl.tint = i === 0 ? skin.p1 : skin.p2;

      // wave trail
      if (p.mode === GameMode.Wave) {
        const last = trail[trail.length - 1];
        if (!last || Math.abs(px - last.x) > 1.5 || Math.abs(y - last.y) > 1.5) trail.push({ x: px, y });
        while (trail.length > 2 && px - trail[0]!.x > 26 * BLOCK) trail.shift();
        this.trailFade[i] = 1;
      } else if (trail.length) {
        this.trailFade[i]! -= f.dt * 3;
        if (this.trailFade[i]! <= 0) trail.length = 0;
      }
    }
    this.drawTrails(s, px);
  }

  private drawTrails(s: SimState, px: number): void {
    const g = this.trailLayer;
    g.clear();
    const skin = this.skin!;
    for (let i = 0; i < 2; i++) {
      const tr = this.trails[i]!;
      if (tr.length < 2) continue;
      const p = s.players[i];
      const width = p?.mini ? 4 : 7;
      const fade = this.trailFade[i]!;
      g.moveTo(tr[0]!.x, -tr[0]!.y);
      for (let k = 1; k < tr.length; k++) g.lineTo(tr[k]!.x, -tr[k]!.y);
      g.stroke({ width, color: i === 0 ? skin.p2 : skin.p1, alpha: 0.85 * fade, join: 'round', cap: 'round' });
      g.moveTo(tr[0]!.x, -tr[0]!.y);
      for (let k = 1; k < tr.length; k++) g.lineTo(tr[k]!.x, -tr[k]!.y);
      g.stroke({ width: width * 0.4, color: 0xffffff, alpha: 0.9 * fade, join: 'round', cap: 'round' });
    }
    void px;
  }

  private drawHitboxes(s: SimState, camX: number, viewW: number): void {
    const g = this.debug;
    g.visible = true;
    g.clear();
    const w = this.world;
    for (const i of this.allocated) {
      const kind = w.kind[i]!;
      if (kind === Kind.Deco || kind === Kind.Trigger) continue;
      let x = w.x[i]!;
      let y = w.y[i]!;
      for (let k = w.groupStart[i]!; k < w.groupStart[i + 1]!; k++) {
        x += s.gdx[w.groupList[k]!]!;
        y += s.gdy[w.groupList[k]!]!;
      }
      if (x < camX - 60 || x > camX + viewW + 60) continue;
      if (kind === Kind.Saw) {
        g.circle(x, -y, w.hr[i]!).stroke({ width: 1, color: 0xff3030 });
        continue;
      }
      if (kind === Kind.Slope) {
        const hw = w.hw[i]!;
        const hh = w.hh[i]!;
        const x0 = x - hw;
        const x1 = x + hw;
        const y0 = y - hh;
        const y1 = y + hh;
        const c = w.corner[i]!;
        const pts =
          c === Corner.BR ? [x0, y0, x1, y0, x1, y1]
          : c === Corner.BL ? [x0, y0, x1, y0, x0, y1]
          : c === Corner.TR ? [x0, y1, x1, y1, x1, y0]
          : [x0, y1, x1, y1, x0, y0];
        g.poly([pts[0]!, -pts[1]!, pts[2]!, -pts[3]!, pts[4]!, -pts[5]!]).stroke({ width: 1, color: 0x30a0ff });
        continue;
      }
      const cx = x + w.hx[i]!;
      const cy = y + w.hy[i]!;
      const color = kind === Kind.Solid ? 0x30a0ff : kind === Kind.Hazard ? 0xff3030 : 0x40ff70;
      g.rect(cx - w.hw[i]!, -(cy + w.hh[i]!), w.hw[i]! * 2, w.hh[i]! * 2).stroke({ width: 1, color });
    }
    for (const p of s.players) {
      if (p.dead) continue;
      const b = playerBox(p);
      g.rect(s.x - b.halfW, -(p.y + b.halfH), b.halfW * 2, b.halfH * 2).stroke({ width: 1, color: 0xff3030 });
      g.rect(s.x - b.innerW, -(p.y + b.innerH), b.innerW * 2, b.innerH * 2).stroke({ width: 1, color: 0x30a0ff });
    }
    if (s.boundsOn) {
      g.moveTo(camX, -s.boundsLo).lineTo(camX + viewW, -s.boundsLo).stroke({ width: 1, color: 0xffff40 });
      g.moveTo(camX, -s.boundsHi).lineTo(camX + viewW, -s.boundsHi).stroke({ width: 1, color: 0xffff40 });
    }
  }

  /** Visual position of player i at the last render (for particles). */
  playerVisual(i: number): { x: number; y: number } | null {
    const sp = this.playerSprites[i];
    if (!sp) return null;
    return { x: sp.position.x, y: -sp.position.y };
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

