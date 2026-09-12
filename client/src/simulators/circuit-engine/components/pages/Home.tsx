import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Maximize2,
  Minus,
  Move,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  Search,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Upload,
  Zap,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { V3Math } from '@/components/ui/V3Math';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/circuit-engine/models/katexSvgFonts';
import { AnalysisBox } from '@/simulators/circuit-engine/components/ui-components/AnalysisBox';
import type { AnalysisTrace, MeshCycle, NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
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
  terminalKey,
  type CircuitComponent,
  type CircuitWire,
  type InstrumentReading,
  type Selection,
  type SimulationSnapshot,
  type WorkspaceText,
} from '@/simulators/circuit-engine/models/circuitTypes';
import { SimulationEngine } from '@/simulators/circuit-engine/engine/simulation';
import { compileNodalGeometry, useSimulation, type TabBMnaState } from '@/simulators/circuit-engine/components/hooks/useSimulation';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { compileMeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import { NormalizedCircuitGraph } from '@/simulators/circuit-engine/models/NormalizedCircuitGraph';
import { createNadDocument, parseNad, serializeNad } from '@/simulators/circuit-engine/models/nadFormat';
import { useSpiceEngine } from '@/simulators/circuit-engine/components/hooks/useSpiceEngine';
import {
  convertToSpiceComponents,
  detectSystemFrequency,
  resolveCircuitNets,
  SpiceAdapterError,
  type SimulationMode,
  type SpiceCircuitNets,
} from '@/simulators/circuit-engine/engine/spice/spiceAdapter';
import { buildSpiceNodeMap, generateNetlist, NetlistError, type SpiceNodeMap } from '@/simulators/circuit-engine/engine/spice/netlistGenerator';
import { parseSpiceResults } from '@/simulators/circuit-engine/engine/spice/spiceParser';
import { buildSpiceInstrumentReadings } from '@/simulators/circuit-engine/engine/spice/spiceInstruments';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from '@/simulators/circuit-engine/models/analogComponentCatalog';
import { alignTabDTerminalToGrid, calculateTabDPlanarCavity, dynamicRubberBandPath, getExactTerminalOffset, isExactCadComponent, lockTabDWireCorner, MESH_LOOP_COLORS, moveTabDOrthogonalLane, tabDComponentLabelAnchors, tabDGentleWheelZoomFactor, tabDOrthogonalDraftPath, tabDTerminalOrthogonalPath, type ObstacleBox, type TabDTerminalAxis } from '@/simulators/circuit-engine/components/analogCanvasGeometry';
import { renderSymbol } from '@/simulators/circuit-engine/components/symbols';
import { applySwitchHotkey, directControlKind, hotkeyDigit, isTextEntryTarget, momentaryControlProps, nextLatchingControlProps, releaseHeldPushbuttons } from '@/simulators/circuit-engine/models/componentInteraction';
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
/* Unified signature gradient pills (blue-600 -> pink-500). */
const TAB_GRADIENT = 'linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #f43f5e 100%)';
const TAB_GRADIENT_REV = 'linear-gradient(90deg, #f43f5e 0%, #7c3aed 50%, #2563eb 100%)';
const TAB_ACTIVE_SHADOW = '0 1px 3px rgba(2, 6, 23, 0.18)';
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

function currentWireEndpoints(wire: CircuitWire, components: CircuitComponent[]): { from: Point; to: Point; fromAxis: TabDTerminalAxis; toAxis: TabDTerminalAxis } | null {
  const fromComponent = components.find(component => component.id === wire.fromComp);
  if (!fromComponent) return null;
  const from = getComponentTerminalPosition(fromComponent, wire.fromTerm);
  const fromAxis: TabDTerminalAxis = from && Math.abs(from[0] - fromComponent.x) >= Math.abs(from[1] - fromComponent.y) ? 'horizontal' : 'vertical';

  if (wire.junctionPoint) {
    return from ? { from, to: wire.junctionPoint, fromAxis, toAxis: fromAxis } : null;
  }
  const toComponent = components.find(component => component.id === wire.toComp);
  if (!toComponent) return null;
  const to = getComponentTerminalPosition(toComponent, wire.toTerm);
  const toAxis: TabDTerminalAxis = to && Math.abs(to[0] - toComponent.x) >= Math.abs(to[1] - toComponent.y) ? 'horizontal' : 'vertical';
  return from && to ? { from, to, fromAxis, toAxis } : null;
}

function refreshWireEndpoints(wires: CircuitWire[], components: CircuitComponent[], draggedComponentId?: string): CircuitWire[] {
  return wires.map(wire => {
    const endpoints = currentWireEndpoints(wire, components);
    if (!endpoints) return wire;
    const isConnectedToDragged = Boolean(draggedComponentId && (wire.fromComp === draggedComponentId || wire.toComp === draggedComponentId));
    if (isConnectedToDragged) {
      if (wire.routing === 'manual' || (wire.waypoints && wire.waypoints.length > 0) || wire.path.length > 2) {
        const updatedPath = reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, undefined, endpoints.fromAxis);
        return {
          ...wire,
          path: updatedPath,
          waypoints: updatedPath.length > 2 ? updatedPath.slice(1, -1) : wire.waypoints,
        };
      }
      const movingEnd = wire.toComp === draggedComponentId ? 'to' : wire.fromComp === draggedComponentId ? 'from' : 'none';
      const newPath = dynamicRubberBandPath(endpoints.from, endpoints.to, endpoints.fromAxis, endpoints.toAxis, movingEnd);
      return {
        ...wire,
        routing: 'orthogonal' as const,
        path: newPath,
        waypoints: undefined,
      };
    }
    if (
      wire.path.length >= 2 &&
      Math.abs(wire.path[0][0] - endpoints.from[0]) < 1e-3 &&
      Math.abs(wire.path[0][1] - endpoints.from[1]) < 1e-3 &&
      Math.abs(wire.path[wire.path.length - 1][0] - endpoints.to[0]) < 1e-3 &&
      Math.abs(wire.path[wire.path.length - 1][1] - endpoints.to[1]) < 1e-3
    ) {
      return wire;
    }
    return { ...wire, path: reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, undefined, endpoints.fromAxis) };
  });
}

function oneBendManhattanPath(from: Point, to: Point): Point[] {
  if (from[0] === to[0] || from[1] === to[1]) return [from, to];
  const corner: Point = Math.abs(to[0] - from[0]) >= Math.abs(to[1] - from[1]) ? [to[0], from[1]] : [from[0], to[1]];
  return [from, corner, to];
}

function sourcePointFromElement(element: SVGSVGElement | null, pan: Point, zoom: number): Point {
  const rect = element?.getBoundingClientRect();
  if (!rect) return [300, 220];
  return [(rect.width / 2 - pan[0]) / zoom, (rect.height / 2 - pan[1]) / zoom];
}

