export interface Palette {
  background: string;
  canvas: string;
  panel: string;
  panelAlt: string;
  line: string;
  text: string;
  muted: string;
  subtle: string;
  primary: string;
  accent: string;
  danger: string;
  selection: string;
  grid: string;
  wire: string;
  powered: string;
  input: string;
  shadow: string;
}

export const SELECTION_COLOR_LIGHT = '#2563eb';
export const SELECTION_COLOR_DARK = '#a855f7';

export interface MarqueeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
}

/** Canonical rubber-band marquee recipe (circuit-engine Home.tsx:4314). */
export function marqueeStyle(colors: Palette): MarqueeStyle {
  return {
    fill: `${colors.selection}18`,
    stroke: colors.selection,
    strokeWidth: 1.2,
    strokeDasharray: '5 4',
  };
}

export interface WireCornerHandleStyle {
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/** Canonical wire-corner drag-handle recipe (circuit-engine Home.tsx:4328). */
export function wireCornerHandleStyle(colors: Palette): WireCornerHandleStyle {
  return { r: 6, fill: colors.panel, stroke: colors.selection, strokeWidth: 2 };
}
