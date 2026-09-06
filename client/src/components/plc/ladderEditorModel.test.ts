import { describe, expect, it } from 'vitest';
import { compileLadder, type PlcAoi, type PlcTag } from '@/features/plc/ladder';
import { addLadderBranchLevel, addLadderParallelBranch, createInitialLadderDocument, createLadderInstruction, findLadderCircuit, insertLadderInstruction, moveLadderInstruction, serializeLadderDocument, updateLadderInstruction } from './ladderEditorModel';

const tags: PlcTag[] = [
  { name: 'Start', dataType: 'BOOL', usage: 'in' }, { name: 'Stop', dataType: 'BOOL', usage: 'in' }, { name: 'Motor', dataType: 'BOOL', usage: 'out' }, { name: 'Complete', dataType: 'BOOL', usage: 'out' },
  { name: 'Delay', dataType: 'TIMER', usage: 'inout', defaultValue: { PRE: 1000, ACC: 0, EN: false, TT: false, DN: false } },
];
const aoi: PlcAoi = { name: 'Editor test', description: 'Normalized editor serialization.', tags, routines: {} };

describe('PLC Ladder editor document', () => {
  it('serializes the default DOM document to backend-valid ordered rungs', () => {
    const source = serializeLadderDocument(createInitialLadderDocument());
    expect(source).toContain('XIC(Start) XIO(Stop) OTE(Motor);');
    expect(compileLadder(source, aoi)).toMatchObject({ success: true });
  });

  it('inserts a library instruction immediately after its wire anchor in series', () => {
    const document = createInitialLadderDocument(); const rung = document.rungs[document.rungIds[0]];
    const next = insertLadderInstruction(document, rung.circuit.id, 1, createLadderInstruction('ONS', ['PulseMemory']));
    expect(next.rungs[rung.id].circuit.elements.map(element => element.type === 'INSTRUCTION' ? element.instructionType : 'BRANCH')).toEqual(['XIC', 'ONS', 'XIO', 'OTE']);
  });

  it('replaces a circuit element with a flow-based parallel branch and can add a level at its DOM boundary', () => {
    const document = createInitialLadderDocument(); const rung = document.rungs[document.rungIds[0]];
    const branched = addLadderParallelBranch(document, rung.circuit.id, 0, createLadderInstruction('XIC', ['AlternateStart']));
    const branch = branched.rungs[rung.id].circuit.elements[0];
    expect(branch).toMatchObject({ type: 'BRANCH', circuits: [{ elements: [{ instructionType: 'XIC' }] }, { elements: [{ instructionType: 'XIC', parameters: ['AlternateStart'] }] }] });
    if (branch.type !== 'BRANCH') throw new Error('expected branch');
    const withLevel = addLadderBranchLevel(branched, branch.id, 1, createLadderInstruction('XIO', ['Interlock']));
    const updated = withLevel.rungs[rung.id].circuit.elements[0];
    expect(updated.type === 'BRANCH' && updated.circuits).toHaveLength(3);
    expect(serializeLadderDocument(withLevel)).toContain('[XIC(Start)|XIO(Interlock)|XIC(AlternateStart)]');
  });

  it('moves an instruction through the normalized circuit tree without storing visual coordinates', () => {
    const document = createInitialLadderDocument(); const rung = document.rungs[document.rungIds[0]]; const second = document.rungs[document.rungIds[1]];
    const moved = moveLadderInstruction(document, rung.circuit.elements[0].id, second.circuit.id, 1);
    expect(moved.rungs[rung.id].circuit.elements).toHaveLength(2);
    expect(moved.rungs[second.id].circuit.elements.map(element => element.type === 'INSTRUCTION' ? element.instructionType : 'BRANCH')).toEqual(['XIC', 'XIC', 'TON']);
    expect(findLadderCircuit(moved, second.circuit.id)).toBeDefined();
  });

  it('always normalizes OTE, OTL, and OTU to the right end of the main rung circuit', () => {
    const document = createInitialLadderDocument(); const rung = document.rungs[document.rungIds[0]];
    const withLatch = insertLadderInstruction(document, rung.circuit.id, 0, createLadderInstruction('OTL', ['LatchedMotor']));
    expect(withLatch.rungs[rung.id].circuit.elements.map(element => element.type === 'INSTRUCTION' ? element.instructionType : 'BRANCH')).toEqual(['XIC', 'XIO', 'OTE', 'OTL']);
    const changed = updateLadderInstruction(withLatch, withLatch.rungs[rung.id].circuit.elements[0].id, { instructionType: 'OTU', parameters: ['LatchedMotor'] });
    const types = changed.rungs[rung.id].circuit.elements.map(element => element.type === 'INSTRUCTION' ? element.instructionType : 'BRANCH');
    expect(types[0]).toBe('XIO');
    expect(types.slice(1)).toEqual(expect.arrayContaining(['OTE', 'OTL', 'OTU']));
  });

  it('returns a moved coil to the parent rung end rather than leaving it inside a parallel path', () => {
    const document = createInitialLadderDocument(); const rung = document.rungs[document.rungIds[0]];
    const branched = addLadderParallelBranch(document, rung.circuit.id, 0, createLadderInstruction('XIC', ['AlternateStart']));
    const branch = branched.rungs[rung.id].circuit.elements[0];
    if (branch.type !== 'BRANCH') throw new Error('expected branch');
    const coil = branched.rungs[rung.id].circuit.elements.at(-1);
    if (!coil || coil.type !== 'INSTRUCTION') throw new Error('expected coil');
    const moved = moveLadderInstruction(branched, coil.id, branch.circuits[0].id, 0);
    expect(moved.rungs[rung.id].circuit.elements.at(-1)).toMatchObject({ type: 'INSTRUCTION', instructionType: 'OTE' });
    expect(serializeLadderDocument(moved)).toContain('[XIC(Start)|XIC(AlternateStart)] XIO(Stop) OTE(Motor);');
  });
});
