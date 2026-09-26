import { describe, expect, it } from 'vitest';
import { BOTTOM_SCREW_Y, INPUT_TERMINAL_X, inputRowY, LOAD_X, loadY, OUTPUT_TERMINAL_X, SCREW_R, SUPPLY_TERMINAL_X, TOP_SCREW_Y } from './geometry';
import { hotRail, inputRoute, isOrthogonal, lineRoute, neutralRail, neutralRoute, outputRoute, relayFeedRoute, returnRoute, type Route } from './routing';

const last = (route: Route) => route[route.length - 1];
const first = (route: Route) => route[0];

describe('bench wiring geometry', () => {
  const inputs = INPUT_TERMINAL_X.map((_, i) => inputRoute(i));
  const outputs = OUTPUT_TERMINAL_X.map((_, i) => outputRoute(i));
  const all: Route[] = [...inputs, ...outputs, lineRoute(), neutralRoute(), hotRail(), neutralRail(), ...OUTPUT_TERMINAL_X.map((_, i) => relayFeedRoute(i)), ...OUTPUT_TERMINAL_X.map((_, i) => returnRoute(i))];

  it('has no diagonal or zero-length segment anywhere', () => {
    for (const route of all) expect(isOrthogonal(route)).toBe(true);
  });

  it('lands every route exactly on its terminal', () => {
    inputs.forEach((route, i) => {
      expect(first(route)?.[1]).toBe(inputRowY(i));
      expect(last(route)).toEqual([INPUT_TERMINAL_X[i], TOP_SCREW_Y - SCREW_R]);
    });
    expect(last(lineRoute())).toEqual([SUPPLY_TERMINAL_X[0], TOP_SCREW_Y - SCREW_R]);
    expect(last(neutralRoute())).toEqual([SUPPLY_TERMINAL_X[1], TOP_SCREW_Y - SCREW_R]);
    outputs.forEach((route, i) => {
      expect(first(route)).toEqual([OUTPUT_TERMINAL_X[i]?.[1], BOTTOM_SCREW_Y + SCREW_R]);
      expect(last(route)).toEqual([LOAD_X - 18, loadY(i)]);
    });
  });

  it('gives each input a private channel and bus lane, so no two wires overlap', () => {
    const verticals = new Set(inputs.map((r) => r[1]?.[0]));
    const lanes = new Set(inputs.map((r) => r[3]?.[1]));
    expect(verticals.size).toBe(8);
    expect(lanes.size).toBe(8);
    expect(new Set(outputs.map((r) => r[1]?.[1])).size).toBe(4);
  });

  it('keeps the ten top terminals evenly spaced in physical order L1, N, I1..I8', () => {
    const xs = [...SUPPLY_TERMINAL_X, ...INPUT_TERMINAL_X];
    const pitch = new Set(xs.slice(1).map((x, i) => x - (xs[i] ?? 0)));
    expect([...pitch]).toEqual([34]);
  });
});
