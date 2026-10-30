"""
mpmath evaluator for the engine's core expression form (shared/mathcore/ast/expr.ts).

The real-number semantics mirror shared/mathcore/compile/compile.ts exactly; any change there must be made here too.
A domain error (complex result, pole, NaN) raises DomainError and is stored as null in the golden file.
"""
from mpmath import mp, mpf

mp.dps = 50


class DomainError(Exception):
    pass


CONSTANTS = {"Pi": lambda: +mp.pi, "ExponentialE": lambda: +mp.e}


def real(v):
    if isinstance(v, mpf):
        if mp.isnan(v) or mp.isinf(v):
            raise DomainError("non-finite")
        return v
    if hasattr(v, "imag"):
        if abs(v.imag) > mpf(10) ** (-(mp.dps - 5)) * max(1, abs(v.real)):
            raise DomainError("complex")
        return real(mpf(v.real))
    return real(mpf(v))


def literal_fraction(e):
    sign = 1
    if isinstance(e, list) and e[0] == "Negate":
        sign, e = -1, e[1]
    if isinstance(e, list) and e[0] == "Divide" and all(isinstance(t, (int, float)) and not isinstance(t, bool) for t in e[1:]):
        p, q = e[1], e[2]
        if float(p).is_integer() and float(q).is_integer() and q != 0:
            return sign * int(p), int(q)
    return None


def real_root(x, n):
    if not float(n).is_integer() or n == 0:
        return real(mp.power(x, 1 / mpf(n)))
    n = int(n)
    if x < 0:
        if n % 2:
            return -real_root(-x, n)
        raise DomainError("even root of negative")
    return mp.root(x, n)


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
    E = lambda i: ev(a[i], env)  # noqa: E731
    if h == "Add":
        return mp.fsum(ev(t, env) for t in a)
    if h == "Subtract":
        return E(0) - E(1)
    if h == "Negate":
        return -E(0)
    if h == "Multiply":
        r = mpf(1)
        for t in a:
            r *= ev(t, env)
        return r
    if h == "Divide":
        d = E(1)
        if d == 0:
            raise DomainError("division by zero")
        return E(0) / d
    if h == "Power":
        base = E(0)
        frac = literal_fraction(a[1])
        if frac and abs(frac[1]) % 2 == 1:
            p, q = frac if frac[1] > 0 else (-frac[0], -frac[1])
            if base < 0:
                mag = mp.power(-base, mpf(abs(p)) / q)
                signed = mag if p % 2 == 0 else -mag
                return 1 / signed if p < 0 else signed
            return real(mp.power(base, mpf(p) / q))
        ex = E(1)
        if base == 0 and ex < 0:
            raise DomainError("pole")
        return real(mp.power(base, ex))
    if h == "Root":
        return real_root(E(0), E(1))
    if h == "Sqrt":
        x = E(0)
        if x < 0:
            raise DomainError("sqrt of negative")
        return mp.sqrt(x)
    if h == "Abs":
        return abs(E(0))
    if h == "Exp":
        return mp.exp(E(0))
    if h in ("Ln", "Log"):
        x = E(0)
        if x <= 0:
            raise DomainError("log of non-positive")
        if h == "Ln":
            return mp.log(x)
        return mp.log(x, 10) if len(a) == 1 else mp.log(x) / mp.log(E(1))
    simple = {
        "Sin": mp.sin, "Cos": mp.cos, "Tan": mp.tan, "Sec": mp.sec, "Csc": mp.csc, "Cot": mp.cot,
        "Sinh": mp.sinh, "Cosh": mp.cosh, "Tanh": mp.tanh, "Sech": mp.sech, "Csch": mp.csch, "Coth": mp.coth,
        "Arctan": mp.atan, "Arsinh": mp.asinh, "Erf": mp.erf, "Erfc": mp.erfc,
    }
    if h in simple:
        return real(simple[h](E(0)))
    if h in ("Arcsin", "Arccos"):
        x = E(0)
        if abs(x) > 1:
            raise DomainError("outside [-1, 1]")
        return mp.asin(x) if h == "Arcsin" else mp.acos(x)
    if h == "Arcsec":
        return ev(["Arccos", ["Divide", 1, a[0]]], env)
    if h == "Arccsc":
        return ev(["Arcsin", ["Divide", 1, a[0]]], env)
    if h == "Arccot":
        x = E(0)
        return mp.pi / 2 if x == 0 else mp.atan(1 / x)
    if h == "Arcosh":
        x = E(0)
        if x < 1:
            raise DomainError("arcosh below 1")
        return mp.acosh(x)
    if h == "Artanh":
        x = E(0)
        if abs(x) >= 1:
            raise DomainError("artanh outside (-1, 1)")
        return mp.atanh(x)
    if h == "Floor":
        return mp.floor(E(0))
    if h == "Ceil":
        return mp.ceil(E(0))
    if h == "Round":
        x = E(0)
        return mp.sign(x) * mp.floor(abs(x) + mpf("0.5"))
    if h == "Sign":
        return mpf(mp.sign(E(0)))
    if h in ("Gamma", "Factorial"):
        x = E(0) + (1 if h == "Factorial" else 0)
        if x <= 0 and x == mp.floor(x):
            raise DomainError("gamma pole")
        return mp.gamma(x)
    if h == "Mod":
        x, y = E(0), E(1)
        return x - y * mp.floor(x / y)
    if h in ("Max", "Min"):
        vals = [ev(t, env) for t in a]
        return max(vals) if h == "Max" else min(vals)
    if h in ("Sum", "Product"):
        body, var, lo, hi = a
        lo_v, hi_v = int(mp.ceil(ev(lo, env))), int(mp.floor(ev(hi, env)))
        acc = mpf(0) if h == "Sum" else mpf(1)
        for k in range(lo_v, hi_v + 1):
            v = ev(body, {**env, var: mpf(k)})
            acc = acc + v if h == "Sum" else acc * v
        return acc
    if h == "Integrate":
        body, var, lo, hi = a
        return real(mp.quad(lambda s: ev(body, {**env, var: s}), [ev(lo, env), ev(hi, env)]))
    raise ValueError(f"head {h} is not supported by the oracle")


def evaluate(expr, env):
    try:
        return real(ev(expr, {k: mpf(v) for k, v in env.items()}))
    except (DomainError, ZeroDivisionError, ValueError) as err:
        if isinstance(err, ValueError) and "not supported" in str(err):
            raise
        return None
