// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { VALVE_TABLES } from '@shared/fluid/engine/valveTables';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import { analyzeSpool, cutawayKindOf, landPositions, spoolBodyOf, spoolGeometry, spoolStart, type SpoolKind } from './cutawayPhysics';
import { CutawayViewer } from './CutawayViewer';
import { cutawayTheme } from './cutawayParts';

/** Net connectivity of the cutaway at a spool offset, as sorted port groups of the hydraulic port numbers (P 1, B 2, T 3, A 4). */
const groupsAt = (type: string, kind: SpoolKind, offset: number) => {
  const body = spoolBodyOf(kind, type);
  const { intervals } = spoolGeometry(landPositions(spoolStart(kind, offset, type), body), body);
  return intervals.map(interval => interval.ports.map(port => body.labels?.[port] ?? port).sort().join('')).filter(group => group.length > 0);
};
/** The same from the engine's table: envelope 0 at offset +1, the middle one at 0, envelope 2 at −1. */
const tableGroups = (type: string, offset: number) => {
  const table = VALVE_TABLES[type];
  const envelope = table.envelopes[offset > 0 ? 0 : offset < 0 ? 2 : 1];
  return envelope.flows.map(([a, b]) => [a, b].sort().join(''));
};

describe('hydraulic 4/3 spool cutaways', () => {
  it('map the closed and float 4/3 valves to their own cutaways, and the 4/2 keeps its own', () => {
    expect(cutawayKindOf({ type: 'hvalve-4-3' })).toBe('spool43');
    expect(cutawayKindOf({ type: 'hvalve-4-3-float' })).toBe('spool43float');
    expect(cutawayKindOf({ type: 'hvalve-4-2' })).toBe('spool42');
    expect(cutawayKindOf({ type: 'hvalve-4-3-tandem' })).toBeNull();
  });

  it.each([['hvalve-4-3', 'spool43'], ['hvalve-4-3-float', 'spool43float']] as const)('%s: every spool position joins exactly the ports the engine table joins', (type, kind) => {
    for (const offset of [1, 0, -1]) {
      const drawn = groupsAt(type, kind, offset).filter(group => group.length > 1);
      // the two tank chambers both read port 3, so a tank chamber joined to a working port shows it once
      const expected = tableGroups(type, offset);
      const dedupe = (group: string) => Array.from(new Set(group.split(''))).sort().join('');
      const merged = new Set(drawn.map(dedupe));
      for (const pair of expected) expect([...merged].some(group => pair.split('').every(port => group.includes(port))), `${type} @${offset}: ${pair}`).toBe(true);
      // and nothing extra: the supply is joined to a working port only where the table says so
      const supplyJoined = [...merged].filter(group => group.includes('1'));
      const supplyExpected = expected.filter(pair => pair.includes('1'));
      expect(supplyJoined.length, `${type} @${offset} supply`).toBe(supplyExpected.length);
      for (const group of supplyJoined) expect(group.length, `${type} @${offset} supply group`).toBe(2);
    }
  });

  it('float centre: P shut, A and B joined to tank; closed centre: every port shut', () => {
    expect(groupsAt('hvalve-4-3-float', 'spool43float', 0).filter(group => group.length > 1).sort()).toEqual(['34', '23'].sort().map(g => g.split('').sort().join('')).sort());
    expect(groupsAt('hvalve-4-3', 'spool43', 0).filter(group => group.length > 1)).toEqual([]);
  });

  it.each([
    ['hvalve-4-2', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }],
    ['hvalve-4-3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' }],
    ['hvalve-4-3-float', { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' }],
  ] as const)('%s: the housing has exactly the four ports P, T, A, B and keeps its operators and springs', (type, operators) => {
    const props = { ...operators };
    const engine = new FluidEngine({ components: [{ id: 'v', type, props }], wires: [] } as never);
    const colors = { text: '#000', muted: '#666', line: '#ccc', panelAlt: '#eee', canvas: '#fff' } as never;
    const { container } = render(<CutawayViewer component={{ id: 'v', type, label: '1V1', props }} snapshot={engine.step(0.1)} medium="HYDRAULIC" colors={colors} isDark={false} />);
    const stages = ['[data-testid="cutaway-spool42"]', '[data-testid="cutaway-spool43"]', '[data-testid="cutaway-spool43float"]'];
    expect(stages.some(selector => container.querySelector(selector))).toBe(true);
    const pilotStubs = operators.actuationLeft === 'Pneumatic Pilot' ? 2 : 0;
    const stubs = Array.from(container.querySelectorAll('.port-stub')).filter(stub => stub.getAttribute('data-port') !== 'pilot');
    expect(stubs.map(stub => stub.getAttribute('data-port')).sort(), type).toEqual(['1', '2', '4', 'T']); // P, B, A and the single tank stub
    expect(container.querySelectorAll('.port-stub[data-port="pilot"]')).toHaveLength(pilotStubs);
    const tags = Array.from(container.querySelectorAll('svg text')).map(text => text.textContent);
    for (const letter of ['P', 'T', 'A', 'B']) expect(tags.filter(tag => tag === letter), `${type} ${letter}`).toHaveLength(1);
    for (const gone of ['3', '5']) expect(tags, `${type} no port ${gone}`).not.toContain(gone);
    expect(container.querySelectorAll('.tank-duct')).toHaveLength(1);
    // operators and springs are retained on the flanks
    expect(container.querySelectorAll('.spring-shoulder').length, type).toBeGreaterThanOrEqual(1);
    expect(cutawayTheme(false)).toBeTruthy();
  });

  it('the pneumatic 4/2 keeps its two numbered exhaust stubs and no tank duct', () => {
    const props = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
    const engine = new FluidEngine({ components: [{ id: 'v', type: 'valve-4-2', props }], wires: [] } as never);
    const colors = { text: '#000', muted: '#666', line: '#ccc', panelAlt: '#eee', canvas: '#fff' } as never;
    const { container } = render(<CutawayViewer component={{ id: 'v', type: 'valve-4-2', label: '1V1', props }} snapshot={engine.step(0.1)} medium="PNEUMATIC" colors={colors} isDark={false} />);
    expect(container.querySelectorAll('.tank-duct')).toHaveLength(0);
    expect(container.querySelectorAll('.port-stub')).toHaveLength(5);
  });
});

