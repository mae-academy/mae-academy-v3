# MAE Academy — General Project Handoff

> **Purpose.** This is the starting document for a new developer, environment, or agent session. It gives a practical picture of what MAE Academy is, where important code lives, what must be preserved, and where work should continue. For deeper reference, read `project-architecture-and-style.md`, `circuit-simulator-engine.md`, and `tab-d-documented-technical-report.md` after this overview.

## 1. Project Overview

MAE Academy is a multilingual engineering-learning platform built around **Model. Analyze. Engineering.** It combines academic content with practical browser-based studios so learners can model systems, inspect evidence, and interact with engineering equations rather than only read about them.

The main product areas are research, courses, about/founder content, and **Practical Simulations**. The simulation collection includes Control Systems, Power Electronics, PLC, Assembler, Linear Algebra, and E-Circuits. E-Circuits is the most technically layered area and has four intentionally separate tabs: Classic (A), Advanced (B), Legacy (C), and Documented (D).

| Capability | What the project provides |
|---|---|
| Academic content | Research, course, and public platform pages with English, Arabic, and Spanish content. |
| Global experience | Persistent header/footer, light/dark mode, RTL Arabic layout, responsive navigation, and route transitions. |
| Interactive studios | Control-system, power-electronics, PLC, assembler, linear-algebra, and circuit-simulation tools. |
| Mathematics | Custom TypeScript math engines, matrix analysis, and KaTeX-rendered educational notation. |
| E-Circuits | SVG circuit workspace, catalog, grid, terminals, wires, properties inspector, simulation snapshots, and academic analysis. |
| Robust simulation path | Tab D isolated documented MNA, nonlinear Newton–Raphson handling, solver warnings, 25px terminal lattice, and orthogonal wiring. |

## 2. Technology Stack

| Area | Technology | Declared version / role |
|---|---|---|
| Language | TypeScript | `5.6.3`; used across UI, math, and tests. |
| UI framework | React + React DOM | `19.2.1`; client-rendered component architecture. |
| Build system | Vite | `7.1.7`; development server and browser build. |
| Routing | Wouter | `3.3.5`; client-side routes. |
| Styling | Tailwind CSS | `4.1.14`; utility classes plus `client/src/index.css`. |
| UI primitives | Local shadcn-style wrappers + Radix UI | Accessible dialogs, menus, inputs, tooltips, tabs, etc. |
| Motion | Framer Motion | `12.23.22`; route and interface motion. |
| Math notation | KaTeX + React KaTeX | `0.18.4` / `3.1.0`; academic equations and units. |
| Matrix utilities | `ml-matrix` | `6.15.0`; matrix-oriented calculations. |
| Charts / icons | Recharts / Lucide React | `2.15.2` / `0.453.0`. |
| Testing | Vitest | `2.1.4`; solver, geometry, symbol, and data tests. |
| Production entry | Express + esbuild | Compatibility production bundle; the app is frontend-oriented. |

Common commands are `pnpm dev`, `pnpm check`, `pnpm vitest run`, and `pnpm build`.

## 3. Simplified Project Structure

```text
mae-academy/
├── client/
│   ├── index.html                  Browser shell.
│   └── src/
│       ├── App.tsx                 Application router and global providers.
│       ├── index.css               Global MAE tokens, fonts, Tailwind, scoped studio styles.
│       ├── pages/                  Public pages and SimulationDetail route dispatcher.
│       ├── components/             Shared layout, navigation, studios, and UI primitives.
│       ├── contexts/               Locale and theme context.
│       ├── data/                   Multilingual content and route metadata.
│       ├── hooks/                  Shared interaction hooks.
│       ├── lib/                    General math engines and domain helpers.
│       └── v3-simulator/           Advanced/Documented E-Circuits feature boundary.
│           ├── V3SimulatorApp.tsx  Tab B mount.
│           ├── V3SimulatorAppD.tsx Tab D mount and isolated engine injection.
│           ├── pages/Home.tsx      Shared V3 workspace, grid, inspector, interactions.
│           ├── lib/                Circuit types, definitions, symbols, wiring, MNA, tests.
│           └── components/         V3-local visual and math components.
├── server/                          Production compatibility entry.
├── shared/                          Shared/template compatibility space.
├── package.json                     Scripts and declared dependencies.
├── project-architecture-and-style.md Detailed architecture and style reference.
├── circuit-simulator-engine.md      Full E-Circuits engine reference.
├── tab-d-documented-technical-report.md Deep Tab D-only technical reference.
└── todo-gwqymafb.md                 Active project task checklist.
```

## 4. General UI/UX and Styling

The visual system is called **Luminous Technical Atelier**. It uses technical-paper framing, quiet surfaces, thin borders, blueprint-like rules, and a restrained blue–violet–rose signal gradient. Avoid generic dashboard cards, heavy shadows, decorative gradients everywhere, or unrelated fonts.

