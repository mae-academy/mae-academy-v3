import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * ScrollToTop — Centralized route navigation scroll reset.
 * Resets window scroll and container scroll offsets to (0, 0)
 * upon pathname changes across all simulation studios and pages,
 * unless a target hash (e.g. #data-deletion) is present.
 */
export default function ScrollToTop() {
  const [pathname] = useLocation();

  useEffect(() => {
    // If a hash target exists in the URL (e.g. #data-deletion), scroll to it
    if (window.location.hash) {
      const targetId = window.location.hash.replace(/^#/, "");
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    // Reset window scroll position to the top immediately upon pathname changes
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    // Also reset document-level and main viewport containers
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }

    const mainContainer = document.getElementById("root") || document.querySelector("main");
    if (mainContainer) {
      mainContainer.scrollTop = 0;
    }
  }, [pathname]);

  return null;
}
