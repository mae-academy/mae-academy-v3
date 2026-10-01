import LZString from 'lz-string';
import type { CircuitComponent, CircuitWire, WorkspaceText } from '@shared/circuit/circuitTypes';
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

export function normalizePoint(pt: unknown): Point | null {
  if (Array.isArray(pt) && pt.length >= 2) {
    const x = Number(pt[0]);
    const y = Number(pt[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  if (pt && typeof pt === 'object') {
    const p = pt as Record<string, unknown>;
    const x = Number(p.x ?? (Array.isArray(p) ? p[0] : undefined));
    const y = Number(p.y ?? (Array.isArray(p) ? p[1] : undefined));
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
}

export function normalizeWire(rawWire: unknown): CircuitWire {
  const w = (rawWire && typeof rawWire === 'object' ? rawWire : {}) as Record<string, unknown>;
  const fromComp = String(w.fromComp || w.sourceComponentId || '');
  const toComp = String(w.toComp || w.targetComponentId || '');
  const fromTerm = String(w.fromTerm || w.sourcePinId || (fromComp.startsWith('junc_') ? 'p' : ''));
  const toTerm = String(w.toTerm || w.targetPinId || (toComp.startsWith('junc_') ? 'p' : ''));

  const rawPath = Array.isArray(w.path) ? w.path : [];
  const path: Point[] = rawPath.map(normalizePoint).filter((p): p is Point => p !== null);

  const rawWaypoints = Array.isArray(w.waypoints) ? w.waypoints : undefined;
  let waypoints: Point[] | undefined = undefined;
  if (rawWaypoints) {
    const parsed = rawWaypoints.map(normalizePoint).filter((p): p is Point => p !== null);
    if (parsed.length > 0) {
      waypoints = parsed;
    }
  }
  if (!waypoints && path.length > 2) {
    waypoints = path.slice(1, -1);
  }

  const junctionPoint = normalizePoint(w.junctionPoint) ?? undefined;
  const junctionWireId = typeof w.junctionWireId === 'string' ? w.junctionWireId : undefined;

  let routing: CircuitWire['routing'] = 'orthogonal';
  if (w.routing === 'straight' || w.routing === 'manual' || w.routing === 'orthogonal') {
    routing = w.routing;
  }

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
    routing,
    color: typeof w.color === 'string' ? w.color : undefined,
    junctionPoint,
    junctionWireId,
  };
}

export function normalizeComponent(rawComp: unknown): CircuitComponent {
  const c = (rawComp && typeof rawComp === 'object' ? rawComp : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    id: String(c.id || `c_${Math.random().toString(36).slice(2, 9)}`),
    type: String(c.type || 'resistor'),
    x: num(c.x, 0),
    y: num(c.y, 0),
    rotation: num(c.rotation, 0),
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
  // and explicit sourceComponentId/sourcePinId/targetComponentId/targetPinId, waypoints, and junction metadata
  const strictDocument: NADDocument = {
    ...document,
    components: document.components.map(c => ({
      ...c,
      id: String(c.id),
    })),
    wires: document.wires.map(w => {
      const norm = normalizeWire(w);
      return {
        ...norm,
        sourceComponentId: norm.fromComp,
        sourcePinId: norm.fromTerm,
        targetComponentId: norm.toComp,
        targetPinId: norm.toTerm,
        waypoints: norm.waypoints ?? (norm.path.length > 2 ? norm.path.slice(1, -1) : undefined),
      };
    }),
  };
  return JSON.stringify(strictDocument, null, 2);
}

function arrayOf(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid NAD file: ${label} must be an array.`);
  return value;
}

export function parseNad(text: string): NADDocument {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('Invalid NAD file: the document is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid NAD file: root document is required.');
  const raw = parsed as Record<string, unknown>;
  if (raw.format !== undefined && raw.format !== NAD_FORMAT) throw new Error('Invalid NAD file: unsupported document format.');
  if (raw.version !== undefined && raw.version !== NAD_VERSION) throw new Error('Invalid NAD file: unsupported format version.');
  const rawComponents = arrayOf(raw.components, 'components');
  const rawWires = arrayOf(raw.wires, 'wires');
  const texts = Array.isArray(raw.texts) ? (raw.texts as WorkspaceText[]) : [];
  const viewport = raw.viewport as { pan?: unknown; zoom?: unknown } | undefined;
  const workspace = raw.workspace as { gridVisible?: unknown; snapEnabled?: unknown } | undefined;

  let pan: Point = [0, 0];
  if (viewport && Array.isArray(viewport.pan) && viewport.pan.length >= 2) {
    const px = Number(viewport.pan[0]);
    const py = Number(viewport.pan[1]);
    if (Number.isFinite(px) && Number.isFinite(py)) {
      pan = [px, py];
    }
  }

  let zoom = 1;
  if (viewport && typeof viewport.zoom === 'number' && Number.isFinite(viewport.zoom)) {
    zoom = Math.max(0.2, Math.min(3, viewport.zoom));
  }

  const gridVisible = workspace && typeof workspace.gridVisible === 'boolean' ? workspace.gridVisible : true;
  const snapEnabled = workspace && typeof workspace.snapEnabled === 'boolean' ? workspace.snapEnabled : true;

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
    workspace: { gridVisible, snapEnabled }
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
