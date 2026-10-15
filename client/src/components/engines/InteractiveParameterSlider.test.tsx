// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AiMarkdown } from "@/components/ai/AiMarkdown";
import { InteractiveParameterSlider } from "./InteractiveParameterSlider";
import { valueToPosition, parseParamsSpec } from "./paramsSpec";

const RC = {
  title: "RC low-pass filter",
  parameters: [
    { name: "R", label: "Resistance (R)", min: 100, max: 100000, default: 10000, step: 100, unit: "Ω" },
    { name: "C", label: "Capacitance (C)", min: 1e-9, max: 1e-6, default: 100e-9, step: 1e-9, unit: "F" },
  ],
  formula: "1 / (2 * Math.PI * R * C)",
  outputLabel: "Cutoff Frequency (f_c)",
  outputUnit: "Hz",
  plot: { xLabel: "Frequency (Hz)", xMin: 1, xMax: 100000, xScale: "log", yLabel: "Gain (dB)", expression: "20*Math.log10(1/Math.sqrt(1+Math.pow(x/(1/(2*Math.PI*R*C)),2)))", markerX: "1/(2*Math.PI*R*C)", points: 200 },
};
const CODE = JSON.stringify(RC);

afterEach(cleanup);

const output = () => screen.getAllByTestId("param-output").map((el) => el.textContent);
const param = (name: string) => {
  const spec = parseParamsSpec(CODE);
  if (!spec.ok) throw new Error("spec");
  return spec.spec.parameters.find((p) => p.name === name)!;
};
const markerX = () => Number(screen.getByTestId("param-marker").getAttribute("data-x"));