/** Renders an explicit clockwise current reference at the geometrical cavity center of one bounded mesh face. */
function MeshLoopOverlay({ cycle, components = [], scale = 1 }: { cycle: MeshCycle; tabDUiRefinement?: boolean; components?: CircuitComponent[]; scale?: number }) {
  const { center, radius } = calculateTabDPlanarCavity(cycle.points, components, scale);
  const [cx, cy] = center;
  const color = MESH_LOOP_COLORS[cycle.index % MESH_LOOP_COLORS.length];

  // Clockwise circular arrow arc sweeping from -45° to -90° (12 o'clock, 315° arc)
  // leaving an open 45° gap where the arrow marker cleanly points in the clockwise tangent direction
  const startAngle = -Math.PI / 4;
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx;
  const endY = cy - radius;
  const pathData = `M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${endX} ${endY}`;

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
        y={cy - 1}
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

function ComponentPaletteIcon({ definition, colors, documented }: { definition: ComponentDef; colors: Palette; documented: boolean }) {
  const padding = 20; // Safe optical padding
  const w = definition.width + padding;
  const h = definition.height + padding;

  let offsetY = 0;
  if (definition.id === 'pb-no') {
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
        {renderSymbol(definition.symbol, false, { ...defaultProps(definition), _documentedStyle: documented }, 0)}
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

export interface V3HomeProps {
  /** Creates an isolated runtime while retaining the exact Tab B presentation contract. */
  createSimulationEngine?: () => SimulationEngine;
  /** Supplies a tab-specific static MNA payload while retaining the same view contract. */
  createStaticMna?: (components: CircuitComponent[], wires: CircuitWire[], normalizedGraph: NormalizedCircuitGraph) => TabBMnaState;
  /** Opts Tab D into presentation-only controls without changing Tab B's interaction contract. */
  tabDUiRefinement?: boolean;
}

export function V3Home({ createSimulationEngine = () => new SimulationEngine(), createStaticMna, tabDUiRefinement = false }: V3HomeProps) {
  const [components, setComponents] = useState<CircuitComponent[]>([]);
  const [wires, setWires] = useState<CircuitWire[]>([]);
  const [texts, setTexts] = useState<WorkspaceText[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<{ components: CircuitComponent[], wires: CircuitWire[], texts: WorkspaceText[] } | null>(null);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [gridVisible, setGridVisible] = useState(true);
  const [tabDGridMode, setTabDGridMode] = useState<'dots' | 'cartesian' | 'hidden'>('dots');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [wiring, setWiring] = useState<WiringState>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const [cursor, setCursor] = useState<Point>([0, 0]);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [simulationRunning, setSimulationRunning] = useState(false);
  // Academic mode swaps in idealized textbook models (ideal switches, no Early effect, RMS AC
  // sources, …); Practical is the default so readings match real-world non-linear behavior.
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('practical');
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
  const [darkPreview, setDarkPreview] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const gridSize = tabDUiRefinement ? TAB_D_GRID_SIZE : GRID_SIZE;
  const visualSymbolScale = tabDUiRefinement ? TAB_D_SYMBOL_SCALE : 1;
  const normalizedGraph = useMemo(() => NormalizedCircuitGraph.fromCanvas(components, wires), [components, wires]);
  const tabBMna = useSimulation(components, wires, normalizedGraph);
  const dcMna = useMemo(() => createStaticMna ? createStaticMna(components, wires, normalizedGraph) : tabBMna, [components, createStaticMna, normalizedGraph, tabBMna, wires]);
  const meshGeometry = useMemo(() => compileMeshGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);
  const nodalGeometry = useMemo(() => compileNodalGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);
  const workspaceAlert = useMemo(() => {
    if (!tabDUiRefinement) return null;
    const warning = snapshot.warnings.find(item => item.code === 'TAB_D_MNA');
    if (!warning) return null;
    if (/ground reference/i.test(warning.message)) {
      return { label: 'TAB D / REFERENCE CHECK', title: 'Missing Ground Reference', message: 'Missing Ground Reference: The circuit cannot be solved. Please add a ground terminal.' };
    }
    if (/newton|converg/i.test(warning.message)) {
      return { label: 'TAB D / SOLVER LIMIT', title: 'Newton–Raphson Did Not Converge', message: 'Newton-Raphson Divergence: The circuit did not converge safely. Review nonlinear devices, source levels, and circuit paths.' };
    }
    return { label: 'TAB D / MNA WARNING', title: 'Documented MNA Could Not Solve', message: warning.message };
  }, [snapshot.warnings, tabDUiRefinement]);
  const [analysisTraces, setAnalysisTraces] = useState<Partial<Record<'mesh' | 'nodal', AnalysisTrace>>>({});
  const [activeAnalysisMethod, setActiveAnalysisMethod] = useState<'mesh' | 'nodal' | null>(null);
  const handleAnalysisTrace = useCallback((trace: AnalysisTrace) => {
    if (trace.method !== 'mesh' && trace.method !== 'nodal') return;
    setActiveAnalysisMethod(trace.method);
    setAnalysisTraces((current) => trace.status === 'ready' ? { ...current, [trace.method]: trace } : { ...current, [trace.method]: undefined });
  }, []);
  const activeMeshTrace = activeAnalysisMethod === 'mesh' ? analysisTraces.mesh ?? null : null;
  const activeNodalTrace = activeAnalysisMethod === 'nodal' ? analysisTraces.nodal ?? null : null;

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setDarkPreview(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const svgRef = useRef<SVGSVGElement>(null);
  const nadInputRef = useRef<HTMLInputElement>(null);
  const simulation = useRef<SimulationEngine>(createSimulationEngine());
  const animationFrame = useRef<number | null>(null);
  const componentRef = useRef(components);
  const wiresRef = useRef(wires);
  const textsRef = useRef(texts);
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
  componentRef.current = components;
  wiresRef.current = wires;
  textsRef.current = texts;
  tabDUiRefinementRef.current = tabDUiRefinement;

  const history = useHistory<CanvasSnapshot>(
    () => ({
      components: [],
      wires: [],
      texts: [],
    }),
    { areEqual: areSnapshotsEqual },
  );
  const dragStartSnapshotRef = useRef<CanvasSnapshot | null>(null);
  // Armed when a latching control (switch, breaker, relay override) is pressed on the canvas, and
  // cleared as soon as the pointer moves far enough to be a drag — so the mouse-up below toggles a
  // click but never a drag.
  const latchingClickRef = useRef<{ id: string; origin: Point } | null>(null);

  const commitSnapshot = useCallback((patch?: Partial<CanvasSnapshot>) => {
    const currentSnapshot: CanvasSnapshot = {
      components: patch?.components ?? componentRef.current,
      wires: patch?.wires ?? wiresRef.current,
      texts: patch?.texts ?? textsRef.current,
    };
    history.set(cloneSnapshot(currentSnapshot));
  }, [history]);

  const handleUndo = useCallback(() => {
    if (!history.canUndo) return;
    const previous = history.undo();
    if (!previous) return;
    setComponents(previous.components);
    setWires(previous.wires);
    setTexts(previous.texts);
    setSelection(null);
    setMarqueeIds([]);
    setWiring({});
  }, [history]);

  const handleRedo = useCallback(() => {
    if (!history.canRedo) return;
    const next = history.redo();
    if (!next) return;
    setComponents(next.components);
    setWires(next.wires);
    setTexts(next.texts);
    setSelection(null);
    setMarqueeIds([]);
    setWiring({});
  }, [history]);

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect) return;
      if (event.shiftKey || (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey)) {
        setPan((previous) => [previous[0] - event.deltaX, previous[1] - event.deltaY]);
        return;
      }
      // Tab B retains its established response; Tab D uses a pixel-normalized gentle response.
      const factor = tabDUiRefinementRef.current
        ? tabDGentleWheelZoomFactor(event.deltaY)
        : event.deltaY < 0 ? 1.12 : 0.9;
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      setZoom((current) => {
        const next = Math.max(0.2, Math.min(3, current * factor));
        setPan((previous) => [mouseX - (mouseX - previous[0]) * (next / current), mouseY - (mouseY - previous[1]) * (next / current)]);
        return next;
      });
    };
    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const colors = darkPreview
    ? {
      background: '#07111f', canvas: '#0c1728', panel: '#101d31', panelAlt: '#16243a', line: '#30415c', text: '#e2e8f0', muted: '#9aaac1', subtle: '#52647d', primary: '#60a5fa', accent: '#8b5cf6', danger: '#fb7185', selection: '#60a5fa', grid: '#233652', wire: '#60a5fa', powered: '#a78bfa', input: '#0b1525', shadow: '0 12px 28px rgba(0,0,0,0.28)',
    }
    : {
      background: '#eaf0f8', canvas: '#f8fbff', panel: '#ffffff', panelAlt: '#f1f5fb', line: '#d7e2ef', text: '#172033', muted: '#64748b', subtle: '#94a3b8', primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#2563eb', grid: '#dbe7f3', wire: '#2563eb', powered: '#8b5cf6', input: '#ffffff', shadow: '0 12px 28px rgba(15,23,42,0.10)',
    };

  const selectedComponent = selection?.kind === 'component'
    ? components.find(component => component.id === selection.id)
    : undefined;
  const selectedWire = selection?.kind === 'wire'
    ? wires.find(wire => wire.id === selection.id)
    : undefined;
  const selectedText = selection?.kind === 'text'
    ? texts.find(text => text.id === selection.id)
    : undefined;

  const clientToWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [(clientX - rect.left - pan[0]) / zoom, (clientY - rect.top - pan[1]) / zoom];
  }, [pan, zoom]);

  const getRawCanvasTerminalPosition = useCallback((component: CircuitComponent, terminalId: string): Point | null => {
    const definition = getDef(component.type);
    const terminal = definition?.terminals.find(item => item.id === terminalId);
    if (!terminal) return null;
    if (isExactCadComponent(component.type)) {
      const exact = getExactTerminalOffset(component.type, terminal.id) ?? [terminal.x, terminal.y];
      return getTerminalWorldPos(component.x, component.y, exact[0], exact[1], component.rotation, component.flipH, component.flipV);
    }
    return getTerminalWorldPos(component.x, component.y, terminal.x * visualSymbolScale, terminal.y * visualSymbolScale, component.rotation, component.flipH, component.flipV);
  }, [visualSymbolScale]);

  const getCanvasTerminalPosition = useCallback((component: CircuitComponent, terminalId: string): Point | null => {
    const raw = getRawCanvasTerminalPosition(component, terminalId);
    if (isExactCadComponent(component.type)) return raw; // strict sub-grid bypass
    return raw && tabDUiRefinement ? alignTabDTerminalToGrid(raw, gridSize) : raw;
  }, [getRawCanvasTerminalPosition, gridSize, tabDUiRefinement]);

  const canvasWireEndpoints = useCallback((wire: CircuitWire, documentComponents: CircuitComponent[]): { from: Point; to: Point; fromAxis: TabDTerminalAxis; toAxis: TabDTerminalAxis } | null => {
    let from: Point | null = null;
    let fromAxis: TabDTerminalAxis = 'horizontal';

    if (wire.fromComp.startsWith('junc_')) {
      from = wire.path[0];
      fromAxis = wire.path.length > 1 && Math.abs(wire.path[1][0] - wire.path[0][0]) > Math.abs(wire.path[1][1] - wire.path[0][1]) ? 'horizontal' : 'vertical';
    } else {
      const fromComponent = documentComponents.find(component => component.id === wire.fromComp);
      if (!fromComponent) return null;
      from = getCanvasTerminalPosition(fromComponent, wire.fromTerm);
      if (from) {
        fromAxis = Math.abs(from[0] - fromComponent.x) >= Math.abs(from[1] - fromComponent.y) ? 'horizontal' : 'vertical';
      }
    }

    if (wire.junctionPoint) {
      return from ? { from, to: wire.junctionPoint, fromAxis, toAxis: fromAxis } : null;
    }

    let to: Point | null = null;
    let toAxis: TabDTerminalAxis = 'horizontal';
    if (wire.toComp.startsWith('junc_')) {
      to = wire.path[wire.path.length - 1];
      toAxis = wire.path.length > 1 && Math.abs(wire.path[wire.path.length - 1][0] - wire.path[wire.path.length - 2][0]) > Math.abs(wire.path[wire.path.length - 1][1] - wire.path[wire.path.length - 2][1]) ? 'horizontal' : 'vertical';
    } else {
      const toComponent = documentComponents.find(component => component.id === wire.toComp);
      if (!toComponent) return null;
      to = getCanvasTerminalPosition(toComponent, wire.toTerm);
      if (to) {
        toAxis = Math.abs(to[0] - toComponent.x) >= Math.abs(to[1] - toComponent.y) ? 'horizontal' : 'vertical';
      }
    }

    return from && to ? { from, to, fromAxis, toAxis } : null;
  }, [getCanvasTerminalPosition]);

  const refreshCanvasWireEndpoints = useCallback((
    documentWires: CircuitWire[],
    documentComponents: CircuitComponent[],
    draggedComponentId?: string,
  ) => {
    if (!tabDUiRefinement) return refreshWireEndpoints(documentWires, documentComponents, draggedComponentId);

    const activeDraggedId = draggedComponentId ?? (dragState?.kind === 'component' ? dragState.id : undefined);

    return documentWires.map(wire => {
      const endpoints = canvasWireEndpoints(wire, documentComponents);
      if (!endpoints) return wire;

      const isConnectedToDragged = Boolean(activeDraggedId && (wire.fromComp === activeDraggedId || wire.toComp === activeDraggedId));

      if (isConnectedToDragged) {
        if (wire.routing === 'manual' || (wire.waypoints && wire.waypoints.length > 0) || wire.path.length > 2) {
          const updatedPath = reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, gridSize, endpoints.fromAxis);
          return {
            ...wire,
            path: updatedPath,
            waypoints: updatedPath.length > 2 ? updatedPath.slice(1, -1) : wire.waypoints,
          };
        }
        const movingEnd = wire.toComp === activeDraggedId ? 'to' : wire.fromComp === activeDraggedId ? 'from' : 'none';
        const newPath = dynamicRubberBandPath(endpoints.from, endpoints.to, endpoints.fromAxis, endpoints.toAxis, movingEnd);
        return {
          ...wire,
          routing: 'orthogonal' as const,
          path: newPath,
          waypoints: undefined,
        };
      }

      if (
        dragState?.kind !== 'component' &&
        wire.path.length >= 2 &&
        Math.abs(wire.path[0][0] - endpoints.from[0]) < 1e-3 &&
        Math.abs(wire.path[0][1] - endpoints.from[1]) < 1e-3 &&
        Math.abs(wire.path[wire.path.length - 1][0] - endpoints.to[0]) < 1e-3 &&
        Math.abs(wire.path[wire.path.length - 1][1] - endpoints.to[1]) < 1e-3
      ) {
        return wire;
      }
      return { ...wire, path: reconnectPathEndpoints(wire.path, endpoints.from, endpoints.to, wire.routing, [], wire.waypoints, gridSize, endpoints.fromAxis) };
    });
  }, [canvasWireEndpoints, tabDUiRefinement, gridSize, dragState]);

  const findTerminalAt = useCallback((point: Point): { componentId: string; terminalId: string; position: Point; axis: TabDTerminalAxis } | null => {
    for (const component of [...componentRef.current].reverse()) {
      const definition = getDef(component.type);
      if (!definition) continue;
      for (const terminal of definition.terminals) {
        const position = getCanvasTerminalPosition(component, terminal.id);
        if (position && isNearTerminal(point[0], point[1], position[0], position[1], TERMINAL_HIT_RADIUS)) {
          const axis: TabDTerminalAxis = Math.abs(position[0] - component.x) >= Math.abs(position[1] - component.y) ? 'horizontal' : 'vertical';
          return { componentId: component.id, terminalId: terminal.id, position, axis };
        }
      }
    }
    return null;
  }, [getCanvasTerminalPosition]);

  const findComponentAt = useCallback((point: Point): CircuitComponent | null => {
    for (const component of [...componentRef.current].reverse()) {
      const definition = getDef(component.type);
      if (!definition) continue;
      const dx = point[0] - component.x;
      const dy = point[1] - component.y;
      const radians = (-component.rotation * Math.PI) / 180;
      const localX = dx * Math.cos(radians) - dy * Math.sin(radians);
      const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
      const flippedX = component.flipH ? -localX : localX;
      const flippedY = component.flipV ? -localY : localY;

      let actualHalfW = (definition.width * visualSymbolScale) / 2;
      let actualHalfH = (definition.height * visualSymbolScale) / 2;
      let offsetY = 0;

      if (component.type === 'sw-spdt') {
        actualHalfW = 25; actualHalfH = 12.5; offsetY = 12.5;
      } else if (component.type === 'sw-dpst') {
        actualHalfW = 25; actualHalfH = 12.5; offsetY = -12.5;
      } else if (component.type === 'sw-dpdt') {
        actualHalfW = 25; actualHalfH = 37.5; offsetY = 12.5;
      } else if (component.type === 'pb-no') {
        actualHalfW = 25; actualHalfH = 12.5; offsetY = -10;
      } else if (['pb-nc', 'sw-spst-no', 'sw-spst-nc', 'aux-contact-no', 'aux-contact-nc'].includes(component.type)) {
        actualHalfW = 25; actualHalfH = 12.5; offsetY = -5;
      } else if (component.type === 'contactor') {
        actualHalfW = 35; actualHalfH = 72.5; offsetY = 12.5;
      } else if (['relay-spst', 'relay-spdt', 'relay-dpst'].includes(component.type)) {
        actualHalfW = 35; actualHalfH = 35; offsetY = 0;
      } else if (['transformer', 'transformer-ct', 'autotransformer'].includes(component.type)) {
        actualHalfW = 25; actualHalfH = 50; offsetY = 0;
      } else if (/voltage|current|meter|motor|lamp|source/.test(component.type)) {
        actualHalfW = 33; actualHalfH = 33; offsetY = 0;
      }

      if (Math.abs(flippedX) <= actualHalfW + 10 && Math.abs(flippedY - offsetY) <= actualHalfH + 10) return component;
      const [labelX, labelY] = componentLabelOffset(definition, component, visualSymbolScale);
      const [valX, valY] = componentValueAnchor(definition, component, visualSymbolScale);
      const labelWidth = Math.max(48, component.label.length * 9);
      if (Math.abs(point[0] - (component.x + labelX)) <= labelWidth / 2 && Math.abs(point[1] - (component.y + labelY)) <= 14) return component;
      if (Math.abs(point[0] - (component.x + valX)) <= 36 && Math.abs(point[1] - (component.y + valY)) <= 14) return component;
    }
    return null;
  }, [visualSymbolScale]);

  const addComponent = useCallback((type: string, x?: number, y?: number) => {
    if (tabDUiRefinement && !isTabDComponentAvailable(type)) {
      toast.error('This power semiconductor is unavailable in Tab D');
      return;
    }
    const definition = getDef(type);
    if (!definition) return;
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);
    const targetX = x ?? origin[0];
    const targetY = y ?? origin[1];
    const position = snapEnabled ? snapPointToGrid([targetX, targetY], gridSize) : [targetX, targetY];
    const component: CircuitComponent = {
      id: nanoid(10),
      type,
      x: position[0],
      y: position[1],
      rotation: 0,
      flipH: false,
      flipV: false,
      label: nextComponentLabel(type, components),
      props: defaultProps(definition),
    };
    const nextComponents = [...components, component];
    setComponents(nextComponents);
    commitSnapshot({ components: nextComponents });
    setSelection({ kind: 'component', id: component.id });
    toast.success(`${component.label} added`);
  }, [commitSnapshot, components, gridSize, pan, snapEnabled, tabDUiRefinement, zoom]);

  const addText = useCallback(() => {
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);
    const text: WorkspaceText = {
      id: nanoid(10),
      x: snapEnabled ? snapToGrid(origin[0], gridSize) : origin[0],
      y: snapEnabled ? snapToGrid(origin[1], gridSize) : origin[1],
      text: 'Text label',
      fontSize: 16,
      color: darkPreview ? '#e2e8f0' : '#172033',
      rotation: 0,
    };
    const nextTexts = [...texts, text];
    setTexts(nextTexts);
    commitSnapshot({ texts: nextTexts });
    setSelection({ kind: 'text', id: text.id });
  }, [commitSnapshot, darkPreview, gridSize, pan, snapEnabled, texts, zoom]);

  const removeSelection = useCallback(() => {
    if (marqueeIds.length > 0) {
      const nextC = components.filter(c => !marqueeIds.includes(c.id));
      const nextW = wires.filter(w => !marqueeIds.includes(w.id) && !marqueeIds.includes(w.fromComp) && !marqueeIds.includes(w.toComp));
      const nextT = texts.filter(t => !marqueeIds.includes(t.id));
      setComponents(nextC);
      setWires(nextW);
      setTexts(nextT);
      commitSnapshot({ components: nextC, wires: nextW, texts: nextT });
      setSelection(null);
      setMarqueeIds([]);
      return;
    }
    if (!selection) return;
    let nextC = components;
    let nextW = wires;
    let nextT = texts;
    if (selection.kind === 'component') {
      nextC = components.filter(component => component.id !== selection.id);
      nextW = wires.filter(wire => wire.fromComp !== selection.id && wire.toComp !== selection.id);
    }
    if (selection.kind === 'wire') {
      nextW = wires.filter(wire => wire.id !== selection.id && wire.junctionWireId !== selection.id);
    }
    if (selection.kind === 'text') {
      nextT = texts.filter(text => text.id !== selection.id);
    }
    setComponents(nextC);
    setWires(nextW);
    setTexts(nextT);
    commitSnapshot({ components: nextC, wires: nextW, texts: nextT });
    setSelection(null);
  }, [commitSnapshot, components, marqueeIds, selection, texts, wires]);

  const copySelection = useCallback(() => {
    if (marqueeIds.length > 0) {
      const copiedComponents = components.filter(c => marqueeIds.includes(c.id));
      const copiedWires = wires.filter(w => marqueeIds.includes(w.id) || (marqueeIds.includes(w.fromComp) && marqueeIds.includes(w.toComp)));
      const copiedTexts = texts.filter(t => marqueeIds.includes(t.id));
      setClipboard(structuredClone({ components: copiedComponents, wires: copiedWires, texts: copiedTexts }));
      toast.success(`${copiedComponents.length + copiedWires.length + copiedTexts.length} items copied`);
      return;
    }
    if (!selectedComponent) return;
    setClipboard(structuredClone({ components: [selectedComponent], wires: [], texts: [] }));
    toast.success(`${selectedComponent.label} copied`);
  }, [selectedComponent, marqueeIds, components, wires, texts]);

  const cutSelection = useCallback(() => {
    copySelection();
    removeSelection();
  }, [removeSelection, copySelection]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard || (clipboard.components.length === 0 && clipboard.texts.length === 0 && clipboard.wires.length === 0)) return;
    if (tabDUiRefinement && clipboard.components.some(c => !isTabDComponentAvailable(c.type))) {
      toast.error('Some power semiconductors are unavailable in Tab D');
      return;
    }
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);

    // Find bounding box top-left of clipboard items
    let minX = Infinity; let minY = Infinity;
    clipboard.components.forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); });
    clipboard.texts.forEach(t => { minX = Math.min(minX, t.x); minY = Math.min(minY, t.y); });
    if (minX === Infinity) { minX = 0; minY = 0; }

    const targetX = snapEnabled ? snapToGrid(origin[0] + gridSize * 2, gridSize) : origin[0] + gridSize * 2;
    const targetY = snapEnabled ? snapToGrid(origin[1] + gridSize * 2, gridSize) : origin[1] + gridSize * 2;
    const dx = targetX - minX;
    const dy = targetY - minY;

    const idMap = new Map<string, string>();
    const nextComponents = [...components];

    const pastedComponents = clipboard.components.map(c => {
      const newId = nanoid(10);
      idMap.set(c.id, newId);
      const pasted = copyComponentForPaste(c, newId, nextComponentLabel(c.type, nextComponents), c.x + dx, c.y + dy);
      nextComponents.push(pasted);
      return pasted;
    });

    const pastedTexts = clipboard.texts.map(t => ({
      ...t,
      id: nanoid(10),
      x: t.x + dx,
      y: t.y + dy
    }));

    const pastedWires = clipboard.wires.map(w => ({
      ...w,
      id: nanoid(10),
      fromComp: idMap.get(w.fromComp) ?? w.fromComp,
      toComp: idMap.get(w.toComp) ?? w.toComp,
      path: w.path.map(p => [p[0] + dx, p[1] + dy] as Point)
    }));

    const nextPastedComponents = [...components, ...pastedComponents];
    const nextPastedTexts = [...texts, ...pastedTexts];
    const nextPastedWires = [...wires, ...pastedWires];

    setComponents(nextPastedComponents);
    setTexts(nextPastedTexts);
    setWires(nextPastedWires);
    commitSnapshot({ components: nextPastedComponents, wires: nextPastedWires, texts: nextPastedTexts });

    const newIds = [...pastedComponents.map(c => c.id), ...pastedTexts.map(t => t.id), ...pastedWires.map(w => w.id)];
    if (newIds.length === 1 && pastedComponents.length === 1) {
      setSelection({ kind: 'component', id: pastedComponents[0].id });
      setMarqueeIds([]);
    } else {
      setSelection(null);
      setMarqueeIds(newIds);
    }
    toast.success(`${newIds.length} items pasted`);
  }, [clipboard, commitSnapshot, components, gridSize, pan, snapEnabled, tabDUiRefinement, texts, wires, zoom]);

  const exportNad = useCallback(() => {
    const document = createNadDocument({ components, wires, texts, viewport: { pan, zoom }, workspace: { gridVisible, snapEnabled } });
    const href = URL.createObjectURL(new Blob([serializeNad(document)], { type: 'application/x-mae-nad+json' }));
    const anchor = window.document.createElement('a');
    anchor.href = href; anchor.download = 'circuit-lab.nad'; anchor.click();
    URL.revokeObjectURL(href);
    toast.success('NAD circuit exported');
  }, [components, gridVisible, pan, snapEnabled, texts, wires, zoom]);

  const importNad = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const document = parseNad(await file.text());
      const importedComponents = tabDUiRefinement ? filterTabDImportedComponents(document.components) : document.components;
      const importedIds = new Set(importedComponents.map((component) => component.id));
      const importedWires = document.wires.filter((wire) => importedIds.has(wire.fromComp) && importedIds.has(wire.toComp));
      const refreshedWires = refreshWireEndpoints(importedWires, importedComponents);
      setComponents(importedComponents);
      setWires(refreshedWires);
      setTexts(document.texts);
      history.reset(cloneSnapshot({
        components: importedComponents,
        wires: refreshedWires,
        texts: document.texts,
      }));
      setPan(document.viewport.pan); setZoom(document.viewport.zoom);
      setGridVisible(document.workspace.gridVisible); setSnapEnabled(document.workspace.snapEnabled);
      setSelection(null); setMarqueeIds([]); setWiring({}); setDragState(null);
      const excludedCount = document.components.length - importedComponents.length;
      toast.success(`NAD circuit imported (${importedComponents.length} components)${excludedCount ? `; ${excludedCount} unavailable component${excludedCount === 1 ? '' : 's'} omitted` : ''}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to import NAD file.'); }
  }, [history, tabDUiRefinement]);

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
    });

    texts.forEach((text) => {
      expand(text.x, text.y);
      expand(text.x + 80, text.y + 24);
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

  const zoomToFit = useCallback(() => {
    if (components.length === 0 && texts.length === 0) {
      setZoom(1);
      setPan([0, 0]);
      return;
    }

    const bounds = getCircuitBoundingBox();
    if (!bounds) {
      setZoom(1);
      setPan([0, 0]);
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    const width = rect?.width || 800;
    const height = rect?.height || 600;
    const pad = 60;

    const availWidth = Math.max(20, width - pad * 2);
    const availHeight = Math.max(20, height - pad * 2);
    const newZoom = Math.max(0.2, Math.min(2.5, Math.min(availWidth / bounds.circuitWidth, availHeight / bounds.circuitHeight)));

    const newPan: Point = [
      width / 2 - bounds.centerX * newZoom,
      height / 2 - bounds.centerY * newZoom,
    ];

    setZoom(newZoom);
    setPan(newPan);
    toast.success('Centered circuit to fit viewport');
  }, [components.length, getCircuitBoundingBox, texts.length]);

  const exportSvg = useCallback(() => {
    if (components.length === 0 && texts.length === 0 && wires.length === 0) {
      toast.error('No circuit elements to export');
      return;
    }

    const bounds = getCircuitBoundingBox();
    if (!bounds || !svgRef.current) {
      toast.error('Unable to compute circuit boundaries');
      return;
    }

    const cropX = Math.round(bounds.minX - 30);
    const cropY = Math.round(bounds.minY - 30);
    const cropWidth = Math.round(bounds.circuitWidth + 60);
    const cropHeight = Math.round(bounds.circuitHeight + 60);

    const clonedSvg = svgRef.current.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.setAttribute('viewBox', `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
    clonedSvg.setAttribute('width', String(cropWidth));
    clonedSvg.setAttribute('height', String(cropHeight));
    clonedSvg.style.width = `${cropWidth}px`;
    clonedSvg.style.height = `${cropHeight}px`;

    const strokeColor = darkPreview ? '#f8fafc' : '#1e293b';
    clonedSvg.style.color = strokeColor;
    clonedSvg.setAttribute('color', strokeColor);

    const worldGroup = Array.from(clonedSvg.querySelectorAll('g')).find(g => g.getAttribute('transform')?.includes('scale'));
    if (worldGroup) {
      worldGroup.removeAttribute('transform');
    }

    // Clean up interactive, selection, and invisible elements
    clonedSvg.querySelectorAll('circle[style*="cursor: move"], circle[style*="cursor:move"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[r="13"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"], circle[opacity="0"], circle[style*="opacity: 0"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[key*="grid-surface"], rect[fill*="workspace-grid"]').forEach(el => el.remove());

    // Replace free-text foreignObjects with standard SVG text and KaTeX tspans
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
          textEl.setAttribute('font-size', `${text.fontSize || 14}px`);
          textEl.setAttribute('font-family', "'KaTeX_Main', 'KaTeX_Math', serif");
          textEl.style.fontFamily = "'KaTeX_Main', 'KaTeX_Math', serif";
          textEl.style.fontSize = `${text.fontSize || 14}px`;
          populateMathTspans(textEl, text.text, text.fontSize || 14);
          fo.replaceWith(textEl);
        }
      }
    });

    clonedSvg.querySelectorAll('g[color]').forEach(el => {
      el.setAttribute('color', strokeColor);
    });

    let defs = clonedSvg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      clonedSvg.insertBefore(defs, clonedSvg.firstChild);
    }

    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(cropX));
    bgRect.setAttribute('y', String(cropY));
    bgRect.setAttribute('width', String(cropWidth));
    bgRect.setAttribute('height', String(cropHeight));
    bgRect.setAttribute('fill', colors.canvas);

    if (worldGroup) {
      worldGroup.insertBefore(bgRect, worldGroup.firstChild);
    } else {
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    }

    if (gridVisible && (!tabDUiRefinement || tabDGridMode !== 'hidden')) {
      const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      gridRect.setAttribute('x', String(cropX));
      gridRect.setAttribute('y', String(cropY));
      gridRect.setAttribute('width', String(cropWidth));
      gridRect.setAttribute('height', String(cropHeight));
      gridRect.setAttribute('fill', `url(#workspace-grid-${tabDUiRefinement ? tabDGridMode : 'base'})`);
      if (worldGroup) {
        worldGroup.insertBefore(gridRect, bgRect.nextSibling);
      } else {
        clonedSvg.insertBefore(gridRect, bgRect.nextSibling);
      }
    }

    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      ${KATEX_EMBEDDED_FONT_CSS}
      :root, svg {
        color: ${strokeColor};
        background-color: ${colors.canvas};
      }
      text, tspan {
        font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif;
      }
      .katex {
        font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif;
      }
    `;
    defs.appendChild(styleEl);

    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);
    if (!svgString.startsWith('<?xml')) {
      svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'circuit-schematic.svg';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Schematic exported as SVG');
  }, [colors.canvas, components.length, darkPreview, getCircuitBoundingBox, gridVisible, tabDGridMode, tabDUiRefinement, texts, wires.length]);

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

    const cropX = Math.round(bounds.minX - 30);
    const cropY = Math.round(bounds.minY - 30);
    const cropWidth = Math.round(bounds.circuitWidth + 60);
    const cropHeight = Math.round(bounds.circuitHeight + 60);

    // Ultra high-definition PNG export: target 4K (3840px) resolution with minimum 4x scale
    const targetLongEdge = 3840;
    const maxDim = Math.max(cropWidth, cropHeight);
    const scale = Math.min(8, Math.max(4, Math.round((targetLongEdge / maxDim) * 100) / 100));

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

    const clonedSvg = svgRef.current.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.setAttribute('viewBox', `${cropX} ${cropY} ${cropWidth} ${cropHeight}`);
    clonedSvg.setAttribute('width', String(canvas.width));
    clonedSvg.setAttribute('height', String(canvas.height));

    const strokeColor = darkPreview ? '#f8fafc' : '#1e293b';
    clonedSvg.style.color = strokeColor;
    clonedSvg.setAttribute('color', strokeColor);

    const worldGroup = Array.from(clonedSvg.querySelectorAll('g')).find(g => g.getAttribute('transform')?.includes('scale'));
    if (worldGroup) {
      worldGroup.removeAttribute('transform');
    }

    clonedSvg.querySelectorAll('rect[key*="grid-surface"], rect[fill*="workspace-grid"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[style*="cursor: move"], circle[style*="cursor:move"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[r="13"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"], circle[opacity="0"], circle[style*="opacity: 0"]').forEach(el => el.remove());

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
          textEl.setAttribute('font-size', `${text.fontSize || 14}px`);
          textEl.setAttribute('font-family', "'KaTeX_Main', 'KaTeX_Math', serif");
          textEl.style.fontFamily = "'KaTeX_Main', 'KaTeX_Math', serif";
          textEl.style.fontSize = `${text.fontSize || 14}px`;
          populateMathTspans(textEl, text.text, text.fontSize || 14);
          fo.replaceWith(textEl);
        }
      }
    });

    clonedSvg.querySelectorAll('g[color]').forEach(el => {
      el.setAttribute('color', strokeColor);
    });

    let defs = clonedSvg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      clonedSvg.insertBefore(defs, clonedSvg.firstChild);
    }
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      ${KATEX_EMBEDDED_FONT_CSS}
      :root, svg {
        color: ${strokeColor};
      }
      text, tspan {
        font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif;
      }
      .katex {
        font-family: 'KaTeX_Main', 'KaTeX_Math', 'KaTeX_AMS', serif;
      }
    `;
    defs.appendChild(styleEl);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      try {
        const pngUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = 'circuit-schematic.png';
        link.click();
        toast.success('Schematic exported as PNG');
      } catch (err) {
        toast.error('Failed to export PNG image');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Failed to render schematic to PNG');
    };
    img.src = url;
  }, [colors.canvas, colors.grid, components.length, darkPreview, getCircuitBoundingBox, gridSize, gridVisible, tabDGridMode, tabDUiRefinement, texts, wires.length]);

  const moveSelected = useCallback((dx: number, dy: number) => {
    if (selectedComponent) {
      const nextComponents = components.map(component => {
        if (component.id !== selectedComponent.id) return component;
        const next = snapEnabled
          ? snapPointToGrid([component.x + dx, component.y + dy], gridSize)
          : [component.x + dx, component.y + dy];
        return { ...component, x: next[0], y: next[1] };
      });
      const nextWires = refreshCanvasWireEndpoints(wires, nextComponents, selectedComponent.id);
      setComponents(nextComponents);
      setWires(nextWires);
      commitSnapshot({ components: nextComponents, wires: nextWires });
      return;
    }
    if (selectedText) {
      const nextTexts = texts.map(text => text.id === selectedText.id
        ? { ...text, x: text.x + dx, y: text.y + dy }
        : text);
      setTexts(nextTexts);
      commitSnapshot({ texts: nextTexts });
    }
  }, [commitSnapshot, components, gridSize, refreshCanvasWireEndpoints, selectedComponent, selectedText, snapEnabled, texts, wires]);

  const rotateSelected = useCallback((degrees: number) => {
    if (!selectedComponent) return;
    const nextComponents = components.map(component => component.id === selectedComponent.id
      ? { ...component, rotation: (component.rotation + degrees + 360) % 360 }
      : component);
    const nextWires = refreshCanvasWireEndpoints(wires, nextComponents, selectedComponent.id);
    setComponents(nextComponents);
    setWires(nextWires);
    commitSnapshot({ components: nextComponents, wires: nextWires });
  }, [commitSnapshot, components, refreshCanvasWireEndpoints, selectedComponent, wires]);

  const flipSelected = useCallback((axis: 'h' | 'v') => {
    if (!selectedComponent) return;
    const nextComponents = components.map(component => component.id === selectedComponent.id
      ? { ...component, flipH: axis === 'h' ? !component.flipH : component.flipH, flipV: axis === 'v' ? !component.flipV : component.flipV }
      : component);
    const nextWires = refreshCanvasWireEndpoints(wires, nextComponents, selectedComponent.id);
    setComponents(nextComponents);
    setWires(nextWires);
    commitSnapshot({ components: nextComponents, wires: nextWires });
  }, [commitSnapshot, components, refreshCanvasWireEndpoints, selectedComponent, wires]);

  const updateComponent = useCallback((id: string, update: Partial<CircuitComponent>) => {
    const nextComponents = components.map(component => component.id === id ? { ...component, ...update } : component);
    setComponents(nextComponents);
    let nextWires = wires;
    if ('rotation' in update || 'flipH' in update || 'flipV' in update || 'x' in update || 'y' in update) {
      nextWires = refreshCanvasWireEndpoints(wires, nextComponents, id);
      setWires(nextWires);
    }
    commitSnapshot({ components: nextComponents, wires: nextWires });
  }, [commitSnapshot, components, refreshCanvasWireEndpoints, wires]);

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
      return { ...component, props: { ...component.props, [key]: value, ...(diodeMaterial ?? {}), ...(ledPreset ?? {}) } };
    });
    // `state` (switches, breakers, pushbuttons), `manualState` (forced relay/contactor contacts) and
    // an LED's colour all change the circuit electrically rather than cosmetically — SPICE should
    // react to them immediately rather than through the drag-coalescing debounce other edits use.
    const changesCircuit = key === 'state' || key === 'manualState'
      || (selectedComponent.type === 'led' && key === 'color');
    if (changesCircuit) requestEagerSpiceRun();
    setComponents(nextComponents);
    commitSnapshot({ components: nextComponents });
  }, [commitSnapshot, components, requestEagerSpiceRun, selectedComponent]);

  // Its only callers are the momentary pushbutton press/release handlers below — an electrical
  // state change SPICE should react to immediately, not after the drag-coalescing debounce.
  const updateComponentPropsById = useCallback((id: string, updates: Record<string, unknown>) => {
    requestEagerSpiceRun();
    setComponents(previous => previous.map(component => component.id === id
      ? { ...component, props: { ...component.props, ...updates } }
      : component));
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

  const updateText = useCallback((update: Partial<WorkspaceText>) => {
    if (!selectedText) return;
    const nextTexts = texts.map(text => text.id === selectedText.id ? { ...text, ...update } : text);
    setTexts(nextTexts);
    commitSnapshot({ texts: nextTexts });
  }, [commitSnapshot, selectedText, texts]);

  const addWireBetween = useCallback((from: WiringState['from'], target: { componentId: string; terminalId: string; position: Point; axis: TabDTerminalAxis }, lockedCorners: Point[] = []) => {
    if (!from) return;
    if (from.componentId === target.componentId && from.terminalId === target.terminalId) return;
    const duplicate = wires.some(wire => (
      wire.fromComp === from.componentId && wire.fromTerm === from.terminalId && wire.toComp === target.componentId && wire.toTerm === target.terminalId
    ) || (
        wire.fromComp === target.componentId && wire.fromTerm === target.terminalId && wire.toComp === from.componentId && wire.toTerm === from.terminalId
      ));
    if (duplicate) {
      toast.message('These terminals are already connected');
      setWiring({});
      return;
    }
    const routing = lockedCorners.length ? 'manual' : 'orthogonal';
    const obstacles: ObstacleBox[] = components
      .filter(c => c.id !== from.componentId && c.id !== target.componentId)
      .map(c => {
        const def = getDef(c.type);
        const w = (def ? def.width : 40) * visualSymbolScale;
        const h = (def ? def.height : 40) * visualSymbolScale;
        const margin = 4;
        return {
          xMin: c.x - w / 2 - margin,
          xMax: c.x + w / 2 + margin,
          yMin: c.y - h / 2 - margin,
          yMax: c.y + h / 2 + margin,
        };
      });

    const path = tabDTerminalOrthogonalPath(from.position, target.position, from.axis, target.axis, gridSize, lockedCorners, obstacles);

    const waypoints = lockedCorners.length > 0 ? path.slice(1, -1) : undefined;

    const wire: CircuitWire = {
      id: nanoid(10),
      fromComp: from.componentId,
      fromTerm: from.terminalId,
      toComp: target.componentId,
      toTerm: target.terminalId,
      routing,
      path,
      waypoints,
    };
    const nextWires = [...wires, wire];
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
    setSelection({ kind: 'wire', id: wire.id });
    setWiring({});
    toast.success('Wire connected');
  }, [commitSnapshot, components, gridSize, visualSymbolScale, wires]);

  const findWireNearPoint = useCallback((point: Point, threshold = 14): { wire: CircuitWire; projection: NonNullable<ReturnType<typeof projectPointOntoWire>> } | null => {
    let bestMatch: { wire: CircuitWire; projection: NonNullable<ReturnType<typeof projectPointOntoWire>> } | null = null;
    for (const wire of wires) {
      const proj = projectPointOntoWire(point, wire.path, gridSize);
      if (proj && proj.distance <= threshold) {
        if (!bestMatch || proj.distance < bestMatch.projection.distance) {
          bestMatch = { wire, projection: proj };
        }
      }
    }
    return bestMatch;
  }, [gridSize, wires]);

  const connectWireToExistingWire = useCallback((
    from: NonNullable<WiringState['from']>,
    targetWire: CircuitWire,
    targetPoint: Point,
    lockedCorners: Point[] = [],
  ) => {
    const proj = projectPointOntoWire(targetPoint, targetWire.path, gridSize);
    if (!proj) return;

    const junctionPoint = proj.point;
    const targetAxis = proj.axis;

    if (
      (from.componentId === targetWire.fromComp && from.terminalId === targetWire.fromTerm) ||
      (from.componentId === targetWire.toComp && from.terminalId === targetWire.toTerm)
    ) {
      toast.message('Already connected to this wire');
      setWiring({});
      return;
    }

    const newPath = routeTJunctionPath(from.position, junctionPoint, targetAxis, lockedCorners, from.axis);
    const waypoints = newPath.length > 2 ? newPath.slice(1, -1) : undefined;
    const junctionId = `junc_${nanoid(10)}`;

    const incomingWire: CircuitWire = {
      id: nanoid(10),
      fromComp: from.componentId,
      fromTerm: from.terminalId,
      toComp: junctionId,
      toTerm: 'p',
      routing: lockedCorners.length ? 'manual' : 'orthogonal',
      path: newPath,
      waypoints,
    };

    const splitPath1 = simplifyOrthogonalPath([...targetWire.path.slice(0, proj.segmentIndex + 1), junctionPoint]);
    const splitPath2 = simplifyOrthogonalPath([junctionPoint, ...targetWire.path.slice(proj.segmentIndex + 1)]);

    const wire1: CircuitWire = {
      ...targetWire,
      toComp: junctionId,
      toTerm: 'p',
      path: splitPath1,
      waypoints: splitPath1.length > 2 ? splitPath1.slice(1, -1) : undefined,
    };

    const wire2: CircuitWire = {
      ...targetWire,
      id: nanoid(10),
      fromComp: junctionId,
      fromTerm: 'p',
      path: splitPath2,
      waypoints: splitPath2.length > 2 ? splitPath2.slice(1, -1) : undefined,
    };

    const nextWires = [
      ...wires.map(w => w.id === targetWire.id ? wire1 : w),
      wire2,
      incomingWire,
    ];
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });

    setSelection({ kind: 'wire', id: incomingWire.id });
    setWiring({});
    toast.success('Wire connected and split at junction');
  }, [commitSnapshot, gridSize, wires]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    if (event.button === 1 || event.button === 2 || event.altKey) {
      event.preventDefault();
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }
    if (event.button !== 0) return;

    const terminal = findTerminalAt(point);
    if (terminal) {
      if (!wiring.from) setWiring({ from: terminal, lockedCorners: [] });
      else addWireBetween(wiring.from, terminal, wiring.lockedCorners);
      return;
    }

    if (wiring.from) {
      const hitWire = findWireNearPoint(point);
      if (hitWire) {
        connectWireToExistingWire(wiring.from, hitWire.wire, hitWire.projection.point, wiring.lockedCorners);
        return;
      }

      const snapped = snapEnabled ? snapPointToGrid(point, gridSize) : point;
      const anchor = wiring.lockedCorners?.at(-1) ?? wiring.from.position;
      let corner = anchor;
      if (wiring.lockedCorners && wiring.lockedCorners.length > 0) {
        corner = lockTabDWireCorner(anchor, snapped);
      } else if (wiring.from.axis === 'horizontal') {
        corner = [snapped[0], anchor[1]];
      } else if (wiring.from.axis === 'vertical') {
        corner = [anchor[0], snapped[1]];
      } else {
        corner = lockTabDWireCorner(anchor, snapped);
      }
      if (corner[0] !== anchor[0] || corner[1] !== anchor[1]) {
        setWiring(current => current.from ? { ...current, lockedCorners: [...(current.lockedCorners ?? []), corner] } : current);
      }
      return;
    }

    const component = findComponentAt(point);
    if (component) {
      setSelection({ kind: 'component', id: component.id });
      setMarqueeIds([component.id]);
      const control = tabDUiRefinement ? directControlKind(component.type) : null;
      if (control === 'momentary') {
        activeMomentaryControlRef.current = component.id;
        updateComponentPropsById(component.id, momentaryControlProps(true));
        return;
      }
      // A latching control still sets up the drag below; the mouse-up decides between the two.
      if (control === 'latching') {
        latchingClickRef.current = { id: component.id, origin: point };
      }
      dragStartSnapshotRef.current = cloneSnapshot({
        components: componentRef.current,
        wires: wiresRef.current,
        texts: textsRef.current,
      });
      setDragState({ kind: 'component', id: component.id, offset: [point[0] - component.x, point[1] - component.y] });
      return;
    }

    setSelection(null);
    setMarqueeIds([]);
    setDragState({ kind: 'marquee', start: point, end: point });
  }, [addWireBetween, clientToWorld, connectWireToExistingWire, findComponentAt, findTerminalAt, findWireNearPoint, gridSize, snapEnabled, tabDUiRefinement, updateComponentPropsById, wiring.from, wiring.lockedCorners]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    if (!dragState) return;
    const pendingClick = latchingClickRef.current;
    if (pendingClick && Math.hypot(point[0] - pendingClick.origin[0], point[1] - pendingClick.origin[1]) > CLICK_DRAG_TOLERANCE) {
      latchingClickRef.current = null;
    }
    if (dragState.kind === 'pan') {
      const dx = event.clientX - dragState.client[0];
      const dy = event.clientY - dragState.client[1];
      setPan(previous => [previous[0] + dx, previous[1] + dy]);
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }
    if (dragState.kind === 'marquee') {
      setDragState({ ...dragState, end: point });
      return;
    }
    if (dragState.kind === 'component') {
      const position = snapEnabled
        ? snapPointToGrid([point[0] - dragState.offset[0], point[1] - dragState.offset[1]], gridSize)
        : [point[0] - dragState.offset[0], point[1] - dragState.offset[1]];
      const nextComponents = componentRef.current.map(component => component.id === dragState.id
        ? { ...component, x: position[0], y: position[1] }
        : component);
      setComponents(nextComponents);
      setWires(previous => refreshCanvasWireEndpoints(previous, nextComponents, dragState.id));
      return;
    }
    if (dragState.kind === 'text') {
      const position = snapEnabled
        ? snapPointToGrid([point[0] - dragState.offset[0], point[1] - dragState.offset[1]], gridSize)
        : [point[0] - dragState.offset[0], point[1] - dragState.offset[1]];
      setTexts(previous => previous.map(text => text.id === dragState.id ? { ...text, x: position[0], y: position[1] } : text));
      return;
    }
    if (dragState.kind === 'wireCorner') {
      const position = snapEnabled ? snapPointToGrid(point, gridSize) : point;
      setWires(previous => previous.map(wire => {
        if (wire.id !== dragState.id) return wire;
        const newPath = moveTabDOrthogonalLane(wire.path, dragState.corner, position, gridSize);
        const simplified = simplifyOrthogonalPath(newPath);
        return {
          ...wire,
          routing: 'manual',
          path: simplified,
          waypoints: simplified.length > 2 ? simplified.slice(1, -1) : undefined,
        };
      }));
    }
  }, [clientToWorld, dragState, gridSize, refreshCanvasWireEndpoints, snapEnabled]);

  const handleCanvasMouseUp = useCallback(() => {
    releaseMomentaryControl();
    // A press that never became a drag toggles the contact. updateComponentPropsById marks the next
    // SPICE solve eager, so the DMM follows the click with no debounce, running or not.
    const pendingClick = latchingClickRef.current;
    latchingClickRef.current = null;
    if (pendingClick) {
      const clicked = componentRef.current.find(component => component.id === pendingClick.id);
      if (clicked) updateComponentPropsById(clicked.id, nextLatchingControlProps(clicked));
    }
    if (dragStartSnapshotRef.current) {
      const currentSnapshot: CanvasSnapshot = {
        components: componentRef.current,
        wires: wiresRef.current,
        texts: textsRef.current,
      };
      if (!areSnapshotsEqual(dragStartSnapshotRef.current, currentSnapshot)) {
        commitSnapshot(currentSnapshot);
      }
      dragStartSnapshotRef.current = null;
    }
    if (dragState?.kind === 'marquee') {
      const [left, right] = [dragState.start[0], dragState.end[0]].sort((a, b) => a - b);
      const [top, bottom] = [dragState.start[1], dragState.end[1]].sort((a, b) => a - b);
      const compIds = componentRef.current.filter((component) => component.x >= left && component.x <= right && component.y >= top && component.y <= bottom).map((component) => component.id);
      const wireIds = wiresRef.current.filter((wire) => wire.path.some(p => p[0] >= left && p[0] <= right && p[1] >= top && p[1] <= bottom)).map(wire => wire.id);
      const textIds = textsRef.current.filter((text) => text.x >= left && text.x <= right && text.y >= top && text.y <= bottom).map(text => text.id);
      const ids = [...compIds, ...wireIds, ...textIds];
      setMarqueeIds(ids);
      setSelection(ids.length === 1 && compIds.length === 1 ? { kind: 'component', id: compIds[0] } : null);
    }
    setDragState(null);
  }, [commitSnapshot, dragState, releaseMomentaryControl]);

  const handleWireMouseDown = useCallback((event: React.MouseEvent<SVGPathElement>, wire: CircuitWire) => {
    event.stopPropagation();
    if (wiring.from) {
      const point = clientToWorld(event.clientX, event.clientY);
      connectWireToExistingWire(wiring.from, wire, point, wiring.lockedCorners);
      return;
    }
    setSelection({ kind: 'wire', id: wire.id });
  }, [clientToWorld, connectWireToExistingWire, wiring.from, wiring.lockedCorners]);

  const handleWireDoubleClick = useCallback((event: React.MouseEvent<SVGPathElement>, wire: CircuitWire) => {
    event.stopPropagation();
    const rawPoint = clientToWorld(event.clientX, event.clientY);
    const proj = projectPointOntoWire(rawPoint, wire.path, gridSize);
    if (!proj) return;
    const newPath = insertPointIntoWirePath(wire.path, proj.point, proj.segmentIndex);
    const nextWires = wires.map(current => {
      if (current.id !== wire.id) return current;
      return {
        ...current,
        routing: 'manual' as const,
        path: newPath,
        waypoints: newPath.length > 2 ? newPath.slice(1, -1) : undefined,
      };
    });
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
    setSelection({ kind: 'wire', id: wire.id });
  }, [clientToWorld, commitSnapshot, gridSize, wires]);

  const handleTextMouseDown = useCallback((event: React.MouseEvent<HTMLElement | SVGElement>, text: WorkspaceText) => {
    event.stopPropagation();
    const point = clientToWorld(event.clientX, event.clientY);
    setSelection({ kind: 'text', id: text.id });
    dragStartSnapshotRef.current = cloneSnapshot({
      components: componentRef.current,
      wires: wiresRef.current,
      texts: textsRef.current,
    });
    setDragState({ kind: 'text', id: text.id, offset: [point[0] - text.x, point[1] - text.y] });
  }, [clientToWorld]);

  const handleDrop = useCallback((event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/electrolab-component');
    if (!type) return;
    const position = clientToWorld(event.clientX, event.clientY);
    addComponent(type, position[0], position[1]);
  }, [addComponent, clientToWorld]);

  const updateWireRouting = useCallback((routing: CircuitWire['routing']) => {
    if (!selectedWire) return;
    const endpoints = currentWireEndpoints(selectedWire, components);
    if (!endpoints) return;
    const nextWires = wires.map(wire => wire.id === selectedWire.id
      ? { ...wire, routing, path: routePath(endpoints.from, endpoints.to, routing) }
      : wire);
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
  }, [commitSnapshot, components, selectedWire, wires]);

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
    simulation.current.reset();
    simulation.current.setCircuit(components, wires);
    setSnapshot(simulation.current.getSnapshot());
    setAnimationTime(0);
  }, [components, wires]);

  useEffect(() => {
    simulation.current.setCircuit(components, wires);
    setSnapshot(simulation.current.getSnapshot());
  }, [components, wires]);

  useEffect(() => {
    if (!simulationRunning) return undefined;
    let last = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(0.03, (now - last) / 1000);
      last = now;
      const result = simulation.current.step(Math.max(0.0001, elapsed * simulationSpeed));
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
      nets = resolveCircuitNets(components, wires);
      spiceComponents = convertToSpiceComponents(components, wires, nets, simulationMode);
      const frequency = Math.max(0.001, detectSystemFrequency(components));
      const duration = Math.min(0.5, Math.max(0.02, SPICE_TRAN_PERIODS / frequency));
      netlist = generateNetlist(spiceComponents, { analysis: [`.tran ${duration / 2000} ${duration}`], simulationMode });
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
      clearSpiceReadings({ kind: 'unsupported', reason });
      if (spiceUnsupportedToastRef.current !== reason) {
        spiceUnsupportedToastRef.current = reason;
        toast.error(`SPICE accuracy pass unavailable (${reason}) — using the live engine's readings.`);
      }
      return;
    }

    spiceUnsupportedToastRef.current = null;
    spiceRunContextRef.current = { components, nets, nodeMap: buildSpiceNodeMap(spiceComponents) };
    setSpiceStatus({ kind: 'running' });
    void spiceEngine.runSimulation(netlist);
    // Only the netlist inputs and the hook's own (stable, useCallback-wrapped) `runSimulation`
    // should give this a new identity. Depending on the whole `spiceEngine` object instead — as
    // this used to — broke the debounce below: `useSpiceEngine` returns a new object every render,
    // so during Run (a 60fps state update loop) the debounce timer was reset before it could ever
    // elapse, and SPICE silently stopped re-solving on switch toggles until Pause forced one retry.
  }, [clearSpiceReadings, components, simulationMode, spiceEngine.runSimulation, wires]);

  // Trigger on every circuit edit, debounced so a drag or a burst of keystrokes fires one run — but
  // not a switch/relay toggle: those set `spiceEagerRef` first, so this fires with no delay for
  // exactly the edit the DMM needs to react to right away, live, without waiting for Pause/Reset.
  useEffect(() => {
    const eager = spiceEagerRef.current;
    spiceEagerRef.current = false;
    const timer = window.setTimeout(runSpiceSimulation, eager ? 0 : SPICE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [runSpiceSimulation]);

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
      clearSpiceReadings({ kind: 'unsupported', reason: spiceEngine.error });
      return;
    }
    if (!spiceEngine.results) return;
    const results = parseSpiceResults(spiceEngine.results, spiceEngine.results.time ?? []);
    spiceReadingsRef.current = buildSpiceInstrumentReadings(context.components, context.nets, context.nodeMap, results);
    setSpiceReadingsVersion(version => version + 1);
    setSpiceStatus({ kind: 'ready' });
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

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key === 'Escape') {
        setWiring({});
        setSelection(null);
        return;
      }
      if (event.key.toLowerCase() === 'w') {
        setWiring(previous => previous.from ? {} : previous);
        toast.message('Click a terminal to start wiring');
        return;
      }
      if (event.key.toLowerCase() === 't') {
        addText();
        return;
      }
      if (event.key === ' ' && selectedComponent) {
        event.preventDefault();
        rotateSelected(90);
        return;
      }
      if (event.key.toLowerCase() === 'r' && selectedComponent) {
        rotateSelected(45);
        return;
      }
      const movement = event.shiftKey ? gridSize * 5 : (snapEnabled ? gridSize : 1);
      const directions: Record<string, Point> = {
        ArrowLeft: [-movement, 0],
        ArrowRight: [movement, 0],
        ArrowUp: [0, -movement],
        ArrowDown: [0, movement],
      };
      if (directions[event.key]) {
        event.preventDefault();
        moveSelected(directions[event.key][0], directions[event.key][1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addText, copySelection, cutSelection, gridSize, handleRedo, handleUndo, moveSelected, pasteClipboard, removeSelection, rotateSelected, selectedComponent, snapEnabled]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
      let categoryItems = getComponentsByCategory(category);
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
      const items = categoryItems.filter(item => !query
        || item.name.toLowerCase().includes(query)
        || item.description.toLowerCase().includes(query));
      if (items.length) all[category] = items;
      return all;
    }, {});
  }, [search, tabDUiRefinement]);

  const linkedCoils = components.filter(component => ['contactor', 'relay-spst', 'relay-spdt', 'relay-dpst'].includes(component.type));

  const wireSnapProjection = useMemo(() => {
    if (wiring.from && dragState?.kind !== 'pan') {
      const hitWire = findWireNearPoint(cursor, 10);
      return hitWire?.projection || null;
    }
    return null;
  }, [cursor, dragState?.kind, findWireNearPoint, wiring.from]);

  return (
    <div className="v3-mae-layout font-sans text-slate-900 dark:text-slate-100" style={{ minHeight: 760, color: colors.text }}>
      <section className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ borderColor: colors.line, background: colors.panel }}>
        <header className="min-w-max" style={{ background: colors.panel, zIndex: 5 }}>
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pt-2" style={{ minHeight: 36 }}>
            <ToolbarButton colors={colors} label="−" title="Zoom out" onClick={() => setZoom(value => Math.max(.2, value / 1.15))} />
            <span style={{ color: colors.muted, fontSize: 11, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
            <ToolbarButton colors={colors} label="+" title="Zoom in" onClick={() => setZoom(value => Math.min(3, value * 1.15))} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Grid3X3 size={14} />} title="Grid" onClick={() => setGridVisible(value => !value)} active={gridVisible} />
            {tabDUiRefinement && <><ToolbarButton colors={colors} label="Dot" title="Dot grid · 25 px" onClick={() => { setTabDGridMode('dots'); setGridVisible(true); }} active={tabDGridMode === 'dots' && gridVisible} /><ToolbarButton colors={colors} label="Cartesian" title="Cartesian grid · 25 px" onClick={() => { setTabDGridMode('cartesian'); setGridVisible(true); }} active={tabDGridMode === 'cartesian' && gridVisible} /><ToolbarButton colors={colors} label="Hidden" title="Hide grid" onClick={() => setTabDGridMode('hidden')} active={tabDGridMode === 'hidden'} /></>}
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Move size={14} />} title="Snap to grid" onClick={() => setSnapEnabled(value => !value)} active={snapEnabled} />
            <ToolbarButton colors={colors} icon={<Cable size={14} />} label="Wire" title="Click one terminal, then another" onClick={() => { setWiring({}); toast.message('Click a terminal to start wiring'); }} active={Boolean(wiring.from)} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Type size={14} />} label="Text" title="Add editable workspace text (T)" onClick={addText} />
            {tabDUiRefinement && <><ToolbarDivider colors={colors} /><ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="90°" title="Rotate selected component 90°" onClick={() => rotateSelected(90)} disabled={!selectedComponent} /><ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="45°" title="Rotate selected component 45°" onClick={() => rotateSelected(45)} disabled={!selectedComponent} /><ToolbarButton colors={colors} icon={<FlipHorizontal size={14} />} label="Flip X" title="Reflect selected component horizontally" onClick={() => flipSelected('h')} disabled={!selectedComponent} /><ToolbarButton colors={colors} icon={<FlipVertical size={14} />} label="Flip Y" title="Reflect selected component vertically" onClick={() => flipSelected('v')} disabled={!selectedComponent} /></>}
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 border-t px-2 py-2" style={{ borderColor: colors.line, minHeight: 36 }}>
            <ToolbarButton colors={colors} icon={<Download size={14} />} label="Export" title="Export circuit as NAD netlist" onClick={exportNad} />
            <ToolbarButton colors={colors} icon={<FileImage size={14} />} label="PNG" title="Export as PNG image" onClick={exportPng} />
            <ToolbarButton colors={colors} icon={<FileCode size={14} />} label="SVG" title="Export as vector SVG" onClick={exportSvg} />
            <ToolbarButton colors={colors} icon={<Upload size={14} />} label="Import" title="Import circuit from NAD netlist" onClick={() => nadInputRef.current?.click()} />
            <input ref={nadInputRef} type="file" accept=".nad,application/x-mae-nad+json,application/json" onChange={importNad} style={{ display: 'none' }} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Undo2 size={14} />} title="Undo (Ctrl/Cmd+Z)" onClick={handleUndo} disabled={!history.canUndo} />
            <ToolbarButton colors={colors} icon={<Redo2 size={14} />} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={handleRedo} disabled={!history.canRedo} />
            <ToolbarButton colors={colors} icon={<Maximize2 size={14} />} title="Auto-scale / Center circuit" onClick={zoomToFit} />
            <ToolbarButton colors={colors} icon={<Scissors size={14} />} title="Cut (Ctrl/Cmd+X)" onClick={cutSelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Copy size={14} />} title="Copy (Ctrl/Cmd+C)" onClick={copySelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Clipboard size={14} />} title="Paste (Ctrl/Cmd+V)" onClick={pasteClipboard} disabled={!clipboard || (clipboard.components.length === 0 && clipboard.wires.length === 0 && clipboard.texts.length === 0)} />
            <ToolbarButton colors={colors} icon={<Trash2 size={14} />} title="Delete (Del/Backspace)" onClick={removeSelection} disabled={!selectedComponent && !selectedWire && !selectedText && marqueeIds.length === 0} />
            <ToolbarDivider colors={colors} />
            <button onClick={() => { hasStartedSimulation.current = true; setSimulationRunning(value => !value); }} title={simulationRunning ? 'Pause simulation' : 'Run simulation'} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: (!simulationRunning && hasStartedSimulation.current) ? TAB_GRADIENT_REV : TAB_GRADIENT, color: '#ffffff', fontWeight: 500, padding: '6px 14px', minHeight: 30, borderRadius: 8, fontSize: 12, boxShadow: TAB_ACTIVE_SHADOW, border: '1px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .3s ease' }}>
              {simulationRunning ? <Pause size={14} /> : <Play size={14} />}{simulationRunning ? 'Pause' : 'Run'}
            </button>
            <ToolbarButton colors={colors} label={simulationMode === 'academic' ? 'Academic' : 'Practical'} title="Academic / Practical — toggle SPICE simulation mode" onClick={() => setSimulationMode(mode => mode === 'academic' ? 'practical' : 'academic')} active={simulationMode === 'academic'} />
            <ToolbarButton colors={colors} icon={<Zap size={14} />} title="Show / Hide electron flow" onClick={() => setShowElectrons(v => { const next = !v; try { localStorage.setItem('mae-show-electrons', String(next)); } catch { } return next; })} active={showElectrons} />
            <ToolbarButton colors={colors} icon={<RotateCcw size={14} />} title="Reset simulation" onClick={resetSimulation} />
            <span style={{ fontSize: 11, minWidth: 55, color: colors.muted, fontVariantNumeric: 'tabular-nums' }}>{snapshot.time.toFixed(3)} s</span>
            <ToolbarDivider colors={colors} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input aria-label="Simulation speed" type="range" min={.25} max={4} step={.25} value={simulationSpeed} onChange={event => setSimulationSpeed(numeric(event.target.value, 1))} className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow" />
              <span style={{ color: colors.muted, fontSize: 10 }}>{simulationSpeed.toFixed(2)}×</span>
            </div>
          </div>
        </header>
      </section>

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[236px_minmax(0,1fr)_286px]">
        <aside className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column', height: '700px' }}>
          <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Component Library</div></div>
          <div style={{ padding: 10, borderBottom: `1px solid ${colors.line}` }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: colors.subtle }} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search components" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.line}`, outline: 'none', background: colors.input, color: colors.text, borderRadius: 7, padding: '8px 9px 8px 29px', fontSize: 11 }} />
            </div>
          </div>
          <div style={{ overflowY: 'auto', padding: '6px 6px 14px' }}>
            {Object.entries(filteredCategories).map(([category, items]) => {
              const collapsed = collapsedCategories.has(category);
              return (
                <section key={category} style={{ marginBottom: 3 }}>
                  <button onClick={() => setCollapsedCategories(previous => {
                    const next = new Set(previous);
                    if (next.has(category)) next.delete(category); else next.add(category);
                    return next;
                  })} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: '8px 5px', fontSize: 11, fontWeight: 750 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{category}</span>
                    <span style={{ color: colors.subtle, fontWeight: 600 }}>{items.length}</span>
                  </button>
                  {!collapsed && <div className={tabDUiRefinement ? 'grid grid-cols-2 gap-2 px-1 pb-3' : undefined}>{items.map(item => (
                    <button
                      key={item.id}
                      draggable
                      onDragStart={event => {
                        event.dataTransfer.setData('application/electrolab-component', item.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addComponent(item.id)}
                      className={tabDUiRefinement ? 'flex h-[110px] flex-col overflow-hidden rounded-md border transition-all active:scale-[.97]' : undefined}
                      style={tabDUiRefinement ? { borderColor: colors.line, background: colors.panel, cursor: 'grab' } : { width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: colors.muted, cursor: 'grab', borderRadius: 6, padding: '7px 8px', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 2 }}
                      onMouseEnter={event => { event.currentTarget.style.background = colors.panelAlt; if (!tabDUiRefinement) event.currentTarget.style.color = colors.text; }}
                      onMouseLeave={event => { event.currentTarget.style.background = tabDUiRefinement ? colors.panel : 'transparent'; if (!tabDUiRefinement) event.currentTarget.style.color = colors.muted; }}
                    >
                      {tabDUiRefinement ? (
                        <>
                          {/* Top Section: Scaled & Centered Canvas */}
                          <div className="flex flex-1 min-h-0 w-full items-center justify-center p-2">
                            <ComponentPaletteIcon definition={item} colors={colors} documented={tabDUiRefinement} />
                          </div>
                          {/* Bottom Section: Fixed height banner with overflow-visible to prevent KaTeX clipping */}
                          <div className="flex h-7 w-full shrink-0 items-center justify-center border-t overflow-visible px-2" style={{ borderColor: colors.line, background: `${colors.line}15` }}>
                            <span className="flex items-center justify-center text-[10px] font-bold tracking-wider overflow-visible" style={{ color: colors.muted, lineHeight: 1 }}>
                              <ElectricalLabel label={item.name} />
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'inherit', fontWeight: 650 }}><ElectricalLabel label={item.name} /></span>
                          <span style={{ color: colors.subtle, fontSize: 9, lineHeight: 1.25 }}>{item.description}</span>
                        </>
                      )}
                    </button>
                  ))}</div>}
                </section>
              );
            })}
          </div>
        </aside>

        <main className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.canvas, borderColor: colors.line }}>
          <div className="flex items-start justify-between border-b px-4 py-2" style={{ borderColor: colors.line }}><div><div className={CONTROL_SYSTEMS_HEADING}>Interactive Electrical Canvas</div></div><div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.muted }}>{components.length} CMP · {wires.length} NET</div></div>
          {workspaceAlert && <div className="border-b px-3 py-3" style={{ borderColor: `${colors.danger}55`, background: `${colors.danger}09` }}><Alert variant="destructive" style={{ borderColor: `${colors.danger}66`, background: `${colors.panel}e8`, color: colors.text }}><Info /><AlertTitle className="flex items-center justify-between gap-3" style={{ color: colors.danger, fontSize: 12, fontWeight: 800 }}><span>{workspaceAlert.title}</span><span className="font-mono text-[9px] font-bold tracking-[.12em]" style={{ color: colors.muted }}>{workspaceAlert.label}</span></AlertTitle><AlertDescription style={{ color: colors.muted, fontSize: 11, lineHeight: 1.45 }}>{workspaceAlert.message}</AlertDescription></Alert></div>}
          <svg ref={svgRef} onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp} onContextMenu={event => event.preventDefault()} onDragOver={event => event.preventDefault()} onDrop={handleDrop} style={{ width: '100%', height: '100%', display: 'block', cursor: dragState?.kind === 'pan' ? 'grabbing' : wiring.from ? 'crosshair' : 'default', touchAction: 'none' }}>
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0,0 L 6,3 L 0,6 Z" fill="#64748b" /></marker>
              {activeMeshTrace?.meshCycles?.map((cycle) => <marker key={cycle.index} id={`mesh-arrow-${cycle.index}`} markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M 0,1 L 6,3.5 L 0,6 Z" fill={MESH_LOOP_COLORS[cycle.index % MESH_LOOP_COLORS.length]} /></marker>)}
              <pattern key={`grid-pattern-${tabDUiRefinement ? tabDGridMode : 'base'}`} id={`workspace-grid-${tabDUiRefinement ? tabDGridMode : 'base'}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">{tabDUiRefinement && tabDGridMode === 'dots' ? <circle cx="0" cy="0" r={1.65} fill={darkPreview ? '#6d91c4' : '#7a93b1'} fillOpacity={.9} /> : <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={tabDUiRefinement ? (darkPreview ? '#3d5f8c' : '#a8b8cc') : colors.grid} strokeWidth={tabDUiRefinement ? 1.15 : 1} strokeOpacity={tabDUiRefinement ? .85 : 1} />}</pattern>
            </defs>
            <g transform={`translate(${pan[0]},${pan[1]}) scale(${zoom})`}>
              {gridVisible && (!tabDUiRefinement || tabDGridMode !== 'hidden') && <rect key={`grid-surface-${tabDUiRefinement ? tabDGridMode : 'base'}`} x={-5000} y={-5000} width={10000} height={10000} fill={`url(#workspace-grid-${tabDUiRefinement ? tabDGridMode : 'base'})`} />}
              {dragState?.kind === 'marquee' && <rect x={Math.min(dragState.start[0], dragState.end[0])} y={Math.min(dragState.start[1], dragState.end[1])} width={Math.abs(dragState.end[0] - dragState.start[0])} height={Math.abs(dragState.end[1] - dragState.start[1])} fill={`${colors.selection}18`} stroke={colors.selection} strokeWidth={1.2} strokeDasharray="5 4" pointerEvents="none" />}

              {activeMeshTrace?.meshCycles?.map((cycle) => <MeshLoopOverlay key={`mesh-cycle-${cycle.index}`} cycle={cycle} tabDUiRefinement={tabDUiRefinement} components={components} scale={visualSymbolScale} />)}

              {wires.map(wire => {
                const selected = selection?.kind === 'wire' && selection.id === wire.id;
                const phase = snapshot.wirePhases?.[wire.id] ?? 0;
                const path = wire.path;
                const renderPath = pointsToPath(path);
                const normalizedOffset = ((phase % 1) + 1) % 1;
                // Persistent charge particles: uniform spacing based solely on physical length (N = floor(length / spacing))
                const numDots = Math.max(1, Math.floor(pathLength(path) / 45));
                const dots = getDotsOnPath(path, numDots, normalizedOffset);
                const isSensingWire = false;
                const isSensingParentSelected = false;
                return (
                  <g key={wire.id}>
                    <path d={renderPath} fill="none" stroke="transparent" strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" onMouseDown={event => handleWireMouseDown(event, wire)} onDoubleClick={event => handleWireDoubleClick(event, wire)} style={{ cursor: 'pointer' }} />
                    <path d={renderPath} fill="none" stroke={colors.text} strokeWidth={1.5} strokeDasharray={isSensingWire ? "3 3" : undefined} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
                    {showElectrons && dots.map((dot, index) => <circle key={index} cx={dot[0]} cy={dot[1]} r={3} fill={colors.powered} opacity={1} pointerEvents="none" />)}
                    {wire.toComp.startsWith('junc_') && <circle cx={path[path.length - 1][0]} cy={path[path.length - 1][1]} r={3.5} fill={colors.text} stroke={colors.canvas} strokeWidth={1.5} pointerEvents="none" />}
                    {selected && wire.path.length > 2 && wire.path.slice(1, -1).map((corner, index) => {
                      const cornerIndex = index + 1;
                      return <circle key={`${wire.id}-${cornerIndex}`} cx={corner[0]} cy={corner[1]} r={6} fill={colors.panel} stroke={colors.selection} strokeWidth={2} onMouseDown={event => {
                        event.stopPropagation();
                        dragStartSnapshotRef.current = cloneSnapshot({ components: componentRef.current, wires: wiresRef.current, texts: textsRef.current });
                        setDragState({ kind: 'wireCorner', id: wire.id, corner: cornerIndex });
                      }} style={{ cursor: 'move' }} />;
                    })}
                  </g>
                );
              })}

              {wiring.from && <path d={pointsToPath(tabDOrthogonalDraftPath(wiring.from.position, wireSnapProjection ? wireSnapProjection.point : cursor, wiring.lockedCorners, wiring.from.axis))} fill="none" stroke={colors.accent} strokeDasharray="6 4" strokeWidth={1.6} opacity={.75} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
              {wireSnapProjection && <circle cx={wireSnapProjection.point[0]} cy={wireSnapProjection.point[1]} r={6} fill="none" stroke={colors.accent} strokeWidth={2} pointerEvents="none" />}
              {wiring.lockedCorners?.map((corner, index) => (
                <circle key={`corner-${index}`} cx={corner[0]} cy={corner[1]} r={3} fill={colors.panel} stroke={colors.accent} strokeWidth={1.2} pointerEvents="none" />
              ))}

              {components.map(component => {
                const definition = getDef(component.type);
                if (!definition) return null;
                const isSelected = (selection?.kind === 'component' && selection.id === component.id) || marqueeIds.includes(component.id);
                let powered = Boolean(snapshot.componentPowered[component.id]);
                if (['relay-spst', 'relay-spdt', 'relay-dpst', 'contactor'].includes(component.type)) {
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
                } else if (['aux-contact-no', 'aux-contact-nc'].includes(component.type) && component.props?.linkedTo) {
                  const linkedCoil = components.find(c => ['contactor', 'relay-spst', 'relay-spdt', 'relay-dpst'].includes(c.type) && c.label === component.props.linkedTo);
                  if (linkedCoil) {
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
                const intensity = snapshot.componentIntensity[component.id] ?? 0;
                const reading = effectiveSnapshot.instrumentReadings[component.id];
                const transform = `translate(${component.x},${component.y})`;
                const symbolTransform = `rotate(${component.rotation}) scale(${component.flipH ? -1 : 1},${component.flipV ? -1 : 1}) scale(${isExactCadComponent(component.type) ? 1 : visualSymbolScale})`;
                return (
                  <g
                    key={component.id}
                    transform={transform}
                    onPointerEnter={() => setHoveredComponentId(component.id)}
                    onPointerLeave={() => setHoveredComponentId(null)}
                  >
                    <g transform={symbolTransform} color={isSelected ? colors.selection : undefined}>
                      {renderSymbol(definition.symbol, powered, { ...component.props, isEnergized: powered, _intensity: intensity, _documentedStyle: tabDUiRefinement }, animationTime)}
                      {component.type === 'oscilloscope' && <ScopeTrace reading={effectiveSnapshot.instrumentReadings[`${component.id}:ch1`]} color="#38bdf8" />}
                    </g>
                    {definition.terminals.map(terminal => {
                      const snappedWorld = getCanvasTerminalPosition(component, terminal.id);
                      const rawWorld = getRawCanvasTerminalPosition(component, terminal.id);
                      if (!snappedWorld || !rawWorld) return null;
                      const terminalX = snappedWorld[0] - component.x;
                      const terminalY = snappedWorld[1] - component.y;
                      const starting = wiring.from?.componentId === component.id && wiring.from.terminalId === terminal.id;
                      const terminalVoltage = snapshot.terminalVoltages[terminalKey(component.id, terminal.id)] ?? 0;
                      const energized = Math.abs(terminalVoltage) > .05;
                      const showTerminals = isSelected || hoveredComponentId === component.id || Boolean(wiring.from);
                      return <g key={terminal.id}>
                        <circle cx={terminalX} cy={terminalY} r={TERMINAL_HIT_RADIUS} fill="transparent" />
                        <g style={{ opacity: showTerminals ? 1 : 0, transition: 'opacity 0.2s ease-in-out' }} pointerEvents="none">
                          <circle cx={terminalX} cy={terminalY} r={TERMINAL_RADIUS} fill={starting ? colors.accent : energized ? colors.powered : colors.panel} stroke={wiring.from ? colors.primary : colors.muted} strokeWidth={1.4} />
                          {terminal.name && component.type !== 'oscilloscope' && <text x={terminalX} y={terminalY - 8} textAnchor="middle" fontSize={7} fontWeight={400} fill={colors.muted}>{terminal.name}</text>}
                        </g>
                      </g>;
                    })}
                    {isSelected && (component.type === 'cccs' || component.type === 'ccvs' || component.type === 'vcvs' || component.type === 'vccs') && typeof component.props.controlSourceId === 'string' && component.props.controlSourceId && (() => {
                      const sensedComponent = components.find(c => c.label === component.props.controlSourceId || c.id === component.props.controlSourceId);
                      if (!sensedComponent) return null;
                      const dx = sensedComponent.x - component.x;
                      const dy = sensedComponent.y - component.y;
                      return <line x1={0} y1={0} x2={dx} y2={dy} stroke={colors.selection} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} pointerEvents="none" />;
                    })()}
                  </g>
                );
              })}

              {/* Dedicated Component Labels World Overlay Layer (0° Upright Orientation, No Upside Down / Rotated Labels) */}
              <g className="v3-component-labels-layer" pointerEvents="none" style={{ userSelect: 'none' }}>
                {components.map(component => {
                  if (component.type === 'dmm') return null; // Completely hide DMM canvas label
                  const definition = getDef(component.type);
                  if (!definition) return null;

                  // Read the display visibility flags
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
                  const value = componentDisplayValue(definition, component);
                  const isGround = component.type === 'ground' || /^GND\d*$/i.test(component.label);
                  const labelMatch = isGround
                    ? null
                    : (component.label.match(/^([A-Z])_?([a-z0-9]+)$/) ??
                      component.label.match(/^([A-Za-z]+)_?(\d+)$/));
                  const refFill = darkPreview ? '#f1f5f9' : '#1e293b';
                  const valFill = darkPreview ? '#94a3b8' : '#64748b';

                  return (
                    <g key={`labels-${component.id}`}>
                      {/* Component Reference Label */}
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
                          {labelMatch ? (
                            <>
                              <tspan
                                fontFamily="'KaTeX_Math', serif"
                                fontStyle="italic"
                                style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', serif" }}
                              >
                                {labelMatch[1]}
                              </tspan>
                              <tspan
                                dy="2.5"
                                fontFamily="'KaTeX_Main', serif"
                                fontSize="9.5px"
                                fontStyle="normal"
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 400,
                                  fontStyle: 'normal',
                                  fontFamily: "'KaTeX_Main', serif",
                                }}
                              >
                                {labelMatch[2]}
                              </tspan>
                            </>
                          ) : isGround ? (
                            <tspan
                              fontFamily="'KaTeX_Main', serif"
                              fontStyle="normal"
                              style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
                            >
                              GND
                            </tspan>
                          ) : (
                            <tspan
                              fontFamily="'KaTeX_Math', 'KaTeX_Main', serif"
                              fontStyle="italic"
                              style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif" }}
                            >
                              {component.label}
                            </tspan>
                          )}
                        </text>
                      )}

                      {/* Component Value Label */}
                      {value && !hideValue && (
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
                      )}
                    </g>
                  );
                })}
              </g>

              {texts.map(text => (
                <g
                  key={text.id}
                  data-text-id={text.id}
                  transform={`translate(${text.x},${text.y}) rotate(${text.rotation})`}
                  onMouseDown={event => handleTextMouseDown(event, text)}
                  style={{ cursor: 'move' }}
                >
                  <foreignObject x={0} y={0} width={1} height={1} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                    <div style={{ width: 'max-content', color: text.color, fontSize: text.fontSize, fontWeight: 400, userSelect: 'none', display: 'flex', border: selection?.kind === 'text' && selection.id === text.id ? `1px dashed ${colors.selection}` : 'none', padding: 4, transform: 'translate(-4px, -4px)' }}>
                      <V3Math math={text.text} />
                    </div>
                  </foreignObject>
                </g>
              ))}

              {/* V_i labels deliberately render last: they remain readable above grid, wires, symbols, and workspace text. */}
              {activeNodalTrace?.nodalNodes?.filter((node) => node.centroid[0] !== 0 || node.centroid[1] !== 0).map((node) => <NodalNodeOverlay key={`nodal-node-${node.node}`} node={node} colors={colors} />)}
            </g>
          </svg>

          {components.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                <div className="px-6 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm mb-3 dark:bg-slate-900 dark:border-slate-800">
                  <span className="text-base font-semibold text-slate-900 tracking-tight dark:text-white">
                    Canvas Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-normal">
                  Drag and drop components from the library to begin circuit design.
                </p>
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: `${colors.panel}e8`, border: `1px solid ${colors.line}`, color: colors.muted, borderRadius: 8, fontSize: 10, boxShadow: 'none', pointerEvents: 'none' }}>
            <span>{components.length} components</span><span>•</span><span>{wires.length} wires</span>
            {simulationRunning && <span style={{ marginLeft: 'auto', color: colors.accent, fontWeight: 750 }}>SIMULATION RUNNING</span>}
            {spiceStatus.kind === 'running' && <span style={{ color: colors.muted, fontWeight: 750 }}>SPICE ACCURACY PASS…</span>}
            {spiceStatus.kind === 'ready' && <span style={{ color: colors.accent, fontWeight: 750 }}>SPICE-VERIFIED</span>}
            {spiceStatus.kind === 'unsupported' && <span title={spiceStatus.reason} style={{ color: colors.muted, fontWeight: 750 }}>SPICE UNAVAILABLE · LIVE ENGINE</span>}
            {!snapshot.converged && <span style={{ marginLeft: 'auto', color: colors.danger, fontWeight: 750 }}>CHECK CIRCUIT WARNINGS</span>}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
          <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Active Element &amp; Properties</div></div>
          {selectedComponent ? (
            <ComponentInspector colors={colors} component={selectedComponent} definition={getDef(selectedComponent.type)!} allComponents={components} linkedCoils={linkedCoils} reading={effectiveSnapshot.instrumentReadings[selectedComponent.id]} snapshot={effectiveSnapshot} tabDUiRefinement={tabDUiRefinement} onLabelChange={label => updateComponent(selectedComponent.id, { label })} onPropertyChange={updateComponentProperty} onDelete={removeSelection} />
          ) : selectedWire ? (
            <WireInspector colors={colors} wire={selectedWire} tabDUiRefinement={tabDUiRefinement} onRouting={updateWireRouting} onAddCorner={addSelectedWireCorner} onNudge={nudgeSelectedWire} onDelete={removeSelection} />
          ) : selectedText ? (
            <TextInspector colors={colors} text={selectedText} onUpdate={updateText} onMove={moveSelected} onDelete={removeSelection} />
          ) : null}
          {snapshot.warnings.length > 0 && (
            <div style={{ margin: '10px', border: `1px solid ${colors.danger}55`, background: `${colors.danger}0d`, borderRadius: 8, padding: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: colors.danger, fontSize: 10, fontWeight: 780 }}><Info size={13} /> Circuit status</div>
              {snapshot.warnings.slice(0, 3).map((warning, index) => <div key={`${warning.code}-${index}`} style={{ marginTop: 5, fontSize: 10, color: colors.muted, lineHeight: 1.35 }}>{warning.message}</div>)}
            </div>
          )}
          <PersistentDmmPanel colors={colors} dmms={components.filter(c => c.type === 'dmm')} snapshot={effectiveSnapshot} />
        </aside>
      </div>
      <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.panel, borderColor: colors.line }}>
        <div className="border-b px-5 py-3" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Academic Analysis Workspace</div></div>
        <AnalysisBox elements={dcMna.elements} geometry={meshGeometry} nodalNodes={nodalGeometry} colors={colors} standalone onTraceChange={handleAnalysisTrace} />
      </section>
    </div>
  );
}

