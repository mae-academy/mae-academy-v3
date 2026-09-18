import React from 'react';
import { Search } from 'lucide-react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { CONTROL_SYSTEMS_HEADING, INSPECTOR_EMPTY_STATE_TEXT } from '@/simulators/shared/workspace/workspaceChrome';

export interface WorkspaceTab {
  id: string;
  label: string;
}

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
  canvasStats?: React.ReactNode;
  svgRef?: React.Ref<SVGSVGElement>;
  zoom: number;
  pan: [number, number];
  gridMode: WorkspaceGridMode;
  gridSize: number;
  canvasCursor?: string;
  onCanvasMouseDown?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasMouseMove?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasMouseUp?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasContextMenu?: (event: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasDragOver?: (event: React.DragEvent<SVGSVGElement>) => void;
  onCanvasDrop?: (event: React.DragEvent<SVGSVGElement>) => void;
  /** Rendered inside the pan/zoom transform group, above the grid background. */
  canvasContent: React.ReactNode;
  /** Rendered as an absolutely-positioned sibling of the <svg>, e.g. an empty-canvas hint. */
  canvasEmptyOverlay?: React.ReactNode;

  analysisTitle: string;
  analysisContent: React.ReactNode;

  /** null renders the fixed "Select an element to inspect its properties." placeholder. */
  inspectorContent: React.ReactNode | null;
  inspectorExtraCards?: React.ReactNode;

  /** Modals and other roots (rendered last, outside the layout flow). */
  children?: React.ReactNode;
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
  canvasStats,
  svgRef,
  zoom,
  pan,
  gridMode,
  gridSize,
  canvasCursor,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasContextMenu,
  onCanvasDragOver,
  onCanvasDrop,
  canvasContent,
  canvasEmptyOverlay,
  analysisTitle,
  analysisContent,
  inspectorContent,
  inspectorExtraCards,
  children,
}: UnifiedWorkspaceShellProps) {
  return (
    <div className="v3-mae-layout font-sans text-slate-900 dark:text-slate-100" style={{ minHeight: 760, color: colors.text }}>
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

      <section className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ borderColor: colors.line, background: colors.panel }}>
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
          <div className="flex flex-col md:flex-row gap-4 items-start w-full">
            <aside className="w-full md:w-56 shrink-0 min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column', height: '700px' }}>
              <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
                <div className={CONTROL_SYSTEMS_HEADING}>Component Library</div>
              </div>
              <div style={{ padding: 10, borderBottom: `1px solid ${colors.line}` }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: colors.subtle }} />
                  <input
                    value={librarySearchValue}
                    onChange={event => onLibrarySearchChange(event.target.value)}
                    placeholder="Search components"
                    style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.line}`, outline: 'none', background: colors.input, color: colors.text, borderRadius: 7, padding: '8px 9px 8px 29px', fontSize: 11 }}
                  />
                </div>
              </div>
              <div style={{ overflowY: 'auto', padding: '6px 6px 14px' }}>
                {libraryContent}
              </div>
            </aside>

            <main className="relative flex-1 min-w-0 h-[700px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#07080a]" style={{ background: colors.canvas, borderColor: colors.line }}>
              <div className="flex items-start justify-between border-b px-4 py-2" style={{ borderColor: colors.line }}>
                <div>
                  <div className={CONTROL_SYSTEMS_HEADING}>{canvasTitle}</div>
                </div>
                {canvasStats && (
                  <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: colors.muted }}>
                    {canvasStats}
                  </div>
                )}
              </div>

              <svg
                ref={svgRef}
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
                onMouseLeave={onCanvasMouseUp}
                onContextMenu={onCanvasContextMenu ?? (event => event.preventDefault())}
                onDragOver={onCanvasDragOver ?? (event => event.preventDefault())}
                onDrop={onCanvasDrop}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  cursor: canvasCursor ?? 'default',
                  touchAction: 'none',
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
                </defs>

                <g transform={`translate(${pan[0]},${pan[1]}) scale(${zoom})`}>
                  {gridMode !== 'hidden' && (
                    <rect x={-5000} y={-5000} width={10000} height={10000} fill={`url(#workspace-grid-${gridMode})`} />
                  )}
                  {canvasContent}
                </g>
              </svg>

              {canvasEmptyOverlay}
            </main>
          </div>

          <section className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b px-5 py-3" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>{analysisTitle}</div>
            </div>
            {analysisContent}
          </section>
        </div>

        <div className="w-full xl:w-80 shrink-0 flex flex-col gap-4">
          <aside className="w-full min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={{ background: colors.panel, borderColor: colors.line, display: 'flex', flexDirection: 'column' }}>
            <div className="border-b px-3 py-2" style={{ borderColor: colors.line }}>
              <div className={CONTROL_SYSTEMS_HEADING}>Active Element &amp; Properties</div>
            </div>
            {inspectorContent ?? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: colors.muted, fontSize: 12 }}>
                {INSPECTOR_EMPTY_STATE_TEXT}
              </div>
            )}
          </aside>
          {inspectorExtraCards}
        </div>
      </div>

      {children}
    </div>
  );
}
