import { createRedisStore, handleGetFollowers, handlePushFollowers, type TelemetryEnv } from '../_lib/telemetry/handler';

// Edge runtime, web-standard APIs only. GET is cached at the CDN (see handler), so Meta is hit about twice an hour.
export const config = { runtime: 'edge' };

const env = (): TelemetryEnv => (typeof process === 'undefined' ? {} : (process.env as TelemetryEnv));

export const GET = () => {
  const e = env();
  return handleGetFollowers({ env: e, store: createRedisStore(e) });
};

/** Authenticated write path for a cron job or webhook: `Authorization: Bearer $TELEMETRY_ADMIN_TOKEN`. */
export const POST = (req: Request) => {
  const e = env();
  return handlePushFollowers(req, { env: e, store: createRedisStore(e) });
};
