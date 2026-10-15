import { memo, useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EngineError, EngineStatus, ImageFigure } from "./engineUi";
import { MermaidRenderError, cachedMermaid, renderMermaid, type MermaidFailure, type MermaidRenderResult } from "./mermaidRender";
import { validateMermaid } from "./mermaidValidate";

type View = { phase: "loading" } | { phase: "done"; result: MermaidRenderResult } | { phase: "error"; failure: MermaidFailure };

function initial(code: string): View {
  const hit = cachedMermaid(code.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, ""));
  return hit ? { phase: "done", result: hit } : { phase: "loading" };
}

export function MermaidPending() {
  const { t } = useTranslation("ai");
  return <EngineStatus icon={<Workflow className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />} text={t("mermaid.preparing")} />;
}

function MermaidDiagramImpl({ code }: { code: string }) {
  const { t } = useTranslation("ai");
  const [view, setView] = useState<View>(() => initial(code));

  useEffect(() => {
    let live = true;
    const check = validateMermaid(code);
    if (!check.ok) {
      setView({ phase: "error", failure: { kind: "blocked", reason: check.reason } });
      return;
    }
    const hit = cachedMermaid(check.source);
    if (hit) setView({ phase: "done", result: hit });
    else setView({ phase: "loading" });
    if (!hit) {
      renderMermaid(code).then(
        (result) => live && setView({ phase: "done", result }),
        (error: unknown) => live && setView({ phase: "error", failure: error instanceof MermaidRenderError ? error.failure : { kind: "internal" } }),
      );
    }
    return () => {
      live = false;
    };
  }, [code]);

  if (view.phase === "loading") return <EngineStatus icon={<Workflow className="h-4 w-4" aria-hidden="true" />} text={t("mermaid.rendering")} busy />;
  if (view.phase === "error") {
    const { failure } = view;
    const detail = failure.kind === "blocked" ? t(`mermaid.blocked.${failure.reason}`) : failure.kind === "syntax" ? failure.message : undefined;
    return <EngineError title={t(`mermaid.error.${failure.kind}`)} detail={detail} source={code} language="text" />;
  }
  const { result } = view;
  return (
    <ImageFigure
      svg={result.svg}
      width={result.width}
      height={result.height}
      alt={t("mermaid.alt")}
      title={t("mermaid.label")}
      source={code}
      sourceLanguage="text"
      filePrefix="mae-diagram"
    />
  );
}

export const MermaidDiagram = memo(MermaidDiagramImpl);
export default MermaidDiagram;
