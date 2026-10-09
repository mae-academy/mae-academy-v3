/**
 * Fluid simulation coordinator: owns the state of one circuit and advances it in fixed ticks.
 *
 * Each tick runs two passes:
 *   A. Pressure — spool positions and net pressures are relaxed together until they agree
 *      (a pilot signal can shift a valve that feeds another pilot within the same tick).
 *   B. Motion  — every cylinder and motor is integrated from the pressures, vent paths and flow
 *      coefficients found in pass A; then the limit switches are refreshed for the next tick and
 *      the hydraulic pump lines are checked.
 */
import {
  capsOf,
  connectionsOf,
  cylinderGeometry,
  cylinderMetaOf,
  detectMedium,
  exhaustsOf,
  initialValvePosition,
  isCushioned,
  isHydraulicPump,
  logicElementState,
  motorMetaOf,
  operatorActive,
  portsOf,
  reliefPortOf,
  resolveValvePosition,
  sensorLinksOf,
  sourcesOf,
  stepCylinder,
  stepMotor,
  stepVolume,
  valveState,
  valveTableOf,
  volumeCm3,
  volumeLitres,
  volumeMetaOf,
  type OperatorSignals,
  type SolverContext,
} from './componentSolvers';
import { buildNetGraph, diagnoseHydraulics, isConnected, solvePressures, type NetGraph, type PressureSolution } from './graphSolver';
import {
  DEFAULT_ENGINE_CONFIG,
  nodeId,
  type CylinderState,
  type EngineConfig,
  type EngineDiagnostic,
  type EngineMedium,
  type EngineNetwork,
  type EngineSnapshot,
  type FluidNetNode,
  type LogicElementState,
  type ManualInput,
  type MotorState,
  type NodeId,
  type OperatorSide,
  type PressureCap,
  type PressureSource,
  type ReliefState,
  type SensorLink,
  type TriggerDirection,
  type ValveState,
  type VolumeState,
} from './types';

const SETTLED = 1e-6;
const IDLE_CYLINDER: CylinderState = { stroke: 0, velocity: 0, force: 0, chamberPressureA: 0, chamberPressureB: 0 };
const IDLE_MOTOR: MotorState = { rpm: 0, angle: 0 };
const IDLE_VOLUME = { pressure: 0, rate: 0 };

/** Limit switch ids of a cylinder: S1 is made when fully retracted, S2 when fully extended. */
export const sensorId = (cylinderId: string, end: 'S1' | 'S2'): string => `${cylinderId}:${end}`;

/** When the cylinder last ran over a limit switch in each direction (simulation time, -Infinity if never). */
type Crossings = Record<TriggerDirection, number>;

export class FluidEngine {
  private readonly config: EngineConfig;
  private network: EngineNetwork = { components: [], wires: [] };
  private medium: EngineMedium = 'AIR';
  private graph: NetGraph = buildNetGraph([], []);
  private graphStale = true;
  private time = 0;
  /** Port pressures at the end of the last tick. */
  private pressures = new Map<NodeId, number>();
  private positions = new Map<string, number>();
  private cylinders = new Map<string, CylinderState>();
  private motors = new Map<string, MotorState>();
  private volumes = new Map<string, { pressure: number; rate: number }>();
  private sensors: Record<string, boolean> = {};
  private crossings = new Map<string, Crossings>();
  private manual = new Map<string, ManualInput>();
  private injections = new Map<NodeId, number>();
  private snapshot: EngineSnapshot;
  /** Highest source pressure of the last tick. */
  private supplyBar = 0;

  constructor(network: EngineNetwork, config: Partial<EngineConfig> = {}) {
    this.config = {
      ...DEFAULT_ENGINE_CONFIG,
      ...config,
      nominalPressure: { ...DEFAULT_ENGINE_CONFIG.nominalPressure, ...config.nominalPressure },
      idealVelocity: { ...DEFAULT_ENGINE_CONFIG.idealVelocity, ...config.idealVelocity },
      sensorLinks: [...(config.sensorLinks ?? [])],
    };
    this.snapshot = this.buildSnapshot();
    this.setNetwork(network);
  }

