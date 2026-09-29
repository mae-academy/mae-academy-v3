/**
 * lazyRetry: A resilient wrapper around React.lazy() that retries a failed
 * dynamic import once before giving up. Handles flaky networks and Vercel
 * edge-cache misses gracefully.
 *
 * On retry failure, it reloads the page as a last resort (cache-busting stale
 * chunk manifests after a deployment).
 */
import { lazy, type ComponentType } from "react";

export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch(() => {
      // Wait 1.5s then retry once
      return new Promise<{ default: T }>((resolve, reject) => {
        setTimeout(() => {
          factory()
            .then(resolve)
            .catch(() => {
              // If the retry also fails, force a full reload to bust any
              // stale chunk manifest cached by the service worker or CDN.
              // Guard against infinite reload loops with a sessionStorage flag.
              const reloadKey = "mae-chunk-reload";
              if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, "1");
                window.location.reload();
              }
              reject(new Error("Failed to load page module after retry."));
            });
        }, 1500);
      });
    })
  );
}
