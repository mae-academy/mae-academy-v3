/**
 * Mechanical state of the five dissectable assemblies, derived from the engine snapshot.
 *
 * Everything here is a pure function of (component, snapshot): no React, no SVG. The renderers
 * draw what these functions report, and the descriptions shown under the stage come from the
 * same geometry, so the picture and the text cannot disagree.
 */
import { SPRING_PRELOAD_BAR, chargeTime, springEquilibriumStroke, springPressure } from '@shared/fluid/engine/componentSolvers';
import { DEFAULT_ENGINE_CONFIG, type EngineSnapshot } from '@shared/fluid/engine/types';
import { PILOT_LEFT, PILOT_RIGHT } from '@shared/fluid/engine/valveTables';
import { englishFluidT, joinList, type FluidTranslate } from '../../i18n/fluidText';

export type CutawayKind = 'and' | 'or' | 'check' | 'springCheck' | 'throttle' | 'oneway' | 'spool22' | 'spool32' | 'spool42' | 'spool52' | 'spool53' | 'spool43' | 'spool43float' | 'cushion' | 'single' | 'reservoir' | 'timer' | 'quickExhaust' | 'regulator' | 'relief' | 'gauge';

export interface CutawayComponent {
  id: string;
  type: string;
  label: string;
  props: Record<string, unknown>;
}

const KIND_BY_TYPE: Record<string, CutawayKind> = {
  'dual-pressure-valve': 'and',
  'shuttle-valve': 'or',
  'quick-exhaust': 'quickExhaust',
  'pressure-gauge': 'gauge',
  'regulator-nr': 'regulator',
  'regulator-relieving': 'regulator',
  'pressure-relief': 'relief',
  'hyd-pressure-relief': 'relief',
  'check-valve': 'check',
  'check-valve-spring': 'springCheck',
  'flow-control': 'throttle',
  'flow-control-oneway': 'oneway',
  'valve-2-2-nc': 'spool22',
  'valve-2-2-no': 'spool22',
  'valve-4-2': 'spool42',
  'hvalve-4-2': 'spool42',
  'valve-3-2-nc': 'spool32',
  'valve-3-2-no': 'spool32',
  'hvalve-3-2-nc': 'spool32',
  'valve-5-2': 'spool52',
  'valve-5-3': 'spool53',
  'hvalve-4-3': 'spool43',
  'hvalve-4-3-float': 'spool43float',
  'air-reservoir': 'reservoir',
  'time-delay-valve': 'timer',
  'cylinder-single': 'single',
  'cylinder-double': 'cushion',
  'cylinder-double-rod': 'cushion',
};

/** Which cutaway a component opens, or null when it has none. */
export const cutawayKindOf = (component: Pick<CutawayComponent, 'type'>): CutawayKind | null => KIND_BY_TYPE[component.type] ?? null;

/** Display name of a cutaway in the active language. */
export const cutawayName = (kind: CutawayKind, tr: FluidTranslate = englishFluidT): string => tr(`cutaway.names.${kind}`);

export type StateTone = 'idle' | 'open' | 'blocked' | 'active';

export interface PortReading {
  port: string;
  /** ISO number or letter shown next to the value. */
  label: string;
  bar: number;
}

interface BaseAnalysis {
  kind: CutawayKind;
  /** Operating-state badge text. */
  state: string;
  tone: StateTone;
  readings: PortReading[];
  /** Plain-language account of where the fluid is going. */
  description: string;
  /** Live transient figures shown beside the readings (reservoir, timer). */
  metrics?: Array<{ id: string; label: string; value: string }>;
}

const EPS = 0.01;
const bar = (value: number) => `${value.toFixed(1)} bar`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const portPressure = (snapshot: EngineSnapshot, component: Pick<CutawayComponent, 'id'>, port: string): number =>
  snapshot.portPressure[`${component.id}:${port}`] ?? 0;

/* ───────────────────────── Logic gates ───────────────────────── */

/** Pressure above which an inlet counts as a signal (matches the engine's gate threshold). */
export const GATE_THRESHOLD = 0.5;

export interface GateAnalysis extends BaseAnalysis {
  kind: 'and' | 'or';
  /** Normalized travel of the ball / spool, -1 … 1 (+1: pushed to the right by the left inlet). */
  offset: number;
  left: number;
  right: number;
  out: number;
  leftOn: boolean;
  rightOn: boolean;
  /** Port 2 is connected to at least one live inlet. */
  open: boolean;
}

function gateBase(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate) {
  const left = portPressure(snapshot, component, 'x');
  const right = portPressure(snapshot, component, 'y');
  const out = portPressure(snapshot, component, 'out');
  return {
    offset: snapshot.logic[component.id]?.offset ?? 0,
    left,
    right,
    out,
    leftOn: left > GATE_THRESHOLD,
    rightOn: right > GATE_THRESHOLD,
    readings: [
      { port: 'x', label: tr('cutaway.portLeft'), bar: left },
      { port: 'y', label: tr('cutaway.portRight'), bar: right },
      { port: 'out', label: '2', bar: out },
    ],
  };
}

export function analyzeAnd(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): GateAnalysis {
  const base = gateBase(component, snapshot, tr);
  const open = base.leftOn && base.rightOn;
  let state = tr('cutaway.and.idle');
  let tone: StateTone = 'idle';
  let description = tr('cutaway.and.idleText');
  if (open) {
    state = tr('cutaway.and.open');
    tone = 'open';
    description = tr('cutaway.and.openText', { bar: bar(Math.min(base.left, base.right)) });
  } else if (base.leftOn) {
    state = tr('cutaway.and.blockedLeft');
    tone = 'blocked';
    description = tr('cutaway.and.blockedLeftText');
  } else if (base.rightOn) {
    state = tr('cutaway.and.blockedRight');
    tone = 'blocked';
    description = tr('cutaway.and.blockedRightText');
  }
  return { kind: 'and', state, tone, description, open, ...base };
}

export function analyzeOr(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): GateAnalysis {
  const base = gateBase(component, snapshot, tr);
  const open = base.leftOn || base.rightOn;
  let state = tr('cutaway.or.idle');
  let tone: StateTone = 'idle';
  let description = tr('cutaway.or.idleText');
  if (base.leftOn && base.rightOn) {
    state = tr('cutaway.or.both');
    tone = 'open';
    description = tr('cutaway.or.bothText', { bar: bar(Math.max(base.left, base.right)) });
  } else if (base.leftOn) {
    state = tr('cutaway.or.left');
    tone = 'open';
    description = tr('cutaway.or.leftText');
  } else if (base.rightOn) {
    state = tr('cutaway.or.right');
    tone = 'open';
    description = tr('cutaway.or.rightText');
  }
  return { kind: 'or', state, tone, description, open, ...base };
}

/* ───────────────────────── Spool valves ───────────────────────── */

export type SpoolPort = '1' | '2' | '3' | '4' | '5';

