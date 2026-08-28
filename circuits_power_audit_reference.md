# Circuits & Power Electronics Audit Requirements

This document preserves the user-supplied requirements for the current sequential solver-only audit. It is documentation only.

## Required MNA and transient cases

The audit must verify that a circuit with no ground/reference node yields a guarded `TAB_D_MNA` warning in the simulation snapshot rather than a browser exception. It must verify that parallel ideal voltage sources with conflicting voltages reject the singular mathematical system safely. It must verify bounded Newton-Raphson behavior under a severe Smart Diode operating point, and finite transient behavior when a switch opens in an energized inductor circuit.

## Required power-electronics cases

The audit must test rectifier CCM/DCM transition and RMS stability as inductance changes, zero and full duty-cycle chopper behavior without division by zero, and inverter shoot-through detection with a clear short-circuit warning.

## Change constraint

All remediation must be limited to pure solvers and their unit tests. React and SVG source must not be modified. Findings must be reported honestly with verified failure evidence and retained regression coverage.
