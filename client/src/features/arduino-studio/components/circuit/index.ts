import type { ComponentType } from "react";
import { VectorLed } from "./VectorLed";
import { VectorPotentiometer } from "./VectorPotentiometer";
import { VectorPushButton } from "./VectorPushButton";
import { VectorResistor } from "./VectorResistor";

export { VectorLed, LED_W, LED_H, LED_ANODE_TIP, LED_CATHODE_TIP, type VectorLedProps } from "./VectorLed";
export { VectorResistor, resistorBands, RES_W, RES_H, RES_LEFT_TIP, RES_RIGHT_TIP, type VectorResistorProps } from "./VectorResistor";
export { VectorPotentiometer, POT_W, POT_H, POT_PINS, type VectorPotentiometerProps } from "./VectorPotentiometer";
export { VectorPushButton, BTN_W, BTN_H, BTN_LEGS, type VectorPushButtonProps } from "./VectorPushButton";
export { orientFrame, type Orientation, type CircuitComponentProps } from "./orientation";

/**
 * Component registry: add future peripherals (servo, buzzer, relay, ...) here and reference them by key.
 * Every entry is a flat-vector SVG component accepting `orientation` plus a `state` and/or `value` prop.
 */
export const circuitRegistry = {
  led: VectorLed,
  resistor: VectorResistor,
  potentiometer: VectorPotentiometer,
  pushButton: VectorPushButton,
} as const satisfies Record<string, ComponentType<never>>;

export type CircuitComponentKey = keyof typeof circuitRegistry;

export { LcdWires } from "./LcdWires";
export { buildLcdHarness, simplify, findHops, hopArcs, wirePath, HARNESS_COLORS, type HarnessInput, type HarnessWire, type Pt } from "./lcdHarness";
export * from "./lcdGeometry";
