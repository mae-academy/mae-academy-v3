import LZString from 'lz-string';
import { isJunctionId } from '@/components/common/schematic/schematicGeometry';
import type { SchematicComponent, SchematicDocument, SchematicText, SchematicWire } from '@/components/common/schematic/schematicTypes';
import { getFluidDefinition, type FluidMedium } from './fluidCatalog';
import { sanitizeLadder, type LadderCircuit } from './relayLadder';

export const FLUID_PROJECT_FORMAT = 'mae-fluid-project';
export const FLUID_PROJECT_VERSION = 1;
/** Native schematic file extension shared by every studio. */
export const FLUID_PROJECT_EXTENSION = '.nad';

export interface FluidProject extends SchematicDocument<SchematicComponent> {
  medium: FluidMedium;
  /** The relay ladder of the Control Circuit tab; absent in projects saved before it existed. */
  ladder?: LadderCircuit;
}

export const serializeFluidProject = (project: FluidProject): string =>
  JSON.stringify({ format: FLUID_PROJECT_FORMAT, version: FLUID_PROJECT_VERSION, ...project });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Share-link payload: the serialized project, LZ-compressed into a URL-safe string. */
export const encodeSharePayload = (project: FluidProject): string => LZString.compressToEncodedURIComponent(serializeFluidProject(project));

/** Reads a `?project=` value: a compressed payload, or the raw JSON older links carried. */
export function decodeSharePayload(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const text = LZString.decompressFromEncodedURIComponent(trimmed);
  if (!text) throw new Error('the share link is damaged or incomplete');
  return text;
}

/**
 * Parses and validates a project file; throws a readable message when it is not a fluid schematic.
 *
 * Two phases: every part is registered first, then pipes are resolved against that registry. A pipe end is valid when it
 * lands on a registered part or on a T-junction pseudo-node (`junc_…`, created when a pipe is tapped). A pipe that points at
 * a part that does not exist is skipped with a warning instead of failing the whole load.
 */
export function parseFluidProject(text: string, warn: (message: string) => void = message => console.warn(message)): FluidProject {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('not valid JSON'); }
  if (!isRecord(raw) || raw.format !== FLUID_PROJECT_FORMAT) throw new Error('not a fluid schematic file');
  if (raw.medium !== 'PNEUMATIC' && raw.medium !== 'HYDRAULIC') throw new Error('unknown medium');
  if (!Array.isArray(raw.components) || !Array.isArray(raw.wires)) throw new Error('missing components or wires');

  const components = raw.components.map((entry): SchematicComponent => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.type !== 'string' || !isNumber(entry.x) || !isNumber(entry.y)) throw new Error('malformed component');
    if (!getFluidDefinition(entry.type)) throw new Error(`unknown component type "${entry.type}"`);
    return {
      id: entry.id, type: entry.type, x: entry.x, y: entry.y,
      rotation: isNumber(entry.rotation) ? entry.rotation : 0,
      flipH: Boolean(entry.flipH), flipV: Boolean(entry.flipV),
      label: typeof entry.label === 'string' ? entry.label : entry.type,
      props: isRecord(entry.props) ? entry.props : {},
    };
  });
  const registry = new Map(components.map(component => [component.id, component] as const));
  const wires: SchematicWire[] = [];
  for (const entry of raw.wires) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.fromComp !== 'string' || typeof entry.fromTerm !== 'string' || typeof entry.toComp !== 'string' || typeof entry.toTerm !== 'string') throw new Error('malformed pipe');
    const resolves = (id: string) => registry.has(id) || isJunctionId(id);
    if (!resolves(entry.fromComp) || !resolves(entry.toComp)) {
      warn(`Skipped pipe "${entry.id}": it connects a missing component (${!resolves(entry.fromComp) ? entry.fromComp : entry.toComp}).`);
      continue;
    }
    wires.push(entry as unknown as SchematicWire);
  }
  const texts = Array.isArray(raw.texts) ? (raw.texts.filter(isRecord) as unknown as SchematicText[]) : [];
  return { medium: raw.medium, components, wires, texts, ...(raw.ladder !== undefined ? { ladder: sanitizeLadder(raw.ladder) } : {}) };
}
