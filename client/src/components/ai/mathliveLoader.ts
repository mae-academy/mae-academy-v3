/**
 * Loads MathLive on first need. The composer is a text editor first: it works before (and without) MathLive, showing
 * formulas as atomic KaTeX chips, and upgrades them to editable `<math-field>`s once the module is in.
 *
 * Fonts: MathLive's own font loader stays off (`fontsDirectory = null`, like the signals input); the `KaTeX_*` faces it asks for are the
 * ones the app already ships with KaTeX, and `@font-face` rules in the document apply inside its shadow roots.
 */
const LOAD_TIMEOUT_MS = 8000;

let pending: Promise<boolean> | null = null;
let failed = false;

export const MATH_FIELD_TAG = "math-field";

/** True once the `<math-field>` element is defined (MathLive loaded, or a test stub registered). */
export function isMathLiveReady(): boolean {
  return typeof customElements !== "undefined" && customElements.get(MATH_FIELD_TAG) !== undefined;
}

export function hasMathLiveFailed(): boolean {
  return failed;
}

/** Resolves true when `<math-field>` is usable, false on error or timeout. Never rejects; safe to call repeatedly. */
export function loadMathLive(): Promise<boolean> {
  if (isMathLiveReady()) return Promise.resolve(true);
  if (typeof customElements === "undefined") return Promise.resolve(false);
  if (pending) return pending;
  const load = import("mathlive").then(({ MathfieldElement }) => {
    MathfieldElement.fontsDirectory = null;
    MathfieldElement.soundsDirectory = null;
    return isMathLiveReady();
  });
  const timeout = new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), LOAD_TIMEOUT_MS));
  pending = Promise.race([load, timeout])
    .catch(() => false)
    .then((ok) => {
      if (!ok) {
        failed = true;
        pending = null; // a later attempt may succeed (offline blip)
      }
      return ok;
    });
  return pending;
}