/** Layout of one spool-valve body: where its annular chambers, lands and end walls sit. All x are stage coordinates. */
export interface SpoolBody {
  /** Ports left to right, one per annular chamber. */
  ports: readonly SpoolPort[];
  /** x of each annular chamber (and of its port). */
  chamberX: readonly number[];
  /** Ports that open on the top face of the body; the others open at the bottom. */
  top: readonly SpoolPort[];
  /** One switching step of the spool, in px. */
  pitch: number;
  landHalf: number;
  /** Half width of a chamber's radial opening in the bore. */
  openingHalf: number;
  /** Number of sealing lands and the spacing between them. */
  lands: number;
  landSpacing: number;
  wallLeft: number;
  wallRight: number;
  /** Length of shaft between the outer land and the end of the spool. */
  stem: number;
  /** x of the first land at offset 0, and the spool travel per unit of offset. */
  restStart: number;
  /** Port shown (and read from the engine) under another number, e.g. a 4/2's second exhaust chamber is port 3. */
  labels?: Partial<Record<SpoolPort, SpoolPort>>;
  /** Hydraulic letters drawn instead of the ISO numbers (P, B, T, A). */
  letters?: Partial<Record<SpoolPort, string>>;
  /**
   * Hydraulic 4-port valve: the two tank chambers (5 and 3) are cross-drilled into one duct above the bore, so the housing shows a
   * single tank port T and exactly four ports P, T, A, B.
   */
  tankDuct?: boolean;
  /** Hydraulic housing: oil returning to the tank is shown in its own colour, with a path from the working port to T. */
  hydraulic?: boolean;
}

/** Name printed for a chamber's port: the hydraulic letter where the body has one, else the (aliased) ISO number. */
export const spoolPortLabel = (body: SpoolBody, port: SpoolPort): string => body.letters?.[body.labels?.[port] ?? port] ?? body.labels?.[port] ?? port;

/** 5-port body, left to right: exhaust 5, work 4, supply 1, work 2, exhaust 3. */
export const SPOOL_BODY: SpoolBody = {
  ports: ['5', '4', '1', '2', '3'],
  chamberX: [210, 300, 390, 480, 570],
  top: ['4', '2'],
  pitch: 90,
  landHalf: 28,
  openingHalf: 12,
  lands: 3,
  landSpacing: 180,
  wallLeft: 40,
  wallRight: 740,
  stem: 30,
  restStart: 165,
};

/** 4/2: the 5-port body with both exhaust chambers joined to port 3 (rest 1→2, 4→3; actuated 1→4, 2→3). */
export const SPOOL42_BODY: SpoolBody = { ...SPOOL_BODY, labels: { '5': '3' } };

/** Hydraulic housing: tank chambers on top joined by one duct, A, P and B below; ports are named P, T, A, B. */
const HYDRAULIC_HOUSING = { labels: { '5': '3' }, letters: { '1': 'P', '2': 'B', '3': 'T', '4': 'A' }, top: ['5', '3'], tankDuct: true, hydraulic: true } as const satisfies Partial<SpoolBody>;
/** Hydraulic 4/2: the five-chamber spool of a 5/2 with its two tank chambers cross-drilled to the single port T. */
export const SPOOL42_HYDRAULIC_BODY: SpoolBody = { ...SPOOL_BODY, ...HYDRAULIC_HOUSING };
/** Hydraulic 4/3, closed centre: the three lands sit over T, P and T in the middle, so P, T, A and B are all shut. */
export const SPOOL43_BODY: SpoolBody = { ...SPOOL_BODY, ...HYDRAULIC_HOUSING };
/**
 * Hydraulic 4/3, float centre: two outer lands and one over P. In the middle only P is shut, so A and B stay open to tank;
 * a 45 px stroke either way parts the lands from P and seals the opposite tank chamber (P→A, B→T or P→B, A→T).
 */
export const SPOOL43_FLOAT_BODY: SpoolBody = { ...SPOOL_BODY, ...HYDRAULIC_HOUSING, landSpacing: 240, restStart: 150, pitch: 45, stem: 8 };

/** 2/2 (normally open): port 1 below, port 2 above; the left land seals port 1 when the spool is pushed one pitch. */
export const SPOOL22_BODY: SpoolBody = {
  ports: ['1', '2'], chamberX: [390, 480], top: ['2'], pitch: 90, landHalf: 28, openingHalf: 12, lands: 2, landSpacing: 240, wallLeft: 40, wallRight: 740, stem: 30, restStart: 300,
};

/**
 * 3/2 body: work port 2 on top between the two bottom ports. A left operator pushes the spool one pitch to the right, which
 * brings the spool's LEFT segment over the ports; the port order is therefore mirrored between the two types so that
 * the segment under the ports matches the engine's flow table (normally closed: left segment 1→2, rest 2→3;
 * normally open: left segment 2→3, rest 1→2).
 */
const spool32Body = (ports: readonly SpoolPort[], chamberX: readonly number[], pitch: number, restStart: number): SpoolBody => ({
  ports, chamberX, top: ['2'], pitch, landHalf: 28, openingHalf: 12, lands: 2, landSpacing: 240, wallLeft: 40, wallRight: 740, stem: 30, restStart,
});
/**
 * Normally closed, ISO layout 1 · 2 · 3 left to right. At rest the right land seals port 1 and 2 vents to 3 through the
 * open pocket; the pushbutton drives the spool a long stroke to the right until the land seals port 3 and the groove joins 1 to 2.
 */
export const SPOOL32_NC_BODY: SpoolBody = spool32Body(['1', '2', '3'], [358, 448, 538], 180, 118);
/** Normally open, same layout: at rest the groove joins 1 to 2 under a land on 3; actuated, a land seals port 1 and 2 vents to 3. */
export const SPOOL32_NO_BODY: SpoolBody = spool32Body(['1', '2', '3'], [300, 390, 480], 60, 240);

/** Hydraulic 3/2: ports P, A (port 2) and T; A drains to tank at rest. */
export const SPOOL32_HYDRAULIC_BODY: SpoolBody = { ...SPOOL32_NC_BODY, letters: { '1': 'P', '2': 'A', '3': 'T' }, hydraulic: true };

export type SpoolKind = 'spool22' | 'spool32' | 'spool42' | 'spool52' | 'spool53' | 'spool43' | 'spool43float';
/** Spring-centred 3-position valves. */
export const isThreePosition = (kind: SpoolKind) => kind === 'spool53' || kind === 'spool43' || kind === 'spool43float';
/** Body of a spool-valve cutaway; the 3/2 layout depends on whether the valve is normally open. */
export const spoolBodyOf = (kind: SpoolKind, type?: string): SpoolBody =>
  kind === 'spool32' ? (type === 'valve-3-2-no' ? SPOOL32_NO_BODY : type === 'hvalve-3-2-nc' ? SPOOL32_HYDRAULIC_BODY : SPOOL32_NC_BODY) : kind === 'spool22' ? SPOOL22_BODY : kind === 'spool42' ? (type?.startsWith('hvalve-') ? SPOOL42_HYDRAULIC_BODY : SPOOL42_BODY) : kind === 'spool43' ? SPOOL43_BODY : kind === 'spool43float' ? SPOOL43_FLOAT_BODY : SPOOL_BODY;

/** Ports that open on the top face of the 5-port body; the others open at the bottom. */
export const TOP_PORTS: readonly SpoolPort[] = SPOOL_BODY.top;
export const EXHAUST_PORTS: readonly SpoolPort[] = ['3', '5'];

