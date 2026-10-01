import { LogoEngineError, type LogoTransport } from '@/services/logoClient';
import { PlcEngineError, type PlcTransport } from '@/services/plcClient';
import { handleLogoEvaluate } from '../../../../../api/_lib/plc/logo/handler';
import { handleEvaluate } from '../../../../../api/_lib/plc/handler';

/**
 * Test-only stand-in for the HTTP round trip: the same handler, the same JSON and the same Zod
 * validation the deployed function runs, without a network. Never imported by production code.
 */
export const inProcessTransport: PlcTransport = async (body) => {
  const response = await handleEvaluate(new Request('http://x/api/plc/evaluate', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new PlcEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};

/** Lets pending promise callbacks and the handler's stream reads finish. */
export const settle = async (rounds = 6): Promise<void> => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** LOGO! counterpart of `inProcessTransport`: same handler and Zod validation as /api/plc/logo/evaluate. */
export const inProcessLogoTransport: LogoTransport = async (body) => {
  const response = await handleLogoEvaluate(new Request('http://x/api/plc/logo/evaluate', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new LogoEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};
