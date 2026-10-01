import type { Complex, RocKind, TransferFunction } from "./transferFunction";
import type { DerivationStep } from "./derivationTypes";

/** Data results the serverless engines return (plain JSON; no closures). */
export type ComplexCoefficient = { harmonic: number; real: number; imaginary: number; magnitude: number; phase: number };
export type SpectrumPoint = { omega: number; real: number; imaginary: number; magnitude: number; phase: number };
export type FourierSeriesResult = { period: number; omega0: number; coefficients: ComplexCoefficient[]; derivation: string[] };
export type FourierTransformResult = { scale: number; spectrum: SpectrumPoint[]; isStandardRect: boolean; derivation: string[] };
export type Impulse = { omega: number; area: Complex };
export type Interval = { from: number; to: number };
export type ConvolutionConfig = { tauDomain: Interval; resolution: number };
export type ConvolutionPoint = { tau: number; x: number; shiftedH: number; product: number };
export type ContinuousConvolutionResult = { t: number; value: number; overlap: Interval; points: ConvolutionPoint[]; usedDeltaShortcut: boolean; overlapLatex: string };
export type DiscreteContribution = { xIndex: number; hIndex: number; value: number; active: boolean };
export type DiscreteConvolution = { values: number[]; contributions: DiscreteContribution[][] };
export type RegimeKind = "before" | "entering" | "full-x" | "full-h" | "exiting" | "after" | "impulse" | "unbounded";
export type ConvolutionRegime = {
  kind: RegimeKind; index: number; total: number; label: string;
  tRange: Interval; tau1Latex: string; tau2Latex: string; integralLatex: string;
  closedFormLatex: string | null; overlap: Interval;
};
export type AffineTime = { slope: number; offset: number };
export type Coefficient = { constant: number; timeSlope: number };
/** Canonical independent test signals injectable from the SIGNAL ENGINE pills. */
export type SignalKind = "u" | "r" | "rect" | "tri" | "sinc" | "Sa" | "sgn" | "sin" | "cos" | "delta";
export type SystemTerm =
  | { kind: "input-sample"; coefficient: Coefficient; argument: AffineTime; power: number }
  | { kind: "signal"; signal: SignalKind; argument: AffineTime; scale: number }
  | { kind: "constant"; value: number }
  | { kind: "integral" }
  | { kind: "derivative"; order: number };
export type SystemSemantic = { source: string; normalized: string; rawRhs: string; terms: SystemTerm[] };
export type ParsedSystem = { ok: true; system: SystemSemantic } | { ok: false; error: string };
export type Verdict = "Linear" | "Non-Linear" | "Time-Invariant" | "Time-Variant" | "Causal" | "Non-Causal" | "Memoryless" | "Dynamic" | "BIBO Stable" | "Unstable";
export type PillarId = "linearity" | "time" | "causality" | "memory" | "stability";
export type Pillar = { id: PillarId; title: string; verdict: Verdict; passed: boolean; proof: string[]; visualLead: string };
export type ClassificationReport = { pillars: Pillar[] };
export type TestSample = { t: number; left: number; right: number; difference: number };
export type ForwardZAnalysis = { steps: DerivationStep[]; system: TransferFunction | null; rocKind: RocKind | null; error: string | null };
export type ZPfeTerm = { pole: Complex; multiplicity: number; order: number; residue: Complex; causal: boolean };
export type CompositeImpulse = { time: number; weight: number; latex: string };
export type CompositeClassification = "Energy Signal" | "Power Signal" | "Neither";
export type CompositeAnalysis = {
  classification: CompositeClassification;
  energy: number | null;
  power: number | null;
  autoPeriodic: boolean;
  /** null when no sinusoidal component (or components are not commensurate). */
  fundamentalAngularFrequency: number | null;
  fundamentalPeriod: number | null;
  components?: { omega: number; period: number }[];
  hasNonPeriodicTerm: boolean;
  warnings: string[];
};
export type CompositeSegment = Array<{ time: number; value: number }>;