/**
 * x of the first land (rest + one body pitch per unit of offset).
 *   3/2 NC: rest 118, actuated 298 (one 180 px stroke). 3/2 NO: rest 240, actuated 300. 2/2: 300 → 390.
 *   5/2: rest 165, actuated 255 (one pitch to the right).
 *   5/3: right pilot 165, centre 210, left pilot 255.
 */
export const spoolStart = (kind: SpoolKind, offset: number, type?: string): number =>
  kind === 'spool53' || kind === 'spool43' ? 210 + (SPOOL_BODY.pitch / 2) * offset : spoolBodyOf(kind, type).restStart + spoolBodyOf(kind, type).pitch * offset;

export const landPositions = (start: number, body: SpoolBody = SPOOL_BODY): number[] => Array.from({ length: body.lands }, (_, index) => start + index * body.landSpacing);

export interface SpoolInterval {
  /** Bore segment between two lands (or a land and an end wall). */
  x0: number;
  x1: number;
  /** Ports whose radial opening lies in this segment, i.e. that are connected to each other. */
  ports: SpoolPort[];
  /** Highest pressure among them. */
  bar: number;
  /** An exhaust port is among them. */
  vented: boolean;
}

export interface SpoolConnection {
  from: SpoolPort;
  to: SpoolPort;
  /** 'return': oil leaving a working port for the tank (hydraulic housings only). */
  kind?: 'supply' | 'return';
}

export interface SpoolAnalysis extends BaseAnalysis {
  kind: SpoolKind;
  /** Layout the renderer draws the valve on. */
  body: SpoolBody;
  offset: number;
  /** x of the first land; the spool is drawn translated to it. */
  start: number;
  lands: number[];
  /** Ports whose radial opening is closed by a land. */
  covered: SpoolPort[];
  /** Ports left alone in a segment of their own (isolated, nothing to connect to). */
  intervals: SpoolInterval[];
  /** Fluid paths through the grooves, from the pressurised port to the others in the same segment. */
  connections: SpoolConnection[];
  pressures: Record<SpoolPort, number>;
  pilotLeft: number | null;
  pilotRight: number | null;
  operators: { left: string; right: string };
}

/** A hydraulic segment that joins the tank to the working lines without the supply: its oil is on its way back to the tank. */
export const isReturnInterval = (body: SpoolBody, interval: Pick<SpoolInterval, 'ports'>): boolean =>
  Boolean(body.hydraulic) && interval.ports.some(port => EXHAUST_PORTS.includes(port)) && !interval.ports.includes('1');

/** Which chambers a set of land positions connects, and which ports it closes. */
export function spoolGeometry(lands: number[], body: SpoolBody = SPOOL_BODY): { covered: SpoolPort[]; intervals: Array<Pick<SpoolInterval, 'x0' | 'x1' | 'ports'>> } {
  const { ports, chamberX, landHalf, openingHalf, wallLeft, wallRight } = body;
  const sorted = [...lands].sort((a, b) => a - b);
  const covered = ports.filter((_, index) => sorted.some(land => Math.abs(land - chamberX[index]) <= landHalf - openingHalf));

  const edges: Array<[number, number]> = [];
  let cursor = wallLeft;
  for (const land of sorted) {
    edges.push([cursor, land - landHalf]);
    cursor = land + landHalf;
  }
  edges.push([cursor, wallRight]);

  const intervals = edges
    .filter(([x0, x1]) => x1 > x0)
    .map(([x0, x1]) => ({
      x0,
      x1,
      ports: ports.filter((port, index) => !covered.includes(port) && chamberX[index] > x0 + openingHalf && chamberX[index] < x1 - openingHalf),
    }));
  return { covered, intervals };
}

const PORT_ROLE: Record<SpoolPort, string> = { '1': 'Supply', '2': 'Working', '4': 'Working', '3': 'Exhaust', '5': 'Exhaust' };

/** Describes the fluid paths a spool position creates. */
export function describeSpool(intervals: SpoolInterval[], pressures: Record<SpoolPort, number>, tr: FluidTranslate = englishFluidT, body: SpoolBody = SPOOL_BODY): string {
  const sentences: string[] = [];
  const grouped = new Set<SpoolPort>();
  const name = (port: SpoolPort) => spoolPortLabel(body, port);
  for (const interval of intervals) {
    if (interval.ports.length < 2) continue;
    interval.ports.forEach(port => grouped.add(port));
    const ordered = [...interval.ports].sort((a, b) => Number(a) - Number(b));
    const supply = ordered.includes('1');
    const exhaust = ordered.filter(port => EXHAUST_PORTS.includes(port));
    const work = ordered.filter(port => port === '2' || port === '4');
    if (supply && work.length) sentences.push(tr('cutaway.spool.groove.supplyWork', { ports: joinList(tr, work.map(name)) }));
    else if (work.length && exhaust.length) sentences.push(tr('cutaway.spool.groove.workExhaust', { work: joinList(tr, work.map(name)), exhaust: joinList(tr, exhaust.map(name)) }));
    else sentences.push(tr('cutaway.spool.groove.share', { ports: joinList(tr, ordered.map(name)) }));
  }
  for (const port of body.ports) {
    if (grouped.has(port)) continue;
    const role = PORT_ROLE[port];
    if (port === '1') sentences.push(tr('cutaway.spool.supplyBlocked'));
    else if (role === 'Working') sentences.push(pressures[port] > EPS ? tr('cutaway.spool.workTrapped', { port: name(port), bar: bar(pressures[port]) }) : tr('cutaway.spool.workSealed', { port: name(port) }));
    else sentences.push(tr('cutaway.spool.exhaustSealed', { port: name(port) }));
  }
  return `${sentences.join('. ')}.`;
}

const operatorName = (value: unknown): string => (typeof value === 'string' && value !== '' ? value : 'None');