  /** Replaces the circuit. Valves, actuators and trapped pressure of surviving components keep their state. */
  setNetwork(network: EngineNetwork): void {
    this.network = network;
    this.medium = this.config.medium ?? detectMedium(network.components);
    this.graphStale = true;

    const positions = new Map<string, number>();
    const cylinders = new Map<string, CylinderState>();
    const motors = new Map<string, MotorState>();
    const volumes = new Map<string, { pressure: number; rate: number }>();
    for (const component of network.components) {
      const table = valveTableOf(component);
      if (table) positions.set(component.id, this.positions.get(component.id) ?? initialValvePosition(table, component.props));
      if (cylinderMetaOf(component)) cylinders.set(component.id, this.cylinders.get(component.id) ?? IDLE_CYLINDER);
      if (motorMetaOf(component)) motors.set(component.id, this.motors.get(component.id) ?? IDLE_MOTOR);
      if (volumeMetaOf(component)) volumes.set(component.id, this.volumes.get(component.id) ?? IDLE_VOLUME);
    }
    this.volumes = volumes;
    this.positions = positions;
    this.cylinders = cylinders;
    this.motors = motors;

    this.ensureGraph();
    const pressures = new Map<NodeId, number>();
    this.pressures.forEach((value, node) => { if (this.graph.netOf.has(node)) pressures.set(node, value); });
    this.pressures = pressures;
    this.refreshSensors();
    this.snapshot = this.buildSnapshot();
  }

  /** Presses or releases a manual / mechanical operator on one end of a directional valve. */
  setManual(componentId: string, side: OperatorSide, active: boolean): void {
    const current = this.manual.get(componentId) ?? { left: false, right: false };
    this.manual.set(componentId, { ...current, [side]: active });
  }

  /**
   * Forces a port from outside the circuit: a positive value supplies that pressure,
   * 0 opens the port to atmosphere, null removes the override.
   */
  injectPressure(componentId: string, portId: string, bar: number | null): void {
    const node = nodeId(componentId, portId);
    if (bar === null) this.injections.delete(node); else this.injections.set(node, Math.max(0, bar));
    this.graphStale = true;
  }

  /** Reed-switch style couplings: while a sensor is made, pressure is injected into a pilot port. */
  setSensorLinks(links: SensorLink[]): void {
    this.config.sensorLinks = [...links];
    this.graphStale = true;
  }

  /** Returns every component to its initial state and releases all inputs and trapped pressure. */
  reset(): void {
    this.time = 0;
    this.pressures = new Map();
    this.manual = new Map();
    this.injections = new Map();
    this.positions = new Map();
    this.cylinders = new Map();
    this.motors = new Map();
    this.volumes = new Map();
    this.crossings = new Map();
    this.setNetwork(this.network);
  }

  /** Advances the simulation by `dt` seconds (in fixed sub-steps of `config.dt`) and returns the new state. */
  step(dt: number = this.config.dt): EngineSnapshot {
    let remaining = Math.max(0, dt);
    while (remaining > 1e-9) {
      const h = Math.min(this.config.dt, remaining);
      this.tick(h);
      remaining -= h;
    }
    return this.snapshot;
  }

  getSnapshot(): EngineSnapshot {
    return this.snapshot;
  }

  /* ───────────────────────── internals ───────────────────────── */

  private ensureGraph(): void {
    if (!this.graphStale) return;
    const nodes: NodeId[] = [];
    for (const component of this.network.components) {
      for (const port of portsOf(component)) nodes.push(nodeId(component.id, port));
    }
    this.injections.forEach((_bar, node) => nodes.push(node));
    for (const link of this.config.sensorLinks) nodes.push(nodeId(link.componentId, link.portId));
    this.graph = buildNetGraph(nodes, this.network.wires);
    this.graphStale = false;
  }

