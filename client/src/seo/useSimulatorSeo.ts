import { useEffect } from "react";
import { SEO_BY_KEY, type SimulatorSeoEntry } from "./simulatorSeoData";

export const SITE_ORIGIN = "https://maeacademy.org";
const JSON_LD_ID = "mae-simulator-jsonld";

function setMeta(selector: string, attr: "name" | "property", name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/** WebApplication / EducationalApplication JSON-LD for one simulator tool. */
export function buildToolJsonLd(entry: SimulatorSeoEntry) {
  return {
    "@context": "https://schema.org",
    "@type": ["WebApplication", "EducationalApplication"],
    name: entry.title.split(" | ")[0],
    alternateName: entry.name,
    description: entry.description,
    url: `${SITE_ORIGIN}${entry.path}`,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Engineering Simulator",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript",
    inLanguage: "en",
    isAccessibleForFree: true,
    educationalUse: "Simulation",
    audience: { "@type": "EducationalAudience", educationalRole: "student" },
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "MAE Academy", url: SITE_ORIGIN },
  };
}

export function applySimulatorSeo(entry: SimulatorSeoEntry) {
  document.title = entry.title;
  setMeta('meta[name="description"]', "name", "description", entry.description);
  setMeta('meta[property="og:title"]', "property", "og:title", entry.title);
  setMeta('meta[property="og:description"]', "property", "og:description", entry.description);
  setMeta('meta[property="og:url"]', "property", "og:url", `${SITE_ORIGIN}${entry.path}`);
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", entry.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", entry.description);

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = `${SITE_ORIGIN}${entry.path}`;

  let script = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null;
  if (!script) {
    script = document.createElement("script");
    script.id = JSON_LD_ID;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(buildToolJsonLd(entry));
}

/**
 * Applies title, description, canonical, social tags and JSON-LD for the given registry key.
 * Pass null to do nothing.
 */
export function useSimulatorSeo(key: string | null | undefined) {
  useEffect(() => {
    const entry = key ? SEO_BY_KEY[key] : undefined;
    if (!entry) return;
    applySimulatorSeo(entry);
    return () => {
      document.getElementById(JSON_LD_ID)?.remove();
    };
  }, [key]);
}
