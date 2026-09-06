import { describe, expect, it } from 'vitest';
import { measureResistanceWithTestSource } from '@/simulators/circuit-engine/engine/simulation';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';

describe('Tab B DMM resistance test-source method', () => {
  it('reports a 12-ohm branch as 12 base ohms with a 1 A test current', () => {
    const circuit: MNAElement[] = [{ type: 'resistor', id: 'R12', positive: 'probe-hi', negative: '0', resistance: 12 }];
    expect(measureResistanceWithTestSource(circuit, 'probe-hi', '0')).toBeCloseTo(12, 10);
  });

  it('deactivates independent voltage sources before applying the resistance test', () => {
    const circuit: MNAElement[] = [
      { type: 'voltage', id: 'Vs', positive: 'probe-hi', negative: '0', voltage: 24 },
      { type: 'resistor', id: 'R12', positive: 'probe-hi', negative: '0', resistance: 12 },
    ];
    expect(measureResistanceWithTestSource(circuit, 'probe-hi', '0')).toBeCloseTo(0, 10);
  });
});
