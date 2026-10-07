import { describe, expect, it } from 'vitest';
import { defaultFluidProps, getFluidDefinition, type FluidProps } from './fluidCatalog';
import { assignSignalTags, operatorTagsOf } from './signalTags';
import { listSensorOptions } from './sensorCoupling';

const part = (id: string, type: string, label: string, props: FluidProps = {}) => ({ id, type, label, props: { ...defaultFluidProps(getFluidDefinition(type)!), ...props } });

describe('ISO 1219-2 signal tags', () => {
  it('tags a pushbutton 1S1 and a solenoid 1Y1, leaving the valve its own 1V tag', () => {
    const start = part('v', 'valve-3-2-no', '1V1', { actuationLeft: 'Pushbutton' });
    const coil = part('w', 'valve-5-2', '1V2', { actuationLeft: 'Solenoid', actuationRight: 'Solenoid' });
    const tags = assignSignalTags([start, coil]);
    expect(tags.operators['v:left']).toBe('1S1');
    expect(tags.operators['w:left']).toBe('1Y1');
    expect(tags.operators['w:right']).toBe('1Y2');
    expect(operatorTagsOf(start, tags, [])).toEqual({ left: '1S1' });
  });

  it('numbers manual inputs S and the position sensors of each cylinder B, per circuit', () => {
    const parts = [part('a', 'cylinder-double', '1A1'), part('b', 'valve-3-2-no', '1V1', { actuationLeft: 'Pushbutton' }), part('l', 'valve-3-2-no', '2V1', { actuationLeft: 'Hand Lever' })];
    const tags = assignSignalTags(parts);
    expect(tags.operators['b:left']).toBe('1S1');
    expect(tags.operators['l:left']).toBe('2S1');
    expect(tags.sensors.a).toEqual(['1B1', '1B2']);
    expect(listSensorOptions(parts, tags.sensors).map(option => option.tag)).toEqual(['1B1', '1B2']);
  });

  it('shows the coupled limit switch tag on a roller, and tags an unlinked roller as a switch of its own', () => {
    const cylinder = part('a', 'cylinder-double', '1A1');
    const linked = part('r', 'valve-3-2-no', '1V1', { actuationLeft: 'Roller', leftSensor: 'a:S2' });
    const loose = part('p', 'valve-3-2-no', '1V2', { actuationLeft: 'Plunger' });
    const parts = [cylinder, linked, loose];
    const tags = assignSignalTags(parts);
    const options = listSensorOptions(parts, tags.sensors);
    expect(operatorTagsOf(linked, tags, options)).toEqual({ left: '1B2' });
    expect(tags.operators['r:left']).toBeUndefined();
    expect(operatorTagsOf(loose, tags, options)).toEqual({ left: '1S1' });
  });

  it('tags the shut-off of each main service unit 0S1, 0S2 and shows it beside the unit', () => {
    const units = [part('u', 'service-unit', '0Z1'), part('w', 'service-unit', '0Z2')];
    const tags = assignSignalTags(units);
    expect(tags.operators['u:right']).toBe('0S1');
    expect(tags.operators['w:right']).toBe('0S2');
    expect(operatorTagsOf(units[0], tags, [])).toEqual({ right: '0S1' });
  });

  it('shows a tag typed in the inspector in place of the automatic one, on either end', () => {
    const valve = part('v', 'valve-3-2-no', '1V1', { actuationLeft: 'Pushbutton', actuationRight: 'Roller', leftTag: '$2S2$', rightTag: '2B1' });
    const tags = assignSignalTags([valve]);
    expect(tags.operators['v:left']).toBe('1S1');
    expect(operatorTagsOf(valve, tags, [])).toEqual({ left: '2S2', right: '2B1' });
    expect(operatorTagsOf({ ...valve, props: { ...valve.props, leftTag: '  ' } }, tags, [])).toEqual({ left: '1S1', right: '2B1' });
  });
});
