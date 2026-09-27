import type { SVGProps } from 'react';

export type TriangleDirection = 'up' | 'down' | 'left' | 'right';

const ROTATIONS: Record<TriangleDirection, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

export interface TriangleGlyphProps extends SVGProps<SVGSVGElement> {
  direction: TriangleDirection;
  className?: string;
}

/**
 * Universal, pixel-perfect geometric triangle renderer.
 * Eliminates cross-browser and cross-OS font metric distortion (Safari SF Pro vs Blink Roboto).
 */
export function TriangleGlyph({ direction, className = 'h-3 w-3 inline-block shrink-0', ...props }: TriangleGlyphProps) {
  const deg = ROTATIONS[direction];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-hidden="true"
      {...props}
    >
      <g transform={`rotate(${deg}, 12, 12)`}>
        <polygon points="12,4 22,20 2,20" />
      </g>
    </svg>
  );
}

/**
 * 4-direction navigation cluster: ▲ ▼ ◄ ►
 * Renders pixel-perfect geometric SVG triangles across all browser engines
 * with identical equilateral proportions, preserving an accessible screen-reader text fallback.
 */
export function NavTriangles({ className = 'h-2.5 w-2.5', gap = 'gap-0.5', includeSpace = false }: { className?: string; gap?: string; includeSpace?: boolean }) {
  return (
    <span className={`inline-flex items-center ${gap}`}>
      <TriangleGlyph direction="up" className={className} />
      <TriangleGlyph direction="down" className={className} />
      <TriangleGlyph direction="left" className={className} />
      <TriangleGlyph direction="right" className={className} />
      <span className="sr-only">▲▼◄►{includeSpace ? ' ' : ''}</span>
    </span>
  );
}
