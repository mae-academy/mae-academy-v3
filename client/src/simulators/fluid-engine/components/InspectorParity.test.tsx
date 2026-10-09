// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { ActiveElementProperties } from './ActiveElementProperties';
import { FluidIOModule, InputChannel } from './io/FluidIOModule';
import { idleLadder, makeElement, type LadderCircuit } from '../models/relayLadder';
import type { RelayLadder } from '../hooks/useRelayLadder';
import { listSensorOptions } from '../models/sensorCoupling';
import { assignSignalTags } from '../models/signalTags';
import { FLUID_CATALOG, FLUID_LIBRARY_CATEGORIES, defaultFluidProps, getFluidDefinition } from '../models/fluidCatalog';
import { FluidSymbol, type FluidSymbolProps } from './symbols/FluidSymbols';
import { FluidSimulatorApp } from './FluidSimulatorApp';
import { CutawayViewer } from './dissection/CutawayViewer';
import { SPOOL_BODY, analyzeSpool, cutawayKindOf, spoolStart, type SpoolKind } from './dissection/cutawayPhysics';
import { portsOf } from '@shared/fluid/engine/componentSolvers';
import { VALVE_TABLES } from '@shared/fluid/engine/valveTables';

afterEach(cleanup);

const COLORS = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ddd', text: '#111', muted: '#666', subtle: '#999', primary: '#00f', accent: '#70f', danger: '#f00', selection: '#70f', grid: '#eee', wire: '#000', powered: '#00f', input: '#fff', shadow: '' } as unknown as Palette;

function inspector(props: Record<string, unknown> = {}) {
  const definition = getFluidDefinition('valve-5-2')!;
  const component = { id: 'v1', type: 'valve-5-2', label: '1V1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(definition), ...props } };
  const onPropsChange = vi.fn();
  const onReplace = vi.fn();
  render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} replaceGroups={FLUID_LIBRARY_CATEGORIES.PNEUMATIC} onReplace={onReplace} onLabelChange={vi.fn()} onPropsChange={onPropsChange} />);
  return { onPropsChange, onReplace };
}

