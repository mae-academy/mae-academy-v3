import { describe, expect, it } from 'vitest';
import { renderSpec, validateSchematic } from './index';
import { analyze } from './netlist';

const R = (id: string, value: string, a: string, b: string) => ({ id, type: 'resistor', value, pins: { '1': a, '2': b } });
const C = (id: string, value: string, a: string, b: string) => ({ id, type: 'capacitor', value, pins: { '1': a, '2': b } });
const D = (id: string, type: string, a: string, k: string, value?: string) => ({ id, type, value, pins: { A: a, K: k } });

type Part = { id: string; pins: Record<string, string> };

/** Every drawn wire must connect exactly what the netlist asked for (ground = N0), and nothing else. */
function expectConnectivity(request: { netlist: Part[] }, spec: NonNullable<ReturnType<typeof validateSchematic>['spec']>): void {
  const drawn = analyze(spec).netlist.netOfTerminal;
  const toDrawn = new Map<string, string>();
  const toWanted = new Map<string, string>();
  for (const part of request.netlist) {
    for (const [pin, wanted] of Object.entries(part.pins)) {
      const key = /^(0|gnd|ground)$/i.test(wanted) ? '0' : wanted;
      const net = drawn[`${part.id}.${pin}`];
      expect(net, `${part.id}.${pin} drawn`).toBeTruthy();
      expect(toDrawn.get(key) ?? net, `net ${key} split`).toBe(net);
      expect(toWanted.get(net) ?? key, `nets shorted at ${net}`).toBe(key);
      toDrawn.set(key, net);
      toWanted.set(net, key);
    }
  }
  if (toDrawn.has('0')) expect(toDrawn.get('0')).toBe('N0');
}

const CIRCUITS: Record<string, { netlist: Part[]; labels?: string[] }> = {
  divider: { netlist: [{ id: 'V1', type: 'vsource', value: '12 V', pins: { '+': 'VIN', '-': '0' } } as Part, R('R1', '10 kΩ', 'VIN', 'OUT'), R('R2', '10 kΩ', 'OUT', '0')], labels: ['VIN', 'OUT'] },
  zenerClamp: { netlist: [{ id: 'V1', type: 'vsource', value: '12 V', pins: { '+': 'VIN', '-': '0' } } as Part, R('R1', '470 Ω', 'VIN', 'VZ'), D('D1', 'zener', '0', 'VZ', '5.1 V'), R('RL', '1 kΩ', 'VZ', '0')], labels: ['VZ'] },
  commonEmitter: {
    netlist: [
      { id: 'VCC', type: 'vsource', value: '12 V', pins: { '+': 'VCC', '-': '0' } } as Part,
      { id: 'Vin', type: 'vsource_ac', value: '10 mV', pins: { '1': 'SIG', '2': '0' } } as Part,
      C('C1', '10 µF', 'SIG', 'B'), R('R1', '47 kΩ', 'VCC', 'B'), R('R2', '10 kΩ', 'B', '0'), R('RC', '2.2 kΩ', 'VCC', 'C'),
      { id: 'Q1', type: 'npn', pins: { B: 'B', C: 'C', E: 'E' } } as Part, R('RE', '1 kΩ', 'E', '0'), C('CE', '100 µF', 'E', '0'),
      C('C2', '10 µF', 'C', 'OUT'), R('RL', '10 kΩ', 'OUT', '0'),
    ],
    labels: ['OUT'],
  },
  invertingAmp: { netlist: [{ id: 'Vin', type: 'vsource_ac', value: '1 V', pins: { '1': 'VIN', '2': '0' } } as Part, R('R1', '10 kΩ', 'VIN', 'INV'), R('Rf', '100 kΩ', 'INV', 'OUT'), { id: 'U1', type: 'opamp', pins: { 'IN-': 'INV', 'IN+': '0', OUT: 'OUT' } } as Part, R('RL', '10 kΩ', 'OUT', '0')], labels: ['OUT'] },
  // a custom ESP32 GPIO protection stage: series resistor, zener clamp to ground, schottky clamp to the supply, EN reset network
  esp32Protection: {
    netlist: [
      { id: 'V1', type: 'vsource', value: '5 V', pins: { '+': 'VBUS', '-': '0' } } as Part,
      D('D1', 'schottky', 'VBUS', 'V5', '1 A'), C('C1', '10 µF', 'V5', '0'),
      { id: 'U1', type: 'ic', value: 'ESP32', attrs: { w: 10, h: 10, pins: [{ name: 'VIN', side: 'T', pos: 5 }, { name: 'GND', side: 'B', pos: 5 }, { name: 'IO4', side: 'R', pos: 3 }, { name: 'EN', side: 'L', pos: 3 }] }, pins: { VIN: 'V5', GND: '0', IO4: 'GPIO', EN: 'EN' } } as unknown as Part,
      R('R1', '10 kΩ', 'V5', 'EN'), C('C2', '1 µF', 'EN', '0'), R('R2', '220 Ω', 'GPIO', 'PIN'), D('D2', 'zener', '0', 'PIN', '3.3 V'), D('D3', 'schottky', 'PIN', 'V5', '1 A'),
    ],
    labels: ['GPIO', 'PIN'],
  },
  bridgeRectifier: {
    netlist: [
      { id: 'Vs', type: 'vsource_ac', value: '12 V', pins: { '1': 'A', '2': 'B' } } as Part,
      D('D1', 'diode', 'A', 'P'), D('D2', 'diode', 'B', 'P'), D('D3', 'diode', '0', 'A'), D('D4', 'diode', '0', 'B'),
      C('C1', '470 µF', 'P', '0'), R('RL', '1 kΩ', 'P', '0'),
    ],
    labels: ['P'],
  },
  hBridge: {
    netlist: [
      { id: 'VM', type: 'vsource', value: '12 V', pins: { '+': 'VM', '-': '0' } } as Part,
      { id: 'M1', type: 'nmos', pins: { G: 'G1', D: 'VM', S: 'X' } } as Part, { id: 'M2', type: 'nmos', pins: { G: 'G2', D: 'VM', S: 'Y' } } as Part,
      { id: 'M3', type: 'nmos', pins: { G: 'G3', D: 'X', S: '0' } } as Part, { id: 'M4', type: 'nmos', pins: { G: 'G4', D: 'Y', S: '0' } } as Part,
      { id: 'MOT', type: 'motor', value: 'M', pins: { '1': 'X', '2': 'Y' } } as Part,
    ],
    labels: ['G1', 'G2', 'G3', 'G4'],
  },
  nandNot: { netlist: [{ id: 'U1', type: 'nand', pins: { A: 'A', B: 'B', Y: 'Y' } } as Part, { id: 'U2', type: 'not', pins: { A: 'Y', Y: 'OUT' } } as Part], labels: ['A', 'B', 'OUT'] },
  feedbackLoop: {
    netlist: [
      { id: 'S1', type: 'sum', pins: { W: 'R', E: 'E', S: 'FB' } } as Part,
      { id: 'G1', type: 'gain', value: 'K', pins: { in: 'E', out: 'U' } } as Part, { id: 'P1', type: 'block', value: '1/(s+1)', pins: { in: 'U', out: 'Y' } } as Part,
      { id: 'H1', type: 'block', value: 'H(s)', pins: { in: 'Y', out: 'FB' } } as Part,
    ],
    labels: ['R', 'Y'],
  },
};

