# Power Electronics Simulator: Rectifier Studio Implementation and Reuse Specification

**Project:** MAE Academy — Practical Simulations → Power Electronics  
**Prepared by:** Manus AI  
**Status:** Implemented and audited specification  
**Scope:** Rectifiers, with the design system explicitly reusable for **Inverters**, **AC Voltage Controllers**, and **Choppers**.

## 1. Purpose of This Report

This document records the complete specification of the first Power Electronics simulator, the **Rectifier Studio**. It preserves the original build brief, documents every consequential refinement requested afterward, describes the final layout and style system, and records the mathematical audit of the client-side numerical engine.

The document should be treated as the implementation contract for the remaining Power Electronics tools. The next tools may change their electrical models, controls, traces, and circuit diagrams, but they should retain the same **workspace chassis, card grammar, typography, input treatment, scope behavior, metric presentation, responsive rules, and MAE Academy visual language**.

> **Core reuse principle:** Change the electrical content, not the interaction grammar. Every Power Electronics tool should feel like a calibrated station in one laboratory, rather than a different product.

| Reusable foundation | Rectifier-specific content that may change |
|---|---|
| Two-column laboratory chassis | Topology controls and parameter set |
| Left control-and-metrics rail | Electrical state equations and switching sequence |
| Upper-right unified scope | Trace names, colors, axes, and relevant domains |
| Lower-right circuit-diagram bay | Configuration-aware SVG topology |
| MAE dark/light cards, borders, spacing, and typography | Tool-specific explanatory text and formula set |
| KaTeX for mathematical notation and measured quantities | The actual equations and units |

---

## 2. Original User Brief: Rectifier Studio

The following is the original functional and visual brief supplied for the first Power Electronics module. It is reproduced here so future work can distinguish the original mandate from later refinements.

> **System Role:** Supreme Principal Power Electronics Engineer, Numerical Simulation Expert, and React Frontend Architect.
>
> **Execution Mandate:** Build the **Rectifier Studio**, the first module of the Power Electronics Simulator for the MAE Academy Platform. It must be a highly interactive, client-side numerical simulation tool. Compute piecewise switching waveforms based on firing angles and load dynamics entirely in TypeScript.
>
> **UI/UX parity:** Mirror the existing PID Studio and Root Locus Studio. Match their border thicknesses, radii, padding, subtle shadows, input-left/chart-right grid, solid dividers, and dark/light behavior. Mathematical variables, units, and metrics must be rendered with KaTeX/LaTeX.
>
> **Dynamic configuration:** Provide controls for single- versus three-phase operation; half- versus full-wave rectification; bridge versus center-tapped full-wave mode; source RMS/peak format; input voltage; frequency; firing angle; load configuration; free-wheeling diode; and load parameters. State changes must update simulation results immediately.
>
> **Time-domain engine:** Generate time and waveform arrays over exactly two displayed fundamental periods. Convert RMS input to peak when needed. Generate \(V_s(t)=V_m\sin(\omega t)\) for one phase and \(V_a\), \(V_b\), and \(V_c\) 120° apart for three phase. Model controlled-thyristor conduction, RL extinction/CCM/DCM behavior, FWD behavior, and numerical load dynamics using Euler or RK4.
>
> **Scope:** Use linear, zero-tension traces. Overlay voltage input(s) and output voltage, and render output current in a professional right-side scope. Apply dynamic scaling.
>
> **Metrics:** Numerically calculate \(V_{\mathrm{RMS}}\), \(V_{\mathrm{DC}}\), \(I_{\mathrm{RMS}}\), \(I_{\mathrm{DC}}\), \(P_{\mathrm{DC}}\), \(P_{\mathrm{AC}}\), \(f_{out}\), ripple voltage, form factor, ripple factor, and efficiency over a steady-state period.
>
> **Execution gate:** Do not use placeholder waveform logic. Deliver the React component, TypeScript waveform functions, strict dark/light support, Root Locus/PID layout parity, and mathematical LaTeX typography.

The original brief asked for the options \(R\), \(L\), \(C\), \(RL\), \(RC\), and \(RLC\). During refinement, the simulator was deliberately standardized on the more useful set \(R\), \(RL\), \(RC\), \(RLC\), and \(RLE\), as described below.

---

## 3. Revision History and Final Decisions

The Rectifier Studio was refined iteratively after the initial build. These later instructions define the final design and must take precedence wherever they differ from the original brief.

