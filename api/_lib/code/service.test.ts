import { describe, expect, it } from 'vitest';
import { analyzeSketch, compileSketchToJs } from './arduino/arduinoCompiler';
import { toTraceSteps } from './cpp/cppTrace';
import { preprocessCpp } from './cpp/preprocess';
import { handleCode } from './handler';
import { serveCode } from './service';

const ask = (domain: string, request: Record<string, unknown>) => serveCode({ domain, request });
const body = (domain: string, request: Record<string, unknown>) => ask(domain, request).body as Record<string, any>;

const BLINK = 'const int led = 13;\nvoid setup() { pinMode(led, OUTPUT); }\nvoid loop() { digitalWrite(led, HIGH); delay(500); digitalWrite(led, LOW); delay(500); }\n';
const PROGRAM = '#include <iostream>\nusing namespace std;\nint main() {\n  cout << "a" << endl;\n  cout << "b" << endl;\n  return 0;\n}\n';

describe('serveCode · arduino', () => {
  it('compile-sketch returns the generated JavaScript and the pin layout, identical to the compiler', () => {
    const res = body('arduino', { op: 'compile-sketch', source: BLINK });
    const direct = compileSketchToJs(BLINK);
    expect(res.ok).toBe(true);
    expect(direct.ok && res.js).toBe(direct.ok ? direct.js : null);
    expect(res.pinUsage).toEqual(analyzeSketch(BLINK));
    expect(res.pinUsage.outputs).toEqual([13]);
  });
  it('reports a syntax error as a line-numbered diagnostic, not an HTTP error', () => {
    const res = ask('arduino', { op: 'compile-sketch', source: 'void setup( {' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, diagnostic: { line: expect.any(Number), message: expect.any(String) } });
    expect(body('arduino', { op: 'compile-sketch', source: 'void setup() { foo(); }\nvoid loop() {}' }).ok).toBe(false);
  });
});

describe('serveCode · cpp-trace and preprocess', () => {
  it('trace-execution equals toTraceSteps for a finished run', () => {
    const outcome = { stdout: 'a\nb\n', stderr: '', exitCode: 0 };
    const res = body('cpp-trace', { op: 'trace-execution', language: 'cpp', code: PROGRAM, outcome });
    expect(res.steps).toEqual(JSON.parse(JSON.stringify(toTraceSteps(PROGRAM, outcome))));
    expect(res.totalSteps).toBe(res.steps.length);
    expect(res.steps.at(-1).stdout).toContain('[Process exited with code 0]');
  });
  it('caps the trace at maxSteps (≤ 2000), keeping the opening frames and the terminating frame with the final output', () => {
    const statements = Array.from({ length: 3000 }, (_, i) => `  int v${i} = ${i};`).join('\n');
    const code = `int main() {\n${statements}\n  return 0;\n}\n`;
    const res = body('cpp-trace', { op: 'trace-execution', language: 'c', code, outcome: { stdout: '', stderr: '', exitCode: 0 }, maxSteps: 50 });
    expect(res.steps).toHaveLength(50);
    expect(res.steps.map((s: { stepIndex: number }) => s.stepIndex)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(res.steps.at(-1).stdout).toContain('[Process exited with code 0]');
    expect(ask('cpp-trace', { op: 'trace-execution', language: 'c', code, outcome: { stdout: '', stderr: '', exitCode: 0 }, maxSteps: 2001 }).status).toBe(400);
  });
  it('prepare-stl rewrites range-for and monomorphises containers, and lists the headers', () => {
    const code = '#include <vector>\n#include <iostream>\nint main(){ std::vector<int> v; for (int x : v) { } }\n';
    const res = body('preprocess', { op: 'prepare-stl', code });
    expect(res.code).toBe(preprocessCpp(code));
    expect(res.code).not.toContain('for (int x : v)');
    expect(res.headers).toEqual(['vector', 'iostream']);
  });
});

describe('request validation and the HTTP handler', () => {
  const post = (text: string) => handleCode(new Request('http://x/api/code/process', { method: 'POST', body: text }));
  it('rejects oversized source, bad shapes and unknown operations with 400', () => {
    expect(ask('arduino', { op: 'compile-sketch', source: 'x'.repeat(64 * 1024 + 1) }).status).toBe(400);
    expect(ask('arduino', { op: 'compile-sketch', source: '' }).status).toBe(400);
    expect(ask('arduino', { op: 'step-runtime', source: BLINK }).status).toBe(400);
    expect(ask('cpp-trace', { op: 'trace-execution', language: 'rust', code: PROGRAM, outcome: { stdout: '', stderr: '', exitCode: 0 } }).status).toBe(400);
    expect(ask('cpp-trace', { op: 'trace-execution', language: 'c', code: PROGRAM, outcome: { stdout: 'x'.repeat(256 * 1024 + 1), stderr: '', exitCode: 0 } }).status).toBe(400);
    expect(ask('nope', { op: 'x' }).status).toBe(400);
  });
  it('rejects non-POST, bad JSON and oversized bodies; reports server time', async () => {
    expect((await handleCode(new Request('http://x/', { method: 'GET' }))).status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post('x'.repeat(600 * 1024))).status).toBe(413);
    const ok = await post(JSON.stringify({ domain: 'arduino', request: { op: 'compile-sketch', source: BLINK } }));
    expect(typeof (await ok.json()).ms).toBe('number');
  });
});
