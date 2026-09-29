/**
 * Linear Algebra domain chunk — default export is a render dispatcher.
 */
import { LinearAlgebraStudio } from "@/components/linearAlgebra/LinearAlgebraStudio";

export default function LinearAlgebraRenderer({ tool }: { tool: string }) {
  const validSection = ["a", "b", "c", "d", "e"].includes(tool);
  if (!validSection) return null;
  return <LinearAlgebraStudio section={tool as "a" | "b" | "c" | "d" | "e"} />;
}