  private tick(h: number): void {
    this.ensureGraph();
    const { components } = this.network;
    const { config, medium, graph } = this;
    const nominal = config.nominalPressure[medium];

    /* Boundary conditions: supplies, exhausts and relief limits do not depend on the valve state. */
    const sources: PressureSource[] = [];
    const exhausts: NodeId[] = [];
    const caps: PressureCap[] = [];
    for (const component of components) {
      sources.push(...sourcesOf(component, { config, medium }));
      caps.push(...capsOf(component));
      for (const exhaust of exhaustsOf(component)) {
        if (!exhaust.whenUnconnected || !isConnected(graph, exhaust.node)) exhausts.push(exhaust.node);
      }
    }
    this.injections.forEach((bar, node) => { if (bar > 0) sources.push({ node, pressure: bar }); else exhausts.push(node); });
    // Reed switches: wired explicitly through the config, or declared on a pilot-operated valve end.
    for (const link of [...config.sensorLinks, ...components.flatMap(sensorLinksOf)]) {
      const node = nodeId(link.componentId, link.portId);
      if (this.sensors[link.sensorId]) sources.push({ node, pressure: link.pressure ?? nominal }); else exhausts.push(node);
    }

    this.supplyBar = sources.reduce((max, source) => Math.max(max, source.pressure), 0);

    /* Pass A — relax spool positions and pressures together. */
    const held = this.pressures;
    const previous = (node: NodeId) => held.get(node) ?? 0;
    const sensorMade = (id: string) => Boolean(this.sensors[id]);
    const sensorTripped = (id: string, direction: TriggerDirection) => this.time - (this.crossings.get(id)?.[direction] ?? -Infinity) < config.idleRollerPulse - 1e-9;
    let estimate = held;
    let solution: PressureSolution = { pressure: [], vented: [], firm: [], relief: [], clamped: [], inflow: [], outflow: [], volumeLinks: [] };
    const volumeNodes = components.flatMap(component => (volumeMetaOf(component)?.ports ?? []).map(port => nodeId(component.id, port)));
    for (let round = 0; round < config.maxRelaxations; round += 1) {
      const current = estimate;
      const ctx: SolverContext = {
        config,
        medium,
        pressure: (componentId, portId) => current.get(nodeId(componentId, portId)) ?? 0,
        valvePosition: componentId => this.positions.get(componentId) ?? 0,
      };

      let moved = false;
      const shifts: Array<[string, number]> = [];
      for (const component of components) {
        const table = valveTableOf(component);
        if (!table) continue;
        const position = this.positions.get(component.id) ?? initialValvePosition(table, component.props);
        const signals: OperatorSignals = { manual: this.manual.get(component.id), sensorMade, sensorTripped };
        const next = resolveValvePosition(table, component.props, operatorActive(component, 'left', signals, ctx), operatorActive(component, 'right', signals, ctx), position);
        if (next !== position) shifts.push([component.id, next]);
      }
      for (const [id, position] of shifts) { this.positions.set(id, position); moved = true; }

      const connections = components.flatMap(component => connectionsOf(component, ctx));
      solution = solvePressures({ graph, connections, sources, exhausts, caps, previous, openPortsVent: medium === 'AIR', volumes: volumeNodes });

      const next = new Map<NodeId, number>();
      let settled = !moved;
      graph.members.forEach((group, index) => {
        const pressure = solution.pressure[index];
        for (const node of group) {
          next.set(node, pressure);
          if (Math.abs(pressure - (current.get(node) ?? 0)) > SETTLED) settled = false;
        }
      });
      estimate = next;
      if (settled) break;
    }
    this.pressures = estimate;

    /*
     * Storage volumes. A chamber that the solver found held by a supply or open to exhaust takes that pressure at once;
     * otherwise it keeps its pressure and is charged or drained through the restrictors around it, over time.
     */
    for (const component of components) {
      const meta = volumeMetaOf(component);
      if (!meta) continue;
      const nets = Array.from(new Set(meta.ports.map(port => graph.netOf.get(nodeId(component.id, port))).filter((net): net is number => net !== undefined)));
      if (nets.length === 0) continue;
      const state = this.volumes.get(component.id) ?? IDLE_VOLUME;
      const solved = solution.pressure[nets[0]];
      let next = solved;
      if (!nets.some(net => solution.firm[net] || solution.vented[net])) {
        const feeds = solution.volumeLinks.filter(link => nets.includes(link.volume)).map(link => ({ ...link, pressure: solution.pressure[link.other] }));
        next = stepVolume(solved, feeds, volumeLitres(component), h);
        const relief = Math.min(...nets.map(net => solution.relief[net]));
        if (next > relief) next = relief;
      }
      this.volumes.set(component.id, { pressure: next, rate: (next - state.pressure) / h });
      for (const net of nets) {
        solution.pressure[net] = next;
        for (const node of graph.members[net]) this.pressures.set(node, next);
      }
    }

    /* Pass B — integrate the actuators. */
    const flow = new Array<number>(graph.members.length).fill(0);
    const pressureOf = (net: number | undefined) => (net === undefined ? 0 : solution.pressure[net]);
    const canDischarge = (net: number | undefined) => net === undefined || solution.vented[net] || solution.firm[net];
    // Flow coefficient of the line feeding / draining a port. A line the solver could not rate
    // (fed by trapped pressure, or discharging back into a supply) is taken as unrestricted.
    const feed = (net: number | undefined) => (net !== undefined && solution.inflow[net] > 0 ? solution.inflow[net] : 1);
    const drain = (net: number | undefined) => (net !== undefined && solution.outflow[net] > 0 ? solution.outflow[net] : 1);
    let consuming = false;

    const strokesBefore = new Map<string, number>();
    for (const component of components) {
      const meta = cylinderMetaOf(component);
      if (!meta) continue;
      const geometry = cylinderGeometry(component, meta);
      const netA = graph.netOf.get(nodeId(component.id, meta.rear));
      const netB = meta.front ? graph.netOf.get(nodeId(component.id, meta.front)) : undefined;
      const state = this.cylinders.get(component.id) ?? IDLE_CYLINDER;
      strokesBefore.set(component.id, state.stroke);
      const next = stepCylinder(
        state,
        geometry,
        meta,
        {
          pressureA: pressureOf(netA),
          pressureB: pressureOf(netB),
          canDischargeA: canDischarge(netA),
          canDischargeB: canDischarge(netB),
          // v = v_ideal · Cv, with Cv set by the tighter of the filling and the exhausting line.
          throttleExtend: Math.min(feed(netA), drain(netB)),
          throttleRetract: Math.min(drain(netA), feed(netB)),
        },
        { idealVelocity: config.idealVelocity[medium], cushionZone: config.cushionZone, cushioned: isCushioned(component) },
        h,
      );
      this.cylinders.set(component.id, next);
      if (next.velocity !== 0) consuming = true;
      const litresPerMinute = Math.abs(next.velocity) * 60000; // m³/s → L/min
      if (netA !== undefined) flow[netA] += litresPerMinute * geometry.areaA;
      if (netB !== undefined) flow[netB] += litresPerMinute * geometry.areaB;
    }

    for (const component of components) {
      const meta = motorMetaOf(component);
      if (!meta) continue;
      const netIn = graph.netOf.get(nodeId(component.id, meta.inlet));
      const netOut = graph.netOf.get(nodeId(component.id, meta.outlet));
      const next = stepMotor(
        component,
        meta,
        this.motors.get(component.id) ?? IDLE_MOTOR,
        {
          pressureIn: pressureOf(netIn),
          pressureOut: pressureOf(netOut),
          canDischargeIn: canDischarge(netIn),
          canDischargeOut: canDischarge(netOut),
          flowForward: Math.min(feed(netIn), drain(netOut)),
          flowReverse: Math.min(feed(netOut), drain(netIn)),
        },
        { nominalPressure: nominal, threshold: config.gateThreshold, swivelTime: config.swivelTime },
        h,
      );
      this.motors.set(component.id, next);
      if (next.rpm !== 0) consuming = true;
    }

    this.time += h;
    this.refreshSensors(strokesBefore);

    const pumps = medium === 'OIL' ? components.filter(isHydraulicPump).flatMap(pump => sourcesOf(pump, { config, medium }).map(source => ({ componentId: pump.id, node: source.node }))) : [];
    this.snapshot = this.buildSnapshot(solution, flow, diagnoseHydraulics(graph, solution, pumps, consuming));
  }

