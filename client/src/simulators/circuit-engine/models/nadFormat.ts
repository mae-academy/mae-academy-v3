import LZString from 'lz-string';
import type { CircuitComponent, CircuitWire, WorkspaceText } from '@/simulators/circuit-engine/models/circuitTypes';
import type { Point } from '@/simulators/circuit-engine/models/wiring';

export const NAD_FORMAT = 'MAE-NAD';
export const NAD_VERSION = 1;

export interface NADDocument {
  format: typeof NAD_FORMAT;
  version: typeof NAD_VERSION;
  components: CircuitComponent[];
  wires: CircuitWire[];
  texts: WorkspaceText[];
  viewport: { pan: Point; zoom: number };
  workspace: { gridVisible: boolean; snapEnabled: boolean };
}

export function normalizeWire(rawWire: unknown): CircuitWire {
  const w = (rawWire && typeof rawWire === 'object' ? rawWire : {}) as Record<string, unknown>;
  const fromComp = String(w.fromComp || w.sourceComponentId || '');
  const fromTerm = String(w.fromTerm || w.sourcePinId || '');
  const toComp = String(w.toComp || w.targetComponentId || '');
  const toTerm = String(w.toTerm || w.targetPinId || '');
  const path = Array.isArray(w.path) ? (w.path as Point[]) : [];
  const waypoints = Array.isArray(w.waypoints)
    ? (w.waypoints as Point[])
    : path.length > 2
      ? path.slice(1, -1)
      : undefined;

  return {
    id: String(w.id || `w_${Math.random().toString(36).slice(2, 9)}`),
    fromComp,
    fromTerm,
    toComp,
    toTerm,
    sourceComponentId: fromComp,
    sourcePinId: fromTerm,
    targetComponentId: toComp,
    targetPinId: toTerm,
    path,
    waypoints,
    routing: (w.routing as CircuitWire['routing']) || 'orthogonal',
    color: typeof w.color === 'string' ? w.color : undefined,
    junctionPoint: Array.isArray(w.junctionPoint) ? (w.junctionPoint as Point) : undefined,
    junctionWireId: typeof w.junctionWireId === 'string' ? w.junctionWireId : undefined,
  };
}

export function normalizeComponent(rawComp: unknown): CircuitComponent {
  const c = (rawComp && typeof rawComp === 'object' ? rawComp : {}) as Record<string, unknown>;
  return {
    id: String(c.id || `c_${Math.random().toString(36).slice(2, 9)}`),
    type: String(c.type || 'resistor'),
    x: typeof c.x === 'number' && Number.isFinite(c.x) ? c.x : 0,
    y: typeof c.y === 'number' && Number.isFinite(c.y) ? c.y : 0,
    rotation: typeof c.rotation === 'number' ? c.rotation : 0,
    flipH: Boolean(c.flipH),
    flipV: Boolean(c.flipV),
    label: typeof c.label === 'string' ? c.label : '',
    props: c.props && typeof c.props === 'object' ? (c.props as Record<string, unknown>) : {},
  };
}

export function createNadDocument(input: Partial<Omit<NADDocument, 'format' | 'version'>> & { components: CircuitComponent[]; wires: CircuitWire[] }): NADDocument {
  const normalizedComponents = (input.components || []).map(normalizeComponent);
  const normalizedWires = (input.wires || []).map(normalizeWire);
  return {
    format: NAD_FORMAT,
    version: NAD_VERSION,
    texts: input.texts || [],
    viewport: input.viewport || { pan: [0, 0], zoom: 1 },
    workspace: input.workspace || { gridVisible: true, snapEnabled: true },
    ...input,
    components: normalizedComponents,
    wires: normalizedWires,
  };
}

