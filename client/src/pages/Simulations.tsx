/** MAE Academy visual system: Practical Simulations section with rich filtering & sorting. */
import PracticalSimulations from "@/components/PracticalSimulations";
import SimulationsGuide from "@/components/SimulationsGuide";
import { useLocale } from "@/contexts/LocaleContext";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Simulations() {
  const { copy } = useLocale();
  usePageTitle("Interactive Simulations");
  return (
    <>
      <PracticalSimulations {...copy.collections.simulations} />
      <SimulationsGuide />
    </>
  );
}

