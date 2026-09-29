# Event-Driven AC Voltage Controller Laboratory

Run the laboratory from the project root:

```bash
python3 analysis/ac_voltage_controller_event_driven.py
```

The program writes its artifacts to `analysis/ac_voltage_controller_event_driven_output/`.

| Artifact | Purpose |
|---|---|
| `event_driven_comparison_matrix.csv` | Exact analytical RMS comparisons for the R-load closed-form cases. |
| `dynamic_metrics.json` | Numerical RMS, current, power, PF, FFT THD, form/ripple factors, \(\alpha\), \(\beta\), and \(\gamma\). |
| `three_phase_state_coverage.json` | Device-count coverage for the three requested no-neutral modes. |
| `event_case_*.png` | High-DPI source/output/current/device/gate plots. |
| `three_phase_no_neutral_modes.png` | High-DPI Mode 1, Mode 2, and Mode 3 star-without-neutral state plots. |
| `event_driven_validation_report.md` | Technical scope, equations, numerical results, and references. |
| `terminal_output.txt` | Captured execution comparison output. |

The exact \(0.00001\%\) acceptance threshold applies only to the R-load cases with stated closed-form RMS relations. RL, burst, and no-neutral three-phase cases are verified through physical event-state rules, the bracketed \(\beta\) zero-current root, output/current continuity, zero-defect checks, and converged numerical metrics. If an ON-state output does not equal the source voltage, the program automatically re-runs switching cases at \(dt=T/100000\) before producing artifacts.
