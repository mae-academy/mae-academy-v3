/// <reference lib="webworker" />
/**
 * Parse Worker (STEPS.md §7.1 technique 5, §9): LaTeX → raw MathJSON with Compute Engine, off the main thread and off
 * the engine Worker. One expression per request, so the page can stop a parse that runs longer than 200 ms by
 * replacing this Worker. Compute Engine is imported lazily here (ADR-1, ADR-12).
 */
import type { RawParser } from "@shared/mathcore/parse/parse";
import type { ParseRequest, ParseResponse } from "./parseProtocol";

declare const self: DedicatedWorkerGlobalScope;

let parser: Promise<RawParser> | null = null;

/** One Compute Engine per Worker; a failed download is not cached, so the next request tries again. */
function getParser(): Promise<RawParser> {
  parser ??= import("@cortex-js/compute-engine")
    .then(({ ComputeEngine }) => {
      const ce = new ComputeEngine();
      return (latex: string): unknown => ce.parse(latex, { form: "raw" }).json;
    })
    .catch((err: unknown) => {
      parser = null;
      throw err;
    });
  return parser;
}

self.onmessage = (ev: MessageEvent<ParseRequest>) => {
  const { seq, latex } = ev.data;
  void getParser().then(
    (p) => {
      let msg: ParseResponse;
      try {
        msg = { seq, latex, ok: true, raw: p(latex) };
      } catch (err) {
        msg = { seq, latex, ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      self.postMessage(msg);
    },
    (err: unknown) => {
      self.postMessage({
        seq,
        latex,
        ok: false,
        message: `The math parser could not load: ${err instanceof Error ? err.message : String(err)}`,
        unavailable: true,
      } satisfies ParseResponse);
    },
  );
};
