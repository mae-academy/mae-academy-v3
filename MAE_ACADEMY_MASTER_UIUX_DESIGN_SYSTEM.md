# MAE Academy - Master UI/UX & Design System Documentation

**Document type:** Frontend design-system handover  
**Scope:** Visual identity, theme behavior, spatial composition, interaction, SVG/Canvas presentation, responsive design, and localization.  
**Excluded scope:** Mathematical solvers, physics algorithms, and simulation-engine implementation details.

> **Design premise.** MAE Academy presents interactive engineering instruments, not generic dashboards. Every surface must make the sequence of work legible: inputs, workspace, and analytical results remain distinct, adjacent, and visually connected.

## 1. Brand Identity & Typography

The MAE Academy visual language is precise, calm, and academic. It uses an engineering shell, clear working surfaces, disciplined borders, and a restrained accent system. Control Systems and Power Electronics are the reference patterns for hierarchy, spacing, pane roles, and interaction behavior.

| Content class | Required treatment | Usage |
|---|---|---|
| Arabic interface text | `Tajawal` | Navigation, labels, instructions, field names, and assistance content. |
| English interface text | Inter or Roboto-compatible sans-serif | Tool labels, tab names, button text, headings, and descriptions. |
| Numerical and code values | `font-mono` | Matrices, numeric readouts, coordinates, bit values, Verilog, and diagnostics. |
| Academic notation | KaTeX | Equations, truth values, Boolean variables, units, integrals, limits, vectors, and matrices. |
| Mathematical direction | `dir="ltr"` | Required inside RTL layouts to preserve symbolic order and numerical meaning. |

Headings identify instruments and work areas. Helper text is short, instructional, and subordinate to the data. Body text must never compete with a formula, graph, or schematic. Raw parser text, internal node IDs, UUIDs, and unrendered LaTeX are not learner-facing content.

### 1.1 Semantic colors

| Meaning | Preferred treatment | Permitted use |
|---|---|---|
| Primary / active | `text-indigo-600` and `bg-indigo-600` | Selected mode, current tool, primary command, and intentional focus. |
| Error / invalid | `text-red-500` | Parse failure, invalid input, destructive action, and error state. |
| Success / snap | `text-emerald-500` | Valid configuration, successful snap, accepted state, and stable result. |
| Neutral engineering geometry | `#3b4449` light / `#E5E7EB` dark | Symbols, terminals, axes, arrows, and structural SVG lines. |
| DC rail | `#3b4449` light / `#E5E7EB` dark | T-shaped DC rails only; blue rail treatment is prohibited. |

## 2. Light / Dark Theme Engine

The centralized theme context drives Tailwind `dark:` variants. Theme changes preserve the current route and local simulator state. Every surface, border, stroke, label, and active control must be checked in both themes.

| Layer | Light mode | Dark mode | Role |
|---|---|---|---|
| Application shell | `bg-gray-50` | `bg-gray-950` | Quiet environmental frame. |
| Workspace / drawing paper | `bg-white` | elevated `bg-gray-900` | Primary analytical and interactive surface. |
| Card / sidebar | white, `border-gray-200` | `bg-gray-900`, `border-gray-800` | Inputs, results, and secondary instruments. |
| SVG stroke | `#3b4449` | `#E5E7EB` | Electrical, logic, mathematical, and coordinate geometry. |
| Canvas grid | `rgba(0,0,0,0.1)` | `rgba(255,255,255,0.1)` | Construction and alignment context. |

Do not simulate dark mode through isolated arbitrary colors. All added color combinations must have a deliberate dark counterpart and sufficient contrast. Gradients may identify a selected local tool when already established in the suite, but cannot replace a clear active-state boundary or accessible text contrast.

## 3. Page-by-Page Spatial Architecture

### 3.1 Practical Simulations dashboard

The simulations landing field uses a responsive card grid:

```text
grid grid-cols-1 md:grid-cols-3 gap-6
```

| Card part | Visual contract | Interaction contract |
|---|---|---|
| Container | `bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm` | The whole card is one route affordance; do not create nested anchors. |
| Icon | Domain-specific SVG, approximately `w-12 h-12` | Communicates the simulator discipline at a glance. |
| Title | `text-lg font-semibold` | Concise, readable studio identity. |
| Description | muted `text-gray-500` | States the learning task, not generic marketing copy. |
| Tags | restrained badges | Indicate category without visual noise. |
| Hover | 300ms ease-out; `hover:-translate-y-1`, soft shadow, indigo border signal | Confirms the card opens an instrument. |

### 3.2 Universal simulator workspace

All full engineering workbenches follow the three-pane Control/Power blueprint.

| Pane | CSS contract | Contents | Visual responsibility |
|---|---|---|---|
| Left: Library / Inputs | `w-80` or `w-96`, `border-r`, `overflow-y-auto` | Component library, presets, equation entry, numeric inputs, sliders, and configuration. | Fixed, scrollable, calm, and clearly separate from drawing. |
| Center: Workspace | `flex-1 relative` | Main SVG/Canvas, grid, pan/zoom field, diagram, waveform, plot, or graph. | Receives most width and remains free of obstructing controls. |
| Right: Inspector / Analytics | `w-80` or `w-96`, `border-l` | Selected item properties, result tables, solver status, charts, and diagnostics. | Context-sensitive and subordinate to the central work field. |

