import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';

export type DirectControlKind = 'latching' | 'momentary' | null;

const MOMENTARY_TYPES = new Set(['pb-no', 'pb-nc']);
const LATCHING_SWITCH_TYPES = new Set(['sw-spst-no', 'sw-spst-nc', 'sw-spdt', 'sw-dpst', 'sw-dpdt']);
const LATCHING_RELAY_TYPES = new Set(['relay-spst', 'relay-spdt', 'relay-dpst', 'relay-dpdt', 'contactor']);

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
