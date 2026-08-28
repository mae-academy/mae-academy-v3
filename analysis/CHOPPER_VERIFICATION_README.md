# DC–DC Chopper Verification Laboratory

Run the laboratory from the project root with:

```bash
python3 analysis/chopper_verification.py
```

The program requires Python 3, NumPy, SciPy, and Matplotlib. Generated files are written to `analysis/chopper_verification_output/`.

| Artifact | Purpose |
|---|---|
| `chopper_benchmarks.csv` | Exact CCM conversion-ratio and Buck ripple comparisons. |
| `chopper_summary.json` | Machine-readable benchmark, coverage, and figure summary. |
| `chopper_switching_and_quadrants.png` | Four aligned panels for PWM, voltage, inductor current, and Class A–E trajectories. |
| `chopper_basic_topologies.png` | Periodic Buck, Boost, and inverting Buck-Boost state trajectories. |
| `chopper_validation_report.md` | Cited technical report with equations, errors, continuity coverage, PWM/FM treatment, and assumptions. |

The $0.0001\%$ threshold applies to fully specified lossless CCM conversion ratios and the Buck ripple equation. Low-inductance, RLE, and quadrant cases are delivered as converged switching-state coverage because their exact behavior depends on detailed circuit, device, and modulation assumptions. The Class C–E plots classify operating quadrants; they are not substitutes for a fully parameterized bridge-device simulation.
