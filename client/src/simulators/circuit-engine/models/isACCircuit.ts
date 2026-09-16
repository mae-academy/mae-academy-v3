import type { CircuitComponent } from '@/simulators/circuit-engine/models/circuitTypes';

/**
 * Set of component type identifiers that characterize an AC / reactive / frequency-dependent circuit.
 */
export const AC_COMPONENT_TYPES = new Set<string>([
  'capacitor',
  'inductor',
  'impedance',
  'ac-voltage',
  'ac_voltage',
  'ac_voltage_source',
  'ac-voltage-source',
  'vac',
  'ac-current',
  'ac_current',
  'ac_current_source',
  'ac-current-source',
  'iac',
  'three-phase-source',
  'three-phase-rail',
  'transformer',
  'transformer-ct',
  'autotransformer',
  'coupled-inductor',
  'coupled_inductor',
]);

/**
 * Detects whether the circuit components include any AC, reactive, or frequency-dependent elements
 * (capacitors, inductors, AC voltage/current sources, transformers, or complex impedances).
 *
 * @param components Array of circuit components
 * @returns true if any AC component is present, false otherwise
 */
export function isACCircuit(
  components?: Array<CircuitComponent | { type?: string } | null | undefined> | null
): boolean {
  if (!components || !Array.isArray(components)) return false;
  return components.some((component) => {
    if (!component || typeof component.type !== 'string') return false;
    const type = component.type.toLowerCase().trim();
    return (
      AC_COMPONENT_TYPES.has(type) ||
      type.startsWith('transformer') ||
      type.startsWith('autotransformer') ||
      type.includes('ac-voltage') ||
      type.includes('ac_voltage') ||
      type.includes('ac-current') ||
      type.includes('ac_current')
    );
  });
}
