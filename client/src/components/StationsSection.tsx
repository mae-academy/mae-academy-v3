/**
 * MAE Academy landing page stations grid: heading + three station cards, wired to i18n copy.
 */
import { motion, Variants } from "framer-motion";
import StationCard from "@/components/StationCard";
import { useLocale } from "@/contexts/LocaleContext";
import { homeGatewayMeta } from "@/data/platform";

const section: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 165, damping: 21 } } };

export default function StationsSection() {
  const { copy } = useLocale();
  const { home } = copy;

  return <motion.section id="academy-field" variants={section} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} className="mae-station-section border-y border-slate-200 bg-white/35 py-16 dark:border-white/10 dark:bg-slate-950/20 sm:py-24">
    <div className="container">
      <motion.div variants={item} className="mb-10"><h2 className="mae-display max-w-2xl text-4xl leading-[.96] text-slate-950 sm:text-5xl dark:text-white">{home.fieldTitle}</h2></motion.div>
      <div className="grid gap-5 lg:grid-cols-3">
        {homeGatewayMeta.map((gatewayMeta, index) => {
          const gateway = home.gateways[index];
          return <StationCard key={gatewayMeta.href} variants={item} title={gateway.title} description={gateway.description} action={gateway.action} href={gatewayMeta.href} visual={gatewayMeta.type} visualVariant={gatewayMeta.visualVariant} />;
        })}
      </div>
    </div>
  </motion.section>;
}
