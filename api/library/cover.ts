import { guarded } from '../_lib/security/guard';
import { handleCover } from '../_lib/library/catalog';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.
// Express keeps a disk cache; here the reply's Cache-Control (public, 7 days) lets the CDN cache it instead.

/** GET /api/library/cover?id=<identifier>: book cover from archive.org/services/img. Tier "assets", as in Express. */
export const GET = guarded('assets', handleCover);
