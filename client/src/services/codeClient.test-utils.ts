import { CodeEngineError, setCodeTransport, type CodeTransport } from '@/services/codeClient';
import { handleCode } from '../../../api/_lib/code/handler';

/** Test-only stand-in for the HTTP round trip: same handler, JSON and Zod validation as the deployed function. */
export const inProcessCodeTransport: CodeTransport = async body => {
  const response = await handleCode(new Request('http://x/api/code/process', { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) throw new CodeEngineError(`engine ${response.status}: ${await response.text()}`, response.status);
  return response.json();
};
export const installInProcessCodeApi = (): void => setCodeTransport(inProcessCodeTransport);
export const uninstallInProcessCodeApi = (): void => setCodeTransport(null);
