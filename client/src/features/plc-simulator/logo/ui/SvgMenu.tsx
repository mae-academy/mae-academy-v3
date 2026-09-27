import { useEffect, useRef, type KeyboardEvent } from 'react';
import { VIEW } from './geometry';
import { LAMP_COLORS, type LampColor } from '../hardware/devices';

export interface MenuOption {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
}

export interface SvgMenuProps {
  /** Preferred top-left corner; the menu is nudged back inside the bench. */
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly options: readonly MenuOption[];
  readonly lampColor?: LampColor;
  readonly onPick: (id: string) => void;
  readonly onPickLampColor?: (color: LampColor) => void;
  readonly onClose: () => void;
}

const WIDTH = 204;
const HEAD = 24;
const ROW = 24;
const COLOR_SECTION_HEIGHT = 46;

/**
 * Popover menu drawn inside the bench SVG, so it needs no portal and scales with the schematic.
 * A transparent backdrop closes it on outside click; arrows move focus, Enter / Space pick, Esc closes.
 */
export function SvgMenu({ x, y, title, options, lampColor, onPick, onPickLampColor, onClose }: SvgMenuProps) {
  const root = useRef<SVGGElement>(null);
  const colorSecH = lampColor !== undefined && onPickLampColor ? COLOR_SECTION_HEIGHT : 0;
  const height = HEAD + options.length * ROW + 8 + colorSecH;
  const left = Math.max(8, Math.min(VIEW.w - WIDTH - 8, x));
  const top = Math.max(8, Math.min(VIEW.h - height - 8, y));

  useEffect(() => {
    const items = root.current?.querySelectorAll<SVGGElement>('[role="menuitemradio"]');
    const active = Array.from(items ?? []).find((item) => item.getAttribute('aria-checked') === 'true');
    (active ?? items?.[0])?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<SVGGElement>): void => {
    const items = Array.from(root.current?.querySelectorAll<SVGGElement>('[role="menuitemradio"]') ?? []);
    const at = items.findIndex((item) => item === document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <g>
      <rect width={VIEW.w} height={VIEW.h} fill="transparent" onPointerDown={onClose} data-menu-backdrop="true" />
      <g ref={root} role="menu" aria-label={title} onKeyDown={onKeyDown} transform={`translate(${left} ${top})`}>
        <rect width={WIDTH} height={height} rx={8} strokeWidth={1.5} className="fill-white stroke-slate-300 dark:fill-[#0B0F17] dark:stroke-slate-800" />
        <text x={12} y={16} fontSize={9.5} fontWeight={800} letterSpacing={0.8} className="fill-slate-500 dark:fill-slate-400">
          {title.toUpperCase()}
        </text>
        {options.map((option, index) => (
          <g
            key={option.id}
            role="menuitemradio"
            aria-checked={option.active}
            aria-label={option.label}
            tabIndex={0}
            onClick={() => onPick(option.id)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onPick(option.id);
            }}
            transform={`translate(4 ${HEAD + index * ROW})`}
            className="group cursor-pointer outline-none"
          >
            <rect width={WIDTH - 8} height={ROW - 2} rx={5} className="fill-transparent group-hover:fill-slate-100 group-focus-visible:fill-slate-100 dark:group-hover:fill-slate-800 dark:group-focus-visible:fill-slate-800" />
            <circle cx={13} cy={(ROW - 2) / 2} r={4} fill="none" strokeWidth={1.25} className="stroke-slate-400 dark:stroke-slate-500" />
            {option.active && <circle cx={13} cy={(ROW - 2) / 2} r={2.25} className="fill-violet-600 dark:fill-violet-400" />}
            <text x={26} y={ROW / 2 + 2} fontSize={11} fontWeight={option.active ? 800 : 600} pointerEvents="none" className="fill-slate-900 dark:fill-slate-100">
              {option.label}
            </text>
          </g>
        ))}

        {lampColor !== undefined && onPickLampColor && (
          <g transform={`translate(0 ${HEAD + options.length * ROW + 20})`}>
            <line x1={8} y1={-10} x2={WIDTH - 8} y2={-10} strokeWidth={1} className="stroke-slate-200 dark:stroke-slate-800" />
            <text x={12} y={-1} fontSize={8.5} fontWeight={800} letterSpacing={0.8} className="fill-slate-500 dark:fill-slate-400">
              BULB COLOR
            </text>
            {LAMP_COLORS.map((c, i) => {
              const cx = 22 + i * 38;
              const cy = 14;
              const selected = c.id === lampColor;
              return (
                <g
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select ${c.label} lamp color`}
                  aria-pressed={selected}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPickLampColor(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    e.stopPropagation();
                    onPickLampColor(c.id);
                  }}
                  className="group cursor-pointer outline-none"
                >
                  {/* Generous 32x32 interactive touch/click target (r=16) */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={16}
                    fill="transparent"
                    pointerEvents="all"
                    className="cursor-pointer"
                  />
                  {/* Concentric socket housing ring */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="none"
                    strokeWidth={selected ? 2 : 1.25}
                    pointerEvents="none"
                    className={
                      selected
                        ? 'stroke-violet-600 dark:stroke-violet-400'
                        : 'stroke-slate-300 group-hover:stroke-slate-400 dark:stroke-slate-700 dark:group-hover:stroke-slate-500'
                    }
                  />
                  {/* Radial glow aura when selected */}
                  {selected && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={10}
                      fill={c.hex}
                      fillOpacity={0.25}
                      pointerEvents="none"
                    />
                  )}
                  {/* Concentric bulb circle: clickable with cursor-pointer */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={8.5}
                    fill={c.hex}
                    stroke={c.id === 'white' ? '#94A3B8' : '#00000020'}
                    strokeWidth={1}
                    className="cursor-pointer transition-opacity group-hover:opacity-90"
                  />
                </g>
              );
            })}
          </g>
        )}
      </g>
    </g>
  );
}
