/**
 * Bench layout in SVG user units (the viewBox). The Basic unit is drawn at 380 x 410 units, i.e. the
 * 72 x 90 mm (4 SU) housing at ~5.2 units/mm; everything else is placed around it like a small
 * control cabinet: supply and breaker top-left, field devices on the left, loads on the right, and
 * every conductor routed on an orthogonal grid (see routing.ts).
 */

export const VIEW = { w: 1200, h: 680 } as const;

export const SUPPLY = { x: 14, y: 8, w: 150, h: 70 } as const;

/** Hot rail (L1 / L+) runs down the left edge; the return rail (N / M) along the top and right edge. */
export const RAIL = { hotX: 40, hotBottom: 640, retY: 48, retX: 1164, retBottom: 520 } as const;

export const DEVICE = { x: 410, y: 150, w: 380, h: 410 } as const;

export const TOP_SCREW_Y = 172;
export const BOTTOM_SCREW_Y = 534;
export const SCREW_R = 9;

/**
 * Terminal anchors of the 230RC: ten evenly spaced screws across the 72 mm housing on top
 * (L1, N, I1..I8, 34 units = 6.5 mm pitch) and four two-screw relay pairs below, one pair per quarter.
 */
export const SUPPLY_TERMINAL_X = [447, 481] as const;
export const INPUT_TERMINAL_X = [515, 549, 583, 617, 651, 685, 719, 753] as const;
/** Q1..Q4, each a floating two-terminal (1, 2) dry contact. */
export const OUTPUT_TERMINAL_X = [
  [445, 471],
  [540, 566],
  [635, 661],
  [730, 756],
] as const;
/** Isolation barriers between supply and inputs, and between the two input groups. */
export const BARRIER_X = { supply: 498, group: 634 } as const;

export const LCD = { x: 442, y: 254, cellW: 16, cellH: 23, cols: 12, rows: 4 } as const;

/**
 * Four identical 24 × 24 square arrow keys in a plus-shaped cluster; ESC / OK in a column beside it.
 * The d-pad is derived from a single centre and stride so the symmetry is enforced structurally.
 */
export const KEY_SIZE = { w: 24, h: 24 } as const;
export const CMD_KEY_SIZE = { w: 30, h: 22 } as const;
const DPAD_CENTER = { x: 690, y: 300 } as const;
const DPAD_STRIDE = 30;
export const KEYPAD = {
  up:    { x: DPAD_CENTER.x,               y: DPAD_CENTER.y - DPAD_STRIDE },
  left:  { x: DPAD_CENTER.x - DPAD_STRIDE, y: DPAD_CENTER.y },
  right: { x: DPAD_CENTER.x + DPAD_STRIDE, y: DPAD_CENTER.y },
  down:  { x: DPAD_CENTER.x,               y: DPAD_CENTER.y + DPAD_STRIDE },
  esc:   { x: 758, y: DPAD_CENTER.y - 18 },
  ok:    { x: 758, y: DPAD_CENTER.y + 18 },
} as const;

export const inputRowY = (index: number): number => 150 + index * 58;
export const ACTUATOR = { x: 120, w: 80, h: 34 } as const;
export const CONTACT = { from: 222, to: 284 } as const;
/** Device-type badge, on the label line above each actuator / load. */
export const BADGE = { w: 66, h: 16 } as const;

export const LOAD_X = 1000;
export const loadY = (index: number): number => 190 + index * 104;
