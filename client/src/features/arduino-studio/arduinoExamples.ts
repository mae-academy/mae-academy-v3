export interface ArduinoExample {
  id: string;
  label: string;
  source: string;
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
    label: "Blink LED",
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
    id: "analog-read",
    label: "Analog Read (Potentiometer)",
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
    label: "PWM Fading",
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
  {
    id: "sine-plotter",
    label: "Sine Wave Plotter",
    source: `#include <Arduino.h>

// Prints two phase-shifted waves for the Serial Plotter.
float phase = 0.0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  float a = sin(phase);
  float b = cos(phase);
  Serial.print(a);
  Serial.print(",");
  Serial.println(b);
  phase += 0.15;
  if (phase > TWO_PI) phase -= TWO_PI;
  delay(20);
}
`,
  },
];
