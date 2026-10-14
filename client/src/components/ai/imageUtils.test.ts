// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_MAX_IMAGE_BYTES } from "@shared/aiTypes";
import { ImageError, dataUrlBytes, fitWithin, isAcceptedImageType, prepareImageForChat } from "./imageUtils";

describe("fitWithin", () => {
  it("shrinks wide images so the longer side is 1200px, keeping the aspect ratio", () => {
    expect(fitWithin(2400, 1200)).toEqual({ width: 1200, height: 600 });
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 });
  });
  it("applies the same cap to tall images", () => {
    expect(fitWithin(1500, 3000)).toEqual({ width: 600, height: 1200 });
    expect(fitWithin(900, 1500)).toEqual({ width: 720, height: 1200 });
    const out = fitWithin(1000, 12000);
    expect(out.height).toBe(1200);
    expect(out.width).toBe(100);
  });
  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 10)).toEqual({ width: 1200, height: 10 });
    expect(fitWithin(10, 1200)).toEqual({ width: 10, height: 1200 });
  });
  it("never returns a zero dimension and tolerates bad input", () => {
    expect(fitWithin(10000, 1)).toEqual({ width: 1200, height: 1 });
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
    expect(fitWithin(NaN, 5)).toEqual({ width: 1, height: 1 });
  });
});

describe("dataUrlBytes / isAcceptedImageType", () => {
  it("computes decoded size from the base64 payload", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,QUJD")).toBe(3); // "ABC"
    expect(dataUrlBytes("data:image/jpeg;base64,QUI=")).toBe(2);
    expect(dataUrlBytes("data:image/jpeg;base64,QQ==")).toBe(1);
  });
  it("accepts only png, jpeg and webp", () => {
    expect(["image/png", "image/jpeg", "image/webp"].every(isAcceptedImageType)).toBe(true);
    expect(["image/gif", "image/svg+xml", "text/plain", ""].some(isAcceptedImageType)).toBe(false);
  });
});

describe("prepareImageForChat", () => {
  const original = { createImageBitmap: globalThis.createImageBitmap };
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.createImageBitmap = original.createImageBitmap;
  });

  function stubCanvas(sizes: number[]) {
    const calls = { fill: [] as string[], size: { width: 0, height: 0 }, qualities: [] as number[] };
    const ctx = {
      set fillStyle(v: string) { calls.fill.push(v); },
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    let n = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement, _type?: string, quality?: number) {
      calls.size = { width: this.width, height: this.height };
      calls.qualities.push(quality as number);
      const bytes = sizes[Math.min(n++, sizes.length - 1)];
      return `data:image/jpeg;base64,${"A".repeat(Math.ceil((bytes * 4) / 3))}`;
    });
    return { calls, ctx };
  }
  const stubBitmap = (width: number, height: number) => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width, height, close: vi.fn() })) as unknown as typeof createImageBitmap;
  };

  it("resizes to 1200 wide on a white background and encodes JPEG at 0.8", async () => {
    stubBitmap(2400, 1800);
    const { calls, ctx } = stubCanvas([100_000]);
    const url = await prepareImageForChat(new File(["x"], "a.png", { type: "image/png" }));
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(calls.size).toEqual({ width: 1200, height: 900 });
    expect(calls.fill).toEqual(["#ffffff"]);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1200, 900);
    expect(calls.qualities).toEqual([0.8]);
  });

  it("also limits the height of a portrait photo to 1200", async () => {
    stubBitmap(1800, 2400);
    const { calls } = stubCanvas([100_000]);
    await prepareImageForChat(new File(["x"], "a.png", { type: "image/png" }));
    expect(calls.size).toEqual({ width: 900, height: 1200 });
  });

  it("does not upscale small images", async () => {
    stubBitmap(300, 200);
    const { calls } = stubCanvas([1000]);
    await prepareImageForChat(new File(["x"], "a.jpg", { type: "image/jpeg" }));
    expect(calls.size).toEqual({ width: 300, height: 200 });
  });

  it("re-encodes once at lower quality when over the size cap, then gives up", async () => {
    stubBitmap(1000, 1000);
    let setup = stubCanvas([AI_MAX_IMAGE_BYTES + 50_000, 200_000]);
    await prepareImageForChat(new File(["x"], "a.webp", { type: "image/webp" }));
    expect(setup.calls.qualities).toEqual([0.8, 0.6]);

    vi.restoreAllMocks();
    stubBitmap(1000, 1000);
    setup = stubCanvas([AI_MAX_IMAGE_BYTES + 50_000]);
    await expect(prepareImageForChat(new File(["x"], "a.png", { type: "image/png" }))).rejects.toMatchObject({ kind: "too_large" });
  });

  it("rejects non-images and oversized sources before decoding", async () => {
    stubBitmap(10, 10);
    await expect(prepareImageForChat(new File(["x"], "a.gif", { type: "image/gif" }))).rejects.toMatchObject({ kind: "type" });
    await expect(prepareImageForChat(new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toBeInstanceOf(ImageError);
    const huge = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 16 * 1024 * 1024 });
    await expect(prepareImageForChat(huge)).rejects.toMatchObject({ kind: "source_too_large" });
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("reports undecodable files", async () => {
    globalThis.createImageBitmap = vi.fn(async () => { throw new Error("bad"); }) as unknown as typeof createImageBitmap;
    // jsdom has no image decoding, so the <img> fallback errors too.
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const spy = vi.spyOn(window, "Image").mockImplementation(function (this: HTMLImageElement) {
      const img = document.createElement("img");
      Object.defineProperty(img, "src", { set() { queueMicrotask(() => img.onerror?.(new Event("error"))); } });
      return img;
    } as unknown as typeof Image);
    await expect(prepareImageForChat(new File(["x"], "a.png", { type: "image/png" }))).rejects.toMatchObject({ kind: "decode" });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    spy.mockRestore();
  });
});