/** Keeps the historical V3 router contract unchanged for Tab B. */
export default function Home() {
  return <V3Home />;
}

interface Palette { background: string; canvas: string; panel: string; panelAlt: string; line: string; text: string; muted: string; subtle: string; primary: string; accent: string; danger: string; selection: string; grid: string; wire: string; powered: string; input: string; shadow: string; }

function ToolbarButton({ colors, icon, label, title, onClick, active, disabled }: { colors: Palette; icon?: React.ReactNode; label?: string; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  const isActive = Boolean(active) && !disabled;
  return <button title={title} onClick={onClick} disabled={disabled} style={{ border: isActive ? '1px solid transparent' : `1px solid ${colors.line}`, background: isActive ? TAB_GRADIENT : colors.panelAlt, color: isActive ? '#ffffff' : disabled ? colors.subtle : colors.muted, borderRadius: 9, padding: '6px 12px', minHeight: 32, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, boxShadow: isActive ? TAB_ACTIVE_SHADOW : 'none', flexShrink: 0, whiteSpace: 'nowrap', transition: 'background .15s ease' }}>{icon}{label}</button>;
}

function ToolbarDivider({ colors }: { colors: Palette }) { return <span style={{ width: 1, height: 20, background: colors.line, margin: '0 1px', flexShrink: 0 }} />; }

function InspectorHeader({ colors, title, subtitle }: { colors: Palette; title: React.ReactNode; subtitle: string }) {
  return <div style={{ padding: '15px 15px 12px', borderBottom: `1px solid ${colors.line}` }}><div><div className="text-sm font-bold uppercase tracking-wider text-black">{title}</div><div className="text-black" style={{ marginTop: 2, fontSize: 10, lineHeight: 1.3 }}>{subtitle}</div></div></div>;
}

function InspectorButton({ colors, children, onClick, danger, active, disabled }: { colors: Palette; children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean }) {
  const tone = danger ? colors.danger : active ? colors.primary : colors.muted;
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, minHeight: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: `1px solid ${tone}55`, borderRadius: 6, background: active || danger ? `${tone}0d` : colors.panelAlt, color: tone, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, fontSize: 10, fontWeight: 700 }}>{children}</button>;
}

