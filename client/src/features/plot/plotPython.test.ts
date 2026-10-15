// @vitest-environment node
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { PLOT_VALIDATOR_PY } from "./plotPython";

/** The AST validator is stdlib-only Python, so it runs offline on the core Pyodide that ships in node_modules. */
let py: PyodideInterface;

beforeAll(async () => {
  // Vitest rewrites the package location, so the core files are pointed at explicitly.
  const indexURL = dirname(createRequire(import.meta.url).resolve("pyodide/package.json")) + "/";
  py = await loadPyodide({ indexURL });
  py.runPython(PLOT_VALIDATOR_PY);
}, 120_000);

/** null = accepted, otherwise [message, line]. */
function verdict(code: string): [string, number | null] | null {
  py.globals.set("_code", code);
  const result = py.runPython(`
try:
    validate_plot_code(_code)
    _v = None
except PlotRejected as e:
    _v = [e.message, e.line]
_v
`) as { toJs(): [string, number | null]; destroy(): void } | undefined;
  if (!result) return null;
  const out = result.toJs();
  result.destroy();
  return out;
}

const GOOD = `import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
from math import pi

class Curve:
    def __init__(self, n):
        self.t = np.linspace(0, 1, n)

if __name__ == "__main__":
    c = Curve(100)
    fig, ax = plt.subplots(figsize=(8, 4.5), constrained_layout=True)
    ax.plot(c.t, np.sin(2 * pi * c.t), linestyle='--', label=r'$\\sin(2\\pi t)$')
    ax.grid(True, linestyle='--', alpha=0.6)
    ax.legend()
    plt.show()
`;

describe("plot AST validator", () => {
  it("accepts an ordinary plotting script", () => {
    expect(verdict(GOOD)).toBeNull();
  });

  it("accepts the allowed import forms", () => {
    for (const line of [
      "import numpy as np",
      "import matplotlib.pyplot as plt",
      "from matplotlib import pyplot as plt",
      "from matplotlib.ticker import MultipleLocator",
      "from matplotlib import rcParams",
      "import scipy.signal as sig",
      "from scipy import signal, special",
      "from scipy.special import erf",
      "import math, cmath, itertools, functools, fractions, collections, dataclasses, typing, warnings",
      "from numpy.fft import fft",
    ]) {
      expect(verdict(line), line).toBeNull();
    }
  });

  const hostile: Array<[string, string, RegExp]> = [
    ["import os", "import os\nos.system('ls')", /"os" is not allowed/],
    ["import sys", "import sys", /"sys"/],
    ["from os import path", "from os import path", /"os"/],
    ["import js", "import js\njs.fetch('https://evil.example')", /"js"/],
    ["from js import fetch", "from js import fetch", /"js"/],
    ["import pyodide", "import pyodide", /"pyodide"/],
    ["import subprocess", "import subprocess", /"subprocess"/],
    ["import ctypes", "import ctypes", /"ctypes"/],
    ["import importlib", "import importlib", /"importlib"/],
    ["import builtins", "import builtins", /"builtins"/],
    ["import micropip", "import micropip", /"micropip"/],
    ["import pathlib / urllib / socket / shutil", "import pathlib", /"pathlib"/],
    ["import urllib.request", "import urllib.request", /"urllib.request"/],
    ["import numpy.f2py", "import numpy.f2py", /"numpy.f2py"/],
    ["import pandas (not available)", "import pandas as pd", /"pandas"/],
    ["relative import", "from . import x", /not allowed/],
    ["star import", "from numpy import *", /Star imports/],
    ["__import__ call", "__import__('os').system('ls')", /not allowed/],
    ["dunder chain to subclasses", "x = ().__class__.__bases__[0].__subclasses__()", /__subclasses__|__class__/],
    ["__globals__", "def f(): pass\nf.__globals__", /__globals__/],
    ["__builtins__ name", "__builtins__['eval']('1')", /__builtins__/],
    ["__dict__ via numpy", "import numpy as np\nnp.__dict__", /__dict__/],
    ["open file", "open('/etc/passwd').read()", /"open"/],
    ["exec string", "exec('import os')", /"exec"/],
    ["eval string", "eval('1+1')", /"eval"/],
    ["compile", "compile('1', 'x', 'eval')", /"compile"/],
    ["getattr obfuscation", "import matplotlib.pyplot as plt\ngetattr(plt, 'sav' + 'efig')('x.png')", /"getattr"/],
    ["setattr", "setattr(object, 'x', 1)", /"setattr"/],
    ["globals()", "globals()['x'] = 1", /"globals"/],
    ["vars()", "vars()", /"vars"/],
    ["input()", "input('x')", /"input"/],
    ["breakpoint()", "breakpoint()", /"breakpoint"/],
    ["exit()", "exit()", /"exit"/],
    ["str.format dunder probe", "'{0.__class__}'.format(1)", /double underscore/],
    ["attribute os on a module", "import numpy as np\nnp.os.system('ls')", /"os"|"system"/],
    ["np.load reading files", "import numpy as np\nnp.load('x.npy')", /"load"/],
    ["np.save writing files", "import numpy as np\nnp.save('x.npy', [1])", /"save"/],
    ["np.fromfile", "import numpy as np\nnp.fromfile('x')", /"fromfile"/],
    ["frame escape", "def g():\n    yield 1\nx = g().gi_frame.f_globals", /not supported|gi_frame|f_globals/],
    ["global statement", "x = 1\ndef f():\n    global x\n    x = 2", /not supported/],
    ["dunder function name", "def __init_subclass__(): pass", /double underscore/],
    ["dunder import alias", "from numpy import __version__", /__version__/],
  ];

  for (const [name, code, message] of hostile) {
    it(`rejects: ${name}`, () => {
      const result = verdict(code);
      expect(result, `expected ${name} to be refused`).not.toBeNull();
      expect(result![0]).toMatch(message);
    });
  }

  it("reports the line of the offending statement", () => {
    expect(verdict("import numpy as np\n\nx = 1\nimport os\n")).toEqual(['Import of "os" is not allowed in plot scripts.', 4]);
  });

  it("reports syntax errors as refusals with a line", () => {
    const result = verdict("import numpy as np\nplt.plot(1,\n");
    expect(result![0]).toMatch(/Syntax error/);
    expect(result![1]).toBeGreaterThan(0);
  });
});
