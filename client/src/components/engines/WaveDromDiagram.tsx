import { memo, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EngineError, EngineStatus, ImageFigure } from "./engineUi";
import { WaveRenderError, cachedWave, renderWaveDrom, type WaveFailure, type WaveRenderResult } from "./wavedromRender";

type View = { phase: "loading" } | { phase: "done"; result: WaveRenderResult } | { phase: "error"; failure: WaveFailure };

export function WaveDromPending() {
  const { t } = useTranslation("ai");
  return <EngineStatus icon={<Activity className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />} text={t("wavedrom.preparing")} />;
}

function pretty(code: string): string {
  try {
    return JSON.stringify(JSON.parse(code), null, 2);
  } catch {
    return code;
  }
}

function WaveDromDiagramImpl({ code }: { code: string }) {
  const { t } = useTranslation("ai");
  const [view, setView] = useState<View>(() => {
    const hit = cachedWave(code);
    return hit ? { phase: "done", result: hit } : { phase: "loading" };
  });

  useEffect(() => {
    let live = true;
    const hit = cachedWave(code);
    if (hit) {
      setView({ phase: "done", result: hit });
      return;
    }
    setView({ phase: "loading" });
    renderWaveDrom(code).then(
      (result) => live && setView({ phase: "done", result }),
      (error: unknown) => live && setView({ phase: "error", failure: error instanceof WaveRenderError ? error.failure : { kind: "internal" } }),
    );
    return () => {
      live = false;
    };
  }, [code]);

  if (view.phase === "loading") return <EngineStatus icon={<Activity className="h-4 w-4" aria-hidden="true" />} text={t("wavedrom.rendering")} busy />;
  if (view.phase === "error") {
    const { failure } = view;
    const detail = failure.kind === "invalid" ? `${t(`wavedrom.reason.${failure.reason}`)}${failure.detail ? ` (${failure.detail})` : ""}` : undefined;
    return <EngineError title={t(`wavedrom.error.${failure.kind}`)} detail={detail} source={pretty(code)} language="json" />;
  }
  const { result } = view;
  return (
    <ImageFigure
      svg={result.svg}
      width={result.width}
      height={result.height}
      alt={t("wavedrom.alt")}
      title={t("wavedrom.label")}
      source={pretty(code)}
      sourceLanguage="json"
      filePrefix="mae-timing"
    />
  );
}

export const WaveDromDiagram = memo(WaveDromDiagramImpl);
export default WaveDromDiagram;