describe('inspector matches the Circuit Lab layout', () => {
  it('shows a clean title with its description, no glyph, tag chip or promotional copy', () => {
    inspector();
    expect(screen.getByText('5/2 Valve')).toBeTruthy();
    expect(screen.getByText('5/2-way directional control valve.')).toBeTruthy();
    expect(screen.queryByTestId('inspector-glyph')).toBeNull();
    expect(screen.queryByTestId('inspector-tag')).toBeNull();
    expect(screen.queryByText('Rotate')).toBeNull();
    expect(screen.getByText('Component')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Fluid Dynamics Engine/i);
  });

  it('toggles label and value visibility through hidden-flag props', () => {
    const { onPropsChange } = inspector();
    fireEvent.click(screen.getByRole('switch', { name: 'Show Label' }));
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ _hideLabel: true }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show Value / Parameters' }));
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ _hideValue: true }));
  });

  it('shows a hidden label as switched off', () => {
    inspector({ _hideLabel: true });
    expect(screen.getByRole('switch', { name: 'Show Label' }).getAttribute('aria-checked')).toBe('false');
  });

  it('opens a searchable, categorised list of every other part and replaces on pick', () => {
    const { onReplace } = inspector();
    fireEvent.click(screen.getByRole('button', { name: 'Replace Component' }));
    const names = screen.getAllByRole('option').map(option => option.textContent);
    expect(names).not.toContain('5/2 Valve');
    expect(names).toContain('Double-Acting Cylinder');
    fireEvent.change(screen.getByPlaceholderText('Search parts'), { target: { value: 'double-acting' } });
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('option', { name: 'Double-Acting Cylinder' }));
    expect(onReplace).toHaveBeenCalledWith('cylinder-double');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('InputChannel', () => {
  const row = (extra: Partial<React.ComponentProps<typeof InputChannel>> = {}) => {
    const handlers = { onPush: vi.fn(), onLatchToggle: vi.fn() };
    render(<InputChannel colors={COLORS} tag="1S1" description="Pushbutton (Manual)" active={false} latched={false} live {...handlers} {...extra} />);
    return handlers;
  };

  it('lays out tag, LED and a segmented ON / OFF / PUSH block; ON latches, OFF unlatches, PUSH is momentary', () => {
    const { onPush, onLatchToggle } = row();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Push' }));
    expect(onPush).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    expect(onLatchToggle).not.toHaveBeenCalled(); // already low
    fireEvent.click(screen.getByRole('button', { name: 'ON' }));
    expect(onLatchToggle).toHaveBeenCalledTimes(1);
    cleanup();
    const latched = row({ active: true, latched: true });
    fireEvent.click(screen.getByRole('button', { name: 'ON' }));
    expect(latched.onLatchToggle).not.toHaveBeenCalled(); // already high
    fireEvent.click(screen.getByRole('button', { name: 'OFF' }));
    expect(latched.onLatchToggle).toHaveBeenCalledTimes(1);
  });

  it('glows crimson while active and is inert until the simulation is live', () => {
    row({ active: true, latched: true });
    const lamp = screen.getByLabelText('active');
    expect(lamp.style.background).toBe('rgb(239, 68, 68)');
    expect(screen.getByRole('button', { name: 'ON' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    row({ live: false });
    expect((screen.getByRole('button', { name: 'Push' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'ON' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('FluidIOModule channels', () => {
  const unit = { id: 'u1', type: 'service-unit', label: '0Z1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(getFluidDefinition('service-unit')!) } };
  const valve = (id: string, label: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, type: 'valve-3-2-nc', label, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(getFluidDefinition('valve-3-2-nc')!), actuationLeft: kind, actuationRight: 'Spring Return', ...extra } });
  const mount = (components: ReturnType<typeof valve>[], onShutoffChange = vi.fn(), pressure = 6) => {
    const engine = new FluidEngine({ components: [], wires: [] });
    const snapshot = { ...engine.getSnapshot(), portPressure: { 'u1:out': pressure } };
    const tags = assignSignalTags(components);
    render(<FluidIOModule colors={COLORS} medium="PNEUMATIC" components={components} snapshot={snapshot} manualInputs={{}} latched={{}} live signalTags={tags} sensorOptions={listSensorOptions(components, tags.sensors)} onPush={vi.fn()} onLatchToggle={vi.fn()} onShutoffChange={onShutoffChange} />);
    return onShutoffChange;
  };
  const row = (tag: string) => document.querySelector(`[data-input="${tag}"]`) as HTMLElement;

  it('0Z1 heads the module with a Main Air Shut-off channel that has only an ON / OFF toggle', () => {
    const onShutoff = mount([unit, valve('a', '1V1', 'Pushbutton')], vi.fn());
    const first = document.querySelector('[data-testid="fluid-input-row"]') as HTMLElement;
    expect(first.getAttribute('data-input')).toBe('0Z1');
    expect(first.textContent).toContain('Main Air Shut-off');
    expect(within(first).queryByRole('button', { name: 'Push' })).toBeNull();
    fireEvent.click(within(first).getByRole('button', { name: 'OFF' }));
    expect(onShutoff).toHaveBeenCalledWith('u1', false);
    expect(within(first).getByLabelText('active')).toBeTruthy(); // line pressurised
  });

  it('the supply lamp is dark when the shut-off is OFF', () => {
    mount([{ ...unit, props: { ...unit.props, shutoff: 'OFF' } }], vi.fn(), 0);
    expect(within(row('0Z1')).getByLabelText('inactive')).toBeTruthy();
    expect(within(row('0Z1')).getByRole('button', { name: 'ON' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows clean ISO tags and one-word subtitles, with buttons chosen by actuator type', () => {
    mount([valve('a', '1V1', 'Pushbutton'), valve('b', '1V2', 'Detent Lever'), valve('c', '1V3', 'Roller')]);
    const push = row('1S1');
    expect(push.textContent).toContain('Pushbutton');
    expect(push.textContent).not.toMatch(/1V1|\(Manual\)|-/);
    expect(within(push).getByRole('button', { name: 'Push' })).toBeTruthy();
    expect(within(push).getByRole('button', { name: 'ON' })).toBeTruthy();
    const detent = row('1S2');
    expect(detent.textContent).toContain('Detented Lever');
    expect(within(detent).queryByRole('button', { name: 'Push' })).toBeNull();
    expect(within(detent).getByRole('button', { name: 'ON' })).toBeTruthy();
    const roller = row('1S3');
    expect(roller.textContent).toContain('Roller Sensor');
    expect(within(roller).queryByRole('button', { name: 'Push' })).toBeNull();
  });
});

describe('FluidIOModule ladder channels', () => {
  it('lists ladder pushbuttons as inputs and ladder solenoids as read-only output lamps without Push or ON / OFF', () => {
    const circuit: LadderCircuit = { paths: [{ id: 'p1', conditions: [[makeElement('pushbutton', 'S1')]], load: makeElement('solenoid', '1Y1') }] };
    const operate = vi.fn();
    const relay: RelayLadder = { result: { ...idleLadder(circuit), solenoids: { '1y1': true } }, pressed: {}, latched: {}, forced: {}, operate, release: vi.fn(), forceSensor: vi.fn(), clearInputs: vi.fn() };
    const engine = new FluidEngine({ components: [], wires: [] });
    render(<FluidIOModule colors={COLORS} medium="PNEUMATIC" components={[]} snapshot={engine.getSnapshot()} manualInputs={{}} latched={{}} live signalTags={assignSignalTags([])} sensorOptions={[]} onPush={vi.fn()} onLatchToggle={vi.fn()} onShutoffChange={vi.fn()} ladder={{ circuit, relay }} />);
    const input = screen.getByTestId('ladder-io-input');
    fireEvent.mouseDown(within(input).getByRole('button', { name: 'Push' }));
    expect(operate).toHaveBeenCalledWith('S1', false);
    const output = screen.getByTestId('fluid-output-row');
    expect(within(output).getByLabelText('active')).toBeTruthy();
    expect(within(output).queryAllByRole('button')).toHaveLength(0);
  });
});

describe('FluidIOModule solenoid valve ends', () => {
  it('keeps solenoids out of the digital inputs and shows them as read-only outputs driven by the engine state', () => {
    const valve = { id: 'v', type: 'valve-3-2-nc', label: '1V1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(getFluidDefinition('valve-3-2-nc')!), actuationLeft: 'Solenoid', actuationRight: 'Spring Return' } };
    const engine = new FluidEngine({ components: [], wires: [] });
    const tags = assignSignalTags([valve]);
    render(<FluidIOModule colors={COLORS} medium="PNEUMATIC" components={[valve]} snapshot={engine.getSnapshot()} manualInputs={{ v: { left: true } }} latched={{}} live signalTags={tags} sensorOptions={listSensorOptions([valve], tags.sensors)} onPush={vi.fn()} onLatchToggle={vi.fn()} onShutoffChange={vi.fn()} />);
    expect(screen.queryAllByTestId('fluid-input-row')).toHaveLength(0);
    const output = screen.getByTestId('fluid-output-row');
    expect(output.textContent).toContain('24 V');
    expect(within(output).queryAllByRole('button')).toHaveLength(0);
  });
});

/* ═════════════════════════ 400-test industrial audit — symbol, cutaway, catalog and canvas parity ═════════════════════════
 * Ids T013–T020, T121–T125, T226–T235, T270–T275 and T376–T400. The other 346 are in
 * shared/fluid/engine/comprehensiveFluidAudit.test.ts; `section()` fails this file at collection time if a block drops a test. */

const auditPad = (n: number) => String(n).padStart(3, '0');
function auditSection(first: number, last: number) {
  let next = first;
  const add = (name: string, fn: () => void) => {
    if (next > last) throw new Error(`section T${auditPad(first)}–T${auditPad(last)} overflowed with "${name}"`);
    it(`T${auditPad(next)} ${name}`, fn);
    next += 1;
  };
  add.done = () => {
    if (next !== last + 1) throw new Error(`section T${auditPad(first)}–T${auditPad(last)} registered ${next - first} of ${last - first + 1} tests`);
  };
  return add;
}

const symbolOf = (type: string, extra: Partial<FluidSymbolProps> & { props?: Record<string, unknown> } = {}) => {
  const definition = getFluidDefinition(type)!;
  return render(<svg><FluidSymbol definition={definition} stroke="#000" {...extra} props={{ ...defaultFluidProps(definition), ...extra.props }} /></svg>).container;
};
type Point = [number, number];
const triangleOf = (element: Element): Point[] => element.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number) as Point);
const CYLINDERS = [['cylinder-single', 1], ['cylinder-double', 2], ['cylinder-double-rod', 2]] as const;
/** Half the barrel height: the bottom casing line the indicator triangle stands on. */
const BARREL_BOTTOM = 30;

describe('A1 pneumatic cylinder indicator is an open triangle on the bottom casing line (T013–T020)', () => {
  const t = auditSection(13, 20);
  for (const [type, count] of CYLINDERS) {
    t(`${type}: ${count} hollow (unfilled) indicator triangle${count > 1 ? 's' : ''} in pneumatic mode`, () => {
      const triangles = Array.from(symbolOf(type, { medium: 'PNEUMATIC' }).querySelectorAll('.entry-triangle'));
      expect(triangles).toHaveLength(count);
      for (const triangle of triangles) {
        expect(triangle.tagName.toLowerCase()).toBe('polygon');
        expect(triangle.getAttribute('fill')).toBe('none');
        expect(triangle.getAttribute('data-medium')).toBe('PNEUMATIC');
      }
    });
  }
  for (const [type] of CYLINDERS) {
    t(`${type}: the triangle base lies on the bottom casing line (y = ${BARREL_BOTTOM}) and its apex points up into the chamber`, () => {
      for (const triangle of Array.from(symbolOf(type, { medium: 'PNEUMATIC' }).querySelectorAll('.entry-triangle'))) {
        const [apex, left, right] = triangleOf(triangle);
        expect(left[1]).toBe(BARREL_BOTTOM);
        expect(right[1]).toBe(BARREL_BOTTOM);
        expect(apex[1]).toBeLessThan(BARREL_BOTTOM);
        expect(apex[1]).toBeGreaterThanOrEqual(-BARREL_BOTTOM);
      }
    });
  }
  t('the hollow triangle is an outline: stroke set, fill none, and no pneumatic cylinder contains a solid black polygon', () => {
    for (const [type] of CYLINDERS) {
      const container = symbolOf(type, { medium: 'PNEUMATIC' });
      for (const triangle of Array.from(container.querySelectorAll('.entry-triangle'))) {
        expect(triangle.getAttribute('stroke')).toBe('#000');
        expect(triangle.getAttribute('fill')).toBe('none');
      }
      expect(Array.from(container.querySelectorAll('polygon')).filter(polygon => polygon.getAttribute('fill') === '#000')).toEqual([]);
      cleanup();
    }
  });
  t('without a medium the symbol defaults to the pneumatic convention (hollow) and sits above each inlet port', () => {
    for (const [type] of CYLINDERS) {
      const container = symbolOf(type);
      const ports = getFluidDefinition(type)!.ports;
      Array.from(container.querySelectorAll('.entry-triangle')).forEach((triangle, index) => {
        expect(triangle.getAttribute('fill')).toBe('none');
        expect(triangleOf(triangle)[0][0]).toBe(ports[index].x);
      });
      cleanup();
    }
  });

  t.done();
});

describe('A2 solenoid operator symbol and exhaust semantics (T121–T125)', () => {
  const t = auditSection(121, 125);
  t('a solenoid end draws a 20 × 24 rectangle holding an open triangle (pneumatic 3/2)', () => {
    const container = symbolOf('valve-3-2-nc', { props: { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' } });
    const triangles = container.querySelectorAll('.solenoid-triangle');
    expect(triangles).toHaveLength(1);
    expect(triangles[0].getAttribute('fill')).toBe('none');
    expect(Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d'))).toContain('M 0 0 H 10 M 10 -12 H 30 V 12 H 10 Z');
  });
  t('a double-solenoid 5/2 draws two solenoids, one per end, and no spring', () => {
    const container = symbolOf('valve-5-2', { props: { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' } });
    expect(container.querySelectorAll('.solenoid-triangle')).toHaveLength(2);
    expect(Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d'))).not.toContain('M 0 0 H 3 L 6 -8 L 10.5 8 L 15 -8 L 19.5 8 L 24 -8 L 27 0 H 30');
  });
  t('a single-solenoid 5/2 draws one solenoid and the return spring on the other end', () => {
    const container = symbolOf('valve-5-2', { props: { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' } });
    expect(container.querySelectorAll('.solenoid-triangle')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d'))).toContain('M 0 0 H 3 L 6 -8 L 10.5 8 L 15 -8 L 19.5 8 L 24 -8 L 27 0 H 30');
  });
  t('the hydraulic 4/2 and 4/3 solenoid use the same box as the pneumatic one, with a solid triangle', () => {
    for (const type of ['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float']) {
      const container = symbolOf(type, { medium: 'HYDRAULIC', props: { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' } });
      const triangles = Array.from(container.querySelectorAll('.solenoid-triangle'));
      expect(triangles.length, type).toBe(2);
      triangles.forEach(triangle => expect(triangle.getAttribute('fill'), type).toBe('#000'));
      expect(Array.from(container.querySelectorAll('path')).map(path => path.getAttribute('d')), type).toContain('M 0 0 H 10 M 10 -12 H 30 V 12 H 10 Z');
      cleanup();
    }
  });
  t('exhaust semantics: a solenoid valve has no pilot terminals, its exhausts are R / S (air) or the tank port T (oil), and a pilot end adds the 14 / 12 ports', () => {
    const ports = (type: string, props: Record<string, unknown>) => getFluidDefinition(type)!.portsFor({ ...defaultFluidProps(getFluidDefinition(type)!), ...props });
    const solenoid = ports('valve-5-2', { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' });
    expect(solenoid.filter(port => port.type === 'PILOT')).toEqual([]);
    expect(solenoid.filter(port => port.type === 'EXHAUST').map(port => port.lettering).sort()).toEqual(['R', 'S']);
    expect(ports('hvalve-4-2', { actuationLeft: 'Solenoid' }).filter(port => port.type === 'EXHAUST').map(port => port.lettering)).toEqual(['T']);
    expect(ports('valve-5-2', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' }).filter(port => port.type === 'PILOT').map(port => port.isoNumber).sort()).toEqual(['12', '14']);
  });

  t.done();
});

describe('A3 hydraulic cylinder indicator is a solid black triangle on the bottom casing line (T226–T235)', () => {
  const t = auditSection(226, 235);
  for (const [type, count] of CYLINDERS) {
    t(`${type}: ${count} solid black indicator triangle${count > 1 ? 's' : ''} in hydraulic mode`, () => {
      const triangles = Array.from(symbolOf(type, { medium: 'HYDRAULIC' }).querySelectorAll('.entry-triangle'));
      expect(triangles).toHaveLength(count);
      for (const triangle of triangles) {
        expect(triangle.getAttribute('fill')).toBe('#000');
        expect(triangle.getAttribute('data-medium')).toBe('HYDRAULIC');
      }
    });
  }
  for (const [type] of CYLINDERS) {
    t(`${type}: the solid triangle rests on the bottom casing line (y = ${BARREL_BOTTOM}), apex up`, () => {
      for (const triangle of Array.from(symbolOf(type, { medium: 'HYDRAULIC' }).querySelectorAll('.entry-triangle'))) {
        const [apex, left, right] = triangleOf(triangle);
        expect([left[1], right[1]]).toEqual([BARREL_BOTTOM, BARREL_BOTTOM]);
        expect(apex[1]).toBeLessThan(BARREL_BOTTOM);
      }
    });
  }
  t('every hydraulic cylinder triangle is centred above its own port and is 8 px wide', () => {
    for (const [type] of CYLINDERS) {
      const ports = getFluidDefinition(type)!.ports;
      Array.from(symbolOf(type, { medium: 'HYDRAULIC' }).querySelectorAll('.entry-triangle')).forEach((triangle, index) => {
        const [apex, left, right] = triangleOf(triangle);
        expect(apex[0], type).toBe(ports[index].x);
        expect(right[0] - left[0], type).toBe(8);
      });
      cleanup();
    }
  });
  t('the solid triangles stay inside the 60 px barrel: |y| ≤ 30 for apex and base', () => {
    for (const [type] of CYLINDERS) {
      for (const triangle of Array.from(symbolOf(type, { medium: 'HYDRAULIC' }).querySelectorAll('.entry-triangle'))) {
        for (const [, y] of triangleOf(triangle)) expect(Math.abs(y)).toBeLessThanOrEqual(BARREL_BOTTOM);
      }
      cleanup();
    }
  });
  t('the hydraulic motor draws solid triangles on its housing (one, and a second when it runs both ways); the air motor draws open ones', () => {
    const fills = (type: string, medium: 'PNEUMATIC' | 'HYDRAULIC', selector: string, props: Record<string, unknown> = {}) => {
      const result = Array.from(symbolOf(type, { medium, props }).querySelectorAll(selector)).map(triangle => triangle.getAttribute('fill'));
      cleanup();
      return result;
    };
    expect(fills('hyd-motor', 'HYDRAULIC', 'polygon', { directions: 'Single direction' })).toEqual(['#000']);
    expect(fills('hyd-motor', 'HYDRAULIC', 'polygon', { directions: 'Both directions' })).toEqual(['#000', '#000']);
    expect(fills('air-motor-fixed', 'PNEUMATIC', '.motor-triangle')).toEqual(['none']);
  });
  t('the hydraulic pump and pressure supply carry a solid triangle, the pneumatic pressure source an open one', () => {
    expect(symbolOf('hyd-pump', { medium: 'HYDRAULIC' }).querySelector('polygon')!.getAttribute('fill')).toBe('#000');
    cleanup();
    expect(symbolOf('hyd-pressure-source', { medium: 'HYDRAULIC' }).querySelector('polygon')!.getAttribute('fill')).toBe('#000');
    cleanup();
    expect(symbolOf('pressure-source', { medium: 'PNEUMATIC' }).querySelector('polygon')!.getAttribute('fill')).toBe('none');
  });

  t.done();
});

describe('A4 dissection cutaway: the spool translates with the valve actuation (T270–T275)', () => {
  const t = auditSection(270, 275);
  const COLORS = { text: '#000', muted: '#666', line: '#ccc', panelAlt: '#eee', canvas: '#fff' } as never;
  const PILOTED = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
  /** Engine snapshot of a lone hydraulic valve with the given pilot ends pressurised. */
  const snapshotOf = (type: string, props: Record<string, unknown>, pilotL = 0, pilotR = 0) => {
    const engine = new FluidEngine({ components: [{ id: 'v', type, props }], wires: [] } as never);
    if (pilotL) engine.injectPressure('v', 'pilotL', pilotL);
    if (pilotR) engine.injectPressure('v', 'pilotR', pilotR);
    return engine.step(0.2);
  };
  const viewer = (type: string, props: Record<string, unknown>, snapshot: ReturnType<typeof snapshotOf>) => render(<CutawayViewer component={{ id: 'v', type, label: '1V1', props }} snapshot={snapshot} medium="HYDRAULIC" colors={COLORS} isDark={false} />).container;
  const spoolOf = (container: HTMLElement) => ({ offset: Number(container.querySelector('svg[data-spool-offset]')!.getAttribute('data-spool-offset')), start: Number(container.querySelector('.cutaway-spool')!.getAttribute('data-start')) });
  const returns = (type: string, kind: SpoolKind, snapshot: ReturnType<typeof snapshotOf>) => {
    const analysis = analyzeSpool({ id: 'v', type, label: '1V1', props: PILOTED }, snapshot, kind);
    return analysis.connections.filter(connection => connection.kind === 'return').map(connection => `${analysis.body.letters?.[analysis.body.labels?.[connection.from] ?? connection.from]}>${analysis.body.letters?.[analysis.body.labels?.[connection.to] ?? connection.to]}`).sort();
  };

  t('4/3 closed neutral: the drawn spool sits at offset 0 / centre start (210) with no pilot, +1 and −1 pitch/2 either side with a pilot on 14 / 12', () => {
    const centre = spoolOf(viewer('hvalve-4-3', PILOTED, snapshotOf('hvalve-4-3', PILOTED)));
    cleanup();
    const left = spoolOf(viewer('hvalve-4-3', PILOTED, snapshotOf('hvalve-4-3', PILOTED, 10)));
    cleanup();
    const right = spoolOf(viewer('hvalve-4-3', PILOTED, snapshotOf('hvalve-4-3', PILOTED, 0, 10)));
    expect([left.offset, centre.offset, right.offset]).toEqual([1, 0, -1]);
    expect(centre.start).toBe(210);
    expect(left.start - centre.start).toBe(SPOOL_BODY.pitch / 2);
    expect(centre.start - right.start).toBe(SPOOL_BODY.pitch / 2);
    expect(left.start).toBe(spoolStart('spool43', 1));
  });
  t('4/3 float neutral: the drawn spool tracks the engine offset in the same way and joins A and B to T only in the middle', () => {
    const offsets = [[10, 0], [0, 0], [0, 10]].map(([l, r]) => {
      const spool = spoolOf(viewer('hvalve-4-3-float', PILOTED, snapshotOf('hvalve-4-3-float', PILOTED, l, r)));
      cleanup();
      return spool.offset;
    });
    expect(offsets).toEqual([1, 0, -1]);
    expect(returns('hvalve-4-3-float', 'spool43float', snapshotOf('hvalve-4-3-float', PILOTED))).toEqual(['A>T', 'B>T']);
  });
  t('4/3 closed neutral: the centre position seals every port (no connection) and each pilot position drains exactly one working line to T', () => {
    expect(analyzeSpool({ id: 'v', type: 'hvalve-4-3', label: '1V1', props: PILOTED }, snapshotOf('hvalve-4-3', PILOTED), 'spool43').connections).toEqual([]);
    expect(returns('hvalve-4-3', 'spool43', snapshotOf('hvalve-4-3', PILOTED, 10))).toEqual(['B>T']);
    expect(returns('hvalve-4-3', 'spool43', snapshotOf('hvalve-4-3', PILOTED, 0, 10))).toEqual(['A>T']);
  });
  t('4/2: the spool slides one full body pitch between rest and the solenoid position, and the engine state carries the same offset', () => {
    const props = { actuationLeft: 'Solenoid', actuationRight: 'Spring Return' };
    const rest = spoolOf(viewer('hvalve-4-2', props, snapshotOf('hvalve-4-2', props)));
    cleanup();
    const engine = new FluidEngine({ components: [{ id: 'v', type: 'hvalve-4-2', props }], wires: [] } as never);
    engine.setManual('v', 'left', true);
    const snapshot = engine.step(0.2);
    const actuated = spoolOf(viewer('hvalve-4-2', props, snapshot));
    expect([rest.offset, actuated.offset]).toEqual([0, 1]);
    expect(actuated.start - rest.start).toBe(spoolStart('spool42', 1, 'hvalve-4-2') - spoolStart('spool42', 0, 'hvalve-4-2'));
    expect(snapshot.valves.v.spoolOffset).toBe(1);
  });
  t('the cutaway is mapped for the closed, float and 4/2 valves and renders five chambers with one tank duct; no tandem / obsolete valve has a cutaway', () => {
    expect(['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float'].map(type => cutawayKindOf({ type }))).toEqual(['spool42', 'spool43', 'spool43float']);
    for (const type of ['hvalve-4-3', 'hvalve-4-3-float']) {
      const container = viewer(type, PILOTED, snapshotOf(type, PILOTED));
      expect(container.querySelectorAll('.tank-duct')).toHaveLength(1);
      expect(Array.from(container.querySelectorAll('.port-stub')).filter(stub => stub.getAttribute('data-port') !== 'pilot').map(stub => stub.getAttribute('data-port')).sort()).toEqual(['1', '2', '4', 'T']);
      cleanup();
    }
    expect(['hvalve-4-3-tandem', 'hvalve-4-3_tandem', '4/3_tandem'].map(type => cutawayKindOf({ type }))).toEqual([null, null, null]);
  });
  t('the open viewer follows the running engine: re-rendering with a later snapshot moves the spool without remounting', () => {
    const view = viewer('hvalve-4-3', PILOTED, snapshotOf('hvalve-4-3', PILOTED));
    const before = spoolOf(view);
    const next = snapshotOf('hvalve-4-3', PILOTED, 10);
    render(<CutawayViewer component={{ id: 'v', type: 'hvalve-4-3', label: '1V1', props: PILOTED }} snapshot={next} medium="HYDRAULIC" colors={COLORS} isDark={false} />, { container: view });
    const after = spoolOf(view);
    expect(before.offset).toBe(0);
    expect(after.offset).toBe(1);
    expect(after.start).toBeGreaterThan(before.start);
  });

  t.done();
});

describe('A5 mode switching, library sanitation and canvas parity (T376–T400)', () => {
  const t = auditSection(376, 400);
  const fillOf = (container: HTMLElement, selector: string) => Array.from(container.querySelectorAll(selector)).map(element => element.getAttribute('fill'));

  /** Re-evaluating one placed element when the mode changes: same component, new medium. */
  const switched = (type: string, selector: string, props: Record<string, unknown> = {}) => {
    const definition = getFluidDefinition(type)!;
    const draw = (medium: 'PNEUMATIC' | 'HYDRAULIC') => <svg><FluidSymbol definition={definition} stroke="#000" medium={medium} props={{ ...defaultFluidProps(definition), ...props }} /></svg>;
    const { container, rerender } = render(draw('PNEUMATIC'));
    const air = fillOf(container, selector);
    rerender(draw('HYDRAULIC'));
    const oil = fillOf(container, selector);
    rerender(draw('PNEUMATIC'));
    return { air, oil, back: fillOf(container, selector) };
  };
  for (const [type, count] of CYLINDERS) {
    t(`${type}: switching pneumatic → hydraulic turns ${count === 1 ? 'the white triangle' : 'both white triangles'} solid black`, () => {
      const { air, oil } = switched(type, '.entry-triangle');
      expect(air).toEqual(Array(count).fill('none'));
      expect(oil).toEqual(Array(count).fill('#000'));
    });
  }
  for (const [type, count] of CYLINDERS) {
    t(`${type}: switching back hydraulic → pneumatic restores the open triangle${count > 1 ? 's' : ''} (no stale solid fill)`, () => {
      expect(switched(type, '.entry-triangle').back).toEqual(Array(count).fill('none'));
    });
  }
  /** A valve is a different part in each mode (valve-5-2 ↔ hvalve-4-2 …): swapping the mode swaps it for its counterpart, whose pilot triangle follows the medium. */
  const PAIRS: Array<[string, string]> = [['valve-5-2', 'hvalve-4-2'], ['valve-5-3', 'hvalve-4-3'], ['valve-5-3', 'hvalve-4-3-float']];
  for (const [air, oil] of PAIRS) {
    t(`${air} → ${oil}: the pilot triangles of the counterpart valve turn from open to solid black with the mode`, () => {
      const pilots = { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' };
      expect(fillOf(symbolOf(air, { medium: 'PNEUMATIC', props: pilots }), '.pilot-triangle')).toEqual(['none', 'none']);
      cleanup();
      expect(fillOf(symbolOf(oil, { medium: 'HYDRAULIC', props: pilots }), '.pilot-triangle')).toEqual(['#000', '#000']);
      expect(VALVE_TABLES[oil].positions).toBe(VALVE_TABLES[air].positions);
    });
  }
  t('the pressure source re-evaluates too: an open triangle for compressed air, a solid one in oil mode', () => {
    const { air, oil, back } = switched('pressure-source', 'polygon');
    expect([air, oil, back]).toEqual([['none'], ['#000'], ['none']]);
  });

  const mountApp = () => render(<FluidSimulatorApp />);
  const drawerNames = () => Array.from(document.querySelectorAll('button')).map(button => button.textContent ?? '');
  const libraryNames = (medium: 'PNEUMATIC' | 'HYDRAULIC') => Object.values(FLUID_LIBRARY_CATEGORIES[medium]).flat().map(item => item.name);
  const showHydraulic = () => fireEvent.click(screen.getAllByText('Hydraulic').find(element => element.closest('button'))!.closest('button')!);

  t('the mounted app swaps its whole drawer when the mode changes: air parts disappear and the oil parts appear', () => {
    mountApp();
    expect(drawerNames().some(name => name === 'Air Motor')).toBe(true);
    expect(drawerNames().some(name => name.includes('Hydraulic Pump (P)'))).toBe(false);
    showHydraulic();
    expect(drawerNames().some(name => name.includes('Hydraulic Pump (P)'))).toBe(true);
    expect(drawerNames().some(name => name === 'Air Motor')).toBe(false);
    expect(drawerNames().some(name => name.includes('Shuttle Valve (OR)'))).toBe(true); // shared logic parts stay
  });

  /** Obsolete families, with every spelling a catalogue, a library or a saved file could use. */
  const OBSOLETE: Array<[string, string[]]> = [
    ['oil cooler', ['oil_cooler', 'oil-cooler', 'hyd-cooler', 'hydraulic-cooler']],
    ['hydraulic filter', ['hydraulic_filter', 'hydraulic-filter', 'hyd-filter', 'oil-filter']],
    ['hydraulic accumulator', ['hydraulic_accumulator', 'hydraulic-accumulator', 'hyd-accumulator', 'accumulator']],
    ['4/3 tandem centre', ['4/3_tandem', 'hvalve-4-3-tandem', 'hvalve-4-3_tandem', 'valve-4-3-tandem']],
    ['variable air motor', ['air_motor_variable', 'air-motor-variable', 'air-motor-variable-displacement']],
    ['semi-rotary actuator', ['semi_rotary', 'semi-rotary', 'semi-rotary-actuator', 'swivel-actuator']],
  ];
  for (const [family, aliases] of OBSOLETE) {
    t(`obsolete "${family}" is gone from the catalog, both library drawers, the valve tables and the engine`, () => {
      const catalogTypes = FLUID_CATALOG.map(entry => entry.type);
      const libraryIds = [...Object.values(FLUID_LIBRARY_CATEGORIES.PNEUMATIC).flat(), ...Object.values(FLUID_LIBRARY_CATEGORIES.HYDRAULIC).flat()].map(item => item.id);
      for (const alias of aliases) {
        expect(catalogTypes, alias).not.toContain(alias);
        expect(libraryIds, alias).not.toContain(alias);
        expect(getFluidDefinition(alias), alias).toBeUndefined();
        expect(Object.keys(VALVE_TABLES), alias).not.toContain(alias);
        expect(portsOf({ id: 'x', type: alias, props: {} }), alias).toEqual([]);
        expect(cutawayKindOf({ type: alias }), alias).toBeNull();
      }
    });
  }

  const BANNED_TEXT = /cooler|filter|accumulator|tandem|semi.?rotary|variable|swivel/i;
  t('pneumatic drawer DOM: no obsolete item name appears anywhere in the rendered library', () => {
    mountApp();
    const items = drawerNames().filter(name => name.length > 0);
    expect(items.length).toBeGreaterThan(20);
    expect(items.filter(name => BANNED_TEXT.test(name.replace(/Air Service Unit/g, '')))).toEqual([]);
  });
  t('hydraulic drawer DOM: no obsolete item name appears anywhere in the rendered library', () => {
    mountApp();
    showHydraulic();
    const items = drawerNames().filter(name => name.length > 0);
    expect(items.some(name => name.includes('Hydraulic Pump (P)'))).toBe(true);
    expect(items.filter(name => BANNED_TEXT.test(name))).toEqual([]);
  });
  t('neither drawer contains the raw obsolete ids anywhere in its markup (attributes included)', () => {
    const ids = OBSOLETE.flatMap(([, aliases]) => aliases);
    const { container } = mountApp();
    for (const id of ids) expect(container.innerHTML, id).not.toContain(id);
    showHydraulic();
    for (const id of ids) expect(container.innerHTML, id).not.toContain(id);
  });
  t('every library entry of the active mode is drawn in the DOM and nothing else is: the drawer equals FLUID_LIBRARY_CATEGORIES', () => {
    mountApp();
    const names = drawerNames();
    for (const name of libraryNames('PNEUMATIC')) expect(names.some(label => label.endsWith(name)), name).toBe(true);
    for (const name of libraryNames('HYDRAULIC').filter(candidate => !libraryNames('PNEUMATIC').includes(candidate))) expect(names.some(label => label.endsWith(name)), name).toBe(false);
    cleanup();
    mountApp();
    showHydraulic();
    const oil = drawerNames();
    for (const name of libraryNames('HYDRAULIC')) expect(oil.some(label => label.endsWith(name)), name).toBe(true);
    for (const name of libraryNames('PNEUMATIC').filter(candidate => !libraryNames('HYDRAULIC').includes(candidate))) expect(oil.some(label => label.endsWith(name)), name).toBe(false);
  });
  t('hydraulic library structure: five groups, exactly the 4/2, 4/3 closed, 4/3 float and 3/2 valves, and a four-part actuator group', () => {
    const groups = FLUID_LIBRARY_CATEGORIES.HYDRAULIC;
    expect(Object.keys(groups)).toEqual(['Power Supply & Tank', 'Actuators', 'Directional Control Valves', 'Logic & Flow Control', 'Safety & Pressure Control']);
    expect(groups['Directional Control Valves'].map(item => item.id)).toEqual(['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float', 'hvalve-3-2-nc']);
    expect(groups.Actuators.map(item => item.id)).toEqual(['cylinder-single', 'cylinder-double', 'cylinder-double-rod', 'hyd-motor']);
    expect(groups['Power Supply & Tank'].map(item => item.id)).toEqual(['pressure-gauge', 'hyd-pump', 'hyd-pressure-source', 'hyd-tank', 'hyd-power-unit']);
  });
  t('cross-medium exclusivity: the pneumatic drawer holds no hydraulic-only part, the hydraulic drawer no pneumatic-only part', () => {
    const ids = (medium: 'PNEUMATIC' | 'HYDRAULIC') => Object.values(FLUID_LIBRARY_CATEGORIES[medium]).flat().map(item => item.id);
    expect(ids('PNEUMATIC').filter(id => id.startsWith('hyd-') || id.startsWith('hvalve-'))).toEqual([]);
    expect(ids('HYDRAULIC').filter(id => id.startsWith('valve-') || id.startsWith('air-') || id.startsWith('frl-') || id === 'service-unit' || id === 'quick-exhaust' || id === 'exhaust-port')).toEqual([]);
    for (const id of ids('HYDRAULIC').filter(candidate => !candidate.startsWith('hyd-') && !candidate.startsWith('hvalve-'))) expect(getFluidDefinition(id)!.media, id).toContain('HYDRAULIC');
  });
  t('the engine follows the mode: any hydraulic part makes the circuit oil (50 bar nominal), a purely pneumatic one stays air (6 bar)', () => {
    const run = (types: string[]) => new FluidEngine({ components: types.map((type, index) => ({ id: `c${index}`, type, props: {} })), wires: [] } as never).step(0.1);
    expect(run(['cylinder-double', 'valve-5-2']).medium).toBe('AIR');
    expect(run(['cylinder-double', 'hvalve-4-2']).medium).toBe('OIL');
    expect(run(['cylinder-double', 'hyd-pump']).medium).toBe('OIL');
    expect(run(['pressure-source']).portPressure['c0:out']).toBe(6);
    expect(run(['hyd-pressure-source', 'cylinder-single']).portPressure['c0:out']).toBe(50);
  });
  t('inspector parity: a placed cylinder in hydraulic mode offers only hydraulic replacements (hydraulic motor yes, air motor no)', () => {
    const definition = getFluidDefinition('cylinder-double')!;
    const component = { id: 'c', type: 'cylinder-double', label: '1A1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: defaultFluidProps(definition, 'HYDRAULIC') };
    render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} replaceGroups={FLUID_LIBRARY_CATEGORIES.HYDRAULIC} onReplace={vi.fn()} onLabelChange={vi.fn()} onPropsChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace Component' }));
    const names = screen.getAllByRole('option').map(option => option.textContent);
    expect(names).toContain('Hydraulic Motor');
    expect(names).toContain('4/3 Valve, Float');
    expect(names).not.toContain('Air Motor (Fixed Displacement)');
    expect(names).not.toContain('Double-Acting Cylinder');
    expect(names.filter(name => BANNED_TEXT.test(name ?? ''))).toEqual([]);
  });

  t.done();
});
