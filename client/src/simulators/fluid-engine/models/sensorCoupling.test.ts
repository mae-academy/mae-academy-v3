// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EngineWire } from '@shared/fluid/engine/types';
import { useFluidEngineBridge } from '../hooks/useFluidEngineBridge';
import { defaultFluidProps, getFluidDefinition, type FluidProps } from './fluidCatalog';
import {
  EXTEND_TAG_PROP,
  RETRACT_TAG_PROP,
  defaultSensorTags,
  isCylinder,
  linkableSides,
  linkedSensor,
  linkedSensorTags,
  listSensorOptions,
  customOperatorTag,
  normalizeTag,
  resolveTagLinks,
  sensorTagsOf,
  setLinkedSensor,
  setValveProperty,
} from './sensorCoupling';

/** A component as the canvas creates it: catalog defaults plus overrides. */
const part = (id: string, type: string, label: string, props: FluidProps = {}) => ({ id, type, label, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });
const pipe = (from: string, to: string): EngineWire => {
  const [fromComp, fromTerm] = from.split(':');
  const [toComp, toTerm] = to.split(':');
  return { id: `${from}>${to}`, fromComp, fromTerm, toComp, toTerm };
};

describe('limit-switch tags', () => {
  it('numbers the two sensors of each cylinder within its circuit', () => {
    expect(defaultSensorTags('1A1')).toEqual(['1B1', '1B2']);
    expect(defaultSensorTags('1A2')).toEqual(['1B3', '1B4']);
    expect(defaultSensorTags('2A1')).toEqual(['2B1', '2B2']);
    expect(defaultSensorTags('Clamp')).toEqual(['Clamp-B1', 'Clamp-B2']);
  });

  it('uses edited names, falling back to the default while a name is blank', () => {
    const cylinder = part('c', 'cylinder-double', '1A1');
    expect(sensorTagsOf(cylinder)).toEqual(['1B1', '1B2']);
    expect(sensorTagsOf({ ...cylinder, props: { ...cylinder.props, [RETRACT_TAG_PROP]: 'X1', [EXTEND_TAG_PROP]: ' X2 ' } })).toEqual(['X1', 'X2']);
    expect(sensorTagsOf({ ...cylinder, props: { ...cylinder.props, [RETRACT_TAG_PROP]: '$2B1$' } })).toEqual(['2B1', '1B2']);
    expect(sensorTagsOf({ ...cylinder, props: { ...cylinder.props, [EXTEND_TAG_PROP]: '  ' } })).toEqual(['1B1', '1B2']);
  });

  it('lists every sensor in the schematic by engine id', () => {
    const parts = [part('src', 'pressure-source', '0Z1'), part('a', 'cylinder-double', '1A1'), part('b', 'cylinder-single', '1A2', { [EXTEND_TAG_PROP]: 'END' }), part('v', 'valve-5-2', '1V1')];
    expect(parts.map(isCylinder)).toEqual([false, true, true, false]);
    expect(listSensorOptions(parts)).toEqual([
      { value: 'a:S1', tag: '1B1', cylinderId: 'a', cylinderLabel: '1A1', end: 'retracted' },
      { value: 'a:S2', tag: '1B2', cylinderId: 'a', cylinderLabel: '1A1', end: 'extended' },
      { value: 'b:S1', tag: '1B3', cylinderId: 'b', cylinderLabel: '1A2', end: 'retracted' },
      { value: 'b:S2', tag: 'END', cylinderId: 'b', cylinderLabel: '1A2', end: 'extended' },
    ]);
  });
});

