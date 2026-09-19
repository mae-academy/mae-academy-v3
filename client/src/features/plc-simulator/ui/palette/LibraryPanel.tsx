import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PANEL, PANEL_TITLE } from '../chrome';

export interface LibraryCategory<T> {
  readonly id: string;
  readonly label: string;
  readonly items: readonly T[];
}

export interface LibraryPanelProps<T> {
  categories: readonly LibraryCategory<T>[];
  /** Text a search query is matched against. */
  searchText: (item: T, category: LibraryCategory<T>) => string;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  ariaLabel: string;
  title?: string;
  className?: string;
}

/**
 * The component-library chrome shared by every palette: heading, search box and an accordion of
 * categories, in the same visual language as the analog and digital circuit simulators.
 */
export function LibraryPanel<T>({
  categories,
  searchText,
  itemKey,
  renderItem,
  ariaLabel,
  title = 'Component Library',
  className = '',
}: LibraryPanelProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string[]>(() => categories.map((category) => category.id));

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          items: needle ? category.items.filter((item) => searchText(item, category).toLowerCase().includes(needle)) : category.items,
        }))
        .filter((category) => category.items.length > 0),
    [categories, needle, searchText],
  );

  return (
    <nav aria-label={ariaLabel} className={`${PANEL} ${className}`}>
      <div className="shrink-0 border-b border-slate-200 px-3 py-2 dark:border-[#1a1d24]">
        <div className={PANEL_TITLE}>{title}</div>
      </div>
      <div className="shrink-0 border-b border-slate-200 p-2.5 dark:border-[#1a1d24]">
        <div className="relative">
          <Search aria-hidden="true" size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components"
            aria-label="Search components"
            className="w-full rounded-[7px] border border-slate-200 bg-slate-50 py-2 pe-2 ps-7 text-[11px] text-slate-900 outline-none focus:border-violet-500 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-100"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 pt-1">
        {visible.length === 0 && <p className="p-3 text-center text-[11px] text-slate-500 dark:text-slate-400">No components match your search</p>}
        <Accordion type="multiple" value={needle ? visible.map((category) => category.id) : open} onValueChange={(next) => !needle && setOpen(next)}>
          {visible.map((category) => (
            <AccordionItem key={category.id} value={category.id} className="border-b-0">
              <AccordionTrigger className="items-center py-2 ps-1.5 pe-1 text-xs font-bold uppercase tracking-wider text-slate-800 hover:no-underline dark:text-slate-400">
                {category.label}
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <div role="group" aria-label={category.label} className="grid grid-cols-2 gap-1.5 px-1">
                  {category.items.map((item) => (
                    <div key={itemKey(item)} className="contents">
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </nav>
  );
}

/** Class string of one draggable library tile; `armed` marks the entry waiting for a click on the canvas. */
export const tileClass = (armed: boolean): string =>
  `flex w-full cursor-grab flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] font-medium outline-none transition active:scale-[.98] active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-40 ${
    armed
      ? 'border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300'
      : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-[#1a1d24] dark:bg-[#090a0d] dark:text-slate-300 dark:hover:bg-[#13161c]'
  }`;
