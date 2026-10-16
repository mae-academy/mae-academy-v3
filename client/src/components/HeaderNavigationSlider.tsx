/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent route rail: navigation bar using canonical SegmentedControl.
 */
import { useLocation } from "wouter";
import { SegmentedControl, type SegmentedOption } from "@/components/common/templates/SegmentedControl";
import { isRouteActive, Locale, platformRoutes } from "@/data/platform";
import { useLocale } from "@/contexts/LocaleContext";
import { useTranslation } from "react-i18next";

type HeaderNavigationSliderProps = { locale: Locale };

export default function HeaderNavigationSlider({ locale: _locale }: HeaderNavigationSliderProps) {
  const [location, setLocation] = useLocation();
  const { copy } = useLocale();
  const { t } = useTranslation("common");

  const isSimulationsActive =
    location === "/simulations" ||
    location.startsWith("/simulations/") ||
    location === "/assembler" ||
    location.startsWith("/assembler/") ||
    location === "/code" ||
    location.startsWith("/code/") ||
    location.startsWith("/simulators/");

  const activeRoute = platformRoutes.find((item) =>
    item.href === "/simulations" ? isSimulationsActive : isRouteActive(location, item.href)
  );

  const activeValue = activeRoute ? activeRoute.href : location;

  const options: SegmentedOption<string>[] = platformRoutes.map((item) => ({
    value: item.href,
    label: t(`navbar.${item.index}`),
    href: item.href,
  }));

  return (
    <nav
      aria-label={t("controls.platformNavigation")}
      className="flex justify-start md:justify-center w-full overflow-x-auto no-scrollbar py-0.5 px-0.5"
    >
      <SegmentedControl
        options={options}
        value={activeValue}
        onChange={(href) => setLocation(href)}
        size="md"
        className="shrink-0"
        aria-label={t("controls.platformNavigation")}
        layoutId="activeNavPill"
      />
    </nav>
  );
}