export function analyzeSpool(component: CutawayComponent, snapshot: EngineSnapshot, kind: SpoolKind, tr: FluidTranslate = englishFluidT): SpoolAnalysis {
  const offset = snapshot.valves[component.id]?.spoolOffset ?? 0;
  const body = spoolBodyOf(kind, component.type);
  const start = spoolStart(kind, offset, component.type);
  const lands = landPositions(start, body);
  const { covered, intervals: raw } = spoolGeometry(lands, body);

  const pressures = Object.fromEntries(body.ports.map(port => [port, portPressure(snapshot, component, `p${body.labels?.[port] ?? port}`)])) as Record<SpoolPort, number>;
  const intervals: SpoolInterval[] = raw.map(interval => ({
    ...interval,
    bar: Math.max(0, ...interval.ports.map(port => pressures[port])),
    vented: interval.ports.some(port => EXHAUST_PORTS.includes(port)),
  }));

  // A groove carries fluid from its highest-pressure port to the other ports it joins.
  const connections: SpoolConnection[] = intervals.flatMap((interval): SpoolConnection[] => {
    if (isReturnInterval(body, interval)) {
      // Hydraulic: a working line open to the tank always drains there, pressure or not.
      const tank = interval.ports.find(port => EXHAUST_PORTS.includes(port))!;
      return interval.ports.filter(port => port === '2' || port === '4').map(port => ({ from: port, to: tank, kind: 'return' as const }));
    }
    if (interval.ports.length < 2 || interval.bar <= EPS) return [];
    // Ports at equal pressure (the groove is filled): the supply port is the one the fluid comes from.
    const source = interval.ports.reduce((best, port) => (pressures[port] > pressures[best] + EPS || (Math.abs(pressures[port] - pressures[best]) <= EPS && port === '1') ? port : best));
    return interval.ports.filter(port => port !== source).map(port => ({ from: source, to: port }));
  });

  const actuatedLeft = offset > 0.5;
  const actuatedRight = offset < -0.5;
  let state: string;
  let tone: StateTone;
  if (kind === 'spool22') {
    state = actuatedLeft ? tr('cutaway.spool.actuated22') : tr('cutaway.spool.rest22');
    tone = actuatedLeft ? 'blocked' : 'open';
  } else if (kind === 'spool42') {
    state = actuatedLeft ? tr('cutaway.spool.actuated42') : tr('cutaway.spool.rest42');
    tone = actuatedLeft ? 'active' : 'idle';
  } else if (kind === 'spool32') {
    // Normally closed: 2→3 at rest, 1→2 actuated. Normally open: the other way round.
    const open = component.type === 'valve-3-2-no';
    state = actuatedLeft ? tr('cutaway.spool.actuated32', { path: open ? '2→3' : '1→2' }) : tr('cutaway.spool.rest32', { path: open ? '1→2' : '2→3' });
    tone = actuatedLeft ? 'active' : 'idle';
  } else if (kind === 'spool52') {
    state = actuatedLeft ? tr('cutaway.spool.actuated52') : tr('cutaway.spool.rest52');
    tone = actuatedLeft ? 'active' : 'idle';
  } else if (actuatedLeft) {
    state = tr('cutaway.spool.pilotLeft');
    tone = 'active';
  } else if (actuatedRight) {
    state = tr(kind === 'spool53' ? 'cutaway.spool.pilotRight' : 'cutaway.spool.pilotRight43');
    tone = 'active';
  } else if (kind === 'spool43float') {
    state = tr('cutaway.spool.midFloat');
    tone = 'idle';
  } else {
    state = tr('cutaway.spool.mid');
    tone = 'blocked';
  }

  const hasPilotLeft = `${component.id}:${PILOT_LEFT}` in snapshot.portPressure;
  const hasPilotRight = `${component.id}:${PILOT_RIGHT}` in snapshot.portPressure;
  const readings: PortReading[] = body.ports.filter(port => !body.labels || !(port in body.labels)).map(port => ({ port, label: spoolPortLabel(body, port), bar: pressures[port] }));
  if (hasPilotLeft) readings.push({ port: PILOT_LEFT, label: body.ports.includes('4') ? '14' : '12', bar: portPressure(snapshot, component, PILOT_LEFT) });
  if (hasPilotRight) readings.push({ port: PILOT_RIGHT, label: body.ports.includes('4') ? '12' : '10', bar: portPressure(snapshot, component, PILOT_RIGHT) });

  let description = describeSpool(intervals, pressures, tr, body);
  if (isThreePosition(kind) && !actuatedLeft && !actuatedRight) {
    description = tr(kind === 'spool53' ? 'cutaway.spool.centring' : kind === 'spool43' ? 'cutaway.spool.centring43' : 'cutaway.spool.centringFloat', { description });
  }

  return {
    kind,
    body,
    state,
    tone,
    readings,
    description,
    offset,
    start,
    lands,
    covered,
    intervals,
    connections,
    pressures,
    pilotLeft: hasPilotLeft ? portPressure(snapshot, component, PILOT_LEFT) : null,
    pilotRight: hasPilotRight ? portPressure(snapshot, component, PILOT_RIGHT) : null,
    operators: { left: operatorName(component.props.actuationLeft), right: operatorName(component.props.actuationRight) },
  };
}

/* ───────────────────────── Cushioned cylinder ───────────────────────── */

/** Share of the stroke at each end in which the cushion spear is inside its cavity. */
export const CUSHION_ZONE = 0.1;
const MOVING = 1e-4;

export interface CushionEnd {
  /** The cylinder is fitted with a cushion at this end. */
  enabled: boolean;
  /** The bypass orifice has an adjusting screw (otherwise it is fixed). */
  adjustable: boolean;
  /** The spear is inside its cavity, so the main exit is shut. */
  engaged: boolean;
  /** How far the spear has entered, 0 … 1. */
  depth: number;
}

export interface CushionAnalysis extends BaseAnalysis {
  kind: 'cushion';
  stroke: number;
  velocity: number;
  direction: 'extending' | 'retracting' | 'stopped';
  rear: CushionEnd;
  front: CushionEnd;
  rearBar: number;
  frontBar: number;
  /** The exhausting chamber is being forced through the needle valve. */
  throttled: boolean;
  throughRod: boolean;
}

export function cushionEnds(props: Record<string, unknown>): { rear: boolean; front: boolean; adjustable: boolean } {
  const value = typeof props.cushioning === 'string' ? props.cushioning : 'None';
  return { rear: value !== 'None', front: value.endsWith('both'), adjustable: value.startsWith('Adjustable') };
}

export function analyzeCushion(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): CushionAnalysis {
  const cylinder = snapshot.cylinders[component.id];
  const stroke = cylinder?.stroke ?? 0;
  const velocity = cylinder?.velocity ?? 0;
  const direction = velocity > MOVING ? 'extending' : velocity < -MOVING ? 'retracting' : 'stopped';
  const ends = cushionEnds(component.props);
  const rear: CushionEnd = { enabled: ends.rear, adjustable: ends.adjustable, engaged: ends.rear && stroke < CUSHION_ZONE, depth: ends.rear ? clamp((CUSHION_ZONE - stroke) / CUSHION_ZONE, 0, 1) : 0 };
  const front: CushionEnd = { enabled: ends.front, adjustable: ends.adjustable, engaged: ends.front && stroke > 1 - CUSHION_ZONE, depth: ends.front ? clamp((stroke - (1 - CUSHION_ZONE)) / CUSHION_ZONE, 0, 1) : 0 };
  const rearBar = portPressure(snapshot, component, 'a');
  const frontBar = portPressure(snapshot, component, 'b');
  const throttled = (direction === 'retracting' && rear.engaged) || (direction === 'extending' && front.engaged);
  const anyCushion = ends.rear || ends.front;
  const seated = direction === 'stopped' && (rear.engaged || front.engaged);

  let state = tr('cutaway.cushion.normal');
  let tone: StateTone = 'open';
  let description = tr('cutaway.cushion.normalText');
  if (!anyCushion) {
    state = tr('cutaway.cushion.none');
    tone = 'idle';
    description = tr('cutaway.cushion.noneText');
  } else if (throttled) {
    const end = tr(direction === 'extending' ? 'cutaway.cushion.endFront' : 'cutaway.cushion.endRear');
    state = tr('cutaway.cushion.throttled');
    tone = 'active';
    description = tr('cutaway.cushion.throttledText', { end, needle: tr((direction === 'extending' ? front : rear).adjustable ? 'cutaway.cushion.needleAdjustable' : 'cutaway.cushion.needleFixed') });
  } else if (seated) {
    const end = tr(front.engaged ? 'cutaway.cushion.endFront' : 'cutaway.cushion.endRear');
    state = tr('cutaway.cushion.seated', { end });
    tone = 'blocked';
    description = tr('cutaway.cushion.seatedText', { end });
  } else if (direction === 'stopped') {
    state = tr('cutaway.cushion.rest');
    tone = 'idle';
    description = tr('cutaway.cushion.restText');
  } else if (rear.engaged || front.engaged) {
    state = tr('cutaway.cushion.leaving');
    tone = 'open';
    description = tr('cutaway.cushion.leavingText');
  }

  return {
    kind: 'cushion',
    state,
    tone,
    description,
    stroke,
    velocity,
    direction,
    rear,
    front,
    rearBar,
    frontBar,
    throttled,
    throughRod: component.type === 'cylinder-double-rod',
    readings: [
      { port: 'a', label: tr('cutaway.portRear'), bar: rearBar },
      { port: 'b', label: tr('cutaway.portFront'), bar: frontBar },
    ],
  };
}

