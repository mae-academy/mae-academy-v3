import { useEffect } from "react";
import { getSimulationMeta } from "@/config/simulationsMeta";
import { SIMULATOR_SEO } from "@/seo/simulatorSeoData";

const SITE_ORIGIN = "https://maeacademy.org";

/** Paths that are alternate entry points to a tool that has its own canonical URL. */
const PATH_ALIASES: Record<string, string> = {
  "/simulators/arduino-studio": "/simulations/arduino-studio",
  "/simulators/plc-simulator": "/simulations/plc",
  "/privacy-policy": "/privacy",
  "/terms-of-service": "/terms",
};

/** Canonical URL path for a route: a tool's own registry path when it has one, else the simulation meta path, else the bare path. */
export function resolveCanonicalPath(pathname: string, search = ""): string {
  const raw = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const path = PATH_ALIASES[raw] ?? raw;
  const params = new URLSearchParams(search);

  // Single-route suites carry the active mode in the query string (?tool=kmap, ?platform=logo).
  const withQuery = SIMULATOR_SEO.find((entry) => {
    const [entryPath, entryQuery] = entry.path.split("?");
    if (entryPath !== path || !entryQuery) return false;
    const [k, v] = entryQuery.split("=");
    return params.get(k) === v;
  });
  if (withQuery) return withQuery.path;

  const exact = SIMULATOR_SEO.find((entry) => entry.path === path);
  if (exact) return exact.path;

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
    link.href = `${SITE_ORIGIN}${resolveCanonicalPath(pathname, window.location.search)}`;
  }, [pathname]);
}
