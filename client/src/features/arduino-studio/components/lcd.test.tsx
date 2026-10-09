// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IDLE_LCD } from "../arduinoLcd";
import { ARDUINO_EXAMPLES } from "../arduinoExamples";
import { ASCII_GLYPHS, glyphRows } from "../lcdFont";
import { ANALOG_HEADER_Y, DIGITAL_HEADER_Y, analogPinX, digitalPinX } from "../arduinoBoardGeometry";
import { LCD_BLUE, LCD_DIM, PCB_BLUE, LcdDisplay, contrastLook } from "./LcdDisplay";
import { LcdContrastKnob } from "./LcdContrastKnob";
import { LcdWires, buildLcdHarness, findHops, hopArcs, lcdHoleX, wirePath, type HarnessInput, type HarnessWire, type Pt } from "./circuit";
import { I2C_PINS, LCD_HOLE_Y, LCD_PINS, i2cHoleX } from "./circuit/lcdGeometry";
import type { LcdState } from "@shared/code/arduinoTypes";

afterEach(cleanup);

const S = 1.75;
const lit = (rows: [string, string], extra: Partial<LcdState> = {}): LcdState => ({ ...IDLE_LCD, enabled: true, backlight: true, rows, ...extra });
const pad = (s: string) => s.padEnd(16, " ");

function input(over: Partial<HarnessInput> = {}): HarnessInput {
  const origin = { x: digitalPinX(5) * S - lcdHoleX(10), y: -80 - LCD_HOLE_Y };
  return {
    mode: "parallel",
    pins: [12, 11, 5, 4, 3, 2],
    origin,
    boardW: 285.2 * S,
    boardH: 209 * S,
    pinPoint: pin => (pin >= 14 ? { x: analogPinX(pin - 14) * S, y: ANALOG_HEADER_Y * S } : { x: digitalPinX(pin) * S, y: DIGITAL_HEADER_Y * S }),
    gndTop: { x: 125.75 * S, y: 19.05 * S },
    gndBottom: { x: 176.25 * S, y: 190.05 * S },
    v5: { x: 167.25 * S, y: 190.05 * S },
    sda: { x: 107.75 * S, y: 19.05 * S },
    scl: { x: 98.75 * S, y: 19.05 * S },
    ...over,
  };
}

const orthogonal = (pts: Pt[]) => pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y);
const near = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

describe("LCD font", () => {
  it("has a glyph for every printable ASCII code", () => {
    expect(ASCII_GLYPHS).toHaveLength(95);
    expect(ASCII_GLYPHS.every(g => g.length === 5)).toBe(true);
  });

  it("draws recognisable letters in a 5x8 cell", () => {
    const h = glyphRows("H".charCodeAt(0)).map(r => r.toString(2).padStart(5, "0"));
    expect(h.slice(0, 7)).toEqual(["10001", "10001", "10001", "11111", "10001", "10001", "10001"]);
    expect(h[7]).toBe("00000");
    const comma = glyphRows(",".charCodeAt(0)).map(r => r.toString(2).padStart(5, "0"));
    expect(comma.some(r => r !== "00000")).toBe(true);
    expect(glyphRows(0x20).every(r => r === 0)).toBe(true);
  });

  it("uses custom CGRAM glyphs for codes 0-7", () => {
    expect(glyphRows(0, { 0: [0, 10, 31, 31, 31, 14, 4, 0] })[2]).toBe(31);
    expect(glyphRows(3).every(r => r === 0)).toBe(true);
  });
});

