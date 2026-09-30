import { handleEvaluate } from '../_lib/plc/handler';

export async function POST(request: Request): Promise<Response> {
  return handleEvaluate(request);
}
