import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NODAL_COLORS, nonReferenceNodes } from '@/simulators/circuit-engine/models/analysisTypes';

type LabelKind = 'resistor' | 'voltage' | 'current' | 'vccs' | 'vcvs' | 'cccs' | 'ccvs' | 'current-sense';

const PREFIX: Record<LabelKind, string> = { resistor: 'R', voltage: 'V', current: 'I', vccs: 'G', vcvs: 'E', cccs: 'F', ccvs: 'H', 'current-sense': 'I_x' };

function escapedText(value: string) { return value.replace(/[\\{}_$#%&^~]/g, '\\$&'); }

function academicLabel(label: string, fallback: string) {
  const normalized = label.replace(/[^A-Za-z0-9]/g, '');
  const indexed = normalized.match(/^([A-Za-z]+)(\d+)$/);
  if (indexed) {
    const isSingleLetter = indexed[1].length === 1;
    return isSingleLetter ? `${indexed[1]}_{${indexed[2]}}` : `\\mathrm{${indexed[1]}}_{${indexed[2]}}`;
  }
  return normalized ? `\\mathrm{${escapedText(normalized)}}` : fallback;
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
