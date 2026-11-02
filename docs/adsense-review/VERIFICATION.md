# Phase 5 — Verification

Environment: Node 22.23.4, pnpm 10.4.1, `pnpm install --frozen-lockfile`. "Local" = `docs/adsense-review/tools/serve-like-vercel.mjs`
(an approximation of Vercel's redirect → filesystem → rewrite order) and the real Express bundle `dist/index.js`.
The live site, Vercel itself and Google documentation hosts were **not reachable** from this session.

| # | Check | Result | Evidence |
|---|---|---|---|
| V-1 | `pnpm build` succeeds | **PASS** | exit 0; prints `prerender-static: wrote 33 pages + spa-shell.html` |
| V-2 | No new build warnings | **PASS** | Before and after: exactly one warning, the same pre-existing Tailwind/Lightning CSS "Found 1 warning while optimizing generated CSS" (`.\[\&_span\.h-1\\\.5\]\:h-2\.5` selector) |
| V-3 | Typecheck `pnpm check` | **PASS** | exit 0 before and after. Note: `tsconfig.json` `include` does not cover `scripts/`, so `prerender-static.ts` is executed by tsx at build but not type-checked by `pnpm check` |
| V-4 | Existing tests `npx vitest run` | **PASS (no regressions)** | Base and branch: identical result — 343 files, 7047 tests, 7041 pass, 6 fail, 11 files fail. All failures pre-exist and are unrelated: 9 `server/ai*.test.ts` suites crash at import because `server/aiService.ts:33` constructs an OpenAI client without `NVIDIA_API_KEY`; 4 `remoteCppEngine` tests need network to wandbox.org; 2 `SimulationPageHeader` tests expect the MAE AI button that is hidden in production. Failure lists diffed: identical. (The test run rewrites the tracked file `api/_lib/circuit/engine/mnaValidationSuite.report.md`; it was restored.) |
| V-5 | Raw HTML before vs after | **PASS** | `evidence/raw-html-results.md`, `evidence/before/*.raw`, `evidence/after/*.raw`, `*-results.json`. Before: 17 routes identical, 62 words, no canonical. After: route-specific title, description, canonical, 71–978 prose words; AdSense script in `<head>` on all 200 HTML routes |
| V-6 | robots.txt, sitemap.xml, ads.txt return 200 with correct content | **PASS (local)** | robots.txt served byte-identical to `client/public/robots.txt`; ads.txt 200 `text/plain` with the publisher line; sitemap 200, all 32 `<loc>` return 200 with the expected file (`evidence/phase5-local-checks.md`) |
| V-7 | Privacy/terms/about/contact/attribution routes return 200 with content | **PASS (local)** | `/privacy` 806, `/privacy-policy` 806 (canonical `/privacy`), `/terms` 436, `/attribution-policy` 276, `/about` 115, `/contact` 71 words in raw HTML |
| V-8 | No `#`-only URLs for content | **PASS** | 0 `href="#…"` in generated HTML; 0 sitemap entries with `#`; router is path-based (H1) |
| V-9 | No route serves different content by user agent | **PASS (local)** | sha256 identical for Mediapartners-Google, Googlebot, Google-Display-Ads-Bot and Chrome UAs on 4 route types; Express and the Vercel emulator return identical bytes on 6 routes (`evidence/phase5-local-checks.md`). Code has no UA checks |
| V-10 | Client still hydrates and shows the same content | **PASS** | Playwright (`evidence/after-rendered-dom.json`): `#mae-seo` removed after mount on 6 routes, exactly one canonical, client-set title matches static title, no page errors, docs `<h2>` present on simulator routes |
| V-11 | Same behaviour on real Vercel | **UNVERIFIED** | Needs a preview deployment; commands below |
| V-12 | Live site / crawler access / edge challenges | **UNTESTABLE here** | egress proxy returned 403 for maeacademy.org |

## Commands for the owner to repeat on a Vercel preview (V-11) and on production

Replace the host with the preview URL first, then with `https://maeacademy.org` after deploying.

```bash
for u in / /simulations/control-systems/pid /simulations/plc /about /contact /privacy /terms /attribution-policy /library /research /robots.txt /ads.txt /sitemap.xml; do printf '%s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' -A "Mediapartners-Google" "https://maeacademy.org$u"; done
```

```bash
curl -s -A "Mediapartners-Google" https://maeacademy.org/simulations/control-systems/pid | grep -c "Parallel and ISA standard forms"
```

```bash
for ua in "Mediapartners-Google" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" "Mozilla/5.0 Chrome/130"; do curl -s -A "$ua" https://maeacademy.org/about | sha256sum; done
```

Expected: all 200; the grep prints `1` or more; the three hashes are equal. Then use Search Console → URL Inspection →
"Test live URL" on a few routes and compare the rendered HTML.
