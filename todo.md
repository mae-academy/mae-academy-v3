# MAE Academy Enhancement Tasks

## Generic PLC Ladder Correctness — August 27, 2026

- [x] تدقيق ترتيب عناصر rung، مواضع OTE/OTL/OTU، هندسة السكك والفروع، وعقود معاملات المؤقتات والعدادات الحالية.
- [x] فرض أن تكون كل Coils النهائية في أقصى يمين rung قبل السكة اليمنى، مع إبقاء Contacts وBlocks في مسار الشرط.
- [x] تصحيح DOM/CSS لخطوط السلم، وصلات العناصر، وهندسة التفرعات المتوازية كي تتصل بشكل مستمر وموازٍ كما في المرجع المرفق.
- [x] توسيع Instruction Properties لعرض وتحرير معاملات Timer وCounter وMath وCompare بأسماء دقيقة، وربط PRE/ACC والتحقق الدلالي بمحرك PLC.
- [x] إضافة اختبارات للترتيب، التفرعات، اتصال السكك، وتغيير preset/time ثم التحقق الحي في المتصفح.
- [x] تشغيل TypeScript والاختبارات والبناء، ثم النشر وحفظ نقطة إصدار. التحقق النهائي: 70 ملف اختبار / 365 اختباراً، TypeScript وبناء الإنتاج ناجحة، وتحقق حي من Preset time وPreset count = 5.

## PLC Controls & Simulator Visual Standardization — August 27, 2026

- [x] تدقيق محاكي إلكترونيات القدرة ومكتبة Schematic Workspace لاستخراج معيار العنوان وشريط الأدوات والمكتبة والنمط الليلي.
- [x] إصلاح إجراءات إضافة rung والتفرع المتوازي ونقل/تغيير موضع التعليمات في محرر PLC مع مناطق إسقاط مرئية وصحيحة.
- [x] ضبط هندسة PLC DOM بحيث تلتقي كل Contacts وCoils وBlocks بدقة مع خطوط السلم والمسارات المتسلسلة والمتوازية.
- [x] إعادة تصميم مكتبة PLC اليسرى لتستخدم بطاقة رمز فوق اسم المكوّن وفق نمط مكتبة Schematic Workspace.
- [x] توحيد عناوين وشريط أدوات PLC ومحطتي Signals Fourier وLaplace على معيار محاكي إلكترونيات القدرة، والتحقق من النمط الليلي في المحاكيات المتأثرة.
- [x] تشغيل اختبارات وتحقيقات المتصفح للحالات الطبيعية والداكنة وسطح المكتب والهاتف، ثم النشر وحفظ نقطة إصدار. التحقق النهائي: TypeScript، 70 ملف اختبار / 364 اختباراً، وبناء الإنتاج ناجحة، مع فحص PLC وFourier وLaplace وإلكترونيات القدرة في الوضع الليلي.

## PLC Ladder Visual Editor Rebuild — August 27, 2026

- [x] استخلاص عقد DOM وFlexbox/CSS Grid والتفرعات المتداخلة وأشكال التعليمات من مخطط المحرر المرئي المرفق.
- [x] تدقيق محرر PLC القائم وتحديد حدود الاستبدال التي تحفظ محرك Ladder الخلفي الجديد مستقلاً.
- [x] إعادة بناء Rails وRungs وContacts وCoils والمؤقتات والعدادات والكتل الحسابية والمقارنة والمنطقية بأشكال Ladder مطابقة للمخطط.
- [x] تنفيذ الربط المتسلسل والمتوازي، ومناطق الإدراج، والسحب والإفلات، والحذف وفق آلية DOM الموثقة دون Canvas أو SVG للرسم الإنشائي.
- [x] ربط الوثيقة المرئية بـ AST الخلفي وإضافة اختبارات لسلسلة/تفرع/نقل/حذف العناصر وسلامة الترجمة.
- [x] التحقق في المتصفح على الحاسوب والهاتف، ثم فحص TypeScript والاختبارات والبناء وحفظ إصدار منشور. التحقق النهائي: 70 ملف اختبار / 364 اختباراً، TypeScript، وبناء الإنتاج ناجحة، مع فحص سطح المكتب والهاتف.

## PLC Ladder Logic Backend — August 27, 2026

- [x] استخلاص عقود AST ودورة المسح وحالات المؤقتات/العدادات من مخططات PLC المرفقة.
- [x] تعريف نماذج البرنامج والوسوم والتعليمات وحالة التنفيذ كطبقة TypeScript نقية ومنفصلة عن React.
- [x] تنفيذ محلل Ladder والتحقق الدلالي والتوليد الحتمي للتنفيذ في بيئة آمنة.
- [x] تنفيذ Contacts وCoils وOne-shots وTimers وCounters والتعليمات الحسابية والمقارنة والمنطقية.
- [x] كتابة اختبارات صارمة لدورة Prescan والمسح والحالات الخفية والحواف الزمنية والأخطاء الدلالية.
- [x] التحقق من TypeScript والاختبارات والبناء، ثم تسليم تقرير اكتمال طبقة Backend قبل بدء واجهة DOM. التحقق النهائي: 68 ملف اختبار / 358 اختباراً، TypeScript، وبناء الإنتاج ناجحة.

## E-Circuits Canvas Refinements — August 27, 2026

- [x] Inspect DC rail, Op-Amp, dependent-source, transistor, switch, relay, terminal-geometry, and inspector implementations.
- [x] Change the DC Power Rail to a positive-only terminal, correct Op-Amp markings and default gain, and simplify the inspector globally.
- [x] Add latching click behavior for switches and relays plus hold-only momentary behavior for push buttons.
- [x] Audit and correct catalog terminal geometry so visual pin intersections match wire-snap locations.
- [x] Validate normal and interaction states with focused tests, TypeScript, production build, and desktop/mobile canvas checks. Final validation: 67 files / 343 tests passed; TypeScript and production build passed; desktop and mobile Tab D station checks completed.

## Tab D Analysis & Palette Recovery — August 27, 2026

- [x] Trace Tab D Academic Analysis data flow, including Nodal, Mesh, Superposition, and Thevenin traces, and identify the visible-rendering blocker.
- [x] Restore the Academic Analysis Workspace so available solver traces are visibly rendered within the live Tab D route.
- [x] Remove Input Logic, Output Logic, AND, OR, NOR, NAND, XOR, and XNOR from the Tab D component palette.
- [x] Validate analysis results and the cleaned palette on the live route, then run TypeScript, tests, and production build.

