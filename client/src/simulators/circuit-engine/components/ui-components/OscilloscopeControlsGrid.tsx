/* Unified 2x3 grid of oscilloscope viewer-preference controls:
   Row 1: [Col 1] Screen Theme Toggle (Light / Dark)
          [Col 2] CH1 Color Button (Default: Red #EF4444)
          [Col 3] CH2 Color Button (Default: Yellow/Amber #EAB308)
   Row 2: [Col 1] Graph Values Toggle (Values: On / Values: Off)
          [Col 2] CH3 Color Button (Default: Blue #3B82F6)
          [Col 3] CH4 Color Button (Default: Purple #A855F7)
   Adheres to design system: 32px compact height, rounded-xl, clean borders, no emojis. */
import { useRef } from 'react';
import {
  DEFAULT_DISPLAY_SETTINGS,
  type OscilloscopeDisplaySettings,
} from '@/simulators/circuit-engine/components/ui-components/oscilloscopeDisplaySettings';

type PanelColors = { line: string; subtle: string; muted: string; panel?: string; panelAlt?: string };

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
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.line}` }}>
      <div
        className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-center"
        style={{ marginBottom: 8 }}
      >
        Display & Channels
      </div>

      {/* 2-row x 3-column unified control grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, 32px)',
          gap: 6,
        }}
      >
        {/* Row 1, Col 1: Screen Theme Toggle (Light / Dark) */}
        <button
          type="button"
          onClick={() => onChange({ isDarkMode: !settings.isDarkMode })}
          className="flex items-center justify-center h-8 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
          title={`Switch to ${settings.isDarkMode ? 'Light' : 'Dark'} mode`}
        >
          {settings.isDarkMode ? 'Dark' : 'Light'}
        </button>

        {/* Row 1, Col 2: CH1 Color */}
        <ChannelColorButton
          label="CH1"
          color={settings.channelColors[0]}
          onChange={c => setChannelColor(0, c)}
        />

        {/* Row 1, Col 3: CH2 Color */}
        <ChannelColorButton
          label="CH2"
          color={settings.channelColors[1]}
          onChange={c => setChannelColor(1, c)}
        />

        {/* Row 2, Col 1: Graph Values Toggle (Values: On / Values: Off) */}
        <button
          type="button"
          onClick={() => onChange({ showValues: !settings.showValues })}
          className={`flex items-center justify-center h-8 px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shadow-xs ${
            settings.showValues
              ? 'border-blue-500/40 bg-blue-50/60 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title="Toggle visibility of on-screen measurement values"
        >
          {settings.showValues ? 'Values: On' : 'Values: Off'}
        </button>

        {/* Row 2, Col 2: CH3 Color */}
        <ChannelColorButton
          label="CH3"
          color={settings.channelColors[2]}
          onChange={c => setChannelColor(2, c)}
        />

        {/* Row 2, Col 3: CH4 Color */}
        <ChannelColorButton
          label="CH4"
          color={settings.channelColors[3]}
          onChange={c => setChannelColor(3, c)}
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(DEFAULT_DISPLAY_SETTINGS)}
        className="w-full mt-2.5 h-7 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-bold text-[10.5px] uppercase tracking-wider hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors cursor-pointer flex items-center justify-center"
      >
        Reset Controls
      </button>
    </div>
  );
}

function ChannelColorButton({
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
      className="relative flex items-center justify-center gap-1.5 h-8 px-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shadow-xs"
      title={`Pick color for ${label}`}
    >
      <span
        className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 dark:border-white/20 shadow-xs"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
      <input
        ref={inputRef}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 pointer-events-none w-0 h-0"
        tabIndex={-1}
        aria-label={`${label} Color Picker`}
      />
    </button>
  );
}
