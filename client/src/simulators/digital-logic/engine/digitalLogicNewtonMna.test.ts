import { describe, expect, it } from 'vitest';
import { shockleyCurrent, TabDNewtonMna } from '@/simulators/digital-logic/engine/digitalLogicNewtonMna';

describe('Tab D Newton-Raphson nonlinear MNA', () => {
  it('converges a Shockley silicon-diode bias circuit to a physical forward voltage', () => {
    const result = new TabDNewtonMna().solve(
      [
        { kind: 'voltage', id: 'V1', positive: 'supply', negative: '0', voltage: 5 },
        { kind: 'resistor', id: 'R1', positive: 'supply', negative: 'anode', resistance: 1000 },
      ],
      [{
        id: 'D1', positive: 'anode', negative: '0', controls: ['anode'],
        current: voltages => shockleyCurrent(voltages.anode ?? 0, 1e-12),
      }],
      1e-3,
      { maxIterations: 80, damping: 0.55 },
    );
    expect(result.nodeVoltages.anode).toBeGreaterThan(0.45);
    expect(result.nodeVoltages.anode).toBeLessThan(0.9);
    expect(result.branchCurrents.R1).toBeGreaterThan(0.004);
    expect(result.branchCurrents.R1).toBeLessThan(0.0046);
  });
});