## Control Systems UI Standardization — August 27, 2026

- [x] Inspect the Control Systems Root Locus heading reference and locate the Practical Simulations header bar plus all E-Circuits Tab D cleanup targets.
- [x] Remove the specified Practical Simulations header and E-Circuits runtime, branding, zone, phase, measurement, keyboard, and verbose help surfaces.
- [x] Consolidate the Tab D toolbar into one aligned control row and apply the Control Systems heading treatment to retained E-Circuits functional titles.
- [x] Validate responsive layout, TypeScript, tests, and production build without modifying wiring or solver logic.

## Signal Operations & Properties — August 27, 2026

- [x] Inspect the existing Signal Operations tab, math renderer, and charting capabilities.
- [x] Implement and unit-test a pure piecewise signal engine with symbolic Dirac impulses and signal transformations.
- [x] Implement energy, power, classification, and commensurate periodicity analysis contracts.
- [x] Connect signal controls, KaTeX equations, interactive traces, and Dirac arrow annotations to Tab 1.
- [x] Validate normal and edge-case mathematics, responsive interaction, TypeScript, tests, and production build.

## Visual & Interactive Synthesis — August 27, 2026

- [x] Map current Tab D, rectifier, chopper, and inverter interface seams plus the established Luminous Technical Atelier visual language.
- [x] Add a workspace alert surface for `TAB_D_MNA` warnings, including missing-ground and Newton non-convergence guidance.
- [x] Bind rectifier and chopper simulation samples to readable waveform scopes that make DCM current interruption visible.
- [x] Bind inverter `SHOOT_THROUGH` fault state to a clear warning surface and red switch-state treatment without adding dead-time or parasitic models.
- [x] Validate fault, warning, and normal data states on desktop and mobile views; then run TypeScript, tests, and production build.

## Circuits & Power Electronics Logic Audit — August 27, 2026

- [x] Inventory documented Tab D MNA, Newton, transient, and Power Electronics solver modules with their existing non-UI tests.
- [x] Add and run Tab D MNA tests for a floating circuit, parallel ideal-voltage-source conflict, Newton non-convergence, and transient switching containment.
- [x] Add and run Power Electronics tests for rectifier CCM/DCM transition, chopper duty-cycle boundaries, and inverter shoot-through detection.
- [x] Correct only verified solver defects and add focused regression coverage for each correction.
- [x] Run sequential consolidated tests, TypeScript validation, production build, and representative route verification without UI or SVG changes.

## Grand Logic Audit — August 27, 2026

- [x] Inventory Control Systems and Digital Logic engine modules and their current non-UI test coverage.
- [x] Add and run focused Control Systems edge-case tests for marginal stability, unstable time response, and positive feedback.
- [x] Add and run focused Digital Logic edge-case tests for parsing, K-Map minimization, universal synthesis, FSM excitation, oscillation, and multi-driver conflict.
- [x] Correct only verified engine-level defects and add focused regression tests for each correction.
- [x] Run the consolidated test suite, TypeScript validation, and production build without changing UI or SVG source.

## Architectural Reference Study — August 27, 2026

- [x] Study the supplied engine, rendering, interaction, and safety reference materials.
- [x] Synthesize a four-principle architectural manifesto for the Digital Logic Lab without implementation changes.

## Supplied Logic Simulator Integration — August 27, 2026

- [x] Inspect the supplied logic-simulator archive and identify its browser entry point, assets, and dependencies.
- [x] Define an isolated integration boundary that prevents the simulator from changing the MAE Academy application shell.
- [x] Stage the supplied simulator and expose it through the appropriate MAE Academy route.
- [x] Validate simulator startup, its primary interaction surface, and existing representative MAE Academy routes.

## Targeted Restoration — August 27, 2026

- [x] Inventory every unresolved import and TypeScript diagnostic in the supplied baseline.
- [x] Create only the minimum unstyled React component stubs and compatibility exports required by those unresolved imports.
- [x] Add minimum viable type annotations only where the compiler requires them.
- [x] Run the supplied compiler check and resolve all remaining TypeScript diagnostics within the authorized restoration scope.
- [x] Restart the application and verify that the original baseline route renders.

- [x] Inspect the supplied `pasted_file_gcYsVi_circuitlab.zip` statically and identify its browser entry document plus relative asset dependencies. The extensionless `editor` file is the main HTML entry and uses packaged legacy assets through root-relative paths.
- [x] Copy the complete legacy simulator into an isolated `client/public/tab-c-legacy/` static directory without importing its CSS or JavaScript into React. Local paths were rewritten relative to the staged entry; unavailable analytics and account calls remain inside the static iframe boundary.
- [x] Add Circuit Lab Tab C as a sandboxed iframe route while preserving the existing behavior of Tabs A and B. `SimulatorTabC.tsx` mounts `/tab-c-legacy/editor/editor.html` with scripts, same-origin browser APIs, and forms permitted but no top-level navigation or popup permission.
- [x] Verify the legacy document, Tab A, and Tab B each render independently; then save a shared-project checkpoint. Tab C loads the staged CircuitLab editor in its iframe boundary, Tab A retains its topology workspace, Tab B retains its ElectroLab workspace, TypeScript and the production build pass, and version `c1e5cd53` was published.

- [ ] Define the user experience, context contract, privacy controls, and phased integration plan for an optional MAE AI assistant character; do not implement it until the user approves a final design and model deployment approach.
- [ ] Compare open-source engineering and vision-language models against deterministic solver-guided learning flows, then recommend a hybrid product strategy for Circuit Lab and Control Systems.

- [x] Reorder the Linear Algebra A–E sections to progress from basics and determinants through systems, spaces, transformations, and eigen analysis.
- [x] Recompose the desktop studio as a sticky left column for inputs plus geometry and a scrollable right derivation column.
- [x] Add collapsible mathematical trace steps with optional conceptual explanations for row operations and other results.
- [x] Add consistent input-to-geometry color cues and localized practical engineering notes for each operation family.
- [x] Validate the revised instructional flow, sticky behavior, accordion controls, and responsive layout in all three languages. Desktop review confirms the fixed learning column and independently expandable RREF proof steps; mobile review confirms a clear single-column journey from inputs through geometry, practical context, result, and expandable eigen derivation.
- [x] Verify Arabic instructional controls live: the new A–E sequence is visible, Zone A plus Zone C remains fixed alongside the derivation board on desktop, and the Input Matrix proof collapses independently while the determinant result remains available.

