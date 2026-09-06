/**
 * PLC Ladder visual contract: a normalized, position-free document for recursive DOM rendering.
 * All terminal output coils are normalized to the end of their parent rung circuit before source
 * is serialized for the isolated generic PLC engine.
 */
import type { PlcInstructionType } from '@/features/plc/ladder';

export type LadderEditorElement = LadderEditorInstruction | LadderEditorBranch;
export interface LadderEditorInstruction { type: 'INSTRUCTION'; id: string; instructionType: PlcInstructionType; parameters: string[]; }
export interface LadderEditorBranch { type: 'BRANCH'; id: string; circuits: LadderEditorCircuit[]; }
export interface LadderEditorCircuit { id: string; elements: LadderEditorElement[]; }
export interface LadderEditorRung { id: string; comment?: string; circuit: LadderEditorCircuit; }
export interface LadderEditorDocument { rungIds: string[]; rungs: Record<string, LadderEditorRung>; }
export interface LadderEditorSelection { selectedIds: string[]; selectedType: null | 'RUNG' | 'CIRCUIT' | 'BRANCH' | 'INSTRUCTION'; anchorId: string | null; }
export type LadderEditorTool = PlcInstructionType | 'BRANCH' | 'BRANCH_LEVEL';

/** Generic Ladder terminal-output contract: these devices must touch the right rail. */
export const outputCoilTypes = new Set<PlcInstructionType>(['OTE', 'OTL', 'OTU']);
export const isOutputCoilInstruction = (instruction: LadderEditorInstruction) => outputCoilTypes.has(instruction.instructionType);
const terminalInstructionTypes = new Set<PlcInstructionType>(['OTE', 'OTL', 'OTU', 'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'CTUD', 'RES', 'TONR', 'TOFR', 'RTOR', 'OSRI', 'OSFI', 'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'NEG', 'ABS', 'SQRT', 'SIN', 'COS', 'TAN', 'AND', 'OR', 'XOR', 'NOT', 'MVM', 'BTD', 'EQU', 'NEQ', 'GRT', 'GEQ', 'LES', 'LEQ', 'LIM']);

let serial = 0;
export const newLadderId = (kind: string) => `${kind}-${++serial}`;

const defaults: Record<PlcInstructionType, string[]> = {
  XIC: ['Start'], XIO: ['Stop'], ONS: ['OneShotMemory'], OSR: ['RiseMemory', 'RisePulse'], OSF: ['FallMemory', 'FallPulse'],
  OTE: ['Motor'], OTL: ['LatchedMotor'], OTU: ['LatchedMotor'], AFI: [], NOP: [],
  TON: ['Delay'], TOF: ['OffDelay'], RTO: ['RetainedDelay'], CTU: ['Counter'], CTD: ['Counter'], CTUD: ['UpDown', 'Up', 'Down', 'Reset'], RES: ['Delay'],
  TONR: ['FbdTimer'], TOFR: ['FbdTimer'], RTOR: ['FbdTimer'], OSRI: ['FbdEdge'], OSFI: ['FbdEdge'],
  MOV: ['0', 'Value'], ADD: ['Value', '1', 'Result'], SUB: ['Value', '1', 'Result'], MUL: ['Value', '2', 'Result'], DIV: ['Value', '2', 'Result'], MOD: ['Value', '2', 'Result'], NEG: ['Value', 'Result'], ABS: ['Value', 'Result'], SQRT: ['Value', 'Result'], SIN: ['Value', 'Result'], COS: ['Value', 'Result'], TAN: ['Value', 'Result'],
  AND: ['Value', '1', 'Result'], OR: ['Value', '1', 'Result'], XOR: ['Value', '1', 'Result'], NOT: ['Value', 'Result'], MVM: ['Value', '16#000F', 'Result'], BTD: ['Value', '0', '0', '4', 'Result'],
  EQU: ['Value', '0'], NEQ: ['Value', '0'], GRT: ['Value', '0'], GEQ: ['Value', '0'], LES: ['Value', '0'], LEQ: ['Value', '0'], LIM: ['0', 'Value', '100'],
};

export function createLadderInstruction(instructionType: PlcInstructionType, parameters = defaults[instructionType]): LadderEditorInstruction { return { type: 'INSTRUCTION', id: newLadderId('instruction'), instructionType, parameters: [...parameters] }; }
export function createLadderCircuit(elements: LadderEditorElement[] = []): LadderEditorCircuit { return { id: newLadderId('circuit'), elements }; }
export function createLadderRung(elements: LadderEditorElement[] = []): LadderEditorRung { return { id: newLadderId('rung'), circuit: createLadderCircuit(elements) }; }

export function createInitialLadderDocument(): LadderEditorDocument {
  const r1 = createLadderRung([createLadderInstruction('XIC', ['Start']), createLadderInstruction('XIO', ['Stop']), createLadderInstruction('OTE', ['Motor'])]);
  const r2 = createLadderRung([createLadderInstruction('XIC', ['Motor']), createLadderInstruction('TON', ['Delay'])]);
  const r3 = createLadderRung([createLadderInstruction('XIC', ['Delay.DN']), createLadderInstruction('OTE', ['Complete'])]);
  return { rungIds: [r1.id, r2.id, r3.id], rungs: { [r1.id]: r1, [r2.id]: r2, [r3.id]: r3 } };
}

