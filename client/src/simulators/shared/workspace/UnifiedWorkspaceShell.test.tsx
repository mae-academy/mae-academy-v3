import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UnifiedWorkspaceShell } from '@/simulators/shared/workspace/UnifiedWorkspaceShell';
import { INSPECTOR_EMPTY_STATE_TEXT } from '@/simulators/shared/workspace/workspaceChrome';
import { clampZoom, ZOOM_MIN, ZOOM_MAX } from '@/simulators/shared/workspace/workspaceCanvasMechanics';

const colors = {
  background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ccc',
  text: '#000', muted: '#666', subtle: '#999', primary: '#2563eb', accent: '#7c3aed',
  danger: '#be123c', selection: '#2563eb', grid: '#eee', wire: '#2563eb', powered: '#8b5cf6',
  input: '#fff', shadow: 'none',
};

const baseProps = {
  colors,
  isDark: false,
  toolbarRow1: <button>Row1</button>,
  toolbarRow2: <button>Row2</button>,
  librarySearchValue: '',
  onLibrarySearchChange: () => {},
  libraryContent: <div>catalog items</div>,
  canvasTitle: 'Interactive Canvas',
  componentCount: 3,
  netCount: 2,
  simulationRunning: false,
  onZoomReset: () => {},
  zoom: 1,
  pan: [0, 0] as [number, number],
  gridMode: 'dots' as const,
  gridSize: 25,
  canvasContent: <g id="test-content" />,
  analysisTitle: 'Analysis Workspace',
  analysisContent: <div>analysis</div>,
};

describe('UnifiedWorkspaceShell', () => {
  it('renders the fixed empty-state placeholder when nothing is selected', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} />);
    expect(markup).toContain(INSPECTOR_EMPTY_STATE_TEXT);
  });

  it('renders the supplied inspector content instead of the placeholder when something is selected', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={<div>R1 properties</div>} />);
    expect(markup).toContain('R1 properties');
    expect(markup).not.toContain(INSPECTOR_EMPTY_STATE_TEXT);
  });

  it('renders the tab strip and marks the active tab when tabs are supplied', () => {
    const markup = renderToStaticMarkup(
      <UnifiedWorkspaceShell
        {...baseProps}
        inspectorContent={null}
        tabs={[{ id: 'schematic', label: 'Schematic Workspace' }, { id: 'analyzer', label: 'Logic Analyzer' }]}
        activeTabId="analyzer"
      />
    );
    expect(markup).toContain('Schematic Workspace');
    expect(markup).toContain('Logic Analyzer');
    expect(markup).toContain('aria-selected="true"');
  });

  it('omits the tab strip entirely when no tabs are supplied', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} />);
    expect(markup).not.toContain('role="tablist"');
  });

  it('selects the dot grid pattern by default and the cartesian pattern when requested', () => {
    const dotted = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} gridMode="dots" />);
    expect(dotted).toContain('workspace-grid-dots');
    expect(dotted).not.toContain('workspace-grid-cartesian');

    const cartesian = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} gridMode="cartesian" />);
    expect(cartesian).toContain('workspace-grid-cartesian');
  });

  it('omits the grid background fill entirely when the grid is hidden', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} gridMode="hidden" />);
    expect(markup).not.toContain('fill="url(#workspace-grid-');
  });

  it('applies the pan/zoom transform to the canvas content group', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} zoom={1.5} pan={[10, -5]} />);
    expect(markup).toContain('translate(10,-5) scale(1.5)');
  });
});

describe('UnifiedWorkspaceShell bottom bar and HUD', () => {
  it('always renders coordinates, shortcut strip, zoom pill and diagnostics chips', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} zoom={1.5} />);
    expect(markup).toContain('(X: 0, Y: 0)');
    expect(markup).toContain('Rotate');
    expect(markup).toContain('Ctrl/Cmd + Z');
    expect(markup).toContain('150%');
    expect(markup).toContain('3 CMP');
    expect(markup).toContain('2 NET');
    expect(markup).toContain('IDLE');
    expect(markup).toContain('md:w-64');
    expect(markup).toContain('xl:w-72');
    expect(markup).toContain('data-testid="workspace-shortcuts-card"');
    expect(markup).toContain('Workspace Shortcuts');
  });

  it('shows RUNNING when the simulation is active', () => {
    const markup = renderToStaticMarkup(<UnifiedWorkspaceShell {...baseProps} inspectorContent={null} simulationRunning />);
    expect(markup).toContain('RUNNING');
  });
});

describe('workspaceCanvasMechanics zoom clamp', () => {
  it('clamps zoom to the shared [0.2, 3] bounds', () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});
