import { defaultMeta, type LevelJSON, type LevelMeta, type LevelObject, parseLevel } from '../src/core/level.ts';
import { requireDef } from '../src/core/objects.ts';
import { Simulation, type TickInput } from '../src/core/sim/sim.ts';
import { compileWorld, type World } from '../src/core/sim/world.ts';

export function obj(key: string, x: number, y: number, extra?: LevelObject[3]): LevelObject {
  const id = requireDef(key).id;
  return extra ? [id, x, y, extra] : [id, x, y];
}

export function makeLevel(objects: LevelObject[], meta: Partial<LevelMeta> = {}): LevelJSON {
  return parseLevel({ v: 1, meta: { ...defaultMeta(), length: 200, ...meta }, objects });
}

export function world(objects: LevelObject[], meta: Partial<LevelMeta> = {}): World {
  return compileWorld(makeLevel(objects, meta));
}

/** Steps a sim with a function deciding input per tick, until done or maxTicks. */
export function run(sim: Simulation, inputAt: (tick: number) => TickInput, maxTicks: number, each?: (sim: Simulation) => void): void {
  while (!sim.done && sim.state.tick < maxTicks) {
    sim.step(inputAt(sim.state.tick));
    sim.events.length = 0;
    each?.(sim);
  }
}

export const press = (at: number, len = 1) => (tick: number): TickInput => ({
  held: tick >= at && tick < at + len,
  pressed: tick === at,
});

export const idle = (): TickInput => ({ held: false, pressed: false });