function InspectorSection({ colors, label, children }: { colors: Palette; label: string; children: React.ReactNode }) { return <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}><div className="text-[12px] font-bold text-black uppercase tracking-wider" style={{ marginBottom: 8 }}>{label}</div>{children}</section>; }

function PropertyRow({ colors, label, unit, children }: { colors: Palette; label: string; unit?: string; children: React.ReactNode }) { return <label style={{ display: 'grid', gridTemplateColumns: '1fr 132px', gap: 8, alignItems: 'center', marginBottom: 8 }}><span className="text-[13px] font-medium text-black" style={{ lineHeight: 1.25 }}><ElectricalLabel label={label} unit={unit} /></span>{children}</label>; }

function ComponentInspector({ colors, component, definition, allComponents, linkedCoils, reading, snapshot, tabDUiRefinement, onLabelChange, onPropertyChange, onDelete }: { colors: Palette; component: CircuitComponent; definition: ComponentDef; allComponents: CircuitComponent[]; linkedCoils: CircuitComponent[]; reading?: InstrumentReading; snapshot: SimulationSnapshot; tabDUiRefinement: boolean; onLabelChange: (value: string) => void; onPropertyChange: (key: string, value: unknown) => void; onDelete: () => void }) {
  // Check if the component actually has a numeric value to display
  const hasValue = Object.values(definition.properties).some(p => p.type === 'number' && p.unit);

  return <div style={{ overflowY: 'auto', minHeight: 0 }}>
    <InspectorHeader colors={colors} title={<span className="text-black" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}><V3Math math={componentLabelToLatex(component.type === 'ground' ? 'GND' : component.label)} /><span className="text-black" style={{ fontSize: 10, letterSpacing: 0, textTransform: 'none' }}><ElectricalLabel label={definition.name} /></span></span>} subtitle={definition.description} />
    <InspectorSection colors={colors} label="Instance label">
      <PropertyRow colors={colors} label="Reference">
        <input value={component.type === 'ground' ? 'GND' : component.label} disabled={component.type === 'ground'} onChange={event => onLabelChange(component.type === 'ground' ? 'GND' : event.target.value)} style={inputStyle(colors)} />
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

      <div style={{ color: colors.subtle, fontSize: 9, marginTop: 8 }}>Auto reference prefix: {componentPrefix(component.type)}. Auxiliary contacts link to this reference.</div>
    </InspectorSection>
    <InspectorSection colors={colors} label="Electrical properties">
      {Object.entries(definition.properties).map(([key, property]) => {
        // Derived properties (an LED's forwardVoltage, set by its colour) are simulated but not editable.
        if (property.hidden) return null;
        if (component.type === 'impedance' || component.type === 'ac-voltage' || component.type === 'ac-current') {
          const isImpedance = component.type === 'impedance';
          const format = String(component.props.format ?? (isImpedance ? 'rectangular' : 'polar'));

          if (format === 'rectangular' && ['mag', 'ang', 'amplitude', 'phase', 'angleUnit'].includes(key)) return null;
          if (format === 'polar' && ['r', 'x', 'real', 'imag', 'angleUnit'].includes(key)) return null;

          if (format === 'polar' && (key === 'ang' || key === 'phase')) {
            const defaultAng = isImpedance ? 53.13 : 0;
            return (
              <PropertyRow key={key} colors={colors} label={property.label ?? key}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 60px', gap: 5 }}>
                  <input type="number" step="any" value={numeric(component.props[key], defaultAng)} onChange={event => onPropertyChange(key, numeric(event.target.value, defaultAng))} style={inputStyle(colors)} />
                  <select value={String(component.props.angleUnit ?? 'degree')} onChange={event => onPropertyChange('angleUnit', event.target.value)} style={{ ...inputStyle(colors), paddingInline: 5 }}>
                    <option value="degree">deg</option>
                    <option value="radian">rad</option>
                  </select>
                </div>
              </PropertyRow>
            );
          }
        }
        if (key === 'linkedTo') return <PropertyRow key={key} colors={colors} label={property.label ?? key}><select value={String(component.props[key] ?? '')} onChange={event => onPropertyChange(key, event.target.value)} style={inputStyle(colors)}><option value="">Select coil reference</option>{linkedCoils.filter(coil => coil.id !== component.id).map(coil => <option key={coil.id} value={coil.label}>{coil.label} · {getDef(coil.type)?.name}</option>)}</select></PropertyRow>;
        if (key === 'controlSourceId') return <PropertyRow key={key} colors={colors} label={property.label ?? key}><select value={String(component.props[key] ?? '')} onChange={event => onPropertyChange(key, event.target.value)} style={inputStyle(colors)}><option value="">Select target branch/node</option>{allComponents.filter(c => c.id !== component.id && c.type !== 'ground').map(c => <option key={c.id} value={c.label}>{c.label} · {getDef(c.type)?.name}</option>)}</select></PropertyRow>;
        const value = component.props[key] ?? property.value;
        const prefixable = tabDUiRefinement && property.type === 'number' && PREFIXABLE_UNITS.has(property.unit ?? '');
        return prefixable
          ? <PrefixedPropertyEditorField key={key} colors={colors} propertyKey={key} label={property.label ?? key} definition={property} value={value} prefix={String(component.props[prefixStateKey(key)] ?? engineeringPrefixFor(numeric(value, numeric(property.value))))} onChange={nextValue => onPropertyChange(key, nextValue)} onPrefixChange={nextPrefix => onPropertyChange(prefixStateKey(key), nextPrefix)} />
          : <PropertyEditorField key={key} colors={colors} label={property.label ?? key} definition={property} value={value} onChange={nextValue => onPropertyChange(key, nextValue)} />;
      })}
    </InspectorSection>
    {component.type === 'oscilloscope' && <ScopeReadingInspector colors={colors} component={component} readings={snapshot.instrumentReadings} />}

  </div>;
}

