/**
 * Build-time static rendering of the explanatory text for every indexable route.
 *
 * Why: the site is a client-only Vite SPA, so before this step every URL returned the same
 * index.html with one generic paragraph. Simulator theory, legal pages and the about/contact
 * copy only existed after JavaScript ran. Google recommends server-side rendering, static
 * rendering or hydration over workarounds such as dynamic rendering:
 *   https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering
 *   https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
 *
 * What it does: for each route below it writes dist/public/prerendered/<route>.html, a copy of the
 * built index.html with a route-specific <title>, meta description, canonical link and, inside the
 * existing #mae-seo container, the same text the React page renders for that route. The text is read
 * from the SAME locale JSON / data modules the components use, so the static HTML and the hydrated
 * page say the same thing. React replaces #root on mount exactly as before.
 *
 * What it does NOT do: no user-agent detection, no bot-only content. Every visitor and crawler gets
 * the same file for a given URL. The original index.html is kept as spa-shell.html for routes that are
 * not prerendered (library/research detail pages, unknown paths).
 *
 * Usage: runs after `vite build` (see package.json "build"). `--check` only verifies vercel.json.
 */
import fs from "node:fs";
import path from "node:path";
import katex from "katex";

import { SIMULATOR_SEO } from "../client/src/seo/simulatorSeoData";
import { localizedContent } from "../client/src/data/content";
import { simulationsCatalog } from "../client/src/data/platform";
import { GUIDE } from "../client/src/components/SimulationsGuide";
import type { ToolDoc } from "../client/src/components/simulations/toolDocs/types";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist", "public");
const OUT_DIR = path.join(DIST, "prerendered");
const SITE = "https://maeacademy.org";
const LOCALES = path.join(ROOT, "client", "src", "locales", "en");

const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── HTML helpers ────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Locale strings for legal pages carry a few trusted inline tags (<a>, <strong>); keep them, drop styling classes. */
const trustedInline = (s: string) => s.replace(/\sclass="[^"]*"/g, "");
const tex = (src: string, display: boolean) =>
  katex.renderToString(src, { output: "mathml", displayMode: display, throwOnError: false });
/** Same splitting rule as RichMathText.tsx: `$$...$$` display math, `$...$` inline math, the rest is text. */
const rich = (text: string) =>
  text
    .split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g)
    .map((part) => {
      if (part.startsWith("$$") && part.endsWith("$$") && part.length > 4) return tex(part.slice(2, -2), true);
      if (part.startsWith("$") && part.endsWith("$") && part.length > 2) return tex(part.slice(1, -1), false);
      return esc(part);
    })
    .join("");

// ── Simulator documentation (mirrors ToolDocumentation in SimulationDocumentation.tsx) ──────────
const simulationDocs = readJson(path.join(LOCALES, "simulationDocs.json"));
const S = simulationDocs.sections as Record<string, string>;
const L = simulationDocs.labels as Record<string, string>;

async function toolDocHtml(topic: string, toolId: string): Promise<string> {
  const docs = readJson(path.join(LOCALES, "toolDocs", `${topic}.json`)) as Record<string, ToolDoc>;
  const doc = docs[toolId];
  if (!doc) throw new Error(`No doc for ${topic}/${toolId}`);
  const equations: string[] =
    ((await import(`../client/src/components/simulations/toolDocs/equations/${topic}.ts`)).default as Record<string, string[]>)[toolId] ?? [];
  return [
    `<article lang="en">`,
    `<header><h2>${rich(doc.title)}</h2><p>${rich(doc.intro)}</p></header>`,
    `<section><h3>${esc(S.purpose)}</h3><p>${rich(doc.purpose)}</p></section>`,
    `<section><h3>${esc(S.model)}</h3>`,
    ...doc.model.map((m) => `<h4>${rich(m.heading)}</h4><p>${rich(m.body)}</p>`),
    `<h4>${esc(L.equations)}</h4>`,
    ...equations.map((e, i) => `<figure>${tex(e, true)}<figcaption>${rich(doc.equations[i] ?? "")}</figcaption></figure>`),
    `</section>`,
    `<section><h3>${esc(S.mapping)}</h3><dl>`,
    ...doc.mapping.map((m) => `<dt>${rich(m.term)}</dt><dd>${rich(m.body)}</dd>`),
    `</dl></section>`,
    `<section><h3>${esc(S.example)}</h3><h4>${rich(doc.example.title)}</h4><p>${rich(doc.example.problem)}</p><ol>`,
    ...doc.example.steps.map((s) => `<li><p>${rich(s.text)}</p>${s.tex ? tex(s.tex, true) : ""}</li>`),
    `</ol><p>${rich(doc.example.result)}</p></section>`,
    `<section><h3>${esc(S.applications)}</h3><dl>`,
    ...doc.applications.map((a) => `<dt>${rich(a.field)}</dt><dd>${rich(a.body)}</dd>`),
    `</dl></section>`,
    `</article>`,
  ].join("\n");
}

