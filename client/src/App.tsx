/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Route camera pan uses AnimatePresence while persistent chrome remains in MainLayout.
 *
 * Performance architecture (post-audit):
 * - All page chunks use lazyRetry() for resilient loading with 1-retry fallback.
 * - Core routes are eagerly prefetched during browser idle via prefetchCoreRoutes().
 * - The Suspense boundary wraps only the route content, NOT the exit animation,
 *   so the previous page stays visible while the next chunk resolves.
 * - startTransition is used for route changes to avoid synchronous suspense fallback.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, useEffect, useTransition, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation, Redirect } from "wouter";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { useCanonical } from "@/hooks/useCanonical";
import MainLayout from "./components/MainLayout";
import { lazyRetry } from "@/lib/lazyRetry";
import { prefetchCoreRoutes, prefetchSimulatorHub } from "@/lib/routePrefetch";
import ScrollToTop from "@/components/common/ScrollToTop";
import PageLoader from "@/components/ui/PageLoader";

// ── Resilient lazy-loaded page chunks ───────────────────────────────────────
const Home = lazyRetry(() => import("./pages/Home"));
const Research = lazyRetry(() => import("./pages/Research"));
const ResearchDetail = lazyRetry(() => import("./pages/ResearchDetail"));
const AcademicLibrary = lazyRetry(() => import("./pages/AcademicLibrary"));
const LibraryDetail = lazyRetry(() => import("./pages/LibraryDetail"));
const Simulations = lazyRetry(() => import("./pages/Simulations"));
const SimulationDetail = lazyRetry(() => import("./pages/SimulationDetail"));
const About = lazyRetry(() => import("./pages/About"));
const PrivacyPolicy = lazyRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyRetry(() => import("./pages/TermsOfService"));
const AttributionPolicy = lazyRetry(() => import("./pages/AttributionPolicy"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));
const ArduinoStudioPage = lazyRetry(() => import("./pages/ArduinoStudioPage"));
const PlcSimulatorPage = lazyRetry(() => import("./pages/PlcSimulatorPage"));
const HiddenSymbolDesigner = lazyRetry(() => import("./simulators/circuit-engine/components/pages/HiddenSymbolDesigner"));

function AnimatedRoutes() {
  const [location] = useLocation();
  useCanonical(location);
  const [, startTransition] = useTransition();
  const deferredLocation = useRef(location);

  // Use startTransition so React keeps the old UI visible while the lazy chunk loads,
  // preventing the Suspense fallback from flashing during route transitions.
  useEffect(() => {
    startTransition(() => {
      deferredLocation.current = location;
    });
  }, [location, startTransition]);

  const renderedLocation = deferredLocation.current;

  const pageKey = renderedLocation.startsWith("/simulations/code") || renderedLocation.startsWith("/code") || renderedLocation.startsWith("/assembler")
    ? "/simulations/code"
    : renderedLocation.startsWith("/simulations/")
      ? renderedLocation.split("/").slice(0, 3).join("/")
      : renderedLocation;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial={{ x: "108vw", opacity: 0.35, rotate: 0.7 }}
        animate={{ x: 0, opacity: 1, rotate: 0 }}
        exit={{ x: "-108vw", opacity: 0.18, rotate: -0.7 }}
        transition={{ type: "tween", ease: [0.77, 0, 0.175, 1], duration: 0.52 }}
        className="relative min-h-[calc(100svh-var(--mae-header-height))] overflow-hidden"
      >
        <motion.div
          aria-hidden="true"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          exit={{ scaleY: 0 }}
          transition={{ duration: 0.44, ease: [0.77, 0, 0.175, 1] }}
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-px origin-top bg-gradient-to-b from-transparent via-violet-500 to-rose-500/0"
        />
        <Suspense fallback={<PageLoader />}>
          <Switch location={renderedLocation}>
            <Route path="/" component={Home} />
            <Route path="/research" component={Research} />
            <Route path="/research/:id" component={ResearchDetail} />
            <Route path="/library" component={AcademicLibrary} />
            <Route path="/library/:id" component={LibraryDetail} />
            <Route path="/courses"><Redirect to="/library" /></Route>
            <Route path="/code/:lang" component={SimulationDetail} />
            <Route path="/code" component={SimulationDetail} />
            <Route path="/assembler/:tool" component={SimulationDetail} />
            <Route path="/assembler" component={SimulationDetail} />
            <Route path="/simulations/arduino-studio" component={ArduinoStudioPage} />
            {/* PLC: the card resolves to /simulations/plc; legacy /simulations/plc/<tool> deep links land here too. */}
            <Route path="/simulations/plc/:tool" component={PlcSimulatorPage} />
            <Route path="/simulations/plc" component={PlcSimulatorPage} />
            <Route path="/simulators/plc-simulator" component={PlcSimulatorPage} />
            <Route path="/simulations/:slug/:tool" component={SimulationDetail} />
            <Route path="/simulations/:slug" component={SimulationDetail} />
            <Route path="/simulations" component={Simulations} />
            <Route path="/simulators/arduino-studio" component={ArduinoStudioPage} />
            <Route path="/about" component={About} />
            <Route path="/privacy-policy" component={PrivacyPolicy} />
            <Route path="/terms-of-service" component={TermsOfService} />
            <Route path="/attribution-policy" component={AttributionPolicy} />
            {!import.meta.env.PROD && <Route path="/_dev/symbols" component={HiddenSymbolDesigner} />}
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  // Prefetch core routes + simulator chunks during browser idle time.
  // Two separate idle callbacks: core routes first, then simulator hub
  // (so they don't compete for bandwidth on slow connections).
  useEffect(() => {
    prefetchCoreRoutes();
    prefetchSimulatorHub();
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <ScrollToTop />
        <MainLayout>
          <AnimatedRoutes />
        </MainLayout>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
