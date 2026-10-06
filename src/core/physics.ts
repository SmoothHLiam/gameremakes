/**
 * Every tunable physics number lives here.
 *
 * Units: 1 block = 30 units. Velocities in units/second, accelerations in
 * units/second². "Up" velocities in the player code are relative to gravity
 * (positive = away from the floor the player is falling toward).
 */

export const BLOCK = 30;

/** Simulation rate. The sim always steps exactly 1/TICK_RATE seconds. */
export const TICK_RATE = 240;
export const DT = 1 / TICK_RATE;

/** Horizontal speeds for the five speed portals, in blocks per second. */
export const SPEEDS_BLOCKS = [8.4, 10.4, 13.0, 15.6, 19.2] as const;
/** Same speeds in units per second. */
export const SPEEDS = SPEEDS_BLOCKS.map((b) => b * BLOCK) as readonly number[];
/** Index of "normal" speed. */
export const DEFAULT_SPEED = 1;

/** Mini portal scale applied to hitboxes and visuals. */
export const MINI_SCALE = 0.6;

/**
 * Outer (solid) hitbox per mode, in units (normal size). The outer box lands
 * on surfaces and touches hazards / orbs / pads / portals.
 */
export const HITBOX = {
  cube: { w: 30, h: 30 },
  ship: { w: 30, h: 21 },
  ball: { w: 30, h: 30 },
  ufo: { w: 30, h: 24 },
  wave: { w: 12, h: 12 },
  robot: { w: 30, h: 30 },
  spider: { w: 30, h: 22 },
  swing: { w: 30, h: 24 },
} as const;

/** Inner (death) hitbox = outer box scaled by this. Overlapping any solid kills. */
export const INNER_HITBOX_SCALE = 0.4;
/** The wave's outer box is already tiny; its inner box is a bit under half of it so it can ride slopes. */
export const WAVE_INNER_HITBOX_SCALE = 0.45;

/**
 * Landing snap: if the outer box sinks into a surface by at most this much
 * (and is moving toward it), it is pushed out on top. Scaled by size.
 */
export const SNAP_TOLERANCE = 9;
/** Extra downward reach used to keep a grounded player glued to falling slopes. */
export const SLOPE_STICK = 2;

// ---------------------------------------------------------------- cube
/** Cube jump launch velocity. Peak ≈ v²/2g ≈ 2.1 blocks. */
export const CUBE_JUMP_VELOCITY = 600;
export const CUBE_GRAVITY = 2790;
export const CUBE_TERMINAL_VELOCITY = 810;
export const MINI_CUBE_JUMP_VELOCITY = 480;
export const MINI_CUBE_GRAVITY = 2790;
/** Cube spins this many degrees over one full flat jump, snapping to 90° on landing. */
export const CUBE_DEGREES_PER_JUMP = 90;
/** Derived spin rate (deg/s) so one full jump = CUBE_DEGREES_PER_JUMP. */
export const CUBE_SPIN_RATE = CUBE_DEGREES_PER_JUMP / ((2 * CUBE_JUMP_VELOCITY) / CUBE_GRAVITY);
export const MINI_CUBE_SPIN_RATE = CUBE_DEGREES_PER_JUMP / ((2 * MINI_CUBE_JUMP_VELOCITY) / MINI_CUBE_GRAVITY);
/** How fast the cube eases to the nearest 90° once grounded (deg/s). */
export const LAND_SNAP_SPIN_RATE = 1080;

// ---------------------------------------------------------------- ship
export const SHIP_THRUST = 1500;
export const SHIP_GRAVITY = 1250;
export const SHIP_MAX_RISE = 330;
export const SHIP_MAX_FALL = 400;
export const MINI_SHIP_THRUST = 1750;
export const MINI_SHIP_GRAVITY = 1450;
export const MINI_SHIP_MAX_RISE = 360;
export const MINI_SHIP_MAX_FALL = 430;
/** Visual: max ship tilt (deg) and how quickly it follows velocity. */
export const SHIP_MAX_TILT = 50;

// ---------------------------------------------------------------- ball
export const BALL_GRAVITY = 1700;
export const BALL_TERMINAL_VELOCITY = 620;
/** Push toward the new floor when the ball flips. */
export const BALL_FLIP_VELOCITY = 180;
export const MINI_BALL_GRAVITY = 1850;
export const MINI_BALL_TERMINAL_VELOCITY = 660;
/** Visual roll rate in deg/s at normal speed (scaled by horizontal speed). */
export const BALL_SPIN_RATE = 600;

// ---------------------------------------------------------------- ufo
export const UFO_GRAVITY = 1500;
export const UFO_HOP_VELOCITY = 390;
export const UFO_TERMINAL_VELOCITY = 430;
export const MINI_UFO_GRAVITY = 1650;
export const MINI_UFO_HOP_VELOCITY = 350;
export const MINI_UFO_TERMINAL_VELOCITY = 450;

