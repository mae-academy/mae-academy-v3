/**
 * Stage geometry shared by the cylinder cutaways. Everything is drawn at the piston's rear-most
 * position and slid by `pistonShift(stroke)`, so the piston face can never leave the inner bore.
 */
import { clampPistonX } from './cutawayPhysics';

/** The bore between the end caps. */
export const CHAMBER = { x0: 160, x1: 620, y0: 110, y1: 230 } as const;
export const AXIS_Y = 170;
export const PISTON = { width: 28, y0: CHAMBER.y0, y1: CHAMBER.y1 } as const;
export const ROD_Y = { y0: 162, y1: 178 } as const;
/** Clearance between the piston and an end-cap face at 0 % / 100 %, so no outline ever overlaps the cap. */
export const INSET = 2;

/** Left face of the piston at stroke 0 and at stroke 1. */
export const PISTON_MIN_X = CHAMBER.x0 + INSET;
export const PISTON_MAX_X = CHAMBER.x1 - INSET - PISTON.width;
export const TRAVEL = PISTON_MAX_X - PISTON_MIN_X;

/** Offset from the drawn (rear-most) position, clamped to the inner bore; `maxInnerX` overrides the front stop. */
export const pistonShift = (stroke: number, maxInnerX: number = PISTON_MAX_X): number =>
  clampPistonX(stroke, PISTON_MIN_X, maxInnerX) - PISTON_MIN_X;

/** Cap, cavity and port-channel rectangles of one end: the volume its fluid may occupy. */
export interface Box { x: number; y: number; width: number; height: number }

export const CAP_TOP = 70;
export const PORT_X = { rear: 95, front: 685 } as const;
export const CHANNEL_WIDTH = 30;
export const CAVITY = { depth: 90, y0: 146, y1: 194 } as const;
export const BYPASS_Y = 123;
