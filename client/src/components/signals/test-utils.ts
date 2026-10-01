import { SignalsEngineError, setSignalsTransport, type SignalsTransport } from '@/services/signalsClient';
import { handleSignals } from '../../../../api/_lib/signals/handler';

/**
 * Test-only stand-in for the HTTP round trip: the same handler, the same JSON and the same Zod validation
 * the deployed function runs, without a network. Never imported by production code.
 */
export const inProcessSignalsTransport: SignalsTransport = async body => {
  const response = await handleSignals(new Request('http://x/api/signals/transform', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new SignalsEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};

/** Routes every signals request of the current test file through the in-process handler. */
export const installInProcessSignalsApi = (): void => setSignalsTransport(inProcessSignalsTransport);
export const uninstallInProcessSignalsApi = (): void => setSignalsTransport(null);
