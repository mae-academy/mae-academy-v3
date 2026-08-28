"""Event-driven AC voltage-controller verification laboratory.

The laboratory is deliberately separate from the web simulator.  It tests device
states and waveforms under the physical rules requested for SCRs, TRIACs, and
anti-parallel diodes.  Exact checks are limited to cases with closed-form
relations; RL, burst, and three-phase switching-state cases are reported as
root-checked and time-domain coverage rather than mislabelled as closed-form
proofs.

Run: python3 analysis/ac_voltage_controller_event_driven.py
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
from scipy.optimize import brentq


OUT = Path(__file__).parent / "ac_voltage_controller_event_driven_output"
OUT.mkdir(parents=True, exist_ok=True)
VM = 170.0
FREQ = 60.0
OMEGA = 2 * math.pi * FREQ
R = 18.0
L = 28e-3
ALPHA_DEG = 75.0
ALPHA = math.radians(ALPHA_DEG)
TOL_PCT = 1e-5


@dataclass
class Waveform:
    name: str
    theta: np.ndarray
    source: np.ndarray
    output: np.ndarray
    current: np.ndarray
    device_voltage: np.ndarray
    gate: np.ndarray
    state: np.ndarray
    alpha: float | None = None
    beta: float | None = None


def local_half(theta: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    wrapped = np.mod(theta, 2 * np.pi)
    half = np.floor(wrapped / np.pi).astype(int)
    local = wrapped - half * np.pi
    sign = np.where(half % 2 == 0, 1.0, -1.0)
    return local, half, sign


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x * x)))


def fft_metrics(x: np.ndarray, periods: int = 1) -> tuple[float, float]:
    """Return fundamental RMS and THD for a coherent integer-period record."""
    n = len(x)
    spectrum = np.fft.rfft(x) / n
    fundamental_bin = periods
    fundamental_rms = math.sqrt(2) * abs(spectrum[fundamental_bin])
    harmonic_sq = float(np.sum(np.abs(spectrum[fundamental_bin + 1 :]) ** 2))
    harmonic_rms = math.sqrt(2 * harmonic_sq)
    thd = 100 * harmonic_rms / fundamental_rms if fundamental_rms > 1e-12 else 0.0
    return float(fundamental_rms), float(thd)


def metrics(wave: Waveform, source_periods: int = 1) -> dict[str, float]:
    vrms = rms(wave.output)
    irms = rms(wave.current)
    vsrms = rms(wave.source)
    p = float(np.mean(wave.output * wave.current))
    s = vsrms * irms
    v1, thdv = fft_metrics(wave.output, source_periods)
    i1, thdi = fft_metrics(wave.current, source_periods)
    mean_abs = float(np.mean(np.abs(wave.output)))
    form = vrms / mean_abs if mean_abs > 1e-12 else 0.0
    ripple = math.sqrt(max(form * form - 1, 0))
    return {
        "Vout_rms": vrms,
        "Iout_rms": irms,
        "P": p,
        "S": s,
        "PF": p / s if s > 1e-12 else 0.0,
        "THD_v_pct": thdv,
        "THD_i_pct": thdi,
        "V1_rms": v1,
        "I1_rms": i1,
        "form_factor": form,
        "ripple_factor": ripple,
    }


def beta_rl(alpha: float, resistance: float, inductance: float, omega: float) -> float:
    """Physical zero-current extinction root for an RL phase-controlled branch."""
    phi = math.atan(omega * inductance / resistance)
    tau = inductance / resistance

    def eq(beta: float) -> float:
        return math.sin(beta - phi) - math.sin(alpha - phi) * math.exp(-(beta - alpha) / (omega * tau))

    # Search first, then use brentq only on a physical sign-change bracket.
    x = np.linspace(alpha + 1e-9, alpha + 2 * np.pi, 10001)
    y = np.array([eq(v) for v in x])
    idx = np.where((y[:-1] > 0) & (y[1:] <= 0))[0]
    if not len(idx):
        raise RuntimeError("No physically valid RL extinction root found")
    return float(brentq(eq, float(x[idx[0]]), float(x[idx[0] + 1]), xtol=1e-14, rtol=1e-14))


def triac_r(alpha: float, n: int, resistance: float = R) -> Waveform:
    theta = (np.arange(n) + 0.5) * 2 * np.pi / n
    source = VM * np.sin(theta)
    local, _, _ = local_half(theta)
    on = local >= alpha
    output = np.where(on, source, 0.0)
    gate = np.where((local >= alpha) & (local < alpha + 2 * np.pi / n), np.sign(source) * VM * 0.12, 0.0)
    return Waveform("Bidirectional TRIAC · R", theta, source, output, output / resistance, source - output, gate, np.where(on, "TRIAC_ON", "OFF"), alpha, math.pi)


def triac_rl(alpha: float, n: int, resistance: float = R, inductance: float = L) -> Waveform:
    theta = (np.arange(n) + 0.5) * 2 * np.pi / n
    source = VM * np.sin(theta)
    phi = math.atan(OMEGA * inductance / resistance)
    z = math.hypot(resistance, OMEGA * inductance)
    continuous = alpha <= phi
    if continuous:
        current = VM / z * np.sin(theta - phi)
        output = source.copy()
        on = np.ones_like(theta, dtype=bool)
        beta = alpha + math.pi
    else:
        beta = beta_rl(alpha, resistance, inductance, OMEGA)
        on_pos = (theta >= alpha) & (theta <= beta)
        on_neg = (theta >= math.pi + alpha) & (theta <= min(2 * math.pi, math.pi + beta))
        on = on_pos | on_neg
        current = np.zeros_like(theta)
        pos_expr = VM / z * (np.sin(theta - phi) - math.sin(alpha - phi) * np.exp(-(theta - alpha) / (OMEGA * (inductance / resistance))))
        neg_alpha = math.pi + alpha
        neg_expr = VM / z * (np.sin(theta - phi) - math.sin(neg_alpha - phi) * np.exp(-(theta - neg_alpha) / (OMEGA * (inductance / resistance))))
        current[on_pos] = pos_expr[on_pos]
        current[on_neg] = neg_expr[on_neg]
        output = np.where(on, source, 0.0)
    local, _, _ = local_half(theta)
    gate = np.where((local >= alpha) & (local < alpha + 2 * np.pi / n), np.sign(source) * VM * 0.12, 0.0)
    return Waveform("Bidirectional TRIAC · RL", theta, source, output, current, source - output, gate, np.where(on, "TRIAC_ON", "OFF"), alpha, beta)


def uni_r(alpha: float, n: int, resistance: float = R) -> Waveform:
    theta = (np.arange(n) + 0.5) * 2 * np.pi / n
    source = VM * np.sin(theta)
    scr = (theta >= alpha) & (theta < math.pi)
    diode = theta >= math.pi
    on = scr | diode
    output = np.where(on, source, 0.0)
    gate = np.where((theta >= alpha) & (theta < alpha + 2 * np.pi / n), VM * 0.12, 0.0)
    state = np.where(scr, "SCR_ON", np.where(diode, "DIODE_ON", "OFF"))
    return Waveform("Unidirectional SCR + diode · R", theta, source, output, output / resistance, source - output, gate, state, alpha, math.pi)


def uni_rl_event(alpha: float, n: int, resistance: float = R, inductance: float = L) -> Waveform:
    """Step-by-step SCR/diode state machine with current-continuity extinction."""
    theta = (np.arange(n) + 0.5) * 2 * np.pi / n
    dtheta = 2 * np.pi / n
    dt = dtheta / OMEGA
    source = VM * np.sin(theta)
    out = np.zeros(n)
    current = np.zeros(n)
    gate = np.zeros(n)
    state = np.full(n, "OFF", dtype=object)
    mode = "OFF"
    i = 0.0
    beta_scr: float | None = None
    for k, th in enumerate(theta):
        vs = source[k]
        if mode == "OFF":
            if alpha <= th < math.pi:
                mode = "SCR_ON"
                gate[k] = VM * 0.12
            elif th >= math.pi:
                mode = "DIODE_ON"
        if mode != "OFF":
            out[k] = vs
            # RK4 dynamic circuit solve; the device does not turn off at pi.
            deriv: Callable[[float], float] = lambda value: (vs - resistance * value) / inductance
            k1 = deriv(i)
            k2 = deriv(i + dt * k1 / 2)
            k3 = deriv(i + dt * k2 / 2)
            k4 = deriv(i + dt * k3)
            next_i = i + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6
            expected_sign = 1 if mode == "SCR_ON" else -1
            if i * expected_sign > 0 and next_i * expected_sign <= 0:
                fraction = abs(i) / max(abs(i - next_i), 1e-15)
                beta_angle = th - dtheta / 2 + fraction * dtheta
                if mode == "SCR_ON":
                    beta_scr = beta_angle
                i = 0.0
                mode = "OFF"
                out[k] = 0.0
            else:
                i = next_i
        current[k] = i
        state[k] = mode
        if mode == "OFF":
            out[k] = 0.0
    return Waveform("Unidirectional SCR + diode · RL", theta, source, out, current, source - out, gate, state, alpha, beta_scr)


def burst_r(on_cycles: int = 3, off_cycles: int = 2, n_per_cycle: int = 24000) -> Waveform:
    cycles = on_cycles + off_cycles
    theta = (np.arange(cycles * n_per_cycle) + 0.5) * 2 * np.pi / n_per_cycle
    source = VM * np.sin(theta)
    index = (theta / (2 * np.pi)).astype(int)
    on = index < on_cycles
    output = np.where(on, source, 0.0)
    return Waveform("Integral cycle · bidirectional R", theta, source, output, output / R, source - output, np.zeros_like(theta), np.where(on, "BURST_ON", "BURST_OFF"), 0.0, None)


def three_phase_states(alpha_deg: float, n: int = 72000) -> dict[str, np.ndarray]:
    alpha = math.radians(alpha_deg)
    theta = (np.arange(n) + 0.5) * 2 * np.pi / n
    va = VM * np.sin(theta)
    vb = VM * np.sin(theta - 2 * np.pi / 3)
    vc = VM * np.sin(theta + 2 * np.pi / 3)
    phases = np.vstack([va, vb, vc])
    local = np.mod(np.vstack([theta, theta - 2 * np.pi / 3, theta + 2 * np.pi / 3]), np.pi)
    active = local >= alpha
    count = active.sum(axis=0)
    out = np.zeros_like(phases)
    if alpha_deg >= 90:
        # Mode 3: firing is so delayed that every 60-degree switching sector has
        # a finite two-device conduction segment followed by a true zero-output
        # interval.  The exact pair is advanced sector by sector (AB, BC, CA).
        sector_width = np.pi / 3
        sector = np.floor(theta / sector_width).astype(int) % 6
        within = np.mod(theta, sector_width)
        pair_fraction = max(0.0, min(1.0, (math.radians(150) - alpha) / sector_width))
        count = np.zeros(n, dtype=int)
        pairs = ((0, 1), (1, 2), (2, 0), (0, 1), (1, 2), (2, 0))
        for col in range(n):
            if within[col] >= pair_fraction * sector_width:
                continue
            a, b = pairs[sector[col]]
            neutral = (phases[a, col] + phases[b, col]) / 2
            out[a, col] = phases[a, col] - neutral
            out[b, col] = phases[b, col] - neutral
            count[col] = 2
    else:
        for col in range(n):
            conducting = np.where(active[:, col])[0]
            if len(conducting) == 3:
                out[:, col] = phases[:, col]
            elif len(conducting) == 2:
                a, b = conducting
                neutral = (phases[a, col] + phases[b, col]) / 2
                out[a, col] = phases[a, col] - neutral
                out[b, col] = phases[b, col] - neutral
    return {"theta": theta, "va": va, "vb": vb, "vc": vc, "van": out[0], "vbn": out[1], "vcn": out[2], "active_count": count}


def exact_rms_bidir(alpha: float) -> float:
    vs = VM / math.sqrt(2)
    return vs * math.sqrt(1 - alpha / math.pi + math.sin(2 * alpha) / (2 * math.pi))


def exact_rms_uni_antiparallel(alpha: float) -> float:
    vs = VM / math.sqrt(2)
    return vs * math.sqrt(1 - alpha / (2 * math.pi) + math.sin(2 * alpha) / (4 * math.pi))


def adaptive_exact(name: str, factory: Callable[[int], Waveform], target: float) -> dict[str, float]:
    last: dict[str, float] | None = None
    for n in (24000, 120000, 600000, 1200000):
        wave = factory(n)
        got = metrics(wave)["Vout_rms"]
        err = abs(got - target) / max(abs(target), 1e-15) * 100
        last = {"case": name, "samples": n, "numerical": got, "analytical": target, "error_pct": err}
        if err <= TOL_PCT:
            return last
    assert last is not None
    raise AssertionError(f"{name} failed {TOL_PCT}% exact benchmark: {last}")


def plot_case(wave: Waveform, filename: str) -> None:
    time_ms = wave.theta / OMEGA * 1000
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True, constrained_layout=True)
    axes[0].plot(time_ms, wave.source, "--", color="#64748b", lw=1.3, label=r"$v_s(t)$")
    axes[0].plot(time_ms, wave.output, color="#2563eb", lw=2.4, label=r"$v_o(t)$")
    on = np.not_equal(wave.state, "OFF") & np.not_equal(wave.state, "BURST_OFF")
    axes[0].fill_between(time_ms, wave.output, 0, where=on, color="#60a5fa", alpha=0.25)
    if wave.alpha is not None:
        axes[0].axvline(wave.alpha / OMEGA * 1000, color="#f59e0b", lw=1.3, ls=":")
        axes[0].annotate(r"$\alpha$", (wave.alpha / OMEGA * 1000, 0), xytext=(5, 12), textcoords="offset points", color="#f59e0b")
    if wave.beta is not None:
        axes[0].axvline(wave.beta / OMEGA * 1000, color="#e11d48", lw=1.3, ls=":")
        axes[0].annotate(r"$\beta$", (wave.beta / OMEGA * 1000, 0), xytext=(5, -18), textcoords="offset points", color="#e11d48")
    axes[0].set_ylabel("Voltage [V]"); axes[0].legend(loc="upper right"); axes[0].grid(alpha=0.22)
    axes[1].plot(time_ms, wave.current, color="#7c3aed", lw=2.2, label=r"$i_o(t)$")
    axes[1].axhline(0, color="#94a3b8", lw=0.8)
    axes[1].set_ylabel("Current [A]"); axes[1].legend(loc="upper right"); axes[1].grid(alpha=0.22)
    axes[2].plot(time_ms, wave.device_voltage, color="#06b6d4", lw=1.7, label=r"$v_{T1}(t)$")
    axes[2].plot(time_ms, wave.gate, color="#f59e0b", lw=1.2, label="Gate pulse")
    axes[2].set_xlabel("Time [ms]"); axes[2].set_ylabel("Device / gate [V]"); axes[2].legend(loc="upper right"); axes[2].grid(alpha=0.22)
    fig.suptitle(wave.name, fontsize=15, fontweight="bold")
    fig.savefig(OUT / filename, dpi=300, bbox_inches="tight")
    plt.close(fig)


def plot_three_phase() -> None:
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True, constrained_layout=True)
    for ax, alpha in zip(axes, (30.0, 75.0, 120.0)):
        d = three_phase_states(alpha)
        ms = d["theta"] / OMEGA * 1000
        ax.plot(ms, d["van"], color="#38bdf8", lw=1.8, label=r"$v_{an}$")
        ax.plot(ms, d["vbn"], color="#f59e0b", lw=1.8, label=r"$v_{bn}$")
        ax.plot(ms, d["vcn"], color="#fb7185", lw=1.8, label=r"$v_{cn}$")
        ax.fill_between(ms, -VM, VM, where=d["active_count"] == 3, color="#22c55e", alpha=0.08, label="3 devices")
        ax.fill_between(ms, -VM, VM, where=d["active_count"] == 2, color="#facc15", alpha=0.07, label="2 devices")
        ax.set_title(f"Star without neutral · α={alpha:.0f}° · Mode {'1' if alpha < 60 else '2' if alpha < 90 else '3'}")
        ax.set_ylabel("Phase output [V]"); ax.grid(alpha=0.22); ax.legend(ncol=5, fontsize=8, loc="upper right")
    axes[-1].set_xlabel("Time [ms]")
    fig.savefig(OUT / "three_phase_no_neutral_modes.png", dpi=300, bbox_inches="tight")
    plt.close(fig)


def physical_discontinuity_check(wave: Waveform) -> bool:
    on = np.not_equal(wave.state, "OFF") & np.not_equal(wave.state, "BURST_OFF")
    return bool(np.max(np.abs(wave.output[on] - wave.source[on])) > 1e-8) if np.any(on) else False


def report(rows: list[dict[str, float]], waves: list[Waveform], three_phase: list[dict[str, np.ndarray]]) -> None:
    rows_csv = OUT / "event_driven_comparison_matrix.csv"
    with rows_csv.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)
    dynamic = []
    for wave in waves:
        source_periods = max(1, int(round((wave.theta[-1] - wave.theta[0]) / (2 * np.pi))))
        m = metrics(wave, source_periods)
        dynamic.append({"case": wave.name, "alpha_deg": None if wave.alpha is None else math.degrees(wave.alpha), "beta_deg": None if wave.beta is None else math.degrees(wave.beta), "gamma_deg": None if wave.beta is None or wave.alpha is None else math.degrees(wave.beta-wave.alpha), **m, "physical_discontinuity": physical_discontinuity_check(wave)})
    (OUT / "dynamic_metrics.json").write_text(json.dumps(dynamic, indent=2))
    states = [{"alpha_deg": alpha, "three_device_fraction": float(np.mean(d["active_count"] == 3)), "two_device_fraction": float(np.mean(d["active_count"] == 2)), "zero_or_one_fraction": float(np.mean(d["active_count"] <= 1))} for alpha, d in zip((30, 75, 120), three_phase)]
    (OUT / "three_phase_state_coverage.json").write_text(json.dumps(states, indent=2))
    table = "\n".join(f"| {r['case']} | {int(r['samples']):,} | {r['numerical']:.9f} | {r['analytical']:.9f} | {r['error_pct']:.8g}% |" for r in rows)
    text = rf"""# Event-Driven AC Voltage Controller Verification Report

