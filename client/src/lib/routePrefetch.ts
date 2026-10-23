/**
 * Route-level prefetching and chunk management for the MAE Academy SPA.
 *
 * Why this exists:
 * After converting all routes to React.lazy(), navigating between pages now
 * requires downloading the JS chunk before anything renders. Without prefetching,
 * users see a spinner (PageLoader) on every first-visit transition.
 *
 * This module solves it with two strategies:
 * 1. Eager prefetch of high-priority routes on idle (core pages + simulator hub).
 * 2. Intent-based prefetch on hover/focus for all navigable links.
 *
 * The dynamic import() cache is native to the browser module system — once a
 * chunk is fetched, subsequent lazy() calls for the same module resolve
 * synchronously from the module graph cache.
 *
 * Simulator-specific notes:
 * - SimulationDetail is a SINGLE page chunk that renders ALL tool studios eagerly
 *   (no per-tool lazy loading). Tab switching inside a simulator is instant.
 * - The only "Loading Module..." you'll see for simulators is on first navigation
 *   TO a simulator slug (e.g. /simulations/control-systems). Prefetching
 *   SimulationDetail during idle eliminates it.
 */

// ── Route chunk import factories ────────────────────────────────────────────
// These MUST be the identical import() expressions used in App.tsx lazy() calls
// so the browser deduplicates them against the same module specifier.
const routeChunks: Record<string, () => Promise<unknown>> = {
  "/":                    () => import("../pages/Home"),
  "/research":            () => import("../pages/Research"),
  "/library":             () => import("../pages/AcademicLibrary"),
  "/simulations":         () => import("../pages/Simulations"),
  "/about":               () => import("../pages/About"),
  "/privacy":             () => import("../pages/Privacy"),
  "/privacy-policy":      () => import("../pages/PrivacyPolicy"),
  "/terms":               () => import("../pages/Terms"),
  "/terms-of-service":    () => import("../pages/TermsOfService"),
  "/attribution-policy":  () => import("../pages/AttributionPolicy"),
};

// Heavy simulator pages — prefetched on hover AND warmed during idle after core routes.
const heavyChunks: Record<string, () => Promise<unknown>> = {
  "/simulations/arduino-studio":       () => import("../pages/ArduinoStudioPage"),
  "/simulations/plc":                  () => import("../pages/PlcSimulatorPage"),
  "/simulations/control-systems":      () => import("../pages/SimulationDetail"),
  "/simulations/power-electronics":    () => import("../pages/SimulationDetail"),
  "/simulations/signals-and-systems":  () => import("../pages/SimulationDetail"),
  "/simulations/circuit-lab":          () => import("../pages/SimulationDetail"),
  "/simulations/digital-logic-design": () => import("../pages/SimulationDetail"),
  "/simulations/code":                 () => import("../pages/SimulationDetail"),
};

// Track what has already been prefetched to avoid redundant calls.
const prefetched = new Set<string>();

/**
 * Prefetch a single route's JS chunk.
 * Safe to call multiple times — deduplicates via the `prefetched` set.
 */
export function prefetchRoute(href: string): void {
  if (prefetched.has(href)) return;

  // Normalize path: strip trailing slashes, take base route for nested paths
  const normalized = href.replace(/\/+$/, "") || "/";

  const factory = routeChunks[normalized] ?? heavyChunks[normalized];
  if (!factory) return;

  prefetched.add(normalized);

  // Fire-and-forget: we only care about warming the module cache.
  factory().catch(() => {
    // If the prefetch fails (e.g. offline), remove from set so it can retry.
    prefetched.delete(normalized);
  });
}

/** False on Save-Data and slow cellular links, where speculative downloads would compete with the page the user is on. */
function canPrefetch(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !(c?.saveData || (c?.effectiveType && /(^|-)2g$|3g/.test(c.effectiveType)));
}

/**
 * Warm the light core routes once the page has loaded and the browser is idle.
 * The heavy simulator chunks (SimulationDetail, Arduino, PLC: several MB of JS that must also be
 * evaluated on import) are deliberately NOT warmed here: doing so froze pages like /contact on
 * mid-range phones. They are prefetched on hover/focus intent instead (see prefetchOnHover).
 */
export function prefetchCoreRoutes(): void {
  if (!canPrefetch()) return;
  // Only the two main calls to action. /about is excluded on purpose: its chunk graph pulls in KaTeX (~520 kB).
  const coreRoutes = ["/simulations", "/library"];

  const prefetchBatch = () => {
    for (const route of coreRoutes) prefetchRoute(route);
  };

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback(prefetchBatch, { timeout: 8000 });
    } else {
      setTimeout(prefetchBatch, 4000);
    }
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

/**
 * Returns an onMouseEnter/onFocus handler that triggers a prefetch.
 * Designed for use on `<Link>` or `<a>` wrappers.
 *
 * Usage:
 *   <Link href="/about" onMouseEnter={prefetchOnHover("/about")} />
 */
export function prefetchOnHover(href: string): () => void {
  return () => prefetchRoute(href);
}
