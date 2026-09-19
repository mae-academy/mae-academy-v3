import type { TranspileDiagnostic } from './types';

/**
 * STL / AWL tokenizer.
 *
 * Line oriented, as the language is: one instruction per line, `//` to end of line for comments.
 * Micro/WIN block scaffolding (`ORGANIZATION_BLOCK`, `TITLE=`, `BEGIN`, `END_...`) is recognised and
 * skipped so a file exported from the real software can be fed straight back in.
 */

export interface Token {
  readonly opcode: string;
  readonly operands: readonly string[];
  /** Trailing `//` comment, without the slashes. */
  readonly comment?: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based column of the opcode. */
  readonly column: number;
}

export interface NetworkBlock {
  /** Number from the `NETWORK n` header, or a running index when the header is absent. */
  readonly index: number;
  readonly title?: string;
  readonly line: number;
  readonly tokens: readonly Token[];
}

export interface TokenizeOutput {
  readonly blocks: readonly NetworkBlock[];
  readonly diagnostics: readonly TranspileDiagnostic[];
}

/** Structural keywords that carry no logic and are dropped. */
const BLOCK_KEYWORDS = new Set([
  'ORGANIZATION_BLOCK',
  'END_ORGANIZATION_BLOCK',
  'SUBROUTINE_BLOCK',
  'END_SUBROUTINE_BLOCK',
  'INTERRUPT_BLOCK',
  'END_INTERRUPT_BLOCK',
  'BEGIN',
  'VAR',
  'END_VAR',
  'PROGRAM_TITLE_COMMENTS',
  'END_PROGRAM_TITLE_COMMENTS',
]);

const NETWORK_RE = /^NETWORK\b\s*(\d+)?/i;

export function tokenize(source: string): TokenizeOutput {
  const diagnostics: TranspileDiagnostic[] = [];
  const blocks: NetworkBlock[] = [];

  let current: { index: number; title?: string; line: number; tokens: Token[] } | null = null;
  let autoIndex = 0;

  const open = (index: number, line: number, title?: string): void => {
    current = title === undefined ? { index, line, tokens: [] } : { index, line, title, tokens: [] };
    blocks.push(current as NetworkBlock);
  };

  source.split(/\r?\n/).forEach((raw, position) => {
    const line = position + 1;

    // Split off the comment before anything else; `//` never appears inside an STL operand.
    const commentAt = raw.indexOf('//');
    const comment = commentAt === -1 ? undefined : raw.slice(commentAt + 2).trim();
    const code = (commentAt === -1 ? raw : raw.slice(0, commentAt)).trim();

    if (code === '') return;

    const network = NETWORK_RE.exec(code);
    if (network) {
      autoIndex = network[1] === undefined ? autoIndex + 1 : Number(network[1]);
      open(autoIndex, line, comment);
      return;
    }

    const upper = code.toUpperCase();
    if (BLOCK_KEYWORDS.has(upper.split(/\s+/)[0] ?? '') || upper.startsWith('TITLE=')) return;

    const match = /^(\S+)\s*(.*)$/.exec(code);
    if (!match || match[1] === undefined) {
      diagnostics.push({ code: 'SYNTAX_ERROR', severity: 'error', message: `Cannot read instruction "${code}"`, line, column: 1 });
      return;
    }
    const opcode = match[1].toUpperCase();
    const rest = (match[2] ?? '').trim();
    const operands = rest === '' ? [] : rest.split(/[,\s]+/).filter((part) => part !== '');

    if (current === null) {
      // Instructions before the first header still belong to a network.
      open(autoIndex === 0 ? 1 : autoIndex, line);
      autoIndex = Math.max(autoIndex, 1);
    }
    const token: Token = {
      opcode,
      operands,
      ...(comment === undefined || comment === '' ? {} : { comment }),
      line,
      column: raw.indexOf(match[1]) + 1,
    };
    (current as { tokens: Token[] }).tokens.push(token);
  });

  return { blocks, diagnostics };
}
