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

export function createNadDocument(input: Omit<NADDocument, 'format' | 'version'>): NADDocument {
  return { format: NAD_FORMAT, version: NAD_VERSION, ...input };
}

export function serializeNad(document: NADDocument) {
  return JSON.stringify(document, null, 2);
}

function arrayOf(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid NAD file: ${label} must be an array.`);
  return value;
}

function finite(value: unknown, label: string) {
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
  const components = arrayOf(raw.components, 'components') as CircuitComponent[];
  const wires = arrayOf(raw.wires, 'wires') as CircuitWire[];
  const texts = arrayOf(raw.texts, 'texts') as WorkspaceText[];
  const viewport = raw.viewport as { pan?: unknown; zoom?: unknown } | undefined;
  const workspace = raw.workspace as { gridVisible?: unknown; snapEnabled?: unknown } | undefined;
  if (!viewport || !Array.isArray(viewport.pan) || viewport.pan.length !== 2) throw new Error('Invalid NAD file: viewport pan is required.');
  const pan: Point = [finite(viewport.pan[0], 'viewport.pan[0]'), finite(viewport.pan[1], 'viewport.pan[1]')];
  const zoom = finite(viewport.zoom, 'viewport.zoom');
  if (zoom < 0.2 || zoom > 3) throw new Error('Invalid NAD file: viewport zoom is out of range.');
  if (!workspace || typeof workspace.gridVisible !== 'boolean' || typeof workspace.snapEnabled !== 'boolean') throw new Error('Invalid NAD file: workspace settings are required.');
  if (!components.every((item) => item && typeof item.id === 'string' && typeof item.type === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y))) throw new Error('Invalid NAD file: component records are malformed.');
  if (!wires.every((item) => item && typeof item.id === 'string' && Array.isArray(item.path))) throw new Error('Invalid NAD file: wire records are malformed.');
  if (!texts.every((item) => item && typeof item.id === 'string' && typeof item.text === 'string')) throw new Error('Invalid NAD file: annotation records are malformed.');
  return { format: NAD_FORMAT, version: NAD_VERSION, components, wires, texts, viewport: { pan, zoom }, workspace: { gridVisible: workspace.gridVisible, snapEnabled: workspace.snapEnabled } };
}
