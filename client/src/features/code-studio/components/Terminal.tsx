import { useEffect, useRef, type RefObject } from "react";

import {
  GFX_HEIGHT,
  GFX_WIDTH,
  GRAPHICS_MODE,
  VGA_256_PALETTE,
  type GraphicsSnapshot,
  type VideoState,
} from "@/features/emulator/videoMemory";

interface TerminalSurfaceProps {
  /** Plain stdout used for C/C++/Python and as the MASM fallback before any step exists. */
  stdout?: string;
  /** MASM 80x25 VRAM snapshot; when present the grid is rendered instead of plain text. */
  video?: VideoState | null;
  awaitingInput?: boolean;
  active?: boolean;
  emptyLabel: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

const BLINK_STYLE = { animation: "terminal-blink 1s steps(1) infinite" } as const;

const PALETTE_RGB: ReadonlyArray<readonly [number, number, number]> =
  VGA_256_PALETTE.map(hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);

/** Mode 13h surface: 320x200 canvas, replaying the shared pixel log up to `count`. */
function GraphicsCanvas({ graphics }: { graphics: GraphicsSnapshot | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const image = context.createImageData(GFX_WIDTH, GFX_HEIGHT);
    for (let offset = 0; offset < GFX_WIDTH * GFX_HEIGHT; offset++)
      image.data[offset * 4 + 3] = 255; // opaque black background
    const count = graphics?.count ?? 0;
    for (let index = 0; index < count; index++) {
      const entry = graphics!.pixels[index];
      const color = entry % 256;
      const offset = (entry - color) / 256;
      const [r, g, b] = PALETTE_RGB[color];
      image.data[offset * 4] = r;
      image.data[offset * 4 + 1] = g;
      image.data[offset * 4 + 2] = b;
    }
    context.putImageData(image, 0, 0);
  }, [graphics]);

  return (
    <canvas
      ref={canvasRef}
      width={GFX_WIDTH}
      height={GFX_HEIGHT}
      data-testid="vga-canvas"
      style={{ imageRendering: "pixelated" }}
      className="w-full max-w-[640px] h-auto bg-black"
    />
  );
}

export function TerminalSurface({
  stdout,
  video,
  awaitingInput = false,
  active = false,
  emptyLabel,
  scrollRef,
}: TerminalSurfaceProps) {
  if (!video) {
    if (!stdout) {
      return (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs text-slate-100 leading-relaxed bg-[#050608] select-text">
          <div className="text-slate-600 italic">{emptyLabel}</div>
        </div>
      );
    }

    const exitMatch = stdout.match(/^([\s\S]*?)(?:^|\n)?(\[Process exited with code \d+\])\s*$/);
    if (exitMatch) {
      const mainOutput = exitMatch[1].replace(/\n$/, "");
      const exitFooter = exitMatch[2];

      return (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs text-slate-100 leading-relaxed bg-[#050608] select-text">
          {mainOutput ? (
            <p className="whitespace-pre-wrap">{mainOutput}</p>
          ) : null}
          <div className="text-xs text-slate-500 font-mono italic mt-2" data-testid="terminal-exit-footer">
            {exitFooter}
          </div>
        </div>
      );
    }

    return (
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs text-slate-100 leading-relaxed bg-[#050608] select-text">
        <p className="whitespace-pre-wrap">{stdout}</p>
      </div>
    );
  }

  if (video.videoMode === GRAPHICS_MODE) {
    return (
      <div
        ref={scrollRef}
        data-testid="vga-terminal"
        data-awaiting-input={awaitingInput}
        className={`flex-1 min-h-0 overflow-auto bg-black p-2 ${
          awaitingInput ? "ring-1 ring-inset ring-violet-500/70" : ""
        }`}
      >
        <GraphicsCanvas graphics={video.graphics} />
      </div>
    );
  }

  const showCursor = video.cursorVisible && (active || awaitingInput);
  return (
    <div
      ref={scrollRef}
      data-testid="vram-terminal"
      data-awaiting-input={awaitingInput}
      className={`flex-1 min-h-0 overflow-auto bg-black p-2 select-text ${
        awaitingInput ? "ring-1 ring-inset ring-violet-500/70" : ""
      }`}
    >
      <style>{"@keyframes terminal-blink{0%,49%{opacity:1}50%,100%{opacity:0}}"}</style>
      <div className="inline-block font-mono text-[13px] leading-[1.15]">
        {video.grid.map((row, rowIndex) => (
          <div key={rowIndex} className="flex whitespace-pre">
            {row.map((cell, colIndex) => {
              const isCursor =
                showCursor &&
                rowIndex === video.cursorRow &&
                colIndex === video.cursorCol;
              return (
                <span
                  key={colIndex}
                  data-cursor={isCursor || undefined}
                  style={{
                    color: isCursor ? cell.bg : cell.fg,
                    backgroundColor: isCursor ? cell.fg : cell.bg,
                    ...(isCursor ? BLINK_STYLE : null),
                  }}
                >
                  {cell.char || " "}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