  /** Fraction of the stroke at each end in which a cylinder's limit switch is made: the ±3 mm tolerance over its stroke length. */
  private sensorWindowOf(cylinderId: string): number {
    const component = this.network.components.find(candidate => candidate.id === cylinderId);
    const meta = component && cylinderMetaOf(component);
    const lengthMm = component && meta ? cylinderGeometry(component, meta).length * 1000 : 100;
    return Math.min(0.5, this.config.sensorToleranceMm / lengthMm);
  }

  /** Reads the limit switches; with the strokes from before the step it also records which way each was run over. */
  private refreshSensors(strokesBefore?: Map<string, number>): void {
    const sensors: Record<string, boolean> = {};
    this.cylinders.forEach((state, id) => {
      const window = this.sensorWindowOf(id);
      sensors[sensorId(id, 'S1')] = state.stroke <= window;
      sensors[sensorId(id, 'S2')] = state.stroke >= 1 - window;
      const before = strokesBefore?.get(id);
      if (before === undefined || before === state.stroke) return;
      const direction: TriggerDirection = state.stroke > before ? 'EXTEND_ONLY' : 'RETRACT_ONLY';
      for (const end of ['S1', 'S2'] as const) {
        const sensor = sensorId(id, end);
        // The cam passes the switch whenever its state changes, entering or leaving its window.
        if (sensors[sensor] === Boolean(this.sensors[sensor])) continue;
        const crossings = this.crossings.get(sensor) ?? { EXTEND_ONLY: -Infinity, RETRACT_ONLY: -Infinity };
        this.crossings.set(sensor, { ...crossings, [direction]: this.time });
      }
    });
    this.sensors = sensors;
  }