| Revision area | Final decision | Reason and reusable consequence |
|---|---|---|
| Power Electronics navigation | The rail has exactly four equal-width tools: **Rectifiers**, **Inverters**, **AC Voltage Controller**, and **Choppers**. Choppers terminates at the far right with no empty segment. | All Power Electronics tools share the same four-slot rail and never leave a spare rail cell. |
| Workspace composition | The screen is divided into **three principal zones**: full left control/metrics rail, upper-right scope, and lower-right circuit diagram. | This is the primary Power Electronics chassis for every future tool. |
| Scope structure | Input voltage(s), output voltage, and output current appear in **one unified scope**, not separate voltage/current charts. Voltage uses the left axis; current uses the right axis; time is explicit on the horizontal axis. | Future tools should prefer one synchronized engineering scope whenever waveforms must be correlated. |
| Phase visibility | Single-phase \(V_{in}\) is distinguishable as a dashed reference. Three-phase \(V_a\), \(V_b\), and \(V_c\) are distinct cyan, amber, and rose traces. | Every multi-phase tool must expose individual phase traces before presenting derived output quantities. |
| Load set | The final row is \(R\), \(RL\), \(RC\), \(RLC\), \(RLE\), in that order. | Use compact equal columns for a small finite option family. Preserve this order in Rectifiers. |
| Source controls | Voltage format, \(V_{in}\), \(f\), and \(\alpha\) are part of **Topology Configuration**, beneath a solid divider labeled “Source & Firing Parameters.” | Do not create a separate source card when the parameters are causally tied to topology and switching. |
| Value fields | Spinner inputs retain native numeric editing but display a KaTeX-style value overlay while unfocused. | The pattern is reusable for every engineering-number field: mathematical display at rest, precise native entry on focus. |
| Metrics | The steady-state matrix is a **3 × 4** grid of compact cards. \(\mathrm{PF}\) replaces the earlier \(\beta\) metric. | Standardize compact 12-cell metric matrices for tools that have a comparable metric count. |
| Typography | Structural labels are concise technical sans-serif. Variables, units, equations, values, tooltip values, and metrics use KaTeX. | Reserve serif/math texture for actual technical notation; do not make normal interface labels look like equations. |
| Numerical assurance | The time-domain core was audited against switching relations and a 240-case configuration matrix. | New Power Electronics tools must carry an equivalent automated audit before being presented as simulation tools. |

---

## 4. Final Screen Architecture

### 4.1 Desktop partition

At desktop width, the workspace uses a two-column outer grid. The left column is the full vertical configuration-and-metrics rail. The right column contains the scope above the circuit diagram. This produces the three requested functional zones while keeping input, observation, and topology explanation visible together.

| Screen zone | Position | Required contents | Layout rule |
|---|---|---|---|
| **Zone A: Configuration and metrics rail** | Entire left half | Topology Configuration; Source & Firing Parameters nested inside it; Load Configuration; Steady-State Metrics | Stacked cards with a consistent vertical gap. No chart or circuit diagram belongs here. |
| **Zone B: Output Scope** | Upper-right | Scope title, conduction badge, trace legend, unified waveform chart, left voltage axis, right current axis, bottom time axis, tooltip | This is the dominant analytical surface. Its chart must use linear traces and shared time samples. |
| **Zone C: Circuit Diagram** | Lower-right | Topology-aware diagram title, compact configuration tag, SVG circuit illustration or approved placeholder | Its width matches the scope exactly. It never migrates into the left rail. |

```text
┌──────────────────────── Left: configuration and metrics ───────────────────────┬──────── Right ────────┐
│  Topology Configuration                                                       │  Output Scope          │
│  ├─ Phase                                                                      │  ├─ Input trace(s)     │
│  ├─ Rectifier type / subtype                                                   │  ├─ Output voltage     │
│  └─ Source & firing parameters                                                │  └─ Output current     │
│                                                                                 ├───────────────────────┤
│  Load Configuration                                                           │  Circuit Diagram       │
│  ├─ Load row                                                                   │  └─ SVG / placeholder  │
│  ├─ FWD                                                                        │                       │
│  └─ R, L, C, E parameter fields                                               │                       │
│                                                                                 │                       │
│  Steady-State Metrics — 3 rows × 4 compact cells                              │                       │
└───────────────────────────────────────────────────────────────────────────────┴───────────────────────┘
```

### 4.2 Responsive behavior

