import { guarded } from '../_lib/security/guard';
import { handleSolve } from '../_lib/circuit/handler';

// Runs on the Edge runtime: no container cold start, served from the node nearest the user.
// Everything reachable from here must stay on web-standard APIs (enforced by api/_lib/circuit/edge.test.ts).
export const config = { runtime: 'edge' };

// 900 requests/min/IP: a live run sends a batch every ~100 ms. Origin check + rate limit live in guarded().
export const POST = guarded('circuit', handleSolve);
