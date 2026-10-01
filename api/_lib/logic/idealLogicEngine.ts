/**
 * Digital Logic Design uses ideal Boolean propagation only. This engine deliberately
 * has no MNA, ground, voltage, threshold, delay, or analogue dependency.
 */
import type { CircuitComponent, CircuitWire, SimulationSnapshot, SimulationWarning } from '../../../shared/logic/circuitTypes';
import { terminalKey } from '../../../shared/logic/circuitTypes';
import { SimulationEngine } from './simulation';
import { inputTerminalsFor } from '../../../shared/logic/logicGateContract';

export const IDEAL_LOGIC_TYPES = new Set(['digital-input', 'digital-output', 'gate-and', 'gate-or', 'gate-not', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor']);
const OUTPUT_TERMINAL: Record<string, string> = { 'digital-input': 'out', 'gate-and': 'y', 'gate-or': 'y', 'gate-not': 'y', 'gate-nand': 'y', 'gate-nor': 'y', 'gate-xor': 'y', 'gate-xnor': 'y' };
interface LogicConnection { wireId: string; driverComp: string; driverTerm: string; receiverComp: string; receiverTerm: string; }

const resolveLogicConnection = (wire: CircuitWire, components: Map<string, CircuitComponent>): LogicConnection | null => {
  const fromComponent = components.get(wire.fromComp);
  const toComponent = components.get(wire.toComp);
  if (!fromComponent || !toComponent) return null;
  const fromIsOutput = OUTPUT_TERMINAL[fromComponent.type] === wire.fromTerm;
  const toIsOutput = OUTPUT_TERMINAL[toComponent.type] === wire.toTerm;
  if (fromIsOutput === toIsOutput) return null;
  return fromIsOutput
    ? { wireId: wire.id, driverComp: wire.fromComp, driverTerm: wire.fromTerm, receiverComp: wire.toComp, receiverTerm: wire.toTerm }
    : { wireId: wire.id, driverComp: wire.toComp, driverTerm: wire.toTerm, receiverComp: wire.fromComp, receiverTerm: wire.fromTerm };
};

const emptySnapshot = (): SimulationSnapshot => ({ time: 0, nodeVoltages: {}, terminalVoltages: {}, branchCurrents: {}, wireCurrents: {}, componentPowered: {}, componentIntensity: {}, nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings: [], converged: true });
const evaluateGate = (type: string, inputs: boolean[]) => {
  if (type === 'gate-and') return inputs.every(Boolean);
  if (type === 'gate-or') return inputs.some(Boolean);
  if (type === 'gate-not') return !inputs[0];
  if (type === 'gate-nand') return !inputs.every(Boolean);
  if (type === 'gate-nor') return !inputs.some(Boolean);
  const parity = inputs.filter(Boolean).length % 2 === 1;
  return type === 'gate-xor' ? parity : !parity;
};

export class IdealLogicEngine extends SimulationEngine {
  private logicComponents: CircuitComponent[] = [];
  private logicWires: CircuitWire[] = [];
  private logicTime = 0;
  private logicSnapshot: SimulationSnapshot = emptySnapshot();

  override setCircuit(components: CircuitComponent[], wires: CircuitWire[]) {
    this.logicComponents = components.filter(component => IDEAL_LOGIC_TYPES.has(component.type)).map(component => ({ ...component, props: { ...component.props } }));
    this.logicWires = wires.filter(wire => this.logicComponents.some(component => component.id === wire.fromComp) && this.logicComponents.some(component => component.id === wire.toComp)).map(wire => ({ ...wire, path: wire.path.map(point => [...point] as [number, number]) }));
    this.logicSnapshot = this.solve();
  }

  override reset() { this.logicTime = 0; this.logicSnapshot = emptySnapshot(); }
  override getSnapshot() { return this.logicSnapshot; }
  override getTime() { return this.logicTime; }
  override step(elapsedSeconds = 1 / 1000) { this.logicTime += Math.max(0, elapsedSeconds); this.logicSnapshot = this.solve(); return this.logicSnapshot; }

  private solve(): SimulationSnapshot {
    const componentById = new Map(this.logicComponents.map(component => [component.id, component]));
    const connections = this.logicWires.map(wire => resolveLogicConnection(wire, componentById)).filter((connection): connection is LogicConnection => Boolean(connection));
    const incoming = new Map<string, LogicConnection[]>();
    const warnings: SimulationWarning[] = [];
    connections.forEach(connection => {
      const key = terminalKey(connection.receiverComp, connection.receiverTerm);
      incoming.set(key, [...(incoming.get(key) ?? []), connection]);
    });
    const levels: Record<string, boolean> = {};
    const terminalVoltages: Record<string, number> = {};
    const componentPowered: Record<string, boolean> = {};
    this.logicComponents.filter(component => component.type === 'digital-input').forEach(component => {
      const level = component.props.state === 'HIGH';
      levels[terminalKey(component.id, 'out')] = level;
      terminalVoltages[terminalKey(component.id, 'out')] = level ? 1 : 0;
      componentPowered[component.id] = level;
    });
    for (let pass = 0; pass < Math.max(1, this.logicComponents.length * 2); pass += 1) {
      let changed = false;
      this.logicComponents.forEach(component => {
        if (component.type === 'digital-input') return;
        const inputs = inputTerminalsFor(component).map(terminal => {
          const drivers = incoming.get(terminalKey(component.id, terminal)) ?? [];
          if (drivers.length > 1) warnings.push({ code: 'multiple-logic-drivers', message: `Multiple logic drivers at ${component.label}:${terminal}; the first connection is used.`, componentId: component.id });
          const source = drivers[0];
          const level = source ? Boolean(levels[terminalKey(source.driverComp, source.driverTerm)]) : false;
          terminalVoltages[terminalKey(component.id, terminal)] = level ? 1 : 0;
          return level;
        });
        const result = component.type === 'digital-output' ? inputs[0] ?? false : evaluateGate(component.type, inputs);
        const output = OUTPUT_TERMINAL[component.type];
        if (output && levels[terminalKey(component.id, output)] !== result) changed = true;
        if (output) { levels[terminalKey(component.id, output)] = result; terminalVoltages[terminalKey(component.id, output)] = result ? 1 : 0; }
        componentPowered[component.id] = result;
      });
      if (!changed) break;
    }
    const levelForWire = new Map(connections.map(connection => [connection.wireId, Boolean(levels[terminalKey(connection.driverComp, connection.driverTerm)])]));
    const wireCurrents = Object.fromEntries(this.logicWires.map(wire => [wire.id, levelForWire.get(wire.id) ? 1 : 0]));
    return { time: this.logicTime, nodeVoltages: {}, terminalVoltages, branchCurrents: {}, wireCurrents, componentPowered, componentIntensity: Object.fromEntries(Object.entries(componentPowered).map(([id, level]) => [id, level ? 1 : 0])), nodeHistory: {}, branchHistory: {}, instrumentReadings: {}, warnings: warnings.filter((warning, index, all) => all.findIndex(item => item.message === warning.message) === index), converged: true };
  }
}
