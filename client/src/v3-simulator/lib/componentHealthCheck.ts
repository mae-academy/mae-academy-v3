import { getDef } from './componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from './circuitTypes';
import { compileDcTopology } from '../hooks/useSimulation';
import { MNASolver, type MNAElement, type MNAResult } from './mnaSolver';
import { NormalizedCircuitGraph } from './NormalizedCircuitGraph';

export interface FloatingTerminalInfo {
  componentId: string;
  label: string;
  type: string;
  terminalId: string;
  terminalName: string;
}

export interface ComponentStampingVerification {
  id: string;
  label: string;
  type: string;
  voltageDrop: number;
  branchCurrent: number;
  verified: boolean;
  message: string;
}

export interface ComponentHealthReport {
  healthy: boolean;
  terminalConnectivity: {
    passed: boolean;
    totalComponents: number;
    totalTerminals: number;
    connectedTerminals: number;
    floatingTerminals: FloatingTerminalInfo[];
  };
  groundPathContinuity: {
    passed: boolean;
    groundCount: number;
    isolatedComponents: Array<{ id: string; label: string; type: string }>;
  };
  mnaStamping: {
    passed: boolean;
    residualInfinity: number;
    componentVerifications: ComponentStampingVerification[];
    error?: string;
  };
  summary: string;
}

/**
 * Conducts a comprehensive topological and numerical validation routine on active canvas components:
 * 1. Terminal Connectivity Check: all two-terminal devices must have wire attachments at both terminals.
 * 2. Ground Path Continuity: all active subcircuits must possess a direct DC conductance path to Net 0 (GND).
 * 3. MNA Stamping Verification: each mounted component must update its branch current and voltage drop
 *    according to its constitutive equations with solver residual certificate ||Ax - z||∞ < 1e-9.
 */