At narrow widths, panes stack in the meaningful sequence **inputs → workspace → results**. Mobile responsiveness cannot hide essential interaction; table/canvas overflow must be intentional and accessible rather than clipped.

### 3.3 Navigation and local tools

Route-based studios use the segmented navigation owned by `SimulatorLayout.tsx`. Digital Logic has one external workspace route and a local segmented control that preserves the mounted Schematic Workspace while users move between analysis tools. Both patterns require a clear active state, readable inactive labels, keyboard focus, and stable tab identity.

## 4. Micro-interactions & Motion

Motion is functional feedback. It clarifies state change, not merely decoration.

| Interaction | Timing | Implementation rule |
|---|---:|---|
| Button and card hover | 150–300ms | Prefer transform and opacity; provide a responsive pressed state. |
| Tab or panel change | 180–300ms | Use a short, interruptible transition that preserves focus. |
| Modal / inspector entrance | 200–500ms | Enter from opacity plus modest `scale(0.95)`; never scale from zero. |
| Canvas or SVG movement | per frame | Drive with `requestAnimationFrame` and refs, not React state per frame. |
| Heavy recalculation | debounced | Keep visual feedback immediate; debounce expensive commit by approximately 50ms. |

All non-essential animation obeys `prefers-reduced-motion`. Keyboard actions are immediate. Default timing should use a purposeful ease-out curve; sluggish `ease-in` motion is not used for interaction feedback.

### 4.1 Pan and zoom

The center workspace can create an infinite-feeling drawing field while retaining stable coordinates. Wheel zoom is heavily damped (for example `DAMPING = 0.001`), panning follows pointer input, and the current transform is held in mutable refs. Durable React state changes only when a user completes placement, selection, connection, or configuration.

### 4.2 Canvas and SVG performance boundary

React `setState` is forbidden inside high-frequency animation and render loops. Canvas/SVG renderers read a current snapshot through `useRef`, schedule one `requestAnimationFrame`, and observe typed solver or UI commits. This boundary protects 60fps behavior in waveforms, root-locus sweeps, convolution fields, continuous plots, drag tools, and zoom surfaces.

## 5. Engineering Geometry & Rendering Rules

### 5.1 Grid snapping and wires

Circuit and schematic-oriented Digital Logic workspaces use the fixed 25px grid:

$$v_{snap}=\operatorname{round}\left(\frac{v}{25}\right)\times25.$$

Terminals must meet wire endpoints exactly. Circuit wires use a strict single-bend 90° Manhattan route; chaotic zig-zags, multiple unnecessary elbows, and decorative net splines are prohibited. Snap feedback is visible through the emerald semantic state, never through an unexplained geometry jump.

### 5.2 Rigid-body rotation and label anti-rotation

Rotatable components are rendered inside one shared SVG `<g>` transform so every path, pin, and adornment rotates as a rigid body. Text labels apply an inverse rotation and remain horizontally readable at 0° orientation. This applies to variable resistors, logic gates, IC blocks, circuit components, and all attached identifiers.

### 5.3 Diagram type rules

| Diagram | Required visual treatment |
|---|---|
| E-Circuit schematic | Neutral engineering stroke, 25px grid, terminal alignment, Manhattan nets, upright labels. |
| Digital logic | IEEE/ANSI-style gate geometry, external output lead, bubbles and terminals aligned on the symbol axis. |
| Continuous signal | Smooth sampled polyline with clear axes and deliberate discontinuity handling. |
| Discrete signal | Stem/lollipop plot: vertical sample line ending in a circle; never a continuous line between samples. |
| Dirac impulse | A vertical mathematical arrow labeled with KaTeX $\delta(t)$. |
| Pole-zero map | Axes, poles `×`, zeros `○`, and an explicit unit circle in $z$-plane mode. |
| Tables and matrices | Stable headers, fixed numerical alignment, monospace values, and KaTeX for structural mathematics. |

## 6. Inputs, Controls & Feedback

Each parameter tool is an engineering instrument composed of a visible label, an exact input, optional slider, and units or prefix selector where appropriate.

| Control | Mandatory behavior |
|---|---|
| Range slider | Immediate lightweight visual response; accessible label and exact current value. |
| Numeric input | Synchronized with its slider and commits normalized solver input. |
| Prefix selector | Supports `p`, `n`, `µ`, `m`, `k`, `M`, and `G`; `1 k` is displayed while the engine receives `1000`. |
| Expression editor | Shows parse state; preserves the last valid output during an invalid edit; previews academic notation with KaTeX. |
| Reset / clear control | Clearly labeled, predictable, and visually secondary or destructive according to effect. |
| Error display | Red feedback plus recovery guidance; color is not the only cue. |

The feedback taxonomy remains consistent across suites.

