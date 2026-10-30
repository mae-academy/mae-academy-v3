/** Messages to and from the parse Worker, and the parsed form the engine Worker receives. */

export interface ParseRequest {
  seq: number;
  latex: string;
}

export type ParseResponse = { seq: number; latex: string; ok: true; raw: unknown } | { seq: number; latex: string; ok: false; message: string };

/** Raw MathJSON of one LaTeX string, or why it has none (syntax crash, 200 ms timeout, parser unavailable). */
export type ParsedEntry = { ok: true; raw: unknown } | { ok: false; message: string };
