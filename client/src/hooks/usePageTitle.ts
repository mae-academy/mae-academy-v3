import { useEffect } from "react";

/**
 * Sets a unique per-route document.title for SEO and AdSense indexing.
 * Restores the previous title on unmount for correct back-navigation behaviour.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} — MAE Academy`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
