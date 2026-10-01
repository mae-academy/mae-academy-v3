/**
 * Converts a schematic label ("vs", "Vdc", "CH1", "Rab", "G3", "FWD") into LaTeX:
 * a leading symbol with a subscript, upright for abbreviations ("dc", "CH", "FWD").
 */
export function labelToTex(label: string): string {
  if (label === "FWD") return "D_{\\mathrm{FWD}}";
  const abbreviation = label.match(/^([A-Z]{2,})(\d*)$/);
  if (abbreviation) {
    const [, word, index] = abbreviation;
    return index ? `\\mathrm{${word}}_{${index}}` : `\\mathrm{${word}}`;
  }
  const subscripted = label.match(/^([A-Za-z])(\d+|[a-z]+)$/);
  if (subscripted) {
    const [, symbol, sub] = subscripted;
    const index = /^\d+$/.test(sub) || sub.length === 1 ? sub : `\\mathrm{${sub}}`;
    return `${symbol}_{${index}}`;
  }
  return /^[A-Za-z]$/.test(label) ? label : `\\mathrm{${label}}`;
}
