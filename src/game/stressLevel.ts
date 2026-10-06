import { defaultMeta, type LevelJSON, type LevelObject } from '../core/level.ts';
import { requireDef } from '../core/objects.ts';

/**
 * A procedurally dense level for performance checks (`?stress=24000`).
 * The cube runs along the floor without pressing anything, under a ceiling of
 * solid blocks and hanging spikes, through walls of scenery that move, pulse,
 * fade and spin on triggers. About 27 objects per column at speed 4.
 */
export function stressLevel(target = 24000): LevelJSON {
  const id = (k: string) => requireDef(k).id;
  const objects: LevelObject[] = [];
  const perColumn = 27;
  const start = 12;
  const columns = Math.ceil(target / perColumn);
  const length = start + columns + 12;
  const blocks = ['block', 'block_grid', 'block_panel', 'block_brick'];
  const sprinkles = ['deco_ring', 'deco_dots', 'deco_cross', 'deco_tri', 'deco_diamond', 'deco_chevron'];
  for (let c = start; c < start + columns; c++) {
    const x = c + 0.5;
    const band = Math.floor(c / 8);
    // ceiling: three rows of solid blocks with a row of spikes hanging under them (8)
    for (let r = 0; r < 3; r++) objects.push([id(blocks[(band + r) % blocks.length]!), x, 7.5 + r, { c: 1 }]);
    objects.push([id('spike'), x, 6.5, { r: 180 }]);
    objects.push([id('deco_chain'), x, 5.5 + (c % 2) * 0.5, { c: 2, z: -1 }]);
    objects.push([id('deco_bar'), x - 0.25, 10.5, { c: 2 }]);
    objects.push([id('deco_bar'), x + 0.25, 10.5, { c: 3 }]);
    objects.push([id('deco_zigzag'), x, 6.25 - 0.5, { c: 3, z: -1 }]);
    // background wall: 6 tiles, half of them in moving groups 1-8 (6)
    for (let r = 0; r < 6; r++) {
      objects.push([id('deco_square'), x, 0.5 + r, (c + r) % 2 === 0 ? { c: 3, z: -2, g: [1 + ((c + r) % 8)] } : { c: 3, z: -2 }]);
    }
    // sprinkles in front of the wall (6), group 9 fades
    for (let r = 0; r < 6; r++) objects.push([id(sprinkles[(c + r) % sprinkles.length]!), x, 0.5 + r, { c: 1 + ((c + r) % 3), z: -1, g: [9] }]);
    // floor fuzz and bumps (3)
    objects.push([id('deco_fuzz'), x, 0.2, { c: 2 }]);
    objects.push([id('deco_bump'), x, 0.25, { c: 1, z: -1 }]);
    objects.push([id('deco_eq'), x, 4.5, { c: 2, z: -1 }]);
    // beat-reactive and spinning pieces (4 per column on average)
    objects.push([id('deco_star'), x, 3.5 + (c % 3), { c: 2, g: [10] }]);
    objects.push([id(c % 2 ? 'deco_glow' : 'deco_beatring'), x, 2.5 + (c % 4), { c: 3, z: -2 }]);
    objects.push([id(c % 2 ? 'deco_gear' : 'deco_burst'), x, 5 - (c % 2), { c: 1, z: -2, g: [10] }]);
    objects.push([id('deco_arrow'), x, 1.5 + (c % 3), { c: 2, g: [(c % 8) + 1] }]);
    // triggers (about 0.4 per column)
    if (c % 8 === 0) objects.push([id('trig_move'), x, 12, { t: 1 + (band % 8), dy: band % 2 ? -0.5 : 0.5, d: 0.4, e: 'qio' }]);
    if (c % 16 === 4) objects.push([id('trig_color'), x, 13, { t: 1, col: band % 4 < 2 ? '#5cc8ff' : '#ff7ad9', d: 0.6 }]);
    if (c % 32 === 8) objects.push([id('trig_color'), x, 14, { t: 'bg', col: band % 8 < 4 ? '#2b2fd6' : '#8a2fc4', d: 1 }]);
    if (c % 5 === 0) objects.push([id('trig_pulse'), x, 15, { t: 2, col: '#ffffff', fi: 0.02, hold: 0.05, fo: 0.2 }]);
    if (c % 24 === 12) objects.push([id('trig_alpha'), x, 16, { t: 9, op: band % 2 ? 1 : 0.4, d: 0.5 }]);
    if (c % 20 === 10) objects.push([id('trig_rotate'), x, 17, { t: 10, deg: 90, d: 0.5 }]);
  }
  const meta = {
    ...defaultMeta(),
    name: `Stress ${objects.length}`,
    song: 'kite-circuit',
    bpm: 140,
    speed: 3,
    length,
    colors: { ...defaultMeta().colors, bg: '#2b2fd6', g: '#1a1c8f', '1': '#5cc8ff', '2': '#ff6ad5', '3': '#7a6cff' },
  };
  return { v: 1, meta, objects };
}
