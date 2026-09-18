/** MAE Academy visual system: Practical Simulations section with rich filtering & sorting. */
import PracticalSimulations from "@/components/PracticalSimulations";
import { useLocale } from "@/contexts/LocaleContext";

export default function Simulations() {
  const { copy } = useLocale();
  return <PracticalSimulations {...copy.collections.simulations} />;
}

