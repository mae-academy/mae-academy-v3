import { describe, it, expect } from 'vitest';
import { componentPrefix, nextComponentLabel, type CircuitComponent } from '../models/circuitTypes';
import { calculateMeshLoopBounds, calculateTabDPlanarCavity, tabDComponentLabelAnchors } from './analogCanvasGeometry';
import type { Point } from '../models/wiring';

describe('calculateTabDPlanarCavity (rendered mesh-indicator geometry)', () => {
  const pointInPolygon = (point: Point, polygon: Point[]) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (((yi > point[1]) !== (yj > point[1])) && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };

  it('centers within a plain rectangular face at the bbox midpoint', () => {
    const rectangle: Point[] = [[0, 0], [200, 0], [200, 100], [0, 100]];
    const { center, radius } = calculateTabDPlanarCavity(rectangle);
    expect(center).toEqual([100, 50]);
    expect(radius).toBeGreaterThan(0);
  });

  it('re-anchors center and radius inside a concave (L-shaped/staircase) mesh face', () => {
    // The bbox midpoint of this face falls in its outer notch, outside the polygon.
    const lShape: Point[] = [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]];
    const { center, radius } = calculateTabDPlanarCavity(lShape);
    expect(pointInPolygon(center, lShape)).toBe(true);
    for (let angle = 0; angle < 360; angle += 5) {
      const radians = (angle * Math.PI) / 180;
      const sample: Point = [center[0] + radius * Math.cos(radians), center[1] + radius * Math.sin(radians)];
      expect(pointInPolygon(sample, lShape)).toBe(true);
    }
  });
});

