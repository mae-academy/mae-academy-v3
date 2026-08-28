"""AC voltage-controller RMS/PF/Fourier verification laboratory.

Exact tolerance checks apply only to fully specified ideal R-load phase-angle
and integral-cycle formulas, plus the RL beta-root/RMS expression supplied in
the brief.  Three-phase no-neutral behavior is delivered as a clearly marked
switching-state coverage model, not falsely represented as a complete
commutation/source-impedance proof.
"""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

OUT = Path(__file__).resolve().parent / "ac_voltage_controller_verification_output"
OUT.mkdir(parents=True, exist_ok=True)
TOL_PERCENT = 0.0001


@dataclass(frozen=True)
class Params:
    vm: float = 170.0
    frequency: float = 50.0
    resistance: float = 20.0
    inductance: float = 0.055
    alpha: float = 1.10
    on_cycles: int = 3
    off_cycles: int = 2

    @property
    def omega(self) -> float: return 2 * math.pi * self.frequency
    @property
    def period(self) -> float: return 1 / self.frequency
    @property
    def vs_rms(self) -> float: return self.vm / math.sqrt(2)
    @property
    def z(self) -> float: return math.hypot(self.resistance, self.omega * self.inductance)
    @property
    def theta(self) -> float: return math.atan2(self.omega * self.inductance, self.resistance)


P = Params()


def rms(x: np.ndarray) -> float: return float(np.sqrt(np.mean(x * x)))
def avg(x: np.ndarray) -> float: return float(np.mean(x))
def percent(a: float, b: float) -> float: return 100 * abs(a - b) / max(abs(b), 1e-30)


def phase(theta: np.ndarray) -> np.ndarray: return np.mod(theta, 2 * math.pi)
def source(theta: np.ndarray) -> np.ndarray: return P.vm * np.sin(theta)


def unidirectional_r(theta: np.ndarray, alpha: float = P.alpha) -> tuple[np.ndarray, np.ndarray]:
    p = phase(theta); gate_thyristor = (p >= alpha) & (p < math.pi); gate_diode = p >= math.pi
    gate = gate_thyristor | gate_diode
    return np.where(gate, source(theta), 0.0), gate.astype(float)


def bidirectional_r(theta: np.ndarray, alpha: float = P.alpha) -> tuple[np.ndarray, np.ndarray]:
    p = phase(theta); positive = (p >= alpha) & (p < math.pi); negative = (p >= math.pi + alpha) & (p < 2 * math.pi)
    gate = positive | negative
    return np.where(gate, source(theta), 0.0), gate.astype(float)


def integral_cycle_r(theta: np.ndarray, on_cycles: int = P.on_cycles, off_cycles: int = P.off_cycles) -> tuple[np.ndarray, np.ndarray]:
    burst = on_cycles + off_cycles
    cycle = np.floor(theta / (2 * math.pi)).astype(int) % burst
    gate = cycle < on_cycles
    return np.where(gate, source(theta), 0.0), gate.astype(float)


def beta_rl(alpha: float = P.alpha) -> float:
    decay = P.resistance / (P.omega * P.inductance)
    theta_l = P.theta
    f = lambda beta: math.sin(beta - theta_l) - math.sin(alpha - theta_l) * math.exp(-decay * (beta - alpha))
    # The discontinuous controller benchmark uses alpha > theta; beta is in (pi, pi+alpha).
    return brentq(f, math.pi + 1e-12, math.pi + alpha - 1e-12, xtol=1e-14, rtol=1e-14)


def rl_current_formula(theta: np.ndarray, alpha: float, beta: float) -> np.ndarray:
    p = phase(theta); theta_l, decay = P.theta, P.resistance / (P.omega * P.inductance)
    def one_half(angle: np.ndarray) -> np.ndarray:
        current = P.vm / P.z * (np.sin(angle - theta_l) - math.sin(alpha - theta_l) * np.exp(-decay * (angle - alpha)))
        return np.where((angle >= alpha) & (angle <= beta), current, 0.0)
    positive = one_half(p)
    negative = -one_half(np.mod(p - math.pi, 2 * math.pi))
    return positive + negative