function PropertyEditorField({ colors, label, definition, value, onChange }: { colors: Palette; label: string; definition: PropertyDef; value: unknown; onChange: (value: unknown) => void }) {
  if (definition.type === 'boolean') return <PropertyRow colors={colors} label={label}><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} style={{ justifySelf: 'start', accentColor: colors.primary }} /></PropertyRow>;
  if (definition.type === 'select') return <PropertyRow colors={colors} label={label} unit={definition.unit}><select value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)}>{definition.options?.map(option => <option key={option} value={option}>{definition.optionLabels?.[option] ?? option}</option>)}</select></PropertyRow>;
  if (definition.type === 'color') return <PropertyRow colors={colors} label={label}><input type="color" value={String(value)} onChange={event => onChange(event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} /></PropertyRow>;
  if (definition.type === 'text') return <PropertyRow colors={colors} label={label}><input value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)} /></PropertyRow>;
  return <PropertyRow colors={colors} label={label} unit={definition.unit}><input type="number" min={definition.min} max={definition.max} step={definition.step ?? 'any'} value={numeric(value)} onChange={event => onChange(numeric(event.target.value, numeric(definition.value)))} style={inputStyle(colors)} /></PropertyRow>;
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
  return <PropertyRow colors={colors} label={label} unit={definition.unit}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 54px', gap: 5 }}><input aria-label={`${propertyKey} numeric value`} type="number" step="any" value={displayValue} onChange={event => onChange(numeric(event.target.value, displayValue) * factor)} style={inputStyle(colors)} /><select aria-label={`${propertyKey} engineering prefix`} value={prefix} onChange={event => selectPrefix(event.target.value)} style={{ ...inputStyle(colors), paddingInline: 5 }} title={`Engineering prefix for ${definition.unit ?? ''}`}>{ENGINEERING_PREFIXES.map(item => <option key={item.key || 'base'} value={item.key}>{item.symbol || '—'}{definition.unit}</option>)}</select></div></PropertyRow>;
}