/** Position of a piston face between its end stops: never outside [minInnerX, maxInnerX], whatever the stroke reads. */
export function clampPistonX(stroke: number, minInnerX: number, maxInnerX: number): number {
  const fraction = Number.isFinite(stroke) ? clamp(stroke, 0, 1) : 0;
  return clamp(minInnerX + fraction * (maxInnerX - minInnerX), minInnerX, maxInnerX);
}

/* ───────────────────────── Single-acting cylinder ───────────────────────── */

export interface SingleAnalysis extends BaseAnalysis {
  kind: 'single';
  stroke: number;
  velocity: number;
  direction: 'extending' | 'retracting' | 'stopped';
  /** Pressure in the single working chamber (port A). */
  rearBar: number;
  /** Share of the spring's working travel that is compressed, 0 … 1 (equals the stroke). */
  springCompression: number;
  /** Pressure (bar) that balances the spring at the current stroke: p·A = F0 + k·x, from the engine's own spring model. */
  springBar: number;
  /** Stroke at which the current rear pressure balances the spring; the piston is travelling towards it (or resting on it). */
  equilibrium: number;
}

export function analyzeSingle(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): SingleAnalysis {
  const cylinder = snapshot.cylinders[component.id];
  const stroke = clamp(cylinder?.stroke ?? 0, 0, 1);
  const velocity = cylinder?.velocity ?? 0;
  const direction = velocity > MOVING ? 'extending' : velocity < -MOVING ? 'retracting' : 'stopped';
  const rearBar = portPressure(snapshot, component, 'a');

  const springBar = springPressure(stroke);
  const equilibrium = springEquilibriumStroke(rearBar);
  const percent = (value: number) => `${(value * 100).toFixed(0)} %`;

  let state = tr('cutaway.single.rest');
  let tone: StateTone = 'idle';
  let description = tr('cutaway.single.restText');
  if (direction === 'extending') {
    state = tr('cutaway.single.extending');
    tone = 'active';
    description = tr('cutaway.single.extendingText', { rear: bar(rearBar), spring: bar(springBar), percent: percent(equilibrium), end: equilibrium >= 1 ? tr('cutaway.single.endOfStroke') : '' });
  } else if (direction === 'retracting') {
    state = tr('cutaway.single.retracting');
    tone = 'open';
    description = tr('cutaway.single.retractingText', { spring: bar(springBar), rear: bar(rearBar), until: equilibrium > 0 ? tr('cutaway.single.untilBalance', { percent: percent(equilibrium) }) : tr('cutaway.single.toRearCap') });
  } else if (stroke > 0.99) {
    state = tr('cutaway.single.full');
    tone = 'blocked';
    description = tr('cutaway.single.fullText', { spring: bar(springPressure(1)), rear: bar(rearBar) });
  } else if (stroke > 0.01) {
    state = tr('cutaway.single.held');
    tone = 'idle';
    description = tr('cutaway.single.heldText', { percent: percent(stroke), rear: bar(rearBar), spring: bar(springBar), full: bar(springPressure(1)) });
  } else if (rearBar > EPS) {
    state = tr('cutaway.single.preload');
    tone = 'idle';
    description = tr('cutaway.single.preloadText', { rear: bar(rearBar), preload: bar(SPRING_PRELOAD_BAR) });
  }

  return {
    kind: 'single',
    state,
    tone,
    description,
    stroke,
    velocity,
    direction,
    rearBar,
    springCompression: stroke,
    springBar,
    equilibrium,
    readings: [{ port: 'a', label: tr('cutaway.portRear'), bar: rearBar }],
  };
}

/* ───────────────────────── Flow control valves ───────────────────────── */

/** A net at or below this pressure is open to exhaust (the exhausting side of a cylinder). */
const VENTED_BAR = 0.5;
const FLOWING_LPM = 1e-3;
/** Cracking pressure of the one-way flow control's bypass check: P(2) − P(1) above this unseats the poppet. */
export const ONEWAY_CRACK_BAR = 0.05;

export interface FlowControlAnalysis extends BaseAnalysis {
  kind: 'throttle' | 'oneway';
  /** Needle opening, 0 … 100 %. */
  opening: number;
  /** 1: from port 1 to port 2, -1: from 2 to 1, 0: no flow. */
  direction: 1 | -1 | 0;
  inBar: number;
  outBar: number;
}

/**
 * Direction of flow through a throttle. The engine solves pressures, not flow vectors, so it is read from the actuator
 * side: the net that carries the cylinder's displaced volume is the one the fluid is moving into (it is pressurised, filling)
 * or out of (it is open to exhaust, emptying).
 */
export function flowDirection(snapshot: EngineSnapshot, component: CutawayComponent, inPort = 'in', outPort = 'out'): 1 | -1 | 0 {
  const flowOf = (port: string) => snapshot.nets.find(net => net.connectedPortIds.includes(`${component.id}:${port}`))?.flowRate ?? 0;
  const flowIn = flowOf(inPort);
  const flowOut = flowOf(outPort);
  if (Math.max(flowIn, flowOut) <= FLOWING_LPM) return 0;
  const actuatorSide = flowOut >= flowIn ? 'out' : 'in';
  const filling = portPressure(snapshot, component, actuatorSide === 'out' ? outPort : inPort) > VENTED_BAR;
  const towardActuator = filling;
  if (actuatorSide === 'out') return towardActuator ? 1 : -1;
  return towardActuator ? -1 : 1;
}