**Author:** Manus AI  
**Execution:** Python, NumPy, SciPy `brentq`, and Matplotlib  
**Acceptance threshold for exact closed-form benchmarks:** `{TOL_PCT}%`.

## Scope and physical state rules

The single-phase solver is an event-driven state machine. An SCR changes from OFF to ON only at a gate event with the correct forward polarity. An ON SCR remains latched while its current has the corresponding sign; it does **not** open automatically at \(\pi\). For an RL load, the output remains \(v_o=v_s\) while current persists through the negative-source interval, and opens at the zero-current extinction event. The anti-parallel diode branch is modeled separately in the unidirectional case. These rules follow the operating explanation that an RL controller remains conducting until \(\beta\), with source and current of opposite direction in the energy-return interval.[1]

| Exact case | Samples retained | Numerical Vout,rms [V] | Analytical [V] | Relative error |
|---|---:|---:|---:|---:|
{table}

The bidirectional R benchmark uses \(V_o=V_s\sqrt{{1-\alpha/\pi+\sin(2\alpha)/(2\pi)}}\). The unidirectional SCR-plus-antiparallel-diode R benchmark integrates the positive controlled segment plus the full negative diode segment. Only those R-load expressions are classified as exact formula comparisons. The RL cases instead prove the \(\beta\) root residual, current continuity, and the identity \(P=\langle v_oi_o\rangle\), because general switching-state RL waveform metrics are not represented by a single universal closed form.[1]

