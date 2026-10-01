import type { MNAElement } from '../../api/_lib/circuit/engine/mnaSolver';
import { id as formatId, type NodalNodeLabel } from './analysisTypes';
import { AcademicNodalDictionary, formatAcademicUserLabel } from './AcademicNodalDictionary';

export function formatAcademicNumber(value: number, decimals = 4) {
  if (!Number.isFinite(value)) return '\\mathrm{NaN}';
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function compactMathNumbers(math: string, decimals: number) {
  // Do not reinterpret digits embedded in TeX control names, identifiers,
  // subscripts, or hexadecimal \textcolor values as numerical quantities.
  return math.replace(/(?<![A-Za-z_\\#])(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![A-Za-z_])/gi, (token) => {
    const value = Number(token);
    return Number.isFinite(value) ? formatAcademicNumber(value, decimals) : token;
  });
}

export function latexMatrix(rows: number[][], decimals = 4) {
  if (!rows.length) return '\\begin{bmatrix}\\end{bmatrix}';
  return `\\begin{bmatrix}${rows.map((row) => row.map((value) => formatAcademicNumber(value, decimals)).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
}

/**
 * Builds an ID-to-human-readable label dictionary for circuit elements and electrical nodes.
 * Maps random internal UUIDs (e.g. 'PT_0LBZklQz', 'n_C9KUa') to textbook academic labels (e.g. 'R_3', 'Node_1').
 */
export function buildIdToLabelMap(
  elements: MNAElement[],
  nodalNodes: NodalNodeLabel[] = [],
  customComponents?: Array<{ id: string; label?: string }>
): Map<string, string> {
  const idToLabelMap = new Map<string, string>();
  const dict = new AcademicNodalDictionary(elements);

  // 1. Components / Branches
  elements.forEach((c) => {
    const overrideLabel = customComponents?.find(comp => comp.id === c.id)?.label || c.label;
    const academic = overrideLabel ? formatAcademicUserLabel(overrideLabel, dict.element(c)) : dict.element(c);
    // Set standard ID
    idToLabelMap.set(c.id, academic);
    // Set LaTeX-escaped variant (e.g. PT\_0LBZklQz)
    idToLabelMap.set(c.id.replace(/_/g, '\\_'), academic);
    // Set id() helper formatted variant (e.g. PT_{0}LBZklQz)
    const formatted = formatId(c.id);
    idToLabelMap.set(formatted, academic);
    // Set alphanumeric stripped variant
    const alphaNum = c.id.replace(/[^A-Za-z0-9]/g, '');
    idToLabelMap.set(alphaNum, academic);
  });

  // 2. Reference & Ground Nodes
  idToLabelMap.set('0', '0');
  idToLabelMap.set('GND', '0');
  idToLabelMap.set('gnd', '0');
  idToLabelMap.set('n_{0}', '0');
  idToLabelMap.set('n_0', '0');

  // 3. Geometric Nodal Labels
  nodalNodes.forEach((n) => {
    const nodeLabel = `Node_{${n.label || n.index}}`;
    idToLabelMap.set(n.node, nodeLabel);
    idToLabelMap.set(n.node.replace(/^n:/, ''), nodeLabel);
    idToLabelMap.set(`n_{${n.node}}`, nodeLabel);
    idToLabelMap.set(`n_{${n.node.replace(/^n:/, '')}}`, nodeLabel);
  });

  // 4. Electrical Nodes from elements
  const allNodes = Array.from(
    new Set(
      elements.flatMap((el) => {
        if (el.type === 'current') return [el.from, el.to];
        if (el.type === 'vccs' || el.type === 'vcvs') {
          return [el.positive, el.negative, el.controlPositive, el.controlNegative];
        }
        return [el.positive, el.negative];
      }).filter(Boolean)
    )
  );

  allNodes.forEach((nodeKey) => {
    if (nodeKey === '0') return;
    const idx = dict.nodeIndex(nodeKey);
    const nodeLabel = idx > 0 ? `Node_{${idx}}` : `Node_{1}`;
    idToLabelMap.set(nodeKey, nodeLabel);
    const stripped = nodeKey.replace(/^n:/, '');
    idToLabelMap.set(stripped, nodeLabel);
    const alphaNum = nodeKey.replace(/[^A-Za-z0-9]/g, '');
    idToLabelMap.set(alphaNum, nodeLabel);
    idToLabelMap.set(`n_{${nodeKey}}`, nodeLabel);
    idToLabelMap.set(`n_{${stripped}}`, nodeLabel);
    idToLabelMap.set(`n_{${alphaNum}}`, nodeLabel);
  });

  return idToLabelMap;
}

/**
 * Sanitizes math and prose strings, replacing internal UUIDs and unformatted node references
 * with clean academic labels before KaTeX rendering.
 */
export function sanitizeMathUuids(math: string, idToLabelMap: Map<string, string>): string {
  if (!math) return math;
  let result = math;

  // 1. Sort dictionary keys by length descending so longer patterns match first
  const sortedEntries = Array.from(idToLabelMap.entries()).sort(
    (a, b) => b[0].length - a[0].length
  );

  // 2. Replace exact dictionary keys
  for (const [key, label] of sortedEntries) {
    if (!key || key.length < 2) continue; // Skip single characters to avoid replacing generic variables
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedKey, 'g');
    result = result.replace(regex, label);
  }

  // 3. Replace any lingering node patterns like n_{xyz} or n_{C9KUa}
  result = result.replace(/n_\{([A-Za-z0-9_-]+)\}/g, (_match, nodeVal) => {
    if (nodeVal === '0') return '0';
    const mapped = idToLabelMap.get(nodeVal) || idToLabelMap.get(`n_{${nodeVal}}`);
    if (mapped) return mapped;
    const num = nodeVal.match(/\d+/);
    return num ? `Node_{${num[0]}}` : `Node_{1}`;
  });

  // 4. Catch lingering UUID / internal identifier patterns like PT_0LBZklQz or PT_{0}LBZklQz
  result = result.replace(/PT_\\?\{?(\d+)\}?[A-Za-z0-9_]+/g, 'R_1');

  // 5. Clean up any accidental nested subscript closures like _{R_{3}} -> _{R_3}
  result = result.replace(/_\{([A-Za-z]+)_\{(\d+)\}\}/g, '_{$1_$2}');

  return result;
}

