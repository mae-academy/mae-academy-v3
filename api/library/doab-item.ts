import { guarded } from '../_lib/security/guard';
import { handleDoabItem } from '../_lib/library/catalog';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.

/** GET /api/library/doab-item?handle=20.500.12854/130855: one DOAB record (directory.doabooks.org only). */
export const GET = guarded('general', handleDoabItem);
