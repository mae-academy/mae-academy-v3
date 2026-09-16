import type { ExampleDefinition } from '@/simulators/circuit-engine/examples/types';
import { part, wire } from '@/simulators/circuit-engine/examples/schematicHelpers';

/* C.1 — Superposition: Two Independent Voltage Sources */
const c1Components = [
  part('v1', 'dc-voltage', 180, 150, { voltage: 12 }, { label: 'V1' }),
  part('r1', 'resistor', 380, 150, { resistance: 2000 }, { label: 'R1' }),
  part('v2', 'dc-voltage', 780, 150, { voltage: 6 }, { label: 'V2' }),
  part('r2', 'resistor', 580, 150, { resistance: 3000 }, { label: 'R2' }),
  part('r3', 'resistor', 480, 320, { resistance: 1000 }, { label: 'R3', rotation: 90 }),
  part('g1', 'ground', 480, 460, {}),
];
const c1Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [180, 100], [350, 150]),
  wire('w2', 'r1', 'b', 'r3', 'a', [410, 150], [480, 290]),
  wire('w3', 'v2', 'pos', 'r2', 'b', [780, 100], [610, 150]),
  wire('w4', 'r2', 'a', 'r3', 'a', [550, 150], [480, 290]),
  wire('w5', 'r3', 'b', 'g1', 'gnd', [480, 350], [480, 460]),
  wire('w6', 'v1', 'neg', 'g1', 'gnd', [180, 200], [480, 460]),
  wire('w7', 'v2', 'neg', 'g1', 'gnd', [780, 200], [480, 460]),
];

const C1: ExampleDefinition = {
  id: 'superposition-two-voltage-sources',
  name: 'Superposition — Two Independent Voltage Sources',
  category: 'Superposition / DC',
  categoryGroup: 'Superposition',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Superposition principle', 'Deactivating an ideal voltage source (short it)', 'Linearity'],
  tags: ['dc', 'superposition'],
  spiceNetlist: `* Example: Superposition Principle - DC\n* Purpose: Verify superposition by solving source-by-source\n* Difficulty: Intermediate\n\n.title Superposition - Two Voltage Sources\n\nV1 1 0 DC 12V\nV2 2 0 DC 6V\nR1 1 3 2k\nR2 2 3 3k\nR3 3 0 1k\n\n.dc V1 12 12 1\n.print dc v(3) i(R3)\n.end`,
  schematicAscii: `V1(12V)  V2(6V)\n   |        |\n  R1       R2\n (2kΩ)    (3kΩ)\n   |        |\n   └─ R3 ─┘ (Node 3, 1kΩ to GND)`,
  educationalNarrative:
    'By superposition: (1) solve with V1 alone (V2 shorted to ground), (2) solve with V2 alone (V1 shorted), (3) sum the two node-3 voltages. This mirrors — and gives a numeric proof of — what the Superposition tab in the Academic Analysis Workspace does automatically.',
  expectedResults: {
    nodeVoltages: { 'Node 3 (both sources)': 4.363636, 'Node 3 (V1 only)': 3.272727, 'Node 3 (V2 only)': 1.090909 },
    currents: { 'I(R3), both sources': 0.004363636 },
    notes: ['3.272727 + 1.090909 = 4.363636 V — the superposition identity, exact to machine precision.'],
  },
  suggestedModifications: [
    'Change V1 to 24V and verify superposition still holds (V3 scales proportionally in the V1-only term)',
    'Add a third independent voltage source into node 3',
    'Replace V2 with an equivalent current source and re-apply superposition',
    'Use the two single-source results to derive the Thévenin resistance seen from node 3',
  ],
  theoreticalBackground:
    'In any linear circuit, the response to several independent sources equals the sum of the responses to each source acting alone (all others deactivated: voltage sources shorted, current sources opened). This follows directly from MNA being a linear system. Superposition breaks down for non-linear elements (diodes, transistors).',
  suggestedAnalysisMethod: 'superposition',
  schematic: { components: c1Components, wires: c1Wires },
};

