// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { UnifiedWorkspaceShell, WORKSPACE_CANVAS_HEIGHT } from '@/simulators/shared/workspace/UnifiedWorkspaceShell';

afterEach(cleanup);

const colors = {
  background: '#fff', canvas: '#fff', panel: '#fff', panelAlt: '#fff', line: '#ccc', text: '#000', muted: '#666', subtle: '#999',
  primary: '#2563eb', accent: '#7c3aed', danger: '#be123c', selection: '#2563eb', grid: '#eee', wire: '#2563eb', powered: '#8b5cf6', input: '#fff', shadow: 'none',
};

const mount = () => render(
  <UnifiedWorkspaceShell
    colors={colors}
    isDark={false}
    toolbarRow1={null}
    toolbarRow2={null}
    librarySearchValue=""
    onLibrarySearchChange={() => {}}
    libraryContent={<div style={{ height: 5000 }}>a very long palette</div>}
    canvasTitle="Canvas"
    componentCount={0}
    netCount={0}
    simulationRunning={false}
    onZoomReset={() => {}}
    zoom={1}
    pan={[0, 0]}
    gridMode="dots"
    gridSize={20}
    canvasContent={<g />}
    analysisTitle="Analysis"
    analysisContent={null}
    inspectorContent={null}
  />,
);

describe('component library panel', () => {
  it('is bound to the same height token as the canvas, so it can never outgrow it', () => {
    const { container } = mount();
    const row = container.querySelector('aside')!.parentElement as HTMLElement;
    expect(row.style.getPropertyValue('--workspace-canvas-height')).toBe(`${WORKSPACE_CANVAS_HEIGHT}px`);
    const aside = container.querySelector('aside') as HTMLElement;
    const main = container.querySelector('main') as HTMLElement;
    expect(aside.style.height).toBe('var(--workspace-canvas-height)');
    expect(aside.style.maxHeight).toBe('var(--workspace-canvas-height)');
    expect(main.style.height).toBe('var(--workspace-canvas-height)');
    expect(aside.style.overflow).toBe('');
    expect(aside.className).toContain('overflow-hidden');
  });

  it('scrolls its list internally: a flexible, shrinkable, scrollable box with a slim scrollbar', () => {
    const { container } = mount();
    const scroller = container.querySelector('.mae-palette-scroll') as HTMLElement;
    expect(scroller).not.toBeNull();
    expect(scroller.parentElement).toBe(container.querySelector('aside'));
    expect(scroller.style.overflowY).toBe('auto');
    expect([scroller.style.flexGrow, scroller.style.flexShrink, scroller.style.flexBasis]).toEqual(['1', '1', '0px']);
    expect(scroller.style.minHeight).toBe('0px');
    expect(scroller.style.overscrollBehavior).toBe('contain');
    expect(scroller.textContent).toContain('a very long palette');
  });

  it('keeps the canvas height constant at 700 px', () => {
    expect(WORKSPACE_CANVAS_HEIGHT).toBe(700);
  });
});