export function analyzeFlowControl(component: CutawayComponent, snapshot: EngineSnapshot, kind: 'throttle' | 'oneway', tr: FluidTranslate = englishFluidT): FlowControlAnalysis {
  const raw = Number(component.props.openingPercentage ?? 100);
  const opening = clamp(Number.isFinite(raw) ? raw : 100, 0, 100);
  const inBar = portPressure(snapshot, component, 'in');
  const outBar = portPressure(snapshot, component, 'out');
  // The bypass check of a one-way flow control lifts as soon as P(2) − P(1) beats its cracking pressure, whatever the flow
  // heuristic says (it reads 0 or forward at the instant the supply is switched to port 2).
  const bypassOpen = kind === 'oneway' && outBar - inBar > ONEWAY_CRACK_BAR;
  const direction = bypassOpen ? -1 : flowDirection(snapshot, component);
  const percent = String(Math.round(opening));

  let state = tr('cutaway.flow.idle');
  let tone: StateTone = 'idle';
  let description = tr('cutaway.flow.idleDesc', { opening: percent });
  if (direction !== 0) {
    tone = 'active';
    if (kind === 'throttle') {
      state = tr(direction === 1 ? 'cutaway.flow.throttleForward' : 'cutaway.flow.throttleReverse');
      description = tr('cutaway.flow.throttleDesc', { from: direction === 1 ? '1' : '2', to: direction === 1 ? '2' : '1', opening: percent });
    } else if (direction === 1) {
      state = tr('cutaway.flow.metered');
      description = tr('cutaway.flow.meteredDesc', { opening: percent });
    } else {
      state = tr('cutaway.flow.free');
      tone = 'open';
      description = tr('cutaway.flow.freeDesc');
    }
  }
  return {
    kind,
    state,
    tone,
    description,
    opening,
    direction,
    inBar,
    outBar,
    readings: [{ port: 'in', label: '1', bar: inBar }, { port: 'out', label: '2', bar: outBar }],
  };
}

/* ───────────────────────── Check valves ───────────────────────── */

export interface CheckAnalysis extends BaseAnalysis {
  kind: 'check' | 'springCheck';
  /** The sealing ball is off its seat and fluid passes from port 1 to port 2. */
  open: boolean;
  /** Pressure on port 2 above port 1 presses the ball into the seat. */
  backPressure: boolean;
  inBar: number;
  outBar: number;
  /** Cracking pressure of a spring-loaded valve (bar); null for a plain check valve. */
  crack: number | null;
}

/** A pressure difference below this is noise, not a force on the ball. */
const FORCE_EPS = 0.05;

export function analyzeCheck(component: CutawayComponent, snapshot: EngineSnapshot, kind: 'check' | 'springCheck', tr: FluidTranslate = englishFluidT): CheckAnalysis {
  const inBar = portPressure(snapshot, component, 'p1');
  const outBar = portPressure(snapshot, component, 'p2');
  const rawCrack = Number(component.props.crackingPressure ?? 0.2);
  const crack = kind === 'springCheck' ? Math.max(0, Number.isFinite(rawCrack) ? rawCrack : 0.2) : null;
  const flowing = flowDirection(snapshot, component, 'p1', 'p2') === 1;
  const difference = inBar - outBar;
  // Spring-loaded: the ball unseats only once the upstream force beats the spring pre-tension.
  // The engine's own verdict (what the schematic symbol shows) wins: with no flow left and the pressures equalised, a plain ball stays in its cage.
  const engineOffset = snapshot.logic?.[component.id]?.offset;
  const open = flowing || (engineOffset !== undefined ? engineOffset > 0 : crack === null ? difference > FORCE_EPS : crack > 0 && difference >= crack - FORCE_EPS);
  const backPressure = !open && outBar - inBar > FORCE_EPS;
  const bars = { bar: inBar.toFixed(1), crack: (crack ?? 0).toFixed(1) };

  let state: string;
  let tone: StateTone;
  let description: string;
  if (open) {
    state = tr(crack === null ? 'cutaway.check.open' : 'cutaway.check.crackOpen');
    tone = 'open';
    description = tr(crack === null ? 'cutaway.check.openDesc' : 'cutaway.check.crackOpenDesc', bars);
  } else if (backPressure) {
    state = tr('cutaway.check.blocked');
    tone = 'blocked';
    description = tr('cutaway.check.blockedDesc');
  } else if (crack !== null && inBar > EPS) {
    state = tr('cutaway.check.crackClosed');
    tone = 'idle';
    description = tr('cutaway.check.crackClosedDesc', bars);
  } else {
    state = tr('cutaway.check.closed');
    tone = 'idle';
    description = tr(crack === null ? 'cutaway.check.closedDesc' : 'cutaway.check.crackIdleDesc', bars);
  }
  return { kind, state, tone, description, open, backPressure, inBar, outBar, crack, readings: [{ port: 'p1', label: '1', bar: inBar }, { port: 'p2', label: '2', bar: outBar }] };
}

/* ───────────────────────── Air reservoir and time-delay valve ───────────────────────── */

/** Pressure change (bar/s) below which a vessel counts as steady. */
const STEADY_RATE = 0.05;
/** Share of the supply at which a vessel counts as fully charged. */
const CHARGED_SHARE = 0.985;
/** Atmospheric pressure, bar (absolute): converts the stored gauge pressure into free air. */
const ATMOSPHERE = 1.01325;

export type ChargePhase = 'empty' | 'charging' | 'charged' | 'discharging';

export interface ReservoirAnalysis extends BaseAnalysis {
  kind: 'reservoir';
  phase: ChargePhase;
  /** Internal gauge pressure and the line pressure it charges towards (bar). */
  pressure: number;
  supply: number;
  /** P_internal / P_supply, 0 … 1: drives the fill of the cutaway. */
  ratio: number;
  /** dP/dt in bar/s. */
  rate: number;
  /** Vessel volume (cm³) and the free air it holds beyond atmosphere (normal litres). */
  volumeCm3: number;
  storedLitres: number;
}

export function chargePhase(pressure: number, rate: number, supply: number): ChargePhase {
  if (rate < -STEADY_RATE) return 'discharging';
  if (rate > STEADY_RATE && pressure < supply * CHARGED_SHARE) return 'charging';
  return pressure > 0.05 ? 'charged' : 'empty';
}

const fill = (pressure: number, supply: number) => clamp(supply > EPS ? pressure / supply : 0, 0, 1);

export function analyzeReservoir(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): ReservoirAnalysis {
  const volume = snapshot.volumes[component.id];
  const pressure = volume?.pressure ?? portPressure(snapshot, component, 'left');
  const rate = volume?.rate ?? 0;
  const supply = Math.max(volume?.supply ?? DEFAULT_ENGINE_CONFIG.nominalPressure.AIR, pressure);
  const volumeCm3 = volume?.volumeCm3 ?? Number(component.props.volume ?? 1000);
  const phase = chargePhase(pressure, rate, supply);
  const tone: Record<ChargePhase, StateTone> = { empty: 'idle', charging: 'active', charged: 'open', discharging: 'blocked' };
  return {
    kind: 'reservoir',
    phase,
    state: tr(`cutaway.reservoir.${phase}`),
    tone: tone[phase],
    description: tr(`cutaway.reservoir.${phase}Text`, { bar: bar(pressure), supply: bar(supply), rate: Math.abs(rate).toFixed(2) }),
    pressure,
    supply,
    ratio: fill(pressure, supply),
    rate,
    volumeCm3,
    storedLitres: (volumeCm3 / 1000) * (pressure / ATMOSPHERE),
    metrics: [
      { id: 'pressure', label: tr('cutaway.reservoir.currentPressure'), value: `${pressure.toFixed(2)} bar` },
      { id: 'rate', label: tr('cutaway.reservoir.rate'), value: `${rate >= 0 ? '+' : ''}${rate.toFixed(2)} bar/s` },
      { id: 'stored', label: tr('cutaway.reservoir.stored'), value: `${((volumeCm3 / 1000) * (pressure / ATMOSPHERE)).toFixed(2)} L` },
    ],
    readings: [
      { port: 'left', label: tr('cutaway.reservoir.inlet'), bar: portPressure(snapshot, component, 'left') },
      { port: 'right', label: tr('cutaway.reservoir.outlet'), bar: portPressure(snapshot, component, 'right') },
    ],
  };
}

