# Uncontrolled Rectifier Verification Laboratory

Run the laboratory from the project root with:

```bash
python3 analysis/uncontrolled_rectifier_verification.py
```

The script requires Python 3, NumPy, SciPy, and Matplotlib. It creates `analysis/uncontrolled_rectifier_output/` with the following artifacts:

| Artifact | Purpose |
|---|---|
| `validation_matrix.csv` | Exact ideal-R benchmark comparisons against the requested $0.0001\%$ tolerance. |
| `validation_summary.json` | Machine-readable benchmark and general numerical coverage results. |
| `uncontrolled_rectifier_waveforms.png` | 260-DPI, three-cycle waveform suite. |
| `uncontrolled_rectifier_validation_report.md` | Technical report with scope, formulas, tolerances, numerical methods, PIV distinction, and references. |

The strict percentage target is applied to exact ideal-diode R-load formulas. The RL/RLE cases are independently verified by their extinction-angle root residual. The RC/RLC and general three-phase dynamic-load cases are converged numerical coverage cases because they require topology- and initial-condition-specific switching states rather than a single universal closed-form comparison.
