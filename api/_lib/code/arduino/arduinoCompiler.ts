/**
 * Arduino C++ subset -> JavaScript generator transpiler.
 * Every user function becomes a generator so delay() can suspend the sketch without blocking the UI thread.
 * Integer widths follow the ATmega328P (int = 16 bit, long = 32 bit).
 */

export type Ty = "void" | "bool" | "char" | "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32" | "float" | "string";

import type { Diagnostic, LcdWiring, PinUsage, SketchInstance, CompiledSketch, CompileResult } from "../../../../shared/code/arduinoTypes";
export type { Diagnostic, PinUsage, SketchInstance, CompiledSketch, CompileResult };

export class CompileError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------
interface Tok {
  t: "id" | "num" | "str" | "chr" | "p" | "dir" | "eof";
  v: string;
  line: number;
  n?: number;
  float?: boolean;
  suffix?: string;
}

const PUNCT3 = ["<<=", ">>="];
const PUNCT2 = ["++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "->", "::"];
const NUM_RE = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([uUlLfF]*)/;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", f: "\f", v: "\v" };

function lex(src: string, startLine = 1): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  let line = startLine;
  let lineStart = true;
  const readEscaped = (quote: string): string => {
    let out = "";
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\n") throw new CompileError("Missing terminating quote", line);
      if (src[i] === "\\") {
        const e = src[i + 1] ?? "";
        out += ESCAPES[e] ?? e;
        i += 2;
      } else out += src[i++];
    }
    if (src[i] !== quote) throw new CompileError("Missing terminating quote", line);
    i++;
    return out;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "\n") {
      line++;
      i++;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? src.length : e + 2;
      for (let k = i; k < end; k++) if (src[k] === "\n") line++;
      i = end;
      continue;
    }
    if (c === "#" && lineStart) {
      let text = "";
      const at = line;
      while (i < src.length && src[i] !== "\n") {
        if (src[i] === "\\" && src[i + 1] === "\n") {
          i += 2;
          line++;
          continue;
        }
        text += src[i++];
      }
      toks.push({ t: "dir", v: text.slice(1).trim(), line: at });
      continue;
    }
    lineStart = false;
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /\w/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), line });
      i = j;
    } else if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      const m = NUM_RE.exec(src.slice(i));
      if (!m) throw new CompileError("Malformed number", line);
      const body = m[1];
      const suffix = m[2].toLowerCase();
      const isHex = /^0[xX]/.test(body);
      const isBin = /^0[bB]/.test(body);
      const n = isHex ? parseInt(body, 16) : isBin ? parseInt(body.slice(2), 2) : parseFloat(body);
      const float = !isHex && !isBin && (/[.eE]/.test(body) || suffix.includes("f"));
      toks.push({ t: "num", v: body + m[2], line, n, float, suffix: isHex || isBin ? `${suffix}x` : suffix });
      i += m[0].length;
    } else if (c === '"') {
      toks.push({ t: "str", v: readEscaped('"'), line });
    } else if (c === "'") {
      const s = readEscaped("'");
      toks.push({ t: "chr", v: s, n: s.charCodeAt(0) || 0, line });
    } else {
      const three = src.slice(i, i + 3);
      const two = src.slice(i, i + 2);
      const p = PUNCT3.includes(three) ? three : PUNCT2.includes(two) ? two : c;
      if (!/[-+*/%&|^~!<>=?:;,.(){}[\]]/.test(p[0])) throw new CompileError(`Stray '${c}' in program`, line);
      toks.push({ t: "p", v: p, line });
      i += p.length;
    }
  }
  toks.push({ t: "eof", v: "", line });
  return toks;
}

/** Library headers pulled in with `#include <...>` / `#include "..."`. */
function includedHeaders(raw: Tok[]): Set<string> {
  const headers = new Set<string>();
  for (const t of raw) {
    const m = t.t === "dir" ? /^include\s*[<"]([^>"]+)[>"]/.exec(t.v) : null;
    if (m) headers.add(m[1]);
  }
  return headers;
}

