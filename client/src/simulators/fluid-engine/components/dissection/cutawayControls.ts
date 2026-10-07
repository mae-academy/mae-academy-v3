/**
 * Sliders offered under a cutaway. They change the circuit itself (the selected part, the throttle feeding it, the
 * supply), so the cutaway and the schematic stay one simulation. Pure: the app supplies the circuit and the setter.
 */
import type { FluidTranslate } from '../../i18n/fluidText';
import type { CutawayComponent } from './cutawayPhysics';

export type CutawayControlId = 'opening' | 'volume' | 'supply';

export interface CutawayControl {
  id: CutawayControlId;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

interface Wire { fromComp: string; toComp: string }
export interface ControlCircuit {
  components: Array<CutawayComponent>;
  wires: Wire[];
  /** Replaces properties of one component. */
  update: (id: string, props: Record<string, unknown>) => void;
}

const THROTTLES = ['flow-control', 'flow-control-oneway'];
const SUPPLIES = ['pressure-source'];
const num = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The throttle wired straight to a part, if any: it sets how fast the part fills. */
export function upstreamThrottle(part: CutawayComponent, circuit: Pick<ControlCircuit, 'components' | 'wires'>): CutawayComponent | undefined {
  for (const wire of circuit.wires) {
    const other = wire.fromComp === part.id ? wire.toComp : wire.toComp === part.id ? wire.fromComp : undefined;
    const found = other ? circuit.components.find(candidate => candidate.id === other && THROTTLES.includes(candidate.type)) : undefined;
    if (found) return found;
  }
  return undefined;
}

export function cutawayControls(part: CutawayComponent, circuit: ControlCircuit, tr: FluidTranslate): CutawayControl[] {
  if (part.type !== 'air-reservoir' && part.type !== 'time-delay-valve') return [];
  const controls: CutawayControl[] = [];
  const set = (target: CutawayComponent, key: string) => (value: number) => circuit.update(target.id, { ...target.props, [key]: value });

  const throttle = part.type === 'time-delay-valve' ? part : upstreamThrottle(part, circuit);
  if (throttle) {
    controls.push({ id: 'opening', label: tr('cutaway.controls.opening'), unit: '%', min: 1, max: 100, step: 1, value: num(throttle.props.openingPercentage, part.type === 'time-delay-valve' ? 20 : 100), onChange: set(throttle, 'openingPercentage') });
  }
  controls.push({ id: 'volume', label: tr('cutaway.controls.volume'), unit: 'cm³', min: 50, max: 5000, step: 50, value: num(part.props.volume, part.type === 'time-delay-valve' ? 500 : 1000), onChange: set(part, 'volume') });

  const sources = circuit.components.filter(candidate => SUPPLIES.includes(candidate.type));
  if (sources.length > 0) {
    controls.push({
      id: 'supply',
      label: tr('cutaway.controls.supply'),
      unit: 'bar',
      min: 1,
      max: 10,
      step: 0.5,
      value: Math.max(...sources.map(source => num(source.props.pressure, 6))),
      onChange: value => sources.forEach(source => circuit.update(source.id, { ...source.props, pressure: value })),
    });
  }
  return controls;
}
