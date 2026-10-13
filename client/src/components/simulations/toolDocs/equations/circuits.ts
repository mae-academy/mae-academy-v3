import type { ToolEquationsFile } from "../types";

export default {
  workspace: [
    "\\sum_{k\\in\\text{node}} I_k = 0 \\qquad \\sum_{k\\in\\text{loop}} V_k = 0",
    "\\begin{bmatrix}\\mathbf G&\\mathbf B\\\\\\mathbf C&\\mathbf D\\end{bmatrix}\\begin{bmatrix}\\mathbf v\\\\\\mathbf j\\end{bmatrix}=\\begin{bmatrix}\\mathbf i\\\\\\mathbf e\\end{bmatrix}",
    "G_{ii}=\\sum_{k\\sim i}\\frac{1}{R_k},\\qquad G_{ij}=-\\sum_{k\\,\\text{between}\\,i,j}\\frac{1}{R_k}",
    "\\mathbf Z = R + j\\left(\\omega L - \\frac{1}{\\omega C}\\right),\\qquad \\omega = 2\\pi f",
    "\\hat{I} = \\frac{\\hat{V}}{\\mathbf Z},\\qquad \\mathbf Y = \\frac{1}{\\mathbf Z} = G + jB",
    "V_{th} = V_{oc},\\qquad R_{th} = \\frac{V_{oc}}{I_{sc}},\\qquad P_{L,\\max} = \\frac{V_{th}^2}{4R_{th}}",
    "v_C(t) = V_\\infty + (v_0 - V_\\infty)\\,e^{-t/\\tau},\\qquad \\tau = RC",
    "i_L(t) = \\frac{V}{R}\\left(1 - e^{-t/\\tau}\\right),\\qquad \\tau = \\frac{L}{R}",
    "g_C = \\frac{C}{\\Delta t},\\qquad I_{eq} = g_C\\, v_C[n-1]",
  ],
} satisfies ToolEquationsFile;