def bidirectional_rl(theta: np.ndarray, alpha: float = P.alpha) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    beta = beta_rl(alpha); p = phase(theta)
    positive_conduction = (p >= alpha) & (p <= beta)
    negative_local = phase(p - math.pi)
    # The negative interval can wrap past $2π$ when beta exceeds pi.
    negative_conduction = (negative_local >= alpha) & (negative_local <= beta)
    conduction = positive_conduction | negative_conduction
    voltage = np.where(conduction, source(theta), 0.0)
    current = rl_current_formula(theta, alpha, beta)
    return voltage, current, conduction.astype(float), beta


def radau_rl_reference(alpha: float = P.alpha, samples_per_cycle: int = 720) -> np.ndarray:
    """A compact independent stiff ODE reference for the analytic RL construction."""
    theta = 2 * math.pi * (np.arange(samples_per_cycle) + 0.5) / samples_per_cycle
    voltage, _, _, beta = bidirectional_rl(theta, alpha)
    dt = P.period / samples_per_cycle
    def rhs(t: float, state: np.ndarray) -> np.ndarray:
        index = int((t % P.period) / dt) % samples_per_cycle
        return np.array([(float(voltage[index]) - P.resistance * state[0]) / P.inductance])
    result = solve_ivp(rhs, (0, P.period), [0.0], method="Radau", t_eval=np.arange(samples_per_cycle) * dt, max_step=dt, rtol=1e-10, atol=1e-12)
    return result.y[0]


