import { describe, expect, it } from "vitest";
import { componentObstacle, deriveTerminalNodes, deriveWireJunctions, findOrthogonalJumps, makeComponent, routeWire, snapToGrid, type Port, type Wire, updatePorts } from "./circuitPhase1";

describe("Circuit Studio Phase 1 stress audit", () => {
  it("rounds arbitrary coordinates to the nearest configured grid intersection", () => {
    expect(snapToGrid(12.3, 45.7, 10)).toEqual({ x: 10, y: 50 });
    expect(snapToGrid(12.3, 45.7)).toEqual({ x: 20, y: 40 });
  });

  it("marks a non-endpoint orthogonal crossing for a visual bypass rather than a node", () => {
    const horizontal: Wire = { id: "a", from: "p1", to: "p2", points: [{ x: 0, y: 10 }, { x: 100, y: 10 }], style: "orthogonal" };
    expect(findOrthogonalJumps([{ x: 50, y: 0 }, { x: 50, y: 100 }], [horizontal])).toEqual([{ x: 50, y: 10 }]);
  });

  it("creates a node only when component terminals collide, then removes it when they separate", () => {
    const overlapping: Port[] = [
      { id: "a", componentId: "c1", x: 100, y: 100, terminal: "passive" },
      { id: "b", componentId: "c2", x: 100, y: 100, terminal: "passive" },
    ];
    expect(deriveTerminalNodes(overlapping)).toEqual([{ id: "node:100:100", x: 100, y: 100, portIds: ["a", "b"] }]);
    expect(deriveTerminalNodes([{ ...overlapping[0] }, { ...overlapping[1], x: 120 }])).toEqual([]);
  });

  it("creates a strict single-terminal Ground component tagged as the future 0 V reference", () => {
    const ground = makeComponent("ground", 12.3, 45.7, "gnd");
    expect(ground).toMatchObject({ type: "ground", name: "GND", value: 0, referenceVoltage: 0, x: 20, y: 40 });
    expect(ground.ports).toHaveLength(1);
    expect(ground.ports[0].terminal).toBe("ground");
  });

  it("moves passive terminals to their actual displayed positions after rotation and reflection", () => {
    const resistor = makeComponent("resistor", 200, 200, "r-transform");
    const rotated = updatePorts({ ...resistor, rotation: 90 });
    expect(rotated.ports.map((port) => ({ x: port.x, y: port.y }))).toEqual([{ x: 200, y: 140 }, { x: 200, y: 260 }]);
    const reflected = updatePorts({ ...resistor, rotation: 90, reflected: true });
    expect(reflected.ports.map((port) => ({ x: port.x, y: port.y }))).toEqual([{ x: 200, y: 260 }, { x: 200, y: 140 }]);
  });

  it("keeps the potentiometer wiper as a third transformed terminal while its travel changes", () => {
    const potentiometer = makeComponent("potentiometer", 200, 200, "pot-1");
    expect(potentiometer.ports).toHaveLength(3);
    const moved = updatePorts({ ...potentiometer, wiper: 100, rotation: 90 });
    expect(moved.ports[2]).toMatchObject({ x: 252, y: 236 });
    expect(moved.ports[0]).toMatchObject({ x: 200, y: 140 });
    expect(moved.ports[1]).toMatchObject({ x: 200, y: 260 });
  });

  it("propagates the 0 V reference through a click-to-wire connection", () => {
    const ground = makeComponent("ground", 100, 100, "gnd");
    const resistor = makeComponent("resistor", 280, 100, "r1");
    const nodes = deriveTerminalNodes([...ground.ports, ...resistor.ports], [{ id: "w", from: ground.ports[0].id, to: resistor.ports[0].id, fromPoint: ground.ports[0], toPoint: resistor.ports[0], points: [], style: "orthogonal" }]);
    expect(nodes).toContainEqual(expect.objectContaining({ referenceVoltage: 0, portIds: expect.arrayContaining([ground.ports[0].id, resistor.ports[0].id]) }));
  });

  it("routes orthogonal nets around a component obstacle while retaining exact terminal endpoints", () => {
    const blocker = makeComponent("resistor", 100, 0, "blocker");
    const path = routeWire({ x: 0, y: 0 }, { x: 200, y: 0 }, "orthogonal", [componentObstacle(blocker)]);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 200, y: 0 });
    expect(path.some((point) => point.y !== 0)).toBe(true);
  });

  it("only emits solid junctions for shared intentional junction endpoints", () => {
    const wires: Wire[] = [
      { id: "a", from: "p1", to: "junction:100:100", fromPoint: { x: 0, y: 100 }, toPoint: { x: 100, y: 100 }, points: [], style: "orthogonal" },
      { id: "b", from: "p2", to: "junction:100:100", fromPoint: { x: 200, y: 100 }, toPoint: { x: 100, y: 100 }, points: [], style: "orthogonal" },
    ];
    expect(deriveWireJunctions(wires)).toEqual([{ x: 100, y: 100 }]);
  });
});
