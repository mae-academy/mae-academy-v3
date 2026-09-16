import type { ExampleDefinition } from '@/simulators/circuit-engine/examples/types';
import { buildSeriesChain, part, wire } from '@/simulators/circuit-engine/examples/schematicHelpers';

/* D.1 — Thévenin Equivalent: Extracting V_th and R_th */
const d1Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 15 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 2000 }, label: 'R1' },
    { id: 'r2', type: 'resistor', props: { resistance: 3000 }, label: 'R2' },
  ],
  groundId: 'g1',
});

const D1: ExampleDefinition = {
  id: 'thevenin-extraction-dc',
  name: 'Thévenin Equivalent — Extracting V_th and R_th',
  category: 'Thévenin & Norton / DC',
  categoryGroup: 'Thévenin & Norton',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Thévenin voltage (open-circuit)', 'Thévenin resistance (source-deactivated look-back)', 'Load matching'],
  tags: ['dc', 'thevenin', 'equivalent-circuit'],
  spiceNetlist: `* Example: Thévenin Equivalent Extraction\n* Purpose: Learn to find Thévenin voltage and resistance\n* Difficulty: Intermediate\n\n.title Thévenin Equivalent Extraction\n\nV1 1 0 DC 15V\nR1 1 2 2k\nR2 2 0 3k\n\n.dc V1 15 15 1\n.print dc v(2)\n.end`,
  schematicAscii: `Original Circuit:\n  15V ─ R1 ─ Node 2 ─ R2 ─ GND\n        (2kΩ)         (3kΩ)\n\nThévenin Equivalent (as seen from Node 2, load removed):\n  V_th ─ R_th ─ [Load Connected Here]`,
  educationalNarrative:
    'The schematic loads with node 2 left open (no load resistor) so its voltage IS the Thévenin voltage directly: V_th = V2 = 15V × R2/(R1+R2) = 9V. R_th is found by deactivating V1 (short it) and computing the resistance looking back into node 2: R_th = R1 ∥ R2 = 1.2kΩ. Add a 1.2kΩ load (a suggested modification below) and V2 should drop to exactly half of 9V — the defining property of a matched Thévenin equivalent.',
  expectedResults: {
    nodeVoltages: { 'Node 2 (V_th, no load)': 9 },
    notes: ['R_th = R1 ∥ R2 = 1.2 kΩ.', 'Loading node 2 with exactly R_th halves its voltage to 4.5V — a strong verification you can do yourself in the simulator.'],
  },
  suggestedModifications: [
    'Add a 1.2kΩ resistor from node 2 to ground and confirm V2 drops to 4.5V (matched-load halving)',
    'Change R1 to 3k and recompute V_th and R_th by hand, then verify in the simulator',
    'Add a dependent source and observe R_th can become negative (an active circuit)',
    'Extract the Thévenin equivalent seen from a different node pair',
  ],
  theoreticalBackground:
    'Thévenin\'s theorem: any linear two-terminal network reduces to a single voltage source in series with a single resistor. Norton is the dual (current source in parallel with a resistor). Applications: load matching, rapid re-analysis under different loads, filter design.',
  suggestedAnalysisMethod: 'thevenin',
  schematic: d1Chain,
};