- [x] Map the Linear Algebra operation families across the A–E tool sections while retaining the shared simulator shell.
- [x] Replace fixed 2×2 and 3×3 input constraints with editable row and column dimensions for compatible arbitrary matrix sizes.
- [x] Correct all matrix, vector, result, and step displays to use KaTeX bracketed array rendering with stable rows and entries aligned inside brackets.
- [x] Validate A–E routing, matrix resizing, KaTeX row alignment, high-dimensional operations, and mobile presentation. Live 4×4 Systems/RREF testing confirmed automatic 4×1 B sizing and vertically aligned KaTeX vectors and augmented matrices; the geometric canvas projects the first three coordinates by design.
- [x] Confirm visual output on desktop and mobile: each A–E rail section selects its intended operation family, editable input cells sit inside clear matrix brackets, and all computed matrices, vectors, rows, and equations render through aligned KaTeX arrays.

- [x] Audit the current Linear Algebra route, Control Simulator surfaces, KaTeX helper, and visualization dependencies.
- [x] Define typed matrix/vector inputs, pure math operation results, KaTeX step records, and vector-scene state.
- [x] Implement multiplication, transformations, determinant with cofactor/LU paths, Gaussian RREF solving, null-space basis extraction, and numerical eigen analysis in pure TypeScript.
- [x] Build the exact three-zone Control-style Linear Algebra Studio: input rail, step-by-step KaTeX board, and sharp interactive geometric canvas.
- [x] Integrate the studio only into Linear Algebra, add English/Arabic/Spanish copy, and preserve every other simulation route.
- [x] Validate mathematical identities, step traces, vector geometry, keyboard/mouse interactions, responsive layout, and TypeScript. Engine checks cover multiplication, determinant, RREF, solving, null space, and repeated-eigenvalue bases; desktop/mobile checks confirm the full Control-style three-zone layout and 2D/3D geometry modes.
- [x] Verify the initial Linear Algebra route mount in Arabic: the 2D matrix rail, live KaTeX transform trace for A·B=[3,3]^T, and Canvas vector field render correctly inside the Linear Algebra tool only.
- [x] Verify live eigen analysis for A=[[2,1],[1,2]]: the KaTeX board returned λ={3,1} and normalized eigenvectors [0.7071,0.7071]^T and [-0.7071,0.7071]^T.
- [x] Verify desktop and mobile Control-style layout: the fixed input rail, derivation board, and Canvas remain readable; 2D now uses a true Cartesian plane while 3D keeps drag-to-rotate perspective.

- [x] Preserve direct source-order output for `org 100h` DOS COM programs.
- [x] Restore code-first emission for `.model/.stack/.data/.code` MASM-style programs, even when `.data` is written before `.code`.
- [x] Automatically detect both source styles and validate the same headless COM loader with each format. Compiler checks passed; the supplied MASM program executed live, printed `MAE 8086 ready.`, reached `CX=0008h`, and terminated with `INT 21h/AH=4Ch` without entering its data region.

- [x] Audit the current educational assembler and emulator-core contracts before extending COM execution logic.
- [x] Define two-pass source records, a case-insensitive symbol table, location-counter rules, COM origin semantics, and data isolation invariants.
- [x] Implement `org 100h`, labels, `db`, `dw`, post-halt variables, literal data, and deferred symbol resolution in the compiler logic only.
- [x] Generate a COM memory image and set `CS = DS = ES = SS`, `IP = 0100h`, and `SP = FFFEh` in the core loader without React changes.
- [x] Validate data bytes after `hlt`, forward symbol references, word memory addressing, `INT 20h`, and halt-bounded execution with automated checks. Live execution confirmed AX=0008h from a deferred `result dw 0008h` and stopped at HLT before data bytes were fetched.

- [x] Remove the 8086 Instruction Flow / Station A schematic box and its Source, Decode, CPU State, Memory, and Trace labels from the Assembler Studio.
- [x] Verify the remaining Assembler layout and live execution controls remain intact after removing the schematic box. TypeScript passes and the desktop workspace now begins directly with Source Workspace, Execution Controls, and CPU Registers.

- [x] Audit the headless v86 engine, browser bundle requirements, and licensing implications for client-side integration.
- [x] Define the typed EmulatorCore API, browser worker boundary, assembler-to-binary strategy, snapshot model, and interrupt callback contract.
- [x] Add `/lib/emulator` core scaffolding for assembly loading, execution control, state extraction, memory inspection, stack inspection, breakpoints, and reset.
- [x] Implement a safe MASM-compatible text-to-binary assembly path before machine code enters the headless engine.
- [x] Bridge INT 10h and INT 21h events into the custom React terminal surface without importing any v86 visual interface.
- [x] Connect the live emulator state to the Assembler Studio and validate run, step, reverse-step, breakpoint, memory, stack, and terminal flows. Browser verification confirmed a source-mapped breakpoint, exact stepping, snapshot restore with trace rollback, and INT 21h/AH=09 custom terminal output; an editable source program was reassembled and executed live.
- [x] Apply and verify the MAE 8086 instruction-flow M-plane chassis, calibration labels, and crimson execution reference on desktop and mobile while retaining all live execution controls.

- [x] Remove nonessential decorative icons from the DOS Screen, Main Memory, and Execution Trace headers.
- [x] Recompose Main Memory, Stack Visualizer, and Execution Trace as three compact independent cards in one desktop row.
- [x] Reduce memory and trace heights while preserving reference-address and trace readability on desktop and mobile. Desktop verification confirms the three-card row; mobile verification confirms the cards stack cleanly with readable reference and trace data.

- [x] Remove manual interaction from the CPU register and flag displays, keeping them as read-only execution-state references.
- [x] Merge the Flag Registers into the CPU Registers panel.
- [x] Add normalized hexadecimal address-reference controls for Main Memory and Stack Visualizer, each rendering ten cells from the selected address.
- [x] Enlarge the Source Workspace and DOS Screen while removing the separate top Assembler Studio title card.
- [x] Verify address normalization, ten-cell windows, read-only state presentation, and responsive layout behavior. Desktop and mobile checks confirm readable ten-cell windows from the selected reference addresses.

