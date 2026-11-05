import { guarded } from '../_lib/security/guard';
import { handleCover, handleDoabItem, handleDoabSearch, handleResolvePdfs } from '../_lib/library/catalog';

// Node.js runtime (no `runtime: 'edge'`): the SSRF policy resolves DNS with node:dns.
//
// One function serves the four library metadata routes. Hobby plans cap a deployment at 12 serverless functions,
// so the routes share this entry point. Each route keeps its own method, guard tier and handler:
//   POST /api/library/resolve-pdfs   tier general   (Internet Archive metadata only)
//   GET  /api/library/cover          tier assets    (archive.org/services/img only)
//   GET  /api/library/doab           tier general   (directory.doabooks.org search)
//   GET  /api/library/doab-item      tier general   (directory.doabooks.org record)
// The PDF routes /api/pdf-proxy and /api/pdf-download are separate functions (api/pdf-proxy.ts, api/pdf-download.ts).

type Route = { method: 'GET' | 'POST'; handle: (request: Request) => Promise<Response> };

const ROUTES: Record<string, Route> = {
  'resolve-pdfs': { method: 'POST', handle: guarded('general', handleResolvePdfs) },
  cover: { method: 'GET', handle: guarded('assets', handleCover) },
  doab: { method: 'GET', handle: guarded('general', handleDoabSearch) },
  'doab-item': { method: 'GET', handle: guarded('general', handleDoabItem) },
};

async function dispatch(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const name = new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const route = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : undefined;
  if (!route) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  if (route.method !== method) {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'content-type': 'application/json', allow: route.method } });
  }
  return route.handle(request);
}

export const GET = (request: Request) => dispatch(request, 'GET');
export const POST = (request: Request) => dispatch(request, 'POST');