function WireInspector({ colors, wire, tabDUiRefinement, onRouting, onAddCorner, onNudge, onDelete }: { colors: Palette; wire: CircuitWire; tabDUiRefinement: boolean; onRouting: (routing: CircuitWire['routing']) => void; onAddCorner: () => void; onNudge: (amount: number) => void; onDelete: () => void }) {
  return <div style={{ overflowY: 'auto' }}><InspectorHeader colors={colors} title="Wire path" subtitle={tabDUiRefinement ? 'Tab D uses a one-bend Manhattan route between terminals.' : 'Click to select. Double-click the line or add a corner, then drag the handles.'} /><InspectorSection colors={colors} label="Route">
    <PropertyRow colors={colors} label="Routing"><select value={tabDUiRefinement ? 'orthogonal' : wire.routing} onChange={event => onRouting(event.target.value as CircuitWire['routing'])} disabled={tabDUiRefinement} style={inputStyle(colors)}><option value="orthogonal">Orthogonal</option>{!tabDUiRefinement && <><option value="straight">Straight</option><option value="manual">Manual</option></>}</select></PropertyRow>
    <div style={{ fontSize: 11, color: colors.text, marginBottom: 7 }}>Geometric length: <strong>{pathLength(wire.path).toFixed(1)} px</strong></div>
    {!tabDUiRefinement && <div style={{ display: 'flex', gap: 5 }}><InspectorButton colors={colors} onClick={onAddCorner}><Plus size={13} />Corner</InspectorButton><InspectorButton colors={colors} onClick={() => onNudge(-20)}><Minus size={13} />Bend</InspectorButton><InspectorButton colors={colors} onClick={() => onNudge(20)}><Plus size={13} />Bend</InspectorButton></div>}
  </InspectorSection><InspectorSection colors={colors} label="Electrical meaning"><p style={{ color: colors.muted, fontSize: 10, lineHeight: 1.45, margin: 0 }}>Wire geometry is editable for documentation and layout. The ideal wire remains a zero-ohm connection in the solver; electron markers only appear when solved branch current exists.</p></InspectorSection></div>;
}

