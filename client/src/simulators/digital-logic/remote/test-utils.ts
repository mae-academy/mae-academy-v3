import { LogicEngineError, setLogicTransport, type LogicTransport } from '@/services/logicClient';
import { handleLogic } from '../../../../../api/_lib/logic/handler';

/**
 * Test-only stand-in for the HTTP round trip: the same handler, the same JSON and the same Zod validation
 * the deployed function runs, without a network. Never imported by production code.
 */
export const inProcessLogicTransport: LogicTransport = async body => {
  const response = await handleLogic(new Request('http://x/api/logic/solve', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new LogicEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};

/** Routes every logic request of the current test file through the in-process handler. */
export const installInProcessLogicApi = (): void => setLogicTransport(inProcessLogicTransport);
export const uninstallInProcessLogicApi = (): void => setLogicTransport(null);

/** Lets pending promise callbacks (and the handler's stream reads) finish. */
export const settle = async (rounds = 6): Promise<void> => {
  for (let i = 0; i < rounds; i++) await new Promise(resolve => setTimeout(resolve, 0));
};
