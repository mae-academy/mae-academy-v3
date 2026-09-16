import type { ExampleDefinition } from '@/simulators/circuit-engine/examples/types';
import { buildSeriesChain, part, wire } from '@/simulators/circuit-engine/examples/schematicHelpers';

/* A.1 — Simple DC Nodal: Voltage Divider */
const a1Chain = buildSeriesChain({
  x: 300,
  sourceId: 'v1', sourceType: 'dc-voltage', sourceProps: { voltage: 12 }, sourceLabel: 'V1',
  chainParts: [
    { id: 'r1', type: 'resistor', props: { resistance: 2000 }, label: 'R1' },
    { id: 'r2', type: 'resistor', props: { resistance: 3000 }, label: 'R2' },
  ],
  groundId: 'g1',
});

const A1: ExampleDefinition = {
  id: 'nodal-simple-dc',
  name: 'Simple DC Nodal — Voltage Divider',
  category: 'Nodal Analysis / DC',
  categoryGroup: 'Nodal Analysis',
  difficulty: 'Beginner',
  durationMinutes: 5,
  conceptsTaught: ['KCL at a node', 'Voltage divider rule', 'Nodal analysis basics'],
  tags: ['dc', 'nodal', 'voltage-divider'],
  spiceNetlist: `* Example: Simple DC Nodal Analysis\n* Purpose: Learn voltage divider rule, node equations\n* Difficulty: Beginner\n\n.title Simple Voltage Divider - Nodal Analysis\n\nV1 1 0 DC 12V\nR1 1 2 2k\nR2 2 0 3k\n\n.dc V1 12 12 1\n.print dc v(1) v(2) i(V1)\n.end`,
  schematicAscii: `  +12V (Node 1)\n    |\n   R1 (2kΩ)\n    |\n  Node 2 ← Measure voltage here\n    |\n   R2 (3kΩ)\n    |\n   GND (Node 0)`,
  educationalNarrative:
    'Students learn to write nodal equations: at node 2, KCL gives (V1-V2)/R1 + (0-V2)/R2 = 0. Solving yields V2. This is the foundation of nodal analysis.',
  expectedResults: {
    nodeVoltages: { 'Node 1 (V1)': 12, 'Node 2': 7.2 },
    currents: { 'I(V1)': 0.0024 },
    power: { 'P(R1)': 0.01152, 'P(R2)': 0.01728 },
  },
  suggestedModifications: [
    'Change R1 to 1k, recalculate V2 (should be 8V)',
    'Change V1 to 24V, observe V2 doubles',
    'Add a third resistor in parallel with R2, calculate the new equivalent',
    'Find the Thévenin equivalent seen from node 2',
  ],
  theoreticalBackground:
    'Voltage divider: V_out = V_in × R2/(R1+R2). KCL at node 2: (V1-V2)/R1 = V2/R2. Nodal analysis is the systematic method for multi-node circuits.',
  suggestedAnalysisMethod: 'nodal',
  schematic: a1Chain,
};

/* A.2 — Supernode DC: Voltage Source Between Non-Ground Nodes */
const a2Components = [
  part('v1', 'dc-voltage', 200, 160, { voltage: 20 }, { label: 'V1' }),
  part('r1', 'resistor', 420, 160, { resistance: 1000 }, { label: 'R1' }),
  part('v2', 'dc-voltage', 640, 220, { voltage: 5 }, { label: 'V2' }),
  part('r2', 'resistor', 640, 400, { resistance: 2000 }, { label: 'R2', rotation: 90 }),
  part('r3', 'resistor', 200, 460, { resistance: 1000 }, { label: 'R3', rotation: 90 }),
  part('r4', 'resistor', 380, 460, { resistance: 3000 }, { label: 'R4' }),
  part('g1', 'ground', 400, 560, {}),
];
const a2Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [200, 110], [390, 160]),
  wire('w2', 'r1', 'b', 'v2', 'pos', [450, 160], [640, 170]),
  wire('w3', 'r1', 'b', 'r2', 'a', [450, 160], [640, 370]),
  wire('w4', 'v1', 'pos', 'r4', 'a', [200, 110], [350, 460]),
  wire('w5', 'r4', 'b', 'v2', 'neg', [410, 460], [640, 270]),
  wire('w6', 'r2', 'b', 'g1', 'gnd', [640, 430], [400, 560]),
  wire('w7', 'r3', 'a', 'v2', 'neg', [200, 430], [640, 270]),
  wire('w8', 'r3', 'b', 'g1', 'gnd', [200, 490], [400, 560]),
  wire('w9', 'v1', 'neg', 'g1', 'gnd', [200, 210], [400, 560]),
];

