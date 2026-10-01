import { guarded } from '../_lib/security/guard';
import { handleCode } from '../_lib/code/handler';

// Runs on the Edge runtime: no container cold start, served from the node nearest the user.
// Everything reachable from here must stay on web-standard APIs and never evaluate dynamic code
// (enforced by api/_lib/code/edge.test.ts, which runs the bundle in the edge sandbox).
export const config = { runtime: 'edge' };

// 600 requests/min/IP: one request per Run / compile, with the editor's debounced layout analysis. Origin check + rate limit live in guarded().
export const POST = guarded('code', handleCode);