  private buildSnapshot(solution?: PressureSolution, flow?: number[], diagnostics: EngineDiagnostic[] = []): EngineSnapshot {
    const { graph, medium } = this;
    const portPressure: Record<NodeId, number> = {};
    const nets: FluidNetNode[] = graph.members.map((group, index) => {
      const pressure = solution ? solution.pressure[index] : group.reduce((max, node) => Math.max(max, this.pressures.get(node) ?? 0), 0);
      for (const node of group) portPressure[node] = pressure;
      return { id: group[0], pressure, flowRate: flow?.[index] ?? 0, medium, isExhaust: solution?.vented[index] ?? false, connectedPortIds: group };
    });

    const valves: Record<string, ValveState> = {};
    const logic: Record<string, LogicElementState> = {};
    const reliefValves: Record<string, ReliefState> = {};
    for (const component of this.network.components) {
      const table = valveTableOf(component);
      if (table) valves[component.id] = valveState(table, component.props, this.positions.get(component.id) ?? initialValvePosition(table, component.props));
      const state = logicElementState(component, port => portPressure[nodeId(component.id, port)] ?? 0, this.config);
      if (state) logic[component.id] = state;
      if (reliefPortOf(component)) {
        // Open = the line sits at this valve's own setting and something is being held down at that setting. A power unit's pump side is
        // the clamped net although its outlet only carries the limited pressure; a second relief valve staged at a lower setting leaves this one shut.
        const open = capsOf(component).some(cap => (portPressure[cap.node] ?? 0) >= cap.limit - SETTLED
          && Boolean(solution?.clamped.some((held, net) => held && Math.abs(solution.relief[net] - cap.limit) < SETTLED)));
        reliefValves[component.id] = { open };
      }
    }
    const cylinders: Record<string, CylinderState> = {};
    this.cylinders.forEach((state, id) => { cylinders[id] = state; });
    const motors: Record<string, MotorState> = {};
    this.motors.forEach((state, id) => { motors[id] = state; });
    const volumes: Record<string, VolumeState> = {};
    for (const component of this.network.components) {
      const state = this.volumes.get(component.id);
      if (state) volumes[component.id] = { ...state, volumeCm3: volumeCm3(component), supply: this.supplyBar > 0 ? this.supplyBar : this.config.nominalPressure[medium] };
    }

    return { time: this.time, medium, nets, portPressure, valves, cylinders, logic, motors, reliefValves, volumes, diagnostics, sensors: { ...this.sensors } };
  }
}
