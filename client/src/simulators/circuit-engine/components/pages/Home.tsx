import { BaseSchematicCanvas } from '@/components/common/schematic/BaseSchematicCanvas';
import { useSchematicCanvas } from '@/components/common/schematic/useSchematicCanvas';
import { pointInComponentBox } from '@/components/common/schematic/schematicGeometry';
import type { SchematicBounds, SchematicComponentLibrary, SchematicTerminal } from '@/components/common/schematic/schematicTypes';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
/* MAE Luminous Technical Atelier: Tab D keeps documented 25 px terminal geometry,
   direct electromechanical controls, and a quiet Control Systems-aligned inspector. */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cable,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FileCode,
  FileImage,
  FlipHorizontal,
  FlipVertical,
  Grid3X3,
  Info,
  Library,
  Maximize2,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Share2,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Upload,
  Zap,
  CircuitBoard,
  Image as ImageIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { V3Math } from '@/components/ui/V3Math';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/circuit-engine/models/katexSvgFonts';
import { AnalysisBox } from '@/simulators/circuit-engine/components/ui-components/AnalysisBox';
import { SegmentedControl, StudioSlider } from '@/components/common/templates';
import { OscilloscopeTracePanel } from '@/simulators/circuit-engine/components/ui-components/OscilloscopeTracePanel';
import { OscilloscopeComponentPanel } from '@/simulators/circuit-engine/components/inspector-panels/OscilloscopeComponentPanel';
import { useOscilloscopeDisplaySettings, type OscilloscopeDisplaySettings } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';
import { ExportPreviewModal, svgToPngBlob, type ExportItem } from '@/simulators/circuit-engine/components/ui-components/ExportPreviewModal';
import { ShareProjectModal } from '@/simulators/circuit-engine/components/ui-components/ShareProjectModal';
import { LoadExampleModal } from '@/simulators/circuit-engine/components/ui-components/LoadExampleModal';
import type { ExampleDefinition } from '@/simulators/circuit-engine/examples';
import type { AnalysisMethod, AnalysisTrace, MeshCycle, NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
import {
  CATEGORIES,
  getComponentsByCategory,
  getDef,
  LED_FORWARD_VOLTAGES,
  type ComponentDef,
  type PropertyDef,
} from '@/simulators/circuit-engine/models/componentDefs';
import {
  componentPrefix,
  copyComponentForPaste,
  formatEngineering,
  nextComponentLabel,
  replaceComponent,
  terminalKey,
  type CircuitComponent,
  type CircuitWire,
  type InstrumentReading,
  type SamplePoint,
  type Selection,
  type SimulationSnapshot,
  type WorkspaceText,
} from '@/simulators/circuit-engine/models/circuitTypes';
import { SimulationEngine } from '@/simulators/circuit-engine/engine/simulation';
import { detectCoilConflicts } from '@/simulators/circuit-engine/engine/analogSimulation';
import { evaluateComponentHealth } from '@/simulators/circuit-engine/models/componentHealthCheck';
import { compileNodalGeometry, useSimulation, type TabBMnaState } from '@/simulators/circuit-engine/components/hooks/useSimulation';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { compileMeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';
import {
  createNadDocument,
  parseNad,
  serializeNad,
  normalizeWire,
  compressProjectState,
  decompressProjectState,
  type NADDocument,
} from '@/simulators/circuit-engine/models/nadFormat';
import { useSpiceEngine } from '@/simulators/circuit-engine/components/hooks/useSpiceEngine';
import {
  convertToSpiceComponents,
  detectSystemFrequency,
  resolveCircuitNets,
  SpiceAdapterError,
  type SimulationMode,
  type SpiceCircuitNets,
} from '@/simulators/circuit-engine/engine/spice/spiceAdapter';
import type { SpiceNet } from '@/simulators/circuit-engine/engine/spice/spiceTypes';

/** Coil-driven part types whose armature can stay latched via a contact wired back onto its own coil. */
const COIL_DRIVEN_TYPES = ['coil', 'contactor', 'relay-spst', 'relay-spdt', 'relay-dpst'];
import { buildSpiceNodeMap, generateNetlist, NetlistError, requiresTransientInitialConditions, type SpiceNodeMap } from '@/simulators/circuit-engine/engine/spice/netlistGenerator';
import { parseSpiceResults } from '@/simulators/circuit-engine/engine/spice/spiceParser';
import { buildSpiceInstrumentReadings } from '@/simulators/circuit-engine/engine/spice/spiceInstruments';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from '@/simulators/circuit-engine/models/analogComponentCatalog';
import { alignTabDTerminalToGrid, calculateMeshLoopBounds, calculateTabDPlanarCavity, dynamicRubberBandPath, getExactTerminalOffset, isExactCadComponent, lockTabDWireCorner, MESH_LOOP_COLORS, moveTabDOrthogonalLane, tabDComponentLabelAnchors, tabDGentleWheelZoomFactor, tabDOrthogonalDraftPath, tabDTerminalOrthogonalPath, type ObstacleBox, type TabDTerminalAxis } from '@/simulators/circuit-engine/components/analogCanvasGeometry';
import { formatMeterReading, renderComponentCanvasLabel, renderSymbol, formatDependentSourceMath, renderDependentSourceValueTspans } from '@/simulators/circuit-engine/components/symbols';
import { applySwitchHotkey, directControlKind, hotkeyDigit, isTextEntryTarget, momentaryControlProps, nextLatchingControlProps, releaseHeldPushbuttons } from '@/simulators/circuit-engine/models/componentInteraction';
import { getBrokenWireIds } from '@/simulators/circuit-engine/engine/brokenBranches';
import {
  addWireCorner,
  getDotsOnPath,
  getTerminalWorldPos,
  insertPointIntoWirePath,
  isNearTerminal,
  moveWireCorner,
  nearestWireCorner,
  pathLength,
  pointsToPath,
  projectPointOntoWire,
  reconnectPathEndpoints,
  reversedPath,
  routePath,
  routeTJunctionPath,
  simplifyOrthogonalPath,
  snapPointToGrid,
  snapToGrid,
  type Obstacle,
  type Point,
} from '@/simulators/circuit-engine/models/wiring';
import { buildJumpArcPath, calculateWireIntersections, getWirePoints, junctionDotPositions } from '@/simulators/circuit-engine/models/wireIntersections';
import { calculateOrthogonalPath } from '@/simulators/circuit-engine/models/wireRouter';
import {
  useHistory,
  areSnapshotsEqual,
  cloneSnapshot,
  type CanvasSnapshot,
} from '@/simulators/circuit-engine/components/hooks/useHistory';

const GRID_SIZE = 20;
const TAB_D_GRID_SIZE = 25;
const TAB_D_SYMBOL_SCALE = 1.5;
const TERMINAL_HIT_RADIUS = 13;
const TERMINAL_RADIUS = 4;
const CONTROL_SYSTEMS_HEADING = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';
/* Unified signature gradient (pure horizontal left-to-right from blue-600 through purple to rose). */
const TAB_GRADIENT = 'linear-gradient(to right, #2563EB, #7C3AED, #E11D48)';
const TAB_GRADIENT_REV = 'linear-gradient(to right, #E11D48, #7C3AED, #2563EB)';
const TAB_ACTIVE_SHADOW = '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)';
/** Debounce before an edited circuit re-runs through the SPICE accuracy bridge. */
const SPICE_DEBOUNCE_MS = 400;
/** How many periods of the detected system frequency a `.tran` accuracy pass covers. */
const SPICE_TRAN_PERIODS = 5;
/**
 * How far the pointer may travel, in world units, before a press on a latching control counts as a
 * drag rather than a click. A switch has to stay draggable, so the toggle only fires if the pointer
 * effectively stayed put between press and release.
 */
const CLICK_DRAG_TOLERANCE = 3;
type SpiceBridgeStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ready' }
  | { kind: 'unsupported'; reason: string };
const EMPTY_SNAPSHOT: SimulationSnapshot = {
  time: 0,
  nodeVoltages: {},
  terminalVoltages: {},
  branchCurrents: {},
  wireCurrents: {},
  componentPowered: {},
  componentIntensity: {},
  nodeHistory: {},
  branchHistory: {},
  instrumentReadings: {},
  warnings: [],
  converged: true,
};

type DragState =
  | { kind: 'component'; id: string; offset: Point }
  | { kind: 'text'; id: string; offset: Point }
  | { kind: 'wireCorner'; id: string; corner: number }
  | { kind: 'pan'; client: Point }
  | { kind: 'marquee'; start: Point; end: Point }
  | null;

interface WiringState {
  from?: { componentId: string; terminalId: string; position: Point; axis: TabDTerminalAxis };
  /** Tab D keeps intentional turns while the final leg follows the cursor. */
  lockedCorners?: Point[];
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ENGINEERING_PREFIXES = [
  { key: 'p', symbol: 'p', factor: 1e-12 }, { key: 'n', symbol: 'n', factor: 1e-9 },
  { key: 'µ', symbol: 'µ', factor: 1e-6 }, { key: 'm', symbol: 'm', factor: 1e-3 },
  { key: '', symbol: '', factor: 1 }, { key: 'k', symbol: 'k', factor: 1e3 },
  { key: 'M', symbol: 'M', factor: 1e6 }, { key: 'G', symbol: 'G', factor: 1e9 },
] as const;
const PREFIXABLE_UNITS = new Set(['Ω', 'F', 'H', 'V', 'A']);

function prefixStateKey(propertyKey: string) { return `__mae_prefix_${propertyKey}`; }
function engineeringFactor(prefix: string): number { return ENGINEERING_PREFIXES.find(item => item.key === prefix)?.factor ?? 1; }
function engineeringPrefixFor(value: number): string {
  const absolute = Math.abs(value);
  if (absolute === 0) return '';
  return ENGINEERING_PREFIXES.reduce((candidate, prefix) => Math.abs(Math.log10(absolute / prefix.factor)) < Math.abs(Math.log10(absolute / candidate.factor)) ? prefix : candidate, ENGINEERING_PREFIXES[4]).key;
}

function defaultProps(definition: ComponentDef): Record<string, unknown> {
  return Object.fromEntries(Object.entries(definition.properties).map(([key, definition]) => [key, definition.value]));
}

function getComponentTerminalPosition(component: CircuitComponent, terminalId: string): Point | null {
  const definition = getDef(component.type);
  const terminal = definition?.terminals.find(item => item.id === terminalId);
  if (!terminal) return null;
  return getTerminalWorldPos(
    component.x,
    component.y,
    terminal.x,
    terminal.y,
    component.rotation,
    component.flipH,
    component.flipV,
  );
}

function oneBendManhattanPath(from: Point, to: Point): Point[] {
  if (from[0] === to[0] || from[1] === to[1]) return [from, to];
  const corner: Point = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]) ? [to[0], from[1]] : [from[0], to[1]];
  return [from, corner, to];
}

/** Renders an explicit clockwise current reference at the geometrical bounding-box midpoint of one bounded mesh face. */
function MeshLoopOverlay({ cycle, tabDUiRefinement, components = [], scale = 1, wires = [] }: { cycle: MeshCycle; tabDUiRefinement?: boolean; components?: CircuitComponent[]; scale?: number; wires?: CircuitWire[] }) {
  const { cx, cy, R } = calculateMeshLoopBounds(cycle, components, wires, scale);
  const color = MESH_LOOP_COLORS[cycle.index % MESH_LOOP_COLORS.length];

  // Clockwise circular arrow arc sweeping from -45° to -90° (12 o'clock, 315° arc)
  // leaving an open 45° gap where the arrow marker cleanly points in the clockwise tangent direction
  const startAngle = -Math.PI / 4;
  const startX = cx + R * Math.cos(startAngle);
  const startY = cy + R * Math.sin(startAngle);
  const endX = cx;
  const endY = cy - R;
  const pathData = `M ${startX} ${startY} A ${R} ${R} 0 1 1 ${endX} ${endY}`;

  return (
    <g pointerEvents="none" aria-label={`Clockwise mesh current I ${cycle.index + 1}`}>
      <path
        d={pathData}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd={`url(#mesh-arrow-${cycle.index})`}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        style={{
          fontSize: '13px',
          fontWeight: 400,
        }}
      >
        <tspan style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif" }}>I</tspan>
        <tspan dy="3.5px" style={{ fontSize: "9px", fontStyle: "normal", fontFamily: "'KaTeX_Main', sans-serif" }}>{cycle.index + 1}</tspan>
      </text>
    </g>
  );
}

function SvgKaTeXLabel({ x, y, math, color, ariaLabel, width = 64, height = 28 }: { x: number; y: number; math: string; color: string; ariaLabel: string; width?: number; height?: number }) {
  return <foreignObject x={x - width / 2} y={y - height / 2} width={width} height={height} pointerEvents="none" aria-label={ariaLabel} style={{ overflow: 'visible' }}><div className="flex h-full w-full items-center justify-center whitespace-nowrap" style={{ color, fontSize: 13, fontWeight: 400, lineHeight: 1, overflow: 'visible' }}><V3Math math={math} /></div></foreignObject>;
}

function ComponentPaletteIcon({ definition, colors, documented, isDark }: { definition: ComponentDef; colors: Palette; documented: boolean; isDark?: boolean }) {
  const padding = 20; // Safe optical padding
  let w = definition.width + padding;
  let h = definition.height + padding;

  let offsetY = 0;
  if (definition.id === 'dmm') {
    offsetY = -5;
    w = 100;
    h = 130;
  } else if (definition.id === 'pb-no') {
    offsetY = -10;
  } else if (['pb-nc', 'sw-spst-no', 'sw-spst-nc', 'aux-contact-no', 'aux-contact-nc'].includes(definition.id)) {
    offsetY = -5;
  } else if (definition.terminals && definition.terminals.length > 0) {
    const yCoords = definition.terminals.map(t => t.y);
    const minY = Math.min(...yCoords);
    const maxY = Math.max(...yCoords);
    if (minY !== -maxY) {
      offsetY = (minY + maxY) / 2;
    }
  }

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${-w / 2} ${offsetY - h / 2} ${w} ${h}`}
      aria-hidden="true"
      style={{ overflow: 'visible', color: colors.text, pointerEvents: 'none' }}
    >
      <g>
        {renderSymbol(definition.symbol, false, { ...defaultProps(definition), _documentedStyle: documented, _isLibraryThumbnail: true, isDark, _isDark: isDark }, 0)}
      </g>
    </svg>
  );
}

/**
 * Nominal visual clearance between a label edge and the component's outermost
 * schematic stroke. Derived from the component footprint so the gap stays
 * tight (4px–8px) at every scale and rotation, never a per-component constant.
 */
function labelClearance(definition: ComponentDef, scale = 1): number {
  const footprint = Math.min(definition.width, definition.height) * scale;
  return Math.min(8, Math.max(4, footprint * 0.15));
}

/** Labels are outside the rotated symbol group, so their baseline stays horizontal at every angle. */
function horizontalLabelOffset(definition: ComponentDef, rotation: number, scale = 1): Point {
  const normalized = ((rotation % 360) + 360) % 360;
  const isDiode = ['diode', 'diode-ideal', 'diode-silicon', 'diode-germanium', 'diode-gaas', 'zener', 'led', 'photodiode'].includes(definition.id);
  if (normalized === 90 || normalized === 270) {
    return [isDiode ? 17 : (definition.width * scale / 2 + 12), -6]; // تم التقليل من 26
  }
  return [0, -(isDiode ? 14 : (definition.height * scale / 2 + 8))]; // تم التقليل من 18
}

function componentLabelAnchors(definition: ComponentDef, component: CircuitComponent, scale = 1): {
  reference: Point;
  value: Point;
  isHorizontal: boolean;
  refTextAnchor?: 'start' | 'middle' | 'end';
  valTextAnchor?: 'start' | 'middle' | 'end';
} {
  if (component.type === 'dc-rail') {
    const rot = ((component.rotation % 360) + 360) % 360;
    if (rot === 0) {
      return { reference: [0, -16], value: [24, -8], isHorizontal: false, refTextAnchor: 'middle', valTextAnchor: 'start' };
    }
    const rad = rot * Math.PI / 180;
    return {
      reference: [Math.round(0 * Math.cos(rad) - (-16) * Math.sin(rad)), Math.round(0 * Math.sin(rad) + (-16) * Math.cos(rad))],
      value: [Math.round(24 * Math.cos(rad) - (-8) * Math.sin(rad)), Math.round(24 * Math.sin(rad) + (-8) * Math.cos(rad))],
      isHorizontal: rot === 90 || rot === 270,
      refTextAnchor: 'middle',
      valTextAnchor: rot === 180 ? 'end' : 'start',
    };
  }

  if (component.type === 'dmm') {
    return { reference: [0, -75], value: [0, 75], isHorizontal: true, refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  if (component.type === 'three-phase-rail') {
    return { reference: [60, -12], value: [60, 8], isHorizontal: false, refTextAnchor: 'start', valTextAnchor: 'start' };
  }

  if (component.type === 'potentiometer') {
    const rot = ((component.rotation % 360) + 360) % 360;
    const isVertical = rot === 90 || rot === 270;
    if (isVertical) {
      return { reference: [16, -6], value: [16, 10], isHorizontal: false, refTextAnchor: 'start', valTextAnchor: 'start' };
    }
    return { reference: [12, -18], value: [0, 14], isHorizontal: true, refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  const TRANSISTOR_TYPES = new Set(['bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'jfet-n', 'jfet-p']);
  if (TRANSISTOR_TYPES.has(component.type)) {
    return { reference: [0, -24], value: [0, 26], isHorizontal: true, refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  if (component.type === 'scr') {
    const rot = ((component.rotation % 360) + 360) % 360;
    const isVertical = rot === 0 || rot === 180;
    if (isVertical) {
      return { reference: [22, -6], value: [22, 10], isHorizontal: false, refTextAnchor: 'start', valTextAnchor: 'start' };
    }
    return { reference: [0, -26], value: [0, 26], isHorizontal: true, refTextAnchor: 'middle', valTextAnchor: 'middle' };
  }

  let terminalsAreHorizontal = component.rotation % 180 === 0;
  if (definition.terminals.length === 2) {
    const [first, second] = definition.terminals;
    const localX = (first.x - second.x) * (component.flipH ? -1 : 1) * scale;
    const localY = (first.y - second.y) * (component.flipV ? -1 : 1) * scale;
    const radians = component.rotation * Math.PI / 180;
    const actualX = localX * Math.cos(radians) - localY * Math.sin(radians);
    const actualY = localX * Math.sin(radians) + localY * Math.cos(radians);
    terminalsAreHorizontal = Math.abs(actualX) >= Math.abs(actualY);
  } else if (component.type.startsWith('transformer') || component.type === 'autotransformer') {
    // Transformers default orientation has primary left and secondary right.
    // Horizontal rotation (0°/180°) means labels sit ABOVE and BELOW the core ([0, -offsetY] & [0, offsetY]).
    terminalsAreHorizontal = component.rotation % 180 === 0;
  }

  const halfH = definition.height * scale / 2;
  const halfW = definition.width * scale / 2;
  const anchors = tabDComponentLabelAnchors(component.type, terminalsAreHorizontal, halfW, halfH);
  return { ...anchors, isHorizontal: terminalsAreHorizontal };
}

/** Reference anchor only (kept for hit-testing). */
function componentLabelOffset(definition: ComponentDef, component: CircuitComponent, scale = 1): Point {
  return componentLabelAnchors(definition, component, scale).reference;
}

/** Value anchor, so Reference and Value never stack on the same side. */
function componentValueAnchor(definition: ComponentDef, component: CircuitComponent, scale = 1): Point {
  return componentLabelAnchors(definition, component, scale).value;
}

function componentDisplayValue(definition: ComponentDef, component: CircuitComponent): string | null {
  if (component.type === 'oscilloscope') return null;

  if (['transformer', 'transformer-ct', 'autotransformer'].includes(component.type)) {
    const n = numeric(component.props.turnRatio, definition.properties.turnRatio?.value ?? (component.type === 'autotransformer' ? 2 : 5));
    if (n >= 1) return `${Number(n.toPrecision(4))}:1`;
    return `1:${Number((1 / n).toPrecision(4))}`;
  }

  if (component.type === 'impedance' || component.type === 'ac-voltage' || component.type === 'ac-current') {
    const isImpedance = component.type === 'impedance';
    const format = String(component.props.format ?? (isImpedance ? 'rectangular' : 'polar'));
    const unit = component.type === 'ac-voltage' ? 'V' : component.type === 'ac-current' ? 'A' : 'Ω';

    if (format === 'polar') {
      const magKey = isImpedance ? 'mag' : 'amplitude';
      const angKey = isImpedance ? 'ang' : 'phase';
      const defaultMag = component.type === 'ac-voltage' ? 10 : component.type === 'ac-current' ? 1 : 5;
      const defaultAng = isImpedance ? 53.13 : 0;
      const mag = numeric(component.props[magKey], defaultMag);
      const ang = numeric(component.props[angKey], defaultAng);
      const isRad = String(component.props.angleUnit) === 'radian';
      return `${mag} ∠ ${ang}${isRad ? ' rad' : '°'} ${unit}`;
    }

    const rKey = isImpedance ? 'r' : 'real';
    const xKey = isImpedance ? 'x' : 'imag';
    const defaultR = component.type === 'ac-voltage' ? 10 : component.type === 'ac-current' ? 1 : 3;
    const defaultX = isImpedance ? 4 : 0;
    const r = numeric(component.props[rKey], defaultR);
    const x = numeric(component.props[xKey], defaultX);
    const sign = x >= 0 ? '+' : '-';
    return `${r} ${sign} j${Math.abs(x)} ${unit}`;
  }
  const entry = Object.entries(definition.properties).find(([, property]) => property.type === 'number' && property.unit);
  if (!entry) return null;
  const [key, property] = entry;
  const value = numeric(component.props[key], numeric(property.value));
  const prefix = String(component.props[prefixStateKey(key)] ?? (PREFIXABLE_UNITS.has(property.unit ?? '') ? engineeringPrefixFor(value) : ''));
  const factor = PREFIXABLE_UNITS.has(property.unit ?? '') ? engineeringFactor(prefix) : 1;
  const visibleValue = Number((value / factor).toPrecision(12));
  const rawUnit = property.unit ?? '';
  const cleanUnit = rawUnit === 'Ohm' ? 'Ω' : rawUnit;
  const unit = `${prefix}${cleanUnit}`.replace(/\u00B5/g, '\u03BC');
  return `${visibleValue} ${unit}`;
}

/** Renders component value strings with KaTeX math styling, formatting Greek mu (μ) in KaTeX_Math italic. */
function renderFormattedValueTspans(value: string) {
  const normalized = value.replace(/\u00B5/g, '\u03BC');
  const parts = normalized.split(/(\u03BC)/g);
  return parts.map((part, index) => {
    if (part === '\u03BC') {
      return (
        <tspan
          key={index}
          fontFamily="'KaTeX_Math', 'KaTeX_Main', serif"
          fontStyle="italic"
          style={{ fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif", fontStyle: 'italic' }}
        >
          {part}
        </tspan>
      );
    }
    return (
      <tspan
        key={index}
        fontFamily="'KaTeX_Main', 'KaTeX_Math', serif"
        fontStyle="normal"
        style={{ fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif", fontStyle: 'normal' }}
      >
        {part}
      </tspan>
    );
  });
}


/**
 * Deep Style Inliner — Aggressive SVG Sanitizer for MS Word / Illustrator / Figma
 *
 * MS Word's SVG renderer is extremely restricted:
 *   - Strips ALL <style> tags
 *   - Ignores CSS classes and var(--…) references
 *   - Drops <foreignObject> entirely
 *   - Doesn't resolve currentColor
 *   - Requires explicit fill/stroke/font-* attributes on every element
 *
 * This function walks the live source DOM and the cloned SVG in lockstep,
 * reading `window.getComputedStyle()` from the source (which is still mounted)
 * and writing hardcoded SVG presentation attributes onto the clone.
 *
 * After this function completes, the cloned SVG is fully self-contained:
 * no CSS resolution needed, no external stylesheets, no currentColor.
 */
function inlineComputedStyles(sourceNode: Element, clonedNode: Element): void {
  // Only process SVG namespace elements
  if (sourceNode.namespaceURI !== 'http://www.w3.org/2000/svg') return;

  try {
    const cs = window.getComputedStyle(sourceNode);

    // Read the resolved `color` property — this is what currentColor maps to
    const resolvedColor = cs.getPropertyValue('color').trim();

    // Helper: resolve currentColor → actual RGB/hex, and convert transparent to 'none'
    const resolveColor = (raw: string): string => {
      let v = raw.trim();
      if (v === 'currentColor' || v === 'currentcolor') v = resolvedColor;
      // rgba(0, 0, 0, 0) is how browsers represent fill="none" / invisible
      if (v === 'rgba(0, 0, 0, 0)' || v === 'transparent') v = 'none';
      return v;
    };

    // ── Fill ─────────────────────────────────────────────────────────
    const rawFill = cs.getPropertyValue('fill').trim();
    const fill = resolveColor(rawFill);
    // Always write fill — MS Word needs it explicit. Skip url() (pattern) fills.
    if (!fill.startsWith('url(')) {
      clonedNode.setAttribute('fill', fill || 'none');
    }

    // ── Stroke ───────────────────────────────────────────────────────
    const rawStroke = cs.getPropertyValue('stroke').trim();
    const stroke = resolveColor(rawStroke);
    if (!stroke.startsWith('url(')) {
      clonedNode.setAttribute('stroke', stroke || 'none');
    }

    // ── Stroke-width — ALWAYS write (MS Word doesn't have a default) ─
    const strokeWidth = cs.getPropertyValue('stroke-width').trim();
    if (strokeWidth) {
      clonedNode.setAttribute('stroke-width', strokeWidth);
    }

    // ── Stroke line styling ──────────────────────────────────────────
    const strokeLinecap = cs.getPropertyValue('stroke-linecap').trim();
    if (strokeLinecap && strokeLinecap !== 'butt') {
      clonedNode.setAttribute('stroke-linecap', strokeLinecap);
    }
    const strokeLinejoin = cs.getPropertyValue('stroke-linejoin').trim();
    if (strokeLinejoin && strokeLinejoin !== 'miter') {
      clonedNode.setAttribute('stroke-linejoin', strokeLinejoin);
    }
    const strokeDasharray = cs.getPropertyValue('stroke-dasharray').trim();
    if (strokeDasharray && strokeDasharray !== 'none') {
      clonedNode.setAttribute('stroke-dasharray', strokeDasharray);
    }
    const strokeDashoffset = cs.getPropertyValue('stroke-dashoffset').trim();
    if (strokeDashoffset && strokeDashoffset !== '0px' && strokeDashoffset !== '0') {
      clonedNode.setAttribute('stroke-dashoffset', strokeDashoffset);
    }
    const strokeOpacity = cs.getPropertyValue('stroke-opacity').trim();
    if (strokeOpacity && strokeOpacity !== '1') {
      clonedNode.setAttribute('stroke-opacity', strokeOpacity);
    }
    const fillOpacity = cs.getPropertyValue('fill-opacity').trim();
    if (fillOpacity && fillOpacity !== '1') {
      clonedNode.setAttribute('fill-opacity', fillOpacity);
    }

    // ── Opacity ──────────────────────────────────────────────────────
    const opacity = cs.getPropertyValue('opacity').trim();
    if (opacity && opacity !== '1') {
      clonedNode.setAttribute('opacity', opacity);
    }

    // ── Paint-order (critical for label halo effect) ─────────────────
    const paintOrder = cs.getPropertyValue('paint-order').trim();
    if (paintOrder && paintOrder !== 'normal' && paintOrder !== 'fill') {
      clonedNode.setAttribute('paint-order', paintOrder);
    }

    // ── Text properties (for <text>, <tspan>) ────────────────────────
    const tag = sourceNode.tagName.toLowerCase();
    const isTextEl = tag === 'text' || tag === 'tspan';
    if (isTextEl) {
      const fontFamily = cs.getPropertyValue('font-family').trim();
      if (fontFamily) clonedNode.setAttribute('font-family', fontFamily);

      const fontSize = cs.getPropertyValue('font-size').trim();
      if (fontSize) clonedNode.setAttribute('font-size', fontSize);

      const fontWeight = cs.getPropertyValue('font-weight').trim();
      if (fontWeight && fontWeight !== '400' && fontWeight !== 'normal') {
        clonedNode.setAttribute('font-weight', fontWeight);
      }

      const fontStyle = cs.getPropertyValue('font-style').trim();
      if (fontStyle && fontStyle !== 'normal') {
        clonedNode.setAttribute('font-style', fontStyle);
      }

      const textAnchor = cs.getPropertyValue('text-anchor').trim();
      if (textAnchor && textAnchor !== 'start') {
        clonedNode.setAttribute('text-anchor', textAnchor);
      }

      const dominantBaseline = cs.getPropertyValue('dominant-baseline').trim();
      if (dominantBaseline && dominantBaseline !== 'auto') {
        clonedNode.setAttribute('dominant-baseline', dominantBaseline);
      }

      const letterSpacing = cs.getPropertyValue('letter-spacing').trim();
      if (letterSpacing && letterSpacing !== 'normal' && letterSpacing !== '0px') {
        clonedNode.setAttribute('letter-spacing', letterSpacing);
      }

      const textDecoration = cs.getPropertyValue('text-decoration-line').trim();
      if (textDecoration && textDecoration !== 'none') {
        clonedNode.setAttribute('text-decoration', textDecoration);
      }
    } else {
      // Non-text elements may still have font attributes (e.g., <g> inheriting)
      const fontFamily = cs.getPropertyValue('font-family').trim();
      if (fontFamily) clonedNode.setAttribute('font-family', fontFamily);
    }

    // ── Visibility / Display ─────────────────────────────────────────
    const visibility = cs.getPropertyValue('visibility').trim();
    if (visibility === 'hidden' || visibility === 'collapse') {
      clonedNode.setAttribute('visibility', visibility);
    }
    const display = cs.getPropertyValue('display').trim();
    if (display === 'none') {
      clonedNode.setAttribute('display', 'none');
    }

    // ── Clean the clone: strip className and rewrite inline style ─────
    clonedNode.removeAttribute('class');

    // Transfer critical style properties that are SVG-only (paint-order)
    // to attributes, then strip the inline style to avoid var(--…) / CSS leaks.
    const srcStyle = (sourceNode as SVGElement).style;
    const clnStyle = (clonedNode as SVGElement).style;
    if (clnStyle && clnStyle.cssText) {
      // Preserve paint-order, strokeWidth from inline style → attribute
      if (srcStyle?.paintOrder) {
        clonedNode.setAttribute('paint-order', srcStyle.paintOrder);
      }
      if (srcStyle?.strokeWidth) {
        clonedNode.setAttribute('stroke-width', srcStyle.strokeWidth);
      }
      if (srcStyle?.strokeLinejoin) {
        clonedNode.setAttribute('stroke-linejoin', srcStyle.strokeLinejoin);
      }
      if (srcStyle?.strokeLinecap) {
        clonedNode.setAttribute('stroke-linecap', srcStyle.strokeLinecap);
      }
      // Clear the inline style — all values now live as presentation attributes
      clnStyle.cssText = '';
    }
  } catch {
    // getComputedStyle may fail for detached or non-SVG nodes; skip
  }

  // Recurse into children (source and clone share the same structure)
  const srcChildren = Array.from(sourceNode.children);
  const clnChildren = Array.from(clonedNode.children);
  const len = Math.min(srcChildren.length, clnChildren.length);
  for (let i = 0; i < len; i++) {
    inlineComputedStyles(srcChildren[i], clnChildren[i]);
  }
}

/** A flat 3px halo (tuned for the live app, where it just has to beat the grid) overwhelms
 * small glyphs once transplanted — a GND subscript or scope-axis digit can render at 8-9.5px,
 * where a 3px stroke swallows the letterform into a solid blob. Scale it to the font instead. */
function haloStrokeWidth(fontSizePx: number): number {
  return Math.max(0.6, Math.min(1.8, fontSizePx * 0.12));
}

/** Export-only pass: re-derives stroke-width on every already-haloed <text> from its own
 * font-size instead of the live app's fixed 3/3.5px. Colors are untouched — component labels,
 * per-loop mesh-current colors, and per-node V_k colors all keep their existing fill/stroke,
 * only the width that was causing the bloat is corrected. Child <tspan>s inherit stroke-width,
 * so nothing else needs touching. */
function thinHaloStrokes(clonedSvg: SVGSVGElement): void {
  clonedSvg.querySelectorAll('text[stroke]:not([stroke="none"])').forEach(node => {
    const fontSizePx = parseFloat(node.getAttribute('font-size') || '13') || 13;
    node.setAttribute('stroke-width', String(haloStrokeWidth(fontSizePx)));
    node.setAttribute('paint-order', 'stroke fill');
  });
}

/** Populates SVG text elements with KaTeX tspans for self-contained vector SVG export. */
function populateMathTspans(svgTextEl: SVGTextElement, rawText: string, baseFontSize: number) {
  if (!rawText) return;

  const symbolMap: Record<string, string> = {
    '\\Omega': 'Ω',
    '\\mu': '\u03BC',
    '\\pi': 'π',
    '\\theta': 'θ',
    '\\phi': 'ϕ',
    '\\alpha': 'α',
    '\\beta': 'β',
    '\\gamma': 'γ',
    '\\delta': 'δ',
    '\\Delta': 'Δ',
    '\\omega': 'ω',
    '\\lambda': 'λ',
    '\\sigma': 'σ',
    '\\approx': '≈',
    '\\neq': '≠',
    '\\pm': '±',
    '\\cdot': '⋅',
    '\\times': '×',
    '\\circ': '°',
    '\\angle': '∠',
    '\\infty': '∞',
    '\\leq': '≤',
    '\\geq': '≥',
  };

  let text = rawText
    .replaceAll('\\quad', ' ')
    .replaceAll('\\qquad', ' ')
    .replaceAll('\\,', ' ')
    .replaceAll('\\;', ' ')
    .replaceAll('\\!', '')
    .replaceAll('\\ ', ' ');

  for (const [cmd, sym] of Object.entries(symbolMap)) {
    text = text.replaceAll(cmd, sym);
  }

  text = text.replace(/\\(mathrm|mathit|mathbf|text)\{([^}]*)\}/g, '$2');
  text = text.replace(/\\sqrt\{([^}]*)\}/g, '√($1)');

  const tokenRegex = /(_\{[^}]+\}|_[A-Za-z0-9]|\^\{[^}]+\}|\^[A-Za-z0-9]|[^_^]+)/g;
  const matches = text.match(tokenRegex) || [text];

  let currentDy = 0;

  for (const token of matches) {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    if (token.startsWith('_')) {
      const subContent = token.startsWith('_{') ? token.slice(2, -1) : token.slice(1);
      const dy = Math.round(baseFontSize * 0.35);
      tspan.setAttribute('dy', String(dy - currentDy));
      tspan.setAttribute('font-size', `${Math.round(baseFontSize * 0.75)}px`);
      tspan.setAttribute('font-family', "'KaTeX_Main', serif");
      tspan.setAttribute('font-style', 'normal');
      tspan.style.fontFamily = "'KaTeX_Main', serif";
      tspan.style.fontStyle = 'normal';
      tspan.textContent = subContent.replace(/\u00B5/g, '\u03BC');
      currentDy = dy;
    } else if (token.startsWith('^')) {
      const supContent = token.startsWith('^{') ? token.slice(2, -1) : token.slice(1);
      const dy = -Math.round(baseFontSize * 0.4);
      tspan.setAttribute('dy', String(dy - currentDy));
      tspan.setAttribute('font-size', `${Math.round(baseFontSize * 0.75)}px`);
      tspan.setAttribute('font-family', "'KaTeX_Main', serif");
      tspan.setAttribute('font-style', 'normal');
      tspan.style.fontFamily = "'KaTeX_Main', serif";
      tspan.style.fontStyle = 'normal';
      tspan.textContent = supContent.replace(/\u00B5/g, '\u03BC');
      currentDy = dy;
    } else {
      if (currentDy !== 0) {
        tspan.setAttribute('dy', String(-currentDy));
        currentDy = 0;
      }
      tspan.setAttribute('font-size', `${baseFontSize}px`);
      tspan.setAttribute('font-family', "'KaTeX_Main', 'KaTeX_Math', serif");
      tspan.style.fontFamily = "'KaTeX_Main', 'KaTeX_Math', serif";
      tspan.textContent = token.replace(/\u00B5/g, '\u03BC');
    }
    svgTextEl.appendChild(tspan);
  }
}

function NodalNodeOverlay({ node, colors }: { node: NodalNodeLabel; colors: Palette }) {
  const [x, y] = node.centroid;
  const offsetX = node.textOffset ? node.textOffset[0] : 0;
  const offsetY = node.textOffset ? node.textOffset[1] : -14;
  // The node coordinate is the resolved topological junction (degree >= 3), never a
  // component body. The V_k label is lifted cleanly above the junction dot so it does
  // not sit on an adjacent resistor/pin.
  return (
    <g pointerEvents="none" aria-label={`Nodal voltage V ${node.index}`}>
      <circle cx={x} cy={y} r={4} fill="white" stroke={node.color} strokeWidth={2} />
      <text
        x={x + offsetX}
        y={y + offsetY}
        textAnchor="middle"
        dominantBaseline="alphabetic"
        fill={node.color}
        stroke={colors.canvas}
        strokeWidth={3}
        paintOrder="stroke fill"
        style={{
          fontSize: '13px',
          fontWeight: 400,
        }}
      >
        <tspan style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif" }}>V</tspan>
        <tspan dy="3.5px" style={{ fontSize: "9px", fontStyle: "normal", fontFamily: "'KaTeX_Main', sans-serif" }}>{node.index}</tspan>
      </text>
    </g>
  );
}

function TheveninTerminalOverlay({
  position,
  label,
  colors,
}: {
  position: [number, number];
  label: 'A' | 'B';
  colors: Palette;
  darkPreview?: boolean;
}) {
  const [x, y] = position;
  const isA = label === 'A';
  // Terminal A (Blue: #3B82F6), Terminal B (Rose/Pink: #F43F5E)
  const terminalColor = isA ? '#3B82F6' : '#F43F5E';
  const offsetX = isA ? -13 : 13;
  const offsetY = -12;

  return (
    <g pointerEvents="none" aria-label={`Thévenin Terminal ${label}`}>
      {/* Exact clone of Nodal analysis dot: single circle r=4, fill="white", strokeWidth=2 */}
      <circle
        cx={x}
        cy={y}
        r={4}
        fill="#ffffff"
        stroke={terminalColor}
        strokeWidth={2}
      />
      {/* Clean normal-weight KaTeX label matching Nodal analysis dots (fontWeight: 400) */}
      <text
        x={x + offsetX}
        y={y + offsetY}
        textAnchor="middle"
        dominantBaseline="central"
        fill={terminalColor}
        stroke={colors.canvas}
        strokeWidth={3}
        paintOrder="stroke fill"
        style={{
          fontSize: '13px',
          fontWeight: 400,
        }}
      >
        <tspan style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif" }}>
          {label}
        </tspan>
      </text>
    </g>
  );
}

/** World-space pin position; `alignToGrid` applies the Tab D terminal-to-grid snap (exact CAD parts bypass it). */
function analogTerminalPosition(component: CircuitComponent, terminalId: string, tabD: boolean, alignToGrid: boolean): Point | null {
  const definition = getDef(component.type);
  const terminal = definition?.terminals.find(item => item.id === terminalId);
  if (!terminal) return null;
  if (isExactCadComponent(component.type)) {
    const exact = getExactTerminalOffset(component.type, terminal.id) ?? [terminal.x, terminal.y];
    return getTerminalWorldPos(component.x, component.y, exact[0], exact[1], component.rotation, component.flipH, component.flipV);
  }
  const scale = tabD ? TAB_D_SYMBOL_SCALE : 1;
  const raw = getTerminalWorldPos(component.x, component.y, terminal.x * scale, terminal.y * scale, component.rotation, component.flipH, component.flipV);
  return alignToGrid && tabD ? alignTabDTerminalToGrid(raw, TAB_D_GRID_SIZE) : raw;
}

/** Symbol-accurate body extents for parts whose drawing is not centred on the catalog box. */
function analogBodyExtents(component: CircuitComponent, definition: ComponentDef, scale: number): [number, number, number] {
  const type = component.type;
  if (type === 'sw-spdt') return [25, 12.5, 12.5];
  if (type === 'sw-dpst') return [25, 12.5, -12.5];
  if (type === 'sw-dpdt') return [25, 37.5, 12.5];
  if (type === 'pb-no') return [25, 12.5, -10];
  if (['pb-nc', 'sw-spst-no', 'sw-spst-nc', 'aux-contact-no', 'aux-contact-nc'].includes(type)) return [25, 12.5, -5];
  if (['fuse-3phase', 'circuit-breaker-3phase', 'aux-contact-3phase'].includes(type)) return [20, 35, 0];
  if (type === 'contactor') return [35, 72.5, 12.5];
  if (['relay-spst', 'relay-spdt', 'relay-dpst'].includes(type)) return [35, 35, 0];
  if (['transformer', 'transformer-ct', 'autotransformer'].includes(type)) return [25, 50, 0];
  if (/voltage|current|meter|motor|lamp|source/.test(type)) return [33, 33, 0];
  return [(definition.width * scale) / 2, (definition.height * scale) / 2, 0];
}

/** Electrical component library adapter: the only canvas-facing surface of this studio's catalog. */
export function createAnalogCanvasLibrary(tabD: boolean): SchematicComponentLibrary<CircuitComponent> {
  const scale = tabD ? TAB_D_SYMBOL_SCALE : 1;
  const gridSize = tabD ? TAB_D_GRID_SIZE : GRID_SIZE;
  return {
    getTerminals: (component): SchematicTerminal[] => (getDef(component.type)?.terminals ?? []).flatMap(terminal => {
      const position = analogTerminalPosition(component, terminal.id, tabD, true);
      return position ? [{ id: terminal.id, position, label: component.type === 'oscilloscope' ? undefined : terminal.name }] : [];
    }),
    hitTest: (component, point) => {
      const definition = getDef(component.type);
      if (!definition) return false;
      const [halfWidth, halfHeight, offsetY] = analogBodyExtents(component, definition, scale);
      if (pointInComponentBox(component, point, halfWidth, halfHeight, offsetY)) return true;
      // Reference and value captions are part of the part's grab area.
      const [labelX, labelY] = componentLabelOffset(definition, component, scale);
      const [valueX, valueY] = componentValueAnchor(definition, component, scale);
      const labelWidth = Math.max(48, component.label.length * 9);
      if (Math.abs(point[0] - (component.x + labelX)) <= labelWidth / 2 && Math.abs(point[1] - (component.y + labelY)) <= 14) return true;
      return Math.abs(point[0] - (component.x + valueX)) <= 36 && Math.abs(point[1] - (component.y + valueY)) <= 14;
    },
    route: (from, to, components, excludeIds, fromAxis, toAxis) => calculateOrthogonalPath(from, to, components, gridSize, excludeIds, fromAxis, toAxis),
    createComponent: (type, position, existing) => {
      if (tabD && !isTabDComponentAvailable(type)) {
        toast.error('This power semiconductor is unavailable in this mode');
        return null;
      }
      const definition = getDef(type);
      if (!definition) return null;
      return {
        id: nanoid(10),
        type,
        x: position[0],
        y: position[1],
        rotation: 0,
        flipH: false,
        flipV: false,
        label: nextComponentLabel(type, existing),
        props: defaultProps(definition),
      };
    },
    nextLabel: nextComponentLabel,
    cloneForPaste: copyComponentForPaste,
    validatePaste: components => (tabD && components.some(component => !isTabDComponentAvailable(component.type)) ? 'Some power semiconductors are unavailable in this mode' : null),
    symbolScale: component => (isExactCadComponent(component.type) ? 1 : scale),
  };
}

export interface V3HomeProps {
  /** Creates an isolated runtime while retaining the exact Tab B presentation contract. */
  createSimulationEngine?: () => SimulationEngine;
  /** Supplies a tab-specific static MNA payload while retaining the same view contract. */
  createStaticMna?: (components: CircuitComponent[], wires: CircuitWire[], normalizedGraph: NormalizedCircuitGraph) => TabBMnaState;
  /** Opts Tab D into presentation-only controls without changing Tab B's interaction contract. */
  tabDUiRefinement?: boolean;
}

export function V3Home({ createSimulationEngine = () => new SimulationEngine(), createStaticMna, tabDUiRefinement = false }: V3HomeProps) {
  const { t } = useTranslation(['simulators']);
  const gridSize = tabDUiRefinement ? TAB_D_GRID_SIZE : GRID_SIZE;
  const visualSymbolScale = tabDUiRefinement ? TAB_D_SYMBOL_SCALE : 1;
  const [darkPreview, setDarkPreview] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  // Viewport, grid, wiring, selection, history, clipboard and shortcuts come from the shared schematic canvas.
  const canvasLibrary = useMemo(() => createAnalogCanvasLibrary(tabDUiRefinement), [tabDUiRefinement]);
  const componentPressRef = useRef<(component: CircuitComponent) => boolean>(() => false);
  const componentClickRef = useRef<(component: CircuitComponent) => void>(() => undefined);
  const pointerReleaseRef = useRef<() => void>(() => undefined);
  const contentBoundsRef = useRef<() => SchematicBounds | null>(() => null);
  const canvas = useSchematicCanvas<CircuitComponent>({
    library: canvasLibrary,
    gridSize,
    isDark: darkPreview,
    onComponentPress: component => componentPressRef.current(component),
    onComponentClick: component => componentClickRef.current(component),
    onPointerRelease: () => pointerReleaseRef.current(),
    getContentBounds: () => contentBoundsRef.current(),
  });
  const { components, wires, texts, selectedComponent, selectedWire, selectedText, cursor } = canvas;
  const { setComponents, setWires, setSelection, setMarqueeIds, commit: commitSnapshot, componentsRef: componentRef, wiresRef } = canvas.document;
  const { svgRef, pan, zoom } = canvas.viewport;
  const gridVisible = canvas.gridMode !== 'hidden';
  const tabDGridMode = canvas.gridMode;
  const snapEnabled = canvas.snapEnabled;
  const [simulationRunning, setSimulationRunning] = useState(false);
  // Academic mode removed: Practical mode is permanently active for accurate SPICE simulation.
  const [simulationMode] = useState<SimulationMode>('practical');
  const [showElectrons, setShowElectrons] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mae-show-electrons');
      return stored === null ? true : stored === 'true';
    }
    return true;
  });
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const hasStartedSimulation = useRef(false);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(EMPTY_SNAPSHOT);
  const [animationTime, setAnimationTime] = useState(0);
  const normalizedGraph = useMemo(() => NormalizedCircuitGraph.fromCanvas(components, wires), [components, wires]);
  const tabBMna = useSimulation(components, wires, normalizedGraph);
  const dcMna = useMemo(() => createStaticMna ? createStaticMna(components, wires, normalizedGraph) : tabBMna, [components, createStaticMna, normalizedGraph, tabBMna, wires]);
  const meshGeometry = useMemo(() => compileMeshGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);
  const nodalGeometry = useMemo(() => compileNodalGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);

  const [analysisTraces, setAnalysisTraces] = useState<Partial<Record<AnalysisMethod, AnalysisTrace>>>({});
  const [activeAnalysisTrace, setActiveAnalysisTrace] = useState<AnalysisTrace | null>(null);
  const [activeAnalysisMethod, setActiveAnalysisMethod] = useState<AnalysisMethod | null>('nodal');
  const handleAnalysisTrace = useCallback((trace: AnalysisTrace) => {
    setActiveAnalysisMethod(trace.method);
    setActiveAnalysisTrace(trace);
    setAnalysisTraces((current) => {
      const existing = current[trace.method];
      if (
        existing &&
        existing.status === trace.status &&
        existing.heading === trace.heading &&
        existing.warning === trace.warning &&
        existing.targetId === trace.targetId &&
        existing.activeSourceId === trace.activeSourceId &&
        existing.activeStepIndex === trace.activeStepIndex &&
        existing.steps.length === trace.steps.length
      ) {
        return current;
      }
      return trace.status === 'ready' ? { ...current, [trace.method]: trace } : { ...current, [trace.method]: undefined };
    });
  }, []);
  const activeMeshTrace = activeAnalysisMethod === 'mesh' ? analysisTraces.mesh ?? null : null;
  const activeNodalTrace = activeAnalysisMethod === 'nodal' ? analysisTraces.nodal ?? null : null;
  const activeTheveninTrace = (activeAnalysisMethod === 'thevenin' || activeAnalysisMethod === 'transform') ? activeAnalysisTrace : null;
  const activeSuperpositionTrace = activeAnalysisMethod === 'superposition' ? activeAnalysisTrace : null;

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setDarkPreview(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const nadInputRef = useRef<HTMLInputElement>(null);
  const simulation = useRef<SimulationEngine>(createSimulationEngine());
  const animationFrame = useRef<number | null>(null);
  // Read inside the rAF loop below instead of a dependency, so a burnout write-back (which changes
  // `effectiveCircuitComponents`) never tears down and restarts the loop mid-run.
  const liveComponentsRef = useRef<CircuitComponent[]>([]);
  const tabDUiRefinementRef = useRef(tabDUiRefinement);
  const activeMomentaryControlRef = useRef<string | null>(null);
  // Set by every switch/pushbutton/relay-force toggle (see updateComponentProperty and
  // updateComponentPropsById below) so the SPICE debounce effect, further down, fires immediately
  // for that edit instead of waiting out the drag-coalescing delay — declared this early so those
  // toggle handlers, defined before the SPICE bridge section itself, can already depend on it.
  const spiceEagerRef = useRef(false);
  const requestEagerSpiceRun = useCallback(() => {
    spiceEagerRef.current = true;
  }, []);
  tabDUiRefinementRef.current = tabDUiRefinement;

  const colors = darkPreview
    ? {
      background: '#000000',
      canvas: '#07080a',
      panel: '#0d0f12',
      panelAlt: '#090a0d',
      line: '#1a1d24',
      text: '#f8fafc',
      muted: '#94a3b8',
      subtle: '#64748b',
      primary: '#8b5cf6',
      accent: '#a855f7',
      danger: '#f43f5e',
      selection: '#a855f7',
      grid: '#181b22',
      wire: '#a855f7',
      powered: '#c084fc',
      input: '#13161c',
      shadow: '0 12px 28px rgba(0,0,0,0.45)',
    }
    : {
      background: '#eaf0f8', canvas: '#f8fbff', panel: '#ffffff', panelAlt: '#f1f5fb', line: '#d7e2ef', text: '#172033', muted: '#64748b', subtle: '#94a3b8', primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#2563eb', grid: '#dbe7f3', wire: '#2563eb', powered: '#8b5cf6', input: '#ffffff', shadow: '0 12px 28px rgba(15,23,42,0.10)',
    };

  // Oscilloscope theme/channel-color preference — lifted here (rather than a hook call in each
  // panel) so the persistent aside widget and the inspector's settings section share one live
  // value: a toggle in one is reflected in the other on the same render, not just after a reload.
  const [oscilloscopeDisplaySettings, setOscilloscopeDisplaySettings] = useOscilloscopeDisplaySettings();

  // Session-level counter reference for intelligent exports (circuit, oscilloscope, multimeter)
  const exportCounters = useRef({ circuit: 1, oscilloscope: 1, multimeter: 1 });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportItems, setExportItems] = useState<ExportItem[]>([]);
  const [exportFormat, setExportFormat] = useState<'png' | 'svg'>('png');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [examplesModalOpen, setExamplesModalOpen] = useState(false);
  const [sharePreviewUrl, setSharePreviewUrl] = useState<string | null>(null);

  // Safe Exit / Refresh Warning (BeforeUnload)
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (components.length > 0 || wires.length > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [components.length, wires.length]);

  const getCanvasTerminalPosition = useCallback((component: CircuitComponent, terminalId: string): Point | null =>
    analogTerminalPosition(component, terminalId, tabDUiRefinement, true), [tabDUiRefinement]);

  const isTheveninActive = activeAnalysisMethod === 'thevenin' || activeAnalysisMethod === 'transform';
  const theveninTargetId = isTheveninActive ? activeTheveninTrace?.targetId : null;
  const theveninTargetComp = theveninTargetId ? components.find(c => c.id === theveninTargetId) : null;
  const isSuperpositionActive = activeAnalysisMethod === 'superposition';
  const superpositionActiveSourceId = isSuperpositionActive ? activeSuperpositionTrace?.activeSourceId : null;
  const superpositionTargetId = isSuperpositionActive ? activeSuperpositionTrace?.targetId : null;
  const superpositionTargetComp = superpositionTargetId ? components.find(c => c.id === superpositionTargetId) : null;

  const effectiveCircuitComponents = useMemo(() => {
    if (!isSuperpositionActive || !superpositionActiveSourceId) {
      return components;
    }
    return components.map(c => {
      const isIndepSource = ['dc-voltage', 'ac-voltage', 'dc-rail', 'dc-current', 'ac-current', 'three-phase-rail'].includes(c.type);
      if (isIndepSource && c.id !== superpositionActiveSourceId) {
        if (c.type === 'dc-voltage' || c.type === 'ac-voltage' || c.type === 'dc-rail') {
          return {
            ...c,
            props: {
              ...c.props,
              voltage: 0,
              amplitude: 0,
              internalR: 0.0001,
            },
          };
        }
        if (c.type === 'dc-current' || c.type === 'ac-current') {
          return {
            ...c,
            props: {
              ...c.props,
              current: 0,
              amplitude: 0,
            },
          };
        }
        if (c.type === 'three-phase-rail') {
          return {
            ...c,
            props: {
              ...c.props,
              lineVoltage: 0,
            },
          };
        }
      }
      return c;
    });
  }, [components, isSuperpositionActive, superpositionActiveSourceId]);

  const theveninTerminals = useMemo(() => {
    if (!isTheveninActive || !theveninTargetComp) return null;
    const def = getDef(theveninTargetComp.type);
    if (!def || def.terminals.length < 2) return null;
    const posA = getCanvasTerminalPosition(theveninTargetComp, def.terminals[0].id);
    const posB = getCanvasTerminalPosition(theveninTargetComp, def.terminals[1].id);
    if (!posA || !posB) return null;
    return { posA, posB };
  }, [isTheveninActive, theveninTargetComp, getCanvasTerminalPosition]);

  const superpositionTerminals = useMemo(() => {
    if (!isSuperpositionActive || !superpositionTargetComp) return null;
    const def = getDef(superpositionTargetComp.type);
    if (!def || def.terminals.length < 2) return null;
    const posA = getCanvasTerminalPosition(superpositionTargetComp, def.terminals[0].id);
    const posB = getCanvasTerminalPosition(superpositionTargetComp, def.terminals[1].id);
    if (!posA || !posB) return null;
    return { posA, posB };
  }, [isSuperpositionActive, superpositionTargetComp, getCanvasTerminalPosition]);

  const canvasWireEndpoints = canvas.wireEndpoints;
  const refreshCanvasWireEndpoints = useCallback((documentWires: CircuitWire[], documentComponents: CircuitComponent[], movedComponentId?: string) =>
    canvas.refreshWires(documentWires, documentComponents, movedComponentId ? new Set([movedComponentId]) : undefined), [canvas]);

  const recalculateAllOrthogonalPaths = useCallback((
    documentWires: CircuitWire[],
    documentComponents: CircuitComponent[],
  ): CircuitWire[] => {
    return documentWires.map(wire => {
      const endpoints = canvasWireEndpoints(wire, documentComponents);
      if (!endpoints) return wire;

      // 1. Straight wires: preserve 'straight' routing and simple 2-point line
      if (wire.routing === 'straight') {
        return {
          ...wire,
          routing: 'straight',
          path: [endpoints.from, endpoints.to],
          waypoints: undefined,
        };
      }

      // 2. If the wire already has a valid path matching the live endpoints within 1px, keep it untouched
      if (
        wire.path.length >= 2 &&
        Math.abs(wire.path[0][0] - endpoints.from[0]) < 1 &&
        Math.abs(wire.path[0][1] - endpoints.from[1]) < 1 &&
        Math.abs(wire.path[wire.path.length - 1][0] - endpoints.to[0]) < 1 &&
        Math.abs(wire.path[wire.path.length - 1][1] - endpoints.to[1]) < 1
      ) {
        return wire;
      }

      // 3. Manual routing with explicit user waypoints: preserve interior geometry
      const existingWaypoints = (wire.waypoints && wire.waypoints.length > 0)
        ? wire.waypoints
        : (wire.routing === 'manual' && wire.path.length > 2 ? wire.path.slice(1, -1) : undefined);

      if (wire.routing === 'manual') {
        const updatedPath = reconnectPathEndpoints(
          wire.path,
          endpoints.from,
          endpoints.to,
          wire.routing,
          [],
          existingWaypoints,
          gridSize,
          endpoints.fromAxis,
        );
        return {
          ...wire,
          path: updatedPath,
          waypoints: updatedPath.length > 2 ? updatedPath.slice(1, -1) : wire.waypoints,
        };
      }

      // 4. Trivially aligned endpoints (straight horizontal or vertical)
      if (endpoints.from[0] === endpoints.to[0] || endpoints.from[1] === endpoints.to[1]) {
        return {
          ...wire,
          routing: 'orthogonal' as const,
          path: [endpoints.from, endpoints.to],
          waypoints: undefined,
        };
      }

      // 5. Automatic routing: calculate obstacle-avoiding orthogonal path
      const excludeIds = new Set([wire.fromComp, wire.toComp]);
      const newPath = calculateOrthogonalPath(
        endpoints.from,
        endpoints.to,
        documentComponents,
        gridSize,
        excludeIds,
        endpoints.fromAxis,
        endpoints.toAxis,
      );
      return {
        ...wire,
        routing: 'orthogonal' as const,
        path: newPath,
        waypoints: undefined,
      };
    });
  }, [canvasWireEndpoints, gridSize]);

  const exportNad = useCallback(() => {
    const document = createNadDocument({ components, wires, texts, viewport: { pan, zoom }, workspace: { gridVisible, snapEnabled } });
    const href = URL.createObjectURL(new Blob([serializeNad(document)], { type: 'application/x-mae-nad+json' }));
    const anchor = window.document.createElement('a');
    anchor.href = href; anchor.download = 'circuit-lab.nad'; anchor.click();
    URL.revokeObjectURL(href);
    toast.success('NAD circuit exported');
  }, [components, gridVisible, pan, snapEnabled, texts, wires, zoom]);

  const loadCircuitDocument = useCallback((document: NADDocument) => {
    const importedComponents = tabDUiRefinement ? filterTabDImportedComponents(document.components) : document.components;
    const importedIds = new Set(importedComponents.map((component) => component.id));

    const isJunction = (id: string) =>
      id.startsWith('junc_') ||
      id.startsWith('junction') ||
      id === 'junction' ||
      id === 'junc';

    const normalizedWires = document.wires.map(normalizeWire);

    // Find all junctions that are transitively connected to at least one valid imported component
    const validJunctions = new Set<string>();
    const queue: string[] = Array.from(importedIds);
    const visited = new Set<string>(queue);

    const adj = new Map<string, Set<string>>();
    for (const w of normalizedWires) {
      if (!adj.has(w.fromComp)) adj.set(w.fromComp, new Set());
      if (!adj.has(w.toComp)) adj.set(w.toComp, new Set());
      adj.get(w.fromComp)!.add(w.toComp);
      adj.get(w.toComp)!.add(w.fromComp);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr);
      if (neighbors) {
        neighbors.forEach((nbr) => {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            if (isJunction(nbr)) {
              validJunctions.add(nbr);
              queue.push(nbr);
            }
          }
        });
      }
    }

    const importedWires = normalizedWires.filter((wire) => {
      const fromValid = importedIds.has(wire.fromComp) || validJunctions.has(wire.fromComp);
      const toValid = importedIds.has(wire.toComp) || validJunctions.has(wire.toComp) || Boolean(wire.junctionPoint);
      return fromValid && toValid;
    });

    const refreshedWires = recalculateAllOrthogonalPaths(importedWires, importedComponents);

    canvas.loadDocument({ components: importedComponents, wires: refreshedWires, texts: document.texts || [] }, { resetHistory: true });
    canvas.viewport.setView({ zoom: document.viewport.zoom, pan: document.viewport.pan });
    if (!document.workspace.gridVisible) canvas.setGridMode('hidden');
    else if (canvas.gridMode === 'hidden') canvas.setGridMode('dots');
    canvas.setSnapEnabled(document.workspace.snapEnabled);

    // Re-snap all wires to exact live pin locations after layout settles
    requestAnimationFrame(() => {
      setWires(prevWires => recalculateAllOrthogonalPaths(prevWires, importedComponents));
    });
    setTimeout(() => {
      setWires(prevWires => recalculateAllOrthogonalPaths(prevWires, importedComponents));
    }, 60);

    return { importedComponents, importedWires: refreshedWires };
  }, [canvas, recalculateAllOrthogonalPaths, tabDUiRefinement]);

  const importNad = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const document = parseNad(await file.text());
      const { importedComponents } = loadCircuitDocument(document);
      const excludedCount = document.components.length - importedComponents.length;
      toast.success(`NAD circuit imported (${importedComponents.length} components)${excludedCount ? `; ${excludedCount} unavailable component${excludedCount === 1 ? '' : 's'} omitted` : ''}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to import NAD file.'); }
  }, [loadCircuitDocument]);

  // Loads a curated example from the Interactive Examples Library through the exact same path as
  // a .nad import — createNadDocument normalizes the example's raw components/wires, and
  // loadCircuitDocument replaces the canvas, resets history, and re-snaps wire paths to the live
  // pin positions on the next animation frames.
  const handleLoadExample = useCallback((example: ExampleDefinition) => {
    try {
      const document = createNadDocument({ components: example.schematic.components, wires: example.schematic.wires, texts: [] });
      loadCircuitDocument(document);
      toast.success(`Loaded example: ${example.name}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load example circuit.'); }
  }, [loadCircuitDocument]);

  // Deep-Link Project Loading on Mount (?project=...)
  const hasLoadedUrlProjectRef = useRef(false);
  useEffect(() => {
    if (hasLoadedUrlProjectRef.current) return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const projectParam = searchParams.get('project');
      if (projectParam) {
        hasLoadedUrlProjectRef.current = true;
        const document = decompressProjectState(projectParam);
        if (document && document.components) {
          const { importedComponents } = loadCircuitDocument(document);
          toast.success(`Loaded shared project (${importedComponents.length} components)`);
        }
      }
    } catch (err) {
      console.warn('Failed to parse shared project from URL:', err);
    }
  }, []); // Run strictly once on mount

  const getCircuitBoundingBox = useCallback(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const expand = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    components.forEach((component) => {
      expand(component.x - 35, component.y - 35);
      expand(component.x + 35, component.y + 35);
      const definition = getDef(component.type);
      if (definition?.terminals) {
        definition.terminals.forEach((terminal) => {
          const pos = getCanvasTerminalPosition(component, terminal.id);
          if (pos) expand(pos[0], pos[1]);
        });
      }
      if (definition) {
        const anchors = componentLabelAnchors(definition, component, visualSymbolScale);
        expand(component.x + anchors.reference[0], component.y + anchors.reference[1]);
        expand(component.x + anchors.value[0], component.y + anchors.value[1]);
      }
    });

    wires.forEach((wire) => {
      if (Array.isArray(wire.path)) {
        wire.path.forEach((point) => {
          if (point && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
            expand(point[0], point[1]);
          }
        });
      }
      if (wire.junctionPoint && Number.isFinite(wire.junctionPoint[0]) && Number.isFinite(wire.junctionPoint[1])) {
        expand(wire.junctionPoint[0], wire.junctionPoint[1]);
      }
      if (Array.isArray(wire.waypoints)) {
        wire.waypoints.forEach((point) => {
          if (point && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
            expand(point[0], point[1]);
          }
        });
      }
    });

    texts.forEach((text) => {
      expand(text.x, text.y);
      const approxWidth = Math.max(80, (text.text?.length || 10) * (text.fontSize || 14) * 0.65);
      expand(text.x + approxWidth, text.y + (text.fontSize || 14) * 1.5);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }

    const circuitWidth = Math.max(20, maxX - minX);
    const circuitHeight = Math.max(20, maxY - minY);

    return {
      minX,
      maxX,
      minY,
      maxY,
      circuitWidth,
      circuitHeight,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }, [components, getCanvasTerminalPosition, texts, visualSymbolScale, wires]);
  contentBoundsRef.current = () => {
    const bounds = getCircuitBoundingBox();
    return bounds ? { centerX: bounds.centerX, centerY: bounds.centerY, width: bounds.circuitWidth, height: bounds.circuitHeight } : null;
  };

  const generateCircuitSnapshot = useCallback((): string | null => {
    const liveSvg = svgRef.current;
    if (!liveSvg) return null;
    try {
      const bbox = getCircuitBoundingBox();
      if (!bbox) return null;
      const PADDING = 40;
      const cropX = bbox.minX - PADDING;
      const cropY = bbox.minY - PADDING;
      const cropWidth = Math.max(100, (bbox.maxX - bbox.minX) + PADDING * 2);
      const cropHeight = Math.max(100, (bbox.maxY - bbox.minY) + PADDING * 2);

      const clonedSvg = liveSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute('viewBox', `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
      clonedSvg.setAttribute('width', '100%');
      clonedSvg.setAttribute('height', '100%');
      clonedSvg.style.backgroundColor = 'transparent';

      const worldGroup = Array.from(clonedSvg.querySelectorAll('g')).find(g => g.getAttribute('transform')?.includes('scale'));
      if (worldGroup) {
        worldGroup.removeAttribute('transform');
      }

      // Strip hitboxes and interactive handles
      clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('circle[style*="cursor: move"], circle[style*="cursor:move"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('circle[r="13"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
      clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"]').forEach(el => el.remove());

      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clonedSvg);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
    } catch {
      return null;
    }
  }, [getCircuitBoundingBox]);

  const hasSharedRef = useRef(false);
  const handleShareProject = useCallback(async () => {
    if (components.length === 0 && texts.length === 0 && wires.length === 0) {
      toast.error('No circuit elements to share');
      return;
    }

    const document = createNadDocument({
      components,
      wires,
      texts,
      viewport: { pan, zoom },
      workspace: { gridVisible, snapEnabled },
    });

    const compressed = compressProjectState(document);
    const url = new URL(window.location.href);
    url.searchParams.set('project', compressed);
    const finalUrl = url.toString();

    // Mark as loaded so deep-link effect doesn't re-parse what we just created
    hasLoadedUrlProjectRef.current = true;
    hasSharedRef.current = true;

    // Update browser URL
    window.history.replaceState({}, '', finalUrl);
    setShareUrl(finalUrl);

    // Capture lightweight circuit preview snapshot
    const preview = generateCircuitSnapshot();
    setSharePreviewUrl(preview);

    // Open internal ShareProjectModal
    setShareModalOpen(true);
  }, [components, generateCircuitSnapshot, gridVisible, pan, snapEnabled, texts, wires, zoom]);

  const updateComponentProperty = useCallback((key: string, value: unknown) => {
    if (!selectedComponent) return;
    const materialDefaults: Record<string, { forwardVoltage: number; Is: number }> = {
      ideal: { forwardVoltage: 0, Is: 1e-8 },
      silicon: { forwardVoltage: 0.7, Is: 1e-12 },
      germanium: { forwardVoltage: 0.3, Is: 1e-6 },
      gaas: { forwardVoltage: 1.2, Is: 1e-18 },
    };
    const nextComponents = components.map(component => {
      if (component.id !== selectedComponent.id) return component;
      const diodeMaterial = component.type === 'diode' && key === 'material'
        ? materialDefaults[String(value).toLowerCase()] ?? materialDefaults.silicon
        : undefined;
      // An LED's colour dictates its forward voltage, so a preset writes both at once and the SPICE
      // model, the canvas glow and the label the student picked can never disagree.
      const ledPreset = component.type === 'led' && key === 'color'
        ? { forwardVoltage: LED_FORWARD_VOLTAGES[String(value)] ?? component.props.forwardVoltage }
        : undefined;
      const isAuxContact = component.type === 'aux-contact-no' || component.type === 'aux-contact-nc' || component.type === 'aux-contact-3phase';
      const nextLabel = (isAuxContact && key === 'linkedTo')
        ? (value && String(value).trim() ? String(value).trim() : 'K?')
        : component.label;
      return {
        ...component,
        label: nextLabel,
        props: { ...component.props, [key]: value, ...(diodeMaterial ?? {}), ...(ledPreset ?? {}) },
      };
    });
    // `state` (switches, breakers, pushbuttons), `manualState` (forced relay/contactor contacts),
    // `contactType` (NO vs NC) and an LED's colour all change the circuit electrically rather than
    // cosmetically — SPICE should react to them immediately rather than through the drag-coalescing debounce.
    const changesCircuit = key === 'state' || key === 'manualState' || key === 'contactType'
      || (selectedComponent.type === 'led' && key === 'color');
    if (changesCircuit) requestEagerSpiceRun();
    setComponents(nextComponents);
    commitSnapshot({ components: nextComponents });
  }, [commitSnapshot, components, requestEagerSpiceRun, selectedComponent]);

  // Applies several property keys to the selected component in one commit — the oscilloscope's
  // Autoscale button needs this: calling updateComponentProperty three times in a row would each
  // read `components` from this same render's closure, so the last call would silently overwrite
  // the earlier two rather than compose with them.
  const updateComponentProperties = useCallback((updates: Record<string, unknown>) => {
    if (!selectedComponent) return;
    const nextComponents = components.map(component => component.id === selectedComponent.id
      ? { ...component, props: { ...component.props, ...updates } }
      : component);
    setComponents(nextComponents);
    commitSnapshot({ components: nextComponents });
  }, [commitSnapshot, components, selectedComponent]);

  // Swaps the selected component for a fresh instance of `newType` in place: same position,
  // rotation and flip, a freshly generated id/reference, and wires reconnected pin-for-pin when
  // (and only when) the old and new parts have the same terminal count — see replaceComponent's
  // own doc comment for why that has to be positional rather than by terminal id string.
  const replaceSelectedComponent = useCallback((newType: string) => {
    if (!selectedComponent) return;
    const newDefinition = getDef(newType);
    if (!newDefinition) return;
    const oldTerminalIds = (getDef(selectedComponent.type)?.terminals ?? []).map(terminal => terminal.id);
    const newTerminalIds = newDefinition.terminals.map(terminal => terminal.id);
    const newId = nanoid(10);
    const outcome = replaceComponent(components, wires, selectedComponent.id, oldTerminalIds, newTerminalIds, {
      id: newId,
      type: newType,
      label: nextComponentLabel(newType, components),
      props: defaultProps(newDefinition),
    });
    if (!outcome) return;
    const nextWires = refreshCanvasWireEndpoints(outcome.wires, outcome.components, newId);
    setComponents(outcome.components);
    setWires(nextWires);
    commitSnapshot({ components: outcome.components, wires: nextWires });
    setSelection({ kind: 'component', id: newId });
    requestEagerSpiceRun();
    toast.success(`Replaced with ${newDefinition.name}`);
  }, [commitSnapshot, components, refreshCanvasWireEndpoints, requestEagerSpiceRun, selectedComponent, wires]);

  // Its only callers are the momentary pushbutton press/release handlers below — an electrical
  // state change SPICE should react to immediately, not after the drag-coalescing debounce.
  const updateComponentPropsById = useCallback((id: string, updates: Record<string, unknown>) => {
    requestEagerSpiceRun();
    const nextComponents = liveComponentsRef.current.map(component => component.id === id
      ? { ...component, props: { ...component.props, ...updates } }
      : component);
    liveComponentsRef.current = nextComponents;
    setComponents(nextComponents);
    simulation.current.setCircuit(nextComponents, wiresRef.current);
    const snap = simulation.current.getSnapshot();
    const brokenWires = getBrokenWireIds(nextComponents, wiresRef.current);
    brokenWires.forEach(wireId => {
      if (snap.wireCurrents) snap.wireCurrents[wireId] = 0;
      if (snap.wirePhases) delete snap.wirePhases[wireId];
    });
    setSnapshot(snap);
  }, [requestEagerSpiceRun]);

  const releaseMomentaryControl = useCallback(() => {
    const componentId = activeMomentaryControlRef.current;
    if (!componentId) return;
    activeMomentaryControlRef.current = null;
    updateComponentPropsById(componentId, momentaryControlProps(false));
  }, [updateComponentPropsById]);

  useEffect(() => {
    window.addEventListener('mouseup', releaseMomentaryControl);
    window.addEventListener('blur', releaseMomentaryControl);
    return () => {
      window.removeEventListener('mouseup', releaseMomentaryControl);
      window.removeEventListener('blur', releaseMomentaryControl);
    };
  }, [releaseMomentaryControl]);

  // Direct controls owned by this component library: momentary pushbuttons act on press; latching
  // switches toggle on a press that never became a drag (relay/contactor bodies stay coil-driven).
  // updateComponentPropsById marks the next SPICE solve eager, so the DMM follows immediately.
  componentPressRef.current = (component: CircuitComponent) => {
    if (!tabDUiRefinement || directControlKind(component.type) !== 'momentary') return false;
    activeMomentaryControlRef.current = component.id;
    updateComponentPropsById(component.id, momentaryControlProps(true));
    return true;
  };
  componentClickRef.current = (component: CircuitComponent) => {
    if (tabDUiRefinement && directControlKind(component.type) === 'latching') updateComponentPropsById(component.id, nextLatchingControlProps(component));
  };
  pointerReleaseRef.current = releaseMomentaryControl;

  const addSelectedWireCorner = useCallback(() => {
    if (!selectedWire) return;
    const midpoint: Point = selectedWire.path.length >= 2
      ? [(selectedWire.path[0][0] + selectedWire.path[selectedWire.path.length - 1][0]) / 2, (selectedWire.path[0][1] + selectedWire.path[selectedWire.path.length - 1][1]) / 2]
      : cursor;
    const nextWires = wires.map(wire => wire.id === selectedWire.id
      ? { ...wire, routing: 'manual' as const, path: addWireCorner(wire.path, snapEnabled ? snapPointToGrid(midpoint, GRID_SIZE) : midpoint) }
      : wire);
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
  }, [commitSnapshot, cursor, selectedWire, snapEnabled, wires]);

  const nudgeSelectedWire = useCallback((amount: number) => {
    if (!selectedWire) return;
    const nextWires = wires.map(wire => {
      if (wire.id !== selectedWire.id) return wire;
      const path = wire.path.length > 2 ? wire.path : addWireCorner(wire.path, [
        (wire.path[0][0] + wire.path[wire.path.length - 1][0]) / 2,
        (wire.path[0][1] + wire.path[wire.path.length - 1][1]) / 2,
      ]);
      const corner = Math.floor(path.length / 2);
      return { ...wire, routing: 'manual' as const, path: moveWireCorner(path, corner, [path[corner][0], path[corner][1] + amount]) };
    });
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
  }, [commitSnapshot, selectedWire, wires]);

  const resetSimulation = useCallback(() => {
    const repairedComponents = components.map(component => {
      if (!component.state?.isBurned) return component;
      const nextState = { ...component.state };
      delete nextState.isBurned;
      return { ...component, state: nextState };
    });
    setComponents(repairedComponents);
    liveComponentsRef.current = repairedComponents;
    simulation.current.reset();
    simulation.current.setCircuit(repairedComponents, wires);
    setSnapshot(simulation.current.getSnapshot());
    setAnimationTime(0);
  }, [components, wires]);

  useEffect(() => {
    simulation.current.setCircuit(effectiveCircuitComponents, wires);
    setSnapshot(simulation.current.getSnapshot());
  }, [effectiveCircuitComponents, wires]);

  useEffect(() => {
    liveComponentsRef.current = effectiveCircuitComponents;
  }, [effectiveCircuitComponents]);

  useEffect(() => {
    if (!simulationRunning) return undefined;
    let last = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(0.03, (now - last) / 1000);
      last = now;
      const result = simulation.current.step(Math.max(0.0001, elapsed * simulationSpeed));
      const evaluated = evaluateComponentHealth({ components: liveComponentsRef.current }, result);
      const newlyBurnedIds = evaluated
        .filter((evaluatedComponent, index) => evaluatedComponent.state?.isBurned && !liveComponentsRef.current[index]?.state?.isBurned)
        .map(evaluatedComponent => evaluatedComponent.id);
      if (newlyBurnedIds.length > 0) {
        liveComponentsRef.current = evaluated;
        simulation.current.setCircuit(evaluated, wiresRef.current);
        const burnedIdSet = new Set(newlyBurnedIds);
        setComponents(previous => previous.map(component =>
          burnedIdSet.has(component.id) ? { ...component, state: { ...component.state, isBurned: true } } : component
        ));
      }

      // Hardcode branch current to strictly 0 for burned components in output results
      if (result.branchCurrents) {
        for (const component of liveComponentsRef.current) {
          if (component.state?.isBurned) {
            result.branchCurrents[component.id] = 0;
            if (result.componentPowered) result.componentPowered[component.id] = false;
            if (result.componentIntensity) result.componentIntensity[component.id] = 0;
          }
        }
      }

      // Flush broken wire currents and purge phases so particles disappear immediately
      const activeBrokenWireIds = getBrokenWireIds(liveComponentsRef.current, wiresRef.current);
      if (result.wireCurrents) {
        activeBrokenWireIds.forEach(wireId => {
          if (result.wireCurrents) result.wireCurrents[wireId] = 0;
          if (result.wirePhases) {
            delete result.wirePhases[wireId];
          }
        });
      }
      setSnapshot(result);
      setAnimationTime(result.time);

      animationFrame.current = requestAnimationFrame(animate);
    };
    animationFrame.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [simulationRunning, simulationSpeed]);

  useEffect(() => {
    // The previous agent added a log here. I will remove it to clean up.
  }, [animationTime, effectiveCircuitComponents]);

  // --- SPICE Accuracy Bridge ---
  // Runs ngspice off the main thread alongside the always-on legacy loop above. On success its
  // readings take over the Voltmeter/Ammeter/DMM/Oscilloscope entries in `effectiveSnapshot` below;
  // on an unsupported part it throws SpiceAdapterError and the legacy engine's own readings, already
  // live from the loop above, simply keep serving the instruments untouched — a silent fallback.
  const spiceEngine = useSpiceEngine();
  const spiceReadingsRef = useRef<Record<string, InstrumentReading>>({});
  // Snapshots the exact component list a run's netlist was built from, alongside its nets/nodeMap.
  // Reading results back through this instead of the live `components` state means a circuit edit
  // that lands while a run is still in flight can never be paired with a mismatched node map.
  const spiceRunContextRef = useRef<{
    components: CircuitComponent[];
    nets: SpiceCircuitNets;
    nodeMap: SpiceNodeMap;
  } | null>(null);
  const spiceUnsupportedToastRef = useRef<string | null>(null);
  const [spiceStatus, setSpiceStatus] = useState<SpiceBridgeStatus>({ kind: 'idle' });
  const [spiceReadingsVersion, setSpiceReadingsVersion] = useState(0);
  // Every edit rebuilds the netlist and reruns `.tran` from t=0 on a brand-new ngspice instance
  // (spiceWorker.ts never reuses one across runs), so a self-holding coil needs its last run's
  // terminal voltage fed forward as the next run's `.IC` seed, or a fresh solve's Newton iteration
  // starts that control node's guess at 0 V and settles de-energized — see
  // GenerateNetlistOptions.initialNodeVoltages. Keyed by canvas net (stable across a state-only
  // toggle like S1 press/release, since net identity depends only on components/wires); populated
  // after each successful run below.
  const coilInitialVoltagesRef = useRef<Map<SpiceNet, number>>(new Map());

  const clearSpiceReadings = useCallback((status: SpiceBridgeStatus) => {
    spiceReadingsRef.current = {};
    spiceRunContextRef.current = null;
    setSpiceReadingsVersion(version => version + 1);
    setSpiceStatus(status);
  }, []);

  const runSpiceSimulation = useCallback(() => {
    // Both the adapter (unsupported parts) and the generator (an incomplete circuit — no ground yet,
    // or nothing placed at all) can throw; either must fall back to the legacy engine's readings
    // rather than crash the debounce timer or the Run button's click handler.
    let netlist: string;
    let nets: SpiceCircuitNets;
    let spiceComponents;
    try {
      nets = resolveCircuitNets(effectiveCircuitComponents, wires);
      spiceComponents = convertToSpiceComponents(effectiveCircuitComponents, wires, nets, simulationMode);
      const isStepMode = oscilloscopeDisplaySettings.acquisitionMode === 'step';
      // A seeded `.IC` is inert without `uic` (ngspice otherwise recomputes its own t=0 bias and
      // discards it) — see GenerateNetlistOptions.initialNodeVoltages.
      const hasLatchedCoil = coilInitialVoltagesRef.current.size > 0;
      // An op-amp integrator has no DC feedback path, so `.op` parks it on a rail and hands the
      // transient a pre-charged feedback capacitor — see requiresTransientInitialConditions.
      const needsRestState = requiresTransientInitialConditions(spiceComponents);
      const maxScopeWindow = effectiveCircuitComponents
        .filter(c => c.type === 'oscilloscope')
        .reduce((max, scope) => {
          const chTimes = ['ch1', 'ch2', 'ch3', 'ch4'].map(ch => Number(scope.props[`timeDiv_${ch}`]) || 0.01);
          return Math.max(max, ...chTimes.map(t => t * 10));
        }, 0);
      const frequency = Math.max(0.001, detectSystemFrequency(effectiveCircuitComponents));
      const duration = Math.min(2.0, Math.max(0.02, SPICE_TRAN_PERIODS / frequency, maxScopeWindow));
      const analysis = [`.tran ${duration / 2000} ${duration}${isStepMode || hasLatchedCoil || needsRestState ? ' uic' : ''}`];
      netlist = generateNetlist(spiceComponents, {
        analysis,
        simulationMode,
        initialNodeVoltages: coilInitialVoltagesRef.current,
      });
    } catch (error) {
      // An incomplete circuit (no components yet, or no ground placed) is an expected mid-edit
      // state, not a genuine incompatibility — stay quiet and idle rather than toasting on it.
      if (error instanceof NetlistError) {
        spiceUnsupportedToastRef.current = null;
        clearSpiceReadings({ kind: 'idle' });
        return;
      }
      const reason = error instanceof SpiceAdapterError
        ? error.unsupported.map(part => part.label).join(', ')
        : 'Unable to build a SPICE netlist for this circuit.';
      // Persists past the toast's auto-dismiss, and survives it going unnoticed — the one place
      // that can name exactly which part broke the whole netlist build, not just that it happened.
      console.error('[SPICE accuracy bridge] netlist build failed, falling back to the live engine:', reason, error);
      clearSpiceReadings({ kind: 'unsupported', reason });
      if (spiceUnsupportedToastRef.current !== reason) {
        spiceUnsupportedToastRef.current = reason;
        toast.error(`SPICE accuracy pass unavailable (${reason}) — using the live engine's readings.`);
      }
      return;
    }

    spiceUnsupportedToastRef.current = null;
    spiceRunContextRef.current = { components: effectiveCircuitComponents, nets, nodeMap: buildSpiceNodeMap(spiceComponents) };
    setSpiceStatus({ kind: 'running' });
    void spiceEngine.runSimulation(netlist);
    // Only the netlist inputs and the hook's own (stable, useCallback-wrapped) `runSimulation`
    // should give this a new identity. Depending on the whole `spiceEngine` object instead — as
    // this used to — broke the debounce below: `useSpiceEngine` returns a new object every render,
    // so during Run (a 60fps state update loop) the debounce timer was reset before it could ever
    // elapse, and SPICE silently stopped re-solving on switch toggles until Pause forced one retry.
  }, [clearSpiceReadings, effectiveCircuitComponents, oscilloscopeDisplaySettings.acquisitionMode, simulationMode, spiceEngine.runSimulation, wires]);

  // Trigger on every circuit edit, debounced so a drag or a burst of keystrokes fires one run — but
  // not a switch/relay toggle: those set `spiceEagerRef` first, so this fires with no delay for
  // exactly the edit the DMM needs to react to right away, live, without waiting for Pause/Reset.
  useEffect(() => {
    const eager = spiceEagerRef.current;
    spiceEagerRef.current = false;
    const timer = window.setTimeout(runSpiceSimulation, eager ? 0 : SPICE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [runSpiceSimulation]);

  // Eagerly re-run SPICE whenever switching between Live Roll and Step Response mode
  useEffect(() => {
    runSpiceSimulation();
  }, [oscilloscopeDisplaySettings.acquisitionMode, runSpiceSimulation]);

  // The worker resolves asynchronously; react to the hook's own state (not the promise above) so a
  // superseded run's late arrival can never be mistaken for the latest one's result. Reads back
  // through `context.components` (captured at request time), not the live `components` state, so
  // an edit that lands before this effect fires cannot be paired with a stale node map.
  useEffect(() => {
    const context = spiceRunContextRef.current;
    if (!context) return;
    if (spiceEngine.error) {
      // A failed run's readings must not keep masking the legacy engine's own values underneath —
      // previously only the status changed here, so a stale "SPICE-VERIFIED" reading could sit
      // behind an "unsupported" chip indefinitely.
      //
      // Unlike a netlist-build failure above (which at least toasts), a run that ngspice itself
      // rejected at solve time — a genuinely valid netlist the engine still couldn't converge on —
      // previously had no toast and no log at all: the exact same silent fallback to the legacy
      // engine's readings, with nothing anywhere to say why.
      console.error('[SPICE accuracy bridge] ngspice run failed, falling back to the live engine:', spiceEngine.error);
      if (spiceUnsupportedToastRef.current !== spiceEngine.error) {
        spiceUnsupportedToastRef.current = spiceEngine.error;
        toast.error(`SPICE accuracy pass failed (${spiceEngine.error}) — using the live engine's readings.`);
      }
      clearSpiceReadings({ kind: 'unsupported', reason: spiceEngine.error });
      return;
    }
    if (!spiceEngine.results) return;
    const results = parseSpiceResults(spiceEngine.results, spiceEngine.results.time ?? []);
    spiceReadingsRef.current = buildSpiceInstrumentReadings(context.components, context.nets, context.nodeMap, results);
    // Dev-server only: lets headless E2E runs read the exact samples the oscilloscope canvas draws.
    if (import.meta.env.DEV) (window as Window & { __MAE_SPICE_READINGS__?: Record<string, InstrumentReading> }).__MAE_SPICE_READINGS__ = spiceReadingsRef.current;
    setSpiceReadingsVersion(version => version + 1);
    setSpiceStatus({ kind: 'ready' });

    // Carry this run's ending coil terminal voltage into the next netlist rebuild's `.IC` seed —
    // see coilInitialVoltagesRef's own doc comment. Every coil-driven part's own contacts (aux-NO,
    // poles) are controlled straight off this net (see spiceAdapter.ts's coilLayout), so seeding it
    // alone is enough to keep a self-holding latch converging to the same branch it was already on.
    const nextCoilVoltages = new Map<SpiceNet, number>();
    for (const component of context.components) {
      if (!COIL_DRIVEN_TYPES.includes(component.type)) continue;
      const posTerminal = component.type === 'coil' ? 'pos' : 'coil+';
      const posNet = context.nets.netFor(component.id, posTerminal);
      const posVoltages = results.nodeVoltages[context.nodeMap.nameFor(posNet)];
      if (posVoltages && posVoltages.length > 0) nextCoilVoltages.set(posNet, posVoltages[posVoltages.length - 1]);
    }
    coilInitialVoltagesRef.current = nextCoilVoltages;
    spiceRunContextRef.current = null;
  }, [clearSpiceReadings, spiceEngine.error, spiceEngine.results]);

  // Legacy `snapshot` stays the source of truth for animation/power flow; only instrument readings
  // are overridden, and only for the components SPICE could actually map.
  const effectiveSnapshot = useMemo<SimulationSnapshot>(() => {
    const spiceReadings = spiceReadingsRef.current;
    if (Object.keys(spiceReadings).length === 0) return snapshot;
    return { ...snapshot, instrumentReadings: { ...snapshot.instrumentReadings, ...spiceReadings } };
    // spiceReadingsVersion (not spiceReadingsRef.current, a ref) is what actually triggers this recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, spiceReadingsVersion]);

  function escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function computeScopeTracePoints(
    samples: SamplePoint[],
    offset: number,
    voltDiv: number,
    timeDiv: number,
    timeShift: number,
    acquisitionMode: 'live' | 'step',
    width: number,
    height: number,
  ): { x: number; y: number }[] {
    if (samples.length < 2) return [];
    const GRID_DIVS_X = 10;
    const GRID_DIVS_Y = 8;
    const pixelsPerDivY = height / GRID_DIVS_Y;
    const centerY = height / 2;
    const safeVoltDiv = Math.max(1e-9, voltDiv);

    if (acquisitionMode === 'step') {
      const tSpan = Math.max(1e-9, timeDiv * GRID_DIVS_X);
      const stepSamples = samples.filter(s => s.time >= 0);
      if (stepSamples.length < 2) return [];
      const visible = stepSamples.filter(s => s.time <= tSpan + tSpan * 1e-6);
      if (visible.length < 2) return [];
      return visible.map(sample => ({
        x: Math.min(width, (sample.time / tSpan) * width),
        y: Math.max(0, Math.min(height, centerY - ((sample.value - offset) / safeVoltDiv) * pixelsPerDivY)),
      }));
    }

    const requestedWindow = Math.max(1e-9, timeDiv * GRID_DIVS_X);
    const dataStart = samples[0].time;
    const dataEnd = samples[samples.length - 1].time;
    const windowSeconds = Math.min(requestedWindow, Math.max(1e-9, dataEnd - dataStart));
    const desiredEnd = dataEnd - timeShift;
    const windowEnd = Math.max(dataStart + windowSeconds, Math.min(dataEnd, desiredEnd));
    const windowStart = windowEnd - windowSeconds;
    const epsilon = windowSeconds * 1e-6;
    const visible = samples.filter(sample => sample.time >= windowStart - epsilon && sample.time <= windowEnd + epsilon);
    if (visible.length < 2) return [];
    return visible.map(sample => ({
      x: ((sample.time - windowStart) / windowSeconds) * width,
      y: Math.max(0, Math.min(height, centerY - ((sample.value - offset) / safeVoltDiv) * pixelsPerDivY)),
    }));
  }

  const captureOscilloscopeItem = useCallback((scope: CircuitComponent, format: 'png' | 'svg', index: number, total: number): Promise<ExportItem | null> => {
    const canvas = document.querySelector(`canvas[data-scope-id="${scope.id}"]`) as HTMLCanvasElement | null;
    const filename = total > 1
      ? `oscilloscope-${exportCounters.current.oscilloscope}-${index + 1}.${format}`
      : `oscilloscope-${exportCounters.current.oscilloscope}.${format}`;

    const isDark = oscilloscopeDisplaySettings.isDarkMode;
    const showValues = oscilloscopeDisplaySettings.showValues;
    const channelColors = oscilloscopeDisplaySettings.channelColors || ['#38bdf8', '#fbbf24', '#34d399', '#f43f5e'];
    const acquisitionMode = oscilloscopeDisplaySettings.acquisitionMode || 'live';

    const channels = ['ch1', 'ch2', 'ch3', 'ch4'] as const;
    const readings = channels.map(channel => effectiveSnapshot.instrumentReadings[`${scope.id}:${channel}`]);
    const channelConfigs = channels.map(channel => ({
      offset: numeric(scope.props[`offset_${channel}`], 0),
      timeDiv: numeric(scope.props[`timeDiv_${channel}`], 0.01),
      voltDiv: numeric(scope.props[`voltDiv_${channel}`], 5),
      timeShift: numeric(scope.props[`timeShift_${channel}`], 0),
    }));
    const readyIndex = readings.findIndex(r => r?.status === 'ready');
    const primaryConfig = channelConfigs[readyIndex >= 0 ? readyIndex : 0];

    const baseWidth = canvas ? canvas.width : 268;
    const baseHeight = canvas ? canvas.height : 160;

    const formatVoltageText = (v: number): string => {
      if (Math.abs(v) < 1e-9) return '0 V';
      const sign = v < 0 ? '-' : '+';
      const abs = Math.abs(v);
      if (abs < 1) {
        const val = Number((abs * 1e3).toPrecision(3));
        return `${sign}${val} mV`;
      }
      const val = Number(abs.toPrecision(3));
      return `${sign}${val} V`;
    };

    const formatTimeText = (sec: number): string => {
      if (Math.abs(sec) < 1e-9) return '0 s';
      const abs = Math.abs(sec);
      if (abs < 1e-3) {
        const val = Number((abs * 1e6).toPrecision(3));
        return `${val} µs`;
      }
      if (abs < 1) {
        const val = Number((abs * 1e3).toPrecision(3));
        return `${val} ms`;
      }
      const val = Number(abs.toPrecision(3));
      return `${val} s`;
    };

    if (format === 'png') {
      const TARGET_4K_WIDTH = 3840;
      const exportScale = Math.max(4, Math.ceil(TARGET_4K_WIDTH / baseWidth));
      const targetWidth = baseWidth * exportScale;
      const targetHeight = baseHeight * exportScale;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = targetWidth;
      exportCanvas.height = targetHeight;
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return Promise.resolve(null);

      ctx.save();
      ctx.scale(exportScale, exportScale);

      // Background
      ctx.fillStyle = isDark ? '#090a0d' : '#ffffff';
      ctx.fillRect(0, 0, baseWidth, baseHeight);

      // Graticule grid
      const gridDivsX = 10;
      const gridDivsY = 8;
      const stepX = baseWidth / gridDivsX;
      const stepY = baseHeight / gridDivsY;
      ctx.strokeStyle = isDark ? '#1a1d24' : '#e2e8f0';
      ctx.lineWidth = 1;
      for (let i = 1; i < gridDivsX; i++) {
        ctx.beginPath();
        ctx.moveTo(i * stepX, 0);
        ctx.lineTo(i * stepX, baseHeight);
        ctx.stroke();
      }
      for (let j = 1; j < gridDivsY; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * stepY);
        ctx.lineTo(baseWidth, j * stepY);
        ctx.stroke();
      }
      // Center crosshair
      ctx.strokeStyle = isDark ? '#222630' : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(baseWidth / 2, 0);
      ctx.lineTo(baseWidth / 2, baseHeight);
      ctx.moveTo(0, baseHeight / 2);
      ctx.lineTo(baseWidth, baseHeight / 2);
      ctx.stroke();

      // High-res waveform traces from live solver samples
      let drawnAnyTrace = false;
      readings.forEach((reading, idx) => {
        if (reading?.status === 'ready' && reading.samples && reading.samples.length >= 2) {
          const pts = computeScopeTracePoints(
            reading.samples,
            channelConfigs[idx].offset,
            channelConfigs[idx].voltDiv,
            channelConfigs[idx].timeDiv,
            channelConfigs[idx].timeShift,
            acquisitionMode,
            baseWidth,
            baseHeight,
          );
          if (pts.length >= 2) {
            drawnAnyTrace = true;
            ctx.strokeStyle = channelColors[idx];
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            pts.forEach((pt, i) => {
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
          }
        }
      });

      if (!drawnAnyTrace) {
        if (canvas) {
          ctx.drawImage(canvas, 0, 0, baseWidth, baseHeight);
        } else {
          ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${scope.label || 'Oscilloscope'} Screen`, baseWidth / 2, baseHeight / 2);
        }
      }

      // Axis scale labels: pure typography with a stroke halo, no background box (was overlapping grid/traces).
      if (showValues) {
        const textColor = isDark ? '#f8fafc' : '#1e293b';
        const haloColor = isDark ? '#090a0d' : '#ffffff';
        ctx.font = '8px "KaTeX_Main", ui-monospace, SFMono-Regular, monospace';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;

        const drawHaloText = (text: string, x: number, y: number, align: CanvasTextAlign) => {
          ctx.textAlign = align;
          ctx.lineWidth = haloStrokeWidth(8);
          ctx.strokeStyle = haloColor;
          ctx.strokeText(text, x, y);
          ctx.fillStyle = textColor;
          ctx.fillText(text, x, y);
        };

        const vertDivs = [
          { text: formatVoltageText(primaryConfig.offset + 4 * primaryConfig.voltDiv), y: 8 },
          { text: formatVoltageText(primaryConfig.offset + 2 * primaryConfig.voltDiv), y: baseHeight * 0.25 },
          { text: formatVoltageText(primaryConfig.offset + 0 * primaryConfig.voltDiv), y: baseHeight * 0.50 },
          { text: formatVoltageText(primaryConfig.offset - 2 * primaryConfig.voltDiv), y: baseHeight * 0.75 },
          { text: formatVoltageText(primaryConfig.offset - 4 * primaryConfig.voltDiv), y: baseHeight - 18 },
        ];
        vertDivs.forEach(({ text, y }) => drawHaloText(text, 4, y, 'left'));

        const horizDivs = [
          { text: formatTimeText(0 * primaryConfig.timeDiv), align: 'left' as CanvasTextAlign, x: 3 },
          { text: formatTimeText(2 * primaryConfig.timeDiv), align: 'center' as CanvasTextAlign, x: baseWidth * 0.20 },
          { text: formatTimeText(4 * primaryConfig.timeDiv), align: 'center' as CanvasTextAlign, x: baseWidth * 0.40 },
          { text: formatTimeText(6 * primaryConfig.timeDiv), align: 'center' as CanvasTextAlign, x: baseWidth * 0.60 },
          { text: formatTimeText(8 * primaryConfig.timeDiv), align: 'center' as CanvasTextAlign, x: baseWidth * 0.80 },
          { text: formatTimeText(10 * primaryConfig.timeDiv), align: 'right' as CanvasTextAlign, x: baseWidth - 3 },
        ];
        horizDivs.forEach(({ text, align, x }) => drawHaloText(text, x, baseHeight - 6, align));

        ctx.textAlign = 'left';
      }

      ctx.restore();

      const pngData = exportCanvas.toDataURL('image/png');
      return new Promise<ExportItem | null>(resolve => {
        exportCanvas.toBlob(blob => {
          resolve({
            id: `scope-${scope.id}`,
            title: scope.label ? `Live Oscilloscope (${scope.label})` : 'Live Oscilloscope',
            filename,
            format: 'png',
            type: 'oscilloscope',
            dataUrl: pngData,
            blob: blob || undefined,
            width: targetWidth,
            height: targetHeight,
          });
        }, 'image/png');
      });
    } else {
      // Pure native vector SVG export - No raster wrapping!
      const gridDivsX = 10;
      const gridDivsY = 8;
      const stepX = baseWidth / gridDivsX;
      const stepY = baseHeight / gridDivsY;
      const gridStroke = isDark ? '#1a1d24' : '#e2e8f0';
      const centerStroke = isDark ? '#222630' : '#94a3b8';

      let graticuleLines = '';
      for (let i = 1; i < gridDivsX; i++) {
        const x = (i * stepX).toFixed(2);
        graticuleLines += `<line x1="${x}" y1="0" x2="${x}" y2="${baseHeight}" stroke="${gridStroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      for (let j = 1; j < gridDivsY; j++) {
        const y = (j * stepY).toFixed(2);
        graticuleLines += `<line x1="0" y1="${y}" x2="${baseWidth}" y2="${y}" stroke="${gridStroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
      graticuleLines += `<line x1="${(baseWidth / 2).toFixed(2)}" y1="0" x2="${(baseWidth / 2).toFixed(2)}" y2="${baseHeight}" stroke="${centerStroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      graticuleLines += `<line x1="0" y1="${(baseHeight / 2).toFixed(2)}" x2="${baseWidth}" y2="${(baseHeight / 2).toFixed(2)}" stroke="${centerStroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;

      let tracePaths = '';
      readings.forEach((reading, idx) => {
        if (reading?.status === 'ready' && reading.samples && reading.samples.length >= 2) {
          const pts = computeScopeTracePoints(
            reading.samples,
            channelConfigs[idx].offset,
            channelConfigs[idx].voltDiv,
            channelConfigs[idx].timeDiv,
            channelConfigs[idx].timeShift,
            acquisitionMode,
            baseWidth,
            baseHeight,
          );
          if (pts.length >= 2) {
            const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
            tracePaths += `<path d="${d}" fill="none" stroke="${channelColors[idx]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
          }
        }
      });

      let badgesSvg = '';
      if (showValues) {
        const textColor = isDark ? '#f8fafc' : '#1e293b';
        const haloColor = isDark ? '#090a0d' : '#ffffff';
        const haloAttrs = `stroke="${haloColor}" stroke-width="${haloStrokeWidth(8)}" paint-order="stroke fill" stroke-linejoin="round"`;

        const vertDivs = [
          { text: formatVoltageText(primaryConfig.offset + 4 * primaryConfig.voltDiv), y: 8 },
          { text: formatVoltageText(primaryConfig.offset + 2 * primaryConfig.voltDiv), y: baseHeight * 0.25 },
          { text: formatVoltageText(primaryConfig.offset + 0 * primaryConfig.voltDiv), y: baseHeight * 0.50 },
          { text: formatVoltageText(primaryConfig.offset - 2 * primaryConfig.voltDiv), y: baseHeight * 0.75 },
          { text: formatVoltageText(primaryConfig.offset - 4 * primaryConfig.voltDiv), y: baseHeight - 18 },
        ];
        vertDivs.forEach(({ text, y }) => {
          badgesSvg += `<text x="4" y="${(y + 3).toFixed(2)}" fill="${textColor}" ${haloAttrs} font-size="8" font-family="'KaTeX_Main', ui-monospace, monospace">${escapeXml(text)}</text>`;
        });

        const horizDivs = [
          { text: formatTimeText(0 * primaryConfig.timeDiv), anchor: 'start', x: 3 },
          { text: formatTimeText(2 * primaryConfig.timeDiv), anchor: 'middle', x: baseWidth * 0.20 },
          { text: formatTimeText(4 * primaryConfig.timeDiv), anchor: 'middle', x: baseWidth * 0.40 },
          { text: formatTimeText(6 * primaryConfig.timeDiv), anchor: 'middle', x: baseWidth * 0.60 },
          { text: formatTimeText(8 * primaryConfig.timeDiv), anchor: 'middle', x: baseWidth * 0.80 },
          { text: formatTimeText(10 * primaryConfig.timeDiv), anchor: 'end', x: baseWidth - 3 },
        ];
        horizDivs.forEach(({ text, anchor, x }) => {
          badgesSvg += `<text x="${x.toFixed(2)}" y="${baseHeight - 6}" text-anchor="${anchor}" fill="${textColor}" ${haloAttrs} font-size="8" font-family="'KaTeX_Main', ui-monospace, monospace">${escapeXml(text)}</text>`;
        });
      }

      const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${baseWidth} ${baseHeight}" width="${baseWidth}px" height="${baseHeight}px">
  <defs>
    <style>
      ${KATEX_EMBEDDED_FONT_CSS}
      text { font-family: 'KaTeX_Main', ui-monospace, monospace; }
    </style>
  </defs>
  <rect width="${baseWidth}" height="${baseHeight}" fill="none"/>
  <g class="graticule">${graticuleLines}</g>
  <g class="traces">${tracePaths}</g>
  ${badgesSvg}
</svg>`;

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const dataUrl = URL.createObjectURL(blob);
      return Promise.resolve({
        id: `scope-${scope.id}`,
        title: scope.label ? `Live Oscilloscope (${scope.label})` : 'Live Oscilloscope',
        filename,
        format: 'svg',
        type: 'oscilloscope',
        dataUrl,
        blob,
        svgString: svgStr,
        width: baseWidth,
        height: baseHeight,
      });
    }
  }, [effectiveSnapshot.instrumentReadings, oscilloscopeDisplaySettings]);

  const captureDmmItem = useCallback((dmm: CircuitComponent, reading: InstrumentReading | undefined, format: 'png' | 'svg', index: number, total: number): Promise<ExportItem | null> => {
    let valueText = '—';
    const isShorted = reading?.continuity === true;
    if (reading?.status === 'open') {
      valueText = 'O.L';
    } else if (isShorted) {
      valueText = 'SHORTED';
    } else if (reading && typeof reading.value === 'number') {
      const val = reading.value;
      const abs = Math.abs(val);
      const unit = reading.unit || '';
      if ((unit === 'Ω' || unit === 'Ohm') && (!Number.isFinite(val) || abs >= 1e7)) {
        valueText = 'O.L';
      } else if (abs >= 1e6) valueText = `${(val / 1e6).toFixed(3)} M${unit}`;
      else if (abs >= 1e3) valueText = `${(val / 1e3).toFixed(3)} k${unit}`;
      else if (abs >= 1) valueText = `${val.toFixed(3)} ${unit}`;
      else if (abs >= 1e-3) valueText = `${(val * 1e3).toFixed(2)} m${unit}`;
      else if (abs >= 1e-6) valueText = `${(val * 1e6).toFixed(2)} µ${unit}`;
      else valueText = `${val.toFixed(3)} ${unit}`;
    }
    const statusText = reading?.status === 'ready'
      ? (isShorted ? 'Continuity detected' : 'Probe-linked measurement')
      : reading?.status === 'open'
        ? 'Open / not fully connected'
        : 'Connect HI and COM probes';

    const isDark = darkPreview;
    const baseWidth = 480;
    const baseHeight = 240;
    const dmmMode = (dmm.props?.mode as string) || 'AUTO RANGE';
    const filename = total > 1
      ? `dmm-${exportCounters.current.multimeter}-${index + 1}.${format}`
      : `dmm-${exportCounters.current.multimeter}.${format}`;

    if (format === 'png') {
      const TARGET_4K_WIDTH = 3840;
      const scale = Math.max(4, Math.round(TARGET_4K_WIDTH / baseWidth));
      const targetWidth = baseWidth * scale;
      const targetHeight = baseHeight * scale;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return Promise.resolve(null);

      ctx.save();
      ctx.scale(scale, scale);

      // Outer casing - Inverted clean off-white enclosure in Dark Mode, dark charcoal in Light Mode
      ctx.fillStyle = isDark ? '#f1f5f9' : '#1e232d';
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, baseWidth, baseHeight, 16);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, baseWidth, baseHeight);
      }
      ctx.strokeStyle = isDark ? '#cbd5e1' : '#111827';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header
      ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
      ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText((dmm.label || 'DIGITAL MULTIMETER').toUpperCase(), 24, 34);

      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MAE ACADEMY PRECISION DMM', 456, 34);
      ctx.textAlign = 'left';

      // LCD screen bezel
      // LCD screen bezel - matching Live Multimeters panel soft cyan
      ctx.fillStyle = '#e0f2fe';
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(20, 50, 440, 160, 10);
        ctx.fill();
      } else {
        ctx.fillRect(20, 50, 440, 160);
      }
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Annunciator
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText(dmmMode.toUpperCase(), 36, 78);

      // Value Display
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 42px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(valueText, 440, 142);
      ctx.textAlign = 'left';

      // Subtitle
      ctx.fillStyle = '#0369a1';
      ctx.font = '12px sans-serif';
      ctx.fillText(statusText, 36, 185);

      ctx.restore();

      const dataUrl = canvas.toDataURL('image/png');
      return new Promise<ExportItem | null>(resolve => {
        canvas.toBlob(blob => {
          resolve({
            id: `dmm-${dmm.id}`,
            title: dmm.label ? `Digital Multimeter (${dmm.label})` : 'Digital Multimeter',
            filename,
            format: 'png',
            type: 'multimeter',
            dataUrl,
            blob: blob || undefined,
            width: targetWidth,
            height: targetHeight,
          });
        }, 'image/png');
      });
    } else {
      // Pure native vector SVG export - No raster wrapping!
      const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240" width="480px" height="240px">
  <defs>
    <style>
      ${KATEX_EMBEDDED_FONT_CSS}
      text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    </style>
  </defs>
  <rect x="0" y="0" width="480" height="240" rx="16" fill="${isDark ? '#f1f5f9' : '#1e232d'}" stroke="${isDark ? '#cbd5e1' : '#111827'}" stroke-width="2"/>
  <text x="24" y="34" fill="${isDark ? '#334155' : '#cbd5e1'}" font-family="ui-monospace, SFMono-Regular, monospace" font-size="13" font-weight="bold">${escapeXml((dmm.label || 'DIGITAL MULTIMETER').toUpperCase())}</text>
  <text x="456" y="34" text-anchor="end" fill="${isDark ? '#64748b' : '#94a3b8'}" font-family="system-ui, -apple-system, sans-serif" font-size="11">MAE ACADEMY PRECISION DMM</text>
  <rect x="20" y="50" width="440" height="160" rx="10" fill="#e0f2fe" stroke="#7dd3fc" stroke-width="1.5"/>
  <text x="36" y="78" fill="#0284c7" font-family="ui-monospace, SFMono-Regular, monospace" font-size="12" font-weight="bold">${escapeXml(dmmMode.toUpperCase())}</text>
  <text x="440" y="142" text-anchor="end" fill="#0284c7" font-family="ui-monospace, SFMono-Regular, monospace" font-size="42" font-weight="bold">${escapeXml(valueText)}</text>
  <text x="36" y="185" fill="#0369a1" font-family="system-ui, -apple-system, sans-serif" font-size="12">${escapeXml(statusText)}</text>
</svg>`;

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const dataUrl = URL.createObjectURL(blob);
      return Promise.resolve({
        id: `dmm-${dmm.id}`,
        title: dmm.label ? `Digital Multimeter (${dmm.label})` : 'Digital Multimeter',
        filename,
        format: 'svg',
        type: 'multimeter',
        dataUrl,
        blob,
        svgString: svgStr,
        width: 480,
        height: 240,
      });
    }
  }, [darkPreview]);

  const exportSvg = useCallback(async () => {
    if (components.length === 0 && texts.length === 0 && wires.length === 0) {
      toast.error('No circuit elements to export');
      return;
    }

    const bounds = getCircuitBoundingBox();
    if (!bounds || !svgRef.current) {
      toast.error('Unable to compute circuit boundaries');
      return;
    }

    const padding = 40;
    let cropX = Math.round(bounds.minX - padding);
    let cropY = Math.round(bounds.minY - padding);
    let cropWidth = Math.round(bounds.circuitWidth + padding * 2);
    let cropHeight = Math.round(bounds.circuitHeight + padding * 2);

    if (svgRef.current) {
      try {
        const elementsLayer = (svgRef.current.querySelector('#circuit-elements-layer') || svgRef.current.querySelector('g[data-circuit-world]')) as SVGGElement | null;
        if (elementsLayer && typeof elementsLayer.getBBox === 'function') {
          const liveBbox = elementsLayer.getBBox();
          if (Number.isFinite(liveBbox.x) && Number.isFinite(liveBbox.y) && liveBbox.width > 0 && liveBbox.height > 0) {
            const combinedMinX = Math.min(bounds.minX, liveBbox.x);
            const combinedMinY = Math.min(bounds.minY, liveBbox.y);
            const combinedMaxX = Math.max(bounds.maxX, liveBbox.x + liveBbox.width);
            const combinedMaxY = Math.max(bounds.maxY, liveBbox.y + liveBbox.height);
            cropX = Math.round(combinedMinX - padding);
            cropY = Math.round(combinedMinY - padding);
            cropWidth = Math.round((combinedMaxX - combinedMinX) + padding * 2);
            cropHeight = Math.round((combinedMaxY - combinedMinY) + padding * 2);
          }
        }
      } catch {
        // fallback to bounds
      }
    }

    // --- Step 1: Inline computed styles from the LIVE DOM into the CLONE ---
    // This must happen BEFORE cloneNode so we can walk source + clone in sync.
    // We need to first get the clone, then immediately call inlineComputedStyles.
    const clonedSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

    // Run the deep style inliner while the original SVG is still attached to the DOM
    inlineComputedStyles(svgRef.current, clonedSvg);

    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.removeAttribute('class'); // No external CSS class resolution
    clonedSvg.setAttribute('viewBox', `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
    clonedSvg.setAttribute('width', `${cropWidth}px`);
    clonedSvg.setAttribute('height', `${cropHeight}px`);
    clonedSvg.removeAttribute('style');
    clonedSvg.style.background = 'transparent';
    clonedSvg.style.backgroundColor = 'transparent';

    const strokeColor = darkPreview ? '#f8fafc' : '#1e293b';
    // Set color on root so any remaining currentColor references resolve correctly
    clonedSvg.setAttribute('color', strokeColor);

    // --- Step 2: Remove the pan/zoom world transform (viewBox handles framing) ---
    const worldGroup = Array.from(clonedSvg.querySelectorAll('g')).find(g => g.getAttribute('transform')?.includes('scale'));
    if (worldGroup) {
      worldGroup.removeAttribute('transform');
    }

    // --- Step 3: Strip all interactive artifacts and grid surface rects ---
    // Remove all existing grid rects (we'll re-add a clean one if needed)
    clonedSvg.querySelectorAll('rect[fill^="url(#workspace-grid"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[key*="grid-surface"], rect[fill*="workspace-grid"]').forEach(el => el.remove());
    // Remove ALL existing grid pattern definitions from the cloned <defs> —
    // they are stale clones that may not match the active grid mode.
    clonedSvg.querySelectorAll('pattern[id^="workspace-grid"]').forEach(el => el.remove());
    // Remove wire hitboxes (wide transparent strokes used for mouse interaction)
    clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
    // Remove handle circles (wire corner drag handles, terminal hit targets)
    clonedSvg.querySelectorAll('circle[style*="cursor: move"], circle[style*="cursor:move"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[r="13"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
    // Remove marquee selection rect
    clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
    // Remove wire draft preview path
    clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
    // Remove hidden overlays
    clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"], circle[opacity="0"], circle[style*="opacity: 0"]').forEach(el => el.remove());
    // Strip any solid background rect that was added by previous export iterations
    clonedSvg.querySelectorAll('rect[data-export-bg]').forEach(el => el.remove());

    texts.forEach(text => {
      const g = clonedSvg.querySelector(`g[data-text-id="${text.id}"]`);
      if (g) {
        const fo = g.querySelector('foreignObject');
        if (fo) {
          const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textEl.setAttribute('x', '0');
          textEl.setAttribute('y', '0');
          textEl.setAttribute('dominant-baseline', 'hanging');
          textEl.setAttribute('fill', text.color);
          // Halo guards against dark-mode-authored near-white fills (see line 1381 default) going invisible on a transparent/white export target.
          textEl.setAttribute('paint-order', 'stroke fill');
          textEl.setAttribute('stroke', colors.canvas);
          textEl.setAttribute('stroke-width', String(haloStrokeWidth(text.fontSize || 14)));
          textEl.setAttribute('stroke-linejoin', 'round');
          textEl.setAttribute('font-size', `${text.fontSize || 14}px`);
          textEl.setAttribute('font-family', "'KaTeX_Main', 'KaTeX_Math', serif");
          textEl.style.fontFamily = "'KaTeX_Main', 'KaTeX_Math', serif";
          textEl.style.fontSize = `${text.fontSize || 14}px`;
          populateMathTspans(textEl, text.text, text.fontSize || 14);
          fo.replaceWith(textEl);
        }
      }
    });

    // --- Step 4: Normalize all remaining `color` and `currentColor` references ---
    // After inlineComputedStyles, most elements are hardcoded. Do a final pass for
    // any remaining `color` attributes and `currentColor` fill/stroke values.
    clonedSvg.querySelectorAll('[color]').forEach(el => {
      el.setAttribute('color', strokeColor);
    });
    clonedSvg.querySelectorAll('[fill="currentColor"], [fill="currentcolor"]').forEach(el => {
      el.setAttribute('fill', strokeColor);
    });
    clonedSvg.querySelectorAll('[stroke="currentColor"], [stroke="currentcolor"]').forEach(el => {
      el.setAttribute('stroke', strokeColor);
    });

    // --- Step 5: Build defs block with embedded fonts and grid pattern ---
    let defs = clonedSvg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      clonedSvg.insertBefore(defs, clonedSvg.firstChild);
    }

    // Pure transparent backdrop (fill="none" means no background rectangle at all)
    // We do NOT insert a background rect for SVG exports — this ensures transparency.
    // The transparency is established at the SVG root level via style.

    // Re-inject grid pattern + rect if the grid is active
    if (gridVisible && (!tabDUiRefinement || tabDGridMode !== 'hidden')) {
      // Clone the live grid pattern definition from the live SVG <defs>
      const livePatternId = tabDUiRefinement && tabDGridMode === 'dots'
        ? 'workspace-grid-dots'
        : `workspace-grid-${tabDUiRefinement ? tabDGridMode : 'base'}`;
      const livePattern = svgRef.current?.querySelector(`#${livePatternId}`);
      if (livePattern) {
        const patternClone = livePattern.cloneNode(true) as Element;
        defs.appendChild(patternClone);
      }
      const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      gridRect.setAttribute('x', String(cropX));
      gridRect.setAttribute('y', String(cropY));
      gridRect.setAttribute('width', String(cropWidth));
      gridRect.setAttribute('height', String(cropHeight));
      gridRect.setAttribute('fill', `url(#${livePatternId})`);
      gridRect.setAttribute('data-export-bg', 'grid');
      const insertTarget = worldGroup || clonedSvg;
      insertTarget.insertBefore(gridRect, insertTarget.firstChild);
    }

    // Embedded font CSS + hardcoded fallback class styles (belt-and-suspenders for any
    // class that wasn't removed by inlineComputedStyles due to non-SVG wrappers)
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    // Only embed font-face declarations and a root color fallback.
    // ALL visual properties (fill, stroke, paint-order, etc.) are now hardcoded
    // as presentation attributes by inlineComputedStyles — no CSS rules needed.
    // Class-based rules were actively harmful: they overrode inlined attributes
    // (CSS specificity > presentation attributes) and pointed at classes the
    // inliner strips.
    styleEl.textContent = `
      ${KATEX_EMBEDDED_FONT_CSS}
      :root, svg { color: ${strokeColor}; background-color: transparent; }
      text, tspan { font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif; }
    `;
    defs.appendChild(styleEl);

    thinHaloStrokes(clonedSvg);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);
    if (!svgString.startsWith('<?xml')) {
      svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const items: ExportItem[] = [{
      id: 'circuit-main',
      title: 'Circuit Schematic',
      filename: `circuit-${exportCounters.current.circuit}.svg`,
      format: 'svg',
      type: 'circuit',
      dataUrl: url,
      blob,
      svgString,
      width: cropWidth,
      height: cropHeight,
    }];

    const activeScopes = components.filter(c => c.type === 'oscilloscope');
    for (let i = 0; i < activeScopes.length; i++) {
      const scopeItem = await captureOscilloscopeItem(activeScopes[i], 'svg', i, activeScopes.length);
      if (scopeItem) items.push(scopeItem);
    }

    const activeDmms = components.filter(c => c.type === 'dmm');
    for (let i = 0; i < activeDmms.length; i++) {
      const dmmItem = await captureDmmItem(activeDmms[i], effectiveSnapshot.instrumentReadings[activeDmms[i].id], 'svg', i, activeDmms.length);
      if (dmmItem) items.push(dmmItem);
    }

    setExportItems(items);
    setExportFormat('svg');
    setExportModalOpen(true);
  }, [captureDmmItem, captureOscilloscopeItem, colors.canvas, components, darkPreview, effectiveSnapshot.instrumentReadings, getCircuitBoundingBox, gridVisible, tabDGridMode, tabDUiRefinement, texts, wires.length]);

  const handleOpenSaveImage = exportSvg;

  const exportPng = useCallback(() => {
    if (components.length === 0 && texts.length === 0 && wires.length === 0) {
      toast.error('No circuit elements to export');
      return;
    }

    const bounds = getCircuitBoundingBox();
    if (!bounds || !svgRef.current) {
      toast.error('Unable to compute circuit boundaries');
      return;
    }

    const padding = 40;
    let cropX = Math.round(bounds.minX - padding);
    let cropY = Math.round(bounds.minY - padding);
    let cropWidth = Math.round(bounds.circuitWidth + padding * 2);
    let cropHeight = Math.round(bounds.circuitHeight + padding * 2);

    if (svgRef.current) {
      try {
        const elementsLayer = (svgRef.current.querySelector('#circuit-elements-layer') || svgRef.current.querySelector('g[data-circuit-world]')) as SVGGElement | null;
        if (elementsLayer && typeof elementsLayer.getBBox === 'function') {
          const liveBbox = elementsLayer.getBBox();
          if (Number.isFinite(liveBbox.x) && Number.isFinite(liveBbox.y) && liveBbox.width > 0 && liveBbox.height > 0) {
            const combinedMinX = Math.min(bounds.minX, liveBbox.x);
            const combinedMinY = Math.min(bounds.minY, liveBbox.y);
            const combinedMaxX = Math.max(bounds.maxX, liveBbox.x + liveBbox.width);
            const combinedMaxY = Math.max(bounds.maxY, liveBbox.y + liveBbox.height);
            cropX = Math.round(combinedMinX - padding);
            cropY = Math.round(combinedMinY - padding);
            cropWidth = Math.round((combinedMaxX - combinedMinX) + padding * 2);
            cropHeight = Math.round((combinedMaxY - combinedMinY) + padding * 2);
          }
        }
      } catch {
        // fallback
      }
    }

    // Ultra high-definition PNG export: target 4K (3840px base width) with minimum 4x scale
    const TARGET_4K_WIDTH = 3840;
    const exportScale = Math.max(4, TARGET_4K_WIDTH / cropWidth);
    const scale = exportScale;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cropWidth * scale);
    canvas.height = Math.round(cropHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast.error('Failed to initialize canvas for PNG export');
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = colors.canvas;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gridVisible && (!tabDUiRefinement || tabDGridMode !== 'hidden')) {
      if (tabDUiRefinement && tabDGridMode === 'dots') {
        const dotColor = darkPreview ? 'rgba(109, 145, 196, 0.9)' : 'rgba(122, 147, 177, 0.9)';
        ctx.fillStyle = dotColor;
        const startX = Math.floor(cropX / gridSize) * gridSize;
        const startY = Math.floor(cropY / gridSize) * gridSize;
        for (let x = startX; x <= cropX + cropWidth; x += gridSize) {
          for (let y = startY; y <= cropY + cropHeight; y += gridSize) {
            const px = (x - cropX) * scale;
            const py = (y - cropY) * scale;
            ctx.beginPath();
            ctx.arc(px, py, 1.65 * scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        const lineColor = tabDUiRefinement
          ? (darkPreview ? 'rgba(61, 95, 140, 0.85)' : 'rgba(168, 184, 204, 0.85)')
          : colors.grid;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = (tabDUiRefinement ? 1.15 : 1) * scale;
        ctx.beginPath();
        const startX = Math.floor(cropX / gridSize) * gridSize;
        const startY = Math.floor(cropY / gridSize) * gridSize;
        for (let x = startX; x <= cropX + cropWidth; x += gridSize) {
          const px = (x - cropX) * scale;
          ctx.moveTo(px, 0);
          ctx.lineTo(px, canvas.height);
        }
        for (let y = startY; y <= cropY + cropHeight; y += gridSize) {
          const py = (y - cropY) * scale;
          ctx.moveTo(0, py);
          ctx.lineTo(canvas.width, py);
        }
        ctx.stroke();
      }
    }

    // PNG export: clone and inline computed styles for accurate pixel rendering
    const clonedSvg = svgRef.current.cloneNode(true) as SVGSVGElement;

    // Deep style inliner — resolves currentColor, CSS vars, Tailwind classes
    inlineComputedStyles(svgRef.current, clonedSvg);

    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.removeAttribute('class');
    clonedSvg.setAttribute('viewBox', `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
    clonedSvg.setAttribute('width', String(canvas.width));
    clonedSvg.setAttribute('height', String(canvas.height));
    clonedSvg.removeAttribute('style');

    const strokeColor = darkPreview ? '#f8fafc' : '#1e293b';
    clonedSvg.setAttribute('color', strokeColor);

    const worldGroupPng = Array.from(clonedSvg.querySelectorAll('g')).find(g => g.getAttribute('transform')?.includes('scale'));
    if (worldGroupPng) {
      worldGroupPng.removeAttribute('transform');
    }

    // Remove all grid surface rects and interactive UI artifacts
    clonedSvg.querySelectorAll('rect[fill^="url(#workspace-grid"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[key*="grid-surface"], rect[fill*="workspace-grid"]').forEach(el => el.remove());
    // Remove stale grid patterns from cloned defs
    clonedSvg.querySelectorAll('pattern[id^="workspace-grid"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[style*="cursor: move"], circle[style*="cursor:move"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[r="13"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"], circle[opacity="0"], circle[style*="opacity: 0"]').forEach(el => el.remove());

    // Normalize any remaining currentColor references
    clonedSvg.querySelectorAll('[color]').forEach(el => el.setAttribute('color', strokeColor));
    clonedSvg.querySelectorAll('[fill="currentColor"], [fill="currentcolor"]').forEach(el => el.setAttribute('fill', strokeColor));
    clonedSvg.querySelectorAll('[stroke="currentColor"], [stroke="currentcolor"]').forEach(el => el.setAttribute('stroke', strokeColor));

    texts.forEach(text => {
      const g = clonedSvg.querySelector(`g[data-text-id="${text.id}"]`);
      if (g) {
        const fo = g.querySelector('foreignObject');
        if (fo) {
          const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textEl.setAttribute('x', '0');
          textEl.setAttribute('y', '0');
          textEl.setAttribute('dominant-baseline', 'hanging');
          textEl.setAttribute('fill', text.color);
          // Halo guards against dark-mode-authored near-white fills (see line 1381 default) going invisible on a transparent/white export target.
          textEl.setAttribute('paint-order', 'stroke fill');
          textEl.setAttribute('stroke', colors.canvas);
          textEl.setAttribute('stroke-width', String(haloStrokeWidth(text.fontSize || 14)));
          textEl.setAttribute('stroke-linejoin', 'round');
          textEl.setAttribute('font-size', `${text.fontSize || 14}px`);
          textEl.setAttribute('font-family', "'KaTeX_Main', 'KaTeX_Math', serif");
          textEl.style.fontFamily = "'KaTeX_Main', 'KaTeX_Math', serif";
          textEl.style.fontSize = `${text.fontSize || 14}px`;
          populateMathTspans(textEl, text.text, text.fontSize || 14);
          fo.replaceWith(textEl);
        }
      }
    });

    let defs = clonedSvg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      clonedSvg.insertBefore(defs, clonedSvg.firstChild);
    }
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      ${KATEX_EMBEDDED_FONT_CSS}
      :root, svg { color: ${strokeColor}; background-color: transparent; }
      text, tspan { font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif; }
    `;
    defs.appendChild(styleEl);

    thinHaloStrokes(clonedSvg);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = async () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      try {
        const pngUrl = canvas.toDataURL('image/png');
        const circuitBlob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));

        const items: ExportItem[] = [{
          id: 'circuit-main',
          title: 'Circuit Schematic',
          filename: `circuit-${exportCounters.current.circuit}.png`,
          format: 'png',
          type: 'circuit',
          dataUrl: pngUrl,
          blob: circuitBlob || undefined,
          width: canvas.width,
          height: canvas.height,
        }];

        const activeScopes = components.filter(c => c.type === 'oscilloscope');
        for (let i = 0; i < activeScopes.length; i++) {
          const scopeItem = await captureOscilloscopeItem(activeScopes[i], 'png', i, activeScopes.length);
          if (scopeItem) items.push(scopeItem);
        }

        const activeDmms = components.filter(c => c.type === 'dmm');
        for (let i = 0; i < activeDmms.length; i++) {
          const dmmItem = await captureDmmItem(activeDmms[i], effectiveSnapshot.instrumentReadings[activeDmms[i].id], 'png', i, activeDmms.length);
          if (dmmItem) items.push(dmmItem);
        }

        setExportItems(items);
        setExportFormat('png');
        setExportModalOpen(true);
      } catch (err) {
        toast.error('Failed to prepare export preview');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Failed to render schematic to PNG');
    };
    img.src = url;
  }, [captureDmmItem, captureOscilloscopeItem, colors.canvas, colors.grid, components, darkPreview, effectiveSnapshot.instrumentReadings, getCircuitBoundingBox, gridSize, gridVisible, tabDGridMode, tabDUiRefinement, texts, wires.length]);

  // --- Switch & Push-Button Keyboard Controls ---
  // A number key addresses the switch/pushbutton whose label ends in it (S1 -> "1"); see
  // applySwitchHotkey. Every change marks the next SPICE solve eager, so the DMM follows the key
  // immediately, Run or not.
  useEffect(() => {
    const applyToCanvas = (update: (previous: CircuitComponent[]) => CircuitComponent[] | null) => {
      setComponents(previous => {
        const next = update(previous);
        if (!next) return previous;
        requestEagerSpiceRun();
        liveComponentsRef.current = next;
        simulation.current.setCircuit(next, wiresRef.current);
        const snap = simulation.current.getSnapshot();
        const brokenWires = getBrokenWireIds(next, wiresRef.current);
        brokenWires.forEach(wireId => {
          if (snap.wireCurrents) snap.wireCurrents[wireId] = 0;
          if (snap.wirePhases) delete snap.wirePhases[wireId];
        });
        setSnapshot(snap);
        return next;
      });
    };

    const handleSwitchKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      // Auto-repeat must not re-flip a held latching switch; a held pushbutton is already pressed.
      // Shift is allowed: AZERTY layouts type the number row's digits only with Shift held.
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const digit = hotkeyDigit(event);
      if (digit === null) return;
      applyToCanvas(previous => applySwitchHotkey(previous, digit, 'down'));
    };

    // Deliberately not filtered by focus or modifiers: a release must always land, or a pushbutton
    // pressed on the canvas could stay held after focus moves into a text field mid-press.
    const handleSwitchKeyUp = (event: KeyboardEvent) => {
      const digit = hotkeyDigit(event);
      if (digit === null) return;
      applyToCanvas(previous => applySwitchHotkey(previous, digit, 'up'));
    };

    // Losing window focus mid-press sends the key-up elsewhere; release rather than stick.
    const handleWindowBlur = () => applyToCanvas(releaseHeldPushbuttons);

    window.addEventListener('keydown', handleSwitchKeyDown);
    window.addEventListener('keyup', handleSwitchKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleSwitchKeyDown);
      window.removeEventListener('keyup', handleSwitchKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [requestEagerSpiceRun]);

  const libraryCategories = useMemo(() => CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
    if (category === 'Classic Control') return all;
    const catKey = category.toLowerCase().replace(/[\s-]/g, '');
    const translatedCategory = t(`simulators:circuit.${catKey}`, category);
    let categoryItems = getComponentsByCategory(category).filter(item => !item.hidden);
    if (tabDUiRefinement && category === 'Passive') {
      categoryItems = [...categoryItems, ...['star-resistor-pack', 'delta-resistor-pack'].map(getDef).filter((item): item is ComponentDef => Boolean(item))];
    }
    if (tabDUiRefinement && category === 'Controlled Sources') {
      categoryItems = categoryItems.filter(item => !['star-resistor-pack', 'delta-resistor-pack'].includes(item.id));
    }
    if (tabDUiRefinement && category === 'Diodes') {
      categoryItems = categoryItems.filter(item => !['diode-ideal', 'diode-silicon', 'diode-germanium', 'diode-gaas'].includes(item.id));
    }
    if (tabDUiRefinement) categoryItems = filterTabDCatalog(categoryItems);
    if (!tabDUiRefinement && category === 'Diodes') {
      categoryItems = categoryItems.filter(item => item.id !== 'diode');
    }
    const items = categoryItems.filter(item => !item.hidden);
    if (items.length) all[translatedCategory] = items;
    return all;
  }, {}), [tabDUiRefinement, t]);

  const linkedCoils = components.filter(component => ['coil', 'contactor', 'relay-spst', 'relay-spdt', 'relay-dpst'].includes(component.type));

  const conflictedCoilIds = useMemo(() => {
    const report = detectCoilConflicts(components);
    const set = new Set<string>();
    if (!report.hasConflicts) return set;
    for (const conflict of report.conflicts) {
      const duplicates = components.filter(c => c.type === 'coil' && (c.label || c.id) === conflict.name && c.id !== conflict.primaryId);
      duplicates.forEach(d => set.add(d.id));
    }
    return set;
  }, [components]);

  const activeComponentsForWires = liveComponentsRef.current.length > 0 ? liveComponentsRef.current : components;
  const brokenWireIdsForRender = getBrokenWireIds(activeComponentsForWires, wires);
  const netOf = useCallback((wire: CircuitWire) => normalizedGraph.netForTerminal(wire.fromComp, wire.fromTerm), [normalizedGraph]);

  const isIndependentSourceType = (type: string) => type === 'voltage' || type === 'current' || type === 'dc-voltage' || type === 'dc-current' || type === 'ac-voltage' || type === 'ac-current';
  const superpositionRole = (component: CircuitComponent) => {
    const dimmed = Boolean(isSuperpositionActive && superpositionActiveSourceId && isIndependentSourceType(component.type) && component.id !== superpositionActiveSourceId);
    return {
      dimmed,
      active: Boolean(isSuperpositionActive && superpositionActiveSourceId && component.id === superpositionActiveSourceId),
      deactivatedVoltage: dimmed && (component.type === 'voltage' || component.type === 'dc-voltage' || component.type === 'ac-voltage'),
      deactivatedCurrent: dimmed && (component.type === 'current' || component.type === 'dc-current' || component.type === 'ac-current'),
    };
  };
  const componentCanvasOpacity = (component: CircuitComponent) => {
    const role = superpositionRole(component);
    // Deactivated sources (wire short / open gap) render with full opacity so the wire looks like real circuit wire
    if (isTheveninActive && theveninTargetId === component.id) return 0.45;
    if (role.deactivatedVoltage || role.deactivatedCurrent) return 1;
    return role.dimmed ? 0.28 : 1;
  };

  const renderCanvasComponent = (component: CircuitComponent, isSelected: boolean, symbolTransform: string): React.ReactNode => {
    const definition = getDef(component.type);
    if (!definition) return null;
    let powered = Boolean(snapshot.componentPowered[component.id]);
    if (component.type === 'coil') {
      const vPos = snapshot.terminalVoltages[`${component.id}:pos`];
      const vNeg = snapshot.terminalVoltages[`${component.id}:neg`];
      if (vPos !== undefined && vNeg !== undefined) {
        const vCoil = Math.abs(vPos - vNeg);
        const threshold = Math.max(0.1, Number(component.props?.activationThreshold ?? 5));
        if (vCoil >= threshold * 0.6) {
          powered = true;
        }
      }
    } else if (['relay-spst', 'relay-spdt', 'relay-dpst', 'contactor'].includes(component.type)) {
      const manual = component.props?.manualState;
      if (manual === 'closed') {
        powered = true;
      } else if (manual === 'open') {
        powered = false;
      } else {
        const vPos = snapshot.terminalVoltages[`${component.id}:coil+`];
        const vNeg = snapshot.terminalVoltages[`${component.id}:coil-`];
        if (vPos !== undefined && vNeg !== undefined) {
          const vCoil = Math.abs(vPos - vNeg);
          const rated = Math.max(0.1, Number(component.props?.coilVoltage ?? (component.type === 'contactor' ? 24 : 12)));
          if (vCoil >= rated * 0.7) {
            powered = true;
          }
        }
      }
    } else if (['aux-contact-no', 'aux-contact-nc', 'aux-contact-3phase'].includes(component.type) && (component.props?.linkedTo || component.props?.controlSourceId)) {
      const linkedRef = String(component.props?.linkedTo || component.props?.controlSourceId || '');
      const linkedCoil = components.find(c => ['coil', 'contactor', 'relay-spst', 'relay-spdt', 'relay-dpst'].includes(c.type) && (c.label === linkedRef || c.id === linkedRef));
      if (linkedCoil) {
        if (linkedCoil.type === 'coil') {
          let coilEnergized = Boolean(snapshot.componentPowered[linkedCoil.id]);
          const vPos = snapshot.terminalVoltages[`${linkedCoil.id}:pos`];
          const vNeg = snapshot.terminalVoltages[`${linkedCoil.id}:neg`];
          if (vPos !== undefined && vNeg !== undefined) {
            const vCoil = Math.abs(vPos - vNeg);
            const threshold = Math.max(0.1, Number(linkedCoil.props?.activationThreshold ?? 5));
            if (vCoil >= threshold * 0.6) {
              coilEnergized = true;
            }
          }
          powered = coilEnergized;
        } else {
          const manual = linkedCoil.props?.manualState;
          if (manual === 'closed') {
            powered = true;
          } else if (manual === 'open') {
            powered = false;
          } else {
            let coilEnergized = Boolean(snapshot.componentPowered[linkedCoil.id]);
            const vPos = snapshot.terminalVoltages[`${linkedCoil.id}:coil+`];
            const vNeg = snapshot.terminalVoltages[`${linkedCoil.id}:coil-`];
            if (vPos !== undefined && vNeg !== undefined) {
              const vCoil = Math.abs(vPos - vNeg);
              const rated = Math.max(0.1, Number(linkedCoil.props?.coilVoltage ?? (linkedCoil.type === 'contactor' ? 24 : 12)));
              if (vCoil >= rated * 0.7) {
                coilEnergized = true;
              }
            }
            powered = coilEnergized;
          }
        }
      }
    }
    let motorVEff: number | undefined;
    if (component.type === 'motor-dc') {
      const vPos = snapshot.terminalVoltages[terminalKey(component.id, 'pos')];
      const vNeg = snapshot.terminalVoltages[terminalKey(component.id, 'neg')];
      if (vPos !== undefined && vNeg !== undefined) {
        const vEff = Math.abs(vPos - vNeg);
        motorVEff = vEff;
        powered = vEff >= 0.5;
      }
    } else if (component.type === 'motor-3phase') {
      const vu = snapshot.terminalVoltages[terminalKey(component.id, 'u')];
      const vv = snapshot.terminalVoltages[terminalKey(component.id, 'v')];
      const vw = snapshot.terminalVoltages[terminalKey(component.id, 'w')];
      if (vu !== undefined && vv !== undefined && vw !== undefined) {
        const vuv = Math.abs(vu - vv);
        const vvw = Math.abs(vv - vw);
        const vwu = Math.abs(vw - vu);
        const vEff = Math.sqrt((vuv ** 2 + vvw ** 2 + vwu ** 2) / 3);
        motorVEff = vEff;
        powered = vEff >= 0.5;
      }
    }
    const intensity = snapshot.componentIntensity[component.id] ?? 0;
    const reading = effectiveSnapshot.instrumentReadings[component.id];
    // Live KaTeX-styled reading inside the circular Voltmeter/Ammeter face, synced with
    // effectiveSnapshot (SPICE-verified when available, the legacy engine otherwise). A component
    // with no reading yet or an unwired meter falls back to the plain "V"/"A" glyph inside the symbol.
    const meterUnit = component.type === 'voltmeter' ? 'V' : component.type === 'ammeter' ? 'A' : null;
    let dmmDisplayValue: string | undefined = undefined;
    if (component.type === 'dmm') {
      const mode = String(component.props?.mode ?? 'DCV');
      if (reading) {
        const isOhmMode = mode === 'OHM' || mode === 'CONT' || reading.unit === 'Ω' || reading.unit === 'Ohm';
        if (reading.status === 'open' || (isOhmMode && (!Number.isFinite(reading.value) || Math.abs(reading.value) >= 1e7))) {
          dmmDisplayValue = 'O.L';
        } else if (reading.status === 'ready') {
          dmmDisplayValue = formatEngineering(reading.value, reading.unit, 1);
        }
      }
    }
    const meterDisplayValue = (meterUnit && reading?.status === 'ready')
      ? formatMeterReading(reading.value, meterUnit)
      : dmmDisplayValue;
    const role = superpositionRole(component);
    const symbolProps = (superpositionActive: boolean) => ({
      ...component.props,
      label: component.label,
      selected: isSelected,
      _isSelected: isSelected,
      isDark: darkPreview,
      _isDark: darkPreview,
      isEnergized: powered,
      isConflicted: conflictedCoilIds.has(component.id),
      _intensity: intensity,
      _isBurned: Boolean(component.state?.isBurned),
      _superpositionActive: superpositionActive,
      ...(motorVEff !== undefined ? { _vEff: motorVEff } : {}),
      _documentedStyle: tabDUiRefinement,
      ...(meterDisplayValue !== undefined ? { displayValue: meterDisplayValue } : {}),
    });
    const terminalOffsets = (): [number, number, number, number] => {
      const t0 = getCanvasTerminalPosition(component, definition.terminals[0]?.id);
      const t1 = getCanvasTerminalPosition(component, definition.terminals[1]?.id);
      return [t0 ? t0[0] - component.x : 0, t0 ? t0[1] - component.y : -50, t1 ? t1[0] - component.x : 0, t1 ? t1[1] - component.y : 50];
    };

    return (
      <>
        {component.state?.isBurned && <title>COMPONENT DESTROYED - Exceeded maximum ratings</title>}
        {role.deactivatedVoltage ? (() => {
          /* Deactivated Voltage Source (Short Circuit): ghosted source with a solid wire from pin1 to pin2 */
          const [x1, y1, x2, y2] = terminalOffsets();
          return (
            <g>
              <g transform={symbolTransform} opacity={0.25}>{renderSymbol(definition.symbol, powered, symbolProps(false), animationTime)}</g>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
            </g>
          );
        })() : role.deactivatedCurrent ? (() => {
          /* Deactivated Current Source (Open Circuit): ghosted source with an open terminal gap */
          const [x1, y1, x2, y2] = terminalOffsets();
          const stubLen = 14;
          const d0 = Math.hypot(x1, y1) || 1;
          const d1 = Math.hypot(x2, y2) || 1;
          return (
            <g>
              <g transform={symbolTransform} opacity={0.25}>{renderSymbol(definition.symbol, powered, symbolProps(false), animationTime)}</g>
              <line x1={x1} y1={y1} x2={x1 - (x1 / d0) * stubLen} y2={y1 - (y1 / d0) * stubLen} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
              <line x1={x2} y1={y2} x2={x2 - (x2 / d1) * stubLen} y2={y2 - (y2 / d1) * stubLen} stroke={colors.text} strokeWidth={1.5} strokeLinecap="round" />
            </g>
          );
        })() : (
          /* Active or standard component graphic with solid purple highlight during Superposition */
          <g transform={symbolTransform} color={isSelected ? colors.selection : role.active ? '#A855F7' : undefined}>
            {renderSymbol(definition.symbol, powered, symbolProps(role.active), animationTime)}
          </g>
        )}
      </>
    );
  };

  const renderDependentSourceLink = (component: CircuitComponent, isSelected: boolean): React.ReactNode => {
    if (!isSelected || !(component.type === 'cccs' || component.type === 'ccvs' || component.type === 'vcvs' || component.type === 'vccs')) return null;
    const targetRef = String(component.props.targetId || component.props.controlSourceId || '');
    if (!targetRef) return null;
    const sensedComponent = components.find(c => c.id === targetRef || c.label === targetRef);
    if (!sensedComponent) return null;
    return <line x1={0} y1={0} x2={sensedComponent.x - component.x} y2={sensedComponent.y - component.y} stroke={colors.selection} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} pointerEvents="none" />;
  };

  return (
    <BaseSchematicCanvas
      canvas={canvas}
      colors={colors}
      libraryCategories={libraryCategories}
      renderLibraryIcon={item => <ComponentPaletteIcon definition={item} colors={colors} documented={tabDUiRefinement} isDark={darkPreview} />}
      wireColor={colors.text}
      netOf={netOf}
      wireAppearance={(wire, path) => {
        const isBroken = brokenWireIdsForRender.has(wire.id);
        const wireCurrent = isBroken ? 0 : Math.abs(snapshot.wireCurrents?.[wire.id] ?? 0);
        const isCurrentFlowing = !isBroken && wireCurrent >= 1e-7 && snapshot.wirePhases?.[wire.id] !== undefined;
        const phase = isBroken ? 0 : (snapshot.wirePhases?.[wire.id] ?? 0);
        return {
          flowDots: showElectrons && isCurrentFlowing ? getDotsOnPath(path, Math.max(1, Math.round(pathLength(path) / 36)), phase) : [],
        };
      }}
      componentOpacity={componentCanvasOpacity}
      terminalFill={(component, terminalId) => (Math.abs(snapshot.terminalVoltages[terminalKey(component.id, terminalId)] ?? 0) > 0.05 ? colors.powered : undefined)}
      renderComponent={(component, { selected, symbolTransform }) => renderCanvasComponent(component, selected, symbolTransform)}
      renderComponentOverlay={(component, { selected }) => renderDependentSourceLink(component, selected)}
      canvasDefs={<>
        {activeMeshTrace?.meshCycles?.map((cycle) => <marker key={cycle.index} id={`mesh-arrow-${cycle.index}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M 0,1 L 6,3.5 L 0,6 Z" fill={MESH_LOOP_COLORS[cycle.index % MESH_LOOP_COLORS.length]} /></marker>)}
      </>}
      canvasUnderlay={activeMeshTrace?.meshCycles?.map((cycle) => <MeshLoopOverlay key={`mesh-cycle-${cycle.index}`} cycle={cycle} tabDUiRefinement={tabDUiRefinement} components={components} scale={visualSymbolScale} wires={wires} />)}
      labelsLayer={components.map(component => {
        /* Component labels world overlay (0° upright orientation, never upside-down / rotated). */
        if (component.type === 'dmm') return null; // Completely hide DMM canvas label
        const definition = getDef(component.type);
        if (!definition) return null;

        const hideLabel = component.props._hideLabel === true;
        const hideValue = component.props._hideValue === true;

        const anchors = componentLabelAnchors(definition, component, visualSymbolScale);
        const isHorizontal = anchors.isHorizontal;
        const refTextAnchor = anchors.refTextAnchor ?? (isHorizontal ? 'middle' : 'start');
        const valTextAnchor = anchors.valTextAnchor ?? (isHorizontal ? 'middle' : 'start');
        const refX = component.x + anchors.reference[0];
        const refY = component.y + anchors.reference[1];
        const valX = component.x + anchors.value[0];
        const valY = component.y + anchors.value[1];
        const isGround = component.type === 'ground' || /^GND\d*$/i.test(component.label);
        const refFill = darkPreview ? '#f1f5f9' : '#1e293b';
        const valFill = darkPreview ? '#94a3b8' : '#64748b';

        // During Superposition, deactivated sources (short/open) hide their labels completely
        if (superpositionRole(component).dimmed) return null;
        const labelOpacity = isTheveninActive && theveninTargetId === component.id ? 0.45 : 1;
        const isDependentSource = component.type === 'vcvs' || component.type === 'vccs' || component.type === 'ccvs' || component.type === 'cccs';

        return (
          <g key={`labels-${component.id}`} opacity={labelOpacity} style={{ transition: 'opacity 0.25s ease' }}>
            {!hideLabel && (
              <text
                x={refX}
                y={refY}
                textAnchor={refTextAnchor}
                dominantBaseline="central"
                fontFamily="'KaTeX_Main', 'KaTeX_Math', serif"
                style={{
                  fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif",
                  fontSize: 13,
                  fontWeight: 400,
                  fill: refFill,
                  paintOrder: 'stroke fill',
                  stroke: colors.canvas,
                  strokeWidth: 3.5,
                  strokeLinejoin: 'round',
                  strokeLinecap: 'round',
                }}
              >
                {renderComponentCanvasLabel(component.label, isGround)}
              </text>
            )}

            {!hideValue && isDependentSource && (() => {
              const targetRef = String(component.props.targetId || component.props.controlSourceId || '');
              const targetComp = components.find(c => c.id === targetRef || c.label === targetRef);
              const targetLabel = targetComp ? targetComp.label : '';
              const gain = Number(component.props.gain ?? 1);
              const mathStr = formatDependentSourceMath(component.type, gain, targetLabel);
              return (
                <g>
                  {/* High-fidelity KaTeX HTML/MathML rendering on live canvas */}
                  <foreignObject
                    x={valTextAnchor === 'end' ? valX - 90 : valTextAnchor === 'middle' ? valX - 45 : valX}
                    y={valY - 14}
                    width={90}
                    height={28}
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: valTextAnchor === 'end' ? 'flex-end' : valTextAnchor === 'middle' ? 'center' : 'flex-start',
                        width: '100%',
                        height: '100%',
                        color: valFill,
                        fontSize: 11,
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                        filter: `drop-shadow(0 0 2px ${colors.canvas}) drop-shadow(0 0 2px ${colors.canvas})`,
                      }}
                    >
                      <V3Math math={mathStr} />
                    </div>
                  </foreignObject>
                  {/* Fallback SVG text with KaTeX fonts for pure SVG export / print */}
                  <text
                    className="v3-export-math-fallback"
                    x={valX}
                    y={valY}
                    textAnchor={valTextAnchor}
                    dominantBaseline="central"
                    fontFamily="'KaTeX_Main', 'KaTeX_Math', serif"
                    data-math={mathStr}
                    style={{
                      display: 'none',
                      fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif",
                      fontSize: 11,
                      fontWeight: 400,
                      fill: valFill,
                      paintOrder: 'stroke fill',
                      stroke: colors.canvas,
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                      strokeLinecap: 'round',
                    }}
                  >
                    {renderDependentSourceValueTspans(component.type, gain, targetLabel)}
                  </text>
                </g>
              );
            })()}

            {!hideValue && !isDependentSource && (() => {
              const value = componentDisplayValue(definition, component);
              if (!value) return null;
              return (
                <text
                  x={valX}
                  y={valY}
                  textAnchor={valTextAnchor}
                  dominantBaseline="central"
                  fontFamily="'KaTeX_Main', 'KaTeX_Math', serif"
                  style={{
                    fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif",
                    fontSize: 11,
                    fontWeight: 400,
                    fill: valFill,
                    paintOrder: 'stroke fill',
                    stroke: colors.canvas,
                    strokeWidth: 3,
                    strokeLinejoin: 'round',
                    strokeLinecap: 'round',
                  }}
                >
                  {renderFormattedValueTspans(value)}
                </text>
              );
            })()}
          </g>
        );
      })}
      canvasOverlay={<>
        {/* V_i labels deliberately render last: readable above grid, wires, symbols, and workspace text. Strictly active in Nodal mode. */}
        {activeAnalysisMethod === 'nodal' && activeNodalTrace?.nodalNodes?.filter((node) => node.centroid[0] !== 0 || node.centroid[1] !== 0).map((node) => <NodalNodeOverlay key={`nodal-node-${node.node}`} node={node} colors={colors} />)}

        {/* Thévenin / Norton / Max Power Terminal Pair A–B Overlays */}
        {isTheveninActive && theveninTerminals && (
          <g className="v3-thevenin-terminals-layer" pointerEvents="none">
            <TheveninTerminalOverlay position={theveninTerminals.posA} label="A" colors={colors} darkPreview={darkPreview} />
            <TheveninTerminalOverlay position={theveninTerminals.posB} label="B" colors={colors} darkPreview={darkPreview} />
          </g>
        )}

        {/* Superposition Target Load Terminal Pair A–B Overlays */}
        {isSuperpositionActive && superpositionTerminals && (
          <g className="v3-superposition-terminals-layer" pointerEvents="none">
            <TheveninTerminalOverlay position={superpositionTerminals.posA} label="A" colors={colors} darkPreview={darkPreview} />
            <TheveninTerminalOverlay position={superpositionTerminals.posB} label="B" colors={colors} darkPreview={darkPreview} />
          </g>
        )}
      </>}
      toolbarRow2={<>
        <ToolbarButton colors={colors} icon={<Download size={14} />} label={t('simulators:toolbar.export')} title={t('toolbar.exportNad', 'Export circuit as NAD netlist')} onClick={exportNad} />
        <ToolbarButton colors={colors} icon={<Upload size={14} />} label={t('simulators:toolbar.import')} title={t('toolbar.importNad', 'Import circuit from NAD netlist')} onClick={() => nadInputRef.current?.click()} />
        <input ref={nadInputRef} type="file" accept=".nad,application/x-mae-nad+json,application/json" onChange={importNad} style={{ display: 'none' }} />
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<ImageIcon size={14} />} label={t('simulators:toolbar.saveImage')} title={t('toolbar.saveImageTooltip', 'Save circuit as image (PNG or SVG)')} onClick={handleOpenSaveImage} />
        <ToolbarButton colors={colors} icon={<Share2 size={14} />} label={t('simulators:toolbar.shareProject')} title={t('toolbar.shareProjectTooltip', 'Share circuit via Web Share API or deep link')} onClick={handleShareProject} />
        <ToolbarDivider colors={colors} />
        {/* Examples button hidden for final launch UI polish */}
        {/* <ToolbarButton colors={colors} icon={<Library size={14} />} label={t('toolbar.examples', 'Examples')} title={t('toolbar.browseLibrary', 'Browse the Interactive Examples Library')} onClick={() => setExamplesModalOpen(true)} /> */}
        <button
          type="button"
          onClick={() => { hasStartedSimulation.current = true; setSimulationRunning(value => !value); }}
          title={simulationRunning ? t('simulators:toolbar.pauseSimTooltip', 'Pause simulation') : t('simulators:toolbar.runSimTooltip', 'Run simulation')}
          className={`h-8 inline-flex items-center justify-center gap-1.5 px-3.5 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 ${
            !simulationRunning && hasStartedSimulation.current
              ? "brand-pill-active-rev"
              : "btn-active-brand"
          }`}
        >
          {simulationRunning ? <Pause size={14} /> : <Play size={14} />}
          <span>{simulationRunning ? t('simulators:toolbar.pause', 'Pause') : t('simulators:toolbar.run', 'Run')}</span>
        </button>
        <ToolbarButton colors={colors} icon={<Zap size={14} />} title={t('simulators:circuit.showHideElectrons')} onClick={() => setShowElectrons(v => { const next = !v; try { localStorage.setItem('mae-show-electrons', String(next)); } catch { } return next; })} active={showElectrons} />
        <ToolbarButton colors={colors} icon={<RotateCcw size={14} />} title={t('simulators:circuit.resetSim')} onClick={resetSimulation} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 65, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <V3Math math={`${snapshot.time.toFixed(3)}\\,\\mathrm{s}`} />
        </span>
        <ToolbarDivider colors={colors} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StudioSlider
            aria-label={t('simulators:circuit.simulationSpeed')}
            min={0.25}
            max={4}
            step={0.25}
            value={simulationSpeed}
            onChange={val => setSimulationSpeed(val)}
            hideHeader
            className="w-24"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center' }}>
            <V3Math math={`${simulationSpeed.toFixed(2)}\\times`} />
          </span>
        </div>
      </>}
      canvasTitle={t('simulators:shell.interactiveCanvas')}
      emptyHint={t('simulators:circuit.dragDropHint')}
      simulationRunning={simulationRunning}
      canvasStatusExtra={<>
        {spiceStatus.kind === 'running' && <span style={{ fontWeight: 750 }}>{t('simulators:circuit.spiceAccuracyPass')}</span>}
        {spiceStatus.kind === 'ready' && <span style={{ color: colors.accent, fontWeight: 750 }}>{t('simulators:circuit.spiceVerified')}</span>}
        {spiceStatus.kind === 'unsupported' && <span title={spiceStatus.reason} style={{ fontWeight: 750 }}>{t('simulators:circuit.spiceUnavailable')}</span>}
        {!snapshot.converged && <span style={{ color: colors.danger, fontWeight: 750 }}>{t('simulators:circuit.checkWarnings')}</span>}
      </>}
      analysisTitle={t('simulators:circuit.academicWorkspace')}
      analysisContent={<AnalysisBox elements={dcMna.elements} geometry={meshGeometry} nodalNodes={nodalGeometry} colors={colors} standalone onTraceChange={handleAnalysisTrace} components={components} />}
      inspectorTop={<>
      <OscilloscopeTracePanel colors={colors} scopes={components.filter(c => c.type === 'oscilloscope')} instrumentReadings={effectiveSnapshot.instrumentReadings} displaySettings={oscilloscopeDisplaySettings} />
      <PersistentDmmPanel colors={colors} dmms={components.filter(c => c.type === 'dmm')} snapshot={effectiveSnapshot} darkPreview={darkPreview} />
      </>}
      inspectorContent={selectedComponent ? (
        <ComponentInspector colors={colors} component={selectedComponent} definition={getDef(selectedComponent.type)!} allComponents={components} linkedCoils={linkedCoils} reading={effectiveSnapshot.instrumentReadings[selectedComponent.id]} snapshot={effectiveSnapshot} tabDUiRefinement={tabDUiRefinement} oscilloscopeDisplaySettings={oscilloscopeDisplaySettings} onOscilloscopeDisplaySettingsChange={setOscilloscopeDisplaySettings} onLabelChange={label => canvas.updateComponent(selectedComponent.id, { label })} onPropertyChange={updateComponentProperty} onPropertiesChange={updateComponentProperties} onDelete={canvas.clipboard.removeSelection} onReplace={replaceSelectedComponent} />
      ) : selectedWire ? (
        <WireInspector colors={colors} wire={selectedWire} tabDUiRefinement={tabDUiRefinement} onRouting={canvas.setWireRouting} onAddCorner={addSelectedWireCorner} onNudge={nudgeSelectedWire} onDelete={canvas.clipboard.removeSelection} />
      ) : selectedText ? (
        <TextInspector colors={colors} text={selectedText} onUpdate={canvas.updateText} onMove={canvas.moveSelected} onDelete={canvas.clipboard.removeSelection} />
      ) : null}
      inspectorFooter={<>
      <div className="p-5 border-t border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]">
        <h3 className="text-sm font-bold tracking-wider text-slate-900 dark:text-white mb-3 uppercase flex items-center gap-2">
          <CircuitBoard size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
          {t('simulators:circuit.electricalCircuitLab')}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {t('simulators:circuit.circuitLabDesc')}
        </p>
      </div>
      </>}
    >
    {(() => {
      const handleItemDownloaded = (item: ExportItem) => {
        const type = item.type ?? (item.id.startsWith('circuit') ? 'circuit' : item.id.startsWith('scope') ? 'oscilloscope' : 'multimeter');
        exportCounters.current[type] += 1;
      };

      const handleAllDownloaded = (downloadedItems: ExportItem[]) => {
        const seen = new Set<'circuit' | 'oscilloscope' | 'multimeter'>();
        downloadedItems.forEach(it => {
          const type = it.type ?? (it.id.startsWith('circuit') ? 'circuit' : it.id.startsWith('scope') ? 'oscilloscope' : 'multimeter');
          seen.add(type);
        });
        seen.forEach(type => {
          exportCounters.current[type] += 1;
        });
      };

      return (
        <>
          <ExportPreviewModal
            isOpen={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            items={exportItems}
            format={exportFormat}
            onItemDownloaded={handleItemDownloaded}
            onAllDownloaded={handleAllDownloaded}
          />
          <ShareProjectModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            shareUrl={shareUrl}
            componentCount={components.length}
            wireCount={wires.length}
            previewUrl={sharePreviewUrl}
          />
        </>
      );
    })()}
    <LoadExampleModal
      isOpen={examplesModalOpen}
      onClose={() => setExamplesModalOpen(false)}
      onLoad={handleLoadExample}
    />
    </BaseSchematicCanvas>
  );
}

/** Keeps the historical V3 router contract unchanged for Tab B. */
export default function Home() {
  return <V3Home />;
}

interface Palette { background: string; canvas: string; panel: string; panelAlt: string; line: string; text: string; muted: string; subtle: string; primary: string; accent: string; danger: string; selection: string; grid: string; wire: string; powered: string; input: string; shadow: string; }

function ToolbarButton({ colors, icon, label, title, onClick, active, disabled, rounded }: { colors: Palette; icon?: React.ReactNode; label?: string; title: string; onClick: () => void; active?: boolean; disabled?: boolean; rounded?: boolean }) {
  const isActive = Boolean(active) && !disabled;
  return <button title={title} onClick={onClick} disabled={disabled} className={isActive ? "btn-active-brand" : ""} style={{ border: isActive ? 'none' : `1px solid ${colors.line}`, background: isActive ? undefined : colors.panelAlt, color: isActive ? '#ffffff' : disabled ? colors.subtle : colors.muted, borderRadius: 9999, padding: '6px 14px', minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, boxShadow: isActive ? '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' : 'none', flexShrink: 0, whiteSpace: 'nowrap', transition: 'all 0.2s ease-in-out' }}>{icon}{label}</button>;
}

function ToolbarDivider({ colors }: { colors: Palette }) { return <span style={{ width: 1, height: 20, background: colors.line, margin: '0 1px', flexShrink: 0 }} />; }

function InspectorHeader({ colors, title, subtitle }: { colors: Palette; title: React.ReactNode; subtitle: string }) {
  return <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${colors.line}` }}><div><div className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</div><div className="text-slate-600 dark:text-slate-400" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25 }}>{subtitle}</div></div></div>;
}

function InspectorButton({ colors, children, onClick, danger, active, disabled }: { colors: Palette; children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean }) {
  const tone = danger ? colors.danger : active ? colors.primary : colors.muted;
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, minHeight: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: `1px solid ${tone}55`, borderRadius: 8, background: active || danger ? `${tone}0d` : colors.panelAlt, color: tone, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, fontSize: 10, fontWeight: 700 }}>{children}</button>;
}

function InspectorSection({ colors, label, children }: { colors: Palette; label: string; children: React.ReactNode }) { return <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}><div className="mae-panel-section-header" style={{ marginBottom: 8 }}>{label}</div>{children}</section>; }

function PropertyRow({ colors, label, unit, children }: { colors: Palette; label: string; unit?: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gridTemplateColumns: '1fr 156px', gap: 8, alignItems: 'center', marginBottom: 8 }}><span className="mae-panel-field-label" style={{ lineHeight: 1.25 }}><ElectricalLabel label={label} unit={unit} /></span>{children}</label>; }

/**
 * "Replace Component" control for the Properties panel: a button that opens a small
 * category-grouped catalog picker (the same catalog the main sidebar draws from) so a student can
 * swap the selected part in place instead of deleting it and dragging a new one from scratch.
 */
function ReplaceComponentControl({ colors, currentType, tabDUiRefinement, onReplace }: { colors: Palette; currentType: string; tabDUiRefinement: boolean; onReplace: (newType: string) => void }) {
  const { t } = useTranslation('simulators');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const categories = useMemo(() => {
    if (!open) return {};
    const trimmedQuery = query.trim().toLowerCase();
    return CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
      if (category === 'Classic Control') return all;
      const catKey = category.toLowerCase().replace(/[\s-]/g, '');
      const translatedCategory = t(`simulators:circuit.${catKey}`, category);
      let items = getComponentsByCategory(category).filter(item => !item.hidden);
      if (tabDUiRefinement && category === 'Passive') {
        items = [...items, ...['star-resistor-pack', 'delta-resistor-pack'].map(getDef).filter((item): item is ComponentDef => Boolean(item))];
      }
      if (tabDUiRefinement && category === 'Controlled Sources') {
        items = items.filter(item => !['star-resistor-pack', 'delta-resistor-pack'].includes(item.id));
      }
      if (tabDUiRefinement && category === 'Diodes') {
        items = items.filter(item => !['diode-ideal', 'diode-silicon', 'diode-germanium', 'diode-gaas'].includes(item.id));
      }
      if (tabDUiRefinement) items = filterTabDCatalog(items);
      if (!tabDUiRefinement && category === 'Diodes') {
        items = items.filter(item => item.id !== 'diode');
      }
      items = items.filter(item => !trimmedQuery || item.name.toLowerCase().includes(trimmedQuery) || item.description.toLowerCase().includes(trimmedQuery));
      items = items.filter(item => !trimmedQuery || item.name.toLowerCase().includes(trimmedQuery) || item.description.toLowerCase().includes(trimmedQuery));
      if (items.length) {
        all[translatedCategory] = items;
      }
      return all;
    }, {});
  }, [open, query, tabDUiRefinement, t]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(value => !value)}
        title="Replace selected component with another from library"
        style={{
          width: '100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 8,
          padding: '4px 12px',
          height: 32,
          boxSizing: 'border-box',
          borderRadius: 12,
          border: `1px solid ${colors.line}`,
          background: colors.input,
          color: colors.text,
          fontSize: 13,
          fontFamily: 'inherit',
          fontWeight: 500,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = colors.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = colors.line; }}
      >
        <RefreshCw size={13} style={{ flexShrink: 0, color: colors.muted }} />
        <span>Replace</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', right: 0, marginTop: 6, width: 280, maxHeight: 360, overflowY: 'auto', background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.35)', padding: 10 }}>
          <input
            autoFocus
            placeholder="Search library components"
            value={query}
            onChange={event => setQuery(event.target.value)}
            style={{ ...inputStyle(colors), width: '100%', marginBottom: 6 }}
          />
          <div style={{ marginTop: 4 }}>
            {Object.entries(categories).map(([category, items]) => (
              <div key={category} style={{ marginBottom: 8 }}>
                <div className="mae-panel-section-header" style={{ padding: '4px 2px', fontSize: 10, opacity: 0.75 }}>{category}</div>
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { onReplace(item.id); setOpen(false); setQuery(''); }}
                    style={{ width: '100%', textAlign: 'left', border: 'none', background: item.id === currentType ? colors.panelAlt : 'transparent', color: colors.text, cursor: 'pointer', borderRadius: 6, padding: '6px 8px', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s ease' }}
                    onMouseEnter={event => { event.currentTarget.style.background = colors.panelAlt; }}
                    onMouseLeave={event => { event.currentTarget.style.background = item.id === currentType ? colors.panelAlt : 'transparent'; }}
                  >
                    <ElectricalLabel label={item.name} />
                    {item.id === currentType && <span style={{ fontSize: 10, color: colors.accent, fontWeight: 700 }}>Current</span>}
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(categories).length === 0 && (
              <div style={{ padding: 10, fontSize: 11, color: colors.subtle, textAlign: 'center' }}>No components match your search</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentInspector({ colors, component, definition, allComponents, linkedCoils, reading, snapshot, tabDUiRefinement, oscilloscopeDisplaySettings, onOscilloscopeDisplaySettingsChange, onLabelChange, onPropertyChange, onPropertiesChange, onDelete, onReplace }: { colors: Palette; component: CircuitComponent; definition: ComponentDef; allComponents: CircuitComponent[]; linkedCoils: CircuitComponent[]; reading?: InstrumentReading; snapshot: SimulationSnapshot; tabDUiRefinement: boolean; oscilloscopeDisplaySettings: OscilloscopeDisplaySettings; onOscilloscopeDisplaySettingsChange: (next: Partial<OscilloscopeDisplaySettings>) => void; onLabelChange: (value: string) => void; onPropertyChange: (key: string, value: unknown) => void; onPropertiesChange: (updates: Record<string, unknown>) => void; onDelete: () => void; onReplace: (newType: string) => void }) {
  // Check if the component actually has a numeric value to display (oscilloscope has its own dedicated panel and no floating/inspector value)
  const hasValue = component.type !== 'oscilloscope' && Object.values(definition.properties).some(p => p.type === 'number' && p.unit);

  return <div style={{ overflowY: 'auto', minHeight: 0 }}>
    <InspectorHeader colors={colors} title={<span className="text-slate-800 dark:text-slate-100" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}><span style={{ fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif", fontSize: 24, fontWeight: 700 }}><V3Math math={componentLabelToLatex(component.type === 'ground' ? 'GND' : component.label)} /></span><span className="text-slate-700 dark:text-slate-300 font-semibold text-lg" style={{ letterSpacing: 0, textTransform: 'none', fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif" }}><ElectricalLabel label={definition.name} /></span></span>} subtitle={definition.description} />
    {component.state?.isBurned && (
      <div
        role="alert"
        style={{
          margin: '0 12px 10px',
          padding: '8px 10px',
          borderRadius: 6,
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid #EF4444',
          color: '#EF4444',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        COMPONENT DESTROYED - Exceeded maximum ratings
      </div>
    )}
    <InspectorSection colors={colors} label="Instance label">
      <PropertyRow colors={colors} label="Reference">
        <input value={component.type === 'ground' ? 'GND' : component.label} disabled={component.type === 'ground'} onChange={event => onLabelChange(component.type === 'ground' ? 'GND' : event.target.value)} style={mathReferenceInputStyle(colors)} />
      </PropertyRow>

      <PropertyRow colors={colors} label="Component">
        <ReplaceComponentControl colors={colors} currentType={component.type} tabDUiRefinement={tabDUiRefinement} onReplace={onReplace} />
      </PropertyRow>

      {/* NEW: Label Visibility Toggle */}
      <PropertyRow colors={colors} label="Show Label">
        <select value={component.props._hideLabel ? 'hide' : 'show'} onChange={event => onPropertyChange('_hideLabel', event.target.value === 'hide')} style={inputStyle(colors)}>
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
      </PropertyRow>

      {/* NEW: Value Visibility Toggle (only if applicable) */}
      {hasValue && (
        <PropertyRow colors={colors} label="Show Value">
          <select value={component.props._hideValue ? 'hide' : 'show'} onChange={event => onPropertyChange('_hideValue', event.target.value === 'hide')} style={inputStyle(colors)}>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </PropertyRow>
      )}

      <div className="mae-panel-meta" style={{ marginTop: 8 }}>Auto reference prefix: {componentPrefix(component.type)}. Auxiliary contacts link to this reference.</div>
    </InspectorSection>
    {component.type !== 'oscilloscope' && <InspectorSection colors={colors} label="Electrical properties">
      {Object.entries(definition.properties).map(([key, property]) => {
        // Derived properties (an LED's forwardVoltage, set by its colour) are simulated but not editable.
        if (property.hidden) return null;
        // An ideal op-amp's macromodel has no dominant pole, no slew limit and no parasitics, so
        // offering those fields there would invite edits the simulation cannot honour.
        if (component.type === 'opamp' && String(component.props.model ?? 'ideal') !== 'realistic'
          && ['gbw', 'slewRate', 'rin', 'rout', 'railMargin'].includes(key)) return null;
        if (component.type === 'impedance' || component.type === 'ac-voltage' || component.type === 'ac-current') {
          const isImpedance = component.type === 'impedance';
          const format = String(component.props.format ?? (isImpedance ? 'rectangular' : 'polar'));

          if (format === 'rectangular' && ['mag', 'ang', 'amplitude', 'phase', 'angleUnit'].includes(key)) return null;
          if (format === 'polar' && ['r', 'x', 'real', 'imag', 'angleUnit'].includes(key)) return null;

          if (format === 'polar' && (key === 'ang' || key === 'phase')) {
            const defaultAng = isImpedance ? 53.13 : 0;
            return (
              <PropertyRow key={key} colors={colors} label={property.label ?? key}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 68px', gap: 5 }}>
                  <input type="number" step="any" value={numeric(component.props[key], defaultAng)} onChange={event => onPropertyChange(key, numeric(event.target.value, defaultAng))} style={mathNumericInputStyle(colors)} />
                  <select value={String(component.props.angleUnit ?? 'degree')} onChange={event => onPropertyChange('angleUnit', event.target.value)} style={mathSelectStyle(colors)}>
                    <option value="degree">deg</option>
                    <option value="radian">rad</option>
                  </select>
                </div>
              </PropertyRow>
            );
          }
        }
        if (key === 'wiper') {
          const rawVal = numeric(component.props[key], 0.5);
          const normalized = Math.max(0, Math.min(1, rawVal > 1 ? rawVal / 100 : rawVal));
          const percentVal = Math.round(normalized * 100);
          return (
            <PropertyRow key={key} colors={colors} label={property.label ?? 'Wiper'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <StudioSlider
                  aria-label="Wiper position percentage"
                  min={0}
                  max={100}
                  step={1}
                  value={percentVal}
                  onChange={val => onPropertyChange('wiper', val / 100)}
                  hideHeader
                  className="w-full"
                />
                <span
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}
                >
                  <V3Math math={`${percentVal}\\%`} />
                </span>
              </div>
            </PropertyRow>
          );
        }
        if (key === 'linkedTo') return <PropertyRow key={key} colors={colors} label={property.label ?? key}><select value={String(component.props[key] ?? '')} onChange={event => onPropertyChange(key, event.target.value)} style={inputStyle(colors)}><option value="">Select coil reference</option>{linkedCoils.filter(coil => coil.id !== component.id).map(coil => <option key={coil.id} value={coil.label}>{coil.label} · {getDef(coil.type)?.name}</option>)}</select></PropertyRow>;
        if (key === 'targetId' || key === 'controlSourceId') {
          const selectedTarget = String(component.props.targetId ?? component.props.controlSourceId ?? '');
          const eligibleTargets = allComponents.filter(c => c.id !== component.id && c.type !== 'ground');
          return (
            <PropertyRow key={key} colors={colors} label={property.label ?? 'Target Component'}>
              <select
                value={selectedTarget}
                onChange={event => {
                  onPropertyChange('targetId', event.target.value);
                  if (component.props.controlSourceId !== undefined) {
                    onPropertyChange('controlSourceId', event.target.value);
                  }
                }}
                style={inputStyle(colors)}
              >
                <option value="">Select target component</option>
                {eligibleTargets.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {getDef(c.type)?.name ?? c.type}
                  </option>
                ))}
              </select>
            </PropertyRow>
          );
        }
        // three-phase-source/rail's lineVoltage means whichever quantity voltageReference names
        // (see computeThreePhaseVoltages) — the label follows the sibling property's live value so
        // the entered number is never mislabelled as line voltage while it's actually phase voltage.
        const isThreePhase = component.type === 'three-phase-source' || component.type === 'three-phase-rail';
        const label = key === 'lineVoltage' && isThreePhase && component.props.voltageReference === 'Phase (L-N)'
          ? 'Phase Voltage (L-N) VRMS'
          : property.label ?? key;
        const value = component.props[key] ?? property.value;
        const prefixable = tabDUiRefinement && property.type === 'number' && PREFIXABLE_UNITS.has(property.unit ?? '');
        return prefixable
          ? <PrefixedPropertyEditorField key={key} colors={colors} propertyKey={key} label={label} definition={property} value={value} prefix={String(component.props[prefixStateKey(key)] ?? engineeringPrefixFor(numeric(value, numeric(property.value))))} onChange={nextValue => onPropertyChange(key, nextValue)} onPrefixChange={nextPrefix => onPropertyChange(prefixStateKey(key), nextPrefix)} />
          : <PropertyEditorField key={key} colors={colors} label={label} definition={property} value={value} onChange={nextValue => onPropertyChange(key, nextValue)} />;
      })}
    </InspectorSection>}
    {component.type === 'oscilloscope' && <OscilloscopeComponentPanel colors={colors} component={component} readings={snapshot.instrumentReadings} displaySettings={oscilloscopeDisplaySettings} onDisplaySettingsChange={onOscilloscopeDisplaySettingsChange} onPropertyChange={onPropertyChange} onPropertiesChange={onPropertiesChange} />}

  </div>;
}

function PropertyEditorField({ colors, label, definition, value, onChange }: { colors: Palette; label: string; definition: PropertyDef; value: unknown; onChange: (value: unknown) => void }) {
  if (definition.type === 'boolean') return <PropertyRow colors={colors} label={label}><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} style={{ justifySelf: 'start', accentColor: colors.primary }} /></PropertyRow>;
  if (definition.type === 'select') return <PropertyRow colors={colors} label={label} unit={definition.unit}><select value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)}>{definition.options?.map(option => <option key={option} value={option}>{definition.optionLabels?.[option] ?? option}</option>)}</select></PropertyRow>;
  if (definition.type === 'color') return <PropertyRow colors={colors} label={label}><input type="color" value={String(value)} onChange={event => onChange(event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} /></PropertyRow>;
  if (definition.type === 'text') return <PropertyRow colors={colors} label={label}><input value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)} /></PropertyRow>;
  return <PropertyRow colors={colors} label={label} unit={definition.unit}><input type="number" min={definition.min} max={definition.max} step={definition.step ?? 'any'} value={numeric(value)} onChange={event => onChange(numeric(event.target.value, numeric(definition.value)))} style={mathNumericInputStyle(colors)} /></PropertyRow>;
}

function PrefixedPropertyEditorField({ colors, propertyKey, label, definition, value, prefix, onChange, onPrefixChange }: { colors: Palette; propertyKey: string; label: string; definition: PropertyDef; value: unknown; prefix: string; onChange: (value: number) => void; onPrefixChange: (prefix: string) => void }) {
  const factor = engineeringFactor(prefix);
  const normalized = numeric(value, numeric(definition.value));
  const displayValue = Number((normalized / factor).toPrecision(12));
  const selectPrefix = (nextPrefix: string) => {
    const visibleValue = normalized / factor;
    onPrefixChange(nextPrefix);
    onChange(visibleValue * engineeringFactor(nextPrefix));
  };
  return <PropertyRow colors={colors} label={label} unit={definition.unit}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 68px', gap: 5 }}><input aria-label={`${propertyKey} numeric value`} type="number" step="any" value={displayValue} onChange={event => onChange(numeric(event.target.value, displayValue) * factor)} style={mathNumericInputStyle(colors)} /><select aria-label={`${propertyKey} engineering prefix`} value={prefix} onChange={event => selectPrefix(event.target.value)} style={mathSelectStyle(colors)} title={`Engineering prefix for ${definition.unit ?? ''}`}>{ENGINEERING_PREFIXES.map(item => <option key={item.key || 'base'} value={item.key}>{item.symbol || '—'}{definition.unit}</option>)}</select></div></PropertyRow>;
}

function WireInspector({ colors, wire, tabDUiRefinement, onRouting, onAddCorner, onNudge, onDelete }: { colors: Palette; wire: CircuitWire; tabDUiRefinement: boolean; onRouting: (routing: CircuitWire['routing']) => void; onAddCorner: () => void; onNudge: (amount: number) => void; onDelete: () => void }) {
  return <div style={{ overflowY: 'auto' }}><InspectorHeader colors={colors} title="Wire path" subtitle="Ideal conductor connection between terminals." /><InspectorSection colors={colors} label="Electrical meaning"><p style={{ color: colors.muted, fontSize: 10, lineHeight: 1.45, margin: 0 }}>Wire geometry is editable for documentation and layout. The ideal wire remains a zero-ohm connection in the solver; electron markers only appear when solved branch current exists.</p></InspectorSection></div>;
}

function TextInspector({ colors, text, onUpdate, onMove, onDelete }: { colors: Palette; text: WorkspaceText; onUpdate: (update: Partial<WorkspaceText>) => void; onMove: (dx: number, dy: number) => void; onDelete: () => void }) {
  return <div style={{ overflowY: 'auto' }}><InspectorHeader colors={colors} title="Workspace text" subtitle="Editable annotation that can be placed anywhere in the schematic." /><InspectorSection colors={colors} label="Text properties"><PropertyRow colors={colors} label="Content"><input value={text.text} onChange={event => onUpdate({ text: event.target.value })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Size"><input type="number" min={8} max={72} value={text.fontSize} onChange={event => onUpdate({ fontSize: numeric(event.target.value, 16) })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Color"><input type="color" value={text.color} onChange={event => onUpdate({ color: event.target.value })} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} /></PropertyRow><PropertyRow colors={colors} label="X"><input type="number" value={text.x} onChange={event => onUpdate({ x: numeric(event.target.value, text.x) })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Y"><input type="number" value={text.y} onChange={event => onUpdate({ y: numeric(event.target.value, text.y) })} style={inputStyle(colors)} /></PropertyRow></InspectorSection><InspectorSection colors={colors} label="Move"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}><InspectorButton colors={colors} onClick={() => onMove(0, -20)}><ArrowUp size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(-20, 0)}><ArrowLeft size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(20, 0)}><ArrowRight size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(0, 20)}><ArrowDown size={13} /></InspectorButton></div></InspectorSection></div>;
}

function PersistentDmmPanel({ colors, dmms, snapshot, darkPreview }: { colors: Palette; dmms: CircuitComponent[]; snapshot: SimulationSnapshot; darkPreview?: boolean }) {
  const audioRef = useRef<{ ctx: AudioContext, osc: OscillatorNode, gain: GainNode } | null>(null);

  useEffect(() => {
    const anyShorted = dmms.some(dmm => snapshot.instrumentReadings[dmm.id]?.continuity === true);
    if (anyShorted && !audioRef.current) {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 2700; // Realistic multimeter beep frequency
        gain.gain.value = 0.1; // Moderate volume
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioRef.current = { ctx, osc, gain };
      } catch (e) {
        // Suppress audio context strict auto-play policy warnings
      }
    } else if (!anyShorted && audioRef.current) {
      try {
        audioRef.current.osc.stop();
        audioRef.current.ctx.close();
      } catch (e) { }
      audioRef.current = null;
    }
  }, [dmms, snapshot.instrumentReadings]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.osc.stop();
          audioRef.current.ctx.close();
        } catch (e) { }
      }
    };
  }, []);

  if (dmms.length === 0) return null;
  return (
    <div style={{ borderBottom: `1px solid ${colors.line}`, background: `${colors.line}22` }}>
      <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Live Multimeters</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 10 }}>
        {dmms.map(dmm => {
          const reading = snapshot.instrumentReadings[dmm.id];
          const isShorted = reading?.continuity === true;
          return (
            <div key={dmm.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{dmm.label}</div>
              <div style={{
                padding: '10px 12px',
                background: darkPreview ? '#0f2744' : '#e0f2fe',
                border: `1px solid ${darkPreview ? '#1e4976' : '#7dd3fc'}`,
                borderRadius: 8,
                textAlign: 'right',
                color: darkPreview ? '#38bdf8' : '#0284c7',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                boxShadow: darkPreview ? 'inset 0 1px 3px rgba(0,0,0,0.4)' : 'inset 0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.05em' }}>
                  {reading?.status === 'open' || ((reading?.unit === 'Ω' || reading?.unit === 'Ohm') && (reading?.value === undefined || !Number.isFinite(reading.value) || Math.abs(reading.value) >= 1e7))
                    ? 'O.L'
                    : isShorted
                      ? 'SHORTED'
                      : reading
                        ? <EngineeringMath value={reading.value} unit={reading.unit} />
                        : '—'}
                </div>
                <div style={{ marginTop: 4, fontSize: 10, color: darkPreview ? '#7dd3fc' : '#0369a1', fontWeight: 600 }}>{reading?.status === 'ready' ? (isShorted ? 'Continuity detected' : 'Probe-linked measurement') : reading?.status === 'open' ? 'Open / not fully connected' : 'Connect HI and COM probes'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function InstrumentText({ reading, x, y, color }: { reading?: InstrumentReading; x: number; y: number; color: string }) {
  const isOhmOpen = reading && (reading.unit === 'Ω' || reading.unit === 'Ohm') && (!Number.isFinite(reading.value) || Math.abs(reading.value) >= 1e7);
  const label = (reading?.status === 'open' || isOhmOpen) ? 'O.L' : reading?.status === 'ready' ? formatEngineering(reading.value, reading.unit, 2) : '—';
  return <text x={x} y={y} textAnchor="middle" fontFamily="monospace" fontSize={9} fontWeight={400} fill={color} pointerEvents="none">{label}</text>;
}


function ElectricalLabel({ label, unit }: { label: string; unit?: string }) {
  const symbol: Record<string, string> = {
    'Voltage': 'V', 'Current': 'I', 'Resistance': 'R', 'Capacitance': 'C', 'Inductance': 'L', 'Frequency': 'f', 'Phase': '\\phi',
    'Gain (g)': 'g', 'Gain (μ)': '\\mu', 'Gain (β)': '\\beta', 'Gain (r)': 'r', 'Gain (k)': 'k', 'Gain': 'k',
  };
  const unitMath: Record<string, string> = { 'Ohm': '\\Omega', 'Ω': '\\Omega', 'kΩ': '\\mathrm{k}\\Omega', 'MΩ': '\\mathrm{M}\\Omega', 'mH': '\\mathrm{mH}', 'H': '\\mathrm{H}', 'µH': '\\mu\\mathrm{H}', 'uH': '\\mu\\mathrm{H}', 'µF': '\\mu\\mathrm{F}', 'uF': '\\mu\\mathrm{F}', 'nF': '\\mathrm{nF}', 'pF': '\\mathrm{pF}', 'V': '\\mathrm{V}', 'A': '\\mathrm{A}', 'Hz': '\\mathrm{Hz}', 's': '\\mathrm{s}' };
  const math = symbol[label];
  const formattedUnit = unit ? unitMath[unit] ?? `\\mathrm{${unit}}` : undefined;
  return <>{math ? <V3Math math={math} /> : label}{formattedUnit && <span style={{ marginInlineStart: 3, color: 'inherit' }}><V3Math math={formattedUnit} /></span>}</>;
}

/** Formats generated and imported component labels as safe engineering references. */
function componentLabelToLatex(label: string): string {
  const normalized = label.trim();
  if (/^GND\d*$/i.test(normalized)) {
    return '\\mathrm{GND}';
  }
  const match = normalized.match(/^([A-Za-z]+)(\d+)$/);
  const safe = (value: string) => value.replace(/([\\{}#$%&_~^])/g, '\\$1');
  if (match) {
    const prefix = match[1].length === 1 ? match[1] : `\\mathrm{${safe(match[1])}}`;
    return `${prefix}_{${match[2]}}`;
  }
  return `\\mathrm{${safe(normalized || 'component')}}`;
}

function EngineeringMath({ value, unit }: { value: number; unit?: string }) {
  if ((unit === 'Ω' || unit === 'Ohm') && (!Number.isFinite(value) || Math.abs(value) >= 1e7)) {
    return <>O.L</>;
  }
  const formatted = formatEngineering(value, unit ?? '');
  if (formatted === 'O.L' || formatted === 'OL') return <>O.L</>;
  const match = formatted.match(/^([-+]?\d+(?:\.\d+)?)(?:\s*)(.*)$/);
  if (!match) return <>{formatted}</>;
  const suffix = match[2].trim();
  const suffixMath: Record<string, string> = { 'Ω': '\\Omega', 'kΩ': '\\mathrm{k}\\Omega', 'MΩ': '\\mathrm{M}\\Omega', 'V': '\\mathrm{V}', 'mV': '\\mathrm{mV}', 'A': '\\mathrm{A}', 'mA': '\\mathrm{mA}', 'Hz': '\\mathrm{Hz}', 'kHz': '\\mathrm{kHz}', 'H': '\\mathrm{H}', 'mH': '\\mathrm{mH}', 'F': '\\mathrm{F}', 'µF': '\\mu\\mathrm{F}' };
  return <V3Math math={`${match[1]}\\,${suffixMath[suffix] ?? `\\mathrm{${suffix}}`}`} />;
}

function inputStyle(colors: Palette): React.CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    height: 32,
    background: colors.input,
    color: colors.text,
    border: `1px solid ${colors.line}`,
    borderRadius: 12,
    padding: '4px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 500,
    outline: 'none',
  };
}

function mathReferenceInputStyle(colors: Palette): React.CSSProperties {
  return {
    ...inputStyle(colors),
    fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif",
    fontSize: 14,
    fontStyle: 'italic',
    letterSpacing: '0.02em',
  };
}

function mathNumericInputStyle(colors: Palette): React.CSSProperties {
  return {
    ...inputStyle(colors),
    fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif",
    fontSize: 14,
    fontStyle: 'normal',
    fontVariantNumeric: 'tabular-nums',
  };
}

function mathSelectStyle(colors: Palette): React.CSSProperties {
  return {
    ...inputStyle(colors),
    fontFamily: "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif",
    fontSize: 14,
    fontStyle: 'normal',
    paddingInlineStart: 6,
    paddingInlineEnd: 16,
  };
}