Below the large-desktop breakpoint, the outer columns stack without changing internal card order. The left rail appears first, followed by the output scope and circuit diagram. Inside the left rail, source fields use two columns where available, component parameters grow to four equal columns on wide screens, and safely collapse on narrow screens. The metric matrix uses two columns on small screens and four columns when width permits.

> **Responsive rule:** Preserve information order, not desktop geometry. A mobile view must still read configuration → metrics → correlated scope → diagram.

---

## 5. Reusable Card, Box, and Control System

### 5.1 Surface hierarchy

Each major zone uses the same card primitive: a restrained rounded technical surface, one-pixel border, practical padding, and a subtle shadow. The card is intentionally not a “glass” or gradient container; the laboratory signal colors belong to active controls, traces, and reference details.

| Primitive | Light mode | Dark mode | Intended use |
|---|---|---|---|
| Major card | White surface, slate border, subtle shadow | Slate-900 surface, slate-800 border | Topology, load, metrics, scope, circuit diagram |
| Inner instrument well | Slate-50 / white with a thin border | Slate-950 / blue-black with a thin border | Chart enclosure, diagram bay, compact metric cells |
| Input field | White background, slate border | Slate-950 background, slate-800 border | Numeric value fields |
| Selected option | Violet border and restrained violet wash | Low-opacity violet wash and violet border | Phase, topology, load, FWD, voltage-format selection |
| Disabled field | Reduced opacity | Reduced opacity | Irrelevant load parameters |

### 5.2 Geometry

The geometry must remain systematic across all four Power Electronics tools.

| Element | Standard |
|---|---|
| Major card | `rounded-3xl`, light one-pixel border, `p-5`, small shadow |
| Option button | `rounded-xl`, minimum 40 px height, one-pixel border, compact horizontal padding |
| Numeric field | `rounded-xl`, centered KaTeX display overlay, native number editor on focus |
| Metric cell | `rounded-xl`, compact 10–12 px mathematical label, bolder value beneath |
| Scope/diagram well | `rounded-2xl`, thin border, internal padding, dark technical field in dark mode |
| Section divider | Solid one-pixel rule; no soft fade and no broad gradient |

### 5.3 Control grammar

Use equal-column matrices when a small option family has a fixed size. Examples include the five Rectifier load types and the four Power Electronics tool tabs. Use a paired matrix for binary and two-mode choices. Use a slider only for a continuous engineering parameter such as firing angle, duty cycle, or modulation index.

| Control type | Use for | Power Electronics examples |
|---|---|---|
| Two-column option matrix | Binary/mode choice | Single/three phase; half/full wave; FWD yes/no; RMS/peak |
| Equal multi-column row | Enumerated engineering mode | \(R\), \(RL\), \(RC\), \(RLC\), \(RLE\); inverter switching strategy |
| Numeric field with math overlay | A scalar parameter with a unit | \(V_{in}\), \(f\), \(R\), \(L\), \(C\), \(E\), duty cycle |
| Range input | Bounded continuous setting | \(\alpha\), modulation index \(m_a\), duty ratio \(D\) |
| Status pill | Qualitative mode result | CCM/DCM, discontinuous current, modulation region |

---

## 6. Typography and Mathematical Presentation

The base MAE Academy system uses **Avenir Next / Apple Gothic / ui-sans-serif** for English and Spanish, and **Tajawal** for Arabic. Georgia remains a rare academic accent only; it is not the primary UI typeface. This preserves exacting technical readability while KaTeX carries mathematical meaning.

| Content type | Presentation rule |
|---|---|
| Card titles and structural labels | Technical sans-serif; concise, sentence/title case; `text-sm` bold for primary card titles |
| Option labels with words | Technical sans-serif, small bold text |
| Variables, units, equations, measured values | KaTeX / LaTeX: \(V_{in}\), \(V_a\), \(I_o\), \(f\), \(\alpha\), \(\Omega\), \(\mathrm{mH}\), \(\mu\mathrm{F}\) |
| Numeric fields at rest | KaTeX-style centered overlay; input text becomes available only on focus |
| Scope annotations and tooltip values | KaTeX for symbols, units, and values; trace color follows the signal |
| Metrics | Label and value are both mathematical, compact, and vertically aligned |

> **Do not treat “all text must be LaTeX” literally for ordinary UI words.** The final refined system uses LaTeX for all mathematics, units, variables, equations, and calculated values; normal structural labels remain clear technical sans-serif. This prevents decorative math typography from weakening the instrument interface.

