# Changes on branch `claude/dreamy-brahmagupta-o7tokx`

Nothing is committed or pushed. No simulator behaviour, numeric result, formula, label or visual spec was changed.
No new body text was written: every string in the new static HTML is read from the locale/data files the React
pages already render.

**Reference URLs.** `developers.google.com` and `support.google.com` were unreachable from this session (network
policy). Every URL below is an official Google page cited from prior knowledge, marked *not re-fetched*. Before
relying on a claim, open the URL and check that it still says this (OPEN-ITEMS U-1).

## C-1 Build-time static HTML for 33 routes — fixes H2

| | |
|---|---|
| Files | `scripts/prerender-static.ts` (new), `package.json:9` (`build` now runs `tsx scripts/prerender-static.ts` between `vite build` and esbuild), `client/src/components/SimulationsGuide.tsx:8` (`const GUIDE` → `export const GUIDE`, so the script reads the same copy; no runtime change) |
| Evidence | Before: all 17 HTML routes returned the same body, 62 words, no canonical (`evidence/raw-html-results.md`). After: route-specific title/description/canonical and 71–978 prose words (`evidence/after-results.json`) |
| What it writes | `dist/public/index.html` (home), `dist/public/prerendered/<route>.html` (32 routes), `dist/public/spa-shell.html` (the untouched Vite `index.html`, used for every non-prerendered route) |
| Content source | Simulators: `locales/en/toolDocs/<topic>.json` + `toolDocs/equations/<topic>.ts`, same section order and headings as `ToolDocumentation` in `SimulationDocumentation.tsx`; math rendered with KaTeX to MathML. Home/About/Contact/Library/Research: the `t("…")` keys used in each page component, in source order (excludes hidden AI callout, validation/success messages, "Copied", photo placeholder). Legal: every key of `legal.json` `privacy`/`terms`/`attribution` (all are rendered by the components — checked). Simulations index: `content.ts` cards + `SimulationsGuide` copy |
| Same for all UAs | Static files; no request inspection. Verified: identical sha256 for Mediapartners-Google, Googlebot, Google-Display-Ads-Bot and a Chrome UA (`evidence/phase5-local-checks.md`) |
| Hydration | React still calls `createRoot(#root).render(<App/>)`, which replaces the static container. Playwright: `#mae-seo` gone after mount, one canonical, no page errors (`evidence/after-rendered-dom.json`) |
| Query-string pages | `/simulations/plc` and `/simulations/digital-logic-design` share one file across `?platform=` / `?tool=` modes; the static file **omits** the canonical so it cannot contradict the one the client sets for the active mode |
| Official basis | Static rendering / SSR / hydration preferred over dynamic rendering: https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering (*not re-fetched*); JS SEO basics: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics (*not re-fetched*) |
| Safety check | The script fails the build if any prerendered route lacks a matching `vercel.json` rewrite ahead of the catch-all (`--check` runs only that) |

## C-2 `vercel.json` rewrites — serves C-1 on Vercel

