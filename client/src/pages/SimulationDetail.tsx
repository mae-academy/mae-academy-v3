/**
 * Every simulator is routed through this page.  SimulatorLayout owns the
 * universal heading and segmented navigation; individual studios own only
 * their tool-specific workspace and state.
 */
import { motion, type Variants } from "framer-motion";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import SimulatorLayout from "@/components/SimulatorLayout";
import SimulationToolWorkspace from "@/components/SimulationToolWorkspace";
import { RootLocusStudio } from "@/components/control/RootLocusStudio";
import { PIDStudio } from "@/components/control/PIDStudio";
import { StateSpaceStudio } from "@/components/control/StateSpaceStudio";
import { BlockDiagramStudio } from "@/components/control/BlockDiagramStudio";
import { FrequencyResponseStudio } from "@/components/control/FrequencyResponseStudio";
import { RectifierStudio } from "@/components/power/RectifierStudio";
import { InverterStudio } from "@/components/power/InverterStudio";
import { ACVoltageControllerStudio } from "@/components/power/ACVoltageControllerStudio";
import { ChopperStudio } from "@/components/power/ChopperStudio";
import { SiemensS7200Studio } from "@/components/plc/SiemensS7200Studio";
import { AssemblerStudio } from "@/components/assembler/AssemblerStudio";
import { AnalogCircuitSimulator } from "@/simulators/circuit-engine/components/AnalogCircuitSimulator";
import { DigitalCircuitSimulator } from "@/simulators/digital-logic/components/DigitalCircuitSimulator";
import { DigitalLogicSimulator } from "@/components/digitalLogic/DigitalLogicSimulator";
import { LinearAlgebraStudio } from "@/components/linearAlgebra/LinearAlgebraStudio";
import { SignalOperationsLab } from "@/components/signals/SignalOperationsLab";
import { SystemClassificationLab } from "@/components/signals/SystemClassificationLab";
import { ConvolutionLab } from "@/components/signals/ConvolutionLab";
import { FourierAnalysisLab } from "@/components/signals/FourierAnalysisLab";
import { LaplaceZPlaneLab } from "@/components/signals/LaplaceZPlaneLab";
import { useLocale } from "@/contexts/LocaleContext";
import { controlSystemToolMeta, linearAlgebraToolMeta, plcToolMeta, powerElectronicsToolMeta, signalsAndSystemsToolMeta, simulationRouteMeta } from "@/data/platform";
import NotFound from "./NotFound";

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
  const isPlc = meta.slug === "plc";
  const isSignalsAndSystems = meta.slug === "signals-and-systems";
  const isLinearAlgebra = meta.slug === "linear-algebra";
  const isCircuitLab = meta.slug === "circuit-lab";
  const isDigitalLogicDesign = meta.slug === "digital-logic-design";
  const isCodeStudio = meta.slug === "code";
  const circuitLabClone = meta.slug === "circuitlab-1" || meta.slug === "circuitlab-2" || meta.slug === "circuitlab-3";
  const circuitTabs = circuitTabCopy[locale];
  const tools = isControlSystems ? controlSystemToolMeta[locale]
    : isPowerElectronics ? powerElectronicsToolMeta
      : isPlc ? plcToolMeta
        : isSignalsAndSystems ? signalsAndSystemsToolMeta
          : isLinearAlgebra ? linearAlgebraToolMeta[locale]
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
    if (!tool) setLocation(`/simulations/${meta.slug}/${defaultTool}`, { replace: true });
  }, [defaultTool, isCodeStudio, location, meta.slug, setLocation, tool]);

  if (!tool && !isCodeStudio) return null;

  const isRootLocus = isControlSystems && tool === "root-locus";
  const isPidStudio = isControlSystems && tool === "pid";
  const isStateSpaceStudio = isControlSystems && tool === "state-space";
  const isBlockDiagram = isControlSystems && tool === "block-diagram-signal-flow";
  const isFrequencyResponse = isControlSystems && tool === "frequency-response";
  const isRectifierStudio = isPowerElectronics && tool === "a";
  const isInverterStudio = isPowerElectronics && tool === "b";
  const isAcVoltageControllerStudio = isPowerElectronics && tool === "c";
  const isChopperStudio = isPowerElectronics && tool === "d";
  const isSiemensS7200Studio = isPlc && tool === "a";
  const isCodeStudioContent = isCodeStudio;
  const isDigitalLogicWorkspace = isDigitalLogicDesign && tool === "workspace";
  const isLinearAlgebraStudio = isLinearAlgebra && ["a", "b", "c", "d", "e"].includes(tool);
  const circuitToolContent = isCircuitLab
    ? <DigitalCircuitSimulator />
    : circuitLabClone ? <AnalogCircuitSimulator instanceId={meta.slug} label={simulation.title} /> : null;
  const toolContent = circuitToolContent ?? (isSignalsAndSystems && tool === "a" ? <SignalOperationsLab /> : isSignalsAndSystems && tool === "b" ? <SystemClassificationLab /> : isSignalsAndSystems && tool === "c" ? <ConvolutionLab /> : isSignalsAndSystems && tool === "d" ? <FourierAnalysisLab /> : isSignalsAndSystems && tool === "e" ? <LaplaceZPlaneLab /> : isDigitalLogicWorkspace ? <DigitalLogicSimulator /> : isRootLocus ? <RootLocusStudio /> : isPidStudio ? <PIDStudio /> : isFrequencyResponse ? <FrequencyResponseStudio /> : isStateSpaceStudio ? <StateSpaceStudio /> : isBlockDiagram ? <BlockDiagramStudio /> : isRectifierStudio ? <RectifierStudio /> : isInverterStudio ? <InverterStudio /> : isAcVoltageControllerStudio ? <ACVoltageControllerStudio /> : isChopperStudio ? <ChopperStudio /> : isSiemensS7200Studio ? <SiemensS7200Studio /> : isCodeStudioContent ? <AssemblerStudio /> : isLinearAlgebraStudio ? <LinearAlgebraStudio section={tool as "a" | "b" | "c" | "d" | "e"} /> : <SimulationToolWorkspace toolKey={`${meta.slug}-${tool}`} />);

  return <motion.div variants={container} initial="hidden" animate="visible">
    <SimulatorLayout title={isDigitalLogicDesign ? "" : simulation.title} tabs={tools} activeTab={tool || ""} routePrefix={isDirectCode ? "/code" : `/simulations/${meta.slug}`} backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation={isDigitalLogicDesign || isCircuitLab || isCodeStudio} compact={isCodeStudio}>
      <motion.div variants={item} className={isCodeStudio ? "mt-3" : "mt-12"}>{toolContent}</motion.div>
    </SimulatorLayout>
  </motion.div>;
}
