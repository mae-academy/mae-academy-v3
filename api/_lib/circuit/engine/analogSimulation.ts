import { getDef } from '../../../../shared/circuit/componentDefs';
import { manualRelayClosed } from '../../../../shared/circuit/componentInteraction';
import { terminalKey, type CircuitComponent, type CircuitWire, type InstrumentReading, type SimulationSnapshot } from '../../../../shared/circuit/circuitTypes';
import { compileDcTopology, type NetLookup } from './compileDc';
import { SimulationEngine } from './simulation';
import { TabDMnaError, type TabDMnaState, type TabDOperatingPoint, type TabDPrimitive } from './analogDocumentedMna';
import { JUNCTION_GMIN, shockleyCurrent, TabDNewtonMna, type TabDJunction, type TabDNonlinearDevice } from './analogNewtonMna';
import { spectralAbscissa } from './realEigen';
import { toTabDObservableOperatingPoint, type TabDObservableOperatingPoint } from './analogResultAdapter';
import { getBrokenWireIds, isComponentOpen } from '../../../../shared/circuit/brokenBranches';
import { diffCircuit, fingerprintCircuit } from '../../../../shared/circuit/fingerprint';

const THERMAL_VOLTAGE = 0.02585;
/** Base-emitter saturation current of the BJT model (the transport current is β times the base current). */
const BJT_BASE_SATURATION = 1e-15;

/**
 * Reverse current gain β_R that makes the Ebers–Moll model reach the declared V_CE(sat) at the datasheet test
 * condition of forced gain Ic/Ib = 10:  V_CE(sat) = V_T·ln[(1 + 10/β_R)(1 + β_R) / (β_R (1 − 10/β_F))].
 */
function reverseBetaFor(forwardBeta: number, vceSat: number): number {
  const target = Math.exp(Math.max(0.03, Math.min(0.6, vceSat)) / THERMAL_VOLTAGE);
  const drive = Math.max(0.05, 1 - 10 / Math.max(forwardBeta, 10.5));
  const ratio = (betaR: number) => (1 + 10 / betaR) * (1 + betaR) / (betaR * drive);
  let low = 1e-3; let high = 1e2;
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(low * high);
    if (ratio(mid) > target) low = mid; else high = mid;
  }
  return Math.sqrt(low * high);
}

/** JSON-serialisable engine state carried between stateless calls (see `TabDSimulationEngine.exportState`). */
export interface TabDEngineState {
  mna: TabDMnaState;
  modes: Record<string, number>;
  relays: Record<string, boolean>;
  latches: Record<string, boolean>;
  fuses: string[];
  digital: Record<string, number>;
  coilI: Record<string, number>;
  coilOn: Record<string, boolean>;
  acc: number;
  integ: Record<string, Array<[number, number, number]>>;
  disp: Record<string, InstrumentReading>;
  dispAt: number;
  wp: Record<string, number>;
  wpeak: Record<string, number>;
  wpol: Record<string, number>;
  vac: number;
  lwc: Record<string, number>;
  /** Node voltages of the last accepted sub-step: Newton warm start and the prior-step view of digital gates. */
  nodes?: Record<string, number>;
}

/** Saturation state of an op-amp output stage: 0 = linear, +1 / −1 = latched to the positive / negative rail. */
type OpAmpMode = -1 | 0 | 1;

interface OpAmpModel {
  id: string;
  gainId: string;
  internalOut: string;
  out: string;
  reference: string;
  inPositive: string;
  inNegative: string;
  gain: number;
  rail: number;
  /** Read by the output-stage device on every evaluation; set by the piecewise-linear consistency loop. */
  mode: OpAmpMode;
}

/**
 * Trailing ≥ 0.1 s mean / RMS window. Samples are folded into 2 ms buckets ([∫v dt, ∫v² dt, dt]) and a reading integrates whole
 * buckets only — the newest, still-filling one is left out — so nothing is interpolated: the window spans exactly 0.1 s when the
 * step divides 2 ms (50 Hz → 0.4 ms, 60 Hz → ⅓ ms, the 0.5 ms default) and at most one bucket more otherwise. The state is
 * ≤ ~52 triples, small enough to carry between stateless solve calls.
 */
class SignalIntegrator {
  private buckets: Array<[number, number, number]> = [];
  private readonly windowSize = 0.1;
  private readonly bucketWidth = 0.002;
  private readonly tolerance = 1e-9;

  static from(buckets: ReadonlyArray<readonly [number, number, number]>): SignalIntegrator {
    const integrator = new SignalIntegrator();
    integrator.buckets = buckets.filter(bucket => bucket.every(Number.isFinite)).map(bucket => [bucket[0], bucket[1], bucket[2]] as [number, number, number]);
    return integrator;
  }

  toJSON(): Array<[number, number, number]> { return this.buckets.map(bucket => [bucket[0], bucket[1], bucket[2]]); }

  private isFilling(): boolean {
    const last = this.buckets[this.buckets.length - 1];
    return Boolean(last) && last[2] + this.tolerance < this.bucketWidth;
  }

  push(val: number, dt: number) {
    if (this.isFilling()) {
      const last = this.buckets[this.buckets.length - 1];
      last[0] += val * dt; last[1] += val * val * dt; last[2] += dt;
    } else {
      this.buckets.push([val * dt, val * val * dt, dt]);
    }
    // Keep the complete buckets that cover the window (plus the one being filled).
    const complete = this.isFilling() ? this.buckets.length - 1 : this.buckets.length;
    let covered = 0;
    for (let i = complete - 1; i >= 0; i--) {
      covered += this.buckets[i][2];
      if (covered >= this.windowSize - this.tolerance) { if (i > 0) this.buckets = this.buckets.slice(i); break; }
    }
  }

  /** ∫ of v (index 0) or v² (index 1) over the trailing whole-bucket window, with its duration. */
  private integrate(index: 0 | 1): { total: number; sum: number } {
    const complete = this.isFilling() && this.buckets.length > 1 ? this.buckets.length - 1 : this.buckets.length;
    let total = 0; let sum = 0;
    for (let i = complete - 1; i >= 0; i--) {
      total += this.buckets[i][2]; sum += this.buckets[i][index];
      if (total >= this.windowSize - this.tolerance) break;
    }
    return { total, sum };
  }

  getDC(): number {
    if (this.buckets.length === 0) return 0;
    const { total, sum } = this.integrate(0);
    const result = total > 0 ? sum / total : 0;
    return Math.abs(result) < 1e-9 ? 0 : result;
  }

  getAC(): number {
    if (this.buckets.length === 0) return 0;
    const { total, sum } = this.integrate(1);
    return total > 0 ? Math.sqrt(Math.max(0, sum / total)) : 0;
  }
}

/**
 * Dedicated Tab D runtime boundary.
 *
 * Tab D intentionally starts with the same stable UI/runtime contract as Tab B,
 * while keeping later documented-equation additions isolated from Tab B and the
 * archived Tab C bundle.
 */
export class TabDSimulationEngine extends SimulationEngine {
  readonly engineProfile = 'tab-d-documented-mna' as const;
  private tabDComponents: CircuitComponent[] = [];
  private tabDWires: CircuitWire[] = [];
  private netLookup: NetLookup | undefined;
  private readonly documentedMna = new TabDNewtonMna();
  private documentedSnapshot: SimulationSnapshot | null = null;
  private readonly tabDRelayStates = new Map<string, boolean>();
  private readonly tabDPowerLatchStates = new Map<string, boolean>();
  private readonly tabDFuseBlown = new Set<string>();
  private readonly tabDDigitalLevels = new Map<string, number>();
  /** Tracks instantaneous coil branch current (A) across sim steps for RL transient. */
  private readonly tabDCoilCurrents = new Map<string, number>();
  /** True when a coil is currently energized (pulled-in). */
  private readonly tabDCoilEnergized = new Map<string, boolean>();
  private integrators = new Map<string, SignalIntegrator>();
  private displayReadings: Record<string, InstrumentReading> = {};
  private lastDisplayTime = -1;
  private timeAccumulator = 0;
  private lastWireCurrents: Record<string, number> = {};
  /** Node voltages of the last accepted solve: warm start for Newton and the op-amp saturation history. */
  private warmStart: Record<string, number> | undefined;
  /** Per-component wiring fingerprint of the last circuit, used to tell a schematic edit from a different circuit. */
  private circuitFingerprints = new Map<string, string>();
  /** Latched saturation state of every op-amp — the output-stage history that gives a Schmitt trigger its hysteresis. */
  private readonly opampModes = new Map<string, OpAmpMode>();

