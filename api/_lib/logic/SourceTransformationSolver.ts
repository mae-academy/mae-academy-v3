import type { MNAElement } from './mnaSolver';
import { id, type AnalysisTrace } from '../../../shared/logic/analysisTypes';

export class SourceTransformationSolver {
  constructor(private readonly elements: MNAElement[]) {}

  analyze(voltageId?: string, resistorId?: string): AnalysisTrace {
    const source = this.elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.id === voltageId && element.type === 'voltage') ?? this.elements.find((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage');
    const resistor = this.elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.id === resistorId && element.type === 'resistor') ?? this.elements.find((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor');
    if (!source || !resistor) return { method: 'transform', status: 'unsupported', heading: 'Source Transformation', steps: [], warning: 'Add an independent voltage source and a resistor to derive an equivalent Norton pair.' };
    const current = source.voltage / resistor.resistance;
    return { method: 'transform', status: 'ready', heading: 'Source Transformation · Thévenin ↔ Norton', steps: [
      { title: 'Identify valid real-source pair', math: `V_s=${source.voltage}\\,\\mathrm{V},\\quad R_s=${resistor.resistance}\\,\\Omega`, prose: `The current topology selects ${id(source.id)} and ${id(resistor.id)} as the source/resistance pair for the derivation.` },
      { title: 'Voltage source to current source', math: `I_s=\\frac{V_s}{R_s}=\\frac{${source.voltage}}{${resistor.resistance}}=${current.toFixed(9)}\\,\\mathrm{A}` },
      { title: 'Preserve terminal equivalence', math: `R_N=R_{Th}=${resistor.resistance}\\,\\Omega`, prose: 'The transformed current source is in parallel with the same resistance; terminal I–V behavior is unchanged.' },
    ] };
  }
}
