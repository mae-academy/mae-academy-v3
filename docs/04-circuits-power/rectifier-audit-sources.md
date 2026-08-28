# Rectifier Model Audit Sources

This note records the external technical references consulted while auditing the client-side Rectifier Studio model.

| Topic | Finding used in the audit | Source |
|---|---|---|
| Phase control | A controlled rectifier changes the DC output by varying the thyristor firing angle. The source phase voltages and firing events must remain distinct from the output waveform. | [Monolithic Power Systems — Phase Controlled Rectifiers](https://www.monolithicpower.com/en/learning/mpscholar/ac-power/ac-dc-power-conversion-techniques/phase-controlled-rectifiers) |
| Three-phase bridge | A three-phase full-wave controlled bridge is a six-pulse circuit. For continuous current, the reported average output relation is \(V_{dc}=\frac{3\sqrt{3}}{\pi}V_{mp}\cos\alpha\), where \(V_{mp}\) is the phase-voltage peak. | [Virtual Labs IIT Roorkee — Three Phase Full Wave SCR Rectifier](https://pe-iitr.vlabs.ac.in/exp/three-full-silicon/theory.html) |
| Three-phase output frequency | The full bridge creates six commutation intervals per line cycle; the model should therefore use \(6f\) as the output ripple frequency in the relevant idealized full-wave mode. | [Virtual Labs IIT Roorkee — Three Phase Full Wave SCR Rectifier](https://pe-iitr.vlabs.ac.in/exp/three-full-silicon/theory.html) |
| Single-phase full-wave R load | For a full-wave controlled R load, the cited average output is \(V_o=\frac{V_m}{\pi}(1+\cos\alpha)\). The RMS expression is obtained over the \(\alpha\) to \(\pi\) conduction interval. | [Virtual Labs IIT Roorkee — Single Phase Full Wave SCR Rectifier](https://pe-iitr.vlabs.ac.in/exp/single-full-silicon/theory.html) |
| Single-phase full-wave continuous RL load | For continuous current in the cited full bridge, voltage remains applied through the commutation interval and the average output relation is \(V_o=\frac{2V_m}{\pi}\cos\alpha\). The reference also gives the RL current solution and describes natural commutation at \(\pi+\alpha\). | [Virtual Labs IIT Roorkee — Single Phase Full Wave SCR Rectifier](https://pe-iitr.vlabs.ac.in/exp/single-full-silicon/theory.html) |
| RLE load | The cited RLE description treats the load as a series resistive, inductive, and back-EMF system with current transfer at each fired SCR pair. | [Virtual Labs IIT Roorkee — Single Phase Full Wave SCR Rectifier](https://pe-iitr.vlabs.ac.in/exp/single-full-silicon/theory.html) |

The implementation audit keeps detailed time-domain waveforms as the source of displayed RMS/DC metrics and uses reference formulas as validation invariants for regimes where their assumptions hold.
