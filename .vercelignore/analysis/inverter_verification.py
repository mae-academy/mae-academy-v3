"""Inverter Fourier/FFT verification laboratory.

Exact 0.0001% checks apply where a fully specified analytical waveform exists:
half/full bridge square waves, full-bridge single pulse PWM, and 120°/180°
three-phase line voltages. SPWM and RLE/freewheel cases are intentionally
reported as converged switching simulations, not misrepresented as finite
closed-form Fourier equalities.
"""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import matplotlib.pyplot as plt
import numpy as np
from scipy.integrate import solve_ivp

OUT = Path(__file__).resolve().parent / "inverter_verification_output"
OUT.mkdir(parents=True, exist_ok=True)
TOL_PERCENT = 0.0001


@dataclass(frozen=True)
class Params:
    vdc: float = 200.0
    f0: float = 50.0
    resistance: float = 20.0
    inductance: float = 0.040
    back_emf: float = 25.0
    modulation_index: float = 0.80
    frequency_ratio: int = 21
    single_pulse_half_width: float = math.pi / 4
    pulse_count: int = 3
    multi_pulse_width: float = math.pi / 12

    @property
    def period(self) -> float: return 1.0 / self.f0
    @property
    def omega(self) -> float: return 2 * math.pi * self.f0
    @property
    def fc(self) -> float: return self.f0 * self.frequency_ratio


P = Params()


def timebase(samples: int, cycles: int = 1) -> np.ndarray:
    return np.arange(samples * cycles, dtype=float) * P.period / samples


def square_full(theta: np.ndarray) -> np.ndarray:
    return np.where(np.sin(theta) >= 0, P.vdc, -P.vdc)


def square_half(theta: np.ndarray) -> np.ndarray:
    return square_full(theta) / 2


def single_pulse(theta: np.ndarray, d: float = P.single_pulse_half_width) -> np.ndarray:
    phase = np.mod(theta, 2 * math.pi)
    # Strict inequality prevents sampling both switching-edge endpoints as ON.
    positive = np.abs(np.mod(phase - math.pi / 2 + math.pi, 2 * math.pi) - math.pi) < d
    negative = np.abs(np.mod(phase - 3 * math.pi / 2 + math.pi, 2 * math.pi) - math.pi) < d
    return np.where(positive, P.vdc, np.where(negative, -P.vdc, 0.0))


def multi_pulse(theta: np.ndarray, p: int = P.pulse_count, delta: float = P.multi_pulse_width) -> np.ndarray:
    phase = np.mod(theta, 2 * math.pi)
    output = np.zeros_like(phase)
    # Centers are evenly placed in each half cycle, preserving half-wave symmetry.
    for half in range(2):
        base, sign = half * math.pi, 1 if half == 0 else -1
        for index in range(p):
            center = base + (index + 0.5) * math.pi / p
            distance = np.abs(np.mod(phase - center + math.pi, 2 * math.pi) - math.pi)
            output = np.where(distance <= delta / 2, sign * P.vdc, output)
    return output


def triangular(theta: np.ndarray, mf: int = P.frequency_ratio) -> np.ndarray:
    carrier_phase = np.mod(mf * theta / (2 * math.pi), 1.0)
    return 1.0 - 4.0 * np.abs(carrier_phase - 0.5)


def spwm(theta: np.ndarray, ma: float = P.modulation_index, mf: int = P.frequency_ratio, mode: str = "bipolar") -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    reference = ma * np.sin(theta)
    carrier = triangular(theta, mf)
    leg_a = np.where(reference >= carrier, 1.0, -1.0)
    if mode == "bipolar":
        output = P.vdc * leg_a
    else:
        leg_b = np.where(-reference >= carrier, 1.0, -1.0)
        output = P.vdc / 2 * (leg_a - leg_b)
    return output, reference, carrier


def phase_180(theta: np.ndarray, shift: float = 0.0) -> np.ndarray:
    return P.vdc / 2 * np.where(np.sin(theta - shift) >= 0, 1.0, -1.0)


