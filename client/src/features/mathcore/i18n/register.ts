/**
 * Registers the `mathcore` i18next namespace (ADR-13). The dictionaries live in the mathcore chunk, so other pages
 * carry none of them (STEPS.md §7.2: mathcore costs 0 bytes on other routes).
 */
import i18n from "i18next";
import ar from "./ar.json";
import en from "./en.json";
import es from "./es.json";

export const NS = "mathcore";

for (const [lng, data] of [["en", en], ["ar", ar], ["es", es]] as const) {
  if (!i18n.hasResourceBundle(lng, NS)) i18n.addResourceBundle(lng, NS, data, true, true);
}