// ── Pages whose visible copy comes from i18next keys (extracted from the component source) ──────
/** t("a.b") keys in source order, resolved against one English namespace file. */
function keysFromSource(files: string[], ns: string, exclude: RegExp): string[] {
  const dict = readJson(path.join(LOCALES, `${ns}.json`));
  const out: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/\bt\(\s*["'`]([A-Za-z0-9_.]+)["'`]/g)) {
      const key = m[1];
      if (exclude.test(key)) continue;
      const value = key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), dict);
      if (typeof value === "string" && value.trim() && !out.includes(value)) out.push(value);
    }
  }
  return out;
}
/** Renders strings as a heading followed by paragraphs; the first string is the page <h1>. */
function copyBlocks(strings: string[], headingIdx: (i: number) => boolean = () => false) {
  return strings
    .map((s, i) => (i === 0 ? `<h1>${trustedInline(s)}</h1>` : headingIdx(i) ? `<h2>${trustedInline(s)}</h2>` : `<p>${trustedInline(s)}</p>`))
    .join("\n");
}
/** Legal pages: walk the namespace section in key order; keys named *title become headings. */
function legalHtml(section: string) {
  const legal = readJson(path.join(LOCALES, "legal.json"))[section];
  const parts: string[] = [];
  const walk = (node: unknown, key: string, depth: number) => {
    if (typeof node === "string") {
      if (key === "title" && depth === 0) parts.push(`<h1>${trustedInline(node)}</h1>`);
      else if (/title$/i.test(key)) parts.push(`<h2>${trustedInline(node)}</h2>`);
      else if (!/badge$/i.test(key)) parts.push(`<p>${trustedInline(node)}</p>`);
    } else if (Array.isArray(node)) node.forEach((v) => walk(v, key, depth + 1));
    else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, k, depth + (key ? 1 : 0));
  };
  walk(legal, "", 0);
  return parts.join("\n");
}

// ── Route table ─────────────────────────────────────────────────────────────
type Page = { route: string; title: string; description: string; canonical: string | null; body: () => Promise<string> | string; home?: boolean };

const en = localizedContent.en;
const cardTitle = (slug: string) => {
  const idx = simulationsCatalog.findIndex((m) => m.slug === slug);
  return en.collections.simulations.cards[idx]?.title ?? slug;
};
const seo = (p: string) => SIMULATOR_SEO.find((e) => e.path === p);

function simulatorPage(route: string, slug: string, topic: string, toolId: string, opts: { canonical?: string | null; seoPath?: string } = {}): Page {
  const entry = seo(opts.seoPath ?? route);
  const docs = readJson(path.join(LOCALES, "toolDocs", `${topic}.json`)) as Record<string, ToolDoc>;
  return {
    route,
    title: entry?.title ?? `${docs[toolId].title} | MAE Academy`,
    description: entry?.description ?? docs[toolId].intro.replace(/\$[^$]*\$/g, "").slice(0, 300),
    canonical: opts.canonical === undefined ? route : opts.canonical,
    body: async () => `<h1>${esc(cardTitle(slug))}</h1>\n${await toolDocHtml(topic, toolId)}`,
  };
}

