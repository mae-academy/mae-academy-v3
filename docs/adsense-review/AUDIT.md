# Phase 0 — Inventory (read-only)

Repository `mae-academy/mae-academy-v3`, audited at HEAD `8c43826` on branch `claude/dreamy-brahmagupta-o7tokx`.
Line numbers refer to HEAD (before this branch's changes) unless marked "after".

Framework and routing match options the brief anticipated (Vite, path-based routing), so work continued into Phase 2.
One brief assumption is wrong and is reported, not "fixed": **there are no short mathematical research notes in the
repo** — `/research` is a live OpenAlex/DOAB paper search (see H8).

## 1. Framework and version

| Item | Value | Evidence |
|---|---|---|
| Bundler | Vite `^7.1.7` (lockfile resolves 7.1.9) | `package.json:97`; `pnpm install` output |
| UI | React `^19.2.1` | `package.json:57` |
| Router | wouter `^3.3.5` | `package.json:69`, `client/src/App.tsx:16` |
| i18n | i18next `^26.4.2` + react-i18next | `package.json:46`, `client/src/i18n/config.ts` |
| Not used | Next.js, CRA, any SSR framework | no `next.config.*`, no `react-scripts` |

## 2. Build output mode

**Client-only SPA.** `vite build` writes `dist/public` (`vite.config.ts:529-531`, `root: client`). The `build`
script (`package.json:9`) then bundles `server/index.ts` (Express) with esbuild. Nothing rendered page HTML at
build or request time: every route got the same `client/index.html`.

## 3. Routing

| Mechanism | Where | Notes |
|---|---|---|
| wouter `<Switch>`/`<Route>` path routing (History API) | `client/src/App.tsx:89-123` | e.g. `/simulations/:slug/:tool` (`:107`), `/library/:id` (`:94`), `/research/:id` (`:92`) |
| Client redirects | `App.tsx` `<Redirect>` for `/courses`, `/fluid-drive`, `/ai*`; `SimulationDetail.tsx:128-155` (`setLocation(..., {replace:true})`) for legacy `/code`, `/assembler`, `a-e` tool letters, bare `/simulations/<slug>` | client-side only |
| Query-string modes | `/simulations/plc?platform=logo`, `/simulations/digital-logic-design?tool=<mode>` | `client/src/seo/simulatorSeoData.ts:19-61` |
| Vercel rewrites to the SPA | `vercel.json:92-105` (HEAD) | listed prefixes → `/index.html`; anything else → `404.html` |
| Vercel redirects | `vercel.json:82-91` (HEAD) | `www` → apex (308), `/ai*` → `/` (307) |
| Express fallback | `server/index.ts:290-295` (HEAD) | `express.static` then `index.html` for `*` |
| Hash routing | **none** | no `HashRouter`/`useHashLocation`; only `#data-deletion`, an in-page anchor (`PrivacyPolicy.tsx:60`) |

## 4. Where content text lives

| Content | Source | Rendered |
|---|---|---|
| Simulator theory (per tool: intro, purpose, model, equation captions, control mapping, worked example, applications) | `client/src/locales/{en,ar}/toolDocs/*.json` + LaTeX in `client/src/components/simulations/toolDocs/equations/*.ts` | client only, `SimulationDocumentation.tsx` under each studio |
| Home, About, Contact, Library/Research headers | `client/src/locales/en/{landing,about,common,library,research}.json` | client only |
| Simulations index | `client/src/data/content.ts` (cards), `client/src/components/SimulationsGuide.tsx` (guide) | client only |
| Privacy / Terms / Attribution | `client/src/locales/en/legal.json` | client only |
| Library & research entries | fetched at runtime from third-party APIs (§6) | client only |
| Raw HTML for every route (before) | `client/index.html:69-91`: one H1, one paragraph, nav, footer (62 words) | identical for all URLs |

## 5. Language handling

- One URL per page for all languages. Language is chosen in the header switcher and stored in
  `localStorage["mae-locale"]` (`client/src/i18n/config.ts:58-65`), applied before mount (`client/src/main.tsx:10-12`).
- `lng: 'en'` default (`config.ts:32`); no Accept-Language detection, no redirects by language.
- No `/ar/…` or `/es/…` routes (they return 404). No `hreflang` anywhere. Canonical existed only client-side
  (`client/src/hooks/useCanonical.ts:43-52`).
- Arabic has per-tool docs; Spanish has **no** `toolDocs` folder and falls back to English
  (`toolDocs/registry.ts` comment "Spanish has no per-tool docs yet").

## 6. Library / research implementation

| Feature | Mechanism | External domains |
|---|---|---|
| Book search | `client/src/lib/internetarchive.ts`, `openlibrary.ts`, `doab.ts`, `unifiedBooks.ts` | `archive.org`, `openlibrary.org`, `covers.openlibrary.org`, `directory.doabooks.org`, `doi.org` |
| Paper search | `client/src/lib/openalex.ts` (`is_oa:true` filter, `:159`) | `api.openalex.org`, landing pages at publishers |
| Reader | `react-pdf` / PDF.js (`RestrictedPdfViewer.tsx:2,170`), always via same-origin `/api/pdf-proxy?url=…` (`:55`) | proxied publisher/IA PDFs |
| Proxy endpoints | Express only: `/api/pdf-proxy`, `/api/pdf-download`, `/api/library/*`, `/api/research/featured` (`server/index.ts:269-277`) | — |
| IA filter | `-access-restricted-item:true AND -collection:inlibrary AND -collection:printdisabled …` (`internetarchive.ts:100`) | excludes lending scans; does **not** check a licence field |

No iframes or `<embed>` for library content. `api/` (Vercel functions) contains only `circuit, code, control, logic,
plc, signals, telemetry` — **there is no Vercel function for `/api/pdf-proxy` or `/api/library/*`** (see OPEN-ITEMS U-2).

## 7. AdSense snippet

- `client/index.html:58-59`: `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1937330840014217" crossorigin="anonymous">` in the static `<head>`; Vite keeps it in the built HTML.
- `client/index.html:10`: `<meta name="google-adsense-account" content="ca-pub-1937330840014217">`.
- No `<ins class="adsbygoogle">` units and no `adsbygoogle.push` calls in `client/src` (Auto ads only, or no units yet). No Tag Manager.
- CSP allows the AdSense hosts (`vercel.json:27-28`).

## 8. Required files and pages (HEAD)

| Path | Exists | Notes |
|---|---|---|
| `/robots.txt` | yes, `client/public/robots.txt` | groups for Mediapartners-Google, Googlebot, AdsBot-Google (all allow); `*` disallows `/api/` |
| `/sitemap.xml` | yes, 31 URLs | missing `/simulations/pneumatics-and-hydraulics` (a live, documented simulator) |
| `/ads.txt` | yes | `google.com, pub-1937330840014217, DIRECT, f08c47fec0942fa0` |
| `/privacy-policy`, `/privacy` | yes (same component; canonical `/privacy`) | discloses Google ad cookies + opt-out links (`legal.json` `privacy.cookies`) |
| `/terms`, `/terms-of-service` | yes (canonical `/terms`) | |
| `/about` | yes | founder dossier |
| `/contact` | yes | form + email |
| `/attribution-policy` | yes | |
| meta robots on reader views | none | only `NotFound.tsx:12-17` adds `noindex` client-side; `X-Robots-Tag: noindex` on `/api/*` (`vercel.json:36`) |

All of the above were client-rendered only; raw HTML for each was the generic 62-word shell.

## 9. Hosting and edge config in the repo

- Vercel: `vercel.json` (security headers + CSP, cache headers, `X-Robots-Tag` on `/api/*`, redirects, rewrites), `.vercelignore`, `@vercel/analytics` (`main.tsx:5-7`).
- Express alternative: `server/index.ts` (production `node dist/index.js`).
- No `_headers`, `_redirects`, `netlify.toml`, Cloudflare config, WAF/firewall or bot rules in the repo.
- Which host actually serves maeacademy.org, and any dashboard-level Vercel Firewall / Bot Protection / Cloudflare in front: **not in the repo — NEEDS OWNER**.

## 10. "Needs JavaScript" notices

- `client/index.html:93`: `<noscript>This site needs JavaScript enabled to run its interactive engineering simulators.</noscript>` (outside `#root`, every route).
- `client/index.html:52`: `<noscript><style>` that un-hides `#mae-seo` and hides the splash when JS is off.
- `simulatorSeoData` JSON-LD declares `browserRequirements: "Requires JavaScript"` (`client/src/seo/useSimulatorSeo.ts:29`).

## 11. Other observations used later

- `#mae-seo` is visually clipped while JS loads (`client/index.html:45`); React replaces it on mount (OPEN-ITEMS O-9).
- The landing JSON-LD (`client/index.html:12`) was served on every route, including non-home pages.
- Home advertises "Open research notes, … algorithmic proofs … validated against benchmark experiments" (`landing.json:48`); no such notes exist.
- `legal.json:96` says the platform operates "strictly for educational, non-commercial purposes" while the site applies for ads.
- `legal.json:18` mentions "the DART cookie" (old Google wording).
- All 29 English and 29 Arabic tool-doc entries were added in one commit (`79dcb36`, 2026-10-13) whose trailer is `Co-Authored-By: Claude Sonnet 5.5` (OPEN-ITEMS O-1).
