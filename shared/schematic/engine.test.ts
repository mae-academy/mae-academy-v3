import { describe, expect, it } from 'vitest';
import { BJT_CE_STAGE, BUCK_CONVERTER, INVERTING_OPAMP, PID_LOOP, RC_LOWPASS, REFERENCE_SPECS, VOLTAGE_DIVIDER } from './fixtures';
import { layoutSchematic } from './layout';
import { analyze, netlistToMarkdown } from './netlist';
import { normalizeSchematicSpec, parseSchematicSpec } from './parse';
import { SCHEMATIC_FENCE, SCHEMATIC_SPEC_DOC } from './specDoc';
import { PART_TYPES } from './types';
import { validateSchematic } from './validate';

type Raw = Record<string, unknown>;
const spec = (parts: Raw[], wires: [number, number][][] = [], labels: Raw[] = [], extra: Raw = {}): Raw => ({
  parts, wires: wires.map((pts) => ({ pts })), labels, ...extra,
});
const codes = (r: { errors: { code: string }[] }): string[] => r.errors.map((e) => e.code);
const wcodes = (r: { warnings: { code: string }[] }): string[] => r.warnings.map((e) => e.code);
const R = (id: string, at: [number, number], rot = 0, value = '1 kΩ'): Raw => ({ id, type: 'resistor', value, at, rot });
const GND = (id: string, at: [number, number]): Raw => ({ id, type: 'ground', at });

describe('reference schematics', () => {
  for (const [name, s] of Object.entries(REFERENCE_SPECS)) {
    it(`${name} validates with zero errors and zero warnings`, () => {
      const r = validateSchematic(s);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    });
  }
});

describe('netlist derivation', () => {
  it('voltage divider', () => {
    const nl = validateSchematic(VOLTAGE_DIVIDER).netlist;
    const byId = Object.fromEntries(nl.parts.map((p) => [p.designator, p.nodes]));
    expect(nl.groundNet).toBe('N0');
    expect(byId.V1['-']).toBe('N0');
    expect(byId.R2['2']).toBe('N0');
    expect(byId.V1['+']).toBe(byId.R1['1']);
    expect(byId.R1['2']).toBe('Vout');
    expect(byId.R2['1']).toBe('Vout');
    expect(byId.R1['2']).toBe(byId.R2['1']);
  });
  it('buck converter', () => {
    const r = validateSchematic(BUCK_CONVERTER);
    const by = Object.fromEntries(r.netlist.parts.map((p) => [p.designator, p.nodes]));
    expect(by.S1['1']).toBe(by.V1['+']);
    expect(by.D1.K).toBe(by.S1['2']);
    expect(by.D1.K).toBe(by.L1['1']);
    expect(by.D1.A).toBe('N0');
    expect(by.L1['2']).toBe(by.C1['1']);
    expect(by.C1['1']).toBe(by.R1['1']);
    expect(by.C1['2']).toBe('N0');
    expect(by.R1['2']).toBe('N0');
    expect(r.netlist.parts.find((p) => p.designator === 'L1')!.value).toBe('50 µH');
    expect(r.netlist.parts.find((p) => p.designator === 'C1')!.value).toBe('47 µF');
    expect(r.netlist.nets.map((n) => n.id)).toEqual(['N0', 'N1', 'N2', 'N3']);
  });
  it('inverting op-amp', () => {
    const by = Object.fromEntries(validateSchematic(INVERTING_OPAMP).netlist.parts.map((p) => [p.designator, p.nodes]));
    expect(by.U1['IN+']).toBe('N0');
    expect(by.U1['IN-']).toBe(by.R1['2']);
    expect(by.U1['IN-']).toBe(by.R2['1']);
    expect(by.U1.OUT).toBe('Vout');
    expect(by.R2['2']).toBe('Vout');
    expect(by.R1['1']).toBe('Vin');
  });
  it('RC low-pass', () => {
    const by = Object.fromEntries(validateSchematic(RC_LOWPASS).netlist.parts.map((p) => [p.designator, p.nodes]));
    expect(by.R1['2']).toBe('Vout');
    expect(by.C1['1']).toBe('Vout');
    expect(by.C1['2']).toBe('N0');
  });
  it('control loop with sum and blocks', () => {
    const r = validateSchematic(PID_LOOP);
    const by = Object.fromEntries(r.netlist.parts.map((p) => [p.designator, p.nodes]));
    expect(r.netlist.groundNet).toBeNull();
    expect(by.SUM1.W).toBe('r(t)');
    expect(by.SUM1.N).toBe('-');
    expect(by.SUM1.E).toBe('e(t)');
    expect(by.C.in).toBe('e(t)');
    expect(by.C.out).toBe('u(t)');
    expect(by.G.in).toBe('u(t)');
    expect(by.G.out).toBe('y(t)');
    expect(by.SUM1.S).toBe('y(t)'); // the feedback path is the same net as the output
    expect(r.stats.junctions).toBe(1);
  });
  it('BJT stage merges equal rails and names ports', () => {
    const r = validateSchematic(BJT_CE_STAGE);
    const by = Object.fromEntries(r.netlist.parts.map((p) => [p.designator, p.nodes]));
    expect(by.RC['1']).toBe('+12 V');
    expect(by.R1['1']).toBe('+12 V');
    expect(by.Q1.C).toBe('Vout');
    expect(by.Q1.B).toBe(by.R2['1']);
    expect(by.RE['2']).toBe('N0');
    expect(by.R2['2']).toBe('N0');
  });
  it('renders a markdown table', () => {
    const md = netlistToMarkdown(validateSchematic(VOLTAGE_DIVIDER).netlist);
    expect(md).toContain('| R1 | resistor | 10 kΩ |');
    expect(md.split('\n')).toHaveLength(2 + 3);
  });
});

