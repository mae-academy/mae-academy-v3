# Chopper Studio Engine References

The Chopper Studio uses a time-domain inductor-current solver and classifies **CCM** when the current remains above zero over a switching cycle and **DCM** when it reaches zero and is clamped. This follows the standard CCM/DCM distinction described by Monolithic Power Systems in its Buck-Boost Converter reference. The model preserves the requested Buck, Boost, and Buck-Boost switching states and reports a theoretical critical inductance alongside the sampled-state classification.

## Reference

1. [Monolithic Power Systems, “Buck-Boost Converters”](https://www.monolithicpower.com/en/learning/mpscholar/power-electronics/dc-dc-converters/buck-boost-converters) — describes continuous conduction as inductor current that does not reach zero during the switching period.