- [x] Compare the Assembler Studio with current Control Systems, Power Electronics, and PLC panel, typography, control, and spacing conventions.
- [x] Replace the Assembler Studio’s custom macOS/chassis treatment with the approved shared simulator card and workspace hierarchy.
- [x] Align all Assembler subcomponents to the shared field, button, box, typography, and responsive layout treatment without altering their UI-only behavior.
- [x] Verify visual parity with the reference simulators on desktop and mobile, then validate TypeScript. Desktop and mobile checks confirm the same rounded simulator cards, slate worksheet fields, violet active states, compact technical typography, and spacing rhythm as the Control Systems, Power Electronics, and PLC references.

- [x] Audit the Assembler route, shared simulation shell, localization mechanisms, and available UI primitives.
- [x] Define UI-only 8086 sample data, code templates, multi-language labels, and interaction states without a parser or execution engine.
- [x] Build the macOS-framed Assembler Studio, code editor gutter, breakpoints, active-line highlight, syntax-ready code classes, controls, cycle display, and template library.
- [x] Build the 16-bit/8-bit register hierarchy, pointers, segments, flash-ready update styling, and flags LED indicators.
- [x] Build the memory format toggles, address/value grid, SP-directed stack visualizer, DOS-style terminal, keyboard field, and collapsible trace table.
- [x] Integrate the Assembler Studio with the Assembler route and validate desktop/mobile layouts, three-language copy, UI controls, and TypeScript.

- [x] Audit the existing State Space route, math helpers, localization records, and KaTeX primitives for the new studio.
- [x] Implement pure TypeScript matrix operations, rank, characteristic polynomial, eigenvalues, and Ackermann pole placement.
- [x] Build the editable n=2/n=3 state-space matrix workspace with live LaTeX state equations.
- [x] Calculate controllability and observability and surface the requested Leo Alert diagnostics when either rank is deficient.
- [x] Implement desired-pole input, feedback gain K, closed-loop matrix, and closed-loop eigenvalue displays.
- [x] Implement RK4 state integration with initial-condition controls and a 2D vector-field phase plane.
- [x] Implement a rotatable client-side 3D phase portrait for third-order systems.
- [x] Localize the completed State Space Studio for English, Arabic, and Spanish and validate mathematics, responsiveness, and rendering.
- [x] Reconcile the concurrent State-Space and Frequency Response route updates and verify both laboratories render correctly.

- [x] Show the PID input signal as compact R(t) and R(s) notation with trimmed numerical formatting.
- [x] Remove Design by Specs expansion icons and keep its full specification controls visible at all times.
- [x] Apply the PID Interactive RK4 Scope presentation style to the Root Locus Closed-Loop Step Response without changing its logic.
- [x] Verify dual-domain notation, Design by Specs, and both scope presentations on desktop and mobile.

- [x] Place Input Signal Generator and PID Parameters in a compact shared row.
- [x] Place Controller Matrix beside Interactive RK4 Scope in the main PID Studio row.
- [x] Place Design by Specs, Closed-Loop Construction, and Transient Metrics in the lower row.
- [x] Update all simulation-tool active states to use a blue–violet–red gradient surface with a neutral gray lower rule.
- [x] Verify the compact PID layout and shared active-tool styling on desktop and mobile.

- [x] Map reusable Root Locus transfer-function, KaTeX, RK4, canvas, and metric primitives for PID Studio.
- [x] Implement the plant transfer-function engine with Polynomial and ZPK modes and dynamic LaTeX output.
- [x] Implement all specified P, I, D, PI, PD, and PID controller forms with Parallel, Series, Standard, and Modified transformations.
- [x] Implement design-by-specification controls for damping ratio and natural frequency with PID calibration.
- [x] Implement the specified impulse, step, ramp, parabolic, exponential, sine, and cosine input signals.
- [x] Implement closed-loop RK4 simulation, autoscaled scope, and LaTeX-formatted transient metrics.
- [x] Integrate PID Studio on the Control Systems PID route and validate all controller modes and interactions.

- [x] Inspect the Root Locus simulator’s rendered interface and source composition without modifying behavior.
- [x] Analyze its graph language, equation treatment, layout system, card hierarchy, controls, slider, labels, and explanatory sequence.
- [x] Write a detailed internal style reference for applying this simulator language consistently to future tools.

- [x] Align Root Locus canvas colors with the MAE blue–violet–crimson visual system, replacing green and legacy yellow accents.
- [x] Inspect and correct the analytic step-two real-axis segment highlighting logic.
- [x] Verify colors, Cartesian and polar views, and step-two highlighting in the live Root Locus tool.

- [x] Inspect the supplied legacy archive and identify all Root Locus source modules, visual assets, and dependencies.
- [x] Preserve the legacy Root Locus logic, controls, plots, calculations, LaTeX rendering, metrics, and analytic-step behavior without functional changes.
- [x] Integrate the legacy Root Locus simulator into the new Control Systems Root Locus workspace while keeping the MAE shell intact.
- [x] Validate legacy parity for Cartesian and polar views, reset/autoscale, step response, gain calibration, metrics, roots, and show-step highlighting.

- [x] Apply Tajawal consistently to Arabic simulation tool titles and related interface text.
- [x] Verify Arabic tool-page typography in the live preview.

- [x] Slightly accelerate the main route camera-pan transition without making it instant.
- [x] Verify the faster transition remains smooth during navigation.

- [x] Keep the simulation shell, title, return link, and tool rail fixed during tool-to-tool navigation.
- [x] Animate only the lower tool workspace when switching between simulation tools.
- [x] Default every simulation family to tool A while keeping Control Systems defaulted to Root Locus.
- [x] Verify fixed-shell transitions across Control Systems and a non-control simulation.

- [x] Remove simulation card and detail-page station/index labels requested by the user.
- [x] Remove primary navigation indices and center the navigation rail.
- [x] Show only tool names inside Control Systems and minimal single-letter placeholders inside other simulations.
- [x] Default Control Systems to the Root Locus sub-route.
- [x] Verify the simplified simulation and navigation interfaces on desktop and mobile.

- [x] Remove the transient 404 state when returning from a nested simulation tool to the Practical Simulations index.
- [x] Verify desktop and mobile return navigation completes without an error flash.

