/**
 * Shared lookup so `iostreamPatch.ts` can print any monomorphized container (`cout << v;`)
 * without `iostream.js`/`vectorInclude.ts`/`stackInclude.ts`/etc. needing to know about each other.
 * Each `*Include.ts` module calls `registerContainerPrinter` once per concrete class it creates.
 */
import type { JscppValue } from "JSCPP";

export interface ContainerPrinter {
  open: string;
  close: string;
  items(container: JscppValue): Array<JscppValue<unknown>>;
  /** Defaults to `String(item.v)`; strings need `getStringFromCharArray` instead of raw `.v`. */
  formatItem?(item: JscppValue<unknown>): string;
}

const printers = new Map<string, ContainerPrinter>();

export function registerContainerPrinter(typeSignature: string, printer: ContainerPrinter): void {
  printers.set(typeSignature, printer);
}

export function getContainerPrinter(typeSignature: string): ContainerPrinter | undefined {
  return printers.get(typeSignature);
}
