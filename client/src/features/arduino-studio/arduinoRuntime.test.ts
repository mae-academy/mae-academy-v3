import { describe, expect, it } from "vitest";
import { compileSketch } from "../../../../api/_lib/code/arduino/arduinoCompiler";
import { ArduinoRuntime, type HardwareSnapshot } from "./arduinoRuntime";
import { ARDUINO_EXAMPLES } from "./arduinoExamples";

function run(source: string, opts: { inputs?: (rt: ArduinoRuntime) => void; ms?: number } = {}) {
  const result = compileSketch(source);
  if (!result.ok) throw new Error(`L${result.error.line}: ${result.error.message}`);
  let out = "";
  const errors: string[] = [];
  let snap: HardwareSnapshot | null = null;
  const rt = new ArduinoRuntime({
    onSnapshot: s => {
      snap = s;
    },
    onSerialOut: t => {
      out += t;
    },
    onError: m => errors.push(m),
  });
  rt.setSpeed("instant");
  rt.load(result.sketch);
  opts.inputs?.(rt);
  rt.start();
  return new Promise<{ out: string; errors: string[]; snap: HardwareSnapshot; rt: ArduinoRuntime }>(resolve =>
    setTimeout(() => {
      rt.pause();
      resolve({ out, errors, snap: rt.snapshot() ?? snap!, rt });
      rt.dispose();
    }, opts.ms ?? 60),
  );
}

describe("arduino compiler + runtime", () => {
  it("compiles every bundled example", () => {
    for (const ex of ARDUINO_EXAMPLES) {
      const r = compileSketch(ex.source);
      expect(r.ok, `${ex.label}: ${r.ok ? "" : r.error.message}`).toBe(true);
    }
  });

  it("uses 16-bit int and integer division semantics", async () => {
    const { out, errors } = await run(`
      int a = 32767;
      void setup() {
        Serial.begin(9600);
        a = a + 1;
        Serial.println(a);
        Serial.println(7 / 2);
        Serial.println(7.0 / 2);
        Serial.println(-7 % 3);
        unsigned long m = 0;
        m = m - 1;
        Serial.println(m);
        byte b = 300;
        Serial.println(b);
        Serial.println(255, HEX);
        Serial.println(3.14159, 3);
        Serial.println('A');
        Serial.println((char)66);
        Serial.println(map(512, 0, 1023, 0, 255));
        Serial.println(1 == 1);
      }
      void loop() { delay(1000); }`);
    expect(errors).toEqual([]);
    expect(out.split("\r\n").slice(0, 12)).toEqual(["-32768", "3", "3.50", "-1", "4294967295", "44", "FF", "3.142", "A", "B", "127", "1"]);
  });

  it("supports functions, arrays, loops, switch, strings", async () => {
    const { out, errors } = await run(`
      int sq(int x) { return x * x; }
      int data[5] = {1, 2, 3};
      enum Mode { IDLE, RUN = 5, STOP };
      void setup() {
        Serial.begin(9600);
        int sum = 0;
        for (int i = 0; i < 5; i++) { data[i] += i; sum += sq(data[i]); }
        Serial.println(sum);
        Serial.println(sizeof(data) / sizeof(data[0]));
        int n = 2;
        switch (n) { case 1: Serial.println("one"); break; case 2: Serial.println("two"); default: Serial.println("fall"); }
        String s = "abc";
        s += 5;
        s.toUpperCase();
        Serial.println(s + "!" + s.length());
        Serial.println(STOP);
        int k = 0;
        while (true) { if (++k >= 3) break; }
        Serial.println(k);
        Serial.println(k++ + k);
      }
      void loop() { delay(1000); }`);
    expect(errors).toEqual([]);
    expect(out.split("\r\n").slice(0, 8)).toEqual(["60", "5", "two", "fall", "ABC5!4", "6", "3", "7"]);
  });

  it("delay() does not block and advances virtual millis in instant mode", async () => {
    const { out, errors } = await run(`
      void setup() { Serial.begin(9600); }
      void loop() {
        unsigned long t = millis();
        delay(500);
        Serial.println(millis() - t);
      }`);
    expect(errors).toEqual([]);
    expect(out.startsWith("500\r\n500\r\n")).toBe(true);
  });

  it("drives pins, PWM and input registration", async () => {
    const { snap } = await run(
      `void setup() { pinMode(13, OUTPUT); pinMode(2, INPUT); pinMode(9, OUTPUT); }
       void loop() { digitalWrite(13, digitalRead(2)); analogWrite(9, analogRead(A0) / 4); delay(1); }`,
      { inputs: rt => { rt.setDigitalInput(2, 1); rt.setAnalogInput(0, 1023); } },
    );
    expect(snap.pins[13]).toMatchObject({ mode: "OUTPUT", level: 1 });
    expect(snap.pins[9].pwm).toBe(255);
    expect(snap.digitalInputs).toContain(2);
    expect(snap.analogInputs).toEqual([0]);
  });

  it("reads serial input", async () => {
    const { out } = await run(
      `void setup() { Serial.begin(9600); }
       void loop() { if (Serial.available() > 0) { int v = Serial.parseInt(); Serial.println(v * 2); } delay(1); }`,
      { inputs: rt => rt.sendSerial("21\n") },
    );
    expect(out.startsWith("42\r\n")).toBe(true);
  });

  it("reports compile diagnostics with line numbers", () => {
    const r = compileSketch("void setup() {\n  foo();\n}\nvoid loop() {}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ line: 2 });
    const missing = compileSketch("void setup() {}");
    expect(missing.ok).toBe(false);
  });

  it("surfaces runtime errors and survives busy loops", async () => {
    const oob = await run(`int a[2]; void setup() { a[5] = 1; } void loop() {}`);
    expect(oob.errors[0]).toMatch(/out of bounds/);
    const busy = await run(`void setup() {} void loop() { unsigned long t = millis(); while (millis() - t < 2000) {} }`);
    expect(busy.errors).toEqual([]);
  });
});

import { analyzeSketch } from "../../../../api/_lib/code/arduino/arduinoCompiler";
describe("static pin analysis", () => {
  it("resolves constants and classifies pins", () => {
    const u = analyzeSketch(`
      #define LEDP 9
      const int btn = 2;
      int pot = A0;
      void setup(){ pinMode(btn, INPUT_PULLUP); pinMode(LEDP, OUTPUT); pinMode(LED_BUILTIN, OUTPUT); }
      void loop(){ digitalWrite(LEDP, digitalRead(btn)); analogRead(pot); analogWrite(5, 10); }`);
    expect(u).toEqual({ digitalInputs: [2], pullups: [2], analogInputs: [0], outputs: [5, 9, 13] });
    expect(analyzeSketch("void setup( {")).toBeNull();
    const arr = analyzeSketch("int pins[] = {2, 3, 4, 5}; void setup(){ for (int i = 0; i < 4; i++) pinMode(pins[i], OUTPUT); } void loop(){ digitalWrite(pins[1], HIGH); }");
    expect(arr?.outputs).toEqual([2, 3, 4, 5]);
  });
});
