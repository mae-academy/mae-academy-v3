export type InverterPhase = "single" | "three";

export type SinglePhaseSubtype = "half-bridge" | "full-bridge";

export type ThreePhaseConduction = "180" | "120";

export type SwitchingTechnique = "square" | "single-pulse" | "multi-pulse" | "spwm";

export type InverterLoad = "R" | "RL" | "RLE";

export interface InverterParameters {
  phase: InverterPhase;
  singlePhaseSubtype: SinglePhaseSubtype;
  threePhaseConduction: ThreePhaseConduction;
  technique: SwitchingTechnique;
  fundamentalFrequency: number;
  carrierFrequency: number;
  modulationIndex: number;
  dcVoltage: number;
  loadType: InverterLoad;
  resistance: number;
  inductanceMilliHenry: number;
  backEmfVoltage: number;
  /** Testable protection command representing simultaneous upper/lower switch conduction in one leg. */
  shootThroughFault?: boolean;
}

export interface InverterSample {
  time: number;
  va: number;
  vb: number;
  vc: number;
  outputVoltage: number;
  outputCurrent: number;
  carrier: number;
  reference: number;
}

export interface InverterMetrics {
  voltageRms: number;
  voltageFundamentalRms: number;
  currentRms: number;
  currentFundamentalRms: number;
  voltageThd: number;
  currentThd: number;
  distortionFactor: number;
  harmonicFactor: number;
  activePower: number;
  apparentPower: number;
  powerFactor: number;
  outputFrequency: number;
  inputPower: number;
  outputPower: number;
  efficiency: number;
}

export interface InverterWarning {
  code: "SHOOT_THROUGH" | "OVERMODULATION" | "NYQUIST_VIOLATION" | "BACK_EMF_EXCEEDED";
  message: string;
}

export interface InverterFault {
  code: "SHOOT_THROUGH";
  message: string;
  /** Current cannot be estimated without a parasitic DC-link/leg model, so the solver inhibits the waveform. */
  shortCircuitCurrent: null;
}

export interface InverterSimulation {
  period: number;
  angularFrequency: number;
  samples: InverterSample[];
  metrics: InverterMetrics;
  warnings: InverterWarning[];
  fault: InverterFault | null;
}

export const defaultInverterParameters: InverterParameters = {
  phase: "single",
  singlePhaseSubtype: "full-bridge",
  threePhaseConduction: "180",
  technique: "square",
  fundamentalFrequency: 60,
  carrierFrequency: 1800,
  modulationIndex: 0.9,
  dcVoltage: 200,
  loadType: "RL",
  resistance: 20,
  inductanceMilliHenry: 35,
  backEmfVoltage: 24,
};
