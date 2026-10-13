import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Keyboard } from 'lucide-react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { viewTransforms } from '@/components/common/schematic/useSchematicViewport';
import { CONTROL_SYSTEMS_HEADING, INSPECTOR_EMPTY_STATE_TEXT, WORKSPACE_SHORTCUTS, type WorkspaceShortcut } from '@/simulators/shared/workspace/workspaceChrome';

export interface WorkspaceTab {
  id: string;
  label: string;
}

/** Height of the canvas viewport; the component library is bound to the same value. */
export const WORKSPACE_CANVAS_HEIGHT = 700;

export type WorkspaceGridMode = 'dots' | 'cartesian' | 'hidden';

export interface UnifiedWorkspaceShellProps {
  colors: Palette;
  isDark: boolean;

  /** Secondary top navigation — omitted entirely when the host has no tool tabs to switch between. */
  tabs?: WorkspaceTab[];
  activeTabId?: string;
  onTabChange?: (id: string) => void;

  toolbarRow1: React.ReactNode;
  toolbarRow2: React.ReactNode;

  librarySearchValue: string;
  onLibrarySearchChange: (value: string) => void;
  libraryContent: React.ReactNode;

  canvasTitle: string;
  componentCount: number;
  netCount: number;
  simulationRunning: boolean;
  /** Extra domain-specific HUD chips (e.g. SPICE status) rendered after the shared diagnostics. */
  canvasStatusExtra?: React.ReactNode;
  /** Resets zoom to 100%; wired to the bottom-bar pill. */
  onZoomReset: () => void;
  shortcuts?: ReadonlyArray<WorkspaceShortcut>;
  svgRef?: React.Ref<SVGSVGElement>;
  zoom: number;
  pan: [number, number];
  gridMode: WorkspaceGridMode;
  gridSize: number;
  canvasCursor?: string;
  onCanvasPointerDown?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerMove?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerUp?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onCanvasPointerCancel?: (event: React.PointerEvent<SVGSVGElement>) => void;
  onCanvasContextMenu?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasDragOver?: (event: React.DragEvent<SVGSVGElement>) => void;
  onCanvasDrop?: (event: React.DragEvent<SVGSVGElement>) => void;
  /** Extra <defs> children (e.g. domain-specific arrow markers). */
  canvasDefs?: React.ReactNode;
  /** Rendered inside the pan/zoom transform group, above the grid background. */
  canvasContent: React.ReactNode;
  /** HTML layer pinned exactly over the <svg>; must carry the same pan/zoom matrix (see SchematicHtmlLayer). */
  canvasHtmlOverlay?: React.ReactNode;
  /** Rendered as an absolutely-positioned sibling of the <svg>, e.g. an empty-canvas hint. */
  canvasEmptyOverlay?: React.ReactNode;

  analysisTitle: string;
  analysisContent: React.ReactNode;

  /** null renders the fixed "Select an element to inspect its properties." placeholder. */
  inspectorContent: React.ReactNode | null;
  inspectorExtraCards?: React.ReactNode;
  /** Instrument panels rendered above the inspector header (e.g. oscilloscope / DMM). */
  inspectorTop?: React.ReactNode;
  /** Informational content rendered below the inspector body. */
  inspectorFooter?: React.ReactNode;

  /** Modals and other roots (rendered last, outside the layout flow). */
  children?: React.ReactNode;
}

interface ShortcutItemBadgeProps {
  shortcut: WorkspaceShortcut;
  colors: Palette;
}

function ShortcutItemBadge({ shortcut, colors }: ShortcutItemBadgeProps) {
  const kbdStyle: React.CSSProperties = {
    borderColor: colors.line,
    background: colors.panelAlt,
    color: colors.text,
  };

  const { t } = useTranslation(['simulators']);
  const labelKey = shortcut.label === 'Copy/Paste' ? 'copyPaste' : shortcut.label.toLowerCase();

  if (shortcut.key === 'Space' || shortcut.key === 'R') {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Space</kbd>
        <span className="truncate text-slate-700 dark:text-slate-300">{t(`simulators:shortcuts.${labelKey}`)}</span>
      </div>
    );
  }

  if (shortcut.key === 'Del') {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Del</kbd>
        <span className="truncate text-slate-700 dark:text-slate-300">{t(`simulators:shortcuts.${labelKey}`)}</span>
      </div>
    );
  }

  if (shortcut.key.includes('Alt') && (shortcut.key.includes('Drag') || shortcut.label.toLowerCase() === 'pan')) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-300">
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Alt</kbd>
        <span className="text-[10px] text-slate-500 font-mono">+ Drag</span>
        <span>{t(`simulators:shortcuts.${labelKey}`)}</span>
      </div>
    );
  }

  if (shortcut.key.includes('Ctrl/Cmd') && (shortcut.key.includes('Z') || shortcut.label.toLowerCase() === 'undo')) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-300" title={shortcut.key}>
        <span className="sr-only">{shortcut.key}</span>
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Ctrl/Cmd</kbd>
        <span className="text-[10px] text-slate-500 font-mono">+</span>
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Z</kbd>
        <span>{t(`simulators:shortcuts.${labelKey}`)}</span>
      </div>
    );
  }

  if (shortcut.key.includes('Ctrl/Cmd') && (shortcut.key.includes('C/V') || shortcut.key.includes('C / V') || shortcut.label.toLowerCase().includes('copy'))) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-300" title={shortcut.key}>
        <span className="sr-only">{shortcut.key}</span>
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>Ctrl/Cmd</kbd>
        <span className="text-[10px] text-slate-500 font-mono">+</span>
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>C</kbd>
        <span className="text-[10px] text-slate-500 font-mono">/</span>
        <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>V</kbd>
        <span>{t(`simulators:shortcuts.${labelKey}`)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-0 text-slate-700 dark:text-slate-300">
      <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow-xs shrink-0" style={kbdStyle}>{shortcut.key}</kbd>
      <span>{t(`simulators:shortcuts.${labelKey}`)}</span>
    </div>
  );
}