/** Applies #define (object-like) substitution, drops other directives. */
function preprocess(raw: Tok[]): Tok[] {
  const macros = new Map<string, Tok[]>();
  const out: Tok[] = [];
  for (const t of raw) {
    if (t.t === "eof") continue;
    if (t.t === "dir") {
      const def = /^define\s+([A-Za-z_]\w*)(\(?)(.*)$/.exec(t.v);
      if (def) {
        if (def[2] === "(") throw new CompileError(`Function-like macro '${def[1]}' is not supported`, t.line);
        macros.set(def[1], lex(def[3], t.line).filter(k => k.t !== "eof"));
      } else if (/^undef\s+/.test(t.v)) macros.delete(t.v.replace(/^undef\s+/, "").trim());
      continue;
    }
    out.push(t);
  }
  const expand = (toks: Tok[], depth: number): Tok[] =>
    toks.flatMap(t => {
      if (t.t === "id" && macros.has(t.v)) {
        if (depth > 16) throw new CompileError(`Macro '${t.v}' expands recursively`, t.line);
        return expand(macros.get(t.v)!.map(m => ({ ...m, line: t.line })), depth + 1);
      }
      return [t];
    });
  const expanded = expand(out.filter(t => !(t.t === "id" && t.v === "PROGMEM")), 0);
  expanded.push({ t: "eof", v: "", line: (raw[raw.length - 1]?.line ?? 1) });
  return expanded;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------
interface L {
  line: number;
}
type Expr = L &
  (
    | { k: "num"; v: number; ty: Ty }
    | { k: "str"; v: string }
    | { k: "chr"; v: number }
    | { k: "id"; name: string }
    | { k: "bin"; op: string; l: Expr; r: Expr }
    | { k: "un"; op: "-" | "+" | "!" | "~"; e: Expr }
    | { k: "incdec"; op: "++" | "--"; prefix: boolean; e: Expr }
    | { k: "assign"; op: string; l: Expr; r: Expr }
    | { k: "cond"; c: Expr; a: Expr; b: Expr }
    | { k: "call"; callee: Expr; args: Expr[] }
    | { k: "member"; obj: Expr; name: string }
    | { k: "index"; obj: Expr; idx: Expr }
    | { k: "cast"; ty: Ty; e: Expr }
    | { k: "sizeof"; ty: Ty | null; e: Expr | null }
    | { k: "comma"; list: Expr[] }
    | { k: "init"; items: Expr[] }
  );

/** Library classes the simulator models with a dedicated codegen path instead of general class support. */
type LcdClass = "LiquidCrystal" | "LiquidCrystal_I2C";
const LCD_CLASSES: readonly LcdClass[] = ["LiquidCrystal", "LiquidCrystal_I2C"];
const LCD_HEADERS: Record<LcdClass, string> = { LiquidCrystal: "LiquidCrystal.h", LiquidCrystal_I2C: "LiquidCrystal_I2C.h" };
const isLcdClass = (w: string): w is LcdClass => (LCD_CLASSES as readonly string[]).includes(w);

interface Declarator {
  name: string;
  dims: (Expr | null)[];
  init: Expr | null;
  line: number;
}
type Stmt = L &
  (
    | { k: "block"; body: Stmt[] }
    | { k: "decl"; ty: Ty | "auto"; decls: Declarator[]; isStatic: boolean }
    | { k: "lcd"; cls: LcdClass; name: string; args: Expr[] }
    | { k: "expr"; e: Expr }
    | { k: "if"; c: Expr; a: Stmt; b: Stmt | null }
    | { k: "for"; init: Stmt | null; c: Expr | null; u: Expr | null; body: Stmt }
    | { k: "while"; c: Expr; body: Stmt }
    | { k: "do"; body: Stmt; c: Expr }
    | { k: "switch"; e: Expr; cases: { test: Expr | null; body: Stmt[] }[] }
    | { k: "break" }
    | { k: "continue" }
    | { k: "return"; e: Expr | null }
    | { k: "empty" }
  );

interface Param {
  ty: Ty;
  name: string;
  rank: number;
}
interface FuncDef {
  k: "func";
  ret: Ty;
  name: string;
  params: Param[];
  body: Stmt[] | null;
  line: number;
}
type TopItem = FuncDef | Stmt;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
const QUALIFIERS = new Set(["const", "static", "volatile", "extern", "constexpr", "inline", "register"]);
const TYPE_WORDS = new Set([
  "unsigned", "signed", "long", "short", "int", "char", "float", "double", "bool", "boolean", "byte", "word", "void", "String", "auto",
  "uint8_t", "int8_t", "uint16_t", "int16_t", "uint32_t", "int32_t", "size_t",
]);
const CAST_WORDS = new Set(["int", "long", "short", "char", "float", "double", "bool", "boolean", "byte", "word", "uint8_t", "int8_t", "uint16_t", "int16_t", "uint32_t", "int32_t", "size_t"]);
const BIN_PREC: Record<string, number> = {
  "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
};
const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);
const UNSUPPORTED_WORDS = new Set(["struct", "class", "union", "typedef", "template", "namespace", "using", "new", "delete", "goto", "try", "catch", "throw"]);

interface TypeInfo {
  ty: Ty | "auto";
  isStatic: boolean;
  isPtr: boolean;
  cls?: LcdClass;
}

class Parser {
  private pos = 0;
  readonly typeNames = new Set<string>();
  readonly enumConsts = new Map<string, number>();
  private nextEnum = 0;

  constructor(
    private readonly toks: Tok[],
    headers: ReadonlySet<string> = new Set(),
  ) {
    for (const cls of LCD_CLASSES) if (headers.has(LCD_HEADERS[cls])) this.typeNames.add(cls);
  }

  private get cur(): Tok {
    return this.toks[this.pos];
  }
  private peek(k = 1): Tok {
    return this.toks[Math.min(this.pos + k, this.toks.length - 1)];
  }
  private is(v: string): boolean {
    const t = this.cur;
    return (t.t === "p" || t.t === "id") && t.v === v;
  }
  private accept(v: string): boolean {
    if (this.is(v)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expect(v: string): Tok {
    if (!this.is(v)) {
      const got = this.cur.t === "eof" ? "end of file" : `'${this.cur.v}'`;
      throw new CompileError(`Expected '${v}' before ${got}`, this.cur.line);
    }
    return this.toks[this.pos++];
  }
  private ident(): Tok {
    if (this.cur.t !== "id") throw new CompileError(`Expected identifier before '${this.cur.v}'`, this.cur.line);
    return this.toks[this.pos++];
  }

  private isTypeStart(t: Tok = this.cur): boolean {
    return t.t === "id" && (TYPE_WORDS.has(t.v) || QUALIFIERS.has(t.v) || this.typeNames.has(t.v));
  }

  /** Consumes a (possibly multi-word) type; returns null without consuming if none is present. */
  private parseType(): TypeInfo | null {
    if (!this.isTypeStart()) return null;
    const words: string[] = [];
    let isStatic = false;
    while (this.cur.t === "id" && this.isTypeStart()) {
      const w = this.cur.v;
      if (w === "static") isStatic = true;
      if (!QUALIFIERS.has(w)) words.push(w);
      this.pos++;
    }
    if (words.length === 0) throw new CompileError("Expected a type", this.cur.line);
    const cls = words.find(isLcdClass);
    if (cls) return { ty: "int16", isStatic, isPtr: false, cls };
    const has = (w: string) => words.includes(w);
    const unsigned = has("unsigned");
    let ty: Ty | "auto";
    if (has("String")) ty = "string";
    else if (has("void")) ty = "void";
    else if (has("auto")) ty = "auto";
    else if (has("float") || has("double")) ty = "float";
    else if (has("bool") || has("boolean")) ty = "bool";
    else if (has("char")) ty = unsigned ? "uint8" : has("signed") ? "int8" : "char";
    else if (has("byte") || has("uint8_t")) ty = "uint8";
    else if (has("int8_t")) ty = "int8";
    else if (has("word") || has("uint16_t") || has("size_t")) ty = "uint16";
    else if (has("int16_t")) ty = "int16";
    else if (has("uint32_t")) ty = "uint32";
    else if (has("int32_t")) ty = "int32";
    else if (has("long")) ty = unsigned ? "uint32" : "int32";
    else if (has("short")) ty = unsigned ? "uint16" : "int16";
    else ty = unsigned ? "uint16" : "int16";
    let isPtr = false;
    while (this.is("*")) {
      this.pos++;
      isPtr = true;
      while (this.is("const")) this.pos++;
    }
    if (isPtr) {
      if (ty !== "char" && ty !== "uint8") throw new CompileError("Pointers are not supported by the simulator (only char* strings)", this.cur.line);
      ty = "string";
    }
    if (this.is("&")) throw new CompileError("References are not supported by the simulator", this.cur.line);
    return { ty, isStatic, isPtr };
  }

  parseProgram(): TopItem[] {
    const items: TopItem[] = [];
    while (this.cur.t !== "eof") {
      const item = this.parseTop();
      if (item) items.push(...item);
    }
    return items;
  }

  private parseTop(): TopItem[] | null {
    if (this.accept(";")) return null;
    if (this.cur.t === "id" && UNSUPPORTED_WORDS.has(this.cur.v)) {
      throw new CompileError(`'${this.cur.v}' is not supported by the simulator`, this.cur.line);
    }
    if (this.is("enum")) {
      this.parseEnum();
      return null;
    }
    const line = this.cur.line;
    const type = this.parseType();
    if (!type) throw new CompileError(this.missingInclude() ?? `Unexpected '${this.cur.v}' at file scope`, line);
    if (!type.cls && this.cur.t === "id" && this.peek().v === "(") {
      const name = this.ident().v;
      this.expect("(");
      const params = this.parseParams();
      if (type.ty === "auto") throw new CompileError("'auto' return type is not supported", line);
      let body: Stmt[] | null = null;
      if (this.is("{")) body = this.parseBlockBody();
      else this.expect(";");
      return [{ k: "func", ret: type.ty, name, params, body, line }];
    }
    return [this.parseDeclRest(type, line)];
  }

  private parseEnum(): void {
    this.expect("enum");
    this.accept("class");
    if (this.cur.t === "id") this.typeNames.add(this.ident().v);
    this.expect("{");
    this.nextEnum = 0;
    while (!this.is("}")) {
      const name = this.ident().v;
      if (this.accept("=")) {
        const neg = this.accept("-");
        const t = this.cur;
        if (t.t !== "num" && t.t !== "chr") throw new CompileError("Enumerator value must be a constant literal", t.line);
        this.pos++;
        this.nextEnum = (neg ? -1 : 1) * (t.n ?? 0);
      }
      this.enumConsts.set(name, this.nextEnum++);
      if (!this.accept(",")) break;
    }
    this.expect("}");
    this.expect(";");
  }

  private parseParams(): Param[] {
    const params: Param[] = [];
    if (this.accept(")")) return params;
    if (this.is("void") && this.peek().v === ")") {
      this.pos += 2;
      return params;
    }
    do {
      const type = this.parseType();
      if (!type || type.ty === "void" || type.ty === "auto") throw new CompileError("Invalid parameter type", this.cur.line);
      const name = this.cur.t === "id" ? this.ident().v : `_p${params.length}`;
      let rank = 0;
      while (this.accept("[")) {
        if (!this.is("]")) this.parseAssign();
        this.expect("]");
        rank++;
      }
      if (this.is("=")) throw new CompileError("Default arguments are not supported", this.cur.line);
      params.push({ ty: type.ty, name, rank });
    } while (this.accept(","));
    this.expect(")");
    return params;
  }

  /** `LiquidCrystal lcd(...)` without its #include behaves like avr-gcc: the type is unknown. */
  private missingInclude(): string | null {
    const w = this.cur.v;
    return this.cur.t === "id" && isLcdClass(w) ? `'${w}' does not name a type (did you forget #include <${LCD_HEADERS[w]}>?)` : null;
  }

  private parseLcdDecl(cls: LcdClass, line: number): Stmt {
    const name = this.ident().v;
    if (!this.accept("(")) throw new CompileError(`'${cls} ${name}' needs constructor arguments, e.g. ${cls} ${name}(${cls === "LiquidCrystal" ? "12, 11, 5, 4, 3, 2" : "0x27, 16, 2"});`, this.cur.line);
    const args: Expr[] = [];
    if (!this.is(")")) {
      do args.push(this.parseAssign());
      while (this.accept(","));
    }
    this.expect(")");
    this.expect(";");
    return { k: "lcd", cls, name, args, line };
  }

  private parseDeclRest(type: TypeInfo, line: number): Stmt {
    if (type.cls) return this.parseLcdDecl(type.cls, line);
    const decls: Declarator[] = [];
    do {
      while (this.accept("*")) throw new CompileError("Pointers are not supported by the simulator", this.cur.line);
      const nameTok = this.ident();
      const dims: (Expr | null)[] = [];
      while (this.accept("[")) {
        dims.push(this.is("]") ? null : this.parseAssign());
        this.expect("]");
      }
      let init: Expr | null = null;
      if (this.accept("=")) init = this.is("{") ? this.parseInitList() : this.parseAssign();
      else if (this.is("(") ) {
        this.pos++;
        init = this.is(")") ? null : this.parseAssign();
        this.expect(")");
      }
      decls.push({ name: nameTok.v, dims, init, line: nameTok.line });
    } while (this.accept(","));
    this.expect(";");
    return { k: "decl", ty: type.ty, decls, isStatic: type.isStatic, line };
  }

  private parseInitList(): Expr {
    const line = this.expect("{").line;
    const items: Expr[] = [];
    while (!this.is("}")) {
      items.push(this.is("{") ? this.parseInitList() : this.parseAssign());
      if (!this.accept(",")) break;
    }
    this.expect("}");
    return { k: "init", items, line };
  }

  private parseBlockBody(): Stmt[] {
    this.expect("{");
    const body: Stmt[] = [];
    while (!this.is("}")) {
      if (this.cur.t === "eof") throw new CompileError("Expected '}' at end of input", this.cur.line);
      body.push(this.parseStmt());
    }
    this.expect("}");
    return body;
  }

  private parseStmt(): Stmt {
    const t = this.cur;
    const line = t.line;
    if (t.t === "id" && UNSUPPORTED_WORDS.has(t.v)) throw new CompileError(`'${t.v}' is not supported by the simulator`, line);
    if (this.is("{")) return { k: "block", body: this.parseBlockBody(), line };
    if (this.accept(";")) return { k: "empty", line };
    if (t.t === "id") {
      switch (t.v) {
        case "if": {
          this.pos++;
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          const a = this.parseStmt();
          const b = this.accept("else") ? this.parseStmt() : null;
          return { k: "if", c, a, b, line };
        }
        case "while": {
          this.pos++;
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          return { k: "while", c, body: this.parseStmt(), line };
        }
        case "do": {
          this.pos++;
          const body = this.parseStmt();
          this.expect("while");
          this.expect("(");
          const c = this.parseExpr();
          this.expect(")");
          this.expect(";");
          return { k: "do", body, c, line };
        }
        case "for": {
          this.pos++;
          this.expect("(");
          let init: Stmt | null = null;
          if (!this.accept(";")) {
            const type = this.parseType();
            if (type) init = this.parseDeclRest(type, line);
            else {
              init = { k: "expr", e: this.parseExpr(), line };
              this.expect(";");
            }
          }
          const c = this.is(";") ? null : this.parseExpr();
          this.expect(";");
          const u = this.is(")") ? null : this.parseExpr();
          this.expect(")");
          return { k: "for", init, c, u, body: this.parseStmt(), line };
        }
        case "switch": {
          this.pos++;
          this.expect("(");
          const e = this.parseExpr();
          this.expect(")");
          this.expect("{");
          const cases: { test: Expr | null; body: Stmt[] }[] = [];
          while (!this.is("}")) {
            let test: Expr | null = null;
            if (this.accept("case")) test = this.parseCond();
            else this.expect("default");
            this.expect(":");
            const body: Stmt[] = [];
            while (!this.is("case") && !this.is("default") && !this.is("}")) body.push(this.parseStmt());
            cases.push({ test, body });
          }
          this.expect("}");
          return { k: "switch", e, cases, line };
        }
        case "break":
          this.pos++;
          this.expect(";");
          return { k: "break", line };
        case "continue":
          this.pos++;
          this.expect(";");
          return { k: "continue", line };
        case "return": {
          this.pos++;
          const e = this.is(";") ? null : this.parseExpr();
          this.expect(";");
          return { k: "return", e, line };
        }
        case "enum":
          this.parseEnum();
          return { k: "empty", line };
        default:
      }
      // Declaration vs. functional cast expression such as int(x);
      if (this.isTypeStart() && !(CAST_WORDS.has(t.v) && this.peek().v === "(")) {
        const type = this.parseType();
        if (type) return this.parseDeclRest(type, line);
      }
    }
    const e = this.parseExpr();
    this.expect(";");
    return { k: "expr", e, line };
  }

  // --- expressions -------------------------------------------------------
  parseExpr(): Expr {
    const first = this.parseAssign();
    if (!this.is(",")) return first;
    const list = [first];
    while (this.accept(",")) list.push(this.parseAssign());
    return { k: "comma", list, line: first.line };
  }

  private parseAssign(): Expr {
    const l = this.parseCond();
    if (this.cur.t === "p" && ASSIGN_OPS.has(this.cur.v)) {
      const op = this.toks[this.pos++];
      return { k: "assign", op: op.v, l, r: this.parseAssign(), line: op.line };
    }
    return l;
  }

  private parseCond(): Expr {
    const c = this.parseBin(1);
    if (!this.is("?")) return c;
    const line = this.toks[this.pos++].line;
    const a = this.parseAssign();
    this.expect(":");
    const b = this.parseAssign();
    return { k: "cond", c, a, b, line };
  }

  private parseBin(min: number): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.cur;
      const prec = t.t === "p" ? BIN_PREC[t.v] : undefined;
      if (prec === undefined || prec < min) return l;
      this.pos++;
      const r = this.parseBin(prec + 1);
      l = { k: "bin", op: t.v, l, r, line: t.line };
    }
  }

  private parseUnary(): Expr {
    const t = this.cur;
    if (t.t === "p") {
      if (t.v === "!" || t.v === "-" || t.v === "+" || t.v === "~") {
        this.pos++;
        return { k: "un", op: t.v, e: this.parseUnary(), line: t.line };
      }
      if (t.v === "++" || t.v === "--") {
        this.pos++;
        return { k: "incdec", op: t.v, prefix: true, e: this.parseUnary(), line: t.line };
      }
      if (t.v === "&" || t.v === "*") throw new CompileError("Pointers and address-of are not supported by the simulator", t.line);
      if (t.v === "(" && this.isTypeStart(this.peek())) {
        const save = this.pos;
        this.pos++;
        const type = this.parseType();
        if (type && this.accept(")")) {
          if (type.ty === "auto" || type.ty === "void") throw new CompileError("Invalid cast type", t.line);
          return { k: "cast", ty: type.ty, e: this.parseUnary(), line: t.line };
        }
        this.pos = save;
      }
    }
    if (t.t === "id" && t.v === "sizeof") {
      this.pos++;
      this.expect("(");
      let result: Expr;
      if (this.isTypeStart()) {
        const type = this.parseType();
        result = { k: "sizeof", ty: type && type.ty !== "auto" ? type.ty : "int16", e: null, line: t.line };
      } else result = { k: "sizeof", ty: null, e: this.parseExpr(), line: t.line };
      this.expect(")");
      return result;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.cur;
      if (t.t !== "p") return e;
      if (t.v === "(") {
        this.pos++;
        const args: Expr[] = [];
        if (!this.is(")")) {
          do args.push(this.parseAssign());
          while (this.accept(","));
        }
        this.expect(")");
        e = { k: "call", callee: e, args, line: t.line };
      } else if (t.v === "[") {
        this.pos++;
        const idx = this.parseExpr();
        this.expect("]");
        e = { k: "index", obj: e, idx, line: t.line };
      } else if (t.v === ".") {
        this.pos++;
        e = { k: "member", obj: e, name: this.ident().v, line: t.line };
      } else if (t.v === "->") throw new CompileError("Pointers are not supported by the simulator", t.line);
      else if (t.v === "++" || t.v === "--") {
        this.pos++;
        e = { k: "incdec", op: t.v, prefix: false, e, line: t.line };
      } else return e;
    }
  }

  private parsePrimary(): Expr {
    const t = this.cur;
    const line = t.line;
    switch (t.t) {
      case "num": {
        this.pos++;
        return { k: "num", v: t.n ?? 0, ty: literalType(t), line };
      }
      case "chr":
        this.pos++;
        return { k: "chr", v: t.n ?? 0, line };
      case "str": {
        this.pos++;
        let v = t.v;
        while (this.cur.t === "str") v += this.toks[this.pos++].v;
        return { k: "str", v, line };
      }
      case "id": {
        if (CAST_WORDS.has(t.v) && this.peek().v === "(") {
          const type = this.parseType();
          this.expect("(");
          const e = this.parseAssign();
          this.expect(")");
          if (!type || type.ty === "auto" || type.ty === "void") throw new CompileError("Invalid cast type", line);
          return { k: "cast", ty: type.ty, e, line };
        }
        this.pos++;
        return { k: "id", name: t.v, line };
      }
      case "p":
        if (t.v === "(") {
          this.pos++;
          const e = this.parseExpr();
          this.expect(")");
          return e;
        }
      // falls through
      default:
        throw new CompileError(t.t === "eof" ? "Unexpected end of input" : `Unexpected '${t.v}'`, line);
    }
  }
}

function literalType(t: Tok): Ty {
  if (t.float) return "float";
  const n = t.n ?? 0;
  const suffix = t.suffix ?? "";
  const unsignedSuffix = suffix.includes("u");
  if (suffix.includes("l")) return unsignedSuffix ? "uint32" : n > 0x7fffffff ? "uint32" : "int32";
  if (unsignedSuffix) return n > 0xffff ? "uint32" : "uint16";
  if (n <= 0x7fff) return "int16";
  if (suffix.includes("x") && n <= 0xffff) return "uint16";
  return n > 0x7fffffff ? "uint32" : "int32";
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------
interface R {
  c: string;
  ty: Ty;
  rank: number;
}
interface VarInfo {
  js: string;
  ty: Ty;
  rank: number;
}
interface FuncSig {
  ret: Ty;
  params: Param[];
}
interface LV {
  ty: Ty;
  pre: string[];
  read: string;
  write: (v: string) => string;
}

const RANGE: Record<Exclude<Ty, "void" | "float" | "string" | "bool">, [number, number]> = {
  char: [-128, 127],
  int8: [-128, 127],
  uint8: [0, 255],
  int16: [-32768, 32767],
  uint16: [0, 65535],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
};
const SIZE: Record<Ty, number> = { void: 0, bool: 1, char: 1, int8: 1, uint8: 1, int16: 2, uint16: 2, int32: 4, uint32: 4, float: 4, string: 6 };

const CONSTANTS: Record<string, { v: string; ty: Ty }> = {
  HIGH: { v: "1", ty: "int16" }, LOW: { v: "0", ty: "int16" },
  INPUT: { v: "0", ty: "int16" }, OUTPUT: { v: "1", ty: "int16" }, INPUT_PULLUP: { v: "2", ty: "int16" },
  LED_BUILTIN: { v: "13", ty: "int16" },
  A0: { v: "14", ty: "int16" }, A1: { v: "15", ty: "int16" }, A2: { v: "16", ty: "int16" }, A3: { v: "17", ty: "int16" },
  A4: { v: "18", ty: "int16" }, A5: { v: "19", ty: "int16" }, A6: { v: "20", ty: "int16" }, A7: { v: "21", ty: "int16" },
  DEC: { v: "10", ty: "int16" }, HEX: { v: "16", ty: "int16" }, OCT: { v: "8", ty: "int16" }, BIN: { v: "2", ty: "int16" },
  PI: { v: String(Math.PI), ty: "float" }, HALF_PI: { v: String(Math.PI / 2), ty: "float" }, TWO_PI: { v: String(Math.PI * 2), ty: "float" },
  DEG_TO_RAD: { v: String(Math.PI / 180), ty: "float" }, RAD_TO_DEG: { v: String(180 / Math.PI), ty: "float" },
  NULL: { v: "0", ty: "int16" }, true: { v: "true", ty: "bool" }, false: { v: "false", ty: "bool" },
  Serial: { v: "true", ty: "bool" }, Wire: { v: "true", ty: "bool" },
};

const UNSUPPORTED_CALLS = new Set(["tone", "noTone", "pulseIn", "pulseInLong", "attachInterrupt", "detachInterrupt", "shiftOut", "shiftIn", "analogReference", "sprintf", "snprintf", "dtostrf", "memcpy", "memset", "strlen", "strcpy", "strcmp"]);
const FLOAT_FUNCS: Record<string, string> = {
  sqrt: "Math.sqrt", sin: "Math.sin", cos: "Math.cos", tan: "Math.tan", asin: "Math.asin", acos: "Math.acos", atan: "Math.atan",
  log: "Math.log", log10: "Math.log10", exp: "Math.exp", floor: "Math.floor", ceil: "Math.ceil", fabs: "Math.abs", trunc: "Math.trunc",
  round: "$h.round",
};
const CHAR_PREDICATES: Record<string, string> = {
  isDigit: "isDigit", isAlpha: "isAlpha", isAlphaNumeric: "isAlphaNumeric", isSpace: "isSpace", isUpperCase: "isUpperCase", isLowerCase: "isLowerCase", isPunct: "isPunct",
};

function wrapTo(ty: Ty, c: string): string {
  switch (ty) {
    case "char":
    case "int8":
      return `((${c})<<24>>24)`;
    case "uint8":
      return `((${c})&255)`;
    case "int16":
      return `((${c})<<16>>16)`;
    case "uint16":
      return `((${c})&65535)`;
    case "int32":
      return `((${c})|0)`;
    case "uint32":
      return `((${c})>>>0)`;
    default:
      return c;
  }
}

function isInt(ty: Ty): ty is keyof typeof RANGE {
  return ty in RANGE;
}
function isNumeric(ty: Ty): boolean {
  return ty === "float" || ty === "bool" || isInt(ty);
}
function kindOf(ty: Ty): "i" | "f" | "c" | "s" {
  return ty === "string" ? "s" : ty === "float" ? "f" : ty === "char" ? "c" : "i";
}

/** Usual arithmetic conversions on AVR (operands narrower than int promote to int). */
function promote(a: Ty, b: Ty): Ty {
  if (a === "float" || b === "float") return "float";
  if (a === "uint32" || b === "uint32") return "uint32";
  if (a === "int32" || b === "int32") return "int32";
  if (a === "uint16" || b === "uint16") return "uint16";
  return "int16";
}

interface FnCtx {
  temps: number;
  ret: Ty;
  sync: boolean;
}

class Codegen {
  private readonly scopes: Map<string, VarInfo>[] = [new Map()];
  private readonly funcs = new Map<string, FuncSig>();
  private readonly hoisted: string[] = [];
  private fn: FnCtx = { temps: 0, ret: "void", sync: true };
  private line = 1;
  private uid = 0;
  private readonly lcdObjs = new Set<string>();

  constructor(private readonly enumConsts: Map<string, number>) {}

  compile(items: TopItem[]): string {
    for (const it of items) {
      if (it.k !== "func") continue;
      const prior = this.funcs.get(it.name);
      if (prior && it.body && prior.ret !== it.ret) throw new CompileError(`Conflicting declaration of '${it.name}'`, it.line);
      this.funcs.set(it.name, { ret: it.ret, params: it.params });
    }
    for (const name of ["setup", "loop"]) {
      const f = this.funcs.get(name);
      if (!f || !items.some(i => i.k === "func" && i.name === name && i.body)) throw new CompileError(`Sketch must define 'void ${name}()'`, 1);
    }
    const chunks: string[] = [];
    const globalCtx: FnCtx = { temps: 0, ret: "void", sync: true };
    const globalCode: string[] = [];
    for (const it of items) {
      if (it.k === "func") {
        if (it.body) chunks.push(this.genFunc(it));
      } else {
        this.fn = globalCtx;
        globalCode.push(this.stmt(it, true));
      }
    }
    const gTemps = Array.from({ length: globalCtx.temps }, (_, i) => `$t${i}`);
    return [
      '"use strict";',
      gTemps.length ? `let ${gTemps.join(",")};` : "",
      ...this.hoisted,
      ...globalCode,
      ...chunks,
      "function* $main(){yield* f_setup();for(;;){yield* f_loop();if(($rt.b-=100)<0)yield* $rt.slice();}}",
      "return { main: $main };",
    ].join("\n");
  }

  // --- scopes ------------------------------------------------------------
  private lookup(name: string): VarInfo | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].get(name);
      if (v) return v;
    }
    return undefined;
  }
  private declare(name: string, ty: Ty, rank: number, line: number, js?: string): VarInfo {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) throw new CompileError(`Redeclaration of '${name}'`, line);
    const info = { js: js ?? `v_${name}`, ty, rank };
    scope.set(name, info);
    return info;
  }
  private err(message: string, line = this.line): never {
    throw new CompileError(message, line);
  }
  private tmp(): string {
    return `$t${this.fn.temps++}`;
  }

  // --- functions ---------------------------------------------------------
  private genFunc(f: FuncDef): string {
    this.fn = { temps: 0, ret: f.ret, sync: false };
    this.scopes.push(new Map());
    const names = f.params.map(p => {
      this.declare(p.name, p.ty, p.rank, f.line);
      return `v_${p.name}`;
    });
    const body = (f.body ?? []).map(s => this.stmt(s, false)).join("\n");
    this.scopes.pop();
    const temps = Array.from({ length: this.fn.temps }, (_, i) => `$t${i}`);
    return `function* f_${f.name}(${names.join(",")}){${temps.length ? `let ${temps.join(",")};` : ""}\n${body}\n}`;
  }

  // --- statements --------------------------------------------------------
  private block(body: Stmt[]): string {
    this.scopes.push(new Map());
    const out = body.map(s => this.stmt(s, false)).join("\n");
    this.scopes.pop();
    return `{\n${out}\n}`;
  }

  private loopBody(s: Stmt): string {
    this.scopes.push(new Map());
    const inner = s.k === "block" ? s.body.map(x => this.stmt(x, false)).join("\n") : this.stmt(s, false);
    this.scopes.pop();
    return `{if(--$rt.b<0)yield* $rt.slice();\n${inner}\n}`;
  }

  private stmt(s: Stmt, global: boolean): string {
    this.line = s.line;
    switch (s.k) {
      case "block":
        return this.block(s.body);
      case "empty":
        return ";";
      case "expr":
        return `${this.expr(s.e, false).c};`;
      case "decl":
        return this.decl(s, global);
      case "lcd":
        return this.lcdDecl(s);
      case "if":
        return `if(${this.cond(s.c)})${this.sub(s.a)}${s.b ? ` else ${this.sub(s.b)}` : ""}`;
      case "while":
        return `while(${this.cond(s.c)})${this.loopBody(s.body)}`;
      case "do":
        return `do${this.loopBody(s.body)} while(${this.cond(s.c)});`;
      case "for": {
        this.scopes.push(new Map());
        const init = s.init ? (s.init.k === "decl" ? this.decl(s.init, false).replace(/;\nlet /g, ",").replace(/;$/, "") : this.expr((s.init as { e: Expr }).e, false).c) : "";
        const c = s.c ? this.cond(s.c) : "";
        const u = s.u ? this.expr(s.u, false).c : "";
        const body = this.loopBody(s.body);
        this.scopes.pop();
        return `for(${init};${c};${u})${body}`;
      }
      case "switch": {
        const e = this.expr(s.e);
        const disc = coerceTo(e, "int32", this.line);
        const cases = s.cases
          .map(c => {
            const label = c.test ? `case ${this.expr(c.test).c}:` : "default:";
            return `${label}${this.block(c.body)}`;
          })
          .join("\n");
        return `switch(${disc}){\n${cases}\n}`;
      }
      case "break":
        return "break;";
      case "continue":
        return "continue;";
      case "return": {
        if (this.fn.sync) this.err("'return' outside of a function");
        if (!s.e) return "return;";
        if (this.fn.ret === "void") this.err("Returning a value from a void function");
        return `return ${coerceTo(this.expr(s.e), this.fn.ret, this.line)};`;
      }
    }
  }

  private sub(s: Stmt): string {
    return s.k === "block" ? this.block(s.body) : `{${this.stmt(s, false)}}`;
  }

  private cond(e: Expr): string {
    const r = this.expr(e);
    if (r.ty === "string") this.err("Cannot use a String as a condition");
    return r.c;
  }

  /** `LiquidCrystal lcd(rs, en, d4, d5, d6, d7)` / `LiquidCrystal_I2C lcd(0x27, 16, 2)`: registers the wiring with the runtime. */
  private lcdDecl(s: Extract<Stmt, { k: "lcd" }>): string {
    const { cls, name, args } = s;
    const counts = cls === "LiquidCrystal" ? [6, 7, 10, 11] : [3];
    if (!counts.includes(args.length)) {
      this.err(`No matching constructor for '${cls}' with ${args.length} argument(s) (expected ${counts.join(", ")})`, s.line);
    }
    const vals = args.map(a => coerceTo(this.expr(a), "int32", s.line));
    this.declare(name, "int16", 0, s.line);
    this.lcdObjs.add(name);
    return `let v_${name}=0;\n$rt.lcdInit('${cls === "LiquidCrystal" ? "p" : "i"}',[${vals.join(",")}]);`;
  }

  private decl(s: Extract<Stmt, { k: "decl" }>, global: boolean): string {
    const out: string[] = [];
    for (const d of s.decls) {
      this.line = d.line;
      let ty: Ty;
      let init: R | null = null;
      if (s.ty === "auto") {
        if (!d.init || d.init.k === "init") this.err("'auto' requires a simple initializer", d.line);
        init = this.expr(d.init);
        ty = init.ty;
      } else ty = s.ty;
      if (ty === "void") this.err(`Variable '${d.name}' declared void`, d.line);
      const hoist = s.isStatic && !global;
      const js = hoist ? `s${this.uid++}_${d.name}` : `v_${d.name}`;
      let code: string;
      // char name[] = "text" behaves like a String for the purposes of this simulator
      const charStr = ty === "char" && d.dims.length === 1 && d.init?.k === "str";
      if (d.dims.length > 0 && !charStr) {
        const dimCodes: string[] = [];
        const init0 = d.init && d.init.k === "init" ? d.init : null;
        d.dims.forEach((dim, i) => {
          if (dim) dimCodes.push(coerceTo(this.expr(dim), "int32", this.line));
          else if (i === 0 && init0) dimCodes.push(String(init0.items.length));
          else this.err(`Array '${d.name}' needs a size`, d.line);
        });
        const fill = ty === "string" ? "''" : ty === "bool" ? "false" : "0";
        const initCode = init0 ? this.initList(init0, ty) : "undefined";
        if (d.init && d.init.k !== "init") this.err("Array initializer must be a brace list", d.line);
        code = `$h.mk([${dimCodes.join(",")}],${fill},${initCode})`;
        this.declare(d.name, ty, d.dims.length, d.line, js);
      } else {
        const effTy: Ty = charStr ? "string" : ty;
        if (d.init) {
          if (d.init.k === "init") this.err("Unexpected brace initializer for a scalar", d.line);
          init = init ?? this.expr(d.init);
          code = effTy === "string" && init.ty !== "string" ? `$h.toStr(${init.c},'${kindOf(init.ty)}')` : coerceTo(init, effTy, this.line);
        } else code = effTy === "string" ? "''" : effTy === "bool" ? "false" : "0";
        this.declare(d.name, effTy, 0, d.line, js);
      }
      if (hoist) this.hoisted.push(`let ${js}=${code};`);
      else out.push(`let ${js}=${code};`);
    }
    return out.join("\n");
  }

  private initList(list: Extract<Expr, { k: "init" }>, ty: Ty): string {
    const items = list.items.map(i => (i.k === "init" ? this.initList(i, ty) : coerceTo(this.expr(i), ty, this.line)));
    return `[${items.join(",")}]`;
  }

  // --- expressions -------------------------------------------------------
  private isPure(e: Expr): boolean {
    switch (e.k) {
      case "num": case "str": case "chr": case "id": return true;
      case "un": return this.isPure(e.e);
      case "bin": return this.isPure(e.l) && this.isPure(e.r);
      case "cast": return this.isPure(e.e);
      case "index": return this.isPure(e.obj) && this.isPure(e.idx);
      default: return false;
    }
  }

  private lvalue(e: Expr): LV {
    this.line = e.line;
    if (e.k === "id") {
      const v = this.lookup(e.name);
      if (!v) this.err(`'${e.name}' was not declared in this scope`);
      if (v.rank > 0) this.err(`Cannot assign to array '${e.name}'`);
      return { ty: v.ty, pre: [], read: v.js, write: x => `(${v.js}=${x})` };
    }
    if (e.k === "index") {
      const obj = this.expr(e.obj);
      if (obj.rank < 1) this.err(obj.ty === "string" ? "Assigning to String characters is not supported; use setCharAt()" : "Subscripted value is not an array");
      const idx = coerceTo(this.expr(e.idx), "int32", this.line);
      const pre: string[] = [];
      let oc = obj.c;
      let ic = idx;
      if (!this.isPure(e.obj)) {
        const t = this.tmp();
        pre.push(`${t}=${oc}`);
        oc = t;
      }
      if (!this.isPure(e.idx)) {
        const t = this.tmp();
        pre.push(`${t}=${ic}`);
        ic = t;
      }
      if (obj.rank > 1) this.err("Only fully-indexed array elements can be assigned");
      return { ty: obj.ty, pre, read: `$h.get(${oc},${ic})`, write: x => `$h.set(${oc},${ic},${x})` };
    }
    return this.err("Expression is not assignable");
  }

  private withPre(pre: string[], code: string): string {
    return pre.length ? `(${pre.join(",")},${code})` : code;
  }

  expr(e: Expr, used = true): R {
    this.line = e.line;
    const mk = (c: string, ty: Ty, rank = 0): R => ({ c, ty, rank });
    switch (e.k) {
      case "num":
        return mk(e.v < 0 || Object.is(e.v, -0) ? `(${e.v})` : String(e.v), e.ty);
      case "chr":
        return mk(String(e.v), "char");
      case "str":
        return mk(JSON.stringify(e.v), "string");
      case "id": {
        const v = this.lookup(e.name);
        if (v) return mk(v.js, v.ty, v.rank);
        const en = this.enumConsts.get(e.name);
        if (en !== undefined) return mk(String(en), "int16");
        const k = CONSTANTS[e.name];
        if (k) return mk(k.v, k.ty);
        if (this.funcs.has(e.name)) this.err(`Function '${e.name}' used without call`);
        return this.err(`'${e.name}' was not declared in this scope`);
      }
      case "comma": {
        const parts = e.list.map((x, i) => this.expr(x, used && i === e.list.length - 1));
        const last = parts[parts.length - 1];
        return mk(`(${parts.map(p => p.c).join(",")})`, last.ty);
      }
      case "init":
        return this.err("Unexpected brace initializer");
      case "un": {
        const r = this.expr(e.e);
        if (r.ty === "string") this.err(`Invalid operand of unary '${e.op}' (String)`);
        if (e.op === "!") return mk(`(!${r.c})`, "bool");
        if (e.op === "+") return mk(r.c, r.ty === "float" ? "float" : promote(r.ty, r.ty));
        const t = promote(r.ty, r.ty);
        const c = e.op === "-" ? `(-${r.c})` : `(~${r.c})`;
        return mk(t === "float" ? c : wrapTo(t, c), t);
      }
      case "bin":
        return this.binary(e.op, this.expr(e.l), this.expr(e.r));
      case "cond": {
        const c = this.cond(e.c);
        const a = this.expr(e.a);
        const b = this.expr(e.b);
        const t: Ty = a.ty === b.ty ? a.ty : a.ty === "string" || b.ty === "string" ? this.err("Incompatible types in conditional expression") : promote(a.ty, b.ty);
        return mk(`(${c}?${coerceTo(a, t, this.line)}:${coerceTo(b, t, this.line)})`, t);
      }
      case "cast": {
        const r = this.expr(e.e);
        if (e.ty === "string") return mk(r.ty === "string" ? r.c : `$h.toStr(${r.c},'${kindOf(r.ty)}')`, "string");
        return mk(coerceTo(r, e.ty, this.line), e.ty);
      }
      case "sizeof": {
        if (e.ty) return mk(String(SIZE[e.ty]), "uint16");
        const r = this.expr(e.e as Expr);
        if (r.rank > 0) return mk(`(${r.c}.length*${SIZE[r.ty]})`, "uint16");
        return mk(String(SIZE[r.ty]), "uint16");
      }
      case "assign": {
        const lv = this.lvalue(e.l);
        let val = this.expr(e.r);
        if (e.op !== "=") val = this.binary(e.op.slice(0, -1), { c: lv.read, ty: lv.ty, rank: 0 }, val);
        else if (val.rank > 0) this.err("Array assignment is not supported");
        const c = lv.ty === "string" && val.ty !== "string" ? `$h.toStr(${val.c},'${kindOf(val.ty)}')` : coerceTo(val, lv.ty, this.line);
        return mk(this.withPre(lv.pre, lv.write(c)), lv.ty);
      }
      case "incdec": {
        const lv = this.lvalue(e.e);
        if (!isNumeric(lv.ty)) this.err(`Invalid operand of '${e.op}'`);
        const nv = coerceTo(this.binary(e.op === "++" ? "+" : "-", { c: lv.read, ty: lv.ty, rank: 0 }, mk("1", "int16")), lv.ty, this.line);
        if (e.prefix || !used) return mk(this.withPre(lv.pre, lv.write(nv)), lv.ty);
        const t = this.tmp();
        return mk(`(${[...lv.pre, `${t}=${lv.read}`, lv.write(nv), t].join(",")})`, lv.ty);
      }
      case "index": {
        const obj = this.expr(e.obj);
        const idx = coerceTo(this.expr(e.idx), "int32", this.line);
        if (obj.rank >= 1) return mk(`$h.get(${obj.c},${idx})`, obj.ty, obj.rank - 1);
        if (obj.ty === "string") return mk(`$h.charAt(${obj.c},${idx})`, "char");
        return this.err("Subscripted value is neither array nor pointer");
      }
      case "member":
        return this.err(`Member '${e.name}' must be called as a function`);
      case "call":
        return this.call(e);
    }
  }

  private binary(op: string, a: R, b: R): R {
    const mk = (c: string, ty: Ty): R => ({ c, ty, rank: 0 });
    if (a.rank > 0 || b.rank > 0) this.err("Invalid operands (array) to binary expression");
    if (op === "&&" || op === "||") return mk(`(!!${a.c}${op}!!${b.c})`, "bool");
    if (a.ty === "string" || b.ty === "string") {
      if (op === "+") {
        const s = (r: R) => (r.ty === "string" ? r.c : `$h.toStr(${r.c},'${kindOf(r.ty)}')`);
        return mk(`(${s(a)}+${s(b)})`, "string");
      }
      if (["==", "!=", "<", ">", "<=", ">="].includes(op) && a.ty === b.ty) return mk(`(${a.c}${op === "==" ? "==" : op === "!=" ? "!=" : op}${b.c})`, "bool");
      return this.err(`Invalid operands to binary '${op}' (String)`);
    }
    if (["==", "!=", "<", ">", "<=", ">="].includes(op)) return mk(`(${a.c}${op}${b.c})`, "bool");
    const t = promote(a.ty, b.ty);
    const isF = t === "float";
    switch (op) {
      case "+":
      case "-":
        return mk(isF ? `(${a.c}${op}${b.c})` : wrapTo(t, `${a.c}${op}${b.c}`), t);
      case "*":
        if (isF) return mk(`(${a.c}*${b.c})`, t);
        return mk(t === "int32" || t === "uint32" ? wrapTo(t, `Math.imul(${a.c},${b.c})`) : wrapTo(t, `${a.c}*${b.c}`), t);
      case "/":
        return mk(isF ? `(${a.c}/${b.c})` : wrapTo(t, `$h.idiv(${a.c},${b.c})`), t);
      case "%":
        if (isF) return this.err("Invalid operands to binary % (float)");
        return mk(`$h.imod(${a.c},${b.c})`, t);
      case "<<": {
        if (isF) this.err("Invalid operands to binary << (float)");
        const lt = promote(a.ty, a.ty);
        return mk(wrapTo(lt, `${a.c}<<${b.c}`), lt);
      }
      case ">>": {
        if (isF) this.err("Invalid operands to binary >> (float)");
        const lt = promote(a.ty, a.ty);
        return mk(lt === "uint32" ? `(${a.c}>>>${b.c})` : `(${a.c}>>${b.c})`, lt);
      }
      case "&":
      case "|":
      case "^":
        if (isF) this.err(`Invalid operands to binary ${op} (float)`);
        return mk(t === "uint32" ? wrapTo(t, `${a.c}${op}${b.c}`) : `(${a.c}${op}${b.c})`, t);
      default:
        return this.err(`Unsupported operator '${op}'`);
    }
  }

  // --- calls -------------------------------------------------------------
  private call(e: Extract<Expr, { k: "call" }>): R {
    const mk = (c: string, ty: Ty): R => ({ c, ty, rank: 0 });
    const callee = e.callee;
    if (callee.k === "member") return this.memberCall(callee, e.args);
    if (callee.k !== "id") return this.err("Only named functions can be called");
    const name = callee.name;
    const user = this.funcs.get(name);
    if (user && !this.lookup(name)) {
      if (this.fn.sync) this.err(`Function '${name}()' cannot be called from a global initializer`);
      if (e.args.length !== user.params.length) this.err(`Function '${name}' expects ${user.params.length} argument(s), got ${e.args.length}`);
      const args = e.args.map((a, i) => {
        const p = user.params[i];
        const r = this.expr(a);
        if (p.rank > 0) {
          if (r.rank !== p.rank) this.err(`Argument ${i + 1} of '${name}' must be an array`);
          return r.c;
        }
        if (r.rank > 0) this.err(`Argument ${i + 1} of '${name}' is an array but a scalar was expected`);
        return p.ty === "string" && r.ty !== "string" ? `$h.toStr(${r.c},'${kindOf(r.ty)}')` : coerceTo(r, p.ty, this.line);
      });
      return mk(`(yield* f_${name}(${args.join(",")}))`, user.ret);
    }
    if (UNSUPPORTED_CALLS.has(name)) this.err(`${name}() is not supported by the simulator`);
    const a = e.args;
    const argc = (n: number | [number, number]): void => {
      const [lo, hi] = Array.isArray(n) ? n : [n, n];
      if (a.length < lo || a.length > hi) this.err(`Wrong number of arguments to '${name}()'`);
    };
    const num = (i: number, ty: Ty = "int32"): string => coerceTo(this.expr(a[i]), ty, this.line);
    const raw = (i: number): R => this.expr(a[i]);
    switch (name) {
      case "pinMode": argc(2); return mk(`$rt.pinMode(${num(0)},${num(1)})`, "void");
      case "digitalWrite": argc(2); return mk(`$rt.digitalWrite(${num(0)},${num(1)})`, "void");
      case "digitalRead": argc(1); return mk(`$rt.digitalRead(${num(0)})`, "int16");
      case "analogWrite": argc(2); return mk(`$rt.analogWrite(${num(0)},${num(1)})`, "void");
      case "analogRead": argc(1); return mk(`$rt.analogRead(${num(0)})`, "int16");
      case "analogReadResolution": case "analogWriteResolution": return this.err(`${name}() is not available on the Arduino UNO`);
      case "delay": argc(1); return mk(`(yield* $rt.delay(${num(0, "uint32")}))`, "void");
      case "delayMicroseconds": argc(1); return mk(`(yield* $rt.delayUs(${num(0, "uint32")}))`, "void");
      case "millis": argc(0); return mk("$rt.millis()", "uint32");
      case "micros": argc(0); return mk("$rt.micros()", "uint32");
      case "interrupts": case "noInterrupts": case "yield": argc(0); return mk("undefined", "void");
      case "randomSeed": argc(1); return mk(`$rt.randomSeed(${num(0)})`, "void");
      case "random": argc([1, 2]); return mk(a.length === 1 ? `$rt.random(0,${num(0)})` : `$rt.random(${num(0)},${num(1)})`, "int32");
      case "map": argc(5); return mk(`$h.map(${[0, 1, 2, 3, 4].map(i => num(i)).join(",")})`, "int32");
      case "abs": {
        argc(1);
        const r = raw(0);
        const t = promote(r.ty, r.ty);
        return mk(`Math.abs(${coerceTo(r, t, this.line)})`, t);
      }
      case "min":
      case "max": {
        argc(2);
        const x = raw(0);
        const y = raw(1);
        const t = promote(x.ty, y.ty);
        return mk(`Math.${name}(${coerceTo(x, t, this.line)},${coerceTo(y, t, this.line)})`, t);
      }
      case "constrain": {
        argc(3);
        const [x, lo, hi] = [raw(0), raw(1), raw(2)];
        const t = promote(promote(x.ty, lo.ty), hi.ty);
        return mk(`$h.clamp(${coerceTo(x, t, this.line)},${coerceTo(lo, t, this.line)},${coerceTo(hi, t, this.line)})`, t);
      }
      case "sq": {
        argc(1);
        const r = raw(0);
        const t = promote(r.ty, r.ty);
        return this.binary("*", { c: coerceTo(r, t, this.line), ty: t, rank: 0 }, { c: coerceTo(r, t, this.line), ty: t, rank: 0 });
      }
      case "pow": argc(2); return mk(`Math.pow(${num(0, "float")},${num(1, "float")})`, "float");
      case "atan2": argc(2); return mk(`Math.atan2(${num(0, "float")},${num(1, "float")})`, "float");
      case "radians": argc(1); return mk(`(${num(0, "float")}*${Math.PI / 180})`, "float");
      case "degrees": argc(1); return mk(`(${num(0, "float")}*${180 / Math.PI})`, "float");
      case "isnan": argc(1); return mk(`Number.isNaN(${num(0, "float")})`, "bool");
      case "isinf": argc(1); return mk(`(Math.abs(${num(0, "float")})===Infinity)`, "bool");
      case "bitRead": argc(2); return mk(`((${num(0)}>>${num(1)})&1)`, "int16");
      case "bitSet": case "bitClear": case "bitWrite": {
        argc(name === "bitWrite" ? 3 : 2);
        const lv = this.lvalue(a[0]);
        const bit = `(1<<${num(1)})`;
        const cur = lv.read;
        const nv = name === "bitSet" ? `(${cur}|${bit})` : name === "bitClear" ? `(${cur}&~${bit})` : `(${num(2)}?(${cur}|${bit}):(${cur}&~${bit}))`;
        return mk(this.withPre(lv.pre, lv.write(wrapTo(lv.ty, nv))), "void");
      }
      case "lowByte": argc(1); return mk(`(${num(0)}&255)`, "uint8");
      case "highByte": argc(1); return mk(`((${num(0)}>>8)&255)`, "uint8");
      case "_BV": argc(1); return mk(`(1<<${num(0)})`, "int16");
      case "toUpperCase": case "toLowerCase":
        if (a.length === 1 && raw(0).ty !== "string") return mk(`$h.${name === "toUpperCase" ? "toUpper" : "toLower"}(${num(0)})`, "char");
        return this.err(`Use ${name}() as a String method`);
      case "F": argc(1); return raw(0);
      case "String": {
        argc([0, 2]);
        if (a.length === 0) return mk("''", "string");
        const r = raw(0);
        if (r.ty === "string") return r;
        if (a.length === 2) {
          return r.ty === "float" ? mk(`$h.toStr(${r.c},'f',${num(1)})`, "string") : mk(`$h.toBase(${coerceTo(r, "int32", this.line)},${num(1)})`, "string");
        }
        return mk(`$h.toStr(${r.c},'${kindOf(r.ty)}')`, "string");
      }
      default:
    }
    if (FLOAT_FUNCS[name]) {
      argc(1);
      return mk(`${FLOAT_FUNCS[name]}(${num(0, "float")})`, "float");
    }
    if (CHAR_PREDICATES[name]) {
      argc(1);
      return mk(`$h.${CHAR_PREDICATES[name]}(${num(0)})`, "bool");
    }
    return this.err(`'${name}' was not declared in this scope`);
  }

  /** HD44780 character-LCD API shared by LiquidCrystal and LiquidCrystal_I2C. */
  private lcdCall(
    m: Extract<Expr, { k: "member" }>,
    a: Expr[],
    mk: (c: string, ty: Ty) => R,
    num: (i: number, ty?: Ty) => string,
    argc: (lo: number, hi?: number) => void,
  ): R {
    const simple: Record<string, string> = {
      clear: "lcdClear()", home: "lcdHome()",
      cursor: "lcdCursor(true)", noCursor: "lcdCursor(false)", blink: "lcdBlink(true)", noBlink: "lcdBlink(false)",
      display: "lcdDisplay(true)", noDisplay: "lcdDisplay(false)",
      scrollDisplayLeft: "lcdScroll(-1)", scrollDisplayRight: "lcdScroll(1)",
      autoscroll: "lcdAutoscroll(true)", noAutoscroll: "lcdAutoscroll(false)",
      leftToRight: "lcdDirection(true)", rightToLeft: "lcdDirection(false)",
      backlight: "lcdBacklight(true)", noBacklight: "lcdBacklight(false)",
    };
    if (simple[m.name]) {
      argc(0);
      return mk(`$rt.${simple[m.name]}`, "void");
    }
    switch (m.name) {
      case "begin": argc(2, 3); return mk(`$rt.lcdBegin(${num(0)},${num(1)})`, "void");
      case "init": case "createCursor": argc(0); return mk("$rt.lcdBegin(16,2)", "void");
      case "setBacklight": argc(1); return mk(`$rt.lcdBacklight(!!${num(0)})`, "void");
      case "setCursor": argc(2); return mk(`$rt.lcdSetCursor(${num(0)},${num(1)})`, "void");
      case "write": argc(1); return mk(`$rt.lcdWrite(${num(0)})`, "uint16");
      case "print": {
        argc(1, 2);
        const r = this.expr(a[0]);
        if (r.rank > 0) this.err("Cannot print an array");
        const val = r.ty === "bool" ? `(${r.c}?1:0)` : r.c;
        return mk(`$rt.lcdPrint(${val},'${kindOf(r.ty)}',${a.length === 2 ? num(1) : "0"})`, "uint16");
      }
      case "createChar": {
        argc(2);
        const glyph = this.expr(a[1]);
        if (glyph.rank !== 1) this.err("createChar() needs a byte[8] array of glyph rows");
        return mk(`$rt.lcdCreateChar(${num(0)},${glyph.c})`, "void");
      }
      default:
        return this.err(`'${m.name}' is not supported by the LCD simulator`);
    }
  }

  private memberCall(m: Extract<Expr, { k: "member" }>, args: Expr[]): R {
    const mk = (c: string, ty: Ty): R => ({ c, ty, rank: 0 });
    const a = args;
    const num = (i: number, ty: Ty = "int32"): string => coerceTo(this.expr(a[i]), ty, this.line);
    const argc = (lo: number, hi = lo): void => {
      if (a.length < lo || a.length > hi) this.err(`Wrong number of arguments to '${m.name}()'`);
    };
    if (m.obj.k === "id" && m.obj.name === "Serial" && !this.lookup("Serial")) {
      switch (m.name) {
        case "begin": argc(1, 2); return mk(`$rt.serialBegin(${num(0)})`, "void");
        case "end": case "flush": case "setTimeout": return mk("undefined", "void");
        case "print":
        case "println": {
          argc(0, 2);
          const nl = m.name === "println";
          if (a.length === 0) return mk(`$rt.serialPrint('','s',0,${nl})`, "uint16");
          const r = this.expr(a[0]);
          if (r.rank > 0) this.err("Cannot print an array");
          const fmt = a.length === 2 ? num(1) : "0";
          const val = r.ty === "bool" ? `(${r.c}?1:0)` : r.c;
          return mk(`$rt.serialPrint(${val},'${kindOf(r.ty)}',${fmt},${nl})`, "uint16");
        }
        case "write": {
          argc(1);
          const r = this.expr(a[0]);
          return mk(`$rt.serialPrint(${r.c},'${r.ty === "string" ? "s" : "c"}',0,false)`, "uint16");
        }
        case "available": argc(0); return mk("$rt.serialAvailable()", "int16");
        case "read": argc(0); return mk("$rt.serialRead()", "int16");
        case "peek": argc(0); return mk("$rt.serialPeek()", "int16");
        case "parseInt": return mk("$rt.serialParseInt()", "int32");
        case "parseFloat": return mk("$rt.serialParseFloat()", "float");
        case "readString": argc(0); return mk("$rt.serialReadString(-1)", "string");
        case "readStringUntil": argc(1); return mk(`$rt.serialReadString(${num(0)})`, "string");
        default:
          return this.err(`'Serial.${m.name}' is not supported by the simulator`);
      }
    }
    if (m.obj.k === "id" && m.obj.name === "Wire" && !this.lookup("Wire")) {
      // The I2C bus is implicit in the LCD model; bus setup calls are accepted so stock sketches compile.
      if (["begin", "setClock", "setWireTimeout"].includes(m.name)) return mk("undefined", "void");
      return this.err(`'Wire.${m.name}' is not supported by the simulator`);
    }
    if (m.obj.k === "id" && this.lcdObjs.has(m.obj.name) && this.lookup(m.obj.name)) return this.lcdCall(m, a, mk, num, argc);
    const obj = this.expr(m.obj);
    if (obj.ty !== "string" || obj.rank > 0) return this.err(`Request for member '${m.name}' in non-class value`);
    const s = obj.c;
    const str = (i: number): string => {
      const r = this.expr(a[i]);
      return r.ty === "string" ? r.c : r.ty === "char" ? `String.fromCharCode(${r.c})` : this.err("Expected a String or char argument");
    };
    /** Mutating String methods are compiled as assignments back to the receiver. */
    const mutate = (build: string): R => {
      if (m.obj.k !== "id" && m.obj.k !== "index") return this.err(`'${m.name}()' requires a variable receiver`);
      const lv = this.lvalue(m.obj);
      return mk(this.withPre(lv.pre, lv.write(build.split("$S").join(lv.read))), "void");
    };
    switch (m.name) {
      case "length": argc(0); return mk(`${s}.length`, "uint16");
      case "charAt": argc(1); return mk(`$h.charAt(${s},${num(0)})`, "char");
      case "substring": argc(1, 2); return mk(`$h.sub(${s},${num(0)}${a.length === 2 ? `,${num(1)}` : ""})`, "string");
      case "indexOf": argc(1, 2); return mk(`$h.indexOf(${s},${str(0)}${a.length === 2 ? `,${num(1)}` : ""})`, "int16");
      case "lastIndexOf": argc(1); return mk(`$h.lastIndexOf(${s},${str(0)})`, "int16");
      case "toInt": argc(0); return mk(`$h.toInt(${s})`, "int32");
      case "toFloat": case "toDouble": argc(0); return mk(`$h.toFloat(${s})`, "float");
      case "equals": argc(1); return mk(`(${s}===${str(0)})`, "bool");
      case "equalsIgnoreCase": argc(1); return mk(`$h.eqIgnoreCase(${s},${str(0)})`, "bool");
      case "startsWith": argc(1); return mk(`${s}.startsWith(${str(0)})`, "bool");
      case "endsWith": argc(1); return mk(`${s}.endsWith(${str(0)})`, "bool");
      case "compareTo": argc(1); return mk(`$h.cmp(${s},${str(0)})`, "int16");
      case "c_str": argc(0); return mk(s, "string");
      case "reserve": return mk("undefined", "void");
      case "toUpperCase": argc(0); return mutate("$S.toUpperCase()");
      case "toLowerCase": argc(0); return mutate("$S.toLowerCase()");
      case "trim": argc(0); return mutate("$S.trim()");
      case "concat": {
        argc(1);
        const r = this.expr(a[0]);
        return mutate(`$S+${r.ty === "string" ? r.c : `$h.toStr(${r.c},'${kindOf(r.ty)}')`}`);
      }
      case "replace": argc(2); return mutate(`$h.replace($S,${str(0)},${str(1)})`);
      case "remove": argc(1, 2); return mutate(`$h.remove($S,${num(0)}${a.length === 2 ? `,${num(1)}` : ""})`);
      case "setCharAt": argc(2); return mutate(`$h.setCharAt($S,${num(0)},${num(1)})`);
      default:
        return this.err(`'String' has no member named '${m.name}'`);
    }
  }
}

