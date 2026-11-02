import { guarded } from './_lib/security/guard';
import { createPdfWebHandler, LIBRARY_PDF_HOSTS } from './_lib/library/pdf';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.
// Same logic as the Express route (api/_lib/library/pdf.ts), but restricted to the library's PDF hosts
// (archive.org, *.archive.org) on every redirect hop, independent of PDF_PROXY_ALLOWED_HOSTS.

/** GET /api/pdf-proxy?url=<https url>: inline PDF stream for the in-page viewer. Tier "assets", as in Express. */
export const GET = guarded('assets', createPdfWebHandler('inline', LIBRARY_PDF_HOSTS));
