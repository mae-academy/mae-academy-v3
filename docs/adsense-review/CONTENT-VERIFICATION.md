# Content verification (accuracy and usefulness)

Scope: every English tool doc in `client/src/locales/en/toolDocs/*.json` (29 tools, 9 topics).
Method: (1) recompute every worked-example number and every stated formula with an independent script;
(2) compare every stated default, range and option name with the studio code (`client/src/components/...`) and
the solver (`api/_lib/...`); (3) classify each text block as *specific* (tied to this tool's output), *general*
(true for any textbook on the topic) or *unsupported* (claims the tool does not do).

No text was changed by this step. Each finding lists the fix to apply, pending your approval.

Labels: **OK** = verified, **FIX** = wrong or misleading, **CHECK** = needs your decision or a live run.

## Control systems

### PID (`control/pid`)

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| P-1 | Model "Derivative filter" and equation "ISA standard form" with pole at −N/Td | The tool does not implement the ISA form. Its controller is built from Kp, Ki, Kd, N (`api/_lib/control/systems/pidMath.ts:36-78`). The filter is `1 + s/N` (pole at −N, not −N/Td), and it only exists in the *modified* subtypes. In the default subtype *parallel-standard*, N is never used (`pidMath.ts:57-62`), so the "derivative filter" text does not describe the default output | FIX | Keep the math, but state which subtype applies the filter, and that the pole is at −N in the tool's implementation (or add a note: "for the ISA form with pole at −N/Td, set Td = Kd/Kp"). Reword "limits high-frequency gain to Kp(1+N)": in the tool's modified form the high-frequency gain is Kd·N |
| P-2 | Model "Integrator anti-windup" with equation for clamped integrator | The tool simulates a **linear** loop only (`simulatePidScope`, RK4 on a transfer function). There is no actuator saturation and no clamping anywhere in the simulator. The text presents a feature the tool does not have | FIX | Move this to a "background" paragraph and say explicitly that the simulator is linear, or remove it from the tool's model section |
| P-3 | Mapping "Gain sliders" says N is limited to 1–500 with default 100 | Matches `PIDStudio.tsx:148,358-359` (kp 2, ki 1, kd 0.2, n 100; range 1–500) | OK | — |
| P-4 | Intro/purpose: "reports overshoot, peak time, settling time and steady-state error" | Matches `pidMath.ts:150-163` (Mp, Tp, Ts, e_ss) | OK | — |
| P-5 | Mapping "Interactive scope ... horizon 1 to 60 seconds, starting at 12 s" | Range 1–60 is correct (`PIDStudio.tsx:379-380`). The default is **12** and it is the *end* time (t_max), not a start time (the simulation starts at t = 0, `pidMath.ts:121`). The wording "starting at 12 s" is wrong | FIX | "a maximum time t_max from 1 to 60 s, default 12 s" |
| P-6 | Mapping "Design by Specs ... ζ 0.01–2 and ωn" | Range matches (`PIDStudio.tsx:428-429`). The tool's own defaults are ζ = 0.7 and ωn = 2 (`PIDStudio.tsx:151-152`); the design method (`estimatePidFromSpecs`) matches the second-order polynomial matching the text describes | OK | optionally state the defaults |
| P-7 | Worked example (ISA → parallel conversion, Ti = 0.5, Td = 0.1, N = 10) | Arithmetic is correct: Ki = 4, Kd = 0.2, pf = −100, Kp(1+N) = 22, Mp = 16.3 %, ts = 2 s, tp = 0.907 s, tr = 0.605 s (recomputed). **But** the tool has no Ti or Td input (sliders are Kp, Ki, Kd, N, `PIDStudio.tsx:335-356`), so the example cannot be reproduced in the tool | FIX | State that the example is a calculation only, and that the tool takes Ki and Kd directly (enter Ki = 4, Kd = 0.2, Kp = 2, N = 10) |
| P-8 | Worked example's last sentence: "the loop is expected to show Mp ≈ 16.3 %…" | These are the metrics of an *idealised second-order* loop. No plant is given, so the simulator would not necessarily show them | FIX | Say "for a second-order closed loop with ζ = 0.5 and ωn = 4 rad/s" |
| P-9 | "Applications and standards" heading | Names no standard. The five applications are general statements, not measured results | FIX | Rename to "Applications", or cite a specific standard (with name and clause) only if you can verify it |

**Usefulness (PID):** the theory is correct and general. The tool-specific parts (controller forms, metrics,
Design by Specs) are the real value, but the text covers them in one sentence each. Missing items that a student
would use: what each form changes in the response (e.g. Parallel-Modified vs Parallel-Standard, which N affects), and
a worked case that uses the scope and the metrics card with a plant entered in the tool.

### Root locus (`control/root-locus`)

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| R-1 | Worked example (G = 1/(s(s+2)(s+4))) | Every number checked: centroid −2, asymptotes 60°/180°/300°, breakaway at −0.845 (valid) and −3.155 (rejected by the odd-count rule), K = 3.08, Routh K_cr = 48, ω_cr = 2.83 rad/s | OK | — |
| R-2 | Mapping "Gain Calibration… K_min = 0.01, K_max = 10 by default" | Matches `RootLocusStudio.tsx:36-37` | OK | — |
| R-3 | Mapping "Closed-loop step response default horizon 10 s" | Matches `RootLocusStudio.tsx:38` (10.0) | OK | — |
| R-4 | Mapping "transient metrics report Mp, tr, ts" | Rise time is shown (`RootLocusStudio.tsx:402-405`). I did not confirm Mp and ts in that card | CHECK | Confirm the card shows Mp and ts |
| R-5 | Applications: "flutter-like oscillation begins" (aerospace) | Flutter is a coupled structural-aerodynamic instability. A single-loop root-locus gain sweep does not model it. The sentence overstates the method | FIX | Replace with "how an autopilot gain moves the short-period poles" (which is what a single-gain locus shows) |
| R-6 | Model: angle criterion, magnitude criterion, asymptotes, breakaway, Routh | All standard and correct (checked against the example) | OK | — |
| R-7 | Mapping "Analytical steps panel... breakaway points from dK/ds = 0" | `RootLocusStepsPanel.tsx` exists; the panel content was not run here | CHECK | Run the tool with the example and confirm the panel lists −0.845 and the Routh result |

**Usefulness (root locus):** this is the strongest text in the control topic. The example is complete and
verifiable. Only the applications list is generic.

### Frequency response (`control/frequency-response`)

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| F-1 | Worked example G = 20/(s(s+2)(s+5)) | Recomputed: ω_pc = √10 = 3.162, |G| = 0.2857, GM = 10.88 dB, ω_gc = 1.522, phase −144.2°, PM = 35.8°. The text says ω_gc ≈ 1.52 and PM 35.8°: correct | OK | — |
| F-2 | Mapping "Gain Compensation slider 0.01 to 10" | Matches `FrequencyResponseStudio.tsx:145-146` | OK | — |
| F-3 | Mapping "Step response horizon 1 to 100 s" | Matches `:217-218`. Default is 12 s (`:68`), not stated | OK (add default) | Add "default 12 s" |
| F-4 | Model: decibel definitions, slopes, crossover, margins, bandwidth | Standard and correct | OK | — |
| F-5 | Applications "Servo systems … phase margin above 45°" | General engineering guidance, not a result of this tool | CHECK | Keep as a general statement, or remove the number |

**Usefulness (frequency response):** correct and specific. The worked example is the best check that the student
can reproduce the tool's margins. A missing item: how to read the margin markers on the Nyquist and Nichols views.

### State space (`control/state-space`)

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| S-1 | Worked example (A = [[0,1],[−2,−3]], B, C, desired poles −4, −5) | Recomputed every step: det(sI−A) = s²+3s+2, eigenvalues −1, −2; C = [[0,1],[1,−3]], det = −1; O = I; φ(A) = [[18,6],[−12,0]]; C⁻¹ = [[3,1],[1,0]]; K = [18 6]; closed-loop s²+9s+20 | OK | — |
| S-2 | Mapping defaults for n = 2 and n = 3 | Matches `StateSpaceStudio.tsx:31-35` (A rows, B, C, poles −4, −5 / −4, −5, −6) | OK | — |
| S-3 | Model: controllability/observability ranks, Ackermann | Standard and correct | OK | — |
| S-4 | Mapping "A deficient rank is flagged as a warning" | Not checked in code (CHECK) | CHECK | Confirm with a non-controllable input (e.g. B = 0) |
| S-5 | Applications list | General examples, not results of the tool | CHECK | Keep as general, or remove |

**Usefulness (state space):** the example is complete. The tool's phase portraits are described only in one line
(mapping item "Phase portraits"). A student would need one sentence on what the trajectories show for these poles.


## Signals and systems

All five worked examples were recomputed. Every number is correct.

| Tool | Examples recomputed | Findings |
|---|---|---|
| Signal operations and properties | T0 = π s, ω0 = 2 rad/s, P∞ = 2.5, even/odd split | OK. The x(at − b) ordering rule is correct (scale, then delay b/a). |
| System classification | y = t·x(t): time-varying at t = 2 (outputs 2 and 1), unbounded for a bounded step | OK. Slider ranges (−2 to 2) and the "red region" marker were not confirmed in code (CHECK). |
| Convolution engine | y[n] = {1, 1, 1, 3, 2}, sum 8 = 4 × 2 | OK. Slider steps (−0.45 and +0.05) match `ConvolutionLab.tsx:213,232`. "Moving average" preset not confirmed (CHECK). |
| Fourier analysis | a0 = 2, a±1, |a1|² = 2.5, Parseval = 9 on both sides | OK. Slider ranges (T 0.1–20, N 1–50) not confirmed in code (CHECK). |
| Laplace and s-plane | poles −2 ± j3, h(t), |H(j√5)| = 1/12 | OK, all recomputed. Wording: "this article concerns" (L-1) is wrong for a tool page. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| L-1 | Laplace, purpose | "but this article concerns the continuous Laplace mode" — a tool page is not an article | FIX | "This page covers the continuous Laplace mode." |
| SG-1 | Fourier applications | The examples are generic ("Machinery diagnostics", "Power quality") and not linked to a tool output | CHECK | Keep, or replace with a case from the tool |

## Digital logic

All six examples were recomputed. Every number is correct, except the step labelling in the FSM example.

| Tool | Findings |
|---|---|
| Logic gate schematic | De Morgan check and JK toggling: OK. The statement "Q" = 0,1,0,1 is correct as a sequence including the initial value. Clock edge "rising" (mapping) not confirmed in code (CHECK). |
| K-map | Minterms 0,1,2,5,8,9,10 → B̄C̄ + B̄D̄ + ĀC̄D, 7 literals (from 28): recomputed, and the cover is minimal (the cover needs three terms because minterm 5 forces ĀC̄D and the rest needs two more). OK. |
| Analyzer | F = AB + C: minterms 1,3,5,6,7 and maxterms 0,2,4; product of sums (A+B+C)(A+B̄+C)(Ā+B+C): correct. OK. |
| Synthesis | NAND-NAND (3 gates) and NOR-NOR (3 gates) for AB + C: both correct. OK. |
| Timing | T_min = 3.0 ns, 333 MHz, hold margin 0.6 ns, slack 1.0 ns at 250 MHz: all correct. OK. |
| FSM | Mod-4 counter with T flip-flops: T0 = 1, T1 = Q0 correct. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| G-1 | State machine, example step 3 | Says "Check the first step" but uses 01 → 10 (the second step, since the first is 00 → 01) | FIX | Change to "Check the step 01 → 10" |
| G-2 | Schematic, purpose | Says "the engine propagates the logic levels after every edit" — no code check | CHECK | — |
| G-3 | All applications | Generic, not tied to the tool (e.g., "aerospace redundancy: majority voter") | CHECK | Keep, or tie to a circuit students can build here |

## PLC

| Tool | Findings |
|---|---|
| Ladder (S7-200) | Scan time 8 ms, response ≤ 16 ms, horn delay 5 s, 5 batches: all correct. TON/CTU/EU/ED definitions match the S7-200 behaviour described. OK. |
| LOGO! | Fan example: 6 V → 600 units, output 30, threshold on, 5 s delay: all correct. **Wrong sentence:** "a 12 mA signal would give the same midrange value" — 12 mA gives 500 units and 6 V gives 600; they are not equal. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| PL-1 | Ladder example, seal-in step | Writes "(1 + 0)·1", "(0 + 1)·1", which reads as the input value alone; the feedback term is Q0.0, which is not shown | FIX | Write Q0.0 = (I0.0 + Q0.0) · ¬I0.1 and then the three cases |
| PL-2 | Ladder mapping, "The larger CPU offers more input bytes" | No evidence for this in code | CHECK | Remove, or name the CPU and its input byte count |
| PL-3 | LOGO model, "Analog values" | "0–1000 units" and the current loop mapping (x = 62.5·(I − 4)) are consistent with the example | OK | — |
| PL-4 | LOGO, mapping "M8 startup flag" | Matches the LOGO convention; not confirmed in code | CHECK | — |
| PL-5 | LOGO example | The sentence "would give the same midrange value" is wrong (see above) | FIX | Replace with: "A 12 mA loop current gives 500 units, the midrange of the 0–1000 scale." |

## Arduino

| Item | Findings |
|---|---|
| Architecture and clock | 16 MHz, 62.5 ns cycle, 32 KB flash, 2 KB SRAM, 1 KB EEPROM: correct for ATmega328P. OK. |
| ADC convention | floor(1024·V/Vref) is the datasheet form; the studio uses floor(1023·V/Vref). The difference is at most one count (verified algebraically). The text states this. OK. |
| PWM | Fast PWM f = fclk/(N·256), phase-correct f = fclk/(N·510), duty formulas, and the Uno pin mapping (5/6 fast, 9/10/3/11 phase-correct): all correct. OK. |
| Interrupts and UART | 4 cycles = 0.25 µs, UBRR formula, 9600 baud → UBRR 103, +0.16 %; 115200 → UBRR 8, −3.55 %: all correct. OK. |
| LM35 | 10 mV/°C, 0.49 °C per count: correct for 5 V / 1023. OK. |
| HC-SR04 | 58.2 µs per cm (round trip): correct. OK. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| A-1 | Interrupts section | "the real rate differs from the request by the error e shown above" — e is not shown above; it is computed in the example | FIX | "…by the error e computed in the example below" |
| A-2 | PIR and IR ranges (1–5 s, 1–30 cm) | Not confirmed in code | CHECK | — |
| A-3 | Applications | "Security systems: PIR wakes the MCU only when motion occurs" — the studio has no sleep model | CHECK | Keep as a general statement, labelled as such |

## Code studios (MASM, Python, C++, C)

All four examples were recomputed. Every number is correct.

| Tool | Findings |
|---|---|
| MASM 8086 | 0xA5 → 0xAD → 0xA9 → 0x29; TEST → ZF = 0; SHR by 6 → CF = 1, AL = 0. OK. The 8086 facts (immediate shift count of 1 only, CL for larger counts, count 0 leaves flags unchanged, PUSH and SP) are correct. |
| Python | 178 → 179, 50, 54; bit 4 = 1; ~54 & 255 = 201. OK. |
| C++ | M = 0x52, results 0x5F, 0x0D, 0x5D; the differing bits are 1, 4, 6. OK. The phrase "each in a single instruction" (example result) depends on the target and is not guaranteed (CHECK). |
| C | 0xA5 → 0xAD → 0xA9 → 0x29, bit 5 = 1; RAM = 1.5 + 2.5 + 4 + 2 = 10 kB. OK. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| CS-1 | C++ example, last step | "each in a single instruction on a volatile register" is a target-dependent claim | CHECK | "each as one read-modify-write on the target" |
| CS-2 | C model, "The sums above show that .data is counted in both memories" | The equations list has the RAM and flash budgets (`equations.6`), so the reference is valid | OK | — |
| CS-3 | Applications (all four) | Generic ("Aerospace coding standards demand bounded stack use") — the standard is not named | CHECK | Name the standard or remove the claim |

## Fluid power

| Tool | Findings |
|---|---|
| Pneumatics | Piston area 1.9635 × 10⁻³ m² → 1178 N; annular 1.6493 × 10⁻³ m² → 990 N; V_cyl 3.613 × 10⁻⁴ m³; FAD ratio 6.92; Q_FAD 75 L/min: all correct. Ideal gas, R_s = 287, critical ratio 0.528 for choked flow: correct. Default 6 bar (matches the mapping; not confirmed in code). |
| Hydraulics | Q = 27.55 L/min, P_hyd = 6888 W, P_mech = 8103 W, v = 9.18 cm/s, F = 75 kN, Re = 1060 (laminar), f = 0.0604, ΔP = 0.43 bar: all correct. Defaults 50 bar pump, 60 bar relief, 1500 rpm motor match `fluidCatalog.ts:356,361,371`. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| FL-1 | Hydraulics example | The example uses 150 bar, but the default relief setting is 60 bar (`fluidCatalog.ts:361`) and the pump default is 50 bar. In the tool, the relief valve would open at 60 bar and the example cannot be reproduced | FIX | Add: "Set the pump to 150 bar and the relief valve to above 150 bar before running the example" |
| FL-2 | Pneumatics model, "Friction and back pressure cost 5 to 20 percent" | No source; a general rule of thumb | CHECK | Remove the numbers, or cite a source (verify first) |
| FL-3 | Hydraulics model, "pressure override" | Correct concept; the tool does not show it unless the valve is open | CHECK | Note "visible when the relief valve is open" |

## Power electronics

| Tool | Findings |
|---|---|
| Rectifier | V_dc = 31.83 V, V_rms = 70.71 V, FF = 2.221, RF = 1.984, I_dc = 3.183 A, P = 101.3 W: all correct. Model equations for continuous and discontinuous conduction, the three-phase 3√3/π form, the freewheeling diode, and the overlap equation cos α − cos(α+μ) = 2ωL_s I_d/V_m: all correct. |
| Inverter | m_f = 50, V1 = 226.3 V, dead-time error 2 V, square-wave V1 = 360 V, THD = 48.3 % (√(π²/8 − 1)): all correct. Six-step line fundamental √6/π·V_dc: correct. |
| Chopper | Buck V_o = 36 V, I_o = 6 A, ΔI_L = 1.5 A, I_max/I_min = 6.75/5.25 A, L_crit = 37.5 µH: correct. Boost V_o = 30 V, ΔV_o = 0.6 V, L_crit = 36 µH: correct. Buck-boost V_o = −18 V: correct. DCM gain formula 2/(1+√(1+4K/D²)) and critical inductances for all three converters: correct. |
| AC voltage controller | Bracket 2.5274, PF = 0.897, V_rms = 206.3 V, P = 4256 W, S = 4745 VA, integral-cycle 199.2 V: all correct. Extinction-angle equation, a1/b1 coefficients, and V_rms = V_s√k: correct. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| PE-1 | Chopper example, last step | The problem asks for "operating mode", but no inductance is given for the boost. The text compares L_crit and then does not state CCM or DCM | FIX | Add L (e.g. L = 100 µH) to the problem, and state the result: L > L_crit = 36 µH, so CCM |
| PE-2 | Chopper mapping vs example | The input field is in mH (`ChopperStudio.tsx:304`), so the mapping is correct. The example uses µH (300 µH, 37.5 µH) and a student would type 300 into a mH field | FIX | Write the example inductance as "L = 0.3 mH (300 µH)" and note the field unit |
| PE-3 | Chopper mapping, "f_s minimum 50 Hz" | Confirmed: `ChopperStudio.tsx:283` (min = 50) | OK | — |
| PE-4 | Rectifier model, "a resistive load enters discontinuous conduction" | Correct for a bridge with R only | OK | — |
| PE-5 | Inverter model, "THD = Σ V_n² ..." definition | Correct | OK | — |

## Circuits (workspace)

| Item | Findings |
|---|---|
| Example | Thévenin V_th = 9 V, R_th = 3 kΩ, τ = 30 ms, v_C(60 ms) = 7.78 V (86 % of final), i(0⁺) = 3 mA: all correct. |
| Model | KCL, KVL, MNA block form, Z = R + j(ωL − 1/ωC), ω0 = 1/√LC, P_max = V_th²/(4R_th) with efficiency ½, the first-order 5τ ≈ 0.7 % claim (e⁻⁵ = 0.67 %), and backward-Euler companion conductance C/Δt: all correct. |

| # | Location | Finding | Label | Proposed fix |
|---|---|---|---|---|
| C-1 | Mapping: AC frequency 0.001 Hz to 1 MHz; resistance 0.001 Ω to 10⁹ Ω; speed 0.1× to 4× in steps of 0.05 | Not confirmed in code (the search was not conclusive) | CHECK | Confirm the three ranges in the component code |
| C-2 | Mapping, "Resistor, capacitor, inductor" | Consistent with the model | OK | — |
| C-3 | Applications (5 items) | Generic, not tied to a tool output | CHECK | — |

## Arabic versions (numeric check only)

I compared the numbers in each Arabic tool doc against the English one. In 10 tools the English file has numbers that the Arabic file does not. Arabic is shorter, so some content is missing, not translated:

| Tool | Numbers in English but not in Arabic |
|---|---|
| Arduino studio | 10 (×2), 2, 8 |
| Inverter | 1 (×3), 3 (×2) |
| Rectifier | 1, 3 |
| AC voltage controller | 1, 3 |
| Fourier analysis | 3 (×2) |
| Laplace and s-plane | 3 (×2) |
| FSM | 4 |
| Root locus | 1 |
| MASM 8086 | 8086 |
| Circuit workspace | 3 |

This is a finding (AR-1): **the Arabic docs need their own review.** The numeric check does not confirm the Arabic meaning, and I did not read the Arabic text in full.

## Usefulness summary

| Tool | Worked example | Tool-specific content | Generic content | Overall |
|---|---|---|---|---|
| PID | Ok (not reproducible in tool, P-7) | Weak: the N filter and anti-windup described are not what the tool does (P-1, P-2) | Applications | Needs fixing before use |
| Root locus | Strong | Strong | Applications | Good |
| Frequency response | Strong | Strong | Applications | Good |
| State space | Strong | Medium | Applications | Good |
| Signal operations | Strong | Strong | Applications | Good |
| System classification | Strong | Strong | Applications | Good |
| Convolution | Strong | Strong | Applications | Good |
| Fourier | Strong | Strong | Applications | Good |
| Laplace | Strong | Strong | Applications | Good |
| Logic schematic | Strong | Medium | Applications | Good |
| K-map | Strong | Medium | Applications | Good |
| Analyzer | Strong | Medium | Applications | Good |
| Synthesis | Strong | Medium | Applications | Good |
| Timing | Strong | Medium | Applications | Good |
| FSM | Strong | Medium | Applications | Good, one step label to fix |
| Ladder | Strong | Strong | Applications | Good |
| LOGO | Strong | Strong | Applications | Good, one wrong sentence |
| Arduino | Strong | Strong | Applications | Good |
| MASM 8086 | Strong | Strong | Applications | Good |
| Python | Strong | Medium | Applications | Good |
| C++ | Strong | Medium | Applications | Good |
| C | Strong | Strong | Applications | Good |
| Pneumatics | Strong | Strong | Applications | Good |
| Hydraulics | Strong, but needs setup (FL-1) | Strong | Applications | Good after FL-1 |
| Rectifier | Strong | Strong | Applications | Good |
| Inverter | Strong | Strong | Applications | Good |
| Chopper | Incomplete (PE-1) | Strong | Applications | Good after PE-1 |
| AC voltage controller | Strong | Strong | Applications | Good |
| Circuit workspace | Strong | Medium | Applications | Good |

**Recurring weakness across all 29 tools:** the "Applications" block (4–5 entries each, about 120 in total) is generic and mostly not tied to what the tool does. These blocks are the most likely place for a reviewer to see content that could have come from any site. They are the first thing to rewrite with your own cases.

## What is not verified

- Simulator UI behaviour was checked only where a default, range or option name could be confirmed in code. Live runs of every example in the browser were not done.
- Arabic text: numbers only (AR-1).
- Items marked CHECK need a run of the tool or a look at the component file.

## Corrections applied (English docs only)

Only factual or wording errors were changed. No new explanatory prose was written; the changes below are corrections
or clarifications tied to what the code does. Each change edits the English file named below.

| Ref | File | Change | Verified against |
|---|---|---|---|
| P-1 | `toolDocs/control.json` pid, Derivative filter | Filter applies only to Parallel Modified and Series Modified; pole at −N and high-frequency gain Kd·N in the tool; ISA form labelled as reference; Parallel Standard has no filter | `api/_lib/control/systems/pidMath.ts:36-78` |
| P-2 | `toolDocs/control.json` pid, Anti-windup | Labelled "background, not simulated"; the simulator is linear with no saturation | `pidMath.ts` (linear RK4 scope, no saturation) |
| P-5 | `toolDocs/control.json` pid, Interactive scope | t_max from 1 to 60 s, default 12 s, measured from t = 0 | `PIDStudio.tsx:150,379-380`, `pidMath.ts:121` |
| P-7/P-8 | `toolDocs/control.json` pid, Example result | Calculation-only statement; metrics hold for a dominant second-order loop with ζ = 0.5, ωn = 4 | Recomputed (Mp 16.3 %, ts 2 s, tp 0.907 s, tr 0.605 s) |
| P-6 (form, gains) | `toolDocs/control.json` pid, Controller Form and Gain sliders | Default Parallel Standard, N only in modified forms; removed "Ti and Td" (the tool takes Ki and Kd) | `PIDStudio.tsx:148,335-356` |
| P-9 | `simulationDocs.json` sections.applications | "Industrial applications and standards" → "Industrial applications" (no standard is named). Applies to all simulators | — |
| R-5 | `toolDocs/control.json` root-locus, Aerospace | Removed the flutter claim (a single gain locus does not model flutter) | — |
| F-3 | `toolDocs/control.json` frequency-response, Step horizon | Added default 12 s | `FrequencyResponseStudio.tsx:68` |
| L-1 | `toolDocs/signals.json` laplace, purpose | "this article concerns" → "This page covers" | — |
| G-1 | `toolDocs/logic.json` state-machine, example step 3 | "first step" → "step 01 → 10" | Sequence 00→01→10→11→00 |
| PL-1 | `toolDocs/plc.json` ladder, example step 2 | Seal-in equation written with Q0.0 feedback and each case labelled | `Q0.0 = (I0.0 + Q0.0)·¬I0.1` |
| PL-2 | `toolDocs/plc.json` ladder, Input indicators | Removed unverified "larger CPU offers more input bytes" | — |
| PL-5 | `toolDocs/plc.json` logo, example step 4 | 12 mA → 500 units; 6 V → 600 units (no longer "the same") | Recomputed |
| A-1 | `toolDocs/arduino.json` studio, Interrupts/UART | "error e shown above" → defined relative error, worked out in the example | Baud error formula |
| A-3 | `toolDocs/arduino.json` studio, Security | PIR example labelled as the general pattern; the studio has no sleep mode | — |
| CS-1 | `toolDocs/codeStudio.json` cpp, example result | "single instruction" → "one read-modify-write" (target-dependent) | — |
| FL-1 | `toolDocs/fluid.json` hydraulics, example problem | Setup note: pump 150 bar and relief above 150 bar (defaults 50 and 60 bar) | `fluidCatalog.ts:356,361` |
| FL-2 | `toolDocs/fluid.json` pneumatics, Cylinder force | Removed the unsourced "5 to 20 percent" figure | — |
| FL-3 | `toolDocs/fluid.json` hydraulics, Relief dynamics | Override is visible only while the relief valve is open | — |
| PE-1 | `toolDocs/powerElectronics.json` chopper, example | Boost given L = 100 µH; step and result now state CCM (L > 36 µH) | Recomputed L_crit = 36 µH |
| PE-2 | `toolDocs/powerElectronics.json` chopper, example problem | Tells the reader to enter 0.3 mH and 0.1 mH (the tool's field unit is mH) | `ChopperStudio.tsx:304` |

### Not changed (still open)

| Ref | Reason |
|---|---|
| AR-1 | Arabic docs are missing numbers from 10 English tools. A translation needs an Arabic reviewer; I did not write Arabic text. |
| Generic "Applications" lists (all tools) | Replacing them with specific examples needs your own cases. Placeholder option: `[OWNER TO WRITE: a case from your lab or course for this tool]`. |
| C-1 (circuit ranges), A-2 (PIR/IR ranges), G-2, G-3, PL-4, pneumatics default pressure (6 bar) | Not confirmed in code; left as they are. |
| CS-3 ("standards" in C applications), SG-1 (Fourier applications) | Needs a named standard or a case from the tool. |
