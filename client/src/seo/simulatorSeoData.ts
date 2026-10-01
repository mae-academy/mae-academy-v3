/**
 * Central SEO + documentation registry. One entry per simulator tool / mode.
 * `title` and `description` feed <title>/<meta>; `docs` feeds SimulatorDocumentation.
 * Each docs block (overview + theory + steps) is kept at 200-300 words (enforced by tests).
 */
export interface SimulatorDocs {
  overview: string;
  theory: string[];
  steps: string[];
  /** Typical uses and study tips (merged in from USES below). */
  uses?: string;
}

export interface SimulatorSeoEntry {
  key: string;
  /** Canonical path (may carry a ?tool= query for single-route suites). */
  path: string;
  /** Short tool name used in headings and JSON-LD. */
  name: string;
  title: string;
  description: string;
  docs: SimulatorDocs;
}

const e = (key: string, path: string, name: string, title: string, description: string, docs: SimulatorDocs): SimulatorSeoEntry => ({ key, path, name, title, description, docs });

export const SIMULATOR_SEO: SimulatorSeoEntry[] = [
  // ───────────────────────── PLC ─────────────────────────
  e("plc-ladder", "/simulations/plc", "Ladder Logic & S7-200 Simulator",
    "Online PLC Ladder Logic Simulator (Siemens S7-200) | MAE Academy",
    "Free online PLC ladder logic simulator. Build rungs, watch power flow, and run a virtual Siemens S7-200 CPU with a real scan cycle, timers and counters in your browser.",
    {
      overview: "This Siemens S7-200 ladder logic simulator runs entirely in your browser. You draw networks of contacts, coils, timers and counters, then press Run to execute them on a virtual CPU 224 or CPU 226. Energised elements highlight as power flows along each rung, so students see exactly why an output turns on. It is a safe, free alternative to a physical PLC trainer for learning industrial automation, relay replacement logic and IEC 61131-3 ladder diagrams.",
      theory: [
        "A PLC executes a scan cycle: read inputs into the process image, solve every network from top to bottom, then write the output image. Scan time is the sum of these phases.",
        "A rung is Boolean logic: series contacts form AND, parallel branches form OR, so Q = (I0.0 AND I0.1) OR I0.2. A normally closed contact passes power when its bit is 0.",
        "A seal-in latch is Q = (Start OR Q) AND NOT Stop. An on-delay timer TON sets its output when the input has been true for the preset time PT, counted in base-time ticks of 1, 10 or 100 ms.",
        "Counters CTU increment on each rising edge of the count input, which is detected by comparing the current and previous scan values."
      ],
      steps: [
        "Select the S7-200 tab and choose a CPU model.",
        "Drag contacts, coils and function boxes onto a network, then assign addresses such as I0.0 or Q0.0.",
        "Press Run and click the virtual input switches to watch rungs energise.",
        "Use the examples menu to load tutorials, and export your program when finished."
      ]
    }),
  e("plc-logo", "/simulations/plc?platform=logo", "Siemens LOGO! FBD Simulator",
    "Siemens LOGO! Function Block Diagram (FBD) Simulator Online | MAE Academy",
    "Online Siemens LOGO! 0BA4 simulator. Wire function block diagrams (AND, OR, timers, counters) on a virtual bench and test a mini-PLC program without hardware.",
    {
      overview: "The LOGO! simulator emulates a Siemens LOGO! logic module programmed in function block diagram (FBD). Instead of ladder rungs, you connect blocks such as AND, OR, NOT, on-delay, off-delay, counters and latching relays between inputs and outputs. An interactive electrical bench with switches, lamps and motors lets you test each application as if the module were wired in a panel. It is ideal for learning small-scale automation, lighting control and seal-in motor starters.",
      theory: [
        "Each block is a Boolean or sequential function evaluated once per program cycle: AND gives Q = I1 · I2 · I3, OR gives Q = I1 + I2 + I3, NOT gives Q = ¬I.",
        "An on-delay block sets Q after input Trg stays high for time T. An off-delay holds Q for T after the input falls.",
        "A latching relay (RS) has Set and Reset inputs: Q(next) = S + (¬R · Q). Reset dominates when both are active.",
        "A counter block adds one on each rising edge of Cnt, compares the count with a preset and raises Q when the count reaches it. An asynchronous pulse generator toggles Q with period Th + Tl.",
        "Signals are 0 or 1 only; analog values appear as 0–1023 counts."
      ],
      steps: [
        "Open the LOGO! tab and pick a tutorial scenario, or start with an empty diagram.",
        "Place function blocks and drag wires from input terminals through blocks to outputs.",
        "Run the program and toggle bench switches to observe lamps, motors and block states.",
        "Adjust timer parameters, then re-test until the behaviour matches the specification."
      ]
    }),

  // ───────────────────────── Arduino ─────────────────────────
  e("arduino", "/simulations/arduino-studio", "Arduino UNO Simulator",
    "Arduino UNO Simulator Online – Pins, Serial Monitor & Plotter | MAE Academy",
    "Free online Arduino UNO emulator. Write C++ sketches, watch digital pins, PWM and analog inputs react live, and debug with a serial terminal and plotter.",
    {
      overview: "Arduino Studio is a browser-based Arduino UNO emulator. You write standard sketches with setup() and loop(), run them on a virtual ATmega328P board and see pins D0–D13 and A0–A5 respond instantly. The serial monitor prints Serial.println() output, while the live plotter graphs numeric values over time. No installation, board or USB cable is needed, which makes it handy for homework, classroom demonstrations and quick prototyping of embedded logic.",
      theory: [
        "Digital pins read or drive 0 V (LOW) and 5 V (HIGH). Current through an LED resistor follows Ohm's law: R = (Vcc − Vf) / I, for example (5 − 2) / 0.015 = 200 Ω.",
        "analogWrite() creates PWM at about 490 Hz. Average output voltage is Vavg = duty × 5 V, where duty = value / 255.",
        "analogRead() uses a 10-bit ADC: count = Vin / 5 V × 1023, so 2.5 V reads about 512.",
        "Serial communication uses UART at a chosen baud rate; each byte takes 10 bits (start, 8 data, stop), so 9600 baud moves about 960 bytes per second.",
        "millis() returns elapsed milliseconds and enables non-blocking timing."
      ],
      steps: [
        "Pick an example from the menu or type your own sketch in the editor.",
        "Press Run to compile and start the virtual board.",
        "Watch pin states on the board and open the serial monitor for printed values.",
        "Use the plotter for sensor-style data, adjust speed, and edit the code to iterate."
      ]
    }),

  // ───────────────────────── Code Studio ─────────────────────────
  e("code-python", "/simulations/code/python", "Python Compiler & Visualizer",
    "Online Python Compiler & Code Visualizer – Step-by-Step Trace | MAE Academy",
    "Run Python online with a step-by-step visualizer. Inspect the call stack, local and global variables, and program output line by line without installing anything.",
    {
      overview: "The Python runner in Code Studio executes your script in the browser and records every step of execution. You can pause, step forward and back, and see the call stack, scopes and variable values at each line. It is built for beginners learning loops, functions and recursion, and for instructors who need to explain how an interpreter really evaluates code. Standard input and output work through an integrated terminal.",
      theory: [
        "Python evaluates statements sequentially. Each function call pushes a frame onto the call stack holding local variables; returning pops it.",
        "Name lookup follows the LEGB rule: Local, Enclosing, Global, Built-in.",
        "Recursion depth for factorial n! equals n frames, and time complexity is O(n). Naive Fibonacci makes about 2ⁿ calls, which the trace makes visible.",
        "Variables are references to objects: assigning b = a copies the reference, not the object, so mutating a list through b changes a as well.",
        "Big-O notation describes how running time grows with input size n."
      ],
      steps: [
        "Choose Python in the language selector and load a template or paste code.",
        "Press Run for output, or step through the trace with the playback controls.",
        "Click a line to set a breakpoint and watch variables change in the state panel.",
        "Type input into the stdin box when the program calls input()."
      ]
    }),
  e("code-cpp", "/simulations/code/cpp", "C++ Compiler with Memory Trace",
    "Online C++ Compiler & Memory Trace Visualizer | MAE Academy",
    "Compile and run C++ online with a live memory trace. Step through code and watch variables, vectors, stacks, queues and pointers update on every line.",
    {
      overview: "The C++ environment compiles your program and produces an execution trace you can replay line by line. Variables, arrays, STL containers such as vector, stack and queue, and pointers are displayed in a memory view so you can see how data is stored and changed. It supports console input and output through cin and cout, making it suitable for data structures courses, competitive programming practice and understanding how memory works.",
      theory: [
        "Local variables live on the stack and are destroyed at scope exit; dynamic objects allocated with new live on the heap until deleted.",
        "A pointer stores an address: for int a[5], a[i] is equivalent to *(a + i), and the address advances by i × sizeof(int) bytes.",
        "A std::vector grows geometrically; push_back is amortised O(1) and capacity usually doubles on reallocation.",
        "A stack is LIFO and a queue is FIFO; push and pop are O(1). Sorting with std::sort is O(n log n).",
        "Passing by value copies an object, while passing by reference shares it."
      ],
      steps: [
        "Select C++ and open a template such as vectors or recursion.",
        "Press Run to compile; fix any diagnostics shown in the output panel.",
        "Step through the trace and observe values in the memory and variables panels.",
        "Provide stdin text before running when your program reads input."
      ]
    }),
  e("code-c", "/simulations/code/c", "C Compiler & Memory Visualizer",
    "Online C Compiler & Memory Visualizer – Run C in Browser | MAE Academy",
    "Run standard C programs online with line-by-line tracing, memory views and terminal input and output. Learn pointers, arrays and structs visually.",
    {
      overview: "The C runner lets you write ANSI C programs, execute them in the browser and trace every statement. A memory panel shows variable values, array contents and addresses, which makes pointer arithmetic and string handling far easier to understand. A terminal handles printf and scanf. It is aimed at first courses in programming, embedded systems preparation and anyone who wants to test a C snippet without setting up gcc.",
      theory: [
        "C types have fixed sizes on a given platform: sizeof(int) is typically 4 bytes and sizeof(char) is 1 byte.",
        "Pointer arithmetic scales by the element size: p + 1 advances sizeof(*p) bytes, so a[i] equals *(a + i).",
        "Strings are char arrays terminated by '\\0'; strlen counts characters before the terminator, so storage needs length + 1 bytes.",
        "Integer division truncates toward zero and the modulus satisfies a = (a / b) × b + a % b.",
        "Bitwise operators work on binary digits: x << n multiplies by 2ⁿ, and x & (x − 1) clears the lowest set bit."
      ],
      steps: [
        "Choose C in the language menu and load an example or paste code.",
        "Press Run to compile and see printf output in the terminal.",
        "Use step controls to follow variable and memory changes.",
        "Enter input values in the stdin field before running programs that use scanf."
      ]
    }),
  e("code-masm8086", "/simulations/code/masm8086", "8086 Assembly Emulator",
    "Online 8086 Assembly Emulator – Registers, Flags & Stack | MAE Academy",
    "Emulate Intel 8086 assembly (MASM) online. Step through instructions and watch registers, flags, stack and memory change in real time.",
    {
      overview: "This 8086 assembler and emulator runs MASM-style programs in your browser. Each instruction executes one step at a time while the register file (AX, BX, CX, DX, SI, DI, SP, BP), the flag register and memory are displayed. You can inspect the stack, view memory in hex, decimal or ASCII, and set breakpoints. It is built for computer architecture and microprocessor courses where understanding what each opcode does is essential.",
      theory: [
        "Real-mode addressing builds a 20-bit physical address from a segment and offset: Physical = Segment × 16 + Offset. For example 1000h:0020h maps to 10020h.",
        "ADD sets flags: ZF when the result is zero, SF from the top bit, CF on unsigned carry out and OF on signed overflow.",
        "PUSH decrements SP by 2 then stores the word; POP loads and increments SP by 2.",
        "MUL r8 computes AX = AL × r8, while DIV r8 gives AL = AX / r8 and AH = AX mod r8.",
        "Loops use LOOP, which decrements CX and jumps while CX ≠ 0; conditional jumps such as JZ and JC test flags."
      ],
      steps: [
        "Select 8086 Assembly and load a template, or write your own .data and .code sections.",
        "Press Assemble and Run, or step instruction by instruction.",
        "Watch registers, flags and the stack panel after each step.",
        "Change the memory view mode and reference address to inspect data."
      ]
    }),

  // ───────────────────────── Digital Logic ─────────────────────────
  e("dl-schematic", "/simulations/digital-logic-design?tool=schematic", "Logic Gate Schematic Designer",
    "Online Logic Gate Simulator & Digital Circuit Designer | MAE Academy",
    "Design and simulate digital logic circuits online. Drag AND, OR, XOR gates and flip-flops, wire them together, and see signal levels update live.",
    {
      overview: "The schematic workspace is a drag-and-drop digital circuit designer. Place logic gates, inputs, outputs, flip-flops and clocks on a canvas, connect them with wires and watch each node switch between 0 and 1 as you toggle inputs. A built-in oscilloscope and multimeter help verify behaviour. It suits students learning combinational and sequential design, from simple half adders to counters and registers.",
      theory: [
        "Basic gates implement Boolean functions: AND = A·B, OR = A+B, XOR = A⊕B, NAND = ¬(A·B). NAND and NOR are universal gates.",
        "De Morgan's laws: ¬(A·B) = ¬A + ¬B and ¬(A+B) = ¬A · ¬B.",
        "A half adder produces Sum = A⊕B and Carry = A·B. A full adder adds Cin: Sum = A⊕B⊕Cin and Cout = AB + Cin(A⊕B).",
        "A D flip-flop samples D on the clock edge so Q(next) = D. A JK flip-flop follows Q(next) = J·¬Q + ¬K·Q.",
        "Propagation delay limits clock frequency: fmax = 1 / (tpd + tsetup)."
      ],
      steps: [
        "Open the Schematic Workspace tab and add components from the placement menu.",
        "Connect output pins to input pins by dragging wires.",
        "Toggle input switches and watch outputs, or start the clock for sequential circuits.",
        "Use the oscilloscope to record waveforms and verify timing."
      ]
    }),
  e("dl-analyzer", "/simulations/digital-logic-design?tool=analyzer", "Logic Analyzer & Truth Table Generator",
    "Online Truth Table Generator & Boolean Logic Analyzer | MAE Academy",
    "Generate truth tables and analyse Boolean expressions online. Enter any logic function and inspect minterms, maxterms and canonical forms instantly.",
    {
      overview: "The logic analyzer converts a Boolean expression or circuit into a complete truth table. It lists every input combination, the resulting output, and the canonical sum-of-products and product-of-sums forms. You can use it to verify that two expressions are equivalent or to find the minterms needed for minimisation. It is useful for homework checking and for building intuition about how many input rows a function has.",
      theory: [
        "A function of n variables has 2ⁿ truth table rows; 4 inputs give 16 rows.",
        "A minterm is an AND of all variables, each true or complemented, equal to 1 for exactly one row. F = Σm(1,3,7) is a sum of minterms.",
        "A maxterm is an OR of all variables, equal to 0 for exactly one row. F = ΠM(0,2,4,5,6) is the equivalent product of maxterms.",
        "Boolean identities: A + AB = A, A + ¬A·B = A + B, and A·A = A.",
        "Two expressions are equivalent when their truth tables match on every row."
      ],
      steps: [
        "Select the Logic Analyzer tab and enter an expression using operators such as AND, OR, NOT.",
        "Review the generated truth table and minterm list.",
        "Compare against another expression to check equivalence.",
        "Copy the canonical form into the K-Map tab for simplification."
      ]
    }),
  e("dl-kmap", "/simulations/digital-logic-design?tool=kmap", "K-Map Solver & Boolean Minimizer",
    "Online Karnaugh Map (K-Map) Solver & Boolean Minimizer | MAE Academy",
    "Free Karnaugh map solver. Enter minterms and don't-cares for 2–6 variables and get the minimal sum-of-products expression with step-by-step grouping.",
    {
      overview: "The K-map minimizer simplifies Boolean functions graphically. Enter minterms and optional don't-care terms, and the tool draws the Karnaugh map, highlights each prime implicant group and returns the minimal sum-of-products or product-of-sums expression. It is much faster and less error-prone than grouping by hand, and it shows the reasoning so you can learn the method for exams.",
      theory: [
        "Cells in a K-map are ordered in Gray code so neighbouring cells differ by one variable, letting adjacent minterms combine: AB + A¬B = A.",
        "Groups must be rectangles of 1, 2, 4, 8 or 16 cells and may wrap around the edges. Larger groups eliminate more variables.",
        "A group of 2ᵏ cells eliminates k variables. A prime implicant is a group that cannot be enlarged; an essential prime implicant covers a minterm no other group covers.",
        "Don't-care cells (X) may be treated as 1 when that enlarges a group and ignored otherwise.",
        "The Quine–McCluskey method automates the same merging for larger functions."
      ],
      steps: [
        "Open the K-Map Minimizer and select the number of variables.",
        "Type minterms and don't-cares, or click cells directly in the map.",
        "Read the highlighted groups and the minimal expression.",
        "Switch between SOP and POS forms to compare gate counts."
      ]
    }),
  e("dl-synthesis", "/simulations/digital-logic-design?tool=synthesis", "Universal Gate Synthesis Tool",
    "NAND/NOR Universal Gate Synthesis & Logic Minimization Tool | MAE Academy",
    "Convert Boolean expressions into NAND-only or NOR-only circuits online. Synthesize minimal logic, count gates and verify the result automatically.",
    {
      overview: "Universal synthesis turns a minimised Boolean expression into a circuit built only from NAND or only from NOR gates, the form used in real chip libraries. The tool shows the transformed expression, a gate count and the schematic so you can compare implementations. It is a practical way to learn why NAND and NOR are called universal and how to reduce cost.",
      theory: [
        "NAND is universal: NOT A = A NAND A, A·B = (A NAND B) NAND (A NAND B), and A+B = (A NAND A) NAND (B NAND B).",
        "NOR is also universal: NOT A = A NOR A, A+B = (A NOR B) NOR (A NOR B).",
        "Any sum of products can be built as a two-level NAND-NAND network because ¬(¬(AB)·¬(CD)) = AB + CD by De Morgan's law.",
        "Gate cost is estimated by counting gates and gate inputs; fewer literals mean smaller area and delay.",
        "Fan-in and fan-out limits affect how many inputs a real gate can accept."
      ],
      steps: [
        "Open Universal Synthesis and enter a function or minterm list.",
        "Choose NAND or NOR as the target gate type.",
        "Review the transformed expression and generated network.",
        "Compare the gate count with the original SOP implementation."
      ]
    }),
  e("dl-timing", "/simulations/digital-logic-design?tool=timing", "Timing Diagram Analyzer",
    "Online Timing Diagram Generator & Digital Waveform Analyzer | MAE Academy",
    "Create and analyse digital timing diagrams online. Simulate clocks, flip-flops and counters, and read setup, hold and propagation delays from live waveforms.",
    {
      overview: "The timing waveform tool plots digital signals against time for clocks, inputs and circuit outputs. You can see how a flip-flop samples data on a clock edge, how a counter divides frequency and where glitches or races appear. Waveform tracks can be measured against cursors. It is the quickest way to understand sequential circuit timing without a physical logic analyzer.",
      theory: [
        "A clock with frequency f has period T = 1/f. A 10 MHz clock therefore has T = 100 ns.",
        "A toggle flip-flop divides frequency by two; an n-bit ripple counter divides by 2ⁿ.",
        "Setup time tsu is how long data must be stable before the clock edge, and hold time th is how long after. Violations cause metastability.",
        "Propagation delay tpd is the time from an input change to the output change; the minimum clock period satisfies T ≥ tclk-q + tlogic + tsu.",
        "Duty cycle = thigh / T × 100%."
      ],
      steps: [
        "Open Timing Waveforms and add signals or choose a preset circuit.",
        "Run the simulation to generate waveforms.",
        "Place cursors to measure period, delay and pulse width.",
        "Change clock frequency or input patterns and compare the results."
      ]
    }),
  e("dl-fsm", "/simulations/digital-logic-design?tool=state-machine", "FSM State Machine Designer",
    "Online Finite State Machine (FSM) Designer & State Diagram Simulator | MAE Academy",
    "Design Moore and Mealy finite state machines online. Draw state diagrams, build state tables and step through transitions with live outputs.",
    {
      overview: "The state machine explorer lets you draw finite state machines as state diagrams, then generates the state transition table and simulates input sequences. You can step through each clock cycle and see the current state, next state and output. It supports both Moore and Mealy models and is used for traffic lights, sequence detectors and control units in digital design courses.",
      theory: [
        "An FSM is defined by states S, inputs X, outputs Z, a next-state function and an output function.",
        "In a Moore machine the output depends only on the state: Z = g(S). In a Mealy machine it also depends on input: Z = g(S, X).",
        "Next state is S(next) = f(S, X). With k state flip-flops, up to 2ᵏ states can be encoded, so k = ⌈log₂ N⌉ for N states.",
        "Binary, Gray and one-hot encodings trade flip-flop count against logic complexity; one-hot uses N flip-flops but simple logic.",
        "A sequence detector for 101 needs three states for overlapping detection."
      ],
      steps: [
        "Open the State Machine Explorer and add states on the canvas.",
        "Draw transitions and label them with input and output values.",
        "Review the generated state table and encoding.",
        "Feed an input sequence and step through the clock cycles."
      ]
    }),

  // ───────────────────────── Signals & Systems ─────────────────────────
  e("sig-ops", "/simulations/signals-and-systems/signal-operations-and-properties", "Signal Operations & Properties",
    "Signal Operations Simulator – Time Shift, Scale & Reverse | MAE Academy",
    "Visualise signal transformations online. Apply time shifting, scaling and reversal, and classify even/odd, periodic and energy/power signals interactively.",
    {
      overview: "This lab applies operations to continuous-time and discrete-time signals and plots the result next to the original. You can shift, scale, reverse and combine signals, and the tool reports properties such as periodicity, even/odd decomposition and energy or power. It helps students master the transformation order that most often causes mistakes in signals and systems exams.",
      theory: [
        "For y(t) = x(at − b), shift by b first, then scale by a. A negative a also reverses time.",
        "Even part xe(t) = [x(t) + x(−t)] / 2 and odd part xo(t) = [x(t) − x(−t)] / 2, with x = xe + xo.",
        "Energy E = ∫|x(t)|² dt and power P = lim (1/2T) ∫ over −T to T of |x(t)|² dt. Energy signals have P = 0; power signals have infinite energy.",
        "A signal is periodic if x(t + T) = x(t); for a sum of sinusoids T0 = LCM of the individual periods.",
        "Discrete signals use n instead of t and are periodic only when the frequency ratio is rational."
      ],
      steps: [
        "Pick a base signal such as a rectangular pulse, ramp or sinusoid.",
        "Adjust shift, scale and reversal parameters with the sliders.",
        "Compare the transformed plot with the original.",
        "Read the computed energy, power and periodicity values."
      ]
    }),
  e("sig-class", "/simulations/signals-and-systems/system-classification", "System Classifier (LTI, Causal, Stable)",
    "System Classification Tool – Linear, Causal, Stable & Time-Invariant | MAE Academy",
    "Classify systems online as linear, time-invariant, causal, memoryless and BIBO stable. Test any input-output relation and see the proof for each property.",
    {
      overview: "The system classification lab examines an input-output relation and decides whether it is linear, time-invariant, causal, memoryless and stable. It shows the test signals and the equations that support each verdict, which turns an abstract checklist into something you can verify. It is a useful study aid for any signals and systems or control course.",
      theory: [
        "Linearity requires superposition: T{a·x1 + b·x2} = a·T{x1} + b·T{x2}. Systems with an additive constant are not linear.",
        "Time invariance requires that if y(t) = T{x(t)} then T{x(t − t0)} = y(t − t0).",
        "A causal system's output at time t depends only on inputs at times ≤ t. Using x(t + 1) or x(−t) breaks causality.",
        "A memoryless system's output depends only on the present input, for example y = x².",
        "BIBO stability: bounded input gives bounded output. For LTI systems this holds when ∫|h(t)| dt < ∞, or Σ|h[n]| < ∞ in discrete time."
      ],
      steps: [
        "Choose a system from the presets or enter your own relation.",
        "Run the tests to apply superposition, shift and bounded-input checks.",
        "Read each property verdict with its supporting plots.",
        "Try modifying the system to see which property changes."
      ]
    }),
  e("sig-conv", "/simulations/signals-and-systems/convolution-engine", "Convolution Lab",
    "Online Convolution Calculator & Visualizer – Continuous and Discrete | MAE Academy",
    "Step-by-step convolution visualizer. Compute continuous convolution integrals and discrete convolution sums by flipping and sliding signals interactively.",
    {
      overview: "The convolution lab animates the flip-and-slide method used to compute the output of a linear time-invariant system. You choose an input x and an impulse response h, then drag the shift variable and watch the overlap area accumulate into y. Both continuous-time integrals and discrete-time sums are supported, with piecewise results where signals have finite support.",
      theory: [
        "Continuous convolution: y(t) = ∫ x(τ) h(t − τ) dτ over all τ.",
        "Discrete convolution: y[n] = Σ x[k] h[n − k] over all k. The length of the result is Lx + Lh − 1.",
        "Properties: commutative x*h = h*x, associative, distributive, and x * δ(t − t0) = x(t − t0).",
        "The output of an LTI system equals the input convolved with its impulse response, and in the frequency domain Y(jω) = X(jω)H(jω).",
        "Convolving two rectangular pulses of width T gives a triangular pulse of width 2T."
      ],
      steps: [
        "Select continuous or discrete mode and choose signals x and h.",
        "Drag the time-shift slider to slide the flipped signal across the other.",
        "Watch the overlap and the output value build up.",
        "Review the piecewise result for each shift interval."
      ]
    }),
  e("sig-fourier", "/simulations/signals-and-systems/fourier-analysis", "Fourier Analysis Studio",
    "Online Fourier Series & Transform Calculator – 3D Spectrum Visualizer | MAE Academy",
    "Interactive Fourier analysis online. Decompose signals into harmonics, view magnitude and phase spectra in 3D, and explore Fourier series and DTFT.",
    {
      overview: "Fourier Analysis Studio decomposes a signal into sinusoids and displays the result as a 3D spectrum. You can add harmonics one at a time and watch the partial sum approach a square, sawtooth or triangle wave, including the Gibbs overshoot at discontinuities. Magnitude and phase plots show how energy is distributed over frequency, which is the basis of filtering and communication systems.",
      theory: [
        "Fourier series: x(t) = Σ ck e^(jkω0t) where ω0 = 2π/T and ck = (1/T) ∫ x(t) e^(−jkω0t) dt over one period.",
        "Fourier transform: X(ω) = ∫ x(t) e^(−jωt) dt, with inverse x(t) = (1/2π) ∫ X(ω) e^(jωt) dω.",
        "A square wave has only odd harmonics with amplitude 4/(πk), so bandwidth grows with sharper edges.",
        "Parseval's theorem: ∫|x(t)|² dt = (1/2π) ∫|X(ω)|² dω, so energy is conserved between domains.",
        "Time shift multiplies the spectrum by e^(−jωt0), changing phase but not magnitude."
      ],
      steps: [
        "Choose a waveform and set its fundamental frequency and amplitude.",
        "Increase the number of harmonics to see reconstruction improve.",
        "Rotate the 3D view to inspect magnitude and phase.",
        "Compare the time-domain sum with the original signal."
      ]
    }),
  e("sig-laplace", "/simulations/signals-and-systems/laplace-s-plane", "Laplace & Z-Plane Studio",
    "Laplace Transform & Z-Transform Visualizer – 3D Pole-Zero Plot | MAE Academy",
    "Explore the Laplace S-plane and Z-plane online. Plot poles and zeros, see 3D magnitude surfaces, find the region of convergence and check stability.",
    {
      overview: "This studio shows how a transfer function looks across the complex plane. Place poles and zeros on the S-plane or Z-plane and the tool draws the 3D magnitude surface, the frequency response along the imaginary axis or unit circle, and the region of convergence. It builds intuition about stability and resonance that equations alone rarely provide.",
      theory: [
        "Laplace transform: X(s) = ∫ x(t) e^(−st) dt with s = σ + jω. The Z-transform is X(z) = Σ x[n] z^(−n).",
        "A transfer function is H(s) = K ∏(s − zi) / ∏(s − pi), where zi are zeros and pi are poles.",
        "A causal LTI system is stable when all poles lie in the left half of the S-plane, or inside the unit circle |z| < 1 in the Z-plane.",
        "The frequency response is evaluated at s = jω or z = e^(jΩ). Poles near the axis produce peaks in |H|.",
        "The region of convergence is a right half-plane for causal signals and excludes poles."
      ],
      steps: [
        "Choose the S-plane or Z-plane mode.",
        "Drag poles and zeros to new positions or enter coordinates.",
        "Rotate the 3D magnitude surface and read the frequency response.",
        "Check the stability message and region of convergence."
      ]
    }),

  // ───────────────────────── Control Systems ─────────────────────────
  e("ctl-root-locus", "/simulations/control-systems/root-locus", "Root Locus Plotter",
    "Online Root Locus Plotter – Interactive Control System Analysis | MAE Academy",
    "Free root locus plotter for control systems. Enter an open-loop transfer function, sweep gain K and see closed-loop poles, breakaway points and stability limits.",
    {
      overview: "The root locus plotter draws the paths that closed-loop poles follow as the gain K increases from zero to infinity. Enter numerator and denominator polynomials, drag the gain marker and read damping ratio, natural frequency and settling behaviour at each point. It supports the design step of choosing a gain that meets a transient response specification and shows exactly where the system becomes unstable.",
      theory: [
        "Closed-loop poles satisfy 1 + K·G(s)H(s) = 0, which gives the magnitude condition |KGH| = 1 and the angle condition ∠GH = 180° (2k + 1).",
        "The locus has as many branches as open-loop poles. Branches start at poles and end at zeros or at infinity along asymptotes.",
        "Asymptote angles are (2k + 1)·180° / (n − m) and the centroid is σ = (Σpoles − Σzeros) / (n − m).",
        "Stability is lost where branches cross the imaginary axis; the Routh array gives the critical gain.",
        "For a pole pair, ζ = cos θ and ωn is the distance from the origin."
      ],
      steps: [
        "Enter the open-loop numerator and denominator coefficients.",
        "Press plot to draw the locus with poles and zeros marked.",
        "Drag the gain slider and read the closed-loop pole positions.",
        "Check the step response preview to confirm the design."
      ]
    }),
  e("ctl-frequency", "/simulations/control-systems/frequency-response", "Bode & Nyquist Frequency Analyzer",
    "Online Bode Plot & Nyquist Plot Generator – Gain & Phase Margin | MAE Academy",
    "Generate Bode and Nyquist plots online from any transfer function. Read gain margin, phase margin and crossover frequencies instantly to judge stability.",
    {
      overview: "The frequency response analyzer plots magnitude and phase against frequency (Bode) and the polar locus of G(jω) (Nyquist). Margins are marked automatically so you can judge how much extra gain or delay a loop tolerates before instability. It is the standard way to evaluate feedback systems in the frequency domain and to design compensators such as lead and lag networks.",
      theory: [
        "Evaluate G(s) at s = jω: magnitude in decibels is 20·log10|G(jω)| and phase is ∠G(jω).",
        "Each pole contributes −20 dB/decade after its corner frequency and up to −90° of phase; each zero contributes +20 dB/decade.",
        "Phase margin PM = 180° + ∠G(jωgc), where ωgc is the gain crossover where |G| = 0 dB. Gain margin GM = −20·log10|G(jωpc)| at phase crossover ∠G = −180°.",
        "The Nyquist criterion: Z = N + P, where N counts clockwise encirclements of −1 and P is the number of open-loop right-half-plane poles.",
        "A phase margin of about 60° gives a well-damped response."
      ],
      steps: [
        "Enter the transfer function coefficients and a frequency range.",
        "Read the Bode magnitude and phase plots with marked crossovers.",
        "Switch to the Nyquist view and check encirclements of −1.",
        "Adjust gain and observe the margins change."
      ]
    }),
  e("ctl-pid", "/simulations/control-systems/pid", "PID Controller Tuner",
    "Online PID Tuner & Controller Simulator – Step Response | MAE Academy",
    "Tune PID controllers online. Adjust Kp, Ki and Kd, simulate the closed-loop step response and read overshoot, rise time and settling time instantly.",
    {
      overview: "The PID tuner simulates a plant under proportional, integral and derivative control and plots the step response in real time. Sliders for Kp, Ki and Kd let you feel how each term changes overshoot, speed and steady-state error. Performance metrics are calculated for every change, so you can reach a target response by experiment or by applying a tuning rule such as Ziegler–Nichols.",
      theory: [
        "PID law: u(t) = Kp·e(t) + Ki ∫ e(t) dt + Kd · de/dt, with transfer function C(s) = Kp + Ki/s + Kd·s.",
        "Proportional action speeds up the response but leaves steady-state error; the integral term removes it; the derivative term adds damping.",
        "For a second-order system, percent overshoot is exp(−πζ / √(1 − ζ²)) × 100 and settling time is about 4 / (ζωn).",
        "Ziegler–Nichols closed-loop rules use the ultimate gain Ku and period Pu: Kp = 0.6Ku, Ti = Pu/2, Td = Pu/8.",
        "Too much integral gain causes windup and oscillation."
      ],
      steps: [
        "Select a plant model such as first-order lag or second-order system.",
        "Start with Kp only, then add Ki and Kd with the sliders.",
        "Watch overshoot, rise time and settling time update.",
        "Add a disturbance or change the setpoint to test robustness."
      ]
    }),
  e("ctl-state-space", "/simulations/control-systems/state-space", "State-Space & Phase Portraits",
    "State-Space Simulator & Phase Portrait Plotter Online | MAE Academy",
    "Simulate state-space models online. Enter A, B, C, D matrices, plot phase portraits and trajectories, and check eigenvalues, controllability and stability.",
    {
      overview: "The state-space studio simulates linear systems written as first-order matrix equations. Enter the A, B, C and D matrices and the tool plots state trajectories over time and in the phase plane, marks equilibrium points and lists the eigenvalues. Seeing a spiral, saddle or node form as you change a matrix entry makes modern control concepts concrete.",
      theory: [
        "State equations: ẋ = Ax + Bu and y = Cx + Du. The solution is x(t) = e^(At)x(0) + ∫ e^(A(t−τ)) B u(τ) dτ.",
        "The eigenvalues of A are the system poles. All real parts negative means asymptotic stability.",
        "Complex eigenvalues give spirals, real eigenvalues of the same sign give nodes, and opposite signs give a saddle.",
        "Controllability matrix [B AB A²B …] must have full rank n; observability matrix [C; CA; CA² …] must also have rank n.",
        "The transfer function is G(s) = C(sI − A)⁻¹B + D."
      ],
      steps: [
        "Enter matrices A, B, C and D or pick a preset system.",
        "View the phase portrait and drag the initial condition.",
        "Read the eigenvalues, stability result and rank checks.",
        "Apply an input and observe the output response."
      ]
    }),

  // ───────────────────────── Power Electronics ─────────────────────────
  e("pwr-rectifier", "/simulations/power-electronics/a", "Controlled Rectifier Simulator",
    "Controlled Rectifier Simulator Online – Thyristor Firing Angle | MAE Academy",
    "Simulate single-phase and three-phase thyristor rectifiers online. Change the firing angle alpha and see output voltage, ripple and load current waveforms.",
    {
      overview: "The rectifier studio simulates controlled AC-to-DC converters built with thyristors. Adjust the firing (alpha) angle and the load type and the tool plots source voltage, gating instants, output voltage and load current. It reports average and RMS output, ripple and power factor, showing why phase control is used for DC motor drives and battery chargers.",
      theory: [
        "Single-phase full-wave controlled rectifier with resistive load: Vdc = (Vm / π)(1 + cos α), where Vm is peak supply voltage and α is the firing angle.",
        "With a highly inductive load and continuous current: Vdc = (2Vm / π) cos α. When α exceeds 90° the average voltage is negative, so the converter works as an inverter.",
        "Three-phase full converter: Vdc = (3√3 Vm,ph / π) cos α.",
        "Load current Idc = Vdc / R. Real power P = Vdc · Idc, and the displacement power factor is approximately cos α.",
        "Inductive loads extend conduction past the voltage zero crossing."
      ],
      steps: [
        "Select the converter topology and load type.",
        "Set the supply voltage and drag the firing angle slider.",
        "Observe the waveforms and read average and RMS values.",
        "Compare resistive, inductive and back-EMF loads."
      ]
    }),
  e("pwr-inverter", "/simulations/power-electronics/b", "PWM Inverter Simulator",
    "PWM Inverter Simulator Online – Single & Three-Phase SPWM | MAE Academy",
    "Simulate DC-AC PWM inverters online. Explore H-bridge switching, sinusoidal PWM, modulation index and harmonic content with live waveforms.",
    {
      overview: "The inverter studio simulates DC-to-AC conversion with H-bridge and three-phase bridge topologies. It generates sinusoidal PWM by comparing a reference sine with a triangular carrier and displays switching signals, output voltage and filtered load current. You can vary modulation index and frequency ratio to see their effect on output amplitude and harmonic distortion.",
      theory: [
        "Modulation index ma = Vref,peak / Vcarrier,peak. In the linear region the fundamental output peak is V1 = ma · Vdc (half-bridge: ma · Vdc / 2).",
        "Frequency modulation ratio mf = fcarrier / fref. Harmonics appear around mf and its multiples, so a larger mf moves them away from the fundamental.",
        "A square-wave full-bridge gives V1 = 4Vdc / π and odd harmonics Vn = V1 / n.",
        "Total harmonic distortion THD = √(Σ Vn²) / V1 for n ≥ 2.",
        "Dead time between complementary switches prevents shoot-through."
      ],
      steps: [
        "Choose single-phase or three-phase inverter mode.",
        "Set DC bus voltage, modulation index and switching frequency.",
        "Observe the PWM pattern, output voltage and load current.",
        "Check the harmonic spectrum and THD."
      ]
    }),
  e("pwr-acvc", "/simulations/power-electronics/c", "AC Voltage Controller",
    "AC Voltage Controller (AC Chopper) Simulator – Phase Angle Control | MAE Academy",
    "Simulate single-phase AC voltage controllers online with phase-angle control. See RMS output voltage, power factor and waveforms for R and RL loads.",
    {
      overview: "The AC voltage controller simulator uses back-to-back thyristors or a triac to cut part of every AC half cycle and so regulate load RMS voltage without changing frequency. It plots source, gate pulses, load voltage and current for resistive and inductive loads, and reports RMS values and power factor. This is the principle behind lamp dimmers, heater controllers and soft starters.",
      theory: [
        "With phase control and a resistive load, the output RMS voltage is Vo,rms = Vs,rms · √[(1/π)(π − α + sin 2α / 2)].",
        "Load power is P = Vo,rms² / R. The power factor is PF = Vo,rms / Vs,rms for resistive loads.",
        "For an RL load the extinction angle β satisfies sin(β − φ) = sin(α − φ) · e^(−(β − α) / tan φ), where φ = arctan(ωL / R).",
        "Conduction continues until β, so the firing angle must be larger than φ for control to exist.",
        "Integral-cycle control instead switches whole cycles on and off."
      ],
      steps: [
        "Select the load type (resistive or inductive).",
        "Set supply voltage, frequency and load values.",
        "Adjust the firing angle and watch the chopped waveform.",
        "Read RMS voltage, current and power factor."
      ]
    }),
  e("pwr-chopper", "/simulations/power-electronics/d", "DC-DC Chopper Simulator",
    "DC-DC Converter Simulator – Buck, Boost & Buck-Boost Choppers | MAE Academy",
    "Simulate DC-DC choppers online. Vary duty cycle and frequency for buck, boost and buck-boost converters and see inductor current and output ripple live.",
    {
      overview: "The chopper studio simulates switch-mode DC-DC converters. Choose buck, boost or buck-boost, set the input voltage, duty cycle and switching frequency, and the tool plots switch state, inductor current and output voltage. It reports ripple, average current and whether the converter is in continuous conduction. These circuits sit inside nearly every power supply, battery charger and motor drive.",
      theory: [
        "Buck converter in continuous conduction: Vo = D · Vin. Boost converter: Vo = Vin / (1 − D). Buck-boost: Vo = −D · Vin / (1 − D).",
        "Inductor ripple current for a buck: ΔIL = (Vin − Vo) · D · T / L, where T = 1/fs.",
        "Output voltage ripple: ΔVo = ΔIL / (8 · fs · C).",
        "Boundary of continuous conduction occurs when the average inductor current equals half the ripple, ILB = ΔIL / 2; below it the converter enters discontinuous mode.",
        "Ideal efficiency is 100%, so Vin · Iin = Vo · Io."
      ],
      steps: [
        "Select converter type and enter Vin, L, C and load resistance.",
        "Set duty cycle and switching frequency with the sliders.",
        "Observe inductor current and output voltage waveforms.",
        "Check conduction mode and ripple values against the formulas."
      ]
    }),

  // ───────────────────────── Circuit Lab ─────────────────────────
  e("circuit-lab", "/simulations/circuit-lab", "Circuit Simulator",
    "Online Circuit Simulator – Build & Analyse Electronic Circuits | MAE Academy",
    "Free online circuit simulator. Build analog and digital circuits, run DC and transient analysis, and probe voltages with a virtual oscilloscope and multimeter.",
    {
      overview: "Circuit Lab is an interactive schematic canvas with a SPICE-style solver. Place resistors, capacitors, inductors, sources, diodes, transistors and logic parts, wire them together and run DC operating point or transient analysis. Probes, a multimeter and an oscilloscope let you inspect node voltages and branch currents. It is aimed at students learning circuit analysis and anyone who wants to test an idea before building it.",
      theory: [
        "Kirchhoff's current law: the sum of currents at a node is zero. Kirchhoff's voltage law: the sum of voltages around a loop is zero.",
        "Ohm's law V = I·R, and power P = V·I = I²R = V²/R.",
        "Solvers use nodal analysis, assembling G·v = i where G is the conductance matrix and v the node voltages.",
        "An RC circuit has time constant τ = RC and the capacitor charges as v(t) = V(1 − e^(−t/τ)). An RL circuit has τ = L/R.",
        "Resonance in a series RLC circuit occurs at f0 = 1 / (2π√(LC))."
      ],
      steps: [
        "Drag components from the palette onto the canvas.",
        "Connect terminals with wires and set component values.",
        "Run the simulation and attach probes or the oscilloscope.",
        "Edit values and observe how voltages and currents respond."
      ]
    }),
];