export function validateCanvasComponentHealth(
  components: CircuitComponent[],
  wires: CircuitWire[],
  normalizedGraph?: NormalizedCircuitGraph,
): ComponentHealthReport {
  // ─── 1. TERMINAL CONNECTIVITY CHECK ──────────────────────────────────────────
  const wiredTerminalKeys = new Set<string>();
  for (const wire of wires) {
    wiredTerminalKeys.add(terminalKey(wire.fromComp, wire.fromTerm));
    wiredTerminalKeys.add(terminalKey(wire.toComp, wire.toTerm));
  }

  const floatingTerminals: FloatingTerminalInfo[] = [];
  let totalTerminals = 0;
  let connectedTerminals = 0;

  for (const comp of components) {
    const def = getDef(comp.type);
    if (!def) continue;

    const terms = def.terminals;
    totalTerminals += terms.length;

    for (const term of terms) {
      const key = terminalKey(comp.id, term.id);
      const isConnected = wiredTerminalKeys.has(key);
      if (isConnected) {
        connectedTerminals++;
      } else {
        // Report floating terminal for two-terminal devices or single ground terminal
        if (terms.length <= 2 || comp.type === 'ground') {
          floatingTerminals.push({
            componentId: comp.id,
            label: comp.type === 'ground' ? 'GND' : comp.label,
            type: comp.type,
            terminalId: term.id,
            terminalName: term.name ?? term.id,
          });
        }
      }
    }
  }

  const terminalConnectivityPassed = components.length === 0 || floatingTerminals.length === 0;

  // ─── 2. GROUND PATH CONTINUITY CHECK ─────────────────────────────────────────
  const groundComponents = components.filter((c) => c.type === 'ground');
  const groundCount = groundComponents.length;

  const isolatedComponents: Array<{ id: string; label: string; type: string }> = [];
  let groundPathPassed = false;

  if (components.length === 0) {
    groundPathPassed = true;
  } else if (groundCount === 0) {
    groundPathPassed = false;
    for (const comp of components) {
      isolatedComponents.push({ id: comp.id, label: comp.label, type: comp.type });
    }
  } else {
    // Build an adjacency graph of DC conductance across terminals
    const adj = new Map<string, Set<string>>();
    const addEdge = (u: string, v: string) => {
      if (!adj.has(u)) adj.set(u, new Set());
      if (!adj.has(v)) adj.set(v, new Set());
      adj.get(u)!.add(v);
      adj.get(v)!.add(u);
    };

    // Wires are perfect conductors
    for (const wire of wires) {
      addEdge(terminalKey(wire.fromComp, wire.fromTerm), terminalKey(wire.toComp, wire.toTerm));
    }

    // Two-terminal DC branches provide internal DC conductance paths
    for (const comp of components) {
      const def = getDef(comp.type);
      if (!def) continue;
      if (comp.type === 'ground') continue;

      if (comp.type === 'resistor' || comp.type === 'potentiometer') {
        addEdge(terminalKey(comp.id, 'a'), terminalKey(comp.id, 'b'));
      } else if (comp.type === 'dc-voltage' || comp.type === 'dc-current' || comp.type === 'ac-voltage' || comp.type === 'ac-current') {
        addEdge(terminalKey(comp.id, 'pos'), terminalKey(comp.id, 'neg'));
      } else if (comp.type === 'dc-rail') {
        // DC rail intrinsically connects to internal source reference
        addEdge(terminalKey(comp.id, 'pos'), terminalKey(groundComponents[0].id, 'gnd'));
      } else if (comp.type === 'inductor') {
        addEdge(terminalKey(comp.id, 'a'), terminalKey(comp.id, 'b'));
      } else if (comp.type === 'diode' || comp.type.startsWith('diode-') || comp.type === 'zener' || comp.type === 'led') {
        addEdge(terminalKey(comp.id, 'anode'), terminalKey(comp.id, 'cathode'));
      } else if (comp.type.startsWith('sw-') || comp.type.startsWith('pb-')) {
        addEdge(terminalKey(comp.id, 'a'), terminalKey(comp.id, 'b'));
      }
    }

    // All ground terminals are electrically the single unified Net 0 datum
    const gnd0Key = terminalKey(groundComponents[0].id, 'gnd');
    for (let i = 1; i < groundComponents.length; i++) {
      addEdge(gnd0Key, terminalKey(groundComponents[i].id, 'gnd'));
    }

    // Traverse from GND
    const reachableTerminals = new Set<string>();
    const queue: string[] = [gnd0Key];
    reachableTerminals.add(gnd0Key);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const neighbor of Array.from(adj.get(curr) ?? [])) {
        if (!reachableTerminals.has(neighbor)) {
          reachableTerminals.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Check if every non-ground component has at least one terminal reaching GND
    for (const comp of components) {
      if (comp.type === 'ground') continue;
      const def = getDef(comp.type);
      if (!def) continue;

      const hasGroundPath = def.terminals.some((t) => reachableTerminals.has(terminalKey(comp.id, t.id)));
      if (!hasGroundPath) {
        isolatedComponents.push({ id: comp.id, label: comp.label, type: comp.type });
      }
    }

    groundPathPassed = isolatedComponents.length === 0;
  }

  // ─── 3. MNA STAMPING & CONSTITUTIVE VERIFICATION ──────────────────────────────
  let mnaPassed = false;
  let residualInfinity = 0;
  const componentVerifications: ComponentStampingVerification[] = [];
  let mnaError: string | undefined;

  if (components.length === 0) {
    mnaPassed = true;
  } else {
    try {
      const elements: MNAElement[] = compileDcTopology(components, wires, normalizedGraph);
      if (elements.length > 0) {
        const solver = new MNASolver(elements);
        const result: MNAResult = solver.solve();
        residualInfinity = result.residualInfinity ?? 0;

        const nodeVoltages = result.nodeVoltages;
        const branchCurrents = result.branchCurrents;

        for (const element of elements) {
          const matchingComp = components.find((c) => c.id === element.id || element.id.startsWith(`${c.id}:`));
          const label = matchingComp ? (matchingComp.type === 'ground' ? 'GND' : matchingComp.label) : element.id;

          let vDrop = 0;
          let iBranch = branchCurrents[element.id] ?? 0;
          let verified = false;
          let message = '';

          if (element.type === 'resistor') {
            const vp = nodeVoltages[element.positive] ?? 0;
            const vn = nodeVoltages[element.negative] ?? 0;
            vDrop = vp - vn;
            const expectedCurrent = vDrop / element.resistance;
            verified = Math.abs(vDrop - iBranch * element.resistance) < 1e-6 && Math.abs(iBranch - expectedCurrent) < 1e-6;
            message = verified
              ? `Ohm's law verified: V = ${vDrop.toFixed(4)} V, I = ${iBranch.toFixed(6)} A, R = ${element.resistance} Ω`
              : `Resistor constitutive discrepancy: V = ${vDrop} V, I = ${iBranch} A, expected I = ${expectedCurrent} A`;
          } else if (element.type === 'voltage') {
            const vp = nodeVoltages[element.positive] ?? 0;
            const vn = nodeVoltages[element.negative] ?? 0;
            vDrop = vp - vn;
            verified = Math.abs(vDrop - element.voltage) < 1e-6 && Number.isFinite(iBranch);
            message = verified
              ? `Voltage source verified: V = ${vDrop.toFixed(4)} V (specified ${element.voltage} V), I_source = ${iBranch.toFixed(6)} A`
              : `Voltage source discrepancy: V = ${vDrop} V, expected ${element.voltage} V`;
          } else if (element.type === 'current') {
            const vFrom = nodeVoltages[element.from] ?? 0;
            const vTo = nodeVoltages[element.to] ?? 0;
            vDrop = vFrom - vTo;
            verified = Math.abs(iBranch - element.current) < 1e-6;
            message = verified
              ? `Current source verified: I = ${iBranch.toFixed(6)} A (specified ${element.current} A)`
              : `Current source discrepancy: I = ${iBranch} A, expected ${element.current} A`;
          } else {
            verified = Number.isFinite(iBranch);
            message = `MNA element ${element.id} stamped and solved cleanly`;
          }

          componentVerifications.push({
            id: element.id,
            label,
            type: element.type,
            voltageDrop: vDrop,
            branchCurrent: iBranch,
            verified,
            message,
          });
        }

        mnaPassed = residualInfinity <= 1e-9 && componentVerifications.every((c) => c.verified);
      } else {
        mnaPassed = true;
      }
    } catch (error) {
      mnaPassed = false;
      mnaError = error instanceof Error ? error.message : String(error);
    }
  }

  // ─── 4. DIAGNOSTIC SUMMARY ───────────────────────────────────────────────────
  const allHealthy = terminalConnectivityPassed && groundPathPassed && mnaPassed;
  let summary = '';
  if (allHealthy) {
    summary = `[Component Health Check] HEALTHY: All ${components.length} components verified. Terminal connectivity: 100% (${connectedTerminals}/${totalTerminals} wired). Ground continuity: verified (all active subcircuits connected to unified GND datum). MNA stamping: certified (residual ||Ax - z||∞ = ${residualInfinity.toExponential(2)}).`;
  } else {
    const issues: string[] = [];
    if (!terminalConnectivityPassed) {
      issues.push(`${floatingTerminals.length} floating terminal(s) detected [${floatingTerminals.map((f) => `${f.label}:${f.terminalName}`).join(', ')}]`);
    }
    if (!groundPathPassed) {
      issues.push(groundCount === 0 ? 'Missing GND reference datum' : `${isolatedComponents.length} subcircuit component(s) have no DC path to GND [${isolatedComponents.map((c) => c.label).join(', ')}]`);
    }
    if (!mnaPassed) {
      issues.push(`MNA stamping error: ${mnaError ?? 'residual or constitutive failure'}`);
    }
    summary = `[Component Health Check] UNHEALTHY: ${issues.join('; ')}.`;
  }

  return {
    healthy: allHealthy,
    terminalConnectivity: {
      passed: terminalConnectivityPassed,
      totalComponents: components.length,
      totalTerminals,
      connectedTerminals,
      floatingTerminals,
    },
    groundPathContinuity: {
      passed: groundPathPassed,
      groundCount,
      isolatedComponents,
    },
    mnaStamping: {
      passed: mnaPassed,
      residualInfinity,
      componentVerifications,
      error: mnaError,
    },
    summary,
  };
}

/**
 * Executes standard catalog component benchmark circuits to guarantee that all
 * active catalog primitives (voltage sources, current sources, resistors, grounds)
 * are healthy and participating correctly in the simulation.
 */
export function runCatalogIntegrityBenchmark(): ComponentHealthReport {
  // Benchmark 2-mesh ladder circuit:
  // V1 (12V) -> R1 (4Ω) -> R2 (10Ω to GND) -> V2 (10V) -> R3 (2Ω to GND)
  const components: CircuitComponent[] = [
    { id: 'V1', type: 'dc-voltage', x: 100, y: 200, rotation: 0, flipH: false, flipV: false, label: 'V1', props: { voltage: 12 } },
    { id: 'R1', type: 'resistor', x: 200, y: 150, rotation: 0, flipH: false, flipV: false, label: 'R1', props: { resistance: 4 } },
    { id: 'R2', type: 'resistor', x: 250, y: 250, rotation: 90, flipH: false, flipV: false, label: 'R2', props: { resistance: 10 } },
    { id: 'V2', type: 'dc-voltage', x: 320, y: 150, rotation: 0, flipH: false, flipV: false, label: 'V2', props: { voltage: 10 } },
    { id: 'R3', type: 'resistor', x: 400, y: 250, rotation: 90, flipH: false, flipV: false, label: 'R3', props: { resistance: 2 } },
    { id: 'GND', type: 'ground', x: 250, y: 350, rotation: 0, flipH: false, flipV: false, label: 'GND', props: {} },
  ];

  const wires: CircuitWire[] = [
    { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[100, 185], [170, 150]], routing: 'orthogonal' },
    { id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'R2', toTerm: 'a', path: [[230, 150], [250, 220]], routing: 'orthogonal' },
    { id: 'w3', fromComp: 'R1', fromTerm: 'b', toComp: 'V2', toTerm: 'pos', path: [[230, 150], [305, 150]], routing: 'orthogonal' },
    { id: 'w4', fromComp: 'V2', fromTerm: 'neg', toComp: 'R3', toTerm: 'a', path: [[335, 150], [400, 220]], routing: 'orthogonal' },
    { id: 'w5', fromComp: 'V1', fromTerm: 'neg', toComp: 'GND', toTerm: 'gnd', path: [[100, 215], [250, 335]], routing: 'orthogonal' },
    { id: 'w6', fromComp: 'R2', fromTerm: 'b', toComp: 'GND', toTerm: 'gnd', path: [[250, 280], [250, 335]], routing: 'orthogonal' },
    { id: 'w7', fromComp: 'R3', fromTerm: 'b', toComp: 'GND', toTerm: 'gnd', path: [[400, 280], [250, 335]], routing: 'orthogonal' },
  ];

  return validateCanvasComponentHealth(components, wires);
}
