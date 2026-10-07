/**
 * Master dimensions of the fluid symbol set (ISO 1219 on a 20 px module).
 * Every body size, port position and stub length is a multiple of the grid, so terminals land on
 * canvas grid points and parts of different kinds keep believable proportions to each other.
 */
export const FLUID_GRID_SIZE = 20;

/** Directional / pressure-control valves: every envelope chamber is one square. */
export const VALVE_SQUARE_SIZE = 60; // 3 grid units

/** Cylinders are the dominant physical size. */
export const CYLINDER_BARREL_WIDTH = 160; // 8 grid units
export const CYLINDER_BARREL_HEIGHT = 60; // 3 grid units

/** Service-equipment diamonds: a 3 × 3 unit square turned through 45°. */
export const FRL_DIAMOND_SIZE = 60;

/** Shuttle (OR), dual-pressure (AND) and quick-exhaust envelopes: the size of a 2-chamber directional valve. */
export const LOGIC_VALVE_WIDTH = 2 * VALVE_SQUARE_SIZE; // 6 grid units
export const LOGIC_VALVE_HEIGHT = VALVE_SQUARE_SIZE; // 3 grid units
/** Floating ball (OR, quick exhaust) and non-return ball diameter. */
export const LOGIC_ELEMENT_DIAMETER = 16;

/** Non-return valves: 100 px along the axis. */
export const CHECK_VALVE_WIDTH = 100;
export const CHECK_VALVE_HEIGHT = 40; // 2 grid units

/** One-way flow control: a dash-dot housing the size of a 2-chamber valve. */
export const ONE_WAY_FLOW_CONTROL_WIDTH = 2 * VALVE_SQUARE_SIZE;
export const ONE_WAY_FLOW_CONTROL_HEIGHT = VALVE_SQUARE_SIZE;

/**
 * Time-delay valve: a dash-dot housing around the throttle / check / reservoir pilot chain and a 3/2 NC valve.
 * The origin is the centre of the valve's rest chamber, as for every directional valve; port 12 enters on the far left.
 */
export const TIME_DELAY = {
  /** Terminals: 1 and 3 below, 2 above (the 3/2 columns −20 / 0 / +20), 12 at the left end of the pilot chain. */
  p1: -20,
  p2: 0,
  p3: 20,
  pilotX: -220,
  /** Housing edges (the actuated chamber slides 60 px to the right, taking its spring cap with it). */
  left: -200,
  right: 126,
  /** Overall extent from the pilot terminal to the housing, centred for hit-testing. */
  width: 126 + 220,
  height: 120,
  centerX: (126 - 220) / 2,
} as const;

/** Motors, pumps and rotary actuators share one circular housing. */
export const ROTARY_HOUSING_DIAMETER = 60;

/** Length of the line between a body and its terminal, and of every end-cap actuator. */
export const PORT_STUB_LENGTH = 30;
export const END_CAP_LENGTH = 30;

/** Cylinder detail (all relative to the barrel centre). */
export const CYLINDER = {
  /** End flanges protrude this far above and below the barrel. */
  flange: 6,
  flangeWidth: 6,
  /** The piston disc spans the whole interior. */
  interiorHeight: 54,
  /** Piston travel; the rod is rigid, so the rod tip moves by the same amount. */
  travel: 80,
  /** Rod length outside the front cap at 0 % and at 100 % stroke. */
  rodOutsideRetracted: 40,
  rodOutsideExtended: 120,
  /** Piston-centre position at 0 % stroke (the piston travels ±travel/2 about the middle). */
  pistonRest: -40,
  /** Rod length from the piston face to its tip (rigid). */
  rodLength: 160,
  /** Both working ports leave the bottom edge at ±portX. */
  portX: 60,
} as const;

/** Line weights as multiples of the outline width (2 px at the default scale): 2 / 1.5 / 1. */
export const STROKE_SCALE = { outline: 1, detail: 0.75, dashed: 0.5 } as const;
export const DASH_PATTERN = '3,3';

/** One arrowhead everywhere: same length and the same half-width. */
export const ARROW_LENGTH = 8;
export const ARROW_HALF_WIDTH = 3.5;

export const isOnGrid = (value: number): boolean => Math.abs(value / FLUID_GRID_SIZE - Math.round(value / FLUID_GRID_SIZE)) < 1e-9;
