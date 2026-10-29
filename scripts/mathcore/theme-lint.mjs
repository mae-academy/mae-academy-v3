#!/usr/bin/env node
/**
 * Theme lint for mathcore paths: no hardcoded colors, font families, or pixel spacing.
 * Those values live only in the design tokens file (client/src/index.css, owner decision 2026-10-29);
 * mathcore code reads them through CSS variables. Exit 1 on any finding.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["shared/mathcore", "client/src/features/mathcore"];
const SKIP = /(__golden__|\.test\.tsx?$|\.spec\.tsx?$)/;
const EXT = /\.(tsx?|css|mjs|js)$/;

const RULES = [
  ["hex color", /#[0-9a-fA-F]{3,8}\b(?![\w-])/],
  ["color function", /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\(/],
  ["font family", /font-?family|fontFamily/i],
  ["pixel spacing", /\b\d+(?:\.\d+)?px\b/],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.test(p) && !SKIP.test(p)) yield p;
  }
}

const findings = [];
for (const root of ROOTS.filter((r) => existsSync(r))) {
  for (const file of walk(root)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const [label, re] of RULES) if (re.test(line)) findings.push(`${file}:${i + 1}: ${label}: ${line.trim()}`);
    });
  }
}

if (findings.length) {
  console.error(`theme lint: ${findings.length} hardcoded value(s); use the tokens in client/src/index.css`);
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log("theme lint: clean");
