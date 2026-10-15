// 50-question multi-disciplinary benchmark with Claude as an independent judge.
//
//   npx tsx --env-file=../../../.env tests/benchmark-50-runner.mts <phase> [--only=1,2,3] [--force] [--concurrency=4]
//
// Phases (each is resumable and idempotent):
//   generate  ask the live MAE AI pipeline (streamChat) every question; stores responses + an objective KaTeX parse check
//   packets   write one self-contained judge prompt per question to docs/ai/benchmark-50-judge/qNN.prompt.md
//   judge     grade with the Anthropic Messages API (needs ANTHROPIC_API_KEY; model ANTHROPIC_JUDGE_MODEL)
//   merge     read judgments written to docs/ai/benchmark-50-judge/qNN.json (by the API judge or by Claude subagents)
//   report    write docs/ai/benchmark-50-report.md from the merged results
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import { sanitizeChatRequest, streamChat } from "../server/aiService";
import { QUESTIONS, type BenchmarkQuestion, type Tier } from "./benchmark-50-questions";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs/ai");
const RESULTS = join(OUT_DIR, "benchmark-50-results.json");
const REPORT = join(OUT_DIR, "benchmark-50-report.md");
const JUDGE_DIR = join(OUT_DIR, "benchmark-50-judge");
/** A response passes at or above this score (an automatic fail scores 0). */
const PASS_SCORE = 90;
const TIERS: Tier[] = ["easy", "intermediate", "advanced", "elite"];

export const RUBRIC = `You are an independent external professor and examiner grading an AI teaching assistant's answer. Grade rigorously: re-derive every number and formula yourself before trusting the answer.

Score out of 100:
- accuracy (0-40): every intermediate algebraic step, numerical result and formula is correct; no sign inversions or dropped terms. Re-compute numbers.
- formatting (0-20): standard LaTeX ($inline$ and $$display$$), no unparsed dollar strings, SI units with proper prefixes.
- pedagogy (0-20): clear physical rationale, governing laws identified, structural rigor.
- sanity (0-20): dimensional homogeneity, limiting cases and physical realizability checked.
AUTOMATIC FAIL (final score 0, set auto_fail=true and say why): hallucinated physical equations or unphysical results; skipping algebra on an advanced or elite derivation request; broken LaTeX that fails KaTeX parsing (an objective KaTeX report is provided).
Do not reward length. Penalise any confident wrong claim more than an honest "cannot verify". If the question itself contains a flawed premise, credit the answer for catching it.

Reply with ONE JSON object and nothing else:
{"score": number, "breakdown": {"accuracy": n, "formatting": n, "pedagogy": n, "sanity": n}, "auto_fail": boolean, "auto_fail_reason": string, "errors": [string, ...], "summary": string}
"errors" lists every concrete mistake or gap (quote the line and give the correct value); [] if none.`;

interface Judgment { score: number; breakdown: Record<string, number>; auto_fail: boolean; auto_fail_reason: string; errors: string[]; summary: string; judge: string }
interface Result {
  id: number; discipline: string; tier: Tier; prompt: string;
  response?: string; ms?: number; generateError?: string;
  latex?: { spans: number; errors: string[] };
  judgment?: Judgment;
}

const args = process.argv.slice(2);
const phase = args.find((a) => !a.startsWith("--")) ?? "generate";
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const only = flag("only")?.split(",").map(Number);
const force = args.includes("--force");
const concurrency = Number(flag("concurrency") ?? 4);

mkdirSync(JUDGE_DIR, { recursive: true });
const pad = (n: number) => String(n).padStart(2, "0");

function load(): Result[] {
  const saved: Result[] = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : [];
  return QUESTIONS.map((q) => ({ id: q.id, discipline: q.discipline, tier: q.tier, prompt: q.prompt, ...(saved.find((r) => r.id === q.id) ?? {}) }));
}
const save = (rs: Result[]) => writeFileSync(RESULTS, JSON.stringify(rs, null, 1));
const selected = (rs: Result[]) => rs.filter((r) => !only || only.includes(r.id));

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** Objective KaTeX check: parses every $$...$$ and $...$ span outside code fences with throwOnError. */
export function checkLatex(markdown: string): { spans: number; errors: string[] } {
  const text = markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ");
  const spans: { tex: string; display: boolean }[] = [];
  const rest = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => { spans.push({ tex, display: true }); return " "; });
  for (const m of rest.matchAll(/(?<![\\$])\$([^$\n]+?)\$/g)) spans.push({ tex: m[1], display: false });
  const errors: string[] = [];
  for (const s of spans) {
    try { katex.renderToString(s.tex, { displayMode: s.display, throwOnError: true, strict: "ignore" }); }
    catch (e) { errors.push(`${(e as Error).message.slice(0, 120)} | ${s.tex.slice(0, 80).replace(/\n/g, " ")}`); }
  }
  if ((rest.match(/\$/g) ?? []).length % 2 === 1) errors.push("odd number of unescaped $ delimiters (unclosed math)");
  return { spans: spans.length, errors };
}