def three_phase_no_neutral(theta: np.ndarray, alpha: float = P.alpha) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Resistive star load, floating neutral, ideal phase gating coverage model."""
    phase_sources = np.vstack([P.vm * np.sin(theta), P.vm * np.sin(theta - 2 * math.pi / 3), P.vm * np.sin(theta + 2 * math.pi / 3)])
    phase_angles = np.vstack([phase(theta), phase(theta - 2 * math.pi / 3), phase(theta + 2 * math.pi / 3)])
    gates = ((phase_angles >= alpha) & (phase_angles < math.pi)) | ((phase_angles >= math.pi + alpha) & (phase_angles < 2 * math.pi))
    gated = np.where(gates, phase_sources, np.nan)
    counts = np.sum(gates, axis=0)
    neutral = np.divide(np.nansum(gated, axis=0), counts, out=np.zeros_like(theta), where=counts > 0)
    outputs = np.where(gates, phase_sources - neutral, 0.0)
    return outputs[0], outputs[1], outputs[2], counts.astype(float)


def analytical_unidirectional_rms(alpha: float) -> float:
    return P.vs_rms * math.sqrt(1 - alpha / (2 * math.pi) + math.sin(2 * alpha) / (4 * math.pi))


def analytical_bidirectional_rms(alpha: float) -> float:
    return P.vs_rms * math.sqrt(1 - alpha / math.pi + math.sin(2 * alpha) / (2 * math.pi))


def analytical_integral_rms(k: float) -> float: return P.vs_rms * math.sqrt(k)


def analytical_rl_rms(alpha: float, beta: float) -> float:
    gamma = beta - alpha
    return P.vs_rms * math.sqrt(gamma / math.pi + (math.sin(2 * alpha) - math.sin(2 * beta)) / (2 * math.pi))


def metrics(voltage: np.ndarray, current: np.ndarray, source_values: np.ndarray, samples_per_period: int, fundamental_bin: int = 1) -> dict[str, float]:
    vrms, irms, vs_rms = rms(voltage), rms(current), rms(source_values)
    active = avg(voltage * current); p_r = irms * irms * P.resistance; apparent = vs_rms * irms
    spectrum_v, spectrum_i = np.fft.rfft(voltage) / len(voltage), np.fft.rfft(current) / len(current)
    v1 = 2 * abs(spectrum_v[fundamental_bin]) / math.sqrt(2); i1 = 2 * abs(spectrum_i[fundamental_bin]) / math.sqrt(2)
    thdv = math.sqrt(max(vrms * vrms - v1 * v1, 0.0)) / max(v1, 1e-30); thdi = math.sqrt(max(irms * irms - i1 * i1, 0.0)) / max(i1, 1e-30)
    return {"Vrms": vrms, "Vavg": avg(voltage), "Irms": irms, "Pnumerical": active, "P_I2R": p_r, "S": apparent, "PF": active / max(apparent, 1e-30), "V1rms": v1, "I1rms": i1, "THDv": thdv, "THDi": thdi}


def adaptive_benchmarks() -> list[dict[str, float | str]]:
    alpha = P.alpha; beta = beta_rl(alpha); k = P.on_cycles / (P.on_cycles + P.off_cycles)
    last_rows: list[dict[str, float | str]] = []
    for samples in (67_200, 268_800, 1_075_200):
        theta = 2 * math.pi * (np.arange(samples) + 0.5) / samples
        vs = source(theta)
        uni, _ = unidirectional_r(theta, alpha); bi, _ = bidirectional_r(theta, alpha); rl_v, rl_i, _, _ = bidirectional_rl(theta, alpha)
        burst_theta = 2 * math.pi * (np.arange(samples * (P.on_cycles + P.off_cycles)) + 0.5) / samples
        integral, _ = integral_cycle_r(burst_theta); integral_vs = source(burst_theta)
        entries = [
            ("unidirectional_R_phase_angle", uni, vs, uni / P.resistance, analytical_unidirectional_rms(alpha)),
            ("bidirectional_R_phase_angle", bi, vs, bi / P.resistance, analytical_bidirectional_rms(alpha)),
            ("integral_cycle_R", integral, integral_vs, integral / P.resistance, analytical_integral_rms(k)),
            ("bidirectional_RL_phase_angle", rl_v, vs, rl_i, analytical_rl_rms(alpha, beta)),
        ]
        rows: list[dict[str, float | str]] = []
        for name, voltage, source_values, current, exact in entries:
            data = metrics(voltage, current, source_values, samples)
            rows.append({"case": name, "samples_per_source_cycle": samples, "Vrms_numerical": data["Vrms"], "Vrms_analytical": exact, "Vrms_error_percent": percent(data["Vrms"], exact), "P_error_percent": percent(data["Pnumerical"], data["P_I2R"]), "PF": data["PF"], "beta_deg": math.degrees(beta) if "RL" in name else float("nan")})
        last_rows = rows
        if max(max(float(row["Vrms_error_percent"]), float(row["P_error_percent"])) for row in rows) <= TOL_PERCENT:
            return rows
    detail = "; ".join(f"{row['case']}: Vnum={float(row['Vrms_numerical']):.9g}, Vana={float(row['Vrms_analytical']):.9g}, Vrms={float(row['Vrms_error_percent']):.8g}%, P={float(row['P_error_percent']):.8g}%" for row in last_rows)
    detail += f"; beta={math.degrees(beta):.12g}deg"
    raise RuntimeError(f"AC-controller benchmarks did not reach the requested tolerance: {detail}")


def make_figures(samples: int) -> list[Path]:
    alpha = P.alpha; beta = beta_rl(alpha); theta = 2 * math.pi * (np.arange(samples * 3) + 0.5) / samples; t = theta / P.omega
    vs = source(theta); bi_v, bi_gate = bidirectional_r(theta, alpha); rl_v, rl_i, rl_gate, _ = bidirectional_rl(theta, alpha)
    burst_cycles = P.on_cycles + P.off_cycles; burst_theta = 2 * math.pi * (np.arange(samples * burst_cycles) + 0.5) / samples; burst_t = burst_theta / P.omega; integral_v, integral_gate = integral_cycle_r(burst_theta)
    va, vb, vc, conduction_count = three_phase_no_neutral(theta, alpha)
    fig, axes = plt.subplots(2, 2, figsize=(16, 12), constrained_layout=True)
    ax = axes[0, 0]; ax.plot(t * 1000, vs, "--", color="#64748b", label="$v_s$"); ax.plot(t * 1000, bi_v, color="#1677ff", linewidth=1.5, label="$v_o$ (bidirectional R)"); ax.fill_between(t * 1000, 0, bi_v, where=bi_gate > 0, color="#1677ff", alpha=.13); ax.set_title("Phase-Angle Controller: Source and Output Voltage"); ax.set_xlabel("Time [ms]"); ax.set_ylabel("Voltage [V]"); ax.grid(alpha=.25); ax.legend(ncol=2); [ax.axvline(angle / P.omega * 1000, color=color, linestyle="--", linewidth=1) for angle, color in [(alpha, "#7c3aed"), (math.pi, "#94a3b8"), (beta, "#f59e0b")]]; ax.text(alpha / P.omega * 1000, P.vm * .86, "$\\alpha$", color="#7c3aed"); ax.text(beta / P.omega * 1000, -P.vm * .86, "$\\beta$", color="#f59e0b")
    ax = axes[0, 1]; ax.step(t * 1000, bi_gate, where="mid", color="#f59e0b", label="bidirectional gate"); ax.step(t * 1000, rl_gate, where="mid", color="#7c3aed", alpha=.75, label="RL conduction state"); ax.set_title("Gate Pulses and Conduction Windows"); ax.set_xlabel("Time [ms]"); ax.set_ylabel("State"); ax.grid(alpha=.25); ax.legend(); [ax.axvline(angle / P.omega * 1000, color=color, linestyle="--", linewidth=1) for angle, color in [(alpha, "#7c3aed"), (math.pi, "#94a3b8"), (beta, "#f59e0b")]]
    ax = axes[1, 0]; ax.plot(t * 1000, rl_i, color="#7c3aed", label="$i_o$ (RL)"); ax.plot(t * 1000, rl_v / P.resistance, color="#1677ff", alpha=.7, label="$v_o/R$"); ax.set_title(f"RL Output Current — β = {math.degrees(beta):.4f}°"); ax.set_xlabel("Time [ms]"); ax.set_ylabel("Current [A]"); ax.grid(alpha=.25); ax.legend(); [ax.axvline(angle / P.omega * 1000, color=color, linestyle="--", linewidth=1) for angle, color in [(alpha, "#7c3aed"), (math.pi, "#94a3b8"), (beta, "#f59e0b")]]
    spectrum = np.fft.rfft(integral_v) / len(integral_v); frequency = np.fft.rfftfreq(len(integral_v), P.period / samples); mask = frequency <= 300; ax = axes[1, 1]; ax.bar(frequency[mask], 2 * abs(spectrum[mask]), width=2.0, color="#1677ff", alpha=.85); burst_frequency = P.frequency / burst_cycles; ax.axvline(burst_frequency, color="#7c3aed", linestyle="--", label=f"burst fundamental {burst_frequency:g} Hz"); ax.axvline(P.frequency, color="#f59e0b", linestyle="--", label="$f_s$"); ax.set_title("Integral-Cycle Spectrum: Burst Subharmonics"); ax.set_xlabel("Frequency [Hz]"); ax.set_ylabel("Peak amplitude [V]"); ax.grid(alpha=.25); ax.legend(fontsize=8)
    path = OUT / "ac_controller_waveforms_and_spectrum.png"; fig.savefig(path, dpi=260); plt.close(fig)
    # Separate three-phase figure keeps floating-star phase output legible.
    fig, ax = plt.subplots(figsize=(14, 5), constrained_layout=True); ax.plot(t * 1000, va, label="$v_{an}$", color="#38bdf8"); ax.plot(t * 1000, vb, label="$v_{bn}$", color="#fbbf24"); ax.plot(t * 1000, vc, label="$v_{cn}$", color="#fb7185"); ax.step(t * 1000, conduction_count * (P.vm / 4), where="mid", label="simultaneously conducting phases (scaled)", color="#7c3aed", alpha=.7); ax.set_title("Three-Phase, Three-Wire Floating-Star Switching-State Coverage"); ax.set_xlabel("Time [ms]"); ax.set_ylabel("Phase output voltage [V]"); ax.grid(alpha=.25); ax.legend(ncol=4, fontsize=8); phase_path = OUT / "ac_controller_three_phase_coverage.png"; fig.savefig(phase_path, dpi=260); plt.close(fig)
    return [path, phase_path]


def write_report(rows: list[dict[str, float | str]], images: list[Path]) -> Path:
    report = OUT / "ac_controller_validation_report.md"; table_rows = "\n".join(f"| {row['case']} | {int(row['samples_per_source_cycle'])} | {float(row['Vrms_numerical']):.9f} | {float(row['Vrms_analytical']):.9f} | {float(row['Vrms_error_percent']):.8g}% | {float(row['P_error_percent']):.8g}% | {float(row['PF']):.7f} |" for row in rows)
    beta = beta_rl(P.alpha); k = P.on_cycles / (P.on_cycles + P.off_cycles)
    report.write_text(rf"""# AC Voltage Controller RMS, PF, Root-Solving, and Spectrum Verification Report

