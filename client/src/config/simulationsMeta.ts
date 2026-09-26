/**
 * MAE Academy - Engineering Simulation SEO & OpenGraph Configuration
 * 
 * Optimized metadata for Google search rankings and social share cards across
 * interactive engineering simulators.
 * 
 * Guidelines applied:
 * 1. Title: [Core Tool Name] - Online Interactive Simulator | MAE Academy (< 60 chars)
 * 2. Description: Action-oriented, 140-160 characters with real-time & visual highlights.
 * 3. Keywords: High-intent technical search queries for students & engineers.
 */

export interface OpenGraphImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface SimulationMetaItem {
  id: string;
  slug: string;
  canonicalPath: string;
  title: string;
  shortTitle: string;
  description: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    locale: string;
    type: "website";
    images: OpenGraphImage[];
  };
  twitter: {
    card: "summary_large_image";
    title: string;
    description: string;
    images: string[];
  };
}

const BASE_URL = "https://mae.academy";

export const simulationsMeta: Record<string, SimulationMetaItem> = {
  // 1. Electrical Circuits
  "circuit-lab": {
    id: "circuit-lab",
    slug: "circuit-lab",
    canonicalPath: "/simulations/circuit-lab",
    // 56 characters (< 60 chars)
    title: "Circuit Lab - Online Interactive Simulator | MAE Academy",
    shortTitle: "Electrical Circuit Simulator",
    // 152 characters (140-160 chars)
    description:
      "Simulate analog and digital circuits online in real time. Analyze AC/DC nodes, test Kirchhoff laws, and probe voltages with an interactive oscilloscope.",
    keywords: [
      "online electrical circuit simulator",
      "circuit simulator online",
      "SPICE circuit simulation",
      "interactive circuit builder",
      "schematic capture online",
      "DC AC circuit analysis",
      "Ohm's law simulation",
      "Kirchhoff voltage current law",
      "virtual oscilloscope probing",
      "electronic circuit simulation",
    ],
    openGraph: {
      title: "Circuit Lab - Online Interactive Simulator | MAE Academy",
      description:
        "Simulate analog and digital circuits online in real time. Analyze AC/DC nodes, test Kirchhoff laws, and probe voltages with an interactive oscilloscope.",
      url: `${BASE_URL}/simulations/circuit-lab`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/circuit-lab.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy Electrical Circuit Simulator Canvas and Oscilloscope",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Circuit Lab - Online Interactive Simulator | MAE Academy",
      description:
        "Simulate analog and digital circuits online in real time. Analyze AC/DC nodes, test Kirchhoff laws, and probe voltages with an interactive oscilloscope.",
      images: [`${BASE_URL}/og/circuit-lab.png`],
    },
  },

  // 2. Power Electronics
  "power-electronics": {
    id: "power-electronics",
    slug: "power-electronics",
    canonicalPath: "/simulations/power-electronics",
    // 55 characters (< 60 chars)
    title: "Power Electronics - Interactive Simulator | MAE Academy",
    shortTitle: "Power Electronics Simulator",
    // 156 characters (140-160 chars)
    description:
      "Simulate power converter circuits online in real time. Design buck-boost topologies, inverters, and rectifiers with PWM switching and live waveform visuals.",
    keywords: [
      "power electronics simulator online",
      "buck boost converter simulation",
      "interactive inverter simulator",
      "rectifier circuit simulation",
      "PWM switching waveforms",
      "DC-DC converter online",
      "H-bridge inverter simulator",
      "power converter topologies",
      "SMPS simulation online",
      "switch mode power supply simulator",
    ],
    openGraph: {
      title: "Power Electronics - Interactive Simulator | MAE Academy",
      description:
        "Simulate power converter circuits online in real time. Design buck-boost topologies, inverters, and rectifiers with PWM switching and live waveform visuals.",
      url: `${BASE_URL}/simulations/power-electronics`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/power-electronics.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy Power Electronics Converter Topologies & PWM Waveforms",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Power Electronics - Interactive Simulator | MAE Academy",
      description:
        "Simulate power converter circuits online in real time. Design buck-boost topologies, inverters, and rectifiers with PWM switching and live waveform visuals.",
      images: [`${BASE_URL}/og/power-electronics.png`],
    },
  },

  // 3. PLC Simulator
  "plc": {
    id: "plc",
    slug: "plc",
    canonicalPath: "/simulations/plc",
    // 55 characters (< 60 chars)
    title: "PLC Ladder - Online Interactive Simulator | MAE Academy",
    shortTitle: "PLC Ladder Simulator",
    // 154 characters (140-160 chars)
    description:
      "Build and execute PLC ladder logic online in real time. Emulate Siemens S7-200 contacts, coils, and timers with instant visuals for industrial automation.",
    keywords: [
      "PLC ladder simulator online",
      "ladder logic simulator",
      "Siemens S7-200 simulator online",
      "industrial automation simulator",
      "virtual PLC ladder programming",
      "ladder diagram emulator",
      "PLC contact coil simulation",
      "online PLC trainer",
      "ladder logic execution engine",
    ],
    openGraph: {
      title: "PLC Ladder - Online Interactive Simulator | MAE Academy",
      description:
        "Build and execute PLC ladder logic online in real time. Emulate Siemens S7-200 contacts, coils, and timers with instant visuals for industrial automation.",
      url: `${BASE_URL}/simulations/plc`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/plc-simulator.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy PLC Ladder Logic Simulator with Siemens S7-200 Rungs",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "PLC Ladder - Online Interactive Simulator | MAE Academy",
      description:
        "Build and execute PLC ladder logic online in real time. Emulate Siemens S7-200 contacts, coils, and timers with instant visuals for industrial automation.",
      images: [`${BASE_URL}/og/plc-simulator.png`],
    },
  },

  // 4. Control Systems
  "control-systems": {
    id: "control-systems",
    slug: "control-systems",
    canonicalPath: "/simulations/control-systems",
    // 53 characters (< 60 chars)
    title: "Control Systems - Interactive Simulator | MAE Academy",
    shortTitle: "Control Systems Simulator",
    // 154 characters (140-160 chars)
    description:
      "Analyze control system stability with interactive root locus and Bode plots. Tune PID parameters in real time and observe step response visuals instantly.",
    keywords: [
      "interactive control systems root locus",
      "root locus simulator online",
      "Bode plot generator interactive",
      "PID controller tuning simulator",
      "step response visualizer",
      "transfer function stability analyzer",
      "Nyquist plot online",
      "control engineering simulator",
      "state space representation online",
    ],
    openGraph: {
      title: "Control Systems - Interactive Simulator | MAE Academy",
      description:
        "Analyze control system stability with interactive root locus and Bode plots. Tune PID parameters in real time and observe step response visuals instantly.",
      url: `${BASE_URL}/simulations/control-systems`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/control-systems.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy Interactive Root Locus, Bode Plot and PID Tuning Workspace",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Control Systems - Interactive Simulator | MAE Academy",
      description:
        "Analyze control system stability with interactive root locus and Bode plots. Tune PID parameters in real time and observe step response visuals instantly.",
      images: [`${BASE_URL}/og/control-systems.png`],
    },
  },

  // 5. Signals and Systems
  "signals-and-systems": {
    id: "signals-and-systems",
    slug: "signals-and-systems",
    canonicalPath: "/simulations/signals-and-systems",
    // 56 characters (< 60 chars)
    title: "Signals and Systems Simulator - 3D Visualizer | MAE Academy",
    shortTitle: "Signals & Systems Simulator",
    // 158 characters (140-160 chars)
    description:
      "Master signals operations, system classification, continuous and discrete convolution, 3D Fourier analysis, and 3D Laplace S-plane & Z-transform online.",
    keywords: [
      // Primary Tool Keywords
      "signals operation and properties simulator",
      "system classification visualizer",
      "continuous discrete convolution engine",
      "3D Fourier analysis simulator",
      "3D Laplace S-plane Z-transform visualizer",
      // Core Signals & Systems Operations
      "signal transformation time scaling shifting reversal",
      "continuous time signal operations online",
      "discrete time signal stem plot generator",
      "signal energy and power signal classifier",
      "periodicity calculator fundamental period GCD LCM",
      // System Properties & Classification
      "linear time invariant LTI system classifier",
      "causal non causal system proof checker",
      "BIBO stability analysis impulse response",
      "memoryless system vs system with memory",
      "time invariant vs time variant verification",
      // Convolution Keywords
      "continuous time convolution integral visualizer",
      "discrete time convolution sum calculation",
      "piecewise signal convolution step by step",
      "impulse response convolution filter simulator",
      // Frequency & Transform Domain Keywords
      "3D Fourier transform waterfall visualizer",
      "continuous time Fourier series CTFS calculator",
      "discrete time Fourier transform DTFT analysis",
      "frequency response magnitude and phase spectrum",
      "pole zero plot 3D complex surface mesh",
      "region of convergence ROC Laplace Z transform",
      "transfer function H(s) H(z) interactive analyzer",
      "digital signal processing DSP online simulator",
    ],
    openGraph: {
      title: "Signals & Systems Interactive Simulator | MAE Academy",
      description:
        "Interactive web app for signal operations, system classification, piecewise convolution, 3D Fourier waterfalls, and 3D S-plane/Z-transform surfaces.",
      url: `${BASE_URL}/simulations/signals-and-systems`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/signals-and-systems.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy Signals and Systems Interactive 3D Simulator and Visualizer",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Signals & Systems Interactive Simulator | MAE Academy",
      description:
        "Interactive web app for signal operations, system classification, piecewise convolution, 3D Fourier waterfalls, and 3D S-plane/Z-transform surfaces.",
      images: [`${BASE_URL}/og/signals-and-systems.png`],
    },
  },

  // 6. Digital Logic
  "digital-logic": {
    id: "digital-logic",
    slug: "digital-logic-design",
    canonicalPath: "/simulations/digital-logic-design",
    // 58 characters (< 60 chars)
    title: "Digital Logic - Online Interactive Simulator | MAE Academy",
    shortTitle: "Digital Logic Simulator",
    // 153 characters (140-160 chars)
    description:
      "Design and simulate digital logic circuits online in real time. Build combinational gates, simplify Boolean algebra, and visualize dynamic Karnaugh maps.",
    keywords: [
      "digital logic simulator online",
      "logic gates simulator",
      "Karnaugh map solver visualizer",
      "Boolean algebra simplifier online",
      "combinational logic circuit builder",
      "flip flop sequential circuit simulator",
      "truth table generator online",
      "digital electronics simulation",
      "logic circuit design tool",
    ],
    openGraph: {
      title: "Digital Logic - Online Interactive Simulator | MAE Academy",
      description:
        "Design and simulate digital logic circuits online in real time. Build combinational gates, simplify Boolean algebra, and visualize dynamic Karnaugh maps.",
      url: `${BASE_URL}/simulations/digital-logic-design`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/digital-logic.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy Digital Logic Gates Simulator and Karnaugh Map Solver",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Digital Logic - Online Interactive Simulator | MAE Academy",
      description:
        "Design and simulate digital logic circuits online in real time. Build combinational gates, simplify Boolean algebra, and visualize dynamic Karnaugh maps.",
      images: [`${BASE_URL}/og/digital-logic.png`],
    },
  },

  // 7. Linear Algebra
  "linear-algebra": {
    id: "linear-algebra",
    slug: "linear-algebra",
    canonicalPath: "/simulations/linear-algebra",
    // 59 characters (< 60 chars)
    title: "Linear Algebra - Online Interactive Simulator | MAE Academy",
    shortTitle: "Linear Algebra Simulator",
    // 157 characters (140-160 chars)
    description:
      "Visualize linear algebra transformations in real-time 2D and 3D. Compute eigenvalues, eigenvectors, and matrix operations with interactive geometric visuals.",
    keywords: [
      "linear algebra visualizer online",
      "matrix transformation visualizer 3D",
      "eigenvalue eigenvector visualizer",
      "geometric linear algebra simulator",
      "matrix multiplication visualizer",
      "vector space transformation",
      "determinant geometry visualizer",
      "interactive linear systems",
      "basis transformation visualizer",
    ],
    openGraph: {
      title: "Linear Algebra - Online Interactive Simulator | MAE Academy",
      description:
        "Visualize linear algebra transformations in real-time 2D and 3D. Compute eigenvalues, eigenvectors, and matrix operations with interactive geometric visuals.",
      url: `${BASE_URL}/simulations/linear-algebra`,
      siteName: "MAE Academy",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: `${BASE_URL}/og/linear-algebra.png`,
          width: 1200,
          height: 630,
          alt: "MAE Academy 2D/3D Linear Algebra Matrix Transformation and Eigenvalue Visualizer",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Linear Algebra - Online Interactive Simulator | MAE Academy",
      description:
        "Visualize linear algebra transformations in real-time 2D and 3D. Compute eigenvalues, eigenvectors, and matrix operations with interactive geometric visuals.",
      images: [`${BASE_URL}/og/linear-algebra.png`],
    },
  },
};

