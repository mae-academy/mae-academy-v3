import { ControlEngineError, setControlTransport, type ControlTransport } from '@/services/controlClient';
import { handleControl } from '../../../../api/_lib/control/handler';

/** Test-only stand-in for the HTTP round trip: same handler, JSON and Zod validation as the deployed function. */
export const inProcessControlTransport: ControlTransport = async body => {
  const response = await handleControl(new Request('http://x/api/control/solve', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new ControlEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};
export const installInProcessControlApi = (): void => setControlTransport(inProcessControlTransport);
export const uninstallInProcessControlApi = (): void => setControlTransport(null);
