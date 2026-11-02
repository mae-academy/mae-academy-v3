# Phase 3 — Content audit (report only; no text was written)

**Labels are internal to this audit, not Google thresholds.** Google publishes no minimum word count, page count or
text-to-code ratio. Definitions used here:

- **PASS** — the page has its own explanatory prose (≥ ~400 words, a theory/model section and a worked example) that is
  specific to that page's tool.
- **THIN** — some page-specific prose, but mostly navigation, UI labels, or third-party listings.
- **EMPTY** — no page-specific explanatory prose; content is third-party metadata, an embedded document, or a shell.

"Original" below means "not copied from a third party, as far as the repo shows". It does **not** mean
"written by the owner": see the provenance note, which applies to every simulator row.

> **Provenance (affects every simulator row).** All English and Arabic tool docs (`client/src/locales/{en,ar}/toolDocs/*.json`,
> 58 entries) were added in one commit, `79dcb36` (2026-10-13), whose trailer is `Co-Authored-By: Claude Sonnet 5.5`.
> Every entry uses the same section template (intro, purpose, model, equations, control mapping, worked example, applications). Whether this text was reviewed and corrected by the owner cannot be
> told from the repo. This audit does **not** claim that this caused the rejection. Google's position is that how content
> is produced matters less than whether it is helpful and not mass-produced to manipulate rankings
> (https://developers.google.com/search/blog/2023/02/google-search-and-ai-content,
> https://developers.google.com/search/docs/essentials/spam-policies — *not re-fetched*). The owner should review each
> page as a subject-matter expert and add first-hand material (own lab results, screenshots of real runs, errata, course
> context). → OPEN-ITEMS O-1.

## 1. Simulator pages

Counted from the doc JSON (prose words; `$…$` math removed). Columns: theory = "Mathematical model" parts; equations =
captioned display equations (each caption explains the equation in words); worked example = numbered steps; usage
steps = "Canvas parameter and control mapping" items (explains each control; there is no separate step-by-step
"how to use" list); limits = an automatic keyword search (assum/limit/approximat/neglect/ideal) in the English text, so
"not found" means only that the keywords did not appear.

Spanish (`es`) has **no tool docs**; Spanish users see these English docs inside a Spanish UI. Spanish rows are
therefore not listed. No language has its own URL (H5), so `lang` here is the language of the text, not a URL.

| URL | lang | prose words (math excl.) | theory (model) | equations captioned | worked example (steps) | control mapping | limits/assumptions stated | label |
|---|---|---|---|---|---|---|---|---|
| `/simulations/arduino-studio` | en | 824 | yes (4 parts) | 9 | yes (5) | 8 items | yes | PASS |
| `/simulations/circuit-lab` | en | 1075 | yes (5 parts) | 9 | yes (5) | 7 items | yes | PASS |
| `/simulations/code/masm8086` | en | 775 | yes (4 parts) | 7 | yes (5) | 7 items | not found | PASS |
| `/simulations/code/python` | en | 608 | yes (4 parts) | 6 | yes (5) | 7 items | not found | PASS |
| `/simulations/code/cpp` | en | 593 | yes (4 parts) | 6 | yes (5) | 7 items | yes | PASS |
| `/simulations/code/c` | en | 662 | yes (4 parts) | 7 | yes (5) | 8 items | not found | PASS |
| `/simulations/control-systems/root-locus` | en | 832 | yes (4 parts) | 7 | yes (5) | 6 items | yes | PASS |
| `/simulations/control-systems/pid` | en | 701 | yes (4 parts) | 8 | yes (5) | 8 items | yes | PASS |
| `/simulations/control-systems/frequency-response` | en | 661 | yes (4 parts) | 7 | yes (5) | 8 items | not found | PASS |
| `/simulations/control-systems/state-space` | en | 579 | yes (4 parts) | 7 | yes (5) | 7 items | not found | PASS |
| `/simulations/pneumatics-and-hydraulics` | en | 867 | yes (5 parts) | 8 | yes (4) | 8 items | yes | PASS |
| `/simulations/pneumatics-and-hydraulics (hydraulics mode, same URL)` | en | 802 | yes (5 parts) | 8 | yes (5) | 8 items | not found | PASS |
| `/simulations/digital-logic-design?tool=schematic` | en | 830 | yes (4 parts) | 9 | yes (5) | 7 items | not found | PASS |
| `/simulations/digital-logic-design?tool=analyzer` | en | 661 | yes (4 parts) | 7 | yes (4) | 6 items | yes | PASS |
| `/simulations/digital-logic-design?tool=kmap` | en | 612 | yes (4 parts) | 6 | yes (5) | 5 items | not found | PASS |
| `/simulations/digital-logic-design?tool=synthesis` | en | 567 | yes (4 parts) | 5 | yes (4) | 5 items | not found | PASS |
| `/simulations/digital-logic-design?tool=timing` | en | 598 | yes (4 parts) | 5 | yes (4) | 7 items | yes | PASS |
| `/simulations/digital-logic-design?tool=state-machine` | en | 619 | yes (4 parts) | 7 | yes (4) | 8 items | not found | PASS |
| `/simulations/plc` | en | 932 | yes (4 parts) | 8 | yes (5) | 7 items | yes | PASS |
| `/simulations/plc?platform=logo` | en | 776 | yes (4 parts) | 8 | yes (5) | 7 items | not found | PASS |
| `/simulations/power-electronics/rectifier` | en | 766 | yes (4 parts) | 8 | yes (5) | 8 items | not found | PASS |
| `/simulations/power-electronics/inverter` | en | 714 | yes (4 parts) | 8 | yes (4) | 8 items | yes | PASS |
| `/simulations/power-electronics/acvc` | en | 685 | yes (4 parts) | 6 | yes (5) | 8 items | yes | PASS |
| `/simulations/power-electronics/chopper` | en | 667 | yes (4 parts) | 8 | yes (5) | 8 items | yes | PASS |
| `/simulations/signals-and-systems/signal-operations-and-properties` | en | 918 | yes (4 parts) | 7 | yes (4) | 7 items | yes | PASS |
| `/simulations/signals-and-systems/system-classification` | en | 783 | yes (4 parts) | 6 | yes (5) | 7 items | not found | PASS |
| `/simulations/signals-and-systems/convolution-engine` | en | 791 | yes (4 parts) | 7 | yes (4) | 8 items | yes | PASS |
| `/simulations/signals-and-systems/fourier-analysis` | en | 785 | yes (4 parts) | 7 | yes (5) | 8 items | yes | PASS |
| `/simulations/signals-and-systems/laplace-s-plane` | en | 848 | yes (4 parts) | 7 | yes (4) | 8 items | yes | PASS |
| `/simulations/arduino-studio` | ar | 786 | yes (4 parts) | 9 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/circuit-lab` | ar | 928 | yes (5 parts) | 9 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/code/masm8086` | ar | 657 | yes (4 parts) | 7 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/code/python` | ar | 522 | yes (4 parts) | 6 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/code/cpp` | ar | 516 | yes (4 parts) | 6 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/code/c` | ar | 570 | yes (4 parts) | 7 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/control-systems/root-locus` | ar | 682 | yes (4 parts) | 7 | yes (5) | 6 items | n/a (not machine-checked) | PASS |
| `/simulations/control-systems/pid` | ar | 624 | yes (4 parts) | 8 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/control-systems/frequency-response` | ar | 549 | yes (4 parts) | 7 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/control-systems/state-space` | ar | 550 | yes (4 parts) | 7 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/pneumatics-and-hydraulics` | ar | 775 | yes (5 parts) | 8 | yes (4) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/pneumatics-and-hydraulics (hydraulics mode, same URL)` | ar | 672 | yes (5 parts) | 8 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=schematic` | ar | 742 | yes (4 parts) | 9 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=analyzer` | ar | 586 | yes (4 parts) | 7 | yes (4) | 6 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=kmap` | ar | 524 | yes (4 parts) | 6 | yes (5) | 5 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=synthesis` | ar | 495 | yes (4 parts) | 5 | yes (4) | 5 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=timing` | ar | 500 | yes (4 parts) | 5 | yes (4) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/digital-logic-design?tool=state-machine` | ar | 520 | yes (4 parts) | 7 | yes (4) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/plc` | ar | 763 | yes (4 parts) | 8 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/plc?platform=logo` | ar | 627 | yes (4 parts) | 8 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/power-electronics/rectifier` | ar | 708 | yes (4 parts) | 8 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/power-electronics/inverter` | ar | 635 | yes (4 parts) | 8 | yes (4) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/power-electronics/acvc` | ar | 602 | yes (4 parts) | 6 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/power-electronics/chopper` | ar | 613 | yes (4 parts) | 8 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/signals-and-systems/signal-operations-and-properties` | ar | 719 | yes (4 parts) | 7 | yes (4) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/signals-and-systems/system-classification` | ar | 653 | yes (4 parts) | 6 | yes (5) | 7 items | n/a (not machine-checked) | PASS |
| `/simulations/signals-and-systems/convolution-engine` | ar | 607 | yes (4 parts) | 7 | yes (4) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/signals-and-systems/fourier-analysis` | ar | 585 | yes (4 parts) | 7 | yes (5) | 8 items | n/a (not machine-checked) | PASS |
| `/simulations/signals-and-systems/laplace-s-plane` | ar | 636 | yes (4 parts) | 7 | yes (4) | 8 items | n/a (not machine-checked) | PASS |

Raw HTML on this branch contains the English text of the row for that URL (e.g. `/simulations/control-systems/pid`:
747 prose words in raw HTML incl. ~20 nav/footer words; 2174 words rendered including the studio UI).

## 2. Other pages (English; raw-HTML prose words on this branch, nav/footer ≈20 words included)

| URL | Raw HTML words (after) | Original explanatory text | Notes | Label |
|---|---|---|---|---|
| `/` | 249 | short taglines + section blurbs | claims "Open research notes … algorithmic proofs … validated against benchmark experiments" (`landing.json:48`) — no such notes exist (O-6); social follower counts load live and are not in static HTML | THIN |
| `/simulations` | 535 | yes: catalogue blurbs + "How the MAE Academy simulators work" guide | | PASS |
| `/about` | 115 (≈637 rendered) | founder dossier; much of the visible text comes from `founderDossier.ts`, not in static HTML | shows a "Photo Slot" placeholder when no photo is set (`About.tsx:560`) | THIN |
| `/contact` | 71 | form labels, support email, response time | expected for a contact page | THIN (expected) |
| `/privacy`, `/privacy-policy` | 806 | yes | see O-5 for wording issues | PASS (legal review NEEDS OWNER) |
| `/terms`, `/terms-of-service` | 436 | yes | | PASS (legal review NEEDS OWNER) |
| `/attribution-policy` | 276 | yes | says "strictly for educational, non-commercial purposes" (`legal.json:96`) — conflicts with running ads (O-5) | PASS (legal review NEEDS OWNER) |
| `/library` | 118 | header only; listing is live third-party search results | | THIN |
| `/research` | 101 | header only; listing is live OpenAlex/DOAB results | | THIN |

## 3. Library entries (`/library/:id`)

Entries are not stored in the repo; they are fetched at runtime, so they cannot be enumerated or counted here.

| Source | Domain(s) | Licence handling in code | Original commentary | Text/PDF embedded |
|---|---|---|---|---|
| Internet Archive | `archive.org` | excludes access-restricted, lending (`inlibrary`), print-disabled and periodicals (`internetarchive.ts:100`); **no licence/rights field is checked** | none | yes: PDF rendered in-page with PDF.js via `/api/pdf-proxy` |
| Open Library | `openlibrary.org`, `covers.openlibrary.org` | public-scan subset only (comment `openlibrary.ts:6`) | none | yes (via IA PDF) |
| DOAB | `directory.doabooks.org`, `doi.org` | open-access books; licence (e.g. CC BY-NC) not shown or filtered | none | yes |

Every `/library/<id>` raw response is the generic 62-word shell (no title, no canonical). Label: **EMPTY** (all entries).
Licence per entry: **UNKNOWN** from the repo. Which entries the owner has rights to comment on, or has commented on:
**NEEDS OWNER** (O-4).

## 4. Research entries (`/research/:id`) and "mathematical research notes"

| Item | Finding |
|---|---|
| Research entries | Live OpenAlex works filtered `is_oa:true` (`openalex.ts:159`); title/abstract/metadata from OpenAlex, PDF via `/api/pdf-proxy`. Open access ≠ licensed for commercial reuse (some are CC BY-NC). No original commentary. Label: **EMPTY** |
| Mathematical research notes | **None exist in the repo.** No notes data, route or component; `/research` is a search UI. The home page and "Explore Research Notes" CTA describe content that does not exist (O-6). There is nothing to compare for templating (H8) |
