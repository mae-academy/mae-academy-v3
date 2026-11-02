import { guarded } from '../_lib/security/guard';
import { handleDoabSearch } from '../_lib/library/catalog';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.

/** GET /api/library/doab?query=&limit=&offset=: DOAB directory search (directory.doabooks.org only). */
export const GET = guarded('general', handleDoabSearch);
