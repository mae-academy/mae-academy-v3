import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* MAE Luminous Technical Atelier: Digital Logic Simulator UI
   Flawlessly transplanted 1:1 from the Analog Circuit Simulator layout, styling,
   toolbar, and canvas interaction, powered by the discrete-event digital logic engine. */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  Download,
  FlipHorizontal,
  FlipVertical,
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
  Image as ImageIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { V3Math } from '@/components/ui/V3Math';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/digital-logic/models/katexSvgFonts';
import { DigitalLogicAnalysisBox } from '@/simulators/digital-logic/components/ui-components/DigitalLogicAnalysisBox';
import { ExportPreviewModal, svgToPngBlob, type ExportItem } from '@/simulators/circuit-engine/components/ui-components/ExportPreviewModal';
import { ShareProjectModal } from '@/simulators/circuit-engine/components/ui-components/ShareProjectModal';
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
  replaceComponent,
  terminalKey,
  type CircuitComponent,
  type CircuitWire,
  type InstrumentReading,
  type SamplePoint,
  type Selection,
  type SimulationSnapshot,
  type WireRouting,
  type WorkspaceText,
} from '@/simulators/digital-logic/models/circuitTypes';
import {
  DIGITAL_LOGIC_CATEGORIES,
  DIGITAL_LOGIC_CATEGORY_MAP,
  getDigitalLogicCategory,
  getDigitalLogicComponentsByCategory,
  getAllDigitalLogicComponentDefs,
} from '@/simulators/digital-logic/models/digitalLogicCatalog';
import { DiscreteEventLogicEngine, LOGIC_COMPONENT_TYPES, type LogicState } from '@/simulators/digital-logic/engine/desLogicCore';
import {
  dynamicScaleConfigFor,
  logicBlockGeometryFor,
  logicBlockLayoutFor,
  normalizeDynamicScaleValue,
  pruneWiresForTerminalSet,
} from '@/simulators/digital-logic/components/dynamicLogicGeometry';
import {
  defaultInputShortcut,
  findInputByShortcut,
  inputShortcut,
  logicIoLabel,
  normalizeDefaultLogicLabel,
} from '@/simulators/digital-logic/models/logicInputBindings';
import { getLogicComponentBounds, getLogicComponentTerminals } from '@/simulators/digital-logic/models/logicGateContract';
import { renderSymbol } from '@/simulators/digital-logic/components/symbols';
import {
  alignTabDTerminalToGrid,
  dynamicRubberBandPath,
  lockTabDWireCorner,
  moveTabDOrthogonalLane,
  tabDGentleWheelZoomFactor,
  tabDOrthogonalDraftPath,
  tabDTerminalOrthogonalPath,
  type TabDTerminalAxis,
} from '@/simulators/digital-logic/components/digitalLogicCanvasGeometry';
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
import { buildJumpArcPath, calculateWireIntersections, getWirePoints, junctionDotPositions } from '@/simulators/digital-logic/models/wireIntersections';
import { calculateOrthogonalPath } from '@/simulators/digital-logic/models/wireRouter';
import { createNadDocument, parseNad, serializeNad } from '@/simulators/digital-logic/models/nadFormat';
import {
  useHistory,
  areSnapshotsEqual,
  cloneSnapshot,
  type CanvasSnapshot,
} from '@/simulators/digital-logic/components/hooks/useHistory';

const GRID_SIZE = 20;
const TAB_D_GRID_SIZE = 25;
const TAB_D_SYMBOL_SCALE = 1.5;
const TERMINAL_HIT_RADIUS = 13;
const TERMINAL_RADIUS = 4;
const CONTROL_SYSTEMS_HEADING = 'text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white';

/* Unified signature gradient matching the Mesh tab button exactly (135deg from blue-600 through purple to rose). */
const TAB_GRADIENT = 'linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)';
const TAB_GRADIENT_REV = 'linear-gradient(135deg, #E11D48 0%, #7C3AED 50%, #2563EB 100%)';
const TAB_ACTIVE_SHADOW = '0 1px 3px rgba(2, 6, 23, 0.18)';

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
const PREFIXABLE_UNITS = new Set(['Ω', 'F', 'H', 'V', 'A', 'Hz', 's', 'ns']);

function prefixStateKey(propertyKey: string) { return `__mae_prefix_${propertyKey}`; }
function engineeringFactor(prefix: string): number { return ENGINEERING_PREFIXES.find(item => item.key === prefix)?.factor ?? 1; }
function engineeringPrefixFor(value: number): string {
  const absolute = Math.abs(value);
  if (absolute === 0) return '';
  return ENGINEERING_PREFIXES.reduce((candidate, prefix) => Math.abs(Math.log10(absolute / prefix.factor)) < Math.abs(Math.log10(absolute / candidate.factor)) ? prefix : candidate, ENGINEERING_PREFIXES[4]).key;
}

function defaultProps(definition: ComponentDef): Record<string, unknown> {
  return Object.fromEntries(Object.entries(definition.properties).map(([key, propDef]) => [key, propDef.value]));
}

function getComponentTerminalPosition(component: CircuitComponent, terminalId: string): Point | null {
  const definition = getDef(component.type);
  if (!definition) return null;
  const terminals = getLogicComponentTerminals(component, definition) ?? definition.terminals;
  const terminal = terminals.find(item => item.id === terminalId);
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
    const fromComponent = components.find(c => c.id === wire.fromComp);
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
    const toComponent = components.find(c => c.id === wire.toComp);
    if (!toComponent) return null;
    to = getComponentTerminalPosition(toComponent, wire.toTerm);
    if (to) {
      toAxis = Math.abs(to[0] - toComponent.x) >= Math.abs(to[1] - toComponent.y) ? 'horizontal' : 'vertical';
    }
  }

  return from && to ? { from, to, fromAxis, toAxis } : null;
}

function refreshCanvasWireEndpoints(wires: CircuitWire[], components: CircuitComponent[], targetComponentId?: string): CircuitWire[] {
  return wires.map(wire => {
    if (targetComponentId && wire.fromComp !== targetComponentId && wire.toComp !== targetComponentId) {
      return wire;
    }
    const endpoints = currentWireEndpoints(wire, components);
    if (!endpoints) return wire;
    if (wire.routing === 'straight') {
      return { ...wire, path: [endpoints.from, endpoints.to] };
    }
    const nextPath = calculateOrthogonalPath(endpoints.from, endpoints.to, components, TAB_D_GRID_SIZE);
    return { ...wire, path: nextPath };
  });
}

