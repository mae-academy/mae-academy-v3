import { describe, expect, it } from 'vitest';
import { createKMapTopology, groupToOverlayRects, groupToPlaneBridges, layoutKMapGroups } from './kmapGeometry';
import { solveKMap } from './kmapSolver';

describe('K-Map Quine–McCluskey and Petrick engine', () => {
  it('extracts the required essential prime implicant for a four-variable function', () => {
    const result = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms: [0, 1, 2, 3, 8, 9, 10, 11] });
    expect(result.uncoveredMinterms).toEqual([]);
    expect(result.essentialPrimeImplicants.map(implicant => implicant.pattern)).toEqual(['-0--']);
    expect(result.selectedPrimeImplicants.map(implicant => implicant.pattern)).toEqual(['-0--']);
    expect(result.latex).toBe('\\overline{B}');
    expect(result.hardwareCost).toEqual({ terms: 1, literals: 1 });
  });

  it('uses Petrick coverage selection for a cyclic four-variable residual chart', () => {
    const result = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms: [0, 1, 2, 5, 6, 7] });
    expect(result.essentialPrimeImplicants).toEqual([]);
    expect(result.uncoveredMinterms).toEqual([]);
    expect(result.hardwareCost.terms).toBe(3);
    expect(result.minimumCoverings.length).toBeGreaterThan(0);
    result.minimumCoverings.forEach(covering => {
      const covered = new Set(covering.flatMap(implicant => implicant.coveredMinterms));
      expect([0, 1, 2, 5, 6, 7].every(minterm => covered.has(minterm))).toBe(true);
    });
  });

  it('uses don’t-care cells to expand groups without requiring them in the final coverage', () => {
    const result = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms: [1, 3], dontCares: [0, 2] });
    expect(result.selectedPrimeImplicants.map(implicant => implicant.pattern)).toEqual(['00--']);
    expect(result.selectedPrimeImplicants[0].coveredMinterms).toEqual([1, 3]);
    expect(result.selectedPrimeImplicants[0].sourceTerms).toEqual([0, 1, 2, 3]);
    expect(result.latex).toBe('\\overline{A} \\cdot \\overline{B}');
  });

  it('uses all available don’t-cares to minimize one asserted minterm to the constant-one implicant', () => {
    const result = solveKMap({
      variables: ['A', 'B', 'C', 'D'],
      minterms: [0],
      dontCares: Array.from({ length: 15 }, (_, index) => index + 1),
    });

    expect(result.uncoveredMinterms).toEqual([]);
    expect(result.selectedPrimeImplicants.map(implicant => implicant.pattern)).toEqual(['----']);
    expect(result.latex).toBe('1');
    expect(result.hardwareCost).toEqual({ terms: 1, literals: 0 });
  });

  it('returns the zero function deterministically when no minterms are active', () => {
    const result = solveKMap({ variables: ['A', 'B', 'C', 'D'], minterms: [], dontCares: [0, 1] });
    expect(result.latex).toBe('0');
    expect(result.primeImplicants).toEqual([]);
    expect(result.hardwareCost).toEqual({ terms: 0, literals: 0 });
  });

  it('supports a fifth variable while preserving the minimum implicant', () => {
    const result = solveKMap({ variables: ['A', 'B', 'C', 'D', 'E'], minterms: [0, 1] });
    expect(result.selectedPrimeImplicants.map(implicant => implicant.pattern)).toEqual(['0000-']);
    expect(result.latex).toBe('\\overline{A} \\cdot \\overline{B} \\cdot \\overline{C} \\cdot \\overline{D}');
  });
});

describe('K-Map Gray-code and toroidal overlay geometry', () => {
  const metrics = { cellWidth: 50, cellHeight: 42, mapGap: 24, cornerRadius: 15 };

  it('maps four-variable minterms to canonical Gray-code row and column coordinates', () => {
    const topology = createKMapTopology(4);
    expect(topology.rowGrayCodes).toEqual(['00', '01', '11', '10']);
    expect(topology.columnGrayCodes).toEqual(['00', '01', '11', '10']);
    expect(topology.cells.find(cell => cell.minterm === 6)).toMatchObject({ map: 0, row: 1, column: 3 });
  });

  it('splits a horizontal toroidal group into edge-local overlay fragments instead of crossing the map center', () => {
    const topology = createKMapTopology(4);
    const rects = groupToOverlayRects([0, 2], topology, metrics, 3);
    expect(rects).toHaveLength(2);
    expect(rects.map(rect => rect.x).sort((left, right) => left - right)).toEqual([3, 153]);
    expect(rects.every(rect => rect.path.includes('C'))).toBe(true);
  });

  it('layers large groups behind nested groups and offsets their strokes by four pixels', () => {
    const topology = createKMapTopology(4);
    const [large, small] = layoutKMapGroups([
      { id: 'large', coveredMinterms: [0, 1, 2, 3] },
      { id: 'small', coveredMinterms: [0, 1] },
    ], topology, metrics);
    expect(large).toMatchObject({ id: 'large', groupSize: 4, zIndex: 0, inset: 3 });
    expect(small).toMatchObject({ id: 'small', groupSize: 2, zIndex: 1, inset: 7 });
  });

  it('provides a dashed bridge when a five-variable implicant continues through both 4×4 planes', () => {
    const topology = createKMapTopology(5);
    const bridges = groupToPlaneBridges([0, 1], topology, metrics, 3);
    expect(topology.maps).toBe(2);
    expect(bridges).toHaveLength(1);
    expect(bridges[0]).toMatchObject({ dashed: true, from: { x: 197 }, to: { x: 227 } });
  });
});
