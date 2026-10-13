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
  { href: "/", index: "00" }, { href: "/research", index: "01" }, { href: "/library", index: "02" }, { href: "/simulations", index: "03" }, { href: "/about", index: "04" }, { href: "/contact", index: "05" },
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
  { href: "/library", index: "02", type: "courses", visualVariant: 4, accent: "from-indigo-600 via-violet-600 to-purple-600" },
  { href: "/simulations", index: "03", type: "simulations", visualVariant: 5, accent: "from-indigo-600 via-cyan-500 to-violet-600" },
];

export type SimulationCategory = 'systems-control' | 'circuits-power' | 'embedded-software';

export interface SimulationItem {
  id: string;
  title: string;
  category: 'systems-control' | 'circuits-power' | 'embedded-software';
  description: string;
  isFeatured?: boolean; // For "Hot / Special"
  createdAt: string;     // ISO date for "Newest"
  href: string;
  badge?: 'HOT' | 'NEW' | 'BETA';
  slug?: string;
  index?: number;
  visualVariant?: number;
}

export interface SimulationItemMeta {
  id: string;
  slug: string;
  index: number;
  category: SimulationCategory;
  isFeatured?: boolean;
  createdAt: string;
  href?: string;
  badge?: 'HOT' | 'NEW' | 'BETA';
  visualVariant?: number;
}

export const simulationsCatalog: SimulationItemMeta[] = [
  {
    id: "control-systems",
    slug: "control-systems",
    index: 0,
    category: "systems-control",
    isFeatured: true,
    badge: "HOT",
    createdAt: "2026-01-15T00:00:00Z",
  },
  {
    id: "circuit-lab",
    slug: "circuit-lab",
    index: 1,
    category: "circuits-power",
    isFeatured: true,
    badge: "HOT",
    createdAt: "2026-01-20T00:00:00Z",
  },
  {
    id: "power-electronics",
    slug: "power-electronics",
    index: 2,
    category: "circuits-power",
    isFeatured: false,
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "code",
    slug: "code",
    index: 3,
    category: "embedded-software",
    isFeatured: true,
    badge: "HOT",
    createdAt: "2026-02-10T00:00:00Z",
  },
  {
    id: "plc",
    slug: "plc",
    index: 4,
    category: "systems-control",
    isFeatured: false,
    createdAt: "2026-02-15T00:00:00Z",
  },
  {
    id: "signals-and-systems",
    slug: "signals-and-systems",
    index: 5,
    category: "circuits-power",
    isFeatured: false,
    createdAt: "2026-02-20T00:00:00Z",
  },
  {
    id: "digital-logic-design",
    slug: "digital-logic-design",
    index: 6,
    category: "circuits-power",
    isFeatured: false,
    createdAt: "2026-02-25T00:00:00Z",
  },
  {
    id: "arduino-studio",
    slug: "arduino-studio",
    index: 8,
    category: "embedded-software",
    visualVariant: 3,
    href: "/simulators/arduino-studio",
    isFeatured: true,
    badge: "HOT",
    createdAt: "2026-03-15T00:00:00Z",
  },
  {
    id: "pneumatics-and-hydraulics",
    slug: "pneumatics-and-hydraulics",
    index: 9,
    category: "systems-control",
    visualVariant: 4,
    href: "/simulations/pneumatics-and-hydraulics",
    isFeatured: false,
    badge: "NEW",
    createdAt: "2026-10-03T00:00:00Z",
  },
];

export const simulationRouteMeta = simulationsCatalog;

export const controlSystemToolMeta: Record<Locale, Array<{ slug: string; label: string }>> = {
  en: [
    { slug: "root-locus", label: "Root Locus" },
    { slug: "pid", label: "PID" },
    { slug: "frequency-response", label: "Frequency Response" },
    { slug: "state-space", label: "State Space" },
  ],
  ar: [
    { slug: "root-locus", label: "مسار الجذور" },
    { slug: "pid", label: "PID" },
    { slug: "frequency-response", label: "استجابة التردد" },
    { slug: "state-space", label: "فضاء الحالة" },
  ],
  es: [
    { slug: "root-locus", label: "Lugar de las raíces" },
    { slug: "pid", label: "PID" },
    { slug: "frequency-response", label: "Respuesta en frecuencia" },
    { slug: "state-space", label: "Espacio de estados" },
  ],
};

export const powerElectronicsToolMeta: Record<Locale, Array<{ slug: string; label: string }>> = {
  en: [
    { slug: "rectifier", label: "Rectifiers" },
    { slug: "inverter", label: "Inverters" },
    { slug: "acvc", label: "AC Voltage Controller" },
    { slug: "chopper", label: "Choppers" },
  ],
  ar: [
    { slug: "rectifier", label: "المقوّمات" },
    { slug: "inverter", label: "العواكس" },
    { slug: "acvc", label: "متحكم جهد التيار المتردد" },
    { slug: "chopper", label: "المقطّعات" },
  ],
  es: [
    { slug: "rectifier", label: "Rectificadores" },
    { slug: "inverter", label: "Inversores" },
    { slug: "acvc", label: "Controlador de Voltaje AC" },
    { slug: "chopper", label: "Troceadores" },
  ],
};

export const signalsAndSystemsToolMeta: Record<Locale, Array<{ slug: string; label: string }>> = {
  en: [
    { slug: "signal-operations-and-properties", label: "Signal Operations & Properties" },
    { slug: "system-classification", label: "System Classification" },
    { slug: "convolution-engine", label: "Convolution Engine" },
    { slug: "fourier-analysis", label: "3D Fourier Analysis" },
    { slug: "laplace-s-plane", label: "3D Laplace & S-Plane" },
  ],
  ar: [
    { slug: "signal-operations-and-properties", label: "عمليات الإشارة وخصائصها" },
    { slug: "system-classification", label: "تصنيف الأنظمة" },
    { slug: "convolution-engine", label: "محرك الالتفاف" },
    { slug: "fourier-analysis", label: "تحليل فورييه ثلاثي الأبعاد" },
    { slug: "laplace-s-plane", label: "لابلاس ومستوى S ثلاثي الأبعاد" },
  ],
  es: [
    { slug: "signal-operations-and-properties", label: "Operaciones y Propiedades de la Señal" },
    { slug: "system-classification", label: "Clasificación de Sistemas" },
    { slug: "convolution-engine", label: "Motor de Convolución" },
    { slug: "fourier-analysis", label: "Análisis de Fourier 3D" },
    { slug: "laplace-s-plane", label: "Laplace y Plano S 3D" },
  ],
};

/** A nav item is active on its own page and on every nested page (e.g. /research/W123); "/" only matches exactly. */
export const isRouteActive = (location: string, href: string): boolean =>
  href === "/" ? location === "/" : location === href || location.startsWith(`${href}/`);
