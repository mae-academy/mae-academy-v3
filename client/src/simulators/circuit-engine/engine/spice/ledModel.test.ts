/**
 * The LED colour contract, end to end: a colour preset is the single source of truth for forward
 * voltage, and that voltage is what the emitted SPICE model is fitted to. Guards the reported defect
 * where every colour simulated the same, because `forwardVoltage` was an independent field the
 * colour never wrote to.
 */

import { describe, expect, it } from "vitest";

import {
  getDef,
  LED_COLOR_LABELS,
  LED_COLOR_OPTIONS,
  LED_COLORS,
  LED_FORWARD_VOLTAGES,
} from "@/simulators/circuit-engine/models/componentDefs";
import { generateNetlist } from "@/simulators/circuit-engine/engine/spice/netlistGenerator";
import type {
  SpiceComponent,
  SpiceGround,
} from "@/simulators/circuit-engine/engine/spice/spiceTypes";

const GND = "n:0f8d3c1e-4a6b-4c2d-9e51-7b0a2f6d8c34:gnd";
const TOP = "n:2b7e4a90-11cd-4f3a-8e62-5c9d0a1b7e44:pos";
const ground: SpiceGround = { kind: "ground", id: "gnd-1", net: GND };

const led = (id: string, label: string, forwardVoltage: number): SpiceComponent => ({
  kind: "diode",
  id,
  label,
  variant: "led",
  anode: TOP,
  cathode: GND,
  forwardVoltage,
});

/** The `.MODEL` card a single LED of this forward voltage produces. */
function ledModelCard(forwardVoltage: number): string {
  const deck = generateNetlist([ground, led("d-1", "D1", forwardVoltage)]);
  const card = deck.split("\n").find(line => line.startsWith(".MODEL D_LED_"));
  if (!card) throw new Error(`no LED model card in deck:\n${deck}`);
  return card;
}

/** kT/q at ngspice's 27 °C default — deliberately not the generator's own constant, so this checks
 *  the fit against the physics rather than restating the code. */
const THERMAL_VOLTAGE = 1.380649e-23 * 300.15 / 1.602176634e-19;

/** Junction drop the emitted model produces at `current`, from the Shockley equation plus RS. */
function dropAt(card: string, current: number): number {
  const saturation = Number(/IS=([0-9.eE+-]+)/.exec(card)?.[1]);
  const emission = Number(/N=([0-9.eE+-]+)/.exec(card)?.[1]);
  const series = Number(/RS=([0-9.eE+-]+)/.exec(card)?.[1] ?? 0);
  return emission * THERMAL_VOLTAGE * Math.log(current / saturation + 1) + current * series;
}

describe("LED colour presets", () => {
  it("gives every colour a forward voltage, a canvas colour and a labelled dropdown entry", () => {
    expect(LED_COLOR_OPTIONS.length).toBeGreaterThan(0);
    for (const color of LED_COLOR_OPTIONS) {
      expect(LED_FORWARD_VOLTAGES[color]).toBeGreaterThan(0);
      expect(LED_COLORS[color]).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(LED_COLOR_LABELS[color]).toMatch(/^[A-Z][a-z]+ \(\d\.\d V\)$/);
    }
  });

  it("matches the specified nominal voltages", () => {
    expect(LED_FORWARD_VOLTAGES).toEqual({
      violet: 1.2,
      red: 1.8,
      amber: 2.0,
      orange: 2.0,
      yellow: 2.2,
      green: 3.5,
      blue: 3.8,
      white: 4.0,
    });
    expect(LED_COLOR_LABELS.red).toBe("Red (1.8 V)");
    expect(LED_COLOR_LABELS.white).toBe("White (4.0 V)");
  });

  it("offers the presets in ascending forward-voltage order", () => {
    const volts = LED_COLOR_OPTIONS.map(color => LED_FORWARD_VOLTAGES[color]);
    expect([...volts].sort((a, b) => a - b)).toEqual(volts);
  });

  it("drives the LED definition: colour is editable, forward voltage is derived and hidden", () => {
    const properties = getDef("led")?.properties;
    expect(properties?.color.options).toEqual(LED_COLOR_OPTIONS);
    expect(properties?.color.optionLabels).toEqual(LED_COLOR_LABELS);
    // Hidden keeps it out of the inspector while `defaultProps` still seeds it for the engines.
    expect(properties?.forwardVoltage.hidden).toBe(true);
    expect(properties?.forwardVoltage.value).toBe(LED_FORWARD_VOLTAGES[String(properties?.color.value)]);
  });
});

describe("LED SPICE model", () => {
  it("fits the model so the junction drops the preset's voltage at the 20 mA test current", () => {
    for (const [color, forwardVoltage] of Object.entries(LED_FORWARD_VOLTAGES)) {
      const drop = dropAt(ledModelCard(forwardVoltage), 0.02);
      // Within 25 mV across the whole 1.2 V - 4.0 V range: the fit uses a slightly different
      // thermal voltage than ngspice's and adds RS, so it is close rather than exact.
      expect(Math.abs(drop - forwardVoltage), `${color} (${forwardVoltage} V) dropped ${drop}`).toBeLessThan(0.025);
    }
  });

  it("emits a distinct model per forward voltage, so changing colour changes the deck", () => {
    const red = ledModelCard(LED_FORWARD_VOLTAGES.red);
    const blue = ledModelCard(LED_FORWARD_VOLTAGES.blue);
    expect(red).not.toBe(blue);
    expect(red).toContain("D_LED_1P8");
    expect(blue).toContain("D_LED_3P8");
    // A higher forward voltage needs a larger emission coefficient at the same saturation current.
    const emission = (card: string) => Number(/N=([0-9.eE+-]+)/.exec(card)?.[1]);
    expect(emission(blue)).toBeGreaterThan(emission(red));
  });

  it("shares one model card between colours that specify the same voltage", () => {
    // Amber and orange are both 2.0 V, so the deck should carry a single card for the pair.
    const deck = generateNetlist([
      ground,
      led("d-1", "D1", LED_FORWARD_VOLTAGES.amber),
      led("d-2", "D2", LED_FORWARD_VOLTAGES.orange),
    ]);
    expect(deck.match(/^\.MODEL D_LED_/gm)).toHaveLength(1);
  });
});
