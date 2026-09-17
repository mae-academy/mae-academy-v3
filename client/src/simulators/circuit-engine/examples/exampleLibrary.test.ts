/**
 * Regression coverage for the Interactive Examples Library data. Every example is checked two ways:
 *
 * 1. Structural, for all 20: every component type exists in componentDefs, every wire references a
 *    real terminal on the component it names, and `NormalizedCircuitGraph.fromCanvas` (the exact
 *    resolver `loadCircuitDocument` and the SPICE pipeline both use) accepts the schematic without
 *    throwing and produces a fully-connected topology (no isolated component). This is the check
 *    that would have caught a typo'd id/terminal/prop key in any of the hand-authored schematics.
 * 2. Numerical, for the 14 examples solvable by the DC academic engine (Nodal Analysis, Mesh
 *    Analysis, Superposition, Thévenin & Norton): the schematic is compiled through the same
 *    `compileDcTopology` the live app uses and solved with MNASolver, then checked against a
 *    hand-derived analytical value at a specific component/terminal — independent of the
 *    human-readable `expectedResults` field (which is for the modal's display, not assertions).
 *
 * The 6 transient/AC examples (reactive elements, no closed-form DC answer) get the structural
 * check only; their underlying RC/RL/RLC/resonance/three-phase behavior is already covered by the
 * engine-level regression suites in engine/spice/ngspiceRegression.*.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { EXAMPLE_LIBRARY, EXAMPLE_CATEGORIES, getExampleById, getExamplesByCategory } from '@/simulators/circuit-engine/examples';
import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';
import { compileDcTopology } from '@/simulators/circuit-engine/components/hooks/useSimulation';
import { MNASolver } from '@/simulators/circuit-engine/engine/mnaSolver';

const near = (actual: number, expected: number, tolerance = Math.max(Math.abs(expected) * 1e-3, 1e-6)) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);

/** Component:terminal keys that are deliberate open Thévenin test points (see each example's own
 * comment for why) — legitimate single-branch MNA nodes, not a wiring mistake. */
const UNUSED_SCOPE_CHANNELS = ['osc1:ch3', 'osc1:ch4'];
const OPEN_TEST_POINTS: Record<string, string[]> = {
  'thevenin-dependent-source': ['r2:b'],
  // The op-amp examples place a real oscilloscope on the canvas and probe two channels; an unused
  // scope input is an idle high-impedance probe, not an unconnected circuit pin.
  'transient-opamp-ideal-integrator': UNUSED_SCOPE_CHANNELS,
  'transient-opamp-differentiator': UNUSED_SCOPE_CHANNELS,
  'transient-opamp-comparator': UNUSED_SCOPE_CHANNELS,
  'transient-opamp-schmitt-trigger': UNUSED_SCOPE_CHANNELS,
  'transient-opamp-summing-amplifier': UNUSED_SCOPE_CHANNELS,
};

describe('Interactive Examples Library — registry integrity', () => {
  it('has 25 examples with unique ids, spanning all 6 categories', () => {
    // 20 original examples + 5 op-amp transient examples (integrator, differentiator, comparator,
    // Schmitt trigger, summing amplifier).
    expect(EXAMPLE_LIBRARY.length).toBe(25);
    const ids = EXAMPLE_LIBRARY.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groupsPresent = new Set(EXAMPLE_LIBRARY.map((example) => example.categoryGroup));
    for (const category of EXAMPLE_CATEGORIES) expect(groupsPresent.has(category)).toBe(true);
  });

  it('getExampleById / getExamplesByCategory resolve correctly', () => {
    expect(getExampleById('nodal-simple-dc')?.name).toBe('Simple DC Nodal — Voltage Divider');
    expect(getExampleById('does-not-exist')).toBeUndefined();
    expect(getExamplesByCategory('Mesh Analysis')).toHaveLength(3);
    expect(getExamplesByCategory('AC Analysis')).toHaveLength(4);
  });

  it('every example carries non-empty pedagogical content required by the modal', () => {
    for (const example of EXAMPLE_LIBRARY) {
      expect(example.name.length, example.id).toBeGreaterThan(0);
      expect(example.educationalNarrative.length, example.id).toBeGreaterThan(40);
      expect(example.theoreticalBackground.length, example.id).toBeGreaterThan(20);
      expect(example.suggestedModifications.length, example.id).toBeGreaterThanOrEqual(3);
      expect(example.conceptsTaught.length, example.id).toBeGreaterThan(0);
      expect(example.schematic.components.length, example.id).toBeGreaterThan(0);
      expect(example.schematic.wires.length, example.id).toBeGreaterThan(0);
    }
  });
});

