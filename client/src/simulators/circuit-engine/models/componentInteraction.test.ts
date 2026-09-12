import { describe, expect, it } from 'vitest';
import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';
import { applySwitchHotkey, directControlKind, hotkeyDigit, isTextEntryTarget, manualRelayClosed, momentaryControlProps, nextLatchingControlProps, releaseHeldPushbuttons } from '@/simulators/circuit-engine/models/componentInteraction';

const component = (type: string, props: Record<string, unknown> = {}): CircuitComponent => ({ id: type, type, x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: type, props });
const labeled = (id: string, type: string, label: string, props: Record<string, unknown>): CircuitComponent => ({ ...component(type, props), id, label });

describe('direct canvas control contract', () => {
  it('classifies standard switches as latching and pushbuttons as momentary, but never a relay or contactor body', () => {
    expect(directControlKind('sw-spst-no')).toBe('latching');
    expect(directControlKind('pb-no')).toBe('momentary');
    expect(directControlKind('resistor')).toBeNull();
    // Relay/contactor contacts and coils stay strictly coil-driven: a canvas click must never latch them.
    expect(directControlKind('relay-spst')).toBeNull();
    expect(directControlKind('relay-spdt')).toBeNull();
    expect(directControlKind('relay-dpst')).toBeNull();
    expect(directControlKind('contactor')).toBeNull();
  });

  it('cycles standard switches between their valid electrical contact states', () => {
    expect(nextLatchingControlProps(component('sw-spst-no', { state: 'open' }))).toEqual({ state: 'closed' });
    expect(nextLatchingControlProps(component('sw-spst-nc', { state: 'closed' }))).toEqual({ state: 'open' });
    expect(nextLatchingControlProps(component('sw-spdt', { state: 'a' }))).toEqual({ state: 'b' });
    expect(nextLatchingControlProps(component('sw-dpdt', { state: 'b' }))).toEqual({ state: 'a' });
  });

  it('restores momentary pushbuttons on release, while Force State (never a canvas click) still overrides coil sensing', () => {
    expect(momentaryControlProps(true)).toEqual({ state: 'pressed' });
    expect(momentaryControlProps(false)).toEqual({ state: 'released' });
    // manualRelayClosed backs the Force State properties-panel control, not the canvas click path.
    expect(manualRelayClosed({ manualState: 'closed' }, false)).toBe(true);
    expect(manualRelayClosed({ manualState: 'open' }, true)).toBe(false);
    expect(manualRelayClosed({}, true)).toBe(true);
  });
});

describe('keyboard switch hotkeys', () => {
  const canvas = () => [
    labeled('s1', 'sw-spst-no', 'S1', { state: 'open' }),
    labeled('s2', 'pb-no', 'S2', { state: 'released' }),
    labeled('s3', 'sw-spdt', 'S3', { state: 'a' }),
    labeled('r1', 'resistor', 'R1', { resistance: 1000 }),
    labeled('k1', 'relay-spst', 'K1', {}),
  ];

  it('reads the digit from the physical key, so a non-Latin layout still addresses S1', () => {
    expect(hotkeyDigit({ code: 'Digit1', key: '1' })).toBe('1');
    // Arabic layout: the number row types Arabic-Indic digits, which a key-based test rejects.
    expect(hotkeyDigit({ code: 'Digit1', key: '١' })).toBe('1');
    // AZERTY: the unshifted number row types punctuation.
    expect(hotkeyDigit({ code: 'Digit1', key: '&' })).toBe('1');
    expect(hotkeyDigit({ code: 'Numpad7', key: '7' })).toBe('7');
    // NumLock off turns the numpad into navigation, which must never toggle a switch.
    expect(hotkeyDigit({ code: 'Numpad1', key: 'End' })).toBeNull();
    expect(hotkeyDigit({ code: 'KeyW', key: 'w' })).toBeNull();
    // Synthetic events without a code fall back to the typed character.
    expect(hotkeyDigit({ key: '4' })).toBe('4');
  });

  it('lets hotkeys through a focused slider or button, but not a text field', () => {
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'range' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'svg' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT', type: 'number' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it("toggles a latching switch open <-> closed on each key-down of its label's digit", () => {
    const closed = applySwitchHotkey(canvas(), '1', 'down');
    expect(closed?.find(item => item.id === 's1')?.props.state).toBe('closed');
    const reopened = applySwitchHotkey(closed ?? [], '1', 'down');
    expect(reopened?.find(item => item.id === 's1')?.props.state).toBe('open');
    // Key-up does nothing to a latching switch.
    expect(applySwitchHotkey(closed ?? [], '1', 'up')).toBeNull();
    expect(applySwitchHotkey(canvas(), '3', 'down')?.find(item => item.id === 's3')?.props.state).toBe('b');
  });

  it('holds a pushbutton only between key-down and key-up', () => {
    const pressed = applySwitchHotkey(canvas(), '2', 'down');
    expect(pressed?.find(item => item.id === 's2')?.props.state).toBe('pressed');
    // Auto-repeat while held changes nothing, so it costs no state update or SPICE re-solve.
    expect(applySwitchHotkey(pressed ?? [], '2', 'down')).toBeNull();
    const released = applySwitchHotkey(pressed ?? [], '2', 'up');
    expect(released?.find(item => item.id === 's2')?.props.state).toBe('released');
    expect(applySwitchHotkey(released ?? [], '2', 'up')).toBeNull();
  });

  it('leaves non-switch parts, relays and unbound digits alone', () => {
    // K1 and R1 both end in "1", but only S1 is a hotkey target.
    const next = applySwitchHotkey(canvas(), '1', 'down');
    expect(next?.find(item => item.id === 'k1')).toEqual(canvas().find(item => item.id === 'k1'));
    expect(next?.find(item => item.id === 'r1')).toEqual(canvas().find(item => item.id === 'r1'));
    expect(applySwitchHotkey(canvas(), '9', 'down')).toBeNull();
    // Multi-digit labels need their exact number, so "1" never reaches S11.
    expect(applySwitchHotkey([labeled('s11', 'sw-spst-no', 'S11', { state: 'open' })], '1', 'down')).toBeNull();
  });

  it('releases every held pushbutton when the window loses focus mid-press', () => {
    const pressed = applySwitchHotkey(canvas(), '2', 'down') ?? [];
    expect(releaseHeldPushbuttons(pressed)?.find(item => item.id === 's2')?.props.state).toBe('released');
    expect(releaseHeldPushbuttons(canvas())).toBeNull();
  });
});