function ComponentPaletteIcon({ definition, colors, documented, isDark }: { definition: ComponentDef; colors: Palette; documented: boolean; isDark?: boolean }) {
  const padding = 20;
  let w = definition.width + padding;
  let h = definition.height + padding;
  let offsetY = 0;

  if (definition.terminals && definition.terminals.length > 0) {
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

export interface DigitalLogicSimulatorHomeProps {
  createSimulationEngine?: () => DiscreteEventLogicEngine;
  tabDUiRefinement?: boolean;
  digitalLogicOnly?: boolean;
}

export function DigitalLogicSimulatorHome({
  createSimulationEngine = () => new DiscreteEventLogicEngine(),
  tabDUiRefinement = true,
  digitalLogicOnly = true,
}: DigitalLogicSimulatorHomeProps) {
  const [components, setComponents] = useState<CircuitComponent[]>([]);
  const [wires, setWires] = useState<CircuitWire[]>([]);
  const [texts, setTexts] = useState<WorkspaceText[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [dragState, setDragState] = useState<DragState>(null);
  const [wiring, setWiring] = useState<WiringState>({});
  const [mousePos, setMousePos] = useState<Point>([0, 0]);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(EMPTY_SNAPSHOT);
  const [showElectrons, setShowElectrons] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mae-show-electrons') !== 'false';
    } catch {
      return true;
    }
  });
  const [gridVisible, setGridVisible] = useState(true);
  const [tabDGridMode, setTabDGridMode] = useState<'dots' | 'cartesian' | 'hidden'>('dots');
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ components: CircuitComponent[]; wires: CircuitWire[]; texts: WorkspaceText[] } | null>(null);
  const [darkPreview, setDarkPreview] = useState(false);

  const hasStartedSimulation = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const nadInputRef = useRef<HTMLInputElement>(null);
  const simulation = useRef<DiscreteEventLogicEngine>(createSimulationEngine());
  const animationFrame = useRef<number | null>(null);
  const wirePathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const liveComponentsRef = useRef<CircuitComponent[]>([]);
  const componentRef = useRef(components);
  const wiresRef = useRef(wires);
  const textsRef = useRef(texts);

  componentRef.current = components;
  wiresRef.current = wires;
  textsRef.current = texts;

  // History system
  const history = useHistory<CanvasSnapshot>(
    () => ({
      components: [],
      wires: [],
      texts: [],
    }),
    { areEqual: areSnapshotsEqual },
  );

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

  // Dark mode synchronization
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setDarkPreview(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Wheel zoom handling
  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect) return;
      if (event.shiftKey || (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey)) {
        setPan(prev => [prev[0] - event.deltaX, prev[1] - event.deltaY]);
        return;
      }
      const factor = tabDGentleWheelZoomFactor(event.deltaY);
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      setZoom(current => {
        const next = Math.max(0.2, Math.min(3, current * factor));
        setPan(prev => [mouseX - (mouseX - prev[0]) * (next / current), mouseY - (mouseY - prev[1]) * (next / current)]);
        return next;
      });
    };
    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const colors: Palette = useMemo(() => darkPreview
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
      background: '#eaf0f8',
      canvas: '#f8fbff',
      panel: '#ffffff',
      panelAlt: '#f1f5fb',
      line: '#d7e2ef',
      text: '#172033',
      muted: '#64748b',
      subtle: '#94a3b8',
      primary: '#2563eb',
      accent: '#7c3aed',
      danger: '#be123c',
      selection: '#2563eb',
      grid: '#dbe7f3',
      wire: '#2563eb',
      powered: '#8b5cf6',
      input: '#ffffff',
      shadow: '0 12px 28px rgba(15,23,42,0.10)',
    }, [darkPreview]);

  const gridSize = TAB_D_GRID_SIZE;

  // Selected item references
  const selectedComponent = useMemo(() => {
    if (selection?.kind !== 'component') return null;
    return components.find(c => c.id === selection.id) ?? null;
  }, [components, selection]);

  const selectedWire = useMemo(() => {
    if (selection?.kind !== 'wire') return null;
    return wires.find(w => w.id === selection.id) ?? null;
  }, [wires, selection]);

  const selectedText = useMemo(() => {
    if (selection?.kind !== 'text') return null;
    return texts.find(t => t.id === selection.id) ?? null;
  }, [texts, selection]);

  // Update simulation when circuit topology changes
  useEffect(() => {
    simulation.current.setCircuit(components, wires);
    setSnapshot(simulation.current.getSnapshot());
  }, [components, wires]);

  // Wire subscriptions for dynamic signal coloring
  useEffect(() => {
    const engine = simulation.current;
    const updateWireColor = (wireId: string, state: LogicState) => {
      const pathEl = wirePathRefs.current.get(wireId);
      if (pathEl) {
        pathEl.style.stroke = state === 1 ? colors.powered : state === 'X' ? colors.danger : colors.wire;
        pathEl.style.opacity = state === 1 ? '1' : state === 'X' ? '0.95' : '0.85';
      }
    };
    const unsub = wires.map(w => engine.subscribeToWire(w.id, state => updateWireColor(w.id, state)));
    return () => {
      unsub.forEach(fn => fn());
    };
  }, [colors, wires]);

  // Simulation tick loop
  useEffect(() => {
    if (!simulationRunning) return undefined;
    let last = performance.now();
    const animate = (now: number) => {
      const elapsed = Math.min(0.03, (now - last) / 1000);
      last = now;
      const result = simulation.current.step(Math.max(0.0001, elapsed * simulationSpeed));
      setSnapshot(result);
      animationFrame.current = requestAnimationFrame(animate);
    };
    animationFrame.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    };
  }, [simulationRunning, simulationSpeed]);

  const resetSimulation = useCallback(() => {
    simulation.current.reset();
    simulation.current.setCircuit(components, wires);
    setSnapshot(simulation.current.getSnapshot());
  }, [components, wires]);

  // Component manipulation
  const updateComponent = useCallback((id: string, patch: Partial<CircuitComponent>) => {
    const nextComponents = components.map(c => (c.id === id ? { ...c, ...patch } : c));
    const nextWires = refreshCanvasWireEndpoints(wires, nextComponents, id);
    setComponents(nextComponents);
    setWires(nextWires);
    commitSnapshot({ components: nextComponents, wires: nextWires });
  }, [commitSnapshot, components, wires]);

  const updateComponentProperty = useCallback((key: string, value: unknown) => {
    if (!selectedComponent) return;
    const nextProps = { ...selectedComponent.props, [key]: value };
    updateComponent(selectedComponent.id, { props: nextProps });
  }, [selectedComponent, updateComponent]);

  const updateComponentProperties = useCallback((updates: Record<string, unknown>) => {
    if (!selectedComponent) return;
    const nextProps = { ...selectedComponent.props, ...updates };
    updateComponent(selectedComponent.id, { props: nextProps });
  }, [selectedComponent, updateComponent]);

  const replaceSelectedComponent = useCallback((newType: string) => {
    if (!selectedComponent) return;
    const newDefinition = getDef(newType);
    if (!newDefinition) return;
    const oldDefinition = getDef(selectedComponent.type);
    const oldTerminalIds = (getLogicComponentTerminals(selectedComponent, oldDefinition!) ?? oldDefinition?.terminals ?? []).map(t => t.id);
    const newTerminalIds = (getLogicComponentTerminals({ ...selectedComponent, type: newType, props: defaultProps(newDefinition) }, newDefinition) ?? newDefinition.terminals).map(t => t.id);
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
    toast.success(`Replaced with ${newDefinition.name}`);
  }, [commitSnapshot, components, selectedComponent, wires]);

  const rotateSelected = useCallback((degrees = 90) => {
    if (!selectedComponent) return;
    const newRotation = (((selectedComponent.rotation + degrees) % 360) + 360) % 360;
    updateComponent(selectedComponent.id, { rotation: newRotation });
  }, [selectedComponent, updateComponent]);

  const flipSelected = useCallback((axis: 'h' | 'v') => {
    if (!selectedComponent) return;
    if (axis === 'h') {
      updateComponent(selectedComponent.id, { flipH: !selectedComponent.flipH });
    } else {
      updateComponent(selectedComponent.id, { flipV: !selectedComponent.flipV });
    }
  }, [selectedComponent, updateComponent]);

  const removeSelection = useCallback(() => {
    if (marqueeIds.length > 0) {
      const removeSet = new Set(marqueeIds);
      const nextComponents = components.filter(c => !removeSet.has(c.id));
      const nextWires = wires.filter(w => !removeSet.has(w.id) && !removeSet.has(w.fromComp) && !removeSet.has(w.toComp));
      const nextTexts = texts.filter(t => !removeSet.has(t.id));
      setComponents(nextComponents);
      setWires(nextWires);
      setTexts(nextTexts);
      setMarqueeIds([]);
      setSelection(null);
      commitSnapshot({ components: nextComponents, wires: nextWires, texts: nextTexts });
      return;
    }
    if (selectedComponent) {
      const id = selectedComponent.id;
      const nextComponents = components.filter(c => c.id !== id);
      const nextWires = wires.filter(w => w.fromComp !== id && w.toComp !== id);
      setComponents(nextComponents);
      setWires(nextWires);
      setSelection(null);
      commitSnapshot({ components: nextComponents, wires: nextWires });
    } else if (selectedWire) {
      const id = selectedWire.id;
      const nextWires = wires.filter(w => w.id !== id);
      setWires(nextWires);
      setSelection(null);
      commitSnapshot({ wires: nextWires });
    } else if (selectedText) {
      const id = selectedText.id;
      const nextTexts = texts.filter(t => t.id !== id);
      setTexts(nextTexts);
      setSelection(null);
      commitSnapshot({ texts: nextTexts });
    }
  }, [commitSnapshot, components, marqueeIds, selectedComponent, selectedText, selectedWire, texts, wires]);

  const copySelection = useCallback(() => {
    const ids = marqueeIds.length > 0 ? marqueeIds : selectedComponent ? [selectedComponent.id] : [];
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const copiedComponents = components.filter(c => idSet.has(c.id));
    const copiedWires = wires.filter(w => idSet.has(w.fromComp) && idSet.has(w.toComp));
    const copiedTexts = texts.filter(t => idSet.has(t.id));
    setClipboard({ components: copiedComponents, wires: copiedWires, texts: copiedTexts });
    toast.success(`Copied ${copiedComponents.length} items`);
  }, [components, marqueeIds, selectedComponent, texts, wires]);

  const cutSelection = useCallback(() => {
    copySelection();
    removeSelection();
  }, [copySelection, removeSelection]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard) return;
    const idMap = new Map<string, string>();
    const offset = 40;
    const nextComponents = [
      ...components,
      ...clipboard.components.map(c => {
        const newId = nanoid(10);
        idMap.set(c.id, newId);
        return {
          ...c,
          id: newId,
          label: nextComponentLabel(c.type, components),
          x: c.x + offset,
          y: c.y + offset,
        };
      }),
    ];
    const nextWires = [
      ...wires,
      ...clipboard.wires.map(w => {
        const newFrom = idMap.get(w.fromComp) ?? w.fromComp;
        const newTo = idMap.get(w.toComp) ?? w.toComp;
        return {
          ...w,
          id: nanoid(10),
          fromComp: newFrom,
          toComp: newTo,
          path: w.path.map(p => [p[0] + offset, p[1] + offset] as Point),
        };
      }),
    ];
    setComponents(nextComponents);
    setWires(nextWires);
    commitSnapshot({ components: nextComponents, wires: nextWires });
    toast.success('Pasted from clipboard');
  }, [clipboard, commitSnapshot, components, wires]);

  const addText = useCallback(() => {
    const newText: WorkspaceText = {
      id: nanoid(10),
      x: snapToGrid(-pan[0] + 200, gridSize),
      y: snapToGrid(-pan[1] + 150, gridSize),
      text: 'Logic Note',
      fontSize: 16,
      color: darkPreview ? '#f8fafc' : '#1e293b',
      rotation: 0,
    };
    const nextTexts = [...texts, newText];
    setTexts(nextTexts);
    setSelection({ kind: 'text', id: newText.id });
    commitSnapshot({ texts: nextTexts });
  }, [commitSnapshot, darkPreview, gridSize, pan, texts]);

  const updateText = useCallback((patch: Partial<WorkspaceText>) => {
    if (!selectedText) return;
    const nextTexts = texts.map(t => (t.id === selectedText.id ? { ...t, ...patch } : t));
    setTexts(nextTexts);
    commitSnapshot({ texts: nextTexts });
  }, [commitSnapshot, selectedText, texts]);

  const moveSelected = useCallback((dx: number, dy: number) => {
    if (selectedComponent) {
      updateComponent(selectedComponent.id, { x: selectedComponent.x + dx, y: selectedComponent.y + dy });
    } else if (selectedText) {
      updateText({ x: selectedText.x + dx, y: selectedText.y + dy });
    }
  }, [selectedComponent, selectedText, updateComponent, updateText]);

  const updateWireRouting = useCallback((routing: WireRouting) => {
    if (!selectedWire) return;
    const nextWires = wires.map(w => (w.id === selectedWire.id ? { ...w, routing } : w));
    setWires(nextWires);
    commitSnapshot({ wires: nextWires });
  }, [commitSnapshot, selectedWire, wires]);

  // Zoom to fit
  const zoomToFit = useCallback(() => {
    if (components.length === 0) {
      setPan([0, 0]);
      setZoom(1);
      return;
    }
    const xs = components.map(c => c.x);
    const ys = components.map(c => c.y);
    const minX = Math.min(...xs) - 60;
    const maxX = Math.max(...xs) + 60;
    const minY = Math.min(...ys) - 60;
    const maxY = Math.max(...ys) + 60;
    const width = maxX - minX || 400;
    const height = maxY - minY || 300;

    const canvas = svgRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const nextZoom = Math.max(0.3, Math.min(2, Math.min(scaleX, scaleY) * 0.85));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(nextZoom);
    setPan([rect.width / 2 - centerX * nextZoom, rect.height / 2 - centerY * nextZoom]);
  }, [components]);

  // Canvas Mouse Events
  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const canvas = svgRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return [(sx - pan[0]) / zoom, (sy - pan[1]) / zoom];
  }, [pan, zoom]);

  const handleCanvasMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button === 1 || event.altKey) {
      // Middle click or Alt+click pans
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }
    if (event.button !== 0) return;

    const [wx, wy] = screenToWorld(event.clientX, event.clientY);

    // If wiring is in progress, click adds a waypoint or completes wire
    if (wiring.from) {
      const locked = wiring.lockedCorners ? [...wiring.lockedCorners, [wx, wy] as Point] : [[wx, wy] as Point];
      setWiring(prev => ({ ...prev, lockedCorners: locked }));
      return;
    }

    // Otherwise start marquee selection
    setSelection(null);
    setMarqueeIds([]);
    setDragState({ kind: 'marquee', start: [wx, wy], end: [wx, wy] });
  }, [screenToWorld, wiring.from, wiring.lockedCorners]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const [wx, wy] = screenToWorld(event.clientX, event.clientY);
    setMousePos([wx, wy]);

    if (!dragState) return;

    if (dragState.kind === 'pan') {
      const dx = event.clientX - dragState.client[0];
      const dy = event.clientY - dragState.client[1];
      setPan(prev => [prev[0] + dx, prev[1] + dy]);
      setDragState({ kind: 'pan', client: [event.clientX, event.clientY] });
      return;
    }

    if (dragState.kind === 'component') {
      const newX = snapToGrid(wx - dragState.offset[0], gridSize);
      const newY = snapToGrid(wy - dragState.offset[1], gridSize);
      setComponents(prev => prev.map(c => (c.id === dragState.id ? { ...c, x: newX, y: newY } : c)));
      return;
    }

    if (dragState.kind === 'text') {
      const newX = snapToGrid(wx - dragState.offset[0], gridSize);
      const newY = snapToGrid(wy - dragState.offset[1], gridSize);
      setTexts(prev => prev.map(t => (t.id === dragState.id ? { ...t, x: newX, y: newY } : t)));
      return;
    }

    if (dragState.kind === 'marquee') {
      setDragState({ ...dragState, end: [wx, wy] });
      const xMin = Math.min(dragState.start[0], wx);
      const xMax = Math.max(dragState.start[0], wx);
      const yMin = Math.min(dragState.start[1], wy);
      const yMax = Math.max(dragState.start[1], wy);
      const ids = components.filter(c => c.x >= xMin && c.x <= xMax && c.y >= yMin && c.y <= yMax).map(c => c.id);
      setMarqueeIds(ids);
    }
  }, [dragState, gridSize, screenToWorld, components]);

  const handleCanvasMouseUp = useCallback(() => {
    if (!dragState) return;
    if (dragState.kind === 'component' || dragState.kind === 'text') {
      const nextWires = refreshCanvasWireEndpoints(wires, components);
      setWires(nextWires);
      commitSnapshot({ components, wires: nextWires, texts });
    }
    setDragState(null);
  }, [commitSnapshot, components, dragState, texts, wires]);

  // Terminal wiring interactions
  const handleTerminalMouseDown = useCallback((
    event: React.MouseEvent,
    component: CircuitComponent,
    terminalId: string,
    axis: TabDTerminalAxis = 'horizontal',
  ) => {
    event.stopPropagation();
    const pos = getComponentTerminalPosition(component, terminalId);
    if (!pos) return;

    if (!wiring.from) {
      // Start wiring
      setWiring({ from: { componentId: component.id, terminalId, position: pos, axis }, lockedCorners: [] });
    } else {
      // Complete wiring to this terminal
      const from = wiring.from;
      if (from.componentId === component.id && from.terminalId === terminalId) {
        setWiring({});
        return;
      }
      const existing = wires.some(w =>
        (w.fromComp === from.componentId && w.fromTerm === from.terminalId && w.toComp === component.id && w.toTerm === terminalId) ||
        (w.fromComp === component.id && w.fromTerm === terminalId && w.toComp === from.componentId && w.toTerm === from.terminalId)
      );
      if (existing) {
        toast.info('Terminals are already connected');
        setWiring({});
        return;
      }

      const path = calculateOrthogonalPath(from.position, pos, components, gridSize);
      const newWire: CircuitWire = {
        id: nanoid(10),
        fromComp: from.componentId,
        fromTerm: from.terminalId,
        toComp: component.id,
        toTerm: terminalId,
        path,
        routing: 'orthogonal',
      };
      const nextWires = [...wires, newWire];
      setWires(nextWires);
      setWiring({});
      commitSnapshot({ wires: nextWires });
    }
  }, [commitSnapshot, components, gridSize, wires, wiring.from]);

  // Direct toggle on digital-input click
  const handleComponentClick = useCallback((component: CircuitComponent) => {
    if (component.type === 'digital-input') {
      simulation.current.toggleDigitalInput(component.id);
      const currentVal = component.props.state;
      const nextVal = currentVal === 'HIGH' ? 'LOW' : 'HIGH';
      updateComponentProperty('state', nextVal);
      setSnapshot(simulation.current.getSnapshot());
    }
  }, [updateComponentProperty]);

  // Library drag-drop
  const addComponent = useCallback((type: string) => {
    const def = getDef(type);
    if (!def) return;
    const [cx, cy] = snapPointToGrid([-pan[0] + 300, -pan[1] + 240], gridSize);
    const newComponent: CircuitComponent = {
      id: nanoid(10),
      type,
      x: cx,
      y: cy,
      rotation: 0,
      flipH: false,
      flipV: false,
      label: nextComponentLabel(type, components),
      props: defaultProps(def),
    };
    const nextComponents = [...components, newComponent];
    setComponents(nextComponents);
    setSelection({ kind: 'component', id: newComponent.id });
    commitSnapshot({ components: nextComponents });
  }, [commitSnapshot, components, gridSize, pan]);

  const handleDrop = useCallback((event: React.DragEvent<SVGSVGElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/electrolab-component');
    if (!type) return;
    const def = getDef(type);
    if (!def) return;
    const [wx, wy] = screenToWorld(event.clientX, event.clientY);
    const [snapX, snapY] = snapPointToGrid([wx, wy], gridSize);
    const newComponent: CircuitComponent = {
      id: nanoid(10),
      type,
      x: snapX,
      y: snapY,
      rotation: 0,
      flipH: false,
      flipV: false,
      label: nextComponentLabel(type, components),
      props: defaultProps(def),
    };
    const nextComponents = [...components, newComponent];
    setComponents(nextComponents);
    setSelection({ kind: 'component', id: newComponent.id });
    commitSnapshot({ components: nextComponents });
  }, [commitSnapshot, components, gridSize, screenToWorld]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo(); else handleUndo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        cutSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }
      if (event.key.toLowerCase() === 'r' && !mod) {
        event.preventDefault();
        rotateSelected(90);
        return;
      }
      if (event.key.toLowerCase() === 'h' && !mod) {
        event.preventDefault();
        flipSelected('h');
        return;
      }
      if (event.key.toLowerCase() === 'v' && !mod) {
        event.preventDefault();
        flipSelected('v');
        return;
      }
      if (event.key.toLowerCase() === 't' && !mod) {
        event.preventDefault();
        addText();
        return;
      }
      if (event.key === 'Escape') {
        setWiring({});
        setSelection(null);
        setMarqueeIds([]);
        return;
      }

      // Check input hotkey shortcut
      const input = findInputByShortcut(components, event.key);
      if (input) {
        event.preventDefault();
        handleComponentClick(input);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addText, components, copySelection, cutSelection, flipSelected, handleComponentClick, handleRedo, handleUndo, pasteClipboard, removeSelection, rotateSelected]);

  // Export / Import NAD netlist
  const exportNad = useCallback(() => {
    const doc = createNadDocument({
      components,
      wires,
      texts,
      viewport: { pan, zoom },
      workspace: { gridVisible, snapEnabled: true },
    });
    const json = serializeNad(doc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-logic-${Date.now()}.nad`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Netlist exported successfully');
  }, [components, gridVisible, pan, texts, wires, zoom]);

  const importNad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseNad(text);
        setComponents(parsed.components);
        setWires(parsed.wires);
        setTexts(parsed.texts ?? []);
        if (parsed.viewport?.pan) setPan(parsed.viewport.pan);
        if (parsed.viewport?.zoom) setZoom(parsed.viewport.zoom);
        commitSnapshot({ components: parsed.components, wires: parsed.wires, texts: parsed.texts ?? [] });
        setSelection(null);
        toast.success('Netlist imported successfully');
      } catch (err: any) {
        toast.error(`Failed to import netlist: ${err?.message ?? 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [commitSnapshot]);

  // Export Schematics / Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportItems, setExportItems] = useState<ExportItem[]>([]);
  const [exportFormat, setExportFormat] = useState<'png' | 'svg'>('png');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const handleOpenSaveImage = useCallback(() => {
    if (!svgRef.current) return;
    const cloned = svgRef.current.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgData = new XMLSerializer().serializeToString(cloned);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const previewUrl = URL.createObjectURL(blob);
    setExportItems([
      {
        id: 'circuit-main',
        title: 'Digital Logic Schematic',
        filename: 'digital-logic-schematic',
        format: 'svg',
        type: 'circuit',
        svgString: svgData,
        dataUrl: previewUrl,
      },
    ]);
    setExportModalOpen(true);
  }, []);

  const handleShareProject = useCallback(() => {
    const doc = createNadDocument({
      components,
      wires,
      texts,
      viewport: { pan, zoom },
      workspace: { gridVisible, snapEnabled: true },
    });
    const serialized = encodeURIComponent(serializeNad(doc));
    const url = `${window.location.origin}${window.location.pathname}?project=${serialized}`;
    setShareUrl(url);
    setShareModalOpen(true);
  }, [components, gridVisible, pan, texts, wires, zoom]);

  // Filtered categories for Component Library sidebar
  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DIGITAL_LOGIC_CATEGORIES.reduce<Record<string, ComponentDef[]>>((acc, cat) => {
      let items = getDigitalLogicComponentsByCategory(cat);
      items = items.filter(
        item => !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
      );
      if (items.length) acc[cat] = items;
      return acc;
    }, {});
  }, [search]);

  // Wire intersection jump-arcs calculation
  const wireIntersections = useMemo(() => {
    return calculateWireIntersections(wires);
  }, [wires]);

  const junctionDots = useMemo(() => {
    return junctionDotPositions(wireIntersections, wires);
  }, [wireIntersections, wires]);

  return (
    <div className="v3-mae-layout font-sans text-slate-900 dark:text-slate-100" style={{ minHeight: 760, color: colors.text }}>
      {/* Top Toolbar (Exact 2-row layout from Analog simulator) */}
      <section className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ borderColor: colors.line, background: colors.panel }}>
        <header className="min-w-max" style={{ background: colors.panel, zIndex: 5 }}>
          {/* Row 1: Workspace navigation, history, clipboard, grids, text, component transformation */}
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pt-2" style={{ minHeight: 36 }}>
            <ToolbarButton colors={colors} label="−" title="Zoom out" onClick={() => setZoom(v => Math.max(0.2, v / 1.15))} />
            <span style={{ color: colors.muted, fontSize: 11, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(zoom * 100)}%
            </span>
            <ToolbarButton colors={colors} label="+" title="Zoom in" onClick={() => setZoom(v => Math.min(3, v * 1.15))} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<Undo2 size={14} />} title="Undo (Ctrl/Cmd+Z)" onClick={handleUndo} disabled={!history.canUndo} />
            <ToolbarButton colors={colors} icon={<Redo2 size={14} />} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={handleRedo} disabled={!history.canRedo} />
            <ToolbarButton colors={colors} icon={<Maximize2 size={14} />} title="Auto-scale / Center circuit" onClick={zoomToFit} />
            <ToolbarButton colors={colors} icon={<Scissors size={14} />} title="Cut (Ctrl/Cmd+X)" onClick={cutSelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Copy size={14} />} title="Copy (Ctrl/Cmd+C)" onClick={copySelection} disabled={!selectedComponent && marqueeIds.length === 0} />
            <ToolbarButton colors={colors} icon={<Clipboard size={14} />} title="Paste (Ctrl/Cmd+V)" onClick={pasteClipboard} disabled={!clipboard} />
            <ToolbarButton colors={colors} icon={<Trash2 size={14} />} title="Delete (Del/Backspace)" onClick={removeSelection} disabled={!selectedComponent && !selectedWire && !selectedText && marqueeIds.length === 0} />
            <ToolbarDivider colors={colors} />
            <div className="flex items-center gap-2">
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
              <ToolbarButton colors={colors} icon={<Type size={14} />} label="Text" title="Add editable workspace text (T)" onClick={addText} />
            </div>
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="90°" title="Rotate selected component 90°" onClick={() => rotateSelected(90)} disabled={!selectedComponent} />
            <ToolbarButton colors={colors} icon={<FlipHorizontal size={14} />} label="Flip X" title="Reflect selected component horizontally" onClick={() => flipSelected('h')} disabled={!selectedComponent} />
            <ToolbarButton colors={colors} icon={<FlipVertical size={14} />} label="Flip Y" title="Reflect selected component vertically" onClick={() => flipSelected('v')} disabled={!selectedComponent} />
          </div>

          {/* Row 2: Export, Import, Save Image, Share, Simulation, Speed */}
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pb-2 pt-1" style={{ minHeight: 36 }}>
            <ToolbarButton colors={colors} icon={<Download size={14} />} label="Export" title="Export circuit as NAD netlist" onClick={exportNad} />
            <ToolbarButton colors={colors} icon={<Upload size={14} />} label="Import" title="Import circuit from NAD netlist" onClick={() => nadInputRef.current?.click()} />
            <input ref={nadInputRef} type="file" accept=".nad,application/x-mae-nad+json,application/json" onChange={importNad} style={{ display: 'none' }} />
            <ToolbarDivider colors={colors} />
            <ToolbarButton colors={colors} icon={<ImageIcon size={14} />} label="Save Image" title="Save circuit as image (PNG or SVG)" onClick={handleOpenSaveImage} />
            <ToolbarButton colors={colors} icon={<Share2 size={14} />} label="Share Project" title="Share circuit via Web Share API or deep link" onClick={handleShareProject} />
            <ToolbarDivider colors={colors} />
            <button
              onClick={() => { hasStartedSimulation.current = true; setSimulationRunning(v => !v); }}
              title={simulationRunning ? 'Pause simulation' : 'Run simulation'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: (!simulationRunning && hasStartedSimulation.current) ? TAB_GRADIENT_REV : TAB_GRADIENT,
                color: '#ffffff',
                fontWeight: 500,
                padding: '6px 14px',
                minHeight: 32,
                borderRadius: 8,
                fontSize: 12,
                boxShadow: TAB_ACTIVE_SHADOW,
                border: '1px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background .3s ease',
              }}
            >
              {simulationRunning ? <Pause size={14} /> : <Play size={14} />}
              {simulationRunning ? 'Pause' : 'Run'}
            </button>
            <ToolbarButton
              colors={colors}
              icon={<Zap size={14} />}
              title="Show / Hide signal flow"
              onClick={() => setShowElectrons(v => {
                const next = !v;
                try { localStorage.setItem('mae-show-electrons', String(next)); } catch { }
                return next;
              })}
              active={showElectrons}
            />
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

      {/* Main Container */}
      <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
        {/* Left Column (Library + Canvas + Logic Analysis Workspace) */}
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">
          {/* Top Row: Library + Canvas */}
          <div className="flex flex-col md:flex-row gap-4 items-start w-full">
            {/* Left Sidebar: Component Library */}
            <aside className="w-full md:w-56 shrink-0 min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column', height: '700px' }}>
              <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
                <div className={CONTROL_SYSTEMS_HEADING}>Component Library</div>
              </div>
              <div style={{ padding: 10, borderBottom: `1px solid ${colors.line}` }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: colors.subtle }} />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Search components"
                    style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.line}`, outline: 'none', background: colors.input, color: colors.text, borderRadius: 7, padding: '8px 9px 8px 29px', fontSize: 11 }}
                  />
                </div>
              </div>
              <div style={{ overflowY: 'auto', padding: '6px 6px 14px' }}>
                {Object.entries(filteredCategories).map(([category, items]) => {
                  const collapsed = collapsedCategories.has(category);
                  return (
                    <section key={category} style={{ marginBottom: 3 }}>
                      <button
                        onClick={() => setCollapsedCategories(prev => {
                          const next = new Set(prev);
                          if (next.has(category)) next.delete(category); else next.add(category);
                          return next;
                        })}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: '8px 5px', fontSize: 11, fontWeight: 750 }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{category}
                        </span>
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
                              <div className="flex flex-1 min-h-0 w-full items-center justify-center p-2">
                                <ComponentPaletteIcon definition={item} colors={colors} documented={tabDUiRefinement} isDark={darkPreview} />
                              </div>
                              <div className="flex h-7 w-full shrink-0 items-center justify-center border-t px-1.5" style={{ borderColor: colors.line, background: `${colors.line}15` }}>
                                <span className="flex items-center justify-center text-[11px] font-medium text-slate-800 dark:text-slate-200 tracking-tight text-center leading-tight truncate w-full" title={item.name}>
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

            {/* Center Canvas */}
            <main className="relative flex-1 min-w-0 h-[700px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#07080a]" style={{ background: colors.canvas, borderColor: colors.line }}>
              <div className="flex items-start justify-between border-b px-4 py-2" style={{ borderColor: colors.line }}>
                <div>
                  <div className={CONTROL_SYSTEMS_HEADING}>Interactive Digital Logic Canvas</div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.muted }}>
                  {components.length} CMP · {wires.length} NET
                </div>
              </div>

              <svg
                ref={svgRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onContextMenu={event => event.preventDefault()}
                onDragOver={event => event.preventDefault()}
                onDrop={handleDrop}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  cursor: dragState?.kind === 'pan' ? 'grabbing' : wiring.from ? 'crosshair' : 'default',
                  touchAction: 'none',
                }}
              >
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M 0,0 L 6,3 L 0,6 Z" fill="#64748b" />
                  </marker>
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
                        fill={darkPreview ? '#222630' : '#7a93b1'}
                        fillOpacity={0.9}
                      />
                    </pattern>
                  ) : (
                    <pattern
                      key="grid-pattern-cartesian"
                      id="workspace-grid-cartesian"
                      width={gridSize}
                      height={gridSize}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                        fill="none"
                        stroke={darkPreview ? '#1a1d24' : '#a8b8cc'}
                        strokeWidth={1.15}
                        strokeOpacity={0.85}
                      />
                    </pattern>
                  )}
                </defs>

                <g transform={`translate(${pan[0]},${pan[1]}) scale(${zoom})`}>
                  {gridVisible && tabDGridMode !== 'hidden' && (
                    <rect
                      x={-5000}
                      y={-5000}
                      width={10000}
                      height={10000}
                      fill={`url(#workspace-grid-${tabDGridMode})`}
                    />
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

                  <g id="circuit-elements-layer">
                    {/* Wires */}
                    {wires.map(wire => {
                      const selected = selection?.kind === 'wire' && selection.id === wire.id;
                      const wireState = simulation.current.getWireLogicState(wire.id);
                      const isHigh = wireState === 1;
                      const strokeColor = selected ? colors.selection : isHigh ? colors.powered : colors.wire;
                      const strokeWidth = selected ? 2.5 : 1.75;
                      const hitPath = pointsToPath(wire.path);
                      const renderPath = buildJumpArcPath(wire.path, wireIntersections, wire.id, 4);
                      const len = pathLength(wire.path);
                      const numDots = Math.max(1, Math.round(len / 36));
                      const dots = showElectrons && isHigh ? getDotsOnPath(wire.path, numDots, snapshot.time * 2) : [];

                      return (
                        <g key={wire.id}>
                          <path
                            d={hitPath}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={17}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            onMouseDown={event => {
                              event.stopPropagation();
                              setSelection({ kind: 'wire', id: wire.id });
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <path
                            ref={el => {
                              if (el) wirePathRefs.current.set(wire.id, el);
                              else wirePathRefs.current.delete(wire.id);
                            }}
                            d={renderPath}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                          {dots.map((dot, idx) => (
                            <circle
                              key={idx}
                              cx={dot[0]}
                              cy={dot[1]}
                              r={3}
                              fill={colors.powered}
                              opacity={0.9}
                              pointerEvents="none"
                            />
                          ))}
                        </g>
                      );
                    })}

                    {/* Junction dots */}
                    {junctionDots.map((dot, idx) => (
                      <circle
                        key={`junc-${idx}`}
                        cx={dot[0]}
                        cy={dot[1]}
                        r={3.5}
                        fill={colors.wire}
                        pointerEvents="none"
                      />
                    ))}

                    {/* Components */}
                    {components.map(component => {
                      const def = getDef(component.type);
                      if (!def) return null;
                      const selected = selection?.kind === 'component' && selection.id === component.id;
                      const inMarquee = marqueeIds.includes(component.id);
                      const isHighlighted = selected || inMarquee;
                      const terminals = getLogicComponentTerminals(component, def) ?? def.terminals;
                      const isInput = component.type === 'digital-input';
                      const isOutput = component.type === 'digital-output';
                      const inputVal = isInput ? (component.props.state === 'HIGH' ? 1 : 0) : 0;
                      const outputState = isOutput ? (snapshot.terminalVoltages[`${component.id}:in`] ?? 0) : 0;

                      return (
                        <g
                          key={component.id}
                          transform={`translate(${component.x},${component.y}) rotate(${component.rotation}) scale(${component.flipH ? -1 : 1}, ${component.flipV ? -1 : 1})`}
                          onMouseDown={event => {
                            event.stopPropagation();
                            if (wiring.from) return;
                            setSelection({ kind: 'component', id: component.id });
                            setDragState({
                              kind: 'component',
                              id: component.id,
                              offset: [mousePos[0] - component.x, mousePos[1] - component.y],
                            });
                          }}
                          onClick={() => handleComponentClick(component)}
                          style={{ cursor: isInput ? 'pointer' : 'move' }}
                        >
                          {/* Selection highlight */}
                          {isHighlighted && (
                            <rect
                              x={-def.width / 2 - 6}
                              y={-def.height / 2 - 6}
                              width={def.width + 12}
                              height={def.height + 12}
                              rx={8}
                              fill={`${colors.selection}15`}
                              stroke={colors.selection}
                              strokeWidth={1.5}
                              strokeDasharray="4 3"
                              pointerEvents="none"
                            />
                          )}

                          {/* Render logic symbol */}
                          <g style={{ color: colors.text }}>
                            {renderSymbol(def.symbol, inputVal === 1 || outputState === 1, component.props, snapshot.time)}
                          </g>

                          {/* Terminals */}
                          {terminals.map(term => {
                            const termAxis = Math.abs(term.x) >= Math.abs(term.y) ? 'horizontal' : 'vertical';
                            return (
                              <g key={term.id} transform={`translate(${term.x}, ${term.y})`}>
                                <circle
                                  r={TERMINAL_HIT_RADIUS}
                                  fill="transparent"
                                  onMouseDown={event => handleTerminalMouseDown(event, component, term.id, termAxis)}
                                  style={{ cursor: 'crosshair' }}
                                />
                                <circle
                                  r={TERMINAL_RADIUS}
                                  fill={colors.panel}
                                  stroke={colors.line}
                                  strokeWidth={1.5}
                                  pointerEvents="none"
                                />
                              </g>
                            );
                          })}

                          {/* Component label */}
                          {!component.props._hideLabel && (
                            <text
                              x={0}
                              y={def.height / 2 + 16}
                              textAnchor="middle"
                              fontSize={11}
                              fontFamily="'KaTeX_Math', 'KaTeX_Main', serif"
                              fontWeight={700}
                              fill={colors.text}
                              pointerEvents="none"
                              transform={`scale(${component.flipH ? -1 : 1}, ${component.flipV ? -1 : 1}) rotate(${-component.rotation})`}
                            >
                              {component.label}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Active wiring line preview */}
                    {wiring.from && (
                      <path
                        d={pointsToPath(
                          calculateOrthogonalPath(
                            wiring.from.position,
                            snapPointToGrid(mousePos, gridSize),
                            components,
                            gridSize,
                          ),
                        )}
                        fill="none"
                        stroke={colors.accent}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        pointerEvents="none"
                      />
                    )}

                    {/* Texts */}
                    {texts.map(text => (
                      <g
                        key={text.id}
                        transform={`translate(${text.x}, ${text.y})`}
                        onMouseDown={event => {
                          event.stopPropagation();
                          setSelection({ kind: 'text', id: text.id });
                          setDragState({
                            kind: 'text',
                            id: text.id,
                            offset: [mousePos[0] - text.x, mousePos[1] - text.y],
                          });
                        }}
                        style={{ cursor: 'move' }}
                      >
                        <text
                          fontSize={text.fontSize}
                          fill={text.color}
                          fontFamily="'KaTeX_Main', 'KaTeX_Math', serif"
                          fontWeight={600}
                          dominantBaseline="hanging"
                        >
                          {text.text}
                        </text>
                      </g>
                    ))}
                  </g>
                </g>
              </svg>

              {components.length === 0 && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                  <div className="flex flex-col items-center justify-center select-none">
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
            </main>
          </div>

          {/* Bottom Section: Logic Analysis Workspace */}
          <section className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b px-5 py-3" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>Logic Analysis Workspace</div>
            </div>
            <DigitalLogicAnalysisBox colors={colors} standalone components={components} wires={wires} snapshot={snapshot} />
          </section>
        </div>

        {/* Right Column: Active Element & Properties Panel */}
        <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
          <aside className="w-full min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>Active Element &amp; Properties</div>
            </div>
            {selectedComponent ? (
              <ComponentInspector
                colors={colors}
                component={selectedComponent}
                definition={getDef(selectedComponent.type)!}
                allComponents={components}
                snapshot={snapshot}
                onLabelChange={label => updateComponent(selectedComponent.id, { label })}
                onPropertyChange={updateComponentProperty}
                onPropertiesChange={updateComponentProperties}
                onDelete={removeSelection}
                onReplace={replaceSelectedComponent}
              />
            ) : selectedWire ? (
              <WireInspector
                colors={colors}
                wire={selectedWire}
                onRouting={updateWireRouting}
                onDelete={removeSelection}
              />
            ) : selectedText ? (
              <TextInspector
                colors={colors}
                text={selectedText}
                onUpdate={updateText}
                onMove={moveSelected}
                onDelete={removeSelection}
              />
            ) : (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.muted, fontSize: 12 }}>
                Select an element to inspect its properties.
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Modals */}
      <ExportPreviewModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        items={exportItems}
        format={exportFormat}
        onItemDownloaded={() => {}}
        onAllDownloaded={() => {}}
      />
      <ShareProjectModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
        componentCount={components.length}
        wireCount={wires.length}
        previewUrl={null}
      />
    </div>
  );
}

// ─── INSPECTOR COMPONENTS ───────────────────────────────────────────────────

function ComponentInspector({
  colors,
  component,
  definition,
  allComponents,
  snapshot,
  onLabelChange,
  onPropertyChange,
  onPropertiesChange,
  onDelete,
  onReplace,
}: {
  colors: Palette;
  component: CircuitComponent;
  definition: ComponentDef;
  allComponents: CircuitComponent[];
  snapshot: SimulationSnapshot;
  onLabelChange: (value: string) => void;
  onPropertyChange: (key: string, value: unknown) => void;
  onPropertiesChange: (updates: Record<string, unknown>) => void;
  onDelete: () => void;
  onReplace: (newType: string) => void;
}) {
  const isLogicInput = component.type === 'digital-input';
  const isLogicOutput = component.type === 'digital-output';
  const isClock = component.type === 'logic-clock';
  const isGate = component.type.startsWith('gate-');
  const isFlipFlop = component.type.startsWith('logic-ff-');

  const currentInputState = isLogicInput
    ? (component.props.state === 'HIGH' ? 'HIGH' : component.props.state === 'Z' ? 'Z' : component.props.state === 'X' ? 'X' : 'LOW')
    : null;

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
          <span className="text-slate-800 dark:text-slate-100" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: "'KaTeX_Math', 'KaTeX_Main', serif", fontSize: 24, fontWeight: 700 }}>
              <V3Math math={componentLabelToLatex(component.label)} />
            </span>
            <span className="text-slate-700 dark:text-slate-300 font-semibold text-lg" style={{ letterSpacing: 0, textTransform: 'none', fontFamily: "'KaTeX_Main', 'KaTeX_Math', serif" }}>
              <ElectricalLabel label={definition.name} />
            </span>
          </span>
        }
        subtitle={definition.description}
      />

      <InspectorSection colors={colors} label="Instance label">
        <PropertyRow colors={colors} label="Reference">
          <input
            value={component.label}
            onChange={event => onLabelChange(event.target.value)}
            style={mathReferenceInputStyle(colors)}
          />
        </PropertyRow>

        <PropertyRow colors={colors} label="Component">
          <ReplaceComponentControl colors={colors} currentType={component.type} onReplace={onReplace} />
        </PropertyRow>

        <PropertyRow colors={colors} label="Show Label">
          <select
            value={component.props._hideLabel ? 'hide' : 'show'}
            onChange={event => onPropertyChange('_hideLabel', event.target.value === 'hide')}
            style={inputStyle(colors)}
          >
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </PropertyRow>

        <PropertyRow colors={colors} label="Show Value">
          <select
            value={component.props._hideValue ? 'hide' : 'show'}
            onChange={event => onPropertyChange('_hideValue', event.target.value === 'hide')}
            style={inputStyle(colors)}
          >
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </PropertyRow>

        <div className="mae-panel-meta" style={{ marginTop: 8, fontSize: 10, color: colors.subtle }}>
          Auto reference prefix: {componentPrefix(component.type)}.
        </div>
      </InspectorSection>

      <InspectorSection colors={colors} label="Logic properties">
        {/* Digital Input */}
        {isLogicInput && (
          <>
            <PropertyRow colors={colors} label="Logic state">
              <select
                value={String(component.props.state ?? 'LOW')}
                onChange={event => onPropertyChange('state', event.target.value)}
                style={inputStyle(colors)}
              >
                <option value="LOW">0 · LOW</option>
                <option value="HIGH">1 · HIGH</option>
                <option value="Z">Z · High impedance</option>
                <option value="X">X · Unknown</option>
              </select>
            </PropertyRow>
            <PropertyRow colors={colors} label="Toggle key">
              <input
                readOnly
                value={String(component.props.shortcut || defaultInputShortcut(component, allComponents))}
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
                <span
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${
                    currentInputState === 'HIGH'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {currentInputState === 'HIGH' ? '1 · HIGH' : currentInputState === 'LOW' ? '0 · LOW' : currentInputState}
                </span>
              </div>
            </PropertyRow>
          </>
        )}

        {/* Digital Output */}
        {isLogicOutput && (
          <div style={{ padding: '8px 12px', background: colors.panelAlt, border: `1px solid ${colors.line}`, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">MEASURED OUTPUT</span>
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${
                currentOutputState === 1
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              <V3Math math={currentOutputState === 1 ? '1\\;(\\mathrm{HIGH})' : '0\\;(\\mathrm{LOW})'} />
            </span>
          </div>
        )}

        {/* Logic Gates */}
        {isGate && component.type !== 'gate-not' && (
          <PropertyRow colors={colors} label="Input Count">
            <select
              value={String(component.props.inputCount ?? '2')}
              onChange={event => onPropertyChange('inputCount', event.target.value)}
              style={inputStyle(colors)}
            >
              {['2', '3', '4', '5', '6', '7', '8'].map(num => (
                <option key={num} value={num}>{num} Inputs</option>
              ))}
            </select>
          </PropertyRow>
        )}

        {/* Logic Clock */}
        {isClock && (
          <>
            <PropertyRow colors={colors} label="Clock Period (ms)">
              <input
                type="number"
                min={0.1}
                max={60000}
                value={numeric(component.props.clockPeriodMs, 250)}
                onChange={event => onPropertyChange('clockPeriodMs', numeric(event.target.value, 250))}
                style={mathNumericInputStyle(colors)}
              />
            </PropertyRow>
          </>
        )}

        {/* Flip-Flops */}
        {isFlipFlop && (
          <>
            <PropertyRow colors={colors} label="Initial State">
              <select
                value={String(component.props.initialState ?? '0')}
                onChange={event => onPropertyChange('initialState', event.target.value)}
                style={inputStyle(colors)}
              >
                <option value="0">0 · LOW</option>
                <option value="1">1 · HIGH</option>
              </select>
            </PropertyRow>
            <PropertyRow colors={colors} label="Trigger Edge">
              <select
                value={String(component.props.triggerEdge ?? 'rising')}
                onChange={event => onPropertyChange('triggerEdge', event.target.value)}
                style={inputStyle(colors)}
              >
                <option value="rising">Rising Edge (Posedge)</option>
                <option value="falling">Falling Edge (Negedge)</option>
              </select>
            </PropertyRow>
          </>
        )}

        {/* Dynamic Scale Config (MUX, DEMUX, Adders, etc.) */}
        {(() => {
          const config = dynamicScaleConfigFor(component.type);
          if (!config) return null;
          return (
            <PropertyRow colors={colors} label={config.label}>
              <select
                value={String(component.props[config.key] ?? config.options[0])}
                onChange={event => onPropertyChange(config.key, event.target.value)}
                style={inputStyle(colors)}
              >
                {config.options.map(option => (
                  <option key={option} value={option}>{option} {config.unitLabel}</option>
                ))}
              </select>
            </PropertyRow>
          );
        })()}

        {/* Propagation Delay for all logic components */}
        <PropertyRow colors={colors} label="Propagation Delay" unit="ns">
          <input
            type="number"
            min={0}
            max={10000}
            value={numeric(component.props.propagationDelayNs, 10)}
            onChange={event => onPropertyChange('propagationDelayNs', numeric(event.target.value, 10))}
            style={mathNumericInputStyle(colors)}
          />
        </PropertyRow>

        {/* Generic Properties */}
        {Object.entries(definition.properties).map(([key, property]) => {
          if (['inputCount', 'state', 'shortcut', 'propagationDelayNs', 'clockPeriodMs', 'initialState', 'triggerEdge', 'selectorCount', 'bitWidth', 'divideBy'].includes(key)) {
            return null;
          }
          return (
            <PropertyEditorField
              key={key}
              colors={colors}
              label={property.label ?? key}
              definition={property}
              value={component.props[key] ?? property.value}
              onChange={val => onPropertyChange(key, val)}
            />
          );
        })}
      </InspectorSection>

      <div style={{ padding: '12px 15px' }}>
        <InspectorButton colors={colors} danger onClick={onDelete}>
          <Trash2 size={13} /> Delete Component
        </InspectorButton>
      </div>
    </div>
  );
}

function ReplaceComponentControl({
  colors,
  currentType,
  onReplace,
}: {
  colors: Palette;
  currentType: string;
  onReplace: (newType: string) => void;
}) {
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
    return DIGITAL_LOGIC_CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
      let items = getDigitalLogicComponentsByCategory(category);
      items = items.filter(
        item =>
          !trimmedQuery ||
          item.name.toLowerCase().includes(trimmedQuery) ||
          item.description.toLowerCase().includes(trimmedQuery),
      );
      if (items.length) all[category] = items;
      return all;
    }, {});
  }, [open, query]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen(v => !v)}
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
        <div
          style={{
            position: 'absolute',
            zIndex: 50,
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 280,
            maxHeight: 360,
            overflowY: 'auto',
            background: colors.panel,
            border: `1px solid ${colors.line}`,
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
            padding: 10,
          }}
        >
          <input
            autoFocus
            placeholder="Search digital components"
            value={query}
            onChange={event => setQuery(event.target.value)}
            style={{ ...inputStyle(colors), width: '100%', marginBottom: 6 }}
          />
          <div style={{ marginTop: 4 }}>
            {Object.entries(categories).map(([category, items]) => (
              <div key={category} style={{ marginBottom: 8 }}>
                <div className="mae-panel-section-header" style={{ padding: '4px 2px', fontSize: 10, opacity: 0.75 }}>
                  {category}
                </div>
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onReplace(item.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: item.id === currentType ? colors.panelAlt : 'transparent',
                      color: colors.text,
                      cursor: 'pointer',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background 0.1s ease',
                    }}
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
              <div style={{ padding: 10, fontSize: 11, color: colors.subtle, textAlign: 'center' }}>
                No digital logic components match your search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WireInspector({
  colors,
  wire,
  onRouting,
  onDelete,
}: {
  colors: Palette;
  wire: CircuitWire;
  onRouting: (routing: CircuitWire['routing']) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ overflowY: 'auto' }}>
      <InspectorHeader colors={colors} title="Wire path" subtitle="Ideal digital conductor connection between logic terminals." />
      <InspectorSection colors={colors} label="Routing Mode">
        <PropertyRow colors={colors} label="Routing">
          <select
            value={wire.routing}
            onChange={event => onRouting(event.target.value as CircuitWire['routing'])}
            style={inputStyle(colors)}
          >
            <option value="orthogonal">Orthogonal (Strict 90°)</option>
            <option value="straight">Straight</option>
            <option value="manual">Manual Waypoints</option>
          </select>
        </PropertyRow>
      </InspectorSection>
      <InspectorSection colors={colors} label="Logic Meaning">
        <p style={{ color: colors.muted, fontSize: 11, lineHeight: 1.45, margin: 0 }}>
          Digital net propagating discrete Boolean levels (0/1/Z/X). The router maintains clean 90-degree orthogonal paths with jump arcs across disjoint nets.
        </p>
      </InspectorSection>
      <div style={{ padding: '12px 15px' }}>
        <InspectorButton colors={colors} danger onClick={onDelete}>
          <Trash2 size={13} /> Delete Wire
        </InspectorButton>
      </div>
    </div>
  );
}

function TextInspector({
  colors,
  text,
  onUpdate,
  onMove,
  onDelete,
}: {
  colors: Palette;
  text: WorkspaceText;
  onUpdate: (update: Partial<WorkspaceText>) => void;
  onMove: (dx: number, dy: number) => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ overflowY: 'auto' }}>
      <InspectorHeader colors={colors} title="Workspace text" subtitle="Editable annotation in the digital logic canvas." />
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
        <PropertyRow colors={colors} label="X">
          <input type="number" value={text.x} onChange={event => onUpdate({ x: numeric(event.target.value, text.x) })} style={inputStyle(colors)} />
        </PropertyRow>
        <PropertyRow colors={colors} label="Y">
          <input type="number" value={text.y} onChange={event => onUpdate({ y: numeric(event.target.value, text.y) })} style={inputStyle(colors)} />
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
      <div style={{ padding: '12px 15px' }}>
        <InspectorButton colors={colors} danger onClick={onDelete}>
          <Trash2 size={13} /> Delete Text
        </InspectorButton>
      </div>
    </div>
  );
}

function PropertyEditorField({ colors, label, definition, value, onChange }: { colors: Palette; label: string; definition: PropertyDef; value: unknown; onChange: (value: unknown) => void }) {
  if (definition.type === 'boolean') return <PropertyRow colors={colors} label={label}><input type="checkbox" checked={Boolean(value)} onChange={event => onChange(event.target.checked)} style={{ justifySelf: 'start', accentColor: colors.primary }} /></PropertyRow>;
  if (definition.type === 'select') return <PropertyRow colors={colors} label={label} unit={definition.unit}><select value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)}>{definition.options?.map(option => <option key={option} value={option}>{option}</option>)}</select></PropertyRow>;
  if (definition.type === 'color') return <PropertyRow colors={colors} label={label}><input type="color" value={String(value)} onChange={event => onChange(event.target.value)} style={{ width: '100%', height: 30, border: `1px solid ${colors.line}`, borderRadius: 5, background: colors.input }} /></PropertyRow>;
  if (definition.type === 'text') return <PropertyRow colors={colors} label={label}><input value={String(value)} onChange={event => onChange(event.target.value)} style={inputStyle(colors)} /></PropertyRow>;
  return <PropertyRow colors={colors} label={label} unit={definition.unit}><input type="number" min={definition.min} max={definition.max} step={definition.step ?? 'any'} value={numeric(value)} onChange={event => onChange(numeric(event.target.value, numeric(definition.value)))} style={mathNumericInputStyle(colors)} /></PropertyRow>;
}