export function serializeNad(document: NADDocument): string {
  // Ensure every wire exports both standard fromComp/fromTerm/toComp/toTerm
  // and explicit sourceComponentId/sourcePinId/targetComponentId/targetPinId and waypoints
  const strictDocument: NADDocument = {
    ...document,
    components: document.components.map(c => ({
      ...c,
      id: String(c.id),
    })),
    wires: document.wires.map(w => ({
      ...normalizeWire(w),
      sourceComponentId: w.fromComp,
      sourcePinId: w.fromTerm,
      targetComponentId: w.toComp,
      targetPinId: w.toTerm,
      waypoints: w.waypoints ?? (w.path.length > 2 ? w.path.slice(1, -1) : undefined),
    })),
  };
  return JSON.stringify(strictDocument, null, 2);
}

function arrayOf(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid NAD file: ${label} must be an array.`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid NAD file: ${label} must be finite.`);
  return value;
}

export function parseNad(text: string): NADDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Invalid NAD file: the document is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid NAD file: root document is required.');
  const raw = parsed as Record<string, unknown>;
  if (raw.format !== NAD_FORMAT) throw new Error('Invalid NAD file: unsupported document format.');
  if (raw.version !== NAD_VERSION) throw new Error('Invalid NAD file: unsupported format version.');
  const rawComponents = arrayOf(raw.components, 'components');
  const rawWires = arrayOf(raw.wires, 'wires');
  const texts = arrayOf(raw.texts, 'texts') as WorkspaceText[];
  const viewport = raw.viewport as { pan?: unknown; zoom?: unknown } | undefined;
  const workspace = raw.workspace as { gridVisible?: unknown; snapEnabled?: unknown } | undefined;
  if (!viewport || !Array.isArray(viewport.pan) || viewport.pan.length !== 2) throw new Error('Invalid NAD file: viewport pan is required.');
  const pan: Point = [finite(viewport.pan[0], 'viewport.pan[0]'), finite(viewport.pan[1], 'viewport.pan[1]')];
  const zoom = finite(viewport.zoom, 'viewport.zoom');
  if (zoom < 0.2 || zoom > 3) throw new Error('Invalid NAD file: viewport zoom is out of range.');
  if (!workspace || typeof workspace.gridVisible !== 'boolean' || typeof workspace.snapEnabled !== 'boolean') throw new Error('Invalid NAD file: workspace settings are required.');
  
  const components = rawComponents.map(normalizeComponent);
  const wires = rawWires.map(normalizeWire);

  if (!components.every((item) => item && typeof item.id === 'string' && typeof item.type === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y))) throw new Error('Invalid NAD file: component records are malformed.');
  if (!wires.every((item) => item && typeof item.id === 'string' && Array.isArray(item.path))) throw new Error('Invalid NAD file: wire records are malformed.');
  if (!texts.every((item) => item && typeof item.id === 'string' && typeof item.text === 'string')) throw new Error('Invalid NAD file: annotation records are malformed.');
  
  return {
    format: NAD_FORMAT,
    version: NAD_VERSION,
    components,
    wires,
    texts,
    viewport: { pan, zoom },
    workspace: { gridVisible: workspace.gridVisible, snapEnabled: workspace.snapEnabled }
  };
}

export function compressProjectState(document: NADDocument): string {
  const serialized = serializeNad(document);
  return LZString.compressToEncodedURIComponent(serialized);
}

export function decompressProjectState(compressed: string): NADDocument | null {
  if (!compressed) return null;
  try {
    const raw = LZString.decompressFromEncodedURIComponent(compressed);
    if (raw) {
      return parseNad(raw);
    }
  } catch {
    // try fallbacks
  }

  // Fallback 1: URI-encoded JSON
  try {
    const decoded = decodeURIComponent(compressed);
    return parseNad(decoded);
  } catch {
    // try fallback 2
  }

  // Fallback 2: base64 JSON
  try {
    const binary = atob(compressed);
    const decoded = decodeURIComponent(escape(binary));
    return parseNad(decoded);
  } catch {
    return null;
  }
}
