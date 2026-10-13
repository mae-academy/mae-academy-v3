import type { ToolEquationsFile } from "../types";

export default {
  "ladder-s7-200": [
    "T_{scan} = t_{in} + t_{prog} + t_{out} + t_{hk}",
    "t_{resp,\\max} \\approx 2\\,T_{scan}",
    "\\texttt{Q0.0} = \\left(\\texttt{I0.0} + \\texttt{Q0.0}\\right)\\cdot\\overline{\\texttt{I0.1}}",
    "Q^{+} = \\begin{cases} 1 & S = 1 \\\\ 0 & R = 1 \\\\ Q & S = R = 0 \\end{cases}",
    "T_{d} = PT \\times \\mathrm{Base}, \\qquad \\mathrm{Base} \\in \\{1,\\ 10,\\ 100\\}\\ \\mathrm{ms}",
    "Q_{T} = IN \\cdot \\left[\\, ET \\ge PT \\,\\right], \\qquad ET^{+} = \\min\\left(ET + 1,\\ 32767\\right)",
    "CV^{+} = \\min\\left(CV + CU \\cdot \\overline{CU_{prev}},\\ 32767\\right), \\qquad Q_{C} = \\left[\\, CV \\ge PV \\,\\right]",
    "EU = IN \\cdot \\overline{IN_{prev}}, \\qquad ED = \\overline{IN} \\cdot IN_{prev}",
  ],
  logo: [
    "N_{ms} = N \\cdot \\Delta_{base}, \\qquad \\Delta_{base} \\in \\{10\\ \\mathrm{ms},\\ 1\\ \\mathrm{s},\\ 1\\ \\mathrm{min}\\}",
    "Q_{on} = Trg \\cdot \\left[\\, t_{a} \\ge T \\,\\right]",
    "Q^{+} = \\overline{R}\\cdot\\left(S + Q\\right)",
    "x_{V} = 100\\,\\frac{\\mathrm{units}}{\\mathrm{V}} \\cdot V_{in}, \\qquad 0 \\le V_{in} \\le 10\\ \\mathrm{V}",
    "x_{mA} = \\frac{1000}{16}\\left(I_{in} - 4\\right), \\qquad 4 \\le I_{in} \\le 20\\ \\mathrm{mA}",
    "\\mathrm{Output} = \\left(\\mathrm{Input} \\times \\mathrm{Gain}\\right) + \\mathrm{Offset}",
    "Q_{thr}^{+} = \\begin{cases} 1 & x \\ge x_{on} \\\\ 0 & x \\le x_{off} \\\\ Q_{thr} & x_{off} < x < x_{on} \\end{cases}",
    "Q_{week} = \\left[\\, d \\in D \\,\\right] \\cdot \\left[\\, t_{on} \\le t < t_{off} \\,\\right]",
  ],
} satisfies ToolEquationsFile;
