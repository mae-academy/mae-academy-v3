/**
 * Every simulator is routed through this page.  SimulatorLayout owns the
 * universal heading and segmented navigation; individual studios own only
 * their tool-specific workspace and state.
 *
 * Performance architecture (post-audit):
 * - Studios are grouped by simulator domain and lazy-loaded as separate chunks.
 * - Each domain chunk is fetched only on first visit to that simulator slug.
 * - Within a domain, ALL tools share the same chunk → tab switching is instant
 *   (no per-tab network requests, no cascading loaders).
 * - An inner <Suspense> shows a compact skeleton so the navigation header
 *   stays fully visible while the domain chunk resolves (avoids blank screen).
 * - The outer route-level <Suspense> in App.tsx is still the safety net for
 *   SimulationDetail itself (this page's shell); it is rarely hit after the
 *   first visit because the shell chunk is tiny (~30 kB).
 */
import { lazy, Suspense } from "react";
import { motion, type Variants } from "framer-motion";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import SimulatorLayout from "@/components/SimulatorLayout";
import SimulationToolWorkspace from "@/components/SimulationToolWorkspace";
import { useLocale } from "@/contexts/LocaleContext";
import {
  controlSystemToolMeta,
  powerElectronicsToolMeta,
  signalsAndSystemsToolMeta,
  simulationRouteMeta,
} from "@/data/platform";
import NotFound from "./NotFound";

// ── Domain-grouped lazy chunks ──────────────────────────────────────────────
// Each lazy() points to a barrel file that bundles ALL tools for that domain.
// Vite/Rollup co-locates them into a single JS chunk per domain.
const ControlStudiosRenderer = lazy(() => import("@/chunks/controlStudios"));
const PowerStudiosRenderer = lazy(() => import("@/chunks/powerStudios"));
const SignalsStudiosRenderer = lazy(() => import("@/chunks/signalsStudios"));
const CircuitStudiosRenderer = lazy(() => import("@/chunks/circuitStudios"));
const DigitalLogicRenderer = lazy(() => import("@/chunks/digitalLogicStudios"));
const CodeStudiosRenderer = lazy(() => import("@/chunks/codeStudios"));

// ── Lightweight skeleton for inner Suspense ──────────────────────────────────
// Shown while a domain chunk loads for the first time.
// Does NOT say "Loading Module..." — that phrase is reserved for the route-level loader.
// The header and tab bar remain fully visible above this skeleton.
function StudioSkeleton() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <div
        className="h-[2px] w-40 rounded-full"
        style={{
          background: "linear-gradient(90deg, #2563EB 0%, #7C3AED 50%, #E11D48 100%)",
          animation: "pulse 1.6s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      <Loader2
        className="h-6 w-6 animate-spin text-violet-500 opacity-70"
        aria-label="Loading studio..."
      />
    </div>
  );
}

const container: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };
const item: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 165, damping: 21 } } };

const circuitTabCopy = {
  en: { canvas: "Interactive Canvas" },
  ar: { canvas: "كانفس تفاعلي" },
  es: { canvas: "Lienzo interactivo" },
} as const;

