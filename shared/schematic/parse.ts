// Untrusted-input handling: JSON extraction from LLM text, strict shape normalisation, size caps, type whitelist.

import { expandArchetypeRequest } from './archetypes/registry';
import { getSymbol } from './symbols';
import { LIMITS, PART_TYPES, type Compass, type IcPin, type DomainSpec, type Issue, type LabelPref, type LabelSpec, type PartAttrs, type PartSpec, type PartType, type Pt, type Rot, type SchematicSpec, type WireSpec } from './types';

export interface NormalizeResult { spec: SchematicSpec | null; errors: Issue[]; warnings: Issue[] }
export interface ParseResult extends NormalizeResult { json: unknown }

const LABEL_PREFS: LabelPref[] = ['auto', 'none', 'above', 'below', 'left', 'right'];
const ID_RE = /^[A-Za-z0-9_.\-]{1,20}$/;
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f]/;

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const own = (o: Record<string, unknown>, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

/** Extract the first JSON object from model text: prefers a ```schematic / ```json fence, else the first balanced {...}. */
export function extractJsonText(text: string): string | null {
  const fence = /```(?:schematic|json)?[ \t]*\r?\n([\s\S]*?)```/i.exec(text);
  const candidates = fence ? [fence[1], text] : [text];
  for (const c of candidates) {
    const start = c.indexOf('{');
    if (start < 0) continue;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < c.length; i++) {
      const ch = c[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return c.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse text (prose + optional fenced JSON) into a normalised spec. Strict JSON only. Never throws. */
export function parseSchematicSpec(text: string): ParseResult {
  const err = (code: string, message: string): ParseResult => ({ spec: null, errors: [{ code, message }], warnings: [], json: null });
  if (typeof text !== 'string') return err('PARSE_TYPE', 'Input must be a string containing the JSON spec.');
  if (text.length > LIMITS.maxTextChars) return err('PARSE_SIZE', `Spec text is ${text.length} chars; the limit is ${LIMITS.maxTextChars}. Simplify the schematic.`);
  const js = extractJsonText(text);
  if (js === null) return err('PARSE_NO_JSON', 'No JSON object found. Emit one fenced block: ```schematic { ... } ``` containing strict JSON.');
  let json: unknown;
  try {
    json = JSON.parse(js);
  } catch (e) {
    return err('PARSE_JSON', `Invalid JSON (${e instanceof Error ? e.message : 'syntax error'}). Strict JSON only: double quotes, no trailing commas, no comments.`);
  }
  return { ...normalizeSchematicSpec(json), json };
}

function ptOf(v: unknown, where: string, errors: Issue[]): Pt | null {
  if (!Array.isArray(v) || v.length !== 2) { errors.push({ code: 'SHAPE_POINT', message: `${where}: a point must be [x,y] with two integers.`, where }); return null; }
  for (const c of v) {
    if (typeof c !== 'number' || !Number.isFinite(c)) { errors.push({ code: 'SHAPE_POINT', message: `${where}: coordinates must be numbers.`, where }); return null; }
    if (!Number.isInteger(c)) { errors.push({ code: 'COORD_NOT_INTEGER', message: `${where}: coordinate ${c} is not an integer. All coordinates are integer GRID UNITS.`, where }); return null; }
    if (Math.abs(c) > LIMITS.maxCoord) { errors.push({ code: 'COORD_RANGE', message: `${where}: coordinate ${c} is outside +/-${LIMITS.maxCoord} grid units.`, where }); return null; }
  }
  return [v[0] as number, v[1] as number];
}

function strOf(v: unknown, where: string, errors: Issue[], required = false): string | undefined {
  if (v === undefined || v === null) {
    if (required) errors.push({ code: 'SHAPE_STRING', message: `${where} is required (string).`, where });
    return undefined;
  }
  const s = typeof v === 'number' && Number.isFinite(v) ? String(v) : v;
  if (typeof s !== 'string') { errors.push({ code: 'SHAPE_STRING', message: `${where} must be a string.`, where }); return undefined; }
  if (s.length > LIMITS.maxString) { errors.push({ code: 'STRING_LENGTH', message: `${where} is ${s.length} chars; max ${LIMITS.maxString}.`, where }); return undefined; }
  if (CTRL_RE.test(s)) { errors.push({ code: 'STRING_CONTROL', message: `${where} contains control characters.`, where }); return undefined; }
  return s;
}

const PIN_NAME_RE = /^[A-Za-z0-9+\-_]{1,8}$/;

function icPinsOf(v: unknown, where: string, errors: Issue[]): IcPin[] | null {
  if (!Array.isArray(v) || v.length > 24) { errors.push({ code: 'ATTR_VALUE', message: `${where} must be an array of at most 24 pins {name,side,pos}.`, where }); return null; }
  const pins: IcPin[] = [];
  const names = new Set<string>(), slots = new Set<string>();
  for (let i = 0; i < v.length; i++) {
    const raw: unknown = v[i];
    const w = `${where}[${i}]`;
    if (!isPlain(raw)) { errors.push({ code: 'ATTR_VALUE', message: `${w} must be an object {name,side,pos}.`, where }); continue; }
    const name = own(raw, 'name'), side = own(raw, 'side'), pos = own(raw, 'pos'), optional = own(raw, 'optional');
    if (typeof name !== 'string' || !PIN_NAME_RE.test(name)) { errors.push({ code: 'ATTR_VALUE', message: `${w}.name must be 1-8 chars of letters, digits, + - _.`, where }); continue; }
    if (side !== 'L' && side !== 'R' && side !== 'T' && side !== 'B') { errors.push({ code: 'ATTR_VALUE', message: `${w}.side must be "L", "R", "T" or "B".`, where }); continue; }
    if (typeof pos !== 'number' || !Number.isInteger(pos)) { errors.push({ code: 'ATTR_VALUE', message: `${w}.pos must be an integer.`, where }); continue; }
    if (names.has(name)) { errors.push({ code: 'ATTR_VALUE', message: `${w}: pin name ${JSON.stringify(name)} is used twice.`, where }); continue; }
    if (slots.has(`${side}${pos}`)) { errors.push({ code: 'ATTR_VALUE', message: `${w}: two pins share side ${side} position ${pos}.`, where }); continue; }
    names.add(name); slots.add(`${side}${pos}`);
    pins.push({ name, side, pos, ...(optional === true ? { optional: true } : {}) });
  }
  return pins;
}

function attrsOf(raw: unknown, type: PartType, where: string, errors: Issue[], warnings: Issue[]): PartAttrs {
  const out: PartAttrs = {};
  if (raw === undefined || raw === null) return out;
  if (!isPlain(raw)) { errors.push({ code: 'SHAPE_ATTRS', message: `${where}.attrs must be an object.`, where }); return out; }
  const sym = getSymbol(type);
  const allowed = new Set(sym?.attrKeys ?? []);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key) && key !== 'label') { warnings.push({ code: 'ATTR_UNKNOWN', message: `${where}.attrs.${JSON.stringify(key).slice(0, 30)} is not used by type "${type}" and was ignored.`, where }); continue; }
    const v = own(raw, key);
    if (key === 'state') {
      const ok = type === 'switch' ? ['open', 'closed'] : ['1', '2'];
      const s = typeof v === 'number' ? String(v) : v;
      if (typeof s === 'string' && ok.includes(s)) out.state = s;
      else errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.state must be one of ${ok.map((o) => `"${o}"`).join(', ')}.`, where });
    } else if (key === 'body_diode' || key === 'supply') {
      if (typeof v === 'boolean') out[key] = v;
      else errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.${key} must be true or false.`, where });
    } else if (key === 'control') {
      const s = strOf(v, `${where}.attrs.control`, errors);
      if (s !== undefined) out.control = s;
    } else if (key === 'label') {
      const s = strOf(v, `${where}.attrs.label`, errors);
      if (s !== undefined && s.trim() !== '') out.label = s.trim();
    } else if (key === 'pins') {
      const pins = icPinsOf(v, `${where}.attrs.pins`, errors);
      if (pins) out.pins = pins;
    } else if (key === 'w' || key === 'h') {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= LIMITS.maxBlockDim) out[key] = v;
      else errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.${key} must be an integer 2..${LIMITS.maxBlockDim} (grid units).`, where });
    } else if (key === 'signs') {
      if (!isPlain(v)) { errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.signs must be like {"W":"+","S":"-"}.`, where }); continue; }
      const signs: Partial<Record<Compass, '+' | '−'>> = {};
      for (const c of Object.keys(v)) {
        const sv = own(v, c);
        if ((c === 'N' || c === 'E' || c === 'S' || c === 'W') && (sv === '+' || sv === '-' || sv === '−')) signs[c] = sv === '+' ? '+' : '−';
        else errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.signs: keys must be N,E,S,W and values "+" or "-".`, where });
      }
      out.signs = signs;
    }
  }
  if (type === 'ic') {
    const w = out.w ?? 8, h = out.h ?? 8;
    if (w < 4 || h < 4) errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.w and h must be at least 4 for an ic.`, where });
    for (const p of out.pins ?? []) {
      const len = p.side === 'L' || p.side === 'R' ? h : w;
      if (p.pos < 1 || p.pos > len - 1) errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.pins: pin ${JSON.stringify(p.name)} pos ${p.pos} must be 1..${len - 1} on side ${p.side}.`, where });
    }
  }
  if (type === 'block' && out.h !== undefined && out.h % 2 !== 0) errors.push({ code: 'ATTR_VALUE', message: `${where}.attrs.h must be even so the ports land on grid points.`, where });
  return out;
}

export function normalizeSchematicSpec(raw: unknown): NormalizeResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const fail = (): NormalizeResult => ({ spec: null, errors, warnings });
  if (!isPlain(raw)) { errors.push({ code: 'SHAPE_ROOT', message: 'The spec must be a JSON object with parts, wires, labels.' }); return fail(); }

  // Archetype request: expanded by the engine into a normal spec (never trust the model with coordinates).
  if (Object.prototype.hasOwnProperty.call(raw, 'archetype')) {
    const ex = expandArchetypeRequest(raw);
    if (!ex.spec) { errors.push(...ex.errors); return fail(); }
    return normalizeSchematicSpec(JSON.parse(JSON.stringify(ex.spec)));
  }

  const title = strOf(own(raw, 'title'), 'title', errors) ?? '';
  const stdRaw = own(raw, 'standard');
  if (stdRaw !== undefined && stdRaw !== 'IEC' && stdRaw !== 'IEEE') errors.push({ code: 'SHAPE_STANDARD', message: 'standard must be "IEC" or "IEEE".' });
  const pitchRaw = own(raw, 'pitch');
  if (pitchRaw !== undefined && pitchRaw !== 10 && pitchRaw !== 20) errors.push({ code: 'SHAPE_PITCH', message: 'pitch must be 10 or 20.' });

  const partsRaw = own(raw, 'parts');
  const wiresRaw = own(raw, 'wires');
  const labelsRaw = own(raw, 'labels');
  const domainsRaw = own(raw, 'domains');
  for (const [name, v, max] of [['parts', partsRaw, LIMITS.maxParts], ['wires', wiresRaw, LIMITS.maxWires], ['labels', labelsRaw, LIMITS.maxLabels], ['domains', domainsRaw, LIMITS.maxDomains]] as const) {
    if (v === undefined) continue;
    if (!Array.isArray(v)) errors.push({ code: 'SHAPE_ARRAY', message: `${name} must be an array.` });
    else if (v.length > max) errors.push({ code: 'SIZE_CAP', message: `${name} has ${v.length} entries; the limit is ${max}. Simplify the schematic.` });
  }
  if (errors.some((e) => e.code === 'SIZE_CAP')) return fail();

  const parts: PartSpec[] = [];
  (Array.isArray(partsRaw) ? partsRaw : []).forEach((p, i) => {
    const w = `parts[${i}]`;
    if (!isPlain(p)) { errors.push({ code: 'SHAPE_PART', message: `${w} must be an object.`, where: w }); return; }
    const id = strOf(own(p, 'id'), `${w}.id`, errors, true);
    const wid = id ? `part "${id.slice(0, 20)}"` : w;
    if (id !== undefined && !ID_RE.test(id)) errors.push({ code: 'G1_ID_FORMAT', message: `${w}.id must be 1-20 chars of letters, digits, _ . - (got ${JSON.stringify(id.slice(0, 24))}).`, where: w });
    const typeRaw = own(p, 'type');
    if (typeof typeRaw !== 'string' || !(PART_TYPES as readonly string[]).includes(typeRaw)) {
      errors.push({ code: 'TYPE_UNKNOWN', message: `${wid}: unknown type ${JSON.stringify(String(typeRaw).slice(0, 30))}. Valid types: ${PART_TYPES.join(', ')}.`, where: w });
      return;
    }
    const type = typeRaw as PartType;
    const at = ptOf(own(p, 'at'), `${wid}.at`, errors);
    const rotRaw = own(p, 'rot') ?? 0;
    if (rotRaw !== 0 && rotRaw !== 90 && rotRaw !== 180 && rotRaw !== 270) errors.push({ code: 'SHAPE_ROT', message: `${wid}.rot must be 0, 90, 180 or 270.`, where: w });
    const flipRaw = own(p, 'flip') ?? false;
    if (typeof flipRaw !== 'boolean') errors.push({ code: 'SHAPE_FLIP', message: `${wid}.flip must be true or false.`, where: w });
    const labelRaw = own(p, 'label') ?? 'auto';
    if (typeof labelRaw !== 'string' || !LABEL_PREFS.includes(labelRaw as LabelPref)) errors.push({ code: 'SHAPE_LABEL', message: `${wid}.label must be one of ${LABEL_PREFS.join(', ')}.`, where: w });
    const value = strOf(own(p, 'value'), `${wid}.value`, errors);
    const attrs = attrsOf(own(p, 'attrs'), type, wid, errors, warnings);
    if (id === undefined || !at) return;
    parts.push({ id, type, value, at, rot: (rotRaw === 90 || rotRaw === 180 || rotRaw === 270 ? rotRaw : 0) as Rot, flip: flipRaw === true, label: (LABEL_PREFS.includes(labelRaw as LabelPref) ? labelRaw : 'auto') as LabelPref, attrs });
  });

  const wires: WireSpec[] = [];
  (Array.isArray(wiresRaw) ? wiresRaw : []).forEach((wv, i) => {
    const w = `wires[${i}]`;
    if (!isPlain(wv)) { errors.push({ code: 'SHAPE_WIRE', message: `${w} must be an object {"pts":[[x,y],...]}.`, where: w }); return; }
    const ptsRaw = own(wv, 'pts');
    if (!Array.isArray(ptsRaw) || ptsRaw.length < 2) { errors.push({ code: 'G7_WIRE_POINTS', message: `${w}.pts needs at least 2 points.`, where: w }); return; }
    if (ptsRaw.length > LIMITS.maxPtsPerWire) { errors.push({ code: 'SIZE_CAP', message: `${w}.pts has ${ptsRaw.length} points; max ${LIMITS.maxPtsPerWire}.`, where: w }); return; }
    const pts: Pt[] = [];
    let bad = false;
    ptsRaw.forEach((pv, j) => { const p = ptOf(pv, `${w}.pts[${j}]`, errors); if (p) pts.push(p); else bad = true; });
    if (bad) return;
    const arrow = own(wv, 'arrow'), power = own(wv, 'power');
    if ((arrow !== undefined && typeof arrow !== 'boolean') || (power !== undefined && typeof power !== 'boolean')) errors.push({ code: 'SHAPE_WIRE', message: `${w}.arrow and ${w}.power must be booleans.`, where: w });
    wires.push({ pts, ...(arrow === true ? { arrow: true } : {}), ...(power === true ? { power: true } : {}) });
  });

  const labels: LabelSpec[] = [];
  (Array.isArray(labelsRaw) ? labelsRaw : []).forEach((lv, i) => {
    const w = `labels[${i}]`;
    if (!isPlain(lv)) { errors.push({ code: 'SHAPE_LABEL', message: `${w} must be an object {"text","at","anchor"}.`, where: w }); return; }
    const text = strOf(own(lv, 'text'), `${w}.text`, errors, true);
    const at = ptOf(own(lv, 'at'), `${w}.at`, errors);
    const an = own(lv, 'anchor') ?? 'start';
    if (an !== 'start' && an !== 'middle' && an !== 'end') errors.push({ code: 'SHAPE_LABEL', message: `${w}.anchor must be start, middle or end.`, where: w });
    if (text === undefined || !at) return;
    labels.push({ text, at, anchor: an === 'middle' || an === 'end' ? an : 'start' });
  });

  const domains: DomainSpec[] = [];
  (Array.isArray(domainsRaw) ? domainsRaw : []).forEach((dv, i) => {
    const w = `domains[${i}]`;
    if (!isPlain(dv)) { errors.push({ code: 'SHAPE_DOMAIN', message: `${w} must be an object {"name","rect":[x,y,w,h]}.`, where: w }); return; }
    const name = strOf(own(dv, 'name'), `${w}.name`, errors, true);
    const r = own(dv, 'rect');
    if (!Array.isArray(r) || r.length !== 4 || r.some((c) => typeof c !== 'number' || !Number.isInteger(c) || Math.abs(c) > LIMITS.maxCoord) || (r[2] as number) <= 0 || (r[3] as number) <= 0) {
      errors.push({ code: 'SHAPE_DOMAIN', message: `${w}.rect must be [x,y,w,h] of integers with w,h > 0.`, where: w });
      return;
    }
    if (name === undefined) return;
    domains.push({ name, rect: [r[0], r[1], r[2], r[3]] as [number, number, number, number] });
  });

  if (errors.length > 0) return fail();
  return {
    spec: { title, standard: stdRaw === 'IEEE' ? 'IEEE' : 'IEC', pitch: pitchRaw === 10 ? 10 : 20, parts, wires, labels, domains },
    errors,
    warnings,
  };
}
