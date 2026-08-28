# MAE Academy — Project Architecture and Style Guide

> **Purpose.** This document is the primary technical and visual handoff for MAE Academy. It describes the current repository as implemented, not a proposed redesign. Treat it as the default contract for future work: preserve its page shell, multilingual behavior, dark/light semantics, MAE visual language, and simulator boundaries unless a change request explicitly authorizes a broader refactor.

## 1. Executive Overview

MAE Academy is a client-rendered engineering education platform organized around the idea **“Model. Analyze. Engineering.”** The public experience combines research, course, founder, and simulation pages. Its practical-simulations area hosts several interactive technical studios, including control systems, power electronics, PLC, assembler, linear algebra, and **E-Circuits**.

E-Circuits is intentionally split into four independently bounded tabs. Tab A is a native standalone circuit bench, Tab B is the stable advanced V3 simulator, Tab C is an archived same-origin legacy editor, and Tab D shares Tab B’s visual workspace while running an isolated documented MNA runtime. This isolation is a central architectural decision: work in Tab D must not change Tab B’s behavior or the archival Tab C bundle.

| Concern | Current implementation |
|---|---|
| Application form | Static React single-page application served by Vite; a small Express entry is bundled for production compatibility. |
| Primary language | TypeScript with React JSX/TSX. |
| Client routing | Wouter. |
| Styling | Tailwind CSS v4 utility classes plus one intentional global stylesheet, `client/src/index.css`. |
| UI primitives | Local shadcn-style wrappers backed by Radix UI primitives. |
| Motion | Framer Motion route and studio transitions; reduced-motion override in global CSS. |
| Mathematics | `ml-matrix`, custom TypeScript solvers, and KaTeX/`react-katex` for academic notation. |
| Circuit rendering | Native SVG and React DOM; archived Tab C is an embedded same-origin legacy document. |
| Internationalization | English, Arabic, and Spanish content; Arabic switches `<html>` to RTL and Tajawal. |
| Persistence | Browser `localStorage` for theme and locale; selected tools also own scoped browser-side state. |

## 2. Technology Stack and Versions

The package manifest declares project version **1.0.0**, ESM module mode, and pnpm as the package manager. Version ranges below are copied from `package.json`; lockfile resolution may be more specific.

| Layer | Libraries / framework | Declared version | Role in this repository |
|---|---|---:|---|
| Runtime | React, React DOM | `19.2.1` | Component rendering and client state. |
| Language | TypeScript | `5.6.3` | Static typing for the application, solvers, and tests. |
| Build | Vite | `7.1.7` | Development server, HMR, production client build. |
| React/Vite bridge | `@vitejs/plugin-react` | `5.0.4` | JSX transformation and React integration. |
| Styling | Tailwind CSS | `4.1.14` | Utility-first layout, color, responsive, and dark-mode styling. |
| Tailwind integration | `@tailwindcss/vite`, `tw-animate-css`, `tailwindcss-animate` | `4.1.3`, `1.4.0`, `1.0.7` | Vite integration and reusable animation utilities. |
| Router | Wouter | `3.3.5` | Lightweight client-side route matching and navigation. |
| Animation | Framer Motion | `12.23.22` | Route transitions and selectively animated studio UI. |
| Icons | Lucide React | `0.453.0` | Consistent outlined interface iconography. |
| Accessible primitives | Radix UI family | `1.x–2.x` | Dialog, menus, tabs, tooltip, select, slider, scroll area, and other local UI wrappers. |
| Forms | React Hook Form, Zod, Hookform resolvers | `7.64.0`, `4.1.12`, `5.2.2` | Structured user input where a studio requires it. |
| Math notation | KaTeX, React KaTeX | `0.18.4`, `3.1.0` | Academic electrical and mathematical notation. |
| Matrix algebra | `ml-matrix` | `6.15.0` | Matrix support for simulation and analysis work. |
| Charts | Recharts | `2.15.2` | Plotting in analytical studios. |
| UI utilities | `clsx`, `tailwind-merge`, CVA | `2.1.1`, `3.3.1`, `0.7.1` | Class composition and component variants. |
| Notifications | Sonner | `2.0.7` | Global non-blocking toast feedback. |
| Server compatibility | Express, esbuild | `4.21.2`, `0.25.0` | Production bundle entry; this project remains frontend-oriented. |
| Testing | Vitest | `2.1.4` | Unit tests for solvers, geometry, data transforms, and symbols. |
| Formatting | Prettier | `3.6.2` | Source formatting command. |

