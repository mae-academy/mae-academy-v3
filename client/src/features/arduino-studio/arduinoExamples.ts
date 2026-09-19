export interface ArduinoExample {
  id: string;
  label: string;
  source: string;
  /** External LED colours keyed by digital pin (defaults to red). */
  ledColors?: Record<number, string>;
}

export const DEFAULT_SKETCH = `#include <Arduino.h>

void setup() {
  // put your setup code here, to run once:
}

void loop() {
  // put your main code here, to run repeatedly:
}
`;

export const ARDUINO_EXAMPLES: readonly ArduinoExample[] = [
  {
    id: "blink",
    label: "Blink Built-in LED",
    source: `#include <Arduino.h>

// Blinks the built-in "L" LED (pin 13) once per second.
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED ON");
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
`,
  },
  {
    id: "button-toggle",
    label: "Digital Button Toggle",
    source: `#include <Arduino.h>

// Flip the D2 switch on the board: each press toggles the L LED.
const int buttonPin = 2;
const int ledPin = LED_BUILTIN;
int ledState = LOW;
int lastButton = LOW;

void setup() {
  pinMode(buttonPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int reading = digitalRead(buttonPin);
  if (reading == HIGH && lastButton == LOW) {
    ledState = !ledState;
    digitalWrite(ledPin, ledState);
    Serial.print("LED is ");
    Serial.println(ledState ? "ON" : "OFF");
  }
  lastButton = reading;
  delay(10);
}
`,
  },
  {
    id: "analog-read",
    label: "Potentiometer Voltage Divider",
    source: `#include <Arduino.h>

// Drag the A0 slider on the board; the reading is streamed to the plotter.
const int potPin = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(potPin);
  float volts = raw * (5.0 / 1023.0);
  Serial.print("raw:");
  Serial.print(raw);
  Serial.print(",volts:");
  Serial.println(volts * 100.0);
  delay(50);
}
`,
  },
  {
    id: "pwm-fade",
    label: "PWM LED Fading",
    source: `#include <Arduino.h>

// Fades an LED on PWM pin 9 (analogWrite duty 0-255).
const int ledPin = 9;
int brightness = 0;
int fadeAmount = 5;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  analogWrite(ledPin, brightness);
  Serial.println(brightness);
  brightness = brightness + fadeAmount;
  if (brightness <= 0 || brightness >= 255) {
    fadeAmount = -fadeAmount;
  }
  delay(30);
}
`,
  },
  {
    id: "external-led",
    label: "External LED Blink & Toggle",
    source: `#include <Arduino.h>

// D2 (Digital Input) starts/stops the blink of the external LED on D8.
// Circuit: D8 -> LED -> 220 ohm resistor -> GND.
const int buttonPin = 2;
const int ledPin = 8;
bool blinking = true;
int ledState = LOW;
int lastButton = LOW;
unsigned long lastToggle = 0;

void setup() {
  pinMode(buttonPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int reading = digitalRead(buttonPin);
  if (reading == HIGH && lastButton == LOW) {
    blinking = !blinking;
    Serial.println(blinking ? "Blinking ON" : "Blinking OFF");
    if (!blinking) digitalWrite(ledPin, LOW);
  }
  lastButton = reading;

  if (blinking && millis() - lastToggle >= 500) {
    lastToggle = millis();
    ledState = !ledState;
    digitalWrite(ledPin, ledState);
  }
  delay(5);
}
`,
  },
  {
    id: "sine-plotter",
    label: "Multi-Channel Math Telemetry",
    source: `#include <Arduino.h>

// Streams several math signals (sin, cos, sawtooth) to the Serial Plotter.
float phase = 0.0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  float a = sin(phase);
  float b = cos(phase);
  float saw = phase / TWO_PI;
  Serial.print("sin:");
  Serial.print(a);
  Serial.print(",cos:");
  Serial.print(b);
  Serial.print(",saw:");
  Serial.println(saw);
  phase += 0.15;
  if (phase > TWO_PI) phase -= TWO_PI;
  delay(20);
}
`,
  },
  {
    id: "ultrasonic",
    label: "Ultrasonic Sensor Simulation (HC-SR04)",
    source: `#include <Arduino.h>

// HC-SR04 model: the A0 slider stands in for the echo pulse width (pulseIn result).
// distance = duration * speed_of_sound / 2  (0.0343 cm/us)
const int trigPin = 9;
const int warnPin = LED_BUILTIN;

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(warnPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // 10 us trigger pulse
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  // Simulated echo time: 116 us (2 cm) .. 23200 us (400 cm)
  long duration = map(analogRead(A0), 0, 1023, 116, 23200);
  float distance = duration * 0.0343 / 2.0;

  digitalWrite(warnPin, distance < 50.0 ? HIGH : LOW);
  Serial.print("distance_cm:");
  Serial.print(distance, 1);
  Serial.print(",threshold:");
  Serial.println(50);
  delay(100);
}
`,
  },
  {
    id: "traffic-light",
    ledColors: { 8: "#ef4444", 9: "#f59e0b", 10: "#22c55e" },
    label: "Traffic Light Controller",
    source: `#include <Arduino.h>

// Non-blocking state machine: RED (pin 8) -> GREEN (pin 10) -> YELLOW (pin 9) -> RED ...
enum State { RED, GREEN, YELLOW };

const int redPin = 8;
const int yellowPin = 9;
const int greenPin = 10;

State state = RED;
unsigned long lastChange = 0;

unsigned long durationFor(State s) {
  switch (s) {
    case RED: return 4000;
    case GREEN: return 3000;
    default: return 1000;
  }
}

void showState(State s) {
  digitalWrite(redPin, s == RED);
  digitalWrite(yellowPin, s == YELLOW);
  digitalWrite(greenPin, s == GREEN);
}

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(yellowPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  Serial.begin(9600);
  showState(state);
}

void loop() {
  if (millis() - lastChange >= durationFor(state)) {
    lastChange = millis();
    if (state == RED) state = GREEN;
    else if (state == GREEN) state = YELLOW;
    else state = RED;
    showState(state);
    Serial.print("t=");
    Serial.print(millis() / 1000);
    Serial.print("s state=");
    Serial.println(state == RED ? "RED" : state == GREEN ? "GREEN" : "YELLOW");
  }
  delay(10);
}
`,
  },
  {
    id: "rgb-mixer",
    label: "Multi-Channel PWM Controller (RGB Mixer)",
    ledColors: { 9: "#EF4444", 10: "#22C55E", 11: "#3B82F6" },
    source: `#include <Arduino.h>

// 3 Potentiometers controlling 3 PWM LEDs
const int pot1 = A0; const int led1 = 9;
const int pot2 = A1; const int led2 = 10;
const int pot3 = A2; const int led3 = 11;

void setup() {
  pinMode(led1, OUTPUT);
  pinMode(led2, OUTPUT);
  pinMode(led3, OUTPUT);
}

void loop() {
  int val1 = analogRead(pot1);
  int val2 = analogRead(pot2);
  int val3 = analogRead(pot3);

  analogWrite(led1, val1 / 4);
  analogWrite(led2, val2 / 4);
  analogWrite(led3, val3 / 4);

  delay(15);
}
`,
  },
  {
    id: "bar-graph",
    label: "LED Bar Graph (VU Meter)",
    ledColors: { 2: "#22C55E", 3: "#22C55E", 4: "#F59E0B", 5: "#EF4444" },
    source: `#include <Arduino.h>

// LED Bar Graph controlled by a single potentiometer
const int analogPin = A0;
const int ledCount = 4;
int ledPins[] = {2, 3, 4, 5};

void setup() {
  for (int i = 0; i < ledCount; i++) {
    pinMode(ledPins[i], OUTPUT);
  }
}

void loop() {
  int sensorReading = analogRead(analogPin);
  int ledLevel = map(sensorReading, 0, 1023, 0, ledCount + 1);

  for (int i = 0; i < ledCount; i++) {
    if (i < ledLevel) {
      digitalWrite(ledPins[i], HIGH);
    } else {
      digitalWrite(ledPins[i], LOW);
    }
  }
  delay(20);
}
`,
  },
  {
    id: "threshold-alarm",
    label: "Adjustable Threshold Alarm",
    source: `#include <Arduino.h>

// Adjustable Threshold Alarm
const int sensorPin = A0;
const int thresholdPin = A1;
const int alarmLed = 8;

void setup() {
  pinMode(alarmLed, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int sensorVal = analogRead(sensorPin);
  int thresholdVal = analogRead(thresholdPin);

  Serial.print("Sensor:");
  Serial.print(sensorVal);
  Serial.print(", Threshold:");
  Serial.println(thresholdVal);

  if (sensorVal > thresholdVal) {
    digitalWrite(alarmLed, HIGH);
  } else {
    digitalWrite(alarmLed, LOW);
  }
  delay(50);
}
`,
  },
  {
    id: "pedestrian-crossing",
    label: "Interactive Traffic Light (Pedestrian Crossing)",
    ledColors: { 13: "#EF4444", 12: "#F59E0B", 11: "#22C55E" },
    source: `#include <Arduino.h>

// Interactive Traffic Light with Pedestrian Button
const int btnPin = 2;
const int redLed = 13;
const int yellowLed = 12;
const int greenLed = 11;

void setup() {
  pinMode(btnPin, INPUT);
  pinMode(redLed, OUTPUT);
  pinMode(yellowLed, OUTPUT);
  pinMode(greenLed, OUTPUT);
}

void loop() {
  int btnState = digitalRead(btnPin);

  if (btnState == HIGH) {
    // Pedestrian pressed the button
    digitalWrite(greenLed, LOW);
    digitalWrite(yellowLed, HIGH);
    delay(1000);
    digitalWrite(yellowLed, LOW);
    digitalWrite(redLed, HIGH);
    delay(3000); // Cross time
  } else {
    // Normal state
    digitalWrite(redLed, LOW);
    digitalWrite(yellowLed, LOW);
    digitalWrite(greenLed, HIGH);
  }
  delay(50);
}
`,
  },
  {
    id: "serial-echo",
    label: "Serial Echo",
    source: `#include <Arduino.h>

// Type into the serial monitor input; characters are echoed back.
void setup() {
  Serial.begin(9600);
  Serial.println("Type something and press Send:");
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\\n' || c == '\\r') continue;
    Serial.print("You typed: ");
    Serial.println(c);
  }
  delay(10);
}
`,
  },
];