describe('netlist router', () => {
  for (const [name, request] of Object.entries(CIRCUITS)) {
    it(`${name}: places and routes into a verified drawing with exactly the requested connectivity`, () => {
      const result = validateSchematic(request);
      expect(result.errors.map((e) => e.message)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.spec).not.toBeNull();
      expectConnectivity(request, result.spec!);
      expect(renderSpec(result.spec!).svg).toContain('<svg');
    });
  }

  it('is deterministic', () => {
    const a = JSON.stringify(validateSchematic(CIRCUITS.commonEmitter).spec);
    const b = JSON.stringify(validateSchematic(CIRCUITS.commonEmitter).spec);
    expect(a).toBe(b);
  });

  it('adds a ground symbol, ports for labelled and dangling nets, and junction dots only at joins', () => {
    const result = validateSchematic(CIRCUITS.divider);
    const types = result.spec!.parts.map((p) => p.type);
    expect(types.filter((t) => t === 'ground')).toHaveLength(1);
    expect(types.filter((t) => t === 'port')).toHaveLength(2);
    expect(analyze(result.spec!).dots.length).toBeGreaterThan(0);
  });

  it('explains pin and net mistakes precisely', () => {
    const unknownPin = validateSchematic({ netlist: [R('R1', '1 kΩ', 'A', 'B'), { id: 'Q1', type: 'npn', pins: { B: 'A', C: 'B', X: '0' } }] });
    expect(unknownPin.ok).toBe(false);
    expect(unknownPin.errors.map((e) => e.message).join(' ')).toMatch(/Q1 \(npn\) has no pin "X"\. Its pins are: B, C, E/);
    const missing = validateSchematic({ netlist: [{ id: 'Q1', type: 'npn', pins: { B: 'A', C: 'B' } }] });
    expect(missing.errors.map((e) => e.message).join(' ')).toMatch(/Q1 \(npn\) pin E is not connected to any net/);
    const extra = validateSchematic({ netlist: [R('R1', '1 kΩ', 'A', '0')], parts: [] });
    expect(extra.errors.map((e) => e.message).join(' ')).toMatch(/remove "parts"/);
  });

  it('flags a bad value unit through the normal gates', () => {
    const result = validateSchematic({ netlist: [{ id: 'V1', type: 'vsource', value: '5 V', pins: { '+': 'A', '-': '0' } } as Part, R('R1', '10 µF', 'A', '0')] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'G9_WRONG_UNIT')).toBe(true);
  });

  it('routes randomly generated circuits cleanly (fuzz)', () => {
    const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; };
    const kinds: [string, string[], string | undefined][] = [
      ['resistor', ['1', '2'], '1 kΩ'], ['capacitor', ['1', '2'], '10 nF'], ['inductor', ['1', '2'], '10 µH'], ['diode', ['A', 'K'], undefined],
      ['npn', ['B', 'C', 'E'], undefined], ['nmos', ['G', 'D', 'S'], undefined], ['opamp', ['IN-', 'IN+', 'OUT'], undefined], ['nand', ['A', 'B', 'Y'], undefined],
    ];
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed * 7919);
      const n = 3 + Math.floor(r() * 16);
      const nets = 2 + Math.floor(n * 0.9);
      const net = () => { const k = Math.floor(r() * (nets + 1)); return k === 0 ? '0' : `N${k}`; };
      const netlist: unknown[] = [{ id: 'V1', type: 'vsource', value: '5 V', pins: { '+': 'N1', '-': '0' } }];
      for (let i = 0; i < n; i++) {
        const [type, pins, value] = kinds[Math.floor(r() * kinds.length)];
        netlist.push({ id: `X${i + 1}`, type, value, pins: Object.fromEntries(pins.map((p) => [p, net()])) });
      }
      const result = validateSchematic({ netlist, labels: ['N1'] });
      const blocking = result.errors.filter((e) => !/^G(3|5|10)_/.test(e.code));
      expect(blocking.map((e) => e.message), `seed ${seed}`).toEqual([]);
    }
  });
});
