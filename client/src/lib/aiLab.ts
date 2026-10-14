import { LAB_CONTEXTS, type LabContext } from "@shared/aiTypes";

/** Simulator route slug -> the MAE AI lab it belongs to. Slugs without an entry have no lab. */
const LAB_BY_SLUG: Readonly<Record<string, LabContext>> = {
  "control-systems": "control",
  "power-electronics": "power",
  "signals-and-systems": "signals",
  "circuit-lab": "circuits",
  "circuitlab-1": "circuits",
  "circuitlab-2": "circuits",
  "circuitlab-3": "circuits",
  "digital-logic-design": "logic",
  code: "code",
  "arduino-studio": "arduino",
  plc: "plc",
  "pneumatics-and-hydraulics": "fluid",
};

/** The lab for a simulator route slug, or undefined when MAE AI has no matching lab (callers then omit the chat button). */
export function labForSimulationSlug(slug: string | undefined | null): LabContext | undefined {
  if (!slug) return undefined;
  return Object.hasOwn(LAB_BY_SLUG, slug) ? LAB_BY_SLUG[slug] : undefined;
}

/** Validates the untrusted `?lab=` value; anything unknown falls back to the general lab. */
export function parseLabParam(value: string | undefined | null): LabContext {
  return (LAB_CONTEXTS as readonly string[]).includes(value ?? "") ? (value as LabContext) : "general";
}

/** Where a lab's live simulator lives, for the "open the simulator" shortcut. */
const SIMULATOR_PATH: Readonly<Record<LabContext, string>> = {
  general: "/simulations",
  circuits: "/simulations/circuit-lab",
  power: "/simulations/power-electronics",
  logic: "/simulations/digital-logic-design",
  control: "/simulations/control-systems",
  code: "/simulations/code",
  arduino: "/simulations/arduino-studio",
  signals: "/simulations/signals-and-systems",
  fluid: "/simulations/pneumatics-and-hydraulics",
  plc: "/simulations/plc",
};

export function simulatorPathForLab(lab: LabContext): string {
  return SIMULATOR_PATH[lab];
}

/** URL of the chat page for a lab; the general lab keeps the URL clean. */
export function aiPathForLab(lab: LabContext): string {
  return lab === "general" ? "/ai" : `/ai?lab=${lab}`;
}
