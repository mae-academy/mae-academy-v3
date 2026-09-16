import type { ExampleDefinition } from '@/simulators/circuit-engine/examples/types';
import { buildSeriesChain, part, wire } from '@/simulators/circuit-engine/examples/schematicHelpers';

/* B.1 — Simple DC Mesh: Single Loop */
const b1Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 12 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 1000 }, label: 'R1' },
    { id: 'r2', type: 'resistor', props: { resistance: 2000 }, label: 'R2' },
    { id: 'r3', type: 'resistor', props: { resistance: 1000 }, label: 'R3' },
  ],
  groundId: 'g1',
});

const B1: ExampleDefinition = {
  id: 'mesh-simple-dc',
  name: 'Simple DC Mesh — Single Loop',
  category: 'Mesh Analysis / DC',
  categoryGroup: 'Mesh Analysis',
  difficulty: 'Beginner',
  durationMinutes: 5,
  conceptsTaught: ['Mesh (loop) current', 'KVL around a single loop', 'Series-circuit Ohm\'s law'],
  tags: ['dc', 'mesh', 'series'],
  spiceNetlist: `* Example: Simple DC Mesh Analysis\n* Purpose: Learn mesh equations, loop currents\n* Difficulty: Beginner\n\n.title Simple Mesh Analysis - Single Loop\n\nV1 1 0 DC 12V\nR1 1 2 1k\nR2 2 3 2k\nR3 3 0 1k\n\n.dc V1 12 12 1\n.print dc v(1) v(2) v(3) i(V1)\n.end`,
  schematicAscii: `Single loop:\n   V1 (12V) → R1 → R2 → R3 → (back to V1)\n   Loop current: I = V1 / (R1+R2+R3)`,
  educationalNarrative:
    'For a single-loop circuit, mesh analysis reduces to Ohm\'s law applied to the whole loop: V1 = I×(R1+R2+R3). The loop current is identical through every series element — the simplest possible mesh-analysis case, and the natural first step before independent loops are introduced in B.2.',
  expectedResults: {
    currents: { 'I (loop)': 0.003 },
    nodeVoltages: { 'Node 1 (V1)': 12, 'Node 2': 9, 'Node 3': 3 },
  },
  suggestedModifications: [
    'Double R2 to 4k and observe the loop current halve',
    'Replace V1 with 24V and see the loop current double',
    'Compare the Mesh tab\'s I₁ against the Nodal tab\'s node voltages for this same circuit',
    'Calculate the power dissipated in each resistor and verify it sums to the power delivered by V1',
  ],
  theoreticalBackground:
    'Mesh current: the single current that flows around a closed loop. KVL: ΣV_sources = ΣI×R. For a single loop this collapses to I = V_total / R_total.',
  suggestedAnalysisMethod: 'mesh',
  schematic: b1Chain,
};

/* B.2 — Two-Mesh Circuit: Independent Loops */
const b2Components = [
  part('v1', 'dc-voltage', 150, 200, { voltage: 12 }, { label: 'V1' }),
  part('r1', 'resistor', 350, 150, { resistance: 2000 }, { label: 'R1' }),
  part('r2', 'resistor', 550, 150, { resistance: 1000 }, { label: 'R2' }),
  part('v2', 'dc-voltage', 750, 200, { voltage: 6 }, { label: 'V2' }),
  part('r3', 'resistor', 550, 350, { resistance: 2000 }, { label: 'R3', rotation: 90 }),
  part('g1', 'ground', 450, 500, {}),
];
const b2Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [150, 150], [320, 150]),
  wire('w2', 'r1', 'b', 'r2', 'a', [380, 150], [520, 150]),
  wire('w3', 'r2', 'b', 'v2', 'pos', [580, 150], [750, 150]),
  wire('w4', 'r2', 'b', 'r3', 'a', [580, 150], [550, 320]),
  wire('w5', 'r3', 'b', 'g1', 'gnd', [550, 380], [450, 500]),
  wire('w6', 'v1', 'neg', 'g1', 'gnd', [150, 250], [450, 500]),
  wire('w7', 'v2', 'neg', 'g1', 'gnd', [750, 250], [450, 500]),
];

const B2: ExampleDefinition = {
  id: 'mesh-two-loop-dc',
  name: 'Two-Mesh Circuit — Independent Loops',
  category: 'Mesh Analysis / DC',
  categoryGroup: 'Mesh Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Independent mesh currents', 'Shared-branch current as a difference of mesh currents', 'Matrix mesh equations'],
  tags: ['dc', 'mesh', 'multi-loop'],
  spiceNetlist: `* Example: Two-Mesh DC Analysis\n* Purpose: Learn to write mesh equations for multiple loops\n* Difficulty: Intermediate\n\n.title Two-Mesh DC Analysis\n\nV1 1 0 DC 12V\nV2 3 0 DC 6V\nR1 1 2 2k\nR2 2 3 1k\nR3 3 0 2k\n\n.dc V1 12 12 1\n.print dc v(1) v(2) v(3) i(V1) i(V2)\n.end`,
  schematicAscii: `Left Mesh (I1):           Right Mesh (I2):\n  12V                       6V\n   |                        |\n   R1 (2kΩ)                 |\n   |                        |\nNode 2 ─ R2 (1kΩ) ─ Node3─────┘\n                          |\n                        R3 (2kΩ) to GND\n\nR2 is shared between meshes (carries I1 - I2)`,
  educationalNarrative:
    'Two independent meshes need two independent mesh equations. The shared resistor R2 carries the difference of the two mesh currents (I1 − I2) — the defining feature of mesh analysis: current conservation through shared branches falls out automatically once both loop equations are solved together.',
  expectedResults: {
    nodeVoltages: { 'Node 2': 8, 'Node 3': 6 },
    currents: { 'I(R1) = I1': 0.002, 'I(R2) = I1 - I2': 0.002 },
    notes: ['Verify in the Mesh tab: I1 and I2 should satisfy V1 = I1×R1 + (I1−I2)×R2 and V2 = I2×R3 + (I2−I1)×R2.'],
  },
  suggestedModifications: [
    'Set V2 to 12V (same as V1) and observe the resulting symmetry',
    'Set R2 to a very small value (near-short) and see I1 and I2 converge',
    'Add a third mesh to make a triangle topology',
    'Calculate power generated by each source versus power dissipated in each resistor',
  ],
  theoreticalBackground:
    'Independent meshes: M = B − N + 1 (branches, nodes). Each independent loop contributes one KVL equation. Matrix form: [R][I] = [V]. A shared resistor\'s current is the (signed) difference of the two adjacent mesh currents.',
  suggestedAnalysisMethod: 'mesh',
  schematic: { components: b2Components, wires: b2Wires },
};

