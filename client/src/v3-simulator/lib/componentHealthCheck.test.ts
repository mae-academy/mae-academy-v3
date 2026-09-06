import { describe, it, expect } from 'vitest';
import type { CircuitComponent, CircuitWire } from './circuitTypes';
import { validateCanvasComponentHealth, runCatalogIntegrityBenchmark } from './componentHealthCheck';
import { nextComponentLabel, copyComponentForPaste } from './circuitTypes';

describe('Component Health & Invariant Verification', () => {
  it('passes catalog integrity benchmark on standard active components', () => {
    const report = runCatalogIntegrityBenchmark();
    expect(report.healthy).toBe(true);
    expect(report.terminalConnectivity.passed).toBe(true);
    expect(report.terminalConnectivity.floatingTerminals).toHaveLength(0);
    expect(report.groundPathContinuity.passed).toBe(true);
    expect(report.groundPathContinuity.isolatedComponents).toHaveLength(0);
    expect(report.mnaStamping.passed).toBe(true);
    expect(report.mnaStamping.residualInfinity).toBeLessThanOrEqual(1e-9);

    // Verify each mounted component updated branch current and voltage drop cleanly
    const r1 = report.mnaStamping.componentVerifications.find((c) => c.id === 'R1');
    expect(r1?.verified).toBe(true);
    expect(r1?.branchCurrent).toBeCloseTo(0.6470588, 5);
    expect(r1?.voltageDrop).toBeCloseTo(2.588235, 5);

    const r2 = report.mnaStamping.componentVerifications.find((c) => c.id === 'R2');
    expect(r2?.verified).toBe(true);
    expect(r2?.branchCurrent).toBeCloseTo(0.941176, 5);
    expect(r2?.voltageDrop).toBeCloseTo(9.411765, 5);

    const v1 = report.mnaStamping.componentVerifications.find((c) => c.id === 'V1');
    expect(v1?.verified).toBe(true);
    expect(v1?.voltageDrop).toBeCloseTo(12, 5);

    expect(report.summary).toContain('[Component Health Check] HEALTHY');
  });

  it('detects floating terminals on two-terminal devices', () => {
    // V1 connected to GND, but R1 has terminal 'b' disconnected
    const components: CircuitComponent[] = [
      { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 12 } },
      { id: 'R1', type: 'resistor', x: 200, y: 150, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 1000 } },
      { id: 'GND', type: 'ground', x: 100, y: 300, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} },
    ];
    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[100, 185], [170, 150]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'V1', fromTerm: 'neg', toComp: 'GND', toTerm: 'gnd', path: [[100, 215], [100, 300]], routing: 'orthogonal' },
      // R1 terminal 'b' is deliberately left unconnected
    ];

    const report = validateCanvasComponentHealth(components, wires);
    expect(report.healthy).toBe(false);
    expect(report.terminalConnectivity.passed).toBe(false);
    expect(report.terminalConnectivity.floatingTerminals.some((f) => f.componentId === 'R1' && f.terminalId === 'b')).toBe(true);
    expect(report.summary).toContain('floating terminal(s) detected');
  });

  it('detects missing ground reference and isolated floating subcircuits', () => {
    // Circuit with loop but no GND component
    const components: CircuitComponent[] = [
      { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 5 } },
      { id: 'R1', type: 'resistor', x: 200, y: 200, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 100 } },
    ];
    const wires: CircuitWire[] = [
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[100, 185], [170, 200]], routing: 'orthogonal' },
      { id: 'w2', fromComp: 'V1', fromTerm: 'neg', toComp: 'R1', toTerm: 'b', path: [[100, 215], [230, 200]], routing: 'orthogonal' },
    ];

    const report = validateCanvasComponentHealth(components, wires);
    expect(report.healthy).toBe(false);
    expect(report.groundPathContinuity.passed).toBe(false);
    expect(report.summary).toContain('Missing GND reference datum');
  });

  it('unifies multiple ground symbols into single reference datum GND without numerical suffixes', () => {
    const components: CircuitComponent[] = [
      { id: 'gnd_a', type: 'ground', x: 100, y: 300, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} },
      { id: 'gnd_b', type: 'ground', x: 300, y: 300, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} },
    ];

    // Verify nextComponentLabel strictly returns 'GND' never 'GND1' or 'GND2'
    expect(nextComponentLabel('ground', components)).toBe('GND');
    expect(nextComponentLabel('ground', [])).toBe('GND');

    // Verify copyComponentForPaste retains 'GND'
    const pasted = copyComponentForPaste(components[0], 'gnd_c', 'GND_copy', 400, 300);
    expect(pasted.label).toBe('GND');
  });
});
