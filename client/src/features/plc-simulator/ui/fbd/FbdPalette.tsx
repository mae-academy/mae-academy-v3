import type { DragEvent } from 'react';
import { LibraryPanel, tileClass, type LibraryCategory } from '../palette/LibraryPanel';
import { BlockGlyph } from './FbdSymbols';
import { CATEGORIES, KINDS, type FbdKind } from './model';

/** MIME type carrying an `FbdKind` during a drag from the library to the canvas. */
export const FBD_DRAG_TYPE = 'application/x-mae-fbd-block';

export interface FbdPaletteProps {
  armed: FbdKind | null;
  onActivate: (kind: FbdKind) => void;
  onDragStart: (kind: FbdKind) => void;
  onDragEnd: () => void;
  disabled?: boolean;
  className?: string;
}

const LIBRARY: readonly LibraryCategory<FbdKind>[] = CATEGORIES.map((category) => ({
  id: category.id,
  label: category.label,
  items: (Object.keys(KINDS) as FbdKind[]).filter((kind) => KINDS[kind].category === category.id),
}));

/** LOGO! function-block library: same accordion / search chrome as the ladder palette. */
export function FbdPalette({ armed, onActivate, onDragStart, onDragEnd, disabled = false, className = '' }: FbdPaletteProps) {
  const handleDragStart = (event: DragEvent<HTMLButtonElement>, kind: FbdKind): void => {
    event.dataTransfer.setData(FBD_DRAG_TYPE, kind);
    event.dataTransfer.setData('text/plain', KINDS[kind].label);
    event.dataTransfer.effectAllowed = 'copy';
    onDragStart(kind);
  };

  return (
    <LibraryPanel
      ariaLabel="Function block palette"
      categories={LIBRARY}
      searchText={(kind, category) => `${KINDS[kind].label} ${KINDS[kind].description} ${category.label}`}
      itemKey={(kind) => kind}
      className={className}
      renderItem={(kind) => {
        const isArmed = armed === kind;
        return (
          <button
            type="button"
            draggable={!disabled}
            disabled={disabled}
            aria-pressed={isArmed}
            aria-label={`${KINDS[kind].description}${isArmed ? ' (armed: click the canvas to place)' : ''}`}
            title={`${KINDS[kind].description}: drag onto the diagram, or click then click the canvas`}
            onClick={() => onActivate(kind)}
            onDragStart={(event) => handleDragStart(event, kind)}
            onDragEnd={onDragEnd}
            className={tileClass(isArmed)}
          >
            <BlockGlyph kind={kind} />
            <span className="font-sans font-medium text-[11px]">{KINDS[kind].label}</span>
          </button>
        );
      }}
    />
  );
}
