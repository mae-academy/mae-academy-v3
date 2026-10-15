/**
 * The Python half of the plot pipeline, as source strings executed inside the Pyodide worker.
 *
 *  - PLOT_VALIDATOR_PY: pure standard library (ast); safe to load in a core-only Pyodide. Defense in depth: the
 *    Worker, the CSP and Pyodide's in-memory filesystem are the real boundary, this refuses hostile or sloppy
 *    scripts early with a readable message.
 *  - PLOT_RUNNER_PY: needs numpy + matplotlib. Runs a validated script with a curated __builtins__ and a guarded
 *    __import__, renders the current figure at 300 DPI and returns PNG bytes plus a JSON figure summary.
 *
 * Both are String.raw so the Python backslashes survive. Keep them free of backticks and dollar-brace sequences.
 */

export const PLOT_VALIDATOR_PY = String.raw`
import ast

_ALLOWED_MODULES = (
    "numpy", "numpy.linalg", "numpy.fft", "numpy.random", "numpy.polynomial", "numpy.ma",
    "matplotlib", "matplotlib.pyplot", "matplotlib.ticker", "matplotlib.patches", "matplotlib.gridspec",
    "matplotlib.colors", "matplotlib.cm", "matplotlib.lines", "matplotlib.transforms", "matplotlib.mathtext",
    "matplotlib.patheffects", "matplotlib.path", "matplotlib.collections", "matplotlib.text",
    "scipy", "scipy.signal", "scipy.special", "scipy.integrate", "scipy.optimize", "scipy.interpolate",
    "scipy.fft", "scipy.linalg", "scipy.stats", "scipy.constants",
    "math", "cmath", "itertools", "functools", "fractions", "collections", "dataclasses", "typing", "warnings",
)
_ALLOWED_SET = frozenset(_ALLOWED_MODULES)

# "from matplotlib import rcParams" style names that are attributes rather than submodules.
_ALLOWED_FROM_ATTRS = frozenset(("rcParams", "cycler", "ticker", "pyplot", "cm", "colors", "patches", "gridspec", "lines", "transforms", "mathtext", "patheffects", "path", "collections", "text", "signal", "special", "integrate", "optimize", "interpolate", "fft", "linalg", "stats", "constants", "random", "polynomial", "ma"))

_BANNED_NAMES = frozenset((
    "open", "exec", "eval", "compile", "__import__", "input", "breakpoint", "globals", "locals", "vars",
    "getattr", "setattr", "delattr", "help", "exit", "quit", "memoryview", "dir", "license", "copyright", "credits",
))

_BANNED_ATTRS = frozenset((
    "os", "sys", "subprocess", "socket", "ctypes", "importlib", "builtins", "shutil", "pathlib", "urllib", "http",
    "requests", "micropip", "js", "pyodide", "pyodide_js", "system", "popen", "fork", "spawn", "execv", "execl",
    "f_globals", "f_locals", "f_back", "f_builtins", "gi_frame", "gi_code", "cr_frame", "tb_frame", "func_globals",
    "mro", "modules", "load_module", "ctypeslib", "f2py", "testing", "distutils", "tofile", "fromfile", "memmap",
    "savetxt", "loadtxt", "genfromtxt", "save", "savez", "savez_compressed", "load", "fromregex", "DataSource",
    "imsave", "imread", "savefig_kwargs", "print_figure", "print_png", "print_pdf", "print_svg", "read_png",
    "get_data_path", "get_configdir", "get_cachedir", "rc_file", "rc_params_from_file",
))


# Methods a plotting script may define on its own helper classes; attribute ACCESS to dunders stays forbidden.
_ALLOWED_DUNDER_METHODS = frozenset(("__init__", "__call__", "__repr__", "__str__", "__post_init__", "__len__", "__getitem__", "__iter__", "__next__", "__add__", "__sub__", "__mul__", "__truediv__"))


class PlotRejected(Exception):
    def __init__(self, message, line=None):
        Exception.__init__(self, message)
        self.message = message
        self.line = line


def module_allowed(name):
    return isinstance(name, str) and name in _ALLOWED_SET


def _reject(node, message):
    raise PlotRejected(message, getattr(node, "lineno", None))


def validate_plot_code(code):
    """Raises PlotRejected for anything outside the plotting subset. Returns the parsed tree."""
    try:
        tree = ast.parse(code, filename="<plot>")
    except SyntaxError as exc:
        raise PlotRejected("Syntax error: " + str(exc.msg), exc.lineno)
    except (ValueError, RecursionError, MemoryError):
        raise PlotRejected("The script could not be parsed.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if not module_allowed(alias.name):
                    _reject(node, 'Import of "' + alias.name + '" is not allowed in plot scripts.')
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level or not module_allowed(module):
                _reject(node, 'Import from "' + ("." * node.level + module) + '" is not allowed in plot scripts.')
            for alias in node.names:
                full = module + "." + alias.name
                if alias.name == "*":
                    _reject(node, "Star imports are not allowed in plot scripts.")
                if alias.name.startswith("_") or alias.name in _BANNED_ATTRS:
                    _reject(node, 'Importing "' + alias.name + '" is not allowed in plot scripts.')
                if module in ("matplotlib", "scipy", "numpy") and full not in _ALLOWED_SET and alias.name not in _ALLOWED_FROM_ATTRS and not alias.name[:1].isalpha():
                    _reject(node, 'Importing "' + alias.name + '" is not allowed in plot scripts.')
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in _BANNED_ATTRS:
                _reject(node, 'Access to the attribute "' + node.attr + '" is not allowed in plot scripts.')
        elif isinstance(node, ast.Name):
            if node.id in _BANNED_NAMES or (node.id.startswith("__") and node.id != "__name__"):
                _reject(node, 'Use of "' + node.id + '" is not allowed in plot scripts.')
        elif isinstance(node, ast.Constant):
            if isinstance(node.value, str) and "__" in node.value and node.value != "__main__":
                _reject(node, "Strings containing a double underscore are not allowed in plot scripts.")
        elif isinstance(node, (ast.Global, ast.Nonlocal, ast.AsyncFunctionDef, ast.Await, ast.AsyncFor, ast.AsyncWith, ast.Yield, ast.YieldFrom)):
            _reject(node, "This construct is not supported in plot scripts.")
        elif isinstance(node, ast.arg):
            if node.arg.startswith("__"):
                _reject(node, "Argument names with a double underscore are not allowed.")
        elif isinstance(node, (ast.FunctionDef, ast.ClassDef)):
            if node.name.startswith("__") and node.name not in _ALLOWED_DUNDER_METHODS:
                _reject(node, "Names with a double underscore are not allowed in plot scripts.")
        elif isinstance(node, ast.keyword):
            if node.arg and node.arg.startswith("__"):
                _reject(node, "Keyword names with a double underscore are not allowed.")
    return tree
`;

