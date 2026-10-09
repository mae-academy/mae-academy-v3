/**
 * Flow tables of the directional control valves (ISO 5599 port numbers).
 * Single source of truth for both the engine and the symbol catalog, so the drawn arrows and the
 * simulated connectivity can never drift apart.
 */
export type ValvePortKey = '1' | '2' | '3' | '4' | '5';

/** One square of a valve symbol: the paths it opens and the ports it shuts off. */
export interface ValveEnvelope {
  flows: Array<[ValvePortKey, ValvePortKey]>;
  blocks: ValvePortKey[];
}

export interface ValveTable {
  positions: 2 | 3;
  /** Envelopes left → right as drawn. Ports attach to envelope 1 (the right one of two, the middle one of three). */
  envelopes: ValveEnvelope[];
}

const closed5: ValveEnvelope = { flows: [], blocks: ['1', '2', '3', '4', '5'] };
const closed4: ValveEnvelope = { flows: [], blocks: ['1', '2', '3', '4'] };
const fiveTo2: ValveEnvelope = { flows: [['1', '2'], ['4', '5']], blocks: ['3'] };
const fiveTo4: ValveEnvelope = { flows: [['1', '4'], ['2', '3']], blocks: ['5'] };
const fourParallel: ValveEnvelope = { flows: [['1', '4'], ['2', '3']], blocks: [] };
const fourCrossed: ValveEnvelope = { flows: [['1', '2'], ['4', '3']], blocks: [] };
const threeOpen: ValveEnvelope = { flows: [['1', '2']], blocks: ['3'] };
/** Hydraulic 4-port ports: 1 = P, 2 = B, 3 = T, 4 = A. Float centre: A and B open to tank, P blocked. */
const floatCentre: ValveEnvelope = { flows: [['2', '3'], ['4', '3']], blocks: ['1'] };
const threeVented: ValveEnvelope = { flows: [['2', '3']], blocks: ['1'] };

const TABLES: Record<string, ValveTable> = {
  'valve-2-2-nc': { positions: 2, envelopes: [{ flows: [['1', '2']], blocks: [] }, { flows: [], blocks: ['1', '2'] }] },
  'valve-2-2-no': { positions: 2, envelopes: [{ flows: [], blocks: ['1', '2'] }, { flows: [['1', '2']], blocks: [] }] },
  'valve-3-2-nc': { positions: 2, envelopes: [threeOpen, threeVented] },
  'valve-3-2-no': { positions: 2, envelopes: [threeVented, threeOpen] },
  'valve-4-2': { positions: 2, envelopes: [fourParallel, fourCrossed] },
  'valve-4-3': { positions: 3, envelopes: [fourParallel, closed4, fourCrossed] },
  'valve-5-2': { positions: 2, envelopes: [fiveTo4, fiveTo2] },
  'valve-5-3': { positions: 3, envelopes: [fiveTo4, closed5, fiveTo2] },
};
/** Hydraulic directional valves share the envelopes; their port 3 is the tank line T. the 4/3 valves differ in their centre position (closed or float). */
TABLES['hvalve-3-2-nc'] = TABLES['valve-3-2-nc'];
TABLES['hvalve-4-2'] = TABLES['valve-4-2'];
TABLES['hvalve-4-3'] = TABLES['valve-4-3'];
TABLES['hvalve-4-3-float'] = { positions: 3, envelopes: [fourParallel, floatCentre, fourCrossed] };

export const VALVE_TABLES: Readonly<Record<string, ValveTable>> = TABLES;

/** Envelope the ports are drawn on. */
export const PORT_ENVELOPE = 1;

/** Engine position (0 rest, 1 actuated, 2 centre) → envelope index as drawn. */
export function envelopeForPosition(table: ValveTable, position: number): number {
  if (table.positions === 3) return position === 2 ? 1 : position === 1 ? 0 : 2;
  return position === 1 ? 0 : 1;
}

/** Envelope index as drawn → engine position. */
export function positionForEnvelope(table: ValveTable, envelope: number): number {
  if (table.positions === 3) return envelope === 1 ? 2 : envelope === 0 ? 1 : 0;
  return envelope === 0 ? 1 : 0;
}

/** Port keys a valve actually has (appearing in any envelope). */
export function valvePortKeys(table: ValveTable): ValvePortKey[] {
  const keys = new Set<ValvePortKey>();
  for (const envelope of table.envelopes) {
    for (const [a, b] of envelope.flows) { keys.add(a); keys.add(b); }
    for (const key of envelope.blocks) keys.add(key);
  }
  return Array.from(keys).sort();
}

export const valvePortId = (key: ValvePortKey): string => `p${key}`;
/** Pilot port on the left end (port 14 on 4/5-port valves, 12 on 2/3-port valves). */
export const PILOT_LEFT = 'pilotL';
/** Pilot port on the right end (port 12 on 4/5-port valves, 10 on 2/3-port valves). */
export const PILOT_RIGHT = 'pilotR';
