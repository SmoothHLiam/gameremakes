import { defaultMeta, type LevelJSON, type LevelObject } from '../core/level.ts';
import { requireDef } from '../core/objects.ts';
import * as P from '../core/physics.ts';

/**
 * The level that plays itself behind the menus: jumps on every other beat of
 * the menu track with spikes under each jump apex, plus scenery and a slow
 * palette cycle.
 */
export function menuLevel(bpm = 122): { level: LevelJSON; replay: number[] } {
  const id = (k: string) => requireDef(k).id;
  const objects: LevelObject[] = [];
  const vx = P.SPEEDS[1]!;
  const spb = 60 / bpm;
  const air = (2 * P.CUBE_JUMP_VELOCITY) / P.CUBE_GRAVITY;
  const replay: number[] = [];
  const length = 140;
  let k = 0;
  for (let t = 2 * spb * 2; ; t += spb * 2, k++) {
    const x = t * vx;
    if (x > (length - 12) * P.BLOCK) break;
    const tick = Math.round(t * P.TICK_RATE);
    replay.push(tick, tick + 5);
    const apex = (t + air / 2) * vx / P.BLOCK;
    const cell = Math.floor(apex);
    objects.push([id(k % 5 === 4 ? 'spike_half' : 'spike'), cell + 0.5, k % 5 === 4 ? 0.25 : 0.5]);
    if (k % 3 === 1) objects.push([id('deco_glow'), cell + 3.5, 4.5 + (k % 2), { c: 3, z: -2 }]);
    if (k % 4 === 2) objects.push([id('deco_beatring'), cell + 6, 6.5, { c: 2, z: -2 }]);
  }
  // background towers
  for (let x = 8; x < length - 4; x += 7) {
    const h = 2 + ((x * 7) % 5);
    for (let r = 0; r < h; r++) objects.push([id('deco_square'), x + 0.5, r + 0.5, { c: 3, z: -2 }]);
    objects.push([id('deco_diamond'), x + 0.5, h + 0.5, { c: 2, z: -2 }]);
    objects.push([id('deco_fuzz'), x + 2.5, 0.2, { c: 1, z: -1 }]);
  }
  const palettes = [
    ['#3046d9', '#1f2c96', '#5cc8ff', '#ff6ad5', '#6a5cff'],
    ['#8a2fc4', '#4d1a73', '#ff7ad9', '#5cf2ff', '#b06cff'],
    ['#1f8f8a', '#0e4d4a', '#5cf2a0', '#ffe14d', '#2fb8a8'],
    ['#c4462f', '#6e2014', '#ffb84f', '#5cc8ff', '#e0743a'],
  ];
  palettes.forEach((pal, i) => {
    const x = 6 + i * 32;
    objects.push([id('trig_color'), x, 12, { t: 'bg', col: pal[0]!, d: 2.5 }]);
    objects.push([id('trig_color'), x, 13, { t: 'g', col: pal[1]!, d: 2.5 }]);
    objects.push([id('trig_color'), x + 0.5, 12, { t: 1, col: pal[2]!, d: 2.5 }]);
    objects.push([id('trig_color'), x + 0.5, 13, { t: 2, col: pal[3]!, d: 2.5 }]);
    objects.push([id('trig_color'), x + 1, 12, { t: 3, col: pal[4]!, d: 2.5 }]);
  });
  const meta = { ...defaultMeta(), name: 'Menu', song: 'menu', bpm, length, colors: { ...defaultMeta().colors, bg: '#c4462f', g: '#6e2014', '1': '#ffb84f', '2': '#5cc8ff', '3': '#e0743a' } };
  return { level: { v: 1, meta, objects }, replay };
}