export type TimerPhase = 'idle' | 'delay' | 'switched' | 'resetting';

export interface TimerAnalysis extends BaseAnalysis {
  kind: 'timer';
  phase: TimerPhase;
  /** Throttle opening in percent. */
  opening: number;
  /** Pressure of the accumulation chamber, the pilot cracking pressure and the signal on port 12 (bar). */
  chamberBar: number;
  threshold: number;
  signalBar: number;
  /** Chamber pressure as a share of the signal (the fill of the chamber). */
  ratio: number;
  /** The built-in 3/2 valve is connecting 1 → 2. */
  open: boolean;
  rate: number;
  volumeCm3: number;
  /** Seconds until the valve switches at the present signal; null when it is not counting down. */
  remaining: number | null;
  /** Line pressure the chamber charges towards (bar). */
  supply: number;
  /** 1: the signal is filling the chamber through the needle; -1: the chamber empties through the check valve; 0: still. */
  direction: 1 | -1 | 0;
  /** The built-in 3/2 NC valve, analysed as a spool valve whose left pilot face sees the chamber pressure. */
  spool: SpoolAnalysis;
  p1: number;
  p2: number;
  p3: number;
}

export function analyzeTimer(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): TimerAnalysis {
  const volume = snapshot.volumes[component.id];
  const threshold = DEFAULT_ENGINE_CONFIG.pilotThreshold;
  const raw = Number(component.props.openingPercentage ?? 20);
  const opening = clamp(Number.isFinite(raw) ? raw : 20, 1, 100);
  const chamberBar = volume?.pressure ?? portPressure(snapshot, component, 'chamber');
  const rate = volume?.rate ?? 0;
  const signalBar = portPressure(snapshot, component, 'z12');
  const open = snapshot.logic[component.id]?.offset === 1;
  const volumeCm3 = volume?.volumeCm3 ?? Number(component.props.volume ?? 500);
  const p1 = portPressure(snapshot, component, 'p1');
  const p2 = portPressure(snapshot, component, 'p2');
  const p3 = portPressure(snapshot, component, 'p3');

  let phase: TimerPhase = 'idle';
  if (open) phase = 'switched';
  else if (signalBar > chamberBar + EPS && signalBar > 0) phase = 'delay';
  else if (chamberBar > EPS && rate < -STEADY_RATE) phase = 'resetting';
  if (open && signalBar <= EPS) phase = 'resetting';

  const supply = Math.max(volume?.supply ?? DEFAULT_ENGINE_CONFIG.nominalPressure.AIR, signalBar, chamberBar);
  const direction: 1 | -1 | 0 = phase === 'delay' ? 1 : phase === 'resetting' ? -1 : 0;
  // The inner valve: 1 → 2 when open, 2 → 3 at rest; its left pilot face is the accumulation chamber.
  const inner: CutawayComponent = { id: component.id, type: 'valve-3-2-nc', label: component.label, props: { actuationLeft: 'Pneumatic Pilot', actuationRight: 'Spring Return' } };
  const synthetic: EngineSnapshot = {
    ...snapshot,
    valves: { ...snapshot.valves, [component.id]: { position: open ? 1 : 0, envelope: open ? 0 : 1, spoolOffset: open ? 1 : 0, latched: false } },
    portPressure: { ...snapshot.portPressure, [`${component.id}:${PILOT_LEFT}`]: chamberBar },
  };
  const spool = analyzeSpool(inner, synthetic, 'spool32', tr);
  const remaining = phase === 'delay' ? chargeTime(signalBar, chamberBar, threshold, opening, volumeCm3) : null;
  const tone: Record<TimerPhase, StateTone> = { idle: 'idle', delay: 'active', switched: 'open', resetting: 'blocked' };
  const seconds = remaining !== null && Number.isFinite(remaining) ? remaining.toFixed(1) : '–';
  return {
    kind: 'timer',
    phase,
    state: phase === 'delay' ? tr('cutaway.timer.delay', { seconds }) : tr(`cutaway.timer.${phase}`),
    tone: tone[phase],
    description: tr(`cutaway.timer.${phase}Text`, { opening: String(Math.round(opening)), bar: bar(chamberBar), threshold: bar(threshold), signal: bar(signalBar), seconds }),
    opening,
    chamberBar,
    threshold,
    signalBar,
    ratio: fill(chamberBar, supply),
    supply,
    direction,
    spool,
    metrics: [
      { id: 'chamber', label: tr('cutaway.timer.chamber'), value: `${chamberBar.toFixed(2)} bar` },
      { id: 'rate', label: tr('cutaway.reservoir.rate'), value: `${rate >= 0 ? '+' : ''}${rate.toFixed(2)} bar/s` },
      { id: 'remaining', label: tr('cutaway.timer.remaining'), value: remaining !== null && Number.isFinite(remaining) ? `${remaining.toFixed(1)} s` : '–' },
    ],
    open,
    rate,
    volumeCm3,
    remaining,
    p1,
    p2,
    p3,
    readings: [
      { port: 'z12', label: '12', bar: signalBar },
      { port: 'chamber', label: tr('cutaway.timer.chamber'), bar: chamberBar },
      { port: 'p1', label: '1', bar: p1 },
      { port: 'p2', label: '2', bar: p2 },
    ],
  };
}


/* ───────────────────────── Pressure gauge ───────────────────────── */

export interface GaugeAnalysis extends BaseAnalysis {
  kind: 'gauge';
  pressure: number;
}

export function analyzeGauge(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): GaugeAnalysis {
  const pressure = portPressure(snapshot, component, 'p');
  const live = pressure > EPS;
  return {
    kind: 'gauge', pressure, tone: live ? 'open' : 'idle',
    state: tr(live ? 'cutaway.gauge.live' : 'cutaway.gauge.idle'),
    description: tr(live ? 'cutaway.gauge.liveText' : 'cutaway.gauge.idleText', { bar: bar(pressure) }),
    readings: [{ port: 'p', label: '1', bar: pressure }],
  };
}

/* ───────────────────────── Quick exhaust valve ───────────────────────── */

export interface QuickExhaustAnalysis extends BaseAnalysis {
  kind: 'quickExhaust';
  /** +1: the disc seals the exhaust seat (1 → 2); -1: it seals the inlet and port 2 dumps through port 3. */
  offset: 1 | -1;
  mode: 'idle' | 'fill' | 'exhaust';
  supply: number;
  work: number;
  exhaust: number;
}

