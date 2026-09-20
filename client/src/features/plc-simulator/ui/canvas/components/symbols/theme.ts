/**
 * Class names for every state a drawn element can be in. Colours live in classes (not attributes)
 * so light / dark themes and the energised palette are switched by CSS alone, without React
 * having to know which theme is active.
 */

export const WIRE_IDLE = 'stroke-slate-800 dark:stroke-slate-200';
/** Brand power-flow: vibrant indigo in light mode, luminous cyan in dark mode. */
export const WIRE_LIVE = 'stroke-[#6366f1] dark:stroke-[#38bdf8]';
export const DOT_IDLE = 'fill-slate-800 dark:fill-slate-200';
export const DOT_LIVE = 'fill-[#6366f1] dark:fill-[#38bdf8]';
export const GLOW = '[filter:drop-shadow(0_0_3px_rgba(99,102,241,0.6))] dark:[filter:drop-shadow(0_0_3px_rgba(56,189,248,0.65))]';

export const wireClass = (live: boolean): string => (live ? `${WIRE_LIVE} ${GLOW}` : WIRE_IDLE);
export const dotClass = (live: boolean): string => (live ? DOT_LIVE : DOT_IDLE);

export const TEXT_ADDRESS = 'fill-slate-900 dark:fill-white';
export const TEXT_TAG = 'fill-slate-600 dark:fill-slate-300';
export const TEXT_PIN = 'fill-slate-700 dark:fill-slate-200';
export const TEXT_LIVE = 'fill-[#6366f1] dark:fill-[#38bdf8]';
export const textLive = (live: boolean, idle: string): string => (live ? TEXT_LIVE : idle);

export const BOX_FILL = 'fill-white dark:fill-slate-900';
export const BOX_FILL_LIVE = 'fill-indigo-50/70 dark:fill-indigo-950/40';

export const RAIL_STROKE = 'stroke-slate-800 dark:stroke-slate-200';
export const RAIL_LIVE = 'stroke-[#6366f1] dark:stroke-[#38bdf8]';

export const SELECTED_FILL = 'fill-transparent';
export const SELECTED_STROKE = 'stroke-indigo-600 dark:stroke-sky-400';
export const ERROR_STROKE = 'stroke-red-500';
export const ERROR_FILL = 'fill-red-500/10';
export const CELL_HOVER_OK = 'fill-indigo-500/15 stroke-indigo-500';
export const CELL_HOVER_BAD = 'fill-red-500/10 stroke-red-500';
export const CELL_SELECTED = 'fill-transparent stroke-none opacity-0';

export const FONT_MONO = 'font-mono';
