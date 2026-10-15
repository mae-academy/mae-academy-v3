// Builder helpers for archetype authors: place parts, ask where a terminal landed, draw wires. Produces a normalised SchematicSpec.

import { placePart } from '../geometry';
import type { LabelPref, LabelSpec, PartAttrs, PartSpec, PartType, Pt, Rot, SchematicSpec, Standard, WireSpec } from '../types';

export interface PartOpts {
  value?: string;
  rot?: Rot;
  flip?: boolean;
  /** Where the designator/value text goes (default auto: the engine picks a free slot). */
  label?: LabelPref;
  /** Display designator override, LaTeX-ish (`V_A`, `R_{\\text{L}}`); the id stays the netlist name. */
  tex?: string;
  attrs?: PartAttrs;
}

export class Kit {
  readonly parts: PartSpec[] = [];
  readonly wires: WireSpec[] = [];
  readonly labels: LabelSpec[] = [];
  private readonly at = new Map<string, Map<string, Pt>>();

  /** Place a part; returns its id. */
  part(id: string, type: PartType, at: Pt, o: PartOpts = {}): string {
    const attrs: PartAttrs = { ...(o.attrs ?? {}), ...(o.tex ? { label: o.tex } : {}) };
    const spec: PartSpec = { id, type, ...(o.value !== undefined ? { value: o.value } : {}), at, rot: o.rot ?? 0, flip: o.flip ?? false, label: o.label ?? 'auto', attrs };
    this.parts.push(spec);
    const placed = placePart(spec, 'IEC', 20);
    const m = new Map<string, Pt>();
    for (const t of placed?.terminals ?? []) m.set(t.name, [t.x, t.y]);
    this.at.set(id, m);
    return id;
  }

  /** Absolute grid position of a terminal of an already placed part. */
  t(id: string, terminal: string): Pt {
    const p = this.at.get(id)?.get(terminal);
    if (!p) throw new Error(`archetype kit: no terminal ${id}.${terminal}`);
    return [p[0], p[1]];
  }

  /** A wire through the given points (consecutive points must share x or y). */
  wire(...pts: Pt[]): void {
    this.wires.push({ pts: pts.map((p) => [p[0], p[1]] as Pt) });
  }

  /** A wire built from a mixed list of points and `id.terminal` strings. */
  route(...stops: (Pt | string)[]): void {
    this.wire(...stops.map((s) => (typeof s === 'string' ? this.t(s.slice(0, s.indexOf('.')), s.slice(s.indexOf('.') + 1)) : s)));
  }

  /** Free text label (LaTeX-ish); keep it off wires and parts. */
  text(text: string, at: Pt, anchor: LabelSpec['anchor'] = 'start'): void {
    this.labels.push({ text, at, anchor });
  }

  build(title: string, standard: Standard = 'IEC'): SchematicSpec {
    return { title, standard, pitch: 20, parts: this.parts, wires: this.wires, labels: this.labels, domains: [] };
  }
}
