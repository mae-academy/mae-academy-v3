import { describe, expect, it } from 'vitest';
import { detectCoilConflicts } from '@/simulators/circuit-engine/engine/analogSimulation';
import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';

describe('Coil Component and Conflict Detection', () => {
  it('detects no conflicts when coil labels are unique', () => {
    const components: CircuitComponent[] = [
      {
        id: 'coil-1',
        type: 'coil',
        x: 0,
        y: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
        label: 'K1',
        props: {},
      },
      {
        id: 'coil-2',
        type: 'coil',
        x: 100,
        y: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
        label: 'K2',
        props: {},
      },
    ];

    const report = detectCoilConflicts(components);
    expect(report.hasConflicts).toBe(false);
    expect(report.conflicts).toHaveLength(0);
  });

  it('detects conflict and identifies primary component when labels collide', () => {
    const components: CircuitComponent[] = [
      {
        id: 'coil-primary',
        type: 'coil',
        x: 0,
        y: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
        label: 'K1',
        props: {},
      },
      {
        id: 'coil-duplicate',
        type: 'coil',
        x: 100,
        y: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
        label: 'K1',
        props: {},
      },
    ];

    const report = detectCoilConflicts(components);
    expect(report.hasConflicts).toBe(true);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].name).toBe('K1');
    expect(report.conflicts[0].primaryId).toBe('coil-primary');
    expect(report.conflicts[0].count).toBe(2);
  });
});
