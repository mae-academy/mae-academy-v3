/* Domain-neutral schematic document model shared by every schematic studio
   (Electrical Circuits, Digital Logic). Studio-specific component/wire types are
   structural supersets of these, so they flow through the shared canvas unchanged. */

export type SchematicPoint = [number, number];

export type TerminalAxis = 'horizontal' | 'vertical';

export interface SchematicComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  label: string;
  props: Record<string, unknown>;
}

export type SchematicWireRouting = 'orthogonal' | 'straight' | 'manual';

export interface SchematicWire {
  id: string;
  fromComp: string;
  fromTerm: string;
  toComp: string;
  toTerm: string;
  path: SchematicPoint[];
  waypoints?: SchematicPoint[];
  routing: SchematicWireRouting;
  color?: string;
  junctionPoint?: SchematicPoint;
  junctionWireId?: string;
}

export interface SchematicText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

export type SchematicSelection =
  | { kind: 'component'; id: string }
  | { kind: 'wire'; id: string }
  | { kind: 'text'; id: string }
  | null;

export interface SchematicDocument<C extends SchematicComponent = SchematicComponent> {
  components: C[];
  wires: SchematicWire[];
  texts: SchematicText[];
}

/** A component pin resolved to world coordinates by the owning component library. */
export interface SchematicTerminal {
  id: string;
  position: SchematicPoint;
  /** Optional pin caption rendered next to the terminal dot. */
  label?: string;
}

export interface TerminalHit {
  componentId: string;
  terminalId: string;
  position: SchematicPoint;
  axis: TerminalAxis;
}

export interface WireEndpoints {
  from: SchematicPoint;
  to: SchematicPoint;
  fromAxis: TerminalAxis;
  toAxis: TerminalAxis;
}

export interface SchematicBounds {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** Obstacle-aware orthogonal router bound to one component library's pin geometry. */
export type SchematicRouter<C extends SchematicComponent> = (
  from: SchematicPoint,
  to: SchematicPoint,
  components: C[],
  excludeIds: Set<string>,
  fromAxis?: TerminalAxis,
  toAxis?: TerminalAxis,
) => SchematicPoint[];

/**
 * The ONLY component-library surface the shared canvas depends on. Everything else
 * (viewport, grid, wiring, selection, history, clipboard, shortcuts) is studio-agnostic.
 */
export interface SchematicComponentLibrary<C extends SchematicComponent> {
  /** World-space pins for hit-testing, wiring and terminal rendering. */
  getTerminals: (component: C) => SchematicTerminal[];
  /** World-space body hit-test (rotation/flip aware). */
  hitTest: (component: C, point: SchematicPoint) => boolean;
  route: SchematicRouter<C>;
  /** Returns null when the part cannot be placed (unknown type or gated by the studio). */
  createComponent: (type: string, position: SchematicPoint, existing: C[]) => C | null;
  nextLabel: (type: string, existing: C[]) => string;
  /** Defaults to a deep-props clone with the new id/label/position. */
  cloneForPaste?: (source: C, id: string, label: string, x: number, y: number) => C;
  /** Rejects a clipboard payload the studio cannot host; return a message to block the paste. */
  validatePaste?: (components: C[]) => string | null;
  /** Transform applied to the symbol group inside the component's translate frame. */
  symbolScale?: (component: C) => number;
  /** Effective symbol stroke width (stroke × symbolScale); wires are drawn with exactly this width. */
  wireStrokeWidth?: number;
}

export type SchematicDragState =
  | { kind: 'component'; id: string; offset: SchematicPoint; origin: SchematicPoint; ids: string[] }
  | { kind: 'text'; id: string; offset: SchematicPoint }
  | { kind: 'wireCorner'; id: string; corner: number }
  | { kind: 'pan'; client: SchematicPoint }
  | { kind: 'marquee'; start: SchematicPoint; end: SchematicPoint }
  | null;

export interface SchematicWiringState {
  from?: TerminalHit;
  /** Intentional user-placed turns; the final leg follows the cursor. */
  lockedCorners?: SchematicPoint[];
}

export type SchematicGridMode = 'dots' | 'cartesian' | 'hidden';