| State | Visual treatment | Copy behavior |
|---|---|---|
| Default | Neutral field and muted guidance | Describe the action briefly. |
| Hover / focus | Mild elevation or boundary emphasis and an obvious focus ring | No tooltip for self-evident actions. |
| Selected | Indigo/blue active state or bounding treatment | Identify the selected entity. |
| Valid / snap | Emerald state | Confirm the accepted state concisely. |
| Invalid | Red state | Explain repair without destroying the last useful result. |
| Unknown / don’t-care | Distinct diagnostic tone; never falsely render as zero | Display `X` / `Z` and academic meaning. |
| Running | Focused time/signal state plus pause/stop affordance | State the active simulation mode. |

## 7. Mathematical Presentation & RTL

KaTeX is the universal mathematical presentation layer. It renders variables, units, truth tables, state subscripts, Boolean groups, matrices, integrals, and analytical summaries. All mathematical wrappers are LTR even when Arabic application copy uses RTL.

| Academic scenario | Presentation rule |
|---|---|
| Boolean expression | Show grouped terms correctly; postfix complement must remain visible as a prime or correct overbar. |
| Parenthesized complement | Complement applies to the whole parenthesized term, not only the final symbol. |
| Truth/K-Map values | Use consistent `0`, `1`, `X`, and `Z` output styling; headers and results remain aligned. |
| Derivation steps | Each stage has a short explanatory label and a readable KaTeX equation. |
| Code / HDL | Uses `font-mono`, stable copy action, and LTR direction. |

## 8. Component Composition & Ownership

Reusable visual primitives belong in `client/src/components/ui/` or an established suite-specific component folder. A simulator adapter owns presentation and local controls; it does not duplicate a maintained modal, KaTeX wrapper, tab shell, form primitive, or table primitive. `SimulatorLayout.tsx` owns the global route-studio frame. `SimulationDetail.tsx` owns suite/tool dispatch, not a simulator’s local visual or mathematical state.

Each canvas or SVG field has one source of geometry. Pointer input may mutate transient refs; durable state changes are committed when an action completes. SVG definitions such as markers, clip paths, and patterns use namespaced identifiers so multiple diagrams can coexist. React keys are stable semantic IDs and are never inferred from repeatable display text.

## 9. Responsive, Accessibility & Localization QA

| Area | Required verification |
|---|---|
| Theme | Light/dark text, surfaces, borders, strokes, axes, and focus states remain readable. |
| Keyboard | Tabs, controls, dialogs, sliders, and reset actions are navigable with a visible focus ring. |
| Screen-reader status | Validation, selected entities, and running/error states are announced meaningfully. |
| RTL | Arabic labels flip with the layout, while math, code, bits, and values remain LTR. |
| Touch | Hit targets remain sufficiently large and canvas interactions do not depend on hover alone. |
| Responsive | Inputs, workspace, and results stack deliberately without hiding necessary controls. |
| Motion | Reduced-motion preference is respected; no high-frequency React rendering appears. |

## 10. Visual Release Checklist

Before a frontend update is published, the owner confirms the following.

1. The route, page title, and active tab reflect the tool actually rendered.
2. The layout honors the input-to-workspace-to-result sequence and contains no detached card clutter.
3. SVG/Canvas geometry has correct terminal joins, clip bounds, arrowheads, grid alignment, and label orientation.
4. KaTeX contains no raw source leaks and remains LTR in Arabic mode.
5. Light and dark screenshots show correct contrast and semantic color cues.
6. Console output contains no fresh duplicate-key warnings, render errors, or unhandled rejections.
7. Responsive and keyboard checks preserve all core interaction.

## 11. Governance & Change Control

Every new simulator or local analysis tool identifies its input, workspace, and result responsibilities before UI construction. The team selects the closest Control/Power benchmark, applies established theme and typography tokens, and validates the first working composition visually. A targeted feature must not rewrite unrelated stable tool trees or erase local workspace state.

Global modifications to typography, theme mechanics, shared simulator layout, or SVG stroke policy require cross-suite review. Asset additions follow the project’s static-asset policy and do not introduce large local media files into deployed source folders.

## 12. Sign-Off & Approvals

This handover is accepted when the responsible teams agree to apply the visual and interaction contract to all future frontend work.

| Approval role | Name | Signature | Date | Approval scope |
|---|---|---|---|---|
| Product / Learning Owner |  |  |  | Learning clarity, hierarchy, and simulator discoverability. |
| UI/UX Director |  |  |  | Brand expression, tokens, interaction language, and responsive design. |
| Principal Frontend Architect |  |  |  | Component ownership, routing, themes, localization, and rendering performance. |
| Accessibility Reviewer |  |  |  | Keyboard, focus, semantic names, contrast, RTL/LTR, and reduced-motion coverage. |
| Quality Assurance Lead |  |  |  | Visual regression and release-checklist conformance. |

> **Handover commitment.** MAE Academy’s interface exists to clarify engineering work. The design system does not decorate computation: it makes inputs traceable, workspaces navigable, and results academically legible.

## References

[1]: ./MAE_ACADEMY_MASTER_PROJECT_HANDOVER.md "MAE Academy - Master Project Handover Documentation"
