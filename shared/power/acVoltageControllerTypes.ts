export type AcPhase = "single" | "three";

export type AcTopology = "unidirectional" | "bidirectional";

export type ThreePhaseConnection = "star-3w" | "star-4w" | "delta";

export type AcControlMode = "phase-angle" | "integral-cycle";

export type AcLoad = "R" | "RL";

export type AcVoltageFormat = "rms" | "peak";

export interface AcVoltageControllerParameters {
  phase: AcPhase;
  topology: AcTopology;
  threePhaseConnection: ThreePhaseConnection;
  controlMode: AcControlMode;
  firingAngle: number;
  onCycles: number;
  offCycles: number;
  voltageFormat: AcVoltageFormat;
  inputVoltage: number;
  frequency: number;
  loadType: AcLoad;
  resistance: number;
  inductanceMilliHenry: number;
}

export interface AcControllerSample {
  time: number;
  sourceVoltage: number;
  outputVoltage: number;
  phaseAOutput: number;
  phaseBOutput: number;
  phaseCOutput: number;
  outputCurrent: number;
  thyristorVoltage: number;
  gatePulse: number;
  conducting: boolean;
}

export interface AcControllerMetrics {
  outputVoltageRms: number;
  outputVoltageAvg: number;
  outputCurrentRms: number;
  activePower: number;
  apparentPower: number;
  powerFactor: number;
  firingAngle: number;
  extinctionAngle: number;
  conductionAngle: number;
  voltageThd: number;
  currentThd: number;
  sourceVoltageRms: number;
  controlValue: number;
}

export type AcControllerWarningCode = "POOR_POWER_FACTOR" | "CONDUCTION_FAILURE";

export interface AcControllerWarning { code: AcControllerWarningCode; message: string; }

export interface AcControllerSimulation {
  period: number;
  angularFrequency: number;
  samples: AcControllerSample[];
  metrics: AcControllerMetrics;
  warnings: AcControllerWarning[];
}

export const defaultAcVoltageControllerParameters: AcVoltageControllerParameters = {
  phase: "single",
  topology: "bidirectional",
  threePhaseConnection: "star-4w",
  controlMode: "phase-angle",
  firingAngle: 75,
  onCycles: 3,
  offCycles: 2,
  voltageFormat: "rms",
  inputVoltage: 120,
  frequency: 60,
  loadType: "RL",
  resistance: 18,
  inductanceMilliHenry: 28,
};
