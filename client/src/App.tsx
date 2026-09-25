/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Route camera pan uses AnimatePresence while persistent chrome remains in MainLayout.
 */
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import MainLayout from "./components/MainLayout";
import Home from "./pages/Home";
import Research from "./pages/Research";
import ResearchDetail from "./pages/ResearchDetail";
import Courses from "./pages/Courses";
import AcademicLibrary from "./pages/AcademicLibrary";
import LibraryDetail from "./pages/LibraryDetail";
import Simulations from "./pages/Simulations";
import SimulationDetail from "./pages/SimulationDetail";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
const ArduinoStudioPage = lazy(() => import("./pages/ArduinoStudioPage"));
const PlcSimulatorPage = lazy(() => import("./pages/PlcSimulatorPage"));
import HiddenSymbolDesigner from "./simulators/circuit-engine/components/pages/HiddenSymbolDesigner";
import ScrollToTop from "@/components/common/ScrollToTop";

function AnimatedRoutes() {
  const [location] = useLocation();
  const pageKey = location.startsWith("/simulations/code") || location.startsWith("/code") || location.startsWith("/assembler")
    ? "/simulations/code"
    : location.startsWith("/simulations/")
      ? location.split("/").slice(0, 3).join("/")
      : location;
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
        <Switch location={location}>
          <Route path="/" component={Home} />
          <Route path="/research" component={Research} />
          <Route path="/research/:id" component={ResearchDetail} />
          <Route path="/library" component={AcademicLibrary} />
          <Route path="/library/:id" component={LibraryDetail} />
          <Route path="/courses" component={Courses} />
          <Route path="/code/:lang" component={SimulationDetail} />
          <Route path="/code" component={SimulationDetail} />
          <Route path="/assembler/:tool" component={SimulationDetail} />
          <Route path="/assembler" component={SimulationDetail} />
          <Route path="/simulations/arduino-studio">
            <Suspense fallback={<div className="container py-16 font-mono text-xs text-slate-500">Loading Arduino Studio…</div>}><ArduinoStudioPage /></Suspense>
          </Route>
          {/* PLC: the card resolves to /simulations/plc; legacy /simulations/plc/<tool> deep links land here too. */}
          <Route path="/simulations/plc/:tool">
            <Suspense fallback={<div className="container py-16 font-mono text-xs text-slate-500">Loading PLC Simulator…</div>}><PlcSimulatorPage /></Suspense>
          </Route>
          <Route path="/simulations/plc">
            <Suspense fallback={<div className="container py-16 font-mono text-xs text-slate-500">Loading PLC Simulator…</div>}><PlcSimulatorPage /></Suspense>
          </Route>
          <Route path="/simulators/plc-simulator">
            <Suspense fallback={<div className="container py-16 font-mono text-xs text-slate-500">Loading PLC Simulator…</div>}><PlcSimulatorPage /></Suspense>
          </Route>
          <Route path="/simulations/:slug/:tool" component={SimulationDetail} />
          <Route path="/simulations/:slug" component={SimulationDetail} />
          <Route path="/simulations" component={Simulations} />
          <Route path="/simulators/arduino-studio">
            <Suspense fallback={<div className="container py-16 font-mono text-xs text-slate-500">Loading Arduino Studio…</div>}><ArduinoStudioPage /></Suspense>
          </Route>
          <Route path="/about" component={About} />
          <Route path="/_dev/symbols" component={HiddenSymbolDesigner} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
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