- [x] Replace the large simulation-detail illustration with a centered tool-shell title and simulation tab bar.
- [x] Create a reusable even-width sub-simulation navigation strip for every course tool page.
- [x] Add Control Systems routes for Root Locus, PID, Block Diagram & Signal Flow, Frequency Response, and State Space.
- [x] Keep Practical Simulations visibly active in the header for all simulation detail and sub-simulation routes.
- [x] Verify route transitions, tool navigation, and responsive shell behavior.

- [x] Inspect and correct alignment consistency across all nine simulation cards.
- [x] Remove the unnecessary schematic-label badges above every simulation illustration.
- [x] Add reusable empty simulation detail pages and connect every Explore action to the matching route.
- [x] Verify collection and detail navigation across desktop and mobile layouts.

- [x] Restore the original blue–violet–red treatment for the “Next Frame” hero accent.
- [x] Add nine named Practical Simulation stations with bilingual and trilingual content coverage.
- [x] Create a discipline-specific SVG schematic for each new simulation station.
- [x] Verify the hero accent and nine-station grid on desktop and mobile.

- [x] Add a direction-aware animated transition when users change language and interface direction.
- [x] Add refined hover and focus motion to the hero engineering blueprint and its coordinate system.
- [x] Capture the MAE visual-system rules in a durable extension guide for future content work.
- [x] Verify the new interaction design across desktop and mobile views.

- [x] Audit every user-facing phrase across shared components and all routes.
- [x] Centralize complete English, Arabic, and Spanish content for pages, card collections, controls, labels, and footer text.
- [x] Connect the selected locale to every shared component and route without fallback English copy.
- [x] Verify Arabic RTL and Spanish LTR layouts in the browser.

- [x] Expand the home page with linked overview sections for Academic Research, Academic Courses, Practical Simulations, and the founder story.
- [x] Replace the mobile hamburger navigation with a persistent, touch-friendly header navigation slider.
- [x] Upgrade navigation, route, and call-to-action motion so meaningful interactions are animated rather than instant.
- [x] Preserve the Luminous Technical Atelier visual system through reusable components and consistent design tokens.
- [x] Verify responsive navigation and home-page interactions in desktop and mobile layouts.
- [x] Maintain Apple Gothic-style typography for English and Spanish, and Tajawal for Arabic.

- [ ] Audit PID and Root Locus visual primitives against Frequency Response and State Space for strict simulation-studio consistency.
- [ ] Diagnose and resolve the reported application errors using the current build, browser, and runtime logs.
- [ ] Restyle Frequency Response panels, controls, typography, and plot containers to match the PID and Root Locus studio chassis.
- [ ] Restyle State Space panels, controls, typography, and plot containers to match the PID and Root Locus studio chassis.
- [ ] Verify both standardized tools on desktop and mobile, then save a new shared-project checkpoint.

- [x] Audit the Tab D documented resistor, Star, and Delta SVG branches alongside their terminal maps and symbol tests.
- [x] Replace only the Tab D resistor primitives with potentiometer-style rectangular bodies without wiper terminals, preserving the 25px terminal lattice and Tab B output.
- [x] Verify documented symbol geometry, terminal registration, Tab D rendering, and the unchanged Tab B/Tab C routes. Focused symbol tests, TypeScript, production build, and B/C/D route screenshots passed.
- [x] Center the documented Tab D IAC sinusoidal glyph vertically inside its current-source circle without changing the Tab B symbol branch.
- [x] Update symbol tests to protect rectangular resistor bodies across resistor, Star, Delta, and centered documented IAC geometry.

- [x] Rebuild the documented Star (Y) pack from three equal rectangular resistor arms at 0°, 120°, and 240° without extra terminal-return paths.
- [x] Normalize the documented Delta pack to the same rectangular resistor-arm dimensions as the Star pack.
- [x] Align the documented VABC PHASE output leads with their true circle-boundary intersections and protect the geometry with regression tests. Focused geometry tests, TypeScript, production build, and B/C/D route screenshots passed.

- [x] Reduce the documented Star and Delta resistor-arm scale uniformly, eliminate Star arm overlap, and retain exact 0°/120°/240° registration with grid-snapped terminals.
- [x] Remove SCR, DIAC, and TRIAC from the Tab D learner-facing component library and Tab D NAD imports without changing their Tab B catalog definitions or runtime branches.
- [x] Rebuild the documented operational-amplifier SVG with IEEE-style triangle terminals ending exactly at the symbol boundary, then validate its terminal map and symbol output. Focused catalog, geometry, and symbol tests; TypeScript; production build; and B/C/D route checks passed.

- [x] Audit the Tab D entrypoint, injected runtime/state boundaries, and existing Practical Simulations routing before cloning.
- [x] Create the independent DigitalLogicDesign simulator module by cloning the Tab D entry structure and renaming exported components, types, provider/state hooks, and test identifiers.
- [x] Register the Digital Logic Design route and Practical Simulations navigation entry while retaining all Tab D, Tab B, and Tab C code and interaction paths.
- [x] Verify independent simulator instances, route availability, focused tests, TypeScript, production build, and existing E-Circuits tabs. Thirty focused clone/original regression tests, TypeScript, production build, and Digital Logic/Tab D route screenshots passed.

- [x] Audit the current Digital Logic Design library filter and identify the minimum Tab-specific change that retains the existing page structure, visual style, grid, and component renderer.
- [x] Filter the Digital Logic library to Input, Output, AND, OR, NOT, NAND, NOR, XOR, and XNOR only, without modifying the original E-Circuits tabs or global component definitions.
- [x] Verify the filtered library and the unchanged Digital Logic layout in light and dark modes, then confirm Tab D still loads. TypeScript, production build, and Digital Logic/Tab D route screenshots passed; existing light/dark palette code was preserved unchanged.

- [x] Audit the isolated Digital Logic Design simulation hook, component definitions, properties panel, and symbol-label path without modifying shared Tab D behavior.
- [x] Implement and test a pure Boolean evaluator for Logic Input, Logic Output, AND, OR, NOT, NAND, NOR, XOR, and XNOR without ground, voltage, threshold, or analogue dependencies.
- [x] Connect the Digital Logic workspace to the ideal evaluator; remove high-voltage, threshold, and electrical property UI while retaining only logical 0/1 states.
- [x] Remove visible gate labels and voltage text while retaining natural editable labels on Logic Input and Logic Output.
- [x] Verify truth tables, ground-free propagation, TypeScript, production build, and original Tab D isolation. Eight Boolean-definition and truth-table tests, TypeScript, production build, and Digital Logic/Tab D route checks passed.

