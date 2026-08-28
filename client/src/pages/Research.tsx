/** MAE Academy visual system: locale-driven research collection. */
import CardGridPage from "@/components/CardGridPage";
import { useLocale } from "@/contexts/LocaleContext";

export default function Research() {
  const { copy } = useLocale();
  return <CardGridPage type="research" {...copy.collections.research} />;
}
