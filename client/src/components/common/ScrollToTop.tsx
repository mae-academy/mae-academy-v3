import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * ScrollToTop — Centralized route navigation scroll reset.
 * Immediately resets window scroll and container scroll offsets to (0, 0)
 * upon pathname changes across all simulation studios and pages.
 */
export default function ScrollToTop() {
  const [pathname] = useLocation();

  useEffect(() => {
    // Reset window scroll position to the top immediately upon pathname changes
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant", // Prevents visual lag or smooth scroll jumping
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
