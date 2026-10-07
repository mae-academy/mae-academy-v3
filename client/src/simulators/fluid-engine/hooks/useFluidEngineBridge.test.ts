// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EngineComponent, EngineMedium, EngineWire } from '@shared/fluid/engine/types';
import { ENGINE_TICK, snapshotChanged, useFluidEngineBridge } from './useFluidEngineBridge';

const part = (id: string, type: string, props: Record<string, unknown> = {}): EngineComponent => ({ id, type, props });
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};

/** Source → pushbutton 3/2 NC → single-acting cylinder. */
const components = [
  part('src', 'pressure-source'),
  part('v', 'valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
  part('cyl', 'cylinder-single'),
];
const wires = [pipe('src:out', 'v:p1'), pipe('v:p2', 'cyl:a')];

interface Props { components: EngineComponent[]; wires: EngineWire[]; medium: EngineMedium; speed: number }
const mount = (overrides: Partial<Props> = {}) => renderHook(
  (props: Props) => useFluidEngineBridge(props.components, props.wires, { medium: props.medium, speed: props.speed }),
  { initialProps: { components, wires, medium: 'AIR', speed: 1, ...overrides } as Props },
);

/** Manually driven animation frames, so the loop is deterministic. */
let frames: FrameRequestCallback[] = [];
let clock = 1000;
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

describe('useFluidEngineBridge', () => {
  it('mirrors the schematic into the engine and starts idle', () => {
    const { result } = mount();
    expect(result.current.status).toBe('IDLE');
    expect(result.current.snapshot.time).toBe(0);
    expect(result.current.snapshot.valves.v).toMatchObject({ position: 0, envelope: 1, spoolOffset: 0 });
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('single-steps one engine tick and stays paused', () => {
    const { result } = mount();
    act(() => result.current.step());
    expect(result.current.status).toBe('PAUSED');
    expect(result.current.snapshot.time).toBeCloseTo(ENGINE_TICK);
    expect(result.current.snapshot.portPressure['v:p1']).toBe(6);
    expect(result.current.snapshot.portPressure['cyl:a']).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('dispatches manual inputs to the engine', () => {
    const { result } = mount();
    act(() => result.current.triggerManualInput('v', 'left', true));
    expect(result.current.manualInputs.v).toEqual({ left: true, right: false });
    act(() => result.current.step());
    expect(result.current.snapshot.valves.v).toMatchObject({ position: 1, envelope: 0, spoolOffset: 1 });
    expect(result.current.snapshot.portPressure['cyl:a']).toBe(6);

    act(() => result.current.triggerManualInput('v', 'left', false));
    act(() => result.current.step());
    expect(result.current.snapshot.valves.v.position).toBe(0);
    expect(result.current.snapshot.portPressure['cyl:a']).toBe(0);
  });

  it('runs the engine from animation frames in fixed ticks, scaled by the speed', () => {
    const { result, rerender } = mount();
    act(() => result.current.run());
    expect(result.current.status).toBe('RUNNING');
    expect(frames).toHaveLength(1);

    frame(100); // 0.1 s of real time → 6 whole ticks
    expect(result.current.snapshot.time).toBeCloseTo(6 * ENGINE_TICK);

    rerender({ components, wires, medium: 'AIR', speed: 2 });
    frame(50); // 0.1 s of simulated time on top of the 4 ms carried over → 6 more ticks
    expect(result.current.snapshot.time).toBeCloseTo(12 * ENGINE_TICK);

    act(() => result.current.pause());
    expect(result.current.status).toBe('PAUSED');
    expect(frames).toHaveLength(0);
  });

  it('drops the backlog after a long stall instead of fast-forwarding', () => {
    const { result } = mount({ speed: 4 });
    act(() => result.current.run());
    frame(5000);
    expect(result.current.snapshot.time).toBeCloseTo(12 * ENGINE_TICK);
    frame(16);
    expect(result.current.snapshot.time).toBeCloseTo(16 * ENGINE_TICK);
  });

  it('moves the cylinder while running and resets everything', () => {
    const { result } = mount();
    act(() => result.current.triggerManualInput('v', 'left', true));
    act(() => result.current.run());
    for (let i = 0; i < 20; i += 1) frame(100);
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(1);
    expect(result.current.snapshot.sensors['cyl:S2']).toBe(true);

    act(() => result.current.reset());
    expect(result.current.status).toBe('IDLE');
    expect(result.current.manualInputs).toEqual({});
    expect(result.current.snapshot.time).toBe(0);
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(0);
    expect(result.current.snapshot.portPressure['v:p1']).toBe(0);
    expect(frames).toHaveLength(0);
  });

  it('applies edits immediately while idle, and keeps simulation state across edits once started', () => {
    const { result, rerender } = mount();
    const actuated = components.map(c => (c.id === 'v' ? part('v', c.type, { ...c.props, initialState: 'Actuated position' }) : c));
    rerender({ components: actuated, wires, medium: 'AIR', speed: 1 });
    expect(result.current.snapshot.valves.v.position).toBe(1);

    rerender({ components, wires, medium: 'AIR', speed: 1 });
    act(() => result.current.triggerManualInput('v', 'left', true));
    act(() => result.current.run());
    for (let i = 0; i < 20; i += 1) frame(100);
    act(() => result.current.pause());
    rerender({ components: [...components, part('gauge', 'pressure-gauge')], wires: [...wires, pipe('v:p2', 'gauge:p')], medium: 'AIR', speed: 1 });
    expect(result.current.status).toBe('PAUSED');
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(1);
    expect(result.current.snapshot.portPressure['gauge:p']).toBe(6);
  });

  it('does not rebuild the network when a part is only moved', () => {
    const { result, rerender } = mount();
    act(() => result.current.step());
    const before = result.current.snapshot;
    // Same ids, types, props and pipes in fresh arrays — what a drag produces.
    rerender({ components: components.map(c => ({ ...c })), wires: wires.map(w => ({ ...w })), medium: 'AIR', speed: 1 });
    expect(result.current.snapshot).toBe(before);
  });

  it('starts a fresh engine when the medium changes', () => {
    const { result, rerender } = mount();
    act(() => result.current.step());
    expect(result.current.snapshot.medium).toBe('AIR');
    rerender({ components, wires, medium: 'OIL', speed: 1 });
    expect(result.current.status).toBe('IDLE');
    expect(result.current.snapshot.medium).toBe('OIL');
    expect(result.current.snapshot.time).toBe(0);
  });
});

describe('snapshotChanged', () => {
  it('ignores sub-resolution clock changes but reports anything that draws differently', () => {
    const { result } = mount();
    const base = result.current.snapshot;
    expect(snapshotChanged(base, { ...base, time: base.time + 0.016 })).toBe(false);
    expect(snapshotChanged(base, { ...base, time: base.time + 0.2 })).toBe(true);
    expect(snapshotChanged(base, { ...base, portPressure: { ...base.portPressure, 'v:p1': 6 } })).toBe(true);
    expect(snapshotChanged(base, { ...base, cylinders: { cyl: { ...base.cylinders.cyl, stroke: 0.5 } } })).toBe(true);
    expect(snapshotChanged(base, { ...base, valves: { v: { ...base.valves.v, envelope: 0 } } })).toBe(true);
  });
});
