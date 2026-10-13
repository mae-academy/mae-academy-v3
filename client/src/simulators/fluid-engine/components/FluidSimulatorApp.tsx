import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Download, Image as ImageIcon, Pause, Play, RotateCcw, Share2, StepForward, Upload } from 'lucide-react';
import { BaseSchematicCanvas, type ComponentRenderState } from '@/components/common/schematic/BaseSchematicCanvas';
import { useSchematicCanvas } from '@/components/common/schematic/useSchematicCanvas';
import { pointInComponentBox, routePath } from '@/components/common/schematic/schematicGeometry';
import type { SchematicComponent, SchematicComponentLibrary, SchematicTerminal } from '@/components/common/schematic/schematicTypes';
import { V3Math } from '@/components/ui/V3Math';
import { renderComponentCanvasLabel } from '@/components/common/schematic/schematicLabel';
import { SegmentedControl, StudioSlider } from '@/components/common/templates';
import { ExportPreviewModal, type ExportItem } from '@/simulators/circuit-engine/components/ui-components/ExportPreviewModal';
import { ShareProjectModal } from '@/simulators/circuit-engine/components/ui-components/ShareProjectModal';
import { KATEX_EMBEDDED_FONT_CSS } from '@/simulators/circuit-engine/models/katexSvgFonts';
import { getTerminalWorldPos } from '@/simulators/circuit-engine/models/wiring';
import { GRID_SIZE } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import { ToolbarButton, ToolbarDivider } from '@/simulators/shared/workspace/workspaceChrome';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { OPERATOR_PROP, isMechanicalOperator } from '@shared/fluid/engine/componentSolvers';
import { sensorId } from '@shared/fluid/engine/FluidEngine';
import type { EngineMedium, OperatorSide } from '@shared/fluid/engine/types';
import { publishDocsTool } from '@/components/simulations/toolDocs/activeToolStore';
import { useFluidEngineBridge } from '../hooks/useFluidEngineBridge';
import { useFunctionDiagram } from '../hooks/useFunctionDiagram';
import { useRelayLadder } from '../hooks/useRelayLadder';
import { FLUID_LIBRARY_CATEGORIES, LATCHING_OPERATORS, VALVE_SPECS, valveEdges, END_CAP_LENGTH, defaultFluidProps, getFluidDefinition, nextFluidTag, circuitOfTag, type FluidLibraryItem, type FluidMedium } from '../models/fluidCatalog';
import { FLUID_PROJECT_EXTENSION, decodeSharePayload, encodeSharePayload, parseFluidProject, serializeFluidProject } from '../models/fluidProject';
import { pressureColor } from '../models/pressureColors';
import { isCylinder, linkedSensor, listSensorOptions, resolveTagLinks, sensorTagsOf } from '../models/sensorCoupling';
import { MANUAL_TAG_PROP, inheritBranchTags } from '../models/branchTags';
import { knownSensorTags, knownSolenoidTags, sensorSignals, solenoidDrive, solenoidTargets } from '../models/ladderCoupling';
import { EMPTY_LADDER, type LadderCircuit } from '../models/relayLadder';
import { MANUAL_OPERATORS, assignSignalTags, operatorTagsOf } from '../models/signalTags';
import { FluidSymbol, spoolSlideStyle } from './symbols/FluidSymbols';
import { ActiveElementProperties } from './ActiveElementProperties';
import { FluidAnalysisPanel } from './analysis/FluidAnalysisPanel';
import { ControlCircuitTab } from './analysis/ControlCircuitTab';
import { FluidIOModule } from './io/FluidIOModule';
import { cutawayControls } from './dissection/cutawayControls';
import { cutawayKindOf } from './dissection/cutawayPhysics';
import { FluidLibraryIcon } from './library/FluidLibraryIcon';
import { groupLabel, optionLabel, partDescription, partName, useFluidT } from '../i18n/fluidText';

export const FLUID_STUDIO_TITLE = 'Pneumatics and Hydraulic Drive';

type FluidComponent = SchematicComponent;

