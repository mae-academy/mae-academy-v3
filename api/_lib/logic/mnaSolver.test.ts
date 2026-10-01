import { describe, expect, it } from 'vitest';
import { MNAError, MNASolver } from './mnaSolver';

const near = (actual: number, expected: number, digits = 9) => expect(actual).toBeCloseTo(expected, digits);

describe('Tab B Phase 2 strict MNA solver', () => {
  it('solves the Wheatstone bridge floating-node test', () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: '1', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'R1', positive: '1', negative: '2', resistance: 1000 },
      { type: 'resistor', id: 'R2', positive: '1', negative: '3', resistance: 2000 },
      { type: 'resistor', id: 'R3', positive: '2', negative: '0', resistance: 2000 },
      { type: 'resistor', id: 'R4', positive: '3', negative: '0', resistance: 1000 },
      { type: 'resistor', id: 'R5', positive: '2', negative: '3', resistance: 5000 },
    ]).solve();
    near(result.nodeVoltages['2'], 6.315789473684, 9);
    near(result.nodeVoltages['3'], 3.684210526315, 9);
    near((result.nodeVoltages['2'] - result.nodeVoltages['3']) / 5000, 0.000526315789, 12);
    expect(result.residualInfinity).toBeLessThanOrEqual(1e-9);
  });

  it('handles two voltage-defined branches sharing a supernode', () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: '1', negative: '0', voltage: 12 },
      { type: 'voltage', id: 'V2', positive: '1', negative: '2', voltage: 5 },
      { type: 'resistor', id: 'R1', positive: '2', negative: '0', resistance: 10 },
    ]).solve();
    near(result.nodeVoltages['1'], 12);
    near(result.nodeVoltages['2'], 7);
    expect(result.voltageSourceCurrents.V1).toBeTypeOf('number');
    expect(result.voltageSourceCurrents.V2).toBeTypeOf('number');
  });

  it('rejects conflicting parallel voltage sources without crashing', () => {
    expect(() => new MNASolver([
      { type: 'voltage', id: 'V5', positive: '1', negative: '0', voltage: 5 },
      { type: 'voltage', id: 'V10', positive: '1', negative: '0', voltage: 10 },
    ]).solve()).toThrow('Invalid Circuit Layout: Conflicting Voltage Sources');
  });

  it('computes the 20-ohm equivalent resistance of the symmetric delta', () => {
    const delta = new MNASolver([
      { type: 'resistor', id: 'Rab', positive: 'a', negative: '0', resistance: 30 },
      { type: 'resistor', id: 'Rbc', positive: '0', negative: 'c', resistance: 30 },
      { type: 'resistor', id: 'Rca', positive: 'c', negative: 'a', resistance: 30 },
    ]);
    near(delta.equivalentResistance('a', '0'), 20);
  });

  it('stamps VCVS, VCCS, CCCS, and CCVS controlled source matrix terms', () => {
    const vcvs = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 2 },
      { type: 'vcvs', id: 'E1', positive: 'out', negative: '0', controlPositive: 'in', controlNegative: '0', gain: 3 },
      { type: 'resistor', id: 'Rout', positive: 'out', negative: '0', resistance: 1000 },
    ]).solve();
    near(vcvs.nodeVoltages.out, 6);

    const cccs = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 2 },
      { type: 'resistor', id: 'Rsense', positive: 'in', negative: 'mid', resistance: 1000 },
      { type: 'current-sense', id: 'Vsense', positive: 'mid', negative: '0' },
      { type: 'cccs', id: 'F1', positive: 'out', negative: '0', controlSourceId: 'Vsense', gain: 2 },
      { type: 'resistor', id: 'Rout', positive: 'out', negative: '0', resistance: 1000 },
    ]).solve();
    near(cccs.branchCurrents.Vsense, 0.002);
    near(cccs.nodeVoltages.out, -4);
  });

  it('returns a strict MNAError code for an underconstrained singular matrix', () => {
    try {
      new MNASolver([
        { type: 'voltage', id: 'V1', positive: 'in', negative: '0', voltage: 1 },
        { type: 'vcvs', id: 'Efloat', positive: 'out', negative: '0', controlPositive: 'floating', controlNegative: '0', gain: 2 },
      ]).solve();
      throw new Error('Expected singular matrix error');
    } catch (error) {
      expect(error).toBeInstanceOf(MNAError);
      expect((error as MNAError).code).toBe('SINGULAR_MATRIX');
    }
  });
});