function fits(from: Ty, to: Ty): boolean {
  if (!isInt(from) || !isInt(to)) return false;
  return RANGE[to][0] <= RANGE[from][0] && RANGE[from][1] <= RANGE[to][1];
}

function coerceTo(r: R, to: Ty, line: number): string {
  if (r.rank > 0) throw new CompileError("Array used where a scalar was expected", line);
  if (r.ty === to) return r.c;
  if (to === "string") return `$h.toStr(${r.c},'${kindOf(r.ty)}')`;
  if (r.ty === "string") throw new CompileError("Cannot convert String to a numeric type", line);
  if (to === "void") return r.c;
  if (to === "bool") return `(!!${r.c})`;
  if (r.ty === "bool") return `(${r.c}?1:0)`;
  if (to === "float") return r.c;
  if (r.ty === "float") return wrapTo(to, `Math.trunc(${r.c})`);
  return fits(r.ty, to) ? r.c : wrapTo(to, r.c);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Transpiles a sketch to JavaScript source. No dynamic code evaluation happens here, so it runs on the Edge runtime. */
export function compileSketchToJs(source: string): { ok: true; js: string } | { ok: false; error: Diagnostic } {
  try {
    const raw = lex(source);
    const parser = new Parser(preprocess(raw), includedHeaders(raw));
    const items = parser.parseProgram();
    const js = new Codegen(parser.enumConsts).compile(items);
    return { ok: true, js };
  } catch (err) {
    if (err instanceof CompileError) return { ok: false, error: { line: err.line, message: err.message } };
    return { ok: false, error: { line: 1, message: err instanceof Error ? err.message : String(err) } };
  }
}

/** Compiles and instantiates in one step (tests and Node tooling; the deployed route returns the JavaScript instead). */
export function compileSketch(source: string): CompileResult {
  const compiled = compileSketchToJs(source);
  if (!compiled.ok) return compiled;
  try {
    const factory = new Function("$rt", "$h", compiled.js) as (rt: unknown, h: unknown) => SketchInstance;
    return { ok: true, sketch: { js: compiled.js, instantiate: (rt, h) => factory(rt, h) } };
  } catch (err) {
    return { ok: false, error: { line: 1, message: err instanceof Error ? err.message : String(err) } };
  }
}

// ---------------------------------------------------------------------------
// Static pin-usage analysis (drives the board's persistent module scaffolding)
// ---------------------------------------------------------------------------

function exprChildren(e: Expr): Expr[] {
  switch (e.k) {
    case "bin": return [e.l, e.r];
    case "un": case "incdec": case "cast": return [e.e];
    case "assign": return [e.l, e.r];
    case "cond": return [e.c, e.a, e.b];
    case "call": return [e.callee, ...e.args];
    case "member": return [e.obj];
    case "index": return [e.obj, e.idx];
    case "sizeof": return e.e ? [e.e] : [];
    case "comma": return e.list;
    case "init": return e.items;
    default: return [];
  }
}

function stmtExprs(s: Stmt, visit: (e: Expr) => void, decl: (d: Declarator) => void, lcd?: (l: Extract<Stmt, { k: "lcd" }>) => void): void {
  const sub = (x: Stmt | null): void => {
    if (x) stmtExprs(x, visit, decl, lcd);
  };
  switch (s.k) {
    case "block": s.body.forEach(sub); break;
    case "lcd": lcd?.(s); s.args.forEach(visit); break;
    case "decl": s.decls.forEach(d => { decl(d); if (d.init) visit(d.init); d.dims.forEach(x => x && visit(x)); }); break;
    case "expr": visit(s.e); break;
    case "if": visit(s.c); sub(s.a); sub(s.b); break;
    case "for": sub(s.init); if (s.c) visit(s.c); if (s.u) visit(s.u); sub(s.body); break;
    case "while": case "do": visit(s.c); sub(s.body); break;
    case "switch": visit(s.e); s.cases.forEach(c => { if (c.test) visit(c.test); c.body.forEach(sub); }); break;
    case "return": if (s.e) visit(s.e); break;
    default:
  }
}

const LCD_DEFAULT_PINS = [12, 11, 5, 4, 3, 2];

/** Wiring for the first LCD object; pins that are not compile-time constants fall back to the standard tutorial wiring. */
function lcdWiring(decl: Extract<Stmt, { k: "lcd" }> | undefined, evalConst: (e: Expr) => number | undefined): { lcd?: LcdWiring } {
  if (!decl) return {};
  const v = decl.args.map(evalConst);
  if (decl.cls === "LiquidCrystal_I2C") return { lcd: { mode: "i2c", pins: [18, 19], address: v[0] ?? 0x27 } };
  const n = v.length;
  // (rs, en, d4..d7) | (rs, rw, en, d4..d7) | 8-bit forms, where D4..D7 are the last four data lines.
  const rs = v[0];
  const en = n === 7 || n === 11 ? v[2] : v[1];
  const d = v.slice(-4);
  const pins = [rs, en, ...d];
  const ok = pins.every((p): p is number => p !== undefined && Number.isInteger(p) && p >= 0 && p <= 19);
  return { lcd: { mode: "parallel", pins: ok ? (pins as number[]) : LCD_DEFAULT_PINS, address: 0 } };
}

/** Resolves pin usage from pinMode/digitalRead/analogRead/digitalWrite calls; returns null when the sketch does not parse. */
export function analyzeSketch(source: string): PinUsage | null {
  let items: TopItem[];
  let enums: Map<string, number>;
  try {
    const raw = lex(source);
    const parser = new Parser(preprocess(raw), includedHeaders(raw));
    items = parser.parseProgram();
    enums = parser.enumConsts;
  } catch {
    return null;
  }
  const consts = new Map<string, number>();
  const calls: Extract<Expr, { k: "call" }>[] = [];
  const evalConst = (e: Expr): number | undefined => {
    switch (e.k) {
      case "num": case "chr": return e.v;
      case "id": {
        const v = consts.get(e.name) ?? enums.get(e.name);
        if (v !== undefined) return v;
        const k = CONSTANTS[e.name];
        const n = k ? Number(k.v) : NaN;
        return Number.isNaN(n) ? undefined : n;
      }
      case "un": {
        const v = evalConst(e.e);
        return v === undefined ? undefined : e.op === "-" ? -v : v;
      }
      case "bin": {
        const a = evalConst(e.l);
        const b = evalConst(e.r);
        if (a === undefined || b === undefined) return undefined;
        return e.op === "+" ? a + b : e.op === "-" ? a - b : e.op === "*" ? a * b : undefined;
      }
      default: return undefined;
    }
  };
  const visit = (e: Expr): void => {
    if (e.k === "call") calls.push(e);
    exprChildren(e).forEach(visit);
  };
  const decls: Declarator[] = [];
  const lcds: Extract<Stmt, { k: "lcd" }>[] = [];
  const collect = (s: Stmt): void => stmtExprs(s, visit, d => decls.push(d), l => lcds.push(l));
  for (const it of items) {
    if (it.k === "func") it.body?.forEach(collect);
    else collect(it);
  }
  // Only single-assignment scalars are safe to resolve statically.
  for (const d of decls) if (d.dims.length === 0 && d.init && d.init.k !== "init") {
    const v = evalConst(d.init);
    if (v !== undefined) consts.set(d.name, v);
  }
  // Global/local integer arrays of constants (e.g. int ledPins[] = {2, 3, 4, 5}) resolve to every element.
  const arrays = new Map<string, number[]>();
  for (const d of decls) {
    if (d.dims.length === 1 && d.init && d.init.k === "init") {
      const vals = d.init.items.map(evalConst);
      if (vals.every((v): v is number => v !== undefined)) arrays.set(d.name, vals);
    }
  }
  const pinsOf = (e: Expr | undefined): number[] => {
    if (!e) return [];
    const v = evalConst(e);
    if (v !== undefined) return [v];
    if (e.k === "index" && e.obj.k === "id") return arrays.get(e.obj.name) ?? [];
    return [];
  };
  const usage = { din: new Set<number>(), pull: new Set<number>(), ain: new Set<number>(), out: new Set<number>() };
  const declaredOut = new Set<number>();
  for (const c of calls) {
    if (c.callee.k !== "id") continue;
    const name = c.callee.name;
    const mode = c.args[1] ? evalConst(c.args[1]) : undefined;
    for (const pin of pinsOf(c.args[0])) {
      if (!Number.isInteger(pin)) continue;
      if (name === "analogRead") {
        const ch = pin >= 14 ? pin - 14 : pin;
        if (ch >= 0 && ch <= 5) usage.ain.add(ch);
      } else if (pin >= 0 && pin <= 13) {
        if (name === "pinMode") {
          if (mode === 1) declaredOut.add(pin);
          else if (mode === 0 || mode === 2) {
            usage.din.add(pin);
            if (mode === 2) usage.pull.add(pin);
          }
        } else if (name === "digitalRead") usage.din.add(pin);
        else if (name === "digitalWrite" || name === "analogWrite") usage.out.add(pin);
      }
    }
  }
  declaredOut.forEach(p => usage.out.add(p));
  usage.out.forEach(p => usage.din.delete(p));
  const sorted = (s: Set<number>): number[] => Array.from(s).sort((a, b) => a - b);
  return { digitalInputs: sorted(usage.din), pullups: sorted(usage.pull), analogInputs: sorted(usage.ain), outputs: sorted(usage.out), ...lcdWiring(lcds[0], evalConst) };
}