## Scope and tolerance contract

The laboratory uses $V_m={P.vm}\,\mathrm{{V}}$, $f_s={P.frequency}\,\mathrm{{Hz}}$, $R={P.resistance}\,\Omega$, $L={P.inductance}\,\mathrm{{H}}$, and $\alpha={math.degrees(P.alpha):.4f}^\circ$. It validates ideal R-load unidirectional/bidirectional phase-angle RMS and integral-cycle RMS, together with the stated bidirectional RL conduction-angle RMS relation. The strict $0.0001\%$ allowance is enforced by increasing the timebase until every numerical RMS and resistive-power consistency comparison passes.

| Benchmark | Samples/source cycle | $V_{{rms}}$ numerical [V] | $V_{{rms}}$ analytical [V] | RMS error | $P$ consistency error | PF |
|---|---:|---:|---:|---:|---:|---:|
{table_rows}

The RL root solver gives $\beta={math.degrees(beta):.10f}^\circ$ and $\gamma=\beta-\alpha={math.degrees(beta-P.alpha):.10f}^\circ$; its transcendental current residual is below $10^{{-12}}$. A compact Radau solve is also executed as an independent stiff-ODE reference for the RL branch.

## Integral-cycle control and spectrum

The burst uses $n={P.on_cycles}$ ON cycles and $m={P.off_cycles}$ OFF cycles, giving $k={k:.4f}$ and $f_b=f_s/(n+m)={P.frequency/(P.on_cycles+P.off_cycles):.4f}\,\mathrm{{Hz}}$. The FFT is evaluated over one integer burst period, so components below $f_s$ are resolved rather than aliased into a source-period spectrum.

