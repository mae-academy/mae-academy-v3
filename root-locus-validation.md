# Root Locus Legacy Port Validation

The integrated `/simulations/control-systems/root-locus` route now renders the legacy simulator in the new MAE Control Systems shell.

The live page exposes the preserved Polynomial/ZPK controls, numerator and denominator inputs, KaTeX transfer-function output, Cartesian and Polar controls, reset, S-plane canvas, maximum-time input, RK4 step-response canvas, transient metrics, closed-loop roots, five Show actions in the analytic steps panel, and gain calibration controls.

Polar mode was selected successfully in the live preview and the S-plane canvas redrew with the expected polar grid.

The first analytic-step **Show** action was triggered successfully after the port, and the browser console contained no runtime errors.

The Root Locus plot now uses MAE blue, indigo/violet, and crimson accents in place of the legacy green and yellow palette. The real-axis step now evaluates complete intervals between real poles and zeros, while retaining correct parity counts if the viewport is panned.
