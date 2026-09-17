/**
 * Browser shim for the "stream" Node built-in. Vite's default browser externalization turns it
 * into `{}` (production) or a throwing Proxy (dev) — both break JSCPP's `printf` dependency,
 * which does `require("stream").Stream` purely for an `instanceof` check on every printf() call.
 */
export class Stream {}
export default { Stream };
