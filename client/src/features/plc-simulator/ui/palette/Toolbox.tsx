import type { DragEvent } from 'react';
import {
  anchorsToRail,
  PALETTE_CATEGORIES,
  PALETTE_DRAG_TYPE,
  type PaletteItem,
  type PaletteItemId,
} from './catalog';
import { LibraryPanel, tileClass, type LibraryCategory } from './LibraryPanel';
import { PaletteGlyph } from './PaletteGlyph';

export interface ToolboxProps {
  /** Entry waiting for a cell (armed by click) or being dragged. */
  armed: PaletteItemId | null;
  /**
   * Click / Enter on an entry. The host decides between placing it in the selected cell and
   * arming it for the next click.
   */
  onActivate: (item: PaletteItemId) => void;
  onDragStart: (item: PaletteItemId) => void;
  onDragEnd: () => void;
  disabled?: boolean;
  className?: string;
}

const CATEGORIES: readonly LibraryCategory<PaletteItem>[] = PALETTE_CATEGORIES;
const searchText = (item: PaletteItem, category: LibraryCategory<PaletteItem>): string =>
  `${item.label} ${item.description} ${category.label}`;

/** Ladder instruction library. Entries are draggable and also work by click / keyboard. */
export function Toolbox({ armed, onActivate, onDragStart, onDragEnd, disabled = false, className = '' }: ToolboxProps) {
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, item: PaletteItem): void => {
    event.dataTransfer.setData(PALETTE_DRAG_TYPE, item.id);
    event.dataTransfer.setData('text/plain', item.label);
    event.dataTransfer.effectAllowed = 'copy';
    onDragStart(item.id);
  };

  return (
    <LibraryPanel
      ariaLabel="Instruction palette"
      categories={CATEGORIES}
      searchText={searchText}
      itemKey={(item) => item.id}
      className={className}
      renderItem={(item) => {
        const isArmed = armed === item.id;
        return (
          <button
            type="button"
            draggable={!disabled}
            disabled={disabled}
            aria-label={item.description}
            title={`${item.description}${anchorsToRail(item.id) ? ' (snaps to the right rail)' : ''}: drag onto the ladder`}
            onClick={() => onActivate(item.id)}
            onDragStart={(event) => handleDragStart(event, item)}
            onDragEnd={onDragEnd}
            className={tileClass(isArmed)}
          >
            <PaletteGlyph item={item} />
            <span className="font-mono">{item.label}</span>
          </button>
        );
      }}
    />
  );
}

export default Toolbox;
