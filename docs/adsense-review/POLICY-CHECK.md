# Site vs. the three Google policy pages

Pages read on 2026-11-05 from `support.google.com` (full text saved outside the repo, in the session scratchpad):
1. AdSense content and user experience: https://support.google.com/adsense/answer/10015918
2. Thin content with little or no added value (spam policies): https://support.google.com/webmasters/answer/9044175
3. Spam policies for Google web search (publisher policy): https://support.google.com/publisherpolicies/answer/11035931

**Result: the site does NOT match everything on these pages.** Status per requirement below.
Labels: MATCHES (verified), GAP (does not match), UNVERIFIED (could not be tested here).

| # | Requirement on the page | Evidence | Status |
|---|---|---|---|
| 1 | "Enough unique content so that we can determine what your site is about" (page 1) | Raw HTML now carries 71–978 prose words per page (VERIFICATION.md). Simulator text is correct but uses one template and was AI-co-authored (CONTENT-AUDIT.md). `/library`, `/research`, `/about`, `/contact` are 71–118 words | GAP (originality, owner) |
| 2 | "Update your site regularly; continually add new and unique content" (page 1) | Sitemap `lastmod`: 31 of 32 URLs are 2026-10-01, one 2026-10-03. No blog, news or changelog page exists | GAP |
| 3 | No "pages with little to no content", doorway pages, cloaking (pages 1, 3) | Same bytes for every user agent (4 UAs, Express and emulator). No doorway pattern found. Thin pages listed in row 1. Library and research detail pages return a generic shell | PARTIAL |
| 4 | No scraped or copied content; no site "dedicated to embedding content from other sites without substantial added value" (pages 1, 2) | Library and research detail pages are third-party PDFs (archive.org, OpenAlex) with no commentary. 0 paragraphs of 12+ words are shared between the 33 prerendered pages | RISK (owner: add commentary or noindex) |
| 5 | Avoid duplicate content across pages; no long repeated text such as copyright blocks (page 1) | 0 shared paragraphs across 33 pages (excluding the two canonical alias pairs `/privacy`+`/privacy-policy`, `/terms`+`/terms-of-service`, both with canonical tags) | MATCHES |
| 6 | Navigation: alignment, readability, functionality, accuracy (page 1) | Not tested visually across devices here | UNVERIFIED |
| 7 | No links to missing or misleading pages (page 1) | 24 distinct internal link targets in the source; all resolve to a route (`/simulations/circuits` is an alias handled in `SimulationDetail.tsx`) | MATCHES |
| 8 | "Provide the information and service promised"; do not "claim content or services that they do not have" (pages 1, 3) | **Fixed.** `/courses` removed (route and rewrite); "Courses" removed from title, description, H1 and intro; the home research block now describes what `/research` does (OpenAlex papers, DOAB books, PDF downloads) in English, Arabic and Spanish, with the existing `research.json` description. Legacy URLs `/fluid-drive`, `/code`, `/assembler`, `/simulators/*` are now real 308 redirects in `vercel.json`. Dead `AiPage.tsx` and the unused `footer.courses` strings were deleted | MATCHES |
| 9 | No downloadable content that does not work (page 1) | Library PDFs work only for archive.org on Vercel. Research PDF preview/download, `/api/check-pdfs`, `/api/research/featured`, `/api/pdf-thumb` are Express-only, so on Vercel research PDFs fall back to the publisher link (the UI handles the failure: `openalex.ts:487-496`, `ResearchDetail.tsx:95-107`) | PARTIAL (degrades safely) |
| 10 | Site appears correctly in different browsers (page 1) | Chromium only (Playwright). Safari and Firefox not tested | UNVERIFIED |
| 11 | Avoid unnecessary, repeated use of keywords (page 3) | Page titles and descriptions come from `simulatorSeoData.ts`; each is specific to one tool. No keyword lists found in visible text | MATCHES |

## What fixes the GAPs

- Row 8 (research-notes block only): either write the research notes, or change the copy to what exists. Wording that is true today (from `research.json`): "An open-access engineering paper catalog and discovery engine. Search, read and download research through OpenAlex and DOAB." This needs your decision (OPEN-ITEMS O-6).
- Rows 1, 2, 4: owner-written content (OPEN-ITEMS O-1, O-4).
- Row 6, 10: manual test on your devices and browsers.