export function analyzeQuickExhaust(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): QuickExhaustAnalysis {
  const supply = portPressure(snapshot, component, 'p1');
  const work = portPressure(snapshot, component, 'p2');
  const exhaust = portPressure(snapshot, component, 'p3');
  const offset = (snapshot.logic?.[component.id]?.offset ?? -1) > 0 ? 1 : -1;
  const dumping = (snapshot.nets.find(net => net.connectedPortIds.includes(`${component.id}:p3`))?.flowRate ?? 0) > FLOWING_LPM;
  const mode = offset === 1 ? 'fill' : work > FORCE_EPS || dumping ? 'exhaust' : 'idle';
  const key = { idle: 'idle', fill: 'fill', exhaust: 'exhaust' }[mode];
  return {
    kind: 'quickExhaust', offset, mode, supply, work, exhaust,
    state: tr(`cutaway.quickExhaust.${key}`),
    tone: mode === 'fill' ? 'open' : mode === 'exhaust' ? 'active' : 'idle',
    description: tr(`cutaway.quickExhaust.${key}Text`, { supply: bar(supply), work: bar(work) }),
    readings: [{ port: 'p1', label: '1', bar: supply }, { port: 'p2', label: '2', bar: work }, { port: 'p3', label: '3', bar: exhaust }],
  };
}

/* ───────────────────────── Pressure control valves ───────────────────────── */

export interface PressureValveAnalysis extends BaseAnalysis {
  kind: 'regulator' | 'relief';
  /** Regulator with vent port 3 (relieving type). */
  relieving: boolean;
  /** Set pressure: the regulator's dial, or the relief valve's cracking pressure. */
  setBar: number;
  inBar: number;
  /** Regulator: pressure on port 2 under the diaphragm. Relief valve: the same as the inlet. */
  outBar: number;
  /** Regulator: poppet gap, 0 (seated) … 1 (fully open). Relief valve: poppet lift, 0 … 1. */
  gap: number;
  /** Regulator: diaphragm travel against the spring, 0 (spring-side, rest) … 1 (poppet closed) … 1.4 (lifted off the relief seat). */
  deflection: number;
  /** Air leaves through the vent: the relieving regulator's bonnet vent, or the relief valve's outlet. */
  venting: boolean;
}

/** Regulating band: the pressure rise below the set point over which the poppet closes. */
const regulatingBand = (setBar: number) => Math.max(0.2, 0.1 * setBar);

export function analyzeRegulator(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): PressureValveAnalysis {
  const rawSet = Number(component.props.setpoint ?? 6);
  const setBar = Math.max(0, Number.isFinite(rawSet) ? rawSet : 6);
  const relieving = component.type === 'regulator-relieving';
  const inBar = portPressure(snapshot, component, 'p1');
  const outBar = portPressure(snapshot, component, 'p2');
  const flowAt = (port: string) => snapshot.nets.find(net => net.connectedPortIds.includes(`${component.id}:${port}`))?.flowRate ?? 0;
  const band = regulatingBand(setBar);
  const atSet = outBar >= setBar - 0.05;
  const venting = relieving && (flowAt('p3') > FLOWING_LPM || outBar > setBar + 0.05);
  const supplied = inBar > outBar + 0.05;
  // Below the set point the spring holds the poppet open; the diaphragm closes it over the regulating band as P2 reaches the dial.
  const diaphragm = clamp((outBar - (setBar - band)) / band, 0, 1);
  const gap = inBar < EPS && outBar < EPS ? 1 : atSet ? (supplied && flowAt('p2') > FLOWING_LPM ? 0.2 : 0) : 1 - diaphragm;
  const deflection = venting ? 1.4 : 1 - gap;
  const mode = inBar < EPS && outBar < EPS ? 'idle' : venting ? 'venting' : atSet ? 'holding' : 'regulating';
  const values = { set: bar(setBar), out: bar(outBar), in: bar(inBar) };
  return {
    kind: 'regulator',
    relieving,
    setBar, inBar, outBar, gap, deflection, venting,
    state: tr(`cutaway.pressure.regulator.${mode}`),
    tone: mode === 'idle' ? 'idle' : mode === 'regulating' ? 'open' : mode === 'holding' ? 'active' : 'blocked',
    description: tr(`cutaway.pressure.regulator.${mode}Text`, values),
    readings: [{ port: 'p1', label: '1', bar: inBar }, { port: 'p2', label: '2', bar: outBar }, ...(relieving ? [{ port: 'p3', label: '3', bar: portPressure(snapshot, component, 'p3') }] : [])],
  };
}

export function analyzeRelief(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): PressureValveAnalysis {
  const hydraulic = component.type === 'hyd-pressure-relief';
  const rawSet = Number(component.props.crackingPressure ?? (hydraulic ? 60 : 8));
  const setBar = Math.max(0, Number.isFinite(rawSet) ? rawSet : hydraulic ? 60 : 8);
  const inBar = portPressure(snapshot, component, 'p1');
  const engineOpen = snapshot.reliefValves?.[component.id]?.open;
  const open = engineOpen ?? (setBar > 0 && inBar >= setBar - 0.05);
  const mode = open ? 'open' : inBar > EPS ? 'closed' : 'idle';
  const values = { set: bar(setBar), in: bar(inBar) };
  return {
    kind: 'relief',
    relieving: false,
    setBar, inBar, outBar: inBar, gap: open ? 1 : 0, deflection: open ? 1 : 0, venting: open,
    state: tr(`cutaway.pressure.relief.${mode}`),
    tone: mode === 'open' ? 'open' : 'idle',
    description: tr(`cutaway.pressure.relief.${mode}Text`, values),
    readings: [{ port: 'p1', label: '1', bar: inBar }],
  };
}

export type CutawayAnalysis = GaugeAnalysis | PressureValveAnalysis | QuickExhaustAnalysis | ReservoirAnalysis | TimerAnalysis | CheckAnalysis | FlowControlAnalysis | GateAnalysis | SpoolAnalysis | CushionAnalysis | SingleAnalysis;

export function analyzeCutaway(component: CutawayComponent, snapshot: EngineSnapshot, tr: FluidTranslate = englishFluidT): CutawayAnalysis | null {
  switch (cutawayKindOf(component)) {
    case 'and': return analyzeAnd(component, snapshot, tr);
    case 'or': return analyzeOr(component, snapshot, tr);
    case 'quickExhaust': return analyzeQuickExhaust(component, snapshot, tr);
    case 'gauge': return analyzeGauge(component, snapshot, tr);
    case 'regulator': return analyzeRegulator(component, snapshot, tr);
    case 'relief': return analyzeRelief(component, snapshot, tr);
    case 'spool22': return analyzeSpool(component, snapshot, 'spool22', tr);
    case 'spool32': return analyzeSpool(component, snapshot, 'spool32', tr);
    case 'spool42': return analyzeSpool(component, snapshot, 'spool42', tr);
    case 'spool52': return analyzeSpool(component, snapshot, 'spool52', tr);
    case 'spool53': return analyzeSpool(component, snapshot, 'spool53', tr);
    case 'spool43': return analyzeSpool(component, snapshot, 'spool43', tr);
    case 'spool43float': return analyzeSpool(component, snapshot, 'spool43float', tr);
    case 'cushion': return analyzeCushion(component, snapshot, tr);
    case 'check': return analyzeCheck(component, snapshot, 'check', tr);
    case 'springCheck': return analyzeCheck(component, snapshot, 'springCheck', tr);
    case 'throttle': return analyzeFlowControl(component, snapshot, 'throttle', tr);
    case 'oneway': return analyzeFlowControl(component, snapshot, 'oneway', tr);
    case 'single': return analyzeSingle(component, snapshot, tr);
    case 'reservoir': return analyzeReservoir(component, snapshot, tr);
    case 'timer': return analyzeTimer(component, snapshot, tr);
    default: return null;
  }
}
