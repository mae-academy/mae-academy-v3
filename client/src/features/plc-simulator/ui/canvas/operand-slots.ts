import { validateAddress } from '../../domain/address';
import type { LadNode, NumericType, Operand } from '../../domain/ast';
import type { HardwareProfile } from '../../domain/hardware';
import { isIndexedArea, type AccessWidth } from '../../domain/types';
import { LOGIC_WIDTHS, NUMERIC_TYPES } from '../../engine/numeric';

/**
 * Editable operand slots of each node type, and live validation of text typed into them against
 * the active hardware profile. Mirrors the checks the engine compiler performs, so anything the
 * inline editor accepts is something `compileProgram` will also accept.
 */

export type SlotKey =
  | 'operand'
  | 'target'
  | 'instance'
  | 'PT'
  | 'PV'
  | 'lhs'
  | 'rhs'
  | 'in1'
  | 'in2'
  | 'in'
  | 'out';

/** What an address in the slot has to be. */
type Requirement = AccessWidth | 'bit-or-instance' | 'T' | 'C';

export interface SlotDescriptor {
  readonly key: SlotKey;
  readonly label: string;
  /** True when a numeric constant is legal in place of an address. */
  readonly allowsConstant: boolean;
  readonly requirement: Requirement;
  /** Numeric type the constant is interpreted with. */
  readonly numeric: NumericType;
}

const widthOf = (type: NumericType): AccessWidth => NUMERIC_TYPES[type].width;

export function slotsOf(node: LadNode): readonly SlotDescriptor[] {
  const slot = (
    key: SlotKey,
    label: string,
    requirement: Requirement,
    allowsConstant = false,
    numeric: NumericType = 'INT',
  ): SlotDescriptor => ({ key, label, requirement, allowsConstant, numeric });

  switch (node.type) {
    case 'contact':
      return [slot('operand', 'Address', 'bit-or-instance')];
    case 'coil':
      return node.variant === 'MASTER' ? [] : [slot('target', 'Address', 'bit-or-instance')];
    case 'timer':
      return [slot('instance', 'Timer', 'T'), slot('PT', 'PT', 'word', true)];
    case 'counter':
      return [slot('instance', 'Counter', 'C'), slot('PV', 'PV', 'word', true)];
    case 'compare':
      return [
        slot('lhs', 'IN1', widthOf(node.dataType), true, node.dataType),
        slot('rhs', 'IN2', widthOf(node.dataType), true, node.dataType),
      ];
    case 'math': {
      const width = widthOf(node.dataType);
      return 'in1' in node
        ? [
            slot('in1', 'IN1', width, true, node.dataType),
            slot('in2', 'IN2', width, true, node.dataType),
            slot('out', 'OUT', width, false, node.dataType),
          ]
        : [slot('in', 'IN', width, true, node.dataType), slot('out', 'OUT', width, false, node.dataType)];
    }
    case 'wordLogic': {
      const width = LOGIC_WIDTHS[node.width];
      return 'in1' in node
        ? [slot('in1', 'IN1', width, true), slot('in2', 'IN2', width, true), slot('out', 'OUT', width)]
        : [slot('in', 'IN', width, true), slot('out', 'OUT', width)];
    }
    default: {
      const exhaustive: never = node;
      void exhaustive;
      return [];
    }
  }
}

const asText = (operand: Operand): string =>
  operand.kind === 'address' ? operand.address : String(operand.value);

/** Current text of a slot, as shown to the user. */
export function readSlot(node: LadNode, key: SlotKey): string {
  switch (node.type) {
    case 'contact':
      return key === 'operand' ? node.operand : '';
    case 'coil':
      return node.variant !== 'MASTER' && key === 'target' ? node.target : '';
    case 'timer':
      return key === 'instance' ? node.instance : key === 'PT' ? asText(node.inputs.PT) : '';
    case 'counter':
      return key === 'instance' ? node.instance : key === 'PV' ? asText(node.inputs.PV) : '';
    case 'compare':
      return key === 'lhs' ? asText(node.lhs) : key === 'rhs' ? asText(node.rhs) : '';
    case 'math':
      if (key === 'out') return node.out;
      if ('in1' in node) return key === 'in1' ? asText(node.in1) : key === 'in2' ? asText(node.in2) : '';
      return key === 'in' ? asText(node.in) : '';
    case 'wordLogic':
      if (key === 'out') return node.out;
      if ('in1' in node) return key === 'in1' ? asText(node.in1) : key === 'in2' ? asText(node.in2) : '';
      return key === 'in' ? asText(node.in) : '';
    default:
      return '';
  }
}

