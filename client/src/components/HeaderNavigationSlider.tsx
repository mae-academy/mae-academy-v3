/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * Persistent route rail: navigation bar using canonical SegmentedControl.
 */
import { useLocation } from "wouter";
import { SegmentedControl, type SegmentedOption } from "@/components/common/templates";
import { isRouteActive, Locale, platformRoutes } from "@/data/platform";
import { useLocale } from "@/contexts/LocaleContext";

type HeaderNavigationSliderProps = { locale: Locale };

export default function HeaderNavigationSlider({ locale: _locale }: HeaderNavigationSliderProps) {
  const [location, setLocation] = useLocation();
  const { copy } = useLocale();

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
    label: copy.navigation[item.index],
    href: item.href,
  }));

  return (
    <nav aria-label={copy.controls.platformNavigation} className="flex justify-center w-full">
      <SegmentedControl
        options={options}
        value={activeValue}
        onChange={(href) => setLocation(href)}
        size="md"
        aria-label={copy.controls.platformNavigation}
      />
    </nav>
  );
}

