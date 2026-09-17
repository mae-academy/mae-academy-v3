import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* MAE Luminous Technical Atelier: Digital Logic Simulator UI aligned 1:1 with Circuit Simulator
   Toolbar sequence, KaTeX typography, unified properties inspector, and two-tier component cards,
   while preserving the dedicated discrete-event digital simulation engine. */
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
  Settings2,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Upload,
  Zap,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { V3Math } from '@/components/ui/V3Math';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/digital-logic/models/katexSvgFonts';
import { AnalysisBox } from '@/simulators/digital-logic/components/ui-components/AnalysisBox';
import type { AnalysisTrace, MeshCycle, NodalNodeLabel } from '@/simulators/digital-logic/models/analysisTypes';
import {
  COMPONENT_DEFS,
  CATEGORIES,
  getComponentsByCategory,
  getDef,
  type ComponentDef,
  type PropertyDef,
} from '@/simulators/digital-logic/models/componentDefs';
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
  type WireRouting,
  type WorkspaceText,
} from '@/simulators/digital-logic/models/circuitTypes';
import { SimulationEngine } from '@/simulators/digital-logic/engine/simulation';
import { compileNodalGeometry, useDigitalLogicSimulation, type DigitalLogicMnaState } from '../hooks/useDigitalLogicSimulation';
import type { MNAElement } from '@/simulators/digital-logic/engine/mnaSolver';
import { compileMeshGeometry } from '@/simulators/digital-logic/components/meshGeometry';
import { NormalizedCircuitGraph } from '@/simulators/digital-logic/models/NormalizedCircuitGraph';
import { createNadDocument, parseNad, serializeNad } from '@/simulators/digital-logic/models/nadFormat';
import { filterTabDCatalog, filterTabDImportedComponents, isTabDComponentAvailable } from '@/simulators/digital-logic/models/digitalLogicCatalog';
import { alignTabDTerminalToGrid, dynamicRubberBandPath, lockTabDWireCorner, moveTabDOrthogonalLane, tabDGentleWheelZoomFactor, tabDOrthogonalDraftPath, tabDTerminalOrthogonalPath, type TabDTerminalAxis } from '@/simulators/digital-logic/components/digitalLogicCanvasGeometry';
import { getLogicComponentBounds, getLogicComponentTerminals } from '@/simulators/digital-logic/models/logicGateContract';
import { DiscreteEventLogicEngine, LOGIC_COMPONENT_TYPES, type LogicState } from '@/simulators/digital-logic/engine/desLogicCore';
import { dynamicScaleConfigFor, logicBlockGeometryFor, logicBlockLayoutFor, normalizeDynamicScaleValue, pruneWiresForTerminalSet } from '@/simulators/digital-logic/components/dynamicLogicGeometry';
import { defaultInputShortcut, findInputByShortcut, inputShortcut, logicIoLabel, normalizeDefaultLogicLabel } from '@/simulators/digital-logic/models/logicInputBindings';
import { renderSymbol } from '@/simulators/digital-logic/components/symbols';
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
  type Point,
} from '@/simulators/digital-logic/models/wiring';
import {
  useHistory,
  areSnapshotsEqual,
  cloneSnapshot,
  type CanvasSnapshot,
} from '@/simulators/digital-logic/components/hooks/useHistory';

const GRID_SIZE = 20;
const TAB_D_GRID_SIZE = 25;
const TAB_D_SYMBOL_SCALE = 1.5;
const TERMINAL_HIT_RADIUS = 10;
const TERMINAL_RADIUS = 3.5;
const DIGITAL_LOGIC_COMPONENT_IDS = LOGIC_COMPONENT_TYPES;
const DIGITAL_LOGIC_IO_TYPES = new Set(['digital-input', 'digital-output']);

const CONTROL_SYSTEMS_HEADING = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';
/* Unified signature gradient matching the Mesh tab button (135deg from blue-600 through purple to rose). */
const TAB_GRADIENT = 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)';
const TAB_GRADIENT_REV = 'linear-gradient(135deg, #E11D48 0%, #7C3AED 50%, #2563EB 100%)';
const TAB_ACTIVE_SHADOW = '0 1px 3px rgba(2, 6, 23, 0.18)';

const DIGITAL_LOGIC_CATEGORY_ORDER = ['I/O', 'Logic Gates', 'Combinational Circuits', 'Sequential Circuits'] as const;
const digitalLogicCategory = (id: string) =>
  id === 'digital-input' || id === 'digital-output'
    ? 'I/O'
    : id.startsWith('gate-')
      ? 'Logic Gates'
      : id.startsWith('logic-ff') || id === 'logic-clock' || id === 'logic-shift-register' || id === 'logic-counter' || id === 'logic-nbit-register' || id === 'logic-ram-16x8' || id === 'logic-rom-16x8' || id === 'logic-frequency-divider'
        ? 'Sequential Circuits'
        : 'Combinational Circuits';

const idealLogicProps = (type: string, props: Record<string, unknown> = {}) => {
  if (type === 'digital-input') return { state: props.state === 'HIGH' ? 'HIGH' : props.state === 'Z' ? 'Z' : props.state === 'X' ? 'X' : 'LOW', shortcut: typeof props.shortcut === 'string' ? props.shortcut : '' };
  const config = dynamicScaleConfigFor(type);
  return config ? { ...props, [config.key]: normalizeDynamicScaleValue(type, props[config.key]) } : { ...props };
};

const nextDigitalLogicLabel = (type: string, components: CircuitComponent[]) => {
  if (type === 'digital-input' || type === 'digital-output') return logicIoLabel(type, components);
  return nextComponentLabel(type, components);
};

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
  { key: 'p', symbol: 'p', factor: 1e-12 },
  { key: 'n', symbol: 'n', factor: 1e-9 },
  { key: 'µ', symbol: 'µ', factor: 1e-6 },
  { key: 'm', symbol: 'm', factor: 1e-3 },
  { key: '', symbol: '', factor: 1 },
  { key: 'k', symbol: 'k', factor: 1e3 },
  { key: 'M', symbol: 'M', factor: 1e6 },
  { key: 'G', symbol: 'G', factor: 1e9 },
] as const;
const PREFIXABLE_UNITS = new Set(['Ω', 'F', 'H', 'V', 'A', 'Hz', 's']);

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
  let from: Point | null = null;
  let fromAxis: TabDTerminalAxis = 'horizontal';

  if (wire.fromComp.startsWith('junc_')) {
    from = wire.path[0];
    fromAxis = wire.path.length > 1 && Math.abs(wire.path[1][0] - wire.path[0][0]) > Math.abs(wire.path[1][1] - wire.path[0][1]) ? 'horizontal' : 'vertical';
  } else {
    const fromComponent = components.find(component => component.id === wire.fromComp);
    if (!fromComponent) return null;
    from = getComponentTerminalPosition(fromComponent, wire.fromTerm);
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
    const toComponent = components.find(component => component.id === wire.toComp);
    if (!toComponent) return null;
    to = getComponentTerminalPosition(toComponent, wire.toTerm);
    if (to) {
      toAxis = Math.abs(to[0] - toComponent.x) >= Math.abs(to[1] - toComponent.y) ? 'horizontal' : 'vertical';
    }
  }

  return from && to ? { from, to, fromAxis, toAxis } : null;
}

function refreshWireEndpoints(wires: CircuitWire[], components: CircuitComponent[], draggedComponentId?: string): CircuitWire[] {
  return wires.map(wire => {
    const endpoints = currentWireEndpoints(wire, components);
    if (!endpoints) return wire;
    const isConnectedToDragged = Boolean(draggedComponentId && (wire.fromComp === draggedComponentId || wire.toComp === draggedComponentId));
    if (isConnectedToDragged) {
      if (wire.routing === 'manual') {
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

function sourcePointFromElement(element: SVGSVGElement | null, pan: Point, zoom: number): Point {
  const rect = element?.getBoundingClientRect();
  if (!rect) return [300, 220];
  return [(rect.width / 2 - pan[0]) / zoom, (rect.height / 2 - pan[1]) / zoom];
}

/** Component Palette card icon rendered in the upper half of the 110px card. */
function ComponentPaletteIcon({ definition, colors, documented }: { definition: ComponentDef; colors: Palette; documented: boolean }) {
  const blockGeometry = definition.symbol === 'logic-block'
    ? logicBlockLayoutFor(definition.id, definition.terminals.filter(terminal => terminal.type === 'input').map(terminal => terminal.id), definition.terminals.filter(terminal => terminal.type === 'output').map(terminal => terminal.id))
    : undefined;
  const span = Math.max(definition.width, blockGeometry?.width ?? 0, blockGeometry?.height ?? definition.height, 108) + 12;
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
      aria-hidden="true"
      style={{ overflow: 'visible', color: colors.text, pointerEvents: 'none' }}
    >
      <g>
        {renderSymbol(definition.symbol, false, {
          ...defaultProps(definition),
          _documentedStyle: documented,
          _componentType: definition.id,
          _terminals: blockGeometry?.pins,
          _blockLabel: definition.name,
          _inputCount: definition.terminals.filter(terminal => terminal.type === 'input').length,
          _outputCount: definition.terminals.filter(terminal => terminal.type === 'output').length,
        }, 0)}
      </g>
    </svg>
  );
}

/** Determines label and value anchor offsets for digital logic components. */
function digitalLogicComponentLabelAnchors(
  definition: ComponentDef,
  component: CircuitComponent,
  scale = 1,
): {
  reference: Point;
  value: Point;
  isHorizontal: boolean;
  refTextAnchor?: 'start' | 'middle' | 'end';
  valTextAnchor?: 'start' | 'middle' | 'end';
} {
  const isHorizontal = component.rotation % 180 === 0;
  const halfW = (definition.width * scale) / 2;
  const halfH = (definition.height * scale) / 2;

  if (component.type === 'digital-input' || component.type === 'digital-output') {
    return {
      reference: [0, -halfH - 8],
      value: [0, halfH + 10],
      isHorizontal: true,
      refTextAnchor: 'middle',
      valTextAnchor: 'middle',
    };
  }

  if (component.type.startsWith('gate-')) {
    return {
      reference: [0, -halfH - 8],
      value: [0, halfH + 10],
      isHorizontal: true,
      refTextAnchor: 'middle',
      valTextAnchor: 'middle',
    };
  }

  if (component.type === 'logic-clock') {
    return {
      reference: [0, -halfH - 8],
      value: [0, halfH + 10],
      isHorizontal: true,
      refTextAnchor: 'middle',
      valTextAnchor: 'middle',
    };
  }

  return {
    reference: [0, -halfH - 8],
    value: [0, halfH + 10],
    isHorizontal,
    refTextAnchor: 'middle',
    valTextAnchor: 'middle',
  };
}

/** Formats a component's primary display value (e.g. clock frequency or delay). */
function componentDisplayValue(definition: ComponentDef, component: CircuitComponent): string | null {
  if (component.type === 'logic-clock') {
    const freq = numeric(component.props.frequency, 1000);
    return formatEngineering(freq, 'Hz');
  }

  if (component.props.propagationDelayNs !== undefined) {
    const delay = numeric(component.props.propagationDelayNs, 10);
    return `${delay} ns`;
  }

  const entry = Object.entries(definition.properties).find(([, property]) => property.type === 'number' && property.unit);
  if (!entry) return null;
  const [key, property] = entry;
  const value = numeric(component.props[key], numeric(property.value));
  return formatEngineering(value, property.unit ?? '');
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
 * Universal KaTeX label renderer for canvas component instance labels.
 * Ensures letters are math-italic (KaTeX_Math) and digits/subscripts are upright math Roman (KaTeX_Main).
 */
function renderComponentCanvasLabel(rawLabel: string, isGround: boolean) {
  const label = rawLabel.trim();

  if (isGround || /^GND\d*$/i.test(label)) {
    return (
      <tspan
        fontFamily="'KaTeX_Main', serif"
        fontStyle="normal"
        style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
      >
        GND
      </tspan>
    );
  }

  if (/^\d+$/.test(label)) {
    return (
      <tspan
        fontFamily="'KaTeX_Main', serif"
        fontStyle="normal"
        style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
      >
        {label}
      </tspan>
    );
  }

  const subMatch =
    label.match(/^([A-Za-z]+)_\{([^}]+)\}$/) ??
    label.match(/^([A-Za-z]+)_([A-Za-z0-9]+)$/) ??
    label.match(/^([A-Za-z]+)(\d+)$/);

  if (subMatch) {
    const [, base, sub] = subMatch;
    return (
      <>
        <tspan
          fontFamily="'KaTeX_Math', serif"
          fontStyle="italic"
          style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', serif" }}
        >
          {base}
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
          {sub}
        </tspan>
      </>
    );
  }

  const tokens = label.match(/([A-Za-z]+|\d+|[^A-Za-z0-9\s]+|\s+)/g) || [label];
  return (
    <>
      {tokens.map((token, index) => {
        if (/^[A-Za-z]+$/.test(token)) {
          return (
            <tspan
              key={index}
              fontFamily="'KaTeX_Math', serif"
              fontStyle="italic"
              style={{ fontStyle: 'italic', fontFamily: "'KaTeX_Math', serif" }}
            >
              {token}
            </tspan>
          );
        }
        return (
          <tspan
            key={index}
            fontFamily="'KaTeX_Main', serif"
            fontStyle="normal"
            style={{ fontStyle: 'normal', fontFamily: "'KaTeX_Main', serif" }}
          >
            {token}
          </tspan>
        );
      })}
    </>
  );
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
    '\\lambda': 'λ',
    '\\tau': 'τ',
    '\\omega': 'ω',
  };

  let clean = rawText;
  Object.entries(symbolMap).forEach(([cmd, sym]) => {
    clean = clean.replaceAll(cmd, sym);
  });
  clean = clean.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  clean = clean.replace(/\\mathit\{([^}]+)\}/g, '$1');
  clean = clean.replace(/\\mathbf\{([^}]+)\}/g, '$1');
  clean = clean.replace(/\\text\{([^}]+)\}/g, '$1');
  clean = clean.replace(/[{}\\]/g, '');

  const tokens = clean.match(/([A-Za-z]+|\d+|[^A-Za-z0-9\s]+|\s+)/g) || [clean];

  tokens.forEach(tok => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    tspan.textContent = tok;

    if (/^[A-Za-z]+$/.test(tok)) {
      tspan.setAttribute('font-family', "'KaTeX_Math', serif");
      tspan.setAttribute('font-style', 'italic');
      tspan.style.fontFamily = "'KaTeX_Math', serif";
      tspan.style.fontStyle = 'italic';
    } else {
      tspan.setAttribute('font-family', "'KaTeX_Main', serif");
      tspan.setAttribute('font-style', 'normal');
      tspan.style.fontFamily = "'KaTeX_Main', serif";
      tspan.style.fontStyle = 'normal';
    }
    tspan.setAttribute('font-size', `${baseFontSize}px`);
    svgTextEl.appendChild(tspan);
  });
}