// ─── TOOLBAR & BASE UI HELPERS ──────────────────────────────────────────────

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
    <div style={{ padding: '16px 16px 14px', borderBottom: `1px solid ${colors.line}` }}>
      <div>
        <div className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{title}</div>
        <div className="text-slate-600 dark:text-slate-400" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.25 }}>{subtitle}</div>
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
        borderRadius: 8,
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
      <div className="mae-panel-section-header" style={{ marginBottom: 8 }}>{label}</div>
      {children}
    </section>
  );
}

function PropertyRow({ colors, label, unit, children }: { colors: Palette; label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 156px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <span className="mae-panel-field-label" style={{ lineHeight: 1.25 }}>
        <ElectricalLabel label={label} unit={unit} />
      </span>
      {children}
    </label>
  );
}

function ElectricalLabel({ label, unit }: { label: string; unit?: string }) {
  return (
    <>
      {label}
      {unit && <span style={{ marginInlineStart: 3, color: 'inherit' }}><V3Math math={`\\mathrm{${unit}}`} /></span>}
    </>
  );
}

function componentLabelToLatex(label: string): string {
  const normalized = label.trim();
  const match = normalized.match(/^([A-Za-z]+)(\d+)$/);
  const safe = (val: string) => val.replace(/([\\{}#$%&_~^])/g, '\\$1');
  if (match) {
    const prefix = match[1].length === 1 ? match[1] : `\\mathrm{${safe(match[1])}}`;
    return `${prefix}_{${match[2]}}`;
  }
  return `\\mathrm{${safe(normalized || 'component')}}`;
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

export default function DigitalLogicDesignHome() {
  return <DigitalLogicSimulatorHome />;
}
