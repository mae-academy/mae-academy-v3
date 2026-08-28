/** Signals & Systems / Convolution Engine — pure parser and numerical/symbolic convolution utilities. */
export type ContinuousSignalKind = 'step' | 'rect' | 'delta' | 'sinc' | 'sine' | 'constant' | 'scaled';

export interface ContinuousSignal {
  kind: ContinuousSignalKind;
  source: string;
  evaluate: (time: number) => number;
  support: { from: number; to: number };
  shift?: number;
  amplitude?: number;
  child?: ContinuousSignal;
}

export interface SamplePoint { x: number; y: number; }
export interface ContinuousConvolutionFrame {
  t: number;
  value: number;
  overlap: { from: number; to: number };
  product: SamplePoint[];
  deltaShortcut: boolean;
}

const EPSILON = 1e-9;
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const signal = (kind: ContinuousSignalKind, source: string, evaluate: (time: number) => number, support: { from: number; to: number }, extras: Partial<ContinuousSignal> = {}): ContinuousSignal => ({ kind, source, evaluate, support, ...extras });

const parseShift = (argument: string) => {
  const normalized = argument.replace(/\s+/g, '');
  if (normalized === 't') return 0;
  const match = normalized.match(/^t([+-])(\d+(?:\.\d+)?)$/);
  if (!match) throw new Error(`Unsupported time argument “${argument}”. Use t, t-a, or t+a.`);
  return (match[1] === '-' ? 1 : -1) * Number(match[2]);
};

const functionMatch = (source: string, name: string) => source.match(new RegExp(`^${name}\\((.+)\\)$`, 'i'));

/** Parses a deliberately safe, educational subset: step(t), rect(t), delta(t), sinc(t), sin(t), constants and scalar products. */
export const parseContinuousSignal = (input: string): ContinuousSignal => {
  const source = input.trim();
  if (!source) throw new Error('Enter a signal definition.');
  const scalar = source.match(/^([+-]?\d+(?:\.\d+)?)\s*\*\s*(.+)$/);
  if (scalar) {
    const amplitude = Number(scalar[1]);
    const child = parseContinuousSignal(scalar[2]);
    return signal('scaled', source, time => amplitude * child.evaluate(time), child.support, { amplitude, child });
  }
  if (/^[+-]?\d+(?:\.\d+)?$/.test(source)) {
    const amplitude = Number(source);
    return signal('constant', source, () => amplitude, { from: -Infinity, to: Infinity }, { amplitude });
  }
  const step = functionMatch(source, '(?:u|step)');
  if (step) {
    const shift = parseShift(step[1]);
    return signal('step', source, time => time >= shift ? 1 : 0, { from: shift, to: Infinity }, { shift });
  }
  const rect = functionMatch(source, 'rect');
  if (rect) {
    const argument = rect[1].replace(/\s+/g, '');
    const scaledTime = argument.match(/^\(?(.+?)\)?\/(\d+(?:\.\d+)?)$/);
    const width = scaledTime ? Number(scaledTime[2]) : 1;
    const shift = parseShift(scaledTime ? scaledTime[1] : argument);
    return signal('rect', source, time => Math.abs(time - shift) <= width / 2 + EPSILON ? 1 : 0, { from: shift - width / 2, to: shift + width / 2 }, { shift });
  }
  const delta = functionMatch(source, '(?:delta|δ)');
  if (delta) {
    const shift = parseShift(delta[1]);
    return signal('delta', source, time => Math.abs(time - shift) < EPSILON ? 1 : 0, { from: shift, to: shift }, { shift });
  }
  const sinc = functionMatch(source, 'sinc');
  if (sinc) {
    const shift = parseShift(sinc[1]);
    return signal('sinc', source, time => {
      const u = time - shift;
      return Math.abs(u) < EPSILON ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
    }, { from: -Infinity, to: Infinity }, { shift });
  }
  const sine = functionMatch(source, 'sin');
  if (sine) {
    const shift = parseShift(sine[1]);
    return signal('sine', source, time => Math.sin(time - shift), { from: -Infinity, to: Infinity }, { shift });
  }
  throw new Error('Unsupported signal. Use step(t), rect(t), delta(t), sinc(t), sin(t), a number, or a scalar such as 2*rect(t).');
};

