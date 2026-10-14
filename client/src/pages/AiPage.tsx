/** MAE AI: a full-viewport, ChatGPT-style conversation with an engineering-professor assistant. */
import { useEffect, useLayoutEffect } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { ChatWorkspace } from "@/components/ai/ChatWorkspace";
import { usePageTitle } from "@/hooks/usePageTitle";
import { parseLabParam } from "@/lib/aiLab";

export default function AiPage() {
  const { t } = useTranslation("ai");
  usePageTitle(t("page.title"));

  // A chat UI has no indexable content; keep it out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  // `?lab=` (set by the "Chat with MAE AI" button on simulator pages) is an invisible hint for the assistant; there is no UI for it.
  const lab = parseLabParam(new URLSearchParams(useSearch()).get("lab"));

  // The chat fills exactly the space under the sticky site header, so the page itself never scrolls. The layout's
  // --mae-header-height is a fixed budget (120px) that the real header (one or two rows) does not match, which would
  // leave the document taller than the viewport; while this page is mounted, publish the measured height instead.
  useLayoutEffect(() => {
    const header = document.querySelector("header");
    if (!header) return undefined;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--mae-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--mae-header-height");
    };
  }, []);

  return (
    <div className="h-[calc(100dvh-var(--mae-header-height))] w-full">
      <ChatWorkspace lab={lab} className="h-full" />
    </div>
  );
}
