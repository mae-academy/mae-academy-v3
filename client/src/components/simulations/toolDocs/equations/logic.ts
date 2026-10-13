import type { ToolEquationsFile } from "../types";

export default {
  "schematic": [
    "Y_{AND}=A\\cdot B,\\quad Y_{OR}=A+B,\\quad Y_{NOT}=\\overline A,\\quad Y_{XOR}=A\\oplus B=A\\overline B+\\overline A B",
    "\\overline{A\\cdot B}=\\overline A+\\overline B",
    "\\overline{A+B}=\\overline A\\cdot\\overline B",
    "Y_{MUX2}=\\overline S\\,I_0+S\\,I_1",
    "Y_{MUX4}=\\overline{S_1}\\,\\overline{S_0}\\,I_0+\\overline{S_1}\\,S_0\\,I_1+S_1\\,\\overline{S_0}\\,I_2+S_1\\,S_0\\,I_3",
    "Y_i=EN\\cdot m_i(S_{n-1},\\dots,S_0),\\qquad i=0,1,\\dots,2^n-1",
    "Q_{next}=D",
    "Q_{next}=J\\overline Q+\\overline K Q",
    "Q_{next}=S+\\overline R\\,Q\\;\\;(S\\cdot R=0),\\qquad Q_{next}=T\\oplus Q=T\\overline Q+\\overline T Q"
  ],
  "analyzer": [
    "A+0=A,\\quad A\\cdot 1=A,\\quad A+\\overline A=1,\\quad A\\cdot\\overline A=0",
    "A+A=A,\\quad A\\cdot A=A,\\quad A+AB=A,\\quad A+\\overline A B=A+B",
    "\\overline{A\\cdot B}=\\overline A+\\overline B,\\qquad \\overline{A+B}=\\overline A\\cdot\\overline B",
    "N_{rows}=2^n,\\qquad i=\\sum_{j=0}^{n-1} b_j\\,2^{j}",
    "F=\\sum m(i_1,i_2,\\dots)=\\sum_{i:\\,F_i=1} m_i",
    "F=\\prod M(j_1,j_2,\\dots)=\\prod_{j:\\,F_j=0} M_j,\\qquad M_j=\\overline{m_j}",
    "F=\\overline A\\,F\\big|_{A=0}+A\\,F\\big|_{A=1}"
  ],
  "kmap": [
    "N_{cells}=2^n,\\qquad n\\in\\{2,3,4\\}",
    "g_k=b_k\\oplus b_{k+1}\\quad(\\text{Gray code: adjacent cells differ in one bit})",
    "AB+A\\overline B=A\\,(B+\\overline B)=A",
    "\\text{group of }2^k\\text{ cells}\\;\\Rightarrow\\;n-k\\text{ literals}",
    "F=\\sum m(\\dots)+d(\\dots)\\;\\Rightarrow\\;F_{min}=\\sum_{p\\in\\text{prime implicants}} p",
    "m_0+m_2+m_8+m_{10}=\\overline B\\,\\overline D"
  ],
  "synthesis": [
    "\\overline A=\\overline{A\\cdot A},\\qquad A\\cdot B=\\overline{\\overline{A\\cdot B}\\cdot\\overline{A\\cdot B}},\\qquad A+B=\\overline{\\overline A\\cdot\\overline B}",
    "\\overline A=\\overline{A+A},\\qquad A+B=\\overline{\\overline{A+B}+\\overline{A+B}},\\qquad A\\cdot B=\\overline{\\overline A+\\overline B}",
    "F=P_1+P_2+\\dots+P_k=\\overline{\\overline{P_1}\\cdot\\overline{P_2}\\cdots\\overline{P_k}}",
    "F=S_1\\cdot S_2\\cdots S_k=\\overline{\\overline{S_1}+\\overline{S_2}+\\dots+\\overline{S_k}}",
    "G_{NAND}=k+1\\;\\;(\\text{two-level SOP with }k\\text{ multi-literal products})"
  ],
  "timing": [
    "Y(t)=f\\big(A(t),B(t)\\big)=A(t)\\oplus B(t)",
    "Q(t_k^{+})=D(t_k^{-}),\\qquad t_k:\\text{ rising clock edges}",
    "T_{clk}\\ge t_{cq}+t_{pd,max}+t_{su}",
    "t_{cq}+t_{pd,min}\\ge t_h",
    "t_{slack}=T_{clk}-\\big(t_{cq}+t_{pd}+t_{su}\\big),\\qquad f_{max}=\\frac{1}{T_{min}}"
  ],
  "state-machine": [
    "\\text{Moore: }Q^{+}=\\delta(Q,X),\\;\\;Z=\\lambda(Q)",
    "\\text{Mealy: }Q^{+}=\\delta(Q,X),\\;\\;Z=\\lambda(Q,X)",
    "n_{FF}=\\lceil\\log_2 N_s\\rceil\\;\\;(\\text{binary}),\\qquad n_{FF}=N_s\\;\\;(\\text{one-hot})",
    "Q_{next}=D,\\qquad Q_{next}=T\\oplus Q",
    "Q_{next}=J\\overline Q+\\overline K Q,\\qquad Q_{next}=S+\\overline R\\,Q",
    "D=Q^{+},\\qquad T=Q\\oplus Q^{+}",
    "\\begin{array}{c|cc} Q\\to Q^{+} & J & K\\\\\\hline 0\\to0 & 0 & \\times\\\\ 0\\to1 & 1 & \\times\\\\ 1\\to0 & \\times & 1\\\\ 1\\to1 & \\times & 0\\end{array}"
  ]
} satisfies ToolEquationsFile;
