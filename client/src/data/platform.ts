/**
 * MAE Academy content architecture: Luminous Technical Atelier.
 * Central registry for route metadata and home-page gateway sections.
 */
export type Locale = "en" | "ar" | "es";
export type CardType = "research" | "courses" | "simulations";

export type PlatformRoute = {
  href: string;
  index: string;
};

export const platformRoutes: PlatformRoute[] = [
  { href: "/", index: "00" }, { href: "/research", index: "01" }, { href: "/courses", index: "02" }, { href: "/simulations", index: "03" }, { href: "/about", index: "04" },
];

export type HomeGatewayMeta = {
  href: string;
  index: string;
  type: CardType;
  visualVariant: number;
  accent: string;
};

export const homeGatewayMeta: HomeGatewayMeta[] = [
  { href: "/research", index: "01", type: "research", visualVariant: 0, accent: "from-indigo-600 via-purple-600 to-violet-600" },
  { href: "/courses", index: "02", type: "courses", visualVariant: 4, accent: "from-indigo-600 via-violet-600 to-purple-600" },
  { href: "/simulations", index: "03", type: "simulations", visualVariant: 5, accent: "from-indigo-600 via-cyan-500 to-violet-600" },
];

export const simulationRouteMeta = [
  { slug: "control-systems", index: 0 }, { slug: "circuit-lab", index: 1 }, { slug: "power-electronics", index: 2 },
  { slug: "assembler", index: 3 }, { slug: "plc", index: 4 }, { slug: "signals-and-systems", index: 5 },
  { slug: "digital-logic-design", index: 6 }, { slug: "linear-algebra", index: 7 }, { slug: "communication-and-network", index: 8 },
  { slug: "circuitlab-1", index: 9, visualVariant: 1 }, { slug: "circuitlab-2", index: 10, visualVariant: 1 }, { slug: "circuitlab-3", index: 11, visualVariant: 1 },
] as const;

export const controlSystemToolMeta: Record<Locale, Array<{ slug: string; label: string }>> = {
  en: [
    { slug: "root-locus", label: "Root Locus" },
    { slug: "pid", label: "PID" },
    { slug: "block-diagram-signal-flow", label: "Block Diagram & Signal Flow" },
    { slug: "frequency-response", label: "Frequency Response" },
    { slug: "state-space", label: "State Space" },
  ],
  ar: [
    { slug: "root-locus", label: "مسار الجذور" },
    { slug: "pid", label: "PID" },
    { slug: "block-diagram-signal-flow", label: "مخطط الكتل وتدفق الإشارة" },
    { slug: "frequency-response", label: "استجابة التردد" },
    { slug: "state-space", label: "فضاء الحالة" },
  ],
  es: [
    { slug: "root-locus", label: "Lugar de las raíces" },
    { slug: "pid", label: "PID" },
    { slug: "block-diagram-signal-flow", label: "Diagrama de bloques y flujo de señal" },
    { slug: "frequency-response", label: "Respuesta en frecuencia" },
    { slug: "state-space", label: "Espacio de estados" },
  ],
};

export const powerElectronicsToolMeta = [
  { slug: "a", label: "Rectifiers" },
  { slug: "b", label: "Inverters" },
  { slug: "c", label: "AC Voltage Controller" },
  { slug: "d", label: "Choppers" },
] as const;

export const plcToolMeta = [
  { slug: "a", label: "Siemens S7-200" },
  { slug: "b", label: "Scan Cycle" },
  { slug: "c", label: "Instruction Set" },
  { slug: "d", label: "I/O Mapping" },
  { slug: "e", label: "Fault Tracing" },
] as const;

export const signalsAndSystemsToolMeta = [
  { slug: "a", label: "Signal Operations & Properties" },
  { slug: "b", label: "System Classification" },
  { slug: "c", label: "Convolution Engine" },
  { slug: "d", label: "3D Fourier Analysis" },
  { slug: "e", label: "3D Laplace & S-Plane" },
] as const;

export const linearAlgebraToolMeta: Record<Locale, Array<{ slug: string; label: string }>> = {
  en: [
    { slug: "a", label: "Matrix Basics & Determinants" },
    { slug: "b", label: "Systems & RREF" },
    { slug: "c", label: "Null & Column Spaces" },
    { slug: "d", label: "Transformations" },
    { slug: "e", label: "Eigen Analysis" },
  ],
  ar: [
    { slug: "a", label: "أساسيات المصفوفات والمحددات" },
    { slug: "b", label: "الأنظمة وRREF" },
    { slug: "c", label: "الفضاء الصفري وفضاء الأعمدة" },
    { slug: "d", label: "التحويلات" },
    { slug: "e", label: "التحليل الذاتي" },
  ],
  es: [
    { slug: "a", label: "Bases matriciales y determinantes" },
    { slug: "b", label: "Sistemas y RREF" },
    { slug: "c", label: "Espacios nulo y columna" },
    { slug: "d", label: "Transformaciones" },
    { slug: "e", label: "Análisis espectral" },
  ],
};
