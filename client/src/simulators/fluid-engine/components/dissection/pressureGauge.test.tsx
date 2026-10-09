// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { defaultFluidProps, getFluidDefinition } from '../../models/fluidCatalog';
import { PressureGaugeCutaway } from './PressureGaugeCutaway';
import { gaugeAngle } from './AirReservoirCutaway';
import { analyzeCutaway, cutawayKindOf, type CutawayComponent } from './cutawayPhysics';
import { cutawayTheme } from './cutawayParts';

afterEach(cleanup);
const part = (id: string, type: string): CutawayComponent => ({ id, type, label: id, props: defaultFluidProps(getFluidDefinition(type)!) });

describe('standalone pressure gauge cutaway', () => {
  it('reuses the receiver gauge dial and deflects the needle in proportion to the port pressure', () => {
    const gauge = part('g', 'pressure-gauge');
    expect(cutawayKindOf(gauge)).toBe('gauge');
    const engine = new FluidEngine({ components: [part('src', 'pressure-source'), gauge], wires: [{ id: 'w', fromComp: 'src', fromTerm: 'out', toComp: 'g', toTerm: 'p' }] } as never);
    const analysis = analyzeCutaway(gauge, engine.step(0.5))!;
    expect(analysis.kind).toBe('gauge');
    const c = render(<PressureGaugeCutaway analysis={analysis as never} medium="PNEUMATIC" theme={cutawayTheme(false)} />).container;
    expect(c.querySelector('.micro-gauge')).not.toBeNull();
    expect(Number(c.querySelector('.gauge-needle')!.getAttribute('data-angle'))).toBeCloseTo(gaugeAngle(6), 1);
  });
});