/* B.3 — Three-Mesh Circuit: Wheatstone Bridge */
const b3Components = [
  part('v1', 'dc-voltage', 450, 100, { voltage: 24 }, { label: 'V1' }),
  part('r1', 'resistor', 280, 250, { resistance: 2000 }, { label: 'R1', rotation: 45 }),
  part('r3', 'resistor', 620, 250, { resistance: 2000 }, { label: 'R3', rotation: -45 }),
  part('r5', 'resistor', 450, 320, { resistance: 1500 }, { label: 'R5' }),
  part('r2', 'resistor', 280, 450, { resistance: 3000 }, { label: 'R2', rotation: 90 }),
  part('r4', 'resistor', 620, 450, { resistance: 4000 }, { label: 'R4', rotation: 90 }),
  part('g1', 'ground', 450, 560, {}),
];
const b3Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [450, 50], [280, 220]),
  wire('w2', 'v1', 'pos', 'r3', 'a', [450, 50], [620, 220]),
  wire('w3', 'r1', 'b', 'r5', 'a', [280, 280], [420, 320]),
  wire('w4', 'r3', 'b', 'r5', 'b', [620, 280], [480, 320]),
  wire('w5', 'r1', 'b', 'r2', 'a', [280, 280], [280, 420]),
  wire('w6', 'r3', 'b', 'r4', 'a', [620, 280], [620, 420]),
  wire('w7', 'r2', 'b', 'g1', 'gnd', [280, 480], [450, 560]),
  wire('w8', 'r4', 'b', 'g1', 'gnd', [620, 480], [450, 560]),
  wire('w9', 'v1', 'neg', 'g1', 'gnd', [450, 150], [450, 560]),
];

const B3: ExampleDefinition = {
  id: 'mesh-three-loop-bridge',
  name: 'Three-Mesh Circuit — Wheatstone Bridge',
  category: 'Mesh Analysis / DC',
  categoryGroup: 'Mesh Analysis',
  difficulty: 'Advanced',
  durationMinutes: 12,
  conceptsTaught: ['Multi-mesh systems', 'Bridge topology', 'Balanced vs. unbalanced bridges'],
  tags: ['dc', 'mesh', 'bridge', 'wheatstone'],
  spiceNetlist: `* Example: Three-Mesh DC Analysis (Bridge Circuit)\n* Purpose: Solve complex multi-loop circuits\n* Difficulty: Advanced\n\n.title Three-Mesh Bridge Circuit\n\nV1 1 0 DC 24V\nR1 1 2 2k\nR2 2 0 3k\nR3 1 3 2k\nR4 3 0 4k\nR5 2 3 1.5k\n\n.dc V1 24 24 1\n.print dc v(1) v(2) v(3) i(R5)\n.end`,
  schematicAscii: `        +24V (Node 1)\n         |\n    ┌─ R1(2k) ─┬─ R3(2k) ─┐\n    │          │          │\n  Node 2   R5(1.5k)   Node 3\n    │          │          │\n    └─ R2(3k) ─┴─ R4(4k) ─┘\n         |\n        GND\n\nA Wheatstone bridge — unbalanced here (R1/R2 = 2/3 ≠ R3/R4 = 2/4).`,
  educationalNarrative:
    'The bridge is balanced only when R1/R2 = R3/R4; here 2/3 ≠ 2/4, so it is unbalanced and the bridge resistor R5 carries real current. Three independent meshes are needed (any two loops determine the third), making this a strong workout for the full [Z][I] = [V] mesh system.',
  expectedResults: {
    nodeVoltages: { 'Node 2': 14.876033, 'Node 3': 15.471074 },
    currents: { 'I(R5), node3→node2': 0.000397 },
    notes: ['Change R3 to 3k (so R1/R2 = R3/R4 = 2/3) to balance the bridge and watch I(R5) collapse to 0.'],
  },
  suggestedModifications: [
    'Change R3 to 3k to balance the bridge — I(R5) should drop to ~0',
    'Disconnect R5 (delete it) and recompute V2 and V3 as two independent dividers',
    'Replace R5 with a current source and observe the forced current redistribute',
    'Use this circuit as the basis for a Thévenin equivalent seen from R5\'s terminals',
  ],
  theoreticalBackground:
    'Bridge circuits are a classic symmetric topology used for precision measurement. Balanced condition: equal voltage-divider ratios on both arms means zero bridge current; unbalanced bridges are the basis of strain-gauge and sensor read-out circuits.',
  suggestedAnalysisMethod: 'mesh',
  schematic: { components: b3Components, wires: b3Wires },
};

export const MESH_ANALYSIS_EXAMPLES: ExampleDefinition[] = [B1, B2, B3];
