import type { ExampleCategory, ExampleDefinition } from '@/simulators/circuit-engine/examples/types';
import { NODAL_ANALYSIS_EXAMPLES } from '@/simulators/circuit-engine/examples/nodal-analysis';
import { MESH_ANALYSIS_EXAMPLES } from '@/simulators/circuit-engine/examples/mesh-analysis';
import { SUPERPOSITION_EXAMPLES } from '@/simulators/circuit-engine/examples/superposition';
import { THEVENIN_NORTON_EXAMPLES } from '@/simulators/circuit-engine/examples/thevenin-norton';
import { TRANSIENT_ANALYSIS_EXAMPLES } from '@/simulators/circuit-engine/examples/transient-analysis';
import { AC_ANALYSIS_EXAMPLES } from '@/simulators/circuit-engine/examples/ac-analysis';

export type { ExampleDefinition, ExampleCategory, ExampleDifficulty, ExampleSchematic, ExpectedResults, OscilloscopeSettings } from '@/simulators/circuit-engine/examples/types';

/** Every example, grouped in spec order (Sections A → F). */
export const EXAMPLE_LIBRARY: ExampleDefinition[] = [
  ...NODAL_ANALYSIS_EXAMPLES,
  ...MESH_ANALYSIS_EXAMPLES,
  ...SUPERPOSITION_EXAMPLES,
  ...THEVENIN_NORTON_EXAMPLES,
  ...TRANSIENT_ANALYSIS_EXAMPLES,
  ...AC_ANALYSIS_EXAMPLES,
];

/** Category display order for the modal's sidebar/filter. */
export const EXAMPLE_CATEGORIES: ExampleCategory[] = [
  'Nodal Analysis',
  'Mesh Analysis',
  'Superposition',
  'Thévenin & Norton',
  'Time-Domain (Transient)',
  'AC Analysis',
];

export function getExampleById(id: string): ExampleDefinition | undefined {
  return EXAMPLE_LIBRARY.find((example) => example.id === id);
}

export function getExamplesByCategory(category: ExampleCategory): ExampleDefinition[] {
  return EXAMPLE_LIBRARY.filter((example) => example.categoryGroup === category);
}

/** Re-exported per-category arrays, for anything that wants to import a single section directly. */
export {
  NODAL_ANALYSIS_EXAMPLES,
  MESH_ANALYSIS_EXAMPLES,
  SUPERPOSITION_EXAMPLES,
  THEVENIN_NORTON_EXAMPLES,
  TRANSIENT_ANALYSIS_EXAMPLES,
  AC_ANALYSIS_EXAMPLES,
};
