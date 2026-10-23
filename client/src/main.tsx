import { createRoot } from "react-dom/client";
import i18n, { prepareLocale, storedLocale } from "./i18n/config";
import App from "./App";
import "./index.css";
import { inject } from "@vercel/analytics";

inject();

// Returning Arabic/Spanish visitors load their dictionaries before first paint so the UI never flashes English.
const locale = storedLocale();
const ready = locale === "en" ? Promise.resolve() : prepareLocale(locale).then(() => i18n.changeLanguage(locale)).then(() => undefined);
ready.catch(() => undefined).finally(() => createRoot(document.getElementById("root")!).render(<App />));

if (import.meta.env.VITE_ANALYTICS_ENDPOINT && import.meta.env.VITE_ANALYTICS_WEBSITE_ID) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${import.meta.env.VITE_ANALYTICS_ENDPOINT}/umami`;
  script.setAttribute("data-website-id", import.meta.env.VITE_ANALYTICS_WEBSITE_ID);
  document.head.appendChild(script);
}