  override setCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    super.setCircuit(components, wires);
    this.tabDComponents = components.map(component => ({ ...component, props: { ...component.props }, state: component.state ? { ...component.state } : undefined }));
    this.tabDWires = wires.map(wire => ({ ...wire, path: wire.path.map(point => [...point] as [number, number]) }));
    // Schematic edits and switch toggles arrive through setCircuit. Stored energy does not vanish when the netlist changes:
    // I_L(t⁻) = I_L(t⁺) and V_C(t⁻) = V_C(t⁺) for every reactive element that is still the same part wired the same way.
    // A different circuit (fewer than half of the parts unchanged) starts from rest, exactly as before; `reset()` is the
    // explicit way to discharge a circuit.
    const fingerprints = fingerprintCircuit(components, wires);
    const { sameCircuit, unchanged } = diffCircuit(this.circuitFingerprints, fingerprints);
    this.circuitFingerprints = fingerprints;
    if (sameCircuit) {
      this.documentedMna.retainState(unchanged);
    } else {
      this.documentedMna.reset();
      this.warmStart = undefined;
      this.opampModes.clear();
      this.tabDCoilCurrents.clear();
      this.tabDCoilEnergized.clear();
    }
    this.documentedSnapshot = null;
    for (const id of Array.from(this.opampModes.keys())) if (!unchanged.has(id)) this.opampModes.delete(id);
    this.tabDRelayStates.clear();
    this.tabDPowerLatchStates.clear();
    this.tabDFuseBlown.clear();
    this.tabDDigitalLevels.clear();
    for (const id of Array.from(this.tabDCoilCurrents.keys())) if (!unchanged.has(id)) this.tabDCoilCurrents.delete(id);
    for (const id of Array.from(this.tabDCoilEnergized.keys())) if (!unchanged.has(id)) this.tabDCoilEnergized.delete(id);
    this.integrators.clear();
    this.displayReadings = {};
    this.lastDisplayTime = -1;
    this.timeAccumulator = 0;
    this.wirePhases.clear();
    this.visualAcTime = 0;
    this.wirePeakCurrents.clear();
    this.wirePolarities.clear();
    this.lastWireCurrents = {};
  }

  /**
   * Everything that must survive between two calls when the engine runs on a stateless host, as plain JSON: reactive history,
   * op-amp latches, relay / latch / fuse / digital state, coil currents, the sub-step accumulator, instrument windows and the
   * carried wire-animation state. The host echoes it back verbatim with the next request.
   */
  exportState(): TabDEngineState {
    const state: TabDEngineState = {
      mna: this.documentedMna.exportState(),
      modes: Object.fromEntries(this.opampModes),
      relays: Object.fromEntries(this.tabDRelayStates),
      latches: Object.fromEntries(this.tabDPowerLatchStates),
      fuses: Array.from(this.tabDFuseBlown),
      digital: Object.fromEntries(this.tabDDigitalLevels),
      coilI: Object.fromEntries(this.tabDCoilCurrents),
      coilOn: Object.fromEntries(this.tabDCoilEnergized),
      acc: this.timeAccumulator,
      integ: Object.fromEntries(Array.from(this.integrators, ([id, integrator]) => [id, integrator.toJSON()])),
      disp: this.displayReadings,
      dispAt: this.lastDisplayTime,
      wp: Object.fromEntries(this.wirePhases),
      wpeak: Object.fromEntries(this.wirePeakCurrents),
      wpol: Object.fromEntries(this.wirePolarities),
      vac: this.visualAcTime,
      lwc: this.lastWireCurrents,
    };
    if (this.warmStart) state.nodes = this.warmStart;
    return state;
  }

  /**
   * Restores state produced by `exportState()` after `setCircuit()`. With `retain`, the call is the first one after a schematic
   * edit: only reactive history, coil currents and op-amp latches of the listed (unchanged) parts survive, exactly as
   * `setCircuit()` does in-process; the rest of the dynamic state starts clean.
   */
  importState(state: TabDEngineState, retain?: ReadonlySet<string>) {
    const keep = (id: string) => !retain || retain.has(id) || Array.from(retain).some(part => id.startsWith(`${part}:`));
    this.documentedMna.importState(state.mna, retain ? keep : undefined);
    this.opampModes.clear();
    for (const [id, mode] of Object.entries(state.modes)) if (keep(id) && (mode === -1 || mode === 0 || mode === 1)) this.opampModes.set(id, mode);
    this.tabDCoilCurrents.clear(); this.tabDCoilEnergized.clear();
    for (const [id, value] of Object.entries(state.coilI)) if (keep(id)) this.tabDCoilCurrents.set(id, value);
    for (const [id, value] of Object.entries(state.coilOn)) if (keep(id)) this.tabDCoilEnergized.set(id, value);
    this.warmStart = state.nodes ? { ...state.nodes } : undefined;
    if (retain) { this.documentedSnapshot = null; return; }
    for (const [id, value] of Object.entries(state.relays)) this.tabDRelayStates.set(id, value);
    for (const [id, value] of Object.entries(state.latches)) this.tabDPowerLatchStates.set(id, value);
    for (const id of state.fuses) this.tabDFuseBlown.add(id);
    for (const [id, value] of Object.entries(state.digital)) this.tabDDigitalLevels.set(id, value);
    this.timeAccumulator = state.acc;
    for (const [id, buckets] of Object.entries(state.integ)) this.integrators.set(id, SignalIntegrator.from(buckets));
    this.displayReadings = state.disp;
    this.lastDisplayTime = state.dispAt;
    for (const [id, value] of Object.entries(state.wp)) this.wirePhases.set(id, value);
    for (const [id, value] of Object.entries(state.wpeak)) this.wirePeakCurrents.set(id, value);
    for (const [id, value] of Object.entries(state.wpol)) this.wirePolarities.set(id, value);
    this.visualAcTime = state.vac;
    this.lastWireCurrents = { ...state.lwc };
    this.documentedSnapshot = state.nodes ? {
      time: this.documentedMna.getTime(), nodeVoltages: { ...state.nodes }, terminalVoltages: {}, branchCurrents: {}, wireCurrents: { ...state.lwc },
      componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: state.disp, warnings: [], converged: true,
    } : null;
  }

  override reset() {
    super.reset();
    this.warmStart = undefined;
    this.opampModes.clear();
    this.circuitFingerprints.clear();
    this.documentedMna.reset();
    this.documentedSnapshot = null;
    this.tabDRelayStates.clear();
    this.tabDPowerLatchStates.clear();
    this.tabDFuseBlown.clear();
    this.tabDDigitalLevels.clear();
    this.tabDCoilCurrents.clear();
    this.tabDCoilEnergized.clear();
    this.integrators.clear();
    this.displayReadings = {};
    this.lastDisplayTime = -1;
    this.timeAccumulator = 0;
    this.wirePhases.clear();
    this.visualAcTime = 0;
    this.wirePeakCurrents.clear();
    this.wirePolarities.clear();
    this.lastWireCurrents = {};
  }

  override getSnapshot(): SimulationSnapshot {
    return this.documentedSnapshot ?? super.getSnapshot();
  }

  override getTime() {
    return this.documentedSnapshot?.time ?? super.getTime();
  }

  /** Exposes a guarded Tab D observation payload for instruments and analysis extensions. */
  getObservableOperatingPoint(): TabDObservableOperatingPoint {
    return toTabDObservableOperatingPoint(this.getSnapshot());
  }

  /** Fixed integration step: 0.5 ms, or 50 samples per cycle of the fastest AC source, whichever is shorter. */
  fixedStep(): number {
    const highestFrequency = this.tabDComponents.reduce((highest, component) => {
      if (['ac-voltage', 'ac-current', 'three-phase-source', 'three-phase-rail'].includes(component.type)) {
        return Math.max(highest, Number(component.props.frequency) || 0);
      }
      return highest;
    }, 0);
    let baseDt = 0.0005; // 2000 Hz base resolution
    if (highestFrequency > 0) {
      const requiredDt = 1 / (highestFrequency * 50); // Minimum 50 samples per cycle
      if (requiredDt < baseDt) baseDt = requiredDt;
    }
    return baseDt;
  }

  /** Supplies the electrical nets (terminal → node) explicitly instead of deriving them from the wires. */
  setNets(lookup: NetLookup | undefined) { this.netLookup = lookup; }

  override step(elapsedSeconds = 1 / 1000): SimulationSnapshot {
    try {
      const baseDt = this.fixedStep();
      const fixedDt = baseDt;

      // Accumulate real-world elapsed time (cap at 0.1s to prevent death spiral)
      this.timeAccumulator += Math.max(1e-6, Math.min(0.1, elapsedSeconds));

      let finalResult: any = null;
      let finalTerminalVoltages: any = {};
      let finalBranchCurrents: any = {};
      let finalWiredTerminals = new Set<string>();
      let finalWireCurrents: Record<string, number> = {};
      let stepped = false;

      while (this.timeAccumulator >= fixedDt) {
        this.timeAccumulator -= fixedDt;
        stepped = true;

        const compiled = this.compileDocumentedPrimitives(fixedDt);
        if (!compiled) return super.step(elapsedSeconds);
        finalWiredTerminals = compiled.wiredTerminals;

        const initialGuess = this.warmStart ?? (this.documentedSnapshot?.converged ? this.documentedSnapshot.nodeVoltages : undefined);
        const result = this.solveOperatingPoint(compiled, fixedDt, initialGuess);
        this.warmStart = result.nodeVoltages;

        const branchCurrents = {
          ...result.branchCurrents,
          ...Object.fromEntries(compiled.nonlinear.map(device => [device.id, device.current(result.nodeVoltages)])),
        };
        for (const comp of this.tabDComponents) {
          if (comp.state?.isBurned) {
            branchCurrents[comp.id] = 0;
            branchCurrents[`${comp.id}:1`] = 0;
            branchCurrents[`${comp.id}:2`] = 0;
            branchCurrents[`${comp.id}:3`] = 0;
            branchCurrents[`${comp.id}:12`] = 0;
            branchCurrents[`${comp.id}:23`] = 0;
            branchCurrents[`${comp.id}:31`] = 0;
            branchCurrents[`${comp.id}:a`] = 0;
            branchCurrents[`${comp.id}:b`] = 0;
            branchCurrents[`${comp.id}:coil`] = 0;
            branchCurrents[`${comp.id}:no`] = 0;
            branchCurrents[`${comp.id}:nc`] = 0;
            branchCurrents[`${comp.id}:secondary`] = 0;
            branchCurrents[`${comp.id}:top`] = 0;
          }
        }
        compiled.commit(result.nodeVoltages, branchCurrents, fixedDt);
        const terminalVoltages = this.terminalVoltages(compiled.netForTerminal, result.nodeVoltages);

        finalResult = result;
        finalTerminalVoltages = terminalVoltages;
        finalBranchCurrents = branchCurrents;

        // Compute terminal currents dictionary for all components
        const terminalCurrentMap: Record<string, number> = {};
        for (const comp of this.tabDComponents) {
          if (comp.state?.isBurned) {
            for (const terminal of getDef(comp.type)?.terminals ?? []) {
              terminalCurrentMap[terminalKey(comp.id, terminal.id)] = 0;
            }
            continue;
          }
          const bI = branchCurrents[comp.id] ?? 0;
          if (comp.type === 'resistor' || comp.type === 'lamp') {
            terminalCurrentMap[terminalKey(comp.id, 'a')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'b')] = -bI;
          } else if (comp.type === 'potentiometer') {
            const iA = branchCurrents[`${comp.id}:a`] ?? 0;
            const iB = branchCurrents[`${comp.id}:b`] ?? 0;
            terminalCurrentMap[terminalKey(comp.id, 'a')] = iA;
            terminalCurrentMap[terminalKey(comp.id, 't1')] = iA;
            terminalCurrentMap[terminalKey(comp.id, 'b')] = -iB;
            terminalCurrentMap[terminalKey(comp.id, 't2')] = -iB;
            terminalCurrentMap[terminalKey(comp.id, 'wiper')] = -iA + iB;
          } else if (comp.type === 'capacitor' || comp.type === 'inductor' || comp.type === 'impedance') {
            terminalCurrentMap[terminalKey(comp.id, 'a')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'b')] = -bI;
          } else if (comp.type === 'transformer' || comp.type === 'transformer-ct') {
            const priI = branchCurrents[comp.id] ?? 0;
            const secI = branchCurrents[`${comp.id}:secondary`] ?? branchCurrents[`${comp.id}:top`] ?? 0;
            terminalCurrentMap[terminalKey(comp.id, 'p1')] = priI;
            terminalCurrentMap[terminalKey(comp.id, 'p2')] = -priI;
            terminalCurrentMap[terminalKey(comp.id, 's1')] = secI;
            terminalCurrentMap[terminalKey(comp.id, 's2')] = -secI;
          } else if (comp.type === 'voltmeter' || comp.type === 'ammeter' || comp.type === 'dmm') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'neg')] = -bI;
            terminalCurrentMap[terminalKey(comp.id, 'hi')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'com')] = -bI;
          } else if (comp.type === 'ac-voltage' || comp.type === 'dc-voltage') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'neg')] = -bI;
          } else if (comp.type === 'dc-rail') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = bI;
          } else if (comp.type === 'dc-current' || comp.type === 'ac-current') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = -bI;
            terminalCurrentMap[terminalKey(comp.id, 'neg')] = bI;
          } else if (['diode', 'diode-silicon', 'diode-germanium', 'diode-gaas', 'led', 'zener', 'photodiode'].includes(comp.type)) {
            terminalCurrentMap[terminalKey(comp.id, 'anode')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'cathode')] = -bI;
          } else if (['sw-spst-no', 'sw-spst-nc', 'pb-no', 'pb-nc', 'circuit-breaker', 'fuse'].includes(comp.type)) {
            terminalCurrentMap[terminalKey(comp.id, 'a')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'b')] = -bI;
          } else if (comp.type === 'coil') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'neg')] = -bI;
          } else if (comp.type === 'motor-dc') {
            terminalCurrentMap[terminalKey(comp.id, 'pos')] = bI;
            terminalCurrentMap[terminalKey(comp.id, 'neg')] = -bI;
          } else if (comp.type === 'relay-spst') {
            const coilI = branchCurrents[`${comp.id}:coil`] ?? 0;
            const swI = branchCurrents[comp.id] ?? 0;
            terminalCurrentMap[terminalKey(comp.id, 'coil+')] = coilI;
            terminalCurrentMap[terminalKey(comp.id, 'coil-')] = -coilI;
            terminalCurrentMap[terminalKey(comp.id, 'com')] = swI;
            terminalCurrentMap[terminalKey(comp.id, 'no')] = -swI;
          } else if (comp.type === 'relay-spdt') {
            const coilI = branchCurrents[`${comp.id}:coil`] ?? 0;
            const noI = branchCurrents[`${comp.id}:no`] ?? 0;
            const ncI = branchCurrents[`${comp.id}:nc`] ?? 0;
            terminalCurrentMap[terminalKey(comp.id, 'coil+')] = coilI;
            terminalCurrentMap[terminalKey(comp.id, 'coil-')] = -coilI;
            terminalCurrentMap[terminalKey(comp.id, 'com')] = noI + ncI;
            terminalCurrentMap[terminalKey(comp.id, 'no')] = -noI;
            terminalCurrentMap[terminalKey(comp.id, 'nc')] = -ncI;
          } else {
            const def = getDef(comp.type);
            if (def && def.terminals.length === 2) {
              terminalCurrentMap[terminalKey(comp.id, def.terminals[0].id)] = bI;
              terminalCurrentMap[terminalKey(comp.id, def.terminals[1].id)] = -bI;
            }
          }
        }

        // Map degrees (number of wires connected to each terminal)
        const terminalWireCount: Record<string, number> = {};
        for (const wire of this.tabDWires) {
          const fromKey = terminalKey(wire.fromComp, wire.fromTerm);
          const toKey = terminalKey(wire.toComp, wire.toTerm);
          terminalWireCount[fromKey] = (terminalWireCount[fromKey] ?? 0) + 1;
          terminalWireCount[toKey] = (terminalWireCount[toKey] ?? 0) + 1;
        }

        // Pass 1: Resolve physical wire currents with strict series continuity and open-circuit isolation
        const subStepWireCurrents: Record<string, number> = {};
        const brokenWireIds = getBrokenWireIds(this.tabDComponents, this.tabDWires);
        let maxAbsWireCurrent = 0;

        for (const wire of this.tabDWires) {
          const fromKey = terminalKey(wire.fromComp, wire.fromTerm);
          const toKey = terminalKey(wire.toComp, wire.toTerm);

          const fromI = terminalCurrentMap[fromKey];
          const toI = terminalCurrentMap[toKey];

          const wiresAtFrom = terminalWireCount[fromKey] ?? 0;
          const wiresAtTo = terminalWireCount[toKey] ?? 0;

          const fromCompObj = this.tabDComponents.find(c => c.id === wire.fromComp);
          const toCompObj = this.tabDComponents.find(c => c.id === wire.toComp);
          const fromIsCurrent = fromCompObj && (fromCompObj.type === 'dc-current' || fromCompObj.type === 'ac-current');
          const toIsCurrent = toCompObj && (toCompObj.type === 'dc-current' || toCompObj.type === 'ac-current');

          let wireI = 0;
          if (fromIsCurrent || toIsCurrent) {
            if (fromIsCurrent) {
              const srcI = fromI !== undefined ? -fromI : 0;
              wireI = wire.fromTerm === 'pos' ? srcI : -srcI;
            } else if (toIsCurrent) {
              const srcI = toI !== undefined ? toI : 0;
              wireI = wire.toTerm === 'pos' ? -srcI : srcI;
            }
          } else if (wiresAtTo === 1 && toI !== undefined && wiresAtFrom !== 1) {
            wireI = toI;
          } else if (wiresAtFrom === 1 && fromI !== undefined && wiresAtTo !== 1) {
            wireI = -fromI;
          } else if (wiresAtFrom === 1 && wiresAtTo === 1) {
            if (toI !== undefined && Math.abs(toI) > 1e-12) {
              wireI = toI;
            } else if (fromI !== undefined && Math.abs(fromI) > 1e-12) {
              wireI = -fromI;
            }
          } else {
            if (toI !== undefined && Math.abs(toI) > 1e-12) {
              wireI = toI;
            } else if (fromI !== undefined && Math.abs(fromI) > 1e-12) {
              wireI = -fromI;
            } else {
              const cFrom = this.tabDComponents.find(c => c.id === wire.fromComp);
              const cTo = this.tabDComponents.find(c => c.id === wire.toComp);
              const i1 = cFrom ? (branchCurrents[cFrom.id] ?? branchCurrents[`${cFrom.id}:secondary`]) : undefined;
              const i2 = cTo ? (branchCurrents[cTo.id] ?? branchCurrents[`${cTo.id}:secondary`]) : undefined;
              wireI = i1 !== undefined && Math.abs(i1) > 1e-12 ? i1 : (i2 !== undefined ? i2 : 0);
            }
          }

          // Strict cutoff for open-circuit, disconnected, or negligible leakage current (< 100 nA)
          if (brokenWireIds.has(wire.id) || Math.abs(wireI) < 1e-7) {
            wireI = 0;
          }

          subStepWireCurrents[wire.id] = wireI;
          finalWireCurrents[wire.id] = wireI;

          const absI = Math.abs(wireI);
          if (absI > maxAbsWireCurrent) {
            maxAbsWireCurrent = absI;
          }
        }

        // Pass 2: Calculate smooth relative speed and integrate phase
        const acSource = this.tabDComponents.find((c) => ['ac-voltage', 'ac-current', 'three-phase-source', 'three-phase-rail'].includes(c.type));
        const isAcCircuit = Boolean(acSource);

        if (isAcCircuit && acSource) {
          const waveformKind = String(acSource.props?.waveform ?? 'sine').toLowerCase();
          const sourceFreq = Math.max(0.001, Number(acSource.props?.frequency ?? 60));
          const phaseDeg = Number(acSource.props?.phase ?? 0);
          const sourcePhaseRad = (phaseDeg * Math.PI) / 180;
          const fVis = Math.min(Math.max(0.2, sourceFreq), 1.0);

          this.visualAcTime += fixedDt;
          const visualAngle = 2 * Math.PI * fVis * this.visualAcTime + sourcePhaseRad;
          const cycle = ((visualAngle / (2 * Math.PI)) % 1 + 1) % 1;

          // Visual oscillation amplitude along the wire (0.45 cycles ~ 32.4px peak-to-peak stroke length)
          const A = 0.45;
          let vNorm = 0;
          if (waveformKind === 'triangle') {
            // Triangle Wave: constant speed in one direction, instantaneous velocity reversal at peaks, constant speed back
            const vTri = 4 * A * fVis;
            vNorm = cycle < 0.5 ? vTri : -vTri;
          } else if (waveformKind === 'square') {
            // Square Wave: constant velocity, hold, then switch direction sharply with a short pulse transition
            const alpha = 0.25;
            const vSq = (4 * A * fVis) / alpha;
            if (cycle < 0.5) {
              vNorm = cycle < 0.5 * alpha ? vSq : 0;
            } else {
              vNorm = (cycle - 0.5) < 0.5 * alpha ? -vSq : 0;
            }
          } else if (waveformKind === 'sawtooth') {
            const vFwd = (2 * A * fVis) / 0.8;
            const vRev = -(2 * A * fVis) / 0.2;
            vNorm = cycle < 0.8 ? vFwd : vRev;
          } else {
            // Sine Wave: smooth sinusoidal acceleration/deceleration v(t) = v_max * sin(wt + phi)
            // Decelerates smoothly, momentarily freezes at zero-crossings, smoothly accelerates in reverse
            const vMax = 2 * Math.PI * fVis * A;
            vNorm = vMax * Math.sin(visualAngle);
          }

          let maxWirePeak = 0;
          for (const wire of this.tabDWires) {
            const currentAbs = Math.abs(subStepWireCurrents[wire.id] ?? 0);
            const prevPeak = this.wirePeakCurrents.get(wire.id) ?? 0;
            const newPeak = Math.max(currentAbs, prevPeak * Math.exp(-fixedDt / 0.5));
            this.wirePeakCurrents.set(wire.id, newPeak);
            if (newPeak > maxWirePeak) maxWirePeak = newPeak;

            const sourceAngle = 2 * Math.PI * sourceFreq * this.documentedMna.getTime() + sourcePhaseRad;
            const isSourcePos = Math.sin(sourceAngle) >= 0;
            const topologicalSign = isSourcePos ? Math.sign(subStepWireCurrents[wire.id] ?? 0) : -Math.sign(subStepWireCurrents[wire.id] ?? 0);
            if (!this.wirePolarities.has(wire.id) && currentAbs > 1e-6) {
              this.wirePolarities.set(wire.id, topologicalSign || 1);
            }
          }

          for (const wire of this.tabDWires) {
            const wireI = subStepWireCurrents[wire.id] ?? 0;
            const currentPhase = this.wirePhases.get(wire.id) ?? 0;
            const peakI = this.wirePeakCurrents.get(wire.id) ?? 0;
            const wirePolarity = this.wirePolarities.get(wire.id) ?? (wireI >= 0 ? 1 : -1);

            if (brokenWireIds.has(wire.id) || peakI < 1e-7 || maxWirePeak < 1e-7) {
              this.wirePhases.delete(wire.id);
            } else {
              const relativeRatio = Math.min(1, Math.max(0, peakI / maxWirePeak));
              const speedScale = Math.pow(relativeRatio, 0.4);
              const phaseRate = wirePolarity * speedScale * vNorm;
              this.wirePhases.set(wire.id, currentPhase + phaseRate * fixedDt);
            }
          }
        } else {
          const V_BASE = 2.5;
          const V_TOP = 8.0;
          for (const wire of this.tabDWires) {
            const wireI = subStepWireCurrents[wire.id] ?? 0;
            const currentPhase = this.wirePhases.get(wire.id) ?? 0;

            if (brokenWireIds.has(wire.id) || Math.abs(wireI) < 1e-7 || maxAbsWireCurrent < 1e-7) {
              // Zero current / open circuit: instantly delete particle phase so electrons disappear immediately
              this.wirePhases.delete(wire.id);
            } else {
              const relativeRatio = Math.min(1, Math.max(0, Math.abs(wireI) / maxAbsWireCurrent));
              const speed = V_BASE + (V_TOP - V_BASE) * Math.pow(relativeRatio, 0.35);
              const phaseRate = Math.sign(wireI) * speed;
              this.wirePhases.set(wire.id, currentPhase + phaseRate * fixedDt);
            }
          }
        }

        for (const component of this.tabDComponents) {
          if (component.type === 'voltmeter' || component.type === 'ammeter' || component.type === 'dmm') {
            let instVal = 0;
            if (component.type === 'voltmeter') {
              instVal = (terminalVoltages[terminalKey(component.id, 'pos')] ?? 0) - (terminalVoltages[terminalKey(component.id, 'neg')] ?? 0);
            } else if (component.type === 'ammeter') {
              instVal = branchCurrents[component.id] ?? 0;
            } else if (component.type === 'dmm') {
              const compTerminals: { id: string }[] = (component as any).terminals ?? getDef(component.type)?.terminals ?? [];
              const pTerm = compTerminals.find(t => t.id === 'pos' || t.id === 'hi')?.id ?? 'pos';
              const nTerm = compTerminals.find(t => t.id === 'neg' || t.id === 'com')?.id ?? 'neg';
              const mode = String(component.props.mode ?? 'DCV').toUpperCase().trim();
              if (mode.includes('V') || mode === 'HZ' || mode === 'OHM' || mode === 'CONT') {
                instVal = (terminalVoltages[terminalKey(component.id, pTerm)] ?? 0) - (terminalVoltages[terminalKey(component.id, nTerm)] ?? 0);
              } else if (mode.includes('A')) {
                instVal = branchCurrents[component.id] ?? 0;
              }
            }

            let integrator = this.integrators.get(component.id);
            if (!integrator) {
              integrator = new SignalIntegrator();
              this.integrators.set(component.id, integrator);
            }
            integrator.push(instVal, fixedDt); // Uniform dt guarantees 0 drift
          }
        }
      }

      if (!stepped) {
        if (this.documentedSnapshot) {
          return {
            ...this.documentedSnapshot,
            wireCurrents: this.lastWireCurrents,
            wirePhases: Object.fromEntries(this.wirePhases),
          };
        }
        const fallback = super.step(elapsedSeconds);
        return {
          ...fallback,
          wireCurrents: this.lastWireCurrents,
          wirePhases: Object.fromEntries(this.wirePhases),
        };
      }

      // Ensure wireCurrents is always populated
      const wireCurrentsOut = Object.keys(finalWireCurrents).length > 0 ? finalWireCurrents : (this.documentedSnapshot?.wireCurrents ?? {});
      this.lastWireCurrents = { ...wireCurrentsOut };

      const instrumentReadings = this.instrumentReadings(finalTerminalVoltages, finalBranchCurrents, finalWiredTerminals, finalResult.time);

      this.documentedSnapshot = {
        time: finalResult.time,
        nodeVoltages: finalResult.nodeVoltages,
        terminalVoltages: finalTerminalVoltages,
        branchCurrents: finalBranchCurrents,
        wireCurrents: wireCurrentsOut,
        wirePhases: Object.fromEntries(this.wirePhases),
        componentPowered: Object.fromEntries(this.tabDComponents.map(component => {
          if (component.state?.isBurned) {
            return [component.id, false];
          }
          if (['relay-spst', 'relay-spdt', 'relay-dpst', 'contactor'].includes(component.type)) {
            return [component.id, Boolean(this.tabDRelayStates.get(component.id))];
          }
          if (component.type === 'coil') {
            // Expose energization state so CoilSymbol receives powered=true when pulled-in
            return [component.id, Boolean(this.tabDCoilEnergized.get(component.id))];
          }
          return [component.id, Math.abs(finalBranchCurrents[component.id] ?? 0) > 1e-10];
        })),
        componentIntensity: {},
        nodeHistory: {},
        branchHistory: {},
        instrumentReadings,
        warnings: [],
        converged: finalResult.converged,
      };
      return this.documentedSnapshot;
    } catch (error) {
      this.warmStart = undefined;
      const errorMessage = error instanceof TabDMnaError ? error.message : error instanceof Error ? error.message : String(error);
      this.documentedSnapshot = {
        time: this.documentedMna.getTime(),
        nodeVoltages: {}, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {},
        warnings: [{ code: 'TAB_D_MNA', message: errorMessage }],
        converged: false,
      };
      return this.documentedSnapshot;
    }
  }

  /**
   * Solves one fixed step. Each op-amp is piecewise linear: linear inside its supply window, or latched to a rail. Newton
   * runs with the modes frozen (smooth equations, no bang-bang between flat clamp tangents) and an outer loop moves any
   * op-amp whose solution contradicts its mode (linear but |A·Vd| beyond a rail; latched but A·Vd no longer pushing
   * that way). Modes persist between steps, so a latched output stays latched while the input is inside the hysteresis
   * window — and at power-up (no history) a linear equilibrium that is unstable under net positive feedback is latched
   * to the rail the output would physically run to, starting from 0 V.
   */
  private solveOperatingPoint(compiled: NonNullable<ReturnType<TabDSimulationEngine['compileDocumentedPrimitives']>>, dt: number, guess?: Record<string, number>): TabDOperatingPoint {
    const { primitives, nonlinear, opamps } = compiled;
    if (!opamps.length) return this.documentedMna.solve(primitives, nonlinear, dt, { initialGuess: guess });

    const solveModes = (start?: Record<string, number>) => this.documentedMna.solve(primitives, nonlinear, dt, { initialGuess: start, commit: false });
    const pattern = () => opamps.map(op => op.mode).join(',');
    const seen = new Set<string>();
    let probe = solveModes(guess);
    for (let round = 0; round < 12 + 2 * opamps.length; round += 1) {
      seen.add(pattern());
      let changed = false;
      for (const op of opamps) {
        const drive = (probe.nodeVoltages[op.internalOut] ?? 0) - (probe.nodeVoltages[op.reference] ?? 0);
        const wanted: OpAmpMode = drive > op.rail ? 1 : drive < -op.rail ? -1 : 0;
        if (wanted !== op.mode) { op.mode = wanted; changed = true; }
      }
      if (!changed && !guess) {
        // Power-up: test the consistent linear set for an unstable (positive-feedback) equilibrium.
        const latch = this.findUnstableOpAmp(opamps, probe, dt);
        if (latch) { latch.op.mode = latch.direction; changed = true; }
      }
      if (!changed) break;
      if (seen.has(pattern())) break; // limit cycle between mode sets: keep the last one
      probe = solveModes(probe.nodeVoltages);
    }
    for (const op of opamps) this.opampModes.set(op.id, op.mode);
    return this.documentedMna.commit(probe, dt);
  }

  /** The linear-region op-amp that sits on an unstable DC equilibrium of the tangent circuit, with the rail it should latch to. */
  private findUnstableOpAmp(opamps: OpAmpModel[], point: TabDOperatingPoint, dt: number): { op: OpAmpModel; direction: 1 | -1 } | null {
    const tangent = point.tangent;
    if (!tangent) return null;
    const linear = opamps.filter(op => op.mode === 0);
    if (!linear.length) return null;
    const gainIds = new Set(opamps.map(op => op.gainId));
    const passive = tangent.filter(primitive => !gainIds.has(primitive.id));
    const differential = (drive: number) => {
      const solved = this.documentedMna.solveTangent([
        ...passive,
        ...opamps.map((op, index) => ({ kind: 'voltage' as const, id: op.gainId, positive: op.internalOut, negative: op.reference, voltage: index === drive ? 1 : 0 })),
      ], dt);
      return opamps.map(op => (solved.nodeVoltages[op.inPositive] ?? 0) - (solved.nodeVoltages[op.inNegative] ?? 0));
    };
    let baseline: number[];
    let columns: number[][];
    try { baseline = differential(-1); columns = opamps.map((_, index) => differential(index)); } catch (error) { if (error instanceof TabDMnaError) return null; throw error; }
    // H[k][j] = ∂(V₊−V₋)_k / ∂(internal output of op-amp j). With the lag τ·v̇ = A·Vd − v the equilibrium is stable iff every
    // eigenvalue of H − I/A has a negative real part; a latched output stage ignores its gain node, so its column of H is 0.
    const h = opamps.map((_, k) => opamps.map((__, j) => columns[j][k] - baseline[k]));
    const minGain = Math.min(...opamps.map(op => op.gain));
    const shifted = h.map((row, k) => row.map((value, j) => value - (k === j ? 1 / minGain : 0)));
    if (!(spectralAbscissa(shifted) > 0)) return null;
    // Latch the linear-region op-amp with the strongest self-loop (most positive feedback).
    let best = -1; let bestLoop = 0;
    opamps.forEach((op, k) => { if (op.mode === 0 && h[k][k] > bestLoop) { bestLoop = h[k][k]; best = k; } });
    if (best < 0) return null;
    const op = opamps[best];
    // Starting from 0 V the output moves away from the equilibrium it cannot hold.
    const equilibrium = (point.nodeVoltages[op.out] ?? 0) - (point.nodeVoltages[op.reference] ?? 0);
    return { op, direction: equilibrium > 0 ? -1 : 1 };
  }

  private lastFixedDt = 0.0005;

  private compileDocumentedPrimitives(dt = this.lastFixedDt): { primitives: TabDPrimitive[]; nonlinear: TabDNonlinearDevice[]; netForTerminal: (componentId: string, terminalId: string) => string; wiredTerminals: Set<string>; opamps: OpAmpModel[]; commit: (nodeVoltages: Record<string, number>, branchCurrents: Record<string, number>, elapsedSeconds: number) => void } | null {
    const parent = new Map<string, string>();
    const find = (value: string): string => {
      const existing = parent.get(value);
      if (!existing) { parent.set(value, value); return value; }
      if (existing === value) return value;
      const root = find(existing); parent.set(value, root); return root;
    };
    const join = (left: string, right: string) => {
      const a = find(left); const b = find(right);
      if (a !== b) parent.set(b, a);
    };
    const wiredTerminals = new Set<string>();
    for (const component of this.tabDComponents) for (const terminal of getDef(component.type)?.terminals ?? []) find(terminalKey(component.id, terminal.id));
    for (const wire of this.tabDWires) {
      const from = terminalKey(wire.fromComp, wire.fromTerm); const to = terminalKey(wire.toComp, wire.toTerm);
      join(from, to); wiredTerminals.add(from); wiredTerminals.add(to);
    }
    const groundComponents = this.tabDComponents.filter(component => component.type === 'ground');
    if (!groundComponents.length) throw new TabDMnaError('Tab D documented MNA requires an explicit ground reference named 0.');
    const groundKey = terminalKey(groundComponents[0].id, 'gnd');
    for (let i = 1; i < groundComponents.length; i++) {
      join(groundKey, terminalKey(groundComponents[i].id, 'gnd'));
    }
    const reference = find(groundKey);
    const netForTerminal = (componentId: string, terminalId: string) => {
      if (this.netLookup) return this.netLookup.netForTerminal(componentId, terminalId);
      const root = find(terminalKey(componentId, terminalId));
      return root === reference ? '0' : `n:${root}`;
    };
    const value = (component: CircuitComponent, key: string, fallback: number) => {
      const raw = component.props[key];
      const number = Number(raw);
      if (Number.isFinite(number)) return number;
      // A parameter that was never set takes the component default; one that was set to NaN/±∞ is a malformed
      // circuit and is reported, never silently replaced by the default (which would solve a different circuit).
      const declared = raw !== undefined && raw !== null && raw !== '';
      if (declared && (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== ''))) {
        throw new TabDMnaError(`Invalid Circuit: ${component.label || component.id} (${component.type}) parameter "${key}" must be a finite number (got ${String(raw)}).`);
      }
      return fallback;
    };
    /** Resistance in ohms: zero is lifted to the 1 nΩ short-circuit floor; a negative value is an invalid passive resistor, never reinterpreted. */
    const resistanceValue = (component: CircuitComponent, key: string, fallback: number) => {
      const ohms = value(component, key, fallback);
      if (ohms < 0) throw new TabDMnaError(`Invalid Circuit: ${component.label || component.id} (${component.type}) has negative ${key} (${ohms} Ω); a passive resistor must be positive.`);
      return Math.max(1e-9, ohms);
    };
    const sourceValue = (component: CircuitComponent, amplitudeKey: string, fallback: number) => {
      const format = String(component.props.format ?? 'polar');
      let effectiveAmplitude = 0;
      let effectivePhase = 0;

      if (format === 'rectangular') {
        const r = value(component, 'real', fallback);
        const i = value(component, 'imag', 0);
        effectiveAmplitude = Math.sqrt(r * r + i * i);
        effectivePhase = Math.atan2(i, r);
      } else {
        effectiveAmplitude = value(component, amplitudeKey, fallback);
        const phaseRaw = value(component, 'phase', 0);
        const isRad = String(component.props.angleUnit) === 'radian';
        effectivePhase = isRad ? phaseRaw : phaseRaw * Math.PI / 180;
      }

      const frequency = value(component, 'frequency', 60);
      const offset = value(component, 'offset', 0);
      const angle = 2 * Math.PI * Math.max(0, frequency) * this.documentedMna.getTime() + effectivePhase;
      const cycle = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
      const waveform = String(component.props.waveform ?? 'sine');
      const normalized = waveform === 'square' ? (Math.sin(angle) >= 0 ? 1 : -1)
        : waveform === 'sawtooth' ? (2 * cycle - 1)
          : waveform === 'triangle' ? (1 - 4 * Math.abs(cycle - 0.5))
            : Math.sin(angle);
      return offset + effectiveAmplitude * normalized;
    };
    const acSource = this.tabDComponents.find((c) => ['ac-voltage', 'ac-current', 'three-phase-source', 'three-phase-rail'].includes(c.type));
    const systemFrequency = acSource ? Number(acSource.props.frequency ?? 50) : 50;
    const primitives: TabDPrimitive[] = [];
    const nonlinear: TabDNonlinearDevice[] = [];
    const opamps: OpAmpModel[] = [];
    /** Junction leakage (gmin): a resistor across every p-n junction of the device model. */
    const junctionLeak = (id: string, positive: string, negative: string) => primitives.push({ kind: 'resistor', id: `${id}:leak`, positive, negative, resistance: 1 / JUNCTION_GMIN });
    const priorNodeVoltages = this.documentedSnapshot?.nodeVoltages ?? { '0': 0 };
    const relayModels: Array<{ id: string; coilPositive: string; coilNegative: string; ratedVoltage: number }> = [];
    const powerLatchModels: Array<{ id: string; gate: string; cathode: string; triggerVoltage: number; holdCurrent: number }> = [];
    const fuseModels: Array<{ id: string; ratedCurrent: number }> = [];
    const digitalModels: Array<{ id: string; inputs: string[]; output: string; ground: string; threshold: number; highVoltage: number; delay: number; rule: (levels: boolean[]) => boolean }> = [];
    /**
     * Coil models collected during component compilation.
     * Commit phase runs solveCoilBranch() for each and updates energized state.
     */
    const coilModels: Array<{
      id: string;
      positive: string;
      negative: string;
      resistance: number;
      inductance: number;
      pullInCurrent: number;
      holdCurrent: number;
    }> = [];
    const priorVoltage = (node: string) => priorNodeVoltages[node] ?? 0;
    const relayClosed = (component: CircuitComponent) => manualRelayClosed(component.props, this.tabDRelayStates.get(component.id) ?? false);
    const powerLatched = (id: string) => this.tabDPowerLatchStates.get(id) ?? false;

    /**
     * Pre-compute coil energization from the PREVIOUS step's node voltages.
     *
     * The aux-contact primitives are assembled in the same pass as the coil
     * primitive, so tabDCoilEnergized (updated in commit) would always be one
     * step stale.  By evaluating the RL transient against priorNodeVoltages
     * here we give the contacts the most up-to-date available coil state
     * without changing the two-phase (build → commit) architecture.
     */
    for (const c of this.tabDComponents) {
      if (c.type !== 'coil' || c.state?.isBurned) continue;
      const posNet = netForTerminal(c.id, 'pos');
      const negNet = netForTerminal(c.id, 'neg');
      const V_pos = priorVoltage(posNet);
      const V_neg = priorVoltage(negNet);
      const V_applied = V_pos - V_neg;
      const R      = Math.max(1, Number(c.props?.resistance  ?? 100));
      const L      = Math.max(1e-6, Number(c.props?.inductance  ?? 1.0));
      const pullIn = Math.max(1e-6, Number(c.props?.pullInCurrent ?? 0.05));
      const hold   = Math.max(1e-6, Number(c.props?.holdCurrent   ?? 0.03));
      // `dt` is the function parameter (fixedDt from the step() loop)
      const tau    = L / R;
      const alpha  = dt / (tau + dt);
      const I_prev = this.tabDCoilCurrents.get(c.id) ?? 0;
      const I_ss   = V_applied / R;
      const I_new  = alpha * I_ss + (1 - alpha) * I_prev;
      const was    = this.tabDCoilEnergized.get(c.id) ?? false;
      let now      = was;
      if      (I_new >= pullIn) now = true;
      else if (I_new <  hold)   now = false;
      this.tabDCoilEnergized.set(c.id, now);
    }

    for (const component of this.tabDComponents) {
      if (component.state?.isBurned) continue;
      const p = (terminal: string) => netForTerminal(component.id, terminal);
      switch (component.type) {
        case 'ground': break;
        case 'resistor': primitives.push({ kind: 'resistor', id: component.id, positive: p('a'), negative: p('b'), resistance: resistanceValue(component, 'resistance', 1000) }); break;
        case 'star-resistor-pack': {
          const resistance = resistanceValue(component, 'resistance', 1000);
          const neutral = p('n');
          primitives.push({ kind: 'resistor', id: `${component.id}:1`, positive: p('l1'), negative: neutral, resistance });
          primitives.push({ kind: 'resistor', id: `${component.id}:2`, positive: p('l2'), negative: neutral, resistance });
          primitives.push({ kind: 'resistor', id: `${component.id}:3`, positive: p('l3'), negative: neutral, resistance });
          break;
        }
        case 'delta-resistor-pack': {
          const resistance = resistanceValue(component, 'resistance', 1000);
          primitives.push({ kind: 'resistor', id: `${component.id}:12`, positive: p('l1'), negative: p('l2'), resistance });
          primitives.push({ kind: 'resistor', id: `${component.id}:23`, positive: p('l2'), negative: p('l3'), resistance });
          primitives.push({ kind: 'resistor', id: `${component.id}:31`, positive: p('l3'), negative: p('l1'), resistance });
          break;
        }
        case 'potentiometer': {
          const a = p('t1') ?? p('a');
          const b = p('t2') ?? p('b');
          const total = resistanceValue(component, 'resistance', 10000);
          const rawWiper = value(component, 'wiper', 0.5);
          const wiper = Math.max(0, Math.min(1, rawWiper > 1 ? rawWiper / 100 : rawWiper));
          primitives.push({ kind: 'resistor', id: `${component.id}:a`, positive: a, negative: p('wiper'), resistance: Math.max(1e-9, total * wiper) });
          primitives.push({ kind: 'resistor', id: `${component.id}:b`, positive: p('wiper'), negative: b, resistance: Math.max(1e-9, total * (1 - wiper)) });
          break;
        }
        case 'capacitor': primitives.push({ kind: 'capacitor', id: component.id, positive: p('a'), negative: p('b'), capacitance: value(component, 'capacitance', 1e-6) }); break;
        case 'inductor': primitives.push({ kind: 'inductor', id: component.id, positive: p('a'), negative: p('b'), inductance: value(component, 'inductance', 1e-3), seriesResistance: value(component, 'dcr', 0) }); break;
        case 'impedance': {
          const format = String(component.props.format ?? 'rectangular');
          let r = 0, x = 0;
          if (format === 'polar') {
            const mag = value(component, 'mag', 5);
            const angRaw = value(component, 'ang', 53.13);
            const isRad = String(component.props.angleUnit) === 'radian';
            const ang = isRad ? angRaw : angRaw * Math.PI / 180;
            r = mag * Math.cos(ang);
            x = mag * Math.sin(ang);
          } else {
            r = value(component, 'r', 3);
            x = value(component, 'x', 4);
          }
          const w = 2 * Math.PI * Math.max(0.001, systemFrequency);
          if (Math.abs(x) < 1e-6) {
            primitives.push({ kind: 'resistor', id: component.id, positive: p('a'), negative: p('b'), resistance: Math.max(1e-9, r) });
          } else {
            const mid = `@${component.id}:mid`;
            primitives.push({ kind: 'resistor', id: `${component.id}:R`, positive: p('a'), negative: mid, resistance: Math.max(1e-9, r) });
            if (x > 0) {
              primitives.push({ kind: 'inductor', id: `${component.id}:L`, positive: mid, negative: p('b'), inductance: x / w });
            } else {
              primitives.push({ kind: 'capacitor', id: `${component.id}:C`, positive: mid, negative: p('b'), capacitance: -1 / (x * w) });
            }
          }
          break;
        }
        case 'dc-voltage': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: p('neg'), voltage: value(component, 'voltage', 12) }); break;
        case 'dc-rail': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: '0', voltage: value(component, 'voltage', 24) }); break;
        case 'ac-voltage': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: p('neg'), voltage: sourceValue(component, 'amplitude', 10) }); break;
        case 'three-phase-source': case 'three-phase-rail': {
          const amplitude = value(component, 'lineVoltage', 400) * Math.SQRT2 / Math.sqrt(3);
          const frequency = value(component, 'frequency', 50); const angle = 2 * Math.PI * frequency * this.documentedMna.getTime(); const order = component.props.phaseSequence === 'ACB' ? [0, 1, -1] : [0, -1, 1];
          for (const [index, phase] of Array.from(['l1', 'l2', 'l3'].entries())) primitives.push({ kind: 'voltage', id: `${component.id}:${phase}`, positive: p(phase), negative: p('n'), voltage: amplitude * Math.sin(angle + order[index] * 2 * Math.PI / 3) });
          break;
        }
        case 'dc-current': primitives.push({ kind: 'current', id: component.id, positive: p('neg'), negative: p('pos'), current: value(component, 'current', 1) }); break;
        case 'ac-current': primitives.push({ kind: 'current', id: component.id, positive: p('neg'), negative: p('pos'), current: sourceValue(component, 'amplitude', 1) }); break;
        case 'vccs': case 'vcvs': {
          const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
          const controlComponent = this.tabDComponents.find((c: CircuitComponent) => c.id === targetRef || c.label === targetRef);
          let cp = '0';
          let cn = '0';
          if (controlComponent) {
            const def = getDef(controlComponent.type);
            const terms = def?.terminals ?? [];
            if (controlComponent.type === 'dc-rail') {
              cp = netForTerminal(controlComponent.id, 'pos');
              cn = '0';
            } else if (terms.length >= 2) {
              cp = netForTerminal(controlComponent.id, terms[0].id);
              cn = netForTerminal(controlComponent.id, terms[1].id);
            } else if (terms.length === 1) {
              cp = netForTerminal(controlComponent.id, terms[0].id);
              cn = '0';
            }
          }
          const gain = value(component, 'gain', value(component, 'transconductance', 0.001));
          if (component.type === 'vccs') primitives.push({ kind: 'vccs', id: component.id, positive: p('pos'), negative: p('neg'), controlPositive: cp, controlNegative: cn, gain, transconductance: gain });
          else primitives.push({ kind: 'vcvs', id: component.id, positive: p('pos'), negative: p('neg'), controlPositive: cp, controlNegative: cn, gain: value(component, 'gain', 2) });
          break;
        }
        case 'cccs': case 'ccvs': {
          const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
          const controlComponent = this.tabDComponents.find((c: CircuitComponent) => c.id === targetRef || c.label === targetRef);
          let cp = '0';
          let cn = '0';
          let targetResistance: number | undefined = undefined;
          if (controlComponent) {
            const def = getDef(controlComponent.type);
            const terms = def?.terminals ?? [];
            if (controlComponent.type === 'dc-rail') {
              cp = netForTerminal(controlComponent.id, 'pos');
              cn = '0';
            } else if (terms.length >= 2) {
              cp = netForTerminal(controlComponent.id, terms[0].id);
              cn = netForTerminal(controlComponent.id, terms[1].id);
            } else if (terms.length === 1) {
              cp = netForTerminal(controlComponent.id, terms[0].id);
              cn = '0';
            }
            if (controlComponent.type === 'resistor') {
              targetResistance = value(controlComponent, 'resistance', 1000);
            }
          }
          const gain = value(component, 'gain', value(component, 'transresistance', 1000));
          if (component.type === 'cccs') primitives.push({ kind: 'cccs', id: component.id, positive: p('pos'), negative: p('neg'), controlBranchId: targetRef, targetId: targetRef, gain: value(component, 'gain', 1), controlPositive: cp, controlNegative: cn, targetResistance });
          else primitives.push({ kind: 'ccvs', id: component.id, positive: p('pos'), negative: p('neg'), controlBranchId: targetRef, targetId: targetRef, gain, transresistance: gain, controlPositive: cp, controlNegative: cn, targetResistance });
          break;
        }
        case 'sw-spst-no': case 'pb-no': case 'circuit-breaker': primitives.push({ kind: 'resistive-switch', id: component.id, positive: p('a'), negative: p('b'), closed: component.props.state === (component.type === 'pb-no' ? 'pressed' : 'closed') }); break;
        case 'circuit-breaker-3phase': {
          const closed = component.props.state === 'closed';
          for (const phase of ['1', '2', '3']) {
            primitives.push({ kind: 'resistive-switch', id: `${component.id}:${phase}`, positive: p(`l${phase}`), negative: p(`t${phase}`), closed });
          }
          break;
        }
        case 'sw-spst-nc': case 'pb-nc': primitives.push({ kind: 'resistive-switch', id: component.id, positive: p('a'), negative: p('b'), closed: component.props.state !== (component.type === 'pb-nc' ? 'pressed' : 'open') }); break;
        case 'sw-spdt': {
          const aSelected = component.props.state !== 'b';
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:a`, positive: p('common'), negative: p('a'), closed: aSelected });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:b`, positive: p('common'), negative: p('b'), closed: !aSelected });
          break;
        }
        case 'sw-dpst': {
          const closed = component.props.state === 'closed';
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:1`, positive: p('a1'), negative: p('b1'), closed });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:2`, positive: p('a2'), negative: p('b2'), closed });
          break;
        }
        case 'sw-dpdt': {
          const aSelected = component.props.state !== 'b';
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:1a`, positive: p('c1'), negative: p('a1'), closed: aSelected });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:1b`, positive: p('c1'), negative: p('b1'), closed: !aSelected });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:2a`, positive: p('c2'), negative: p('a2'), closed: aSelected });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:2b`, positive: p('c2'), negative: p('b2'), closed: !aSelected });
          break;
        }
        case 'aux-contact-no': case 'aux-contact-nc': case 'aux-contact-3phase': {
          /**
           * Aux-contact resolution order:
           *   1. Look up a standalone coil component by label matching linkedTo.
           *   2. Fall back to any relay/contactor body with a matching label.
           *   3. Default to de-energized if nothing found.
           */
          const linkedRef = String(component.props.linkedTo ?? component.props.controlSourceId ?? '');
          const linkedCoil = this.tabDComponents.find(
            item => item.type === 'coil' && (item.label === linkedRef || item.id === linkedRef),
          );
          const linkedRelay = !linkedCoil
            ? this.tabDComponents.find(item => item.label === linkedRef || item.id === linkedRef)
            : null;
          let energized = false;
          if (linkedCoil) {
            energized = this.tabDCoilEnergized.get(linkedCoil.id) ?? false;
          } else if (linkedRelay) {
            energized = relayClosed(linkedRelay);
          }
          const isNC = String(component.props.contactType ?? (component.type === 'aux-contact-nc' ? 'NC' : 'NO')).toUpperCase() === 'NC';
          const closed = isNC ? !energized : energized;
          if (component.type === 'aux-contact-3phase') {
            for (const phase of ['1', '2', '3']) {
              primitives.push({
                kind: 'resistive-switch',
                id: `${component.id}:${phase}`,
                positive: p(`l${phase}`),
                negative: p(`t${phase}`),
                closed,
              });
            }
          } else {
            primitives.push({
              kind: 'resistive-switch',
              id: component.id,
              positive: p('a'),
              negative: p('b'),
              closed,
            });
          }
          break;
        }
        case 'relay-spst': {
          const closed = relayClosed(component);
          primitives.push({ kind: 'resistor', id: `${component.id}:coil`, positive: p('coil+'), negative: p('coil-'), resistance: value(component, 'coilR', 400) });
          primitives.push({ kind: 'resistive-switch', id: component.id, positive: p('com'), negative: p('no'), closed: String(component.props.contactType ?? 'NO') === 'NC' ? !closed : closed });
          relayModels.push({ id: component.id, coilPositive: p('coil+'), coilNegative: p('coil-'), ratedVoltage: value(component, 'coilVoltage', 12) });
          break;
        }
        case 'relay-spdt': {
          const closed = relayClosed(component);
          primitives.push({ kind: 'resistor', id: `${component.id}:coil`, positive: p('coil+'), negative: p('coil-'), resistance: value(component, 'coilR', 400) });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:no`, positive: p('com'), negative: p('no'), closed });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:nc`, positive: p('com'), negative: p('nc'), closed: !closed });
          relayModels.push({ id: component.id, coilPositive: p('coil+'), coilNegative: p('coil-'), ratedVoltage: value(component, 'coilVoltage', 12) });
          break;
        }
        case 'relay-dpst': {
          const closed = relayClosed(component);
          primitives.push({ kind: 'resistor', id: `${component.id}:coil`, positive: p('coil+'), negative: p('coil-'), resistance: value(component, 'coilR', 400) });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:1`, positive: p('c1'), negative: p('no1'), closed });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:2`, positive: p('c2'), negative: p('no2'), closed });
          relayModels.push({ id: component.id, coilPositive: p('coil+'), coilNegative: p('coil-'), ratedVoltage: value(component, 'coilVoltage', 12) });
          break;
        }
        case 'contactor': {
          const closed = relayClosed(component);
          primitives.push({ kind: 'resistor', id: `${component.id}:coil`, positive: p('coil+'), negative: p('coil-'), resistance: value(component, 'coilR', 500) });
          for (const phase of ['1', '2', '3']) primitives.push({ kind: 'resistive-switch', id: `${component.id}:phase${phase}`, positive: p(`l${phase}`), negative: p(`t${phase}`), closed });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:auxno`, positive: p('aux-no-a'), negative: p('aux-no-b'), closed });
          primitives.push({ kind: 'resistive-switch', id: `${component.id}:auxnc`, positive: p('aux-nc-a'), negative: p('aux-nc-b'), closed: !closed });
          relayModels.push({ id: component.id, coilPositive: p('coil+'), coilNegative: p('coil-'), ratedVoltage: value(component, 'coilVoltage', 24) });
          break;
        }
        case 'fuse': {
          primitives.push({ kind: 'resistive-switch', id: component.id, positive: p('a'), negative: p('b'), closed: !this.tabDFuseBlown.has(component.id) });
          fuseModels.push({ id: component.id, ratedCurrent: value(component, 'ratedCurrent', 10) });
          break;
        }
        case 'fuse-3phase': {
          const blown = this.tabDFuseBlown.has(component.id);
          for (const phase of ['1', '2', '3']) {
            primitives.push({ kind: 'resistive-switch', id: `${component.id}:${phase}`, positive: p(`l${phase}`), negative: p(`t${phase}`), closed: !blown });
          }
          fuseModels.push({ id: component.id, ratedCurrent: value(component, 'ratedCurrent', 10) });
          break;
        }
        case 'diode-ideal': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          nonlinear.push({ id: component.id, positive: intAnode, negative: cathode, controls: [intAnode, cathode], junctions: [{ positive: intAnode, negative: cathode, saturationCurrent: 1e-8, thermalVoltage: 0.01 }], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0), 1e-8, 0.01) });
          break;
        }
        case 'diode': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          const material = String(component.props.material ?? 'silicon').toLowerCase();
          const saturationByMaterial: Record<string, number> = { silicon: 1e-12, germanium: 1e-6, gaas: 1e-18 };
          const ideal = material === 'ideal';
          const saturation = ideal ? 1e-8 : saturationByMaterial[material] ?? 1e-12;
          const thermal = ideal ? 0.01 : 0.02585;
          nonlinear.push({ id: component.id, positive: intAnode, negative: cathode, controls: [intAnode, cathode], junctions: [{ positive: intAnode, negative: cathode, saturationCurrent: saturation, thermalVoltage: thermal }], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0), saturation, thermal) });
          break;
        }
        case 'diode-silicon': case 'diode-germanium': case 'diode-gaas': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          nonlinear.push({ id: component.id, positive: intAnode, negative: cathode, controls: [intAnode, cathode], junctions: [{ positive: intAnode, negative: cathode, saturationCurrent: value(component, 'Is', 1e-12) }], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0), value(component, 'Is', 1e-12)) });
          break;
        }
        case 'led': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          const vf = Math.max(0.1, value(component, 'forwardVoltage', 2));
          nonlinear.push({
            id: component.id,
            positive: intAnode,
            negative: cathode,
            controls: [intAnode, cathode],
            current: (nodes: Record<string, number>) => {
              const v = (nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0);
              return shockleyCurrent(v - (vf - 0.7), 1e-12, 0.02585);
            }
          });
          break;
        }
        case 'zener': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          const breakdown = Math.max(0.1, value(component, 'breakdownVoltage', 5.1));
          nonlinear.push({
            id: component.id, positive: intAnode, negative: cathode, controls: [intAnode, cathode], breakdownVoltage: breakdown, current: (nodes: Record<string, number>) => {
              const v = (nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0);
              return shockleyCurrent(v, 1e-12) - shockleyCurrent(-v - breakdown, 1e-6, 0.05);
            }
          });
          break;
        }
        case 'photodiode': {
          const anode = p('anode'); const cathode = p('cathode');
          const intAnode = `${anode}:rs:${component.id}`;
          primitives.push({ kind: 'resistor', id: `${component.id}:rs`, positive: anode, negative: intAnode, resistance: 0.001 });
          junctionLeak(component.id, intAnode, cathode);
          const dark = Math.max(0, value(component, 'darkCurrent', 1e-9));
          nonlinear.push({ id: component.id, positive: intAnode, negative: cathode, controls: [intAnode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[intAnode] ?? 0) - (nodes[cathode] ?? 0), dark) - dark });
          break;
        }
        case 'bjt-npn': case 'bjt-pnp': {
          // Ebers–Moll transport model. Forward active: Ic = β·Ib exactly as before. The base-collector junction makes
          // the saturation regime physical: once V_BC forward-biases, Ic = β·I_BE − (β_R + 1)·I_BC falls off, so
          // V_CE(sat) settles near the declared `vceSat` instead of the collector running negative.
          const pnp = component.type === 'bjt-pnp'; const sign = pnp ? -1 : 1;
          const base = p('base'); const collector = p('collector'); const emitter = p('emitter');
          const beta = Math.max(1, value(component, 'beta', 100));
          const betaReverse = reverseBetaFor(beta, value(component, 'vceSat', 0.2));
          const reverseSaturation = BJT_BASE_SATURATION * beta / betaReverse;
          const ibe = (nodes: Record<string, number>) => shockleyCurrent(sign * ((nodes[base] ?? 0) - (nodes[emitter] ?? 0)), BJT_BASE_SATURATION);
          const ibc = (nodes: Record<string, number>) => shockleyCurrent(sign * ((nodes[base] ?? 0) - (nodes[collector] ?? 0)), reverseSaturation);
          const emitterJunction: TabDJunction = { positive: pnp ? emitter : base, negative: pnp ? base : emitter, saturationCurrent: BJT_BASE_SATURATION, seed: 'forward' };
          const collectorJunction: TabDJunction = { positive: pnp ? collector : base, negative: pnp ? base : collector, saturationCurrent: reverseSaturation, seed: 'flat' };
          nonlinear.push({ id: `${component.id}:be`, positive: emitterJunction.positive, negative: emitterJunction.negative, controls: [base, emitter], junctions: [emitterJunction], current: ibe });
          nonlinear.push({ id: `${component.id}:bc`, positive: collectorJunction.positive, negative: collectorJunction.negative, controls: [base, collector], junctions: [collectorJunction], current: ibc });
          junctionLeak(`${component.id}:be`, emitterJunction.positive, emitterJunction.negative);
          junctionLeak(`${component.id}:bc`, collectorJunction.positive, collectorJunction.negative);
          nonlinear.push({
            id: component.id,
            positive: pnp ? emitter : collector,
            negative: pnp ? collector : emitter,
            controls: [base, emitter, collector],
            junctions: [emitterJunction, collectorJunction],
            current: (nodes: Record<string, number>) => beta * ibe(nodes) - betaReverse * ibc(nodes),
          });
          break;
        }
        case 'mosfet-n': case 'mosfet-p': {
          const gate = p('gate'); const drain = p('drain'); const source = p('source');
          const pChannel = component.type === 'mosfet-p'; const rds = Math.max(1e-4, value(component, 'rdsOn', pChannel ? 0.2 : 0.1)); const threshold = value(component, 'vth', pChannel ? -2 : 2);
          const current = (nodes: Record<string, number>) => {
            const vg = nodes[gate] ?? 0; const vd = nodes[drain] ?? 0; const vs = nodes[source] ?? 0;
            const overdrive = pChannel ? vs - vg - Math.abs(threshold) : vg - vs - threshold;
            const vds = pChannel ? vs - vd : vd - vs;
            if (overdrive <= 0) return (pChannel ? vs - vd : vd - vs) / 1e9;
            const k = 1 / (rds * Math.max(1, overdrive));
            // The channel-length factor multiplies the triode branch too: both branches then equal 0.5·k·Vov²·(1+λ·Vov) at
            // Vds = Vov with equal slope, so the drain current is C¹ across the region boundary (a jump there leaves a
            // CMOS stage with no exact KCL root at its switching point and defeats any Newton or homotopy solver).
            const modulation = 1 + 0.02 * Math.max(0, vds);
            return vds < overdrive ? k * (overdrive * vds - 0.5 * vds * vds) * modulation : 0.5 * k * overdrive * overdrive * modulation;
          };
          nonlinear.push({ id: component.id, positive: pChannel ? source : drain, negative: pChannel ? drain : source, controls: [gate, drain, source], junctions: [], current });
          primitives.push({ kind: 'resistor', id: `${component.id}:gate`, positive: gate, negative: source, resistance: 1e12 });
          break;
        }
        case 'jfet-n': case 'jfet-p': {
          const gate = p('gate'); const drain = p('drain'); const source = p('source'); const pChannel = component.type === 'jfet-p';
          const pinchOff = Math.abs(value(component, 'vp', pChannel ? 4 : -4)); const idss = Math.max(1e-9, value(component, 'idss', 10) * 1e-3);
          const current = (nodes: Record<string, number>) => {
            const vg = nodes[gate] ?? 0; const vd = nodes[drain] ?? 0; const vs = nodes[source] ?? 0;
            const vgs = pChannel ? vs - vg : vg - vs; const normalized = Math.max(0, 1 - (pChannel ? vgs : -vgs) / pinchOff);
            const vds = pChannel ? vs - vd : vd - vs;
            return idss * normalized * normalized * Math.tanh(vds / 0.1);
          };
          nonlinear.push({ id: component.id, positive: pChannel ? source : drain, negative: pChannel ? drain : source, controls: [gate, drain, source], junctions: [], current });
          primitives.push({ kind: 'resistor', id: `${component.id}:gate`, positive: gate, negative: source, resistance: 1e12 });
          break;
        }
        case 'opamp': {
          const internalOut = `@${component.id}:out`;
          const vee = wiredTerminals.has(terminalKey(component.id, 'vee')) ? p('vee') : '0';
          const out = p('out');
          const gain = Math.max(1, value(component, 'gain', 10));
          // Supply rails: ±vcc about the negative-supply node (default ±15 V); the realistic model loses `railMargin` to the output stage.
          const supply = Math.max(0.1, value(component, 'vcc', 15));
          const rail = String(component.props.model ?? 'ideal') === 'realistic' ? Math.max(0.1, supply - Math.max(0, value(component, 'railMargin', 1.5))) : supply;
          const outputResistance = 50;
          const model: OpAmpModel = { id: component.id, gainId: `${component.id}:gain`, internalOut, out, reference: vee, inPositive: p('in+'), inNegative: p('in-'), gain, rail, mode: this.opampModes.get(component.id) ?? 0 };
          primitives.push({ kind: 'vcvs', id: model.gainId, positive: internalOut, negative: vee, controlPositive: p('in+'), controlNegative: p('in-'), gain });
          // Output stage: unclamped gain node → 50 Ω → pin while the op-amp is linear, and a ±rail source behind the same 50 Ω
          // once it is latched. The gain node itself stays A·(V₊−V₋) so virtual-ground relations remain observable.
          nonlinear.push({
            id: `${component.id}:out`, positive: internalOut, negative: out, controls: [internalOut, out, vee], junctions: [],
            current: (nodes: Record<string, number>) => {
              const reference = nodes[vee] ?? 0;
              const target = model.mode === 0 ? (nodes[internalOut] ?? 0) : reference + model.mode * rail;
              return (target - (nodes[out] ?? 0)) / outputResistance;
            },
          });
          primitives.push({ kind: 'resistor', id: `${component.id}:in+`, positive: p('in+'), negative: vee, resistance: 1e12 });
          primitives.push({ kind: 'resistor', id: `${component.id}:in-`, positive: p('in-'), negative: vee, resistance: 1e12 });
          opamps.push(model);
          break;
        }
        case 'transformer': {
          const ratio = Math.max(1e-6, value(component, 'turnRatio', 5));
          primitives.push({ kind: 'vcvs', id: `${component.id}:secondary`, positive: p('s1'), negative: p('s2'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 1 / ratio });
          primitives.push({ kind: 'cccs', id: component.id, positive: p('p1'), negative: p('p2'), controlBranchId: `${component.id}:secondary`, gain: -1 / ratio });
          break;
        }
        case 'transformer-ct': {
          const ratio = Math.max(1e-6, value(component, 'turnRatio', 5));
          primitives.push({ kind: 'vcvs', id: `${component.id}:top`, positive: p('s1'), negative: p('ct'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 0.5 / ratio });
          primitives.push({ kind: 'vcvs', id: `${component.id}:bottom`, positive: p('ct'), negative: p('s2'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 0.5 / ratio });
          primitives.push({ kind: 'cccs', id: component.id, positive: p('p1'), negative: p('p2'), controlBranchId: `${component.id}:top`, gain: -1 / ratio });
          break;
        }
        case 'autotransformer': {
          const ratio = Math.max(1e-6, value(component, 'turnRatio', 2));
          primitives.push({ kind: 'vcvs', id: component.id, positive: p('tap'), negative: p('out2'), controlPositive: p('in1'), controlNegative: p('in2'), gain: 1 / ratio });
          primitives.push({ kind: 'cccs', id: `${component.id}:cccs`, positive: p('in1'), negative: p('in2'), controlBranchId: component.id, gain: -1 / ratio });
          primitives.push({ kind: 'resistor', id: `${component.id}:top`, positive: p('in1'), negative: p('out1'), resistance: 1e-6 });
          primitives.push({ kind: 'resistor', id: `${component.id}:bot`, positive: p('in2'), negative: p('out2'), resistance: 1e-6 });
          break;
        }
        case 'scr': case 'triac': {
          const positive = component.type === 'scr' ? p('anode') : p('t1'); const negative = component.type === 'scr' ? p('cathode') : p('t2'); const gate = p('gate');
          const trigger = value(component, 'vgt', 1.5); const latched = powerLatched(component.id) || priorVoltage(gate) - priorVoltage(negative) >= trigger;
          primitives.push({ kind: 'resistive-switch', id: component.id, positive, negative, closed: latched });
          powerLatchModels.push({ id: component.id, gate, cathode: negative, triggerVoltage: trigger, holdCurrent: Math.max(0.001, value(component, 'itav', 1) * 0.01) });
          break;
        }
        case 'diac': {
          const a1 = p('a1'); const a2 = p('a2'); const on = Math.abs(priorVoltage(a1) - priorVoltage(a2)) >= value(component, 'vbo', 30);
          primitives.push({ kind: 'resistive-switch', id: component.id, positive: a1, negative: a2, closed: on });
          break;
        }
        case 'lamp': primitives.push({ kind: 'resistor', id: component.id, positive: p('a'), negative: p('b'), resistance: Math.max(1e-3, value(component, 'ratedV', 230) ** 2 / Math.max(1e-3, value(component, 'ratedPower', 60))) }); break;
        case 'coil': {
          /**
           * Electromagnetic Coil — Series RL model.
           *
           * The coil is modelled as a resistor for the MNA step (backward Euler
           * replaces the inductor with a Norton equivalent on each iteration).
           * The true current is solved in the commit phase via solveCoilBranch().
           *
           * Terminals: pos (A1) = voltage input, neg (A2) = return path.
           */
          const R = Math.max(1, value(component, 'resistance', 100));
          const L = Math.max(1e-6, value(component, 'inductance', 1.0));
          const pullIn = Math.max(1e-6, value(component, 'pullInCurrent', 0.05));
          const hold   = Math.max(1e-6, value(component, 'holdCurrent', 0.03));
          const positive = p('pos');
          const negative = p('neg');
          // Norton equivalent: G = dt/(L + R*dt), I_hist = I_prev * L/(L + R*dt)
          // For first pass use pure resistor; commit refines the current.
          primitives.push({ kind: 'resistor', id: component.id, positive, negative, resistance: R });
          coilModels.push({ id: component.id, positive, negative, resistance: R, inductance: L, pullInCurrent: pullIn, holdCurrent: hold });
          break;
        }
        case 'motor-dc': primitives.push({ kind: 'resistor', id: component.id, positive: p('pos'), negative: p('neg'), resistance: Math.max(1e-3, value(component, 'nominalV', 12) ** 2 / Math.max(1e-3, value(component, 'nominalPower', 100))) }); break;
        case 'motor-3phase': {
          const phaseResistance = Math.max(1e-3, value(component, 'nominalV', 400) ** 2 / Math.max(1e-3, value(component, 'nominalPower', 5000) * 3));
          for (const phase of ['u', 'v', 'w']) primitives.push({ kind: 'resistor', id: `${component.id}:${phase}`, positive: p(phase), negative: p('pe'), resistance: phaseResistance });
          break;
        }
        case 'digital-input': primitives.push({ kind: 'voltage', id: component.id, positive: p('out'), negative: p('gnd'), voltage: component.props.state === 'HIGH' ? value(component, 'highVoltage', 5) : 0 }); break;
        case 'digital-output': primitives.push({ kind: 'resistor', id: component.id, positive: p('in'), negative: p('gnd'), resistance: 10_000_000 }); break;
        case 'gate-and': case 'gate-or': case 'gate-not': case 'gate-nand': case 'gate-nor': case 'gate-xor': case 'gate-xnor': {
          const unary = component.type === 'gate-not'; const inputs = unary ? [p('a')] : [p('a'), p('b')]; const ground = p('gnd'); const high = value(component, 'highVoltage', 5); const threshold = value(component, 'threshold', 2.5);
          const rule = (levels: boolean[]) => {
            const [a, b] = levels;
            if (component.type === 'gate-and') return a && b;
            if (component.type === 'gate-or') return a || b;
            if (component.type === 'gate-not') return !a;
            if (component.type === 'gate-nand') return !(a && b);
            if (component.type === 'gate-nor') return !(a || b);
            if (component.type === 'gate-xor') return a !== b;
            return a === b;
          };
          const output = p('out'); const observed = inputs.map(input => priorVoltage(input) - priorVoltage(ground) >= threshold); const target = rule(observed) ? high : 0;
          primitives.push({ kind: 'voltage', id: component.id, positive: output, negative: ground, voltage: this.tabDDigitalLevels.get(component.id) ?? target });
          digitalModels.push({ id: component.id, inputs, output, ground, threshold, highVoltage: high, delay: Math.max(0, value(component, 'delay', 1e-6)), rule });
          break;
        }
        case 'voltmeter': primitives.push({ kind: 'resistor', id: component.id, positive: p('pos'), negative: p('neg'), resistance: 10_000_000 }); break;
        case 'ammeter': primitives.push({ kind: 'resistor', id: component.id, positive: p('pos'), negative: p('neg'), resistance: 0.01 }); break;
        case 'dmm': {
          const mode = String(component.props.mode ?? 'DCV');
          if (mode === 'DCV' || mode === 'ACV') primitives.push({ kind: 'resistor', id: component.id, positive: p('hi'), negative: p('com'), resistance: 10_000_000 });
          else if (mode === 'DCA' || mode === 'ACA') primitives.push({ kind: 'resistor', id: component.id, positive: p('hi'), negative: p('com'), resistance: 0.01 });
          else {
            primitives.push({ kind: 'resistor', id: component.id, positive: p('hi'), negative: p('com'), resistance: 1_000_000_000_000 });
            primitives.push({ kind: 'current', id: `${component.id}:test`, positive: p('hi'), negative: p('com'), current: 0.001 });
          }
          break;
        }
        case 'oscilloscope': {
          for (const channel of ['ch1', 'ch2', 'ch3', 'ch4']) primitives.push({ kind: 'resistor', id: `${component.id}:${channel}`, positive: p(channel), negative: p('gnd'), resistance: 10_000_000 });
          break;
        }
        default: return null;
      }
    }
    return {
      primitives,
      nonlinear,
      netForTerminal,
      wiredTerminals,
      opamps,
      commit: (nodeVoltages, branchCurrents, elapsedSeconds) => {
        for (const relay of relayModels) {
          const component = this.tabDComponents.find((item) => item.id === relay.id);
          if (component && (component.props.manualState === 'open' || component.props.manualState === 'closed')) {
            this.tabDRelayStates.set(relay.id, component.props.manualState === 'closed');
            continue;
          }
          const coilVoltage = Math.abs((nodeVoltages[relay.coilPositive] ?? 0) - (nodeVoltages[relay.coilNegative] ?? 0));
          const prior = this.tabDRelayStates.get(relay.id) ?? false;
          const next = prior ? coilVoltage >= relay.ratedVoltage * 0.45 : coilVoltage >= relay.ratedVoltage * 0.75;
          this.tabDRelayStates.set(relay.id, next);
        }
        for (const power of powerLatchModels) {
          const gateVoltage = (nodeVoltages[power.gate] ?? 0) - (nodeVoltages[power.cathode] ?? 0);
          const held = this.tabDPowerLatchStates.get(power.id) ?? false;
          const current = Math.abs(branchCurrents[power.id] ?? 0);
          this.tabDPowerLatchStates.set(power.id, gateVoltage >= power.triggerVoltage || (held && current >= power.holdCurrent));
        }
        for (const fuse of fuseModels) {
          const i1 = Math.abs(branchCurrents[fuse.id] ?? branchCurrents[`${fuse.id}:1`] ?? 0);
          const i2 = Math.abs(branchCurrents[`${fuse.id}:2`] ?? 0);
          const i3 = Math.abs(branchCurrents[`${fuse.id}:3`] ?? 0);
          if (Math.max(i1, i2, i3) > fuse.ratedCurrent) this.tabDFuseBlown.add(fuse.id);
        }
        for (const gate of digitalModels) {
          const levels = gate.inputs.map(input => (nodeVoltages[input] ?? 0) - (nodeVoltages[gate.ground] ?? 0) >= gate.threshold);
          const target = gate.rule(levels) ? gate.highVoltage : 0;
          const prior = this.tabDDigitalLevels.get(gate.id) ?? target;
          const alpha = gate.delay <= 0 ? 1 : 1 - Math.exp(-elapsedSeconds / gate.delay);
          this.tabDDigitalLevels.set(gate.id, prior + (target - prior) * alpha);
        }

        /**
         * Coil commit — RL transient solver (backward Euler)
         * ─────────────────────────────────────────────────
         * V(t) = R·I(t) + L·dI/dt
         *
         * Backward Euler discretisation:
         *   I_new = (dt·V_applied + L·I_prev) / (L + R·dt)
         *         = α·I_ss + (1 - α)·I_prev          where α = dt/(τ + dt), τ = L/R
         *
         * Energization hysteresis:
         *   Pull-in : I_new ≥ pullInCurrent  → energized = true
         *   Drop-out: I_new <  holdCurrent   → energized = false
         *   Between : state unchanged (hysteresis band)
         */
        for (const coil of coilModels) {
          const V_pos = nodeVoltages[coil.positive]  ?? 0;
          const V_neg = nodeVoltages[coil.negative]  ?? 0;
          const V_applied = V_pos - V_neg;

          const I_prev = this.tabDCoilCurrents.get(coil.id) ?? 0;
          const tau    = coil.inductance / coil.resistance;       // τ = L/R
          const alpha  = elapsedSeconds / (tau + elapsedSeconds); // backward Euler blending
          const I_ss   = V_applied / coil.resistance;             // steady-state current
          const I_new  = alpha * I_ss + (1 - alpha) * I_prev;    // transient current

          this.tabDCoilCurrents.set(coil.id, I_new);

          // Hysteresis energization logic
          const wasEnergized = this.tabDCoilEnergized.get(coil.id) ?? false;
          let nowEnergized = wasEnergized;
          if (I_new >= coil.pullInCurrent) {
            nowEnergized = true;
          } else if (I_new < coil.holdCurrent) {
            nowEnergized = false;
          }
          this.tabDCoilEnergized.set(coil.id, nowEnergized);

          // Write calculated current back to branchCurrents for wire animation
          branchCurrents[coil.id] = I_new;
        }
      },
    };
  }

  private terminalVoltages(netForTerminal: (componentId: string, terminalId: string) => string, nodeVoltages: Record<string, number>) {
    const terminalVoltages: Record<string, number> = {};
    for (const component of this.tabDComponents) {
      for (const terminal of getDef(component.type)?.terminals ?? []) terminalVoltages[terminalKey(component.id, terminal.id)] = nodeVoltages[netForTerminal(component.id, terminal.id)] ?? 0;
    }
    return terminalVoltages;
  }

  private instrumentReadings(terminalVoltages: Record<string, number>, branchCurrents: Record<string, number>, wiredTerminals: Set<string>, currentTime: number) {
    if (currentTime - this.lastDisplayTime >= 0.5 || this.lastDisplayTime < 0) {
      const readings: Record<string, InstrumentReading> = {};
      const difference = (component: CircuitComponent, positive: string, negative: string) => (terminalVoltages[terminalKey(component.id, positive)] ?? 0) - (terminalVoltages[terminalKey(component.id, negative)] ?? 0);

      for (const component of this.tabDComponents) {
        const isConnected = (p: string, n: string) => wiredTerminals.has(terminalKey(component.id, p)) && wiredTerminals.has(terminalKey(component.id, n));
        const integrator = this.integrators.get(component.id);
        const dcVal = integrator ? integrator.getDC() : 0;
        const acVal = integrator ? integrator.getAC() : 0;

        if (component.type === 'voltmeter') {
          const connected = isConnected('pos', 'neg');
          const mode = String(component.props.mode ?? 'DC').toUpperCase().trim();
          readings[component.id] = { value: connected ? (mode === 'AC' ? acVal : dcVal) : 0, unit: 'V', status: connected ? 'ready' : 'open' };
        }

        if (component.type === 'ammeter') {
          const connected = isConnected('pos', 'neg');
          const mode = String(component.props.mode ?? 'DC').toUpperCase().trim();
          readings[component.id] = { value: connected ? (mode === 'AC' ? acVal : dcVal) : 0, unit: 'A', status: connected ? 'ready' : 'open' };
        }

        if (component.type === 'dmm') {
          const mode = String(component.props.mode ?? 'DCV').toUpperCase().trim();
          const compTerminals: { id: string }[] = (component as any).terminals ?? getDef(component.type)?.terminals ?? [];
          const pTerm = compTerminals.find(t => t.id === 'pos' || t.id === 'hi')?.id ?? 'pos';
          const nTerm = compTerminals.find(t => t.id === 'neg' || t.id === 'com')?.id ?? 'neg';
          const connected = isConnected(pTerm, nTerm);

          const unit = mode.includes('A') ? 'A' : mode === 'OHM' || mode === 'CONT' ? 'Ω' : mode === 'HZ' ? 'Hz' : 'V';

          if (!connected) {
            readings[component.id] = { value: 0, unit, status: 'open' };
          } else if (mode === 'DCV') {
            readings[component.id] = { value: dcVal, unit: 'V', status: 'ready' };
          } else if (mode === 'ACV') {
            readings[component.id] = { value: acVal, unit: 'V', status: 'ready' };
          } else if (mode === 'DCA') {
            readings[component.id] = { value: dcVal, unit: 'A', status: 'ready' };
          } else if (mode === 'ACA') {
            readings[component.id] = { value: acVal, unit: 'A', status: 'ready' };
          } else if (mode === 'HZ') {
            readings[component.id] = { value: 0, unit: 'Hz', status: 'ready' };
          } else {
            const isDirectlyOpen = this.isDmmMeasuringOpenCircuit(component);
            const voltage = difference(component, pTerm, nTerm);
            const resistance = isDirectlyOpen ? Infinity : Math.abs(voltage) / 0.001;
            const open = isDirectlyOpen || !Number.isFinite(resistance) || resistance >= 1e7;
            readings[component.id] = {
              value: open ? Infinity : resistance,
              unit: 'Ω',
              status: open ? 'open' : 'ready',
              continuity: mode === 'CONT' ? (!open && resistance < 50) : undefined,
            };
          }
        }
      }
      this.displayReadings = readings;
      this.lastDisplayTime = currentTime;
    }
    return this.displayReadings;
  }

  protected override isDmmMeasuringOpenCircuit(dmm: CircuitComponent): boolean {
    const dmmWires = this.tabDWires.filter(w => w.fromComp === dmm.id || w.toComp === dmm.id);
    const hiWire = dmmWires.find(w => (w.fromComp === dmm.id && (w.fromTerm === 'hi' || w.fromTerm === 'pos')) || (w.toComp === dmm.id && (w.toTerm === 'hi' || w.toTerm === 'pos')));
    const comWire = dmmWires.find(w => (w.fromComp === dmm.id && (w.fromTerm === 'com' || w.fromTerm === 'neg')) || (w.toComp === dmm.id && (w.toTerm === 'com' || w.toTerm === 'neg')));
    if (!hiWire || !comWire) return true;

    const getTargetComp = (w: CircuitWire) => w.fromComp === dmm.id ? w.toComp : w.fromComp;
    const targetA = getTargetComp(hiWire);
    const targetB = getTargetComp(comWire);

    if (targetA === targetB) {
      const comp = this.tabDComponents.find(c => c.id === targetA);
      if (comp && (Boolean(comp.state?.isBurned) || isComponentOpen(comp))) return true;
    }

    const brokenWires = getBrokenWireIds(this.tabDComponents, this.tabDWires);
    if (brokenWires.has(hiWire.id) || brokenWires.has(comWire.id)) return true;

    return false;
  }
}

export { detectCoilConflicts, type CoilConflictEntry, type CoilConflictReport } from '../../../../shared/circuit/coilConflicts';