const pages: Page[] = [
  {
    route: "/",
    home: true,
    title: "Model. Analyze. Engineering — MAE Academy", // Home.tsx usePageTitle
    description: "MAE Academy: a global platform for academic research, engineering courses, and practical simulations.",
    canonical: "/",
    // Home.tsx + EngineeringPlatformsSection; the AI callout is hidden in production (SHOW_MAE_AI = false).
    body: () => copyBlocks(keysFromSource(["client/src/pages/Home.tsx", "client/src/components/EngineeringPlatformsSection.tsx"], "landing", /^aiCallout\./)),
  },
  {
    route: "/simulations",
    title: "Interactive Simulations — MAE Academy",
    description: en.collections.simulations.description,
    canonical: "/simulations",
    body: () => {
      const g = GUIDE.en;
      const cards = simulationsCatalog.map((m, i) => {
        const c = en.collections.simulations.cards[i];
        return c ? `<li><a href="${m.href ?? `/simulations/${m.slug}`}">${esc(c.title)}</a> — ${esc(c.description)}</li>` : "";
      });
      return [
        `<h1>${esc(en.collections.simulations.title)}</h1><p>${esc(en.collections.simulations.description)}</p>`,
        `<ul>${cards.join("")}</ul>`,
        `<section><h2>${esc(g.title)}</h2>${g.intro.map((p) => `<p>${esc(p)}</p>`).join("")}`,
        `<h3>${esc(g.suitesTitle)}</h3><ul>${g.suites.map((s) => `<li><a href="${s.href}">${esc(s.name)}</a><p>${esc(s.text)}</p></li>`).join("")}</ul>`,
        `<h3>${esc(g.howTitle)}</h3><ul>${g.how.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></section>`,
      ].join("\n");
    },
  },
  // Control systems, power electronics, signals: the tool is the URL segment.
  ...["root-locus", "pid", "frequency-response", "state-space"].map((t) => simulatorPage(`/simulations/control-systems/${t}`, "control-systems", "control", t)),
  ...["rectifier", "inverter", "acvc", "chopper"].map((t) => simulatorPage(`/simulations/power-electronics/${t}`, "power-electronics", "powerElectronics", t)),
  ...["signal-operations-and-properties", "system-classification", "convolution-engine", "fourier-analysis", "laplace-s-plane"].map((t) =>
    simulatorPage(`/simulations/signals-and-systems/${t}`, "signals-and-systems", "signals", t)),
  simulatorPage("/simulations/circuit-lab", "circuit-lab", "circuits", "workspace"),
  ...["python", "cpp", "c", "masm8086"].map((t) => simulatorPage(`/simulations/code/${t}`, "code", "codeStudio", t)),
  // Query-string suites (?platform=logo, ?tool=kmap) share one file per path. The client sets the canonical for the
  // active mode, so the static file omits it rather than contradict the rendered page.
  simulatorPage("/simulations/plc", "plc", "plc", "ladder-s7-200", { canonical: null }),
  simulatorPage("/simulations/digital-logic-design", "digital-logic-design", "logic", "schematic", { canonical: null, seoPath: "/simulations/digital-logic-design?tool=schematic" }),
  simulatorPage("/simulations/arduino-studio", "arduino-studio", "arduino", "studio"),
  simulatorPage("/simulations/pneumatics-and-hydraulics", "pneumatics-and-hydraulics", "fluid", "pneumatics"),
  {
    route: "/about",
    title: "Founder & Leadership — MAE Academy" /* About.tsx usePageTitle */,
    description: "About MAE Academy and its founder.",
    canonical: "/about",
    body: () => copyBlocks(keysFromSource(["client/src/pages/About.tsx"], "about", /^(contact\.(copied|copy|mail)|dossier\.robotics\.photoSlot)$/)),
  },
  {
    route: "/contact",
    title: "Contact Us — MAE Academy",
    description: "Contact MAE Academy.",
    canonical: "/contact",
    // Validation, sending and success messages only appear after interaction, so they are left out.
    body: () => copyBlocks(keysFromSource(["client/src/pages/Contact.tsx"], "common", /^(contact\.(err\w*|success|sending)|footer\.)/)),
  },
  {
    route: "/library",
    title: "Academic Library — MAE Academy",
    description: readJson(path.join(LOCALES, "library.json")).header.description,
    canonical: "/library",
    body: () => copyBlocks(keysFromSource(["client/src/pages/AcademicLibrary.tsx"], "library", /^(search|filters|sort|pagination|empty|error|loading|card)\./)),
  },
  {
    route: "/research",
    title: "Academic Research — MAE Academy",
    description: readJson(path.join(LOCALES, "research.json")).header.description,
    canonical: "/research",
    body: () => copyBlocks(keysFromSource(["client/src/pages/Research.tsx"], "research", /^(search|filters|sort|pagination|empty|error|loading|card)\./)),
  },
  // /privacy and /privacy-policy render the same component; useCanonical maps /privacy-policy -> /privacy.
  { route: "/privacy", title: "Privacy Policy — MAE Academy", description: "MAE Academy privacy policy, cookies and advertising disclosures.", canonical: "/privacy", body: () => legalHtml("privacy") },
  { route: "/privacy-policy", title: "Privacy Policy — MAE Academy", description: "MAE Academy privacy policy, cookies and advertising disclosures.", canonical: "/privacy", body: () => legalHtml("privacy") },
  { route: "/terms", title: "Terms of Service — MAE Academy", description: "MAE Academy terms of service.", canonical: "/terms", body: () => legalHtml("terms") },
  { route: "/terms-of-service", title: "Terms of Service — MAE Academy", description: "MAE Academy terms of service.", canonical: "/terms", body: () => legalHtml("terms") },
  { route: "/attribution-policy", title: "Intellectual Property, Open Access & Academic Attribution Policy — MAE Academy", description: "Intellectual property, open access and attribution policy.", canonical: "/attribution-policy", body: () => legalHtml("attribution") },
];

