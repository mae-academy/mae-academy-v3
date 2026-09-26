import { StreamLanguage, type StreamParser, type StringStream } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const MASM_INSTRUCTIONS = new Set(
  "MOV ADD SUB PUSH POP INT CMP JMP JZ JNZ JE JNE JG JL JGE JLE JA JB JAE JBE JC JNC JO JNO JS JNS LOOP LOOPZ LOOPNZ LEA CALL RET RETN RETF XCHG HLT INC DEC MUL IMUL DIV IDIV AND OR XOR NOT TEST SHL SHR SAL SAR ROL ROR RCL RCR NOP CLC STC CLI STI".split(" ")
);
const MASM_REGISTERS = new Set(
  "AX AH AL BX BH BL CX CH CL DX DH DL SI DI BP SP IP CS DS ES SS FS GS".split(" ")
);
const MASM_DIRECTIVES = new Set(
  "DB DW DD DQ DT EQU PROC ENDP ASSUME SEGMENT ENDS OFFSET PTR MACRO ENDM ALIGN ORG INCLUDE".split(" ")
);

const readQuoted = (stream: StringStream): void => {
  const quote = stream.next();
  let ch: string | void;
  while ((ch = stream.next()) != null) {
    if (ch === "\\") stream.next();
    else if (ch === quote) return;
  }
};

const masmParser: StreamParser<unknown> = {
  name: "masm",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.peek() === ";") {
      stream.skipToEnd();
      return "comment";
    }
    const ch = stream.peek();
    if (ch === "'" || ch === '"') {
      readQuoted(stream);
      return "string";
    }
    if (ch === "." || ch === "@") {
      stream.next();
      stream.eatWhile(/[A-Za-z]/);
      return "directive";
    }
    if (ch !== undefined && /[0-9]/.test(ch)) {
      stream.eatWhile(/[0-9A-Za-z]/);
      return "number";
    }
    if (ch !== undefined && /[A-Za-z_?$]/.test(ch)) {
      stream.eatWhile(/[\w?$@]/);
      const word = stream.current().toUpperCase();
      if (MASM_INSTRUCTIONS.has(word)) return "instruction";
      if (MASM_REGISTERS.has(word)) return "register";
      if (MASM_DIRECTIVES.has(word)) return "directive";
      return null;
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: ";" } },
  tokenTable: {
    instruction: t.controlKeyword,
    register: t.function(t.variableName),
    directive: t.typeName,
  },
};

export const masmLanguage = StreamLanguage.define(masmParser);

const STL_MNEMONICS = new Set([
  "LD", "LDN", "A", "AN", "O", "ON", "ALD", "OLD", "LPS", "LRD", "LPP", "NOT", "EU", "ED", "S", "R", "SI", "RI", "TON", "TOF", "TONR",
  "CTU", "CTD", "CTUD", "MOVB", "MOVW", "MOVD", "MOVR", "+I", "-I", "*I", "/I", "+D", "-D", "*D", "/D", "+R", "-R", "*R", "/R", "SQRT", "SIN",
  "ANDW", "ORW", "XORW", "LDB=", "LDW=", "LDD=", "LDR=", "AW=", "OW=", "MCR", "MCRE", "END", "=",
]);

const stlParser: StreamParser<unknown> = {
  name: "stl",
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/^(?:NETWORK|TITLE|END_NETWORK)\b/)) return "directive";
    if (stream.match(/^[IQMVSTC]{1,2}[BWD]?\d+(?:\.\d+)?\b/)) return "register";
    if (stream.match(/^\d[\w.#]*/)) return "number";
    if (stream.match(/^[A-Za-z_=+\-*/][\w=]*/)) {
      return STL_MNEMONICS.has(stream.current().toUpperCase()) ? "instruction" : null;
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "//" } },
  tokenTable: {
    instruction: t.controlKeyword,
    register: t.function(t.variableName),
    directive: t.typeName,
  },
};

export const stlLanguage = StreamLanguage.define(stlParser);
