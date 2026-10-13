import type { ToolEquationsFile } from "../types";

/** Display equations (language-neutral LaTeX) for the power-electronics studio, paired by index with each tool's `equations` captions. */
export default {
  "rectifier": [
    "V_{dc} = \\frac{2 V_m}{\\pi}\\cos\\alpha",
    "V_{rms} = \\frac{V_m}{\\sqrt{2}}",
    "FF = \\frac{V_{rms}}{V_{dc}}",
    "RF = \\sqrt{\\left(\\frac{V_{rms}}{V_{dc}}\\right)^2 - 1}",
    "V_{dc} = \\frac{V_m}{\\pi}\\left(1 + \\cos\\alpha\\right)",
    "V_{dc} = \\frac{3\\sqrt{3}\\,V_{m}}{\\pi}\\cos\\alpha",
    "\\cos\\alpha - \\cos(\\alpha + \\mu) = \\frac{2\\,\\omega L_s I_d}{V_m}",
    "\\Delta V_{dc} = \\frac{2\\,\\omega L_s}{\\pi}\\, I_d",
  ],
  "inverter": [
    "m_a = \\frac{V_{control}}{V_{tri}}",
    "m_f = \\frac{f_s}{f_1}",
    "V_{1,rms} = \\frac{m_a V_{dc}}{\\sqrt{2}}",
    "THD = \\frac{\\sqrt{\\sum_{n=2}^{\\infty} V_n^2}}{V_1}\\times 100\\%",
    "V_{1,rms} = \\frac{4 V_{dc}}{\\pi\\sqrt{2}} \\approx 0.9\\,V_{dc}",
    "V_{LL,1,rms} = \\frac{\\sqrt{6}}{\\pi} V_{dc} \\approx 0.78\\,V_{dc}",
    "t_d \\ge t_{off,max} - t_{on,min}",
    "\\left|\\Delta V_{pole}\\right| \\approx V_{dc}\\, t_d\\, f_s",
  ],
  "acvc": [
    "V_{rms} = V_s\\sqrt{\\frac{1}{\\pi}\\left(\\pi - \\alpha + \\frac{\\sin 2\\alpha}{2}\\right)}",
    "PF = \\sqrt{\\frac{1}{\\pi}\\left(\\pi - \\alpha + \\frac{\\sin 2\\alpha}{2}\\right)}",
    "V_{rms} = V_s\\sqrt{k}, \\qquad k = \\frac{n_{ON}}{n_{ON} + m_{OFF}}",
    "\\sin(\\beta - \\varphi) = \\sin(\\alpha - \\varphi)\\, e^{-(\\beta - \\alpha)/\\tan\\varphi}",
    "b_1 = \\frac{V_m}{\\pi R}\\left(\\pi - \\alpha + \\frac{\\sin 2\\alpha}{2}\\right), \\qquad a_1 = -\\frac{V_m}{\\pi R}\\sin^2\\alpha",
    "P = \\frac{V_{rms}^2}{R}, \\qquad S = V_s I_{rms}",
  ],
  "chopper": [
    "\\frac{V_o}{V_{in}} = D",
    "\\Delta I_L = \\frac{(V_{in} - V_o)\\,D}{f_s L}",
    "L_{crit} = \\frac{(1 - D)\\,R}{2 f_s}",
    "\\frac{V_o}{V_{in}} = \\frac{1}{1 - D}",
    "\\Delta V_o = \\frac{I_o D}{f_s C}",
    "\\frac{V_o}{V_{in}} = -\\frac{D}{1 - D}",
    "L_{crit,boost} = \\frac{D(1-D)^2 R}{2 f_s}, \\qquad L_{crit,bb} = \\frac{(1-D)^2 R}{2 f_s}",
    "\\frac{V_o}{V_{in}} = \\frac{2}{1 + \\sqrt{1 + 4K/D^2}}, \\qquad K = \\frac{2 L f_s}{R}",
  ],
} satisfies ToolEquationsFile;