const CONSTANT_RE = /^[+-]?(\d+\.\d+|\d+|16#[0-9a-fA-F]+)$/;

/** Parses a constant the same way the STL parser does. Null when `text` is not one. */
export function parseConstantText(text: string): number | null {
  if (!CONSTANT_RE.test(text)) return null;
  const negative = text.startsWith('-');
  const body = text.replace(/^[+-]/, '');
  const value = body.toLowerCase().startsWith('16#') ? parseInt(body.slice(3), 16) : Number(body);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

const toOperand = (text: string): Operand => {
  const constant = parseConstantText(text);
  return constant === null
    ? { kind: 'address', address: text.trim().toUpperCase() }
    : { kind: 'constant', value: constant };
};

/**
 * Validates `text` for a slot. Returns a human-readable problem, or null when it is acceptable.
 * Address checks defer to `validateAddress`, so the profile's prefixes, bounds and access widths
 * are enforced exactly as they are everywhere else.
 */
export function validateSlot(
  node: LadNode,
  key: SlotKey,
  text: string,
  profile: HardwareProfile,
): string | null {
  const slot = slotsOf(node).find((entry) => entry.key === key);
  if (!slot) return `${node.type} has no "${key}" slot`;

  const value = text.trim();
  if (value === '') return 'A value is required';

  const constant = parseConstantText(value);
  if (constant !== null) {
    if (!slot.allowsConstant) return `${slot.label} must be an address, not a constant`;
    const spec = NUMERIC_TYPES[slot.numeric];
    if (spec.integer && !Number.isInteger(constant)) return `${slot.numeric} constants must be whole numbers`;
    if (constant < spec.min || constant > spec.max) {
      return `${constant} is outside the ${slot.numeric} range ${spec.min}..${spec.max}`;
    }
    return null;
  }

  const result = validateAddress(value, profile);
  if (!result.isValid || !result.parsed) return result.error ?? `"${value}" is not a valid address`;

  const { area, width } = result.parsed;
  switch (slot.requirement) {
    case 'bit-or-instance':
      return width === 'bit' || isIndexedArea(area) ? null : `${slot.label} needs a bit address (e.g. I0.0)`;
    case 'T':
    case 'C':
      return area === slot.requirement ? null : `${slot.label} must be a ${slot.requirement} instance`;
    default:
      return width === slot.requirement ? null : `${slot.label} needs a ${slot.requirement} address, got ${width}`;
  }
}

/** Returns a copy of `node` with `text` written into the slot. Callers must validate first. */
export function writeSlot(node: LadNode, key: SlotKey, text: string): LadNode {
  const value = text.trim().toUpperCase();
  switch (node.type) {
    case 'contact':
      return key === 'operand' ? { ...node, operand: value } : node;
    case 'coil':
      return node.variant !== 'MASTER' && key === 'target' ? { ...node, target: value } : node;
    case 'timer':
      if (key === 'instance') return { ...node, instance: value };
      return key === 'PT' ? { ...node, inputs: { ...node.inputs, PT: toOperand(text.trim()) } } : node;
    case 'counter':
      if (key === 'instance') return { ...node, instance: value };
      return key === 'PV' ? ({ ...node, inputs: { ...node.inputs, PV: toOperand(text.trim()) } } as LadNode) : node;
    case 'compare':
      if (key === 'lhs') return { ...node, lhs: toOperand(text.trim()) };
      return key === 'rhs' ? { ...node, rhs: toOperand(text.trim()) } : node;
    case 'math':
      if (key === 'out') return { ...node, out: value };
      if ('in1' in node) {
        if (key === 'in1') return { ...node, in1: toOperand(text.trim()) };
        return key === 'in2' ? { ...node, in2: toOperand(text.trim()) } : node;
      }
      return key === 'in' ? { ...node, in: toOperand(text.trim()) } : node;
    case 'wordLogic':
      if (key === 'out') return { ...node, out: value };
      if ('in1' in node) {
        if (key === 'in1') return { ...node, in1: toOperand(text.trim()) };
        return key === 'in2' ? { ...node, in2: toOperand(text.trim()) } : node;
      }
      return key === 'in' ? { ...node, in: toOperand(text.trim()) } : node;
    default:
      return node;
  }
}
