# Uncontrolled Rectifier Verification Sources and Scope Notes

The verification laboratory distinguishes **exact analytical benchmark cases** from general time-domain cases. The stated $0.0001\%$ target is enforced for ideal R-load average/RMS formulas and for the single-phase half-wave RL extinction-angle equation, using the same numerical quadrature or a converged root solution. RC/RLC and general RLE cases are modeled through their governing ODEs and are reported as converged numerical cases rather than assigned an unsupported closed-form equality claim.

## Findings

1. The Virtual Labs derivation expresses the half-wave RL current as a sinusoidal steady-state term plus an exponential transient term, with the extinction angle defined by the zero-current condition. It also gives the RLE current expression, the average-current relation, and the counter-EMF start condition. This supports bisection/Newton verification of $\beta$ and the RLE branch used in the laboratory.
2. The Virtual Labs page used is for a controlled device, but setting firing angle $\alpha=0$ reduces its load ODE and extinction-angle construction to the corresponding ideal diode benchmark.
3. The user-supplied three-phase full-wave expression is retained with $V_m$ explicitly defined as the line-to-neutral peak. The laboratory checks this convention against direct phase-pair selection rather than silently mixing line-to-line and line-to-neutral amplitudes.

## References

1. [IIT Roorkee Virtual Labs, “Single Phase Half Wave Silicon Controlled Rectifier with R, RL & RLE Load”](https://pe-iitr.vlabs.ac.in/exp/single-half-silicon/theory.html).
2. [Monolithic Power Systems, “Uncontrolled Rectifiers”](https://www.monolithicpower.com/en/learning/mpscholar/ac-power/ac-dc-power-conversion-techniques/uncontrolled-rectifiers).