export default function SimulationDetail() {
  const [location, setLocation] = useLocation();
  const lastNestedRoute = useRef(location);
  const isDirectCode = location === "/code" || location.startsWith("/code/");
  const isDirectAssembler = location === "/assembler" || location.startsWith("/assembler/");
  if (location.startsWith("/simulations/") || isDirectCode || isDirectAssembler) lastNestedRoute.current = location;
  const activeRoute = lastNestedRoute.current;
  const segments = activeRoute.split("/").filter(Boolean);
  const rawSlug = segments[0] === "simulations" ? segments[1] : segments[0];
  const tool = segments[0] === "simulations" ? segments[2] : segments[1];
  const slug = rawSlug === "circuits" ? "circuit-lab" : (rawSlug === "assembly" || rawSlug === "assembler") ? "code" : rawSlug;
  const meta = simulationRouteMeta.find((entry) => entry.slug === slug);
  const { copy, isRtl, locale } = useLocale();
  if (!meta) return <NotFound />;

  const simulation = copy.collections.simulations.cards[meta.index];
  const isControlSystems = meta.slug === "control-systems";
  const isPowerElectronics = meta.slug === "power-electronics";
  const isSignalsAndSystems = meta.slug === "signals-and-systems";
  const isCircuitLab = meta.slug === "circuit-lab";
  const isDigitalLogicDesign = meta.slug === "digital-logic-design";
  const isCodeStudio = meta.slug === "code";
  const circuitLabClone = meta.slug === "circuitlab-1" || meta.slug === "circuitlab-2" || meta.slug === "circuitlab-3";
  const circuitTabs = circuitTabCopy[locale];
  const tools = isControlSystems ? controlSystemToolMeta[locale]
    : isPowerElectronics ? powerElectronicsToolMeta[locale]
      : isSignalsAndSystems ? signalsAndSystemsToolMeta[locale]
          : isCircuitLab ? [{ slug: "workspace", label: circuitTabs.canvas }]
            : isDigitalLogicDesign ? [{ slug: "workspace", label: simulation.title }]
              : isCodeStudio ? [{ slug: "", label: simulation.title }]
                : circuitLabClone ? [{ slug: "a", label: simulation.title }]
                  : ["A", "B", "C", "D", "E"].map((label) => ({ slug: label.toLowerCase(), label }));
  const defaultTool = tools[0].slug;

  useEffect(() => {
    if (isCodeStudio) return; // Dynamic multi-language SEO title & meta is managed by CodeStudio
    const timer = window.setTimeout(() => { document.title = `MAE Academy — ${simulation.title}`; }, 0);
    return () => window.clearTimeout(timer);
  }, [isCodeStudio, simulation.title]);

  useEffect(() => {
    if (isCodeStudio) {
      // Clean redirection for all legacy paths (/code, /code/:lang, /assembler, /simulations/assembler) -> /simulations/code/:lang
      const isLegacy = location.startsWith("/code") || location.startsWith("/assembler") || location.startsWith("/simulations/assembler");
      if (isLegacy) {
        const langSubroute = tool && ["masm8086", "python", "cpp", "c"].includes(tool.toLowerCase()) ? `/${tool.toLowerCase()}` : "";
        setLocation(`/simulations/code${langSubroute}`, { replace: true });
      }
      return;
    }
    if (isSignalsAndSystems && ["a", "b", "c", "d", "e"].includes(tool)) {
      const toolMap: Record<string, string> = {
        a: "signal-operations-and-properties",
        b: "system-classification",
        c: "convolution-engine",
        d: "fourier-analysis",
        e: "laplace-s-plane",
      };
      setLocation(`/simulations/signals-and-systems/${toolMap[tool]}`, { replace: true });
      return;
    }
    if (!tool) setLocation(`/simulations/${meta.slug}/${defaultTool}`, { replace: true });
  }, [defaultTool, isCodeStudio, isSignalsAndSystems, location, meta.slug, setLocation, tool]);

  if (!tool && !isCodeStudio) return null;

  // ── Domain resolver → lazy chunk ───────────────────────────────────────────
  // Each branch renders the matching lazy chunk inside a local <Suspense>.
  // The StudioSkeleton keeps the header + tab bar visible while loading.
  const toolContent = (() => {
    if (isControlSystems) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <ControlStudiosRenderer tool={tool} />
        </Suspense>
      );
    }
    if (isPowerElectronics) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <PowerStudiosRenderer tool={tool} />
        </Suspense>
      );
    }
    if (isSignalsAndSystems) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <SignalsStudiosRenderer tool={tool} />
        </Suspense>
      );
    }
    if (isCircuitLab || circuitLabClone) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <CircuitStudiosRenderer
            isCircuitLab={isCircuitLab}
            isCircuitLabClone={circuitLabClone}
            instanceId={meta.slug}
            label={simulation.title}
          />
        </Suspense>
      );
    }
    if (isDigitalLogicDesign) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <DigitalLogicRenderer />
        </Suspense>
      );
    }
    if (isCodeStudio) {
      return (
        <Suspense fallback={<StudioSkeleton />}>
          <CodeStudiosRenderer />
        </Suspense>
      );
    }
    // Fallback for unknown simulator slugs
    return <SimulationToolWorkspace toolKey={`${meta.slug}-${tool}`} />;
  })();

  return <motion.div variants={container} initial="hidden" animate="visible">
    <SimulatorLayout title={isDigitalLogicDesign ? "" : simulation.title} tabs={tools} activeTab={tool || ""} routePrefix={isDirectCode ? "/code" : `/simulations/${meta.slug}`} backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation={isDigitalLogicDesign || isCircuitLab || isCodeStudio}>
      <motion.div variants={item} className="mt-0" dir="ltr">
        <div className="ltr text-left mae-simulator-shell" style={{ direction: 'ltr', textAlign: 'left' }}>
          {toolContent}
        </div>
      </motion.div>
    </SimulatorLayout>
  </motion.div>;
}