/**
 * Route aliases mapping legacy or alternative slug forms to canonical config entries
 */
const ROUTE_ALIASES: Record<string, string> = {
  "circuits": "circuit-lab",
  "/simulations/circuits": "circuit-lab",
  "/simulations/circuit-lab": "circuit-lab",
  "/simulations/power-electronics": "power-electronics",
  "plc-simulator": "plc",
  "/simulations/plc": "plc",
  "/simulators/plc-simulator": "plc",
  "/simulations/control-systems": "control-systems",
  "/simulations/signals-and-systems": "signals-and-systems",
  "/simulations/signals-and-systems/signal-operations-and-properties": "signals-and-systems",
  "/simulations/signals-and-systems/system-classification": "signals-and-systems",
  "/simulations/signals-and-systems/convolution-engine": "signals-and-systems",
  "/simulations/signals-and-systems/fourier-analysis": "signals-and-systems",
  "/simulations/signals-and-systems/laplace-s-plane": "signals-and-systems",
  "digital-logic-design": "digital-logic",
  "/simulations/digital-logic-design": "digital-logic",
  "/simulations/digital-logic": "digital-logic",
  "/simulations/linear-algebra": "linear-algebra",
};

/**
 * Lookup simulation metadata by slug, alias, or path
 */
export function getSimulationMeta(identifier: string): SimulationMetaItem | undefined {
  const normalized = identifier.trim().toLowerCase();
  const directMatch = simulationsMeta[normalized];
  if (directMatch) return directMatch;

  const aliasedKey = ROUTE_ALIASES[normalized];
  if (aliasedKey && simulationsMeta[aliasedKey]) {
    return simulationsMeta[aliasedKey];
  }

  // Check by matching slug or path
  return Object.values(simulationsMeta).find(
    (item) => item.slug === normalized || item.canonicalPath === normalized
  );
}

/**
 * Helper to convert our config into Next.js App Router Metadata format
 */
export function getNextMetadata(slugOrPath: string) {
  const item = getSimulationMeta(slugOrPath);
  if (!item) return null;

  return {
    title: item.title,
    description: item.description,
    keywords: item.keywords,
    alternates: {
      canonical: item.canonicalPath,
    },
    openGraph: {
      title: item.openGraph.title,
      description: item.openGraph.description,
      url: item.openGraph.url,
      siteName: item.openGraph.siteName,
      locale: item.openGraph.locale,
      type: item.openGraph.type,
      images: item.openGraph.images.map((img) => ({
        url: img.url,
        width: img.width,
        height: img.height,
        alt: img.alt,
      })),
    },
    twitter: {
      card: item.twitter.card,
      title: item.twitter.title,
      description: item.twitter.description,
      images: item.twitter.images,
    },
  };
}

export default simulationsMeta;
