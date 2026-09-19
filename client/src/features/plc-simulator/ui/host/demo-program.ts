import type { Network } from '../../domain/ast';
import { S7_200_CPU224, type HardwareProfile } from '../../domain/hardware';
import { ilToLad, type SymbolMap } from '../../transpiler';

/**
 * The program a student sees on first open, chosen so every part of the simulator has something to
 * show within seconds of pressing RUN:
 *
 *  1. Start/stop seal-in: I0.0 (start, NO) latches Q0.0 through its own contact; I0.1 (stop, NC)
 *     drops it. Exercises series/parallel wiring and lets the student watch power flow change.
 *  2. Five-second alarm: once the motor (Q0.0) has run for 50 x 100 ms, the timer's done bit T37
 *     drives the alarm Q0.1. The two lanes hang off the left rail independently, because a timer
 *     box passes power straight through (ENO) and only its T-bit says "time elapsed".
 *
 * Written as STL so the demo goes through exactly the same parser students' imports do, and so the
 * Micro/WIN export of the demo is a faithful listing of what is drawn.
 */
export const DEMO_STL = `NETWORK 1 // Start / stop seal-in
LD I0.0
O Q0.0
AN I0.1
= Q0.0
NETWORK 2 // Alarm after 5 s of running
LD Q0.0
TON T37, 50
LD T37
= Q0.1`;

/** Symbol table for the demo: names appear under each element and in the exported `.sym`. */
export const DEMO_SYMBOLS: SymbolMap = {
  'I0.0': { name: 'Start_PB', comment: 'Start pushbutton (NO)' },
  'I0.1': { name: 'Stop_PB', comment: 'Stop pushbutton (NC contact)' },
  'Q0.0': { name: 'Motor', comment: 'Motor contactor' },
  'Q0.1': { name: 'Alarm', comment: 'Runs too long' },
  T37: { name: 'Run_Timer', comment: 'On-delay, 100 ms base, 5.0 s' },
};

/** The demo as LAD networks, validated against `profile` (all built-in profiles accept it). */
export function createDemoNetworks(profile: HardwareProfile = S7_200_CPU224): Network[] {
  const result = ilToLad(DEMO_STL, profile);
  if (!result.ok || result.value === null) {
    // A broken demo is a programming error, not a user error: fail loudly in development.
    throw new Error(`Demo program is invalid for ${profile.model}: ${result.diagnostics.map((d) => d.message).join('; ')}`);
  }
  return result.value;
}
