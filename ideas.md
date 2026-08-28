# MAE Academy — Design Directions

## Three approaches considered

### 1. Luminous Technical Atelier
**Very Brief Intro:** An editorial engineering notebook with calibrated blue, ultraviolet, and crimson signals floating over a dark blueprint field. It feels precise, ambitious, and human rather than sci-fi.

**Probability:** 0.07

### 2. Cyan Field Manual
**Very Brief Intro:** A bright analytical system built around cyan-green diagrams, white drafting paper, and quiet scientific typography. It feels open, systematic, and field-tested.

**Probability:** 0.03

### 3. Archive of Motion
**Very Brief Intro:** A warm, archival learning environment using technical red ink, off-white paper, and animated construction lines. It feels scholarly, tactile, and deliberately paced.

**Probability:** 0.09

---

# Chosen Direction — Luminous Technical Atelier

## Design Movement

**Contemporary technical editorialism**: the legibility and structural rigor of an engineering drawing set, refined with the selective electric color and spatial depth of a high-end research studio.

## Core Principles

1. **Information has a chassis.** Every surface is aligned to a visible structural system, so the interface carries the clarity of an engineering workbook.
2. **Color is a navigational signal.** Deep blue creates trust and depth, purple marks synthesis and modeling, and crimson calls attention to movement and action.
3. **Motion explains hierarchy.** Camera-pan navigation and staggered entrances make spaces feel connected without turning the interface into decoration.
4. **The technical is human.** Fine drafting details sit beside readable editorial copy and the illustrated founder marker.

## Color Philosophy

The base is an ink-like navy that gives luminous accents room to breathe in dark mode, while light mode uses a cool technical paper rather than unmodulated white. The blue–violet–crimson gradient is treated as an active current: it follows interactive edges, active routes, signals, and schematic nodes instead of filling every surface.

## Layout Paradigm

The platform is built as a **field of anchored stations** rather than a centered card stack. The header functions as an instrument rail; the home page offsets its lead statement against a large engineering visual; content collections arrange as a calibrated grid; the footer resembles a drawing title block.

## Signature Elements

1. **Gradient signal line:** a thin three-color rule used under active navigation, inside labels, and around high-intent controls.
2. **Blueprint node matrices:** reusable SVG systems of grids, isometric cubes, points, and connectors.
3. **Calibration labels:** small, uppercase identifiers, coordinates, and section references that add technical rhythm.

## Interaction Philosophy

Interaction is restrained and consequential. Hovering a card raises its model plane and lights its border. Navigation shifts the whole camera. Theme and language controls alter the operating environment without changing the visual system.

## Animation

Page changes use a 400ms `easeInOut` horizontal camera-pan. Within an arrived page, content children enter with a 100ms stagger, rising 20px with low-opacity fade and a soft spring. All motion is reduced for users who request reduced motion. Hover and controls remain below 300ms and animate only opacity and transforms.

## Typography System

English and Spanish use **Avenir Next / Apple Gothic / ui-sans-serif** for a clean technical voice, with **Georgia** used sparingly for research-oriented italic accents. Arabic uses **Tajawal** throughout for compatible weight, rhythm, and legibility. Eyebrows are tracked, compact uppercase in Latin scripts; Arabic labels use normal letter spacing.

## Brand Essence

**MAE Academy translates engineering curiosity into models, analysis, and practical systems for globally minded builders.**

**Personality:** Exacting, catalytic, lucid.

## Brand Voice

The voice is direct, intelligent, and concrete. Headlines name a discipline or outcome; CTAs invite a specific next action; microcopy sounds like a clear research note.

> “Make the invisible system legible.”

> “Enter the simulation, then test the assumption.”

## Wordmark & Logo

The wordmark is a compact `MAE /` technical signature paired with an abstract **M-shaped tri-axis mark**: three connected engineering planes converging around a crimson reference point. The logo is a standalone SVG symbol, never text inside a default badge.

## Signature Brand Color

**Signal Violet — #7C3AED**

## Style Decisions

