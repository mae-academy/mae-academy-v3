// Autonomous multi-discipline audit of the live chat endpoint.
//
//   AUDIT_BASE=http://localhost:5055 AUDIT_SERVER_LOG=/path/to/server.log npx tsx scripts/autonomous-audit.mts
//
// Posts one real question per engineering discipline to POST /api/ai/chat, reads the SSE stream, and checks the reply for
// (1) HTTP 200 and a clean stream, (2) the expected numbers, (3) KaTeX hygiene (balanced $ / $$, no raw \( \) or leaked
// sandbox code, balanced code fences). The PDF case sends a generated exam PDF to prove the PDF + code-execution 400 is gone.
// Also probes the 72 MB body limit. If AUDIT_SERVER_LOG points at the server's stdout log, the model-fallback lines each request
// produced are attached to its row. Writes docs/ai/autonomous-run-live.md (live section) and exits non-zero on any failure.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { normalizeMathDelimiters } from "../client/src/components/ai/mathDelimiters";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:5055";
const LOG = process.env.AUDIT_SERVER_LOG;
const OUT = process.env.AUDIT_OUT ?? "docs/ai/autonomous-run-live.md";
const ORIGIN = process.env.AUDIT_ORIGIN ?? "http://localhost:5173";

interface Case {
  id: string;
  title: string;
  prompt: string;
  lab: string;
  /** Each regex must match the reply (whitespace-normalised). */
  expect: { label: string; re: RegExp }[];
  pdf?: Buffer;
}

