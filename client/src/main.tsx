import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.VITE_ANALYTICS_ENDPOINT && import.meta.env.VITE_ANALYTICS_WEBSITE_ID) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${import.meta.env.VITE_ANALYTICS_ENDPOINT}/umami`;
  script.setAttribute("data-website-id", import.meta.env.VITE_ANALYTICS_WEBSITE_ID);
  document.head.appendChild(script);
}