const A2: ExampleDefinition = {
  id: 'nodal-supernode-dc',
  name: 'Supernode DC — Voltage Source Between Non-Ground Nodes',
  category: 'Nodal Analysis / DC',
  categoryGroup: 'Nodal Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Supernodes', 'Floating voltage-source constraints', 'Systematic KCL with constraints'],
  tags: ['dc', 'nodal', 'supernode'],
  spiceNetlist: `* Example: Supernode DC Analysis\n* Purpose: Handle voltage sources between non-ground nodes\n* Difficulty: Intermediate\n\n.title Supernode - Voltage Source Between Nodes\n\nV1 1 0 DC 20V\nV2 2 3 DC 5V\nR1 1 2 1k\nR2 2 0 2k\nR3 3 0 1k\nR4 1 3 3k\n\n.dc V1 20 20 1\n.print dc v(1) v(2) v(3) i(V1) i(V2)\n.end`,
  schematicAscii: `    +20V (Node 1)\n      |\n     R1 (1kΩ)\n      |\n    Node 2 ─────┐\n      |          |\n     R2         V2 (+5V)\n   (2kΩ)        |\n      |          |\n     GND    Node 3\n              |\n             R3 (1kΩ)\n              |\n             GND\n      (R4 also runs between nodes 1 and 3)`,
  educationalNarrative:
    'When a voltage source is not connected to ground, it forms a supernode. The constraint V2 - V3 = 5V is used alongside the merged KCL equation for nodes 2 and 3 — exactly what the Academic Analysis Workspace\'s "Supernode boundary and constraint" step renders.',
  expectedResults: {
    nodeVoltages: { 'Node 1 (V1)': 20, 'Node 2': 11.764706, 'Node 3': 6.764706 },
    notes: ['V2 − V3 = 5 V is enforced exactly by the supernode constraint row.'],
  },
  suggestedModifications: [
    'Change V2 to 8V, recalculate V2 and V3',
    'Add a resistor between nodes 2 and 3, in parallel with V2',
    'Remove R4 and observe how the circuit changes',
    'Extract the Thévenin equivalent between nodes 2 and 3',
  ],
  theoreticalBackground:
    'Supernode: when a voltage source is not grounded, its two nodes are merged into one KCL equation, and the source\'s own voltage becomes an extra constraint equation. Unknowns = nodes − 1 − (independent voltage sources).',
  suggestedAnalysisMethod: 'nodal',
  schematic: { components: a2Components, wires: a2Wires },
};

/* A.3 — Dependent Source DC: VCVS in Nodal Analysis */
const a3Components = [
  part('v1', 'dc-voltage', 200, 160, { voltage: 10 }, { label: 'V1' }),
  part('r1', 'resistor', 420, 160, { resistance: 1000 }, { label: 'R1' }),
  // Ideal 10MΩ sense tap: gives the VCVS a real two-terminal target (node2 → GND) without
  // measurably loading node 2 (< 0.01% effect on R1's 1kΩ), the same convention this app's own
  // voltmeter/DMM use for a high-impedance probe.
  part('rsense', 'resistor', 420, 320, { resistance: 1e7 }, { label: 'R_sense', rotation: 90 }),
  part('e1', 'vcvs', 640, 160, { gain: 3, targetId: 'rsense' }, { label: 'E1' }),
  part('r2', 'resistor', 860, 160, { resistance: 2000 }, { label: 'R2' }),
  part('r3', 'resistor', 860, 320, { resistance: 1000 }, { label: 'R3', rotation: 90 }),
  part('g1', 'ground', 640, 480, {}),
];
const a3Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [200, 110], [390, 160]),
  wire('w2', 'r1', 'b', 'rsense', 'a', [450, 160], [420, 290]),
  wire('w3', 'rsense', 'b', 'g1', 'gnd', [420, 350], [640, 480]),
  wire('w4', 'v1', 'neg', 'g1', 'gnd', [200, 210], [640, 480]),
  wire('w5', 'e1', 'pos', 'r2', 'a', [640, 125], [830, 160]),
  wire('w6', 'r2', 'b', 'r3', 'a', [890, 160], [860, 290]),
  wire('w7', 'r3', 'b', 'g1', 'gnd', [860, 350], [640, 480]),
  wire('w8', 'e1', 'neg', 'g1', 'gnd', [640, 195], [640, 480]),
];

