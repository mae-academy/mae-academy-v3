import { describe, expect, it } from "vitest";
import { clampPirHold, echoMicros, irLevel, ldrAdc, ldrResistance, ldrVoltage, lm35Adc, luxFromPosition, pirLevel, positionFromLux, voltsToAdc } from "./sensorModels";

describe("LDR divider", () => {
  it("is 10 kOhm at 10 lux and follows the 0.7 power law", () => {
    expect(ldrResistance(10)).toBeCloseTo(10_000, 6);
    expect(ldrResistance(1)).toBeCloseTo(10_000 * Math.pow(10, 0.7), 3);
    expect(ldrResistance(1000)).toBeCloseTo(10_000 * Math.pow(0.01, 0.7), 3);
  });
  it("puts the node at 2.5 V (ADC 511) at 10 lux", () => {
    expect(ldrVoltage(10)).toBeCloseTo(2.5, 6);
    expect(ldrAdc(10)).toBe(511);
  });
  it("rises monotonically with light and stays inside the converter range", () => {
    let prev = -1;
    for (const lux of [0.1, 1, 10, 100, 1000, 10_000]) {
      const adc = ldrAdc(lux);
      expect(adc).toBeGreaterThan(prev);
      expect(adc).toBeGreaterThanOrEqual(0);
      expect(adc).toBeLessThanOrEqual(1023);
      prev = adc;
    }
    expect(ldrAdc(0.1)).toBeLessThan(60);
    expect(ldrAdc(10_000)).toBeGreaterThan(1010);
  });
  it("clamps lux outside 0.1 .. 10 000", () => {
    expect(ldrAdc(0)).toBe(ldrAdc(0.1));
    expect(ldrAdc(1e9)).toBe(ldrAdc(10_000));
  });
  it("round-trips the logarithmic slider position", () => {
    expect(luxFromPosition(0)).toBeCloseTo(0.1, 9);
    expect(luxFromPosition(1)).toBeCloseTo(10_000, 6);
    for (const lux of [0.5, 7, 300, 4200]) expect(luxFromPosition(positionFromLux(lux))).toBeCloseTo(lux, 6);
  });
});

describe("LM35", () => {
  it("is 10 mV per degree through a 5 V / 10-bit converter, truncated", () => {
    expect(lm35Adc(0)).toBe(0);
    expect(lm35Adc(25)).toBe(Math.floor((0.25 / 5) * 1023)); // 51
    expect(lm35Adc(25)).toBe(51);
    expect(lm35Adc(100)).toBe(204);
  });
  it("round-trips through the usual sketch formula within one count", () => {
    for (const c of [0, 10, 25, 37, 99.5]) {
      const back = (lm35Adc(c) * 5.0) / 1023.0 * 100.0;
      expect(Math.abs(back - c)).toBeLessThan(0.5);
    }
  });
});

describe("digital sensors", () => {
  it("PIR idles LOW and holds HIGH when triggered; hold time clamps to 1..5 s", () => {
    expect(pirLevel(false)).toBe(0);
    expect(pirLevel(true)).toBe(1);
    expect(clampPirHold(0)).toBe(1);
    expect(clampPirHold(9)).toBe(5);
    expect(clampPirHold(3)).toBe(3);
  });
  it("IR obstacle output is active LOW at or inside the threshold", () => {
    expect(irLevel(5, 10)).toBe(0);
    expect(irLevel(10, 10)).toBe(0);
    expect(irLevel(10.5, 10)).toBe(1);
    expect(irLevel(30, 10)).toBe(1);
  });
  it("ultrasonic echo is 58.2 us per cm", () => {
    expect(echoMicros(100)).toBe(5820);
    expect(echoMicros(2)).toBe(116);
    expect(echoMicros(400)).toBe(23280);
    expect(echoMicros(1000)).toBe(23280);
    // distance recovered the way sketches do it
    expect(echoMicros(100) / 58.2).toBeCloseTo(100, 6);
    expect((echoMicros(100) * 0.0343) / 2).toBeCloseTo(100, 0);
  });
});

describe("voltsToAdc", () => {
  it("truncates and clamps", () => {
    expect(voltsToAdc(5)).toBe(1023);
    expect(voltsToAdc(9)).toBe(1023);
    expect(voltsToAdc(-1)).toBe(0);
    expect(voltsToAdc(2.5)).toBe(511);
  });
});