### 2.1 Package Commands

| Command | Meaning |
|---|---|
| `pnpm dev` | Run Vite on an externally bound host for local development. |
| `pnpm build` | Build Vite client assets, then bundle `server/index.ts` with esbuild. |
| `pnpm start` | Start the production Node entry after building. |
| `pnpm preview` | Run Vite’s static production preview. |
| `pnpm check` | Run TypeScript validation without emitting files. |
| `pnpm format` | Format supported files through Prettier. |
| `pnpm vitest run` | Run the test suite directly through Vitest. |

## 3. Directory Structure

The tree below lists all architectural directories and principal files. Generated directories such as `node_modules/`, `dist/`, browser caches, screenshots, and temporary logs are intentionally excluded.

```text
mae-academy/
├── client/
│   ├── index.html                         Vite HTML shell and application mount target.
│   ├── public/                            Small static configuration assets only.
│   └── src/
│       ├── main.tsx                       React bootstrap; mounts the application.
│       ├── App.tsx                        Router, motion route envelope, global providers.
│       ├── index.css                      Global design tokens, Tailwind imports, scoped studio styles.
│       ├── pages/
│       │   ├── Home.tsx                   Public landing page.
│       │   ├── Research.tsx               Research page.
│       │   ├── Courses.tsx                Course page.
│       │   ├── Simulations.tsx            Simulation index page.
│       │   ├── SimulationDetail.tsx       Simulation router and tool/tab dispatcher.
│       │   ├── About.tsx                  About/founder page.
│       │   └── NotFound.tsx               404 route.
│       ├── components/
│       │   ├── MainLayout.tsx             Persistent header, footer, theme/locale shell.
│       │   ├── Header.tsx                 Sticky top navigation and controls.
│       │   ├── HeaderNavigationSlider.tsx Navigation rail used by the header.
│       │   ├── SimulatorLayout.tsx        Shared simulator title, back link, and segmented tabs.
│       │   ├── ErrorBoundary.tsx          Top-level React failure boundary.
│       │   ├── LanguageTransition.tsx     Locale-switch transition overlay.
│       │   ├── BlueprintVisual.tsx        MAE technical-blueprint visual primitive.
│       │   ├── InteractiveHeroBlueprint.tsx Landing-page visual system.
│       │   ├── CardGridPage.tsx           Reusable editorial card page pattern.
│       │   ├── SimulationToolWorkspace.tsx Generic simulation fallback workspace.
│       │   ├── SimulationWorkspaceSurface.tsx Shared visual surface for tool workspaces.
│       │   ├── Map.tsx                    Wrapped map integration component.
│       │   ├── circuit/
│       │   │   ├── CircuitStudio.tsx      Tab A native SVG circuit bench.
│       │   │   ├── SimulatorTabB.tsx      Tab B wrapper mounting V3 runtime.
│       │   │   ├── SimulatorTabC.tsx      Tab C archival iframe wrapper.
│       │   │   ├── SimulatorTabD.tsx      Tab D documented V3 wrapper.
│       │   │   └── CircuitInstruments.tsx Instrument UI helpers for Tab A.
│       │   ├── control/                  Control Systems studios and input/analysis components.
│       │   ├── power/                    Rectifier, inverter, AC controller, and chopper studios.
│       │   ├── plc/                      Siemens S7-200 and ladder-canvas UI.
│       │   ├── assembler/                Assembler state panels and compact studio.
│       │   ├── linearAlgebra/            Linear algebra studio and visual canvas.
│       │   └── ui/                       Local shadcn/Radix component wrappers.
│       ├── contexts/
│       │   ├── LocaleContext.tsx          Localized copy and RTL-aware client context.
│       │   └── ThemeContext.tsx           Theme helper context where imported.
│       ├── data/
│       │   ├── content.ts                Multilingual page and interface content registry.
│       │   └── platform.ts               Route, simulation-card, and tab metadata.
│       ├── hooks/                        Reusable UI and simulator hooks.
│       ├── lib/                          Pure math engines and non-V3 domain helpers.
│       └── v3-simulator/                 Self-contained V3 E-Circuits feature boundary.
│           ├── V3SimulatorApp.tsx        Tab B mount; stable advanced runtime.
│           ├── V3SimulatorAppD.tsx       Tab D mount; isolated documented MNA runtime.
│           ├── pages/Home.tsx            Shared V3 SVG workspace, inspector, and interaction UI.
│           ├── lib/
│           │   ├── circuitTypes.ts       Circuit, wire, selection, reading, snapshot data contracts.
│           │   ├── componentDefs.ts      Component registry, terminals, properties, categories.
│           │   ├── symbols.tsx           SVG symbol renderers and Tab D documented variants.
│           │   ├── wiring.ts             Geometry, snapping, routing, and endpoint utilities.
│           │   ├── tabDCanvasGeometry.ts Tab D grid, terminal, zoom, and orthogonal-route helpers.
│           │   ├── simulation.ts         General simulation engine used as the stable base.
│           │   ├── tabDSimulation.ts     Isolated Tab D runtime and primitive compiler.
│           │   ├── tabDDocumentedMna.ts  Tab D MNA primitive solver.
│           │   ├── tabDNewtonMna.ts      Newton–Raphson nonlinear MNA solver and Shockley devices.
│           │   ├── tabDResultAdapter.ts  Guarded observable operating-point adapter.
│           │   ├── mnaSolver.ts          Tab B/DC MNA solver path.
│           │   ├── NormalizedCircuitGraph.ts Graph normalization and net analysis.
│           │   ├── NodalSolver.ts        Nodal-analysis derivation support.
│           │   ├── MeshSolver.ts         Mesh-analysis derivation support.
│           │   ├── TheveninSolver.ts     Thévenin analysis support.
│           │   ├── SuperpositionSolver.ts Superposition analysis support.
│           │   └── *.test.ts(x)          Unit tests for solvers, geometry, symbols, and formats.
│           ├── components/               V3-specific math, scope, instrument, and local UI pieces.
│           ├── hooks/                    V3 simulation lifecycle hooks.
│           └── contexts/                 V3 scoped theme support.
├── server/
│   └── index.ts                          Small production entry bundled by the build script.
├── shared/                               Compatibility/shared type area used by imported templates.
├── package.json                          Scripts, packages, and version declarations.
├── pnpm-lock.yaml                        Locked dependency graph.
├── vite.config.ts                        Vite and plugin configuration.
├── tsconfig.json                         TypeScript compiler configuration.
├── tsconfig.node.json                    Node-side TypeScript configuration.
├── components.json                       Local shadcn-style component configuration.
├── README.md                             Template/project development guidance.
├── ideas.md                              Product and design decisions when maintained.
├── todo-gwqymafb.md                      Active engineering task checklist.
├── project-architecture-and-style.md     This handoff document.
└── circuit-simulator-engine.md           Dedicated simulator handoff document.
```

