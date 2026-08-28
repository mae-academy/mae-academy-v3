# DC–DC Chopper Verification Sources and Scope

The laboratory enforces the requested $0.0001\%$ target where ideal CCM formulas are fully defined: Buck $V_o=DV_s$, Boost $V_o=V_s/(1-D)$, Buck-Boost $V_o=-DV_s/(1-D)$, and Buck inductor ripple $\Delta I=V_sD(1-D)/(fL)$. It also checks the critical-inductance expressions supplied in the brief as classification boundaries. RLE/quadrant and general DCM cases are delivered as converged switching-state coverage; they are not assigned an unsupported universal ideal gain equality.

## Findings

1. The Monolithic Power Systems Buck reference derives the steady-state inductor volt-second balance and the ideal conversion $U=E d$. It describes CCM as current that never reaches zero and DCM as current that reaches zero during the switching cycle.
2. The provided brief defines the requested Buck, Boost, Buck-Boost, critical-inductance, Class A–E quadrant, and PWM/FM benchmark relations. The laboratory retains its polarity convention: Buck and Boost have positive output reference; the inverting Buck-Boost carries a negative $V_o$.
3. The full A–E quadrant taxonomy is represented by compact operation-state trajectory examples. A physical Class E bridge requires modulation/dead-time/device loss assumptions beyond the ideal source/load inputs, so its plot is labeled as a quadrant-classification trajectory, not an exact switching hardware proof.

## References

1. [Monolithic Power Systems, “Buck Converters (Step-Down Converter)”](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/dc-dc-converters/buck-converters).
