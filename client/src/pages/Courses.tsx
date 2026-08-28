/** MAE Academy visual system: locale-driven courses collection. */
import CardGridPage from "@/components/CardGridPage";
import { useLocale } from "@/contexts/LocaleContext";

export default function Courses() {
  const { copy } = useLocale();
  return <CardGridPage type="courses" {...copy.collections.courses} />;
}