### 3.1 Structural Responsibilities

The important boundary is not merely folders; it is **ownership**. Public pages own editorial content. `MainLayout` owns persistent site chrome, locale, direction, and dark mode. `SimulationDetail` owns simulator route selection and shared framing. Each studio owns its computational state. The V3 simulator owns its own feature-local domain models and must not leak its former standalone stylesheet into the broader site.

## 4. Style Guide and UI/UX Contract

### 4.1 Visual Direction

The system calls its visual language **Luminous Technical Atelier**. It combines technical-drafting structure with editorial spacing and a controlled blue–violet–rose signal gradient. Surfaces are quiet; hierarchy comes from type scale, thin blueprint rules, card borders, measured glow, and selective signal-color emphasis—not from heavy shadows, excessive gradients, or rounded “marketing dashboard” cards everywhere.

### 4.2 Canonical Color Tokens

The core system colors are the required defaults for new MAE page and product work. Prefer Tailwind semantic shades when a class already expresses the same color; reserve inline SVG colors for circuit symbols, plots, and other graphics where CSS inheritance is insufficient.

| Purpose | Hex / CSS source | Notes |
|---|---|---|
| Light application background | `#F7F8FC` | `--background` in `:root`. |
| Dark application background | `#07111F` | `.dark --background`; primary shell dark surface. |
| Light foreground | `#0F172A` | `--foreground`; slate-900-like readable text. |
| Dark foreground | `#F8FAFC` | `--foreground` in dark mode. |
| Light border | `#DBE3EF` | `--border`; quiet framed surfaces. |
| Focus ring | `#7C3AED` / dark `#A78BFA` | `--ring`; use visible focus feedback. |
| Signal blue | `#2563EB` | First stop in MAE signal gradients. |
| Signal violet | `#8B5CF6` | Second stop; structural accent and selection language. |
| Signal rose | `#F43F5E` | Third stop; avoid overuse as generic error color. |
| Signal light rose | `#FB7185` | Rule/highlight endpoint. |
| Simulator line / documented symbol ink | `#1A2744` | Primary Tab D SVG linework. |
| Legacy archival frame | `#0B1525` | Tab C outer archive surface. |
| Circuit dark canvas | `#020617` | Dark circuit drawing field. |
| Success / energized | `#16A34A`, `#10B981` | Success and energized indicator contexts. |
| Warning / attention | `#F59E0B`, `#FBBF24` | Use for non-blocking warnings. |
| Error | `#DC2626`, `#EF4444`, `#E11D48` | Error state, destructive actions, or invalid calculation feedback. |
| Three-phase rail red / yellow / blue | `#D14343`, `#D6A720`, `#2D73B7` | Dedicated electrical phase semantics; do not repurpose for generic UI. |