export const overlapBounds = (x: ContinuousSignal, h: ContinuousSignal, t: number, visibleWindow = 8) => {
  const xFrom = finite(x.support.from, -visibleWindow);
  const xTo = finite(x.support.to, visibleWindow);
  const hFrom = finite(t - h.support.to, -visibleWindow);
  const hTo = finite(t - h.support.from, visibleWindow);
  const from = Math.max(xFrom, hFrom, -visibleWindow);
  const to = Math.min(xTo, hTo, visibleWindow);
  return { from, to };
};

export const sampleSignal = (input: ContinuousSignal, from: number, to: number, steps = 480, transform: (time: number) => number = time => time): SamplePoint[] => Array.from({ length: steps + 1 }, (_, index) => {
  const x = from + (to - from) * index / steps;
  return { x, y: input.evaluate(transform(x)) };
});

export const trapezoidalIntegral = (integrand: (time: number) => number, from: number, to: number, deltaTau = .01) => {
  if (to <= from) return 0;
  const slices = Math.max(1, Math.ceil((to - from) / deltaTau));
  const width = (to - from) / slices;
  let sum = .5 * (integrand(from) + integrand(to));
  for (let index = 1; index < slices; index += 1) sum += integrand(from + index * width);
  return sum * width;
};

export const continuousConvolutionFrame = (x: ContinuousSignal, h: ContinuousSignal, t: number, options: { deltaTau?: number; visibleWindow?: number; productSteps?: number } = {}): ContinuousConvolutionFrame => {
  const visibleWindow = options.visibleWindow ?? 8;
  const bounds = overlapBounds(x, h, t, visibleWindow);
  const deltaOperand = h.kind === 'delta' ? h : h.kind === 'scaled' && h.child?.kind === 'delta' ? h.child : null;
  const deltaScale = h.kind === 'scaled' ? h.amplitude ?? 1 : 1;
  const value = deltaOperand ? deltaScale * x.evaluate(t - (deltaOperand.shift ?? 0)) : trapezoidalIntegral(tau => x.evaluate(tau) * h.evaluate(t - tau), bounds.from, bounds.to, options.deltaTau ?? .01);
  const product = bounds.to <= bounds.from ? [] : sampleSignal(signal('constant', 'product', tau => x.evaluate(tau) * h.evaluate(t - tau), bounds), bounds.from, bounds.to, options.productSteps ?? 320);
  return { t, value, overlap: bounds, product, deltaShortcut: Boolean(deltaOperand) };
};

export const continuousConvolutionSeries = (x: ContinuousSignal, h: ContinuousSignal, from = -8, to = 8, steps = 240, options: { deltaTau?: number; visibleWindow?: number } = {}): SamplePoint[] => Array.from({ length: steps + 1 }, (_, index) => {
  const t = from + (to - from) * index / steps;
  return { x: t, y: continuousConvolutionFrame(x, h, t, options).value };
});

export const parseDiscreteSequence = (input: string): number[] => {
  const values = input.split(',').map(value => value.trim()).filter(Boolean);
  if (!values.length || values.some(value => !/^[+-]?\d+(?:\.\d+)?$/.test(value))) throw new Error('Enter a comma-separated numeric sequence, such as 1, 2, 1.');
  return values.map(Number);
};

export const discreteConvolution = (x: readonly number[], h: readonly number[]) => Array.from({ length: x.length + h.length - 1 }, (_, outputIndex) => x.reduce((sum, value, xIndex) => sum + value * (h[outputIndex - xIndex] ?? 0), 0));

export const discreteProductsAt = (x: readonly number[], h: readonly number[], outputIndex: number) => x.flatMap((value, xIndex) => outputIndex - xIndex >= 0 && outputIndex - xIndex < h.length ? [{ xIndex, hIndex: outputIndex - xIndex, value: value * h[outputIndex - xIndex] }] : []);
