"""
mpmath evaluator for the engine's core expression form (shared/mathcore/ast/expr.ts).

The real-number semantics mirror shared/mathcore/compile/compile.ts exactly; any change there must be made here too.
Values follow IEEE-754 extended reals, as the engine's float64 closures do in every browser:
  - x/0 is ±inf (0/0 is nan), ln 0 is −inf, 0^(negative) is +inf; infinities propagate (erf(+inf) = 1, atan(inf) = π/2).
  - Outside the real domain (sqrt of a negative, ln of a negative, asin(2), a complex power) the value is nan.
  - nan propagates through every operation, including max and min.
`evaluate` returns None when the final value is not finite (stored as null: the engine must return a non-finite value).
"""
from mpmath import mp, mpf

mp.dps = 50

NAN = mpf("nan")
# Set when a value was divided by an exact zero (or a zero was raised to a negative power). IEEE float64 then
# depends on the sign of that zero, which mpmath does not have, so such a point cannot be judged.
FLAGS = {"signed_zero": False}
INF = mpf("inf")

CONSTANTS = {"Pi": lambda: +mp.pi, "ExponentialE": lambda: +mp.e}


def isnan(v):
    return mp.isnan(v)


def finite(v):
    return not (mp.isnan(v) or mp.isinf(v))


def as_real(v):
    """mpc results with a non-negligible imaginary part are outside the real domain."""
    if isinstance(v, mpf):
        return v
    if hasattr(v, "imag"):
        if v.imag != 0 and abs(v.imag) > mpf(10) ** (-(mp.dps - 5)) * max(1, abs(v.real)):
            return NAN
        return mpf(v.real)
    return mpf(v)


def literal_integer(e):
    """An integer literal, or Negate of one (Compute Engine writes x^{-1/3} as Divide(Negate(1), 3))."""
    if isinstance(e, bool):
        return None
    if isinstance(e, (int, float)):
        return int(e) if float(e).is_integer() else None
    if isinstance(e, list) and len(e) == 2 and e[0] == "Negate":
        v = literal_integer(e[1])
        return None if v is None else -v
    return None


def literal_fraction(e):
    sign = 1
    if isinstance(e, list) and e[0] == "Negate":
        sign, e = -1, e[1]
    if isinstance(e, list) and e[0] == "Divide" and len(e) == 3:
        p, q = literal_integer(e[1]), literal_integer(e[2])
        if p is not None and q is not None and q != 0:
            return sign * p, q
    return None


def divide(a, b):
    if isnan(a) or isnan(b):
        return NAN
    if b == 0:
        FLAGS["signed_zero"] = True
        return NAN if a == 0 else (INF if a > 0 else -INF)
    if mp.isinf(a) and mp.isinf(b):
        return NAN
    return a / b


def power(base, ex):
    """Math.pow for real arguments (ECMAScript rules), at high precision."""
    if isnan(ex):
        return NAN
    if ex == 0:
        return mpf(1)
    if isnan(base):
        return NAN
    if base == 0:
        if ex > 0:
            return mpf(0)
        FLAGS["signed_zero"] = True
        return INF
    if mp.isinf(ex):
        a = abs(base)
        if a == 1:
            return NAN
        return INF if (a > 1) == (ex > 0) else mpf(0)
    if mp.isinf(base):
        if base > 0:
            return INF if ex > 0 else mpf(0)
        odd = ex == mp.floor(ex) and int(ex) % 2 != 0
        if ex > 0:
            return -INF if odd else INF
        return mpf(0)
    if base < 0 and ex != mp.floor(ex):
        return NAN
    return as_real(mp.power(base, ex))


def real_root(x, n):
    if not finite(n) or n != mp.floor(n) or n == 0:
        return power(x, divide(mpf(1), n))
    n = int(n)
    if isnan(x):
        return NAN
    if x < 0:
        return -real_root(-x, n) if n % 2 else NAN
    if mp.isinf(x):
        return INF
    return mp.root(x, n)


