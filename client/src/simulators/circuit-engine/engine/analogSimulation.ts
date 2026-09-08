import { getDef } from '@/simulators/circuit-engine/models/componentDefs';
import { manualRelayClosed } from '@/simulators/circuit-engine/models/componentInteraction';
import { terminalKey, type CircuitComponent, type CircuitWire, type InstrumentReading, type SimulationSnapshot } from '@/simulators/circuit-engine/models/circuitTypes';
import { compileDcTopology, type TabBMnaState } from '@/simulators/circuit-engine/components/hooks/useSimulation';
import { SimulationEngine } from '@/simulators/circuit-engine/engine/simulation';
import { TabDMnaError, type TabDPrimitive } from '@/simulators/circuit-engine/engine/analogDocumentedMna';
import { shockleyCurrent, TabDNewtonMna, type TabDNonlinearDevice } from '@/simulators/circuit-engine/engine/analogNewtonMna';
import { toTabDObservableOperatingPoint, type TabDObservableOperatingPoint } from '@/simulators/circuit-engine/models/analogResultAdapter';

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
  private readonly documentedMna = new TabDNewtonMna();
  private documentedSnapshot: SimulationSnapshot | null = null;
  private readonly tabDRelayStates = new Map<string, boolean>();
  private readonly tabDPowerLatchStates = new Map<string, boolean>();
  private readonly tabDFuseBlown = new Set<string>();
  private readonly tabDDigitalLevels = new Map<string, number>();

  override setCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    super.setCircuit(components, wires);
    this.tabDComponents = components.map(component => ({ ...component, props: { ...component.props } }));
    this.tabDWires = wires.map(wire => ({ ...wire, path: wire.path.map(point => [...point] as [number, number]) }));
    this.documentedMna.reset();
    this.documentedSnapshot = null;
    this.tabDRelayStates.clear();
    this.tabDPowerLatchStates.clear();
    this.tabDFuseBlown.clear();
    this.tabDDigitalLevels.clear();
  }

  override reset() {
    super.reset();
    this.documentedMna.reset();
    this.documentedSnapshot = null;
    this.tabDRelayStates.clear();
    this.tabDPowerLatchStates.clear();
    this.tabDFuseBlown.clear();
    this.tabDDigitalLevels.clear();
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

  override step(elapsedSeconds = 1 / 1000): SimulationSnapshot {
    try {
      const compiled = this.compileDocumentedPrimitives();
      if (!compiled) return super.step(elapsedSeconds);
      const initialGuess = this.documentedSnapshot?.converged ? this.documentedSnapshot.nodeVoltages : undefined;
      const result = this.documentedMna.solve(compiled.primitives, compiled.nonlinear, elapsedSeconds, { initialGuess });
      const branchCurrents = {
        ...result.branchCurrents,
        ...Object.fromEntries(compiled.nonlinear.map(device => [device.id, device.current(result.nodeVoltages)])),
      };
      compiled.commit(result.nodeVoltages, branchCurrents, Math.max(1e-9, elapsedSeconds));
      const terminalVoltages = this.terminalVoltages(compiled.netForTerminal, result.nodeVoltages);
      const instrumentReadings = this.instrumentReadings(terminalVoltages, branchCurrents, compiled.wiredTerminals);
      this.documentedSnapshot = {
        time: result.time,
        nodeVoltages: result.nodeVoltages,
        terminalVoltages,
        branchCurrents,
        wireCurrents: Object.fromEntries(this.tabDWires.map(wire => [wire.id, 0])),
        componentPowered: Object.fromEntries(this.tabDComponents.map(component => [component.id, Math.abs(branchCurrents[component.id] ?? 0) > 1e-10])),
        componentIntensity: {},
        nodeHistory: {},
        branchHistory: {},
        instrumentReadings,
        warnings: [],
        converged: result.converged,
      };
      return this.documentedSnapshot;
    } catch (error) {
      const errorMessage = error instanceof TabDMnaError
        ? error.message
        : error instanceof Error
        ? error.message
        : String(error);
      this.documentedSnapshot = {
        time: this.documentedMna.getTime(),
        nodeVoltages: {}, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {},
        warnings: [{ code: 'TAB_D_MNA', message: errorMessage }],
        converged: false,
      };
      return this.documentedSnapshot;
    }
  }

  private compileDocumentedPrimitives(): { primitives: TabDPrimitive[]; nonlinear: TabDNonlinearDevice[]; netForTerminal: (componentId: string, terminalId: string) => string; wiredTerminals: Set<string>; commit: (nodeVoltages: Record<string, number>, branchCurrents: Record<string, number>, elapsedSeconds: number) => void } | null {
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
      const root = find(terminalKey(componentId, terminalId));
      return root === reference ? '0' : `n:${root}`;
    };
    const value = (component: CircuitComponent, key: string, fallback: number) => {
      const number = Number(component.props[key]); return Number.isFinite(number) ? number : fallback;
    };
    const sourceValue = (component: CircuitComponent, amplitudeKey: string, fallback: number) => {
      const amplitude = value(component, amplitudeKey, fallback);
      const frequency = value(component, 'frequency', 60);
      const phase = value(component, 'phase', 0) * Math.PI / 180;
      const offset = value(component, 'offset', 0);
      const angle = 2 * Math.PI * Math.max(0, frequency) * this.documentedMna.getTime() + phase;
      const cycle = ((angle / (2 * Math.PI)) % 1 + 1) % 1;
      const waveform = String(component.props.waveform ?? 'sine');
      const normalized = waveform === 'square' ? (Math.sin(angle) >= 0 ? 1 : -1)
        : waveform === 'sawtooth' ? (2 * cycle - 1)
          : waveform === 'triangle' ? (1 - 4 * Math.abs(cycle - 0.5))
            : Math.sin(angle);
      return offset + amplitude * normalized;
    };
    const primitives: TabDPrimitive[] = [];
    const nonlinear: TabDNonlinearDevice[] = [];
    const priorNodeVoltages = this.documentedSnapshot?.nodeVoltages ?? { '0': 0 };
    const relayModels: Array<{ id: string; coilPositive: string; coilNegative: string; ratedVoltage: number }> = [];
    const powerLatchModels: Array<{ id: string; gate: string; cathode: string; triggerVoltage: number; holdCurrent: number }> = [];
    const fuseModels: Array<{ id: string; ratedCurrent: number }> = [];
    const digitalModels: Array<{ id: string; inputs: string[]; output: string; ground: string; threshold: number; highVoltage: number; delay: number; rule: (levels: boolean[]) => boolean }> = [];
    const priorVoltage = (node: string) => priorNodeVoltages[node] ?? 0;
    const relayClosed = (component: CircuitComponent) => manualRelayClosed(component.props, this.tabDRelayStates.get(component.id) ?? false);
    const powerLatched = (id: string) => this.tabDPowerLatchStates.get(id) ?? false;
    for (const component of this.tabDComponents) {
      const p = (terminal: string) => netForTerminal(component.id, terminal);
      switch (component.type) {
        case 'ground': break;
        case 'resistor': primitives.push({ kind: 'resistor', id: component.id, positive: p('a'), negative: p('b'), resistance: value(component, 'resistance', 1000) }); break;
        case 'potentiometer': {
          const a = p('t1') ?? p('a');
          const b = p('t2') ?? p('b');
          const total = Math.max(1e-9, value(component, 'resistance', 10000));
          const wiper = Math.max(0, Math.min(1, value(component, 'wiper', 0.5)));
          primitives.push({ kind: 'resistor', id: `${component.id}:a`, positive: a, negative: p('wiper'), resistance: Math.max(1e-9, total * wiper) });
          primitives.push({ kind: 'resistor', id: `${component.id}:b`, positive: p('wiper'), negative: b, resistance: Math.max(1e-9, total * (1 - wiper)) });
          break;
        }
        case 'capacitor': primitives.push({ kind: 'capacitor', id: component.id, positive: p('a'), negative: p('b'), capacitance: value(component, 'capacitance', 1e-6) }); break;
        case 'inductor': primitives.push({ kind: 'inductor', id: component.id, positive: p('a'), negative: p('b'), inductance: value(component, 'inductance', 1e-3), seriesResistance: value(component, 'dcr', 0) }); break;
        case 'dc-voltage': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: p('neg'), voltage: value(component, 'voltage', 12) }); break;
        case 'dc-rail': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: '0', voltage: value(component, 'voltage', 24) }); break;
        case 'ac-voltage': primitives.push({ kind: 'voltage', id: component.id, positive: p('pos'), negative: p('neg'), voltage: sourceValue(component, 'amplitude', 10) }); break;
        case 'three-phase-source': case 'three-phase-rail': {
          const amplitude = value(component, 'lineVoltage', 400) * Math.SQRT2 / Math.sqrt(3);
          const frequency = value(component, 'frequency', 50); const angle = 2 * Math.PI * frequency * this.documentedMna.getTime(); const order = component.props.phaseSequence === 'ACB' ? [0, 1, -1] : [0, -1, 1];
          for (const [index, phase] of Array.from(['l1', 'l2', 'l3'].entries())) primitives.push({ kind: 'voltage', id: `${component.id}:${phase}`, positive: p(phase), negative: p('n'), voltage: amplitude * Math.sin(angle + order[index] * 2 * Math.PI / 3) });
          break;
        }
        case 'dc-current': primitives.push({ kind: 'current', id: component.id, positive: p('pos'), negative: p('neg'), current: value(component, 'current', 1) }); break;
        case 'ac-current': primitives.push({ kind: 'current', id: component.id, positive: p('pos'), negative: p('neg'), current: sourceValue(component, 'amplitude', 1) }); break;
        case 'vccs': case 'vcvs': {
          const controlSourceId = String(component.props.controlSourceId ?? '');
          const controlComponent = this.tabDComponents.find((c: CircuitComponent) => c.id === controlSourceId || c.label === controlSourceId);
          const cp = controlComponent ? netForTerminal(controlComponent.id, 'pos') : '0';
          const cn = controlComponent ? netForTerminal(controlComponent.id, 'neg') : '0';
          if (component.type === 'vccs') primitives.push({ kind: 'vccs', id: component.id, positive: p('pos'), negative: p('neg'), controlPositive: cp, controlNegative: cn, transconductance: value(component, 'transconductance', 0.001) });
          else primitives.push({ kind: 'vcvs', id: component.id, positive: p('pos'), negative: p('neg'), controlPositive: cp, controlNegative: cn, gain: value(component, 'gain', 2) });
          break;
        }
        case 'cccs': primitives.push({ kind: 'cccs', id: component.id, positive: p('pos'), negative: p('neg'), controlBranchId: String(component.props.controlSourceId ?? ''), gain: value(component, 'gain', 1) }); break;
        case 'ccvs': primitives.push({ kind: 'ccvs', id: component.id, positive: p('pos'), negative: p('neg'), controlBranchId: String(component.props.controlSourceId ?? ''), transresistance: value(component, 'transresistance', 1000) }); break;
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
        case 'aux-contact-no': case 'aux-contact-nc': {
          const linked = this.tabDComponents.find(item => item.label === String(component.props.linkedTo ?? ''));
          const energized = linked ? relayClosed(linked) : false;
          primitives.push({ kind: 'resistive-switch', id: component.id, positive: p('a'), negative: p('b'), closed: component.type === 'aux-contact-no' ? energized : !energized });
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
          nonlinear.push({ id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[anode] ?? 0) - (nodes[cathode] ?? 0), 1e-8, 0.01) });
          break;
        }
        case 'diode': {
          const anode = p('anode'); const cathode = p('cathode');
          const material = String(component.props.material ?? 'silicon').toLowerCase();
          const saturationByMaterial: Record<string, number> = { silicon: 1e-12, germanium: 1e-6, gaas: 1e-18 };
          const ideal = material === 'ideal';
          const saturation = ideal ? 1e-8 : saturationByMaterial[material] ?? 1e-12;
          const thermal = ideal ? 0.01 : 0.02585;
          nonlinear.push({ id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[anode] ?? 0) - (nodes[cathode] ?? 0), saturation, thermal) });
          break;
        }
        case 'diode-silicon': case 'diode-germanium': case 'diode-gaas': {
          const anode = p('anode'); const cathode = p('cathode');
          nonlinear.push({ id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[anode] ?? 0) - (nodes[cathode] ?? 0), value(component, 'Is', 1e-12)) });
          break;
        }
        case 'led': {
          const anode = p('anode'); const cathode = p('cathode');
          const vf = Math.max(0.1, value(component, 'forwardVoltage', 2));
          const ratedCurrent = Math.max(1e-9, value(component, 'maxCurrent', 0.02));
          const is = ratedCurrent / Math.max(1, Math.exp(Math.min(40, vf / 0.02585)) - 1);
          nonlinear.push({ id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[anode] ?? 0) - (nodes[cathode] ?? 0), is) });
          break;
        }
        case 'zener': {
          const anode = p('anode'); const cathode = p('cathode'); const breakdown = Math.max(0.1, value(component, 'breakdownVoltage', 5.1));
          nonlinear.push({
            id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => {
              const v = (nodes[anode] ?? 0) - (nodes[cathode] ?? 0);
              return shockleyCurrent(v, 1e-12) - shockleyCurrent(-v - breakdown, 1e-6, 0.05);
            }
          });
          break;
        }
        case 'photodiode': {
          const anode = p('anode'); const cathode = p('cathode'); const dark = Math.max(0, value(component, 'darkCurrent', 1e-9));
          nonlinear.push({ id: component.id, positive: anode, negative: cathode, controls: [anode, cathode], current: (nodes: Record<string, number>) => shockleyCurrent((nodes[anode] ?? 0) - (nodes[cathode] ?? 0), dark) - dark });
          break;
        }
        case 'bjt-npn': {
          const base = p('base'); const collector = p('collector'); const emitter = p('emitter'); const beta = Math.max(1, value(component, 'beta', 100));
          const junction = (nodes: Record<string, number>) => shockleyCurrent((nodes[base] ?? 0) - (nodes[emitter] ?? 0), 1e-15);
          nonlinear.push({ id: `${component.id}:be`, positive: base, negative: emitter, controls: [base, emitter], current: junction });
          nonlinear.push({ id: component.id, positive: collector, negative: emitter, controls: [base, emitter], current: (nodes: Record<string, number>) => beta * junction(nodes) });
          break;
        }
        case 'bjt-pnp': {
          const base = p('base'); const collector = p('collector'); const emitter = p('emitter'); const beta = Math.max(1, value(component, 'beta', 100));
          const junction = (nodes: Record<string, number>) => shockleyCurrent((nodes[emitter] ?? 0) - (nodes[base] ?? 0), 1e-15);
          nonlinear.push({ id: `${component.id}:be`, positive: emitter, negative: base, controls: [base, emitter], current: junction });
          nonlinear.push({ id: component.id, positive: emitter, negative: collector, controls: [base, emitter], current: (nodes: Record<string, number>) => beta * junction(nodes) });
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
            const channel = vds < overdrive ? k * (overdrive * vds - 0.5 * vds * vds) : 0.5 * k * overdrive * overdrive * (1 + 0.02 * Math.max(0, vds));
            return channel;
          };
          nonlinear.push({ id: component.id, positive: pChannel ? source : drain, negative: pChannel ? drain : source, controls: [gate, drain, source], current });
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
          nonlinear.push({ id: component.id, positive: pChannel ? source : drain, negative: pChannel ? drain : source, controls: [gate, drain, source], current });
          primitives.push({ kind: 'resistor', id: `${component.id}:gate`, positive: gate, negative: source, resistance: 1e12 });
          break;
        }
        case 'opamp': {
          const internalOut = `@${component.id}:out`;
          const vee = wiredTerminals.has(terminalKey(component.id, 'vee')) ? p('vee') : '0';
          primitives.push({ kind: 'vcvs', id: `${component.id}:gain`, positive: internalOut, negative: vee, controlPositive: p('in+'), controlNegative: p('in-'), gain: Math.max(1, value(component, 'gain', 10)) });
          primitives.push({ kind: 'resistor', id: `${component.id}:out`, positive: internalOut, negative: p('out'), resistance: 50 });
          primitives.push({ kind: 'resistor', id: `${component.id}:in+`, positive: p('in+'), negative: vee, resistance: 1e12 });
          primitives.push({ kind: 'resistor', id: `${component.id}:in-`, positive: p('in-'), negative: vee, resistance: 1e12 });
          break;
        }
        case 'transformer': {
          const ratio = Math.max(1e-6, value(component, 'turnRatio', 19.17));
          primitives.push({ kind: 'vcvs', id: `${component.id}:secondary`, positive: p('s1'), negative: p('s2'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 1 / ratio });
          primitives.push({ kind: 'cccs', id: component.id, positive: p('p1'), negative: p('p2'), controlBranchId: `${component.id}:secondary`, gain: -1 / ratio });
          break;
        }
        case 'transformer-ct': {
          const ratio = Math.max(1e-6, value(component, 'turnRatio', 9.58));
          primitives.push({ kind: 'vcvs', id: `${component.id}:top`, positive: p('s1'), negative: p('ct'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 0.5 / ratio });
          primitives.push({ kind: 'vcvs', id: `${component.id}:bottom`, positive: p('ct'), negative: p('s2'), controlPositive: p('p1'), controlNegative: p('p2'), gain: 0.5 / ratio });
          primitives.push({ kind: 'cccs', id: component.id, positive: p('p1'), negative: p('p2'), controlBranchId: `${component.id}:top`, gain: -1 / ratio });
          break;
        }
        case 'autotransformer': {
          primitives.push({ kind: 'vcvs', id: component.id, positive: p('tap'), negative: p('out2'), controlPositive: p('in1'), controlNegative: p('in2'), gain: 1 / Math.max(1e-6, value(component, 'turnRatio', 1.92)) });
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
          const output = p('y'); const observed = inputs.map(input => priorVoltage(input) - priorVoltage(ground) >= threshold); const target = rule(observed) ? high : 0;
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

  private instrumentReadings(terminalVoltages: Record<string, number>, branchCurrents: Record<string, number>, wiredTerminals: Set<string>) {
    const readings: Record<string, InstrumentReading> = {};
    const difference = (component: CircuitComponent, positive: string, negative: string) => (terminalVoltages[terminalKey(component.id, positive)] ?? 0) - (terminalVoltages[terminalKey(component.id, negative)] ?? 0);
    for (const component of this.tabDComponents) {
      if (component.type === 'voltmeter') readings[component.id] = { value: difference(component, 'pos', 'neg'), unit: 'V', status: wiredTerminals.has(terminalKey(component.id, 'pos')) && wiredTerminals.has(terminalKey(component.id, 'neg')) ? 'ready' : 'open' };
      if (component.type === 'ammeter') readings[component.id] = { value: branchCurrents[component.id] ?? 0, unit: 'A', status: wiredTerminals.has(terminalKey(component.id, 'pos')) && wiredTerminals.has(terminalKey(component.id, 'neg')) ? 'ready' : 'open' };
      if (component.type === 'dmm') {
        const mode = String(component.props.mode ?? 'DCV');
        const connected = wiredTerminals.has(terminalKey(component.id, 'hi')) && wiredTerminals.has(terminalKey(component.id, 'com'));
        const unit = mode.includes('A') ? 'A' : mode === 'OHM' || mode === 'CONT' ? 'Ω' : mode === 'HZ' ? 'Hz' : 'V';

        if (!connected) readings[component.id] = { value: 0, unit, status: 'open' };
        else if (mode === 'DCV' || mode === 'ACV') readings[component.id] = { value: difference(component, 'hi', 'com'), unit: 'V', status: 'ready' };
        else if (mode === 'DCA' || mode === 'ACA') readings[component.id] = { value: branchCurrents[component.id] ?? 0, unit: 'A', status: 'ready' };
        else if (mode === 'HZ') readings[component.id] = { value: 0, unit: 'Hz', status: 'ready' }; // Placeholder for frequency
        else {
          const voltage = difference(component, 'hi', 'com');
          const resistance = Math.abs(voltage) / 0.001; // 1mA test current
          readings[component.id] = { value: resistance, unit: 'Ω', status: 'ready', continuity: mode === 'CONT' ? resistance < 50 : undefined };
        }
      }
    }
    return readings;
  }
}

/** Static Tab D analysis payload for the unchanged MNA-status and analysis UI. */
export function evaluateTabDStaticMna(components: CircuitComponent[], wires: CircuitWire[]): TabBMnaState {
  const elements = compileDcTopology(components, wires);
  if (!components.length || !components.some(component => component.type === 'ground') || !elements.length) {
    return { result: null, error: null, elements };
  }
  const engine = new TabDSimulationEngine();
  engine.setCircuit(components, wires);
  const snapshot = engine.step(1e-3);
  const error = snapshot.converged ? null : snapshot.warnings[0]?.message ?? 'Tab D documented MNA could not converge.';
  return {
    result: snapshot.converged ? {
      nodeVoltages: snapshot.nodeVoltages,
      voltageSourceCurrents: Object.fromEntries(Object.entries(snapshot.branchCurrents).filter(([id]) => components.some(component => component.id === id && ['dc-voltage', 'dc-rail', 'ac-voltage', 'vcvs', 'ccvs'].includes(component.type)))),
      branchCurrents: snapshot.branchCurrents,
    } : null,
    error,
    elements,
  };
}