/* D.2 — Thévenin with Dependent Source (Active Circuit) */
const d2Components = [
  part('v1', 'dc-voltage', 200, 160, { voltage: 10 }, { label: 'V1' }),
  part('r1', 'resistor', 420, 160, { resistance: 2000 }, { label: 'R1' }),
  part('rsense', 'resistor', 420, 320, { resistance: 1e7 }, { label: 'R_sense', rotation: 90 }),
  part('e1', 'vcvs', 640, 160, { gain: 2, targetId: 'rsense' }, { label: 'E1' }),
  part('r2', 'resistor', 860, 160, { resistance: 1000 }, { label: 'R2' }),
  part('g1', 'ground', 640, 480, {}),
];
const d2Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [200, 110], [390, 160]),
  wire('w2', 'r1', 'b', 'rsense', 'a', [450, 160], [420, 290]),
  wire('w3', 'rsense', 'b', 'g1', 'gnd', [420, 350], [640, 480]),
  wire('w4', 'v1', 'neg', 'g1', 'gnd', [200, 210], [640, 480]),
  wire('w5', 'e1', 'pos', 'r2', 'a', [640, 125], [830, 160]),
  wire('w6', 'e1', 'neg', 'g1', 'gnd', [640, 195], [640, 480]),
  // R2's far end (node 4) is deliberately left open — its voltage IS V_th, exactly like D.1.
];

const D2: ExampleDefinition = {
  id: 'thevenin-dependent-source',
  name: 'Thévenin with Dependent Source (Active Circuit)',
  category: 'Thévenin & Norton / DC',
  categoryGroup: 'Thévenin & Norton',
  difficulty: 'Advanced',
  durationMinutes: 12,
  conceptsTaught: ['Thévenin extraction on active circuits', 'Dependent sources acting as an ideal short when deactivated', 'Load-independent gain'],
  tags: ['dc', 'thevenin', 'dependent-source', 'vcvs'],
  spiceNetlist: `* Example: Thévenin - Active Circuit with VCVS\n* Purpose: Extend Thévenin to circuits with dependent sources\n* Difficulty: Advanced\n\n.title Thévenin with Dependent Source\n\nV1 1 0 DC 10V\nR1 1 2 2k\nE1 3 0 2 0 2\nR2 3 4 1k\n\n.dc V1 10 10 1\n.print dc v(4)\n.end`,
  schematicAscii: `Original:\n  10V ─ R1 ─ Node 2 ─┐\n      (2kΩ)  │       │\n           [Sensor]  │\n           (E1, Gain=2)\n           │        │\n           ├─ R2 ─ Node 4 (open = V_th)\n          (1kΩ)`,
  educationalNarrative:
    'With dependent sources, the Thévenin equivalent becomes more subtle: node 2 is an ideal sense tap (identical reasoning to example A.3), so V2 = V1 = 10V exactly, and E1\'s output is 2×V2 = 20V. Because node 4 is left open, no current flows through R2, so V4 = V_th = 20V directly. The interesting part is R_th: deactivate V1 (short it) and node 2 collapses to 0V too, which forces E1\'s output to 0V regardless of any test current — the dependent source behaves as an ideal 0V short once its control voltage is zeroed, so R_th is simply R2 = 1kΩ.',
  expectedResults: {
    nodeVoltages: { 'Node 4 (V_th, open)': 20 },
    notes: ['R_th = R2 = 1 kΩ (E1 contributes zero resistance of its own once deactivated).', 'Add a 1kΩ load at node 4 and V4 should read 10V — matched-load halving, same check as D.1.'],
  },
  suggestedModifications: [
    'Change E1\'s gain to 1 (unity) and see how V_th changes but R_th stays R2',
    'Reverse E1\'s gain sign (negative) and observe V_th flips sign',
    'Add a 1kΩ load at node 4 and confirm V4 halves to 10V',
    'Replace the VCVS with a CCVS sensing R1\'s current instead, and re-derive R_th',
  ],
  theoreticalBackground:
    'Active circuits (containing dependent sources) can still be reduced to a Thévenin equivalent using the same two-step procedure — open-circuit voltage, then deactivated-source look-back resistance — but R_th may be negative for some active networks (regions where the circuit can source, not just dissipate, power). This particular topology stays passive because the VCVS collapses to a 0Ω source with zero output once V1 is deactivated.',
  suggestedAnalysisMethod: 'thevenin',
  schematic: { components: d2Components, wires: d2Wires },
};

export const THEVENIN_NORTON_EXAMPLES: ExampleDefinition[] = [D1, D2];
