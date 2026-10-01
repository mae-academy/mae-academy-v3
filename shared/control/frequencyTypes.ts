import type { Complex } from "./polynomial";

export type FrequencyFactorKind = "gain" | "zero" | "pole";

export type FrequencyFactor = {
  id: string;
  kind: FrequencyFactorKind;
  label: string;
  roots: Complex[];
  constant?: number;
};

export type FrequencyPoint = {
  omega: number;
  re: number;
  im: number;
  magnitudeDb: number;
  phaseDeg: number;
  phaseUnwrappedDeg: number;
  asymMagnitudeDb: number;
  asymPhaseDeg: number;
};

export type StabilityMargins = {
  gainCrossover?: { omega: number; phaseDeg: number; phaseMarginDeg: number };
  phaseCrossover?: { omega: number; magnitudeDb: number; gainMarginDb: number };
};

export type FactorSlopeEvent = {
  omega: number;
  deltaDbPerDecade: number;
  label: string;
};

export function formatEngineering(value: number, precision = 3) {
  if (!Number.isFinite(value)) return "\\infty";
  if (Math.abs(value) < 1e-10) return "0";
  const rounded = Number(value.toPrecision(precision));
  return `${rounded}`;
}
