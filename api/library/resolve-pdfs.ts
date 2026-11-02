import { guarded } from '../_lib/security/guard';
import { handleResolvePdfs } from '../_lib/library/catalog';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.

/** POST /api/library/resolve-pdfs { ids: string[] }: which Internet Archive items really have an open PDF. Upstream: archive.org only. */
export const POST = guarded('general', handleResolvePdfs);