describe('gates', () => {
  it('G1 duplicate id / missing value / prefix', () => {
    const bad = validateSchematic(spec([R('R1', [0, 0]), R('R1', [10, 0]), { id: 'R3', type: 'resistor', at: [20, 0] }, GND('G', [0, 5])]));
    expect(codes(bad)).toContain('G1_DUPLICATE_ID');
    expect(codes(bad)).toContain('G1_NO_VALUE');
    const pre = validateSchematic(spec([R('X1', [0, 0])]));
    expect(wcodes(pre)).toContain('G1_PREFIX');
    expect(codes(validateSchematic(VOLTAGE_DIVIDER))).not.toContain('G1_DUPLICATE_ID');
  });
  it('G2 ground required for analog circuits only', () => {
    const noGnd = validateSchematic(spec([R('R1', [0, 0]), R('R2', [10, 0])], [[[4, 0], [10, 0]], [[0, 0], [0, 4], [14, 4], [14, 0]]]));
    expect(codes(noGnd)).toContain('G2_NO_GROUND');
    expect(codes(validateSchematic(PID_LOOP))).not.toContain('G2_NO_GROUND');
    expect(codes(validateSchematic(VOLTAGE_DIVIDER))).not.toContain('G2_NO_GROUND');
  });
  it('G3 shorted source, conflicting parallel sources, open current source', () => {
    const shorted = validateSchematic(spec([{ id: 'V1', type: 'vsource', value: '5 V', at: [4, 2], rot: 90 }], [[[4, 2], [2, 2], [2, 6], [4, 6]]]));
    expect(codes(shorted)).toContain('G3_SHORTED_SOURCE');
    const par = (v2: string) => validateSchematic(spec(
      [{ id: 'V1', type: 'vsource', value: '12 V', at: [4, 2], rot: 90 }, { id: 'V2', type: 'vsource', value: v2, at: [10, 2], rot: 90 }, GND('G1', [7, 6])],
      [[[4, 2], [10, 2]], [[4, 6], [7, 6]], [[7, 6], [10, 6]]]));
    expect(codes(par('5 V'))).toContain('G3_PARALLEL_SOURCES');
    expect(codes(par('12 V'))).not.toContain('G3_PARALLEL_SOURCES');
    expect(wcodes(par('12 V'))).toContain('G3_PARALLEL_SAME');
    const open = validateSchematic(spec(
      [{ id: 'I1', type: 'isource', value: '1 A', at: [4, 2], rot: 90 }, GND('G1', [4, 8]), { id: 'P', type: 'port', value: 'N', at: [8, 2] }],
      [[[4, 2], [8, 2]], [[4, 6], [4, 8]]]));
    expect(codes(open)).toContain('G3_CURRENT_SOURCE_OPEN');
    const ok = validateSchematic(spec(
      [{ id: 'I1', type: 'isource', value: '1 A', at: [4, 2], rot: 90 }, GND('G1', [4, 8]), R('R1', [8, 2], 90), GND('G2', [8, 8])],
      [[[4, 2], [8, 2]], [[4, 6], [4, 8]], [[8, 6], [8, 8]]]));
    expect(codes(ok)).not.toContain('G3_CURRENT_SOURCE_OPEN');
  });
  it('G4 floating terminals are errors; a label on the net (or a port) makes it an open port', () => {
    const parts = [R('R1', [4, 2]), GND('G1', [4, 6])];
    const wires: [number, number][][] = [[[4, 2], [4, 6]]];
    const fl = validateSchematic(spec(parts, wires));
    expect(fl.errors.find((e) => e.code === 'G4_FLOATING')!.message).toContain('R1.2');
    const labelledAway = validateSchematic(spec(parts, wires, [{ text: 'OUT', at: [12, 2], anchor: 'start' }]));
    expect(codes(labelledAway)).toContain('G4_FLOATING'); // the label does not sit on the net
    const labelled = validateSchematic(spec(parts, wires, [{ text: 'OUT', at: [8, 2], anchor: 'start' }]));
    expect(codes(labelled)).not.toContain('G4_FLOATING');
    const viaStub = validateSchematic(spec(parts, [...wires, [[8, 2], [10, 2]]], [{ text: 'OUT', at: [9, 2], anchor: 'start' }]));
    expect(codes(viaStub)).not.toContain('G4_FLOATING');
    const port = validateSchematic(spec([...parts, { id: 'P1', type: 'port', value: 'OUT', at: [10, 2] }], [...wires, [[8, 2], [10, 2]]]));
    expect(codes(port)).not.toContain('G4_FLOATING');
  });
  it('G5 diode shorted anode-cathode; polarised capacitor on ground', () => {
    const sh = validateSchematic(spec([{ id: 'D1', type: 'diode', at: [4, 2] }], [[[4, 2], [4, 0], [7, 0], [7, 2]]]));
    expect(codes(sh)).toContain('G5_DIODE_SHORTED');
    const cap = validateSchematic(spec([{ id: 'C1', type: 'polarized_capacitor', value: '10 uF', at: [4, 4], rot: 90 }, GND('G1', [4, 4]), R('R1', [8, 4], 90)], [[[4, 7], [4, 9], [8, 9], [8, 8]]]));
    expect(wcodes(cap)).toContain('G5_POLARITY');
  });
  it('G6 crossover is not a connection, T junction is', () => {
    const cross = analyze(normalizeSchematicSpec(spec([], [[[2, 4], [10, 4]], [[6, 0], [6, 8]]])).spec!);
    expect(cross.crossings).toEqual([[6, 4]]);
    expect(cross.dots).toEqual([]);
    expect(cross.wireComp[0]).not.toBe(cross.wireComp[1]);
    const tee = analyze(normalizeSchematicSpec(spec([], [[[2, 4], [10, 4]], [[6, 4], [6, 8]]])).spec!);
    expect(tee.crossings).toEqual([]);
    expect(tee.dots).toEqual([[6, 4]]);
    expect(tee.wireComp[0]).toBe(tee.wireComp[1]);
    const bend = analyze(normalizeSchematicSpec(spec([], [[[2, 4], [10, 4]], [[6, 8], [6, 4], [9, 4]]])).spec!);
    expect(bend.wireComp[0]).toBe(bend.wireComp[1]);
    const r = validateSchematic(spec([], [[[2, 4], [10, 4]], [[6, 0], [6, 8]]]));
    expect(r.stats.crossovers).toBe(1);
    expect(r.stats.junctions).toBe(0);
  });
  it('G6 wire over a terminal without a vertex is an error; near miss warns', () => {
    const over = validateSchematic(spec([R('R1', [4, 2]), GND('G1', [4, 6])], [[[8, 0], [8, 4]], [[4, 2], [4, 6]]]));
    expect(codes(over)).toContain('G6_WIRE_OVER_TERMINAL');
    const nm = validateSchematic(spec([], [[[2, 4], [10, 4]], [[6, 2], [6, 3]]]));
    expect(wcodes(nm)).toContain('G6_NEAR_MISS');
  });
  it('G7 diagonal, zero-length and through-part wires', () => {
    expect(codes(validateSchematic(spec([], [[[0, 0], [3, 3]]])))).toContain('G7_DIAGONAL');
    expect(codes(validateSchematic(spec([], [[[0, 0], [0, 0], [3, 0]]])))).toContain('G7_ZERO_LENGTH');
    const thru = validateSchematic(spec([R('R1', [4, 2])], [[[6, 0], [6, 4]]]));
    expect(codes(thru)).toContain('G7_WIRE_THROUGH_PART');
    const around = validateSchematic(spec([R('R1', [4, 2])], [[[4, 0], [8, 0]]]));
    expect(codes(around)).not.toContain('G7_WIRE_THROUGH_PART');
    expect(codes(validateSchematic(spec([], [[[0, 0.5], [3, 0]]])))).toContain('COORD_NOT_INTEGER');
  });
  it('G8 domains: containment, ambiguity and crossings', () => {
    const doms = [{ name: 'Power', rect: [0, 0, 12, 10] }, { name: 'Control', rect: [20, 0, 12, 10] }];
    const base = (rAt: [number, number], wires: [number, number][][]) => validateSchematic(spec(
      [R('R1', rAt), R('R2', [24, 4]), GND('G1', [4, 7]), GND('G2', [26, 7])], wires, [], { domains: doms }));
    const ok = base([2, 4], [[[6, 4], [6, 7], [4, 7]], [[2, 4], [2, 7], [4, 7]], [[28, 4], [28, 7], [26, 7]], [[24, 4], [24, 7], [26, 7]]]);
    expect(ok.errors.filter((e) => e.code.startsWith('G8'))).toEqual([]);
    const outside = base([14, 4], []);
    expect(codes(outside)).toContain('G8_OUTSIDE');
    const crossing = base([2, 4], [[[6, 4], [24, 4]]]);
    expect(codes(crossing)).toContain('G8_CROSSING');
    const overlapDom = validateSchematic(spec([R('R1', [2, 4])], [], [], { domains: [{ name: 'A', rect: [0, 0, 12, 10] }, { name: 'B', rect: [0, 0, 12, 10] }] }));
    expect(codes(overlapDom)).toContain('G8_AMBIGUOUS');
    const iso = validateSchematic(spec([{ id: 'U1', type: 'optocoupler', at: [8, 2] }], [], [], { domains: doms }));
    expect(codes(iso)).not.toContain('G8_OUTSIDE');
  });
  it('G9 wrong unit is an error, unparseable a warning', () => {
    const mk = (type: string, value: string) => validateSchematic(spec([{ id: type === 'capacitor' ? 'C1' : 'R1', type, value, at: [4, 2] }]));
    expect(codes(mk('capacitor', '10 kΩ'))).toContain('G9_WRONG_UNIT');
    expect(codes(mk('resistor', '10 uF'))).toContain('G9_WRONG_UNIT');
    expect(codes(mk('capacitor', '47 µF'))).not.toContain('G9_WRONG_UNIT');
    expect(wcodes(mk('resistor', 'ten kilo'))).toContain('G9_UNPARSEABLE');
    expect(codes(mk('resistor', 'ten kilo'))).not.toContain('G9_UNPARSEABLE');
  });
  it('G10 implausible values warn and are never altered', () => {
    const mk = (type: string, id: string, value: string) => validateSchematic(spec([{ id, type, value, at: [4, 2] }]));
    expect(wcodes(mk('resistor', 'R1', '0.0001 Ω'))).toContain('G10_RANGE');
    expect(wcodes(mk('resistor', 'R1', '200 MΩ'))).toContain('G10_RANGE');
    expect(wcodes(mk('capacitor', 'C1', '2 F'))).toContain('G10_RANGE');
    expect(wcodes(mk('inductor', 'L1', '500 H'))).toContain('G10_RANGE');
    expect(wcodes(mk('vsource', 'V1', '5 kV'))).toContain('G10_RANGE');
    expect(wcodes(mk('resistor', 'R1', '10 kΩ'))).not.toContain('G10_RANGE');
    expect(mk('vsource', 'V1', '5 kV').netlist.parts[0].value).toBe('5 kV');
    const rev = validateSpecDiodeAcrossSource();
    expect(wcodes(rev)).toContain('G10_DIODE_REVERSE');
  });
  it('geometry: overlap is an error, tight spacing a warning', () => {
    expect(codes(validateSchematic(spec([R('R1', [4, 2]), R('R2', [6, 2])])))).toContain('GEOM_OVERLAP');
    expect(wcodes(validateSchematic(spec([R('R1', [4, 2]), R('R2', [4, 3])])))).toContain('GEOM_CLEARANCE');
    expect(wcodes(validateSchematic(spec([R('R1', [4, 2]), R('R2', [4, 6])])))).not.toContain('GEOM_CLEARANCE');
  });
});

