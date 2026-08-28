/**
 * MAE Academy visual system: Luminous Technical Atelier.
 * A human technical marker for the founder archive—an annotated field seal, not a generic CTA decoration.
 */
import { useLocale } from "@/contexts/LocaleContext";

export default function FounderArchiveSeal() {
  const { copy } = useLocale();
  const archiveLabel = copy.about.founderEyebrow;
  const humanLabel = copy.about.founderName;
  return <svg viewBox="0 0 220 220" className="h-full w-full" fill="none" role="img" aria-label={copy.about.founderName}><defs><linearGradient id="seal-gradient" x1="29" y1="26" x2="185" y2="192" gradientUnits="userSpaceOnUse"><stop stopColor="#60A5FA"/><stop offset=".55" stopColor="#C084FC"/><stop offset="1" stopColor="#FB7185"/></linearGradient><filter id="seal-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs><circle cx="110" cy="110" r="87" stroke="url(#seal-gradient)" strokeDasharray="4 8"/><circle cx="110" cy="110" r="65" stroke="white" strokeOpacity=".24"/><path d="M52 110h116M110 52v116" stroke="white" strokeOpacity=".18"/><circle cx="110" cy="82" r="20" stroke="url(#seal-gradient)" strokeWidth="5"/><path d="M72 155c8-26 22-38 38-38s30 12 38 38" stroke="url(#seal-gradient)" strokeWidth="5" strokeLinecap="round"/><circle cx="110" cy="82" r="30" stroke="#C084FC" strokeOpacity=".32" filter="url(#seal-glow)"/><path d="M30 41h48M142 41h48M30 179h48M142 179h48" stroke="white" strokeOpacity=".32"/><circle cx="26" cy="41" r="3" fill="#FB7185"/><circle cx="194" cy="179" r="3" fill="#60A5FA"/><text x="38" y="29" fill="white" fillOpacity=".65" fontSize="7" fontFamily="ui-sans-serif" letterSpacing=".8">{archiveLabel}</text><text x="123" y="199" fill="white" fillOpacity=".52" fontSize="7" fontFamily="ui-sans-serif" letterSpacing=".6">{humanLabel}</text></svg>;
}
