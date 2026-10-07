// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FluidEngine } from '@shared/fluid/engine/FluidEngine';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { ActiveElementProperties } from './ActiveElementProperties';
import { FluidIOModule, InputChannel } from './io/FluidIOModule';
import { listSensorOptions } from '../models/sensorCoupling';
import { assignSignalTags } from '../models/signalTags';
import { FLUID_LIBRARY_CATEGORIES, defaultFluidProps, getFluidDefinition } from '../models/fluidCatalog';

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

  it('offers a momentary Push on mouse down and a Latch toggle on click', () => {
    const { onPush, onLatchToggle } = row();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Push' }));
    expect(onPush).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Latch' }));
    expect(onLatchToggle).toHaveBeenCalledTimes(1);
  });

  it('glows crimson while active and is inert until the simulation is live', () => {
    row({ active: true, latched: true });
    const lamp = screen.getByLabelText('active');
    expect(lamp.style.background).toBe('rgb(225, 29, 72)');
    expect(screen.getByRole('button', { name: 'Latch' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    row({ live: false });
    expect((screen.getByRole('button', { name: 'Push' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Latch' }) as HTMLButtonElement).disabled).toBe(true);
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
    fireEvent.click(within(first).getByRole('button', { name: 'ON / OFF' }));
    expect(onShutoff).toHaveBeenCalledWith('u1', false);
    expect(within(first).getByLabelText('active')).toBeTruthy(); // line pressurised
  });

  it('the supply lamp is dark when the shut-off is OFF', () => {
    mount([{ ...unit, props: { ...unit.props, shutoff: 'OFF' } }], vi.fn(), 0);
    expect(within(row('0Z1')).getByLabelText('inactive')).toBeTruthy();
    expect(within(row('0Z1')).getByRole('button', { name: 'ON / OFF' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('shows clean ISO tags and one-word subtitles, with buttons chosen by actuator type', () => {
    mount([valve('a', '1V1', 'Pushbutton'), valve('b', '1V2', 'Detent Lever'), valve('c', '1V3', 'Roller')]);
    const push = row('1S1');
    expect(push.textContent).toContain('Pushbutton');
    expect(push.textContent).not.toMatch(/1V1|\(Manual\)|-/);
    expect(within(push).getByRole('button', { name: 'Push' })).toBeTruthy();
    expect(within(push).getByRole('button', { name: 'Latch' })).toBeTruthy();
    const detent = row('1S2');
    expect(detent.textContent).toContain('Detented Lever');
    expect(within(detent).queryByRole('button', { name: 'Push' })).toBeNull();
    expect(within(detent).getByRole('button', { name: 'ON / OFF' })).toBeTruthy();
    const roller = row('1S3');
    expect(roller.textContent).toContain('Roller Sensor');
    expect(within(roller).queryByRole('button', { name: 'Push' })).toBeNull();
  });
});
