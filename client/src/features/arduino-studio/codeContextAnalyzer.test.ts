import { describe, expect, it } from "vitest";
import { analyzeSensorContext, nameTokens, stripNoise, EMPTY_SENSOR_CONTEXT } from "./codeContextAnalyzer";
import { ARDUINO_EXAMPLES } from "./arduinoExamples";

const ctx = (body: string) => analyzeSensorContext(body);

describe("nameTokens", () => {
  it("splits camelCase, snake_case and acronyms", () => {
    expect(nameTokens("lm35Pin")).toEqual(["lm35", "pin"]);
    expect(nameTokens("LIGHT_LEVEL")).toEqual(["light", "level"]);
    expect(nameTokens("pirState")).toEqual(["pir", "state"]);
    expect(nameTokens("IRSensor")).toEqual(["ir", "sensor"]);
  });
});

describe("stripNoise", () => {
  it("blanks comments and strings but keeps line structure", () => {
    const out = stripNoise('int a; // pir motion\n/* ldr\nlux */ Serial.println("temperature");');
    expect(out).not.toMatch(/pir|ldr|lux|temperature/);
    expect(out.split("\n")).toHaveLength(3);
  });
});

describe("analyzeSensorContext", () => {
  it("finds nothing in a plain sketch", () => {
    expect(ctx("void setup(){} void loop(){}")).toEqual(EMPTY_SENSOR_CONTEXT);
    expect(ctx("void loop(){ int val = analogRead(A0); Serial.println(val); }")).toEqual(EMPTY_SENSOR_CONTEXT);
  });

  it("ignores words that only live in comments or strings", () => {
    expect(ctx('// ldr light lux pir motion\nvoid loop(){ int v = analogRead(A0); Serial.println("temperature"); }')).toEqual(EMPTY_SENSOR_CONTEXT);
  });

  describe("ultrasonic", () => {
    it("resolves pins from pulseIn and the trig constant", () => {
      const r = ctx(`const int trigPin = 7; const int echoPin = 8;
        void loop(){ digitalWrite(trigPin, HIGH); long duration = pulseIn(echoPin, HIGH); float distance = duration * 0.034 / 2; }`);
      expect(r.ultrasonic).toEqual({ trig: 7, echo: 8 });
    });
    it("defaults to trig 9 / echo 10", () => {
      expect(ctx("void loop(){ long d = pulseIn(10, HIGH); }").ultrasonic).toEqual({ trig: 9, echo: 10 });
      expect(ctx("void loop(){ float cm = t * 0.0343 / 2; }").ultrasonic).toEqual({ trig: 9, echo: 10 });
    });
    it("moves the default trigger off the echo pin", () => {
      expect(ctx("void loop(){ long d = pulseIn(9, HIGH); }").ultrasonic).toEqual({ trig: 11, echo: 9 });
    });
    it("recognises #define pins and duration + distance variables", () => {
      const r = ctx(`#define TRIG 5\n#define ECHO 6\nlong duration; int distance;\nvoid loop(){ distance = duration / 58; }`);
      expect(r.ultrasonic).toEqual({ trig: 5, echo: 6 });
    });
    it("does not fire on a lone `distance` variable", () => {
      expect(ctx("int distance = 5; void loop(){ distance++; }").ultrasonic).toBeNull();
    });
  });

  describe("LDR", () => {
    it("maps a light-named variable to its channel", () => {
      expect(ctx("void loop(){ int ldrValue = analogRead(A2); }").analog).toEqual({ 2: "ldr" });
      expect(ctx("const int lightPin = A0; void loop(){ int v = analogRead(lightPin); }").analog).toEqual({ 0: "ldr" });
      expect(ctx("void loop(){ int lux = analogRead(1); }").analog).toEqual({ 1: "ldr" });
    });
    it("uses names elsewhere in the sketch for a lone anonymous channel", () => {
      expect(ctx("void loop(){ int v = analogRead(A0); bool night = v < 300; }").analog).toEqual({ 0: "ldr" });
      expect(ctx("void loop(){ int v = analogRead(A0); int lightLevel = v / 4; }").analog).toEqual({ 0: "ldr" });
    });
    it("does not take a traffic light's timing pot for a photoresistor", () => {
      expect(ctx("int lightState = 0; void loop(){ int v = analogRead(A0); lightState = v; }").analog).toEqual({});
    });
  });

  describe("LM35", () => {
    it("recognises the 5/1023*100 formula on an anonymous channel", () => {
      expect(ctx("void loop(){ int v = analogRead(A1); float c = (v * 5.0 / 1023.0) * 100.0; }").analog).toEqual({ 1: "lm35" });
    });
    it("recognises millivolt maths and temperature names", () => {
      expect(ctx("void loop(){ int v = analogRead(A3); float mv = v * 4.88; float c = mv / 10.0; }").analog).toEqual({ 3: "lm35" });
      expect(ctx("void loop(){ int tempReading = analogRead(A0); }").analog).toEqual({ 0: "lm35" });
    });
    it("does not read a volts*100 plotter scale as a thermometer", () => {
      expect(ctx("void loop(){ int raw = analogRead(A0); float volts = raw * (5.0 / 1023.0); Serial.println(volts * 100.0); }").analog).toEqual({});
    });
  });

  it("classifies two analog channels independently", () => {
    expect(ctx("void loop(){ int ldr = analogRead(A0); int temp = analogRead(A1); }").analog).toEqual({ 0: "ldr", 1: "lm35" });
  });

  describe("PIR", () => {
    it("takes the pin from the PIR constant", () => {
      expect(ctx("const int pirPin = 7; void loop(){ if (digitalRead(pirPin)) {} }").pir).toBe(7);
    });
    it("falls back to the single digitalRead pin, then to pin 2", () => {
      expect(ctx("int motionDetected = 0; void loop(){ motionDetected = digitalRead(6); }").pir).toBe(6);
      expect(ctx("int pirState = LOW; void loop(){}").pir).toBe(2);
    });
  });

  describe("IR obstacle", () => {
    it("takes the pin from the sensor constant and defaults to 3", () => {
      expect(ctx("const int irPin = 4; void loop(){ if (digitalRead(irPin) == LOW) {} }").ir).toBe(4);
      expect(ctx("bool obstacle = false; void loop(){}").ir).toBe(3);
    });
    it("is not triggered by an ordinary active-low pull-up button", () => {
      expect(ctx("const int buttonPin = 2; void setup(){ pinMode(buttonPin, INPUT_PULLUP);} void loop(){ if (digitalRead(buttonPin) == LOW) {} }").ir).toBeNull();
    });
  });

  it("keeps PIR and IR on different pins when both default", () => {
    const r = ctx("int pirState; int obstacle; void loop(){}");
    expect(r.pir).toBe(2);
    expect(r.ir).toBe(3);
  });
});

describe("bundled examples", () => {
  const byId = (id: string) => ARDUINO_EXAMPLES.find(e => e.id === id)!;
  it("mount exactly the sensor each sensor example advertises", () => {
    expect(analyzeSensorContext(byId("hcsr04-distance").source).ultrasonic).toEqual({ trig: 9, echo: 10 });
    expect(analyzeSensorContext(byId("ldr-night-lamp").source).analog).toEqual({ 0: "ldr" });
    expect(analyzeSensorContext(byId("lm35-thermometer").source).analog).toEqual({ 1: "lm35" });
    expect(analyzeSensorContext(byId("pir-alarm").source).pir).toBe(2);
    expect(analyzeSensorContext(byId("ir-obstacle-counter").source).ir).toBe(3);
  });
  it("leaves every other example a plain potentiometer / button / LED circuit", () => {
    const sensorIds = new Set(["hcsr04-distance", "ldr-night-lamp", "lm35-thermometer", "pir-alarm", "ir-obstacle-counter"]);
    for (const ex of ARDUINO_EXAMPLES.filter(e => !sensorIds.has(e.id))) {
      expect(analyzeSensorContext(ex.source), ex.label).toEqual(EMPTY_SENSOR_CONTEXT);
    }
  });
});
