/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent route rail: a swipeable, keyboard-accessible navigation slider with a shared signal cursor.
 */
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { isRouteActive, Locale, platformRoutes } from "@/data/platform";
import { useLocale } from "@/contexts/LocaleContext";

type HeaderNavigationSliderProps = { locale: Locale };

export default function HeaderNavigationSlider({ locale }: HeaderNavigationSliderProps) {
  const [location] = useLocation();
  const { copy } = useLocale();
  const [api, setApi] = useState<CarouselApi>();
  const isSimulationsActive = location === "/simulations" || location.startsWith("/simulations/") || location === "/assembler" || location.startsWith("/assembler/") || location === "/code" || location.startsWith("/code/") || location.startsWith("/simulators/");
  const activeIndex = platformRoutes.findIndex((item) => item.href === "/simulations" ? isSimulationsActive : isRouteActive(location, item.href));

  useEffect(() => {
    if (api && activeIndex >= 0) api.scrollTo(activeIndex);
  }, [api, activeIndex]);

  return <nav aria-label={copy.controls.platformNavigation} className="w-full">
    <Carousel setApi={setApi} labels={{ previous: copy.controls.previousSlide, next: copy.controls.nextSlide }} carouselRoleDescription={copy.controls.platformNavigation} slideRoleDescription={copy.controls.navigationItem} opts={{ align: "start", containScroll: "trimSnaps", dragFree: true }} className="flex items-center justify-center gap-1.5">
      <CarouselPrevious className="static hidden size-8 shrink-0 !translate-y-0 border-slate-200 bg-white text-slate-600 shadow-none transition-all duration-200 hover:scale-105 hover:border-violet-400 hover:text-violet-700 active:scale-95 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-violet-400 dark:hover:text-violet-300" />
      <CarouselContent className="-ml-2 flex-1 sm:flex-none sm:justify-center">
        {platformRoutes.map((item) => {
          const active = item.href === "/simulations" ? isSimulationsActive : isRouteActive(location, item.href);
          return <CarouselItem key={item.href} className="basis-auto pl-2">
            <Link href={item.href} className={`group relative flex h-9 items-center overflow-hidden whitespace-nowrap rounded-full px-4 text-[11px] font-bold tracking-[0.055em] transition-colors duration-200 ${active ? "text-white" : "text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"}`}>
              {active && <motion.span layoutId="mae-navigation-cursor" className="absolute inset-0 rounded-full bg-brand-gradient shadow-lg shadow-violet-500/20" transition={{ type: "spring", stiffness: 350, damping: 30 }} />}
              <span className="relative z-10">{copy.navigation[item.index]}</span>
            </Link>
          </CarouselItem>;
        })}
      </CarouselContent>
      <CarouselNext className="static hidden size-8 shrink-0 !translate-y-0 border-slate-200 bg-white text-slate-600 shadow-none transition-all duration-200 hover:scale-105 hover:border-violet-400 hover:text-violet-700 active:scale-95 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-violet-400 dark:hover:text-violet-300" />
    </Carousel>
  </nav>;
}
