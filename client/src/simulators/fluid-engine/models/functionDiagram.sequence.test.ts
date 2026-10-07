// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EngineWire } from '@shared/fluid/engine/types';
import { useFluidEngineBridge } from '../hooks/useFluidEngineBridge';
import { useFunctionDiagram } from '../hooks/useFunctionDiagram';
import { defaultFluidProps, getFluidDefinition, type FluidProps } from './fluidCatalog';
import { cycleView, displacementTrace } from './functionDiagram';

const part = (id: string, type: string, label: string, props: FluidProps = {}) => ({ id, type, label, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};
const roller = (id: string, label: string, sensor: string) => part(id, 'valve-3-2-nc', label, { actuationLeft: 'Roller', actuationRight: 'Spring Return', leftSensor: sensor });
const pilot = (id: string, label: string) => part(id, 'valve-5-2', label, { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' });

/** The classic sequence 1A+ → 2A+ → 1A− → 2A−: a start button and four cam rollers, 1B2 → 2A+, 2B2 → 1A−, 1B1 → 2A−. */
const components = [
  part('src', 'pressure-source', '0Z1'),
  part('start', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
  pilot('mainA', '1V2'), pilot('mainB', '2V2'),
  roller('r1b2', '1V3', 'a:S2'), roller('r2b2', '2V3', 'b:S2'), roller('r1b1', '1V4', 'a:S1'),
  part('a', 'cylinder-double', '1A1'), part('b', 'cylinder-double', '2A1'),
];
const wires = [
  pipe('src:out', 'start:p1'), pipe('src:out', 'mainA:p1'), pipe('src:out', 'mainB:p1'),
  pipe('src:out', 'r1b2:p1'), pipe('src:out', 'r2b2:p1'), pipe('src:out', 'r1b1:p1'),
  pipe('start:p2', 'mainA:pilotL'), pipe('r2b2:p2', 'mainA:pilotR'),
  pipe('r1b2:p2', 'mainB:pilotL'), pipe('r1b1:p2', 'mainB:pilotR'),
  pipe('mainA:p4', 'a:a'), pipe('mainA:p2', 'a:b'),
  pipe('mainB:p4', 'b:a'), pipe('mainB:p2', 'b:b'),
];
const IDS = ['a', 'b'];

describe('function diagram of the real sequence circuit', () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  const frame = (elapsedMs: number) => act(() => {
    clock += elapsedMs;
    const pending = frames;
    frames = [];
    pending.forEach(callback => callback(clock));
  });
  beforeEach(() => {
    frames = [];
    clock = 1000;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws one clean four-step cycle, closes it, and a second loop changes nothing but the playhead', () => {
    const { result } = renderHook(() => {
      const bridge = useFluidEngineBridge(components, wires, { medium: 'AIR', speed: 1 });
      return { bridge, tracker: useFunctionDiagram(bridge.snapshot, bridge.status, IDS) };
    });
    const press = () => {
      act(() => result.current.bridge.triggerManualInput('start', 'left', true));
      frame(100);
      act(() => result.current.bridge.triggerManualInput('start', 'left', false));
      for (let tick = 0; tick < 500; tick += 1) frame(16);
    };

    act(() => result.current.bridge.run());
    frame(100);
    press();
    const first = cycleView(result.current.tracker);
    expect(first.complete).toBe(true);
    expect(first.columns).toBe(4);
    expect(first.labels).toEqual([1, 2, 3, 4, 1]);
    expect(first.steps.map(step => step.moves.map(move => `${move.cylinderId}${move.direction === 1 ? '+' : '-'}`))).toEqual([['a+'], ['b+'], ['a-'], ['b-']]);
    expect(displacementTrace(first, 'a')).toEqual([[0, 0], [1, 1], [2, 1], [3, 0], [4, 0]]);
    expect(displacementTrace(first, 'b')).toEqual([[0, 0], [1, 0], [2, 1], [3, 1], [4, 0]]);

    press();
    const second = cycleView(result.current.tracker);
    expect(second.steps).toEqual(first.steps);
    expect(second.columns).toBe(4);
    expect(second.cycleNumber).toBe(2);
    expect(displacementTrace(second, 'a')).toEqual(displacementTrace(first, 'a'));
    expect(displacementTrace(second, 'b')).toEqual(displacementTrace(first, 'b'));

    // Reset empties the diagram.
    act(() => result.current.bridge.reset());
    expect(result.current.tracker.steps).toEqual([]);
  });
});