/** A minimal one-page text PDF (Helvetica, ASCII only) holding the given lines. */
function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = `BT /F1 12 Tf 50 780 Td 16 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const EXAM = [
  "Mechatronics Exam - Answer both questions",
  "Q1. A 12 V source drives R1 = 1 kOhm in series with R2 = 2 kOhm. Find the loop current.",
  "Q2. A DC motor has torque constant Kt = 0.05 N.m/A and draws I = 2 A. Find the shaft torque.",
];

const CASES: Case[] = [
  {
    id: "power", title: "Electrical & Power Electronics", lab: "power",
    prompt: "Solve a 3-phase full-wave uncontrolled bridge rectifier supplying an RL load (R=10 ohm, L=50mH, V_LL=400V RMS, 50Hz). Calculate average output voltage V_dc and average diode current.",
    expect: [{ label: "V_dc ≈ 540 V", re: /\b5[34]\d(\.\d+)?\s*(\\,|\\;|\s)*(\\text\{\s*)?V\b|\b540\b/ }, { label: "I_dc ≈ 54 A", re: /\b5[34](\.\d+)?\s*(\\,|\s)*(\\text\{\s*)?A\b/ }, { label: "diode avg ≈ 18 A", re: /\b1[78](\.\d+)?\s*(\\,|\s)*(\\text\{\s*)?A\b/ }],
  },
  {
    id: "control", title: "Control Systems", lab: "control",
    prompt: "A unity feedback plant has G(s) = K / (s(s+2)(s+5)). Find the range of K for stability using Routh-Hurwitz criterion, and find the marginal frequency of oscillation.",
    expect: [{ label: "0 < K < 70", re: /\b70\b/ }, { label: "ω = √10 ≈ 3.16 rad/s", re: /3\.16|\\sqrt\{\s*10\s*\}|√10/ }],
  },
  {
    id: "robotics", title: "Robotics & Kinematics", lab: "code",
    prompt: "Derive the forward kinematics and the 2x2 Jacobian matrix for a 2-DOF planar RR manipulator with link lengths L1, L2 and joint angles theta1, theta2.",
    expect: [{ label: "Jacobian given", re: /Jacobian/i }, { label: "θ1+θ2 terms", re: /\\theta_\{?1\}?\s*\+\s*\\theta_\{?2\}?|\\theta_\{?12\}?|q_1\s*\+\s*q_2/ }, { label: "L1/L2 terms", re: /L_\{?1\}?[\s\S]*L_\{?2\}?/ }],
  },
  {
    id: "thermo", title: "Mechanical & Thermodynamics", lab: "circuits",
    prompt: "An ideal Brayton cycle operates with a pressure ratio of 8. The compressor inlet temperature is 300K and turbine inlet is 1300K. With gamma=1.4, calculate thermal efficiency and net specific work output.",
    expect: [{ label: "η ≈ 44.8 %", re: /44\.[5-9]|0\.44[5-9]/ }, { label: "w_net ≈ 340 kJ/kg", re: /3[3-4]\d(\.\d+)?\s*(\\,|\s)*(\\text\{\s*)?kJ/ }],
  },
  {
    id: "telecom", title: "Telecommunications & Networks", lab: "circuits",
    prompt: "A 15km single-mode optical fiber link has attenuation alpha=0.25 dB/km, with 3 splices (0.1 dB each) and 2 connectors (0.5 dB each). Calculate total optical power loss in dB and minimum transmitter power for a receiver sensitivity of -30 dBm.",
    expect: [{ label: "loss = 5.05 dB", re: /5\.05/ }, { label: "P_tx,min = -24.95 dBm", re: /-\s*24\.95|−\s*24\.95/ }],
  },
  {
    id: "cpp", title: "Computer Science & Architecture", lab: "code",
    prompt: "Write an efficient C++ function for an LRU Cache using std::list and std::unordered_map. Include O(1) get and put complexity analysis.",
    expect: [{ label: "std::list", re: /std::list/ }, { label: "std::unordered_map", re: /std::unordered_map/ }, { label: "O(1)", re: /O\(1\)|O\(\s*1\s*\)/ }, { label: "splice/move-to-front", re: /splice|push_front|move/i }],
  },
  {
    id: "pdf", title: "Document Analysis (PDF)", lab: "circuits",
    prompt: "Solve every question in the attached exam step by step.",
    pdf: makePdf(EXAM),
    expect: [{ label: "Q1: 4 mA", re: /\b4\s*(\\,|\s)*(\\text\{\s*)?mA\b|0\.004/ }, { label: "Q2: 0.1 N·m", re: /0\.1\b/ }],
  },
];

/** Reply-quality checks that apply to every discipline. */
function hygiene(raw: string): string[] {
  const issues: string[] = [];
  // The client rewrites \( \) and \[ \] to $ / $$ before rendering (AiMarkdown), so check what the student actually sees.
  const text = normalizeMathDelimiters(raw);
  const noFences = text.replace(/```[\s\S]*?```/g, "");
  if ((text.match(/```/g) ?? []).length % 2) issues.push("unbalanced ``` code fence");
  if ((noFences.match(/\$\$/g) ?? []).length % 2) issues.push("unbalanced $$ display math");
  if ((noFences.replace(/\$\$/g, "").replace(/\\\$/g, "").match(/\$/g) ?? []).length % 2) issues.push("unbalanced $ inline math");
  // A single backslash before ( ) [ ] is a delimiter; a doubled one (`\\[8pt]` matrix row spacing) is not.
  if (/(?<!\\)\\[()[\]]/.test(noFences)) issues.push("raw \\( \\) / \\[ \\] delimiters instead of $ / $$");
  if (/executableCode|codeExecutionResult|default_api|print\(default/i.test(text)) issues.push("sandbox/internal code leaked into the reply");
  if (!/[$]/.test(noFences) && text.length > 400 && !/^```/m.test(text)) issues.push("no KaTeX math at all in a long answer");
  return issues;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logSize = () => { try { return LOG ? statSync(LOG).size : 0; } catch { return 0; } };
const logSince = (from: number) => {
  if (!LOG) return [] as string[];
  try { return readFileSync(LOG, "utf8").slice(from).split("\n").filter((l) => /Model Fallback|Key Rotator|MAE AI (chat failed|upstream)/.test(l)); } catch { return []; }
};

interface Row { id: string; title: string; status: "PASS" | "FAIL"; http: number; ms: number; notes: string[]; log: string[]; chars: number; attempts: number }

async function ask(c: Case): Promise<{ http: number; text: string; mode: string; error?: string }> {
  const message: Record<string, unknown> = { role: "user", content: c.prompt };
  if (c.pdf) message.document = { name: "mechatronics-exam.pdf", mimeType: "application/pdf", size: c.pdf.length, dataUrl: `data:application/pdf;base64,${c.pdf.toString("base64")}` };
  const res = await fetch(`${BASE}/api/ai/chat`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ messages: [message], lab: c.lab, thinkingEffort: "medium" }) });
  const mode = res.headers.get("x-mae-ai-mode") ?? "";
  if (!res.ok) return { http: res.status, text: "", mode, error: await res.text().catch(() => "") };
  let text = "";
  let error: string | undefined;
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!frame.startsWith("data: ")) continue;
      const ev = JSON.parse(frame.slice(6)) as { type: string; text?: string; message?: string };
      if (ev.type === "delta") text += ev.text ?? "";
      else if (ev.type === "error") error = ev.message;
    }
  }
  return { http: res.status, text, mode, error };
}

async function runCase(c: Case): Promise<Row> {
  const t0 = Date.now();
  const logFrom = logSize();
  let r = await ask(c);
  let attempts = 1;
  // Self-heal: one retry after a pause for a transient failure that survived the whole model cascade.
  if (r.http !== 200 || r.error || !r.text) { await sleep(8000); r = await ask(c); attempts = 2; }
  if (process.env.AUDIT_DUMP) writeFileSync(`${process.env.AUDIT_DUMP}/${c.id}.md`, r.text);
  const flat = r.text.replace(/\s+/g, " ");
  const notes: string[] = [];
  if (r.http !== 200) notes.push(`HTTP ${r.http}: ${r.error?.slice(0, 120) ?? ""}`);
  else if (r.error) notes.push(`stream error: ${r.error}`);
  else if (!r.text) notes.push("empty reply");
  else {
    if (r.mode !== "live") notes.push(`mode=${r.mode} (not a live model reply)`);
    for (const e of c.expect) if (!e.re.test(flat)) notes.push(`missing: ${e.label}`);
    notes.push(...hygiene(r.text).map((h) => `format: ${h}`));
  }
  const ok = r.http === 200 && !r.error && !!r.text && r.mode === "live" && notes.length === 0;
  return { id: c.id, title: c.title, status: ok ? "PASS" : "FAIL", http: r.http, ms: Date.now() - t0, notes, log: logSince(logFrom), chars: r.text.length, attempts };
}

async function probeBodyLimit(): Promise<{ at70: number; at74: number }> {
  const post = async (mb: number) => {
    const body = JSON.stringify({ messages: [], pad: "x".repeat(mb * 1024 * 1024) }); // invalid chat on purpose: nothing is sent to Gemini
    const res = await fetch(`${BASE}/api/ai/chat`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body });
    await res.text().catch(() => "");
    return res.status;
  };
  return { at70: await post(70), at74: await post(74) };
}

const rows: Row[] = [];
console.log(`Auditing ${BASE}\n`);
const limit = await probeBodyLimit();
console.log(`body limit: 70 MB -> HTTP ${limit.at70} (must not be 413) | 74 MB -> HTTP ${limit.at74} (expected 413)`);
const only = process.env.AUDIT_ONLY?.split(",");
for (const c of CASES.filter((x) => !only || only.includes(x.id))) {
  process.stdout.write(`- ${c.title} ... `);
  const row = await runCase(c);
  rows.push(row);
  console.log(`${row.status} (HTTP ${row.http}, ${(row.ms / 1000).toFixed(1)}s${row.attempts > 1 ? ", retried" : ""})${row.notes.length ? " :: " + row.notes.join("; ") : ""}`);
  await sleep(4000); // stay under the per-IP rate limit
}

const passed = rows.filter((r) => r.status === "PASS").length;
const limitOk = limit.at70 !== 413;
const md = [
  "## Live endpoint audit (`scripts/autonomous-audit.mts`)",
  "",
  `Target: \`${BASE}/api/ai/chat\` — run ${new Date().toISOString()} — **${passed}/${rows.length} disciplines passed**`,
  "",
  `Request-size limit: a 70 MB body → HTTP ${limit.at70} (${limitOk ? "accepted, no 413" : "**413 — FAIL**"}); a 74 MB body → HTTP ${limit.at74}${limit.at74 === 413 ? " (413, the cap is real and returns JSON)" : ""}.`,
  "",
  "| Discipline | Result | HTTP | Time | Reply chars | Notes |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.title} | **${r.status}** | ${r.http} | ${(r.ms / 1000).toFixed(1)}s | ${r.chars} | ${r.notes.join("; ").replace(/\|/g, "/") || "all expected values present, KaTeX clean"} |`),
  "",
  "### Model fallback log per request (from the server log)",
  "",
  ...rows.flatMap((r) => [`**${r.title}**`, "", r.log.length ? "```\n" + r.log.map((l) => l.replace(/\u001b\[[0-9;]*m/g, "")).join("\n") + "\n```" : "_no rotation or fallback lines: answered by the preferred model on the first key tried_", ""]),
].join("\n");
writeFileSync(OUT, md);
console.log(`\n${passed}/${rows.length} passed; report -> ${OUT}`);
process.exit(passed === rows.length && limitOk ? 0 : 1);