describe("InteractiveParameterSlider", () => {
  it("shows the default cutoff (159.2 Hz), the title and the plot with its marker", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    expect(screen.getByText("RC low-pass filter")).toBeTruthy();
    expect(output()).toEqual(["159.2 Hz"]);
    expect(screen.getByTestId("param-curve").getAttribute("d")?.startsWith("M")).toBe(true);
    expect(screen.getByTestId("param-marker").textContent).toBe("159.2 Hz");
  });

  it("has labelled, accessible sliders with unit-aware value text", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    const r = screen.getByLabelText("Resistance (R)", { exact: true });
    expect(r.getAttribute("type")).toBe("range");
    expect(r.getAttribute("aria-valuetext")).toBe("10 kΩ");
    expect(screen.getByLabelText("Capacitance (C)", { exact: true }).getAttribute("aria-valuetext")).toBe("100 nF");
    expect(screen.getByLabelText("Exact value of Resistance (R)")).toBeTruthy();
  });

  it("moving the R slider to 20 kΩ updates the output to 79.58 Hz and moves the marker left", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    const before = markerX();
    fireEvent.change(screen.getByLabelText("Resistance (R)", { exact: true }), { target: { value: String(valueToPosition(param("R"), 20000)) } });
    expect(output()).toEqual(["79.58 Hz"]);
    expect(screen.getByLabelText("Resistance (R)", { exact: true }).getAttribute("aria-valuetext")).toBe("20 kΩ");
    expect(screen.getByTestId("param-marker").textContent).toBe("79.58 Hz");
    expect(markerX()).toBeLessThan(before);
  });

  it("the numeric field takes exact values with SI suffixes (47n -> 33.86 Hz at R=100k)", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    const c = screen.getByLabelText("Exact value of Capacitance (C)") as HTMLInputElement;
    expect(c.value).toBe("100n");
    fireEvent.change(c, { target: { value: "47n" } });
    fireEvent.blur(c);
    expect(output()).toEqual(["338.6 Hz"]); // 1/(2*pi*10k*47n)
    expect(screen.getByLabelText("Capacitance (C)", { exact: true }).getAttribute("aria-valuetext")).toBe("47 nF");
  });

  it("commits on Enter and clamps to the allowed range", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    const r = screen.getByLabelText("Exact value of Resistance (R)") as HTMLInputElement;
    fireEvent.change(r, { target: { value: "1M" } });
    fireEvent.keyDown(r, { key: "Enter" });
    expect(r.value).toBe("100k");
    expect(output()).toEqual(["15.92 Hz"]);
    fireEvent.change(r, { target: { value: "1" } });
    fireEvent.blur(r);
    expect(r.value).toBe("100");
  });

  it("an unparsable entry is flagged and reverts to the current value", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    const r = screen.getByLabelText("Exact value of Resistance (R)") as HTMLInputElement;
    fireEvent.change(r, { target: { value: "alert(1)" } });
    fireEvent.blur(r);
    expect(r.value).toBe("10k");
    expect(r.getAttribute("aria-invalid")).toBe("true");
    expect(output()).toEqual(["159.2 Hz"]);
  });

  it("Reset restores the defaults", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    fireEvent.change(screen.getByLabelText("Resistance (R)", { exact: true }), { target: { value: String(valueToPosition(param("R"), 50000)) } });
    expect(output()).not.toEqual(["159.2 Hz"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(output()).toEqual(["159.2 Hz"]);
    expect((screen.getByLabelText("Exact value of Resistance (R)") as HTMLInputElement).value).toBe("10k");
  });

  it("renders without a plot and with several outputs", () => {
    const code = JSON.stringify({ ...RC, plot: undefined, outputs: [{ label: "Time constant", formula: "R*C", unit: "s" }] });
    render(<InteractiveParameterSlider code={code} />);
    expect(screen.queryByTestId("param-plot")).toBeNull();
    expect(output()).toEqual(["159.2 Hz", "1 ms"]);
  });

  it("shows a calm error card with the raw JSON for an invalid spec", () => {
    const code = JSON.stringify({ ...RC, parameters: [{ ...RC.parameters[0], min: 5e5 }, RC.parameters[1]] });
    render(<InteractiveParameterSlider code={code} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not be built/);
    expect(screen.getByRole("alert").textContent).toMatch(/min must be smaller than max/);
    expect(screen.getByText(/"Resistance \(R\)"/)).toBeTruthy(); // the JSON is shown in a code block
    expect(screen.queryByTestId("interactive-params")).toBeNull();
  });

  it("a formula referencing an unknown name is reported, not evaluated", () => {
    render(<InteractiveParameterSlider code={JSON.stringify({ ...RC, formula: "1/(2*PI*R*Q)" })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/"Q", which is not a parameter/);
  });

  it("hostile formulas never run", () => {
    const g = globalThis as { __pwned?: unknown };
    render(<InteractiveParameterSlider code={JSON.stringify({ ...RC, formula: 'constructor.constructor("globalThis.__pwned=1")()' })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(g.__pwned).toBeUndefined();
  });

  it("is dir=ltr for the sliders (numbers) inside an RTL page", () => {
    render(<InteractiveParameterSlider code={CODE} />);
    expect(screen.getByLabelText("Resistance (R)", { exact: true }).getAttribute("dir")).toBe("ltr");
  });
});

describe("fence handling in AiMarkdown", () => {
  const message = `Cutoff is $f_c$.\n\n\`\`\`json:interactive-params\n${CODE}\n\`\`\`\n`;
  it("renders json:interactive-params (the colon survives markdown) as the tool", () => {
    render(<AiMarkdown content={message} />);
    expect(screen.getByTestId("interactive-params")).toBeTruthy();
    expect(output()).toEqual(["159.2 Hz"]);
  });
  it("an unterminated fence shows the placeholder and never the raw JSON", () => {
    const { container } = render(<AiMarkdown content={`Intro\n\n\`\`\`json:interactive-params\n{"title": "RC`} streaming />);
    expect(screen.getByRole("status").textContent).toMatch(/Preparing interactive tool/);
    expect(container.textContent).not.toMatch(/"title"/);
  });
  it("a partial info line still counts, but a plain json fence does not", () => {
    const partial = render(<AiMarkdown content={"Intro\n\n```json:inter"} streaming />);
    expect(screen.getByRole("status").textContent).toMatch(/Preparing interactive tool/);
    partial.unmount();
    const plain = render(<AiMarkdown content={'Intro\n\n```json\n{"a": 1'} streaming />);
    expect(plain.container.textContent).not.toMatch(/Preparing interactive tool/);
    expect(plain.container.textContent).toMatch(/"a": 1/);
  });
});