function NodalNodeOverlay({ node }: { node: NodalNodeLabel }) {
  const [x, y] = node.centroid;
  return (
    <g pointerEvents="none" aria-label={`Nodal voltage V ${node.index}`}>
      <circle cx={x} cy={y} r={13} fill="white" fillOpacity={0.94} stroke={node.color} strokeWidth={1.5} />
      <circle cx={x - 8} cy={y - 8} r={2.5} fill={node.color} />
      <SvgKaTeXLabel x={x + 1} y={y + 1} math={`V_{${node.index}}`} color={node.color} ariaLabel={`Nodal voltage V ${node.index}`} width={46} height={24} />
    </g>
  );
}

function SvgKaTeXLabel({ x, y, math, color, ariaLabel, width = 64, height = 28 }: { x: number; y: number; math: string; color: string; ariaLabel: string; width?: number; height?: number }) {
  return (
    <foreignObject x={x - width / 2} y={y - height / 2} width={width} height={height} pointerEvents="none" aria-label={ariaLabel} style={{ overflow: 'visible' }}>
      <div className="flex h-full w-full items-center justify-center whitespace-nowrap" style={{ color, fontSize: 13, fontWeight: 700, lineHeight: 1, overflow: 'visible' }}>
        <V3Math math={math} />
      </div>
    </foreignObject>
  );
}

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

export interface DigitalLogicSimulatorHomeProps {
  /** Creates an isolated runtime while retaining the exact Tab B presentation contract. */
  createSimulationEngine?: () => SimulationEngine;
  /** Supplies a tab-specific static MNA payload while retaining the same view contract. */
  createStaticMna?: (components: CircuitComponent[], wires: CircuitWire[], normalizedGraph: NormalizedCircuitGraph) => DigitalLogicMnaState;
  /** Opts Tab D into presentation-only controls without changing Tab B's interaction contract. */
  tabDUiRefinement?: boolean;
  /** Limits the cloned Digital Logic Design catalog without changing its layout or shared component definitions. */
  digitalLogicOnly?: boolean;
}