### 4.3 Explicit Hex Inventory

The following inventory records explicit hex literals found in client source at the time of this handoff. It includes core theme values, studio-specific values, circuit colors, charts, and legacy/embedded tool accents. New work should **not** randomly select from this list; it should start from the canonical table above and remain within the local feature’s semantic palette.

| Group | Explicit values currently present |
|---|---|
| Neutral / paper / ink | `#000`, `#0A0A0A`, `#0F172A`, `#111`, `#111827`, `#1A1A19`, `#1A1A1A`, `#1A2744`, `#1E293B`, `#222`, `#2A2A2A`, `#333`, `#334155`, `#34322D`, `#444`, `#475569`, `#4B5563`, `#52647D`, `#555`, `#64748B`, `#666`, `#777`, `#858481`, `#888`, `#94A3B8`, `#9AAAC1`, `#A8B8CC`, `#AAA`, `#CBD5E1`, `#CCC`, `#D1D5DB`, `#D7E2EF`, `#DBE3EF`, `#DBE7F3`, `#E0F2FE`, `#E2E8F0`, `#EAF0F8`, `#EFF6FF`, `#F1F5FB`, `#F7F8FC`, `#F8F8F7`, `#F8FAFC`, `#F8FBFF`, `#FFF`, `#FFFFFF`. |
| MAE signal / violet-blue-rose | `#2563EB`, `#3B82F6`, `#4488FF`, `#60A5FA`, `#6D28D9`, `#7C3AED`, `#8000FF`, `#818CF8`, `#8B5CF6`, `#93C5FD`, `#A5B4FC`, `#A78BFA`, `#C084FC`, `#C4B5FD`, `#CC44CC`, `#DB2777`, `#F43F5E`, `#F472B6`, `#FB7185`. |
| Dark studio / canvas | `#020617`, `#07111F`, `#0B1525`, `#0C1728`, `#101D31`, `#16243A`, `#172033`, `#1A2E1A`, `#1A3A1A`, `#233652`, `#30415C`, `#3D5F8C`, `#6D91C4`, `#7A93B1`, `#B6DFBC`, `#B7C6A1`, `#D8F3DC`, `#E8F5EA`, `#FFFDE0`. |
| Cyan / teal / green | `#006622`, `#00CC33`, `#00E040`, `#00FF44`, `#00FFFF`, `#08B58D`, `#0F766E`, `#10B981`, `#16A34A`, `#166534`, `#1A3A1A`, `#22D3EE`, `#2A5A2A`, `#303B33`, `#38BDF8`, `#44CC44`, `#4B7B56`, `#5EEAD4`, `#B6DFBC`, `#D8F3DC`. |
| Orange / yellow / red | `#B45309`, `#BE123C`, `#CC0000`, `#D14343`, `#D6A720`, `#D97706`, `#DC2626`, `#E11D48`, `#EF4444`, `#F59E0B`, `#FACC15`, `#FBBF24`, `#FCA5A5`, `#FF2020`, `#FF4444`, `#FF6600`, `#FF8800`, `#FFBF00`, `#FFCC00`, `#FFF1F2`, `#FFF7ED`, `#FFFF00`, `#FFFF80`. |
| Electrical phase / graphic special cases | `#0080FF`, `#0284C7`, `#0369A1`, `#06B6D4`, `#0891B2`, `#2D73B7`, `#44AAFF`, `#BAE6FD`, `#D14343`, `#D6A720`. |