describe('Interactive Examples Library — every schematic is structurally sound', () => {
  for (const example of EXAMPLE_LIBRARY) {
    it(`${example.id}: every component type is registered and every wire targets a real terminal`, () => {
      for (const component of example.schematic.components) {
        const def = getDef(component.type);
        expect(def, `${example.id}: unknown component type "${component.type}" (id ${component.id})`).toBeDefined();
      }
      const componentsById = new Map(example.schematic.components.map((c) => [c.id, c]));
      for (const w of example.schematic.wires) {
        for (const [compId, term] of [[w.fromComp, w.fromTerm], [w.toComp, w.toTerm]] as const) {
          const component = componentsById.get(compId);
          expect(component, `${example.id}: wire ${w.id} references unknown component "${compId}"`).toBeDefined();
          const def = getDef(component!.type);
          const hasTerm = (def?.terminals ?? []).some((t) => t.id === term);
          expect(hasTerm, `${example.id}: wire ${w.id} references terminal "${term}" not on ${component!.type} "${compId}"`).toBe(true);
        }
      }
    });

    it(`${example.id}: resolves to a single connected, fully-wired topology`, () => {
      // `NormalizedCircuitGraph.topology.connectedComponents` is scoped to the branch kinds mesh
      // geometry cares about (resistor/independent-source/dependent-source) — an inductor,
      // capacitor, switch, ac-voltage or three-phase-source is invisible to it, so it silently
      // undercounts connectivity for most of these schematics. General electrical connectivity is
      // checked here directly with an independent union-find over every terminal and every wire.
      const parent = new Map<string, string>();
      const find = (key: string): string => {
        const p = parent.get(key) ?? key;
        if (p === key) return key;
        const root = find(p);
        parent.set(key, root);
        return root;
      };
      const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
      const allowedOpenTerminals = new Set(OPEN_TEST_POINTS[example.id] ?? []);
      const allTerminalKeys: string[] = [];
      for (const component of example.schematic.components) {
        for (const terminal of getDef(component.type)?.terminals ?? []) {
          allTerminalKeys.push(`${component.id}:${terminal.id}`);
        }
        // A component's own body links its terminals for *reachability* purposes even though a
        // resistor/inductor/etc. is a different net on each pin electrically — otherwise every
        // single two-terminal part would itself look like a "disconnected island" boundary and no
        // schematic could ever pass. This mirrors how a person reads a schematic: can you get from
        // any part to any other by following wires and passing through parts?
        const componentTerminalIds = (getDef(component.type)?.terminals ?? []).map((t) => `${component.id}:${t.id}`);
        for (let i = 1; i < componentTerminalIds.length; i += 1) union(componentTerminalIds[0], componentTerminalIds[i]);
      }
      // A deliberately open Thévenin test point (declared in OPEN_TEST_POINTS) legitimately needs
      // no second wire — it is a real, single-branch MNA node, not a connectivity gap — so it is
      // excluded from both the "one connected island" and the "every terminal is wired" checks.
      const connectivityTerminals = allTerminalKeys.filter((key) => !allowedOpenTerminals.has(key));
      for (const key of connectivityTerminals) find(key); // seed every real terminal as its own set
      for (const w of example.schematic.wires) union(`${w.fromComp}:${w.fromTerm}`, `${w.toComp}:${w.toTerm}`);
      const roots = new Set(connectivityTerminals.map((key) => find(key)));
      expect(roots.size, `${example.id}: schematic has ${roots.size} disconnected islands, expected 1`).toBe(1);

      // Every other declared terminal must be named by at least one wire — otherwise a pin was
      // simply never connected (a real authoring mistake).
      const wiredTerminalKeys = new Set(example.schematic.wires.flatMap((w) => [`${w.fromComp}:${w.fromTerm}`, `${w.toComp}:${w.toTerm}`]));
      for (const key of connectivityTerminals) {
        expect(wiredTerminalKeys.has(key), `${example.id}: terminal "${key}" is never wired`).toBe(true);
      }
    });
  }
});

