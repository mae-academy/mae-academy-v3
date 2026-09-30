import { useEffect } from "react";
import { getSimulationMeta } from "@/config/simulationsMeta";

const SITE_ORIGIN = "https://maeacademy.org";

/** Canonical path for a route: simulation meta path when known, else the bare path (no query/hash). */
export function resolveCanonicalPath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "simulations" && segments.length >= 2) {
    const meta =
      getSimulationMeta(path) ?? getSimulationMeta(`/${segments.slice(0, 2).join("/")}`);
    if (meta) return meta.canonicalPath;
  }
  return path;
}

/** Keeps <link rel="canonical"> in sync with the current route. */
export function useCanonical(pathname: string) {
  useEffect(() => {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = `${SITE_ORIGIN}${resolveCanonicalPath(pathname)}`;
  }, [pathname]);
}
