import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { viewTransforms, type ViewState } from '@/components/common/schematic/useSchematicViewport';

/**
 * WebKit (iPad/iPhone Safari) does not repaint HTML inside an SVG `<foreignObject>` when an
 * *ancestor* `<g transform>` changes, so KaTeX labels froze at their 1x position and size while
 * the symbols zoomed around them. Math labels are therefore drawn in an HTML layer that sits
 * over the canvas and receives the exact same matrix as the SVG world group
 * (`viewTransforms`), with children positioned in world units.
 */
export const SchematicOverlayContext = createContext<HTMLElement | null>(null);

interface SchematicHtmlLayerProps {
  view: ViewState;
  /** Receives the transformed host element once mounted; labels portal into it. */
  hostRef: (element: HTMLDivElement | null) => void;
}

/** Clipped, non-interactive layer exactly covering the canvas `<svg>`. */
export function SchematicHtmlLayer({ view, hostRef }: SchematicHtmlLayerProps) {
  return (
    <div data-testid="schematic-html-layer" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        ref={hostRef}
        data-schematic-html-host=""
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', transform: viewTransforms(view).css }}
      />
    </div>
  );
}

interface WorldHtmlBoxProps {
  /** World-space top-left of the box (the same coordinates the old `<foreignObject x y>` used). */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

/**
 * A box in world coordinates. Inside a `BaseSchematicCanvas` it portals into the synced HTML
 * layer; without a host (static/server render, or a canvas that has none) it degrades to the
 * original `<foreignObject>`, so markup and vector export hooks keep working. `opacity` only applies
 * to the portalled box: the foreignObject fallback is dimmed by its parent SVG group instead.
 */
export function WorldHtmlBox({ x, y, width, height, opacity, className, ariaLabel, children }: WorldHtmlBoxProps) {
  const host = useContext(SchematicOverlayContext);
  if (!host) {
    return (
      <foreignObject className={className} x={x} y={y} width={width} height={height} aria-label={ariaLabel} pointerEvents="none" style={{ overflow: 'visible' }}>
        {children}
      </foreignObject>
    );
  }
  return createPortal(
    <div
      className={className}
      aria-label={ariaLabel}
      style={{ position: 'absolute', left: x, top: y, width, height, overflow: 'visible', pointerEvents: 'none', opacity, transition: opacity === undefined ? undefined : 'opacity 0.25s ease' }}
    >
      {children}
    </div>,
    host,
  );
}