export const emptyLadderSelection = (): LadderEditorSelection => ({ selectedIds: [], selectedType: null, anchorId: null });
export function cloneLadderDocument(document: LadderEditorDocument): LadderEditorDocument { return structuredClone(document); }

function normalizeCircuitOutputPlacement(circuit: LadderEditorCircuit) {
  circuit.elements.forEach(element => { if (element.type === 'BRANCH') element.circuits.forEach(normalizeCircuitOutputPlacement); });
  const terminalCoils = circuit.elements.filter((element): element is LadderEditorInstruction => element.type === 'INSTRUCTION' && isOutputCoilInstruction(element));
  if (terminalCoils.length === 0) return;
  const nonTerminalElements = circuit.elements.filter(element => element.type !== 'INSTRUCTION' || !isOutputCoilInstruction(element));
  circuit.elements = [...nonTerminalElements, ...terminalCoils];
}

/** Normalizes all editable circuits so a coil can never remain between logic devices. */
export function normalizeLadderOutputPlacement(document: LadderEditorDocument): LadderEditorDocument {
  const next = cloneLadderDocument(document);
  next.rungIds.forEach(id => normalizeCircuitOutputPlacement(next.rungs[id].circuit));
  return next;
}

export function findLadderCircuit(document: LadderEditorDocument, circuitId: string): LadderEditorCircuit | undefined {
  const visit = (circuit: LadderEditorCircuit): LadderEditorCircuit | undefined => {
    if (circuit.id === circuitId) return circuit;
    for (const element of circuit.elements) if (element.type === 'BRANCH') for (const child of element.circuits) { const match = visit(child); if (match) return match; }
    return undefined;
  };
  return document.rungIds.map(id => document.rungs[id]).map(rung => visit(rung.circuit)).find(Boolean);
}

export function findLadderRungForCircuit(document: LadderEditorDocument, circuitId: string): LadderEditorRung | undefined {
  const contains = (circuit: LadderEditorCircuit): boolean => circuit.id === circuitId || circuit.elements.some(element => element.type === 'BRANCH' && element.circuits.some(contains));
  return document.rungIds.map(id => document.rungs[id]).find(rung => contains(rung.circuit));
}

export function findLadderElement(document: LadderEditorDocument, elementId: string): { circuit: LadderEditorCircuit; index: number; element: LadderEditorElement } | undefined {
  const visit = (circuit: LadderEditorCircuit): { circuit: LadderEditorCircuit; index: number; element: LadderEditorElement } | undefined => {
    for (let index = 0; index < circuit.elements.length; index += 1) {
      const element = circuit.elements[index];
      if (element.id === elementId) return { circuit, index, element };
      if (element.type === 'BRANCH') for (const child of element.circuits) { const match = visit(child); if (match) return match; }
    }
    return undefined;
  };
  return document.rungIds.map(id => visit(document.rungs[id].circuit)).find(Boolean);
}

export function insertLadderInstruction(document: LadderEditorDocument, circuitId: string, index: number, instruction: LadderEditorInstruction): LadderEditorDocument {
  const next = cloneLadderDocument(document); const circuit = findLadderCircuit(next, circuitId); if (!circuit) return document;
  const firstCoil = circuit.elements.findIndex(element => element.type === 'INSTRUCTION' && isOutputCoilInstruction(element));
  const bounded = Math.max(0, Math.min(index, firstCoil < 0 ? circuit.elements.length : firstCoil));
  circuit.elements.splice(isOutputCoilInstruction(instruction) ? circuit.elements.length : bounded, 0, instruction);
  return normalizeLadderOutputPlacement(next);
}

export function appendLadderRung(document: LadderEditorDocument, instruction: LadderEditorInstruction = createLadderInstruction('XIC')): LadderEditorDocument {
  const next = cloneLadderDocument(document);
  const rung = createLadderRung(terminalInstructionTypes.has(instruction.instructionType) ? [createLadderInstruction('XIC'), instruction] : [instruction, createLadderInstruction('OTE')]);
  next.rungIds.push(rung.id); next.rungs[rung.id] = rung;
  return normalizeLadderOutputPlacement(next);
}