def safe(fn, x):
    """Calls an mpmath function; anything mpmath cannot return as a real (or raises on) is nan."""
    if isnan(x):
        return NAN
    try:
        return as_real(fn(x))
    except (ValueError, ZeroDivisionError, OverflowError):
        return NAN


def at_infinity(h, x):
    """Limits at ±inf for the functions where float64 gives a finite or infinite limit."""
    pos = x > 0
    table = {
        "Exp": INF if pos else mpf(0),
        "Arctan": mp.pi / 2 if pos else -mp.pi / 2,
        "Tanh": mpf(1) if pos else mpf(-1),
        "Erf": mpf(1) if pos else mpf(-1),
        "Erfc": mpf(0) if pos else mpf(2),
        "Sinh": INF if pos else -INF,
        "Cosh": INF,
        "Arsinh": INF if pos else -INF,
        "Abs": INF,
        "Sqrt": INF if pos else NAN,
        "Ln": INF if pos else NAN,
        "Floor": x,
        "Ceil": x,
        "Round": x,
        "Sign": mpf(1) if pos else mpf(-1),
        "Gamma": INF if pos else NAN,
        "Factorial": INF if pos else NAN,
        "Sech": mpf(0),
        "Csch": mpf(0),
        "Coth": mpf(1) if pos else mpf(-1),
        "Arcosh": INF if pos else NAN,
    }
    return table.get(h, NAN)


def gamma(x):
    if isnan(x):
        return NAN
    if x <= 0 and x == mp.floor(x):
        return NAN
    return mp.gamma(x)


UNARY = {
    "Sin": mp.sin, "Cos": mp.cos, "Tan": mp.tan,
    "Sec": lambda x: divide(mpf(1), mp.cos(x)),
    "Csc": lambda x: divide(mpf(1), mp.sin(x)),
    "Cot": lambda x: divide(mp.cos(x), mp.sin(x)),
    "Sinh": mp.sinh, "Cosh": mp.cosh, "Tanh": mp.tanh,
    "Sech": lambda x: divide(mpf(1), mp.cosh(x)),
    "Csch": lambda x: divide(mpf(1), mp.sinh(x)),
    "Coth": lambda x: divide(mpf(1), mp.tanh(x)),
    "Arctan": mp.atan, "Arsinh": mp.asinh, "Erf": mp.erf, "Erfc": mp.erfc,
    "Exp": mp.exp, "Abs": abs,
    "Sqrt": lambda x: NAN if x < 0 else mp.sqrt(x),
    "Ln": lambda x: NAN if x < 0 else (-INF if x == 0 else mp.log(x)),
    "Arcsin": lambda x: NAN if abs(x) > 1 else mp.asin(x),
    "Arccos": lambda x: NAN if abs(x) > 1 else mp.acos(x),
    "Arcosh": lambda x: NAN if x < 1 else mp.acosh(x),
    "Artanh": lambda x: NAN if abs(x) > 1 else (INF * mp.sign(x) if abs(x) == 1 else mp.atanh(x)),
    "Floor": mp.floor, "Ceil": mp.ceil,
    "Round": lambda x: mp.sign(x) * mp.floor(abs(x) + mpf("0.5")),
    "Sign": lambda x: mpf(mp.sign(x)),
    "Gamma": gamma,
    "Factorial": lambda x: gamma(x + 1),
    "Negate": lambda x: -x,
    "Not": lambda x: mpf(1) if x == 0 else mpf(0),
}