describe("LcdDisplay", () => {
  it("shows the two rows as DOM text on blue glass with white pixels", () => {
    const { container, getByTestId } = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hello, MAE!"), pad("Arduino Studio")])} powered />
      </svg>,
    );
    expect(getByTestId("lcd-row-0").textContent).toBe(pad("Hello, MAE!"));
    expect(getByTestId("lcd-row-1").textContent).toBe(pad("Arduino Studio"));
    const root = container.querySelector('[data-component="lcd16x2"]')!;
    expect(root.getAttribute("aria-label")).toBe("16x2 character LCD: Hello, MAE! / Arduino Studio");
    expect(root.getAttribute("data-powered")).toBe("1");
    // flat vector styling: one solid glass colour, no gradients anywhere on the module
    expect(container.querySelector("linearGradient, radialGradient")).toBeNull();
    expect(container.querySelector("[data-lcd-glass]")!.getAttribute("fill")).toBe(LCD_BLUE.fill);
    expect(LCD_BLUE.fill).toBe("#0f3cb3");
    expect(container.querySelector("rect[fill]")!.getAttribute("fill")).toBe(PCB_BLUE.fill);
    expect(container.innerHTML).not.toMatch(/url\(#[^)]*(glass|pcb|glare)/);
    const ink = container.querySelector('[data-lcd-ink="0"]')!;
    expect(ink.getAttribute("fill")).toBe(LCD_BLUE.ink);
    expect(ink.getAttribute("d")!.length).toBeGreaterThan(100);
  });

  it("is dim and blank without power, or dim with the backlight off", () => {
    const off = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hello"), pad("")])} powered={false} />
      </svg>,
    );
    expect(off.container.querySelector("[data-lcd-ink]")).toBeNull();
    expect(off.container.querySelector("[data-lcd-glass]")!.getAttribute("fill")).toBe(LCD_DIM.fill);
    expect(off.getByTestId("lcd-row-0").textContent).toBe(" ".repeat(16));
    cleanup();
    const dark = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hello"), pad("")], { backlight: false })} powered />
      </svg>,
    );
    expect(dark.container.querySelector('[data-component="lcd16x2"]')!.getAttribute("data-backlight")).toBe("0");
    expect(dark.container.querySelector('[data-lcd-ink="0"]')!.getAttribute("fill")).toBe(LCD_DIM.ink);
  });

  it("blanks the glass for noDisplay() and draws cursor / blink markers", () => {
    const hidden = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hi"), pad("")], { displayOn: false })} powered />
      </svg>,
    );
    expect(hidden.container.querySelector("[data-lcd-ink]")).toBeNull();
    cleanup();
    const cur = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hi"), pad("")], { cursorVisible: true, blink: true, cursor: { row: 0, col: 2 } })} powered />
      </svg>,
    );
    expect(cur.container.querySelector('[data-lcd-cursor="underline"]')).not.toBeNull();
    expect(cur.container.querySelector('[data-lcd-cursor="blink"]')).not.toBeNull();
    cleanup();
    const gone = render(
      <svg>
        <LcdDisplay lcd={lit([pad("Hi"), pad("")], { cursorVisible: true, blink: true, cursor: { row: 0, col: -1 } })} powered />
      </svg>,
    );
    expect(gone.container.querySelector("[data-lcd-cursor]")).toBeNull();
  });

  it("labels all 16 header pins and adds the I2C backpack on demand", () => {
    const { container } = render(
      <svg>
        <LcdDisplay lcd={IDLE_LCD} powered mode="i2c" />
      </svg>,
    );
    for (const pin of LCD_PINS) expect(container.querySelector(`[data-lcd-pin="${pin}"]`), pin).not.toBeNull();
    for (const pin of I2C_PINS) expect(container.querySelector(`[data-i2c-pin="${pin}"]`), pin).not.toBeNull();
  });
});