const USES: Record<string, string> = {
  "plc-ladder": "Typical uses include practising motor start-stop circuits, conveyor sequencing, tank level control and traffic light timing before touching real hardware. Lecturers can share a program and ask students to predict each output before pressing Run.",
  "plc-logo": "Common projects are staircase lighting, automatic door timers, pump alternation and star-delta motor starters. Because the bench is virtual, you can test faults such as a stuck switch without risking equipment.",
  "arduino": "Students use it for blink and fade exercises, button debouncing, sensor thresholds and simple state machines. Debug first in the simulator, then upload the same sketch to a real UNO with confidence.",
  "code-python": "Use it to understand recursion, sorting algorithms, list and dictionary behaviour, and to prepare for programming exams. Teachers can step through a bug with a class instead of describing it verbally.",
  "code-cpp": "It suits data structures labs such as linked lists, stacks, queues and binary search, and helps you see why an out-of-range index or dangling pointer fails. Compare your trace with textbook diagrams.",
  "code-c": "Typical exercises include string reversal, array sorting, pointer swaps and struct handling. Seeing memory change line by line makes undefined behaviour and off-by-one errors far easier to spot.",
  "code-masm8086": "Use it for microprocessor labs: arithmetic routines, string copies, loops, subroutines with CALL and RET, and stack frames. Predict each register value, then step to check your reasoning.",
  "dl-schematic": "Build half adders, multiplexers, decoders, latches and counters, then compare behaviour with your textbook truth tables. The canvas is also useful for checking lab designs before wiring a breadboard.",
  "dl-analyzer": "Use it to check homework answers, prove identities such as De Morgan's laws, or list minterms before moving to the K-map. Equivalent expressions always produce identical output columns.",
  "dl-kmap": "Practise exam-style problems, check hand-drawn groupings and learn how don't-care conditions shrink a design. The minimal expression can be sent straight to the schematic workspace for implementation.",
  "dl-synthesis": "This is useful when a lab provides only 7400 NAND chips or when you must reduce package count. Compare the NAND-only gate count with the plain AND-OR version to see the savings.",
  "dl-timing": "Use it to explain counters, shift registers and edge-triggered behaviour, or to diagnose why a design fails at a given clock speed. Always compare measured delays with your setup and hold constraints.",
  "dl-fsm": "Typical designs are traffic light controllers, vending machines, elevator controllers and serial sequence detectors. Verify every state has a transition for each input to avoid unspecified behaviour.",
  "sig-ops": "Use it to check homework on transformations such as x(2t - 3) and to practise decomposing signals into even and odd parts. Predict the plot first, then confirm it here.",
  "sig-class": "Run the classic test cases: y = x², y = t·x(t), y = x(−t) and accumulators. Comparing verdicts for different systems quickly shows which property each operation breaks.",
  "sig-conv": "Try a pulse with an exponential, two pulses, or an impulse train with a filter response. Verifying with the graph helps you set correct integration limits in exam solutions.",
  "sig-fourier": "Typical explorations include why a square wave needs many harmonics, how filtering removes high frequencies, and how sampling creates aliasing. It supports courses in communications and DSP.",
  "sig-laplace": "Use it to link pole locations with time responses: decaying, oscillating or growing. Moving a pole across the imaginary axis shows the exact moment a system becomes unstable.",
  "ctl-root-locus": "Use it for lead and lag compensator design, gain selection from a damping target, and checking sketches drawn by hand. Compare the locus before and after adding a pole or zero.",
  "ctl-frequency": "Typical tasks include designing for 45° to 60° phase margin, comparing time delay effects, and checking Nyquist stability for plants with right-half-plane poles. Margins update as you vary gain.",
  "ctl-pid": "Use it to compare P, PI and PID controllers, test Ziegler–Nichols settings, and see integral windup. It also demonstrates why derivative action amplifies measurement noise.",
  "ctl-state-space": "Try an undamped oscillator, a damped spring-mass system or an unstable saddle and compare the portraits. It supports pole placement and observer design coursework.",
  "pwr-rectifier": "Typical exercises compare half-wave and full-wave circuits, resistive versus inductive loads, and the effect of a freewheeling diode. Verify textbook averages by changing alpha in small steps.",
  "pwr-inverter": "Use it to prepare for motor drive and UPS courses by exploring how switching frequency, modulation index and filters shape the output. Compare square-wave and SPWM harmonics side by side.",
  "pwr-acvc": "Typical applications are lamp dimming, heater power control and induction motor soft starting. Compare how load inductance limits the usable firing angle range.",
  "pwr-chopper": "Use it to size inductors and capacitors for a target ripple, to see why boost converters have a right-half-plane zero, and to understand the transition into discontinuous mode.",
  "circuit-lab": "Typical exercises include voltage dividers, RC filters, diode clippers, transistor switches and op-amp amplifiers. Predict node voltages by hand first, then confirm with the simulator.",
};
for (const entry of SIMULATOR_SEO) entry.docs.uses = USES[entry.key];

export const SEO_BY_KEY: Record<string, SimulatorSeoEntry> = Object.fromEntries(SIMULATOR_SEO.map((entry) => [entry.key, entry]));

/** Maps routed (slug, tool) pairs to registry keys for route-driven suites. */
export function seoKeyForRoute(slug: string, tool: string | undefined): string | null {
  const t = tool ?? "";
  const table: Record<string, Record<string, string>> = {
    "control-systems": { "root-locus": "ctl-root-locus", "frequency-response": "ctl-frequency", pid: "ctl-pid", "state-space": "ctl-state-space" },
    "power-electronics": { a: "pwr-rectifier", b: "pwr-inverter", c: "pwr-acvc", d: "pwr-chopper" },
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

export function wordCount(docs: SimulatorDocs): number {
  return [docs.overview, ...docs.theory, ...docs.steps, docs.uses ?? ""].join(" ").split(/\s+/).filter(Boolean).length;
}
