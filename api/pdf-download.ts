import { guarded } from './_lib/security/guard';
import { createPdfWebHandler, LIBRARY_PDF_HOSTS } from './_lib/library/pdf';

// Node.js runtime (the Vercel default; no `runtime: 'edge'` here): the SSRF policy resolves DNS with node:dns
// before every outbound request, which the Edge runtime cannot do.
// Same logic as the Express route (api/_lib/library/pdf.ts), restricted to archive.org / *.archive.org.

/** GET /api/pdf-download?url=<https url>&name=<filename>: the same PDF as an attachment. Tier "assets", as in Express. */
export const GET = guarded('assets', createPdfWebHandler('attachment', LIBRARY_PDF_HOSTS));
