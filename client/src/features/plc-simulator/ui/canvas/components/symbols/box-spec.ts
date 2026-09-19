import type { LadNode } from '../../../../domain/ast';
import { LOGIC_SUFFIX } from '../../../../transpiler/types';
import { readSlot, type SlotKey } from '../../operand-slots';

/**
 * Describes how a functional block is drawn, independent of any rendering. Keeping this a pure
 * function of the AST node means the box layout can be tested without React or an SVG.
 */

export interface BoxPin {
  /** Row inside the box, 0 = the row the node sits on. */
  readonly row: number;
  readonly label: string;
  /** `pin`: power arriving at `pinIndex`; `out`: the box's own power output; `none`: label only. */
  readonly flow: 'pin' | 'out' | 'none';
  readonly pinIndex?: number;
}

export interface BoxLine {
  readonly label: string;
  readonly text: string;
  readonly slot?: SlotKey;
}

export interface BoxSpec {
  readonly title: string;
  /** Instance shown above the box (T37, C0). */
  readonly address?: { readonly text: string; readonly slot: SlotKey };
  readonly rowSpan: number;
  readonly left: readonly BoxPin[];
  readonly right: readonly BoxPin[];
  readonly lines: readonly BoxLine[];
  /** Memory word whose live value is appended as `<liveLabel> <value>`. */
  readonly live?: { readonly label: string; readonly address: string };
}

const TYPE_SUFFIX = { BYTE: 'I', INT: 'I', DINT: 'D', REAL: 'R' } as const;

const COUNTER_PINS = {
  CTU: ['CU', 'R'],
  CTD: ['CD', 'LD'],
  CTUD: ['CU', 'CD', 'R'],
} as const;

const line = (node: LadNode, label: string, slot: SlotKey): BoxLine => ({ label, text: readSlot(node, slot), slot });

export function boxSpecFor(node: LadNode): BoxSpec | null {
  const rowSpan = node.layout.rowSpan;
  const enoOut: BoxPin = { row: 0, label: 'ENO', flow: 'out' };

  switch (node.type) {
    case 'timer':
      return {
        title: node.fn,
        address: { text: node.instance, slot: 'instance' },
        rowSpan,
        left: [{ row: 0, label: 'IN', flow: 'pin', pinIndex: 0 }],
        right: [enoOut, ...(rowSpan >= 2 ? [{ row: rowSpan - 1, label: 'Q', flow: 'none' as const }] : [])],
        lines: [line(node, 'PT', 'PT')],
        live: { label: 'ET', address: node.instance },
      };

    case 'counter':
      return {
        title: node.fn,
        address: { text: node.instance, slot: 'instance' },
        rowSpan,
        left: COUNTER_PINS[node.fn].map((label, index) => ({ row: index, label, flow: 'pin' as const, pinIndex: index })),
        right: [enoOut],
        lines: [line(node, 'PV', 'PV')],
        live: { label: 'CV', address: node.instance },
      };

    case 'math': {
      const binary = 'in1' in node;
      const title = binary
        ? `${node.fn}_${TYPE_SUFFIX[node.dataType]}`
        : node.fn === 'SQR'
          ? 'SQRT'
          : 'SIN';
      return {
        title,
        rowSpan,
        left: [{ row: 0, label: 'EN', flow: 'pin', pinIndex: 0 }],
        right: [enoOut],
        lines: binary
          ? [line(node, 'IN1', 'in1'), line(node, 'IN2', 'in2'), line(node, 'OUT', 'out')]
          : [line(node, 'IN', 'in'), line(node, 'OUT', 'out')],
      };
    }

    case 'wordLogic': {
      const stem = node.fn === 'W_AND' ? 'WAND' : node.fn === 'W_OR' ? 'WOR' : 'WXOR';
      return {
        title: `${stem}_${LOGIC_SUFFIX[node.width]}`,
        rowSpan,
        left: [{ row: 0, label: 'EN', flow: 'pin', pinIndex: 0 }],
        right: [enoOut],
        lines: [line(node, 'IN1', 'in1'), line(node, 'IN2', 'in2'), line(node, 'OUT', 'out')],
      };
    }

    default:
      return null;
  }
}
