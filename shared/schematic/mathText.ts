// Math typography for schematic labels without foreignObject: a small, pure, deterministic LaTeX-subset -> SVG <tspan> converter.
// Supported: italic Latin variables, upright digits/operators/units, _ and ^ (single atom or {group}), {} grouping, \text{..} \mathrm{..},
// Greek letters, \, \; \: \  spacing, a few symbols (\circ \angle \pm \times \cdot \infty \approx). Unknown commands render as upright text.
// Sub/superscripts are positioned with relative `dy` on small tspans and returned to the baseline by the next run, so nothing drifts.

export interface MathRun {
  text: string;
  italic: boolean;
  bold?: boolean;
  /** 0 = baseline; 1 = subscript; -1 = superscript; 2/-2 = second level */
  level: number;
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const SYMBOLS: Record<string, string> = {
  circ: '°', angle: '∠', pm: '±', mp: '∓', times: '×', cdot: '·', infty: '∞', approx: '≈', leq: '≤', geq: '≥', neq: '≠', rightarrow: '→', to: '→',
  degree: '°', ohm: 'Ω', partial: '∂', nabla: '∇', sim: '∼', propto: '∝',
};
const SPACES: Record<string, string> = { ',': ' ', ';': ' ', ':': ' ', ' ': ' ', '!': '' };
const TEXT_CMDS = new Set(['text', 'mathrm', 'textrm', 'operatorname', 'mbox', 'rm']);
const BOLD_CMDS = new Set(['mathbf', 'textbf', 'boldsymbol']);
const ITALIC_CMDS = new Set(['mathit', 'textit']);

const MAX_RUNS = 80;
const MAX_DEPTH = 4;

const isLetter = (ch: string): boolean => ch.toLowerCase() !== ch.toUpperCase();
const isUpperGreek = (ch: string): boolean => ch >= 'Α' && ch <= 'Ω';

/** Parse a LaTeX-subset string into styled runs. Never throws; garbage in gives upright text out. */
export function parseMath(src: string): MathRun[] {
  const runs: MathRun[] = [];
  const s = src.replace(/^\s*\$+|\$+\s*$/g, '');
  let bold = false;
  const push = (text: string, italic: boolean, level: number): void => {
    if (!text || runs.length >= MAX_RUNS) return;
    const last = runs[runs.length - 1];
    if (last && last.italic === italic && last.level === level && !!last.bold === bold) last.text += text;
    else runs.push(bold ? { text, italic, level, bold: true } : { text, italic, level });
  };
  const walk = (text: string, level: number, italicDefault: boolean, depth: number): void => {
    let p = 0;
    const take = (): string => text[p++];
    while (p < text.length && runs.length < MAX_RUNS) {
      const ch = text[p];
      if (ch === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(text.slice(p));
        if (!m) { p++; continue; }
        p += m[0].length;
        const name = m[1];
        if (BOLD_CMDS.has(name)) {
          while (text[p] === ' ') p++;
          let group = '';
          if (text[p] === '{') {
            let d = 0;
            const st = p;
            for (; p < text.length; p++) {
              if (text[p] === '{') d++;
              else if (text[p] === '}' && --d === 0) { p++; break; }
            }
            group = text.slice(st + 1, p - 1 >= st + 1 ? p - 1 : p);
          } else if (p < text.length) group = take();
          bold = true;
          walk(group, level, italicDefault, depth + 1);
          bold = false;
        } else if (TEXT_CMDS.has(name) || ITALIC_CMDS.has(name)) {
          while (text[p] === ' ') p++;
          let group = '';
          if (text[p] === '{') {
            let d = 0;
            const st = p;
            for (; p < text.length; p++) {
              if (text[p] === '{') d++;
              else if (text[p] === '}' && --d === 0) { p++; break; }
            }
            group = text.slice(st + 1, p - 1 >= st + 1 ? p - 1 : p);
          } else if (p < text.length) group = take();
          // inside \text braces are plain characters; keep spaces
          push(group.replace(/[{}\\]/g, ''), ITALIC_CMDS.has(name), level);
        } else if (GREEK[name]) {
          const g = GREEK[name];
          push(g, italicDefault && !isUpperGreek(g), level);
        } else if (SYMBOLS[name] !== undefined) {
          push(SYMBOLS[name], false, level);
        } else if (SPACES[name] !== undefined && name.length === 1) {
          push(SPACES[name], false, level);
        } else if (name.length === 1 && '{}_^%&#$'.includes(name)) {
          push(name, false, level);
        } else if (name.length > 1) {
          push(name, false, level); // unknown command: its name, upright
        }
        continue;
      }
      if (ch === '_' || ch === '^') {
        p++;
        // the atom after the script marker
        let atom = '';
        if (text[p] === '{') {
          let d = 0;
          const st = p;
          for (; p < text.length; p++) {
            if (text[p] === '{') d++;
            else if (text[p] === '}' && --d === 0) { p++; break; }
          }
          atom = text.slice(st + 1, p - 1 >= st + 1 ? p - 1 : p);
        } else if (text[p] === '\\') {
          const m = /^\\([A-Za-z]+|.)/.exec(text.slice(p));
          if (m) { atom = m[0]; p += m[0].length; }
        } else if (p < text.length) {
          atom = Array.from(text.slice(p))[0];
          p += atom.length;
        }
        const next = level + (ch === '_' ? 1 : -1);
        const clamped = Math.max(-2, Math.min(2, next));
        if (depth < MAX_DEPTH) walk(atom, clamped, italicDefault, depth + 1);
        else push(atom.replace(/[\\{}]/g, ''), false, clamped);
        continue;
      }
      if (ch === '{') {
        let d = 0;
        const st = p;
        for (; p < text.length; p++) {
          if (text[p] === '{') d++;
          else if (text[p] === '}' && --d === 0) { p++; break; }
        }
        const inner = text.slice(st + 1, p - 1 >= st + 1 ? p - 1 : p);
        if (depth < MAX_DEPTH) walk(inner, level, italicDefault, depth + 1);
        continue;
      }
      if (ch === '}') { p++; continue; }
      if (ch === ' ') { p++; continue; } // math mode ignores spaces; use \, \; or \text{ } for explicit spacing
      const full = Array.from(text.slice(p))[0];
      p += full.length;
      if (full === '-') push('−', false, level);
      else if (full === '*') push('·', false, level);
      else if (isLetter(full)) push(full, italicDefault && !isUpperGreek(full), level);
      else push(full, false, level);
    }
  };
  walk(s, 0, true, 0);
  return runs;
}

// ---- auto conversion of plain designators / names ----
const WORD_SUBS = new Set(['in', 'out', 'ref', 'cc', 'dd', 'ee', 'ss', 'sw', 'gs', 'ds', 'ce', 'be', 'bias', 'load', 'avg', 'rms']);

/** Plain id/label text -> LaTeX-ish source. Already-LaTeX input (contains \ _ ^ {) passes through unchanged. */
export function autoMathSource(plain: string): string {
  const t = plain.replace(/^\s*\$+|\$+\s*$/g, '').trim();
  if (/[\\_^{}]/.test(t)) return t;
  let m = /^([A-Za-z]{1,3})(\d{1,3})$/.exec(t);
  if (m) return `${m[1]}_{${m[2]}}`;
  m = /^([A-Z])([a-z]{1,4})$/.exec(t);
  if (m && WORD_SUBS.has(m[2])) return `${m[1]}_{\\text{${m[2]}}}`;
  if (t === '+' || t === '-' || t === '−') return `\\mathbf{${t === '-' ? '−' : t}}`;
  if (/^[A-Za-z]$/.test(t) || /^[A-Za-z]\([A-Za-z0-9,]+\)$/.test(t)) return t;
  return `\\text{${t.replace(/[{}\\]/g, '')}}`;
}

/** LaTeX-ish source that renders `s` literally as upright text (for control strings, units and so on). */
export const texText = (s: string): string => `\\text{${s.replace(/[{}\\]/g, '')}}`;

// ---- metrics ----
function charEm(ch: string, italic: boolean): number {
  let w: number;
  if ('il.,;:\'|!()[]{}jtfI   '.includes(ch)) w = 0.3;
  else if ('mwMWΩ@'.includes(ch)) w = 0.88;
  else if (ch >= 'A' && ch <= 'Z') w = 0.68;
  else if ('+−=±×·'.includes(ch)) w = 0.6;
  else w = 0.57;
  return italic ? w * 1.02 : w;
}
const SCALE = [1, 0.72, 0.56];
const scaleOf = (level: number): number => SCALE[Math.min(2, Math.abs(level))];

export interface MathMetrics { width: number; hasSub: boolean; hasSup: boolean }

export function mathMetrics(src: string, size: number): MathMetrics {
  let w = 0, hasSub = false, hasSup = false;
  for (const run of parseMath(src)) {
    if (run.level > 0) hasSub = true;
    if (run.level < 0) hasSup = true;
    for (const ch of run.text) w += charEm(ch, run.italic) * size * scaleOf(run.level);
  }
  return { width: Math.ceil(w) + 1, hasSub, hasSup };
}

const num = (v: number): string => String(Math.round(v) || 0);

/** The inner markup of a <text> element (tspans only; everything XML-escaped). */
export function mathTspans(src: string, size: number, esc: (s: string) => string): string {
  const runs = parseMath(src);
  const shiftOf = (level: number): number => (level === 0 ? 0 : Math.sign(level) * (level > 0 ? 0.26 : 0.36) * size * (Math.abs(level) === 2 ? 1.6 : 1));
  const parts: string[] = [];
  let cur = 0;
  for (const run of runs) {
    const target = Math.round(shiftOf(run.level));
    const dy = target - cur;
    cur = target;
    const attrs: string[] = [];
    if (dy !== 0) attrs.push(`dy="${num(dy)}"`);
    if (run.level !== 0) attrs.push(`font-size="${num(size * scaleOf(run.level))}"`);
    else if (run.bold && /^[+−]$/.test(run.text)) attrs.push(`font-size="${num(size * 1.3)}"`); // polarity marks
    if (run.italic) attrs.push('font-style="italic"');
    if (run.bold) attrs.push('font-weight="bold"');
    parts.push(attrs.length ? `<tspan ${attrs.join(' ')}>${esc(run.text)}</tspan>` : esc(run.text));
  }
  return parts.join('');
}
