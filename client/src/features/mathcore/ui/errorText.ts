/**
 * The text of an engine error in the reader's language: its catalog key translated through `errors.<key>` (en, ar,
 * es), with the English message as the fallback for an error that has no key (Compute Engine's own messages).
 */
import type { TFunction } from "i18next";
import type { ErrorKey, ErrorParams } from "@shared/mathcore/errors";
import { nameLatex } from "./nameLatex";

export interface ErrorLike {
  message: string;
  key?: ErrorKey;
  params?: ErrorParams;
}

export function errorText(t: TFunction, e: ErrorLike): string {
  if (!e.key) return e.message;
  return String(t(`errors.${e.key}`, { ...e.params, defaultValue: e.message }));
}

/** Parameters that are symbol names or lists of them: typeset as math inside the sentence (`$…$`, see MathMessage). */
const NAME_PARAMS = ["name", "fn"] as const;
const LIST_PARAMS = ["unknowns", "stray"] as const;

/** Like `errorText`, with the names inside the sentence wrapped in `$…$` so KaTeX typesets them (Part D). */
export function errorMath(t: TFunction, e: ErrorLike): string {
  if (!e.key) return e.message;
  const params: Record<string, unknown> = { ...e.params };
  for (const k of NAME_PARAMS) {
    const v = params[k];
    if (typeof v === "string") params[k] = `$${nameLatex(v)}$`;
  }
  for (const k of LIST_PARAMS) {
    const v = params[k];
    if (typeof v === "string") params[k] = `$${v.split(/,\s*/).map(nameLatex).join(",\\,")}$`;
  }
  return String(t(`errors.${e.key}`, { ...params, defaultValue: e.message }));
}