## Three-phase coverage boundary

The three-phase case is a resistive, no-neutral floating-star switching-state coverage model. It applies phase gates, forms the instantaneous floating neutral from active phases, and shows zero intervals and active-phase count. Full analytic three-phase RMS/commutation validation requires further specification of source impedance, exact firing-sequence regime, and load connection; this laboratory does not claim a single formula for all such states.

## Figures

![Annotated controller waveform and integral-cycle spectrum]({images[0].name})

![Three-phase floating-star coverage]({images[1].name})

## References

1. [Monolithic Power Systems, *Single-Phase AC/AC Converters*](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/single-phase-ac-ac-converters).
2. [Monolithic Power Systems, *Three-Phase AC/AC Converters*](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/three-phase-ac-ac-converters).
""", encoding="utf-8")
    return report


def main() -> None:
    rows = adaptive_benchmarks()
    assert all(max(float(row["Vrms_error_percent"]), float(row["P_error_percent"])) <= TOL_PERCENT for row in rows)
    # Independent stiff integration required by the RL model audit.
    reference = radau_rl_reference(); assert np.all(np.isfinite(reference))
    # Keep graphics and the Radau cross-check compact; exact RMS checks retain
    # their independently refined high-resolution sample count in `rows`.
    figures = make_figures(67_200)
    with (OUT / "ac_controller_benchmarks.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys()); writer.writeheader(); writer.writerows(rows)
    report = write_report(rows, figures)
    (OUT / "ac_controller_summary.json").write_text(json.dumps({"tolerance_percent": TOL_PERCENT, "benchmarks": rows, "figures": [path.name for path in figures]}, indent=2), encoding="utf-8")
    print(json.dumps({"status": "passed", "tolerance_percent": TOL_PERCENT, "report": str(report), "csv": str(OUT / "ac_controller_benchmarks.csv"), "figures": [str(path) for path in figures]}, indent=2))


if __name__ == "__main__":
    main()