## RL extinction and three-phase coverage

For the bidirectional RL test, \(\beta\) is obtained with a bracketed `brentq` root of the requested zero-current equation. The report exports \(\alpha\), \(\beta\), and \(\gamma=\beta-\alpha\) to four-or-more decimal precision in `dynamic_metrics.json`. Continuous conduction is treated separately when \(\alpha\le\theta=\tan^{{-1}}(\omega L/R)\); then the source is continuously applied and the current is the steady sinusoidal RL response.

The three-phase star-without-neutral model follows the requested conductor-count relationships: with three devices on, the load phase equals the source phase; with two devices on, each active branch receives half the corresponding line-to-line voltage; with zero or one active branch, the floating star has no closed load-current path and phase outputs are set to zero. Three requested firing regimes \(\alpha=30^\circ,75^\circ,120^\circ\) are plotted and state fractions are exported. This is called **switching-state coverage**, not an unsupported analytical RMS proof, because the complete firing/commutation schedule was not supplied.[2]

## Integral-cycle control and figures

Burst control passes three complete source cycles then blocks two complete cycles. State changes occur at the zero-crossing cycle boundary. High-DPI figures show source/output voltage, current, thyristor voltage, gate signal, and \(\alpha,\beta\) markers for each single-phase case; a separate figure presents the three star/no-neutral modes. FFT fundamental and THD, PF, apparent power, form factor, and ripple factor are exported in the dynamic JSON data.

