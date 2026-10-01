export type ChopperTopology = "buck" | "boost" | "buck-boost";

export type QuadrantClass = "A" | "B" | "C" | "D" | "E";

export type ChopperControl = "pwm" | "frequency";

export type ChopperLoad = "R" | "RL" | "RLE";

export interface ChopperParameters {
  topology: ChopperTopology;
  quadrantClass: QuadrantClass;
  control: ChopperControl;
  dutyCycle: number;
  switchingFrequency: number;
  inputVoltage: number;
  loadType: ChopperLoad;
  resistance: number;
  inductanceMilliHenry: number;
  backEmfVoltage: number;
}

export interface ChopperSample { time: number; outputVoltage: number; outputCurrent: number; gatePulse: number; switchOn: boolean; }

export interface ChopperMetrics { outputVoltageDc: number; outputVoltageRms: number; outputCurrentDc: number; rippleCurrent: number; currentMax: number; currentMin: number; criticalInductanceMilliHenry: number; conductionMode: "CCM" | "DCM"; inputPower: number; outputPower: number; efficiency: number; dutyCycle: number; }

export type ChopperWarningCode = "DUTY_CYCLE_HIGH" | "BACK_EMF_REVERSES_CURRENT" | "CCM_DCM_BOUNDARY";

export interface ChopperWarning { code: ChopperWarningCode; message: string; }

export interface ChopperSimulation { period: number; switchingFrequency: number; samples: ChopperSample[]; metrics: ChopperMetrics; warnings: ChopperWarning[]; }

/**
 * Default parameters are chosen so the simulator initialises in CCM for all classes.
 * Critical inductance for Class A/C (buck): Lc = R(1-D)/(2fs) = 12×0.45/8000 ≈ 0.68 mH.
 * L = 35 mH >> Lc → safely in CCM with visible ripple and fast settle.
 */
export const defaultChopperParameters: ChopperParameters = { topology: "buck", quadrantClass: "A", control: "pwm", dutyCycle: 0.55, switchingFrequency: 4000, inputVoltage: 120, loadType: "RL", resistance: 12, inductanceMilliHenry: 35, backEmfVoltage: 24 };