### 4.4 Typography

| Context | Typeface | Typical size / weight | Rule |
|---|---|---|---|
| Default Latin interface/body | Apple Gothic, Apple SD Gothic Neo, Avenir Next, Segoe UI, system sans | Tailwind context-dependent; typical body `text-sm` / `text-base`, 400–500 | Use `font-sans`; do not introduce an unrelated web font. |
| Display headings | Apple SD Gothic Neo / Apple Gothic / Helvetica Neue fallback | Large page headings commonly `text-4xl` to `text-6xl`, weight 800 | Use `.mae-display`; it intentionally applies tight tracking. |
| Card and section headings | Display stack | Approximately `text-lg` to `text-2xl`, weight 700 | Use `.mae-card-title` when appropriate. |
| Arabic UI/content | Tajawal | 400, 500, 700, 800, 900 available | `<html lang="ar">` and RTL contexts select `font-arabic`; do not force Latin tracking in Arabic. |
| Technical values / code / circuit readouts | System monospace stack | Small to normal technical readouts | Use scoped `font-mono` or local SVG text only for machine-like values. |
| MAE footer title block | Display or Tajawal | `9–10px`, 700–800, expanded tracking | A deliberate technical-label treatment, not general body text. |
| Circuit symbols and academic output | SVG text plus KaTeX | Contextual; labels remain upright | Use `react-katex` for equation output. Do not expose raw LaTeX or internal IDs. |

### 4.5 Layout, Spacing, Surface, and Motion Rules

| Topic | Contract |
|---|---|
| Outer container | `.container` is full width with `1.25rem` side padding, becoming `2rem` at 640px and `max-width: 1360px` with `2.5rem` side padding at 1280px. |
| Page structure | Use asymmetric editorial composition or technical studio zones, not generic centered card walls. |
| Spacing | Use Tailwind’s spacing scale. Preserve generous macro spacing between page stations and tighter measured gaps inside controls. Existing simulator zones use clear compartmentalization. |
| Layout primitives | Prefer CSS grid for repeated cards, instrument zones, and structured panels; prefer flex for command rails, alignment, and compact controls. Include `min-w-0` for flex children that may shrink. |
| Borders | Thin `1px` slate/white-alpha borders define technical surfaces. Use gradient rules selectively for signal emphasis; do not frame every nested child. |
| Radius | Technical surfaces generally use medium-to-large rounding (`.75rem`–`1rem` / Tailwind `rounded-xl` or `rounded-2xl`) while inside controls remain tighter. |
| Shadows | Prefer soft, sparse depth. The system favors borders, gradients, noise, and drafting rules rather than heavy floating shadows. |
| Dark mode | Use explicit `dark:` variants or CSS variables. Never put light hardcoded text on a dark surface or inverse. Test both modes. |
| RTL | Arabic must set document direction at the root. Use logical CSS properties (`inset-inline-*`, `margin-inline-*`) where direction matters. |
| Motion | Framer Motion route transition uses a technical camera-pan feel. Keep interaction motion mostly below 300ms; only animate transform/opacity where possible. The global reduced-motion media query must remain effective. |
| Responsive behavior | Maintain readable tool controls at small widths. Do not collapse simulator canvases under growing sidebars; preserve explicitly bounded/scrolling regions. |

## 5. Global and Reusable Components

