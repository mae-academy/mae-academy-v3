/**
 * Control Systems domain chunk — default export is a render dispatcher.
 * All 5 tools in one chunk: first-visit loads the chunk, tab switching is instant.
 */
import { RootLocusStudio } from "@/components/control/RootLocusStudio";
import { PIDStudio } from "@/components/control/PIDStudio";
import { StateSpaceStudio } from "@/components/control/StateSpaceStudio";
import { BlockDiagramStudio } from "@/components/control/BlockDiagramStudio";
import { FrequencyResponseStudio } from "@/components/control/FrequencyResponseStudio";

export default function ControlStudiosRenderer({ tool }: { tool: string }) {
  if (tool === "root-locus") return <RootLocusStudio />;
  if (tool === "pid") return <PIDStudio />;
  if (tool === "state-space") return <StateSpaceStudio />;
  if (tool === "block-diagram-signal-flow") return <BlockDiagramStudio />;
  if (tool === "frequency-response") return <FrequencyResponseStudio />;
  return null;
}