export const PRERENDERED_ROUTES = pages.map((p) => p.route);
const fileFor = (route: string) => (route === "/" ? "index.html" : `prerendered${route}.html`);

const NAV = `<header><a href="/">MAE Academy</a><nav aria-label="Primary"><a href="/simulations">Simulations</a> <a href="/research">Research</a> <a href="/library">Library</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav></header>`;
const FOOTER = `<footer><a href="/privacy">Privacy Policy</a> <a href="/terms">Terms of Service</a> <a href="/attribution-policy">Attribution Policy</a> <a href="/about">About</a> <a href="/contact">Contact</a></footer>`;

function render(template: string, page: Page, body: string) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`);
  html = html.replace(/(<meta name="description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`);
  const head = [
    page.canonical ? `<link rel="canonical" href="${SITE}${page.canonical === "/" ? "/" : page.canonical}" />` : "",
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    page.canonical ? `<meta property="og:url" content="${SITE}${page.canonical}" />` : "",
  ].filter(Boolean).join("\n  ");
  html = html.replace(/(<meta name="google-adsense-account"[^>]*>)/, `$1\n  ${head}`);
  // The landing JSON-LD describes the home page only.
  if (!page.home) html = html.replace(/<script type="application\/ld\+json" id="mae-landing-jsonld">[\s\S]*?<\/script>\s*/, "");
  const seoStart = html.indexOf('<div id="mae-seo">');
  const seoEnd = html.indexOf("</div>", seoStart);
  if (seoStart < 0 || seoEnd < 0) throw new Error("#mae-seo container not found in built index.html");
  return `${html.slice(0, seoStart)}<div id="mae-seo">\n${NAV}\n<main>\n${body}\n</main>\n${FOOTER}\n${html.slice(seoEnd)}`;
}

/** Every prerendered route must have a matching rewrite in vercel.json, ahead of the catch-all. */
function checkVercel(): string[] {
  const vercel = readJson(path.join(ROOT, "vercel.json"));
  const rewrites: { source: string; destination: string }[] = vercel.rewrites ?? [];
  const problems: string[] = [];
  for (const route of PRERENDERED_ROUTES) {
    if (route === "/") continue;
    const idx = rewrites.findIndex((r) => r.source === route);
    const catchAll = rewrites.findIndex((r) => r.destination === "/spa-shell.html");
    if (idx < 0) problems.push(`missing rewrite for ${route}`);
    else if (rewrites[idx].destination !== `/${fileFor(route)}`) problems.push(`wrong destination for ${route}`);
    else if (catchAll >= 0 && idx > catchAll) problems.push(`rewrite for ${route} comes after the SPA catch-all`);
  }
  return problems;
}

async function main() {
  const problems = checkVercel();
  if (problems.length) {
    console.error(`prerender-static: vercel.json is out of sync:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--check")) return;

  const indexPath = path.join(DIST, "index.html");
  const shellPath = path.join(DIST, "spa-shell.html");
  // Re-runs must start from the untouched Vite output.
  const template = fs.existsSync(shellPath) ? fs.readFileSync(shellPath, "utf8") : fs.readFileSync(indexPath, "utf8");
  fs.writeFileSync(shellPath, template);

  for (const page of pages) {
    const out = path.join(DIST, fileFor(page.route));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, render(template, page, await page.body()));
  }
  console.log(`prerender-static: wrote ${pages.length} pages + spa-shell.html`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