---

## 7. Color and Signal Semantics

The selected MAE direction is **Luminous Technical Atelier**: ink-navy surfaces, technical-paper light mode, precise borders, and a narrow blue–violet–crimson signal current. The signal gradient belongs to active navigation, high-intent controls, selected edges, and reference nodes—not to broad content backgrounds.

| Color role | Typical color | Use |
|---|---|---|
| Ink field | Near-black navy / slate | Dark workspace background and chart field |
| Technical paper | White and cool slate | Light cards and light mode |
| Signal violet | `#7C3AED` and adjacent violet tones | Selected controls, model/status emphasis, input focus |
| Electric blue | Blue-400/500 family | Output-voltage trace and selected analytical state |
| Current violet | Violet-400 family | Output-current trace and current axis |
| Cyan | Cyan-400 family | \(V_a\) in three-phase mode |
| Amber | Amber-400 family | \(V_b\) in three-phase mode |
| Rose | Rose-400 family | \(V_c\) in three-phase mode |
| Crimson reference | Narrow accent only | High-intent actions, reference node, critical marker |
| Neutral slate | Slate-400/500 family | Single-phase faded/dashed source reference, axes, inactive labels |

### 7.1 Scope color contract

The waveform scope uses color as data, not decoration.

| Signal | Stroke behavior | Axis / legend behavior |
|---|---|---|
| One-phase \(V_{in}\) | Faded, dashed neutral trace | Identified as an input reference |
| Three-phase \(V_a\) | Solid cyan, high contrast | Cyan legend item and tooltip value |
| Three-phase \(V_b\) | Solid amber, high contrast | Amber legend item and tooltip value |
| Three-phase \(V_c\) | Solid rose, high contrast | Rose legend item and tooltip value |
| Output voltage \(V_o\) | Thick solid electric-blue trace | Left axis labeled **Voltage [V]** |
| Output current \(I_o\) | Thick solid violet trace | Right axis labeled **Current [A]** |
| Time | Neutral tick and label styling | Bottom axis labeled **Time [ms]** |

---

## 8. Rectifier-Specific Functional Specification

### 8.1 Final configuration panels

The Rectifier Studio left rail contains three cards in this exact order.

| Card | Contents | Notes |
|---|---|---|
| **Topology Configuration** | Phase, rectifier type, full-wave subtype, and nested Source & Firing Parameters | The selected \(\alpha\) is displayed in the card header. Source controls are not a separate card. |
| **Load Configuration** | \(R\), \(RL\), \(RC\), \(RLC\), \(RLE\); FWD; component values \(R\), \(L\), \(C\), \(E\) | Irrelevant component fields are visibly disabled. |
| **Steady-State Metrics** | Twelve values arranged as 3 rows × 4 cells | The final set includes \(\mathrm{PF}\), not \(\beta\). |

### 8.2 Final unified scope

The scope renders exactly one chart. It contains source inputs, \(V_o\), and \(I_o\) synchronized on the same monotonic sample index. The index is formatted as milliseconds at the X axis, which avoids inconsistent floating-key treatment across Recharts traces. Left and right numerical axes distinguish voltage from current.

### 8.3 Circuit diagram bay

The diagram bay is fixed below the scope and carries a compact topology tag. The current station contains the approved circuit placeholder. Future production work should replace it with a native, configuration-aware SVG that changes with phase, rectifier type, subtype, FWD state, and selected load.

---

## 9. Audited Numerical Engine

### 9.1 General assumptions

The final model is an **idealized time-domain controlled rectifier**. SCRs are assumed to have zero forward voltage drop and zero commutation overlap. These idealizations make the results appropriate for interactive learning, topology comparison, and controlled waveform inspection. They are not a substitute for a device-level SPICE model, thermal design, or EMI/commutation-overlap study.

The engine settles the state before retaining exactly two display periods. The settling interval scales with the dominant inductive and capacitive time constants, rather than using one fixed warm-up duration. This prevents high-inductance or filtered loads from being measured before periodic steady state.

