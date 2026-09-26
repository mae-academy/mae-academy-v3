export type Tone = 'hot' | 'ret';

/**
 * One colour scheme for both voltage classes: the line (L1 / L+) is red when energised and the return
 * (N / M) blue, so a class switch never changes how a circuit looks. The bench root sets the two
 * custom properties every conductor below reads.
 */
export const supplyVars = (): string => '[--lb-live:#ef4444] [--lb-ret:#3b82f6]';

/** Conductor stroke: slate while dead, the class accent while energised. Flat, no glow. */
export const wireClass = (live: boolean, tone: Tone = 'hot'): string =>
  live ? (tone === 'ret' ? 'stroke-(--lb-ret)' : 'stroke-(--lb-live)') : 'stroke-slate-400 dark:stroke-slate-700';

export const liveFill = (live: boolean): string => (live ? 'fill-(--lb-live)' : 'fill-slate-400 dark:fill-slate-700');

export const toneText = (tone: Tone): string => (tone === 'ret' ? 'text-(--lb-ret)' : 'text-(--lb-live)');
