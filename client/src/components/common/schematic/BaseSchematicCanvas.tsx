import React, { useMemo, useState } from 'react';
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
}

/** Shared tile grid for every studio's component catalog (drag-to-place or click-to-add). */
export function SchematicLibraryPanel<I extends SchematicLibraryItem>({ colors, categories, renderIcon, onAdd }: SchematicLibraryPanelProps<I>) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <>
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
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.setData(LIBRARY_DRAG_MIME, item.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(item.id)}
                    className="flex h-[110px] flex-col overflow-hidden rounded-md border transition-all active:scale-[.97]"
                    style={{ borderColor: colors.line, background: colors.panel, cursor: 'grab' }}
                    onMouseEnter={event => { event.currentTarget.style.background = colors.panelAlt; }}
                    onMouseLeave={event => { event.currentTarget.style.background = colors.panel; }}
                  >
                    <div className="flex flex-1 min-h-0 w-full items-center justify-center p-2">{renderIcon(item)}</div>
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
  const { library, gridSize, isDark, components, wires, texts, document, viewport, routing, clipboard, handlers, dragState, hoveredComponentId, setHoveredComponentId, selectedComponent } = canvas;
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
      stroke: selected ? colors.selection : appearance.stroke ?? wire.color ?? wireColor,
      dashed: appearance.dashed ?? false,
      flowDots: appearance.flowDots ?? [],
    };
  });

  const marquee = marqueeStyle(colors);
  const cornerHandle = wireCornerHandleStyle(colors);
  const nothingSelected = !canvas.hasSelection;

  return (
    <UnifiedWorkspaceShell
      colors={colors}
      isDark={isDark}
      tabs={tabs}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      toolbarRow1={<>
        <ToolbarButton colors={colors} label="−" title="Zoom out" onClick={viewport.zoomOut} />
        <span style={{ color: colors.muted, fontSize: 11, minWidth: 42, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(viewport.zoom * 100)}%</span>
        <ToolbarButton colors={colors} label="+" title="Zoom in" onClick={viewport.zoomIn} />
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<Undo2 size={14} />} title="Undo (Ctrl/Cmd+Z)" onClick={canvas.undo} disabled={!document.canUndo} />
        <ToolbarButton colors={colors} icon={<Redo2 size={14} />} title="Redo (Ctrl/Cmd+Shift+Z)" onClick={canvas.redo} disabled={!document.canRedo} />
        <ToolbarButton colors={colors} icon={<Maximize2 size={14} />} title="Auto-scale / Center circuit" onClick={canvas.zoomToFit} />
        <ToolbarButton colors={colors} icon={<Scissors size={14} />} title="Cut (Ctrl/Cmd+X)" onClick={clipboard.cut} disabled={!selectedComponent && marqueeIds.length === 0} />
        <ToolbarButton colors={colors} icon={<Copy size={14} />} title="Copy (Ctrl/Cmd+C)" onClick={clipboard.copy} disabled={!selectedComponent && marqueeIds.length === 0} />
        <ToolbarButton colors={colors} icon={<Clipboard size={14} />} title="Paste (Ctrl/Cmd+V)" onClick={clipboard.paste} disabled={!clipboard.hasClipboard} />
        <ToolbarButton colors={colors} icon={<Trash2 size={14} />} title="Delete (Del/Backspace)" onClick={clipboard.removeSelection} disabled={nothingSelected} />
        <ToolbarDivider colors={colors} />
        <div className="flex items-center gap-2">
          <SegmentedControl options={GRID_OPTIONS} value={canvas.gridMode} onChange={canvas.setGridMode} size="sm" aria-label="Grid Style" />
          <ToolbarButton colors={colors} icon={<Type size={14} />} label="Text" title="Add editable workspace text (T)" onClick={canvas.addText} />
        </div>
        <ToolbarDivider colors={colors} />
        <ToolbarButton colors={colors} icon={<RotateCw size={14} />} label="90°" title="Rotate selected component 90° (R)" onClick={() => canvas.rotateSelected(90)} disabled={!selectedComponent} />
        <ToolbarButton colors={colors} icon={<FlipHorizontal size={14} />} label="Flip X" title="Reflect selected component horizontally (H)" onClick={() => canvas.flipSelected('h')} disabled={!selectedComponent} />
        <ToolbarButton colors={colors} icon={<FlipVertical size={14} />} label="Flip Y" title="Reflect selected component vertically (V)" onClick={() => canvas.flipSelected('v')} disabled={!selectedComponent} />
        {toolbarExtra}
      </>}
      toolbarRow2={toolbarRow2}
      librarySearchValue={search}
      onLibrarySearchChange={setSearch}
      libraryContent={<SchematicLibraryPanel colors={colors} categories={filteredLibrary} renderIcon={renderLibraryIcon} onAdd={type => { canvas.addComponent(type); }} />}
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
      onCanvasMouseDown={handlers.onCanvasMouseDown}
      onCanvasMouseMove={handlers.onCanvasMouseMove}
      onCanvasMouseUp={handlers.onCanvasMouseUp}
      onCanvasDrop={handlers.onCanvasDrop}
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
          {wireRender.map(({ wire, selected, path, hitPath, renderPath, stroke, dashed }) => (
            <g key={wire.id} data-wire-id={wire.id}>
              <path d={hitPath} fill="none" stroke="transparent" strokeWidth={19} strokeLinecap="round" strokeLinejoin="round" onMouseDown={event => handlers.onWireMouseDown(event, wire)} onDoubleClick={event => handlers.onWireDoubleClick(event, wire)} style={{ cursor: 'pointer' }} />
              <path ref={wirePathRef ? element => wirePathRef(wire.id, element) : undefined} d={renderPath} fill="none" stroke={stroke} strokeWidth={selected ? 2.8 : 2.2} strokeDasharray={dashed ? '3 3' : undefined} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
              {selected && path.length > 2 && path.slice(1, -1).map((corner, index) => (
                <circle key={`${wire.id}-${index + 1}`} cx={corner[0]} cy={corner[1]} {...cornerHandle} onMouseDown={event => handlers.onWireCornerMouseDown(event, wire, index + 1)} style={{ cursor: 'move' }} />
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
            <circle cx={routing.snapProjection.point[0]} cy={routing.snapProjection.point[1]} r={6} fill="none" stroke={colors.accent} strokeWidth={2} pointerEvents="none" />
          )}
          {routing.wiring.lockedCorners?.map((corner, index) => (
            <circle key={`corner-${index}`} cx={corner[0]} cy={corner[1]} r={3} fill={colors.panel} stroke={colors.accent} strokeWidth={1.2} pointerEvents="none" />
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
                      <circle cx={x} cy={y} r={TERMINAL_HIT_RADIUS} fill="transparent" style={{ cursor: 'crosshair' }} />
                      <g style={{ opacity: showTerminals ? 1 : 0, transition: 'opacity 0.2s ease-in-out' }} pointerEvents="none">
                        <circle cx={x} cy={y} r={TERMINAL_RADIUS} fill={starting ? colors.accent : terminalFill?.(component, terminal.id) ?? colors.panel} stroke={wiringActive ? colors.primary : colors.muted} strokeWidth={1.4} />
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
                <circle key={`${wire.id}-particle-${index}`} cx={dot[0]} cy={dot[1]} r={3} fill={colors.powered} pointerEvents="none" />
              )))}
            </g>
          </g>

          {texts.map(text => {
            const selected = (selection?.kind === 'text' && selection.id === text.id) || marqueeIds.includes(text.id);
            return (
              <g key={text.id} data-text-id={text.id} transform={`translate(${text.x},${text.y}) rotate(${text.rotation})`} onMouseDown={event => handlers.onTextMouseDown(event, text)} style={{ cursor: 'move' }}>
                <foreignObject x={0} y={0} width={1} height={1} style={{ overflow: 'visible', pointerEvents: 'auto' }}>
                  <div style={{ width: 'max-content', color: text.color, fontSize: text.fontSize, fontWeight: 400, userSelect: 'none', display: 'flex', border: selected ? `1px dashed ${colors.selection}` : 'none', padding: 4, transform: 'translate(-4px, -4px)' }}>
                    <V3Math math={text.text} />
                  </div>
                </foreignObject>
              </g>
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
  );
}
