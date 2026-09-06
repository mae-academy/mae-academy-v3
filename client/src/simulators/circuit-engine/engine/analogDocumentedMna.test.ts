import { TabDDocumentedMna, TabDMnaError } from '@/simulators/circuit-engine/engine/analogDocumentedMna';
import { describe, expect, it } from 'vitest';

describe('Tab D documented MNA primitives', () => {
  it('solves the documented ideal voltage-source and resistor branch equations', () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V1', positive: 'n1', negative: '0', voltage: 10 },
      { kind: 'resistor', id: 'R1', positive: 'n1', negative: '0', resistance: 1000 },
    ]);
    expect(result.nodeVoltages.n1).toBeCloseTo(10, 10);
    expect(result.branchCurrents.R1).toBeCloseTo(0.01, 10);
    expect(result.branchCurrents.V1).toBeCloseTo(-0.01, 10);
  });

  it('uses backward-Euler capacitor history rather than a trapezoidal state', () => {
    const solver = new TabDDocumentedMna();
    const primitives = [
      { kind: 'voltage' as const, id: 'V1', positive: 'n1', negative: '0', voltage: 10 },
      { kind: 'capacitor' as const, id: 'C1', positive: 'n1', negative: '0', capacitance: 1e-6 },
    ];
    const first = solver.solve(primitives, 1e-3);
    const second = solver.solve(primitives, 1e-3);
    expect(first.branchCurrents.C1).toBeCloseTo(0.01, 10);
    expect(second.branchCurrents.C1).toBeCloseTo(0, 10);
  });

  it('uses the documented inductor current companion relation across time steps', () => {
    const solver = new TabDDocumentedMna();
    const primitives = [
      { kind: 'voltage' as const, id: 'V1', positive: 'n1', negative: '0', voltage: 10 },
      { kind: 'inductor' as const, id: 'L1', positive: 'n1', negative: '0', inductance: 1e-3 },
    ];
    expect(solver.solve(primitives, 1e-3).branchCurrents.L1).toBeCloseTo(10, 10);
    expect(solver.solve(primitives, 1e-3).branchCurrents.L1).toBeCloseTo(20, 10);
  });

  it('stamps a VCCS from its declared control voltage and branch orientation', () => {
    const result = new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'VC', positive: 'control', negative: '0', voltage: 2 },
      { kind: 'resistor', id: 'RLOAD', positive: 'out', negative: '0', resistance: 1000 },
      { kind: 'vccs', id: 'G1', positive: 'out', negative: '0', controlPositive: 'control', controlNegative: '0', transconductance: 1e-3 },
    ]);
    expect(result.nodeVoltages.out).toBeCloseTo(-2, 10);
    expect(result.branchCurrents.G1).toBeCloseTo(0.002, 10);
  });

  it('reports a singular ideal system rather than emitting a fabricated operating point', () => {
    expect(() => new TabDDocumentedMna().solve([
      { kind: 'voltage', id: 'V1', positive: 'n1', negative: '0', voltage: 1 },
      { kind: 'voltage', id: 'V2', positive: 'n1', negative: '0', voltage: 2 },
    ])).toThrow(TabDMnaError);
  });

  it('keeps the inductor companion model finite when an energized branch is opened abruptly', () => {
    const solver = new TabDDocumentedMna();
    const closed = [
      { kind: 'voltage' as const, id: 'V1', positive: 'supply', negative: '0', voltage: 12 },
      { kind: 'inductor' as const, id: 'L1', positive: 'supply', negative: 'load', inductance: 1e-3 },
      { kind: 'resistive-switch' as const, id: 'SW1', positive: 'load', negative: '0', closed: true },
    ];
    const opened = closed.map(primitive => primitive.kind === 'resistive-switch' ? { ...primitive, closed: false } : primitive);

    solver.solve(closed, 1e-5);
    const transient = solver.solve(opened, 1e-5);
    expect(Object.values(transient.nodeVoltages).every(Number.isFinite)).toBe(true);
    expect(Object.values(transient.branchCurrents).every(Number.isFinite)).toBe(true);
    expect(Math.abs(transient.nodeVoltages.load)).toBeLessThan(1e12);
  });
});