async function generate(rs: Result[]) {
  const todo = selected(rs).filter((r) => force || !r.response);
  console.log(`generate: ${todo.length} questions, concurrency ${concurrency}`);
  await pool(todo, concurrency, async (r) => {
    const q = QUESTIONS.find((x) => x.id === r.id) as BenchmarkQuestion;
    const started = Date.now();
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const req = sanitizeChatRequest({ messages: [{ id: "u", role: "user", content: q.prompt, timestamp: 1 }], lab: q.lab, stepMode: false });
        let text = "";
        for await (const c of streamChat(req)) text += c;
        r.response = text; r.ms = Date.now() - started; r.latex = checkLatex(text); delete r.generateError; delete r.judgment;
        console.log(`  q${pad(r.id)} ok ${(r.ms / 1000).toFixed(0)}s ${text.length} chars, latex errors ${r.latex.errors.length}`);
        break;
      } catch (e) {
        r.generateError = (e as Error).message;
        console.log(`  q${pad(r.id)} attempt ${attempt} failed: ${r.generateError.slice(0, 140).replace(/\s+/g, " ")}`);
        if (/429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|quota/i.test(r.generateError)) await new Promise((res) => setTimeout(res, 65_000)); // per-minute token quota / demand spike
      }
    }
    save(rs);
  });
}

function judgePrompt(r: Result): string {
  const latex = r.latex?.errors.length ? `KaTeX parse errors (${r.latex.errors.length}):\n${r.latex.errors.map((e) => `- ${e}`).join("\n")}` : `KaTeX parse check: all ${r.latex?.spans ?? 0} math spans parse cleanly.`;
  return `${RUBRIC}\n\n=== DISCIPLINE / TIER ===\n${r.discipline} / ${r.tier}\n\n=== QUESTION ===\n${r.prompt}\n\n=== OBJECTIVE LATEX REPORT ===\n${latex}\n\n=== ANSWER UNDER REVIEW ===\n${r.response}\n`;
}

function packets(rs: Result[]) {
  for (const r of selected(rs).filter((x) => x.response)) writeFileSync(join(JUDGE_DIR, `q${pad(r.id)}.prompt.md`), judgePrompt(r));
  console.log(`packets: wrote ${selected(rs).filter((x) => x.response).length} judge prompts to ${JUDGE_DIR}`);
}

function parseJudgment(raw: string, judge: string): Judgment {
  const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  const j = JSON.parse(json) as Judgment;
  if (typeof j.score !== "number") throw new Error("judgment has no numeric score");
  j.judge = judge;
  return j;
}

