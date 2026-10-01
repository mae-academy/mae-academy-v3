import type { LogoEvaluateBody, LogoEvaluateResponse } from '@shared/logo/wire';

const ENDPOINT = '/api/plc/logo/evaluate';

/** Sends one batch to the serverless LOGO! engine. */
export type LogoTransport = (body: LogoEvaluateBody, signal?: AbortSignal) => Promise<LogoEvaluateResponse>;

export class LogoEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** POSTs one batch to the serverless engine. */
export const evaluateLogoRemote: LogoTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new LogoEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
    if (response.status === 400 && detail?.error === 'version_mismatch') throw new LogoEngineError(detail.message ?? 'The simulator was updated; reload the page.', 400);
    throw new LogoEngineError(
      response.status === 429
        ? 'Simulation rate limit reached'
        : response.status === 403
          ? 'The simulation engine refused this request'
          : `Simulation engine error (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as LogoEvaluateResponse;
};