describe('hydraulic return flow to the tank', () => {
  const hydraulicPilot = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
  const spoolAt = (type: string, kind: SpoolKind, props: Record<string, unknown>, left = false, right = false) => {
    const engine = new FluidEngine({ components: [{ id: 'v', type, props }], wires: [] } as never);
    if (left) engine.setManual('v', 'left', true);
    if (right) engine.setManual('v', 'right', true);
    const snapshot = engine.step(0.6);
    return analyzeSpool({ id: 'v', type, label: '1V1', props }, snapshot, kind);
  };
  const returns = (analysis: ReturnType<typeof analyzeSpool>) => analysis.connections.filter(c => c.kind === 'return').map(c => `${analysis.body.letters?.[analysis.body.labels?.[c.from] ?? c.from]}>${analysis.body.letters?.[analysis.body.labels?.[c.to] ?? c.to]}`).sort();

  it('4/2 at rest: P→B with A draining to T; actuated: P→A with B draining to T', () => {
    const props = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
    expect(returns(spoolAt('hvalve-4-2', 'spool42', props))).toEqual(['A>T']);
    expect(returns(spoolAt('hvalve-4-2', 'spool42', props, true))).toEqual(['B>T']);
  });

  it('4/3 float: A and B both drain to T in the middle; closed: nothing drains', () => {
    expect(returns(spoolAt('hvalve-4-3-float', 'spool43float', hydraulicPilot))).toEqual(['A>T', 'B>T']);
    expect(returns(spoolAt('hvalve-4-3', 'spool43', hydraulicPilot))).toEqual([]);
  });

  it('3/2: A drains to T at rest and the supply reaches A when actuated', () => {
    const props = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
    expect(returns(spoolAt('hvalve-3-2-nc', 'spool32', props))).toEqual(['A>T']);
    expect(returns(spoolAt('hvalve-3-2-nc', 'spool32', props, true))).toEqual([]);
  });

  it('the return segments are drawn in the tank-return coral, the pneumatic ones are not', () => {
    const props = { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' };
    const colors = { text: '#000', muted: '#666', line: '#ccc', panelAlt: '#eee', canvas: '#fff' } as never;
    const show = (type: string, medium: 'HYDRAULIC' | 'PNEUMATIC') => {
      const engine = new FluidEngine({ components: [{ id: 'v', type, props }], wires: [] } as never);
      return render(<CutawayViewer component={{ id: 'v', type, label: '1V1', props }} snapshot={engine.step(0.1)} medium={medium} colors={colors} isDark={false} />).container;
    };
    expect(show('hvalve-4-2', 'HYDRAULIC').querySelectorAll('.cutaway-flow').length).toBeGreaterThan(0);
    expect(Array.from(show('hvalve-4-2', 'HYDRAULIC').querySelectorAll('rect')).some(rect => rect.getAttribute('fill') === '#FB7185')).toBe(true);
    expect(Array.from(show('valve-4-2', 'PNEUMATIC').querySelectorAll('rect')).some(rect => rect.getAttribute('fill') === '#FB7185')).toBe(false);
  });
});
