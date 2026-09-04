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
import { AssemblerStudioCompact } from "@/components/assembler/AssemblerStudioCompact";
import { SimulatorTabC } from "@/components/circuit/SimulatorTabC";
import { SimulatorTabD } from "@/components/circuit/SimulatorTabD";
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
  if (location.startsWith("/simulations/")) lastNestedRoute.current = location;
  const activeRoute = location.startsWith("/simulations/") ? location : lastNestedRoute.current;
  const [, , slug, tool] = activeRoute.split("/");
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
  const circuitLabClone = meta.slug === "circuitlab-1" || meta.slug === "circuitlab-2" || meta.slug === "circuitlab-3";
  const circuitTabs = circuitTabCopy[locale];
  const tools = isControlSystems ? controlSystemToolMeta[locale]
    : isPowerElectronics ? powerElectronicsToolMeta
      : isPlc ? plcToolMeta
        : isSignalsAndSystems ? signalsAndSystemsToolMeta
          : isLinearAlgebra ? linearAlgebraToolMeta[locale]
            : isCircuitLab ? [{ slug: "workspace", label: circuitTabs.canvas }]
              : isDigitalLogicDesign ? [{ slug: "workspace", label: simulation.title }]
                : circuitLabClone ? [{ slug: "a", label: simulation.title }]
                  : ["A", "B", "C", "D", "E"].map((label) => ({ slug: label.toLowerCase(), label }));
  const defaultTool = tools[0].slug;

  useEffect(() => {
    const timer = window.setTimeout(() => { document.title = `MAE Academy — ${simulation.title}`; }, 0);
    return () => window.clearTimeout(timer);
  }, [simulation.title]);
  useEffect(() => { if (!tool) setLocation(`/simulations/${meta.slug}/${defaultTool}`, { replace: true }); }, [defaultTool, meta.slug, setLocation, tool]);
  if (!tool) return null;

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
  const isAssemblerStudio = meta.slug === "assembler" && tool === "a";
  const isDigitalLogicWorkspace = isDigitalLogicDesign && tool === "workspace";
  const isLinearAlgebraStudio = isLinearAlgebra && ["a", "b", "c", "d", "e"].includes(tool);
  const circuitToolContent = isCircuitLab
    ? <SimulatorTabD />
    : circuitLabClone ? <SimulatorTabC instanceId={meta.slug} label={simulation.title} /> : null;
  const toolContent = circuitToolContent ?? (isSignalsAndSystems && tool === "a" ? <SignalOperationsLab /> : isSignalsAndSystems && tool === "b" ? <SystemClassificationLab /> : isSignalsAndSystems && tool === "c" ? <ConvolutionLab /> : isSignalsAndSystems && tool === "d" ? <FourierAnalysisLab /> : isSignalsAndSystems && tool === "e" ? <LaplaceZPlaneLab /> : isDigitalLogicWorkspace ? <DigitalLogicSimulator /> : isRootLocus ? <RootLocusStudio /> : isPidStudio ? <PIDStudio /> : isFrequencyResponse ? <FrequencyResponseStudio /> : isStateSpaceStudio ? <StateSpaceStudio /> : isBlockDiagram ? <BlockDiagramStudio /> : isRectifierStudio ? <RectifierStudio /> : isInverterStudio ? <InverterStudio /> : isAcVoltageControllerStudio ? <ACVoltageControllerStudio /> : isChopperStudio ? <ChopperStudio /> : isSiemensS7200Studio ? <SiemensS7200Studio /> : isAssemblerStudio ? <AssemblerStudioCompact /> : isLinearAlgebraStudio ? <LinearAlgebraStudio section={tool as "a" | "b" | "c" | "d" | "e"} /> : <SimulationToolWorkspace toolKey={`${meta.slug}-${tool}`} />);

  return <motion.div variants={container} initial="hidden" animate="visible">
    <SimulatorLayout title={simulation.title} tabs={tools} activeTab={tool} routePrefix={`/simulations/${meta.slug}`} backLabel={copy.footer.simulations} isRtl={isRtl} hideToolNavigation={isDigitalLogicDesign}>
      <motion.div variants={item} className="mt-12">{toolContent}</motion.div>
    </SimulatorLayout>
  </motion.div>;
}
