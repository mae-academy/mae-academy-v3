import { ACTUATOR, BOTTOM_SCREW_Y, CONTACT, INPUT_TERMINAL_X, inputRowY, LOAD_X, loadY, OUTPUT_TERMINAL_X, RAIL, SCREW_R, SUPPLY, SUPPLY_TERMINAL_X, TOP_SCREW_Y } from './geometry';

/**
 * Conductor routes of the bench. Every route is a list of grid points joined by strictly horizontal
 * or vertical segments (checked by `isOrthogonal`), so nothing is ever drawn on a diagonal.
 *
 * Inputs leave their switch to the right, climb a private vertical channel, run along a private bus
 * lane above the unit and drop straight onto their screw. Lanes and channels are unique per input,
 * so wires only ever meet at right angles.
 */
export type Point = readonly [number, number];
export type Route = readonly Point[];

export const HOT_LANE_Y = 90;
export const FEED_Y = 620;
const INPUT_CHANNEL_X = (index: number): number => 322 + index * 11;
const INPUT_BUS_Y = (index: number): number => 104 + index * 6;
const OUTPUT_LANE_Y = (index: number): number => 600 - index * 8;
const OUTPUT_CHANNEL_X = (index: number): number => 894 + index * 12;

const topScrewEntry = TOP_SCREW_Y - SCREW_R;
const bottomScrewEntry = BOTTOM_SCREW_Y + SCREW_R;

/** Switch output -> input screw. */
export function inputRoute(index: number): Route {
  const y = inputRowY(index);
  const x = INPUT_TERMINAL_X[index] ?? 0;
  return [[CONTACT.to, y], [INPUT_CHANNEL_X(index), y], [INPUT_CHANNEL_X(index), INPUT_BUS_Y(index)], [x, INPUT_BUS_Y(index)], [x, topScrewEntry]];
}

/** L1 / L+: from the hot rail straight across, then down onto its screw. */
export const lineRoute = (): Route => [[RAIL.hotX, HOT_LANE_Y], [SUPPLY_TERMINAL_X[0], HOT_LANE_Y], [SUPPLY_TERMINAL_X[0], topScrewEntry]];

/** N / M: from the neutral rail down onto its screw (a branch off the rail). */
export const neutralRoute = (): Route => [[SUPPLY_TERMINAL_X[1], RAIL.retY], [SUPPLY_TERMINAL_X[1], topScrewEntry]];

/** Neutral rail: supply box -> right edge -> down past the last wired load. */
export const neutralRail = (wiredOutputs: readonly number[] = [0, 1, 2, 3]): Route => {
  const lastWired = Math.max(-1, ...wiredOutputs);
  const bottom = lastWired < 0 ? RAIL.retY : Math.max(loadY(lastWired) + 20, RAIL.retY);
  return [[SUPPLY.x + SUPPLY.w, RAIL.retY], [RAIL.retX, RAIL.retY], [RAIL.retX, bottom]];
};

/** Hot rail: supply box -> down the left edge -> along the bottom feeder. */
export const hotRail = (outputs: readonly number[] = OUTPUT_TERMINAL_X.map((_, index) => index)): Route => {
  const last = Math.max(-1, ...outputs);
  return last < 0 ? [[RAIL.hotX, SUPPLY.y + SUPPLY.h], [RAIL.hotX, HOT_LANE_Y]] : [[RAIL.hotX, SUPPLY.y + SUPPLY.h], [RAIL.hotX, FEED_Y], [OUTPUT_TERMINAL_X[last]?.[0] ?? RAIL.hotX, FEED_Y]];
};

/** Relay common (terminal 1): drops from the bottom feeder. */
export const relayFeedRoute = (index: number): Route => [[OUTPUT_TERMINAL_X[index]?.[0] ?? 0, FEED_Y], [OUTPUT_TERMINAL_X[index]?.[0] ?? 0, bottomScrewEntry]];

/** Relay contact (terminal 2) -> load. */
export function outputRoute(index: number): Route {
  const x = OUTPUT_TERMINAL_X[index]?.[1] ?? 0;
  const y = loadY(index);
  return [[x, bottomScrewEntry], [x, OUTPUT_LANE_Y(index)], [OUTPUT_CHANNEL_X(index), OUTPUT_LANE_Y(index)], [OUTPUT_CHANNEL_X(index), y], [LOAD_X - 18, y]];
}

/** Load -> neutral rail. */
export const returnRoute = (index: number): Route => [[LOAD_X + 18, loadY(index)], [RAIL.retX, loadY(index)]];

/** Where the branch off the hot rail leaves it (junction dots). */
export const hotBranches = (rows: readonly number[] = INPUT_TERMINAL_X.map((_, index) => index), feeder = true): readonly Point[] => [
  [RAIL.hotX, HOT_LANE_Y],
  ...(feeder ? [[RAIL.hotX, FEED_Y] as Point] : []),
  ...rows.map((index): Point => [RAIL.hotX, inputRowY(index)]),
];

export const neutralBranches = (wiredOutputs: readonly number[] = [0, 1, 2, 3]): readonly Point[] => [
  [SUPPLY_TERMINAL_X[1], RAIL.retY],
  ...wiredOutputs.map((index): Point => [RAIL.retX, loadY(index)]),
];

export const switchFeed = (): { readonly from: number; readonly to: number } => ({ from: RAIL.hotX, to: ACTUATOR.x });

export const toPath = (route: Route): string => route.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

/** Every segment is horizontal or vertical and has non-zero length. */
export function isOrthogonal(route: Route): boolean {
  return route.every((point, index) => {
    const previous = route[index - 1];
    if (!previous) return true;
    const dx = point[0] - previous[0];
    const dy = point[1] - previous[1];
    return (dx === 0) !== (dy === 0);
  });
}
