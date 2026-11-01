#!/usr/bin/env node
/**
 * Print the reviewer's SPEC: the prompt file, then only the PLAN.md sections it lists under Inputs
 * ("docs/mathcore/PLAN.md, sections 7.2, 9"). A top-level number ("9") includes its subsections.
 *   usage: spec-sections.mjs <prompt.md> <PLAN.md>
 */
import { readFileSync } from "node:fs";

const [promptPath, planPath] = process.argv.slice(2);
const prompt = readFileSync(promptPath, "utf8");
const plan = readFileSync(planPath, "utf8").split("\n");

const listed = (prompt.match(/PLAN\.md, sections ([^\n]+)/)?.[1] ?? "")
  .split(",")
  .map((s) => s.trim().match(/^(\d+(?:\.\d+)?)/)?.[1])
  .filter(Boolean);

const out = [];
let keep = false;
for (const line of plan) {
  const h = line.match(/^(#{2,3}) (\d+(?:\.\d+)?)\.? /);
  if (h) {
    const num = h[2];
    keep = listed.some((s) => num === s || num.startsWith(s + "."));
    if (!keep && h[1] === "###") keep = listed.includes(num.split(".")[0]);
  }
  if (keep) out.push(line);
}

process.stdout.write(`## SPEC: prompt\n\n${prompt}\n\n## SPEC: PLAN.md sections ${listed.join(", ")}\n\n${out.join("\n")}\n`);
