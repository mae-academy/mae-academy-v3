// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  COARSE_TERMINAL_HIT_RADIUS_PX,
  TERMINAL_HIT_RADIUS,
  ZOOM_MIN,
  terminalHitRadius,
} from '@/simulators/shared/workspace/workspaceCanvasMechanics';
import { screenToWorld, viewTransforms, worldToScreen, zoomViewAt, type ViewState } from '@/components/common/schematic/useSchematicViewport';
import { WorldHtmlBox } from '@/components/common/schematic/SchematicHtmlOverlay';

describe('touch pin snap radius', () => {
  it('keeps the legacy world radius for a mouse at every zoom', () => {
    for (const zoom of [0.2, 0.5, 1, 2, 3]) expect(terminalHitRadius(zoom, false)).toBe(TERMINAL_HIT_RADIUS);
  });

  it('gives a finger at least 20 screen pixels at every zoom', () => {
    for (const zoom of [0.2, 0.5, 1, 1.5, 3]) {
      const screenPx = terminalHitRadius(zoom, true) * zoom;
      expect(screenPx).toBeGreaterThanOrEqual(COARSE_TERMINAL_HIT_RADIUS_PX - 1e-9);
    }
  });

  it('never shrinks below the mouse radius when zoomed in on touch', () => {
    expect(terminalHitRadius(3, true)).toBe(TERMINAL_HIT_RADIUS);
  });

  it('stays finite at the minimum zoom', () => {
    expect(terminalHitRadius(0, true)).toBe(COARSE_TERMINAL_HIT_RADIUS_PX / ZOOM_MIN);
  });
});

describe('world <-> screen projection shared by the SVG and the HTML label layer', () => {
  const view: ViewState = { zoom: 1.75, pan: [-257.5, 130.25] };

  it('worldToScreen is the exact inverse of screenToWorld', () => {
    const world: [number, number] = [412, -37.5];
    const back = screenToWorld(view, worldToScreen(view, world));
    expect(back[0]).toBeCloseTo(world[0], 9);
    expect(back[1]).toBeCloseTo(world[1], 9);
  });

  it('the SVG and CSS transforms describe the same matrix', () => {
    const { svg, css } = viewTransforms(view);
    expect(svg).toBe('translate(-257.5,130.25) scale(1.75)');
    expect(css).toBe('translate(-257.5px, 130.25px) scale(1.75)');
  });

  it('a world point stays under a pinch centre while zooming (labels cannot drift from pins)', () => {
    const anchor: [number, number] = [300, 200];
    const world = screenToWorld(view, anchor);
    const zoomed = zoomViewAt(view, 1.6, anchor);
    const screen = worldToScreen(zoomed, world);
    expect(screen[0]).toBeCloseTo(anchor[0], 9);
    expect(screen[1]).toBeCloseTo(anchor[1], 9);
  });
});

describe('WorldHtmlBox without an overlay host', () => {
  it('falls back to a foreignObject at the same world coordinates, so server render and SVG export keep working', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <WorldHtmlBox className="v3-live-math" x={10} y={20} width={140} height={28} ariaLabel="R1" opacity={0.4}>
          <span>R1</span>
        </WorldHtmlBox>
      </svg>,
    );
    expect(markup).toContain('<foreignObject');
    expect(markup).toContain('class="v3-live-math"');
    expect(markup).toContain('x="10"');
    expect(markup).toContain('y="20"');
    expect(markup).toMatch(/<span[^>]*>R1<\/span>/);
    // The parent SVG group dims the fallback; the box must not dim it a second time.
    expect(markup).not.toContain('opacity');
  });
});