/* C.2 — Superposition with Mixed Sources (Voltage & Current) */
const c2Components = [
  part('v1', 'dc-voltage', 180, 150, { voltage: 20 }, { label: 'V1' }),
  part('r1', 'resistor', 380, 150, { resistance: 1000 }, { label: 'R1' }),
  part('i1', 'dc-current', 780, 150, { current: 0.005 }, { label: 'I1' }),
  part('r2', 'resistor', 580, 150, { resistance: 2000 }, { label: 'R2' }),
  part('r3', 'resistor', 480, 320, { resistance: 1000 }, { label: 'R3', rotation: 90 }),
  part('g1', 'ground', 480, 460, {}),
];
const c2Wires = [
  wire('w1', 'v1', 'pos', 'r1', 'a', [180, 100], [350, 150]),
  wire('w2', 'r1', 'b', 'r3', 'a', [410, 150], [480, 290]),
  // I1's 'pos' pin is where current exits into the circuit (arrow tip): 5 mA leaves I1 and enters
  // node 2 (R2's 'b' side), the only place it can go, then flows node2 -> node3 through R2.
  wire('w3', 'i1', 'pos', 'r2', 'b', [780, 100], [610, 150]),
  wire('w4', 'r2', 'a', 'r3', 'a', [550, 150], [480, 290]),
  wire('w5', 'r3', 'b', 'g1', 'gnd', [480, 350], [480, 460]),
  wire('w6', 'v1', 'neg', 'g1', 'gnd', [180, 200], [480, 460]),
  wire('w7', 'i1', 'neg', 'g1', 'gnd', [780, 200], [480, 460]),
];

const C2: ExampleDefinition = {
  id: 'superposition-mixed-sources',
  name: 'Superposition with Mixed Sources (Voltage & Current)',
  category: 'Superposition / DC',
  categoryGroup: 'Superposition',
  difficulty: 'Intermediate',
  durationMinutes: 8,
  conceptsTaught: ['Superposition with heterogeneous sources', 'Deactivating a current source (open it)'],
  tags: ['dc', 'superposition', 'current-source'],
  spiceNetlist: `* Example: Superposition - Voltage + Current Source\n* Purpose: Extend superposition to heterogeneous sources\n* Difficulty: Intermediate\n\n.title Superposition - Voltage and Current Sources\n\nV1 1 0 DC 20V\nI1 2 0 DC 0.005\nR1 1 3 1k\nR2 2 3 2k\nR3 3 0 1k\n\n.dc V1 20 20 1\n.print dc v(3) i(V1) i(I1)\n.end`,
  schematicAscii: `V1(20V)        I1(5mA)\n   |              →\n  R1            R2\n (1kΩ)         (2kΩ)\n   |              |\n   └─────R3───┘  (Node 3, 1kΩ to GND)`,
  educationalNarrative:
    'Superposition works for mixed source types because the underlying MNA system is linear regardless of source type. Deactivating a voltage source means shorting it; deactivating a current source means opening it (removing the element entirely). Node 2 here is a pure current-forcing dead end off R2 — whatever R2\'s value, all 5 mA from I1 must flow through it into node 3.',
  expectedResults: {
    nodeVoltages: { 'Node 3 (both sources)': 12.5, 'Node 3 (V1 only)': 10, 'Node 3 (I1 only)': 2.5 },
    notes: ['10 + 2.5 = 12.5 V — the superposition identity again.', 'V3 does not depend on R2\'s value: I1 forces exactly 5 mA into node 3 regardless.'],
  },
  suggestedModifications: [
    'Double I1 to 10mA and verify V3 increases by exactly the current-source-only contribution',
    'Change V1 to 30V and verify linear scaling of the voltage-source-only contribution',
    'Add a third source (either type) and re-run superposition with three terms',
    'Replace R3 with another current source (a load) and recompute',
  ],
  theoreticalBackground:
    'Superposition extends unchanged to mixed source types since linearity is a property of the whole system, not any one source. It is the standard tool for building physical intuition before jumping to full MNA, and underlies Thévenin/Norton extraction.',
  suggestedAnalysisMethod: 'superposition',
  schematic: { components: c2Components, wires: c2Wires },
};

export const SUPERPOSITION_EXAMPLES: ExampleDefinition[] = [C1, C2];
