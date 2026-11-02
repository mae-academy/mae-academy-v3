# /api routes: Express vs Vercel

Inventory for OPEN-ITEMS U-2 ("library PDF reader may fail on Vercel"). Branch `claude/dreamy-brahmagupta-o7tokx`, uncommitted.

**How routing works.** On Vercel, every `api/**/*.ts` file except `api/_lib/**` is a function at the matching path
(`api/library/cover.ts` → `/api/library/cover`). `vercel.json` only rewrites `/api/(.*)` to itself and adds headers to
`/api/*` (`X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`). It has no `functions` block. The Express server
(`server/index.ts`) mounts every route itself behind `expressGuard(tierFor)`. Before this change, the library and PDF
routes existed **only** in Express, so on Vercel they had no function and would have returned 404.

## 1. Every /api route

| Route | Method | Express (`server/index.ts`) | Vercel function (before → after) | Client callers |
|---|---|---|---|---|
| `/api/plc/evaluate` | POST | :60 | `api/plc/evaluate.ts` (edge), unchanged | `client/src/services/plcClient.ts:60`, `features/plc-simulator/remote/remote-runtime.ts` |
| `/api/plc/logo/evaluate` | POST | :71 | `api/plc/logo/evaluate.ts` (edge), unchanged | `client/src/services/logoClient.ts:3`, `features/plc-simulator/logo/controller.ts` |
| `/api/circuit/solve` | POST | :82 | `api/circuit/solve.ts` (edge), unchanged | `client/src/services/circuitClient.ts:38` |
| `/api/logic/solve` | POST | :93 | `api/logic/solve.ts` (edge), unchanged | `client/src/services/logicClient.ts:9` |
| `/api/signals/transform` | POST | :104 | `api/signals/transform.ts` (edge), unchanged | `client/src/services/signalsClient.ts:7` |
| `/api/control/solve` | POST | :115 | `api/control/solve.ts` (edge), unchanged | `client/src/services/controlClient.ts:13` |
| `/api/code/process` | POST | :126 | `api/code/process.ts` (edge), unchanged | `client/src/services/codeClient.ts:4` |
| `/api/telemetry/social` | GET/POST | — (not in Express) | `api/telemetry/social.ts` (edge), unchanged | `client/src/hooks/useSocialFollowers.ts:4` |
| `/api/ai/chat` | POST | :141 | none, unchanged (AI hidden in production; out of scope) | `client/src/components/ai/streamChat.ts:181` |
| `/api/ai/schematic-repair` | POST | :251 | none, unchanged (out of scope) | `client/src/components/ai/schematicVerify.ts:54` |
| `/api/ai/analyze` | POST | :255 | none, unchanged (out of scope) | none found in `client/src` |
| **`/api/pdf-proxy`** | GET | :270 | **none → `api/pdf-proxy.ts` (Node)** | `client/src/components/RestrictedPdfViewer.tsx:55` (library **and** research viewer) |
| **`/api/pdf-download`** | GET | :271 | **none → `api/pdf-download.ts` (Node)** | `client/src/pages/LibraryDetail.tsx:107`, `client/src/pages/ResearchDetail.tsx:93` |
| `/api/check-pdfs` | POST | :272 | none, unchanged (research only) | `client/src/lib/openalex.ts:486` |
| `/api/research/featured` | GET | :273 | none, unchanged (research only; needs a disk cache + background build) | `client/src/lib/openalex.ts:362` |
| **`/api/library/resolve-pdfs`** | POST | :274 | **none → `api/library/resolve-pdfs.ts` (Node)** | `client/src/lib/internetarchive.ts:294` |
| **`/api/library/cover`** | GET | :275 | **none → `api/library/cover.ts` (Node)** | `client/src/components/LibraryBookCard.tsx:27` |
| **`/api/library/doab`** | GET | :276 | **none → `api/library/doab.ts` (Node)** | `client/src/lib/doab.ts:38` |
| **`/api/library/doab-item`** | GET | :277 | **none → `api/library/doab-item.ts` (Node)** | `client/src/lib/doab.ts:39` |
| `/api/pdf-thumb` | GET | :278 | none, unchanged (research only; renders with native `@napi-rs/canvas` + disk cache) | `client/src/lib/openalex.ts:387` |
| `/api/*` (anything else) | any | :281 → 404 JSON | Vercel 404 | — |

Line numbers are for `server/index.ts` on this branch.

## 2. What changed

