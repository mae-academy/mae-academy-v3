# AC Voltage Controller Verification Sources and Scope

The laboratory treats the user-provided resistive phase-angle and integral-cycle RMS expressions as exact benchmark cases. The $0.0001\%$ target is enforced for those RMS comparisons and for resistive-load real power/PF invariants. The RL phase-angle case uses the stated sinusoidal-plus-exponential current expression and a bracketed numerical root of $i(\beta)=0$; its voltage RMS is checked by numerical quadrature against the corresponding conduction-angle expression. General three-phase three-wire star behavior is included as a switching-state coverage model, not presented as a single closed-form RMS proof.

## Findings

1. The Monolithic Power Systems single-phase reference gives the bidirectional phase-controller RMS expression $U=E\sqrt{1-\alpha/\pi+\sin(2\alpha)/(2\pi)}$, explains antiparallel thyristor operation, and describes $\gamma=\beta-\alpha$ for an RL load.
2. The three-phase reference states that a no-neutral three-phase controller requires at least two thyristors conducting to establish load current. It distinguishes an operating mode associated with $60^\circ$ to $90^\circ$ firing angles. The laboratory therefore labels its three-phase result as topology-state coverage rather than a complete source-inductance/commutation proof.
3. Integral-cycle control is benchmarked on an integer number of source cycles. This makes the gated waveform periodic over the burst period $T_b=(n+m)T_s$, allowing the FFT to expose components below the source frequency.

## References

1. [Monolithic Power Systems, “Single-Phase AC/AC Converters”](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/single-phase-ac-ac-converters).
2. [Monolithic Power Systems, “Three-Phase AC/AC Converters”](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/ac-ac-converters/three-phase-ac-ac-converters).
