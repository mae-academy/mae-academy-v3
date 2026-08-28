import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from './circuitTypes';
import { directControlKind, manualRelayClosed, momentaryControlProps, nextLatchingControlProps } from './componentInteraction';

const component = (type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id: type, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: type, props });

describe('direct canvas control contract', () => {
  it('classifies standard switches and relays as latching while pushbuttons remain momentary', () => {
    expect(directControlKind('sw-spst-no')).toBe('latching');
    expect(directControlKind('relay-spdt')).toBe('latching');
    expect(directControlKind('contactor')).toBe('latching');
    expect(directControlKind('pb-no')).toBe('momentary');
    expect(directControlKind('resistor')).toBeNull();
  });

  it('cycles standard switches between their valid electrical contact states', () => {
    expect(nextLatchingControlProps(component('sw-spst-no', { state: 'open' }))).toEqual({ state: 'closed' });
    expect(nextLatchingControlProps(component('sw-spst-nc', { state: 'closed' }))).toEqual({ state: 'open' });
    expect(nextLatchingControlProps(component('sw-spdt', { state: 'a' }))).toEqual({ state: 'b' });
    expect(nextLatchingControlProps(component('sw-dpdt', { state: 'b' }))).toEqual({ state: 'a' });
  });

  it('latches relay contacts with a manual override and restores momentary pushbuttons on release', () => {
    expect(nextLatchingControlProps(component('relay-spst', {}))).toEqual({ manualState: 'closed' });
    expect(nextLatchingControlProps(component('relay-spst', { manualState: 'closed' }))).toEqual({ manualState: 'open' });
    expect(manualRelayClosed({ manualState: 'closed' }, false)).toBe(true);
    expect(manualRelayClosed({ manualState: 'open' }, true)).toBe(false);
    expect(manualRelayClosed({}, true)).toBe(true);
    expect(momentaryControlProps(true)).toEqual({ state: 'pressed' });
    expect(momentaryControlProps(false)).toEqual({ state: 'released' });
  });
});
