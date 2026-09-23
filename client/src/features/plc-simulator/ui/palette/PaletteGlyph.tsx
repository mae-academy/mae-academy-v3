import type { PaletteItem } from './catalog';
import { CoilSymbol } from '../canvas/components/symbols/CoilSymbol';
import { CompareSymbol } from '../canvas/components/symbols/CompareSymbol';
import { ContactSymbol } from '../canvas/components/symbols/ContactSymbol';
import { BOX_FILL, CANVAS_FONT_FAMILY, TEXT_ADDRESS, WIRE_IDLE } from '../canvas/components/symbols/theme';

/** Miniature of what an item looks like once placed, drawn by the same symbol components. */
export function PaletteGlyph({ item }: { item: PaletteItem }) {
  const y = 22;
  let glyph;
  switch (item.id) {
    case 'contact-no':
    case 'contact-nc':
    case 'contact-p':
    case 'contact-n':
      glyph = (
        <ContactSymbol
          x={0}
          y={y}
          variant={item.id === 'contact-no' ? 'NO' : item.id === 'contact-nc' ? 'NC' : item.id === 'contact-p' ? 'P' : 'N'}
          flowIn={false}
          flowOut={false}
          closed={false}
        />
      );
      break;
    case 'coil-out':
    case 'coil-set':
    case 'coil-reset':
      glyph = (
        <CoilSymbol
          x={0}
          y={y}
          variant={item.id === 'coil-out' ? 'OUT' : item.id === 'coil-set' ? 'SET' : 'RESET'}
          glyph={item.id === 'coil-set' ? 'S' : item.id === 'coil-reset' ? 'R' : undefined}
          flowIn={false}
          flowOut={false}
          active={false}
        />
      );
      break;
    default:
      glyph =
        item.category === 'compare' ? (
          <CompareSymbol
            nodeId=""
            x={0}
            y={y}
            op={item.label as '=='}
            dataType="INT"
            lhs=""
            rhs=""
            flowIn={false}
            flowOut={false}
          />
        ) : (
          <g>
            <rect x={14} y={6} width={72} height={32} rx={2} strokeWidth={2} className={`${BOX_FILL} ${WIRE_IDLE}`} />
            <text
              x={50}
              y={26}
              textAnchor="middle"
              fontFamily={CANVAS_FONT_FAMILY}
              fontSize={11}
              fontWeight={600}
              className={`font-sans ${TEXT_ADDRESS}`}
            >
              {item.label}
            </text>
          </g>
        );
  }
  return (
    <svg viewBox="0 0 100 44" width={64} height={28} aria-hidden="true" focusable="false" className="shrink-0">
      {glyph}
    </svg>
  );
}
