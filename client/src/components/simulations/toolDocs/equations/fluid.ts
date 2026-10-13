import type { ToolEquationsFile } from "../types";

export default {
  pneumatics: [
    "PV = m R_s T,\\qquad R_s = 287\\text{ J/(kg}\\cdot\\text{K)}",
    "F_{ext} = P\\,A_{piston} - F_{spring}",
    "F_{ext} = P\\,\\frac{\\pi D^2}{4}",
    "F_{ret} = P\\,\\frac{\\pi\\left(D^2 - d^2\\right)}{4}",
    "Q_{FAD} = V_{cyl}\\,\\frac{P_{gauge} + P_{atm}}{P_{atm}}\\,n_{cycles}",
    "v = \\frac{Q}{A}",
    "P_1 A_1 - P_2 A_2 = F_{load}",
    "\\frac{P_2}{P_1} \\le \\left(\\frac{2}{\\gamma + 1}\\right)^{\\frac{\\gamma}{\\gamma - 1}} \\approx 0.528",
  ],
  hydraulics: [
    "P = \\frac{F_1}{A_1} = \\frac{F_2}{A_2} \\;\\Rightarrow\\; F_2 = F_1\\,\\frac{A_2}{A_1}",
    "Q = A_1 v_1 = A_2 v_2",
    "Q = V_d\\,n\\,\\eta_{vol}",
    "P_{hyd} = P\\,Q",
    "P_{mech} = \\frac{P\\,Q}{\\eta_{total}}",
    "Re = \\frac{\\rho\\,v\\,D}{\\mu}",
    "\\Delta P = f\\,\\frac{L}{D}\\,\\frac{\\rho v^2}{2},\\qquad f = \\frac{64}{Re}",
    "Q_{rv} = C_d\\,A_{rv}\\sqrt{\\frac{2\\left(P - P_{set}\\right)}{\\rho}}",
  ],
} satisfies ToolEquationsFile;
