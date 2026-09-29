import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
/* MAE Luminous Technical Atelier: Digital Logic Simulator UI
   Canvas, wiring, selection, history and shortcuts come from the shared BaseSchematicCanvas;
   this studio supplies only the logic component library and the discrete-event engine. */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  Move,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Share2,
  Trash2,
  Upload,
  Zap,
  Cpu,
  Image as ImageIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { V3Math } from '@/components/ui/V3Math';
import { StudioSlider } from '@/components/common/templates';
import { DigitalLogicAnalysisBox } from '@/simulators/digital-logic/components/ui-components/DigitalLogicAnalysisBox';
import { ExportPreviewModal, type ExportItem } from '@/simulators/circuit-engine/components/ui-components/ExportPreviewModal';
import { ShareProjectModal } from '@/simulators/circuit-engine/components/ui-components/ShareProjectModal';
import {
  getDef,
  type ComponentDef,
  type PropertyDef,
} from '@/simulators/digital-logic/models/componentDefs';
import {
  componentPrefix,
  copyComponentForPaste,
  nextComponentLabel,
  replaceComponent,
  type CircuitComponent,
  type CircuitWire,
  type SimulationSnapshot,
  type WireRouting,
  type WorkspaceText,
} from '@/simulators/digital-logic/models/circuitTypes';
import {
  DIGITAL_LOGIC_CATEGORIES,
  getDigitalLogicComponentsByCategory,
} from '@/simulators/digital-logic/models/digitalLogicCatalog';
import { DiscreteEventLogicEngine, type LogicState } from '@/simulators/digital-logic/engine/desLogicCore';
import { dynamicScaleConfigFor } from '@/simulators/digital-logic/components/dynamicLogicGeometry';
import { defaultInputShortcut, findInputByShortcut } from '@/simulators/digital-logic/models/logicInputBindings';
import { getLogicComponentBounds, getLogicComponentTerminals } from '@/simulators/digital-logic/models/logicGateContract';
import { renderSymbol } from '@/simulators/digital-logic/components/symbols';
import { getDotsOnPath, getTerminalWorldPos, pathLength, type Point } from '@/simulators/digital-logic/models/wiring';
import { calculateOrthogonalPath } from '@/simulators/digital-logic/models/wireRouter';
import { placeGeneratedCircuit } from '@/simulators/digital-logic/engine/circuitExpressionExtractor';
import { createNadDocument, parseNad, serializeNad } from '@/simulators/digital-logic/models/nadFormat';
import { TAB_D_GRID_SIZE } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import {
  TAB_GRADIENT,
  TAB_ACTIVE_SHADOW,
  ToolbarButton,
  ToolbarDivider,
  InspectorHeader,
  InspectorButton,
  InspectorSection,
  PropertyRow,
  ElectricalLabel,
} from '@/simulators/shared/workspace/workspaceChrome';
import { BaseSchematicCanvas } from '@/components/common/schematic/BaseSchematicCanvas';
import { useSchematicCanvas } from '@/components/common/schematic/useSchematicCanvas';
import { renderComponentCanvasLabel } from '@/components/common/schematic/schematicLabel';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/digital-logic/models/katexSvgFonts';
import { pointInComponentBox, routeWires } from '@/components/common/schematic/schematicGeometry';
import type { SchematicComponentLibrary, SchematicTerminal } from '@/components/common/schematic/schematicTypes';

/* Reversed variant used only by the Run/Pause pill after a session has started; not part of the shared chrome contract. */
const TAB_GRADIENT_REV = 'linear-gradient(to right, #E11D48, #7C3AED, #2563EB)';

function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function defaultProps(definition: ComponentDef): Record<string, unknown> {
  return Object.fromEntries(Object.entries(definition.properties).map(([key, propDef]) => [key, propDef.value]));
}

function logicTerminals(component: CircuitComponent): ComponentDef['terminals'] {
  const definition = getDef(component.type);
  if (!definition) return [];
  return getLogicComponentTerminals(component, definition) ?? definition.terminals;
}

