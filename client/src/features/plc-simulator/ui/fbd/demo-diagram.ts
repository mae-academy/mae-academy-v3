import type { FbdGraph } from './model';

/**
 * The diagram a student sees on first opening the LOGO! tab: I1 sets and I2 resets a latching relay
 * that drives Q1, and a 5 s on-delay on that signal drives Q2, so RUN shows latching, timing and
 * live signal colouring within seconds.
 */
export const createDemoDiagram = (): FbdGraph => ({
  blocks: [
    { id: 'b1', kind: 'input', x: 40, y: 40, index: 0 },
    { id: 'b2', kind: 'input', x: 40, y: 140, index: 1 },
    { id: 'b3', kind: 'sr', x: 240, y: 80 },
    { id: 'b4', kind: 'output', x: 460, y: 60, index: 0 },
    { id: 'b5', kind: 'ton', x: 460, y: 180, preset: 50 },
    { id: 'b6', kind: 'output', x: 660, y: 180, index: 1 },
  ],
  links: [
    { id: 'l1', from: 'b1', to: 'b3', pin: 0 },
    { id: 'l2', from: 'b2', to: 'b3', pin: 1 },
    { id: 'l3', from: 'b3', to: 'b4', pin: 0 },
    { id: 'l4', from: 'b3', to: 'b5', pin: 0 },
    { id: 'l5', from: 'b5', to: 'b6', pin: 0 },
  ],
});
