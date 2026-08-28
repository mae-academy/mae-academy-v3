/** MAE Academy visual system: locale-driven simulations collection. */
import CardGridPage from "@/components/CardGridPage";
import { useLocale } from "@/contexts/LocaleContext";

export default function Simulations() {
  const { copy } = useLocale();
  return <CardGridPage type="simulations" {...copy.collections.simulations} />;
}
