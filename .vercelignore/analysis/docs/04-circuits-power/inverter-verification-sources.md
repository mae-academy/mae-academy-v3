# Inverter Verification Sources and Benchmark Scope

The laboratory treats the user-provided ideal square-wave and single-pulse expressions as exact benchmark cases. The requested $0.0001\%$ cross-validation target is enforced for the full-bridge square-wave RMS and Fourier fundamental, the half-bridge scaling relation, single-pulse RMS, and the three-phase 180° line-to-line RMS value. SPWM is validated by comparison of a sufficiently resolved carrier comparator, FFT-derived fundamental, and the linear-region modulation invariant; carrier sidebands are shown rather than reduced to an unsupported finite closed-form equality.

## Findings

1. The IIT Roorkee Virtual Labs page gives the 180°-conduction switching sequence, the line-voltage Fourier series, and the line-voltage RMS relationship. Its stated 180° total line-voltage RMS is $0.8165V_s$, while the fundamental is $0.7797V_s$; the source notation corresponds to the dc-link step amplitude.
2. The Monolithic Power Systems PWM reference explains that a sinusoidal reference is compared with a triangular carrier; the reference determines the output frequency and the carrier determines the pulse count. This supports numerical carrier-comparator gating and spectrum inspection around carrier-sideband families.
3. The load solver uses the requested $R i+L\,di/dt=v(t)-e(t)$ equation. The strict exact criterion applies to analytical waveforms whose assumptions are fully specified; RLE/freewheeling behavior is reported as a converged switching simulation.

## References

1. [IIT Roorkee Virtual Labs, “Three Phase VSI with 120° and 180° Conduction Mode”](https://pe-iitr.vlabs.ac.in/exp/three-phase-conduction/theory.html).
2. [Monolithic Power Systems, “Pulse Width Modulation (PWM) Techniques”](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/dc-ac-converters/pulse-width-modulation-techniques).
