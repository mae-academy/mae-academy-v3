/**
 * The text of an engine error in the reader's language: its catalog key translated through `errors.<key>` (en, ar,
 * es), with the English message as the fallback for an error that has no key (Compute Engine's own messages).
 */
import type { TFunction } from "i18next";
import type { ErrorKey, ErrorParams } from "@shared/mathcore/errors";

export interface ErrorLike {
  message: string;
  key?: ErrorKey;
  params?: ErrorParams;
}

export function errorText(t: TFunction, e: ErrorLike): string {
  if (!e.key) return e.message;
  return String(t(`errors.${e.key}`, { ...e.params, defaultValue: e.message }));
}
