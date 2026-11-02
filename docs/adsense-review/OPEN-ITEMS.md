# Open items

`I-*` = required inputs not provided. `O-*` = NEEDS OWNER (a decision, original writing, or legal review).
`U-*` = UNVERIFIED (could not be checked from this session).

## Required inputs that were missing

| # | Input | What depends on it |
|---|---|---|
| I-1 | Exact Policy Center rejection text and dates of the 3 attempts | Matching findings to the stated reason; nothing here is confirmed as the cause |
| I-2 | Search Console Page Indexing export (indexed count, exclusion reasons + counts) | Whether simulator URLs were indexed, whether soft-404 / "Crawled – not indexed" / duplicate-canonical exclusions dominate (X1, H2) |
| I-3 | Hosting/CDN details: which host serves production (Vercel or Express), Vercel Firewall / Bot Protection / Attack Challenge Mode, any Cloudflare in front, redirect rules | H3 (edge part), H6, U-2, V-11 |
| I-4 | Which languages are complete | O-3 |
| I-5 | Whether the owner will write original content per page; legal details for the privacy policy | O-1, O-5, O-6 |
| I-6 | Library rights / which entries have original commentary | O-4 |

## NEEDS OWNER

| # | Item | Detail | Suggested next step |
|---|---|---|---|
| O-1 | **Simulator text provenance** | All 58 tool-doc entries (29 en + 29 ar) arrived in commit `79dcb36` co-authored by an AI model, with one template for every tool. This branch only moved that existing text into raw HTML; it did not write or edit any. Google evaluates helpfulness and originality, not the tool used, but uniform mass-produced text is a known risk (spam policies: https://developers.google.com/search/docs/essentials/spam-policies; https://developers.google.com/search/blog/2023/02/google-search-and-ai-content — *not re-fetched*) | Review each page as the domain expert; correct errors; add first-hand material the template cannot have (your own lab runs, screenshots, common student mistakes, course context). For new sections use placeholders such as `[OWNER TO WRITE: worked example from your lab]` and fill them yourself |
| O-2 | Home and About thin in raw HTML | `/` 249 words, `/about` 115 (much About text lives in `founderDossier.ts`, not prerendered). "Photo Slot" placeholder may be visible on `/about` (`About.tsx:560`) | Decide whether to prerender `founderDossier.ts` text; add the missing photo or remove the empty slot |
| O-3 | **Language URLs** | One URL serves en/ar/es via `localStorage`; crawlers only see English. Spanish has no tool docs (English shown inside Spanish UI). No hreflang possible without per-language URLs | Tell us which languages are complete. For complete ones: `/ar/...` routes + `hreflang` (incl. `x-default`) + per-language canonical. Do **not** publish `/es/` simulator pages until Spanish docs exist. Ref: https://developers.google.com/search/docs/specialty/international/localized-versions (*not re-fetched*) |
| O-4 | **Library and research detail pages** | Third-party metadata + embedded PDF, no original commentary, generic shell in raw HTML, unbounded id space, licence per entry unknown (IA filter does not check licence; OpenAlex `is_oa` includes NC licences) | Decide per section: (a) add original commentary to a curated, finite list of entries you have rights to discuss, then prerender those; or (b) mark detail views `noindex` and keep them out of the sitemap (they are not in it now). Not changed on this branch because the brief makes this the owner's call |
| O-5 | **Legal wording — NEEDS OWNER REVIEW** | Privacy: mentions "the DART cookie" (old wording); does not mention Vercel Analytics, Google Fonts, jsDelivr (Pyodide), Wandbox (C/C++ code sent to a third party), OpenAlex/Internet Archive requests, or `localStorage` use; no consent mechanism for EEA/UK/CH visitors (Google requires a certified CMP there: https://support.google.com/adsense/answer/13554116, *not re-fetched*). Required AdSense disclosures: https://support.google.com/adsense/answer/1348695 (*not re-fetched*). Attribution policy: "strictly for educational, non-commercial purposes" (`legal.json:96`) conflicts with showing ads, and "fair use" claims for archive material need legal review. Privacy page header badge reads "Meta App Review & Compliance" | Owner (ideally with legal advice) rewrites these sections; this branch did not change legal text |
| O-6 | **Advertised research notes do not exist** | `landing.json:48` + "Explore Research Notes" CTA promise research notes, derivations and proofs "validated against benchmark experiments"; `/research` is a paper search | Either write the notes yourself (one note per real derivation behind a simulator, with your own steps), or change the home copy to describe what `/research` actually is |
| O-7 | Contact page | 71 words; fine for a contact page. Confirm `contact@maeacademy.org` is monitored | — |
| O-8 | Soft 404s | Unknown SPA paths and invalid library/research ids return 200 + shell; `noindex` only via JS (`NotFound.tsx:12-17`) | Option: validate library/research ids server-side (Vercel function or Express) and return 404, or noindex detail routes (ties to O-4) |
| O-9 | Hidden static container | `#mae-seo` is clipped (`client/index.html:45`) until React mounts; it now holds the full page text. Same text for every visitor and identical to what React shows, but it is visually hidden for the load time | Option: show the static content visibly (styled) instead of the spinner, so users and crawlers see the same thing at every moment. Changes first-paint visuals, so not done without your approval |

## UNVERIFIED

| # | Item | How to verify |
|---|---|---|
| U-1 | Every Google URL cited was **not re-fetched** (developers.google.com and support.google.com were blocked by the session's network policy). This includes the ads.txt format check the brief required | Open each URL in CHANGES.md §References; confirm ads.txt line format on https://support.google.com/adsense/answer/12171612 and check the "ads.txt" status in AdSense → Sites |
| U-2 | Library API on Vercel. **Code added, not tested on Vercel:** `/api/pdf-proxy`, `/api/pdf-download` and `/api/library/{resolve-pdfs,cover,doab,doab-item}` now have Node-runtime Vercel functions sharing their logic with Express. The Vercel PDF proxy only fetches from `archive.org` / `*.archive.org`. Research routes (`/api/check-pdfs`, `/api/research/featured`, `/api/pdf-thumb`) remain Express-only, and research PDFs from publisher hosts are refused on Vercel. Details and risks R-1…R-7: `API-ROUTES.md` | On a Vercel preview, open a `/library/<id>` page; Network tab: `/api/pdf-proxy` 200/206, `/api/library/cover` 200, `/api/library/resolve-pdfs` 200; then try a large download (R-2) and check cover caching headers (R-3) |
| U-3 | Vercel serves the new rewrites as the local emulator does. **Deploy risk:** the Vercel project's Build Command must run `pnpm build` (the package script). If the dashboard overrides it with plain `vite build`, `dist/public/prerendered/*` and `spa-shell.html` will not exist and the rewritten routes will 404 | Check Vercel → Project → Settings → Build & Output (Build Command = `pnpm build` or default, Output Directory = `dist/public`), then run VERIFICATION.md V-11 on a preview URL before promoting |
| U-4 | Live crawler access (Mediapartners-Google IP ranges, challenges, 403/429) | Vercel/Cloudflare firewall logs filtered by UA `Mediapartners-Google` and Google's published IP ranges (https://developers.google.com/crawling/docs/crawlers-fetchers/google-special-case-crawlers, *not re-fetched*) |
| U-5 | Search Console URL Inspection of the new raw HTML | Inspect `/simulations/control-systems/pid`, `/about`, `/privacy` after deploy |

## What happens next

Nothing is committed or pushed. After the owner reviews: commit, deploy to a Vercel preview, run VERIFICATION.md V-11,
deploy to production, check U-4/U-5, and work on O-1, O-3, O-4, O-5, O-6. Request another review only when you are
satisfied with the content. This report does not predict the outcome.