- All imagery is native SVG illustration; no raster or AI-generated images are used.
- Large areas use technical grid lines, low-opacity glows, and schematic illustrations rather than photo backdrops.
- Rounded corners are restrained: controls are pill-like while content surfaces are only subtly rounded.
- Every collection station uses a distinct native SVG schematic that reflects its research discipline, learning pattern, or practical test environment.
- The blue–violet–crimson signal line acts as the navigational current: active routes, primary actions, selected stations, key dividers, and reference nodes only.
- The brand lock-up always uses the compact `MAE /` technical signature with the tri-axis mark and crimson reference point.
- Keep the gradient signal narrow and purposeful: use it as a rule, active state, reference node, key divider, or primary action rather than broad decorative fill.
- Preserve a discipline-specific SVG vocabulary: research maps evidence, courses describe sequence and constraints, and simulations depict control, load, or response systems.
- Founder/archive moments must combine a human marker with engineering notation, such as the annotated field seal used on the home page.
- Collection pages use title-block rhythm and calibrated field markers around station grids; repeated station actions remain neutral and instrument-like while the gradient stays reserved for primary actions and active state.
- Detail pages keep future course content intentionally blank but frame it within an active-looking laboratory chassis of axes, response geometry, measured zones, and neutral instruments; the shared footer uses a restrained drawing title-block structure.
- When a user explicitly requests empty future tool pages, retain only the navigation architecture and neutral canvas; do not introduce experimental controls or simulated data before the user specifies them. Active tool state uses a narrow signal line rather than a broad gradient fill.
- State-Space Studio uses a monochrome technical-paper sublanguage within the MAE field: black/white vectors, KaTeX-first matrices, graphite surfaces, and crimson reference points. Its modules are tied together by low-contrast axes, node paths, and construction lines rather than a stack of generic dashboard cards.
- Keep the existing active simulation rail treatment because it is an explicit platform-level navigation requirement; inside each laboratory, reserve the MAE signal gradient for thin rules, high-intent actions, and reference nodes only.
- Georgia and serif italics are reserved for formulas and short research accents; primary tool hierarchy, controls, labels, and instructional copy remain in the clean technical sans-serif system.
- The blue–violet–crimson current remains narrow within laboratory workspaces: it marks active edges, dividers, selected traces, primary actions, and reference nodes rather than filling content surfaces. The shared simulation rail retains its explicit platform-level gradient treatment.
- Every simulation detail workspace includes an MAE-specific tri-axis or M-plane schematic with a crimson reference point inside the laboratory chassis.
- PLC and practical-control labs use a monochrome industrial worksheet inside, but it must be enclosed by the dark MAE blueprint chassis with calibrated station labels, node paths, and a tri-axis/M-plane schematic; tool hierarchy stays in the clean technical sans voice.
- Assembler Studio is an anchored instruction station, not a generic emulator skin: its macOS teaching window carries a coordinate label, M-plane node geometry, a crimson reference point, construction-grid zones, Tajawal interface copy, and monospace machine values. The execution surface remains UI-only until a dedicated 8086 engine is supplied.
- PLC screens use concrete learning modes such as scan cycle, instruction set, I/O mapping, and fault tracing rather than placeholder letters; the worksheet sits inside a rack-and-slot-calibrated MAE blueprint chassis with a visible M-plane and crimson reference point.
- Assembler Studio keeps one persistent 8086 instruction-flow M-plane that connects source, decode, CPU state, memory, and trace with calibration labels, construction lines, and a crimson execution reference point. Its panels remain quiet technical plates, while violet and crimson identify active execution context only.
- Power Electronics pages use a connected station rail that names the converter topology, solver state, switching/reference metadata, M-plane geometry, and one crimson electrical reference point.
- No shipped learning instrument uses development-placeholder copy. Future or unavailable content is framed as a calibrated research state with native drafting geometry instead.
- Within power workspaces, the signal gradient remains limited to active global rails, selected traces, primary actions, and reference accents; converter plates use native SVG symbols and current paths rather than decorative icons.
- Signals and Systems Tab A uses a persistent signal-native M-plane that ties source signals, transformation parameters, waveform canvas, and analysis outputs to one crimson mathematical reference.
- Signal workspaces privilege waveform drafting cues—time axes, sampling grid, transformation path, and period metrics—over generic dashboard separation.
- Signals station titles use calibration rhythm: station identifier, solver state, and research-note metadata are visually integrated with the mathematical instrument.
- Circuit Studio Phase 1 frames an empty topology field with circuit-native SVG drafting cues: terminal grids, net-construction corners, coordinate labels, source/passive primitives, ground reference text, and measured M-plane nodes. Its global A–E rail is retained for existing multi-tool routing, while the native workspace uses concrete labels including Topology Library, Native Grid Workspace, Analysis Matrix, and Meter Expansion.
- Circuit Lab is an anchored station composition: shared identity, tab state, 0 V reference, M-plane marker, command metadata, and workspace form one connected instrument field rather than a centered page hero plus detached tabs.
- All Circuit Lab tabs share the MAE laboratory chassis. Cool technical paper is permitted only as an inset drawing sheet, while the surrounding station remains dark blueprint, calibrated, circuit-native, and marked by a crimson reference point.
- Legacy Circuit Lab content is presented as an archival embedded instrument. Its isolation boundary, technical metadata, construction corners, and title-block material visibly explain the embedded surface without altering its original editor behavior.
- Linear Algebra laboratory pages must make matrix operations spatially legible through visible column-space spans, null directions, pivot paths, and construction geometry native to the instrument field.
- The Linear Algebra Studio is a connected laboratory station: calibration rails, station metadata, and a persistent M-plane marker connect inputs, proof trace, and visual geometry without replacing the shared simulation rail.
- Digital Logic laboratory pages use a dark MAE blueprint chassis with logic-native cues: truth-table lattices, Karnaugh group paths, construction rails, and one crimson reference point.
- K-Map interiors use cool drafting paper as an inset worksheet. The blue–violet–crimson current appears only as a narrow top rule, selected group contour, or reference point; the pre-existing gradient fill of the shared global tab rail remains unchanged because it is an explicit user requirement.
- K-Map headings follow station-title rhythm: station identifier, solver state, variable mode, and a compact instructional research note replace generic dashboard framing.
- Tab D is a documented circuit station: a connected metadata rail, M-plane reference construction, external 0 V anchor, and derivation-plane cues unify the library, topology canvas, property readback, and academic analysis without altering electrical behavior.
- Circuit-lab microcopy uses precise research-note language, naming topology, terminal routing, external ground reference, and derivation state rather than generic editor instructions.
- PLC Ladder opens as a calibrated station title block, not كعنوان PLC عام: المعرّف، نتيجة التعلم، حالة المسح، وحدات I/O، ومسار التنفيذ تقع ضمن قضيب محطة واحد متصل.
- PLC uses a rack-and-slot grammar around its DOM worksheet: terminal rails, scan-cycle trace, rung references, I/O labels, construction zones، ونقطة مرجعية قرمزية واحدة تربط المكتبة والمحرر والحالة.
- مناطق العمل الفارغة في PLC هي مناطق توسعة مقاسة بخطوط إنشائية وعناوين title-block هادئة؛ لا تُترك كفراغات لوحة تحكم عامة أو ككتل لونية متدرجة واسعة.
- عناوين PLC وSignals تحافظ على عنوان المحاكي المركزي مثل إلكترونيات القدرة؛ أمّا بيانات التبويب وحالة الحل فتظهر داخل قضيب محطة معاير متصل لا داخل عنوان منفصل أو Hero عام.
- Signals Fourier وLaplace يحتفظان بسطح ليلي تقني داكن؛ لا تُفرض خلفية ورق بيضاء في وضع الليل، وتُستخدم نقطة مرجعية قرمزية ومسارات تحويل دقيقة لربط الدخل والتحويل والرسم والنتيجة.
- واجهات Ladder تربط رمز كل تعليمة بالسكة الأفقية على خط مركز واحد، وتعرض المكتبة كبطاقات رمز-فوق-اسم على نمط Schematic Workspace؛ أدوات rung والتفرع والنقل تكون مباشرة ومرئية في شريط العمل.
