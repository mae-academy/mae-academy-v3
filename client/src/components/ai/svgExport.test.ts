// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PNG_MAX_SIDE, diagramFilename, downloadBlob, pngSize, rasterizeSvg, svgDataUri } from "./svgExport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("svgExport", () => {
  it("builds a data URI that round-trips and cannot break out of the URL", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>a #b & "c"</text></svg>';
    const uri = svgDataUri(svg);
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(uri).not.toMatch(/[<>"# ]/);
    expect(decodeURIComponent(uri.slice(uri.indexOf(",") + 1))).toBe(svg);
  });

  it("renders PNGs at 2x and caps the long side", () => {
    expect(pngSize(800, 500)).toEqual({ width: 1600, height: 1000 });
    expect(pngSize(3000, 1000)).toEqual({ width: PNG_MAX_SIDE, height: Math.round((1000 * PNG_MAX_SIDE) / 3000) });
    expect(pngSize(1, 1)).toEqual({ width: 2, height: 2 });
    expect(Math.max(...Object.values(pngSize(20_000, 20_000)))).toBeLessThanOrEqual(PNG_MAX_SIDE);
  });

  it("names files mae-diagram-<timestamp>.<ext>", () => {
    const at = new Date(2026, 0, 5, 9, 3, 7);
    expect(diagramFilename("svg", at)).toBe("mae-diagram-20260105-090307.svg");
    expect(diagramFilename("png", at)).toBe("mae-diagram-20260105-090307.png");
  });

  it("downloads through a temporary link and revokes the object URL afterwards", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    downloadBlob(new Blob(["x"]), "a.svg");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("rasterises onto a white 2x canvas", async () => {
    const fills: string[] = [];
    const drawn: number[][] = [];
    const ctx = {
      set fillStyle(value: string) { fills.push(value); },
      fillRect: vi.fn(),
      drawImage: vi.fn((_image: unknown, ...rest: number[]) => drawn.push(rest)),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback, type?: string) {
      callback(new Blob([`${this.width}x${this.height}`], { type }));
    });
    vi.spyOn(window, "Image").mockImplementation(function (this: HTMLImageElement) {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", { set() { queueMicrotask(() => img.onload?.(new Event("load"))); } });
      return img;
    } as unknown as typeof Image);
    const blob = await rasterizeSvg("<svg/>", 800, 500);
    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("1600x1000");
    expect(fills).toEqual(["#ffffff"]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1600, 1000);
    expect(drawn).toEqual([[0, 0, 1600, 1000]]);
  });

  it("rejects instead of throwing synchronously when the image cannot load or encode", async () => {
    vi.spyOn(window, "Image").mockImplementation(function (this: HTMLImageElement) {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", { set() { queueMicrotask(() => img.onerror?.(new Event("error"))); } });
      return img;
    } as unknown as typeof Image);
    await expect(rasterizeSvg("<svg/>", 10, 10)).rejects.toThrow();
  });
});
