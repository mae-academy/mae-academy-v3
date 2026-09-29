/**
 * Route-level prefetching and chunk management for the MAE Academy SPA.
 *
 * Why this exists:
 * After converting all routes to React.lazy(), navigating between pages now
 * requires downloading the JS chunk before anything renders. Without prefetching,
 * users see a spinner (PageLoader) on every first-visit transition.
 *
 * This module solves it with two strategies:
 * 1. Eager prefetch of high-priority routes on idle (core pages).
 * 2. Intent-based prefetch on hover/focus for all navigable links.
 *
 * The dynamic import() cache is native to the browser module system — once a
 * chunk is fetched, subsequent lazy() calls for the same module resolve
 * synchronously from the module graph cache.
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

// Heavy simulator pages — only prefetched on explicit hover, never eagerly.
const heavyChunks: Record<string, () => Promise<unknown>> = {
  "/simulations/arduino-studio": () => import("../pages/ArduinoStudioPage"),
  "/simulations/plc":            () => import("../pages/PlcSimulatorPage"),
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
 * Returns an onMouseEnter/onFocus handler that triggers a prefetch.
 * Designed for use on `<Link>` or `<a>` wrappers.
 *
 * Usage:
 *   <Link href="/about" onMouseEnter={prefetchOnHover("/about")} />
 */
export function prefetchOnHover(href: string): () => void {
  return () => prefetchRoute(href);
}
