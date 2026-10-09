// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { ActiveElementProperties } from './ActiveElementProperties';
import { FLUID_CATALOG, clampParameter, defaultFluidProps, editableParameters, getFluidDefinition } from '../models/fluidCatalog';

afterEach(cleanup);

const COLORS = { background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ddd', text: '#111', muted: '#666', subtle: '#999', primary: '#00f', accent: '#70f', danger: '#f00', selection: '#70f', grid: '#eee', wire: '#000', powered: '#00f', input: '#fff', shadow: '' } as unknown as Palette;

function panel(type: string, props: Record<string, unknown> = {}, label = '1X1') {
  const definition = getFluidDefinition(type)!;
  const component = { id: 'abc123', type, label, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(definition), ...props } };
  const handlers = { onLabelChange: vi.fn(), onPropsChange: vi.fn(), };
  render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} {...handlers} />);
  return { component, ...handlers };
}
const shown = () => Array.from(document.querySelectorAll('input, select')).map(el => el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.tagName);

/** Parts whose vessel volume is a student setting. */
const VESSELS = ['air-reservoir', 'time-delay-valve'];

describe('internal geometry is never offered', () => {
  it('marks bore, stroke and volume as advanced, and the catalog still defaults them', () => {
    for (const entry of FLUID_CATALOG) {
      const hidden = entry.parameters.filter(parameter => parameter.advanced).map(parameter => parameter.key);
      for (const key of hidden) expect(['bore', 'stroke', 'volume', 'lubricator']).toContain(key);
      // A reservoir's volume is what a student dimensions to set a delay: it is offered (in cm³); every other volume is internal.
      const offered = VESSELS.includes(entry.type) ? ['bore', 'stroke'] : ['bore', 'stroke', 'volume'];
      expect(editableParameters(entry.parameters).some(parameter => offered.includes(parameter.key)), entry.type).toBe(false);
      for (const key of hidden) expect(defaultFluidProps(entry)[key], `${entry.type}.${key}`).toBeDefined();
    }
  });

  it('no part exposes friction, area or dimension fields', () => {
    for (const entry of FLUID_CATALOG) {
      for (const parameter of editableParameters(entry.parameters)) expect(parameter.key).not.toMatch(VESSELS.includes(entry.type) ? /friction|area|bore|stroke|width|height|diameter/i : /friction|area|bore|stroke|width|height|diameter|volume/i);
    }
  });

  it('the reservoir and the time-delay valve offer their volume in cm³', () => {
    for (const type of VESSELS) {
      const volume = editableParameters(FLUID_CATALOG.find(entry => entry.type === type)!.parameters).find(parameter => parameter.key === 'volume');
      expect(volume, type).toMatchObject({ unit: 'cm³', min: 10 });
    }
  });
});

describe('service units are always lubricated', () => {
  it('keeps the lubricator in the props with its default and never offers it', () => {
    for (const type of ['frl-detailed', 'frl-simplified']) {
      const entry = FLUID_CATALOG.find(candidate => candidate.type === type)!;
      expect(defaultFluidProps(entry).lubricator, type).toBe('With Lubricator');
      expect(editableParameters(entry.parameters).map(parameter => parameter.key), type).not.toContain('lubricator');
    }
  });
});

describe('ActiveElementProperties', () => {
  it('always offers the reference tag and drops the internal component id', () => {
    panel('cylinder-double', {}, '1A1');
    expect(screen.getByLabelText('Reference')).toHaveProperty('value', '1A1');
    expect(screen.queryByDisplayValue('abc123')).toBeNull();
    expect(screen.queryByText('Component ID')).toBeNull();
  });

  it('double-acting cylinder: both limit switches and the cushioning select; no bore or stroke', () => {
    panel('cylinder-double');
    expect(screen.getByLabelText('Retracted Position Sensor (0%)')).toBeTruthy();
    expect(screen.getByLabelText('Extended Position Sensor (100%)')).toBeTruthy();
    expect(screen.getByLabelText('End-Position Cushioning')).toBeTruthy();
    expect(screen.queryByText('Bore')).toBeNull();
    expect(screen.queryByText('Stroke')).toBeNull();
  });

  it('single-acting cylinder: only the limit switches', () => {
    panel('cylinder-single');
    expect(shown().filter(label => label !== 'Reference')).toEqual(['Retracted Position Sensor (0%)', 'Extended Position Sensor (100%)']);
    expect(screen.getByLabelText('Retracted Position Sensor (0%)')).toBeTruthy();
    expect(screen.getByLabelText('Extended Position Sensor (100%)')).toBeTruthy();
  });

  it('throttle: an Throttle Opening slider with a 1 – 100 number box', () => {
    for (const type of ['flow-control', 'flow-control-oneway']) {
      const { onPropsChange } = panel(type, { openingPercentage: 40 });
      const slider = screen.getByLabelText('Throttle Opening') as HTMLInputElement;
      expect(slider.type).toBe('range');
      expect([slider.min, slider.max, slider.value]).toEqual(['1', '100', '40']);
      const box = screen.getByLabelText('Throttle Opening (number)') as HTMLInputElement;
      expect([box.min, box.max, box.value]).toEqual(['1', '100', '40']);
      fireEvent.change(box, { target: { value: '25' } });
      expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ openingPercentage: 25 }));
      cleanup();
    }
  });

  it('throttle: a typed value outside 1 – 100 is pulled back into range when the field is left', () => {
    const { onPropsChange } = panel('flow-control', { openingPercentage: 40 });
    const box = screen.getByLabelText('Throttle Opening (number)');
    fireEvent.blur(box, { target: { value: '250' } });
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ openingPercentage: 100 }));
    fireEvent.blur(box, { target: { value: '0' } });
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ openingPercentage: 1 }));
    expect(clampParameter(getFluidDefinition('flow-control')!.parameters[0], NaN)).toBe(100);
  });

  it('pressure and relief valves: Set Pressure in bar', () => {
    for (const type of ['regulator-nr', 'regulator-relieving', 'pressure-relief', 'hyd-pressure-relief']) {
      const { onPropsChange } = panel(type);
      const field = screen.getByLabelText('Set Pressure') as HTMLInputElement;
      expect(field.type).toBe('number');
      expect(screen.getByText('bar')).toBeTruthy();
      fireEvent.change(field, { target: { value: '4.5' } });
      const key = type.includes('regulator') ? 'setpoint' : 'crackingPressure';
      expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: 4.5 }));
      cleanup();
    }
  });

  it('directional valve: left and right actuator dropdowns that include pushbutton, lever, spring and pilot', () => {
    const { onPropsChange } = panel('valve-5-2');
    const left = screen.getByLabelText('Left Actuation') as HTMLSelectElement;
    const right = screen.getByLabelText('Right Actuation') as HTMLSelectElement;
    for (const select of [left, right]) {
      const options = Array.from(select.options).map(option => option.value);
      for (const wanted of ['Pushbutton', 'Hand Lever', 'Spring Return', 'Pneumatic Pilot']) expect(options).toContain(wanted);
    }
    fireEvent.change(left, { target: { value: 'Pushbutton' } });
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ actuationLeft: 'Pushbutton' }));
  });

  it('edits the reference tag, with no Rotate / Duplicate / Delete bar', () => {
    const { onLabelChange } = panel('valve-5-2');
    fireEvent.change(screen.getByLabelText('Reference'), { target: { value: '1V9' } });
    expect(onLabelChange).toHaveBeenCalledWith('1V9');
    for (const name of ['Rotate', 'Duplicate', 'Delete']) expect(screen.queryByText(name)).toBeNull();
  });
});