function validateSpecDiodeAcrossSource() {
  return validateSchematic(spec(
    [{ id: 'V1', type: 'vsource', value: '5 V', at: [4, 2], rot: 90 }, { id: 'D1', type: 'diode', at: [9, 6], rot: 270 }, GND('G1', [4, 8])],
    [[[4, 2], [9, 2]], [[9, 3], [9, 2]], [[4, 6], [4, 8]], [[9, 6], [9, 8], [4, 8]]]));
}

describe('label placement', () => {
  it('falls back to another slot when the preferred one is blocked', () => {
    const open = layoutSchematic(normalizeSchematicSpec(spec([R('R1', [4, 4])])).spec!);
    const blocked = layoutSchematic(normalizeSchematicSpec(spec([R('R1', [4, 4])], [[[2, 3], [10, 3]]])).spec!);
    expect(open.partLabels[0].rect[3]).toBeLessThan(4 * 20 - 10); // above the body
    expect(blocked.partLabels[0].rect[1]).toBeGreaterThan(4 * 20 + 10); // fell back below
    expect(blocked.warnings.filter((w) => w.code === 'LABEL_NO_SLOT')).toEqual([]);
  });
  it('warns when no clean slot exists', () => {
    const wires: [number, number][][] = [];
    for (let y = -4; y <= 12; y++) wires.push([[-6, y], [16, y]]);
    for (let x = -6; x <= 16; x++) wires.push([[x, -4], [x, 12]]);
    const lay = layoutSchematic(normalizeSchematicSpec(spec([R('R1', [4, 4])], wires)).spec!);
    expect(lay.warnings.some((w) => w.code === 'LABEL_NO_SLOT')).toBe(true);
  });
});