| Design aspect | Current convention |
|---|---|
| Light base | Background `#F7F8FC`, text `#0F172A`, border `#DBE3EF`. |
| Dark base | Background `#07111F`, light text `#F8FAFC`, low-opacity white borders. |
| Signal palette | Blue `#2563EB`, violet `#8B5CF6` / `#7C3AED`, rose `#F43F5E` / `#FB7185`. |
| Typography | System sans for Latin UI; Tajawal for Arabic/RTL; display type uses a tight, heavy editorial treatment. |
| CSS method | Tailwind utilities first; global rules and scoped studio styles in `client/src/index.css`. |
| Layout | Grid for repeated/studio structure, flex for control rails; preserve `min-w-0` in shrinkable flex children. |
| Theme / RTL | `MainLayout` stores locale/theme in localStorage and updates root `.dark`, `lang`, and `dir`. |
| Motion | Prefer transform/opacity, short snappy transitions, and honor reduced-motion settings. |

## 5. Core Components and Logic

| Area | Main files | Simplified explanation |
|---|---|---|
| Application shell | `MainLayout.tsx`, `Header.tsx`, `App.tsx` | Maintains global navigation, theme, locale, footer, and animated routes. |
| Route dispatch | `SimulationDetail.tsx`, `data/platform.ts` | Resolves the requested simulation and mounts the correct tool/tab. |
| Content / locale | `data/content.ts`, `LocaleContext.tsx` | Supplies English, Arabic, and Spanish copy with RTL support. |
| UI primitives | `components/ui/*` | Reusable accessible controls built on Radix wrappers. |
| Non-circuit studios | `components/control`, `power`, `plc`, `assembler`, `linearAlgebra` | Each owns its own specialized UI and mathematical state. |
| E-Circuits Tabs A–D | `components/circuit/*` | Four bounded implementations under one E-Circuits route. |
| V3 circuit workspace | `v3-simulator/pages/Home.tsx` | SVG scene, library, inspector, camera, selection, grid, and wire interaction for Tabs B/D. |
| Circuit data | `circuitTypes.ts`, `componentDefs.ts` | Component, wire, selection, snapshot contracts; catalog terminals and properties. |
| Symbols / geometry | `symbols.tsx`, `wiring.ts`, `tabDCanvasGeometry.ts` | SVG symbols, grid snapping, terminal maps, wire routing, and Tab D-only coordinate rules. |
| Tab D runtime | `tabDSimulation.ts`, `tabDDocumentedMna.ts`, `tabDNewtonMna.ts` | Union-find topology, documented MNA primitive compilation, LU solve, nonlinear companions, snapshot warnings. |

## 6. Core Development Guidelines

1. **Respect feature boundaries.** Tabs A, B, C, and D are not interchangeable. Tab D additions must stay scoped to its injected runtime/refinement path unless a change is explicitly intended for all V3 tabs.
2. **Keep visual terminals and electrical terminals synchronized.** If an SVG body, terminal coordinate, symbol scale, or grid changes, update terminal maps, wire endpoints, snap logic, and tests together.
3. **Separate math from JSX.** Add new solver logic as pure TypeScript with deterministic tests before connecting it to a UI control. Do not hide a numerical failure with invented values.
4. **Preserve light/dark/RTL behavior.** New UI needs explicit contrast in both themes and logical directional spacing for Arabic.
5. **Validate every meaningful change.** Run TypeScript, relevant Vitest tests, and production build; browser-check affected routes and especially Tab B/Tab C after Tab D work.

## 7. Current State and Next Session

### Current verified state

The project is currently stable and the most recent work was **documentation-only**. The last application change before this general handoff aligned Tab D resistor, potentiometer, and Star-network terminals to the exact 25px lattice while preserving their symmetric SVG geometry. Prior Tab D work also delivered documented SVG symbols, a smart material-selectable diode, gentle pointer-anchored zoom, Dot/Cartesian registration, orthogonal terminal-aware routing, and isolated documented MNA/Newton behavior.

At the last verified application checkpoint, TypeScript passed, the Vitest suite reported **19 files / 102 tests passing**, and the production build passed. A non-blocking large-bundle advisory remains during builds. Tabs B and C were checked after the Tab D refinements and remained available.

### Immediate next steps

No functional bug is currently left as an active mandatory task. The next session should begin by reading the three technical documents listed above and selecting an explicit Tab D priority. Recommended next work is one of the following:

| Priority | Why it is useful | First safe action |
|---|---|---|
| Interactive circuit acceptance suite | Confirms real source–resistor–ground, Star, diode, and instrument flows beyond unit tests. | Create browser-level scripted scenarios and record expected voltage/current outcomes. |
| Visual terminal hover / route guidance | Makes the advanced wiring system easier for learners to discover. | Add a Tab D-only hover state and a short “click to lock corner” hint without changing topology. |
| Simulator design decisions | Prevents future unintentional cross-tab regressions. | Add small ADR records for grid registration, terminal authority, and Tab D runtime isolation. |

## 8. Handoff Notes

The source code is the final authority. Use this file as the fast orientation document; use the detailed handoffs before making architectural or solver changes. If an incoming request conflicts with the existing tab boundary or math contract, clarify scope before editing. Update this document whenever the active next-step priority or current verified baseline changes.