export function addLadderParallelBranch(document: LadderEditorDocument, circuitId: string, index: number, instruction: LadderEditorInstruction = createLadderInstruction('XIC')): LadderEditorDocument {
  const next = cloneLadderDocument(document); const circuit = findLadderCircuit(next, circuitId); if (!circuit) return document;
  const selectedIsCoil = circuit.elements[index]?.type === 'INSTRUCTION' && isOutputCoilInstruction(circuit.elements[index] as LadderEditorInstruction);
  const insertionIndex = selectedIsCoil ? Math.max(0, index - 1) : index;
  const existing = circuit.elements[insertionIndex];
  if (existing?.type === 'BRANCH') { existing.circuits.push(createLadderCircuit([instruction])); return normalizeLadderOutputPlacement(next); }
  const branch: LadderEditorBranch = { type: 'BRANCH', id: newLadderId('branch'), circuits: [createLadderCircuit(existing ? [existing] : []), createLadderCircuit([instruction])] };
  circuit.elements.splice(insertionIndex, existing ? 1 : 0, branch);
  return normalizeLadderOutputPlacement(next);
}

export function addLadderBranchLevel(document: LadderEditorDocument, branchId: string, index: number, instruction: LadderEditorInstruction = createLadderInstruction('XIC')): LadderEditorDocument {
  const next = cloneLadderDocument(document);
  const visit = (circuit: LadderEditorCircuit): LadderEditorBranch | undefined => {
    for (const element of circuit.elements) { if (element.type === 'BRANCH') { if (element.id === branchId) return element; for (const child of element.circuits) { const match = visit(child); if (match) return match; } } }
    return undefined;
  };
  const branch = next.rungIds.map(id => visit(next.rungs[id].circuit)).find(Boolean);
  if (!branch) return document;
  branch.circuits.splice(Math.max(0, Math.min(index, branch.circuits.length)), 0, createLadderCircuit([instruction]));
  return normalizeLadderOutputPlacement(next);
}

export function moveLadderInstruction(document: LadderEditorDocument, instructionId: string, toCircuitId: string, toIndex: number): LadderEditorDocument {
  const next = cloneLadderDocument(document); const source = findLadderElement(next, instructionId); const target = findLadderCircuit(next, toCircuitId);
  if (!source || source.element.type !== 'INSTRUCTION' || !target) return document;
  source.circuit.elements.splice(source.index, 1);
  const destination = isOutputCoilInstruction(source.element) ? findLadderRungForCircuit(next, toCircuitId)?.circuit ?? target : target;
  const offset = source.circuit.id === destination.id && source.index < toIndex ? 1 : 0;
  const firstCoil = destination.elements.findIndex(element => element.type === 'INSTRUCTION' && isOutputCoilInstruction(element));
  const bounded = Math.max(0, Math.min(toIndex - offset, firstCoil < 0 ? destination.elements.length : firstCoil));
  destination.elements.splice(isOutputCoilInstruction(source.element) ? destination.elements.length : bounded, 0, source.element);
  return normalizeLadderOutputPlacement(next);
}

export function updateLadderInstruction(document: LadderEditorDocument, instructionId: string, patch: Partial<Pick<LadderEditorInstruction, 'instructionType' | 'parameters'>>): LadderEditorDocument {
  const next = cloneLadderDocument(document); const found = findLadderElement(next, instructionId); if (!found || found.element.type !== 'INSTRUCTION') return document;
  Object.assign(found.element, patch); return normalizeLadderOutputPlacement(next);
}

export function deleteLadderElements(document: LadderEditorDocument, ids: string[]): LadderEditorDocument {
  const wanted = new Set(ids); const next = cloneLadderDocument(document);
  const visit = (circuit: LadderEditorCircuit) => { circuit.elements = circuit.elements.filter(element => !wanted.has(element.id)); for (const element of circuit.elements) if (element.type === 'BRANCH') element.circuits.forEach(visit); };
  next.rungIds.forEach(id => visit(next.rungs[id].circuit)); return normalizeLadderOutputPlacement(next);
}

function serializeElement(element: LadderEditorElement): string { return element.type === 'BRANCH' ? `[${element.circuits.map(serializeCircuit).join('|')}]` : `${element.instructionType}(${element.parameters.join(',')})`; }
export function serializeCircuit(circuit: LadderEditorCircuit): string { return circuit.elements.map(serializeElement).join(' '); }
export function serializeLadderDocument(document: LadderEditorDocument): string { return document.rungIds.map(id => `${serializeCircuit(document.rungs[id].circuit)};`).join('\n'); }

export const ladderToolGroups: ReadonlyArray<{ title: string; tools: LadderEditorTool[] }> = [
  { title: 'Contacts & coils', tools: ['XIC', 'XIO', 'ONS', 'OSR', 'OSF', 'OTE', 'OTL', 'OTU', 'AFI', 'NOP'] },
  { title: 'Timers & counters', tools: ['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'CTUD', 'RES'] },
  { title: 'FBD state blocks', tools: ['TONR', 'TOFR', 'RTOR', 'OSRI', 'OSFI'] },
  { title: 'Math & logical', tools: ['MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'MOD', 'ABS', 'SQRT', 'AND', 'OR', 'XOR', 'NOT', 'MVM', 'BTD'] },
  { title: 'Compare', tools: ['EQU', 'NEQ', 'GRT', 'GEQ', 'LES', 'LEQ', 'LIM'] },
  { title: 'Structure', tools: ['BRANCH', 'BRANCH_LEVEL'] },
];
