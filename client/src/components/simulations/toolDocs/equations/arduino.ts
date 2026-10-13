import type { ToolEquationsFile } from "../types";

export default {
  studio: [
    "V_{step} = \\frac{V_{ref}}{1024}, \\qquad \\text{ADC} = \\left\\lfloor \\frac{V_{in}}{V_{ref}} \\cdot 1024 \\right\\rfloor \\le 1023",
    "\\text{ADC}_{sim} = \\left\\lfloor \\frac{V_{in}}{V_{ref}} \\cdot 1023 \\right\\rfloor, \\qquad \\hat{V}_{in} = \\text{ADC} \\cdot \\frac{V_{ref}}{1023}",
    "f_{PWM}^{fast} = \\frac{f_{clk}}{N \\cdot 256}, \\qquad D_{fast} = \\frac{\\texttt{OCRnx} + 1}{256}",
    "f_{PWM}^{pc} = \\frac{f_{clk}}{N \\cdot 510}, \\qquad D_{pc} = \\frac{\\texttt{OCRnx}}{255}",
    "\\overline{V}_{pin} = V_{cc} \\cdot D \\approx V_{cc} \\cdot \\frac{\\texttt{OCRnx}}{255}, \\qquad N \\in \\{1, 8, 64, 256, 1024\\}",
    "\\text{UBRR} = \\frac{f_{osc}}{16 \\cdot \\text{Baud}} - 1",
    "\\text{Baud}_{real} = \\frac{f_{osc}}{16\\,(\\text{UBRR} + 1)}, \\qquad e = \\frac{\\text{Baud}_{real} - \\text{Baud}}{\\text{Baud}} \\cdot 100\\%",
    "V_{LM35} = 10\\text{ mV}/{}^\\circ\\text{C} \\cdot T, \\qquad R_{LDR} = 10\\text{ k}\\Omega \\cdot \\left(\\frac{10}{E_{lux}}\\right)^{0.7}, \\qquad d = \\frac{t_{echo}}{58.2\\text{ }\\mu\\text{s/cm}}",
    "t_{clk} = \\frac{1}{f_{clk}} = 62.5\\text{ ns}, \\qquad t_{ISR,min} \\approx 4\\,t_{clk} = 0.25\\text{ }\\mu\\text{s}",
  ],
} satisfies ToolEquationsFile;