const LIGHT: Palette = {
  background: '#eaf0f8', canvas: '#f8fbff', panel: '#ffffff', panelAlt: '#f1f5fb', line: '#d7e2ef', text: '#172033', muted: '#64748b', subtle: '#94a3b8',
  primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#7C3AED', grid: '#dbe7f3', wire: '#0f172a', powered: '#2563eb', input: '#ffffff', shadow: '0 12px 28px rgba(15,23,42,0.10)',
};
const DARK: Palette = {
  background: '#000000', canvas: '#07080a', panel: '#0d0f12', panelAlt: '#090a0d', line: '#1a1d24', text: '#f8fafc', muted: '#94a3b8', subtle: '#64748b',
  primary: '#38bdf8', accent: '#a855f7', danger: '#f43f5e', selection: '#7C3AED', grid: '#181b22', wire: '#f8fafc', powered: '#38bdf8', input: '#13161c', shadow: '0 12px 28px rgba(0,0,0,0.45)',
};

const nextLabel = (type: string, existing: FluidComponent[], branch = 1): string => nextFluidTag(type, existing.map(c => c.label), branch);

const ENGINE_MEDIUM: Record<FluidMedium, EngineMedium> = { PNEUMATIC: 'AIR', HYDRAULIC: 'OIL' };
const SANS = 'inherit';
const sideKey = (side: OperatorSide) => (side === 'left' ? 'actuationLeft' : 'actuationRight');

/** Translucent outline of a selected pipe; its core keeps the pressure colour. */
const WIRE_SELECTION_HALO = '#8b5cf6';
/** Height the limit-switch markers add above a cylinder barrel. */
const SENSOR_MARKER_TOP = 60;

/** Fluid component library adapter: the only canvas-facing surface of this studio's catalog. */
const createFluidLibrary = (medium: FluidMedium, activeBranch: () => number): SchematicComponentLibrary<FluidComponent> => ({
  wireStrokeWidth: 2,
  getTerminals: (component): SchematicTerminal[] => (getFluidDefinition(component.type)?.portsFor(component.props) ?? []).map(port => ({
    id: port.id,
    position: getTerminalWorldPos(component.x, component.y, port.x, port.y, component.rotation, component.flipH, component.flipV),
  })),
  hitTest: (component, point) => {
    const def = getFluidDefinition(component.type);
    if (!def) return false;
    const bounds = def.boundsFor(component.props);
    return pointInComponentBox(component, point, bounds.width / 2, bounds.height / 2, 0, 10, bounds.centerX ?? 0);
  },
  route: (from, to, _components, _exclude, fromAxis) => routePath(from, to, 'orthogonal', [], GRID_SIZE, fromAxis),
  createComponent: (type, position, existing) => {
    const def = getFluidDefinition(type);
    if (!def) return null;
    return { id: nanoid(10), type, x: position[0], y: position[1], rotation: 0, flipH: false, flipV: false, label: nextLabel(type, existing, activeBranch()), props: defaultFluidProps(def, medium) };
  },
  nextLabel: (type, existing) => nextLabel(type, existing, activeBranch()),
});


