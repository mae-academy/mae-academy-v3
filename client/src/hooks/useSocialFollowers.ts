import { useEffect, useState } from "react";
import { SOCIAL_FOLLOWER_BASELINE, type SocialFollowersPayload } from "@shared/socialMetrics";

export const FOLLOWERS_ENDPOINT = "/api/telemetry/social";
/** The endpoint is cached at the edge for ~30 min; polling faster would only re-read the same response. */
export const FOLLOWERS_REFRESH_MS = 30 * 60_000;

export interface FollowerCounts {
  instagram: number;
  facebook: number;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 2_000_000_000;

/** Validates the API payload; anything malformed is ignored so the page keeps its current numbers. */
export function parseFollowers(data: unknown): FollowerCounts | null {
  const d = data as Partial<SocialFollowersPayload> | null;
  return d && isCount(d.instagram) && isCount(d.facebook) ? { instagram: d.instagram, facebook: d.facebook } : null;
}

/**
 * Follower counts for the landing page: starts from `initial` (baseline, so first paint never waits),
 * then replaces it with /api/telemetry/social on mount, every 30 minutes, and when a long-hidden tab returns.
 * A failed request (offline, API not configured, dev server) silently keeps the previous values.
 */
export function useSocialFollowers(initial: FollowerCounts = SOCIAL_FOLLOWER_BASELINE): FollowerCounts {
  const [counts, setCounts] = useState<FollowerCounts>(initial);

  useEffect(() => {
    if (typeof fetch !== "function") return;
    let cancelled = false;
    let last = 0;
    let controller: AbortController | undefined;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(FOLLOWERS_ENDPOINT, { signal: controller.signal, headers: { accept: "application/json" } });
        if (!res.ok) return;
        const next = parseFollowers(await res.json());
        last = Date.now();
        if (next && !cancelled) setCounts((prev) => (prev.instagram === next.instagram && prev.facebook === next.facebook ? prev : next));
      } catch {
        /* keep the current figures */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > FOLLOWERS_REFRESH_MS) void load();
    };

    void load();
    const interval = setInterval(load, FOLLOWERS_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return counts;
}
