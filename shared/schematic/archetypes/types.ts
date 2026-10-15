// Archetype framework: hand-verified, parameterised schematics. The model picks an archetype and supplies values/labels;
// `build` returns an ordinary SchematicSpec, so validation, netlist and rendering are the existing engine, unchanged.

import type { SchematicSpec } from '../types';
import type { Dim } from '../values';

export type ParamValue = string | number | boolean;

export interface ParamDef {
  name: string;
  /** Human label (documentation only). */
  label: string;
  /** value = number with optional SI prefix and unit ("10 kΩ", "47uF"); choice = one of `choices`; bool; int = integer in min..max. */
  kind: 'value' | 'choice' | 'bool' | 'int';
  default: ParamValue;
  choices?: readonly string[];
  /** Expected dimension of a `value` parameter (a different unit is rejected; a missing unit is assumed). */
  unit?: Dim;
  /** Inclusive bounds: SI magnitude for `value` params, plain number for `int`. */
  min?: number;
  max?: number;
}

/** Parameters after strict parsing and defaulting: values are normalised display strings ("10 kΩ"), ints are numbers. */
export type ResolvedParams = Readonly<Record<string, ParamValue>>;

export interface Archetype {
  /** snake_case, unique, one of the roster ids. */
  id: string;
  title: string;
  /** Alternative names the model or a student might use; matched after lower-casing and normalising separators. */
  aliases: string[];
  /** One line for the prompt. */
  summary: string;
  params: readonly ParamDef[];
  build(p: ResolvedParams): SchematicSpec;
}