/** Pneumatics and Hydraulic Drive studio: same shared schematic canvas, chrome and inspector layout as Electrical Circuits. */
export function FluidSimulatorApp() {
  const { t, i18n } = useTranslation('simulators');
  const tr = useFluidT();
  const textDir = i18n?.language === 'ar' ? 'rtl' : 'ltr';
  const [isDark, setIsDark] = useState(false);
  const [medium, setMedium] = useState<FluidMedium>('PNEUMATIC');
  useEffect(() => { publishDocsTool('fluid', medium === 'PNEUMATIC' ? 'pneumatics' : 'hydraulics'); }, [medium]);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const held = useRef<Array<{ id: string; side: OperatorSide }>>([]);
  /** Inputs locked on with the Latch toggle, keyed `componentId:side`. A held Push never releases a latched input. */
  const [latched, setLatched] = useState<Record<string, boolean>>({});
  const latchedRef = useRef(latched);
  latchedRef.current = latched;
  const fileInput = useRef<HTMLInputElement>(null);
  const [exportItems, setExportItems] = useState<ExportItem[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const colors = isDark ? DARK : LIGHT;

  /** Circuit new parts join: the one of the part last selected or renamed (1V2 → 1, 2A1 → 2); energy parts (circuit 0) never change it. */
  const activeBranch = useRef(1);
  const library = useMemo(() => createFluidLibrary(medium, () => activeBranch.current), [medium]);
  const canvas = useSchematicCanvas<FluidComponent>({ library, gridSize: GRID_SIZE, isDark, defaultText: tr('noteDefault') });
  const { selectedComponent, components } = canvas;
  /** Pipes seen on the previous render: a newly drawn pipe lets a floating part inherit the branch of what it is piped to. */
  const previousWires = useRef(canvas.wires);
  useEffect(() => {
    const before = previousWires.current;
    previousWires.current = canvas.wires;
    const added = canvas.wires.filter(wire => !before.some(known => known.id === wire.id));
    if (added.length !== 1 || canvas.wires.length !== before.length + 1) return;
    const renamed = inheritBranchTags(canvas.document.componentsRef.current, before, added[0]);
    if (renamed.length === 0) return;
    const next = canvas.document.componentsRef.current.map(component => { const change = renamed.find(entry => entry.id === component.id); return change ? { ...component, label: change.label } : component; });
    canvas.document.componentsRef.current = next;
    canvas.document.setComponents(next);
  }, [canvas.wires, canvas.document]);
  const selectedBranch = selectedComponent ? circuitOfTag(selectedComponent.label) : undefined;
  if (selectedBranch) activeBranch.current = selectedBranch;

  /** Every limit switch on the canvas, for the valve coupling dropdowns and the tags drawn beside linked operators. */
  const signalTags = useMemo(() => assignSignalTags(components), [components]);
  const sensorOptions = useMemo(() => listSensorOptions(components, signalTags.sensors), [components, signalTags]);
  /** The schematic as the simulation sees it: a roller tagged like a position sensor (1B2) is mechanically linked to that sensor. */
  const wired = useMemo(() => resolveTagLinks(components, sensorOptions), [components, sensorOptions]);

  /** The headless engine owns all simulation state; the canvas only draws its snapshot. */
  const bridge = useFluidEngineBridge(wired, canvas.wires, { medium: ENGINE_MEDIUM[medium], speed: simulationSpeed });
  const { snapshot, triggerManualInput } = bridge;
  /** Actuators of the diagram, in canvas order, with the tags of their position sensors. */
  const diagramCylinders = useMemo(() => components.filter(isCylinder).map(cylinder => ({ id: cylinder.id, label: cylinder.label, sensors: sensorTagsOf(cylinder, signalTags.sensors[cylinder.id]) })), [components, signalTags]);
  /** Tag of the first manual input (pushbutton, lever, pedal): the start signal that begins step 1 of the diagram. */
  const startTag = useMemo(() => {
    for (const valve of components.filter(component => VALVE_SPECS[component.type])) {
      const tags = operatorTagsOf(valve, signalTags, sensorOptions);
      for (const side of ['left', 'right'] as const) if (MANUAL_OPERATORS.includes(String(valve.props[OPERATOR_PROP[side]])) && tags[side]) return tags[side];
    }
    return undefined;
  }, [components, signalTags, sensorOptions]);
  const tracker = useFunctionDiagram(snapshot, bridge.status, useMemo(() => diagramCylinders.map(cylinder => cylinder.id), [diagramCylinders]));
  const running = bridge.status === 'RUNNING';
  /** Once started (running or paused) the circuit is live: pressures are shown and operators respond. */
  const live = bridge.status !== 'IDLE';

  /**
   * Control Circuit tab: the 24 V relay ladder runs on the engine's clock. Limit switches of the schematic are its sensor inputs
   * (matched by tag); its energised solenoids hold the valve ends with the same tag on (`solenoidDrive`).
   */
  const [ladderCircuit, setLadderCircuit] = useState<LadderCircuit>(EMPTY_LADDER);
  const sensorLevels = useMemo(() => (live ? sensorSignals(sensorOptions, snapshot.sensors) : {}), [live, sensorOptions, snapshot.sensors]);
  const relay = useRelayLadder({ circuit: ladderCircuit, live, time: snapshot.time, sensors: sensorLevels });
  const solenoids = useMemo(() => solenoidTargets(wired, signalTags, sensorOptions), [wired, signalTags, sensorOptions]);
  /** Solenoid ends the controller currently holds on, keyed `valveId:side`. */
  const driven = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const drive = solenoidDrive(solenoids, live ? relay.result.solenoids : {});
    const present = new Set(solenoids.map(target => target.key));
    const apply = (componentId: string, side: OperatorSide, key: string, on: boolean) => {
      driven.current[key] = on;
      // A held push or a latch on the same end (Control Board) keeps it on after the solenoid drops out.
      triggerManualInput(componentId, side, on || Boolean(latchedRef.current[key]));
    };
    for (const target of solenoids) if (Boolean(driven.current[target.key]) !== drive[target.key]) apply(target.componentId, target.side, target.key, drive[target.key]);
    // A solenoid whose valve end was removed or re-assigned lets go.
    for (const key of Object.keys(driven.current)) {
      if (present.has(key)) continue;
      if (driven.current[key]) { const split = key.lastIndexOf(':'); apply(key.slice(0, split), key.slice(split + 1) as OperatorSide, key, false); }
      delete driven.current[key];
    }
  }, [solenoids, live, relay.result, triggerManualInput]);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const releaseHeld = useCallback(() => {
    const releasing = held.current;
    held.current = [];
    for (const { id, side } of releasing) triggerManualInput(id, side, Boolean(latchedRef.current[`${id}:${side}`] || driven.current[`${id}:${side}`]));
  }, [triggerManualInput]);
  useEffect(() => {
    const events = ['mouseup', 'touchend', 'touchcancel'] as const;
    events.forEach(name => window.addEventListener(name, releaseHeld));
    return () => events.forEach(name => window.removeEventListener(name, releaseHeld));
  }, [releaseHeld]);

  /** Momentary pulse: active while the pointer is held down, released by the window mouseup listener. */
  const pushOperator = (id: string, side: OperatorSide) => {
    held.current.push({ id, side });
    triggerManualInput(id, side, true);
  };

  /** Latch toggle: locks the actuator on until clicked again. */
  const toggleLatch = (id: string, side: OperatorSide) => {
    const key = `${id}:${side}`;
    const next = !latchedRef.current[key];
    latchedRef.current = { ...latchedRef.current, [key]: next };
    setLatched(latchedRef.current);
    triggerManualInput(id, side, next || held.current.some(entry => entry.id === id && entry.side === side));
  };

  /** Clicking an operator glyph on the canvas: levers latch, every other manual operator is held until released. */
  const pressOperator = (id: string, side: OperatorSide, kind: string) => {
    if (LATCHING_OPERATORS.includes(kind)) toggleLatch(id, side);
    else pushOperator(id, side);
  };

  const resetSimulation = useCallback(() => {
    held.current = [];
    latchedRef.current = {};
    setLatched({});
    driven.current = {};
    relay.clearInputs();
    bridge.reset();
  }, [bridge.reset, relay.clearInputs]);

  const newSchematic = useCallback(() => {
    activeBranch.current = 1;
    previousWires.current = [];
    canvas.loadDocument({ components: [], wires: [], texts: [] }, { resetHistory: true });
    setLadderCircuit(EMPTY_LADDER);
    resetSimulation();
  }, [canvas, resetSimulation]);

  const projectDocument = useCallback(() => ({ medium, components, wires: canvas.wires, texts: canvas.texts, ...(ladderCircuit.paths.length > 0 ? { ladder: ladderCircuit } : {}) }), [medium, components, canvas.wires, canvas.texts, ladderCircuit]);

  const exportProject = () => {
    const url = URL.createObjectURL(new Blob([serializeFluidProject(projectDocument())], { type: 'application/x-mae-nad+json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `fluid-circuit${FLUID_PROJECT_EXTENSION}`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(tr('project.exported'));
  };

  const loadProject = useCallback((text: string, isShared = false) => {
    try {
      const project = parseFluidProject(isShared ? decodeSharePayload(text) : text);
      setMedium(project.medium);
      resetSimulation();
      activeBranch.current = 1;
      previousWires.current = project.wires;
      canvas.loadDocument({ components: project.components, wires: project.wires, texts: project.texts });
      setLadderCircuit(project.ladder ?? EMPTY_LADDER);
      toast.success(tr('project.imported'));
    } catch (error) {
      toast.error(tr('project.importFailed', { reason: error instanceof Error ? error.message : '' }));
    }
  }, [canvas, resetSimulation, tr]);

  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadProject(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  /** A shared link carries the whole project in `?project=`; open it once on arrival. */
  useEffect(() => {
    const shared = new URLSearchParams(window.location.search).get('project');
    if (shared) loadProject(shared, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shareProject = () => {
    setShareUrl(`${window.location.origin}${window.location.pathname}?project=${encodeSharePayload(projectDocument())}`);
    setShareOpen(true);
  };

  /** Tight SVG of the drawn schematic (parts, pipes, notes), handed to the shared export preview. */
  const saveImage = () => {
    const svg = canvas.viewport.svgRef.current;
    const layer = svg?.querySelector('#circuit-elements-layer') as SVGGElement | null;
    if (!svg || !layer || (components.length === 0 && canvas.wires.length === 0 && canvas.texts.length === 0)) {
      toast.error(tr('project.nothingToExport'));
      return;
    }
    const PAD = 32;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    try {
      const box = layer.getBBox();
      if (box.width > 0 || box.height > 0) { minX = box.x; minY = box.y; maxX = box.x + box.width; maxY = box.y + box.height; }
    } catch { /* getBBox unavailable */ }
    canvas.texts.forEach(text => {
      const width = Math.max(24, text.text.length * text.fontSize * 0.6);
      minX = Math.min(minX, text.x - 4); minY = Math.min(minY, text.y - 4);
      maxX = Math.max(maxX, text.x + width + 4); maxY = Math.max(maxY, text.y + text.fontSize + 8);
    });
    if (!Number.isFinite(minX)) { toast.error(tr('project.nothingToExport')); return; }
    const x = Math.floor(minX - PAD); const y = Math.floor(minY - PAD);
    const width = Math.ceil(maxX - minX + PAD * 2); const height = Math.ceil(maxY - minY + PAD * 2);
    const ns = 'http://www.w3.org/2000/svg';
    const out = document.createElementNS(ns, 'svg');
    out.setAttribute('xmlns', ns);
    out.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    out.setAttribute('width', String(width));
    out.setAttribute('height', String(height));
    const defs = svg.querySelector('defs');
    if (defs) out.appendChild(defs.cloneNode(true));
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('style', `color:${colors.text}`);
    group.appendChild(layer.cloneNode(true));
    svg.querySelectorAll('[data-text-id]').forEach(node => group.appendChild(node.cloneNode(true)));
    out.appendChild(group);
    const svgData = new XMLSerializer().serializeToString(out);
    setExportItems([{ id: 'fluid-main', title: tr('project.imageTitle'), filename: 'fluid-schematic', format: 'svg', type: 'circuit', svgString: svgData, dataUrl: URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })) }]);
    setExportOpen(true);
  };

  /** Swaps the selected part for another library part in place: same id, position and orientation; pipes keep every port the new part also has. */
  const replaceSelected = (newType: string) => {
    const old = selectedComponent;
    const next = getFluidDefinition(newType);
    const previous = old && getFluidDefinition(old.type);
    if (!old || !next || !previous) return;
    const props = { ...defaultFluidProps(next, medium), ...(old.props._hideLabel ? { _hideLabel: true } : {}), ...(old.props._hideValue ? { _hideValue: true } : {}) };
    const oldPorts = previous.portsFor(old.props).map(port => port.id);
    const newPorts = next.portsFor(props).map(port => port.id);
    const remap = (port: string) => (newPorts.includes(port) ? port : oldPorts.length === newPorts.length ? newPorts[oldPorts.indexOf(port)] : undefined);
    const replacement: FluidComponent = { ...old, type: newType, label: nextLabel(newType, components.filter(component => component.id !== old.id), circuitOfTag(old.label) || activeBranch.current), props };
    const nextComponents = components.map(component => (component.id === old.id ? replacement : component));
    const kept = canvas.wires.flatMap(wire => {
      const from = wire.fromComp === old.id ? remap(wire.fromTerm) : wire.fromTerm;
      const to = wire.toComp === old.id ? remap(wire.toTerm) : wire.toTerm;
      return from === undefined || to === undefined ? [] : [{ ...wire, fromTerm: from, toTerm: to }];
    });
    canvas.loadDocument({ components: nextComponents, wires: canvas.refreshWires(kept, nextComponents, new Set([old.id])), texts: canvas.texts }, { resetHistory: false });
    canvas.document.setSelection({ kind: 'component', id: old.id });
    toast.success(tr('inspector.replaced', { name: partName(tr, newType, next.name) }));
  };


  /** An operator is depressed by a person (held / latched) or, for a plain roller, by the cam of the cylinder whose limit switch it is linked to. */
  const operatorDepressed = (id: string, side: OperatorSide): boolean => {
    if (bridge.manualInputs[id]?.[side]) return true;
    const props = wired.find(component => component.id === id)?.props;
    const sensor = props ? linkedSensor(props, side) : '';
    return Boolean(live && sensor && props?.[OPERATOR_PROP[side]] === 'Roller' && snapshot.sensors[sensor]);
  };

  const renderComponent = (component: FluidComponent, state: ComponentRenderState) => {
    const def = getFluidDefinition(component.type);
    if (!def) return null;
    const valve = snapshot.valves[component.id];
    return (
      <g transform={state.symbolTransform}>
        <FluidSymbol
          definition={def}
          medium={medium}
          props={component.props}
          stroke={state.selected ? colors.selection : colors.text}
          activeCell={live ? valve?.envelope : undefined}
          spoolOffset={valve?.spoolOffset}
          extension={snapshot.cylinders[component.id]?.stroke}
          logicOffset={live ? snapshot.logic[component.id]?.offset : undefined}
          sensorTags={isCylinder(component) ? sensorTagsOf(component, signalTags.sensors[component.id]) : undefined}
          sensorActive={live ? [Boolean(snapshot.sensors[sensorId(component.id, 'S1')]), Boolean(snapshot.sensors[sensorId(component.id, 'S2')])] : undefined}
          operatorTags={valve || component.type === 'service-unit' ? operatorTagsOf(component, signalTags, sensorOptions) : undefined}
          hideText={Boolean(component.props._hideValue)}
          shaftAngle={live ? snapshot.motors[component.id]?.angle : undefined}
          operatorPressed={valve ? { left: operatorDepressed(component.id, 'left'), right: operatorDepressed(component.id, 'right') } : undefined}
        />
      </g>
    );
  };

  /**
   * Clickable manual operators: once the circuit is live, pressing the glyph actuates the valve instead of dragging it.
   * The operators ride the sliding strip, so the click targets ride it too: same offset, same transition as the drawn cap.
   */
  const renderOverlay = (component: FluidComponent, state: ComponentRenderState) => {
    const spec = VALVE_SPECS[component.type];
    if (!spec) return null;
    const edges = valveEdges(spec);
    return (
      <g transform={state.symbolTransform}>
        <g className="valve-operator-hitboxes" style={spoolSlideStyle(snapshot.valves[component.id]?.spoolOffset)}>
          {(['left', 'right'] as const).map(side => {
            const kind = String(component.props[sideKey(side)] ?? 'None');
            if (!isMechanicalOperator(kind)) return null;
            return (
              <rect
                key={side}
                className="valve-operator-hitbox"
                data-side={side}
                x={side === 'left' ? edges.left - END_CAP_LENGTH : edges.right}
                y={-20}
                width={END_CAP_LENGTH}
                height={40}
                fill="transparent"
                style={{ cursor: live ? 'pointer' : 'default' }}
                onMouseDown={event => {
                  if (!live) return;
                  event.stopPropagation();
                  pressOperator(component.id, side, kind);
                }}
              >
                <title>{`${component.label} ${optionLabel(tr, kind)}${live ? '' : ` (${tr('board.pressRunValve')})`}`}</title>
              </rect>
            );
          })}
        </g>
      </g>
    );
  };

  /** Pressure heat map: each pipe takes the colour of the pressure at its port. */
  const wireAppearance = (wire: { fromComp: string; fromTerm: string }) => ({
    stroke: live ? pressureColor(snapshot.portPressure[`${wire.fromComp}:${wire.fromTerm}`] ?? 0, medium) : undefined,
    // Selecting a pipe must never hide its pressure state: outline it instead of recolouring it.
    selectionHalo: WIRE_SELECTION_HALO,
  });

  const labelsLayer = components.map(component => {
    const def = getFluidDefinition(component.type);
    if (!def || component.props._hideLabel) return null;
    const top = Math.min(-def.boundsFor(component.props).height / 2, ...def.portsFor(component.props).map(p => p.y), isCylinder(component) ? -SENSOR_MARKER_TOP : 0);
    // Parts whose origin is not their middle (2-position valves) centre the tag over the body.
    const [cx] = getTerminalWorldPos(component.x, component.y, def.boundsFor(component.props).centerX ?? 0, 0, component.rotation, component.flipH, component.flipV);
    return <text key={component.id} x={cx} y={component.y + top - 22} textAnchor="middle" fontSize={14} letterSpacing="0.025em" fill={colors.text}>{renderComponentCanvasLabel(component.label)}</text>;
  });

  /** The cutaway follows the last inspectable part clicked and stays on it when the canvas is clicked empty. */
  const lastInspectableId = useRef<string | null>(null);
  if (selectedComponent && cutawayKindOf(selectedComponent)) lastInspectableId.current = selectedComponent.id;
  const cutawaySubject = selectedComponent && cutawayKindOf(selectedComponent) ? selectedComponent : components.find(component => component.id === lastInspectableId.current);

  const def = selectedComponent ? getFluidDefinition(selectedComponent.type) : undefined;
  const inspector = selectedComponent && def ? (
    <div dir={textDir}><ActiveElementProperties
      component={selectedComponent}
      definition={def}
      colors={colors}
      sensorOptions={sensorOptions}
      autoSensorTags={signalTags.sensors[selectedComponent.id]}
      operatorTags={VALVE_SPECS[selectedComponent.type] ? operatorTagsOf(selectedComponent, signalTags, sensorOptions) : undefined}
      replaceGroups={FLUID_LIBRARY_CATEGORIES[medium]}
      onReplace={replaceSelected}
      onInitialStateChange={type => canvas.updateComponent(selectedComponent.id, { type })}
      onLabelChange={label => canvas.updateComponent(selectedComponent.id, { label, props: { ...selectedComponent.props, [MANUAL_TAG_PROP]: true } })}
      onPropsChange={props => canvas.updateComponent(selectedComponent.id, { props })}
    /></div>
  ) : null;

  const libraryCategories = useMemo(
    () => Object.fromEntries(Object.entries(FLUID_LIBRARY_CATEGORIES[medium]).map(([title, items]) => [
      groupLabel(tr, title),
      items.map(item => ({ ...item, name: partName(tr, item.id, item.name), description: partDescription(tr, item.id, item.description) })),
    ])),
    [medium, tr],
  );

  const changeMedium = (next: FluidMedium) => {
    if (next === medium) return;
    if (components.length > 0 && !window.confirm(tr('switchConfirm'))) return;
    newSchematic();
    setMedium(next);
  };

  return (
    <>
    <div className="mb-4 flex justify-center">
      <SegmentedControl
        options={[{ label: tr('pneumatic'), value: 'PNEUMATIC' }, { label: tr('hydraulic'), value: 'HYDRAULIC' }]}
        value={medium}
        onChange={changeMedium}
        aria-label={tr('mediumAria')}
      />
    </div>
    <BaseSchematicCanvas<FluidComponent, FluidLibraryItem>
      canvas={canvas}
      colors={colors}
      canvasDefs={<style>{KATEX_EMBEDDED_FONT_CSS}</style>}
      libraryCategories={libraryCategories}
      renderLibraryIcon={item => <FluidLibraryIcon item={item} colors={colors} medium={medium} />}
      renderComponent={renderComponent}
      wireColor={isDark ? '#94a3b8' : '#475569'}
      wireAppearance={wireAppearance}
      renderComponentOverlay={renderOverlay}
      labelsLayer={<>{labelsLayer}</>}
      toolbarRow2={<>
        <ToolbarButton colors={colors} icon={<Download size={14} />} label={tr('project.export')} title={tr('project.exportTip')} onClick={exportProject} />
        <ToolbarButton colors={colors} icon={<Upload size={14} />} label={tr('project.import')} title={tr('project.importTip')} onClick={() => fileInput.current?.click()} />
        <input ref={fileInput} type="file" accept={FLUID_PROJECT_EXTENSION} onChange={importProject} style={{ display: 'none' }} data-testid="fluid-import-input" />
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<ImageIcon size={14} />} label={tr('project.saveImage')} title={tr('project.saveImageTip')} onClick={saveImage} />
        <ToolbarButton colors={colors} icon={<Share2 size={14} />} label={tr('project.share')} title={tr('project.shareTip')} onClick={shareProject} />
        <ToolbarDivider colors={colors} />
        <button
          type="button"
          onClick={running ? bridge.pause : bridge.run}
          title={running ? tr('pauseTip') : tr('runTip')}
          className={`max-sm:min-h-11! ${bridge.status === 'PAUSED' ? 'brand-pill-active-rev' : 'btn-active-brand'}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', minHeight: 32, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
          {running ? tr('pause') : tr('solveRun')}
        </button>
        <ToolbarButton colors={colors} icon={<StepForward size={14} />} title={tr('stepTip')} onClick={bridge.step} disabled={running} />
        <ToolbarButton colors={colors} icon={<RotateCcw size={14} />} title={tr('resetTip')} onClick={resetSimulation} />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 65, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <V3Math math={`${snapshot.time.toFixed(3)}\\,\\mathrm{s}`} />
        </span>
        <ToolbarDivider colors={colors} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StudioSlider aria-label={tr('simulationSpeed')} min={0.1} max={4} step={0.05} value={simulationSpeed} onChange={setSimulationSpeed} hideHeader className="w-24" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300" style={{ minWidth: 42, display: 'inline-flex', alignItems: 'center' }}>
            <V3Math math={`${simulationSpeed.toFixed(2)}\\times`} />
          </span>
        </div>
      </>}
      canvasTitle={t('shell.interactiveCanvas', 'Interactive Canvas')}
      emptyHint={tr('emptyHint')}
      simulationRunning={running}
      analysisTitle={tr('analysisTitle')}
      analysisContent={
        <div dir={textDir}><FluidAnalysisPanel
          colors={colors}
          isDark={isDark}
          medium={medium}
          snapshot={snapshot}
          selected={cutawaySubject}
          functionDiagram={{ cylinders: diagramCylinders, tracker, active: live, startTag }}
          controlCircuit={(
            <ControlCircuitTab
              colors={colors}
              isDark={isDark}
              circuit={ladderCircuit}
              onCircuitChange={setLadderCircuit}
              ladder={relay}
              live={live}
              sensorTags={knownSensorTags(sensorOptions)}
              solenoidTags={knownSolenoidTags(solenoids)}
              exampleTags={{ stop: sensorOptions.find(option => option.end === 'extended')?.tag ?? '1B2', solenoid: solenoids[0]?.tag ?? '1Y1' }}
            />
          )}
          cutawayControls={cutawaySubject ? cutawayControls(cutawaySubject, { components, wires: canvas.wires, update: (id, props) => canvas.updateComponent(id, { props }) }, tr) : undefined}
        /></div>
      }
      inspectorContent={inspector}
      inspectorExtraCards={
        <div dir={textDir}>
          <FluidIOModule
            colors={colors}
            medium={medium}
            components={wired}
            snapshot={snapshot}
            manualInputs={bridge.manualInputs}
            latched={latched}
            live={live}
            signalTags={signalTags}
            sensorOptions={sensorOptions}
            onPush={pushOperator}
            onLatchToggle={toggleLatch}
            ladder={{ circuit: ladderCircuit, relay }}
            onShutoffChange={(id, on) => { const unit = components.find(component => component.id === id); if (unit) canvas.updateComponent(id, { props: { ...unit.props, shutoff: on ? 'ON' : 'OFF' } }); }}
          />
        </div>
      }
    >
      <ExportPreviewModal isOpen={exportOpen} onClose={() => setExportOpen(false)} items={exportItems} format="png" onItemDownloaded={() => { }} onAllDownloaded={() => { }} />
      <ShareProjectModal isOpen={shareOpen} onClose={() => setShareOpen(false)} shareUrl={shareUrl} componentCount={components.length} wireCount={canvas.wires.length} previewUrl={null} />
    </BaseSchematicCanvas>
    </>
  );
}

export default FluidSimulatorApp;