| File | Change |
|---|---|
| `api/_lib/security/ssrf.ts` | Moved from `server/ssrf.ts` with no logic change (one comment updated), so Express and the Vercel functions share one outbound-request policy |
| `server/ssrf.ts` | Now a one-line re-export of the moved module, so existing imports and `server/ssrf.test.ts` work unchanged |
| `api/_lib/library/pdf.ts` (new) | Shared PDF logic moved from `server/pdfProxy.ts`: redirect-by-redirect SSRF validation, retry, `%PDF` check, range forwarding, headers, size caps, filename sanitising. Adds `createPdfWebHandler(disposition, allowlist)` for Vercel and `LIBRARY_PDF_HOSTS` |
| `api/_lib/library/catalog.ts` (new) | Shared logic moved from `server/libraryResolve.ts`, `libraryCover.ts`, `libraryDoab.ts` (resolve-pdfs, cover fetch, DOAB search/item, with their in-memory caches), plus web handlers for Vercel |
| `server/pdfProxy.ts` | Express transport only: calls `openPdf()`, then writes to `res` with the same back-pressure, abort-on-close and size-cap behaviour. `/api/check-pdfs` code unchanged. Re-exports `fetchWithValidatedRedirects`, `PDF_MAGIC` for `pdfThumb.ts` and tests |
| `server/libraryResolve.ts`, `server/libraryDoab.ts` | Thin Express adapters over `catalog.ts` |
| `server/libraryCover.ts` | Keeps its disk cache and concurrency limit; the fetch itself comes from `catalog.ts` |
| `api/pdf-proxy.ts`, `api/pdf-download.ts`, `api/library/{resolve-pdfs,cover,doab,doab-item}.ts` (new) | Vercel functions in the existing style: `export const GET/POST = guarded(<tier>, handler)`. Tiers match Express `tierFor`: `assets` for pdf-proxy, pdf-download and cover; `general` for resolve-pdfs, doab and doab-item. **Node.js runtime** (no `runtime: 'edge'`), because the SSRF check resolves DNS with `node:dns` |
| `api/_lib/library/library.test.ts` (new) | 12 tests: host restriction, redirect re-validation, streaming + headers, range/206, 415 on non-PDF, attachment filename, guard 403, resolve/cover/DOAB validation and pinned upstream hosts |

No simulator code, formula, label or visual was touched. No secret, API key or network allowlist was added.

## 3. Outbound host restrictions (Vercel functions)

| Function | May fetch | Notes |
|---|---|---|
| `/api/pdf-proxy`, `/api/pdf-download` | `archive.org`, `*.archive.org` (`LIBRARY_PDF_HOSTS`) | Checked on the first URL **and every redirect hop**, plus https only, port 443, no IP literals, no internal names, and every resolved address must be public. Fixed in code; `PDF_PROXY_ALLOWED_HOSTS` is ignored on Vercel. Why only archive.org: every library PDF is `https://archive.org/download/<id>/<file>` (`internetarchive.ts:242-243`), which redirects to `*.us.archive.org`. Open Library and DOAB records have `pdfUrl: null` (`openlibrary.ts:75,128`, `doab.ts:81`) |
| `/api/library/resolve-pdfs` | `archive.org` (`/metadata/<id>`) | id must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$` |
| `/api/library/cover` | `archive.org` (`/services/img/<id>`) | same id rule |
| `/api/library/doab`, `/api/library/doab-item` | `directory.doabooks.org` (allowlist `doabooks.org`, `*.doabooks.org`) | query ≤ 200 chars, limit ≤ 30; handle must match `^\d+(\.\d+)*/\d+$` |

Library domains used for **metadata only** (fetched by the browser directly, not through these functions):
`archive.org/advancedsearch.php`, `openlibrary.org`, `covers.openlibrary.org`, `doi.org` links.

**Express is unchanged:** its PDF proxy still uses `PDF_PROXY_ALLOWED_HOSTS` when set, else any public https host
(that is what the research viewer needs locally).

## 4. Verification done here

| Check | Result |
|---|---|
| `pnpm build` | pass; same single pre-existing CSS warning |
| `pnpm check` (tsc) | pass |
| `npx vitest run` | 7053 pass / 6 fail. Same 6 pre-existing failures as the base branch (AI key, Wandbox network, hidden AI button); +12 new tests, all passing |
| Express starts (`NODE_ENV=production node dist/index.js`) | starts and serves |
| Express before (HEAD) vs after, 13 requests across all 6 routes | identical status, content type and body for every one: validation errors, SSRF refusals, guard 403, empty resolve, upstream failure paths (table below) |
| Vercel function bundles (esbuild, platform node) | all 6 bundle; no Express or `server/` code in the graph; only client file is `client/src/lib/internetarchive.ts` (no imports); bundles load and answer in Node with the guard's rate-limit headers |

Express parity (base = HEAD `8c43826`; Origin `https://maeacademy.org` unless noted):

