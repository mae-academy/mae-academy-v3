import type { MNAElement, MNAResult } from './mnaTypes';

export const MESH_COLORS = ['#3b82f6', '#8b5cf6', '#ef4444', '#10b981', '#f59e0b', '#06b6d4'] as const;
export const NODAL_COLORS = ['#2563eb', '#16a34a', '#db2777', '#d97706', '#7c3aed', '#0891b2'] as const;

export interface NodalNodeLabel {
  /** Exact MNA node identity; never displayed directly. */
  node: string;
  index: number;
  label: string;
  color: string;
  centroid: [number, number];
}

export interface MeshCycle {
  index: number;
  color: string;
  /** Clockwise visual perimeter points in workspace coordinates. */
  points: Array<[number, number]>;
  /** Center of the clockwise face perimeter bounding box, used by the SVG current marker. */
  centroid: [number, number];
  /** 30% of the smaller perimeter-box dimension; keeps the marker inside its own mesh. */
  radius: number;
  /** Human-readable electrical node sequence is intentionally never exposed as internal UI IDs. */
  nodes: string[];
  branchIds: string[];
}

export type AnalysisMethod = 'nodal' | 'mesh' | 'superposition' | 'transform' | 'thevenin';

export interface DerivationStep {
  title: string;
  math: string;
  prose?: string;
}

export interface AnalysisTrace {
  method: AnalysisMethod;
  status: 'ready' | 'unsupported' | 'error';
  heading: string;
  steps: DerivationStep[];
  result?: MNAResult;
  meshCurrents?: Record<string, number>;
  meshCycles?: MeshCycle[];
  nodalNodes?: NodalNodeLabel[];
  warning?: string;
}

export const nonReferenceNodes = (elements: MNAElement[]) => Array.from(new Set(elements.flatMap((element) => {
  if (element.type === 'current') return [element.from, element.to];
  if (element.type === 'vccs' || element.type === 'vcvs') return [element.positive, element.negative, element.controlPositive, element.controlNegative];
  return [element.positive, element.negative];
}).filter((node) => node !== '0'))).sort();

export const n = (node: string) => node === '0' ? '0' : node.replace(/^n:/, '').replace(/[^A-Za-z0-9]/g, '').slice(-5) || 'x';
export const id = (value: string) => value.replace(/[^A-Za-z0-9]/g, '').replace(/([A-Za-z]+)(\d+)/, '$1_{$2}') || '\\mathrm{branch}';
export const fixed = (value: number, digits = 6) => Number(value.toFixed(digits)).toString();
