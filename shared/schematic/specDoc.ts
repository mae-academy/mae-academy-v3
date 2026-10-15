// LLM-facing documentation, generated FROM the symbol library so offsets can never drift from the renderer.

import { VOLTAGE_DIVIDER } from './fixtures';
import { SYMBOL_LIST } from './symbols';
import { SCHEMATIC_GATES_SUMMARY } from './validate';

export { SCHEMATIC_GATES_SUMMARY };
/** Info string of the fenced JSON block the model must emit. */
export const SCHEMATIC_FENCE = 'schematic';

/** Worked example embedded in the doc (verified by a test). */
export const SCHEMATIC_EXAMPLE = VOLTAGE_DIVIDER;

function terminalTable(): string {
  return SYMBOL_LIST.map((s) => {
    const built = s.build({ attrs: {}, std: 'IEC', value: 'text' });
    const t = built.terminals.length ? built.terminals.map((q) => `${q.name}:(${q.x},${q.y})`).join(' ') : 'no terminals';
    return `${s.type}: ${t}`;
  }).join('\n');
}

export const SCHEMATIC_SPEC_DOC: string = [
  `SCHEMATIC OUTPUT FORMAT. To draw a circuit, emit ONE fenced block with info string "${SCHEMATIC_FENCE}" containing STRICT JSON (double quotes, no comments, no trailing commas). Never draw SVG or coordinates in pixels; a deterministic engine validates the spec and draws the symbols.`,
  '',
  'SCHEMA (all coordinates are INTEGER GRID UNITS; the engine multiplies by the pitch):',
  '{"title":str,"standard":"IEC"|"IEEE","pitch":20|10,',
  ' "parts":[{"id":"R1","type":T,"value":"10 kΩ","at":[x,y],"rot":0|90|180|270,"flip":false,"label":"auto|none|above|below|left|right","attrs":{}}],',
  ' "wires":[{"pts":[[x,y],[x,y],...],"arrow":false,"power":false}],',
  ' "labels":[{"text":"Vout","at":[x,y],"anchor":"start|middle|end"}],',
  ' "domains":[{"name":"Control","rect":[x,y,w,h]}]}',
  'attrs: switch {"state":"open|closed","control":"PWM"}; switch_spdt {"state":"1|2"}; nmos/pmos {"body_diode":true}; opamp {"supply":true}; block {"w":6,"h":2} (h even, value = text inside); sum {"signs":{"W":"+","S":"-"}}; ic {"w":10,"h":8,"pins":[{"name":"OUT","side":"R","pos":3}]} (pins on L/R/T/B edges, integer pos 1..len-1; terminals are the pin names; value = caption inside); any part: {"label":"V_{\\\\text{out}}"} overrides the displayed designator.',
  'LABEL POLICY. Use functional, academic designators only: R1, C1, L1, D1, Q1, S1, V_A, V_{\\text{in}}. NEVER put commercial part numbers (1N4007, LM741, 2N2222, TL072, NE555, IRF540...) in ids, values or labels unless the user explicitly asked for that part. Designators such as R1 or Vout are drawn as math (R₁, V_out); use attrs.label (LaTeX subset: _ ^ {} \\text{} Greek) for anything special; in JSON every backslash is doubled ("V_{\\\\text{out}}"). Free labels use the same typography. Keep values and labels in free space: never on a wire or a lead.',
  '',
  'PLACEMENT. "at" is the part\'s FIRST terminal at rot 0. A terminal is at at + offset, where the offset (table below, listed for rot 0) is first mirrored in y if flip, then rotated: rot 90 turns clockwise (x,y)->(-y,x), 180 (x,y)->(-x,-y), 270 (x,y)->(y,-x). Example: resistor at [10,5] rot 90 has terminals (10,5) and (10,9).',
  'TERMINALS at rot 0 (name:(dx,dy)):',
  terminalTable(),
  '',
  'WIRES. Consecutive points share x or y. A wire connects to a terminal only with a vertex exactly ON the terminal point (split a wire there; never run one over a terminal). A wire endpoint on another wire (or on its bend) is a T junction (dot drawn). Wires that merely cross are NOT connected. Two coincident terminals connect directly.',
  'RULES. Unique ids with standard prefixes (R C L D Q M S V I U). Every part except ground, junction, sum needs a value with unit (10 kΩ, 100 nF, 50 µH, 12 V). Analog circuits need a ground part. Parts must not overlap: keep at least 1 grid unit between bodies and join parts with wires, never corner to corner. Wires never pass through a part body. Same rail value = same net; same label/port text = same net. Leave free space around parts for labels. Give every terminal a connection.',
  '',
  'GATES CHECKED:',
  ...SCHEMATIC_GATES_SUMMARY,
  '',
  'EXAMPLE (voltage divider):',
  '```' + SCHEMATIC_FENCE,
  JSON.stringify(SCHEMATIC_EXAMPLE),
  '```',
].join('\n');
