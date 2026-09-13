/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * A human technical marker for the founder archive—an annotated field seal, not a generic CTA decoration.
 */
import { useLocale } from "@/contexts/LocaleContext";

export default function FounderArchiveSeal() {
  const { copy } = useLocale();
  const archiveLabel = copy.about.founderEyebrow;
  const humanLabel = copy.about.founderName;
  return (
    <svg viewBox="0 0 220 220" className="h-full w-full text-slate-700 dark:text-slate-200" fill="none" role="img" aria-label={copy.about.founderName}>
      <defs>
        <linearGradient id="seal-gradient" x1="29" y1="26" x2="185" y2="192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset=".55" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#E11D48" />
        </linearGradient>
        <filter id="seal-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <circle cx="110" cy="110" r="87" stroke="url(#seal-gradient)" strokeDasharray="4 8" strokeWidth="1.5" />
      <circle cx="110" cy="110" r="65" stroke="currentColor" strokeOpacity=".2" strokeWidth="1" />
      <path d="M52 110h116M110 52v116" stroke="currentColor" strokeOpacity=".18" strokeWidth="1" />
      <circle cx="110" cy="82" r="20" stroke="url(#seal-gradient)" strokeWidth="4.5" />
      <path d="M72 155c8-26 22-38 38-38s30 12 38 38" stroke="url(#seal-gradient)" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="110" cy="82" r="28" stroke="#7C3AED" strokeOpacity=".25" filter="url(#seal-glow)" />
      <path d="M30 41h48M142 41h48M30 179h48M142 179h48" stroke="currentColor" strokeOpacity=".25" strokeWidth="1" />
      <circle cx="26" cy="41" r="3" fill="#E11D48" />
      <circle cx="194" cy="179" r="3" fill="#2563EB" />
      <text x="38" y="29" fill="currentColor" fillOpacity=".75" fontSize="7.5" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="700" letterSpacing=".8">{archiveLabel}</text>
      <text x="123" y="199" fill="currentColor" fillOpacity=".65" fontSize="7.5" fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight="600" letterSpacing=".6">{humanLabel}</text>
    </svg>
  );
}