describe('editable operator tags', () => {
  it('offers a Left Tag and a Right Tag only for ends driven by a person or a cam', () => {
    panel('valve-3-2-nc', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' });
    expect(screen.getByLabelText('Left Tag')).toBeTruthy();
    expect(screen.queryByLabelText('Right Tag')).toBeNull();
    cleanup();
    panel('valve-3-2-nc', { actuationLeft: 'Roller', actuationRight: 'Detent Lever' });
    expect(screen.getByLabelText('Left Tag')).toBeTruthy();
    expect(screen.getByLabelText('Right Tag')).toBeTruthy();
    cleanup();
    panel('valve-3-2-nc', { actuationLeft: 'Spring Return', actuationRight: 'None' });
    expect(screen.queryByLabelText('Left Tag')).toBeNull();
    expect(screen.queryByLabelText('Right Tag')).toBeNull();
  });

  it('shows the tag drawn on the canvas and stores what is typed on that end', () => {
    const definition = getFluidDefinition('valve-3-2-nc')!;
    const component = { id: 'v', type: 'valve-3-2-nc', label: '1V1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: { ...defaultFluidProps(definition), actuationLeft: 'Pushbutton', actuationRight: 'Roller' } };
    const onPropsChange = vi.fn();
    render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} operatorTags={{ left: '1S1', right: '1S2' }} onLabelChange={vi.fn()} onPropsChange={onPropsChange} />);
    expect(screen.getByLabelText('Left Tag')).toHaveProperty('value', '1S1');
    fireEvent.change(screen.getByLabelText('Left Tag'), { target: { value: '2S2' } });
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ leftTag: '2S2' }));
    fireEvent.change(screen.getByLabelText('Right Tag'), { target: { value: '1B2' } });
    expect(onPropsChange).toHaveBeenLastCalledWith(expect.objectContaining({ rightTag: '1B2' }));
  });

  it('does not offer tags on a part that is not a valve', () => {
    panel('cylinder-double');
    expect(screen.queryByLabelText('Left Tag')).toBeNull();
  });
});


describe('Initial State of the consolidated 2/2 and 3/2 valves', () => {
  const withTwin = (type: string) => {
    const definition = getFluidDefinition(type)!;
    const component = { id: 'v', type, label: '1V1', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, props: defaultFluidProps(definition) };
    const onInitialStateChange = vi.fn();
    render(<ActiveElementProperties component={component} definition={definition} colors={COLORS} sensorOptions={[]} onLabelChange={vi.fn()} onPropsChange={vi.fn()} onInitialStateChange={onInitialStateChange} />);
    return onInitialStateChange;
  };

  it.each([['valve-3-2-nc', 'valve-3-2-no', 'NC'], ['valve-2-2-no', 'valve-2-2-nc', 'NO']])('%s offers Normally Closed / Open and swaps to %s', (type, twin, current) => {
    const change = withTwin(type);
    const select = screen.getByLabelText('Initial State') as HTMLSelectElement;
    expect(select.value).toBe(current);
    expect(Array.from(select.options).map(option => option.textContent)).toEqual(['Normally Closed (NC)', 'Normally Open (NO)']);
    fireEvent.change(select, { target: { value: current === 'NC' ? 'NO' : 'NC' } });
    expect(change).toHaveBeenCalledWith(twin);
  });

  it('is not offered on other valves', () => {
    withTwin('valve-4-2');
    expect(screen.queryByLabelText('Initial State')).toBeNull();
  });
});
