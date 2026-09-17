/**
 * Browser shim for the "util" Node built-in. JSCPP's `printf` dependency only calls
 * `util.inspect` (for the %o format specifier); every other format specifier never touches it.
 */
export function inspect(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
export default { inspect };
