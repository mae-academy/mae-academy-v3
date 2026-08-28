import { MNASolver, type MNAElement } from './mnaSolver';
import { id, type AnalysisTrace } from './analysisTypes';

export class SuperpositionSolver {
  constructor(private readonly elements: MNAElement[]) {}

  analyze(targetElementId?: string): AnalysisTrace {
    try {
      const independent = this.elements.filter((element) => element.type === 'voltage' || element.type === 'current');
      if (!independent.length) return { method: 'superposition', status: 'unsupported', heading: 'Superposition Theorem', steps: [], warning: 'Add at least one independent voltage or current source.' };
      const target = this.elements.find((element) => element.id === targetElementId && element.type === 'resistor') as Extract<MNAElement, { type: 'resistor' }> | undefined ?? this.elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor');
      if (!target) return { method: 'superposition', status: 'unsupported', heading: 'Superposition Theorem', steps: [], warning: 'Add a resistor branch to observe a branch-current response.' };
      const contribution = independent.map((source) => {
        const subcircuit = this.elements.map((element) => {
          if (element.id === source.id) return element;
          if (element.type === 'voltage') return { ...element, voltage: 0 } as MNAElement;
          if (element.type === 'current') return { ...element, current: 0 } as MNAElement;
          return element;
        });
        const result = new MNASolver(subcircuit).solve();
        const i = ((result.nodeVoltages[target.positive] ?? 0) - (result.nodeVoltages[target.negative] ?? 0)) / target.resistance;
        return { source, i };
      });
      const baseline = new MNASolver(this.elements).solve();
      const actual = ((baseline.nodeVoltages[target.positive] ?? 0) - (baseline.nodeVoltages[target.negative] ?? 0)) / target.resistance;
      const sum = contribution.reduce((value, item) => value + item.i, 0);
      const steps: AnalysisTrace['steps'] = contribution.map(({ source, i }, index) => ({ title: `Sub-circuit ${index + 1}: ${id(source.id)} active`, math: `I_{${id(target.id)}}^{(${index + 1})}=${i.toFixed(9)}\\,\\mathrm{A}`, prose: source.type === 'voltage' ? 'Other independent voltage sources are shorted; independent current sources are opened.' : 'Other independent sources are deactivated; dependent sources remain active.' }));
      steps.push({ title: 'Algebraic superposition', math: `I_{${id(target.id)}}=\\sum_k I_{${id(target.id)}}^{(k)}=${sum.toFixed(9)}\\,\\mathrm{A}` }, { title: 'Baseline MNA verification', math: `I_{${id(target.id)}}^{\\mathrm{MNA}}=${actual.toFixed(9)}\\,\\mathrm{A}` });
      return { method: 'superposition', status: Math.abs(sum - actual) < 1e-8 ? 'ready' : 'error', heading: 'Superposition Theorem', steps, result: baseline, warning: Math.abs(sum - actual) < 1e-8 ? undefined : 'Sub-responses did not match the baseline MNA branch current.' };
    } catch (error) { return { method: 'superposition', status: 'error', heading: 'Superposition Theorem', steps: [], warning: error instanceof Error ? error.message : 'Superposition analysis failed.' }; }
  }
}
