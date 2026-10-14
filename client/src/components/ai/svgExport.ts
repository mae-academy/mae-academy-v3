/** Turning a sanitized diagram into a data URI for display and into SVG / PNG files for download. */

/** An SVG loaded through <img> cannot run scripts or fetch subresources, which is why this is how it is shown. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** PNGs are rendered at twice the drawing's size for sharpness, but never beyond this on the long side. */
export const PNG_SCALE = 2;
export const PNG_MAX_SIDE = 4096;

export function pngSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(PNG_SCALE, PNG_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function diagramFilename(extension: "svg" | "png", now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `mae-diagram-${stamp}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** Draws the SVG onto a white canvas (diagrams are drawn for a white page) and encodes it as PNG. Rejects on any failure. */
export async function rasterizeSvg(svg: string, width: number, height: number): Promise<Blob> {
  const size = pngSize(width, height);
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("svg image failed to load"));
    image.src = svgDataUri(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png encoding failed"))), "image/png");
  });
}
