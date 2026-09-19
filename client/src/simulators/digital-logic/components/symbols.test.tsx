import * as React from "react";
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderSymbol } from '@/simulators/digital-logic/components/symbols';

function markup(symbolId: string, props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(<svg>{renderSymbol(symbolId, false, props, 0)}</svg>);
}

describe('Tab D SVG symbol language', () => {
  it('keeps all scalable gates in their IEEE/ANSI silhouettes while stretching vertically and placing each output lead outside the body', () => {
    const andEight = markup('gate-and', { inputCount: 8 });
    const orEight = markup('gate-or', { inputCount: 8 });
    const nandEight = markup('gate-nand', { inputCount: 8 });
    const norEight = markup('gate-nor', { inputCount: 8 });
    const xorEight = markup('gate-xor', { inputCount: 8 });
    const xnorEight = markup('gate-xnor', { inputCount: 8 });
    [andEight, orEight, nandEight, norEight, xorEight, xnorEight].forEach(gate => {
      expect((gate.match(/x1="-50"/g) ?? [])).toHaveLength(8);
      expect(gate).not.toContain('INPUTS</text>');
    });
    expect(andEight).toContain('A 23,112.5');
    expect(orEight).toContain('M -20,-112.5');
    expect(xorEight).toContain('M -27,-112.5');
    expect(xnorEight).toContain('M -27,-112.5');
    [andEight, orEight, xorEight].forEach(gate => expect(gate).toContain('x1="25" y1="0" x2="50" y2="0"'));
    [nandEight, norEight, xnorEight].forEach(gate => expect(gate).toContain('x1="34" y1="0" x2="50" y2="0"'));
  });

  it('uses one centered body and boundary-connected leads for a generic IC block', () => {
    const mux = markup('logic-block', { _blockLabel: 'Multiplexer (MUX)', _inputCount: 6, _outputCount: 1 });
    expect((mux.match(/<rect/g) ?? [])).toHaveLength(1);
    expect(mux).toContain('x="-50" y="-100" width="100" height="200"');
    expect(mux).toContain('x1="-50" y1="-75" x2="-75" y2="-75"');
    expect(mux).toContain('x1="50" y1="0" x2="75" y2="0"');
    expect(mux).not.toContain('DES / Δ');
  });

  it('renders standard MUX/DEMUX trapezoids with selector leads on the bottom edge', () => {
    const mux = markup('logic-block', { _componentType: 'logic-mux', _blockLabel: 'Multiplexer (MUX)', _terminals: [{ id: 'd0', type: 'input' }, { id: 'd1', type: 'input' }, { id: 'd2', type: 'input' }, { id: 'd3', type: 'input' }, { id: 's0', type: 'input' }, { id: 's1', type: 'input' }, { id: 'y', type: 'output' }] });
    const demux = markup('logic-block', { _componentType: 'logic-demux', _blockLabel: 'DEMUX', _terminals: [{ id: 'd', type: 'input' }, { id: 's0', type: 'input' }, { id: 's1', type: 'input' }, { id: 'y0', type: 'output' }, { id: 'y1', type: 'output' }, { id: 'y2', type: 'output' }, { id: 'y3', type: 'output' }] });
    expect(mux).toContain('M -50,-75 L 50,-46.5 L 50,46.5 L -50,75 Z');
    expect(demux).toContain('M -50,-46.5 L 50,-75 L 50,75 L -50,46.5 Z');
    expect((mux.match(/y2="100"/g) ?? [])).toHaveLength(2);
    expect((demux.match(/y2="100"/g) ?? [])).toHaveLength(2);
  });

  it('renders ALU notch, carry routing, edge-clock marker, and 5% memory cell grid', () => {
    const alu = markup('logic-block', { _componentType: 'logic-alu-4bit', _blockLabel: 'ALU (4-bit)', _terminals: [...['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', 'op0', 'op1', 'cin'].map(id => ({ id, type: 'input' })), ...['y0', 'y1', 'y2', 'y3', 'cout', 'zero'].map(id => ({ id, type: 'output' }))] });
    const adder = markup('logic-block', { _componentType: 'logic-full-adder', _blockLabel: 'Full Adder', _terminals: [...['a', 'b', 'cin'].map(id => ({ id, type: 'input' })), ...['sum', 'cout'].map(id => ({ id, type: 'output' }))] });
    const flip = markup('logic-block', { _componentType: 'logic-ff-d', _blockLabel: 'D Flip-Flop', _terminals: [...['d', 'clk'].map(id => ({ id, type: 'input' })), ...['q', 'qn'].map(id => ({ id, type: 'output' }))] });
    const ram = markup('logic-block', { _componentType: 'logic-ram-16x8', _blockLabel: 'RAM (16×8)', _terminals: [...['a0', 'a1', 'a2', 'a3', 'd0', 'd1', 'd2', 'd3', 'we', 'oe', 'clk'].map(id => ({ id, type: 'input' })), ...['q0', 'q1', 'q2', 'q3'].map(id => ({ id, type: 'output' }))] });
    expect(alu).toMatch(/L -[0-9]+,0/);
    expect(adder).toContain('Σ');
    expect(flip).toContain('L -43,');
    expect(ram).toContain('opacity="0.05"');
  });

  it('renders the DC rail as a neutral T without a blue filled body', () => {
    const rail = markup('dc-rail', { _documentedStyle: true });
    expect(rail).toContain('x1="-40" y1="0" x2="40" y2="0"');
    expect(rail).toContain('x1="0" y1="0" x2="0" y2="25"');
    expect(rail).not.toContain('#eff6ff');
  });

  it('renders VABC with each phase lead beginning at the true PHASE-circle boundary and an opposing neutral', () => {
    const source = markup('three-phase-source', { _documentedStyle: true });
    expect(source).toContain('PHASE');
    expect((source.match(/data-phase-lead="circle"/g) ?? [])).toHaveLength(2);
    expect((source.match(/data-phase-lead="axis"/g) ?? [])).toHaveLength(1);
    expect(source).toContain('x1="22" y1="0" x2="40" y2="0"');
    expect(source).toContain('x1="-22" y1="0" x2="-40" y2="0"');
    expect(source).toContain('y1="-15" x2="40" y2="-15"');
    expect(source).toContain('y1="15" x2="40" y2="15"');
  });

  it('uses red, yellow, blue, and neutral rails for the three-phase power rail', () => {
    const rail = markup('three-phase-rail', { _documentedStyle: true });
    expect(rail).toContain('#d14343');
    expect(rail).toContain('#d6a720');
    expect(rail).toContain('#2d73b7');
    expect(rail).toContain('x1="-40" y1="-30" x2="50" y2="-30"');
    expect(rail).toContain('x1="-40" y1="-10" x2="50" y2="-10"');
    expect(rail).toContain('x1="-40" y1="10" x2="50" y2="10"');
    expect(rail).toContain('x1="-40" y1="30" x2="50" y2="30"');
  });

  it('centers the documented IAC sine wave inside its source circle without changing the legacy branch', () => {
    const documented = markup('ac-current', { _documentedStyle: true });
    const legacy = markup('ac-current');
    expect(documented).toContain('x1="0" y1="-2" x2="0" y2="-13"');
    expect(documented).toContain('M -11,0 C -7,-7 -3,-7 0,0 C 3,7 7,7 11,0');
    expect(legacy).toContain('M -10,-4 Q -5,-14 0,-4 Q 5,6 10,-4');
  });

  it('uses a centered IEEE variable-resistor body and a centered vertical wiper terminal', () => {
    const minimum = markup('potentiometer', { _documentedStyle: true, wiper: 0 });
    expect(minimum).toContain('data-rigid-body="potentiometer"');
    expect(minimum).toContain('x="-20" y="-7" width="40" height="14"');
    expect(minimum).toContain('x1="0" y1="-30" x2="0" y2="-11"');
    expect(minimum).toContain('points="0,-7 -4,-12 4,-12"');
  });


  it('uses an IEEE-style documented op-amp with leads that end at the triangle boundary and leaves the legacy branch unchanged', () => {
    const documented = markup('opamp', { _documentedStyle: true });
    const legacy = markup('opamp');
    expect(documented).toContain('data-documented-opamp="ieee-boundary-aligned"');
    expect(documented).toContain('points="-22,-22 -22,22 26,0"');
    expect(documented).toContain('x1="-33.333333333333336" y1="-16.666666666666668" x2="-22" y2="-16.666666666666668"');
    expect(documented).toContain('x1="26" y1="0" x2="33.333333333333336" y2="0"');
    expect(legacy).toContain('points="-30,-30 -30,30 30,0"');
  });

  it('uses orthogonal collector/emitter routing and distinct regular arrowheads for NPN and PNP symbols', () => {
    const npn = markup('bjt-npn', { _documentedStyle: true });
    const pnp = markup('bjt-pnp', { _documentedStyle: true });
    expect(npn).toContain('d="M 0,-10 L 20,-18 L 20,-26"');
    expect(npn).toContain('d="M 0,10 L 20,18 L 20,26"');
    expect(npn).toContain('data-emitter-arrow="npn"');
    expect(pnp).toContain('data-emitter-arrow="pnp"');
    expect(npn).toContain('translate(10 14) rotate(21.8)');
    expect(pnp).toContain('points="-5,0 5,-3.5 5,3.5"');
    expect(npn).not.toBe(pnp);
  });

  it('uses repeated semicircular coil paths in documented transformers, relays, and contactors while retaining their contact geometry', () => {
    const transformer = markup('transformer', { _documentedStyle: true });
    const transformerCt = markup('transformer-ct', { _documentedStyle: true });
    const relay = markup('relay-spdt', { _documentedStyle: true });
    const contactor = markup('contactor', { _documentedStyle: true });
    expect((transformer.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(transformer).toContain('x1="-35" y1="-20" x2="-24" y2="-20"');
    expect(transformer).toContain('x1="24" y1="20" x2="35" y2="20"');
    expect(transformerCt).toContain('x1="24" y1="0" x2="35" y2="0"');
    expect((relay.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(relay).toContain('cx="-8" cy="20"');
    expect((contactor.match(/ C /g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(contactor).toContain('x1="-40" y1="0"');
  });

  it('renders distinct SVG symbols and dynamic IC block labels for all digital logic catalog components', () => {
    // 1. Clock oscillator symbol
    const clockSvg = markup('logic-clock');
    expect(clockSvg).toContain('CLK');
    expect(clockSvg).toMatch(/d="M -12,4 H -4 V -6 H 4 V 4 H 12 V -6"/);
    expect(clockSvg).not.toContain('LOGIC');

    // 2. Adders and Subtractors with math symbols and specific titles
    const haSvg = markup('half_adder');
    expect(haSvg).toContain('Σ');
    expect(haSvg).toContain('HA');
    expect(haSvg).not.toContain('LOGIC');

    const faSvg = markup('full_adder');
    expect(faSvg).toContain('Σ');
    expect(faSvg).toContain('FA');
    expect(faSvg).not.toContain('LOGIC');

    const hsSvg = markup('half_subtractor');
    expect(hsSvg).toContain('−');
    expect(hsSvg).toContain('HS');
    expect(hsSvg).not.toContain('LOGIC');

    const fsSvg = markup('full_subtractor');
    expect(fsSvg).toContain('−');
    expect(fsSvg).toContain('FS');
    expect(fsSvg).not.toContain('LOGIC');

    // 3. MUX and DEMUX trapezoids
    const muxSvg = markup('mux');
    expect(muxSvg).toContain('MUX');
    expect(muxSvg).toContain('path');
    expect(muxSvg).not.toContain('LOGIC');

    const demuxSvg = markup('demux');
    expect(demuxSvg).toContain('DEMUX');
    expect(demuxSvg).toContain('path');
    expect(demuxSvg).not.toContain('LOGIC');

    // 4. Encoders and Decoders
    const encSvg = markup('encoder');
    expect(encSvg).toContain('ENC');
    expect(encSvg).not.toContain('LOGIC');

    const decSvg = markup('decoder');
    expect(decSvg).toContain('DEC');
    expect(decSvg).not.toContain('LOGIC');

    // 5. Comparator
    const compSvg = markup('comparator');
    expect(compSvg).toContain('A ? B');
    expect(compSvg).toContain('COMP');
    expect(compSvg).not.toContain('LOGIC');

    // 6. Flip-flops with distinct abbreviations and clock edge markers
    const dffSvg = markup('d_ff');
    expect(dffSvg).toContain('D-FF');
    expect(dffSvg).not.toContain('LOGIC');

    const jkffSvg = markup('jk_ff');
    expect(jkffSvg).toContain('JK-FF');
    expect(jkffSvg).not.toContain('LOGIC');

    const tffSvg = markup('t_ff');
    expect(tffSvg).toContain('T-FF');
    expect(tffSvg).not.toContain('LOGIC');

    const srffSvg = markup('sr_ff');
    expect(srffSvg).toContain('SR-FF');
    expect(srffSvg).not.toContain('LOGIC');

    // 7. ALU 4-bit
    const aluSvg = markup('alu_4bit');
    expect(aluSvg).toContain('ALU');
    expect(aluSvg).toContain('A');
    expect(aluSvg).toContain('B');
    expect(aluSvg).not.toContain('LOGIC');

    // 8. Counter, Shift Register, RAM, ROM
    expect(markup('counter')).toContain('CTR');
    expect(markup('shift_register')).toContain('SHIFT REG');
    expect(markup('ram_16x8')).toContain('RAM');
    expect(markup('rom_16x8')).toContain('ROM');
  });

  it('verifies all components in digitalLogicCatalog render distinct symbols and zero generic LOGIC fallbacks', async () => {
    const { getAllDigitalLogicComponentDefs } = await import('@/simulators/digital-logic/models/digitalLogicCatalog');
    const allDefs = getAllDigitalLogicComponentDefs();
    expect(allDefs.length).toBeGreaterThanOrEqual(20);

    for (const def of allDefs) {
      const rendered = renderToStaticMarkup(
        <svg>
          {renderSymbol(
            def.symbol,
            false,
            {
              _componentType: def.id,
              _blockLabel: def.name,
              _terminals: def.terminals,
            },
            0
          )}
        </svg>
      );
      // Ensure no component falls back to the generic 'LOGIC' text
      expect(rendered, `Component ${def.id} (${def.name}) must not render generic LOGIC label`).not.toContain('>LOGIC<');
      // Ensure no component falls back to unknown '?'
      expect(rendered, `Component ${def.id} (${def.name}) must not render unknown ? marker`).not.toContain('>?<');
    }
  });
});


