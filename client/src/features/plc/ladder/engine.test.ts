import { describe, expect, it } from 'vitest';
import { PlcLadderEngine } from './engine';
import { parseLadder } from './parser';
import { dintDiv, dintMod, parsePlcNumber, toDint } from './numeric';
import type { PlcAoi, PlcTag } from './types';

const bool = (name: string, usage: PlcTag['usage'] = 'in'): PlcTag => ({ name, dataType: 'BOOL', usage });
const dint = (name: string, usage: PlcTag['usage'] = 'inout', defaultValue = 0): PlcTag => ({ name, dataType: 'DINT', usage, defaultValue });
const program = (content: string, tags: PlcTag[]): PlcAoi => ({ name: 'PLC Regression', description: '', tags, routines: { Logic: { type: 'ld', content } } });

describe('PLC Ladder backend — compiler and deterministic scan loop', () => {
  it('parses recursive parallel branches and produces deterministic AST node paths', () => {
    const { ast, diagnostics } = parseLadder('XIC(Start) [XIC(ModeA)|XIO(ModeB)] OTE(Motor);');
    expect(diagnostics).toEqual([]);
    expect(ast.rungs[0].nodeId).toBe('r0');
    expect(ast.rungs[0].circuit.elements[1]).toMatchObject({ type: 'LDBranch', nodeId: 'r0.b1' });
  });

  it('evaluates series in source order and parallel legs as an OR of common incoming power', () => {
    const engine = new PlcLadderEngine(program('XIC(Start) [XIC(A)|XIC(B)] OTE(Motor);', [bool('Start'), bool('A'), bool('B'), bool('Motor', 'out')]));
    engine.start();
    engine.setTag('Start', true); engine.setTag('A', false); engine.setTag('B', true);
    engine.pause(); const snapshot = engine.manualStep();
    expect(snapshot.parameters.Motor).toBe(true);
    expect(snapshot.trace?.rungs[0].outputPower).toBe(true);
  });

  it('runs prescan before normal scans so ONS suppresses an already-true startup condition', () => {
    const engine = new PlcLadderEngine(program('XIC(Start) ONS(Seen) OTE(Pulse);', [bool('Start'), bool('Seen', 'local'), bool('Pulse', 'out')]));
    engine.setTag('Start', true);
    engine.start(); engine.pause();
    expect(engine.manualStep().parameters.Pulse).toBe(false);
    engine.setTag('Start', false); engine.manualStep();
    engine.setTag('Start', true); expect(engine.manualStep().parameters.Pulse).toBe(true);
  });

  it('initializes OSR/OSF storage during prescan and emits only the respective logical edge', () => {
    const engine = new PlcLadderEngine(program('XIC(Input) OSR(RiseSeen,Rise); XIC(Input) OSF(FallSeen,Fall);', [bool('Input'), bool('RiseSeen', 'local'), bool('FallSeen', 'local'), bool('Rise', 'out'), bool('Fall', 'out')]));
    engine.start(); engine.pause(); engine.setTag('Input', true);
    expect(engine.manualStep().parameters).toMatchObject({ Rise: false, Fall: false });
    engine.setTag('Input', false);
    expect(engine.manualStep().parameters).toMatchObject({ Rise: false, Fall: true });
    engine.setTag('Input', true);
    expect(engine.manualStep().parameters).toMatchObject({ Rise: true, Fall: false });
  });

  it('maintains microsecond timer hidden state and only exposes TON done after elapsed complete scan periods', () => {
    const timer: PlcTag = { name: 'Delay', dataType: 'TIMER', usage: 'inout', defaultValue: { PRE: 200, ACC: 0, EN: false, TT: false, DN: false } };
    const engine = new PlcLadderEngine(program('XIC(Start) TON(Delay); XIC(Delay.DN) OTE(Done);', [bool('Start'), bool('Done', 'out'), timer]), { scanTimeMs: 100 });
    engine.start(); engine.setTag('Start', true); engine.scheduledAdvanceTo(100_000); engine.scheduledAdvanceTo(200_000);
    expect((engine.snapshot.parameters.Delay as { ACC: number; DN: boolean }).ACC).toBe(100);
    engine.scheduledAdvanceTo(300_000);
    expect((engine.snapshot.parameters.Delay as { DN: boolean }).DN).toBe(true);
    expect(engine.snapshot.parameters.Done).toBe(true);
  });

  it('applies TOF off-delay, retains RTO accumulation, and clears structured state through RES', () => {
    const off: PlcTag = { name: 'OffDelay', dataType: 'TIMER', usage: 'inout', defaultValue: { PRE: 200, ACC: 0, EN: false, TT: false, DN: false } };
    const retained: PlcTag = { name: 'Retained', dataType: 'TIMER', usage: 'inout', defaultValue: { PRE: 200, ACC: 0, EN: false, TT: false, DN: false } };
    const engine = new PlcLadderEngine(program('XIC(Input) TOF(OffDelay); XIC(Input) RTO(Retained); XIC(Reset) RES(Retained);', [bool('Input'), bool('Reset'), off, retained]), { scanTimeMs: 100 });
    engine.start(); engine.setTag('Input', true); engine.scheduledAdvanceTo(100_000);
    expect(engine.snapshot.parameters.OffDelay).toMatchObject({ DN: true });
    engine.scheduledAdvanceTo(200_000); engine.setTag('Input', false); engine.scheduledAdvanceTo(300_000);
    expect(engine.snapshot.parameters.OffDelay).toMatchObject({ DN: true, TT: true });
    engine.scheduledAdvanceTo(400_000); engine.scheduledAdvanceTo(500_000);
    expect(engine.snapshot.parameters.OffDelay).toMatchObject({ DN: false });
    expect(engine.snapshot.parameters.Retained).toMatchObject({ ACC: 100, DN: false });
    engine.setTag('Input', true); engine.scheduledAdvanceTo(600_000); engine.scheduledAdvanceTo(700_000); engine.scheduledAdvanceTo(800_000);
    expect(engine.snapshot.parameters.Retained).toMatchObject({ DN: true });
    engine.setTag('Reset', true); engine.scheduledAdvanceTo(900_000);
    expect(engine.snapshot.parameters.Retained).toMatchObject({ ACC: 0, DN: false });
  });

  it('uses prescan edge latches for counters and increments only on subsequent rising edges', () => {
    const counter: PlcTag = { name: 'Count', dataType: 'COUNTER', usage: 'inout', defaultValue: { PRE: 1, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false } };
    const engine = new PlcLadderEngine(program('XIC(Pulse) CTU(Count);', [bool('Pulse'), counter]));
    engine.start(); engine.pause(); engine.setTag('Pulse', true); engine.manualStep();
    expect((engine.snapshot.parameters.Count as { ACC: number }).ACC).toBe(0);
    engine.setTag('Pulse', false); engine.manualStep(); engine.setTag('Pulse', true); engine.manualStep();
    expect(engine.snapshot.parameters.Count).toMatchObject({ ACC: 1, DN: true });
  });

  it('uses an edited counter preset as the live DN threshold', () => {
    const counter: PlcTag = { name: 'Count', dataType: 'COUNTER', usage: 'inout', defaultValue: { PRE: 3, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false } };
    const engine = new PlcLadderEngine(program('XIC(Pulse) CTU(Count);', [bool('Pulse'), counter]));
    engine.start(); engine.pause();
    engine.setTag('Count', { PRE: 5, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false });
    engine.setTag('Pulse', false); engine.manualStep();
    for (let pulse = 1; pulse <= 4; pulse += 1) { engine.setTag('Pulse', true); engine.manualStep(); engine.setTag('Pulse', false); engine.manualStep(); }
    expect(engine.snapshot.parameters.Count).toMatchObject({ PRE: 5, ACC: 4, DN: false });
    engine.setTag('Pulse', true); engine.manualStep();
    expect(engine.snapshot.parameters.Count).toMatchObject({ PRE: 5, ACC: 5, DN: true });
  });

  it('maintains FBD timer, CTUD, and one-shot hidden state across scans', () => {
    const fbdTimer: PlcTag = { name: 'BlockTimer', dataType: 'FBD_TIMER', usage: 'inout', defaultValue: { EnableIn: true, TimerEnable: false, PRE: 100, Reset: false, EnableOut: true, ACC: 0, EN: false, TT: false, DN: false, Status: 0, InstructFault: false, PresetInv: false } };
    const fbdCounter: PlcTag = { name: 'UpDown', dataType: 'FBD_COUNTER', usage: 'inout', defaultValue: { EnableIn: true, CUEnable: false, CDEnable: false, PRE: 1, Reset: false, EnableOut: true, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false } };
    const oneShot: PlcTag = { name: 'Edge', dataType: 'FBD_ONESHOT', usage: 'inout', defaultValue: { EnableIn: true, InputBit: false, EnableOut: true, OutputBit: false } };
    const engine = new PlcLadderEngine(program('TONR(BlockTimer); CTUD(UpDown,Up,Down,Reset); OSRI(Edge);', [fbdTimer, fbdCounter, oneShot, bool('Up'), bool('Down'), bool('Reset')]), { scanTimeMs: 100 });
    engine.start();
    engine.setTag('BlockTimer', { EnableIn: true, TimerEnable: true, PRE: 100, Reset: false, EnableOut: false, ACC: 0, EN: false, TT: false, DN: false, Status: 0, InstructFault: false, PresetInv: false });
    engine.scheduledAdvanceTo(100_000); engine.scheduledAdvanceTo(200_000);
    expect(engine.snapshot.parameters.BlockTimer).toMatchObject({ DN: true, EnableOut: true });
    engine.scheduledAdvanceTo(300_000); engine.setTag('Up', true); engine.scheduledAdvanceTo(400_000);
    expect(engine.snapshot.parameters.UpDown).toMatchObject({ ACC: 1, DN: true });
    engine.setTag('Edge', { EnableIn: true, InputBit: false, EnableOut: true, OutputBit: false }); engine.scheduledAdvanceTo(500_000);
    engine.setTag('Edge', { EnableIn: true, InputBit: true, EnableOut: true, OutputBit: false }); engine.scheduledAdvanceTo(600_000);
    expect(engine.snapshot.parameters.Edge).toMatchObject({ OutputBit: true, EnableOut: true });
  });

  it('makes simultaneous CTUD rising edges cancel and exposes FBD preset faults structurally', () => {
    const counter: PlcTag = { name: 'Count', dataType: 'FBD_COUNTER', usage: 'inout', defaultValue: { EnableIn: true, CUEnable: false, CDEnable: false, PRE: 1, Reset: false, EnableOut: true, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false } };
    const timer: PlcTag = { name: 'FaultTimer', dataType: 'FBD_TIMER', usage: 'inout', defaultValue: { EnableIn: true, TimerEnable: true, PRE: -1, Reset: false, EnableOut: true, ACC: 0, EN: false, TT: false, DN: false, Status: 0, InstructFault: false, PresetInv: false } };
    const engine = new PlcLadderEngine(program('CTUD(Count,Up,Down,Reset); TONR(FaultTimer);', [counter, timer, bool('Up'), bool('Down'), bool('Reset')]), { scanTimeMs: 100 });
    engine.start(); engine.setTag('Up', false); engine.setTag('Down', false); engine.scheduledAdvanceTo(100_000);
    engine.setTag('Up', true); engine.setTag('Down', true); engine.scheduledAdvanceTo(200_000);
    expect(engine.snapshot.parameters.Count).toMatchObject({ ACC: 0 });
    expect(engine.snapshot.parameters.FaultTimer).toMatchObject({ InstructFault: true, PresetInv: true, Status: 3 });
  });

  it('performs numeric/logical operations before compare instructions and retains local tags separately', () => {
    const engine = new PlcLadderEngine(program('XIC(Enable) ADD(2,16#0003,Total) AND(Total,7,Masked) GRT(Masked,4) OTE(Over);', [bool('Enable'), dint('Total', 'local'), dint('Masked', 'local'), bool('Over', 'out')]));
    engine.start(); engine.setTag('Enable', true); engine.pause(); const snapshot = engine.manualStep();
    expect(snapshot.localTags.Total).toBe(5);
    expect(snapshot.localTags.Masked).toBe(5);
    expect(snapshot.parameters.Over).toBe(true);
  });

  it('implements mask, bit-transfer, and inclusive/reversed-band LIMIT operations in the ordered rung flow', () => {
    const engine = new PlcLadderEngine(program('XIC(Enable) MVM(16#00F0,16#000F,Masked) BTD(16#00F0,4,0,4,Field) LIM(10,Field,20) OTE(InBand); XIC(Enable) LIM(20,Field,10) OTE(OutsideBand);', [bool('Enable'), dint('Masked', 'local'), dint('Field', 'local'), bool('InBand', 'out'), bool('OutsideBand', 'out')]));
    engine.start(); engine.setTag('Enable', true); engine.pause(); const snapshot = engine.manualStep();
    expect(snapshot.localTags.Masked).toBe(0);
    expect(snapshot.localTags.Field).toBe(15);
    expect(snapshot.parameters.InBand).toBe(true);
    expect(snapshot.parameters.OutsideBand).toBe(false);
  });

  it('propagates REAL NaN through arithmetic and makes LIMIT fail closed', () => {
    const real: PlcTag = { name: 'Undefined', dataType: 'REAL', usage: 'local', defaultValue: 0 };
    const engine = new PlcLadderEngine(program('XIC(Enable) DIV(0,0,Undefined) LIM(0,Undefined,10) OTE(Valid);', [bool('Enable'), real, bool('Valid', 'out')]));
    engine.start(); engine.setTag('Enable', true); engine.pause(); const snapshot = engine.manualStep();
    expect(snapshot.localTags.Undefined).toSatisfy(Number.isNaN);
    expect(snapshot.parameters.Valid).toBe(false);
  });

  it('returns safe DINT edge behavior for division/modulo, radix literals, and tie-to-even rounding', () => {
    expect(dintDiv(9, 0)).toBe(9); expect(dintMod(9, 0)).toBe(0);
    expect(parsePlcNumber('16#FFFFFFFF')).toEqual({ value: -1, dataType: 'DINT' });
    expect(toDint(2.5)).toBe(2); expect(toDint(3.5)).toBe(4);
  });

  it('fails safely during semantic validation and never begins normal execution with an unknown tag', () => {
    const engine = new PlcLadderEngine(program('XIC(Missing) OTE(Motor);', [bool('Motor', 'out')]));
    const snapshot = engine.start();
    expect(engine.isRunning).toBe(false);
    expect(snapshot.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'LD-SEM-001' })]));
  });

  it('halts compilation safely for unsupported source and supplies generated code only for semantically valid routines', () => {
    const valid = new PlcLadderEngine(program('XIC(Start) OTE(Motor);', [bool('Start'), bool('Motor', 'out')]));
    expect(valid.compileRoutine().code).toContain('let __power=__prescan?0:1');
    const invalid = new PlcLadderEngine(program('BOGUS(Start);', [bool('Start')]));
    expect(invalid.compileRoutine()).toMatchObject({ success: false, code: undefined, diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'LD-PARSE-005' })]) });
  });
});
