# Phase 1 / Phase 5 — raw HTML results

**Method.** `pnpm build`, then `tools/serve-like-vercel.mjs` serves `dist/public` applying `vercel.json`
(redirects → static file → first matching rewrite → `404.html`). `tools/raw-html-check.py` fetches every URL with
`curl -s -A "Mediapartners-Google"` and saves the body to `evidence/<before|after>/`. "Words" = `\w+` tokens of the
raw HTML after removing `<script>`, `<style>`, `<noscript>`, `<template>`, comments, all tags and all `<math>`
(equation markup), so it counts prose only. It includes nav/footer link text (≈20 words).

**Limits.**
- The live site could not be fetched: the session's egress proxy refused `CONNECT maeacademy.org` (HTTP 403). The
  same applied to `developers.google.com` and `support.google.com`. Live-site status, Vercel edge behaviour, any
  Vercel Firewall / Bot Protection / Attack Challenge Mode, and real crawler IP behaviour are **UNTESTABLE here**.
- `serve-like-vercel.mjs` is a local approximation, not Vercel. Re-run the same curls against a Vercel preview URL
  (commands in VERIFICATION.md).
- `/library/<id>` and `/research/<id>` use made-up ids; the shell is identical for every id.

## Before (HEAD `8c43826`, unmodified build)

| URL | status | words (visible, raw HTML) | AdSense in head | canonical | title |
|---|---|---|---|---|---|
| `/` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations/control-systems/pid` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations/control-systems/root-locus` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations/power-electronics/rectifier` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations/plc` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/simulations/code/masm8086` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/library` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/library/ia:example-id` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/research` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/research/W2741809807` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/about` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/contact` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/privacy` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/privacy-policy` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/terms` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/attribution-policy` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/ar` | 404 | 25 | no | — | Page not found | MAE Academy |
| `/es` | 404 | 25 | no | — | Page not found | MAE Academy |
| `/robots.txt` | 200 | n/a | no | — | — |
| `/sitemap.xml` | 200 | n/a | no | — | — |
| `/ads.txt` | 200 | n/a | no | — | — |
| `/this-page-does-not-exist` | 404 | 25 | no | — | Page not found | MAE Academy |

All 17 HTML routes that returned 200 had byte-identical bodies (sha256 checked on `/`, `/simulations/control-systems/pid`,
`/about`, `/privacy`: 1 unique hash). No `<link rel="canonical">` existed in any raw response; it was only added by
JavaScript (`client/src/hooks/useCanonical.ts:51`).

## After (this branch)

| URL | status | words (visible, raw HTML) | AdSense in head | canonical | title |
|---|---|---|---|---|---|
| `/` | 200 | 247 | yes | https://maeacademy.org/ | Model. Analyze. Engineering — MAE Academy |
| `/simulations` | 200 | 535 | yes | https://maeacademy.org/simulations | Interactive Simulations — MAE Academy |
| `/simulations/control-systems/pid` | 200 | 747 | yes | https://maeacademy.org/simulations/control-systems/pid | Online PID Tuner & Controller Simulator – Step Response | MAE Academy |
| `/simulations/control-systems/root-locus` | 200 | 879 | yes | https://maeacademy.org/simulations/control-systems/root-locus | Online Root Locus Plotter – Interactive Control System Analysis | MAE Academy |
| `/simulations/power-electronics/rectifier` | 200 | 812 | yes | https://maeacademy.org/simulations/power-electronics/rectifier | Controlled Rectifier Simulator Online – Thyristor Firing Angle | MAE Academy |
| `/simulations/plc` | 200 | 978 | yes | — | Online PLC Ladder Logic Simulator (Siemens S7-200) | MAE Academy |
| `/simulations/code/masm8086` | 200 | 821 | yes | https://maeacademy.org/simulations/code/masm8086 | Online 8086 Assembly Emulator – Registers, Flags & Stack | MAE Academy |
| `/library` | 200 | 118 | yes | https://maeacademy.org/library | Academic Library — MAE Academy |
| `/library/ia:example-id` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/research` | 200 | 102 | yes | https://maeacademy.org/research | Academic Research — MAE Academy |
| `/research/W2741809807` | 200 | 62 | yes | — | MAE Academy — Free Online Engineering Simulators & Courses |
| `/about` | 200 | 116 | yes | https://maeacademy.org/about | Founder & Leadership — MAE Academy |
| `/contact` | 200 | 72 | yes | https://maeacademy.org/contact | Contact Us — MAE Academy |
| `/privacy` | 200 | 806 | yes | https://maeacademy.org/privacy | Privacy Policy — MAE Academy |
| `/privacy-policy` | 200 | 806 | yes | https://maeacademy.org/privacy | Privacy Policy — MAE Academy |
| `/terms` | 200 | 436 | yes | https://maeacademy.org/terms | Terms of Service — MAE Academy |
| `/attribution-policy` | 200 | 281 | yes | https://maeacademy.org/attribution-policy | Intellectual Property, Open Access & Academic Attribution Policy — MAE Academy |
| `/ar` | 404 | 25 | no | — | Page not found | MAE Academy |
| `/es` | 404 | 25 | no | — | Page not found | MAE Academy |
| `/robots.txt` | 200 | n/a | no | — | — |
| `/sitemap.xml` | 200 | n/a | no | — | — |
| `/ads.txt` | 200 | n/a | no | — | — |
| `/this-page-does-not-exist` | 404 | 25 | no | — | Page not found | MAE Academy |

`/library/<id>`, `/research/<id>` still get the generic shell (62 words) — see OPEN-ITEMS.md (library/research).
`/ar` and `/es` return 404 before and after: no language URLs exist (H5).

## AdSense snippet in raw `<head>`

Present before and after on every HTML route served from `index.html`/prerendered pages
(`client/index.html:58`, `async src=".../adsbygoogle.js?client=ca-pub-1937330840014217" crossorigin="anonymous"`),
plus `<meta name="google-adsense-account">` at `client/index.html:10`. Not present on `404.html` (static 404 page; no ads expected there).

## Challenge pages

No response contained challenge markers (`cf-chl`, `challenge-platform`, "Just a moment"). This only covers the
repository output served locally; edge-level challenges cannot be observed here.

## robots.txt (`client/public/robots.txt`, unchanged)

```
User-agent: Mediapartners-Google
Disallow:

User-agent: Googlebot
Disallow:

User-agent: AdsBot-Google
Disallow:

User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://maeacademy.org/sitemap.xml
```

| Crawler | Group that applies | Effect |
|---|---|---|
| Mediapartners-Google | its own group (`Disallow:` empty) | nothing blocked |
| Googlebot | its own group (`Disallow:` empty) | nothing blocked, including `/api/` used by library/research rendering |
| AdsBot-Google | its own group | nothing blocked |
| Google-Display-Ads-Bot | no named group → `*` | `/api/` disallowed; HTML, JS (`/assets/`), CSS, fonts, images allowed |

Per Google's robots.txt documentation, a crawler obeys only the most specific group that names it; the AdSense
crawler documentation states Mediapartners-Google ignores the `*` group (official URLs in CHANGES.md §References;
not re-fetched this session). No JS/CSS/render resource is blocked for Googlebot or Mediapartners-Google, so
**no robots.txt change was made**.

## ads.txt / sitemap.xml

`/ads.txt` → 200, body `google.com, pub-1937330840014217, DIRECT, f08c47fec0942fa0` (already present, unchanged).
`/sitemap.xml` → 200; per-URL status and canonical are in `phase5-local-checks.md`.
