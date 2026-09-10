/** Parser for the binary SPICE rawfile that ngspice writes in batch mode (`-b -r <file>`). */

export interface SpiceRawPlot {
  name: string;
  flags: "real" | "complex";
  variableCount: number;
  pointCount: number;
  vectors: Record<string, number[]>;
}

const BINARY_MARKER = "Binary:\n";
const ASCII_MARKER = "Values:\n";

function indexOfSequence(
  bytes: Uint8Array,
  needle: string,
  from: number
): number {
  const target = new Uint8Array(needle.length);
  for (let i = 0; i < needle.length; i += 1) target[i] = needle.charCodeAt(i);

  outer: for (let i = from; i <= bytes.length - target.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function readHeaderField(lines: string[], label: string): string | undefined {
  const prefix = `${label}:`;
  const line = lines.find(entry => entry.startsWith(prefix));
  return line?.slice(prefix.length).trim();
}

function readCount(lines: string[], label: string): number {
  const raw = readHeaderField(lines, label);
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `SPICE rawfile header is missing or has an invalid "${label}" field.`
    );
  }
  return value;
}

/** Returns 0 for a missing or unparseable value rather than throwing. */
function readOptionalCount(lines: string[], label: string): number {
  const value = Number.parseInt(readHeaderField(lines, label) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * ngspice writes `No. Points:` as a padded placeholder and seeks back to rewrite it once the run
 * finishes; if that rewrite fails the header count is left blank or stale. Trust it only when it
 * fits the bytes actually present.
 */
function resolvePointCount(declared: number, available: number): number {
  return declared > 0 && declared <= available ? declared : available;
}

function readVariableNames(lines: string[], variableCount: number): string[] {
  const headerIndex = lines.findIndex(entry => entry.startsWith("Variables:"));
  if (headerIndex === -1) {
    throw new Error('SPICE rawfile header is missing its "Variables:" block.');
  }

  const entries: string[] = [];
  const inlineFirst = lines[headerIndex].slice("Variables:".length).trim();
  if (inlineFirst.length > 0) entries.push(inlineFirst);
  for (
    let i = headerIndex + 1;
    i < lines.length && entries.length < variableCount;
    i += 1
  ) {
    if (lines[i].trim().length > 0) entries.push(lines[i].trim());
  }

  if (entries.length < variableCount) {
    throw new Error(
      `SPICE rawfile declares ${variableCount} variables but only ${entries.length} were listed.`
    );
  }

  return entries.map((entry, index) => {
    // Each entry is "<index>\t<name>\t<type>"; the name is the second whitespace-delimited token.
    const name = entry.split(/\s+/)[1];
    return name && name.length > 0 ? name : `var${index}`;
  });
}

/** Parses every plot in a rawfile buffer, in file order. */
export function parseSpiceRawPlots(bytes: Uint8Array): SpiceRawPlot[] {
  const decoder = new TextDecoder("utf-8");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const plots: SpiceRawPlot[] = [];
  let cursor = 0;

  while (cursor < bytes.length) {
    // Trailing newlines/whitespace after the last plot are not another plot.
    while (cursor < bytes.length && bytes[cursor] <= 0x20) cursor += 1;
    if (cursor >= bytes.length) break;

    const markerIndex = indexOfSequence(bytes, BINARY_MARKER, cursor);
    if (markerIndex === -1) {
      // Leftover bytes after a plot are a truncated payload, not a malformed file.
      if (plots.length > 0) break;

      const asciiIndex = indexOfSequence(bytes, ASCII_MARKER, cursor);
      if (asciiIndex !== -1) {
        throw new Error(
          'SPICE rawfile is in ASCII ("Values:") format; expected binary.'
        );
      }
      throw new Error('SPICE rawfile is missing its "Binary:" marker.');
    }

    const lines = decoder
      .decode(bytes.subarray(cursor, markerIndex))
      .split("\n")
      .map(line => line.replace(/\r$/, ""));

    const name = readHeaderField(lines, "Plotname") ?? `plot${plots.length}`;
    const flags: "real" | "complex" = (
      readHeaderField(lines, "Flags") ?? "real"
    ).includes("complex")
      ? "complex"
      : "real";
    const variableCount = readCount(lines, "No. Variables");
    const variableNames = readVariableNames(lines, variableCount);

    const valuesPerPoint = flags === "complex" ? 2 : 1;
    const bytesPerPoint = variableCount * valuesPerPoint * 8;
    const dataStart = markerIndex + BINARY_MARKER.length;
    // A concatenated plot inflates `available`, so a correct declared count still wins there.
    const available = Math.floor((bytes.length - dataStart) / bytesPerPoint);
    const pointCount = resolvePointCount(
      readOptionalCount(lines, "No. Points"),
      available
    );
    const dataEnd = dataStart + pointCount * bytesPerPoint;

    const vectors: Record<string, number[]> = {};
    if (flags === "complex") {
      for (const variable of variableNames) {
        // The bare name carries magnitude: that is what a Bode-style consumer asks for, and
        // :real/:imag keep the data lossless.
        vectors[variable] = new Array<number>(pointCount);
        vectors[`${variable}:real`] = new Array<number>(pointCount);
        vectors[`${variable}:imag`] = new Array<number>(pointCount);
        vectors[`${variable}:mag`] = new Array<number>(pointCount);
        vectors[`${variable}:phase`] = new Array<number>(pointCount);
      }
    } else {
      for (const variable of variableNames)
        vectors[variable] = new Array<number>(pointCount);
    }

    for (let point = 0; point < pointCount; point += 1) {
      for (let variable = 0; variable < variableCount; variable += 1) {
        const offset =
          dataStart + point * bytesPerPoint + variable * valuesPerPoint * 8;
        const name_ = variableNames[variable];
        if (flags === "complex") {
          const re = view.getFloat64(offset, true);
          const im = view.getFloat64(offset + 8, true);
          const magnitude = Math.hypot(re, im);
          vectors[name_][point] = magnitude;
          vectors[`${name_}:real`][point] = re;
          vectors[`${name_}:imag`][point] = im;
          vectors[`${name_}:mag`][point] = magnitude;
          // Degrees, matching ngspice's own vp() convention.
          vectors[`${name_}:phase`][point] =
            (Math.atan2(im, re) * 180) / Math.PI;
        } else {
          vectors[name_][point] = view.getFloat64(offset, true);
        }
      }
    }

    plots.push({ name, flags, variableCount, pointCount, vectors });
    cursor = dataEnd;
  }

  if (plots.length === 0) {
    throw new Error("SPICE rawfile is empty.");
  }

  return plots;
}

/**
 * Flattens a rawfile into a single vector map. Keys from the first plot are unprefixed; a name
 * that collides with an earlier plot is suffixed with `#<plotIndex>`.
 */
export function parseSpiceRawFile(bytes: Uint8Array): Record<string, number[]> {
  const vectors: Record<string, number[]> = {};

  parseSpiceRawPlots(bytes).forEach((plot, plotIndex) => {
    for (const [key, values] of Object.entries(plot.vectors)) {
      vectors[key in vectors ? `${key}#${plotIndex}` : key] = values;
    }
  });

  return vectors;
}
