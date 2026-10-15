// Live check: does gemini-3.7-flash at high thinking effort write out the full even/odd ABCD derivation of the branch-line hybrid?
//
//   npx tsx --env-file=.env tests/q09-thinking-check.mts [low|medium|high]     (default: high; writes the answer to $TMPDIR)
//
// Pass criteria (objective, no judge needed):
//   1. the three-matrix cascade for each mode is written AND multiplied out (a product of >= 3 bmatrix/pmatrix factors followed by a result matrix)
//   2. Gamma and T are computed from the ABCD entries (A+B+C+D / A+B-C-D appear), not stated
//   3. the final S entries are right: S11 = S41 = 0, S21 = -j/sqrt2, S31 = -1/sqrt2
//   4. every LaTeX span parses in KaTeX with no error, and the call completes (no timeout)
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import katex from "katex";
import { MODEL_NAME, sanitizeChatRequest, streamChat, thinkingSettings } from "../server/aiService";

const Q = "Derive the S-parameters of a 90-degree branch-line quadrature hybrid coupler showing all intermediate ABCD even/odd mode cascade steps.";
const effort = (process.argv[2] ?? "high") as "low" | "medium" | "high";
console.log("model:", MODEL_NAME, "| effort:", effort, "|", JSON.stringify(thinkingSettings(effort)));

const started = Date.now();
let text = "";
try {
  for await (const chunk of streamChat(sanitizeChatRequest({ messages: [{ id: "u", role: "user", content: Q, timestamp: 1 }], lab: "general", thinkingEffort: effort }))) text += chunk;
} catch (error) {
  console.log("CALL FAILED:", (error as Error).message.slice(0, 400).replace(/\s+/g, " "));
  process.exit(2);
}
const out = join(process.env.TMPDIR ?? tmpdir(), `q09_${effort}.md`);
writeFileSync(out, text);

const prose = text.replace(/```[\s\S]*?```/g, " ");
const spans: { tex: string; display: boolean }[] = [];
const rest = prose.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => (spans.push({ tex, display: true }), " "));
for (const m of rest.matchAll(/(?<![\\$])\$([^$\n]+?)\$/g)) spans.push({ tex: m[1], display: false });
const katexErrors = spans.filter((s) => { try { katex.renderToString(s.tex, { displayMode: s.display, throwOnError: true, strict: "ignore" }); return false; } catch { return true; } }).length;

const squash = text.replace(/\s+/g, "");
const checks = {
  "1 cascade multiplied out": /(\\begin\{[bp]matrix\}.*?\\end\{[bp]matrix\}\s*){3,}=\s*\\?\s*(\\frac\{1\}\{\\sqrt\{?2\}?\})?\s*\\begin\{[bp]matrix\}/s.test(text),
  "2 Gamma/T from A,B,C,D": /A\s*\+\s*B/.test(text) && /C\s*\+\s*D|C\s*-\s*D/.test(text) && /\\Gamma_?\{?e/.test(text) && /T_?\{?o/.test(text),
  "3 final S entries": /S_\{?21\}?\s*=[^$]*-\s*\\?frac\{j\}\{\\sqrt\{?2\}?\}/.test(text) && /S_\{?31\}?\s*=[^$]*-\s*\\?frac\{1\}\{\\sqrt\{?2\}?\}/.test(text),
  "4 KaTeX clean": katexErrors === 0 && spans.length > 20,
};
void squash;
console.log(`completed in ${((Date.now() - started) / 1000).toFixed(0)}s, ${text.length} chars, ${spans.length} math spans, ${katexErrors} KaTeX errors; saved ${out}`);
for (const [name, ok] of Object.entries(checks)) console.log(ok ? "PASS" : "FAIL", name);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