function TextInspector({ colors, text, onUpdate, onMove, onDelete }: { colors: Palette; text: WorkspaceText; onUpdate: (update: Partial<WorkspaceText>) => void; onMove: (dx: number, dy: number) => void; onDelete: () => void }) {
  return <div style={{ overflowY: 'auto' }}><InspectorHeader colors={colors} title="Workspace text" subtitle="Editable annotation that can be placed anywhere in the schematic." /><InspectorSection colors={colors} label="Text properties"><PropertyRow colors={colors} label="Content"><input value={text.text} onChange={event => onUpdate({ text: event.target.value })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Size"><input type="number" min={8} max={72} value={text.fontSize} onChange={event => onUpdate({ fontSize: numeric(event.target.value, 16) })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Color"><input type="color" value={text.color} onChange={event => onUpdate({ color: event.target.value })} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} /></PropertyRow><PropertyRow colors={colors} label="X"><input type="number" value={text.x} onChange={event => onUpdate({ x: numeric(event.target.value, text.x) })} style={inputStyle(colors)} /></PropertyRow><PropertyRow colors={colors} label="Y"><input type="number" value={text.y} onChange={event => onUpdate({ y: numeric(event.target.value, text.y) })} style={inputStyle(colors)} /></PropertyRow></InspectorSection><InspectorSection colors={colors} label="Move"><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}><InspectorButton colors={colors} onClick={() => onMove(0, -20)}><ArrowUp size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(-20, 0)}><ArrowLeft size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(20, 0)}><ArrowRight size={13} /></InspectorButton><InspectorButton colors={colors} onClick={() => onMove(0, 20)}><ArrowDown size={13} /></InspectorButton></div></InspectorSection></div>;
}

