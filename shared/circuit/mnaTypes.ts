/** Netlist element and result types of the DC MNA solver (the solver itself runs server-side). */
export interface MNAIdentity {
  id: string;
  name?: string;
  label?: string;
  /** Mirrors `CircuitComponent.state.isBurned`; forces a 1 GΩ open-circuit stamp regardless of type. */
  isBurned?: boolean;
}
export type MNAElement =
  | (MNAIdentity & { type: 'resistor'; positive: string; negative: string; resistance: number })
  | (MNAIdentity & { type: 'current'; from: string; to: string; current: number })
  | (MNAIdentity & { type: 'voltage'; positive: string; negative: string; voltage: number })
  | (MNAIdentity & { type: 'vccs'; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance?: number; gain?: number; targetId?: string; controlSourceId?: string })
  | (MNAIdentity & { type: 'vcvs'; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number; targetId?: string; controlSourceId?: string })
  | (MNAIdentity & { type: 'cccs'; positive: string; negative: string; controlSourceId?: string; targetId?: string; gain: number; controlPositive?: string; controlNegative?: string; targetResistance?: number })
  | (MNAIdentity & { type: 'ccvs'; positive: string; negative: string; controlSourceId?: string; targetId?: string; transresistance?: number; gain?: number; controlPositive?: string; controlNegative?: string; targetResistance?: number })
  | (MNAIdentity & { type: 'current-sense'; positive: string; negative: string });

export interface MNAResult {
  nodeVoltages: Record<string, number>;
  voltageSourceCurrents: Record<string, number>;
  branchCurrents: Record<string, number>;
  matrix?: number[][];
  rhs?: number[];
  nodeOrder?: string[];
  voltageBranchOrder?: string[];
  residualInfinity?: number;
}
