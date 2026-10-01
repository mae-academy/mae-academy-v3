export type RectifierPhase = "single" | "three";

export type RectifierType = "half" | "full";

export type FullWaveSubtype = "bridge" | "center-tapped";

export type RectifierLoad = "R" | "RL" | "RC" | "RLC" | "RLE";

export type VoltageFormat = "rms" | "peak";

export type PulseCount = 6 | 12;

export type RectifierParameters = {
  phase: RectifierPhase;
  rectifierType: RectifierType;
  fullWaveSubtype: FullWaveSubtype;
  loadType: RectifierLoad;
  freeWheelingDiode: boolean;
  voltageFormat: VoltageFormat;
  inputVoltage: number;
  frequency: number;
  firingAngle: number;
  resistance: number;
  inductanceMilliHenry: number;
  capacitanceMicroFarad: number;
  backEmfVoltage: number;
  /** Only meaningful for phase === "three" && rectifierType === "full". */
  pulseCount: PulseCount;
};

export type RectifierSample = {
  time: number;
  va: number;
  vb: number;
  vc: number;
  source: number;
  outputVoltage: number;
  outputCurrent: number;
  capacitorVoltage: number;
  conducting: number;
};

export type RectifierMetrics = {
  voltageRms: number;
  voltageDc: number;
  currentRms: number;
  currentDc: number;
  dcPower: number;
  acPower: number;
  outputFrequency: number;
  rippleVoltage: number;
  formFactor: number;
  rippleFactor: number;
  efficiency: number;
  powerFactor: number;
  conductionMode: "CCM" | "DCM" | "RESISTIVE";
  extinctionAngleDeg: number | null;
};

export type RectifierWarningCode = "FWD_INERT_FOR_LOAD" | "EFFICIENCY_LOW" | "RIPPLE_EXCESSIVE";

export type RectifierWarning = { code: RectifierWarningCode; message: string };

export type RectifierSimulation = {
  samples: RectifierSample[];
  metrics: RectifierMetrics;
  peakVoltage: number;
  angularFrequency: number;
  period: number;
  warnings: RectifierWarning[];
};

export const defaultRectifierParameters: RectifierParameters = {
  phase: "single",
  rectifierType: "full",
  fullWaveSubtype: "bridge",
  loadType: "RL",
  freeWheelingDiode: true,
  voltageFormat: "rms",
  inputVoltage: 120,
  frequency: 60,
  firingAngle: 42,
  resistance: 20,
  inductanceMilliHenry: 85,
  capacitanceMicroFarad: 470,
  backEmfVoltage: 24,
  pulseCount: 6,
};
