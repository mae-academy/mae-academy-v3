import { guarded } from '../../_lib/security/guard';
import { handleLogoEvaluate } from '../../_lib/plc/logo/handler';

// Runs on the Edge runtime, like /api/plc/evaluate. Everything reachable from here must stay on
// web-standard APIs (enforced by api/_lib/plc/logo/edge.test.ts).
export const config = { runtime: 'edge' };

// Same 'plc' tier as the S7-200 engine: a live run sends a batch every ~100 ms.
export const POST = guarded('plc', handleLogoEvaluate);