- [x] Audit current ideal gate terminal contracts, Boolean evaluation, property controls, and SVG paths inside DigitalLogicDesign only.
- [x] Extend AND, OR, NAND, NOR, XOR, and XNOR to selectable two-, three-, or four-input operation with exact Boolean truth-table coverage; preserve NOT as a single-input inverter.
- [x] Add the Input Count property to eligible gates and synchronize their visible terminal maps without reintroducing ground or electrical properties.
- [x] Replace NOT and OR-family SVG paths with accurate IEEE/ANSI geometry, including the curved OR-family input boundary and double curve for XOR/XNOR.
- [x] Verify multi-input logic, terminal registration, TypeScript, production build, visual rendering, and Tab D isolation. Thirteen Boolean and terminal-contract tests, TypeScript, production build, and Digital Logic/Tab D screenshots passed.

- [x] Audit the Digital Logic gate-output SVG and terminal-rendering path to identify the source of the fixed purple output endpoint.
- [x] Replace every gate output with a uniform dark short lead followed by a neutral terminal marker, including inverted gates, without changing Boolean behavior or Tab D.
- [x] Verify the revised gate outputs visually, with TypeScript and production build checks. Fourteen Boolean and terminal-contract tests, TypeScript, production build, and Digital Logic/Tab D screenshots passed.

- [x] Reproduce the submitted chained Input → AND → OR → Output circuit as an isolated Boolean regression to verify end-to-end signal propagation.
- [x] Verify and correct ideal Boolean output evaluation, including multi-input gates and Logic Output terminal state, without changing Tab D.
- [x] Add default numeric keyboard shortcuts for Logic Inputs and a properties control for a custom single-key binding, with conflict-safe toggling.
- [x] Rename new and imported Logic Inputs/Outputs using I1/I2… and O1/O2… labels, preserving user-custom labels.
- [x] Validate keyboard interaction, truth tables, production build, and isolated E-Circuits routes. Eighteen Boolean, terminal, and binding tests, TypeScript, production build, and Digital Logic/Tab D route screenshots passed.

- [x] Reproduce the submitted I1/I2/I3 → AND → OR → O1 circuit using the exact wire directions created by the canvas.
- [x] Make the ideal Boolean engine resolve a driver-to-receiver connection regardless of whether the learner started the wire from the source terminal or the target terminal.
- [x] Add directional wiring regressions for gate inputs, chained outputs, and Logic Output; verify the visible O1 state reaches 1 for the submitted all-high circuit. Nineteen Boolean, terminal, and binding tests, TypeScript, production build, and Digital Logic/Tab D screenshots passed.

- [x] Audit the current isolated Digital Logic runtime and define strict DES contracts for 0/1/Z/X states, pins, events, observers, and component lifecycle.
- [x] Implement an OOP discrete-event engine with an ordered event queue, propagation delays, delta-cycle evaluation/commit phases, deterministic clock scheduling, and direct subscription APIs outside React state.
- [x] Implement and test behavioral combinational components: adders, subtractors, comparator, priority encoder, decoder, MUX, and DEMUX using bitwise Boolean rules.
- [x] Implement and test sequential components: clock, SR/D/JK/T flip-flops, shift register, and counters using two-phase state commits.
- [x] Reorganize the Digital Logic catalog into I/O, Logic Gates, Combinational Circuits, and Sequential Circuits, with consistent 25px-grid symbols and preserved site style.
- [x] Bind the DES engine to the existing Digital Logic workspace with scoped SVG wire subscriptions and batched React snapshots, then verify correctness and Tab B/C/D isolation. Full regression suite: 38 files / 208 tests passed; TypeScript and production build passed.

- [x] Define a reusable dynamic-pin geometry contract for scalable logic components, including a grid-aligned pin pitch, centered symbol bounds, and a 2–8 input limit.
- [x] Apply dynamic visual sizing and variable input evaluation to AND and OR only, keeping all other gates and behavioral blocks unchanged pending review.
- [x] Implement transactional wire garbage collection when a dynamic input count is reduced, removing every wire that targets a deleted pin before committing the component update.
- [x] Add an accessible compact configuration surface for AND and OR input count, triggerable by double-click, then validate geometry, logic, and wire cleanup with tests. Await user approval before applying this pattern to MUX, decoders, adders, or registers.

- [x] Generalize the 2–8 dynamic input contract from AND/OR to NAND, NOR, XOR, and XNOR while preserving their existing logic equations and wire cleanup behavior.
- [x] Remove the temporary 5–8 input IC-block rendering and retain vertically stretched IEEE/ANSI gate silhouettes for every scalable gate.
- [x] Verify that each output lead begins at its symbol boundary and ends outside the gate at a neutral terminal marker for all six multi-input gates. Full suite: 39 files / 213 tests passed; TypeScript and production build passed.

- [x] Unify the local symbol lead coordinates and runtime terminal coordinates for all scalable logic gates so grid snapping cannot create stepped connector stubs.
- [x] Align behavioral IC block leads to the exact same pin-axis model used by their runtime terminals, including multi-input and multi-output blocks.
- [x] Add regression assertions for visual lead-to-terminal collinearity and validate the Digital Logic and original Tab D routes after the geometry correction. Full suite: 39 files / 215 tests passed; TypeScript and production build passed.

- [x] Convert the existing Digital Logic Lab visual container into an inline five-tool tab system without adding a global navigation bar.
- [x] Keep the mounted Schematic Workspace alive while switching tabs, preserving its circuit document, simulation state, and user selection.
- [x] Add visually restrained placeholder panes for Logic Analyzer, K-Map Minimizer, Universal Synthesis, and Timing Waveforms, then validate the isolated workspace route and original Tab D route. Full suite: 39 files / 215 tests passed; TypeScript and production build passed.

- [x] Remove the inherited Digital Logic gradient ribbon and the dark Digital Logic Lab tab card without modifying Schematic Workspace internals.
- [x] Restyle the five local tabs as an equal-width white Power Electronics-style segmented container with a blue-to-pink active segment and subtle vertical dividers.
- [x] Verify that the rebuilt tabs preserve workspace state and that the Digital Logic and original Tab D routes remain healthy. Full suite: 39 files / 215 tests passed; TypeScript and production build passed.

