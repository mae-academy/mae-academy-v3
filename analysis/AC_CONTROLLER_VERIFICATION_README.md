# AC Voltage Controller Verification Laboratory

Run the laboratory from the project root with:

```bash
python3 analysis/ac_voltage_controller_verification.py
```

The program needs Python 3, NumPy, SciPy, and Matplotlib. The generated files are placed in `analysis/ac_voltage_controller_verification_output/`.

| Artifact | Purpose |
|---|---|
| `ac_controller_benchmarks.csv` | Adaptive RMS and real-power consistency comparisons for the exact single-phase benchmark cases. |
| `ac_controller_summary.json` | Machine-readable tolerance and benchmark result summary. |
| `ac_controller_waveforms_and_spectrum.png` | 260-DPI annotated source/output, gates, RL current, and integral-cycle spectrum figure. |
| `ac_controller_three_phase_coverage.png` | Three-wire floating-star switching-state coverage figure. |
| `ac_controller_validation_report.md` | Cited technical report with equations, RMS/PF values, beta/gamma, scope limits, and conclusions. |

The $0.0001\%$ target applies to fully specified single-phase R/RL RMS and R-load power invariants. The RL extinction angle is solved as a bracketed root of the supplied current equation. The three-phase result is intentionally scoped as an ideal switching-state coverage model; a fully analytical three-phase commutation comparison requires source impedance, firing sequence, and load details beyond the brief.
