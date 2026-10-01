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
    // 1. VCVS doubling the voltage of a 5V source
    const vcvsDouble = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 5 },
      { type: 'vcvs', id: 'E1', positive: 'out', negative: '0', controlPositive: 'in', controlNegative: '0', gain: 2 },
      { type: 'resistor', id: 'Rout', positive: 'out', negative: '0', resistance: 1000 },
    ]).solve();
    near(vcvsDouble.nodeVoltages.in, 5);
    near(vcvsDouble.nodeVoltages.out, 10);
    near(vcvsDouble.branchCurrents.E1, -0.01); // 10V / 1000 ohm leaving positive terminal into negative terminal

    // 2. VCCS controlling current based on voltage
    const vccs = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 4 },
      { type: 'vccs', id: 'G1', positive: 'out', negative: '0', controlPositive: 'in', controlNegative: '0', gain: 0.5 },
      { type: 'resistor', id: 'Rload', positive: 'out', negative: '0', resistance: 100 },
    ]).solve();
    near(vccs.nodeVoltages.in, 4);
    near(vccs.nodeVoltages.out, -200); // Injects current from out to 0, so out is at -200V across Rload
    near(vccs.branchCurrents.G1, 2.0); // 0.5 S * 4 V = 2 A

    // 3. CCCS targeting a resistor dynamically (I_target = (Vtp - Vtn) / R)
    const cccsResistor = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'Rsense', positive: 'in', negative: '0', resistance: 100 },
      { type: 'cccs', id: 'F1', positive: 'out', negative: '0', targetId: 'Rsense', gain: 3 },
      { type: 'resistor', id: 'Rload', positive: 'out', negative: '0', resistance: 50 },
    ]).solve();
    // I_Rsense = 10 / 100 = 0.1 A. CCCS injects 3 * 0.1 = 0.3 A from out to 0.
    near(cccsResistor.nodeVoltages.out, -15); // -0.3 A * 50 ohm = -15 V
    near(cccsResistor.branchCurrents.F1, 0.3);

    // 4. CCVS targeting a resistor dynamically (V_out = mu_eq * (Vtp - Vtn))
    const ccvsResistor = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'Rsense', positive: 'in', negative: '0', resistance: 100 },
      { type: 'ccvs', id: 'H1', positive: 'out', negative: '0', targetId: 'Rsense', gain: 50 },
      { type: 'resistor', id: 'Rload', positive: 'out', negative: '0', resistance: 10 },
    ]).solve();
    // I_Rsense = 0.1 A. CCVS enforces V_out = 50 * 0.1 = 5 V.
    near(ccvsResistor.nodeVoltages.out, 5);
    near(ccvsResistor.branchCurrents.H1, -0.5); // 5 V / 10 ohm = 0.5 A leaving pos

    // 5. CCCS & CCVS targeting an auxiliary branch (voltage source / current sense)
    const cccsAux = new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 2 },
      { type: 'resistor', id: 'Rsense', positive: 'in', negative: 'mid', resistance: 1000 },
      { type: 'current-sense', id: 'Vsense', positive: 'mid', negative: '0' },
      { type: 'cccs', id: 'F1', positive: 'out', negative: '0', controlSourceId: 'Vsense', gain: 2 },
      { type: 'resistor', id: 'Rout', positive: 'out', negative: '0', resistance: 1000 },
    ]).solve();
    near(cccsAux.branchCurrents.Vsense, 0.002);
    near(cccsAux.nodeVoltages.out, -4);
    near(cccsAux.branchCurrents.F1, 0.004);
  });

  it('throws INVALID_CONTROL if a current-controlled source targets an invalid component', () => {
    expect(() => new MNASolver([
      { type: 'voltage', id: 'Vin', positive: 'in', negative: '0', voltage: 5 },
      { type: 'cccs', id: 'F1', positive: 'out', negative: '0', targetId: 'NonExistent', gain: 2 },
      { type: 'resistor', id: 'Rout', positive: 'out', negative: '0', resistance: 1000 },
    ]).solve()).toThrow(MNAError);
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

  // Numerical [I] vector certificates: [G][V]=[I] with sum(I_leaving)=0, so an independent current
  // source SUBTRACTS at the node it leaves (`from`) and ADDS at the node it enters (`to`).
  it('stamps the numerical RHS vector with the exact topological sign of an independent current source', () => {
    const leaving = new MNASolver([
      { type: 'current', id: 'I1', from: 'n1', to: '0', current: 2 },
      { type: 'resistor', id: 'R1', positive: 'n1', negative: '0', resistance: 10 },
    ]).solve();
    expect(leaving.nodeOrder).toEqual(['n1']);
    expect(leaving.rhs).toEqual([-2]);
    near(leaving.nodeVoltages.n1, -20);

    const entering = new MNASolver([
      { type: 'current', id: 'I1', from: '0', to: 'n1', current: 2 },
      { type: 'resistor', id: 'R1', positive: 'n1', negative: '0', resistance: 10 },
    ]).solve();
    expect(entering.rhs).toEqual([2]);
    near(entering.nodeVoltages.n1, 20);
  });

  it('splits one current source across both node rows of the RHS when neither pin is the reference', () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: 'n1', negative: '0', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: 'n1', negative: 'n2', resistance: 10 },
      { type: 'resistor', id: 'R2', positive: 'n2', negative: '0', resistance: 20 },
      { type: 'resistor', id: 'R3', positive: 'n2', negative: 'n3', resistance: 30 },
      { type: 'resistor', id: 'R4', positive: 'n3', negative: '0', resistance: 40 },
      { type: 'current', id: 'I1', from: 'n2', to: 'n3', current: 0.5 },
    ]).solve();
    const rhsFor = (node: string) => result.rhs![result.nodeOrder.indexOf(node)];
    expect(rhsFor('n2')).toBeCloseTo(-0.5, 12);
    expect(rhsFor('n3')).toBeCloseTo(0.5, 12);
    expect(result.residualInfinity).toBeLessThanOrEqual(1e-9);
  });

  it('keeps every dependent-source gain on the LHS: their RHS rows, including the auxiliary branch row, stay 0', () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: 'in', negative: '0', voltage: 10 },
      { type: 'resistor', id: 'R1', positive: 'in', negative: 'mid', resistance: 100 },
      { type: 'resistor', id: 'R2', positive: 'mid', negative: '0', resistance: 200 },
      { type: 'vccs', id: 'G1', positive: 'out', negative: '0', controlPositive: 'mid', controlNegative: '0', gain: 0.05 },
      { type: 'vcvs', id: 'E1', positive: 'aux', negative: '0', controlPositive: 'mid', controlNegative: '0', gain: 3 },
      { type: 'resistor', id: 'R3', positive: 'out', negative: '0', resistance: 50 },
      { type: 'resistor', id: 'R4', positive: 'aux', negative: '0', resistance: 500 },
    ]).solve();
    // Only V1's own branch row may carry a constant; every node row and every dependent branch row is 0.
    const v1Row = result.voltageBranchOrder.indexOf('V1') + result.nodeOrder.length;
    result.rhs!.forEach((value, row) => expect(value).toBe(row === v1Row ? 10 : 0));
    expect(result.residualInfinity).toBeLessThanOrEqual(1e-9);
  });

  it('strictly forces 0A branch current and true open circuit for burned components', () => {
    const result = new MNASolver([
      { type: 'voltage', id: 'V1', positive: '1', negative: '0', voltage: 12 },
      { type: 'resistor', id: 'R1', positive: '1', negative: '0', resistance: 100, isBurned: true },
    ]).solve();
    expect(result.branchCurrents.R1).toBe(0);
    expect(Math.abs(result.voltageSourceCurrents.V1)).toBeLessThanOrEqual(1e-10);
  });
});
