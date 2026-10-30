/** Messages to and from the parse Worker, and the parsed form the engine Worker receives. */

export interface ParseRequest {
  seq: number;
  latex: string;
}

/** `unavailable`: Compute Engine could not be loaded (a network failure, not a property of the LaTeX). */
export type ParseResponse =
  | { seq: number; latex: string; ok: true; raw: unknown }
  | { seq: number; latex: string; ok: false; message: string; unavailable?: true };

/** Raw MathJSON of one LaTeX string, or why it has none (syntax crash, 200 ms timeout, parser unavailable). */
export type ParsedEntry = { ok: true; raw: unknown } | { ok: false; message: string };
