import type { ToolEquationsFile } from "../types";

export default {
  "signal-operations-and-properties": [
    "y(t) = x(at - b) = x\\!\\left(a\\left(t - \\frac{b}{a}\\right)\\right)",
    "x_e(t) = \\frac{x(t) + x(-t)}{2}, \\qquad x_o(t) = \\frac{x(t) - x(-t)}{2}, \\qquad x(t) = x_e(t) + x_o(t)",
    "E_\\infty = \\int_{-\\infty}^{\\infty} |x(t)|^2\\,dt",
    "P_\\infty = \\lim_{T\\to\\infty} \\frac{1}{2T}\\int_{-T}^{T} |x(t)|^2\\,dt",
    "\\int_{-\\infty}^{\\infty} x(t)\\,\\delta(t - t_0)\\,dt = x(t_0), \\qquad u(t) = \\int_{-\\infty}^{t} \\delta(\\tau)\\,d\\tau",
    "x(t) = e^{(\\sigma + j\\omega_0)t} = e^{\\sigma t}\\left[\\cos(\\omega_0 t) + j\\sin(\\omega_0 t)\\right]",
    "T_0 = \\operatorname{LCM}(T_1, T_2), \\qquad T_i = \\frac{2\\pi}{\\omega_i}, \\qquad \\omega_0 = \\frac{2\\pi}{T_0}",
  ],
  "system-classification": [
    "T\\{a\\,x_1(t) + b\\,x_2(t)\\} = a\\,T\\{x_1(t)\\} + b\\,T\\{x_2(t)\\}",
    "T\\{x(t - t_0)\\} = y(t - t_0) \\quad \\text{for every } t_0",
    "y(t_1) \\text{ depends only on } x(\\tau),\\ \\tau \\le t_1 \\iff h(t) = 0 \\ \\text{for}\\ t < 0",
    "|x(t)| \\le M_x < \\infty \\Rightarrow |y(t)| \\le M_y < \\infty \\iff \\int_{-\\infty}^{\\infty} |h(\\tau)|\\,d\\tau < \\infty",
    "y(t) = \\int_{-\\infty}^{\\infty} x(\\tau)\\,h(t - \\tau)\\,d\\tau \\quad (\\text{LTI systems only})",
    "y(t) = f\\big(x(t)\\big) \\ \\text{(memoryless)}, \\qquad y(t) = \\int_{-\\infty}^{t} x(\\tau)\\,d\\tau \\ \\text{(with memory)}",
  ],
  "convolution-engine": [
    "y(t) = (x * h)(t) = \\int_{-\\infty}^{\\infty} x(\\tau)\\,h(t - \\tau)\\,d\\tau",
    "y[n] = (x * h)[n] = \\sum_{k=-\\infty}^{\\infty} x[k]\\,h[n - k]",
    "h(t - \\tau) = h\\big(-(\\tau - t)\\big): \\quad \\text{fold } h(-\\tau) \\ \\rightarrow\\ \\text{shift by } t \\ \\rightarrow\\ \\text{multiply by } x(\\tau) \\ \\rightarrow\\ \\text{integrate}",
    "x * h = h * x, \\qquad (x * h_1) * h_2 = x * (h_1 * h_2), \\qquad x * (h_1 + h_2) = x * h_1 + x * h_2",
    "s(t) = \\int_{-\\infty}^{t} h(\\tau)\\,d\\tau = (h * u)(t), \\qquad h(t) = \\frac{ds(t)}{dt}",
    "x(t) * \\delta(t - t_0) = x(t - t_0), \\qquad L_y = L_x + L_h - 1",
    "\\sum_n y[n] = \\left(\\sum_n x[n]\\right)\\left(\\sum_n h[n]\\right)",
  ],
  "fourier-analysis": [
    "X(j\\omega) = \\int_{-\\infty}^{\\infty} x(t)\\,e^{-j\\omega t}\\,dt",
    "x(t) = \\frac{1}{2\\pi}\\int_{-\\infty}^{\\infty} X(j\\omega)\\,e^{j\\omega t}\\,d\\omega",
    "|X(j\\omega)| = \\sqrt{\\operatorname{Re}^2 + \\operatorname{Im}^2}, \\qquad \\angle X(j\\omega) = \\arctan\\!\\left(\\frac{\\operatorname{Im}\\{X\\}}{\\operatorname{Re}\\{X\\}}\\right) \\to \\operatorname{atan2}(\\operatorname{Im}, \\operatorname{Re})",
    "x(t) = \\sum_{k=-\\infty}^{\\infty} a_k\\,e^{jk\\omega_0 t}, \\qquad \\omega_0 = \\frac{2\\pi}{T}",
    "a_k = \\frac{1}{T}\\int_T x(t)\\,e^{-jk\\omega_0 t}\\,dt",
    "\\frac{1}{T}\\int_T |x(t)|^2\\,dt = \\sum_{k=-\\infty}^{\\infty} |a_k|^2",
    "x_N(t) = \\sum_{k=-N}^{N} a_k\\,e^{jk\\omega_0 t}, \\qquad X(j\\omega) = \\sum_k 2\\pi\\,a_k\\,\\delta(\\omega - k\\omega_0)",
  ],
  "laplace-s-plane": [
    "X(s) = \\int_{-\\infty}^{\\infty} x(t)\\,e^{-st}\\,dt, \\qquad s = \\sigma + j\\omega",
    "X(\\sigma + j\\omega) = \\int_{-\\infty}^{\\infty} \\left[x(t)\\,e^{-\\sigma t}\\right] e^{-j\\omega t}\\,dt \\quad \\Rightarrow \\quad X(j\\omega) = X(s)\\big|_{\\sigma = 0}",
    "H(s) = K\\,\\frac{\\prod_{i=1}^{m}(s - z_i)}{\\prod_{l=1}^{n}(s - p_l)}, \\qquad |H(s)| \\to \\infty \\ \\text{at poles}, \\quad |H(s)| = 0 \\ \\text{at zeros}",
    "\\text{causal (right-sided)}: \\quad \\operatorname{Re}\\{s\\} > \\sigma_{max} = \\max_l \\operatorname{Re}\\{p_l\\}",
    "\\text{BIBO stable} \\iff \\int_{-\\infty}^{\\infty} |h(t)|\\,dt < \\infty \\iff j\\omega\\text{-axis} \\subset \\text{ROC}",
    "x(t) = \\frac{1}{2\\pi j}\\int_{\\sigma - j\\infty}^{\\sigma + j\\infty} X(s)\\,e^{st}\\,ds",
    "e^{-at}\\sin(bt)\\,u(t) \\ \\longleftrightarrow \\ \\frac{b}{(s + a)^2 + b^2}, \\qquad \\operatorname{Re}\\{s\\} > -a",
  ],
} satisfies ToolEquationsFile;