describe('parsing untrusted text', () => {
  const body = JSON.stringify(VOLTAGE_DIVIDER);
  it('accepts fenced blocks, bare JSON and surrounding prose', () => {
    for (const text of ['```schematic\n' + body + '\n```', '```json\n' + body + '\n```', 'Here you go:\n```\n' + body + '\n```\nEnjoy', 'prefix ' + body + ' suffix']) {
      const r = parseSchematicSpec(text);
      expect(r.errors).toEqual([]);
      expect(r.spec!.parts).toHaveLength(4);
    }
  });
  it('is strict JSON: trailing commas and comments are errors', () => {
    expect(parseSchematicSpec('{"parts":[],}').errors[0].code).toBe('PARSE_JSON');
    expect(parseSchematicSpec('no json here').errors[0].code).toBe('PARSE_NO_JSON');
    expect(parseSchematicSpec('{"parts":[] // c\n}').errors[0].code).toBe('PARSE_JSON');
  });
  it('enforces size caps', () => {
    const parts = Array.from({ length: 201 }, (_, i) => ({ id: `R${i}`, type: 'resistor', value: '1k', at: [0, 0] }));
    expect(parseSchematicSpec(JSON.stringify({ parts })).errors[0].code).toBe('SIZE_CAP');
    const wires = Array.from({ length: 601 }, () => ({ pts: [[0, 0], [1, 0]] }));
    expect(parseSchematicSpec(JSON.stringify({ parts: [], wires })).errors[0].code).toBe('SIZE_CAP');
    expect(parseSchematicSpec(JSON.stringify({ parts: [{ id: 'R1', type: 'resistor', value: 'x'.repeat(81), at: [0, 0] }] })).errors.map((e) => e.code)).toContain('STRING_LENGTH');
    expect(parseSchematicSpec(JSON.stringify({ parts: [{ id: 'R1', type: 'resistor', value: '1k', at: [401, 0] }] })).errors.map((e) => e.code)).toContain('COORD_RANGE');
    expect(parseSchematicSpec('{"a":"' + 'x'.repeat(250_000) + '"}').errors[0].code).toBe('PARSE_SIZE');
  });
  it('rejects huge numbers, non-integers and unknown types with a helpful list', () => {
    const e = (p: unknown) => validateSchematic({ parts: [p] }).errors;
    expect(e({ id: 'R1', type: 'resistor', value: '1k', at: [1e308, 0] }).map((x) => x.code)).toContain('COORD_RANGE');
    expect(e({ id: 'R1', type: 'resistor', value: '1k', at: [0.5, 0] }).map((x) => x.code)).toContain('COORD_NOT_INTEGER');
    const unk = e({ id: 'R1', type: 'flux_capacitor', at: [0, 0] });
    expect(unk[0].code).toBe('TYPE_UNKNOWN');
    for (const t of PART_TYPES) expect(unk[0].message).toContain(t);
  });
  it('never throws on wrong types', () => {
    for (const bad of [null, 1, 'x', [], { parts: 'no' }, { parts: [null, 3, 'a'] }, { parts: [{}], wires: [{ pts: 5 }, { pts: [[1]] }] }, { wires: [[]], labels: [{}], domains: [{ rect: [1] }] }]) {
      const r = validateSchematic(bad);
      expect(r.ok).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  it('ignores __proto__ / constructor keys and never pollutes Object.prototype', () => {
    const text = '{"__proto__":{"polluted":1},"parts":[{"id":"R1","type":"resistor","value":"1k","at":[0,0],"attrs":{"__proto__":{"x":1},"constructor":{"y":1}}}],"constructor":{"prototype":{"z":1}}}';
    const r = parseSchematicSpec(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(r.spec).not.toBeNull();
    expect(Object.keys(r.spec!.parts[0].attrs)).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(validateSchematic({ parts: [{ id: '__proto__', type: 'resistor', value: '1k', at: [0, 0] }] }).errors).toBeDefined();
  });
});

describe('LLM spec doc', () => {
  it('is compact, lists every type and its terminals', () => {
    expect(SCHEMATIC_SPEC_DOC.length).toBeLessThanOrEqual(5200);
    for (const t of PART_TYPES) expect(SCHEMATIC_SPEC_DOC).toContain(`\n${t}:`);
    expect(SCHEMATIC_SPEC_DOC).toContain('resistor: 1:(0,0) 2:(4,0)');
    expect(SCHEMATIC_SPEC_DOC).toContain('npn: B:(0,0) C:(2,-2) E:(2,2)');
  });
  it('its worked example validates with zero errors and renders', async () => {
    const m = new RegExp('```' + SCHEMATIC_FENCE + '\\n([\\s\\S]*?)\\n```').exec(SCHEMATIC_SPEC_DOC);
    expect(m).not.toBeNull();
    const r = validateSchematic(m![1]);
    expect(r.errors).toEqual([]);
    const { renderSchematicSvg } = await import('./render');
    const out = renderSchematicSvg(JSON.parse(m![1]));
    expect(out.svg).toContain('<svg');
    expect(out.width).toBeGreaterThan(0);
  });
});