- [x] Extend the isolated DES pin contract and behavioral evaluator for dynamic MUX selector counts and Decoder selector counts, with every removed pin pruning its connected wires atomically.
- [x] Add scalable N-bit Adder and N-bit Register behavioral components with 4-bit and 8-bit modes, two-phase register commits, and rigorous four-state propagation.
- [x] Extend the shared IC geometry and the existing inspector/double-click configuration flow for selector and bit-width properties without changing Schematic Workspace internals.
- [x] Add focused truth-table, carry-chain, selector, register-edge, wire-cleanup, SVG-alignment, and full regression coverage before publishing the remaining dynamic component phase. Full suite: 39 files / 218 tests passed; TypeScript and production build passed.

- [x] Add behavioral Parity Generator/Checker and 4-bit ALU IC blocks to Combinational Circuits, with four-state equations and documented pin contracts.
- [x] Add Basic RAM, ROM, and Frequency Divider IC blocks to Sequential Circuits, with bounded memory semantics, clocked writes, deterministic reads, and frequency division behavior.
- [x] Implement explicit multi-driver conflict resolution and bounded feedback-loop handling in the DES core so conflicts surface as X and ring oscillators remain event-driven.
- [x] Create independent Vitest suites for gate truth tables, combinational blocks, edge-triggered sequential state, driver conflict, and delayed inverter feedback, then run full regression/build validation. Full suite: 43 files / 231 tests passed; TypeScript and production build passed.

- [x] Establish shared IEEE-style geometry contracts for trapezoidal MUX/DEMUX, V-notch ALU, cascaded carry paths, edge-triggered flip-flops, and memory IC blocks.
- [x] Relocate select/enable, opcode/carry, clock, and memory-control terminals to valid top/bottom pin axes while retaining wire routes, hit areas, and expanded SVG bounds.
- [x] Render the requested standard visual motifs: MUX/DEMUX trapezoids, ALU notch, adder carry cascade, flip-flop clock marker, and RAM/ROM inner storage grid.
- [x] Add geometry/SVG regressions and validate the Digital Logic and original Tab D routes after the symbol-only redesign. Full suite: 43 files / 233 tests passed; TypeScript and production build passed.

- [x] Audit every Digital Logic IC symbol for lead-to-boundary collinearity and eliminate any gap, overlap, or off-axis terminal lead.
- [x] Remove nested inner frames from generic IC blocks and unify all IC bodies, lead thicknesses, corner treatment, title placement, and DES annotations.
- [x] Add SVG regressions for exact lead-boundary contact across side, top, and bottom pins, then visually validate Digital Logic and original Tab D routes. Full suite: 43 files / 234 tests passed; TypeScript and production build passed.

- [x] Align Logic Input and Logic Output terminal centers and visual leads to the same 25px-aware contract used by their workspace wire anchors.
- [x] Remove the visible `DES / Δ` annotation from every generic and specialized Digital Logic IC symbol without altering simulation behavior.
- [x] Replace Priority Encoder with a scalable ordinary Encoder whose selector-count property controls 2/4/8 data inputs and binary outputs, with deterministic invalid/multiple-active behavior.
- [x] Add independent encoder truth-table, invalid-state, pin-geometry, I/O-alignment, full regression, and build validation before publishing. Full suite: 44 files / 242 tests passed; TypeScript and production build passed.

- [x] Create a React-independent `utils/logicEngine` module with tokenization, implicit AND insertion, Shunting-Yard RPN conversion, AST construction/evaluation, and AST-to-LaTeX output.
- [x] Add a bounded six-variable truth-table evaluator and reverse-engineering utility that turns editable output rows into canonical SOP, minterm, and maxterm representations.
- [x] Write isolated Vitest coverage for lexer variants, precedence, postfix NOT, AST evaluation, LaTeX grouping, parse errors, and SOP reconstruction.
- [x] Replace the Logic Analyzer placeholder with an accessible debounced UI featuring KaTeX live preview, sticky truth-table header, editable outputs, and graceful invalid-expression state while preserving the last valid table. Full suite: 46 files / 251 tests passed; TypeScript and production build passed. Awaiting user code review before publishing this analyzer phase.