// ---------------------------------------------------------------- wave
/** Wave vertical speed = horizontal speed × slope (45° normal, ~63° mini). */
export const WAVE_SLOPE = 1;
export const MINI_WAVE_SLOPE = 2;

// ---------------------------------------------------------------- robot
export const ROBOT_JUMP_VELOCITY = 450;
export const ROBOT_GRAVITY = 2790;
export const ROBOT_TERMINAL_VELOCITY = 810;
/** Holding keeps the robot rising at ROBOT_JUMP_VELOCITY for at most this long. */
export const ROBOT_MAX_BOOST_TIME = 0.15;
export const MINI_ROBOT_JUMP_VELOCITY = 380;
export const MINI_ROBOT_MAX_BOOST_TIME = 0.12;

// ---------------------------------------------------------------- spider
export const SPIDER_GRAVITY = 2790;
export const SPIDER_TERMINAL_VELOCITY = 810;
/** If the spider teleports with nothing above it, it shoots this fast instead. */
export const SPIDER_NO_SURFACE_VELOCITY = 810;

// ---------------------------------------------------------------- swing
export const SWING_GRAVITY = 2000;
export const SWING_MAX_VELOCITY = 360;
/** Fraction of vertical velocity kept (world space) when the swing flips. */
export const SWING_FLIP_KEEP = 0.5;
export const MINI_SWING_GRAVITY = 2200;
export const MINI_SWING_MAX_VELOCITY = 390;

// ---------------------------------------------------------------- velocity caps
/** When an impulse pushes a capped mode past its cap, it bleeds off at this rate. */
export const OVERSPEED_DECAY = 2400;

// ---------------------------------------------------------------- portals
/** Vertical velocity is multiplied by this when entering a new mode. */
export const MODE_CHANGE_VELOCITY_KEEP = 0.5;
/** ... and when a gravity portal flips gravity (world-space velocity). */
export const GRAVITY_PORTAL_VELOCITY_KEEP = 0.5;
/** Default play-area heights (blocks) for bounded modes. */
export const BOUNDS_HEIGHT = {
  ship: 10,
  ball: 8,
  ufo: 10,
  wave: 10,
  spider: 8,
  swing: 10,
  dual: 10,
} as const;

// ---------------------------------------------------------------- orbs & pads
/** Press buffer: a press stays "fresh" for this many extra ticks. */
export const PRESS_BUFFER_TICKS = 2;

/** Orb impulses (cube scale, units/s, relative to gravity). */
export const ORB_JUMP_VELOCITY = 600;
export const ORB_SMALL_VELOCITY = 430;
export const ORB_BIG_VELOCITY = 830;
/** Gravity orb: flips gravity and pushes toward the new floor. */
export const ORB_GRAVITY_PUSH = 300;
/** Flip-jump orb: flips gravity and jumps away from the new floor. */
export const ORB_FLIP_JUMP_VELOCITY = 600;
/** Slam orb: driven hard toward the floor. */
export const ORB_SLAM_VELOCITY = 810;

export const PAD_JUMP_VELOCITY = 800;
export const PAD_SMALL_VELOCITY = 550;
export const PAD_BIG_VELOCITY = 990;
export const PAD_GRAVITY_PUSH = 400;

/** Orb / pad impulse multiplier per mode. Wave ignores jump impulses. */
export const IMPULSE_MODE_SCALE = {
  cube: 1,
  ship: 0.6,
  ball: 0.7,
  ufo: 0.72,
  wave: 0,
  robot: 1,
  spider: 1,
  swing: 0.6,
} as const;
/** Mini players get this extra multiplier on orb / pad impulses. */
export const MINI_IMPULSE_SCALE = 0.8;

/** Dash orb: max dash angle (deg) from horizontal. */
export const DASH_MAX_ANGLE = 75;

// ---------------------------------------------------------------- hazards
/** Spike hitbox relative to the spike's 1×1 cell (blocks): small core box. */
export const SPIKE_HITBOX = { w: 0.2, h: 0.4, cy: 0.333 } as const;
/** Saws: circular hitbox at this fraction of the visual radius. */
export const SAW_HITBOX_SCALE = 0.65;

// ---------------------------------------------------------------- world
/** Death if a player gets this far above the highest object in an unbounded section. */
export const WORLD_TOP_MARGIN = 30 * BLOCK;
/** Empty run-out after the last object before the level ends. */
export const END_PADDING = 10 * BLOCK;
/** Spatial chunk width (units). */
export const CHUNK_WIDTH = 4 * BLOCK;
/** Player spawn x (units) — center of the player. */
export const SPAWN_X = 0;
