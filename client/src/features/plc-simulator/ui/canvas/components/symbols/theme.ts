/**
 * Class names for every state a drawn element can be in. Colours live in classes (not attributes)
 * so light / dark themes and the energised palette are switched by CSS alone, without React
 * having to know which theme is active.
 */

export const WIRE_IDLE = 'stroke-slate-500 dark:stroke-slate-400';
/** Siemens classic green in light mode, a brighter green in dark mode for contrast. */
export const WIRE_LIVE = 'stroke-[#2E7D32] dark:stroke-[#00E676]';
export const DOT_IDLE = 'fill-slate-500 dark:fill-slate-400';
export const DOT_LIVE = 'fill-[#2E7D32] dark:fill-[#00E676]';
export const GLOW = '[filter:drop-shadow(0_0_2px_rgba(0,230,118,0.55))]';

export const wireClass = (live: boolean): string => (live ? `${WIRE_LIVE} ${GLOW}` : WIRE_IDLE);
export const dotClass = (live: boolean): string => (live ? DOT_LIVE : DOT_IDLE);

export const TEXT_ADDRESS = 'fill-slate-900 dark:fill-slate-100';
export const TEXT_TAG = 'fill-slate-500 dark:fill-slate-400';
export const TEXT_PIN = 'fill-slate-600 dark:fill-slate-300';
export const TEXT_LIVE = 'fill-[#2E7D32] dark:fill-[#00E676]';
export const textLive = (live: boolean, idle: string): string => (live ? TEXT_LIVE : idle);

export const BOX_FILL = 'fill-white dark:fill-slate-900';
export const BOX_FILL_LIVE = 'fill-emerald-50 dark:fill-emerald-950/40';

export const RAIL_STROKE = 'stroke-slate-700 dark:stroke-slate-300';
export const RAIL_LIVE = 'stroke-[#2E7D32] dark:stroke-[#00E676]';

export const SELECTED_FILL = 'fill-sky-500/10';
export const SELECTED_STROKE = 'stroke-sky-500';
export const ERROR_STROKE = 'stroke-red-500';
export const ERROR_FILL = 'fill-red-500/10';
export const CELL_HOVER_OK = 'fill-emerald-500/15 stroke-emerald-500';
export const CELL_HOVER_BAD = 'fill-red-500/10 stroke-red-500';
export const CELL_SELECTED = 'fill-sky-500/10 stroke-sky-500';

export const FONT_MONO = 'font-mono';
