/**
 * Information architecture (Part B): the left sidebar's categories and their templates. Each sample is a list of
 * lines that runs as shipped on the existing engine; categories.test.ts loads every sample into the real engine and
 * checks the expected result. Texts (titles, explanations, "not yet supported") are i18n keys under `categories.*`.
 */
export type CategoryId = "graphing" | "calculus" | "algebra" | "linearSystems" | "linearAlgebra";

export interface Sample {
  /** i18n key under `samples.`. */
  id: string;
  /** The reader's lines, in order. */
  items: readonly string[];
  /** Expected, checked by the tests (engine kind of the last line, or a numeric value). */
  expect: { kind?: string; value?: number; params?: readonly string[] };
}

export interface Category {
  id: CategoryId;
  samples: readonly Sample[];
  /** i18n keys under `categories.unsupported.` for what the engine does not do (stated, never faked). */
  unsupported: readonly string[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: "graphing",
    unsupported: ["surface3d"],
    samples: [
      { id: "explicit", items: ["y=a\\sin(x)"], expect: { kind: "Explicit", params: ["a"] } },
      { id: "implicit", items: ["x^2+y^2=4"], expect: { kind: "Implicit" } },
      { id: "inequality", items: ["y>x^2-2"], expect: { kind: "Implicit" } },
      { id: "parametric", items: ["(\\cos(t),\\sin(2t))"], expect: { kind: "Parametric" } },
      { id: "polar", items: ["r=1+\\cos(\\theta)"], expect: { kind: "Polar" } },
    ],
  },
  {
    id: "calculus",
    unsupported: ["indefiniteIntegral", "symbolicDerivative"],
    samples: [
      { id: "derivative", items: ["f(x)=x^2", "f'(x)"], expect: { kind: "Explicit", params: ["x_0"] } },
      { id: "integral", items: ["f(x)=x^2", "\\int_0^1 f(x)\\,dx"], expect: { value: 1 / 3 } },
    ],
  },
  {
    id: "algebra",
    unsupported: ["solve", "simplify", "factor"],
    samples: [{ id: "zeros", items: ["y=x^2-4"], expect: { kind: "Explicit" } }],
  },
  {
    id: "linearSystems",
    unsupported: ["systemBeyond3"],
    samples: [
      { id: "system2", items: ["\\begin{cases}x+y=3\\\\x-y=1\\end{cases}"], expect: { kind: "GaussSystem" } },
      { id: "systemMatrix", items: ["A=\\begin{bmatrix}2&1\\\\1&3\\end{bmatrix}", "A\\begin{bmatrix}x\\\\y\\end{bmatrix}=\\begin{bmatrix}3\\\\5\\end{bmatrix}"], expect: { kind: "GaussSystem" } },
    ],
  },
  {
    id: "linearAlgebra",
    unsupported: ["matrixBeyond3", "transpose"],
    samples: [
      { id: "matrix2", items: ["A=\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}", "\\det(A)"], expect: { kind: "Matrix2", value: -2 } },
      { id: "matrix3", items: ["B=\\begin{bmatrix}2&0&0\\\\0&3&0\\\\0&0&4\\end{bmatrix}"], expect: { kind: "Matrix3" } },
    ],
  },
];

/** The starter line of an untouched page (it has this id); adding a sample replaces it instead of keeping it next to the sample. */
export const STARTER_ID = "starter";
export const STARTER_LATEX = "y=a\\sin(x)";
