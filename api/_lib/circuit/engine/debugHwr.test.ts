import { describe, it } from 'vitest';
import type { CircuitComponent, CircuitWire } from '../../../../shared/circuit/circuitTypes';
import { TabDSimulationEngine } from './analogSimulation';

const component = (id: string, type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: id, props });
const wire = (id: string, fromComp: string, fromTerm: string, toComp: string, toTerm: string): CircuitWire => ({ id, fromComp, fromTerm, toComp, toTerm, routing: 'orthogonal', path: [[0, 0], [20, 0]] });

describe('HWR debug', () => {
  it('prints phase diffs', () => {
    const hwrComponents = [
      component('VAC', 'ac-voltage', { amplitude: 10, frequency: 60 }),
      component('D1', 'diode'),
      component('R1', 'resistor', { resistance: 100 }),
      component('GND', 'ground'),
    ];
    const hwrWires = [
      wire('w_in', 'VAC', 'pos', 'D1', 'anode'),
      wire('w_mid', 'D1', 'cathode', 'R1', 'a'),
      wire('w_out', 'R1', 'b', 'VAC', 'neg'),
      wire('w_gnd', 'VAC', 'neg', 'GND', 'gnd'),
    ];
    const hwrEngine = new TabDSimulationEngine();
    hwrEngine.setCircuit(hwrComponents, hwrWires);

    const snap0 = hwrEngine.step(0.016);
    const hwrPhases: number[] = [snap0.wirePhases?.['w_mid'] ?? 0];
    const hwrCurrents: number[] = [snap0.wireCurrents?.['w_mid'] ?? 0];
    for (let i = 1; i < 60; i++) {
      const snap = hwrEngine.step(0.016);
      hwrPhases.push(snap.wirePhases?.['w_mid'] ?? 0);
      hwrCurrents.push(snap.wireCurrents?.['w_mid'] ?? 0);
    }

    console.log('=== Phase diffs ===');
    let fwd = 0, halt = 0;
    for (let i = 1; i < hwrPhases.length; i++) {
      const diff = hwrPhases[i] - hwrPhases[i-1];
      const curr = hwrCurrents[i];
      if (diff > 1e-4) fwd++;
      if (Math.abs(diff) < 1e-6) halt++;
      console.log('Frame ' + i + ': phase_diff=' + diff.toExponential(4) + ', wireI=' + curr.toExponential(4));
    }
    console.log('Forward: ' + fwd + ', Halted: ' + halt);
  });
});