describe('calculateMeshLoopBounds (Bounding Box Midpoint & Safe Radius)', () => {
  it('calculates the exact bounding box midpoint instead of vertex average', () => {
    const rectangle: Point[] = [[0, 0], [200, 0], [200, 100], [0, 100]];
    const bounds = calculateMeshLoopBounds(rectangle);
    expect(bounds.cx).toBe(100);
    expect(bounds.cy).toBe(50);
    expect(bounds.width).toBe(200);
    expect(bounds.height).toBe(100);
    expect(bounds.R).toBe(22); // Clamped to max 22px
  });

  it('prevents center drift towards dense shared branches where vertex averaging fails', () => {
    // Asymmetric loop: 2 vertices on the left at x=0, but 10 intermediate nodes on the right shared branch at x=200
    const asymmetricNodes: Point[] = [
      [0, 0],
      [0, 100],
      // 10 nodes on shared branch at x=200
      [200, 0],
      [200, 10],
      [200, 20],
      [200, 30],
      [200, 40],
      [200, 50],
      [200, 60],
      [200, 70],
      [200, 80],
      [200, 100],
    ];

    // Vertex averaging center of mass:
    const vertexAvgX = asymmetricNodes.reduce((sum, [x]) => sum + x, 0) / asymmetricNodes.length;
    expect(vertexAvgX).toBeGreaterThan(160); // Severely skewed towards the shared branch (x=200)

    // Bounding box midpoint:
    const bounds = calculateMeshLoopBounds(asymmetricNodes);
    expect(bounds.cx).toBe(100); // Perfectly centered in the middle of the loop void!
    expect(bounds.cy).toBe(50);
    expect(bounds.R).toBe(22);
    // Collision-safe guarantee: Loop circle does NOT touch boundary wires (x=0, x=200, y=0, y=100)
    expect(bounds.cx - bounds.R).toBeGreaterThan(0);
    expect(bounds.cx + bounds.R).toBeLessThan(200);
    expect(bounds.cy - bounds.R).toBeGreaterThan(0);
    expect(bounds.cy + bounds.R).toBeLessThan(100);
  });

  it('enforces collision-safe radius clamped between 14px and 22px', () => {
    // Very small mesh loop (40x40): 25% of 40 = 10, clamped to minimum 14px
    const smallLoop: Point[] = [[0, 0], [40, 0], [40, 40], [0, 40]];
    const smallBounds = calculateMeshLoopBounds(smallLoop);
    expect(smallBounds.R).toBe(14);

    // Very large mesh loop (400x300): 25% of 300 = 75, hard-clamped to maximum 22px (no bloated hoops)
    const largeLoop: Point[] = [[0, 0], [400, 0], [400, 300], [0, 300]];
    const largeBounds = calculateMeshLoopBounds(largeLoop);
    expect(largeBounds.R).toBe(22);

    // Medium mesh loop (160x80): 25% of 80 = 20, within [14, 22] range
    const mediumLoop: Point[] = [[10, 10], [170, 10], [170, 90], [10, 90]];
    const mediumBounds = calculateMeshLoopBounds(mediumLoop);
    expect(mediumBounds.R).toBe(20);
    expect(mediumBounds.cx).toBe(90);
    expect(mediumBounds.cy).toBe(50);
  });

  it('computes bounds from cycle.wires waypoints matching visual wire segments', () => {
    const mockCycle = {
      index: 1,
      color: '#7c3aed',
      points: [[50, 380], [600, 380]], // Contaminated points from logical super-node
      centroid: [325, 220] as [number, number],
      radius: 35,
      nodes: [],
      branchIds: ['R8', 'V2', 'R3', 'I1'],
      wires: [
        { waypoints: [{ x: 300, y: 60 }, { x: 450, y: 60 }, { x: 600, y: 60 }] },
        { waypoints: [{ x: 600, y: 60 }, { x: 600, y: 380 }] },
        { waypoints: [{ x: 600, y: 380 }, { x: 300, y: 380 }] },
        { waypoints: [{ x: 300, y: 380 }, { x: 300, y: 60 }] },
      ],
    };

    const bounds = calculateMeshLoopBounds(mockCycle);
    expect(bounds.minX).toBe(300);
    expect(bounds.maxX).toBe(600);
    expect(bounds.cx).toBe(450); // Perfectly centered at 450, completely immune to contaminated points at 50!
    expect(bounds.cy).toBe(220);
    expect(bounds.R).toBe(22); // Hard clamped to 22px
  });

  it('resolves visual wire segments and components for Mesh 2 without ground super-node skew', () => {
    // Exact topology from the user screenshot:
    // Left: V1(50, 280), R1(200, 60)
    // Middle branch: R8(300, 140), V2(300, 280)
    // Right branch: R3(450, 60), I1(600, 180)
    const components: CircuitComponent[] = [
      { id: 'V1', type: 'dc-voltage', x: 50, y: 280, rotation: 0, flipH: false, flipV: false, label: 'V_1', value: 12 },
      { id: 'R1', type: 'resistor', x: 200, y: 60, rotation: 0, flipH: false, flipV: false, label: 'R_1', value: 1000 },
      { id: 'R8', type: 'resistor', x: 300, y: 140, rotation: 90, flipH: false, flipV: false, label: 'R_8', value: 1000 },
      { id: 'V2', type: 'dc-voltage', x: 300, y: 280, rotation: 0, flipH: false, flipV: false, label: 'V_2', value: 12 },
      { id: 'R3', type: 'resistor', x: 450, y: 60, rotation: 0, flipH: false, flipV: false, label: 'R_3', value: 1000 },
      { id: 'I1', type: 'dc-current', x: 600, y: 180, rotation: 0, flipH: false, flipV: false, label: 'I_1', value: 1 },
      { id: 'GND', type: 'ground', x: 150, y: 380, rotation: 0, flipH: false, flipV: false },
    ];

    const wires: any[] = [
      // Mesh 1 wires
      { id: 'w1', fromComp: 'V1', fromTerm: 'pos', toComp: 'R1', toTerm: 'a', path: [[50, 240], [50, 60], [170, 60]] },
      { id: 'w2', fromComp: 'R1', fromTerm: 'b', toComp: 'R8', toTerm: 'a', path: [[230, 60], [300, 60], [300, 110]] },
      // Shared middle wire
      { id: 'w3', fromComp: 'R8', fromTerm: 'b', toComp: 'V2', toTerm: 'pos', path: [[300, 170], [300, 240]] },
      // Mesh 2 top wires
      { id: 'w4', fromComp: 'R8', fromTerm: 'a', toComp: 'R3', toTerm: 'a', path: [[300, 60], [420, 60]] },
      { id: 'w5', fromComp: 'R3', fromTerm: 'b', toComp: 'I1', toTerm: 'pos', path: [[480, 60], [600, 60], [600, 140]] },
      // Mesh 2 right/bottom wire to middle branch
      { id: 'w6', fromComp: 'I1', fromTerm: 'neg', toComp: 'V2', toTerm: 'neg', path: [[600, 220], [600, 380], [300, 380], [300, 320]] },
      // Ground rail wire to the far left (Mesh 1 / ground)
      { id: 'w7', fromComp: 'GND', fromTerm: 'gnd', toComp: 'V1', toTerm: 'neg', path: [[150, 380], [50, 380], [50, 320]] },
    ];

    const mesh2Cycle = {
      index: 1,
      color: '#7c3aed',
      points: [[50, 380], [600, 380], [600, 60], [300, 60]], // Contaminated logical super-node points
      centroid: [325, 220] as [number, number],
      radius: 35,
      nodes: [],
      branchIds: ['R8', 'V2', 'R3', 'I1'],
    };

    const bounds = calculateMeshLoopBounds(mesh2Cycle, components, wires);
    // Physical boundary of Mesh 2 is strictly x in [300, 600]
    expect(bounds.minX).toBeGreaterThanOrEqual(280);
    expect(bounds.maxX).toBeLessThanOrEqual(620);
    // Center is in the empty right-hand space (~450), NOT crashed into middle branch (300)
    expect(bounds.cx).toBeGreaterThanOrEqual(430);
    expect(bounds.cx).toBeLessThanOrEqual(470);
    // Radius is elegantly clamped to 22px max
    expect(bounds.R).toBe(22);
  });
});