export const PLOT_RUNNER_PY = String.raw`
import builtins as _b
import io as _io
import json as _json
import math as _math
import warnings as _warnings

_SAFE_BUILTIN_NAMES = (
    "abs", "all", "any", "bool", "bytes", "callable", "chr", "complex", "dict", "divmod", "enumerate", "filter",
    "float", "format", "frozenset", "hasattr", "hash", "int", "isinstance", "issubclass", "iter", "len", "list",
    "map", "max", "min", "next", "object", "ord", "pow", "property", "range", "repr", "reversed", "round", "set",
    "slice", "sorted", "staticmethod", "classmethod", "str", "sum", "super", "tuple", "type", "zip", "bin", "hex",
    "oct", "ascii", "bytearray", "id",
    "Exception", "ValueError", "TypeError", "ArithmeticError", "ZeroDivisionError", "OverflowError", "IndexError",
    "KeyError", "RuntimeError", "AssertionError", "NotImplementedError", "StopIteration", "LookupError",
    "AttributeError", "NameError", "ImportError", "FloatingPointError", "UserWarning", "RuntimeWarning",
    "True", "False", "None", "NotImplemented", "Ellipsis",
)


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level != 0 or not module_allowed(name):
        raise ImportError('Import of "' + str(name) + '" is not allowed in plot scripts.')
    return _b.__import__(name, globals, locals, fromlist, level)


def _make_builtins():
    safe = {}
    for key in _SAFE_BUILTIN_NAMES:
        if hasattr(_b, key):
            safe[key] = getattr(_b, key)
    safe["print"] = lambda *args, **kwargs: None
    safe["__import__"] = _guarded_import
    safe["__build_class__"] = _b.__build_class__
    safe["__name__"] = "builtins"
    return safe


def _clean_error(exc, code):
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == "<plot>":
            line = tb.tb_lineno
        tb = tb.tb_next
    text = str(exc).strip().splitlines()
    detail = text[-1] if text else ""
    message = type(exc).__name__ + (": " + detail if detail else "")
    if len(message) > 400:
        message = message[:399] + "..."
    return message, line


def _line_style(line):
    style = line.get_linestyle()
    return {"-": "solid", "--": "dashed", ":": "dotted", "-.": "dashdot", "None": "none", " ": "none", "": "none"}.get(style, str(style))


def _num(value):
    value = float(value)
    return value if _math.isfinite(value) else None


def _summarize(fig, debug):
    axes = []
    for ax in fig.axes:
        lines = []
        for line in ax.get_lines():
            label = line.get_label() or ""
            entry = {
                "label": "" if label.startswith("_") else label,
                "linestyle": _line_style(line),
                "color": str(line.get_color()),
                "points": int(len(line.get_xdata())),
            }
            if debug:
                xs = [float(v) for v in list(line.get_xdata())[:6000]]
                ys = [float(v) for v in list(line.get_ydata())[:6000]]
                entry["x"] = [v if _math.isfinite(v) else None for v in xs]
                entry["y"] = [v if _math.isfinite(v) else None for v in ys]
            lines.append(entry)
        legend = ax.get_legend()
        grid_lines = ax.get_xgridlines() + ax.get_ygridlines()
        grid_on = any(g.get_visible() for g in grid_lines)
        grid_style = _line_style(grid_lines[0]) if grid_lines else ""
        pos = ax.get_position()
        axes.append({
            "title": ax.get_title(),
            "xlabel": ax.get_xlabel(),
            "ylabel": ax.get_ylabel(),
            "lines": lines,
            "legend": [t.get_text() for t in legend.get_texts()] if legend else [],
            "xlim": [_num(v) for v in ax.get_xlim()],
            "ylim": [_num(v) for v in ax.get_ylim()],
            "grid": bool(grid_on),
            "gridLinestyle": grid_style,
            "position": [float(pos.x0), float(pos.y0), float(pos.width), float(pos.height)],
            "titleSize": float(ax.title.get_fontsize()),
            "labelSize": float(ax.xaxis.label.get_fontsize()),
        })
    suptitle = fig._suptitle.get_text() if getattr(fig, "_suptitle", None) is not None else ""
    size = fig.get_size_inches()
    return {"axes": axes, "suptitle": suptitle, "figsize": [float(size[0]), float(size[1])]}


def warmup():
    """Imports matplotlib and renders a tiny mathtext figure once, so the font cache and first-draw cost are paid while loading, not inside the script's time limit."""
    import io
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    matplotlib.rcParams["mathtext.fontset"] = MATHTEXT_FONTSET
    fig = plt.figure(figsize=(2, 1))
    fig.text(0.5, 0.5, r"$\zeta\omega_n \frac{a}{b}$")
    fig.savefig(io.BytesIO(), format="png", dpi=50)
    plt.close("all")


LAST_PNG = b""


def run_plot(code, debug=False, dpi=300, max_inches=20, max_png=8388608):
    """Validate and run a plot script. Returns a dict (JSON-friendly except png)."""
    import numpy as np
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.figure as _mfig

    try:
        tree = validate_plot_code(code)
    except PlotRejected as exc:
        return {"ok": False, "kind": "rejected", "message": exc.message, "line": exc.line}

    plt.close("all")
    matplotlib.rcdefaults()
    matplotlib.rcParams.update({
        "figure.facecolor": "white", "axes.facecolor": "white", "savefig.facecolor": "white",
        "mathtext.fontset": MATHTEXT_FONTSET, "font.size": 11, "figure.dpi": 100,
    })

    real_savefig = _mfig.Figure.savefig
    real_show = plt.show
    _mfig.Figure.savefig = lambda self, *a, **k: None
    plt.show = lambda *a, **k: None
    namespace = {"__builtins__": _make_builtins(), "__name__": "__main__"}
    recorded = []
    old_err = np.seterr(all="warn")
    try:
        with _warnings.catch_warnings(record=True) as caught:
            _warnings.simplefilter("always")
            try:
                exec(compile(tree, "<plot>", "exec"), namespace)
            except PlotRejected:
                raise
            except BaseException as exc:
                message, line = _clean_error(exc, code)
                kind = "limit" if isinstance(exc, MemoryError) else "python"
                return {"ok": False, "kind": kind, "message": message, "line": line}
            finally:
                _mfig.Figure.savefig = real_savefig
                plt.show = real_show

            if not plt.get_fignums():
                return {"ok": False, "kind": "python", "message": "The script did not create a figure (use plt.figure() or plt.subplots() and plot something).", "line": None}
            fig = plt.gcf()
            width, height = fig.get_size_inches()
            if width > max_inches or height > max_inches:
                plt.close("all")
                return {"ok": False, "kind": "limit", "message": "The figure is too large (%.1f x %.1f in; the limit is %d x %d in)." % (width, height, max_inches, max_inches), "line": None}
            buf = _io.BytesIO()
            try:
                fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor="white")
            except BaseException as exc:
                message, line = _clean_error(exc, code)
                return {"ok": False, "kind": "python", "message": message, "line": line}
            recorded = list(caught)
    finally:
        np.seterr(**old_err)

    data = buf.getvalue()
    if len(data) > max_png:
        plt.close("all")
        return {"ok": False, "kind": "limit", "message": "The rendered image is too large (%.1f MB; the limit is %d MB)." % (len(data) / 1048576.0, max_png // 1048576), "line": None}
    summary = _summarize(fig, debug)
    # WebAssembly has no floating-point exception flags, so NumPy never warns about divide-by-zero here:
    # report NaN/inf in the plotted data instead, which is what a 0/0 or 1/0 leaves behind.
    extra = []
    for ax in fig.axes:
        for line in ax.get_lines():
            bad = 0
            for column in (line.get_xdata(), line.get_ydata()):
                try:
                    bad += int(np.count_nonzero(~np.isfinite(np.asarray(column, dtype=float))))
                except (TypeError, ValueError):
                    pass
            if bad:
                name = line.get_label() or ""
                extra.append("NonFiniteData: %d NaN/inf value(s) in a plotted line%s" % (bad, "" if name.startswith("_") or not name else " (" + name + ")"))
    plt.close("all")
    messages = list(extra)
    for item in recorded:
        text = str(item.message).strip().splitlines()
        text = text[0] if text else ""
        entry = item.category.__name__ + ": " + text
        if item.filename == "<plot>" and item.lineno:
            entry += " (line %d)" % item.lineno
        if entry not in messages:
            messages.append(entry)
    global LAST_PNG
    LAST_PNG = data
    return {"ok": True, "size": len(data), "summary": _json.dumps(summary), "warnings": messages[:20]}
`;

/** Matplotlib's mathtext font set. Computer Modern matches the KaTeX look used elsewhere in the app. */
export const PLOT_MATHTEXT_FONTSET = "cm";

export function plotRunnerSource(): string {
  return `MATHTEXT_FONTSET = ${JSON.stringify(PLOT_MATHTEXT_FONTSET)}\n${PLOT_RUNNER_PY}`;
}