export function DigitalLogicSimulatorHome({
  createSimulationEngine = () => new SimulationEngine(),
  createStaticMna,
  tabDUiRefinement = false,
  digitalLogicOnly = false,
}: DigitalLogicSimulatorHomeProps) {
  const [components, setComponents] = useState<CircuitComponent[]>([]);
  const [wires, setWires] = useState<CircuitWire[]>([]);
  const [texts, setTexts] = useState<WorkspaceText[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<{ components: CircuitComponent[]; wires: CircuitWire[]; texts: WorkspaceText[] } | null>(null);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [zoom, setZoom] = useState(1);
  const [gridVisible, setGridVisible] = useState(true);
  const [tabDGridMode, setTabDGridMode] = useState<'dots' | 'cartesian' | 'hidden'>('dots');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [wiring, setWiring] = useState<WiringState>({});
  const [dragState, setDragState] = useState<DragState>(null);
  const [cursor, setCursor] = useState<Point>([0, 0]);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  const [hoveredTerminal, setHoveredTerminal] = useState<{ componentId: string; terminalId: string } | null>(null);
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [simulationRunning, setSimulationRunning] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [dynamicScaleEditorId, setDynamicScaleEditorId] = useState<string | null>(null);
  const [pendingDynamicScale, setPendingDynamicScale] = useState(2);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(EMPTY_SNAPSHOT);
  const [animationTime, setAnimationTime] = useState(0);
  const [darkPreview, setDarkPreview] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const hasStartedSimulation = useRef(false);

  const gridSize = tabDUiRefinement ? TAB_D_GRID_SIZE : GRID_SIZE;
  const visualSymbolScale = tabDUiRefinement ? TAB_D_SYMBOL_SCALE : 1;
  const normalizedGraph = useMemo(() => NormalizedCircuitGraph.fromCanvas(components, wires), [components, wires]);
  const tabBMna = useDigitalLogicSimulation(components, wires, normalizedGraph);
  const dcMna = useMemo(() => createStaticMna ? createStaticMna(components, wires, normalizedGraph) : tabBMna, [components, createStaticMna, normalizedGraph, tabBMna, wires]);
  const meshGeometry = useMemo(() => compileMeshGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);
  const nodalGeometry = useMemo(() => compileNodalGeometry(components, wires, normalizedGraph), [components, wires, normalizedGraph]);
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
  const desSnapshotFrame = useRef<number | null>(null);
  const lastDesReactSnapshotMs = useRef(0);
  const wirePathRefs = useRef(new Map<string, SVGPathElement>());
  const componentRef = useRef(components);
  const wiresRef = useRef(wires);
  const textsRef = useRef(texts);
  const tabDUiRefinementRef = useRef(tabDUiRefinement);
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
      const factor = tabDGentleWheelZoomFactor(event.deltaY);
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
      background: '#000000',
      canvas: '#07080a',
      panel: '#0d0f12',
      panelAlt: '#090a0d',
      line: '#1b2028',
      text: '#f8fafc',
      muted: '#94a3b8',
      subtle: '#64748b',
      primary: '#8b5cf6',
      accent: '#a855f7',
      danger: '#f43f5e',
      selection: '#a855f7',
      grid: '#181b22',
      wire: '#475569',
      powered: '#38bdf8',
      input: '#13161c',
      shadow: '0 12px 28px rgba(0, 0, 0, 0.45)',
    }
    : {
      background: '#f8fafc',
      canvas: '#f4f6fb',
      panel: '#ffffff',
      panelAlt: '#f8fafc',
      line: '#e2e8f0',
      text: '#0f172a',
      muted: '#475569',
      subtle: '#94a3b8',
      primary: '#2563eb',
      accent: '#0284c7',
      danger: '#e11d48',
      selection: '#2563eb',
      grid: '#cbd5e1',
      wire: '#64748b',
      powered: '#0284c7',
      input: '#ffffff',
      shadow: '0 6px 20px rgba(15, 23, 42, 0.08)',
    };
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const selectedComponent = selection?.kind === 'component'
    ? components.find(component => component.id === selection.id)
    : undefined;
  const selectedWire = selection?.kind === 'wire'
    ? wires.find(wire => wire.id === selection.id)
    : undefined;
  const selectedText = selection?.kind === 'text'
    ? texts.find(text => text.id === selection.id)
    : undefined;
  const dynamicScaleEditorComponent = dynamicScaleEditorId ? components.find(component => component.id === dynamicScaleEditorId) : undefined;
  const dynamicScaleEditorConfig = dynamicScaleEditorComponent ? dynamicScaleConfigFor(dynamicScaleEditorComponent.type) : null;

  const clientToWorld = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    return [(clientX - rect.left - pan[0]) / zoom, (clientY - rect.top - pan[1]) / zoom];
  }, [pan, zoom]);

  const getRuntimeTerminals = useCallback((component: CircuitComponent) => {
    const definition = getDef(component.type);
    if (!definition) return [];
    return digitalLogicOnly ? getLogicComponentTerminals(component, definition) : definition.terminals;
  }, [digitalLogicOnly]);

  const getRawCanvasTerminalPosition = useCallback((component: CircuitComponent, terminalId: string): Point | null => {
    const definition = getDef(component.type);
    const terminal = getRuntimeTerminals(component).find(item => item.id === terminalId);
    if (!terminal) return null;
    return getTerminalWorldPos(component.x, component.y, terminal.x * visualSymbolScale, terminal.y * visualSymbolScale, component.rotation, component.flipH, component.flipV);
  }, [getRuntimeTerminals, visualSymbolScale]);

  const getCanvasTerminalPosition = useCallback((component: CircuitComponent, terminalId: string): Point | null => {
    const raw = getRawCanvasTerminalPosition(component, terminalId);
    return raw && tabDUiRefinement && !digitalLogicOnly ? alignTabDTerminalToGrid(raw, gridSize) : raw;
  }, [digitalLogicOnly, getRawCanvasTerminalPosition, gridSize, tabDUiRefinement]);

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
        if (wire.routing === 'manual') {
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
      if (!getDef(component.type)) continue;
      for (const terminal of getRuntimeTerminals(component)) {
        const position = getCanvasTerminalPosition(component, terminal.id);
        if (position && isNearTerminal(point[0], point[1], position[0], position[1], TERMINAL_HIT_RADIUS)) {
          const axis: TabDTerminalAxis = Math.abs(position[0] - component.x) >= Math.abs(position[1] - component.y) ? 'horizontal' : 'vertical';
          return { componentId: component.id, terminalId: terminal.id, position, axis };
        }
      }
    }
    return null;
  }, [getCanvasTerminalPosition, getRuntimeTerminals]);

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
      const bounds = digitalLogicOnly ? getLogicComponentBounds(component, definition) : definition;
      if (Math.abs(flippedX) <= bounds.width * visualSymbolScale / 2 + 10 && Math.abs(flippedY) <= bounds.height * visualSymbolScale / 2 + 16) return component;
    }
    return null;
  }, [digitalLogicOnly, visualSymbolScale]);

  const addComponent = useCallback((type: string, x?: number, y?: number) => {
    if (digitalLogicOnly && !DIGITAL_LOGIC_COMPONENT_IDS.has(type)) {
      toast.error('Digital Logic Design accepts logic inputs, outputs, and gates only');
      return;
    }
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);
    const targetX = snapEnabled ? snapToGrid(x ?? origin[0], gridSize) : (x ?? origin[0]);
    const targetY = snapEnabled ? snapToGrid(y ?? origin[1], gridSize) : (y ?? origin[1]);
    const definition = getDef(type);
    const label = nextDigitalLogicLabel(type, componentRef.current);
    const component: CircuitComponent = {
      id: nanoid(8),
      type,
      x: targetX,
      y: targetY,
      rotation: 0,
      flipH: false,
      flipV: false,
      label,
      props: idealLogicProps(type, defaultProps(definition!)),
    };
    const nextComponents = [...componentRef.current, component];
    setComponents(nextComponents);
    commitSnapshot({ components: nextComponents });
    setSelection({ kind: 'component', id: component.id });
    setMarqueeIds([]);
    toast.success(`Added ${definition?.name ?? type}`);
  }, [commitSnapshot, digitalLogicOnly, gridSize, pan, snapEnabled, zoom]);

  const updateComponent = useCallback((id: string, update: Partial<CircuitComponent>) => {
    setComponents(previous => {
      const next = previous.map(component => component.id === id ? { ...component, ...update } : component);
      commitSnapshot({ components: next });
      return next;
    });
  }, [commitSnapshot]);

  const updateComponentProperty = useCallback((key: string, value: unknown) => {
    if (!selectedComponent) return;
    setComponents(previous => {
      const next = previous.map(component => component.id === selectedComponent.id
        ? { ...component, props: { ...component.props, [key]: value } }
        : component);
      commitSnapshot({ components: next });
      return next;
    });
  }, [commitSnapshot, selectedComponent]);

  const updateDynamicScale = useCallback((componentId: string, value: unknown) => {
    const config = dynamicScaleConfigFor(selectedComponent?.type ?? '');
    if (!config) return;
    const normalized = normalizeDynamicScaleValue(selectedComponent!.type, value);
    setComponents(previous => {
      const next = previous.map(item => item.id === componentId
        ? { ...item, props: { ...item.props, [config.key]: normalized } }
        : item);
      const updatedComponent = next.find(item => item.id === componentId);
      if (updatedComponent) {
        const definition = getDef(updatedComponent.type);
        const validTerminalIds = new Set(getLogicComponentTerminals(updatedComponent, definition!).map(terminal => terminal.id));
        setWires(currentWires => {
          const pruned = pruneWiresForTerminalSet(currentWires, componentId, validTerminalIds);
          commitSnapshot({ components: next, wires: pruned });
          return pruned;
        });
      } else {
        commitSnapshot({ components: next });
      }
      return next;
    });
    setDynamicScaleEditorId(null);
  }, [commitSnapshot, selectedComponent]);

  const rotateSelected = useCallback((degrees: number) => {
    if (!selectedComponent) return;
    setComponents(previous => {
      const next = previous.map(component => component.id === selectedComponent.id
        ? { ...component, rotation: (component.rotation + degrees) % 360 }
        : component);
      const nextWires = refreshCanvasWireEndpoints(wiresRef.current, next, selectedComponent.id);
      setWires(nextWires);
      commitSnapshot({ components: next, wires: nextWires });
      return next;
    });
  }, [commitSnapshot, refreshCanvasWireEndpoints, selectedComponent]);

  const flipSelected = useCallback((axis: 'h' | 'v') => {
    if (!selectedComponent) return;
    setComponents(previous => {
      const next = previous.map(component => component.id === selectedComponent.id
        ? axis === 'h' ? { ...component, flipH: !component.flipH } : { ...component, flipV: !component.flipV }
        : component);
      const nextWires = refreshCanvasWireEndpoints(wiresRef.current, next, selectedComponent.id);
      setWires(nextWires);
      commitSnapshot({ components: next, wires: nextWires });
      return next;
    });
  }, [commitSnapshot, refreshCanvasWireEndpoints, selectedComponent]);

  const moveSelected = useCallback((dx: number, dy: number) => {
    if (marqueeIds.length > 0) {
      setComponents(previous => {
        const next = previous.map(c => marqueeIds.includes(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c);
        const nextWires = refreshCanvasWireEndpoints(wiresRef.current, next);
        setWires(nextWires);
        commitSnapshot({ components: next, wires: nextWires });
        return next;
      });
      setTexts(previous => {
        const next = previous.map(t => marqueeIds.includes(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t);
        commitSnapshot({ texts: next });
        return next;
      });
      return;
    }
    if (selectedComponent) {
      setComponents(previous => {
        const next = previous.map(component => component.id === selectedComponent.id
          ? { ...component, x: component.x + dx, y: component.y + dy }
          : component);
        const nextWires = refreshCanvasWireEndpoints(wiresRef.current, next, selectedComponent.id);
        setWires(nextWires);
        commitSnapshot({ components: next, wires: nextWires });
        return next;
      });
    } else if (selectedText) {
      setTexts(previous => {
        const next = previous.map(text => text.id === selectedText.id
          ? { ...text, x: text.x + dx, y: text.y + dy }
          : text);
        commitSnapshot({ texts: next });
        return next;
      });
    }
  }, [commitSnapshot, marqueeIds, refreshCanvasWireEndpoints, selectedComponent, selectedText]);

  const removeSelection = useCallback(() => {
    if (marqueeIds.length > 0) {
      const nextComponents = components.filter(c => !marqueeIds.includes(c.id));
      const nextTexts = texts.filter(t => !marqueeIds.includes(t.id));
      const nextWires = wires.filter(w => !marqueeIds.includes(w.id) && !marqueeIds.includes(w.fromComp) && !marqueeIds.includes(w.toComp));
      setComponents(nextComponents);
      setTexts(nextTexts);
      setWires(nextWires);
      setMarqueeIds([]);
      setSelection(null);
      commitSnapshot({ components: nextComponents, wires: nextWires, texts: nextTexts });
      toast.success('Deleted selected items');
      return;
    }
    if (selectedComponent) {
      const nextComponents = components.filter(c => c.id !== selectedComponent.id);
      const nextWires = wires.filter(w => w.fromComp !== selectedComponent.id && w.toComp !== selectedComponent.id);
      setComponents(nextComponents);
      setWires(nextWires);
      setSelection(null);
      commitSnapshot({ components: nextComponents, wires: nextWires });
      toast.success(`Removed ${selectedComponent.label}`);
    } else if (selectedWire) {
      const nextWires = wires.filter(w => w.id !== selectedWire.id);
      setWires(nextWires);
      setSelection(null);
      commitSnapshot({ wires: nextWires });
      toast.success('Removed wire');
    } else if (selectedText) {
      const nextTexts = texts.filter(t => t.id !== selectedText.id);
      setTexts(nextTexts);
      setSelection(null);
      commitSnapshot({ texts: nextTexts });
      toast.success('Removed annotation');
    }
  }, [commitSnapshot, components, marqueeIds, selectedComponent, selectedText, selectedWire, texts, wires]);

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
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);

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
      const pasted = copyComponentForPaste(c, newId, nextDigitalLogicLabel(c.type, nextComponents), c.x + dx, c.y + dy);
      nextComponents.push(pasted);
      return pasted;
    });

    const pastedTexts = clipboard.texts.map(t => ({
      ...t,
      id: nanoid(10),
      x: t.x + dx,
      y: t.y + dy,
    }));

    const pastedWires = clipboard.wires.map(w => ({
      ...w,
      id: nanoid(10),
      fromComp: idMap.get(w.fromComp) ?? w.fromComp,
      toComp: idMap.get(w.toComp) ?? w.toComp,
      path: w.path.map(p => [p[0] + dx, p[1] + dy] as Point),
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
  }, [clipboard, commitSnapshot, components, gridSize, pan, snapEnabled, texts, wires, zoom]);

  const addText = useCallback(() => {
    const origin = sourcePointFromElement(svgRef.current, pan, zoom);
    const targetX = snapEnabled ? snapToGrid(origin[0], gridSize) : origin[0];
    const targetY = snapEnabled ? snapToGrid(origin[1], gridSize) : origin[1];
    const newText: WorkspaceText = {
      id: nanoid(8),
      text: 'Label',
      x: targetX,
      y: targetY,
      fontSize: 16,
      color: colors.text,
      rotation: 0,
    };
    const nextTexts = [...texts, newText];
    setTexts(nextTexts);
    commitSnapshot({ texts: nextTexts });
    setSelection({ kind: 'text', id: newText.id });
  }, [colors.text, commitSnapshot, gridSize, pan, snapEnabled, texts, zoom]);

  const updateText = useCallback((update: Partial<WorkspaceText>) => {
    if (!selectedText) return;
    setTexts(previous => {
      const next = previous.map(t => t.id === selectedText.id ? { ...t, ...update } : t);
      commitSnapshot({ texts: next });
      return next;
    });
  }, [commitSnapshot, selectedText]);

  const updateWireRouting = useCallback((routing: CircuitWire['routing']) => {
    if (!selectedWire) return;
    setWires(previous => {
      const next = previous.map(wire => {
        if (wire.id !== selectedWire.id) return wire;
        const endpoints = currentWireEndpoints(wire, componentRef.current);
        return endpoints ? { ...wire, routing, path: routePath(endpoints.from, endpoints.to, routing) } : wire;
      });
      commitSnapshot({ wires: next });
      return next;
    });
  }, [commitSnapshot, selectedWire]);

  const addSelectedWireCorner = useCallback(() => {
    if (!selectedWire) return;
    const midpoint: Point = selectedWire.path.length >= 2
      ? [(selectedWire.path[0][0] + selectedWire.path[selectedWire.path.length - 1][0]) / 2, (selectedWire.path[0][1] + selectedWire.path[selectedWire.path.length - 1][1]) / 2]
      : cursor;
    setWires(previous => {
      const next: CircuitWire[] = previous.map(wire => wire.id === selectedWire.id
        ? { ...wire, routing: 'manual' as WireRouting, path: addWireCorner(wire.path, snapEnabled ? snapPointToGrid(midpoint, GRID_SIZE) : midpoint) }
        : wire);
      commitSnapshot({ wires: next });
      return next;
    });
  }, [commitSnapshot, cursor, selectedWire, snapEnabled]);

  const nudgeSelectedWire = useCallback((amount: number) => {
    if (!selectedWire) return;
    setWires(previous => {
      const next: CircuitWire[] = previous.map(wire => {
        if (wire.id !== selectedWire.id) return wire;
        const path = wire.path.length > 2 ? wire.path : addWireCorner(wire.path, [
          (wire.path[0][0] + wire.path[wire.path.length - 1][0]) / 2,
          (wire.path[0][1] + wire.path[wire.path.length - 1][1]) / 2,
        ]);
        const corner = Math.floor(path.length / 2);
        return { ...wire, routing: 'manual' as WireRouting, path: moveWireCorner(path, corner, [path[corner][0], path[corner][1] + amount]) };
      });
      commitSnapshot({ wires: next });
      return next;
    });
  }, [commitSnapshot, selectedWire]);

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

    components.forEach((c) => {
      const def = getDef(c.type);
      const w = ((def?.width ?? 60) * visualSymbolScale) / 2;
      const h = ((def?.height ?? 60) * visualSymbolScale) / 2;
      expand(c.x - w, c.y - h);
      expand(c.x + w, c.y + h);
    });

    wires.forEach((w) => {
      w.path.forEach((pt) => expand(pt[0], pt[1]));
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
  }, [components, texts, visualSymbolScale, wires]);

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
    clonedSvg.querySelectorAll('circle[r="13"], circle[r="10"], circle[r="7"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('circle[fill="none"][stroke="none"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke="transparent"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[stroke-dasharray="5 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('path[stroke-dasharray="6 4"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('g[opacity="0"], g[style*="opacity: 0"], circle[opacity="0"], circle[style*="opacity: 0"]').forEach(el => el.remove());
    clonedSvg.querySelectorAll('rect[key*="grid-surface"], rect[fill*="workspace-grid"]').forEach(el => el.remove());

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

    if (gridVisible && tabDGridMode !== 'hidden') {
      const gridRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      gridRect.setAttribute('x', String(cropX));
      gridRect.setAttribute('y', String(cropY));
      gridRect.setAttribute('width', String(cropWidth));
      gridRect.setAttribute('height', String(cropHeight));
      gridRect.setAttribute('fill', `url(#workspace-grid-${tabDGridMode})`);
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
    link.download = 'digital-logic-schematic.svg';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Schematic exported as SVG');
  }, [colors.canvas, components.length, darkPreview, getCircuitBoundingBox, gridVisible, tabDGridMode, texts, wires.length]);

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

    if (gridVisible && tabDGridMode !== 'hidden') {
      if (tabDGridMode === 'dots') {
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
        const lineColor = darkPreview ? 'rgba(61, 95, 140, 0.85)' : 'rgba(168, 184, 204, 0.85)';
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.15 * scale;
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
    clonedSvg.querySelectorAll('circle[r="13"], circle[r="10"], circle[r="7"]').forEach(el => el.remove());
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
        link.download = 'digital-logic-schematic.png';
        link.click();
        toast.success('Schematic exported as ultra HD PNG');
      } catch {
        toast.error('PNG conversion failed');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error('Failed to render SVG onto PNG canvas');
    };
    img.src = url;
  }, [colors.canvas, components.length, darkPreview, getCircuitBoundingBox, gridSize, gridVisible, tabDGridMode, texts, wires.length]);

  const exportNad = useCallback(() => {
    const document = createNadDocument({ components, wires, texts, viewport: { pan, zoom }, workspace: { gridVisible, snapEnabled } });
    const href = URL.createObjectURL(new Blob([serializeNad(document)], { type: 'application/x-mae-nad+json' }));
    const anchor = window.document.createElement('a');
    anchor.href = href; anchor.download = 'digital-logic.nad'; anchor.click();
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
    if (!digitalLogicOnly || !(simulation.current instanceof DiscreteEventLogicEngine)) return;
    const engine = simulation.current;
    const updateWirePath = (wireId: string, state: LogicState) => {
      const path = wirePathRefs.current.get(wireId);
      if (path) {
        const palette = colorsRef.current;
        path.style.stroke = state === 1 ? palette.powered : state === 'X' ? palette.danger : palette.wire;
        path.style.opacity = state === 1 ? '1' : state === 'X' ? '0.95' : '0.84';
      }
      if (desSnapshotFrame.current !== null) return;
      desSnapshotFrame.current = requestAnimationFrame(() => {
        desSnapshotFrame.current = null;
        setSnapshot(engine.getSnapshot());
      });
    };
    const unsubscribe = wires.map(wire => engine.subscribeToWire(wire.id, state => updateWirePath(wire.id, state)));
    return () => {
      unsubscribe.forEach(stop => stop());
      if (desSnapshotFrame.current !== null) cancelAnimationFrame(desSnapshotFrame.current);
      desSnapshotFrame.current = null;
    };
  }, [digitalLogicOnly, wires]);

  useEffect(() => {
    if (!digitalLogicOnly) return;
    setComponents(previous => {
      let changed = false;
      const normalized = previous.map(component => {
        const label = normalizeDefaultLogicLabel(component);
        if (label === component.label) return component;
        changed = true;
        return { ...component, label };
      });
      return changed ? normalized : previous;
    });
  }, [digitalLogicOnly]);

  useEffect(() => {
    if (!simulationRunning) return undefined;
    let last = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(0.03, (now - last) / 1000);
      last = now;
      const result = simulation.current.step(Math.max(0.0001, elapsed * simulationSpeed));
      if (!digitalLogicOnly || now - lastDesReactSnapshotMs.current >= 80) {
        lastDesReactSnapshotMs.current = now;
        setSnapshot(result);
        setAnimationTime(result.time);
      }
      animationFrame.current = requestAnimationFrame(animate);
    };
    animationFrame.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [digitalLogicOnly, simulationRunning, simulationSpeed]);

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
      if (digitalLogicOnly && !modifier && !event.altKey && !event.repeat) {
        const input = findInputByShortcut(components, event.key);
        if (input) {
          event.preventDefault();
          setComponents(previous => previous.map(component => component.id === input.id
            ? { ...component, props: { ...component.props, state: component.props.state === 'HIGH' ? 'LOW' : 'HIGH' } }
            : component));
          return;
        }
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key === 'Escape') {
        setWiring({});
        setSelection(null);
        setMarqueeIds([]);
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
      if ((event.key === ' ' || event.key.toLowerCase() === 'r') && selectedComponent) {
        event.preventDefault();
        rotateSelected(90);
        return;
      }
      if (event.key.toLowerCase() === 'h' && selectedComponent) {
        event.preventDefault();
        flipSelected('h');
        return;
      }
      if (event.key.toLowerCase() === 'v' && selectedComponent) {
        event.preventDefault();
        flipSelected('v');
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
  }, [addText, components, copySelection, cutSelection, digitalLogicOnly, gridSize, handleRedo, handleUndo, moveSelected, pasteClipboard, removeSelection, rotateSelected, selectedComponent, snapEnabled]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    const categoryOrder: readonly string[] = digitalLogicOnly ? DIGITAL_LOGIC_CATEGORY_ORDER : CATEGORIES;
    return categoryOrder.reduce<Record<string, ComponentDef[]>>((all, category) => {
      let categoryItems = digitalLogicOnly
        ? Object.values(COMPONENT_DEFS).filter(item => DIGITAL_LOGIC_COMPONENT_IDS.has(item.id) && digitalLogicCategory(item.id) === category)
        : getComponentsByCategory(category);
      if (tabDUiRefinement && category === 'Diodes') {
        categoryItems = categoryItems.filter(item => !['diode-ideal', 'diode-silicon', 'diode-germanium', 'diode-gaas'].includes(item.id));
      }
      if (tabDUiRefinement) categoryItems = filterTabDCatalog(categoryItems);
      if (digitalLogicOnly) categoryItems = categoryItems.filter(item => DIGITAL_LOGIC_COMPONENT_IDS.has(item.id));
      if (!tabDUiRefinement && category === 'Diodes') {
        categoryItems = categoryItems.filter(item => item.id !== 'diode');
      }
      const items = categoryItems.filter(item => !query
        || item.name.toLowerCase().includes(query)
        || item.description.toLowerCase().includes(query));
      if (items.length) all[category] = items;
      return all;
    }, {});
  }, [digitalLogicOnly, search, tabDUiRefinement]);

  const linkedCoils = components.filter(component => ['contactor', 'relay-spst', 'relay-spdt', 'relay-dpst', 'relay-dpdt'].includes(component.type));

  const addWireBetween = useCallback((
    from: WiringState['from'],
    target: { componentId: string; terminalId: string; position: Point; axis: TabDTerminalAxis },
    lockedCorners: Point[] = [],
  ) => {
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
    const path = tabDTerminalOrthogonalPath(from.position, target.position, from.axis, target.axis, gridSize, lockedCorners);
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
  }, [commitSnapshot, gridSize, wires]);

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

  const wireSnapProjection = useMemo(() => {
    if (wiring.from && dragState?.kind !== 'pan') {
      const hitWire = findWireNearPoint(cursor, 10);
      return hitWire?.projection || null;
    }
    return null;
  }, [cursor, dragState?.kind, findWireNearPoint, wiring.from]);

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
      if (!wiring.from) {
        setWiring({ from: terminal, lockedCorners: [] });
      } else {
        addWireBetween(wiring.from, terminal, wiring.lockedCorners);
      }
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
      if (digitalLogicOnly && component.type === 'digital-input' && Math.hypot(point[0] - component.x, point[1] - component.y) < 18) {
        setComponents(previous => previous.map(item => item.id === component.id
          ? { ...item, props: { ...item.props, state: item.props.state === 'HIGH' ? 'LOW' : 'HIGH' } }
          : item));
        return;
      }
      setSelection({ kind: 'component', id: component.id });
      setMarqueeIds([component.id]);
      dragStartSnapshotRef.current = cloneSnapshot({ components: componentRef.current, wires: wiresRef.current, texts: textsRef.current });
      setDragState({ kind: 'component', id: component.id, offset: [point[0] - component.x, point[1] - component.y] });
      return;
    }

    setSelection(null);
    setMarqueeIds([]);
    setDragState({ kind: 'marquee', start: point, end: point });
  }, [addWireBetween, clientToWorld, connectWireToExistingWire, digitalLogicOnly, findComponentAt, findTerminalAt, findWireNearPoint, gridSize, snapEnabled, wiring.from, wiring.lockedCorners]);

  const handleCanvasDoubleClick = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    const component = findComponentAt(point);
    if (component && dynamicScaleConfigFor(component.type)) {
      setDynamicScaleEditorId(component.id);
      const config = dynamicScaleConfigFor(component.type);
      setPendingDynamicScale(Number(component.props[config!.key] ?? 2));
    }
  }, [clientToWorld, findComponentAt]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const point = clientToWorld(event.clientX, event.clientY);
    setCursor(point);
    if (!dragState) return;
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
      const targetX = point[0] - dragState.offset[0];
      const targetY = point[1] - dragState.offset[1];
      const nextX = snapEnabled ? snapToGrid(targetX, gridSize) : targetX;
      const nextY = snapEnabled ? snapToGrid(targetY, gridSize) : targetY;
      const nextComponents = componentRef.current.map(component => component.id === dragState.id
        ? { ...component, x: nextX, y: nextY }
        : component);
      setComponents(nextComponents);
      setWires(previous => refreshCanvasWireEndpoints(previous, nextComponents, dragState.id));
      return;
    }
    if (dragState.kind === 'text') {
      const targetX = point[0] - dragState.offset[0];
      const targetY = point[1] - dragState.offset[1];
      const nextX = snapEnabled ? snapToGrid(targetX, gridSize) : targetX;
      const nextY = snapEnabled ? snapToGrid(targetY, gridSize) : targetY;
      setTexts(previous => previous.map(text => text.id === dragState.id ? { ...text, x: nextX, y: nextY } : text));
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
  }, [commitSnapshot, dragState]);

  const handleWireMouseDown = useCallback((event: React.MouseEvent, wire: CircuitWire) => {
    event.stopPropagation();
    if (wiring.from) {
      const point = clientToWorld(event.clientX, event.clientY);
      connectWireToExistingWire(wiring.from, wire, point, wiring.lockedCorners);
      return;
    }
    setSelection({ kind: 'wire', id: wire.id });
    setMarqueeIds([]);
  }, [clientToWorld, connectWireToExistingWire, wiring.from, wiring.lockedCorners]);

  const handleWireDoubleClick = useCallback((event: React.MouseEvent, wire: CircuitWire) => {
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
  }, [clientToWorld, commitSnapshot, gridSize, wires]);

  const handleTextMouseDown = useCallback((event: React.MouseEvent, text: WorkspaceText) => {
    event.stopPropagation();
    setSelection({ kind: 'text', id: text.id });
    setMarqueeIds([]);
    const point = clientToWorld(event.clientX, event.clientY);
    dragStartSnapshotRef.current = cloneSnapshot({ components: componentRef.current, wires: wiresRef.current, texts: textsRef.current });
    setDragState({ kind: 'text', id: text.id, offset: [point[0] - text.x, point[1] - text.y] });
  }, [clientToWorld]);

  const handleDrop = useCallback((event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const componentType = event.dataTransfer.getData('application/electrolab-component');
    if (!componentType) return;
    const point = clientToWorld(event.clientX, event.clientY);
    addComponent(componentType, point[0], point[1]);
  }, [addComponent, clientToWorld]);

  return (
    <div className="v3-mae-layout font-sans text-slate-900 dark:text-slate-100" style={{ minHeight: 760, color: colors.text }}>
      <section className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ borderColor: colors.line, background: colors.panel }}>
        <header className="min-w-max" style={{ background: colors.panel, zIndex: 5 }}>
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pt-2" style={{ minHeight: 36 }}>
            <ToolbarButton colors={colors} label="−" title="Zoom out" onClick={() => setZoom(value => Math.max(0.2, value / 1.15))} />
            <span style={{ color: colors.muted, fontSize: 11, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)}%</span>
            <ToolbarButton colors={colors} label="+" title="Zoom in" onClick={() => setZoom(value => Math.min(3, value * 1.15))} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Undo2 size={14} />} title="Undo (Ctrl/Cmd+Z)" onClick={handleUndo} disabled={!history.canUndo} />
            <ToolbarButton colors={colors} icon={<Redo2 size={14} />} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={handleRedo} disabled={!history.canRedo} />
            <ToolbarButton colors={colors} icon={<Maximize2 size={14} />} title="Auto-scale / Center circuit" onClick={zoomToFit} />
            <ToolbarButton colors={colors} icon={<Scissors size={14} />} title="Cut (Ctrl/Cmd+X)" onClick={cutSelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Copy size={14} />} title="Copy (Ctrl/Cmd+C)" onClick={copySelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Clipboard size={14} />} title="Paste (Ctrl/Cmd+V)" onClick={pasteClipboard} disabled={!clipboard || (clipboard.components.length === 0 && clipboard.wires.length === 0 && clipboard.texts.length === 0)} />
            <ToolbarButton colors={colors} icon={<Trash2 size={14} />} title="Delete (Del/Backspace)" onClick={removeSelection} disabled={!selectedComponent && !selectedWire && !selectedText && marqueeIds.length === 0} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton
              colors={colors}
              label="Dotted"
              title="Dotted grid background"
              onClick={() => { setTabDGridMode('dots'); setGridVisible(true); }}
              active={tabDGridMode === 'dots' && gridVisible}
            />
            <ToolbarButton
              colors={colors}
              label="Cartesian"
              title="Cartesian grid background"
              onClick={() => { setTabDGridMode('cartesian'); setGridVisible(true); }}
              active={tabDGridMode === 'cartesian' && gridVisible}
            />
            <ToolbarButton
              colors={colors}
              label="Hidden"
              title="Hide grid"
              onClick={() => { setTabDGridMode('hidden'); setGridVisible(false); }}
              active={tabDGridMode === 'hidden' || !gridVisible}
            />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Type size={14} />} label="Text" title="Add editable workspace text (T)" onClick={addText} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="90°" title="Rotate selected component 90°" onClick={() => rotateSelected(90)} disabled={!selectedComponent} />
            <ToolbarButton colors={colors} icon={<FlipHorizontal size={14} />} label="Flip X" title="Reflect selected component horizontally" onClick={() => flipSelected('h')} disabled={!selectedComponent} />
            <ToolbarButton colors={colors} icon={<FlipVertical size={14} />} label="Flip Y" title="Reflect selected component vertically" onClick={() => flipSelected('v')} disabled={!selectedComponent} />
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 border-t px-2 py-2" style={{ borderColor: colors.line, minHeight: 36 }}>
            <ToolbarButton colors={colors} icon={<Download size={14} />} label="Export" title="Export circuit as NAD netlist" onClick={exportNad} />
            <ToolbarButton colors={colors} icon={<FileImage size={14} />} label="PNG" title="Export as PNG image" onClick={exportPng} />
            <ToolbarButton colors={colors} icon={<FileCode size={14} />} label="SVG" title="Export as vector SVG" onClick={exportSvg} />
            <ToolbarButton colors={colors} icon={<Upload size={14} />} label="Import" title="Import circuit from NAD netlist" onClick={() => nadInputRef.current?.click()} />
            <input ref={nadInputRef} type="file" accept=".nad,application/x-mae-nad+json,application/json" onChange={importNad} style={{ display: 'none' }} />
            <ToolbarDivider colors={colors} />
            <button
              onClick={() => { hasStartedSimulation.current = true; setSimulationRunning(value => !value); }}
              title={simulationRunning ? 'Pause simulation' : 'Run simulation'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: (!simulationRunning && hasStartedSimulation.current) ? TAB_GRADIENT_REV : TAB_GRADIENT,
                color: '#ffffff',
                fontWeight: 500,
                padding: '6px 14px',
                minHeight: 30,
                borderRadius: 8,
                fontSize: 12,
                boxShadow: TAB_ACTIVE_SHADOW,
                border: '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background .3s ease',
              }}
            >
              {simulationRunning ? <Pause size={14} /> : <Play size={14} />}{simulationRunning ? 'Pause' : 'Run'}
            </button>
            <ToolbarButton colors={colors} icon={<RotateCcw size={14} />} title="Reset simulation" onClick={resetSimulation} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 65, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <V3Math math={`${snapshot.time.toFixed(3)}\\,\\mathrm{s}`} />
            </span>
            <ToolbarDivider colors={colors} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                aria-label="Simulation speed"
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={simulationSpeed}
                onChange={event => setSimulationSpeed(numeric(event.target.value, 1))}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center' }}>
                <V3Math math={`${simulationSpeed.toFixed(2)}\\times`} />
              </span>
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
                  <button
                    onClick={() => setCollapsedCategories(previous => {
                      const next = new Set(previous);
                      if (next.has(category)) next.delete(category); else next.add(category);
                      return next;
                    })}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: '8px 5px', fontSize: 11, fontWeight: 750 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{category}</span>
                    <span style={{ color: colors.subtle, fontWeight: 600 }}>{items.length}</span>
                  </button>
                  {!collapsed && (
                    <div className="grid grid-cols-2 gap-2 px-1 pb-3">
                      {items.map(item => (
                        <button
                          key={item.id}
                          draggable
                          onDragStart={event => {
                            event.dataTransfer.setData('application/electrolab-component', item.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => addComponent(item.id)}
                          className="flex h-[110px] flex-col overflow-hidden rounded-md border transition-all active:scale-[.97]"
                          style={{ borderColor: colors.line, background: colors.panel, cursor: 'grab' }}
                          onMouseEnter={event => { event.currentTarget.style.background = colors.panelAlt; }}
                          onMouseLeave={event => { event.currentTarget.style.background = colors.panel; }}
                        >
                          {/* Top Section: Scaled & Centered Canvas */}
                          <div className="flex flex-1 min-h-0 w-full items-center justify-center p-2">
                            <ComponentPaletteIcon definition={item} colors={colors} documented={tabDUiRefinement} />
                          </div>
                          {/* Bottom Section: Fixed height banner with clear readable component names */}
                          <div className="flex h-7 w-full shrink-0 items-center justify-center border-t px-1.5" style={{ borderColor: colors.line, background: `${colors.line}15` }}>
                            <span className="flex items-center justify-center text-[11px] font-medium text-black dark:text-white tracking-tight text-center leading-tight truncate w-full" title={item.name}>
                              <ElectricalLabel label={item.name} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </aside>

        <main className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.canvas, borderColor: colors.line }}>
          <div className="flex items-start justify-between border-b px-4 py-2" style={{ borderColor: colors.line }}>
            <div><div className={CONTROL_SYSTEMS_HEADING}>Interactive Logic Canvas</div></div>
            <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.muted }}>{components.length} CMP · {wires.length} NET</div>
          </div>
          <svg
            ref={svgRef}
            onMouseDown={handleCanvasMouseDown}
            onDoubleClick={handleCanvasDoubleClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onContextMenu={event => event.preventDefault()}
            onDragOver={event => event.preventDefault()}
            onDrop={handleDrop}
            style={{ width: '100%', height: '100%', display: 'block', cursor: dragState?.kind === 'pan' ? 'grabbing' : wiring.from ? 'crosshair' : 'default', touchAction: 'none' }}
          >
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0,0 L 6,3 L 0,6 Z" fill="#64748b" /></marker>
              {activeMeshTrace?.meshCycles?.map((cycle) => <marker key={cycle.index} id={`mesh-arrow-${cycle.index}`} markerWidth="7" markerHeight="7" refX="5.8" refY="3.5" orient="auto"><path d="M 0,0 L 7,3.5 L 0,7 Z" fill={cycle.color} /></marker>)}
              {tabDGridMode === 'dots' ? (
                <pattern
                  key="grid-pattern-dots"
                  id="workspace-grid-dots"
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${-gridSize / 2}, ${-gridSize / 2})`}
                >
                  <circle
                    cx={gridSize / 2}
                    cy={gridSize / 2}
                    r={1.65}
                    fill={darkPreview ? '#6d91c4' : '#7a93b1'}
                    fillOpacity={0.9}
                  />
                </pattern>
              ) : (
                <pattern
                  key={`grid-pattern-${tabDGridMode}`}
                  id={`workspace-grid-${tabDGridMode}`}
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                    fill="none"
                    stroke={darkPreview ? '#3d5f8c' : '#a8b8cc'}
                    strokeWidth={1.15}
                    strokeOpacity={0.85}
                  />
                </pattern>
              )}
            </defs>
            <g transform={`translate(${pan[0]},${pan[1]}) scale(${zoom})`}>
              {gridVisible && tabDGridMode !== 'hidden' && (
                <rect key={`grid-surface-${tabDGridMode}`} x={-5000} y={-5000} width={10000} height={10000} fill={`url(#workspace-grid-${tabDGridMode})`} />
              )}
              {dragState?.kind === 'marquee' && (
                <rect
                  x={Math.min(dragState.start[0], dragState.end[0])}
                  y={Math.min(dragState.start[1], dragState.end[1])}
                  width={Math.abs(dragState.end[0] - dragState.start[0])}
                  height={Math.abs(dragState.end[1] - dragState.start[1])}
                  fill={`${colors.selection}18`}
                  stroke={colors.selection}
                  strokeWidth={1.2}
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              )}

              {wires.map(wire => {
                const selected = selection?.kind === 'wire' && selection.id === wire.id;
                const fromVoltage = snapshot.terminalVoltages?.[terminalKey(wire.fromComp, wire.fromTerm)];
                const toVoltage = snapshot.terminalVoltages?.[terminalKey(wire.toComp, wire.toTerm)];
                const current = snapshot.wireCurrents[wire.id] ?? 0;
                const isHigh = current === 1 || (fromVoltage !== undefined && fromVoltage >= 1.5) || (toVoltage !== undefined && toVoltage >= 1.5);
                const isLow = current === 0 || (fromVoltage !== undefined && fromVoltage < 0.8) || (toVoltage !== undefined && toVoltage < 0.8);

                let wireColor = darkPreview ? '#475569' : '#64748b';
                let hasGlow = false;
                let isDashed = false;

                if (selected) {
                  wireColor = colors.selection;
                  hasGlow = true;
                } else if (isHigh) {
                  wireColor = '#22c55e';
                  hasGlow = true;
                } else if (isLow) {
                  wireColor = darkPreview ? '#334155' : '#64748b';
                } else {
                  wireColor = '#94a3b8';
                  isDashed = true;
                }

                const path = wire.path;
                const renderPath = pointsToPath(path);

                return (
                  <g key={wire.id}>
                    <path
                      d={renderPath}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={17}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      onMouseDown={event => handleWireMouseDown(event, wire)}
                      onDoubleClick={event => handleWireDoubleClick(event, wire)}
                      style={{ cursor: 'pointer' }}
                    />
                    {hasGlow && (
                      <path
                        d={renderPath}
                        fill="none"
                        stroke={wireColor}
                        strokeOpacity={selected ? 0.3 : 0.25}
                        strokeWidth={selected ? 7 : 5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    )}
                    <path
                      ref={node => { if (node) wirePathRefs.current.set(wire.id, node); else wirePathRefs.current.delete(wire.id); }}
                      d={renderPath}
                      fill="none"
                      stroke={wireColor}
                      strokeWidth={selected ? 2.5 : 1.8}
                      strokeDasharray={isDashed ? '4 3' : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pointerEvents="none"
                    />
                    {wire.toComp.startsWith('junc_') && (
                      <circle
                        cx={path[path.length - 1][0]}
                        cy={path[path.length - 1][1]}
                        r={3.5}
                        fill={wireColor}
                        stroke={colors.canvas}
                        strokeWidth={1.5}
                        pointerEvents="none"
                      />
                    )}
                    {wire.fromComp.startsWith('junc_') && (
                      <circle
                        cx={path[0][0]}
                        cy={path[0][1]}
                        r={3.5}
                        fill={wireColor}
                        stroke={colors.canvas}
                        strokeWidth={1.5}
                        pointerEvents="none"
                      />
                    )}
                    {selected && wire.path.length > 2 && wire.path.slice(1, -1).map((corner, index) => {
                      const cornerIndex = index + 1;
                      return (
                        <circle
                          key={`${wire.id}-${cornerIndex}`}
                          cx={corner[0]}
                          cy={corner[1]}
                          r={6}
                          fill={colors.panel}
                          stroke={colors.selection}
                          strokeWidth={2}
                          onMouseDown={event => {
                            event.stopPropagation();
                            dragStartSnapshotRef.current = cloneSnapshot({ components: componentRef.current, wires: wiresRef.current, texts: textsRef.current });
                            setDragState({ kind: 'wireCorner', id: wire.id, corner: cornerIndex });
                          }}
                          style={{ cursor: 'move' }}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {wiring.from && (
                <path
                  d={pointsToPath(tabDOrthogonalDraftPath(wiring.from.position, wireSnapProjection ? wireSnapProjection.point : cursor, wiring.lockedCorners, wiring.from.axis))}
                  fill="none"
                  stroke={colors.accent}
                  strokeDasharray="6 4"
                  strokeWidth={1.6}
                  opacity={0.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}
              {wireSnapProjection && (
                <circle
                  cx={wireSnapProjection.point[0]}
                  cy={wireSnapProjection.point[1]}
                  r={6}
                  fill="none"
                  stroke={colors.accent}
                  strokeWidth={2}
                  pointerEvents="none"
                />
              )}
              {wiring.lockedCorners?.map((corner, index) => (
                <circle
                  key={`corner-${index}`}
                  cx={corner[0]}
                  cy={corner[1]}
                  r={3}
                  fill={colors.panel}
                  stroke={colors.accent}
                  strokeWidth={1.2}
                  pointerEvents="none"
                />
              ))}

              {components.map(component => {
                const definition = getDef(component.type);
                if (!definition) return null;
                const isSelected = (selection?.kind === 'component' && selection.id === component.id) || marqueeIds.includes(component.id);
                const powered = Boolean(snapshot.componentPowered[component.id]);
                const intensity = snapshot.componentIntensity[component.id] ?? 0;
                const transform = `translate(${component.x},${component.y})`;
                const symbolTransform = `rotate(${component.rotation}) scale(${component.flipH ? -1 : 1},${component.flipV ? -1 : 1}) scale(${visualSymbolScale})`;
                const runtimeTerminals = getRuntimeTerminals(component);
                const bounds = digitalLogicOnly ? getLogicComponentBounds(component, definition) : definition;
                return (
                  <g
                    key={component.id}
                    transform={transform}
                    onPointerEnter={() => setHoveredComponentId(component.id)}
                    onPointerLeave={() => setHoveredComponentId(null)}
                  >
                    <g transform={symbolTransform} color={isSelected ? colors.selection : undefined}>
                      {isSelected && (
                        <rect
                          x={-bounds.width / 2 - 6}
                          y={-bounds.height / 2 - 6}
                          width={bounds.width + 12}
                          height={bounds.height + 12}
                          rx={6}
                          fill={`${colors.selection}0d`}
                          stroke={colors.selection}
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                          pointerEvents="none"
                        />
                      )}
                      {renderSymbol(
                        definition.symbol,
                        powered,
                        {
                          ...component.props,
                          _intensity: intensity,
                          _documentedStyle: tabDUiRefinement,
                          _componentType: component.type,
                          _terminals: runtimeTerminals,
                          _blockLabel: definition.name,
                          _inputCount: runtimeTerminals.filter(terminal => terminal.type === 'input').length,
                          _outputCount: runtimeTerminals.filter(terminal => terminal.type === 'output').length,
                        },
                        animationTime,
                      )}
                    </g>
                    {runtimeTerminals.map(terminal => {
                      const snappedWorld = getCanvasTerminalPosition(component, terminal.id);
                      const rawWorld = getRawCanvasTerminalPosition(component, terminal.id);
                      if (!snappedWorld || !rawWorld) return null;
                      const terminalX = snappedWorld[0] - component.x;
                      const terminalY = snappedWorld[1] - component.y;
                      const rawX = rawWorld[0] - component.x;
                      const rawY = rawWorld[1] - component.y;
                      const starting = wiring.from?.componentId === component.id && wiring.from.terminalId === terminal.id;
                      const isHovered = hoveredTerminal?.componentId === component.id && hoveredTerminal?.terminalId === terminal.id;
                      const terminalVoltage = snapshot.terminalVoltages[terminalKey(component.id, terminal.id)] ?? 0;
                      const energized = Math.abs(terminalVoltage) > 0.05;
                      const requiresLead = tabDUiRefinement && (Math.abs(rawX - terminalX) > 0.01 || Math.abs(rawY - terminalY) > 0.01);
                      const showTerminals = isSelected || hoveredComponentId === component.id || Boolean(wiring.from) || isHovered;
                      return (
                        <g
                          key={terminal.id}
                          onMouseEnter={() => setHoveredTerminal({ componentId: component.id, terminalId: terminal.id })}
                          onMouseLeave={() => setHoveredTerminal(null)}
                        >
                          {requiresLead && (
                            <path
                              d={`M ${rawX} ${rawY} L ${terminalX} ${terminalY}`}
                              fill="none"
                              stroke={digitalLogicOnly ? '#1a2744' : colors.wire}
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              pointerEvents="none"
                            />
                          )}
                          <circle cx={terminalX} cy={terminalY} r={TERMINAL_HIT_RADIUS} fill="transparent" />
                          <g style={{ opacity: showTerminals ? 1 : 0, transition: 'opacity 0.2s ease-in-out' }} pointerEvents="none">
                            {isHovered && (
                              <circle
                                cx={terminalX}
                                cy={terminalY}
                                r={7}
                                fill="none"
                                stroke={colors.accent}
                                strokeWidth={1.5}
                                opacity={0.85}
                              />
                            )}
                            <circle
                              cx={terminalX}
                              cy={terminalY}
                              r={TERMINAL_RADIUS}
                              fill={digitalLogicOnly && component.type.startsWith('gate-') && terminal.type === 'output' ? colors.panel : starting ? colors.accent : energized ? colors.powered : colors.panel}
                              stroke={starting ? colors.accent : isHovered ? colors.accent : wiring.from ? colors.primary : colors.muted}
                              strokeWidth={1.4}
                            />
                            {terminal.name && (
                              <text
                                x={terminalX}
                                y={terminalY - 8}
                                textAnchor="middle"
                                fontFamily="'KaTeX_Main', serif"
                                fontSize={8}
                                fontWeight={500}
                                fill={colors.muted}
                              >
                                {terminal.name}
                              </text>
                            )}
                          </g>
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Component Canvas Labels & Values Layer */}
              <g pointerEvents="none">
                {components.map(component => {
                  const definition = getDef(component.type);
                  if (!definition) return null;
                  const hideLabel = component.props._hideLabel === true;
                  const hideValue = component.props._hideValue === true;
                  const anchors = digitalLogicComponentLabelAnchors(definition, component, visualSymbolScale);
                  const refX = component.x + anchors.reference[0];
                  const refY = component.y + anchors.reference[1];
                  const valX = component.x + anchors.value[0];
                  const valY = component.y + anchors.value[1];
                  const value = componentDisplayValue(definition, component);
                  const refFill = darkPreview ? '#f1f5f9' : '#1e293b';
                  const valFill = darkPreview ? '#94a3b8' : '#64748b';

                  return (
                    <g key={`labels-${component.id}`}>
                      {!hideLabel && (
                        <text
                          x={refX}
                          y={refY}
                          textAnchor={anchors.refTextAnchor ?? 'middle'}
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
                          {renderComponentCanvasLabel(component.label, component.type === 'ground')}
                        </text>
                      )}
                      {value && !hideValue && (
                        <text
                          x={valX}
                          y={valY}
                          textAnchor={anchors.valTextAnchor ?? 'middle'}
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
                    <div
                      style={{
                        width: 'max-content',
                        color: text.color,
                        fontSize: text.fontSize,
                        fontWeight: 400,
                        userSelect: 'none',
                        display: 'flex',
                        border: selection?.kind === 'text' && selection.id === text.id ? `1px dashed ${colors.selection}` : 'none',
                        padding: 4,
                        transform: 'translate(-4px, -4px)',
                      }}
                    >
                      <V3Math math={text.text} />
                    </div>
                  </foreignObject>
                </g>
              ))}

              {activeNodalTrace?.nodalNodes?.filter((node) => node.centroid[0] !== 0 || node.centroid[1] !== 0).map((node) => <NodalNodeOverlay key={`nodal-node-${node.node}`} node={node} />)}
            </g>
          </svg>

          {dynamicScaleEditorComponent && dynamicScaleEditorConfig && (
            <div role="dialog" aria-modal="false" aria-label={`Configure ${getDef(dynamicScaleEditorComponent.type)?.name ?? 'logic component'}`} style={{ position: 'absolute', top: 68, right: 16, width: 228, background: colors.panel, border: `1px solid ${colors.primary}66`, boxShadow: colors.shadow, borderRadius: 10, padding: 12, zIndex: 8 }}>
              <div style={{ fontSize: 10, color: colors.subtle, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Dynamic configuration</div>
              <div style={{ marginTop: 4, fontWeight: 800, fontSize: 13, color: colors.text }}>{getDef(dynamicScaleEditorComponent.type)?.name}</div>
              <label style={{ display: 'block', marginTop: 11, fontSize: 10, color: colors.muted }}>
                {dynamicScaleEditorConfig.label}
                <select autoFocus value={String(pendingDynamicScale)} onChange={event => setPendingDynamicScale(Number(event.target.value))} style={{ ...inputStyle(colors), width: '100%', marginTop: 5 }}>
                  {dynamicScaleEditorConfig.options.map(option => <option key={option} value={option}>{option} {dynamicScaleEditorConfig.unitLabel}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                <InspectorButton colors={colors} onClick={() => setDynamicScaleEditorId(null)}>Cancel</InspectorButton>
                <InspectorButton colors={colors} active onClick={() => updateDynamicScale(dynamicScaleEditorComponent.id, pendingDynamicScale)}>Apply</InspectorButton>
              </div>
            </div>
          )}

          {components.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                <div className="px-6 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm mb-3 dark:bg-slate-900 dark:border-slate-800">
                  <span className="text-base font-semibold text-slate-900 tracking-tight dark:text-white">
                    Canvas Ready
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-normal">
                  Drag and drop logic gates, inputs, and components from the library to begin.
                </p>
              </div>
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: `${colors.panel}e8`, border: `1px solid ${colors.line}`, color: colors.muted, borderRadius: 8, fontSize: 10, boxShadow: 'none', pointerEvents: 'none' }}>
            <span>{components.length} components</span><span>•</span><span>{wires.length} wires</span>
            {simulationRunning && <span style={{ marginLeft: 'auto', color: colors.accent, fontWeight: 750 }}>LOGIC ENGINE ACTIVE</span>}
            {!snapshot.converged && <span style={{ marginLeft: 'auto', color: colors.danger, fontWeight: 750 }}>CHECK CIRCUIT WARNINGS</span>}
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
          <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Active Element &amp; Properties</div></div>
          {selectedComponent ? (
            <ComponentInspector
              colors={colors}
              component={selectedComponent}
              definition={getDef(selectedComponent.type)!}
              allComponents={components}
              linkedCoils={linkedCoils}
              snapshot={snapshot}
              tabDUiRefinement={tabDUiRefinement}
              digitalLogicOnly={digitalLogicOnly}
              defaultInputShortcut={selectedComponent.type === 'digital-input' ? defaultInputShortcut(selectedComponent, components) : ''}
              onLabelChange={label => updateComponent(selectedComponent.id, { label })}
              onPropertyChange={(key, value) => {
                if (digitalLogicOnly && key === 'shortcut') {
                  const requested = String(value).trim().toLowerCase();
                  const duplicate = requested && components.some(component => component.id !== selectedComponent.id && component.type === 'digital-input' && inputShortcut(component, components) === requested);
                  if (duplicate) { toast.error(`Shortcut “${String(value)}” is already assigned to another Logic Input`); return; }
                }
                const dynamicConfig = digitalLogicOnly ? dynamicScaleConfigFor(selectedComponent.type) : null;
                if (dynamicConfig?.key === key) {
                  updateDynamicScale(selectedComponent.id, value);
                  return;
                }
                updateComponentProperty(key, value);
              }}
              onDelete={removeSelection}
            />
          ) : selectedWire ? (
            <WireInspector colors={colors} wire={selectedWire} tabDUiRefinement={tabDUiRefinement} onRouting={updateWireRouting} onAddCorner={addSelectedWireCorner} onNudge={nudgeSelectedWire} onDelete={removeSelection} />
          ) : selectedText ? (
            <TextInspector colors={colors} text={selectedText} onUpdate={updateText} onMove={moveSelected} onDelete={removeSelection} />
          ) : (
            <WelcomeInspector colors={colors} />
          )}
        </aside>
      </div>

      {!digitalLogicOnly && (
        <section className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950" style={{ background: colors.panel, borderColor: colors.line }}>
          <div className="border-b px-5 py-3" style={{ borderColor: colors.line }}><div className={CONTROL_SYSTEMS_HEADING}>Academic Analysis Workspace</div></div>
          <AnalysisBox elements={dcMna.elements} geometry={meshGeometry} nodalNodes={nodalGeometry} colors={colors} standalone onTraceChange={handleAnalysisTrace} />
        </section>
      )}
    </div>
  );
}

/** Keeps the cloned Digital Logic Design standalone router contract self-contained. */
export default function DigitalLogicDesignHome() {
  return <DigitalLogicSimulatorHome />;
}

interface Palette {
  background: string;
  canvas: string;
  panel: string;
  panelAlt: string;
  line: string;
  text: string;
  muted: string;
  subtle: string;
  primary: string;
  accent: string;
  danger: string;
  selection: string;
  grid: string;
  wire: string;
  powered: string;
  input: string;
  shadow: string;
}

function ToolbarButton({ colors, icon, label, title, onClick, active, disabled }: { colors: Palette; icon?: React.ReactNode; label?: string; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  const isActive = Boolean(active) && !disabled;
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        border: isActive ? '1px solid transparent' : `1px solid ${colors.line}`,
        background: isActive ? TAB_GRADIENT : colors.panelAlt,
        color: isActive ? '#ffffff' : disabled ? colors.subtle : colors.muted,
        borderRadius: 8,
        padding: '6px 12px',
        minHeight: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: isActive ? TAB_ACTIVE_SHADOW : 'none',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        transition: 'background .15s ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolbarDivider({ colors }: { colors: Palette }) {
  return <span style={{ width: 1, height: 20, background: colors.line, margin: '0 1px', flexShrink: 0 }} />;
}

function InspectorHeader({ colors, title, subtitle }: { colors: Palette; title: React.ReactNode; subtitle: string }) {
  return (
    <div style={{ padding: '15px 15px 12px', borderBottom: `1px solid ${colors.line}` }}>
      <div>
        <div className="text-sm font-bold uppercase tracking-wider text-black dark:text-white">{title}</div>
        <div className="text-slate-600 dark:text-slate-400" style={{ marginTop: 2, fontSize: 10, lineHeight: 1.2 }}>{subtitle}</div>
      </div>
    </div>
  );
}

function InspectorButton({ colors, children, onClick, danger, active, disabled }: { colors: Palette; children: React.ReactNode; onClick: () => void; danger?: boolean; active?: boolean; disabled?: boolean }) {
  const tone = danger ? colors.danger : active ? colors.primary : colors.muted;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minHeight: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        border: `1px solid ${tone}55`,
        borderRadius: 6,
        background: active || danger ? `${tone}0d` : colors.panelAlt,
        color: tone,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 10,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function InspectorSection({ colors, label, children }: { colors: Palette; label: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.line}` }}>
      <div className="text-[12px] font-bold text-black dark:text-white uppercase tracking-wider" style={{ marginBottom: 8 }}>{label}</div>
      {children}
    </section>
  );
}

function PropertyRow({ colors, label, unit, children }: { colors: Palette; label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 156px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <span className="font-sans text-[12.5px] font-medium text-slate-700 dark:text-slate-300" style={{ lineHeight: 1.25 }}>
        <ElectricalLabel label={label} unit={unit} />
      </span>
      {children}
    </label>
  );
}

function ComponentInspector({
  colors,
  component,
  definition,
  allComponents,
  linkedCoils,
  snapshot,
  tabDUiRefinement,
  digitalLogicOnly = false,
  defaultInputShortcut = '',
  onLabelChange,
  onPropertyChange,
  onDelete,
}: {
  colors: Palette;
  component: CircuitComponent;
  definition: ComponentDef;
  allComponents: CircuitComponent[];
  linkedCoils: CircuitComponent[];
  snapshot: SimulationSnapshot;
  tabDUiRefinement: boolean;
  digitalLogicOnly?: boolean;
  defaultInputShortcut?: string;
  onLabelChange: (value: string) => void;
  onPropertyChange: (key: string, value: unknown) => void;
  onDelete: () => void;
}) {
  const isLogicInput = component.type === 'digital-input';
  const isLogicOutput = component.type === 'digital-output';
  const isClock = component.type === 'logic-clock';
  const isGate = component.type.startsWith('gate-');
  const hasValue = Object.values(definition.properties).some(p => p.type === 'number' && p.unit)
    || isClock
    || component.props.propagationDelayNs !== undefined;

  const currentInputState = isLogicInput ? (component.props.state === 'HIGH' ? 'HIGH' : component.props.state === 'Z' ? 'Z' : component.props.state === 'X' ? 'X' : 'LOW') : null;
  const currentOutputState = isLogicOutput
    ? (snapshot.terminalVoltages[`${component.id}:in`] !== undefined
      ? (snapshot.terminalVoltages[`${component.id}:in`] > 2.5 ? 1 : snapshot.terminalVoltages[`${component.id}:in`] < 0.8 ? 0 : 'X')
      : (snapshot.componentPowered[component.id] ? 1 : 0))
    : null;

  return (
    <div style={{ overflowY: 'auto', minHeight: 0 }}>
      <InspectorHeader
        colors={colors}
        title={
          <span className="text-black dark:text-white" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif", fontSize: 15 }}>
              <V3Math math={componentLabelToLatex(component.type === 'ground' ? 'GND' : component.label)} />
            </span>
            <span className="text-slate-600 dark:text-slate-300" style={{ fontSize: 11, letterSpacing: 0, textTransform: 'none', fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif" }}>
              <ElectricalLabel label={definition.name} />
            </span>
          </span>
        }
        subtitle={definition.description}
      />

      <InspectorSection colors={colors} label="Instance label">
        <PropertyRow colors={colors} label="Reference">
          <input
            value={component.type === 'ground' ? 'GND' : component.label}
            disabled={component.type === 'ground'}
            onChange={event => onLabelChange(component.type === 'ground' ? 'GND' : event.target.value)}
            style={mathReferenceInputStyle(colors)}
          />
        </PropertyRow>

        <PropertyRow colors={colors} label="Show Label">
          <select value={component.props._hideLabel ? 'hide' : 'show'} onChange={event => onPropertyChange('_hideLabel', event.target.value === 'hide')} style={inputStyle(colors)}>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </PropertyRow>

        {hasValue && (
          <PropertyRow colors={colors} label="Show Value">
            <select value={component.props._hideValue ? 'hide' : 'show'} onChange={event => onPropertyChange('_hideValue', event.target.value === 'hide')} style={inputStyle(colors)}>
              <option value="show">Show</option>
              <option value="hide">Hide</option>
            </select>
          </PropertyRow>
        )}

        <div style={{ color: colors.subtle, fontSize: 9, marginTop: 8 }}>
          Auto reference prefix: {componentPrefix(component.type)}.
        </div>
      </InspectorSection>

      <InspectorSection colors={colors} label={digitalLogicOnly ? 'Logic properties' : 'Electrical properties'}>
        {isLogicInput && (
          <>
            <PropertyRow colors={colors} label="Logic state">
              <select value={String(component.props.state ?? 'LOW')} onChange={event => onPropertyChange('state', event.target.value)} style={inputStyle(colors)}>
                <option value="LOW">0 · LOW</option>
                <option value="HIGH">1 · HIGH</option>
                <option value="Z">Z · High impedance</option>
                <option value="X">X · Unknown</option>
              </select>
            </PropertyRow>
            <PropertyRow colors={colors} label="Toggle key">
              <input
                readOnly
                value={String(component.props.shortcut || defaultInputShortcut)}
                onFocus={event => event.currentTarget.select()}
                onKeyDown={event => {
                  event.preventDefault();
                  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
                    onPropertyChange('shortcut', event.key === 'Backspace' || event.key === 'Delete' ? '' : event.key);
                  }
                }}
                style={inputStyle(colors)}
                title="Focus then press a key to assign shortcut"
              />
            </PropertyRow>
            <PropertyRow colors={colors} label="Live state">
              <div style={{ display: 'flex', alignItems: 'center', height: 32 }}>
                <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${currentInputState === 'HIGH' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {currentInputState === 'HIGH' ? '1 · HIGH' : currentInputState === 'LOW' ? '0 · LOW' : currentInputState}
                </span>
              </div>
            </PropertyRow>
          </>
        )}

        {isLogicOutput && (
          <div style={{ padding: '8px 12px', background: colors.panelAlt, border: `1px solid ${colors.line}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">MEASURED OUTPUT</span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${currentOutputState === 1 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
              <V3Math math={currentOutputState === 1 ? '1\\;(\\mathrm{HIGH})' : '0\\;(\\mathrm{LOW})'} />
            </span>
          </div>
        )}

        {isClock && (
          <>
            <PrefixedPropertyEditorField
              colors={colors}
              propertyKey="frequency"
              label="Clock Frequency"
              definition={{ type: 'number', value: 1000, unit: 'Hz', min: 0.1, max: 1e9, label: 'Frequency' }}
              value={component.props.frequency ?? 1000}
              prefix={String(component.props.__mae_prefix_frequency ?? 'k')}
              onChange={nextValue => onPropertyChange('frequency', nextValue)}
              onPrefixChange={nextPrefix => onPropertyChange('__mae_prefix_frequency', nextPrefix)}
            />
            <PropertyRow colors={colors} label="Duty Cycle">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <input
                  aria-label="Clock duty cycle"
                  type="range"
                  min={1}
                  max={99}
                  step={1}
                  value={numeric(component.props.dutyCycle, 50)}
                  onChange={event => onPropertyChange('dutyCycle', Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <V3Math math={`${numeric(component.props.dutyCycle, 50)}\\%`} />
                </span>
              </div>
            </PropertyRow>
          </>
        )}

        {/* Dynamic scale selector if applicable */}
        {dynamicScaleConfigFor(component.type) && (
          <PropertyRow colors={colors} label={dynamicScaleConfigFor(component.type)!.label}>
            <select
              value={String(component.props[dynamicScaleConfigFor(component.type)!.key] ?? dynamicScaleConfigFor(component.type)!.options[0])}
              onChange={event => onPropertyChange(dynamicScaleConfigFor(component.type)!.key, event.target.value)}
              style={inputStyle(colors)}
            >
              {dynamicScaleConfigFor(component.type)!.options.map(opt => (
                <option key={opt} value={opt}>{opt} {dynamicScaleConfigFor(component.type)!.unitLabel}</option>
              ))}
            </select>
          </PropertyRow>
        )}

        {/* Component definition properties */}
        {!isLogicInput && !isLogicOutput && Object.entries(definition.properties).map(([key, property]) => {
          if (dynamicScaleConfigFor(component.type)?.key === key) return null;
          if (key === 'wiper') {
            const rawVal = numeric(component.props[key], 0.5);
            const normalized = Math.max(0, Math.min(1, rawVal > 1 ? rawVal / 100 : rawVal));
            const percentVal = Math.round(normalized * 100);
            return (
              <PropertyRow key={key} colors={colors} label={property.label ?? 'Wiper'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <input
                    aria-label="Wiper position percentage"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={percentVal}
                    onChange={event => onPropertyChange('wiper', Number(event.target.value) / 100)}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-gradient [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-blue-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <V3Math math={`${percentVal}\\%`} />
                  </span>
                </div>
              </PropertyRow>
            );
          }
          if (key === 'linkedTo') {
            return (
              <PropertyRow key={key} colors={colors} label={property.label ?? key}>
                <select value={String(component.props[key] ?? '')} onChange={event => onPropertyChange(key, event.target.value)} style={inputStyle(colors)}>
                  <option value="">Select coil reference</option>
                  {linkedCoils.filter(coil => coil.id !== component.id).map(coil => <option key={coil.id} value={coil.label}>{coil.label} · {getDef(coil.type)?.name}</option>)}
                </select>
              </PropertyRow>
            );
          }
          const value = component.props[key] ?? property.value;
          const prefixable = tabDUiRefinement && property.type === 'number' && PREFIXABLE_UNITS.has(property.unit ?? '');
          return prefixable
            ? <PrefixedPropertyEditorField key={key} colors={colors} propertyKey={key} label={property.label ?? key} definition={property} value={value} prefix={String(component.props[prefixStateKey(key)] ?? engineeringPrefixFor(numeric(value, numeric(property.value))))} onChange={nextValue => onPropertyChange(key, nextValue)} onPrefixChange={nextPrefix => onPropertyChange(prefixStateKey(key), nextPrefix)} />
            : <PropertyEditorField key={key} colors={colors} label={property.label ?? key} definition={property} value={value} onChange={nextValue => onPropertyChange(key, nextValue)} />;
        })}

        {digitalLogicOnly && !isLogicInput && !isLogicOutput && !isClock && Object.keys(definition.properties).length === 0 && (
          <div style={{ color: colors.muted, fontSize: 10, lineHeight: 1.45 }}>
            Discrete-event logic element. Evaluates ideal Boolean switching states with zero DC loading.
          </div>
        )}
      </InspectorSection>

      <InspectorSection colors={colors} label="Actions">
        <InspectorButton colors={colors} danger onClick={onDelete}>
          <Trash2 size={13} />Delete
        </InspectorButton>
      </InspectorSection>
    </div>
  );
}

function PropertyEditorField({ colors, label, definition, value, onChange }: { colors: Palette; label: string; definition: PropertyDef; value: unknown; onChange: (value: unknown) => void }) {
  if (definition.type === 'boolean') {
    return (
      <PropertyRow colors={colors} label={label}>
        <input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} style={{ justifySelf: 'start', accentColor: colors.primary }} />
      </PropertyRow>
    );
  }
  if (definition.type === 'select') {
    return (
      <PropertyRow colors={colors} label={label} unit={definition.unit}>
        <select value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)}>
          {definition.options?.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      </PropertyRow>
    );
  }
  if (definition.type === 'color') {
    return (
      <PropertyRow colors={colors} label={label}>
        <input type="color" value={String(value)} onChange={event => onChange(event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} />
      </PropertyRow>
    );
  }
  if (definition.type === 'text') {
    return (
      <PropertyRow colors={colors} label={label}>
        <input value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)} />
      </PropertyRow>
    );
  }
  return (
    <PropertyRow colors={colors} label={label} unit={definition.unit}>
      <input
        type="number"
        min={definition.min}
        max={definition.max}
        step={definition.step ?? 'any'}
        value={numeric(value)}
        onChange={event => onChange(numeric(event.target.value, numeric(definition.value)))}
        style={mathNumericInputStyle(colors)}
      />
    </PropertyRow>
  );
}

function PrefixedPropertyEditorField({
  colors,
  propertyKey,
  label,
  definition,
  value,
  prefix,
  onChange,
  onPrefixChange,
}: {
  colors: Palette;
  propertyKey: string;
  label: string;
  definition: PropertyDef;
  value: unknown;
  prefix: string;
  onChange: (value: number) => void;
  onPrefixChange: (prefix: string) => void;
}) {
  const factor = engineeringFactor(prefix);
  const normalized = numeric(value, numeric(definition.value));
  const displayValue = Number((normalized / factor).toPrecision(12));
  const selectPrefix = (nextPrefix: string) => {
    const visibleValue = normalized / factor;
    onPrefixChange(nextPrefix);
    onChange(visibleValue * engineeringFactor(nextPrefix));
  };
  return (
    <PropertyRow colors={colors} label={label} unit={definition.unit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 68px', gap: 5 }}>
        <input
          aria-label={`${propertyKey} numeric value`}
          type="number"
          step="any"
          value={displayValue}
          onChange={event => onChange(numeric(event.target.value, displayValue) * factor)}
          style={mathNumericInputStyle(colors)}
        />
        <select
          aria-label={`${propertyKey} engineering prefix`}
          value={prefix}
          onChange={event => selectPrefix(event.target.value)}
          style={mathSelectStyle(colors)}
          title={`Engineering prefix for ${definition.unit ?? ''}`}
        >
          {ENGINEERING_PREFIXES.map(item => (
            <option key={item.key || 'base'} value={item.key}>
              {item.symbol || '—'}{definition.unit}
            </option>
          ))}
        </select>
      </div>
    </PropertyRow>
  );
}

function WireInspector({ colors, wire, tabDUiRefinement, onRouting, onAddCorner, onNudge, onDelete }: { colors: Palette; wire: CircuitWire; tabDUiRefinement: boolean; onRouting: (routing: CircuitWire['routing']) => void; onAddCorner: () => void; onNudge: (amount: number) => void; onDelete: () => void }) {
  return (
    <div style={{ overflowY: 'auto' }}>
      <InspectorHeader colors={colors} title="Wire path" subtitle={tabDUiRefinement ? 'Discrete Manhattan route between digital nodes.' : 'Click to select. Double-click the line or add a corner, then drag the handles.'} />
      <InspectorSection colors={colors} label="Route">
        <PropertyRow colors={colors} label="Routing">
          <select value={tabDUiRefinement ? 'orthogonal' : wire.routing} onChange={event => onRouting(event.target.value as CircuitWire['routing'])} disabled={tabDUiRefinement} style={inputStyle(colors)}>
            <option value="orthogonal">Orthogonal</option>
            {!tabDUiRefinement && <><option value="straight">Straight</option><option value="manual">Manual</option></>}
          </select>
        </PropertyRow>
        <div style={{ fontSize: 11, color: colors.text, marginBottom: 7 }}>
          Geometric length: <strong>{pathLength(wire.path).toFixed(1)} px</strong>
        </div>
        {!tabDUiRefinement && (
          <div style={{ display: 'flex', gap: 5 }}>
            <InspectorButton colors={colors} onClick={onAddCorner}><Plus size={13} />Corner</InspectorButton>
            <InspectorButton colors={colors} onClick={() => onNudge(-20)}><Minus size={13} />Bend</InspectorButton>
            <InspectorButton colors={colors} onClick={() => onNudge(20)}><Plus size={13} />Bend</InspectorButton>
          </div>
        )}
      </InspectorSection>
      <InspectorSection colors={colors} label="Digital signal">
        <p style={{ color: colors.muted, fontSize: 10, lineHeight: 1.45, margin: 0 }}>
          Digital net carries discrete Boolean and tristate levels (HIGH/LOW/Z/X). Propagation delay between driving gates and fanout loads is evaluated by the discrete-event simulator.
        </p>
      </InspectorSection>
      <InspectorSection colors={colors} label="Actions">
        <InspectorButton colors={colors} danger onClick={onDelete}><Trash2 size={13} />Delete wire</InspectorButton>
      </InspectorSection>
    </div>
  );
}

function TextInspector({ colors, text, onUpdate, onMove, onDelete }: { colors: Palette; text: WorkspaceText; onUpdate: (update: Partial<WorkspaceText>) => void; onMove: (dx: number, dy: number) => void; onDelete: () => void }) {
  return (
    <div style={{ overflowY: 'auto' }}>
      <InspectorHeader colors={colors} title="Workspace text" subtitle="Editable KaTeX annotation that can be placed anywhere in the schematic." />
      <InspectorSection colors={colors} label="Text properties">
        <PropertyRow colors={colors} label="Content">
          <input value={text.text} onChange={event => onUpdate({ text: event.target.value })} style={inputStyle(colors)} />
        </PropertyRow>
        <PropertyRow colors={colors} label="Size">
          <input type="number" min={8} max={72} value={text.fontSize} onChange={event => onUpdate({ fontSize: numeric(event.target.value, 16) })} style={inputStyle(colors)} />
        </PropertyRow>
        <PropertyRow colors={colors} label="Color">
          <input type="color" value={text.color} onChange={event => onUpdate({ color: event.target.value })} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} />
        </PropertyRow>
      </InspectorSection>
      <InspectorSection colors={colors} label="Move">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          <InspectorButton colors={colors} onClick={() => onMove(0, -20)}><ArrowUp size={13} /></InspectorButton>
          <InspectorButton colors={colors} onClick={() => onMove(-20, 0)}><ArrowLeft size={13} /></InspectorButton>
          <InspectorButton colors={colors} onClick={() => onMove(20, 0)}><ArrowRight size={13} /></InspectorButton>
          <InspectorButton colors={colors} onClick={() => onMove(0, 20)}><ArrowDown size={13} /></InspectorButton>
        </div>
      </InspectorSection>
      <InspectorSection colors={colors} label="Actions">
        <InspectorButton colors={colors} danger onClick={onDelete}><Trash2 size={13} />Delete text</InspectorButton>
      </InspectorSection>
    </div>
  );
}

function WelcomeInspector({ colors }: { colors: Palette }) {
  return (
    <div>
      <InspectorHeader colors={colors} title="Workspace ready" subtitle="Select a logic element, wire, or annotation to inspect its properties." />
      <InspectorSection colors={colors} label="Digital Logic Lab">
        <p style={{ margin: 0, color: colors.muted, fontSize: 11, lineHeight: 1.55 }}>
          The engine models discrete-event Boolean switching with exact propagation delays. Click logic inputs or press assigned hotkeys to toggle digital stimulus between 0 and 1.
        </p>
      </InspectorSection>
      <InspectorSection colors={colors} label="Keyboard shortcuts">
        <div style={{ color: colors.muted, fontSize: 10, lineHeight: 1.65 }}>
          <strong>Arrows</strong>: move selection<br />
          <strong>Shift + arrows</strong>: 5-grid move<br />
          <strong>Ctrl/Cmd+Z</strong>: undo · <strong>Ctrl/Cmd+Shift+Z</strong>: redo<br />
          <strong>Ctrl/Cmd+C / X / V</strong>: copy, cut, paste items<br />
          <strong>Del / Backspace</strong>: delete<br />
          <strong>Space</strong>: rotate 90° · <strong>T</strong>: add text
        </div>
      </InspectorSection>
    </div>
  );
}

function ElectricalLabel({ label, unit }: { label: string; unit?: string }) {
  const symbol: Record<string, string> = {
    'Voltage': 'V', 'Current': 'I', 'Resistance': 'R', 'Capacitance': 'C', 'Inductance': 'L', 'Frequency': 'f', 'Phase': '\\phi',
  };
  const unitMath: Record<string, string> = {
    'Ohm': '\\Omega', 'Ω': '\\Omega', 'kΩ': '\\mathrm{k}\\Omega', 'MΩ': '\\mathrm{M}\\Omega', 'mH': '\\mathrm{mH}', 'H': '\\mathrm{H}',
    'µH': '\\mu\\mathrm{H}', 'uH': '\\mu\\mathrm{H}', 'µF': '\\mu\\mathrm{F}', 'uF': '\\mu\\mathrm{F}', 'nF': '\\mathrm{nF}', 'pF': '\\mathrm{pF}',
    'V': '\\mathrm{V}', 'A': '\\mathrm{A}', 'Hz': '\\mathrm{Hz}', 'kHz': '\\mathrm{kHz}', 'MHz': '\\mathrm{MHz}', 's': '\\mathrm{s}', 'ns': '\\mathrm{ns}',
  };
  const math = symbol[label];
  const formattedUnit = unit ? unitMath[unit] ?? `\\mathrm{${unit}}` : undefined;
  return <>{math ? <V3Math math={math} /> : label}{formattedUnit && <span style={{ marginInlineStart: 3, color: 'inherit' }}><V3Math math={formattedUnit} /></span>}</>;
}

function inputStyle(colors: Palette): React.CSSProperties {
  return {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    height: 32,
    background: '#ffffff',
    color: '#1e293b',
    border: '1px solid #e2e8f0',
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
