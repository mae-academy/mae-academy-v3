/**
 * MAE Academy: Founder Visual Identity Frame.
 * Minimalist, elegant portrait frame with unified platform SegmentedControl switcher.
 * Strictly aligned with canonical platform theme (diagonal brand gradient pill).
 */
import { useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { Camera, Layers } from "lucide-react";
import { SegmentedControl, type SegmentedOption } from "@/components/common/templates";

interface FounderAvatarFrameProps {
  className?: string;
}

export default function FounderAvatarFrame({ className = "" }: FounderAvatarFrameProps) {
  const { locale } = useLocale();
  const [visualMode, setVisualMode] = useState<"photo" | "schematic">("photo");

  const options: SegmentedOption<"photo" | "schematic">[] = [
    {
      value: "photo",
      label: locale === "ar" ? "الصورة الشخصية" : "Photograph",
      icon: <Camera className="h-3.5 w-3.5" />,
    },
    {
      value: "schematic",
      label: locale === "ar" ? "المخطط التقني" : "Schematic CAD",
      icon: <Layers className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* Portrait / CAD Frame Container */}
      <div className="relative aspect-[4/5] w-full max-w-[380px] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.18)] transition-all duration-300 dark:border-white/[0.08] dark:bg-slate-900">
        {visualMode === "photo" ? (
          <div className="relative h-full w-full">
            <img
              src="/founder.jpg"
              alt="Mohammad AbuElyan — Mechatronics Engineer & Founder of MAE Academy"
              className="h-full w-full object-cover object-[center_20%] transition-transform duration-500 hover:scale-[1.02]"
              loading="eager"
            />
            {/* Subtle natural vignette */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="relative h-full w-full bg-slate-950">
            <img
              src="/founder-schematic.jpg"
              alt="Mohammad AbuElyan — Schematic CAD & Mathematical Blueprint Portrait"
              className="h-full w-full object-cover object-center transition-transform duration-500 hover:scale-[1.02]"
              loading="eager"
            />
            {/* Subtle natural vignette */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-blue-950/30 via-transparent to-transparent" />
          </div>
        )}
      </div>

      {/* Unified Platform Segmented Control (Exact Theme Standard matching Header Navigation 'About' pill) */}
      <div className="mt-4 flex w-full max-w-[380px] justify-center">
        <SegmentedControl
          options={options}
          value={visualMode}
          onChange={setVisualMode}
          size="md"
          fullWidth
          aria-label={locale === "ar" ? "نوع العرض" : "Founder Visual Mode"}
        />
      </div>
    </div>
  );
}
