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
  "/privacy-policy":      () => import("../pages/PrivacyPolicy"),
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

/**
 * Eagerly prefetch core navigation routes during browser idle time.
 * Called once from App.tsx on mount.
 */
export function prefetchCoreRoutes(): void {
  const coreRoutes = ["/", "/research", "/library", "/simulations", "/about"];

  const prefetchBatch = () => {
    for (const route of coreRoutes) {
      prefetchRoute(route);
    }
  };

  // Use requestIdleCallback where available, else defer via setTimeout
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(prefetchBatch);
  } else {
    setTimeout(prefetchBatch, 2000);
  }
}

/**
 * Warm the SimulationDetail chunk (shared by all /simulations/* slugs) plus
 * ArduinoStudio and PlcSimulator during a second idle callback, after core
 * routes are already cached. This eliminates the "Loading Module..." flash
 * for first-time simulator navigation.
 *
 * Called from App.tsx after prefetchCoreRoutes().
 */
export function prefetchSimulatorHub(): void {
  const simulatorRoutes = [
    "/simulations/control-systems",   // warms SimulationDetail chunk
    "/simulations/arduino-studio",
    "/simulations/plc",
  ];

  const prefetchBatch = () => {
    for (const route of simulatorRoutes) {
      prefetchRoute(route);
    }
  };

  const schedule = (cb: () => void) => {
    if ("requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
        .requestIdleCallback(cb, { timeout: 5000 });
    } else {
      setTimeout(cb, 4000);
    }
  };

  // Delay by one extra idle cycle so we don't compete with core prefetches
  schedule(() => schedule(prefetchBatch));
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
