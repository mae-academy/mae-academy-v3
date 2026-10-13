export const GRID_SIZE = 20;
export const TAB_D_GRID_SIZE = 25;
export const TAB_D_SYMBOL_SCALE = 1.5;
export const TERMINAL_HIT_RADIUS = 13;
export const TERMINAL_RADIUS = 4;
/** Touch targets: a fingertip covers ~40px, so pins snap within this many *screen* pixels. */
export const COARSE_TERMINAL_HIT_RADIUS_PX = 20;

/** True on touch-first devices (iPad, phones). Re-evaluated per call so hybrids and emulation are honoured. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * World-unit pin snap radius. Mouse keeps the legacy fixed world radius; touch input
 * (coarse primary pointer or a touch/pen event) gets a constant >=20 screen px radius
 * regardless of canvas zoom, so zoomed-out schematics stay wirable by finger.
 */
export function terminalHitRadius(zoom: number, coarse: boolean): number {
  if (!coarse) return TERMINAL_HIT_RADIUS;
  return Math.max(TERMINAL_HIT_RADIUS, COARSE_TERMINAL_HIT_RADIUS_PX / Math.max(zoom, ZOOM_MIN));
}

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 1.15;

export function clampZoom(zoom: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
}

/** A deliberately gentle, pixel-normalized wheel response for the documented CAD workspace. */
export function tabDGentleWheelZoomFactor(deltaY: number): number {
  const normalizedDelta = Math.max(-80, Math.min(80, deltaY));
  return Math.exp(-normalizedDelta * 0.00045);
}

export interface TerminalVisibilityInput {
  isSelectedOrHighlighted: boolean;
  hoveredComponentId: string | null;
  componentId: string;
  wiringInProgress: boolean;
}

/** Terminals stay hidden until selection, hover, or an in-progress wire drag reveals them (circuit-engine Home.tsx:4606-4621). */
export function computeTerminalVisibility(input: TerminalVisibilityInput): boolean {
  return (
    input.isSelectedOrHighlighted ||
    input.hoveredComponentId === input.componentId ||
    input.wiringInProgress
  );
}