| Request | base Express (HEAD) | this branch Express | |
|---|---|---|---|
| pdf-proxy, no url | `400 text/plain Missing url parameter` | same | same |
| pdf-proxy, `http://archive.org/…` | `400 Only https URLs are allowed` | same | same |
| pdf-proxy, `https://127.0.0.1/…` | `400 IP addresses are not allowed` | same | same |
| pdf-proxy, `https://localhost/…` | `400 Target host is not allowed` | same | same |
| pdf-download, no url | `400 Missing url parameter` | same | same |
| library/cover, `id=../x` | `404` empty | same | same |
| library/doab, empty query | `400 {"error":"query is required (max 200 characters)"}` | same | same |
| library/doab-item, bad handle | `400 {"error":"handle must look like 20.500.12854/130855"}` | same | same |
| library/resolve-pdfs, `{"ids":["../x"]}` | `400 {"error":"Body must be { ids: string[] } of Internet Archive identifiers"}` | same | same |
| library/resolve-pdfs, `{"ids":[]}` | `200 {"results":{}}` | same | same |
| pdf-proxy, no Origin/Referer/Sec-Fetch-Site | `403 {"error":"Forbidden"}` | same | same |
| pdf-proxy, real archive.org URL | `502 Host could not be resolved` (no DNS in this sandbox) | same | same |
| library/doab, real query | `504 DOAB did not respond in time` (no network) | same | same |

## 5. Not tested here (no access to Vercel or the upstream hosts)

| # | Risk | What to check on a preview deployment |
|---|---|---|
| R-1 | **Nothing has run on Vercel.** That the Node runtime picks up the web-standard `export const GET/POST` signature, and that the bundler traces `api/_lib/**` and `client/src/lib/internetarchive.ts` | Open a `/library/<id>` page; DevTools → Network: `/api/pdf-proxy` 200/206, `/api/library/cover` 200, `/api/library/resolve-pdfs` 200 |
| R-2 | **Response size and duration limits** for a streamed body. pdf.js uses Range requests when `Accept-Ranges` + `Content-Length` are present, so the viewer should only pull chunks. `/api/pdf-download` streams the whole file (Express cap 1 GB) and may hit Vercel's response-size or max-duration limit for big books | Download a large book (>50 MB) from a preview; check the function logs. If it fails, consider pointing the download button at the archive.org URL, or set `maxDuration` in a `vercel.json` `functions` block |
| R-3 | `vercel.json` adds `Cache-Control: no-store` to every `/api/*` response. If Vercel lets that override the function's own header, covers (`public, max-age=604800`) and inline PDFs (`public, max-age=3600`) will not be CDN-cached, and every card view costs a function call to archive.org | `curl -sI` a cover URL on the preview and look at `cache-control` / `x-vercel-cache` |
| R-4 | **Research viewer on Vercel stays broken (no regression).** It shares `/api/pdf-proxy`, but research PDFs come from publisher hosts (arxiv.org, springer.com, …), which the Vercel allowlist refuses with 400. Before: 404 (no function). `/api/check-pdfs`, `/api/research/featured` and `/api/pdf-thumb` are still Express-only | Decide whether to allow named research hosts (e.g. the `RELIABLE_PDF_HOSTS` list in `client/src/lib/openalex.ts`) in a separate allowlist, and whether to port the three research routes (`pdf-thumb` needs a native canvas module and a persistent cache, which is a bigger change) |
| R-5 | In-memory caches (resolve 1 h, DOAB 10 min) only live while a function instance is warm; the Express disk cover cache has no Vercel equivalent beyond the CDN | Watch DOAB latency (3–17 s upstream) on cold starts; the client already has timeouts |
| R-6 | Origin guard on previews: allowed origins include `VERCEL_URL` / `VERCEL_BRANCH_URL` (`api/_lib/security/origin.ts`), so preview origins should pass; custom preview domains need `ALLOWED_ORIGINS` | A 403 `{"error":"Forbidden"}` on the preview means the origin is not recognised |
| R-7 | Rate limits use the existing Upstash limiter (`api/_lib/security/ratelimit.ts`); without Upstash, or when it is slow, it falls back to a per-instance in-memory limiter, exactly as for the existing simulator functions | — |