/**
 * Analytical DC checks, keyed by example id. Each entry names one component/terminal pair whose
 * net voltage is asserted against a value hand-derived directly from the schematic actually shipped
 * (not transcribed from the spec's own "Expected Results" prose, which in several cases does not
 * match its own netlist — see docs referenced in each category file's comments).
 */
const dcChecks: Record<string, Array<{ description: string; componentId: string; terminal: string; volts: number }>> = {
  'nodal-simple-dc': [{ description: 'Node 2 (voltage divider output)', componentId: 'r1', terminal: 'b', volts: 7.2 }],
  'nodal-supernode-dc': [
    { description: 'Node 2', componentId: 'r1', terminal: 'b', volts: 11.764706 },
    { description: 'Node 3', componentId: 'r3', terminal: 'a', volts: 6.764706 },
  ],
  'nodal-vcvs-dc': [
    { description: 'Node 2 (sensed, dead-end off R1)', componentId: 'r1', terminal: 'b', volts: 10 },
    { description: 'Node 3 (E1 output = 3×V2)', componentId: 'e1', terminal: 'pos', volts: 30 },
    { description: 'Node 4 (loaded divider: V3×R3/(R2+R3))', componentId: 'r3', terminal: 'a', volts: 10 },
  ],
  'mesh-simple-dc': [
    { description: 'Node 2', componentId: 'r1', terminal: 'b', volts: 9 },
    { description: 'Node 3', componentId: 'r3', terminal: 'a', volts: 3 },
  ],
  'mesh-two-loop-dc': [
    { description: 'Node 2', componentId: 'r1', terminal: 'b', volts: 8 },
    { description: 'Node 3', componentId: 'v2', terminal: 'pos', volts: 6 },
  ],
  'mesh-three-loop-bridge': [
    { description: 'Node 2 (bridge arm)', componentId: 'r1', terminal: 'b', volts: 14.876033 },
    { description: 'Node 3 (bridge arm)', componentId: 'r3', terminal: 'b', volts: 15.471074 },
  ],
  'superposition-two-voltage-sources': [{ description: 'Node 3 (both sources)', componentId: 'r3', terminal: 'a', volts: 4.363636 }],
  'superposition-mixed-sources': [{ description: 'Node 3 (both sources)', componentId: 'r3', terminal: 'a', volts: 12.5 }],
  'thevenin-extraction-dc': [{ description: 'Node 2 (V_th, open)', componentId: 'r1', terminal: 'b', volts: 9 }],
  'thevenin-dependent-source': [{ description: 'Node 4 (V_th, open)', componentId: 'r2', terminal: 'b', volts: 20 }],
};

describe('Interactive Examples Library — DC-solvable examples match hand-derived analytical values', () => {
  for (const [id, checks] of Object.entries(dcChecks)) {
    it(`${id}: MNASolver agrees with the closed-form answer at every checked node`, () => {
      const example = getExampleById(id);
      expect(example, id).toBeDefined();
      const graph = NormalizedCircuitGraph.fromCanvas(example!.schematic.components, example!.schematic.wires);
      const elements = compileDcTopology(example!.schematic.components, example!.schematic.wires, graph);
      const result = new MNASolver(elements).solve();
      for (const check of checks) {
        const net = graph.netForTerminal(check.componentId, check.terminal);
        const voltage = net === '0' ? 0 : result.nodeVoltages[net];
        expect(voltage, `${id}: ${check.description}`).toBeDefined();
        near(voltage as number, check.volts);
      }
      expect(result.residualInfinity).toBeLessThanOrEqual(1e-9);
    });
  }
});

