import type { ToolEquationsFile } from "../types";

export default {
  "root-locus": [
    "1 + K\\,G(s)H(s) = 0,\\qquad K \\ge 0",
    "\\sum_{j=1}^{m}\\angle(s - z_j) - \\sum_{i=1}^{n}\\angle(s - p_i) = (2k+1)\\,180^\\circ,\\quad k = 0, \\pm 1, \\pm 2, \\dots",
    "\\left|K\\,G(s)H(s)\\right| = 1 \\;\\Longrightarrow\\; K = \\frac{\\prod_{i=1}^{n}\\left|s - p_i\\right|}{\\prod_{j=1}^{m}\\left|s - z_j\\right|}",
    "\\sigma_a = \\frac{\\sum_{i=1}^{n} p_i - \\sum_{j=1}^{m} z_j}{n - m}",
    "\\theta_a = \\frac{(2k+1)\\pi}{n - m},\\qquad k = 0, 1, \\dots, n - m - 1",
    "K(s) = -\\frac{1}{G(s)H(s)},\\qquad \\frac{dK}{ds} = 0 \\;\\Longleftrightarrow\\; \\frac{d}{ds}\\left[\\frac{D(s)}{N(s)}\\right] = 0",
    "s^3 + a_2 s^2 + a_1 s + K = 0 \\;\\Longrightarrow\\; K_{cr} = a_2 a_1,\\qquad \\omega_{cr} = \\sqrt{a_1}",
  ],
  pid: [
    "u(t) = K_p\\,e(t) + K_i \\int_0^t e(\\tau)\\,d\\tau + K_d \\frac{de(t)}{dt}",
    "C(s) = K_p\\left(1 + \\frac{1}{T_i s} + \\frac{T_d s}{\\frac{T_d}{N}s + 1}\\right)",
    "K_i = \\frac{K_p}{T_i},\\qquad K_d = K_p T_d,\\qquad p_f = -\\frac{N}{T_d}",
    "T(s) = \\frac{C(s)\\,G(s)}{1 + C(s)\\,G(s)}",
    "\\dot{x}_I = \\begin{cases} K_i\\,e(t) & u_{min} < v < u_{max} \\;\\text{or}\\; e\\,v < 0 \\\\ 0 & \\text{otherwise} \\end{cases},\\qquad u = \\operatorname{sat}(v)",
    "M_p = e^{-\\frac{\\pi\\zeta}{\\sqrt{1-\\zeta^2}}} \\times 100\\%",
    "t_s \\approx \\frac{4}{\\zeta\\omega_n},\\qquad t_p = \\frac{\\pi}{\\omega_n\\sqrt{1-\\zeta^2}}",
    "t_r \\approx \\frac{\\pi - \\arccos\\zeta}{\\omega_n\\sqrt{1-\\zeta^2}}",
  ],
  "frequency-response": [
    "|G(j\\omega)|_{dB} = 20\\log_{10}\\left|G(j\\omega)\\right|,\\qquad \\phi(\\omega) = \\angle G(j\\omega)",
    "G(j\\omega) = K\\prod_k G_k(j\\omega) \\;\\Longrightarrow\\; |G|_{dB} = \\sum_k |G_k|_{dB},\\quad \\angle G = \\sum_k \\angle G_k",
    "\\left|G(j\\omega_{gc})\\right| = 1\\;(0\\text{ dB})",
    "\\angle G(j\\omega_{pc}) = -180^\\circ",
    "GM = -20\\log_{10}\\left|G(j\\omega_{pc})\\right|\\ \\text{dB}",
    "PM = 180^\\circ + \\angle G(j\\omega_{gc})",
    "\\left|T(j\\omega_b)\\right| = \\frac{1}{\\sqrt{2}}\\left|T(0)\\right|,\\qquad T(s) = \\frac{G(s)}{1 + G(s)}",
  ],
  "state-space": [
    "\\dot{\\mathbf{x}} = \\mathbf{A}\\mathbf{x} + \\mathbf{B}u,\\qquad y = \\mathbf{C}\\mathbf{x} + D u",
    "\\det(s\\mathbf{I} - \\mathbf{A}) = 0,\\qquad G(s) = \\mathbf{C}(s\\mathbf{I} - \\mathbf{A})^{-1}\\mathbf{B} + D",
    "\\mathbf{\\Phi}(t) = e^{\\mathbf{A}t} = \\mathcal{L}^{-1}\\left\\{(s\\mathbf{I} - \\mathbf{A})^{-1}\\right\\}",
    "\\mathcal{C} = \\begin{bmatrix} \\mathbf{B} & \\mathbf{A}\\mathbf{B} & \\cdots & \\mathbf{A}^{n-1}\\mathbf{B} \\end{bmatrix},\\qquad \\operatorname{rank}\\mathcal{C} = n",
    "\\mathcal{O} = \\begin{bmatrix} \\mathbf{C} \\\\ \\mathbf{C}\\mathbf{A} \\\\ \\vdots \\\\ \\mathbf{C}\\mathbf{A}^{n-1} \\end{bmatrix},\\qquad \\operatorname{rank}\\mathcal{O} = n",
    "u = -\\mathbf{K}\\mathbf{x} \\;\\Longrightarrow\\; \\det\\left(s\\mathbf{I} - \\mathbf{A} + \\mathbf{B}\\mathbf{K}\\right) = \\prod_{i=1}^{n}(s - \\lambda_i^{d})",
    "\\mathbf{K} = \\begin{bmatrix} 0 & \\cdots & 0 & 1 \\end{bmatrix}\\mathcal{C}^{-1}\\,\\varphi(\\mathbf{A}),\\qquad \\varphi(s) = \\prod_{i=1}^{n}(s - \\lambda_i^{d})",
  ],
} satisfies ToolEquationsFile;
