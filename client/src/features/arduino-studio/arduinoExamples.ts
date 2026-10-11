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
    id: "hcsr04-distance",
    label: "HC-SR04 Ultrasonic Distance Finder (Serial + LCD)",
    source: `#include <LiquidCrystal.h>

// HC-SR04 ranger: drag the distance slider on the sensor (2-400 cm).
// Trig = D9, Echo = D10. pulseIn() returns the echo time: 58.2 us per cm of range
// (sound covers 0.0343 cm/us, there and back).
const int trigPin = 9;
const int echoPin = 10;
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  Serial.begin(9600);
  lcd.begin(16, 2);
  lcd.print("Distance:");
}

void loop() {
  // 10 us trigger pulse starts a measurement
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH);
  float distance = duration / 58.2;

  Serial.print("distance_cm:");
  Serial.println(distance, 1);

  lcd.setCursor(0, 1);
  if (duration == 0) {
    lcd.print("Out of range   ");
  } else {
    lcd.print(distance, 1);
    lcd.print(" cm        ");
  }
  delay(200);
}
`,
  },
  {
    id: "ldr-night-lamp",
    label: "LDR Automatic Night Lamp",
    ledColors: { 8: "#F59E0B" },
    source: `#include <Arduino.h>

// Photoresistor on A0 (10k divider): brighter light = higher reading.
// Drag the Lux slider down below ~4 lux and the lamp on D8 switches on.
const int ldrPin = A0;
const int lampPin = 8;
const int darkLevel = 350;

void setup() {
  pinMode(lampPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int ldrValue = analogRead(ldrPin);
  bool night = ldrValue < darkLevel;
  digitalWrite(lampPin, night ? HIGH : LOW);

  Serial.print("ldr:");
  Serial.print(ldrValue);
  Serial.print(",threshold:");
  Serial.println(darkLevel);
  delay(100);
}
`,
  },
  {
    id: "lm35-thermometer",
    label: "LM35 Digital Thermometer",
    ledColors: { 7: "#EF4444" },
    source: `#include <Arduino.h>

// LM35 on A1 outputs 10 mV per degree Celsius. Drag the temperature slider;
// the warning LED on D7 lights above 30 C.
const int sensorPin = A1;
const int warnPin = 7;
const float warnAt = 30.0;

void setup() {
  pinMode(warnPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int reading = analogRead(sensorPin);
  float millivolts = reading * (5000.0 / 1023.0);
  float celsius = millivolts / 10.0;

  digitalWrite(warnPin, celsius > warnAt ? HIGH : LOW);

  Serial.print("celsius:");
  Serial.print(celsius, 1);
  Serial.print(",warn_at:");
  Serial.println(warnAt, 1);
  delay(200);
}
`,
  },
  {
    id: "pir-alarm",
    label: "PIR Intrusion Security Alarm",
    ledColors: { 8: "#EF4444" },
    source: `#include <Arduino.h>

// PIR motion sensor on D2. Press "Trigger Motion" on the sensor: its output goes HIGH for the hold time
// and the alarm LED on D8 flashes for 3 seconds after the last movement.
const int pirPin = 2;
const int alarmPin = 8;
int pirState = LOW;
unsigned long alarmUntil = 0;

void setup() {
  pinMode(pirPin, INPUT);
  pinMode(alarmPin, OUTPUT);
  Serial.begin(9600);
  Serial.println("Armed. Waiting for motion...");
}

void loop() {
  int motion = digitalRead(pirPin);

  if (motion == HIGH && pirState == LOW) {
    Serial.println("INTRUDER detected!");
    pirState = HIGH;
  } else if (motion == LOW && pirState == HIGH) {
    Serial.println("Motion ended.");
    pirState = LOW;
  }

  if (motion == HIGH) {
    alarmUntil = millis() + 3000;
  }
  if (millis() < alarmUntil) {
    digitalWrite(alarmPin, (millis() / 150) % 2);
  } else {
    digitalWrite(alarmPin, LOW);
  }
  delay(10);
}
`,
  },
  {
    id: "ir-obstacle-counter",
    label: "IR Obstacle Avoidance Counter",
    ledColors: { 8: "#22C55E" },
    source: `#include <Arduino.h>

// FC-51 infrared sensor on D3. The output is active LOW: it pulls to ground while something is
// closer than the sensitivity threshold. Move the distance slider in and out to count objects.
const int irPin = 3;
const int ledPin = 8;
int obstacleCount = 0;
int lastState = HIGH;

void setup() {
  pinMode(irPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(irPin);
  digitalWrite(ledPin, state == LOW ? HIGH : LOW);

  if (state == LOW && lastState == HIGH) {
    obstacleCount++;
    Serial.print("Obstacle #");
    Serial.println(obstacleCount);
  }
  lastState = state;
  delay(10);
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
  {
    id: "lcd-hello",
    label: "16x2 LCD Hello World",
    source: `#include <LiquidCrystal.h>

const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

void setup() {
  lcd.begin(16, 2);
  lcd.print("Hello, MAE!");
  lcd.setCursor(0, 1);
  lcd.print("Arduino Studio");
}

void loop() {
  // Static banner
}
`,
  },
  {
    id: "lcd-counter-sensor",
    label: "16x2 LCD Counter & Sensor",
    source: `#include <LiquidCrystal.h>

// Row 0 counts seconds since reset, row 1 shows the A0 potentiometer as a voltage and a bar.
const int rs = 12, en = 11, d4 = 5, d5 = 4, d6 = 3, d7 = 2;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
unsigned long seconds = 0;

void setup() {
  lcd.begin(16, 2);
  lcd.print("Uptime:");
}

void loop() {
  int raw = analogRead(A0);
  float volts = raw * 5.0 / 1023.0;

  lcd.setCursor(8, 0);
  lcd.print(seconds);
  lcd.print("s   ");

  lcd.setCursor(0, 1);
  lcd.print(volts, 2);
  lcd.print("V ");
  int bars = map(raw, 0, 1023, 0, 10);
  for (int i = 0; i < 10; i++) {
    lcd.write(i < bars ? '#' : '.');
  }

  delay(1000);
  seconds++;
}
`,
  },
];
