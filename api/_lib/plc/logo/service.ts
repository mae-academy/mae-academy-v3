import { z } from 'zod';
import { LOGO_PROTOCOL_VERSION, type LogoEvaluateResponse } from '../../../../shared/logo/wire';
import { LogoEvaluateRequestSchema } from '../../../plc/logo/schema';
import { compileProgram } from './compile';
import { LogoCpu } from './cpu';

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export function serveLogoEvaluate(payload: unknown): ServeResult {
  const version = (payload as { v?: unknown } | null)?.v;
  if (version !== LOGO_PROTOCOL_VERSION) {
    return { status: 400, body: { error: 'version_mismatch', expected: LOGO_PROTOCOL_VERSION, message: 'The simulator was updated; reload the page.' } };
  }
  const parsed = LogoEvaluateRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  const { program, st, ops } = parsed.data;

  const compiled = compileProgram(program);
  if (!compiled.ok) {
    const response: LogoEvaluateResponse = { v: LOGO_PROTOCOL_VERSION, ok: false, cd: [...compiled.diagnostics] };
    return { status: 200, body: { ...response } };
  }

  const cpu = new LogoCpu(compiled);
  cpu.restore(st);
  for (const op of ops) {
    switch (op.t) {
      case 'start':
        cpu.start();
        break;
      case 'stop':
        cpu.stop();
        break;
      case 'resync':
        cpu.resync();
        break;
      case 'powerLoss':
        cpu.powerLoss();
        break;
      case 'clearAll':
        cpu.clearAll();
        break;
      case 'load':
        cpu.load(compiled, op.keep);
        break;
      case 'scan': {
        const inputs = Array.from(op.inputs, (c): 0 | 1 => (c === '1' ? 1 : 0));
        for (const at of op.at) cpu.scan(at, inputs);
        break;
      }
    }
  }
  const response: LogoEvaluateResponse = { v: LOGO_PROTOCOL_VERSION, ok: true, st: cpu.snapshot() };
  return { status: 200, body: { ...response } };
}
