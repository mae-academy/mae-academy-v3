/**
 * Signals & Systems domain chunk — default export is a render dispatcher.
 */
import { SignalOperationsLab } from "@/components/signals/SignalOperationsLab";
import { SystemClassificationLab } from "@/components/signals/SystemClassificationLab";
import { ConvolutionLab } from "@/components/signals/ConvolutionLab";
import { FourierStudio } from "@/features/signals/ui/FourierStudio";
import { LaplaceZPlaneLab } from "@/components/signals/LaplaceZPlaneLab";

export default function SignalsStudiosRenderer({ tool }: { tool: string }) {
  if (tool === "signal-operations-and-properties" || tool === "a") return <SignalOperationsLab />;
  if (tool === "system-classification" || tool === "b") return <SystemClassificationLab />;
  if (tool === "convolution-engine" || tool === "c") return <ConvolutionLab />;
  if (tool === "fourier-analysis" || tool === "d") return <FourierStudio />;
  if (tool === "laplace-s-plane" || tool === "e") return <LaplaceZPlaneLab />;
  return null;
}
