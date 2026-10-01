// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SchematicView } from "./SchematicView";
import { allSchematics } from "./matrix";

describe("rendered schematic DOM (every topology)", () => {
  const matrix = allSchematics();

  it("covers the whole matrix", () => {
    expect(matrix.length).toBe(186);
  });

  it("renders unique tags, one svg, and a viewBox that fits everything", () => {
    for (const { name, doc } of matrix) {
      const { container, unmount } = render(<SchematicView document={doc} />);
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length, name).toBe(1);

      const tags = Array.from(container.querySelectorAll("foreignObject")).map((node) => node.getAttribute("data-label"));
      expect(new Set(tags).size, `${name}: duplicate tag in ${tags.join(",")}`).toBe(tags.length);
      const expected = doc.components.flatMap((component) => component.labels.map((label) => label.text));
      expect(tags.sort(), name).toEqual(expected.sort());

      // component identifiers are unique too
      const ids = Array.from(container.querySelectorAll("[data-component]")).map((node) => node.getAttribute("data-component"));
      expect(new Set(ids).size, name).toBe(ids.length);

      const [x, y, w, h] = svgs[0].getAttribute("viewBox")!.split(" ").map(Number);
      expect(svgs[0].getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
      const inside = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;
      doc.components.forEach((component) => Object.values(component.pins).forEach((pin) => expect(inside(pin.x, pin.y), `${name} pin of ${component.id}`).toBe(true)));
      doc.wires.forEach((wire) => wire.points.forEach((point) => expect(inside(point.x, point.y), `${name} ${wire.id}`).toBe(true)));
      doc.components.forEach((component) => component.labels.forEach((label) => expect(inside(label.x, label.y), `${name} label ${label.text}`).toBe(true)));
      unmount();
    }
  });

  it("rebuilding for a new topology leaves no ghost nodes", () => {
    const [first, second] = [matrix.find((m) => m.name.startsWith("rectifier three bridge RLE"))!, matrix.find((m) => m.name === "inverter single half-bridge R")!];
    const { container, rerender } = render(<SchematicView document={first.doc} />);
    rerender(<SchematicView document={second.doc} />);
    expect(container.querySelectorAll("svg").length).toBe(1);
    const present = Array.from(container.querySelectorAll("[data-component]")).map((node) => node.getAttribute("data-component")).sort();
    expect(present).toEqual(second.doc.components.map((component) => component.id).sort());
  });

  it("has no gate labels and only canonical designators", () => {
    const allowed = /^(T|TR|Q|D|R|L|C|E|v[a-c]?|Vs|Vdc|TR|FWD)\d*[a-z]*$/;
    for (const { name, doc } of matrix) {
      const labels = doc.components.flatMap((component) => component.labels.map((label) => label.text));
      expect(labels.filter((text) => /^G\d*$/.test(text)), name).toEqual([]);
      expect(labels.filter((text) => !allowed.test(text)), name).toEqual([]);
    }
  });

  it("draws leads and wires with the identical stroke, bodies slightly heavier", () => {
    const { doc } = matrix.find((m) => m.name.startsWith("rectifier three bridge R ctl=true"))!;
    const { container } = render(<SchematicView document={doc} />);
    const widths = (selector: string) => new Set(Array.from(container.querySelectorAll(selector)).map((node) => `${node.getAttribute("stroke")}|${node.getAttribute("stroke-width")}`));
    const wires = widths('[data-layer="wires"]');
    expect(container.querySelectorAll('[data-layer="wires"] path[stroke]').length).toBe(0); // no per-wire overrides
    const leads = widths('[data-role="lead"]');
    const bodies = widths('[data-role="body"]');
    expect(wires.size).toBe(1);
    expect(leads).toEqual(wires);
    expect(Array.from(bodies).every((entry) => entry.endsWith("|2.5"))).toBe(true);
    expect(Array.from(wires)[0].endsWith("|2")).toBe(true);
    // no heavy source stems: every source lead is wire-weight
    container.querySelectorAll('[data-kind="acSource"] [data-role="lead"]').forEach((node) => expect(node.getAttribute("stroke-width")).toBe("2"));
  });
});
