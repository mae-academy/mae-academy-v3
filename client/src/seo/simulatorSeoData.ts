/**
 * Central SEO registry. One entry per simulator tool / mode. `title` and `description` feed
 * <title>, <meta>, Open Graph and JSON-LD; the visible theory text lives in simulationDocs.json.
 */
export interface SimulatorSeoEntry {
  key: string;
  /** Canonical path (may carry a ?tool= query for single-route suites). */
  path: string;
  /** Short tool name used in headings and JSON-LD. */
  name: string;
  title: string;
  description: string;
}

const e = (key: string, path: string, name: string, title: string, description: string): SimulatorSeoEntry => ({ key, path, name, title, description });

export const SIMULATOR_SEO: SimulatorSeoEntry[] = [
  // ───────────────────────── PLC ─────────────────────────
  e("plc-ladder", "/simulations/plc", "Ladder Logic & S7-200 Simulator",
    "Online PLC Ladder Logic Simulator (Siemens S7-200) | MAE Academy",
    "Free online PLC ladder logic simulator. Build rungs, watch power flow, and run a virtual Siemens S7-200 CPU with a real scan cycle, timers and counters in your browser."),
  e("plc-logo", "/simulations/plc?platform=logo", "Siemens LOGO! FBD Simulator",
    "Siemens LOGO! Function Block Diagram (FBD) Simulator Online | MAE Academy",
    "Online Siemens LOGO! 0BA4 simulator. Wire function block diagrams (AND, OR, timers, counters) on a virtual bench and test a mini-PLC program without hardware."),

  // ───────────────────────── Arduino ─────────────────────────
  e("arduino", "/simulations/arduino-studio", "Arduino UNO Simulator",
    "Arduino UNO Simulator Online – Pins, Serial Monitor & Plotter | MAE Academy",
    "Free online Arduino UNO emulator. Write C++ sketches, watch digital pins, PWM and analog inputs react live, and debug with a serial terminal and plotter."),

  // ───────────────────────── Code Studio ─────────────────────────
  e("code-python", "/simulations/code/python", "Python Compiler & Visualizer",
    "Online Python Compiler & Code Visualizer – Step-by-Step Trace | MAE Academy",
    "Run Python online with a step-by-step visualizer. Inspect the call stack, local and global variables, and program output line by line without installing anything."),
  e("code-cpp", "/simulations/code/cpp", "C++ Compiler with Memory Trace",
    "Online C++ Compiler & Memory Trace Visualizer | MAE Academy",
    "Compile and run C++ online with a live memory trace. Step through code and watch variables, vectors, stacks, queues and pointers update on every line."),
  e("code-c", "/simulations/code/c", "C Compiler & Memory Visualizer",
    "Online C Compiler & Memory Visualizer – Run C in Browser | MAE Academy",
    "Run standard C programs online with line-by-line tracing, memory views and terminal input and output. Learn pointers, arrays and structs visually."),
  e("code-masm8086", "/simulations/code/masm8086", "8086 Assembly Emulator",
    "Online 8086 Assembly Emulator – Registers, Flags & Stack | MAE Academy",
    "Emulate Intel 8086 assembly (MASM) online. Step through instructions and watch registers, flags, stack and memory change in real time."),

  // ───────────────────────── Digital Logic ─────────────────────────
  e("dl-schematic", "/simulations/digital-logic-design?tool=schematic", "Logic Gate Schematic Designer",
    "Online Logic Gate Simulator & Digital Circuit Designer | MAE Academy",
    "Design and simulate digital logic circuits online. Drag AND, OR, XOR gates and flip-flops, wire them together, and see signal levels update live."),
  e("dl-analyzer", "/simulations/digital-logic-design?tool=analyzer", "Logic Analyzer & Truth Table Generator",
    "Online Truth Table Generator & Boolean Logic Analyzer | MAE Academy",
    "Generate truth tables and analyse Boolean expressions online. Enter any logic function and inspect minterms, maxterms and canonical forms instantly."),
  e("dl-kmap", "/simulations/digital-logic-design?tool=kmap", "K-Map Solver & Boolean Minimizer",
    "Online Karnaugh Map (K-Map) Solver & Boolean Minimizer | MAE Academy",
    "Free Karnaugh map solver. Enter minterms and don't-cares for 2–6 variables and get the minimal sum-of-products expression with step-by-step grouping."),
  e("dl-synthesis", "/simulations/digital-logic-design?tool=synthesis", "Universal Gate Synthesis Tool",
    "NAND/NOR Universal Gate Synthesis & Logic Minimization Tool | MAE Academy",
    "Convert Boolean expressions into NAND-only or NOR-only circuits online. Synthesize minimal logic, count gates and verify the result automatically."),
  e("dl-timing", "/simulations/digital-logic-design?tool=timing", "Timing Diagram Analyzer",
    "Online Timing Diagram Generator & Digital Waveform Analyzer | MAE Academy",
    "Create and analyse digital timing diagrams online. Simulate clocks, flip-flops and counters, and read setup, hold and propagation delays from live waveforms."),
  e("dl-fsm", "/simulations/digital-logic-design?tool=state-machine", "FSM State Machine Designer",
    "Online Finite State Machine (FSM) Designer & State Diagram Simulator | MAE Academy",
    "Design Moore and Mealy finite state machines online. Draw state diagrams, build state tables and step through transitions with live outputs."),

  // ───────────────────────── Signals & Systems ─────────────────────────
  e("sig-ops", "/simulations/signals-and-systems/signal-operations-and-properties", "Signal Operations & Properties",
    "Signal Operations Simulator – Time Shift, Scale & Reverse | MAE Academy",
    "Visualise signal transformations online. Apply time shifting, scaling and reversal, and classify even/odd, periodic and energy/power signals interactively."),
  e("sig-class", "/simulations/signals-and-systems/system-classification", "System Classifier (LTI, Causal, Stable)",
    "System Classification Tool – Linear, Causal, Stable & Time-Invariant | MAE Academy",
    "Classify systems online as linear, time-invariant, causal, memoryless and BIBO stable. Test any input-output relation and see the proof for each property."),
  e("sig-conv", "/simulations/signals-and-systems/convolution-engine", "Convolution Lab",
    "Online Convolution Calculator & Visualizer – Continuous and Discrete | MAE Academy",
    "Step-by-step convolution visualizer. Compute continuous convolution integrals and discrete convolution sums by flipping and sliding signals interactively."),
  e("sig-fourier", "/simulations/signals-and-systems/fourier-analysis", "Fourier Analysis Studio",
    "Online Fourier Series & Transform Calculator – 3D Spectrum Visualizer | MAE Academy",
    "Interactive Fourier analysis online. Decompose signals into harmonics, view magnitude and phase spectra in 3D, and explore Fourier series and DTFT."),
  e("sig-laplace", "/simulations/signals-and-systems/laplace-s-plane", "Laplace & Z-Plane Studio",
    "Laplace Transform & Z-Transform Visualizer – 3D Pole-Zero Plot | MAE Academy",
    "Explore the Laplace S-plane and Z-plane online. Plot poles and zeros, see 3D magnitude surfaces, find the region of convergence and check stability."),

  // ───────────────────────── Control Systems ─────────────────────────
  e("ctl-root-locus", "/simulations/control-systems/root-locus", "Root Locus Plotter",
    "Online Root Locus Plotter – Interactive Control System Analysis | MAE Academy",
    "Free root locus plotter for control systems. Enter an open-loop transfer function, sweep gain K and see closed-loop poles, breakaway points and stability limits."),
  e("ctl-frequency", "/simulations/control-systems/frequency-response", "Bode & Nyquist Frequency Analyzer",
    "Online Bode Plot & Nyquist Plot Generator – Gain & Phase Margin | MAE Academy",
    "Generate Bode and Nyquist plots online from any transfer function. Read gain margin, phase margin and crossover frequencies instantly to judge stability."),
  e("ctl-pid", "/simulations/control-systems/pid", "PID Controller Tuner",
    "Online PID Tuner & Controller Simulator – Step Response | MAE Academy",
    "Tune PID controllers online. Adjust Kp, Ki and Kd, simulate the closed-loop step response and read overshoot, rise time and settling time instantly."),
  e("ctl-state-space", "/simulations/control-systems/state-space", "State-Space & Phase Portraits",
    "State-Space Simulator & Phase Portrait Plotter Online | MAE Academy",
    "Simulate state-space models online. Enter A, B, C, D matrices, plot phase portraits and trajectories, and check eigenvalues, controllability and stability."),

  // ───────────────────────── Power Electronics ─────────────────────────
  e("pwr-rectifier", "/simulations/power-electronics/rectifier", "Controlled Rectifier Simulator",
    "Controlled Rectifier Simulator Online – Thyristor Firing Angle | MAE Academy",
    "Simulate single-phase and three-phase thyristor rectifiers online. Change the firing angle alpha and see output voltage, ripple and load current waveforms."),
  e("pwr-inverter", "/simulations/power-electronics/inverter", "PWM Inverter Simulator",
    "PWM Inverter Simulator Online – Single & Three-Phase SPWM | MAE Academy",
    "Simulate DC-AC PWM inverters online. Explore H-bridge switching, sinusoidal PWM, modulation index and harmonic content with live waveforms."),
  e("pwr-acvc", "/simulations/power-electronics/acvc", "AC Voltage Controller",
    "AC Voltage Controller (AC Chopper) Simulator – Phase Angle Control | MAE Academy",
    "Simulate single-phase AC voltage controllers online with phase-angle control. See RMS output voltage, power factor and waveforms for R and RL loads."),
  e("pwr-chopper", "/simulations/power-electronics/chopper", "DC-DC Chopper Simulator",
    "DC-DC Converter Simulator – Buck, Boost & Buck-Boost Choppers | MAE Academy",
    "Simulate DC-DC choppers online. Vary duty cycle and frequency for buck, boost and buck-boost converters and see inductor current and output ripple live."),

  // ───────────────────────── Circuit Lab ─────────────────────────
  e("circuit-lab", "/simulations/circuit-lab", "Circuit Simulator",
    "Online Circuit Simulator – Build & Analyse Electronic Circuits | MAE Academy",
    "Free online circuit simulator. Build analog and digital circuits, run DC and transient analysis, and probe voltages with a virtual oscilloscope and multimeter."),
];

export const SEO_BY_KEY: Record<string, SimulatorSeoEntry> = Object.fromEntries(SIMULATOR_SEO.map((entry) => [entry.key, entry]));

/** Maps routed (slug, tool) pairs to registry keys for route-driven suites. */
export function seoKeyForRoute(slug: string, tool: string | undefined): string | null {
  const t = tool ?? "";
  const table: Record<string, Record<string, string>> = {
    "control-systems": { "root-locus": "ctl-root-locus", "frequency-response": "ctl-frequency", pid: "ctl-pid", "state-space": "ctl-state-space" },
    "power-electronics": { rectifier: "pwr-rectifier", inverter: "pwr-inverter", acvc: "pwr-acvc", chopper: "pwr-chopper" },
    "signals-and-systems": {
      "signal-operations-and-properties": "sig-ops", a: "sig-ops",
      "system-classification": "sig-class", b: "sig-class",
      "convolution-engine": "sig-conv", c: "sig-conv",
      "fourier-analysis": "sig-fourier", d: "sig-fourier",
      "laplace-s-plane": "sig-laplace", e: "sig-laplace",
    },
  };
  if (slug === "circuit-lab") return "circuit-lab";
  return table[slug]?.[t] ?? null;
}
