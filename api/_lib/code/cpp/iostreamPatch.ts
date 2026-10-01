/**
 * Wraps JSCPP's built-in `iostream` include so `cout << v;` prints a readable container
 * representation (`[10, 20, 30]`, `{1, 3, 5}`) for our monomorphized STL types.
 *
 * `iostream.js` installs `cout`'s `<<` as a single hand-written handler function
 * (`rt.types[coutSig].handlers["o(<<)"].default`) rather than through JSCPP's normal
 * `regOperator` multi-overload system, so there is no per-type-signature overload slot to add
 * one to — the only way in is to replace that function with one that special-cases container
 * types and otherwise delegates to the original. This module must run its `load(rt)` *after*
 * the real `iostream` include's, so `cppEngine.ts` wires it in as a wrapper around
 * `JSCPP.includes.iostream` (captured once, before being overwritten) rather than as its own
 * `#include`-able header — `cout` itself only exists once the real iostream load has run.
 */
import type { JscppCRuntime, JscppInclude, JscppValue } from "JSCPP";

import { getContainerPrinter } from "./containerRegistry";

function formatContainer(rt: JscppCRuntime, value: JscppValue): string | undefined {
  const printer = getContainerPrinter(rt.getTypeSignature(value.t));
  if (!printer) return undefined;
  const parts = printer.items(value).map(item => (printer.formatItem ? printer.formatItem(item) : String(item.v)));
  return `${printer.open}${parts.join(", ")}${printer.close}`;
}

export function wrapIostreamForContainerPrinting(original: JscppInclude): JscppInclude {
  return {
    load(rt) {
      original.load(rt);

      const coutType = { type: "class", name: "ostream" } as const;
      const coutSig = rt.getTypeSignature(coutType);
      const handler = rt.types[coutSig]?.handlers?.["o(<<)"]?.default;
      if (!handler) return; // Defensive: only patch if the real iostream actually installed cout.

      rt.types[coutSig]!.handlers!["o(<<)"].default = (_rt, _cout, t) => {
        const containerText = formatContainer(_rt, t);
        if (containerText !== undefined) {
          (_cout.v as { ostream: { write(s: string): void } }).ostream.write(containerText);
          return _cout;
        }
        return handler(_rt, _cout, t);
      };
    },
  };
}
