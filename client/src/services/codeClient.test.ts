import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARDUINO_EXAMPLES } from '@/features/arduino-studio/arduinoExamples';
import { ArduinoRuntime } from '@/features/arduino-studio/arduinoRuntime';
import { analyzeSketch } from '../../../api/_lib/code/arduino/arduinoCompiler';
import { toTraceSteps } from '../../../api/_lib/code/cpp/cppTrace';
import { preprocessCpp } from '../../../api/_lib/code/cpp/preprocess';
import { analyzeSketchRemote, compileSketchRemote, prepareStlRemote, traceCppRemote } from './codeClient';
import { installInProcessCodeApi, uninstallInProcessCodeApi } from './codeClient.test-utils';

beforeAll(installInProcessCodeApi);
afterAll(uninstallInProcessCodeApi);

describe('code client over the serverless engine', () => {
  it('every Arduino example compiles remotely, instantiates in the browser and its layout equals the static analysis', async () => {
    for (const example of ARDUINO_EXAMPLES) {
      const answer = await compileSketchRemote(example.source);
      expect(answer.ok, example.id).toBe(true);
      if (!answer.ok) continue;
      expect(answer.pinUsage).toEqual(analyzeSketch(example.source));
      expect(await analyzeSketchRemote(example.source)).toEqual(answer.pinUsage);
    }
  });

  it('a sketch compiled by the service runs on the client pin-bank runtime (instant speed)', async () => {
    const answer = await compileSketchRemote('void setup() { pinMode(13, OUTPUT); Serial.begin(9600); Serial.println("hi"); }\nvoid loop() { digitalWrite(13, HIGH); delay(100); }');
    if (!answer.ok) throw new Error(answer.error.message);
    const out: string[] = [];
    let last: { pins: Array<{ level: number }> } | null = null;
    const runtime = new ArduinoRuntime({ onSnapshot: (snapshot) => { last = snapshot; }, onSerialOut: (text) => out.push(text), onError: (message) => { throw new Error(message); } });
    runtime.setSpeed('instant');
    runtime.load(answer.sketch);
    runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 60));
    runtime.pause();
    expect(out.join('')).toContain('hi');
    expect(last!.pins[13].level).toBe(1);
  });

  it('syntax errors come back as a diagnostic with the offending line', async () => {
    const answer = await compileSketchRemote('void setup() {\n  int x = ;\n}\nvoid loop() {}');
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.error.line).toBe(2);
    expect(await analyzeSketchRemote('void setup( {')).toBeNull();
  });

  it('C++ trace and STL preparation equal the engine output', async () => {
    const code = '#include <vector>\n#include <iostream>\nint main() {\n  std::vector<int> v;\n  std::cout << "x\\n";\n  return 0;\n}\n';
    const outcome = { stdout: 'x\n', stderr: '', exitCode: 0 };
    expect(await traceCppRemote('cpp', code, outcome)).toEqual(JSON.parse(JSON.stringify(toTraceSteps(code, outcome))));
    expect((await prepareStlRemote(code)).code).toBe(preprocessCpp(code));
  });
});