describe('Component Prefixes (circuitTypes.ts)', () => {
  it('maps potentiometer to R', () => {
    expect(componentPrefix('potentiometer')).toBe('R');
  });

  it('maps all diode variants to D', () => {
    const diodeVariants = [
      'diode',
      'diode-ideal',
      'diode-silicon',
      'diode-germanium',
      'diode-gaas',
      'zener',
      'led',
      'photodiode',
      'diac',
    ];
    for (const variant of diodeVariants) {
      expect(componentPrefix(variant)).toBe('D');
    }
  });

  it('unifies all controlled sources under CS', () => {
    const controlledSources = ['vcvs', 'vccs', 'cccs', 'ccvs'];
    for (const cs of controlledSources) {
      expect(componentPrefix(cs)).toBe('CS');
    }
  });

  it('maps impedance to Z', () => {
    expect(componentPrefix('impedance')).toBe('Z');
  });

  it('generates correct nextComponentLabel for updated prefixes', () => {
    const components: CircuitComponent[] = [
      { id: '1', type: 'resistor', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'R1', props: {} },
      { id: '2', type: 'vcvs', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'CS1', props: {} },
      { id: '3', type: 'diode', x: 0, y: 0, rotation: 0, flipH: false, flipV: false, label: 'D1', props: {} },
    ];
    // Potentiometer shares 'R' prefix with resistor
    expect(nextComponentLabel('potentiometer', components)).toBe('R2');
    // Controlled sources share 'CS' prefix
    expect(nextComponentLabel('vccs', components)).toBe('CS2');
    // Diode variants share 'D' prefix
    expect(nextComponentLabel('diode-silicon', components)).toBe('D2');
    // Impedance uses 'Z'
    expect(nextComponentLabel('impedance', components)).toBe('Z1');
  });
});