/**
 * Structural workspace shell shared across studio workspaces (toolbar, component library,
 * canvas frame, analysis drawer, properties inspector). Mirrors circuit-engine's V3Home
 * layout/interaction model exactly; domain-specific rendering (canvas content, toolbar
 * button groups, inspector body) is supplied by the caller via slots.
 */
export function UnifiedWorkspaceShell({
  colors,
  isDark,
  tabs,
  activeTabId,
  onTabChange,
  toolbarRow1,
  toolbarRow2,
  librarySearchValue,
  onLibrarySearchChange,
  libraryContent,
  canvasTitle,
  componentCount,
  netCount,
  simulationRunning,
  canvasStatusExtra,
  onZoomReset,
  shortcuts = WORKSPACE_SHORTCUTS,
  svgRef,
  zoom,
  pan,
  gridMode,
  gridSize,
  canvasCursor,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasPointerCancel,
  onCanvasContextMenu,
  onCanvasDragOver,
  onCanvasDrop,
  canvasDefs,
  canvasContent,
  canvasHtmlOverlay,
  canvasEmptyOverlay,
  analysisTitle,
  analysisContent,
  inspectorContent,
  inspectorExtraCards,
  inspectorTop,
  inspectorFooter,
  children,
}: UnifiedWorkspaceShellProps) {
  const { t } = useTranslation(['simulators']);
  const [cursor, setCursor] = React.useState<[number, number]>([0, 0]);
  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor([
      Math.round((event.clientX - rect.left - pan[0]) / zoom),
      Math.round((event.clientY - rect.top - pan[1]) / zoom),
    ]);
    onCanvasPointerMove?.(event);
  };
  return (
    <div dir="ltr" className="v3-mae-layout mae-simulator-shell font-sans text-slate-900 dark:text-slate-100" style={{ minHeight: 760, color: colors.text }}>
      {tabs && tabs.length > 0 && activeTabId !== undefined && (
        <div className="mb-4">
          <SegmentedControl
            options={tabs.map(tab => ({ label: tab.label, value: tab.id }))}
            value={activeTabId}
            onChange={value => onTabChange?.(value)}
            aria-label="Workspace section"
          />
        </div>
      )}

      <section className="mb-4 overflow-x-auto rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ borderColor: colors.line, background: colors.panel }}>
        <header className="min-w-max" style={{ background: colors.panel, zIndex: 5 }}>
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pt-2" style={{ minHeight: 36 }}>
            {toolbarRow1}
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 px-2 pb-2 pt-1" style={{ minHeight: 36 }}>
            {toolbarRow2}
          </div>
        </header>
      </section>

      <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
        <div className="flex-1 min-w-0 flex flex-col gap-4 w-full">
          {/* The library and the canvas share one height token, so the palette can never outgrow the canvas. */}
          <div className="flex flex-col md:flex-row gap-4 items-start w-full" style={{ ['--workspace-canvas-height' as string]: `${WORKSPACE_CANVAS_HEIGHT}px` }}>
            <aside className="w-full md:w-64 shrink-0 min-h-0 max-md:h-[min(60svh,520px)]! max-md:max-h-[60svh]! overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column', height: 'var(--workspace-canvas-height)', maxHeight: 'var(--workspace-canvas-height)' }}>
              <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
                <div className={CONTROL_SYSTEMS_HEADING}>{t('simulators:shell.componentLibrary')}</div>
              </div>
              <div style={{ padding: 10, borderBottom: `1px solid ${colors.line}` }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: colors.subtle }} />
                  <input
                    value={librarySearchValue}
                    onChange={event => onLibrarySearchChange(event.target.value)}
                    placeholder={t('simulators:shell.searchComponents')}
                    style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.line}`, outline: 'none', background: colors.input, color: colors.text, borderRadius: 7, padding: '8px 9px 8px 29px', fontSize: 11 }}
                    className="max-sm:min-h-11 max-sm:text-base!"
                  />
                </div>
              </div>
              <div className="mae-palette-scroll" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '6px 6px 14px' }}>
                {libraryContent}
              </div>
            </aside>

            <main className="relative w-full flex-none md:w-auto md:flex-1 min-w-0 max-md:h-[65svh]! max-md:min-h-[360px] overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#07080a]" style={{ background: colors.canvas, borderColor: colors.line, height: 'var(--workspace-canvas-height)' }}>
              <div className="flex items-start justify-between border-b px-4 py-2 mae-card-header-row panel-header" data-slot="card-header" style={{ borderColor: colors.line }}>
                <div>
                  <div className={CONTROL_SYSTEMS_HEADING}>{canvasTitle}</div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.muted }}>
                  <span>{componentCount} CMP</span>
                  <span>{netCount} NET</span>
                  {canvasStatusExtra}
                  <span style={{ color: simulationRunning ? colors.accent : colors.muted, fontWeight: 750 }}>
                    {simulationRunning ? 'RUNNING' : 'IDLE'}
                  </span>
                </div>
              </div>

              {/* The wrapper is exactly the <svg> box, so the HTML overlay and the SVG share one origin. */}
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <svg
                ref={svgRef}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={onCanvasPointerCancel}
                onContextMenu={onCanvasContextMenu ?? (event => event.preventDefault())}
                onDragOver={onCanvasDragOver ?? (event => event.preventDefault())}
                onDrop={onCanvasDrop}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  cursor: canvasCursor ?? 'default',
                  touchAction: 'none',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
              >
                <defs>
                  <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M 0,0 L 6,3 L 0,6 Z" fill="#64748b" />
                  </marker>
                  {gridMode === 'cartesian' ? (
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
                        stroke={isDark ? '#1a1d24' : '#a8b8cc'}
                        strokeWidth={1.15}
                        strokeOpacity={0.85}
                      />
                    </pattern>
                  ) : (
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
                        fill={isDark ? '#222630' : '#7a93b1'}
                        fillOpacity={0.9}
                      />
                    </pattern>
                  )}
                  {canvasDefs}
                </defs>

                <g transform={viewTransforms({ zoom, pan }).svg}>
                  {gridMode !== 'hidden' && (
                    <rect x={-5000} y={-5000} width={10000} height={10000} fill={`url(#workspace-grid-${gridMode})`} />
                  )}
                  {canvasContent}
                </g>
              </svg>
              {canvasHtmlOverlay}
              </div>

              {canvasEmptyOverlay}

              {/* Subtle Canvas Corner Status Pill: Coordinates & Zoom Reset */}
              <div
                className="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-2 rounded-lg border px-2.5 py-1 font-mono text-[10px] shadow-xs backdrop-blur-xs"
                style={{ background: `${colors.panel}ee`, borderColor: colors.line, color: colors.muted }}
              >
                <span className="shrink-0 tabular-nums" data-testid="canvas-coordinates">(X: {cursor[0]}, Y: {cursor[1]})</span>
                <span style={{ width: 1, height: 12, background: colors.line }} />
                <span className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 tabular-nums" style={{ borderColor: colors.line, background: colors.panelAlt }}>
                  {Math.round(zoom * 100)}%
                  <button type="button" onClick={onZoomReset} title="Reset zoom to 100%" className="font-semibold underline-offset-2 hover:underline cursor-pointer" style={{ color: colors.text }}>Reset</button>
                </span>
              </div>
            </main>
          </div>

          <section className="w-full overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b px-5 py-3" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>{analysisTitle}</div>
            </div>
            {analysisContent}
          </section>
        </div>

        <div className="w-full xl:w-72 shrink-0 flex flex-col gap-4">
          <aside className="w-full min-h-0 overflow-y-auto rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            {inspectorTop}
            <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>{t('simulators:shell.activeElement')}</div>
            </div>
            {inspectorContent ?? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.muted, fontSize: 12 }}>
                {t('simulators:shell.emptyInspector')}
              </div>
            )}
            {inspectorFooter}
          </aside>

          {inspectorExtraCards}

          {/* Dedicated Workspace Shortcuts Card: always last */}
          <div
            className="w-full overflow-hidden rounded-2xl border shadow-sm border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]"
            style={{ background: colors.panel, borderColor: colors.line }}
            data-testid="workspace-shortcuts-card"
          >
            <div className="border-b px-3 py-2 flex items-center justify-between mae-card-header-row panel-header" data-slot="card-header" style={{ borderColor: colors.line }}>
              <div className={`${CONTROL_SYSTEMS_HEADING} mae-card-header-title`}>{t('simulators:shell.workspaceShortcuts')}</div>
              <Keyboard size={13} className="text-slate-400 dark:text-slate-500 mae-card-header-actions shrink-0" />
            </div>
            <div className="p-3.5 flex flex-col gap-2.5 text-xs" data-testid="canvas-shortcuts">
              <div className="grid grid-cols-2 gap-2">
                {shortcuts.filter(s => s.key === 'R' || s.key === 'Del').map(s => (
                  <ShortcutItemBadge key={s.key} shortcut={s} colors={colors} />
                ))}
              </div>
              {shortcuts.filter(s => s.key !== 'R' && s.key !== 'Del').map(s => (
                <ShortcutItemBadge key={s.key} shortcut={s} colors={colors} />
              ))}
            </div>
          </div>

        </div>
      </div>

      {children}
    </div>
  );
}