| Engine element | Final method |
|---|---|
| Input conversion | \(V_m=\sqrt{2}V_{\mathrm{RMS}}\) in RMS mode; \(V_m=V_{in}\) in peak mode |
| Single-phase sources | \(V_a=V_m\sin(\omega t)\) |
| Three-phase sources | \(V_a\), \(V_b\), \(V_c\) separated by \(120^\circ\) |
| Firing control | Source phase selection is performed at the delayed control angle \(\alpha\), while the physical source value is evaluated at actual time |
| Single-phase full bridge | Alternating polarity selection supports rectification and continuous-current voltage intervals |
| Three-phase full bridge | Highest and lowest control-phase selection produces the physical line-to-line bridge source |
| \(R\) load | Direct current relation \(I_o=V_o/R\) when source conduction is available |
| \(RL\) / \(RLE\) | Time integration of series load current; RLE includes back EMF \(E\) |
| \(RC\) | Capacitor charge/discharge model with finite idealized source resistance and resistive load discharge |
| \(RLC\) | RK4 integration of series inductor / shunt capacitor filter dynamics feeding the resistor |
| FWD | During freewheel intervals, inductor current may continue while source-applied output voltage is clamped to zero |
| Display window | Two settled fundamental periods, represented by a common monotonic plot index |

### 9.2 Mathematical audit checks

The audit uses numerical time-domain values for displayed metrics and cross-checks ideal operating regions against standard average-voltage relations. For a single-phase full-wave R load, the controlled-resistive average is \(V_{dc}=\frac{V_m}{\pi}(1+\cos\alpha)\). For continuous current in a single-phase full bridge, it is \(V_{dc}=\frac{2V_m}{\pi}\cos\alpha\). [1] For a three-phase full controlled bridge in continuous current, it is \(V_{dc}=\frac{3\sqrt{3}}{\pi}V_m\cos\alpha\). [2]

| Configuration | Analytical invariant used |
|---|---|
| One-phase, full-wave, R, \(\alpha=0\) | \(V_{dc}=\frac{2V_m}{\pi}\) |
| One-phase, half-wave, R, \(\alpha=0\) | \(V_{dc}=\frac{V_m}{\pi}\) |
| Three-phase, full-wave, R, \(\alpha=0\) | \(V_{dc}=\frac{3\sqrt{3}V_m}{\pi}\) |
| Three-phase, half-wave, R, \(\alpha=0\) | \(V_{dc}=\frac{3\sqrt{3}V_m}{2\pi}\) |
| One- and three-phase full-wave, continuous RL | \(V_{dc}\) follows the relevant \(\cos\alpha\) bridge relation |
| Equivalent RMS / peak setup | RMS input and its equivalent peak input return matching \(V_{dc}\) |
| RLE | Positive back EMF reduces mean load current relative to the matched RL case |
| All configurations | Values remain finite; current is nonnegative for modeled rectifier modes; power factor remains bounded; output ripple frequency matches phase and topology |

### 9.3 Verification matrix

The final audit script enumerates **240 configuration cases**:

| Dimension | Values |
|---|---|
| Phase | Single, three |
| Rectifier type | Half-wave, full-wave |
| Load | \(R\), \(RL\), \(RC\), \(RLC\), \(RLE\) |
| Voltage format | RMS, peak |
| FWD | No, yes |
| Firing angle | \(0^\circ\), \(42^\circ\), \(90^\circ\) |

In addition to the 240-case matrix, the audit checks ideal R-load formulas, continuous-RL bridge formulas, RMS/peak equivalence, RLE current reduction, output-frequency rules, late-cycle waveform persistence, value finiteness, and current/power-factor bounds.

> **Important output-voltage interpretation:** A three-phase bridge output can be numerically larger than one displayed phase voltage because the rectifier selects a **line-to-line** voltage, while \(V_a\), \(V_b\), and \(V_c\) are phase-to-neutral sinusoids. This is expected under the stated ideal bridge model. [2]

### 9.4 Final metrics contract

The final matrix includes the following 12 cells: \(V_{\mathrm{RMS}}\), \(V_{\mathrm{DC}}\), \(I_{\mathrm{RMS}}\), \(I_{\mathrm{DC}}\), \(P_{\mathrm{DC}}\), \(P_{\mathrm{AC}}\), \(f_{out}\), \(V_{\mathrm{ripple}}\), \(\mathrm{FF}\), \(\mathrm{RF}\), \(\mathrm{PF}\), and \(\eta\). The current ideal lossless model reports efficiency as \(100\%\) whenever real output power is positive; a nonideal future model should replace this with an explicitly modeled loss calculation.

---

## 10. Reuse Contract for Inverters, AC Voltage Controllers, and Choppers

Every new Power Electronics module must begin from the same workspace template. The electrical content below changes, but the visual and interaction grammar does not.

