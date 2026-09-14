/* Unified 2x3 grid of oscilloscope viewer-preference controls:
   Row 1: [Col 1] Screen Theme Toggle (Dark / Light)
          [Col 2] CH1 Color Swatch Trigger (Default: Red #EF4444)
          [Col 3] CH2 Color Swatch Trigger (Default: Yellow/Amber #EAB308)
   Row 2: [Col 1] Graph Values Toggle (Show Values / Hide Values)
          [Col 2] CH3 Color Swatch Trigger (Default: Blue #3B82F6)
          [Col 3] CH4 Color Swatch Trigger (Default: Purple #A855F7)
   Adheres to MAE Academy design system: h-8 (32px), rounded-xl, no raw hex strings, no reset all controls button, full-bleed swatch buttons. */
import { useRef } from 'react';
import type { OscilloscopeDisplaySettings } from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';

type PanelColors = { line: string; subtle: string; muted: string; panel?: string; panelAlt?: string };

const DEFAULT_PALETTE: [string, string, string, string] = ['#EF4444', '#EAB308', '#3B82F6', '#A855F7'];

export function OscilloscopeControlsGrid({
  colors,
  settings,
  onChange,
}: {
  colors: PanelColors;
  settings: OscilloscopeDisplaySettings;
  onChange: (next: Partial<OscilloscopeDisplaySettings>) => void;
}) {
  const setChannelColor = (index: number, color: string) => {
    const next = [...settings.channelColors] as [string, string, string, string];
    next[index] = color;
    onChange({ channelColors: next });
  };

  return (
    <div className="mt-3 pt-2.5 border-t w-full max-w-full box-border" style={{ borderColor: colors.line }}>
      <div
        className="text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase mb-2"
      >
        Display
      </div>

      {/* 2-row x 3-column unified control grid with container fit & width constraints */}
      <div className="w-full max-w-full grid grid-cols-3 gap-2 box-border">
        {/* Row 1, Col 1: Theme Toggle Button */}
        <button
          type="button"
          onClick={() => onChange({ isDarkMode: !settings.isDarkMode })}
          className={`h-8 w-full rounded-xl text-[12px] font-medium transition-all cursor-pointer flex items-center justify-center px-1 truncate ${
            settings.isDarkMode
              ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-rose-500 text-white border-transparent shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title={`Screen theme: ${settings.isDarkMode ? 'Dark' : 'Light'}`}
        >
          {settings.isDarkMode ? 'Dark' : 'Light'}
        </button>

        {/* Row 1, Col 2: CH1 Color Swatch Trigger */}
        <ChannelColorTrigger
          label="CH1"
          color={settings.channelColors[0] || DEFAULT_PALETTE[0]}
          onChange={c => setChannelColor(0, c)}
        />

        {/* Row 1, Col 3: CH2 Color Swatch Trigger */}
        <ChannelColorTrigger
          label="CH2"
          color={settings.channelColors[1] || DEFAULT_PALETTE[1]}
          onChange={c => setChannelColor(1, c)}
        />

        {/* Row 2, Col 1: Values Toggle Button */}
        <button
          type="button"
          onClick={() => onChange({ showValues: !settings.showValues })}
          className={`h-8 w-full rounded-xl text-[12px] font-medium transition-all cursor-pointer flex items-center justify-center px-1 truncate ${
            settings.showValues
              ? 'bg-gradient-to-r from-blue-600 via-purple-600 to-rose-500 text-white border-transparent shadow-sm'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title="Toggle visibility of on-screen measurement values"
        >
          {settings.showValues ? 'Show Values' : 'Hide Values'}
        </button>

        {/* Row 2, Col 2: CH3 Color Swatch Trigger */}
        <ChannelColorTrigger
          label="CH3"
          color={settings.channelColors[2] || DEFAULT_PALETTE[2]}
          onChange={c => setChannelColor(2, c)}
        />

        {/* Row 2, Col 3: CH4 Color Swatch Trigger */}
        <ChannelColorTrigger
          label="CH4"
          color={settings.channelColors[3] || DEFAULT_PALETTE[3]}
          onChange={c => setChannelColor(3, c)}
        />
      </div>
    </div>
  );
}

function ChannelColorTrigger({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="relative h-8 w-full rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner flex items-center justify-center cursor-pointer transition-transform hover:scale-[1.02] overflow-hidden"
      style={{ backgroundColor: color }}
      title={`Set ${label} color`}
      aria-label={`${label} color picker`}
    >
      <span className="text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] pointer-events-none select-none">
        {label}
      </span>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </button>
  );
}