async function judgeApi(rs: Result[]) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set; use `packets` + `merge` instead.");
  const model = process.env.ANTHROPIC_JUDGE_MODEL ?? "claude-opus-5-5";
  const todo = selected(rs).filter((r) => r.response && (force || !r.judgment));
  await pool(todo, 3, async (r) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 16000, thinking: { type: "enabled", budget_tokens: 10000 }, messages: [{ role: "user", content: judgePrompt(r) }] }),
    });
    if (!res.ok) { console.log(`  q${pad(r.id)} judge HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return; }
    const body = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = body.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    try { r.judgment = parseJudgment(text, model); console.log(`  q${pad(r.id)} score ${r.judgment.score}`); } catch (e) { console.log(`  q${pad(r.id)} unparsable judgment: ${(e as Error).message}`); }
    save(rs);
  });
}

function merge(rs: Result[]) {
  let n = 0;
  for (const r of rs) {
    const file = join(JUDGE_DIR, `q${pad(r.id)}.json`);
    if (!existsSync(file)) continue;
    try { r.judgment = parseJudgment(readFileSync(file, "utf8"), "claude-subagent"); n++; } catch (e) { console.log(`  q${pad(r.id)} bad judgment file: ${(e as Error).message}`); }
  }
  save(rs);
  console.log(`merge: ${n} judgments merged`);
}

/** Final score: an automatic fail or a KaTeX parse failure scores 0, per the rubric. */
const finalScore = (r: Result) => (!r.judgment ? undefined : r.judgment.auto_fail || (r.latex?.errors.length ?? 0) > 0 ? 0 : r.judgment.score);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isNaN(x) ? "n/a" : x.toFixed(1));

function report(rs: Result[]) {
  const judged = rs.filter((r) => finalScore(r) !== undefined);
  const scores = judged.map((r) => finalScore(r) as number);
  const passed = judged.filter((r) => (finalScore(r) as number) >= PASS_SCORE);
  const lines: string[] = [
    "# MAE AI 50-question benchmark (Claude as judge)", "",
    `Generated ${new Date().toISOString()}. Responses: ${rs.filter((r) => r.response).length}/${rs.length}. Judged: ${judged.length}/${rs.length}. Pass mark: ${PASS_SCORE}/100 (an automatic fail or any KaTeX parse error scores 0).`, "",
    ...(judged.length < rs.length ? [`> **PARTIAL RUN: only ${judged.length} of ${rs.length} questions were answered and judged, so these numbers are not the 50-question verdict.** Generation stops when the Gemini API quota runs out (the free tier allows 20 requests/day for gemini-flash-latest). Re-run \`generate\` once quota is available; it resumes where it stopped.`, ""] : []),
    "## Overall", "",
    `- **Passing: ${passed.length}/${judged.length} = ${f1((100 * passed.length) / Math.max(1, judged.length))}%** (target >= 98%)`,
    `- Mean score: ${f1(mean(scores))}/100`,
    `- Automatic fails: ${judged.filter((r) => r.judgment?.auto_fail).length}; KaTeX-parse failures: ${rs.filter((r) => (r.latex?.errors.length ?? 0) > 0).length}`, "",
    "## Average by difficulty tier", "", "| Tier | Questions | Mean score | Pass |", "|---|---|---|---|",
    ...TIERS.map((t) => { const g = judged.filter((r) => r.tier === t); return `| ${t} | ${g.length} | ${f1(mean(g.map((r) => finalScore(r) as number)))} | ${g.filter((r) => (finalScore(r) as number) >= PASS_SCORE).length}/${g.length} |`; }),
    "", "## Average by discipline", "", "| Discipline | Questions | Mean score | Pass |", "|---|---|---|---|",
    ...[...new Set(rs.map((r) => r.discipline))].map((d) => { const g = judged.filter((r) => r.discipline === d); return `| ${d} | ${g.length} | ${f1(mean(g.map((r) => finalScore(r) as number)))} | ${g.filter((r) => (finalScore(r) as number) >= PASS_SCORE).length}/${g.length} |`; }),
    "", "## Per-question results", "", "| # | Tier | Discipline | Score | Accuracy/Format/Pedagogy/Sanity | Verdict |", "|---|---|---|---|---|---|",
    ...rs.map((r) => { const j = r.judgment; const b = j?.breakdown; return `| ${r.id} | ${r.tier} | ${r.discipline} | ${finalScore(r) ?? "-"} | ${b ? `${b.accuracy}/${b.formatting}/${b.pedagogy}/${b.sanity}` : "-"} | ${j ? (j.auto_fail ? `AUTO-FAIL: ${j.auto_fail_reason}` : j.summary).replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 160) : r.generateError ?? "not judged"} |`; }),
    "", "## Failures and defects found", "",
  ];
  const bad = judged.filter((r) => (finalScore(r) as number) < PASS_SCORE || (r.judgment?.errors.length ?? 0) > 0);
  if (!bad.length) lines.push("None.");
  for (const r of bad) {
    lines.push(`### Q${r.id} (${r.tier}, ${r.discipline}): ${finalScore(r)}/100`, "");
    for (const e of r.judgment?.errors ?? []) lines.push(`- ${e.replace(/\n/g, " ")}`);
    for (const e of r.latex?.errors ?? []) lines.push(`- KaTeX: ${e}`);
    lines.push("");
  }
  writeFileSync(REPORT, lines.join("\n"));
  console.log(lines.slice(0, 14).join("\n"));
}

const rs = load();
if (phase === "generate") await generate(rs);
else if (phase === "packets") packets(rs);
else if (phase === "judge") await judgeApi(rs);
else if (phase === "merge") merge(rs);
else if (phase === "report") report(rs);
else throw new Error(`unknown phase ${phase}`);
save(rs);
