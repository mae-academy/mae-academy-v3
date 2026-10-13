import type { ToolEquationsFile } from "../types";

export default {
  "masm8086": [
    "AL' = AL \\mathbin{|} 2^{n} \\qquad (\\texttt{OR AL, mask})",
    "AL' = AL \\mathbin{\\&} \\sim 2^{n} \\qquad (\\texttt{AND AL, notmask})",
    "AL' = AL \\oplus 2^{n} \\qquad (\\texttt{XOR AL, mask})",
    "ZF = \\begin{cases} 1 & AL \\mathbin{\\&} 2^{n} = 0 \\\\ 0 & \\text{otherwise} \\end{cases} \\qquad (\\texttt{TEST AL, mask})",
    "b_n = (AL \\gg n) \\mathbin{\\&} 1, \\qquad CF = b_{n-1} \\text{ after } \\texttt{SHR AL, CL} \\text{ with } CL = n",
    "PA = 16 \\cdot \\texttt{SEG} + \\texttt{OFF}",
    "\\texttt{SP}' = \\texttt{SP} - 2 \\;\\;(\\texttt{PUSH}), \\qquad \\texttt{SP}' = \\texttt{SP} + 2 \\;\\;(\\texttt{POP})",
  ],
  "python": [
    "x' = x \\mathbin{|} (1 \\ll n)",
    "x' = x \\mathbin{\\&} \\sim(1 \\ll n)",
    "x' = x \\oplus (1 \\ll n)",
    "b_n = (x \\gg n) \\mathbin{\\&} 1",
    "\\sim x = -x - 1, \\qquad x_w = x \\mathbin{\\&} (2^{w} - 1)",
    "x = \\sum_{i=0}^{w-1} b_i \\, 2^{i}, \\qquad \\operatorname{popcount}(x) = \\sum_{i=0}^{w-1} b_i",
  ],
  "cpp": [
    "\\texttt{REG}' = \\texttt{REG} \\mathbin{|} (1 \\ll n)",
    "\\texttt{REG}' = \\texttt{REG} \\mathbin{\\&} \\sim(1 \\ll n)",
    "\\texttt{REG}' = \\texttt{REG} \\oplus (1 \\ll n)",
    "b_n = (\\texttt{REG} \\gg n) \\mathbin{\\&} 1",
    "M = \\sum_{i \\in S} 2^{i}, \\qquad \\operatorname{popcount}(M) = \\vert S \\vert",
    "S_{RAM} = S_{\\texttt{.data}} + S_{\\texttt{.bss}} + S_{heap} + S_{stack}",
  ],
  "c": [
    "\\texttt{REG}' = \\texttt{REG} \\mathbin{|} (1 \\ll n)",
    "\\texttt{REG}' = \\texttt{REG} \\mathbin{\\&} \\sim(1 \\ll n)",
    "\\texttt{REG}' = \\texttt{REG} \\oplus (1 \\ll n)",
    "b_n = (\\texttt{REG} \\gg n) \\mathbin{\\&} 1",
    "M_w = 2^{w} - 1, \\qquad \\texttt{REG}' = \\big(\\texttt{REG} \\mathbin{\\&} \\sim(M_w \\ll n)\\big) \\mathbin{|} \\big((v \\mathbin{\\&} M_w) \\ll n\\big)",
    "A_k = A_{base} + 4k \\qquad (32\\text{-bit registers})",
    "S_{RAM} = S_{\\texttt{.data}} + S_{\\texttt{.bss}} + S_{heap} + S_{stack}, \\qquad S_{flash} = S_{\\texttt{.text}} + S_{\\texttt{.rodata}} + S_{\\texttt{.data}}",
  ],
} satisfies ToolEquationsFile;