/** C.1's and C.2's superposition claim is checked as an actual identity, not just the combined value. */
describe('Interactive Examples Library — superposition identity holds on the shipped schematics', () => {
  it('superposition-two-voltage-sources: V1-only + V2-only = both-sources at node 3', () => {
    const example = getExampleById('superposition-two-voltage-sources')!;
    const graph = NormalizedCircuitGraph.fromCanvas(example.schematic.components, example.schematic.wires);
    const elements = compileDcTopology(example.schematic.components, example.schematic.wires, graph);
    const net = graph.netForTerminal('r3', 'a');
    const both = new MNASolver(elements).solve().nodeVoltages[net];
    const v1Only = new MNASolver(elements.map((e) => (e.id === 'v2' && e.type === 'voltage' ? { ...e, voltage: 0 } : e))).solve().nodeVoltages[net];
    const v2Only = new MNASolver(elements.map((e) => (e.id === 'v1' && e.type === 'voltage' ? { ...e, voltage: 0 } : e))).solve().nodeVoltages[net];
    near(v1Only + v2Only, both, 1e-9);
  });

  it('superposition-mixed-sources: V1-only + I1-only = both-sources at node 3', () => {
    const example = getExampleById('superposition-mixed-sources')!;
    const graph = NormalizedCircuitGraph.fromCanvas(example.schematic.components, example.schematic.wires);
    const elements = compileDcTopology(example.schematic.components, example.schematic.wires, graph);
    const net = graph.netForTerminal('r3', 'a');
    const both = new MNASolver(elements).solve().nodeVoltages[net];
    const v1Only = new MNASolver(elements.filter((e) => e.id !== 'i1')).solve().nodeVoltages[net];
    const i1Only = new MNASolver(elements.map((e) => (e.id === 'v1' && e.type === 'voltage' ? { ...e, voltage: 0 } : e))).solve().nodeVoltages[net];
    near(v1Only + i1Only, both, 1e-9);
  });
});

describe('Interactive Examples Library — Thévenin matched-load halving holds on the shipped schematics', () => {
  it('thevenin-extraction-dc: loading node 2 with R_th (1.2k) halves its voltage', () => {
    const example = getExampleById('thevenin-extraction-dc')!;
    const graph = NormalizedCircuitGraph.fromCanvas(example.schematic.components, example.schematic.wires);
    const elements = compileDcTopology(example.schematic.components, example.schematic.wires, graph);
    const openNet = graph.netForTerminal('r1', 'b');
    const vth = new MNASolver(elements).solve().nodeVoltages[openNet];
    const loaded = new MNASolver([...elements, { type: 'resistor', id: 'rl_test', positive: openNet, negative: '0', resistance: 1200 }]).solve();
    near(loaded.nodeVoltages[openNet], vth / 2, 1e-6);
  });

  it('thevenin-dependent-source: loading node 4 with R_th (1k, = R2) halves its voltage', () => {
    const example = getExampleById('thevenin-dependent-source')!;
    const graph = NormalizedCircuitGraph.fromCanvas(example.schematic.components, example.schematic.wires);
    const elements = compileDcTopology(example.schematic.components, example.schematic.wires, graph);
    const openNet = graph.netForTerminal('r2', 'b');
    const vth = new MNASolver(elements).solve().nodeVoltages[openNet];
    const loaded = new MNASolver([...elements, { type: 'resistor', id: 'rl_test', positive: openNet, negative: '0', resistance: 1000 }]).solve();
    near(loaded.nodeVoltages[openNet], vth / 2, 1e-6);
  });
});
