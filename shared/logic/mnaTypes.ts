type MNAIdentity = { id: string; label?: string };
export type MNAElement =
  | (MNAIdentity & { type: 'resistor'; positive: string; negative: string; resistance: number })
  | (MNAIdentity & { type: 'current'; from: string; to: string; current: number })
  | (MNAIdentity & { type: 'voltage'; positive: string; negative: string; voltage: number })
  | (MNAIdentity & { type: 'vccs'; positive: string; negative: string; controlPositive: string; controlNegative: string; transconductance: number })
  | (MNAIdentity & { type: 'vcvs'; positive: string; negative: string; controlPositive: string; controlNegative: string; gain: number })
  | (MNAIdentity & { type: 'cccs'; positive: string; negative: string; controlSourceId: string; gain: number })
  | (MNAIdentity & { type: 'ccvs'; positive: string; negative: string; controlSourceId: string; transresistance: number })
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