describe('valve coupling', () => {
  it('offers a link only on roller and pilot ends', () => {
    expect(linkableSides({ actuationLeft: 'Roller', actuationRight: 'Spring Return' })).toEqual(['left']);
    expect(linkableSides({ actuationLeft: 'Pneumatic Pilot', actuationRight: 'Idle-Return Roller' })).toEqual(['left', 'right']);
    expect(linkableSides({ actuationLeft: 'Pushbutton', actuationRight: 'None' })).toEqual([]);
  });

  it('links and unlinks an end without touching the other', () => {
    const linked = setLinkedSensor(setLinkedSensor({ actuationLeft: 'Roller' }, 'left', 'a:S2'), 'right', 'a:S1');
    expect(linked).toEqual({ actuationLeft: 'Roller', leftSensor: 'a:S2', rightSensor: 'a:S1' });
    expect(linkedSensor(linked, 'left')).toBe('a:S2');
    const unlinked = setLinkedSensor(linked, 'left', '');
    expect(unlinked).toEqual({ actuationLeft: 'Roller', rightSensor: 'a:S1' });
    expect(linkedSensor(unlinked, 'left')).toBe('');
  });

  it('drops a link when the operator is swapped for one that cannot be coupled', () => {
    const roller = { actuationLeft: 'Roller', actuationRight: 'Spring Return', leftSensor: 'a:S2' };
    expect(setValveProperty(roller, 'actuationLeft', 'Idle-Return Roller')).toMatchObject({ actuationLeft: 'Idle-Return Roller', leftSensor: 'a:S2' });
    expect(setValveProperty(roller, 'actuationLeft', 'Pushbutton')).toEqual({ actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' });
    expect(setValveProperty(roller, 'initialState', 'Actuated position')).toMatchObject({ leftSensor: 'a:S2' });
  });

  it('names the linked switch beside the operator and skips links to deleted cylinders', () => {
    const options = listSensorOptions([part('a', 'cylinder-double', '1A1', { [EXTEND_TAG_PROP]: 'B2' })]);
    expect(linkedSensorTags({ actuationLeft: 'Roller', leftSensor: 'a:S2' }, options)).toEqual({ left: 'B2' });
    expect(linkedSensorTags({ actuationLeft: 'Roller', leftSensor: 'gone:S2' }, options)).toEqual({});
    expect(linkedSensorTags({ actuationLeft: 'Pushbutton', leftSensor: 'a:S2' }, options)).toEqual({});
  });
});

describe('tag linkage', () => {
  const cylinder = part('cyl', 'cylinder-double', '1A1');
  const options = listSensorOptions([cylinder]);

  it('reads typed tags with or without the KaTeX delimiters', () => {
    expect(normalizeTag(' $2S2$ ')).toBe('2S2');
    expect(customOperatorTag({ leftTag: '$1B2$' }, 'left')).toBe('1B2');
    expect(customOperatorTag({}, 'right')).toBe('');
  });

  it('links a roller to the sensor that carries the same tag, case-insensitively', () => {
    const roller = part('r', 'valve-3-2-nc', '1V2', { actuationLeft: 'Roller', leftTag: '1b2' });
    const [resolved] = resolveTagLinks([roller], options);
    expect(linkedSensor(resolved.props, 'left')).toBe('cyl:S2');
    expect(linkedSensor(roller.props, 'left')).toBe('');
  });

  it('leaves alone a pushbutton, an untagged roller, an unknown tag, an ambiguous tag and a link chosen by hand', () => {
    const parts = [
      part('p', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pushbutton', leftTag: '1B2' }),
      part('u', 'valve-3-2-nc', '1V2', { actuationLeft: 'Roller' }),
      part('x', 'valve-3-2-nc', '1V3', { actuationLeft: 'Roller', leftTag: '9B9' }),
      part('h', 'valve-3-2-nc', '1V4', { actuationLeft: 'Roller', leftTag: '1B2', leftSensor: 'cyl:S1' }),
    ];
    expect(resolveTagLinks(parts, options)).toBe(parts);
    const twin = [...options, { ...options[1], value: 'other:S2', cylinderId: 'other' }];
    const roller = part('r', 'valve-3-2-nc', '1V5', { actuationLeft: 'Roller', leftTag: '1B2' });
    expect(resolveTagLinks([roller], twin)).toEqual([roller]);
  });
});

describe('sensor coupling end to end', () => {
  let frames: FrameRequestCallback[] = [];
  let clock = 0;
  const frame = (elapsedMs: number) => act(() => {
    clock += elapsedMs;
    const pending = frames;
    frames = [];
    pending.forEach(callback => callback(clock));
  });
  beforeEach(() => {
    frames = [];
    clock = 1000;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('cylinder 1A1 with extend sensor 1S1 linked to roller valve 1V2 retracts by itself at full stroke', () => {
    // The user renames the switches in the properties panel so the extend sensor is tagged 1S1.
    const cylinder = part('cyl', 'cylinder-double', '1A1', { [RETRACT_TAG_PROP]: '1S0', [EXTEND_TAG_PROP]: '1S1' });
    const start = part('start', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' });
    const roller = part('roller', 'valve-3-2-nc', '1V2', { actuationLeft: 'Roller', actuationRight: 'Spring Return' });
    const main = part('main', 'valve-5-2', '1V3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' });
    const source = part('src', 'pressure-source', '0Z1');

    // Pick "1S1" in the roller valve's Linked Cylinder Sensor dropdown.
    const option = listSensorOptions([source, start, roller, main, cylinder]).find(candidate => candidate.tag === '1S1')!;
    expect(option).toMatchObject({ cylinderLabel: '1A1', end: 'extended' });
    const linkedRoller = { ...roller, props: setLinkedSensor(roller.props, linkableSides(roller.props)[0], option.value) };
    expect(linkedSensorTags(linkedRoller.props, [option])).toEqual({ left: '1S1' });

    const components = [source, start, linkedRoller, main, cylinder];
    const wires = [
      pipe('src:out', 'start:p1'), pipe('src:out', 'roller:p1'), pipe('src:out', 'main:p1'),
      pipe('start:p2', 'main:pilotL'), pipe('roller:p2', 'main:pilotR'),
      pipe('main:p4', 'cyl:a'), pipe('main:p2', 'cyl:b'),
    ];
    const { result } = renderHook(() => useFluidEngineBridge(components, wires, { medium: 'AIR', speed: 1 }));

    act(() => result.current.run());
    frame(100);
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(0);

    // One short press of the start button.
    act(() => result.current.triggerManualInput('start', 'left', true));
    frame(100);
    act(() => result.current.triggerManualInput('start', 'left', false));

    // Sample every engine tick (one 16 ms frame each) so the turning point is not missed.
    let peak = 0;
    let sensorMadeAt = -1;
    let rollerTrippedAt = -1;
    let retractingAfterTrip = false;
    for (let tick = 0; tick < 400; tick += 1) {
      frame(16);
      const { cylinders, valves, sensors } = result.current.snapshot;
      peak = Math.max(peak, cylinders.cyl.stroke);
      if (sensors[option.value] && sensorMadeAt < 0) sensorMadeAt = tick;
      if (valves.roller.position === 1 && rollerTrippedAt < 0) rollerTrippedAt = tick;
      if (rollerTrippedAt >= 0 && cylinders.cyl.velocity < 0) retractingAfterTrip = true;
    }

    const final = result.current.snapshot;
    // The switch is made within 3 mm of the end (3 % of a 100 mm stroke); the roller answers on the next tick and the piston turns round.
    expect(peak).toBeGreaterThanOrEqual(0.97);
    expect(sensorMadeAt).toBeGreaterThan(0);
    expect(rollerTrippedAt).toBe(sensorMadeAt + 1);
    expect(retractingAfterTrip).toBe(true);
    expect(final.cylinders.cyl.stroke).toBe(0);
    expect(final.valves.main.position).toBe(0);
    expect(final.valves.roller.position).toBe(0);
    expect(final.sensors['cyl:S1']).toBe(true);
  });

  it('without the link the cylinder stays extended', () => {
    const components = [
      part('src', 'pressure-source', '0Z1'),
      part('start', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
      part('roller', 'valve-3-2-nc', '1V2', { actuationLeft: 'Roller', actuationRight: 'Spring Return' }),
      part('main', 'valve-5-2', '1V3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' }),
      part('cyl', 'cylinder-double', '1A1'),
    ];
    const wires = [
      pipe('src:out', 'start:p1'), pipe('src:out', 'roller:p1'), pipe('src:out', 'main:p1'),
      pipe('start:p2', 'main:pilotL'), pipe('roller:p2', 'main:pilotR'),
      pipe('main:p4', 'cyl:a'), pipe('main:p2', 'cyl:b'),
    ];
    const { result } = renderHook(() => useFluidEngineBridge(components, wires, { medium: 'AIR', speed: 1 }));
    act(() => result.current.run());
    act(() => result.current.triggerManualInput('start', 'left', true));
    frame(100);
    act(() => result.current.triggerManualInput('start', 'left', false));
    for (let i = 0; i < 60; i += 1) frame(100);
    expect(result.current.snapshot.cylinders.cyl.stroke).toBe(1);
    expect(result.current.snapshot.valves.roller.position).toBe(0);
  });

  it('a roller valve whose tag is 1B2 is tripped by cylinder 1A1 at full stroke and sends it back, with no link picked', () => {
    const cylinder = part('cyl', 'cylinder-double', '1A1');
    const parts = [
      part('src', 'pressure-source', '0Z1'),
      part('start', 'valve-3-2-nc', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Spring Return' }),
      part('roller', 'valve-3-2-nc', '1V2', { actuationLeft: 'Roller', actuationRight: 'Spring Return', leftTag: '1B2' }),
      part('main', 'valve-5-2', '1V3', { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Pneumatic Pilot' }),
      cylinder,
    ];
    const components = resolveTagLinks(parts, listSensorOptions(parts));
    const wires = [
      pipe('src:out', 'start:p1'), pipe('src:out', 'roller:p1'), pipe('src:out', 'main:p1'),
      pipe('start:p2', 'main:pilotL'), pipe('roller:p2', 'main:pilotR'),
      pipe('main:p4', 'cyl:a'), pipe('main:p2', 'cyl:b'),
    ];
    const { result } = renderHook(() => useFluidEngineBridge(components, wires, { medium: 'AIR', speed: 1 }));
    act(() => result.current.run());
    frame(100);
    act(() => result.current.triggerManualInput('start', 'left', true));
    frame(100);
    act(() => result.current.triggerManualInput('start', 'left', false));
    let rollerShifted = false;
    let sensorMade = false;
    let peak = 0;
    for (let tick = 0; tick < 400; tick += 1) {
      frame(16);
      const { valves, sensors, cylinders } = result.current.snapshot;
      rollerShifted = rollerShifted || valves.roller.position === 1;
      sensorMade = sensorMade || Boolean(sensors['cyl:S2']);
      peak = Math.max(peak, cylinders.cyl.stroke);
    }
    expect(sensorMade).toBe(true);
    expect(rollerShifted).toBe(true);
    expect(peak).toBeLessThan(1.0001);
    // Released again once the piston moves away: the spring restores the roller valve and the cylinder rests retracted.
    const final = result.current.snapshot;
    expect(final.cylinders.cyl.stroke).toBe(0);
    expect(final.valves.roller.position).toBe(0);
    expect(final.sensors['cyl:S2']).toBe(false);
  });
});
