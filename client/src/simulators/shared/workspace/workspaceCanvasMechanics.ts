export const GRID_SIZE = 20;
export const TAB_D_GRID_SIZE = 25;
export const TAB_D_SYMBOL_SCALE = 1.5;
export const TERMINAL_HIT_RADIUS = 13;
export const TERMINAL_RADIUS = 4;

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