/** Digital component library adapter: the only canvas-facing surface of this studio's catalog. */
export const DIGITAL_LOGIC_LIBRARY: SchematicComponentLibrary<CircuitComponent> = {
  getTerminals: (component): SchematicTerminal[] => logicTerminals(component).map(terminal => ({
    id: terminal.id,
    position: getTerminalWorldPos(component.x, component.y, terminal.x, terminal.y, component.rotation, component.flipH, component.flipV),
  })),
  hitTest: (component, point) => {
    const definition = getDef(component.type);
    if (!definition) return false;
    const bounds = getLogicComponentBounds(component, definition);
    return pointInComponentBox(component, point, bounds.width / 2, bounds.height / 2);
  },
  route: (from, to, components, excludeIds, fromAxis, toAxis) => calculateOrthogonalPath(from, to, components, TAB_D_GRID_SIZE, excludeIds, fromAxis, toAxis),
  createComponent: (type, position, existing) => {
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
};

const DIGITAL_LIBRARY_CATEGORIES: Record<string, ComponentDef[]> = DIGITAL_LOGIC_CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
  const items = getDigitalLogicComponentsByCategory(category);
  if (items.length) all[category] = items;
  return all;
}, {});

function ComponentPaletteIcon({ definition, colors, documented, isDark }: { definition: ComponentDef; colors: Palette; documented: boolean; isDark?: boolean }) {
  const padding = 24;
  let w = definition.width + padding;
  let h = definition.height + padding;
  let offsetY = 0;

  if (definition.terminals && definition.terminals.length > 0) {
    const xCoords = definition.terminals.map(t => Math.abs(t.x));
    const maxX = Math.max(...xCoords, definition.width / 2);
    w = Math.max(w, maxX * 2 + padding);

    const yCoords = definition.terminals.map(t => t.y);
    const minY = Math.min(...yCoords, -definition.height / 2);
    const maxY = Math.max(...yCoords, definition.height / 2);
    h = Math.max(h, (maxY - minY) + padding);
    offsetY = (minY + maxY) / 2;
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
        {renderSymbol(
          definition.symbol,
          false,
          {
            ...defaultProps(definition),
            _componentType: definition.id,
            _blockLabel: definition.name,
            _terminals: definition.terminals,
            _documentedStyle: documented,
            _isLibraryThumbnail: true,
            isDark,
            _isDark: isDark,
          },
          0
        )}
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
}: DigitalLogicSimulatorHomeProps) {
  const { t } = useTranslation('simulators');
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [showElectrons, setShowElectrons] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mae-show-electrons') !== 'false';
    } catch {
      return true;
    }
  });
  const [darkPreview, setDarkPreview] = useState(false);

  const hasStartedSimulation = useRef(false);
  const nadInputRef = useRef<HTMLInputElement>(null);
  const simulation = useRef<DiscreteEventLogicEngine>(createSimulationEngine());
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => simulation.current.getSnapshot());
  const animationFrame = useRef<number | null>(null);
  const wirePathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const componentClickRef = useRef<(component: CircuitComponent) => void>(() => undefined);
  const unhandledKeyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  const canvas = useSchematicCanvas<CircuitComponent>({
    library: DIGITAL_LOGIC_LIBRARY,
    gridSize: TAB_D_GRID_SIZE,
    isDark: darkPreview,
    defaultText: 'Logic Note',
    onComponentClick: component => componentClickRef.current(component),
    onUnhandledKey: event => unhandledKeyRef.current(event),
  });
  const { components, wires, texts, selectedComponent, selectedWire, selectedText, viewport } = canvas;
  const { setComponents, setWires, setSelection, commit } = canvas.document;

  // Dark mode synchronization
  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setDarkPreview(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
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
      primary: '#38bdf8',
      accent: '#a855f7',
      danger: '#f43f5e',
      selection: '#38bdf8',
      grid: '#181b22',
      wire: '#f8fafc',
      powered: '#38bdf8',
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
      wire: '#0f172a',
      powered: '#2563eb',
      input: '#ffffff',
      shadow: '0 12px 28px rgba(15,23,42,0.10)',
    }, [darkPreview]);

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
        pathEl.style.opacity = state === 1 ? '1' : state === 'X' ? '0.95' : '1';
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

  const updateComponentProperty = useCallback((key: string, value: unknown) => {
    if (!selectedComponent) return;
    canvas.updateComponent(selectedComponent.id, { props: { ...selectedComponent.props, [key]: value } });
  }, [canvas, selectedComponent]);

  const updateComponentProperties = useCallback((updates: Record<string, unknown>) => {
    if (!selectedComponent) return;
    canvas.updateComponent(selectedComponent.id, { props: { ...selectedComponent.props, ...updates } });
  }, [canvas, selectedComponent]);

  const replaceSelectedComponent = useCallback((newType: string) => {
    if (!selectedComponent) return;
    const newDefinition = getDef(newType);
    if (!newDefinition) return;
    const oldTerminalIds = logicTerminals(selectedComponent).map(t => t.id);
    const newTerminalIds = logicTerminals({ ...selectedComponent, type: newType, props: defaultProps(newDefinition) }).map(t => t.id);
    const newId = nanoid(10);
    const outcome = replaceComponent(components, wires, selectedComponent.id, oldTerminalIds, newTerminalIds, {
      id: newId,
      type: newType,
      label: nextComponentLabel(newType, components),
      props: defaultProps(newDefinition),
    });
    if (!outcome) return;
    const nextWires = canvas.refreshWires(outcome.wires, outcome.components, new Set([newId]));
    setComponents(outcome.components);
    setWires(nextWires);
    commit({ components: outcome.components, wires: nextWires });
    setSelection({ kind: 'component', id: newId });
    toast.success(`Replaced with ${newDefinition.name}`);
  }, [canvas, commit, components, selectedComponent, setComponents, setSelection, setWires, wires]);

  // Engine-side interaction: logic inputs toggle on click or on their bound hotkey.
  componentClickRef.current = (component: CircuitComponent) => {
    if (component.type !== 'digital-input') return;
    simulation.current.toggleDigitalInput(component.id);
    canvas.updateComponent(component.id, { props: { ...component.props, state: component.props.state === 'HIGH' ? 'LOW' : 'HIGH' } });
    setSnapshot(simulation.current.getSnapshot());
  };
  unhandledKeyRef.current = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const input = findInputByShortcut(components, event.key);
    if (!input) return;
    event.preventDefault();
    componentClickRef.current(input);
  };

  const nadDocument = useCallback(() => createNadDocument({
    components,
    wires,
    texts,
    viewport: { pan: viewport.pan, zoom: viewport.zoom },
    workspace: { gridVisible: canvas.gridMode !== 'hidden', snapEnabled: canvas.snapEnabled },
  }), [canvas.gridMode, canvas.snapEnabled, components, texts, viewport.pan, viewport.zoom, wires]);

  // Export / Import NAD netlist
  const exportNad = useCallback(() => {
    const blob = new Blob([serializeNad(nadDocument())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `digital-logic-${Date.now()}.nad`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Netlist exported successfully');
  }, [nadDocument]);

  const importNad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseNad(String(e.target?.result ?? ''));
        canvas.loadDocument({ components: parsed.components, wires: parsed.wires, texts: parsed.texts ?? [] });
        if (parsed.viewport?.pan && parsed.viewport.zoom) viewport.setView({ zoom: parsed.viewport.zoom, pan: parsed.viewport.pan });
        toast.success('Netlist imported successfully');
      } catch (err: unknown) {
        toast.error(`Failed to import netlist: ${err instanceof Error ? err.message : 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [canvas, viewport]);

  // Export Schematics / Modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportItems, setExportItems] = useState<ExportItem[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const handleOpenSaveImage = useCallback(() => {
    const svg = viewport.svgRef.current;
    if (!svg) return;
    const cloned = svg.cloneNode(true) as SVGSVGElement;
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
  }, [viewport.svgRef]);

  const handleShareProject = useCallback(() => {
    const serialized = encodeURIComponent(serializeNad(nadDocument()));
    setShareUrl(`${window.location.origin}${window.location.pathname}?project=${serialized}`);
    setShareModalOpen(true);
  }, [nadDocument]);

  const translatedLibraryCategories = useMemo(() => {
    return DIGITAL_LOGIC_CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
      const catKey = category.toLowerCase().replace(/[\s-]/g, '');
      const translatedCategory = t(`simulators:digital.${catKey}`, category);
      const items = getDigitalLogicComponentsByCategory(category).map(item => ({
        ...item,
        name: t(`simulators:digital.${item.id.replace(/[-]/g, '')}`, item.name)
      }));
      if (items.length) all[translatedCategory] = items;
      return all;
    }, {});
  }, [t]);

  return (
    <BaseSchematicCanvas
      canvas={canvas}
      colors={colors}
      canvasDefs={<style>{KATEX_EMBEDDED_FONT_CSS}</style>}
      libraryCategories={translatedLibraryCategories}
      renderLibraryIcon={item => <ComponentPaletteIcon definition={item} colors={colors} documented={tabDUiRefinement} isDark={darkPreview} />}
      wireColor={colors.wire}
      wirePathRef={(wireId, element) => {
        if (element) wirePathRefs.current.set(wireId, element);
        else wirePathRefs.current.delete(wireId);
      }}
      wireAppearance={(wire, path) => {
        const isHigh = simulation.current.getWireLogicState(wire.id) === 1;
        return {
          stroke: isHigh ? colors.powered : colors.wire,
          flowDots: showElectrons && isHigh ? getDotsOnPath(path, Math.max(1, Math.round(pathLength(path) / 36)), snapshot.time * 2) : [],
        };
      }}
      renderComponent={(component, { selected, symbolTransform }) => {
        const def = getDef(component.type);
        if (!def) return null;
        const inputHigh = component.type === 'digital-input' && component.props.state === 'HIGH';
        const outputHigh = component.type === 'digital-output' && (snapshot.terminalVoltages[`${component.id}:in`] ?? 0) === 1;
        const shouldShowLabel = !component.props._hideLabel && ['digital-input', 'digital-output', 'logic-clock'].includes(component.type);
        return (
          <>
            <g transform={symbolTransform} style={{ color: selected ? colors.selection : colors.text, cursor: component.type === 'digital-input' ? 'pointer' : 'move' }}>
              {renderSymbol(
                def.symbol,
                inputHigh || outputHigh,
                {
                  ...component.props,
                  _componentType: component.type,
                  _blockLabel: def.name ?? component.label,
                  _terminals: logicTerminals(component),
                  isDark: darkPreview,
                },
                snapshot.time
              )}
            </g>
            {shouldShowLabel && (
              <text
                x={0}
                y={def.height / 2 + 16}
                textAnchor="middle"
                fontSize={11}
                fontFamily="'KaTeX_Math', 'KaTeX_Main', serif"
                fontStyle="italic"
                fontWeight={400}
                fill={colors.text}
                pointerEvents="none"
              >
                {renderComponentCanvasLabel(component.label)}
              </text>
            )}
          </>
        );
      }}
      toolbarRow2={<>
        <ToolbarButton colors={colors} icon={<Download size={14} />} label="Export" title="Export circuit as NAD netlist" onClick={exportNad} />
        <ToolbarButton colors={colors} icon={<Upload size={14} />} label="Import" title="Import circuit from NAD netlist" onClick={() => nadInputRef.current?.click()} />
        <input ref={nadInputRef} type="file" accept=".nad,application/x-mae-nad+json,application/json" onChange={importNad} style={{ display: 'none' }} />
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<ImageIcon size={14} />} label="Save Image" title="Save circuit as image (PNG or SVG)" onClick={handleOpenSaveImage} />
        <ToolbarButton colors={colors} icon={<Share2 size={14} />} label="Share Project" title="Share circuit via Web Share API or deep link" onClick={handleShareProject} />
        <ToolbarDivider colors={colors} />
        <button
          type="button"
          onClick={() => { hasStartedSimulation.current = true; setSimulationRunning(v => !v); }}
          title={simulationRunning ? 'Pause simulation' : 'Run simulation'}
          className={(!simulationRunning && hasStartedSimulation.current) ? "brand-pill-active-rev" : "btn-active-brand"}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 14px',
            minHeight: 32,
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
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
            try { localStorage.setItem('mae-show-electrons', String(next)); } catch { /* storage unavailable */ }
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
          <StudioSlider
            aria-label="Simulation speed"
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
      canvasTitle="Interactive Digital Logic Canvas"
      emptyHint="Drag and drop logic gates, inputs, and components from the library to begin."
      simulationRunning={simulationRunning}
      analysisTitle="Logic Analysis Workspace"
      analysisContent={
        <DigitalLogicAnalysisBox
          colors={colors}
          standalone
          components={components}
          wires={wires}
          snapshot={snapshot}
          onGenerateCircuit={(newComps, newWires, mode) => {
            // One undoable step: Replace clears the schematic and centres on (0, 0); Append places the
            // sub-circuit right of existing work. Wires then route around every part on the canvas.
            const placed = placeGeneratedCircuit(components, { components: newComps, wires: newWires }, mode);
            const nextComponents = mode === 'replace' ? placed.components : [...components, ...placed.components];
            const nextWires = [...(mode === 'replace' ? [] : wires), ...routeWires(DIGITAL_LOGIC_LIBRARY, placed.wires, nextComponents)];
            canvas.loadDocument({ components: nextComponents, wires: nextWires, texts: mode === 'replace' ? [] : texts });
            requestAnimationFrame(() => canvas.zoomToFit());
          }}
        />
      }
      inspectorContent={selectedComponent ? (
        <ComponentInspector
          colors={colors}
          component={selectedComponent}
          definition={getDef(selectedComponent.type)!}
          allComponents={components}
          snapshot={snapshot}
          onLabelChange={label => canvas.updateComponent(selectedComponent.id, { label })}
          onPropertyChange={updateComponentProperty}
          onPropertiesChange={updateComponentProperties}
          onDelete={canvas.clipboard.removeSelection}
          onReplace={replaceSelectedComponent}
        />
      ) : selectedWire ? (
        <WireInspector
          colors={colors}
          wire={selectedWire}
          onRouting={canvas.setWireRouting}
          onDelete={canvas.clipboard.removeSelection}
        />
      ) : selectedText ? (
        <TextInspector
          colors={colors}
          text={selectedText}
          onUpdate={canvas.updateText}
          onMove={canvas.moveSelected}
          onDelete={canvas.clipboard.removeSelection}
        />
      ) : null}
      inspectorFooter={
        <div className="p-5 border-t border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]">
          <h3 className="text-sm font-bold tracking-wider text-slate-900 dark:text-white mb-3 uppercase flex items-center gap-2">
            <Cpu size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
            Digital Logic Lab
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The engine simulates real-time propagation delay, gate level logic, truth-table generation, Karnaugh mapping, and sequential timing waveforms. Place discrete gates, configure clock signals, and analyze combinational and sequential networks.
          </p>
        </div>
      }
    >
      <ExportPreviewModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        items={exportItems}
        format="png"
        onItemDownloaded={() => { }}
        onAllDownloaded={() => { }}
      />
      <ShareProjectModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shareUrl={shareUrl}
        componentCount={components.length}
        wireCount={wires.length}
        previewUrl={null}
      />
    </BaseSchematicCanvas>
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
  const { t } = useTranslation('simulators');
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
              <ElectricalLabel label={t(`digital.${definition.id.replace(/[-]/g, '')}`, definition.name)} />
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
            <option value="show">{t('digital.show', 'Show')}</option>
            <option value="hide">{t('digital.hide', 'Hide')}</option>
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
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${currentInputState === 'HIGH'
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
              className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${currentOutputState === 1
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
    return DIGITAL_LOGIC_CATEGORIES.reduce<Record<string, ComponentDef[]>>((all, category) => {
      const catKey = category.toLowerCase().replace(/[\s-]/g, '');
      const translatedCategory = t(`simulators:digital.${catKey}`, category);
      let items = getDigitalLogicComponentsByCategory(category);
      items = items.filter(
        item =>
          !trimmedQuery ||
          item.name.toLowerCase().includes(trimmedQuery) ||
          item.description.toLowerCase().includes(trimmedQuery),
      );
      if (items.length) {
        all[translatedCategory] = items.map(item => ({
          ...item,
          name: t(`simulators:digital.${item.id.replace(/[-]/g, '')}`, item.name)
        }));
      }
      return all;
    }, {});
  }, [open, query, t]);

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
  const { t } = useTranslation('simulators');
  return (
    <div style={{ overflowY: 'auto' }}>
      <InspectorHeader colors={colors} title="Wire path" subtitle={t('digital.wireDesc', 'Digital net propagating discrete Boolean levels (0/1/Z/X). The router maintains clean 90-degree orthogonal paths with jump arcs across disjoint nets.')} />
      <InspectorSection colors={colors} label="Routing Mode">
        <PropertyRow colors={colors} label="Routing">
          <select
            value={wire.routing}
            onChange={event => onRouting(event.target.value as CircuitWire['routing'])}
            style={inputStyle(colors)}
          >
            <option value="orthogonal">{t('digital.orthogonal', 'Orthogonal (Strict 90°)')}</option>
            <option value="straight">{t('digital.straight', 'Straight')}</option>
            <option value="manual">{t('digital.manualWaypoints', 'Manual Waypoints')}</option>
          </select>
        </PropertyRow>
      </InspectorSection>
      <InspectorSection colors={colors} label="Logic Meaning">
        <p style={{ color: colors.muted, fontSize: 11, lineHeight: 1.45, margin: 0 }}>
          {t('digital.wireDesc', 'Digital net propagating discrete Boolean levels (0/1/Z/X). The router maintains clean 90-degree orthogonal paths with jump arcs across disjoint nets.')}
        </p>
      </InspectorSection>
      <div style={{ padding: '12px 15px' }}>
        <InspectorButton colors={colors} danger onClick={onDelete}>
          <Trash2 size={13} /> {t('digital.deleteWire', 'Delete Wire')}
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
  const { t } = useTranslation('simulators');
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
          <Trash2 size={13} /> {t('digital.deleteText', 'Delete Text')}
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
// ToolbarButton, ToolbarDivider, InspectorHeader, InspectorButton, InspectorSection,
// PropertyRow, and ElectricalLabel now live in the shared workspace chrome module.

function componentLabelToLatex(label: string): string {
  const normalized = label.trim();
  const safe = (val: string) => val.replace(/([\\{}#$%&_~^])/g, '\\$1');
  const subMatch = normalized.match(/^([A-Za-z]+)_\{?(\d+)\}?$/);
  if (subMatch) {
    const prefix = subMatch[1].length === 1 ? subMatch[1] : `\\mathrm{${safe(subMatch[1])}}`;
    return `${prefix}_{${subMatch[2]}}`;
  }
  const match = normalized.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    const prefix = match[1].length === 1 ? match[1] : `\\mathrm{${safe(match[1])}}`;
    return `${prefix}_{${match[2]}}`;
  }
  if (/^[A-Za-z]$/.test(normalized)) {
    return normalized;
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
