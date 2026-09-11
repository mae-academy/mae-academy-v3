import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';

export type DirectControlKind = 'latching' | 'momentary' | null;

const MOMENTARY_TYPES = new Set(['pb-no', 'pb-nc']);
const LATCHING_SWITCH_TYPES = new Set(['sw-spst-no', 'sw-spst-nc', 'sw-spdt', 'sw-dpst', 'sw-dpdt']);
const LATCHING_RELAY_TYPES = new Set(['relay-spst', 'relay-spdt', 'relay-dpst', 'contactor']);

/** Identifies canvas controls without changing the generic Tab B interaction contract. */
export function directControlKind(componentType: string): DirectControlKind {
  if (MOMENTARY_TYPES.has(componentType)) return 'momentary';
  if (LATCHING_SWITCH_TYPES.has(componentType) || LATCHING_RELAY_TYPES.has(componentType)) return 'latching';
  return null;
}

/** Returns the next persistent contact state for a standard switch or manual relay override. */
export function nextLatchingControlProps(component: CircuitComponent): Record<string, unknown> {
  if (LATCHING_RELAY_TYPES.has(component.type)) {
    return { manualState: component.props.manualState === 'closed' ? 'open' : 'closed' };
  }
  const state = String(component.props.state ?? '');
  if (component.type === 'sw-spdt' || component.type === 'sw-dpdt') return { state: state === 'b' ? 'a' : 'b' };
  return { state: state === 'closed' ? 'open' : 'closed' };
}

/** Pushbuttons are only electrically active while their pointer hold is live. */
export function momentaryControlProps(pressed: boolean): Record<string, unknown> {
  return { state: pressed ? 'pressed' : 'released' };
}

/** Manual relay positions supersede coil sensing only when an explicit canvas latch exists. */
export function manualRelayClosed(props: Record<string, unknown>, coilEnergized: boolean): boolean {
  if (props.manualState === 'closed') return true;
  if (props.manualState === 'open') return false;
  return coilEnergized;
}

/* ------------------------------------------------------------------- Keyboard switch hotkeys --- */

/**
 * The digit a keyboard event addresses, read from the physical key (`event.code`) rather than the
 * character it types: on a non-Latin layout the number row types e.g. Arabic-Indic "١" for Digit1,
 * which a `/^[0-9]$/` test on `event.key` rejects. Numpad keys count only while NumLock makes them
 * type a character, so NumLock-off navigation (End, Home, …) never toggles a switch.
 */
export function hotkeyDigit(event: { code?: string; key: string }): string | null {
  const row = /^Digit([0-9])$/.exec(event.code ?? '');
  if (row) return row[1];
  const pad = /^Numpad([0-9])$/.exec(event.code ?? '');
  if (pad) return event.key.length === 1 ? pad[1] : null;
  return /^[0-9]$/.test(event.key) ? event.key : null;
}

// Inputs that never consume a typed digit, so focus left on one must not disable the hotkeys.
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

/**
 * Whether keystrokes aimed at `target` are text entry a hotkey must not steal. A range slider,
 * checkbox or button does nothing with a digit, so focus left on one — the toolbar's simulation
 * speed slider keeps focus after it is dragged — must not silently disable the switch hotkeys.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (!element || typeof element.tagName !== 'string') return false;
  if (element.isContentEditable === true) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUT_TYPES.has(String(element.type ?? 'text').toLowerCase());
}

/** Canvas parts a number key operates: latching switches flip, pushbuttons are held. */
function hotkeyControlKind(componentType: string): DirectControlKind {
  if (MOMENTARY_TYPES.has(componentType)) return 'momentary';
  return LATCHING_SWITCH_TYPES.has(componentType) ? 'latching' : null;
}

/**
 * Applies a number-key press or release to the canvas. The digit addresses every switch and
 * pushbutton whose label ends in exactly that number (S1 → "1"). Key-down flips a latching switch
 * to its next contact state and presses a pushbutton; key-up releases the pushbutton, so it
 * conducts only while the key is held. Returns `null` when nothing electrical changes, so a held
 * key's auto-repeat or an unbound digit costs no state update and no SPICE re-solve.
 */
export function applySwitchHotkey(components: CircuitComponent[], digit: string, phase: 'down' | 'up'): CircuitComponent[] | null {
  let changed = false;
  const next = components.map(component => {
    const kind = hotkeyControlKind(component.type);
    if (!kind || component.label.match(/\d+$/)?.[0] !== digit) return component;
    if (kind === 'latching') {
      if (phase !== 'down') return component;
      changed = true;
      return { ...component, props: { ...component.props, ...nextLatchingControlProps(component) } };
    }
    const pressed = phase === 'down';
    if ((component.props.state === 'pressed') === pressed) return component;
    changed = true;
    return { ...component, props: { ...component.props, ...momentaryControlProps(pressed) } };
  });
  return changed ? next : null;
}

/**
 * Releases every pushbutton held from the keyboard, for when the window loses focus mid-press: the
 * key-up then goes to another window, and without this the button would stay pressed indefinitely.
 */
export function releaseHeldPushbuttons(components: CircuitComponent[]): CircuitComponent[] | null {
  let changed = false;
  const next = components.map(component => {
    if (hotkeyControlKind(component.type) !== 'momentary' || component.props.state !== 'pressed') return component;
    changed = true;
    return { ...component, props: { ...component.props, ...momentaryControlProps(false) } };
  });
  return changed ? next : null;
}
