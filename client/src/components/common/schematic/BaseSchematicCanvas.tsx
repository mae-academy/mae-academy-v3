import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Redo2,
  RotateCw,
  Scissors,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { V3Math } from '@/components/ui/V3Math';
import { SegmentedControl } from '@/components/common/templates';
import { UnifiedWorkspaceShell, type WorkspaceTab } from '@/simulators/shared/workspace/UnifiedWorkspaceShell';
import { ElectricalLabel, ToolbarButton, ToolbarDivider } from '@/simulators/shared/workspace/workspaceChrome';
import { marqueeStyle, wireCornerHandleStyle, type Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { TERMINAL_HIT_RADIUS, TERMINAL_RADIUS, computeTerminalVisibility } from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import {
  buildJumpArcPath,
  calculateWireIntersections,
  createWireNetResolver,
  junctionDotPositions,
  pointsToPath,
  resolveRenderPath,
} from '@/components/common/schematic/schematicGeometry';
import { LIBRARY_DRAG_MIME, type SchematicCanvasController } from '@/components/common/schematic/useSchematicCanvas';
import type { SchematicComponent, SchematicGridMode, SchematicPoint, SchematicWire } from '@/components/common/schematic/schematicTypes';
import { renderComponentCanvasLabel } from '@/components/common/schematic/schematicLabel';
import { SchematicHtmlLayer, SchematicOverlayContext } from '@/components/common/schematic/SchematicHtmlOverlay';
import { useCoarsePointer } from '@/components/common/schematic/useCoarsePointer';

export interface SchematicLibraryItem {
  id: string;
  name: string;
  description: string;
}

export interface ComponentRenderState {
  selected: boolean;
  hovered: boolean;
  /** rotate/flip/scale transform for the symbol group inside the translate frame. */
  symbolTransform: string;
}

export interface WireAppearance {
  stroke?: string;
  dashed?: boolean;
  /** Flow particles (electrons / logic-high pulses) rendered above components. */
  flowDots?: SchematicPoint[];
  /**
   * Opt-in selection style for studios whose wire colour carries state (e.g. a pressure heat map):
   * a selected wire keeps its own stroke and gets a translucent outline in this colour instead of
   * being recoloured with the selection colour.
   */
  selectionHalo?: string;
}

export interface BaseSchematicCanvasProps<C extends SchematicComponent, I extends SchematicLibraryItem> {
  canvas: SchematicCanvasController<C>;
  colors: Palette;

  /* ── Component library (domain) ── */
  libraryCategories: Record<string, I[]>;
  renderLibraryIcon: (item: I) => React.ReactNode;

  /* ── Symbol rendering (domain) ── */
  renderComponent: (component: C, state: ComponentRenderState) => React.ReactNode;
  renderComponentOverlay?: (component: C, state: ComponentRenderState) => React.ReactNode;
  componentOpacity?: (component: C) => number;
  terminalFill?: (component: C, terminalId: string) => string | undefined;
  /** Base conductor colour; junction dots use it too. */
  wireColor: string;
  wireAppearance?: (wire: SchematicWire, path: SchematicPoint[], selected: boolean) => WireAppearance;
  wirePathRef?: (wireId: string, element: SVGPathElement | null) => void;
  /** Net resolver for jump-arcs vs junction dots; defaults to terminal union-find. */
  netOf?: (wire: SchematicWire) => string;
  canvasUnderlay?: React.ReactNode;
  labelsLayer?: React.ReactNode;
  canvasOverlay?: React.ReactNode;
  canvasDefs?: React.ReactNode;

  /* ── Chrome slots (domain) ── */
  toolbarExtra?: React.ReactNode;
  toolbarRow2: React.ReactNode;
  canvasTitle: string;
  emptyHint: string;
  simulationRunning: boolean;
  canvasStatusExtra?: React.ReactNode;
  analysisTitle: string;
  analysisContent: React.ReactNode;
  inspectorTop?: React.ReactNode;
  inspectorContent: React.ReactNode | null;
  inspectorFooter?: React.ReactNode;
  inspectorExtraCards?: React.ReactNode;
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;
  children?: React.ReactNode;
}

const GRID_OPTIONS: { label: string; value: SchematicGridMode }[] = [
  { label: 'Dotted', value: 'dots' },
  { label: 'Cartesian', value: 'cartesian' },
  { label: 'Hidden', value: 'hidden' },
];

export function filterLibrary<I extends SchematicLibraryItem>(categories: Record<string, I[]>, query: string): Record<string, I[]> {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  return Object.entries(categories).reduce<Record<string, I[]>>((all, [category, items]) => {
    const matches = items.filter(item => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
    if (matches.length) all[category] = matches;
    return all;
  }, {});
}

interface SchematicLibraryPanelProps<I extends SchematicLibraryItem> {
  colors: Palette;
  categories: Record<string, I[]>;
  renderIcon: (item: I) => React.ReactNode;
  onAdd: (type: string) => void;
  /** Touch/pen drag-to-place: called with the drop point (client px) when a tile is released over `dropTargetRef`. */
  onDropAt?: (type: string, clientX: number, clientY: number) => void;
  dropTargetRef?: React.RefObject<Element | null>;
}

/** Touch/pen must hold a tile this long before it lifts; a quicker swipe scrolls the palette instead. */
const TILE_LONG_PRESS_MS = 200;
const TILE_TOUCH_SLOP_PX = 8;
const TILE_MOUSE_SLOP_PX = 6;
/** The ghost floats above the fingertip so the finger never hides where the part will land. */
const TILE_TOUCH_LIFT_PX = 56;

interface TileDragSession<I> {
  item: I;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  active: boolean;
  timer: number | null;
}

/** Shared tile grid for every studio's component catalog (drag-to-place or click-to-add). */
/** Legacy/default annotation colours that follow the active theme instead of staying frozen at creation time. */
const ADAPTIVE_TEXT_COLORS = new Set(['#000', '#000000', '#0f172a', '#172033', '#e2e8f0', '#f8fafc', '#fff', '#ffffff']);

export function SchematicLibraryPanel<I extends SchematicLibraryItem>({ colors, categories, renderIcon, onAdd, onDropAt, dropTargetRef }: SchematicLibraryPanelProps<I>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const coarse = useCoarsePointer();
  const [ghost, setGhost] = useState<{ item: I; x: number; y: number; lift: number; over: boolean } | null>(null);
  const session = useRef<TileDragSession<I> | null>(null);
  const scrollLock = useRef(false);
  const suppressClickUntil = useRef(0);
  const onDropAtRef = useRef(onDropAt);
  onDropAtRef.current = onDropAt;
  const dropTargetRefRef = useRef(dropTargetRef);
  dropTargetRefRef.current = dropTargetRef;
  const liftTile = useRef<(current: TileDragSession<I>, captureTarget?: Element) => void>(() => undefined);

  useEffect(() => {
    const isOverTarget = (x: number, y: number) => {
      const rect = dropTargetRefRef.current?.current?.getBoundingClientRect();
      return Boolean(rect) && x >= rect!.left && x <= rect!.right && y >= rect!.top && y <= rect!.bottom;
    };
    const liftOf = (current: TileDragSession<I>) => (current.pointerType === 'mouse' ? 0 : TILE_TOUCH_LIFT_PX);
    const end = () => {
      const current = session.current;
      if (current?.timer) window.clearTimeout(current.timer);
      session.current = null;
      scrollLock.current = false;
      setGhost(null);
    };
    const lift = (current: TileDragSession<I>, captureTarget?: Element) => {
      if (captureTarget) {
        try { captureTarget.setPointerCapture(current.pointerId); } catch { /* pointer already gone */ }
      }
      current.active = true;
      current.timer = null;
      scrollLock.current = true;
      const l = liftOf(current);
      setGhost({ item: current.item, x: current.lastX, y: current.lastY, lift: l, over: isOverTarget(current.lastX, current.lastY - l) });
      if (current.pointerType !== 'mouse') navigator.vibrate?.(8);
    };
    liftTile.current = lift;
    const move = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      if (!current.active) {
        const travelled = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        if (current.pointerType === 'mouse') { if (travelled > TILE_MOUSE_SLOP_PX) lift(current); }
        else if (travelled > TILE_TOUCH_SLOP_PX) end(); // moved before the long-press: it is a scroll
        return;
      }
      const l = liftOf(current);
      setGhost(previous => (previous ? { ...previous, x: event.clientX, y: event.clientY, over: isOverTarget(event.clientX, event.clientY - l) } : previous));
    };
    const up = (event: PointerEvent) => {
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const wasActive = current.active;
      const dropY = event.clientY - liftOf(current);
      const { item } = current;
      end();
      if (!wasActive) return;
      suppressClickUntil.current = performance.now() + 400;
      if (isOverTarget(event.clientX, dropY)) onDropAtRef.current?.(item.id, event.clientX, dropY);
    };
    const cancel = (event: PointerEvent) => {
      if (session.current && event.pointerId === session.current.pointerId) end();
    };
    // Once a tile is lifted the palette must not scroll under the finger. The listener has to exist
    // before the touch starts (iOS), so it is permanent and gated by a ref.
    const blockScroll = (event: TouchEvent) => { if (scrollLock.current && event.cancelable) event.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', blockScroll);
      if (session.current?.timer) window.clearTimeout(session.current.timer);
    };
  }, []);

  const pressTile = (event: React.PointerEvent<HTMLButtonElement>, item: I) => {
    // Fine pointers keep native HTML5 drag-and-drop; touch, pen (and a mouse on a touch-first device) use pointer drag.
    if (!onDropAt || !event.isPrimary || event.button !== 0) return;
    if (event.pointerType === 'mouse' && !coarse) return;
    const next: TileDragSession<I> = { item, pointerId: event.pointerId, pointerType: event.pointerType, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, active: false, timer: null };
    session.current = next;
    if (event.pointerType !== 'mouse') {
      const target = event.currentTarget;
      next.timer = window.setTimeout(() => {
        if (session.current === next) liftTile.current(next, target);
      }, TILE_LONG_PRESS_MS);
    }
  };

  return (
    <>
      {ghost && typeof document !== 'undefined' && createPortal(
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: ghost.x - 40, top: ghost.y - ghost.lift - 40, width: 80, height: 80, zIndex: 9999, pointerEvents: 'none', borderRadius: 12, padding: 6, background: colors.panel, border: `2px solid ${ghost.over ? colors.accent : colors.line}`, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', opacity: ghost.over ? 1 : 0.7, transform: `scale(${ghost.over ? 1.08 : 1})`, transition: 'transform 0.12s ease, opacity 0.12s ease' }}
        >
          {renderIcon(ghost.item)}
        </div>,
        document.body,
      )}
      {Object.entries(categories).map(([category, items]) => {
        const isCollapsed = collapsed.has(category);
        return (
          <section key={category} style={{ marginBottom: 3 }}>
            <button
              onClick={() => setCollapsed(previous => {
                const next = new Set(previous);
                if (next.has(category)) next.delete(category); else next.add(category);
                return next;
              })}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', padding: '8px 5px', fontSize: 11, fontWeight: 750 }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{category}
              </span>
              <span style={{ color: colors.subtle, fontWeight: 600 }}>{items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-2 px-1 pb-3">
                {items.map(item => (
                  <button
                    key={item.id}
                    draggable={!coarse}
                    onDragStart={event => {
                      event.dataTransfer.setData(LIBRARY_DRAG_MIME, item.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onPointerDown={event => pressTile(event, item)}
                    onContextMenu={event => { if (coarse) event.preventDefault(); }}
                    onClick={event => {
                      if (performance.now() < suppressClickUntil.current) { event.preventDefault(); return; }
                      onAdd(item.id);
                    }}
                    className="flex h-[110px] flex-col overflow-hidden rounded-md border transition-all active:scale-[.97] select-none"
                    style={{ borderColor: colors.line, background: colors.panel, cursor: 'grab', WebkitTouchCallout: 'none' }}
                    onMouseEnter={event => { event.currentTarget.style.background = colors.panelAlt; }}
                    onMouseLeave={event => { event.currentTarget.style.background = colors.panel; }}
                  >
                    <div className="flex h-16 min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1.5">{renderIcon(item)}</div>
                    <div className="flex h-8 w-full shrink-0 items-center justify-center border-t px-1.5" style={{ borderColor: colors.line, background: `${colors.line}15` }}>
                      <span className="flex items-center justify-center text-[11px] font-medium text-slate-800 dark:text-slate-200 tracking-tight text-center leading-tight break-words line-clamp-2 w-full" title={item.name}>
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
    </>
  );
}

/**
 * Single canonical schematic canvas. Studios differ ONLY in the component library
 * (symbols, pins, catalog) and the simulation engine feeding the render callbacks;
 * viewport, grid, wiring, selection, history, clipboard and shortcuts are shared.
 */
export function BaseSchematicCanvas<C extends SchematicComponent, I extends SchematicLibraryItem>({
  canvas,
  colors,
  libraryCategories,
  renderLibraryIcon,
  renderComponent,
  renderComponentOverlay,
  componentOpacity,
  terminalFill,
  wireColor,
  wireAppearance,
  wirePathRef,
  netOf,
  canvasUnderlay,
  labelsLayer,
  canvasOverlay,
  canvasDefs,
  toolbarExtra,
  toolbarRow2,
  canvasTitle,
  emptyHint,
  simulationRunning,
  canvasStatusExtra,
  analysisTitle,
  analysisContent,
  inspectorTop,
  inspectorContent,
  inspectorFooter,
  inspectorExtraCards,
  tabs,
  activeTabId,
  onTabChange,
  children,
}: BaseSchematicCanvasProps<C, I>) {
  const { t } = useTranslation('simulators');
  const [search, setSearch] = useState('');
  const coarse = useCoarsePointer();
  /** HTML layer for KaTeX labels; null until mounted (and on the server), when labels fall back to foreignObject. */
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const { library, gridSize, isDark, components, wires, texts, document, viewport, routing, clipboard, handlers, dragState, hoveredComponentId, setHoveredComponentId, selectedComponent, terminalSnap, snapRadius } = canvas;
  const { selection, marqueeIds } = document;
  const wiringActive = Boolean(routing.wiring.from);

  const filteredLibrary = useMemo(() => filterLibrary(libraryCategories, search), [libraryCategories, search]);
  const resolveNet = useMemo(() => netOf ?? createWireNetResolver(wires), [netOf, wires]);
  const intersections = useMemo(() => calculateWireIntersections(wires, resolveNet), [resolveNet, wires]);
  const junctionDots = useMemo(() => junctionDotPositions(intersections, wires, resolveNet), [intersections, resolveNet, wires]);

  const wireRender = wires.map(wire => {
    const selected = selection?.kind === 'wire' && selection.id === wire.id;
    const path = resolveRenderPath(library, wire, components, gridSize);
    const appearance = wireAppearance?.(wire, path, selected) ?? {};
    return {
      wire,
      selected,
      path,
      hitPath: pointsToPath(path),
      renderPath: buildJumpArcPath(path, intersections, wire.id, 4),
      halo: selected ? appearance.selectionHalo : undefined,
      stroke: selected && !appearance.selectionHalo ? colors.selection : appearance.stroke ?? wire.color ?? wireColor,
      dashed: appearance.dashed ?? false,
      flowDots: appearance.flowDots ?? [],
    };
  });

  const marquee = marqueeStyle(colors);
  const cornerHandle = wireCornerHandleStyle(colors);
  const nothingSelected = !canvas.hasSelection;

  return (
    <SchematicOverlayContext.Provider value={overlayHost}>
    <UnifiedWorkspaceShell
      colors={colors}
      isDark={isDark}
      tabs={tabs}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      toolbarRow1={<>
        <ToolbarButton colors={colors} label="−" title={t('toolbar.zoomOut', 'Zoom out')} onClick={viewport.zoomOut} />
        <span style={{ color: colors.muted, fontSize: 11, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(viewport.zoom * 100)}%</span>
        <ToolbarButton colors={colors} label="+" title={t('toolbar.zoomIn', 'Zoom in')} onClick={viewport.zoomIn} />
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<Undo2 size={14} />} title={t('toolbar.undo', 'Undo (Ctrl/Cmd+Z)')} onClick={canvas.undo} disabled={!document.canUndo} />
        <ToolbarButton colors={colors} icon={<Redo2 size={14} />} title={t('toolbar.redo', 'Redo (Ctrl/Cmd+Shift+Z)')} onClick={canvas.redo} disabled={!document.canRedo} />
        <ToolbarButton colors={colors} icon={<Maximize2 size={14} />} title={t('toolbar.autoScale', 'Auto-scale / Center circuit')} onClick={canvas.zoomToFit} />
        <ToolbarButton colors={colors} icon={<Scissors size={14} />} title={t('toolbar.cut', 'Cut (Ctrl/Cmd+X)')} onClick={clipboard.cut} disabled={!selectedComponent && marqueeIds.length === 0} />
        <ToolbarButton colors={colors} icon={<Copy size={14} />} title={t('toolbar.copy', 'Copy (Ctrl/Cmd+C)')} onClick={clipboard.copy} disabled={!selectedComponent && marqueeIds.length === 0} />
        <ToolbarButton colors={colors} icon={<Clipboard size={14} />} title={t('toolbar.paste', 'Paste (Ctrl/Cmd+V)')} onClick={clipboard.paste} disabled={!clipboard.hasClipboard} />
        <ToolbarButton colors={colors} icon={<Trash2 size={14} />} title={t('toolbar.delete', 'Delete (Del/Backspace)')} onClick={clipboard.removeSelection} disabled={nothingSelected} />
        <ToolbarDivider colors={colors} />
        <div className="flex items-center gap-2">
          <SegmentedControl options={[
            { label: t('simulators:shell.gridDotted', 'Dotted'), value: 'dots' },
            { label: t('simulators:shell.gridCartesian', 'Cartesian'), value: 'cartesian' },
            { label: t('simulators:shell.gridHidden', 'Hidden'), value: 'hidden' },
          ]} value={canvas.gridMode} onChange={canvas.setGridMode} size="sm" aria-label="Grid Style" />
          <ToolbarButton colors={colors} icon={<Type size={14} />} label={t('toolbar.text', 'Text')} title={t('toolbar.addText', 'Add editable workspace text (T)')} onClick={canvas.addText} />
        </div>
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="90°" title={t('toolbar.rotate90', 'Rotate selected component 90° (R)')} onClick={() => canvas.rotateSelected(90)} disabled={!selectedComponent} />
        <ToolbarButton colors={colors} icon={<FlipHorizontal size={14} />} label={t('toolbar.flipX', 'Flip X')} title={t('toolbar.flipXTooltip', 'Reflect selected component horizontally (H)')} onClick={() => canvas.flipSelected('h')} disabled={!selectedComponent} />
        <ToolbarButton colors={colors} icon={<FlipVertical size={14} />} label={t('toolbar.flipY', 'Flip Y')} title={t('toolbar.flipYTooltip', 'Reflect selected component vertically (V)')} onClick={() => canvas.flipSelected('v')} disabled={!selectedComponent} />
        {toolbarExtra}
      </>}
      toolbarRow2={toolbarRow2}
      librarySearchValue={search}
      onLibrarySearchChange={setSearch}
      libraryContent={<SchematicLibraryPanel
        colors={colors}
        categories={filteredLibrary}
        renderIcon={renderLibraryIcon}
        onAdd={type => { canvas.addComponent(type); }}
        onDropAt={(type, clientX, clientY) => { canvas.addComponent(type, viewport.clientToWorld(clientX, clientY)); }}
        dropTargetRef={viewport.svgRef}
      />}
      canvasTitle={canvasTitle}
      componentCount={components.length}
      netCount={wires.length}
      simulationRunning={simulationRunning}
      canvasStatusExtra={canvasStatusExtra}
      onZoomReset={viewport.resetZoom}
      svgRef={viewport.svgRef}
      zoom={viewport.zoom}
      pan={viewport.pan}
      gridMode={canvas.gridMode}
      gridSize={gridSize}
      canvasCursor={dragState?.kind === 'pan' ? 'grabbing' : wiringActive ? 'crosshair' : 'default'}
      onCanvasPointerDown={handlers.onCanvasPointerDown}
      onCanvasPointerMove={handlers.onCanvasPointerMove}
      onCanvasPointerUp={handlers.onCanvasPointerUp}
      onCanvasPointerCancel={handlers.onCanvasPointerCancel}
      onCanvasDrop={handlers.onCanvasDrop}
      canvasHtmlOverlay={<SchematicHtmlLayer view={{ zoom: viewport.zoom, pan: viewport.pan }} hostRef={setOverlayHost} />}
      canvasDefs={canvasDefs}
      canvasContent={<>
        {dragState?.kind === 'marquee' && (
          <rect
            x={Math.min(dragState.start[0], dragState.end[0])}
            y={Math.min(dragState.start[1], dragState.end[1])}
            width={Math.abs(dragState.end[0] - dragState.start[0])}
            height={Math.abs(dragState.end[1] - dragState.start[1])}
            {...marquee}
            pointerEvents="none"
          />
        )}

        {canvasUnderlay}

        {/* Dedicated layer holding only schematic elements (tight export bounding box). */}
        <g id="circuit-elements-layer">
          {wireRender.map(({ wire, selected, path, hitPath, renderPath, stroke, halo, dashed }) => (
            <g key={wire.id} data-wire-id={wire.id}>
              <path d={hitPath} fill="none" stroke="transparent" strokeWidth={coarse ? 32 : 19} strokeLinecap="round" strokeLinejoin="round" onPointerDown={event => handlers.onWirePointerDown(event, wire)} onDoubleClick={event => handlers.onWireDoubleClick(event, wire)} style={{ cursor: 'pointer' }} />
              {halo && <path className="wire-selection-halo" d={renderPath} fill="none" stroke={halo} strokeOpacity={0.5} strokeWidth={(library.wireStrokeWidth ?? 2) + 4} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
              <path className="wire-core" ref={wirePathRef ? element => wirePathRef(wire.id, element) : undefined} d={renderPath} fill="none" stroke={stroke} strokeWidth={library.wireStrokeWidth ?? 2} strokeDasharray={dashed ? '3 3' : undefined} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
              {selected && path.length > 2 && path.slice(1, -1).map((corner, index) => (
                <g key={`${wire.id}-${index + 1}`}>
                  <circle cx={corner[0]} cy={corner[1]} {...cornerHandle} pointerEvents="none" style={{ cursor: 'move' }} />
                  {/* Finger-sized, screen-constant grab area around the visible handle. */}
                  <circle cx={corner[0]} cy={corner[1]} r={Math.max(cornerHandle.r + 4, (coarse ? 22 : 10) / viewport.zoom)} fill="transparent" onPointerDown={event => handlers.onWireCornerPointerDown(event, wire, index + 1)} style={{ cursor: 'move' }} />
                </g>
              ))}
            </g>
          ))}

          {junctionDots.map(([x, y]) => (
            <circle key={`jdot-${x}-${y}`} cx={x} cy={y} r={4.5} fill={wireColor} pointerEvents="none" />
          ))}

          {routing.draftPath && (
            <path d={pointsToPath(routing.draftPath)} fill="none" stroke={colors.accent} strokeDasharray="6 4" strokeWidth={1.6} opacity={0.75} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
          )}
          {routing.snapProjection && (
            <circle cx={routing.snapProjection.point[0]} cy={routing.snapProjection.point[1]} r={6} fill="none" stroke="#7C3AED" strokeWidth={2} pointerEvents="none" />
          )}
          {terminalSnap && (
            <g className="terminal-snap-indicator" transform={`translate(${terminalSnap.position[0]},${terminalSnap.position[1]})`} pointerEvents="none">
              {/* Capture zone: shows how far the pin pulls, so a near-miss never feels random. */}
              <circle r={snapRadius} fill="#7C3AED" fillOpacity={0.1} stroke="#7C3AED" strokeOpacity={0.4} strokeWidth={1 / viewport.zoom} strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`} />
              <circle r={Math.max(TERMINAL_RADIUS + 3, 11 / viewport.zoom)} fill="none" stroke="#7C3AED" strokeWidth={2.5 / viewport.zoom}>
                <animate attributeName="stroke-opacity" values="1;0.35;1" dur="0.9s" repeatCount="indefinite" />
              </circle>
              <circle r={TERMINAL_RADIUS + 1.5} fill="#7C3AED" />
            </g>
          )}
          {routing.wiring.lockedCorners?.map((corner, index) => (
            <circle key={`corner-${index}`} cx={corner[0]} cy={corner[1]} r={3} fill="#7C3AED" stroke="#ffffff" strokeWidth={1.5} pointerEvents="none" />
          ))}

          {components.map(component => {
            const selected = (selection?.kind === 'component' && selection.id === component.id) || marqueeIds.includes(component.id);
            const hovered = hoveredComponentId === component.id;
            const scale = library.symbolScale?.(component) ?? 1;
            const state: ComponentRenderState = {
              selected,
              hovered,
              symbolTransform: `rotate(${component.rotation}) scale(${component.flipH ? -1 : 1},${component.flipV ? -1 : 1}) scale(${scale})`,
            };
            const showTerminals = computeTerminalVisibility({ isSelectedOrHighlighted: selected, hoveredComponentId, componentId: component.id, wiringInProgress: wiringActive });
            return (
              <g
                key={component.id}
                data-component-id={component.id}
                transform={`translate(${component.x},${component.y})`}
                opacity={componentOpacity?.(component) ?? 1}
                style={{ transition: 'opacity 0.25s ease' }}
                onPointerEnter={() => setHoveredComponentId(component.id)}
                onPointerLeave={() => setHoveredComponentId(previous => (previous === component.id ? null : previous))}
              >
                {renderComponent(component, state)}
                {library.getTerminals(component).map(terminal => {
                  const x = terminal.position[0] - component.x;
                  const y = terminal.position[1] - component.y;
                  const starting = routing.wiring.from?.componentId === component.id && routing.wiring.from.terminalId === terminal.id;
                  return (
                    <g key={terminal.id}>
                      <circle cx={x} cy={y} r={Math.max(TERMINAL_HIT_RADIUS, snapRadius)} fill="transparent" style={{ cursor: 'crosshair' }} />
                      {/* No hover on touch screens, so pins stay faintly visible to be found and tapped. */}
                      <g style={{ opacity: showTerminals ? 1 : coarse ? 0.55 : 0, transition: 'opacity 0.2s ease-in-out' }} pointerEvents="none">
                        <circle cx={x} cy={y} r={TERMINAL_RADIUS} fill={starting ? colors.accent : terminalFill?.(component, terminal.id) ?? colors.panel} stroke={wiringActive ? '#7C3AED' : colors.muted} strokeWidth={1.4} />
                        {terminal.label && (
                          <text
                            x={x}
                            y={y - 8}
                            textAnchor="middle"
                            fontSize={7}
                            fontFamily="'KaTeX_Math', 'KaTeX_Main', serif"
                            fontStyle="italic"
                            fontWeight={400}
                            fill={colors.muted}
                          >
                            {renderComponentCanvasLabel(terminal.label)}
                          </text>
                        )}
                      </g>
                    </g>
                  );
                })}
                {renderComponentOverlay?.(component, state)}
              </g>
            );
          })}

          <g className="schematic-labels-layer" pointerEvents="none" style={{ userSelect: 'none' }}>
            {labelsLayer}
            <g className="electron-particles" pointerEvents="none">
              {wireRender.flatMap(({ wire, flowDots }) => flowDots.map((dot, index) => (
                <circle key={`${wire.id}-particle-${index}`} cx={dot[0]} cy={dot[1]} r={3} fill="#7C3AED" pointerEvents="none" />
              )))}
            </g>
          </g>

          {texts.map(text => {
            const selected = (selection?.kind === 'text' && selection.id === text.id) || marqueeIds.includes(text.id);
            const body = (
              <div style={{ width: 'max-content', color: ADAPTIVE_TEXT_COLORS.has((text.color ?? '').toLowerCase()) || !text.color ? (isDark ? '#F8FAFC' : '#0F172A') : text.color, fontSize: text.fontSize, fontWeight: 400, userSelect: 'none', display: 'flex', border: selected ? `1px dashed ${colors.selection}` : 'none', padding: 4, transform: 'translate(-4px, -4px)' }}>
                <V3Math math={text.text} />
              </div>
            );
            return (
              <React.Fragment key={text.id}>
                {/* Kept in the SVG either way: the vector exporter finds `g[data-text-id] foreignObject` and swaps in <text>. */}
                <g data-text-id={text.id} transform={`translate(${text.x},${text.y}) rotate(${text.rotation})`} onPointerDown={overlayHost ? undefined : event => handlers.onTextPointerDown(event, text)} style={{ cursor: 'move' }}>
                  <foreignObject x={0} y={0} width={1} height={1} style={{ overflow: 'visible', pointerEvents: overlayHost ? 'none' : 'auto', visibility: overlayHost ? 'hidden' : 'visible' }}>
                    {overlayHost ? null : body}
                  </foreignObject>
                </g>
                {overlayHost && createPortal(
                  <div
                    data-text-overlay-id={text.id}
                    onPointerDown={event => handlers.onTextPointerDown(event, text)}
                    style={{ position: 'absolute', left: text.x, top: text.y, transformOrigin: '0 0', transform: `rotate(${text.rotation}deg)`, pointerEvents: 'auto', cursor: 'move', touchAction: 'none' }}
                  >
                    {body}
                  </div>,
                  overlayHost,
                )}
              </React.Fragment>
            );
          })}
        </g>

        {canvasOverlay}
      </>}
      canvasEmptyOverlay={components.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div className="flex flex-col items-center justify-center pointer-events-none select-none">
            <div className="px-6 py-2.5 bg-white border border-slate-100 rounded-2xl shadow-sm mb-3 dark:bg-[#0d0f12] dark:border-[#1a1d24]">
              <span className="text-base font-semibold text-slate-900 tracking-tight dark:text-white">{t('shell.canvasReady', 'Canvas Ready')}</span>
            </div>
            <p className="text-xs text-slate-400 font-normal">{emptyHint}</p>
          </div>
        </div>
      )}
      analysisTitle={analysisTitle}
      analysisContent={analysisContent}
      inspectorTop={inspectorTop}
      inspectorContent={inspectorContent}
      inspectorFooter={inspectorFooter}
      inspectorExtraCards={inspectorExtraCards}
    >
      {children}
    </UnifiedWorkspaceShell>
    </SchematicOverlayContext.Provider>
  );
}