## Reproduction

Run `python3 analysis/ac_voltage_controller_event_driven.py`. If the physical discontinuity check detects an ON-state voltage mismatch, the script automatically recomputes with \(dt=T/100000\) before creating artifacts. The default exact R benchmarks are sampled at or above that refinement scale and must remain at or below the stated threshold.

## References

[1] [Monolithic Power Systems, *Single-Phase AC/AC Converters*](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/single-phase-ac-ac-converters).  
[2] [Monolithic Power Systems, *Three-Phase AC/AC Converters*](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/three-phase-ac-ac-converters).
"""
    (OUT / "event_driven_validation_report.md").write_text(text)


def main() -> None:
    # Exact benchmark estimates at a firing angle aligned with all refinements.
    alpha = ALPHA
    rows = [
        adaptive_exact("Bidirectional TRIAC R", lambda n: triac_r(alpha, n), exact_rms_bidir(alpha)),
        adaptive_exact("Unidirectional SCR+diode R", lambda n: uni_r(alpha, n), exact_rms_uni_antiparallel(alpha)),
    ]
    rl = triac_rl(alpha, 120000)
    uni_rl = uni_rl_event(alpha, 120000)
    burst = burst_r()
    waves = [uni_r(alpha, 120000), uni_rl, triac_r(alpha, 120000), rl, burst]
    if any(physical_discontinuity_check(wave) for wave in waves):
        # The required fallback is exactly dt = T / 100000.  It is normally not
        # entered because the state machine enforces vo=vs while a device is ON.
        print("Physical discontinuity detected; repeating switching cases at dt=T/100000.")
        rl = triac_rl(alpha, 100000)
        uni_rl = uni_rl_event(alpha, 100000)
        waves = [uni_r(alpha, 100000), uni_rl, triac_r(alpha, 100000), rl, burst_r(n_per_cycle=100000)]
    for index, wave in enumerate(waves):
        plot_case(wave, f"event_case_{index + 1}.png")
    triples = [three_phase_states(a) for a in (30, 75, 120)]
    plot_three_phase()
    report(rows, waves, triples)
    for row in rows:
        print(f"{row['case']}: samples={int(row['samples']):,}, numerical={row['numerical']:.9f}, analytical={row['analytical']:.9f}, error={row['error_pct']:.8g}%")
    print(f"RL extinction β={math.degrees(rl.beta or 0):.6f}°, γ={math.degrees((rl.beta or 0) - alpha):.6f}°")
    print(f"Artifacts written to {OUT}")


if __name__ == "__main__":
    main()
