import { MNASolver, type MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { id, n, type AnalysisTrace } from '@/simulators/circuit-engine/models/analysisTypes';
import { AcademicNodalDictionary } from '@/simulators/circuit-engine/models/AcademicNodalDictionary';

export class TheveninSolver {
  constructor(private readonly elements: MNAElement[]) {}

  analyze(loadId?: string): AnalysisTrace {
    try {
      const load = this.elements.find((element) => element.id === loadId && element.type === 'resistor') as Extract<MNAElement, { type: 'resistor' }> | undefined ?? this.elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor');
      if (!load) return { method: 'thevenin', status: 'unsupported', heading: 'Thévenin / Norton', steps: [], warning: 'Add or select a load resistor to define terminal pair A–B.' };
      const openElements = this.elements.filter((element) => element.id !== load.id);
      const open = new MNASolver(openElements).solve();
      const vth = (open.nodeVoltages[load.positive] ?? 0) - (open.nodeVoltages[load.negative] ?? 0);
      const hasDependent = openElements.some((element) => ['vccs', 'vcvs', 'cccs', 'ccvs'].includes(element.type));
      const deactivated = openElements.map((element) => element.type === 'voltage' ? { ...element, voltage: 0 } as MNAElement : element.type === 'current' ? { ...element, current: 0 } as MNAElement : element);
      let rth: number; let resistanceTrace: string;
      if (hasDependent) {
        const testId = '__thevenin_test__';
        const test = new MNASolver([...deactivated, { type: 'voltage', id: testId, positive: load.positive, negative: load.negative, voltage: 1 }]).solve();
        const itest = Math.abs(test.branchCurrents[testId]);
        rth = 1 / itest;
        resistanceTrace = `R_{Th}=\\frac{V_{test}}{I_{test}}=\\frac{1}{${itest.toFixed(9)}}=${rth.toFixed(9)}\\,\\Omega`;
      } else {
        rth = new MNASolver(deactivated).equivalentResistance(load.positive, load.negative);
        resistanceTrace = `R_{Th}=R_{eq}=${rth.toFixed(9)}\\,\\Omega`;
      }
      const dict = new AcademicNodalDictionary(this.elements);
      const loadLabel = dict.element(load);
      const posNode = load.positive === '0' ? '0' : `Node_{${dict.nodeIndex(load.positive) || 1}}`;
      const negNode = load.negative === '0' ? '0' : `Node_{${dict.nodeIndex(load.negative) || 2}}`;
      const inorton = Math.abs(rth) < 1e-12 ? 0 : vth / rth;
      const pmax = Math.abs(rth) < 1e-12 ? 0 : vth * vth / (4 * rth);
      return { method: 'thevenin', status: 'ready', heading: 'Thévenin / Norton / Maximum Power', targetId: load.id, result: open, steps: [
        { title: 'Selected terminal pair', math: `A=${posNode},\\quad B=${negNode}`, prose: `Load ${loadLabel} is removed to obtain the open-circuit response.` },
        { title: 'Open-circuit Thévenin voltage', math: `V_{Th}=V_{oc}=V_A-V_B=${vth.toFixed(9)}\\,\\mathrm{V}` },
        { title: hasDependent ? 'Dependent-source test method' : 'Independent-source deactivation', math: resistanceTrace, prose: hasDependent ? 'Independent sources are deactivated; the dependent source remains active and a virtual 1 V test source is applied.' : 'Independent voltage sources are shorted and independent current sources are opened.' },
        { title: 'Norton equivalent', math: `I_N=\\frac{V_{Th}}{R_{Th}}=${inorton.toFixed(9)}\\,\\mathrm{A}` },
        { title: 'Maximum power transfer', math: `R_L=R_{Th}=${rth.toFixed(9)}\\,\\Omega,\\qquad P_{max}=\\frac{V_{Th}^2}{4R_{Th}}=${pmax.toFixed(9)}\\,\\mathrm{W}` },
      ] };
    } catch (error) { return { method: 'thevenin', status: 'error', heading: 'Thévenin / Norton', steps: [], warning: error instanceof Error ? error.message : 'Thévenin analysis failed.' }; }
  }
}