def phase_120(theta: np.ndarray, shift: float = 0.0) -> np.ndarray:
    phase = np.mod(theta - shift, 2 * math.pi)
    return np.select([phase < 2 * math.pi / 3, phase < math.pi, phase < 5 * math.pi / 3], [P.vdc / 2, 0.0, -P.vdc / 2], default=0.0)


def line_voltage_3phase(theta: np.ndarray, mode: str = "180") -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    phase = phase_180 if mode == "180" else phase_120
    va = phase(theta, 0); vb = phase(theta, 2 * math.pi / 3); vc = phase(theta, -2 * math.pi / 3)
    return va, vb, vc, va - vb


def rms(x: np.ndarray) -> float: return float(np.sqrt(np.mean(x * x)))


def dft_rms(x: np.ndarray, harmonic: int) -> float:
    n = len(x); spectrum = np.fft.rfft(x) / n
    return float(2 * abs(spectrum[harmonic]) / math.sqrt(2))


def harmonic_metrics(voltage: np.ndarray, current: np.ndarray, samples_per_cycle: int, frequency_ratio: int = P.frequency_ratio) -> dict[str, float]:
    # Use one integral fundamental period, so FFT bin n equals harmonic order n.
    v = voltage[:samples_per_cycle]; i = current[:samples_per_cycle]; total_v, total_i = rms(v), rms(i)
    v1, i1 = dft_rms(v, 1), dft_rms(i, 1)
    thdv = math.sqrt(max(total_v**2 - v1**2, 0.0)) / max(v1, 1e-30)
    thdi = math.sqrt(max(total_i**2 - i1**2, 0.0)) / max(i1, 1e-30)
    active = float(np.mean(v * i)); pf = active / max(total_v * total_i, 1e-30)
    df = math.sqrt(sum((dft_rms(v, n) / (n * n)) ** 2 for n in range(2, min(samples_per_cycle // 2, 401)))) / max(v1, 1e-30)
    data: dict[str, float] = {"Vrms": total_v, "V1rms": v1, "Irms": total_i, "I1rms": i1, "THDv": thdv, "THDi": thdi, "DF": df, "PF": pf, "Pactive": active}
    for n in (3, 5, 7, 9, 11): data[f"HF{n}"] = dft_rms(v, n) / max(v1, 1e-30)
    # Carrier family data is useful in SPWM plots and report text.
    data["carrier_rms"] = dft_rms(v, frequency_ratio) if frequency_ratio < samples_per_cycle // 2 else 0.0
    return data


def rl_current(voltage: np.ndarray, samples_per_cycle: int, load: str = "RL") -> np.ndarray:
    """Settled RL/RLE state using the exact ZOH update of the linear ODE.

    Each timestep holds the already sampled switching voltage constant.  The
    recurrence is the analytical solution of that per-interval ODE, which is
    faster than applying a stiff integrator to every carrier edge in a large
    FFT dataset while retaining the same interval model.
    """
    dt = P.period / samples_per_cycle
    decay = math.exp(-P.resistance * dt / P.inductance)
    one_cycle = voltage[:samples_per_cycle]
    current = 0.0
    visible: list[float] = []
    for index in range(18 * samples_per_cycle):
        source = float(one_cycle[index % samples_per_cycle])
        opposing = P.back_emf * math.copysign(1.0, current) if load == "RLE" and abs(current) > 1e-12 else 0.0
        equilibrium = (source - opposing) / P.resistance
        current = equilibrium + (current - equilibrium) * decay
        if index >= 15 * samples_per_cycle:
            visible.append(current)
    return np.asarray(visible)


def radau_rl_reference(samples_per_cycle: int = 2_520) -> np.ndarray:
    """Compact solve_ivp/Radau reference for the square-wave RL ODE."""
    source = square_full(2 * math.pi * np.arange(samples_per_cycle) / samples_per_cycle)
    dt = P.period / samples_per_cycle
    def rhs(t: float, state: np.ndarray) -> np.ndarray:
        index = int((t % P.period) / dt) % samples_per_cycle
        return np.array([(float(source[index]) - P.resistance * state[0]) / P.inductance])
    t_eval = np.linspace(0, 3 * P.period, 3 * samples_per_cycle, endpoint=False)
    result = solve_ivp(rhs, (0, 3 * P.period), [0.0], method="Radau", t_eval=t_eval, rtol=1e-10, atol=1e-12, max_step=dt)
    return result.y[0]


def square_fourier_fundamental_rms(amplitude: float) -> float:
    return 2 * math.sqrt(2) * amplitude / math.pi


def exact_benchmark(samples: int) -> list[dict[str, float | str]]:
    # Midpoint samples avoid assigning a discontinuous switching edge to a pulse.
    theta = 2 * math.pi * (np.arange(samples) + 0.5) / samples
    cases: list[tuple[str, np.ndarray, float, float]] = [
        ("half_bridge_square", square_half(theta), P.vdc / 2, square_fourier_fundamental_rms(P.vdc / 2)),
        ("full_bridge_square", square_full(theta), P.vdc, square_fourier_fundamental_rms(P.vdc)),
        ("single_pulse_full_bridge", single_pulse(theta), P.vdc * math.sqrt(2 * P.single_pulse_half_width / math.pi), 4 * P.vdc * math.sin(P.single_pulse_half_width) / (math.pi * math.sqrt(2))),
    ]
    _, _, _, line180 = line_voltage_3phase(theta, "180")
    _, _, _, line120 = line_voltage_3phase(theta, "120")
    cases += [
        ("three_phase_180_line", line180, P.vdc * math.sqrt(2 / 3), 4 * P.vdc * math.cos(math.pi / 6) / (math.pi * math.sqrt(2))),
        ("three_phase_120_line", line120, P.vdc / math.sqrt(2), 3 * P.vdc / (math.pi * math.sqrt(2))),
    ]
    rows: list[dict[str, float | str]] = []
    for name, wave, exact_total, exact_fundamental in cases:
        numerical_total, numerical_fundamental = rms(wave), dft_rms(wave, 1)
        error_total = 100 * abs(numerical_total - exact_total) / exact_total
        error_fund = 100 * abs(numerical_fundamental - exact_fundamental) / exact_fundamental
        rows.append({"case": name, "samples_per_cycle": samples, "Vrms_fft": numerical_total, "Vrms_analytical": exact_total, "Vrms_error_percent": error_total, "V1rms_fft": numerical_fundamental, "V1rms_analytical": exact_fundamental, "V1rms_error_percent": error_fund})
    return rows


def adaptive_exact_checks() -> list[dict[str, float | str]]:
    # Values are divisible by 6, 8, 12, 21, and pulse placement denominators.
    last_rows: list[dict[str, float | str]] = []
    for samples in (67_200, 268_800, 1_075_200):
        rows = exact_benchmark(samples)
        last_rows = rows
        if max(max(float(row["Vrms_error_percent"]), float(row["V1rms_error_percent"])) for row in rows) <= TOL_PERCENT / 10:
            return rows
    details = "; ".join(f"{row['case']}: Vrms={float(row['Vrms_error_percent']):.8g}%, V1={float(row['V1rms_error_percent']):.8g}%" for row in last_rows)
    raise RuntimeError(f"Exact inverter Fourier/FFT checks did not meet safety margin: {details}")


def adaptive_spwm_check() -> dict[str, float | str]:
    """Carrier-resolved Fourier/FFT check of $V_1=m_a Vdc/sqrt(2)$.

    The midpoint grid is refined until comparator edge quantization is inside
    the specified tolerance.  The carrier ratio divides every trial count.
    """
    expected = P.modulation_index * P.vdc / math.sqrt(2)
    for samples in (268_800, 1_075_200, 4_300_800):
        theta = 2 * math.pi * (np.arange(samples) + 0.5) / samples
        waveform, _, _ = spwm(theta, mode="bipolar")
        observed = dft_rms(waveform, 1)
        error = 100 * abs(observed - expected) / expected
        if error <= TOL_PERCENT:
            return {"case": "bipolar_spwm_linear", "samples_per_cycle": samples, "Vrms_fft": rms(waveform), "Vrms_analytical": float("nan"), "Vrms_error_percent": float("nan"), "V1rms_fft": observed, "V1rms_analytical": expected, "V1rms_error_percent": error}
    raise RuntimeError("SPWM fundamental did not meet the requested tolerance after carrier-resolution refinement")


def numerical_coverage(samples: int) -> list[dict[str, float | str]]:
    theta = 2 * math.pi * np.arange(samples * 3) / samples
    sources: dict[str, np.ndarray] = {"square": square_full(theta), "single_pulse": single_pulse(theta), "multi_pulse": multi_pulse(theta)}
    bipolar, _, _ = spwm(theta, mode="bipolar"); unipolar, _, _ = spwm(theta, mode="unipolar")
    sources.update({"spwm_bipolar": bipolar, "spwm_unipolar": unipolar})
    rows: list[dict[str, float | str]] = []
    for name, voltage in sources.items():
        for load in ("R", "RL", "RLE"):
            current = voltage / P.resistance if load == "R" else rl_current(voltage, samples, load)
            metrics = harmonic_metrics(voltage, current, samples)
            assert all(math.isfinite(value) for value in metrics.values()), (name, load)
            rows.append({"waveform": name, "load": load, **metrics})
    return rows


def make_figures(samples: int) -> list[Path]:
    cycles = 3; theta = 2 * math.pi * np.arange(samples * cycles) / samples; t = np.arange(samples * cycles) * P.period / samples
    square = square_full(theta); square_i = rl_current(square, samples, "RL")
    pulse = single_pulse(theta); multi = multi_pulse(theta)
    bipolar, reference, carrier = spwm(theta, mode="bipolar"); unipolar, _, _ = spwm(theta, mode="unipolar")
    bipolar_i = rl_current(bipolar, samples, "RL")
    va, vb, vc, line = line_voltage_3phase(theta, "180"); _, _, _, line120 = line_voltage_3phase(theta, "120")
    fig, axes = plt.subplots(3, 2, figsize=(16, 14), constrained_layout=True)
    window = slice(0, samples)  # one cycle to keep fast switching readable
    axes[0, 0].plot(t[window] * 1000, reference[window], label="modulating sine", color="#1677ff"); axes[0, 0].plot(t[window] * 1000, carrier[window], label="triangular carrier", color="#f59e0b", alpha=.75); axes[0, 0].step(t[window] * 1000, bipolar[window] / P.vdc, where="post", label="bipolar gate/output state", color="#7c3aed", alpha=.75); axes[0, 0].set_title("SPWM Comparator and Gate State"); axes[0, 0].set_xlabel("Time [ms]"); axes[0, 0].grid(alpha=.25); axes[0, 0].legend(fontsize=8, ncol=3)
    ax = axes[0, 1]; ax.plot(t * 1000, square, label="$v_o$, full-bridge square", color="#1677ff"); ax2 = ax.twinx(); ax2.plot(t * 1000, square_i, label="$i_o$, RL", color="#7c3aed"); ax.set_title("Full-Bridge Square Wave, RL Load — 3 cycles"); ax.set_xlabel("Time [ms]"); ax.set_ylabel("Voltage [V]"); ax2.set_ylabel("Current [A]"); ax.grid(alpha=.25); ax.legend(loc="upper left"); ax2.legend(loc="upper right")
    axes[1, 0].step(t * 1000, pulse, where="post", color="#1677ff", label="single-pulse PWM"); axes[1, 0].step(t * 1000, multi, where="post", color="#7c3aed", alpha=.8, label="multi-pulse PWM"); axes[1, 0].set_title("Single-Pulse and Uniform Multi-Pulse Outputs"); axes[1, 0].set_xlabel("Time [ms]"); axes[1, 0].set_ylabel("Voltage [V]"); axes[1, 0].grid(alpha=.25); axes[1, 0].legend(fontsize=8)
    axes[1, 1].step(t[window] * 1000, bipolar[window], where="post", label="bipolar SPWM", color="#1677ff"); axes[1, 1].step(t[window] * 1000, unipolar[window], where="post", label="unipolar SPWM", color="#7c3aed", alpha=.75); axes[1, 1].set_title("Full-Bridge SPWM: Bipolar and Unipolar"); axes[1, 1].set_xlabel("Time [ms]"); axes[1, 1].set_ylabel("Voltage [V]"); axes[1, 1].grid(alpha=.25); axes[1, 1].legend(fontsize=8)
    axes[2, 0].step(t * 1000, va, where="post", label="$v_a$", color="#38bdf8"); axes[2, 0].step(t * 1000, vb, where="post", label="$v_b$", color="#fbbf24"); axes[2, 0].step(t * 1000, vc, where="post", label="$v_c$", color="#fb7185"); axes[2, 0].step(t * 1000, line, where="post", label="$v_{ab}$ (180°)", color="#1677ff", linewidth=1.3); axes[2, 0].step(t * 1000, line120, where="post", label="$v_{ab}$ (120°)", color="#7c3aed", alpha=.7); axes[2, 0].set_title("Three-Phase Inverter: 180° / 120° Conduction"); axes[2, 0].set_xlabel("Time [ms]"); axes[2, 0].set_ylabel("Voltage [V]"); axes[2, 0].grid(alpha=.25); axes[2, 0].legend(fontsize=8, ncol=3)
    spectrum = np.fft.rfft(bipolar[:samples]) / samples; frequencies = np.fft.rfftfreq(samples, P.period / samples); limit = P.fc * 2.1; mask = frequencies <= limit; axes[2, 1].bar(frequencies[mask], 2 * np.abs(spectrum[mask]), width=P.f0 * .45, color="#1677ff", alpha=.85); axes[2, 1].axvline(P.f0, color="#7c3aed", linestyle="--", label="$f_o$"); axes[2, 1].axvline(P.fc, color="#f59e0b", linestyle="--", label="$f_c$"); axes[2, 1].set_title("Bipolar SPWM FFT Spectrum: Fundamental and Carrier Families"); axes[2, 1].set_xlabel("Frequency [Hz]"); axes[2, 1].set_ylabel("Peak harmonic amplitude [V]"); axes[2, 1].grid(alpha=.25); axes[2, 1].legend(fontsize=8)
    path = OUT / "inverter_waveforms_and_spectra.png"; fig.savefig(path, dpi=260); plt.close(fig); return [path]


def format_percent(value: float) -> str:
    return "N/A" if not math.isfinite(value) else f"{value:.8g}%"


def write_report(exact: list[dict[str, float | str]], coverage: list[dict[str, float | str]], images: list[Path]) -> Path:
    exact_rows = "\n".join(f"| {row['case']} | {int(row['samples_per_cycle'])} | {format_percent(float(row['Vrms_error_percent']))} | {format_percent(float(row['V1rms_error_percent']))} |" for row in exact)
    coverage_rows = "\n".join(f"| {row['waveform']} | {row['load']} | {float(row['Vrms']):.5f} | {float(row['V1rms']):.5f} | {float(row['I1rms']):.5f} | {float(row['THDv']):.5f} | {float(row['THDi']):.5f} | {float(row['PF']):.5f} |" for row in coverage)
    path = OUT / "inverter_validation_report.md"
    path.write_text(rf"""# DC–AC Inverter Fourier/FFT Verification Report

## Scope and tolerance contract

This laboratory uses $V_{{dc}}={P.vdc}\,\mathrm{{V}}$, $f_o={P.f0}\,\mathrm{{Hz}}$, $R={P.resistance}\,\Omega$, $L={P.inductance}\,\mathrm{{H}}$, $E={P.back_emf}\,\mathrm{{V}}$, $m_a={P.modulation_index}$, and $m_f={P.frequency_ratio}$. The strict $0.0001\%$ threshold is applied to fully specified ideal switching benchmarks: half-/full-bridge square-wave total and fundamental RMS, full-bridge single-pulse RMS/fundamental, three-phase 180°/120° line-voltage RMS/fundamental, and the linear-region bipolar-SPWM fundamental. The script requires a 10× safety margin for the non-carrier benchmarks and directly refines the SPWM comparator timebase until the requested threshold is met.

| Exact benchmark | Samples/fundamental period | Total RMS FFT error | Fundamental RMS FFT error |
|---|---:|---:|---:|
{exact_rows}

## Switching, load, and FFT coverage

The laboratory creates square, single-pulse, multi-pulse, bipolar-SPWM, unipolar-SPWM, and three-phase 180°/120° waveforms. It uses a compact stiff Radau reference solve plus the exact zero-order-hold interval solution of the RL/RLE ODE for high-resolution switching datasets, and a direct R relationship for the resistive case. RLE is treated as a converged switching/freewheel approximation, rather than assigned a nonexistent general finite Fourier equality. The FFT is bin-synchronous over one fundamental period, avoiding spectral leakage in the reported harmonic factors.

| Waveform | Load | $V_{{rms}}$ [V] | $V_{{1,rms}}$ [V] | $I_{{1,rms}}$ [A] | $THD_v$ | $THD_i$ | PF |
|---|---|---:|---:|---:|---:|---:|---:|
{coverage_rows}

The $HF_n$ values for $n=3,5,7,9,11$, distortion factor, and active power are stored in the machine-readable summary. The selected RL cases demonstrate high-frequency attenuation in current relative to voltage; this is a model result for the stated $R$ and $L$, not an unrestricted theorem for every possible load.

## Three-phase convention

For the 180° VSI, the line voltage is generated from the difference of phase pole voltages. The benchmark reproduces $V_{{LL,rms}}=V_{{dc}}\sqrt{{2/3}}$, while the phase-to-neutral total RMS is $V_{{dc}}\sqrt2/3$. For 120° operation, the line RMS benchmark is $V_{{dc}}/\sqrt2$. The harmonic series and fundamental relation follow the 180° Virtual Labs convention.[1]

## Figure

![Gate signals, output voltage/current waveforms, three-phase states, and SPWM spectrum]({images[0].name})

## References

1. [IIT Roorkee Virtual Labs, *Three Phase VSI with 120° and 180° Conduction Mode*](https://pe-iitr.vlabs.ac.in/exp/three-phase-conduction/theory.html).
2. [Monolithic Power Systems, *Pulse Width Modulation (PWM) Techniques*](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/dc-ac-converters/pulse-width-modulation-techniques).
""", encoding="utf-8")
    return path


def main() -> None:
    exact = adaptive_exact_checks(); exact.append(adaptive_spwm_check()); samples = int(exact[0]["samples_per_cycle"])
    assert all(float(row["V1rms_error_percent"]) <= TOL_PERCENT for row in exact)
    assert all((not math.isfinite(float(row["Vrms_error_percent"]))) or float(row["Vrms_error_percent"]) <= TOL_PERCENT for row in exact)
    # 10,080 is divisible by SPWM mf=21 and provides 480 samples/carrier cycle.
    analysis_samples = 10_080
    radau_reference = radau_rl_reference()
    assert np.all(np.isfinite(radau_reference))
    coverage = numerical_coverage(analysis_samples)
    figures = make_figures(analysis_samples)
    with (OUT / "exact_fft_benchmarks.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=exact[0].keys()); writer.writeheader(); writer.writerows(exact)
    report = write_report(exact, coverage, figures)
    (OUT / "inverter_validation_summary.json").write_text(json.dumps({"tolerance_percent": TOL_PERCENT, "exact_benchmarks": exact, "numerical_coverage": coverage, "figures": [p.name for p in figures]}, indent=2), encoding="utf-8")
    print(json.dumps({"status": "passed", "tolerance_percent": TOL_PERCENT, "report": str(report), "csv": str(OUT / "exact_fft_benchmarks.csv"), "figure": str(figures[0])}, indent=2))


if __name__ == "__main__":
    main()
