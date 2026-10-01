// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import { CircuitCache, serveSolve } from '../../../../../../api/_lib/circuit/service';
import { CircuitEngineError, type CircuitTransport } from '@/services/circuitClient';
import { useCircuitAnalysis, type AnalysisInput } from './useCircuitAnalysis';

const part = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 5, y: 5, rotation: 0, flipH: false, flipV: false, label: id, props });
const link = (id: string, a: string, at: string, b: string, bt: string): CircuitWire => ({ id, fromComp: a, fromTerm: at, toComp: b, toTerm: bt, path: [[0, 0], [9, 9]], routing: 'orthogonal' });
const components = [part('V1', 'dc-voltage', { voltage: 12 }), part('R1', 'resistor', { resistance: 1000 }), part('R2', 'resistor', { resistance: 2000 }), part('G', 'ground')];
const wires = [link('w1', 'V1', 'pos', 'R1', 'a'), link('w2', 'R1', 'b', 'R2', 'a'), link('w3', 'R2', 'b', 'G', 'gnd'), link('w4', 'V1', 'neg', 'G', 'gnd')];
const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({ components, wires, method: 'nodal', targetResistor: '', targetSource: '', nodalNodes: [], enabled: true, ...over });

const loopback = (cache = new CircuitCache()): { transport: CircuitTransport; calls: Array<Record<string, any>> } => {
  const calls: Array<Record<string, any>> = [];
  return {
    calls,
    transport: async (body) => {
      const wire = JSON.parse(JSON.stringify(body)); calls.push(wire);
      const result = await serveSolve(wire, cache);
      if (result.status !== 200) throw new CircuitEngineError(String(result.body.error), result.status);
      return JSON.parse(JSON.stringify(result.body));
    },
  };
};

describe('useCircuitAnalysis', () => {
  it('fetches the derivation and the netlist from the server, and refetches when the method changes', async () => {
    const { transport, calls } = loopback();
    const { result, rerender } = renderHook((props: AnalysisInput) => useCircuitAnalysis(props, transport), { initialProps: input() });
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.trace?.status).toBe('ready'));
    expect(result.current.trace?.method).toBe('nodal');
    expect(result.current.elements.map((e) => e.id).sort()).toEqual(['R1', 'R2', 'V1']);
    rerender(input({ method: 'thevenin', targetResistor: 'R2' }));
    await waitFor(() => expect(result.current.trace?.method).toBe('thevenin'));
    expect(calls[0].circuit).toBeTruthy();
    expect(calls[calls.length - 1].circuit).toBeUndefined(); // same circuit: only the hash travels
  });

  it('makes no request when disabled (AC circuits) and reports server failures as an error, not a crash', async () => {
    const { transport, calls } = loopback();
    const { result } = renderHook(() => useCircuitAnalysis(input({ enabled: false }), transport));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls).toHaveLength(0);
    expect(result.current.trace).toBeNull();

    const failing: CircuitTransport = async () => { throw new CircuitEngineError('Cannot reach the simulation engine'); };
    const { result: broken } = renderHook(() => useCircuitAnalysis(input(), failing));
    await waitFor(() => expect(broken.current.error).toBe('Cannot reach the simulation engine'));
    expect(broken.current.pending).toBe(false);
  });
});
