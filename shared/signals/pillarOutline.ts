import type { PillarId } from "./results";

export const PILLAR_OUTLINE: ReadonlyArray<{ id: PillarId; title: string; visualLead: string }> = [
  { id: "linearity", title: "Linearity — Additivity & Homogeneity", visualLead: "Compare T{a x₁+b x₂} with aT{x₁}+bT{x₂}." },
  { id: "time", title: "Time Invariance — Shift Test", visualLead: "Compare T{x(t−t₀)} with y(t−t₀)." },
  { id: "causality", title: "Causality — Present vs Future Input", visualLead: "Locate the input sample required at the selected output instant." },
  { id: "memory", title: "Memory — Instantaneous vs Dynamic", visualLead: "Inspect whether the output needs an input value away from t." },
  { id: "stability", title: "BIBO Stability — Bounded Input, Bounded Output", visualLead: "Apply a bounded unit-step input and inspect the output envelope." },
];