describe('Component Label Anchors (analogCanvasGeometry.ts)', () => {
  it('centers horizontal components horizontally with 6px padding', () => {
    // Resistor: halfWidth = 30, halfHeight = 10 -> bodyHalfH = 10, offsetY = 10 + 6 = 16
    const resistorAnchors = tabDComponentLabelAnchors('resistor', true, 30, 10);
    expect(resistorAnchors.reference[0]).toBe(0);
    expect(resistorAnchors.value[0]).toBe(0);
    expect(resistorAnchors.reference[1]).toBe(-16);
    expect(resistorAnchors.value[1]).toBe(16);

    // Capacitor: halfWidth = 30, halfHeight = 15 -> bodyHalfH = 15, offsetY = 15 + 6 = 21
    const capAnchors = tabDComponentLabelAnchors('capacitor', true, 30, 15);
    expect(capAnchors.reference[0]).toBe(0);
    expect(capAnchors.value[0]).toBe(0);
    expect(capAnchors.reference[1]).toBe(-21);
    expect(capAnchors.value[1]).toBe(21);

    // Diode: halfWidth = 30, halfHeight = 10 -> bodyHalfH = 9, offsetY = 9 + 5 = 14
    for (const dType of ['diode', 'zener', 'led', 'photodiode']) {
      const diodeAnchors = tabDComponentLabelAnchors(dType, true, 30, 10);
      expect(diodeAnchors.reference[0]).toBe(0);
      expect(diodeAnchors.value[0]).toBe(0);
      expect(diodeAnchors.reference[1]).toBe(-14);
      expect(diodeAnchors.value[1]).toBe(14);
    }
  });

  it('positions vertical passive and diode components snugly to the right based on visual body width', () => {
    // Diode family: bodyHalfW = 12, padding = 5 -> offsetX = 17
    for (const dType of ['diode', 'zener', 'led', 'photodiode']) {
      const diodeAnchors = tabDComponentLabelAnchors(dType, false, 30, 10);
      expect(diodeAnchors.reference[0]).toBe(17);
      expect(diodeAnchors.value[0]).toBe(17);
      expect(diodeAnchors.reference[1]).toBe(-6);
      expect(diodeAnchors.value[1]).toBe(10);
    }

    // Resistor / Inductor / Impedance: bodyHalfW = 11, padding = 5 -> offsetX = 16
    const resistorAnchors = tabDComponentLabelAnchors('resistor', false, 30, 10);
    expect(resistorAnchors.reference[0]).toBe(16);
    expect(resistorAnchors.value[0]).toBe(16);
    expect(resistorAnchors.reference[1]).toBe(-6);
    expect(resistorAnchors.value[1]).toBe(10);

    const inductorAnchors = tabDComponentLabelAnchors('inductor', false, 30, 10);
    expect(inductorAnchors.reference[0]).toBe(16);

    const impedanceAnchors = tabDComponentLabelAnchors('impedance', false, 30, 10);
    expect(impedanceAnchors.reference[0]).toBe(16);

    // Capacitor: bodyHalfW = 15, padding = 5 -> offsetX = 20
    const capAnchors = tabDComponentLabelAnchors('capacitor', false, 30, 15);
    expect(capAnchors.reference[0]).toBe(20);
    expect(capAnchors.value[0]).toBe(20);
  });

  it('handles controlled sources with tighter Left/Right and Top/Bottom placement', () => {
    // Horizontal (wires Left/Right) -> Labels Top/Bottom (18 + 4 = 22)
    const csHorizontal = tabDComponentLabelAnchors('vcvs', true, 35, 35);
    expect(csHorizontal.reference).toEqual([0, -22]);
    expect(csHorizontal.value).toEqual([0, 22]);
    expect(csHorizontal.refTextAnchor).toBe('middle');
    expect(csHorizontal.valTextAnchor).toBe('middle');

    // Vertical (wires Top/Bottom) -> Labels Left/Right (18 + 4 = 22)
    const csVertical = tabDComponentLabelAnchors('vccs', false, 35, 35);
    expect(csVertical.reference).toEqual([-22, 0]);
    expect(csVertical.value).toEqual([22, 0]);
    expect(csVertical.refTextAnchor).toBe('end');
    expect(csVertical.valTextAnchor).toBe('start');
  });

  it('handles circular sources with closer Left/Right and Top/Bottom placement', () => {
    // Horizontal (wires Left/Right) -> Labels Top/Bottom (33 + 4 = 37)
    const voltHorizontal = tabDComponentLabelAnchors('voltmeter', true, 50, 50);
    expect(voltHorizontal.reference).toEqual([0, -37]);
    expect(voltHorizontal.value).toEqual([0, 37]);
    expect(voltHorizontal.refTextAnchor).toBe('middle');
    expect(voltHorizontal.valTextAnchor).toBe('middle');

    // Vertical (wires Top/Bottom) -> Labels Left/Right (33 + 4 = 37)
    const dcVoltVertical = tabDComponentLabelAnchors('dc-voltage', false, 50, 50);
    expect(dcVoltVertical.reference).toEqual([-37, 0]);
    expect(dcVoltVertical.value).toEqual([37, 0]);
    expect(dcVoltVertical.refTextAnchor).toBe('end');
    expect(dcVoltVertical.valTextAnchor).toBe('start');
  });

  it('hugs visual core for transformers, relays, and contactors', () => {
    // Transformer (bodyHalfW = 20, bodyHalfH = 50, padding = 6)
    const xformerV = tabDComponentLabelAnchors('transformer', false, 50, 50);
    expect(xformerV.reference).toEqual([26, -6]); // 20 + 6 = 26
    expect(xformerV.value).toEqual([26, 10]);

    const xformerH = tabDComponentLabelAnchors('transformer', true, 50, 50);
    expect(xformerH.reference).toEqual([0, -56]); // -(50 + 6) = -56
    expect(xformerH.value).toEqual([0, 56]);

    // Relay (bodyHalfW = 35, bodyHalfH = 35, padding = 6)
    const relayV = tabDComponentLabelAnchors('relay-spst', false, 50, 50);
    expect(relayV.reference).toEqual([41, -6]); // 35 + 6 = 41
    expect(relayV.value).toEqual([41, 10]);

    // Contactor (bodyHalfW = 35, bodyHalfH = 75, padding = 4, yShift = 12.5)
    // Horizontal rotation: offsetY = 75 + 4 = 79
    // Top: -79 + 12.5 = -66.5
    // Bottom: 79 + 12.5 = 91.5
    const contactorH = tabDComponentLabelAnchors('contactor', true, 50, 80);
    expect(contactorH.reference).toEqual([0, -66.5]);
    expect(contactorH.value).toEqual([0, 91.5]);

    // 3-Phase Fuse (bodyHalfW = 20, bodyHalfH = 25, padding = 4)
    const fuse3pV = tabDComponentLabelAnchors('fuse-3phase', false, 50, 50);
    expect(fuse3pV.reference).toEqual([24, -6]); // 20 + 4 = 24
    expect(fuse3pV.value).toEqual([24, 10]);
  });

  it('forces ground labels safely below the symbol to avoid terminal wire at top', () => {
    const groundAnchors = tabDComponentLabelAnchors('ground', false, 15, 15);
    expect(groundAnchors.reference).toEqual([0, 30]);
    expect(groundAnchors.value).toEqual([0, 42]);
    expect(groundAnchors.refTextAnchor).toBe('middle');
    expect(groundAnchors.valTextAnchor).toBe('middle');
  });

  it('places three-phase-rail labels on the right side between L2 and L3', () => {
    const railAnchors = tabDComponentLabelAnchors('three-phase-rail', false, 45, 30);
    expect(railAnchors).toEqual({
      reference: [60, -12],
      value: [60, 8],
      refTextAnchor: 'start',
      valTextAnchor: 'start'
    });
  });

  it('preserves sw-dpst custom 12px padding', () => {
    const dpstH = tabDComponentLabelAnchors('sw-dpst', true, 25, 25);
    expect(dpstH.reference).toEqual([0, -37]); // -(25 + 12)
    expect(dpstH.value).toEqual([0, 37]);

    const dpstV = tabDComponentLabelAnchors('sw-dpst', false, 25, 25);
    expect(dpstV.reference).toEqual([37, -6]); // 25 + 12
    expect(dpstV.value).toEqual([37, 10]);
  });

  it('preserves opamp bounds with visual footprint', () => {
    const opamp = tabDComponentLabelAnchors('opamp', true, 40, 40);
    expect(opamp.reference).toEqual([0, -31]); // -(25 + 6)
    expect(opamp.value).toEqual([0, 31]);
  });

  it('shifts sw-spdt and sw-dpdt anchors with yShift = 12.5 and padding = 6', () => {
    // sw-spdt horizontal: bodyHalfH = 12.5, padding = 6 -> offsetY = Math.round(18.5) = 19
    // reference: [0, -19 + 12.5] = [0, -6.5]
    // value: [0, 19 + 12.5] = [0, 31.5]
    const spdtH = tabDComponentLabelAnchors('sw-spdt', true, 25, 12.5);
    expect(spdtH.reference).toEqual([0, -6.5]);
    expect(spdtH.value).toEqual([0, 31.5]);

    // sw-spdt vertical: bodyHalfW = 25, padding = 6 -> offsetX = 31
    // reference: [31, -6 + 12.5] = [31, 6.5]
    // value: [31, 10 + 12.5] = [31, 22.5]
    const spdtV = tabDComponentLabelAnchors('sw-spdt', false, 25, 12.5);
    expect(spdtV.reference).toEqual([31, 6.5]);
    expect(spdtV.value).toEqual([31, 22.5]);
  });

  it('positions SCR labels safely to the right side of the diode body in upright orientation', () => {
    // SCR vertical: bodyHalfW = 16, padding = 6 -> offsetX = 22
    // reference: [22, -6], value: [22, 10]
    const scrV = tabDComponentLabelAnchors('scr', false, 20, 30);
    expect(scrV.reference).toEqual([22, -6]);
    expect(scrV.value).toEqual([22, 10]);
    expect(scrV.refTextAnchor).toBe('start');
    expect(scrV.valTextAnchor).toBe('start');
  });
});
