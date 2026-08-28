# Inverter Fourier/FFT Verification Laboratory

Run the laboratory from the project root:

```bash
python3 analysis/inverter_verification.py
```

The implementation requires Python 3, NumPy, SciPy, and Matplotlib. It writes the following artifacts in `analysis/inverter_verification_output/`.

| Artifact | Purpose |
|---|---|
| `exact_fft_benchmarks.csv` | Exact square, single-pulse, three-phase, and adaptive-SPWM fundamental comparisons. |
| `inverter_validation_summary.json` | Machine-readable harmonic, THD, PF, distortion-factor, and numerical-coverage metrics. |
| `inverter_waveforms_and_spectra.png` | 260-DPI gate, dual-axis output, PWM, three-phase, and FFT spectrum figure suite. |
| `inverter_validation_report.md` | Cited technical report defining assumptions, formulas, scope, metrics, and results. |

The $0.0001\%$ requirement is applied only where the waveform and its analytical formula are both fully specified. Those exact cases include the ideal square, single-pulse, 120°/180° three-phase line, and linear-region bipolar-SPWM fundamental benchmarks. RLE and freewheel behavior is delivered as converged switching-model coverage rather than claimed as a universal finite Fourier equality.