- [x] Correct postfix prime token handling so expressions such as `A' + B'C` parse, evaluate, and render academically without losing the last valid AST.
- [x] Render truth-table symbols, output values, and minterm/maxterm indices through KaTeX rather than raw numerical text.
- [x] Remove the redundant Boolean Compiler / Logic Analyzer header block while preserving the expression input and AST academic preview. Full suite: 46 files / 252 tests passed; TypeScript and production build passed.
- [x] Verify and correct the Academic Notation rendering contract for postfix prime on parenthesized and nested operands, including `(A+B)'`, `(A+B)′`, and mixed expressions. Postfix input is preserved in the AST and renders as a visible LaTeX prime; prefix NOT retains its overbar notation. Full suite: 46 files / 253 tests passed; TypeScript and production build passed.
- [x] Define a React-independent K-Map data contract for 2–5 variables, minterms, don't-cares, implicants, prime implicants, essential coverage, and minimum hardware-cost solutions.
- [x] Implement `utils/kmapSolver.ts` with deterministic Quine–McCluskey reduction and Petrick coverage selection, including don't-care expansion without mandatory coverage.
- [x] Implement `utils/kmapGeometry.ts` with Gray-code mapping, toroidal SVG segment decomposition, group-size layer ordering, and nested-group offsets.
- [x] Add isolated four-variable tests that validate expected essential prime implicants, minimum cost selection, don't-care semantics, and wrapping geometry. No K-Map UI was constructed. Full suite: 47 files / 262 tests passed; TypeScript and production build passed.
- [x] Replace the K-Map Minimizer placeholder with a React interactive simulator for 2-, 3-, and 4-variable maps, preserving all other Digital Logic tabs.
- [x] Provide Gray-code row and column headers with clickable 0/1/X cells and deterministic variable-set switching.
- [x] Project selected QMC/Petrick implicants into colored SVG overlays on the K-Map grid and update the KaTeX SOP expression live.
- [x] Validate the new K-Map UI in-browser, its isolated component behavior, the full test suite, TypeScript, and production build. The direct verification route `?tool=kmap` renders the interactive field; full suite: 48 files / 263 tests passed.
- [x] Recompose K-Map Minimizer using the same white academic card, low-contrast borders, blue/pink restrained signals, and compact hierarchy as Logic Analyzer; remove the redundant Interactive K-Map title.
- [x] Add validated direct Boolean-expression, minterm, and don't-care entry fields that synchronize safely with 0/1/X cell clicks without weakening the QMC/Petrick solver contract.
- [x] Add instructional solver feedback that reveals selected prime implicants and supports reset/clear flows, then verify live UI behavior and mathematical output. Full suite: 48 files / 263 tests passed; TypeScript and production build passed.
- [x] Define a React-independent `synthesisEngine.ts` contract returning typed NAND/NOR derivation steps, transformed AST information, and a read-only diagram model.
- [x] Implement and test exact double-inversion and De Morgan derivations for SOP-to-NAND and POS-to-NOR, retaining correct grouping and KaTeX notation.
- [x] Replace the Universal Synthesis placeholder with a textbook stepper that renders each derivation equation through KaTeX.
- [x] Render the final all-NAND/all-NOR diagram from the generated model and verify the tab does not affect Logic Analyzer, K-Map, or Schematic Workspace. Full suite: 50 files / 267 tests passed; TypeScript and production build passed.
- [x] Reuse Logic Analyzer’s verified KaTeX contract to make postfix prime, overbars, and arrow notation visibly correct in Universal Synthesis.
- [x] Replace textual `NAND(…)` / `NOR(…)` result notation with equivalent academic nested-prime expressions that make the universal-gate realization legible.
- [x] Refine the read-only Universal Synthesis diagram using the canonical IEEE gate geometry and terminal/lead treatment from Schematic Workspace, then validate its alignment and output. Full suite: 50 files / 267 tests passed; TypeScript and production build passed.
- [x] Define and test a pure `timingEngine.ts` for tick-based input/output waveforms, one-tick propagation delay, deterministic clock generation, and glitch/unknown interval detection.
- [x] Build a React-independent square-wave SVG path contract in `WaveformTrack.tsx`, including input-cell hit targets, clock rising-edge guides, unknown shading, and glitch markers.
- [x] Replace the Timing Waveforms placeholder with Play/Pause, Reset, Add Cycle, interactive input tracks, and a read-only delayed output driven by the selected Boolean expression.
- [x] Add State Machine Explorer as the sixth empty tab without changing the existing Digital Logic tool states or Schematic Workspace. Full suite: 53 files / 274 tests passed; TypeScript and production build passed.
- [ ] Inspect the existing Signals & Systems Tab C and the available AI-to-AI Blueprint files before introducing the Convolution Engine.
- [ ] Implement a pure continuous/discrete convolution engine with safe signal parsing, trapezoidal integration at Δτ ≤ 0.01, overlap bounds, delta shortcut recognition, and unit tests.
- [ ] Implement three synchronized Canvas 2D tiers updated by a requestAnimationFrame loop without React state updates per animation frame.
- [ ] Add continuous controls and a discrete stem/table mode with anti-diagonal product highlighting, then validate animation behavior, solver accuracy, and the production build.
- [x] Define a pure `fsmEngine.ts` with strict Moore/Mealy states and transitions, Binary/Gray/One-Hot encodings, and deterministic unused-state don't-cares.
- [x] Implement and test D, T, JK, and SR excitation tables from present/next state vectors, including unused-state X rows.
- [x] Build an SVG FSM canvas with draggable state nodes, directed/reciprocal Bezier edges, and self-loop routing without external graph libraries.
- [x] Replace State Machine Explorer placeholder with an EDA split panel for controls, state/excitation tables, KaTeX equations, and copyable three-block Verilog generation. Full suite: 56 files / 283 tests passed; TypeScript and production build passed.
- [x] Fix the duplicate React child key warning in the FSM state table by assigning semantic column identifiers rather than display labels.
- [x] Replace generic FSM controls with state selection, contextual delete, and direct Add Transition To controls that update the native SVG diagram.
- [x] Add per-excitation, dynamic Derivation Steps showing excitation analysis, minterms/don’t-cares, K-Map minimization, and the final KaTeX equation.
- [x] Strengthen the FSM canvas and tables with a dotted drafting grid, selected-state feedback, and visually distinct unused X rows; validate user interactions and the full build. Full suite: 56 files / 283 tests passed; TypeScript and production build passed.
- [x] Fix dynamic State Machine Explorer ID allocation so Add State never duplicates an existing state key such as S2 after state deletion or recreation, and verify React rendering remains warning-free. Full suite: 56 files / 284 tests passed; TypeScript and production build passed.
- [x] Compare the current MAE Academy source tree with the read-only v3-2 reference, classify changed paths as safe imports or conflicts, and retain all completed Digital Logic work unless the user explicitly authorizes replacement. Imported the isolated Signals & Systems module tree and routing only; retained the completed Digital Logic tree and its workspace mount. Full validation: 61 files / 314 tests, TypeScript, and production build passed.
- [ ] Audit every `/simulations` route against the MAE three-pane, theme, localization, math, and animation-performance contract before changing its implementation.
- [ ] Prioritize and implement any verified functional gaps across the ten simulator suites without replacing stable specialized engines.
- [ ] Validate all simulator routes, mathematical renderers, Canvas/SVG workspaces, and RTL behavior after each integrated update.
- [x] Create a unified MAE Academy architecture document covering the current directory tree, route map, simulator ownership, three-pane UI contract, math/Canvas performance rules, and safe expansion boundaries. See `MAE_ACADEMY_PLATFORM_ARCHITECTURE.md`.
- [x] Create `MAE_ACADEMY_MASTER_PROJECT_HANDOVER.md` as the exhaustive sign-off handover document for core stack, design system, three-pane architecture, all ten engine contracts, testing, operations, and approvals.
- [x] Create `MAE_ACADEMY_MASTER_UIUX_DESIGN_SYSTEM.md` as the standalone UI/UX handover covering typography, themes, dashboard cards, three-pane workspace layout, SVG behavior, motion, and localization rules.
- [x] Create `MAE_ACADEMY_MASTER_CORE_LOGIC_ENGINES.md` as the standalone logic handover for performance invariants, electrical/power, DES, DSP/LTI/control, communication scope, graphing, linear algebra, state, and algorithm verification.
