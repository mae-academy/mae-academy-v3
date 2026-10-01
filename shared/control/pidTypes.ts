export type ControllerPrimary = "P" | "I" | "D" | "PI" | "PD" | "PID";

export type ControllerSubtype = "parallel" | "series" | "parallel-standard" | "parallel-modified" | "series-standard" | "series-modified";

export type PidGains = { kp: number; ki: number; kd: number; n: number };

export type SignalType = "impulse" | "step" | "ramp" | "parabolic" | "exponential" | "sine" | "cosine";

export type TransferPolynomial = { numerator: number[]; denominator: number[]; latex: string };

export type PidScopeData = {
  t: number[];
  y: number[];
  r: number[];
  overshoot: number;
  peakTime: number;
  settlingTime: number;
  steadyStateError: number;
  openLoop: TransferPolynomial;
  closedLoop: TransferPolynomial;
  output: TransferPolynomial;
};

export function getControllerSubtypes(primary: ControllerPrimary): ControllerSubtype[] {
  if (primary === "PI") return ["parallel", "series"];
  if (primary === "PD" || primary === "PID") return ["parallel-standard", "parallel-modified", "series-standard", "series-modified"];
  return [];
}

export function defaultControllerSubtype(primary: ControllerPrimary): ControllerSubtype {
  if (primary === "PI") return "parallel";
  if (primary === "PD" || primary === "PID") return "parallel-standard";
  return "parallel-standard";
}
