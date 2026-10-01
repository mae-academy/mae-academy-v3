export type StepResponseData = {
  t: number[];
  y: number[];
  sp: number[];
  error: number[];
  overshootPercent: number;
  settlingTime: number;
  peakTime: number;
  riseTime: number;
  delayTime: number;
  steadyStateError: number;
  termination: "complete" | "unstable-growth" | "non-finite";
};