| | |
|---|---|
| File | `vercel.json` `rewrites` |
| Change | 32 exact-path rewrites `/<route>` → `/prerendered/<route>.html`, placed after `/api/(.*)` and `/` and before the catch-all. Catch-all destination `/index.html` → `/spa-shell.html` (otherwise library/research detail and other SPA routes would receive the home page's canonical and text) |
| Not changed | headers, CSP, `X-Robots-Tag` on `/api/*`, redirects |
| Risk | Requires the Vercel Build Command to be `pnpm build` (OPEN-ITEMS U-3); a plain `vite build` override would make these routes 404. Verified only with a local emulator. Vercel serves a filesystem match before rewrites; no file exists at `/about` etc., so the rewrite should apply. **Confirm on a Vercel preview** (VERIFICATION.md V-9) |
| Side effect | `/prerendered/<route>.html` is also directly reachable; each carries `<link rel="canonical">` to the clean URL (except the two query-string suites). Consolidation: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls (*not re-fetched*) |

## C-3 Express parity

| | |
|---|---|
| File | `server/index.ts:3` (`import fs`), `server/index.ts:291-305` (the `*` handler) |
| Change | After `express.static`, serve `prerendered/<path>.html` if it exists, else `spa-shell.html` (falls back to `index.html` if the shell is missing). Path is confined to the `prerendered` directory |
| Evidence | Express (`NODE_ENV=production node dist/index.js`) and the Vercel emulator return identical bytes for 6 routes (`evidence/phase5-local-checks.md`) |

## C-4 Sitemap: add the pneumatics/hydraulics simulator

| | |
|---|---|
| File | `client/public/sitemap.xml` |
| Change | Added `https://maeacademy.org/simulations/pneumatics-and-hydraulics` (`lastmod` 2026-10-03 = its `createdAt` in `client/src/data/platform.ts`) |
| Evidence | Routed (`App.tsx` `/simulations/pneumatics-and-hydraulics`), linked from `/simulations`, has 867-word docs, was not in the sitemap. All 32 sitemap URLs now return 200 locally (`evidence/phase5-local-checks.md`) |
| Official basis | https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap (*not re-fetched*) |
| Not changed | Query-string entries (`?platform=logo`, `?tool=schematic`) kept: they are distinct client modes with their own canonical in `simulatorSeoData.ts`; existing `sitemap.test.ts` requires them |

## C-5 Review tooling and reports (new, docs only)

`docs/adsense-review/tools/serve-like-vercel.mjs`, `docs/adsense-review/tools/raw-html-check.py`, `docs/adsense-review/evidence/*`, and the reports in `docs/adsense-review/`.

## Checked and deliberately not changed

| Item | Why no change | Official basis (*not re-fetched*) |
|---|---|---|
| robots.txt | Googlebot and Mediapartners-Google have their own empty-`Disallow` groups; nothing needed for rendering is blocked. The existing Mediapartners group is kept as is; no new crawler-specific rule added | https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt ; https://developers.google.com/crawling/docs/crawlers-fetchers/google-special-case-crawlers |
| ads.txt | Already `google.com, pub-1937330840014217, DIRECT, f08c47fec0942fa0`, matching the brief and the format Google documents. Not re-verified this session (U-1) | https://support.google.com/adsense/answer/12171612 |
| AdSense snippet | Already in the static `<head>` of the HTML the server returns, and inherited by every prerendered page. No `<ins>` units / `adsbygoogle.push` exist, so there is nothing to re-push on client route changes | https://support.google.com/adsense/answer/9274634 |
| Privacy / Terms / About / Contact / Attribution pages | Already exist with real content; now in raw HTML via C-1. Privacy already discloses third-party ad cookies and links to adssettings.google.com and aboutads.info. Wording issues → OPEN-ITEMS (NEEDS OWNER REVIEW) | https://support.google.com/adsense/answer/1348695 |
| `#`-only URLs | None for content (H1 rejected) | https://developers.google.com/search/docs/crawling-indexing/links-crawlable |
| "Coming soon" sections | Only `ai.json` "Settings (coming soon)", inside the AI chat, which is hidden in production (`MaeAiCallout.tsx:9`) and redirected (`/ai` → `/`). Not in nav or sitemap. Nothing removed | — |
| Language URLs / hreflang | Not implemented: needs owner input on which languages are complete; Spanish lacks tool docs (OPEN-ITEMS O-3) | https://developers.google.com/search/docs/specialty/international/localized-versions ; https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites |
| noindex on library/research readers | Owner decision (OPEN-ITEMS O-4) | https://developers.google.com/search/docs/crawling-indexing/block-indexing |

## References (official Google; all *not re-fetched this session*)

- Dynamic rendering is a workaround: https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering
- JavaScript SEO basics: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Crawlable links / fragments: https://developers.google.com/search/docs/crawling-indexing/links-crawlable
- robots.txt spec: https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- Special-case crawlers (Mediapartners-Google, IP list): https://developers.google.com/crawling/docs/crawlers-fetchers/google-special-case-crawlers
- Verifying Google crawlers: https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
- Sitemaps: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Canonicalization: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Localized versions / hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
- Multi-regional and multilingual sites: https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
- Block indexing (noindex): https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Spam policies (hidden text, scaled content): https://developers.google.com/search/docs/essentials/spam-policies
- Helpful, reliable, people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google guidance on AI-generated content: https://developers.google.com/search/blog/2023/02/google-search-and-ai-content
- AdSense Program policies: https://support.google.com/adsense/answer/48182
- AdSense required privacy content: https://support.google.com/adsense/answer/1348695
- AdSense ads.txt guide: https://support.google.com/adsense/answer/12171612
- AdSense code placement: https://support.google.com/adsense/answer/9274634
- Google consent requirements for EEA/UK/CH (certified CMP): https://support.google.com/adsense/answer/13554116