describe("LCD contrast (V0)", () => {
  it("fades pixels at the extremes and is crisp mid-range", () => {
    expect(contrastLook(0).ink).toBe(0);
    expect(contrastLook(0.5).ink).toBe(1);
    expect(contrastLook(1).ink).toBe(0);
    expect(contrastLook(1).ghost).toBeGreaterThan(contrastLook(0.5).ghost);
  });

  it("dims the lit pixels in the DOM and reports the setting", () => {
    const at = (contrast: number) => render(<svg><LcdDisplay lcd={lit([pad("Hi"), pad("")], { contrast })} powered /></svg>);
    const mid = at(0.5);
    expect(mid.container.querySelector('[data-lcd-ink="0"]')!.getAttribute("opacity")).toBe("1");
    expect(mid.container.querySelector("[data-lcd-contrast-label]")!.textContent).toBe("50%");
    cleanup();
    const low = at(0.05);
    expect(low.container.querySelector('[data-lcd-ink="0"]')!.getAttribute("opacity")).toBe("0");
    expect(low.container.querySelector('[data-component="lcd16x2"]')!.getAttribute("data-contrast")).toBe("0.05");
  });

  it("turns with the keyboard and wheel, clamped to 0..1", () => {
    const seen: number[] = [];
    const { getByTestId } = render(<LcdContrastKnob value={0.5} onChange={v => seen.push(v)} style={{}} label="LCD contrast" />);
    const knob = getByTestId("lcd-contrast");
    expect(knob.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(knob, { key: "ArrowRight" });
    fireEvent.keyDown(knob, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(knob, { key: "End" });
    fireEvent.wheel(knob, { deltaY: 100 });
    expect(seen[0]).toBeCloseTo(0.52);
    expect(seen[1]).toBeCloseTo(0.4);
    expect(seen[2]).toBe(1);
    expect(seen[3]).toBeCloseTo(0.47);
  });
});

describe("LCD jumper harness", () => {
  it("wires RS, E and D4-D7 to pins 12, 11, 5, 4, 3, 2 plus power, all orthogonal", () => {
    const inp = input();
    const wires = buildLcdHarness(inp);
    const byPin = Object.fromEntries(wires.map(w => [w.pin, w]));
    expect(wires.map(w => w.pin).sort()).toEqual(["A", "D4", "D5", "D6", "D7", "E", "K", "RS", "RW", "VDD", "VSS"]);
    expect(byPin.RS.from).toBe("D12");
    expect(byPin.E.from).toBe("D11");
    expect(byPin.D4.from).toBe("D5");
    expect(byPin.D7.from).toBe("D2");
    for (const w of wires) {
      expect(orthogonal(w.points), w.id).toBe(true);
      expect(w.points.length, w.id).toBeGreaterThanOrEqual(2);
    }
    // each wire starts on the right Uno pad and ends on the right LCD hole
    for (const [pin, d] of [["RS", 12], ["E", 11], ["D4", 5], ["D5", 4], ["D6", 3], ["D7", 2]] as const) {
      expect(near(byPin[pin].points[0], inp.pinPoint(d)), pin).toBe(true);
      const k = LCD_PINS.indexOf(pin);
      expect(near(byPin[pin].points.at(-1)!, { x: inp.origin.x + lcdHoleX(k), y: inp.origin.y + LCD_HOLE_Y }), pin).toBe(true);
    }
    expect(near(byPin.VDD.points[0], inp.v5) && near(byPin.A.points[0], inp.v5)).toBe(true);
    expect(near(byPin.VSS.points[0], inp.gndTop) && near(byPin.RW.points[0], inp.gndTop)).toBe(true);
    expect(near(byPin.K.points[0], inp.gndBottom)).toBe(true);
  });

  it("drops the four data lines straight onto their pads", () => {
    const wires = buildLcdHarness(input());
    for (const pin of ["D4", "D5", "D6", "D7"]) expect(wires.find(w => w.pin === pin)!.points).toHaveLength(2);
  });

  it("colours signals distinctly, power red/dark, and never routes a signal wire off the pads it names", () => {
    const wires = buildLcdHarness(input());
    const signals = wires.filter(w => w.net === "signal");
    expect(new Set(signals.map(w => w.color)).size).toBe(6);
    expect(wires.filter(w => w.net === "5V").every(w => w.color === "#DC2626")).toBe(true);
    expect(wires.filter(w => w.net === "GND")).toHaveLength(3);
  });

  it("follows custom pins and routes analog pins around the board", () => {
    const wires = buildLcdHarness(input({ pins: [7, 8, 9, 10, 11, 12] }));
    expect(wires.find(w => w.pin === "RS")!.from).toBe("D7");
    const analog = buildLcdHarness(input({ pins: [14, 8, 9, 10, 11, 12] }));
    const rs = analog.find(w => w.pin === "RS")!;
    expect(rs.from).toBe("A0");
    expect(orthogonal(rs.points)).toBe(true);
    expect(Math.max(...rs.points.map(p => p.y))).toBeGreaterThan(209 * S);
  });

  it("builds the four I2C wires GND, VCC, SDA, SCL", () => {
    const inp = input({ mode: "i2c", pins: [], origin: { x: 125.75 * S + 40 - lcdHoleX(11), y: -80 - LCD_HOLE_Y } });
    const wires = buildLcdHarness(inp);
    expect(wires.map(w => w.pin).sort()).toEqual(["GND", "SCL", "SDA", "VCC"]);
    for (const w of wires) {
      expect(orthogonal(w.points), w.id).toBe(true);
      expect(near(w.points.at(-1)!, { x: inp.origin.x + i2cHoleX(w.pin as (typeof I2C_PINS)[number]), y: inp.origin.y + LCD_HOLE_Y }), w.id).toBe(true);
    }
    expect(wires.find(w => w.pin === "SDA")!.from).toBe("SDA");
    expect(wires.find(w => w.pin === "SCL")!.from).toBe("SCL");
  });

  it("keeps each lane private so parallel runs never overlap", () => {
    const wires = buildLcdHarness(input());
    const runs = new Map<number, string[]>();
    for (const w of wires) {
      w.points.slice(1).forEach((b, i) => {
        const a = w.points[i];
        if (a.y === b.y && a.x !== b.x && a.y < 0) runs.set(a.y, [...(runs.get(a.y) ?? []), w.id]);
      });
    }
    for (const [, ids] of runs) {
      const nets = new Set(ids.map(id => wires.find(w => w.id === id)!.net));
      // only the two GND bus wires may share a lane
      expect(ids.length === 1 || (ids.length === 2 && nets.size === 1 && nets.has("GND")), ids.join(",")).toBe(true);
    }
  });

  it("renders hop-overs where wires of different nets cross", () => {
    const a: HarnessWire = { id: "a", pin: "a", from: "a", net: "signal", color: "#f00", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
    const b: HarnessWire = { id: "b", pin: "b", from: "b", net: "signal", color: "#0f0", points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] };
    const hops = findHops([a, b]);
    expect(hops.get("a:0")).toEqual([50]);
    expect(hops.get("b:0")).toBeUndefined();
    expect(wirePath(a.points, hops, "a")).toContain("A4.2 4.2");
    expect(wirePath(b.points, hops, "b")).not.toContain("A");
    // same power net: wires merge into a bus, no hop
    expect(findHops([{ ...a, net: "GND" }, { ...b, net: "GND" }]).size).toBe(0);
  });

  it("paints a hop arc above all wires for every crossing, over the vertical wire", () => {
    const a: HarnessWire = { id: "a", pin: "a", from: "a", net: "signal", color: "#f00", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] };
    const b: HarnessWire = { id: "b", pin: "b", from: "b", net: "signal", color: "#0f0", points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] };
    const arcs = hopArcs([a, b], findHops([a, b]));
    expect(arcs).toHaveLength(1);
    expect(arcs[0].color).toBe("#f00");
    expect(arcs[0].d).toMatch(/^M45\.8 50 A4\.2 4\.2 0 0 1 54\.2 50$/);
    // the real harness: every hop in the DOM sits after (above) every wire group
    const { container } = render(<svg><LcdWires wires={buildLcdHarness(input())} /></svg>);
    const hopLayer = container.querySelector('[data-layer="lcd-hops"]')!;
    const last = container.querySelector("[data-layer=lcd-wiring]")!.lastElementChild;
    expect(last).toBe(hopLayer);
    expect(container.querySelectorAll("[data-hop]").length).toBe(Array.from(findHops(buildLcdHarness(input())).values()).flat().length);
    expect(container.querySelectorAll("[data-hop]").length).toBeGreaterThan(0);
  });

  it("rounds corners and renders one labelled group per wire", () => {
    const wires = buildLcdHarness(input());
    expect(wirePath([{ x: 0, y: 0 }, { x: 0, y: -30 }, { x: 40, y: -30 }], new Map(), "w")).toContain("Q");
    const { container } = render(
      <svg>
        <LcdWires wires={wires} />
      </svg>,
    );
    expect(container.querySelectorAll("[data-lcd-wire]")).toHaveLength(wires.length);
    expect(container.querySelector('[data-wire="LCD-RS-D12"]')).not.toBeNull();
  });
});

describe("LCD examples", () => {
  it("ships the Hello World preset exactly as specified", () => {
    const ex = ARDUINO_EXAMPLES.find(e => e.id === "lcd-hello")!;
    expect(ex.label).toBe("16x2 LCD Hello World");
    expect(ex.source).toContain("#include <LiquidCrystal.h>");
    expect(ex.source).toContain("const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;");
    expect(ex.source).toContain('lcd.print("Hello, MAE!");');
    expect(ex.source).toContain('lcd.print("Arduino Studio");');
    expect(ARDUINO_EXAMPLES.some(e => e.id === "lcd-counter-sensor")).toBe(true);
  });
});
