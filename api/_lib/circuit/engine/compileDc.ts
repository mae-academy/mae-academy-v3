import { getDef } from '../../../../shared/circuit/componentDefs';
import { terminalKey, type CircuitComponent, type CircuitWire } from '../../../../shared/circuit/circuitTypes';
import type { MNAElement } from '../../../../shared/circuit/mnaTypes';

export type { NetLookup } from '../../../../shared/circuit/nets';
export { netLookupFromNets, netLookupFromWires } from '../../../../shared/circuit/nets';
import { netLookupFromWires, type NetLookup } from '../../../../shared/circuit/nets';

/** Compiles the schematic into a DC MNA netlist; `nets` supplies the node of every terminal (derived from the wires when omitted). */
export function compileDcTopology(components: CircuitComponent[], wires: CircuitWire[], nets?: NetLookup): MNAElement[] {
  const lookup = nets ?? netLookupFromWires(components, wires);
  const nodeFor = (component: CircuitComponent, terminal: string) => lookup.netForTerminal(component.id, terminal);
  const number = (component: CircuitComponent, key: string, fallback: number) => {
    const value = Number(component.props[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const elements: MNAElement[] = [];
  for (const component of components) {
    // Every element this component pushes below is patched afterward, so burnout applies
    // regardless of which branch produced it (single resistor, resistor pair, …).
    const elementsBeforeComponent = elements.length;
    if (component.type === 'resistor') elements.push({ type: 'resistor', id: component.id, label: component.label, positive: nodeFor(component, 'a'), negative: nodeFor(component, 'b'), resistance: number(component, 'resistance', 1000) });
    if (component.type === 'impedance') {
      const format = String(component.props.format ?? 'rectangular');
      let r = 0, x = 0;
      if (format === 'polar') {
        const mag = number(component, 'mag', 5);
        const angRaw = number(component, 'ang', 53.13);
        const isRad = String(component.props.angleUnit) === 'radian';
        const ang = isRad ? angRaw : angRaw * Math.PI / 180;
        r = mag * Math.cos(ang);
        x = mag * Math.sin(ang);
      } else {
        r = number(component, 'r', 3);
        x = number(component, 'x', 4);
      }
      const effectiveR = x < -1e-6 ? 1e12 : Math.max(1e-9, r); // DC: Cap is open, Inductor is short
      elements.push({ type: 'resistor', id: component.id, label: component.label, positive: nodeFor(component, 'a'), negative: nodeFor(component, 'b'), resistance: effectiveR });
    }
    if (component.type === 'dc-voltage') elements.push({ type: 'voltage', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), voltage: number(component, 'voltage', 12) });
    if (component.type === 'dc-rail') elements.push({ type: 'voltage', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: '0', voltage: number(component, 'voltage', 24) });
    // MNAElement.current is SPICE-oriented: conventional current flows `from` -> `to` INSIDE the
    // source, so the RHS is stamped as rhs[from] -= I (leaving) and rhs[to] += I (entering).
    // The schematic arrow points at the `pos` pin, i.e. `pos` is where current EXITS into the
    // external circuit, so `pos` must map to `to`. Same swap as spiceTypes.ts (`I <neg> <pos>`),
    // simulation.ts (stampCurrent 'neg','pos') and analogSimulation.ts; compiling `pos` -> `from`
    // inverted every RHS constant fed to MNA/Nodal/Mesh.
    if (component.type === 'dc-current') elements.push({ type: 'current', id: component.id, label: component.label, from: nodeFor(component, 'neg'), to: nodeFor(component, 'pos'), current: number(component, 'current', 1) });
    if (component.type === 'vccs' || component.type === 'vcvs') {
      const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
      const controlComponent = components.find(c => c.id === targetRef || c.label === targetRef);
      let cp = '0';
      let cn = '0';
      if (controlComponent) {
        const def = getDef(controlComponent.type);
        const terms = def?.terminals ?? [];
        if (controlComponent.type === 'dc-rail') {
          cp = nodeFor(controlComponent, 'pos');
          cn = '0';
        } else if (terms.length >= 2) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = nodeFor(controlComponent, terms[1].id);
        } else if (terms.length === 1) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = '0';
        }
      }
      const gain = number(component, 'gain', number(component, 'transconductance', 0.001));
      if (component.type === 'vccs') elements.push({ type: 'vccs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: cp, controlNegative: cn, gain, transconductance: gain });
      else elements.push({ type: 'vcvs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlPositive: cp, controlNegative: cn, gain: number(component, 'gain', 2) });
    }
    if (component.type === 'cccs' || component.type === 'ccvs') {
      const targetRef = String(component.props.targetId ?? component.props.controlSourceId ?? '');
      const controlComponent = components.find(c => c.id === targetRef || c.label === targetRef);
      let cp = '0';
      let cn = '0';
      let targetResistance: number | undefined = undefined;
      if (controlComponent) {
        const def = getDef(controlComponent.type);
        const terms = def?.terminals ?? [];
        if (controlComponent.type === 'dc-rail') {
          cp = nodeFor(controlComponent, 'pos');
          cn = '0';
        } else if (terms.length >= 2) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = nodeFor(controlComponent, terms[1].id);
        } else if (terms.length === 1) {
          cp = nodeFor(controlComponent, terms[0].id);
          cn = '0';
        }
        if (controlComponent.type === 'resistor') {
          targetResistance = number(controlComponent, 'resistance', 1000);
        }
      }
      const gain = number(component, 'gain', number(component, 'transresistance', 1000));
      if (component.type === 'cccs') elements.push({ type: 'cccs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId: targetRef, targetId: targetRef, gain: number(component, 'gain', 1), controlPositive: cp, controlNegative: cn, targetResistance });
      else elements.push({ type: 'ccvs', id: component.id, label: component.label, positive: nodeFor(component, 'pos'), negative: nodeFor(component, 'neg'), controlSourceId: targetRef, targetId: targetRef, gain, transresistance: gain, controlPositive: cp, controlNegative: cn, targetResistance });
    }
    if (component.type === 'potentiometer') {
      const a = nodeFor(component, 't1') ?? nodeFor(component, 'a');
      const b = nodeFor(component, 't2') ?? nodeFor(component, 'b');
      const w = nodeFor(component, 'wiper');
      const total = Math.max(1e-9, number(component, 'resistance', 10000));
      const rawWiper = number(component, 'wiper', 0.5);
      const wiper = Math.max(0, Math.min(1, rawWiper > 1 ? rawWiper / 100 : rawWiper));
      elements.push({ type: 'resistor', id: `${component.id}:ra`, positive: a, negative: w, resistance: Math.max(1e-9, total * wiper) });
      elements.push({ type: 'resistor', id: `${component.id}:rb`, positive: w, negative: b, resistance: Math.max(1e-9, total * (1 - wiper)) });
    }
    if (component.type === 'star-resistor-pack') {
      const center = `internal:${component.id}:star`;
      elements.push({ type: 'resistor', id: `${component.id}:ra`, positive: nodeFor(component, 'a'), negative: center, resistance: number(component, 'rA', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rb`, positive: nodeFor(component, 'b'), negative: center, resistance: number(component, 'rB', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rc`, positive: nodeFor(component, 'c'), negative: center, resistance: number(component, 'rC', 30) });
    }
    if (component.type === 'delta-resistor-pack') {
      const a = nodeFor(component, 'top') ?? nodeFor(component, 'a');
      const b = nodeFor(component, 'left') ?? nodeFor(component, 'b');
      const c = nodeFor(component, 'right') ?? nodeFor(component, 'c');
      elements.push({ type: 'resistor', id: `${component.id}:rab`, positive: a, negative: b, resistance: number(component, 'rAB', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rbc`, positive: b, negative: c, resistance: number(component, 'rBC', 30) });
      elements.push({ type: 'resistor', id: `${component.id}:rca`, positive: c, negative: a, resistance: number(component, 'rCA', 30) });
    }
    if (component.state?.isBurned) {
      for (let i = elementsBeforeComponent; i < elements.length; i++) elements[i] = { ...elements[i], isBurned: true };
    }
  }
  return elements;
}