function PersistentDmmPanel({ colors, dmms, snapshot }: { colors: Palette; dmms: CircuitComponent[]; snapshot: SimulationSnapshot }) {
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
    <div style={{ marginTop: 'auto', borderTop: `1px solid ${colors.line}`, background: `${colors.line}22` }}>
      <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Live Multimeters</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 10 }}>
        {dmms.map(dmm => {
          const reading = snapshot.instrumentReadings[dmm.id];
          const isShorted = reading?.continuity === true;
          return (
            <div key={dmm.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.subtle, textTransform: 'uppercase', letterSpacing: '.05em' }}>{dmm.label}</div>
              <div style={{ padding: 10, background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 7, textAlign: 'right', color: '#0284c7', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{reading?.status === 'open' ? 'OL' : isShorted ? 'SHORTED' : reading ? <EngineeringMath value={reading.value} unit={reading.unit} /> : '—'}</div>
                <div style={{ marginTop: 4, fontSize: 10, color: '#0369a1' }}>{reading?.status === 'ready' ? (isShorted ? 'Continuity detected' : 'Probe-linked measurement') : reading?.status === 'open' ? 'Open / not fully connected' : 'Connect HI and COM probes'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScopeReadingInspector({ colors, component, readings }: { colors: Palette; component: CircuitComponent; readings: Record<string, InstrumentReading> }) { const channels = ['ch1', 'ch2', 'ch3', 'ch4']; return <InspectorSection colors={colors} label="Live scope acquisition"><div style={{ padding: 8, background: '#0f172a', borderRadius: 7 }}>{channels.map((channel, index) => { const reading = readings[`${component.id}:${channel}`]; return <div key={channel} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 2px', color: ['#38bdf8', '#f472b6', '#facc15', '#a78bfa'][index], fontSize: 10, fontFamily: 'ui-monospace, monospace' }}><span>{channel.toUpperCase()}</span><span>{reading?.status === 'ready' ? <><EngineeringMath value={reading.value} unit={reading.unit} /> <V3Math math="\mathrm{RMS}" /></> : 'not connected'}</span></div>; })}</div><p style={{ color: colors.muted, fontSize: 10, lineHeight: 1.45, margin: '8px 0 0' }}>Each channel is measured against the scope <V3Math math="\mathrm{GND}" /> terminal. The display trace uses sampled solved node voltage history.</p></InspectorSection>; }

function InstrumentText({ reading, x, y, color }: { reading?: InstrumentReading; x: number; y: number; color: string }) { const label = reading?.status === 'open' ? 'OL' : reading?.status === 'ready' ? formatEngineering(reading.value, reading.unit, 2) : '—'; return <text x={x} y={y} textAnchor="middle" fontFamily="monospace" fontSize={9} fontWeight={400} fill={color} pointerEvents="none">{label}</text>; }

function ScopeTrace({ reading, color }: { reading?: InstrumentReading; color: string }) { const samples = reading?.samples?.slice(-80) ?? []; if (samples.length < 2) return null; const values = samples.map(sample => sample.value); const amplitude = Math.max(1e-6, ...values.map(value => Math.abs(value))); const path = values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${-25 + index * (48 / (values.length - 1))},${-10 - (value / amplitude) * 12}`).join(' '); return <path d={path} fill="none" stroke={color} strokeWidth={1.2} pointerEvents="none" />; }

function ElectricalLabel({ label, unit }: { label: string; unit?: string }) {
  const symbol: Record<string, string> = {
    'DC Voltage Source': 'V_{\\mathrm{DC}}', 'AC Voltage Source': 'V_{\\mathrm{AC}}', 'DC Current Source': 'I_{\\mathrm{DC}}', 'AC Current Source': 'I_{\\mathrm{AC}}',
    '3-Phase Source': 'V_{abc}', 'Resistor': 'R', 'Variable Resistor': 'R_{\\mathrm{var}}', 'Capacitor': 'C', 'Inductor': 'L',
    'Voltage': 'V', 'Current': 'I', 'Resistance': 'R', 'Capacitance': 'C', 'Inductance': 'L', 'Frequency': 'f', 'Phase': '\\phi',
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
  const formatted = formatEngineering(value, unit ?? '');
  const match = formatted.match(/^([-+]?\d+(?:\.\d+)?)(?:\s*)(.*)$/);
  if (!match) return <>{formatted}</>;
  const suffix = match[2].trim();
  const suffixMath: Record<string, string> = { 'Ω': '\\Omega', 'kΩ': '\\mathrm{k}\\Omega', 'MΩ': '\\mathrm{M}\\Omega', 'V': '\\mathrm{V}', 'mV': '\\mathrm{mV}', 'A': '\\mathrm{A}', 'mA': '\\mathrm{mA}', 'Hz': '\\mathrm{Hz}', 'kHz': '\\mathrm{kHz}', 'H': '\\mathrm{H}', 'mH': '\\mathrm{mH}', 'F': '\\mathrm{F}', 'µF': '\\mu\\mathrm{F}' };
  return <V3Math math={`${match[1]}\\,${suffixMath[suffix] ?? `\\mathrm{${suffix}}`}`} />;
}

function inputStyle(colors: Palette): React.CSSProperties { return { width: '100%', minWidth: 0, boxSizing: 'border-box', background: colors.input, color: colors.text, border: `1px solid ${colors.line}`, borderRadius: 5, padding: '6px 7px', fontSize: 10, outline: 'none' }; }

