import { guarded } from '../_lib/security/guard';
import { handleEvaluate } from '../_lib/plc/handler';

// 900 requests/min/IP: a live run sends a batch every ~100 ms. Origin check + rate limit live in guarded().
export const POST = guarded('plc', handleEvaluate);