| Component / area | Location | Responsibility | Extension guidance |
|---|---|---|---|
| Application shell | `components/MainLayout.tsx` | Persistent header/footer, background texture, locale, RTL, dark mode, localStorage persistence. | Do not move route-level tool state into this shell. |
| Navigation | `components/Header.tsx`, `HeaderNavigationSlider.tsx` | Brand mark, global navigation, language selection, theme toggle. | Keep route labels sourced from localized content. |
| Simulator frame | `components/SimulatorLayout.tsx` | Back link, hero title, segmented tab row. | Tool-specific state belongs below this frame. |
| Route dispatcher | `pages/SimulationDetail.tsx` | Chooses studio from URL metadata and mounts circuit tabs. | Preserve the hidden-but-mounted circuit-tab strategy unless lifecycle behavior is deliberately changed. |
| Error containment | `components/ErrorBoundary.tsx` | Avoids unhandled client crashes cascading through the full page tree. | Wrap major new independently failure-prone client areas when justified. |
| Notifications | `components/ui/sonner.tsx`, `App.tsx` | Global toast host. | Use Sonner rather than adding another toast library. |
| Tooltips and primitives | `components/ui/*` | Local wrappers around Radix UI interactions. | Use existing wrappers before hand-rolling modal/menu/select controls. |
| Localization | `contexts/LocaleContext.tsx`, `data/content.ts` | Locale-aware copy and content registry. | Add keys in all supported locales; do not bury user-visible strings in solver modules. |
| Platform metadata | `data/platform.ts` | Route and simulator-card metadata. | Update it together with new simulation routes. |
| Circuit tab wrappers | `components/circuit/*` | Explicit boundaries for Tab A, Tab B, Tab C, Tab D. | Treat these boundaries as compatibility contracts. |

## 6. Core Development Guidelines

> **Primary rule:** make the smallest correct change within the feature boundary that owns the behavior. Do not use a visual request as permission to refactor a solver, and do not use a solver request as permission to replace a stable tab.

| Rule | Required practice |
|---|---|
| Preserve tab boundaries | Tab B is the stable advanced V3 path; Tab C is archived legacy iframe content; Tab D is the documented, isolated extension path. Gate Tab D-only behavior with the existing `tabDUiRefinement` / Tab D runtime path. |
| Preserve MNA separation | Do not change `tabDSimulation.ts`, solver stamps, or MNA primitives for a rendering-only task. Any new theorem or solver needs a decoupled pure TypeScript module plus tests before UI wiring. |
| Keep symbols and terminal maps synchronized | SVG geometry, visual terminal bridges, `componentDefs.ts`, `Home.tsx` terminal maps, snap grid, and wire endpoints are one contract. Update and test them together. |
| Use the 25px Tab D coordinate language | Tab D’s symbol visual scale and terminal registration must end on its 25px lattice. All visual terminal endpoints used by wires must be grid-compatible. |
| Maintain KaTeX standards | Academic values, variables, matrices, and units belong in KaTeX where shown as academic output. Never display raw LaTeX escapes or generated UUIDs to learners. |
| Favor pure helpers | Put deterministic circuit geometry, numeric conversion, and solver transformations in tested pure modules, not inside JSX event closures. |
| Use existing UI primitives | Check `components/ui/` before inventing a dialog, popover, select, button, accordion, or slider. |
| Respect theme / RTL | All new UI must be checked in dark and light modes; Arabic layout must use Tajawal and logical direction-aware spacing. |
| No fake user content | Do not fabricate reviews, ratings, testimonials, or simulated user statements. |
| Tests and verification | Run TypeScript, relevant Vitest suites, and production build after meaningful code changes. Verify affected tabs in the browser. |
| Static assets | Keep deployment-safe static assets outside application source and reference the managed web asset URL when adding large media. |
| Documentation | Update this document and `circuit-simulator-engine.md` after a material boundary, data-model, visual-system, or solver change. |

## 7. Change-Review Checklist

| Before merging or publishing | Confirm |
|---|---|
| Scope | The request has a named owner file/feature boundary and has not silently expanded. |
| Visual | Light/dark contrast, RTL direction, desktop and constrained width are still credible. |
| Routing | New navigation targets exist in Wouter routes and in platform metadata where needed. |
| Simulator | Tab B and Tab C remain available when changing Tab D; symbols, terminal positions, grid, and wire paths agree. |
| Math | New math is unit-tested and failure states report a UI error instead of crashing. |
| Quality | `pnpm check`, tests, and production build are clean except for known non-blocking advisories. |
| Documentation | Project/system handoff documents reflect material changes. |

## 8. Source of Truth and Maintenance Notes

The source of truth for present implementation is the repository itself. The main product-wide decisions live in `client/src/index.css`, `MainLayout.tsx`, `SimulationDetail.tsx`, `data/content.ts`, `data/platform.ts`, and the V3 simulator folder. Historical markdown reports in the repository provide context but do not supersede current code.

When a requirement conflicts with this document, follow the explicit newer requirement after confirming which tab and feature boundary it targets. Then revise this handoff so the next development team inherits the new truth.
