import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NODAL_COLORS, nonReferenceNodes } from '@/simulators/circuit-engine/models/analysisTypes';

type LabelKind = 'resistor' | 'voltage' | 'current' | 'vccs' | 'vcvs' | 'cccs' | 'ccvs' | 'current-sense';

const PREFIX: Record<LabelKind, string> = { resistor: 'R', voltage: 'V', current: 'I', vccs: 'G', vcvs: 'E', cccs: 'F', ccvs: 'H', 'current-sense': 'I_x' };

function escapedText(value: string) { return value.replace(/[\\{}_$#%&^~]/g, '\\$&'); }

export function formatAcademicUserLabel(label: string, fallback = 'R_1'): string {
  if (!label) return fallback;
  const trimmed = label.trim();
  if (!trimmed) return fallback;

  // 1. Explicit subscript in user label like R_L, R_{L}, R_load, V_in, R_3
  const subMatch = trimmed.match(/^([A-Za-z]+)[_]\{?([A-Za-z0-9]+)\}?$/);
  if (subMatch) {
    const prefix = subMatch[1].length === 1 ? subMatch[1] : `\\mathrm{${subMatch[1]}}`;
    const sub = subMatch[2].length === 1 ? subMatch[2] : `\\mathrm{${subMatch[2]}}`;
    return `${prefix}_{${sub}}`;
  }

  // 2. Letter followed by number like R1, R2 -> R_{1}, R_{2}
  const indexed = trimmed.match(/^([A-Za-z]+)(\d+)$/);
  if (indexed) {
    const isSingleLetter = indexed[1].length === 1;
    const prefix = isSingleLetter ? indexed[1] : `\\mathrm{${indexed[1]}}`;
    return `${prefix}_{${indexed[2]}}`;
  }

  // 3. Common two-letter electrical variables like RL, VL, IL -> R_{L}, V_{L}, I_{L}
  const twoLetter = trimmed.match(/^([RVIrvi])([A-Za-z])$/);
  if (twoLetter) {
    return `${twoLetter[1].toUpperCase()}_{${twoLetter[2]}}`;
  }

  const clean = trimmed.replace(/[\\{}_$#%&^~]/g, '');
  return clean ? `\\mathrm{${escapedText(clean)}}` : fallback;
}

function academicLabel(label: string, fallback: string) {
  return formatAcademicUserLabel(label, fallback);
}

/** Translates volatile canvas IDs into deterministic textbook symbols, never exposing topology UUIDs in derivations. */
export class AcademicNodalDictionary {
  private readonly nodes = new Map<string, number>();
  private readonly elements = new Map<string, string>();

  constructor(elements: MNAElement[], pedagogicalNodes: string[] = nonReferenceNodes(elements)) {
    pedagogicalNodes.forEach((node, index) => this.nodes.set(node, index + 1));
    const counters = new Map<LabelKind, number>();
    for (const element of elements) {
      const kind = element.type;
      const sequence = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, sequence);
      this.elements.set(element.id, academicLabel(element.label ?? '', `${PREFIX[kind]}_{${sequence}}`));
    }
  }

  voltage(node: string) { return node === '0' ? '0' : `V_{${this.nodes.get(node) ?? '?'}}`; }
  nodeName(node: string) { return node === '0' ? '\\mathrm{GND}' : `V_{${this.nodes.get(node) ?? '?'}}`; }
  nodeIndex(node: string) { return this.nodes.get(node) ?? 0; }
  nodeColor(node: string) { const index = this.nodes.get(node); return index ? NODAL_COLORS[(index - 1) % NODAL_COLORS.length] : '#64748b'; }
  coloredVoltage(node: string) { return node === '0' ? '0' : `\\textcolor{${this.nodeColor(node)}}{${this.voltage(node)}}`; }
  coloredNodeName(node: string) { return node === '0' ? '\\mathrm{GND}' : `\\textcolor{${this.nodeColor(node)}}{${this.nodeName(node)}}`; }
  element(element: MNAElement) { return this.elements.get(element.id) ?? '\\mathrm{branch}'; }
}
