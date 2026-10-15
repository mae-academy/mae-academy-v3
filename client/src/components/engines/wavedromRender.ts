/**
 * WaveDrom rendering with the official `wavedrom` npm package (pure JS, no DOM needed for renderAny): validated spec ->
 * renderAny -> onml tree -> onml.stringify (escapes text and attribute values) -> inspected string -> <img> data URI.
 * The package is a lazy chunk.
 */
import { sizeSvg, svgIsSafe, type SvgSize } from "./svgInspect";
import { validateWaveDrom, type WaveReason, type WaveSpec } from "./wavedromValidate";

export type WaveRenderResult = SvgSize;

export type WaveFailure = { kind: "invalid"; reason: WaveReason; detail?: string } | { kind: "load" } | { kind: "internal" };

export class WaveRenderError extends Error {
  constructor(readonly failure: WaveFailure) {
    super(failure.kind);
  }
}

interface WaveLib {
  renderAny(index: number, source: unknown, skin: unknown): unknown;
  stringify(tree: unknown): string;
  skin: unknown;
}

type Loader = () => Promise<WaveLib>;

const defaultLoader: Loader = async () => {
  const [lib, skin] = await Promise.all([import("wavedrom"), import("wavedrom/skins/default.js")]);
  const wd = ((lib as { default?: unknown }).default ?? lib) as { renderAny: WaveLib["renderAny"]; onml: { stringify: (tree: unknown) => string } };
  const skinModule = ((skin as { default?: unknown }).default ?? skin) as unknown;
  return { renderAny: wd.renderAny, stringify: wd.onml.stringify, skin: skinModule };
};

let loader: Loader = defaultLoader;
let lib: Promise<WaveLib> | null = null;
const cache = new Map<string, WaveRenderResult>();
const CACHE_LIMIT = 64;

export function setWaveLoaderForTests(next: Loader | null): void {
  loader = next ?? defaultLoader;
  lib = null;
  cache.clear();
}

export function cachedWave(code: string): WaveRenderResult | undefined {
  return cache.get(code.trim());
}

function load(): Promise<WaveLib> {
  if (!lib) {
    lib = loader().catch(() => {
      lib = null;
      throw new WaveRenderError({ kind: "load" });
    });
  }
  return lib;
}

/** Adds a white background so the SVG, the PNG and the dark-mode card all show black lines on white. */
export function withWhiteBackground(svg: string): string {
  const end = svg.indexOf(">", svg.indexOf("<svg"));
  return `${svg.slice(0, end + 1)}<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>${svg.slice(end + 1)}`;
}

function viewBoxOf(svg: string): string | null {
  return svg.includes("viewBox=") ? svg : null;
}

export async function renderWaveDrom(code: string): Promise<WaveRenderResult> {
  const key = code.trim();
  const hit = cache.get(key);
  if (hit) return hit;
  const check = validateWaveDrom(code);
  if (!check.ok) throw new WaveRenderError({ kind: "invalid", reason: check.reason, detail: check.detail });
  const wave = await load();
  let svg: string;
  try {
    // WaveDrom may mutate its input: hand it a throw-away deep copy of the validated structure.
    const spec: WaveSpec = JSON.parse(JSON.stringify(check.spec));
    svg = wave.stringify(wave.renderAny(0, spec, wave.skin));
  } catch {
    throw new WaveRenderError({ kind: "internal" });
  }
  if (!svgIsSafe(svg) || !viewBoxOf(svg)) throw new WaveRenderError({ kind: "internal" });
  const sized = sizeSvg(svg);
  if (!sized) throw new WaveRenderError({ kind: "internal" });
  const result = { ...sized, svg: withWhiteBackground(sized.svg) };
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}
