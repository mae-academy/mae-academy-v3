/** Messages to and from the parse Worker, and the parsed form the engine Worker receives. */

export interface ParseRequest {
  seq: number;
  latex: string;
}

/** `unavailable`: Compute Engine could not be loaded (a network failure, not a property of the LaTeX). */
export type ParseResponse =
  | { seq: number; latex: string; ok: true; raw: unknown }
  | { seq: number; latex: string; ok: false; message: string; unavailable?: true };

/**
 * Raw MathJSON of one LaTeX string, or why it has none (syntax error, 200 ms timeout, parser unavailable).
 * `transient`: the reason may pass (parser offline, crashed or still starting); the page parses the line again later.
 */
export type ParsedEntry = { ok: true; raw: unknown } | { ok: false; message: string; transient?: true };
