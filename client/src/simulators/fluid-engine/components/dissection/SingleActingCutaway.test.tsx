// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { analyzeSingle } from './cutawayPhysics';
import { SingleActingCutaway } from './SingleActingCutaway';
import { cutawayTheme } from './cutawayParts';
import { CHAMBER, INSET, PISTON } from './cylinderGeometry';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import type { EngineSnapshot } from '@shared/fluid/engine/types';

afterEach(cleanup);

const component = { id: 's', type: 'cylinder-single', label: '1A1', props: defaultFluidProps(getFluidDefinition('cylinder-single')!) };
const snapshot = (stroke: number, bar: number): EngineSnapshot => ({
  cylinders: { s: { stroke, velocity: 0, force: 0, chamberPressureA: bar, chamberPressureB: 0 } },
  portPressure: { 's:a': bar }, nets: [], valves: {}, logic: {}, sensors: {}, motors: {}, reliefValves: {}, diagnostics: [],
} as unknown as EngineSnapshot);
const draw = (stroke: number, bar = 3) =>
  render(<SingleActingCutaway analysis={analyzeSingle(component, snapshot(stroke, bar))} medium="PNEUMATIC" theme={cutawayTheme(false)} />).container;

describe('single-acting cutaway', () => {
  it('tints only the bore: the vent channel and its passage stay hollow', () => {
    const container = draw(0.5);
    const clip = Array.from(container.querySelectorAll('clipPath rect')).map(rect => [Number(rect.getAttribute('x')), Number(rect.getAttribute('width'))]);
    expect(clip).toHaveLength(3);
    // nothing reaches into the front cap, where the vent bore runs (x ≥ the bore's front face)
    for (const [x, width] of clip) expect(x + width).toBeLessThanOrEqual(CHAMBER.x1);
  });

  it('keeps the piston and spring inside the bore at 0 %, 100 % and out-of-range strokes', () => {
    for (const stroke of [-0.3, 0, 0.5, 1, 1.4]) {
      const container = draw(stroke);
      const piston = Number(container.querySelector('.cutaway-piston')!.getAttribute('data-piston-x'));
      expect(piston, `stroke ${stroke}`).toBeGreaterThanOrEqual(CHAMBER.x0 + INSET);
      expect(piston + PISTON.width, `stroke ${stroke}`).toBeLessThanOrEqual(CHAMBER.x1 - INSET);
      const spring = Number(container.querySelector('.return-spring')!.getAttribute('data-spring-length'));
      expect(spring, `stroke ${stroke}`).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('prints the balance the engine computed', () => {
    const text = draw(1 / 6, 1.5).querySelector('[data-testid="single-balance"]')!.textContent!;
    expect(text).toContain('air 1.5 bar');
    expect(text).toContain('spring 1.5 bar equivalent');
    expect(text).toContain('balance at 17% stroke');
  });
});