const A3: ExampleDefinition = {
  id: 'nodal-vcvs-dc',
  name: 'Dependent Source DC — VCVS in Nodal Analysis',
  category: 'Nodal Analysis / DC',
  categoryGroup: 'Nodal Analysis',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Voltage-controlled voltage sources', 'Dependent-source stamping', 'Coupled nodal equations'],
  tags: ['dc', 'nodal', 'dependent-source', 'vcvs'],
  spiceNetlist: `* Example: Dependent Source (VCVS) in Nodal Analysis\n* Purpose: Learn how controlled sources affect nodal equations\n* Difficulty: Intermediate\n\n.title VCVS Dependent Source - Nodal Analysis\n\nV1 1 0 DC 10V\nR1 1 2 1k\nE1 3 0 2 0 3\nR2 3 4 2k\nR3 4 0 1k\n\n.dc V1 10 10 1\n.print dc v(1) v(2) v(3) v(4) i(V1)\n.end`,
  schematicAscii: `    +10V (Node 1)\n      |\n     R1 (1kΩ)\n      |\n    Node 2 (sensed by E1, effectively open)\n      |\n    [E1] (VCVS: Gain=3, controlled by V2)\n      |\n    Node 3 (output = 3 × V2)\n      |\n     R2 (2kΩ)\n      |\n    Node 4\n      |\n     R3 (1kΩ)\n      |\n     GND`,
  educationalNarrative:
    'Dependent (controlled) sources create coupling in the nodal equations: the voltage at node 3 depends on node 2, V3 = 3×V2. Because an ideal VCVS control input draws zero current, node 2 is otherwise a dead end off R1 — so R1 carries no current and V2 equals V1 exactly. Node 3\'s stiff 30V output then drives R2 and R3 as an ordinary loaded voltage divider down to node 4, so V4 = V3 × R3/(R2+R3) — a good look at how a dependent-source constraint enters the matrix without touching the KCL sum at its own node, feeding a completely ordinary resistor network downstream.',
  expectedResults: {
    nodeVoltages: { 'Node 2 (sensed)': 10, 'Node 3 (E1 output)': 30, 'Node 4 (divided by R2, R3)': 10 },
    notes: [
      'V2 = V1 = 10 V because the ideal VCVS control input draws no current, so R1 carries 0 A.',
      'V3 = 3 × V2 = 30 V by the VCVS gain relation — this output is stiff regardless of R2/R3.',
      'V4 = V3 × R3/(R2+R3) = 30 × 1k/3k = 10 V, an ordinary loaded divider fed by the dependent source.',
      'A 10 MΩ sense resistor gives the dependent source a real two-terminal target; its loading effect on node 2 is below 0.001%.',
    ],
  },
  suggestedModifications: [
    'Change E1\'s gain from 3 to 5 and observe V3 and V4 increase proportionally',
    'Add a resistor from node 4 back to node 2 to create a feedback loop',
    'Lower R_sense to 10k and see how much node 2 is now loaded (compare V2 to V1)',
    'Reduce R2 or R3 and see that V3 stays exactly 3×V2 (the VCVS output is stiff)',
  ],
  theoreticalBackground:
    'VCVS: V_out = G × V_control. A dependent-source constraint adds directly into the MNA system as its own auxiliary equation, exactly like an independent voltage source, except the right-hand-side term is proportional to another unknown rather than a constant.',
  suggestedAnalysisMethod: 'nodal',
  schematic: { components: a3Components, wires: a3Wires },
};

export const NODAL_ANALYSIS_EXAMPLES: ExampleDefinition[] = [A1, A2, A3];