| Tool | Left rail: required family of controls | Upper-right scope | Lower-right diagram |
|---|---|---|---|
| **Inverters** | DC-link source, topology, PWM/modulation strategy, modulation index, switching frequency, load, filter, and gate settings | DC link, phase/line voltage, load current, reference/modulating signal when useful | VSI/CSI topology SVG with highlighted switching path |
| **AC Voltage Controller** | Source phase, topology, firing angle, load, FWD/triac/SCR behavior as relevant | Input voltage, chopped output voltage, current, conduction window | Anti-parallel SCR or triac controller SVG |
| **Choppers** | Chopper class, source, duty ratio, switching frequency, load, freewheel path, component values | Input/DC link, chopped output voltage, inductor/load current, duty marker | Buck/boost/buck-boost topology SVG |
| **Rectifiers** | Phase, rectifier type, subtype, source/firing, load/FWD/component values | \(V_{in}\), \(V_o\), \(I_o\); phase traces where applicable | Controlled rectifier SVG |

### 10.1 Mandatory invariants for every new tool

1. Keep the **four equal-width Power Electronics navigation tabs** unchanged.
2. Keep the **left full-height control/metrics rail**, **upper-right scope**, and **lower-right circuit diagram**.
3. Keep the same major card primitive, option-matrix buttons, numeric-field behavior, selected state, focus treatment, and metric-cell geometry.
4. Keep variables, units, equations, values, tooltips, axes, and metrics in KaTeX; keep ordinary structural text in technical sans-serif.
5. Use a unified correlated scope unless the electrical concept demonstrably needs separate views.
6. Name and color all physical signals consistently; never reuse one trace color for different physical meanings inside the same chart.
7. Use a tool-specific SVG diagram in the lower-right bay. It should react to the selected topology/configuration rather than remain generic in a production implementation.
8. Add an automated numerical audit appropriate to the topology before presenting the module as a simulator.

---

## 11. Implementation Checklist for the Next Power Electronics Tool

| Stage | Required action | Definition of done |
|---|---|---|
| 1. Chassis | Reuse the common outer grid and card primitives | Left rail, scope, and diagram occupy the correct zones on desktop and stack in the documented order on mobile |
| 2. Inputs | Define only physically meaningful control states | Every option updates state immediately; irrelevant numeric fields disable cleanly |
| 3. Engine | Implement a clearly stated idealized or nonidealized model | Timebase, units, switching conditions, and state equations are explicit and testable |
| 4. Scope | Use one shared time/sample array for all plotted traces | Labels, left/right axes, legends, tooltip values, and units agree with the model |
| 5. Metrics | Calculate values from settled samples rather than hard-coded formulas only | Metric units, definitions, and integration window are documented |
| 6. Audit | Combine configuration matrix tests with analytical invariants | Cases cover all modes, input formats, and key edge conditions |
| 7. Visual validation | Capture desktop and mobile renders | No clipped cards, duplicate numeric values, unreadable traces, or unused structural gaps |
| 8. Publication | Save a checkpoint after validation | The published version is traceable and reversible |

---

## 12. Final Operating Notes

The Rectifier Studio is now the **reference implementation** for the Power Electronics Simulator. Its layout should be copied first, then its content should be substituted deliberately. The most important rules are visual consistency, a single coherent scope, typed and audited numerical logic, and a clear distinction between normal interface language and mathematical notation.

The current Rectifier Studio should be treated as an idealized educational simulation. Any future request for device drops, source impedance, transformer leakage, commutation overlap, snubber behavior, harmonics, semiconductor loss, thermal behavior, or closed-loop control requires an explicit model extension and a new audit set. These effects must not be approximated silently.

## References

[1] [Virtual Labs IIT Roorkee, “Single Phase Full Wave Silicon Controlled Rectifier with R Load, RL Load & RLE Load.”](https://pe-iitr.vlabs.ac.in/exp/single-full-silicon/theory.html)

[2] [Virtual Labs IIT Roorkee, “Three Phase Full Wave Silicon Controlled Rectifier with R Load, RL Load & RLE Load.”](https://pe-iitr.vlabs.ac.in/exp/three-full-silicon/theory.html)

[3] [Monolithic Power Systems, “Phase Controlled Rectifiers.”](https://www.monolithicpower.com/en/learning/mpscholar/ac-power/ac-dc-power-conversion-techniques/phase-controlled-rectifiers)