def ev(e, env):
    if isinstance(e, bool):
        raise ValueError("boolean in expression")
    if isinstance(e, (int, float)):
        return mpf(e)
    if isinstance(e, str):
        if e in CONSTANTS:
            return CONSTANTS[e]()
        if e in env:
            return env[e]
        raise KeyError(f"undefined symbol {e}")
    h, a = e[0], e[1:]

    def E(i):
        return ev(a[i], env)

    if h == "Add":
        vals = [ev(t, env) for t in a]
        r = mpf(0)
        for v in vals:
            r = r + v  # mpmath gives nan for inf + (−inf), as IEEE does
        return r
    if h == "Subtract":
        return E(0) - E(1)
    if h == "Multiply":
        r = mpf(1)
        for t in a:
            r = r * ev(t, env)
        return r
    if h == "Divide":
        return divide(E(0), E(1))
    if h == "Power":
        base = E(0)
        frac = literal_fraction(a[1])
        if frac and abs(frac[1]) % 2 == 1:
            p, q = frac if frac[1] > 0 else (-frac[0], -frac[1])
            if finite(base) and base < 0:
                mag = power(-base, mpf(abs(p)) / q)
                signed = mag if p % 2 == 0 else -mag
                return divide(mpf(1), signed) if p < 0 else signed
            return power(base, mpf(p) / q)
        if isinstance(a[1], (int, float)) and a[1] == 2:
            return base * base
        return power(base, E(1))
    if h == "Root":
        return real_root(E(0), E(1))
    if h in UNARY:
        x = E(0)
        if isnan(x):
            return NAN
        if mp.isinf(x) and h not in ("Negate", "Not"):
            return at_infinity(h, x)
        return safe(UNARY[h], x)
    if h == "Log":
        x = E(0)
        lx = safe(UNARY["Ln"], x) if finite(x) else at_infinity("Ln", x)
        if len(a) == 1:
            return divide(lx, mp.log(10)) if finite(lx) else lx
        b = E(1)
        return divide(lx, safe(UNARY["Ln"], b))
    if h == "Arcsec":
        return ev(["Arccos", ["Divide", 1, a[0]]], env)
    if h == "Arccsc":
        return ev(["Arcsin", ["Divide", 1, a[0]]], env)
    if h == "Arccot":
        x = E(0)
        if isnan(x):
            return NAN
        return mp.pi / 2 if x == 0 else mp.atan(divide(mpf(1), x))
    if h == "Mod":
        x, y = E(0), E(1)
        q = divide(x, y)
        if not finite(q) or not finite(y):
            return NAN
        return x - y * mp.floor(q)
    if h in ("Max", "Min"):
        vals = [ev(t, env) for t in a]
        if any(isnan(v) for v in vals):
            return NAN
        return max(vals) if h == "Max" else min(vals)
    if h in ("Equal", "NotEqual", "Less", "LessEqual", "Greater", "GreaterEqual"):
        vals = [ev(t, env) for t in a]
        if any(isnan(v) for v in vals):
            return NAN
        ops = {
            "Equal": lambda p, q: p == q, "NotEqual": lambda p, q: p != q, "Less": lambda p, q: p < q,
            "LessEqual": lambda p, q: p <= q, "Greater": lambda p, q: p > q, "GreaterEqual": lambda p, q: p >= q,
        }
        return mpf(1) if all(ops[h](vals[i], vals[i + 1]) for i in range(len(vals) - 1)) else mpf(0)
    if h == "When":
        c = E(1)
        return E(0) if (not isnan(c) and c != 0) else NAN
    if h in ("Sum", "Product"):
        body, var, lo, hi = a
        lo_v, hi_v = ev(lo, env), ev(hi, env)
        if not finite(lo_v) or not finite(hi_v):
            return NAN
        acc = mpf(0) if h == "Sum" else mpf(1)
        for k in range(int(mp.ceil(lo_v)), int(mp.floor(hi_v)) + 1):
            v = ev(body, {**env, var: mpf(k)})
            acc = acc + v if h == "Sum" else acc * v
        return acc
    if h == "Integrate":
        body, var, lo, hi = a
        return as_real(mp.quad(lambda s: ev(body, {**env, var: s}), [ev(lo, env), ev(hi, env)]))
    raise ValueError(f"head {h} is not supported by the oracle")


def evaluate(expr, env):
    """Value at the given point, or None when it is not a finite real number."""
    FLAGS["signed_zero"] = False
    v = ev(expr, {k: mpf(v) for k, v in env.items()})
    return v if finite(v) else None


def depends_on_signed_zero():
    """True when the last `evaluate` divided by an exact zero (see FLAGS)."""
    return FLAGS["signed_zero"]

