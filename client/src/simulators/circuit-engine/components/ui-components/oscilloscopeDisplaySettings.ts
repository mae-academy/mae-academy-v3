/* Oscilloscope theme/channel-color/values preference: a viewer setting, like the app's own light/
   dark toggle — shared by every scope on the canvas, not saved into the circuit file. Lifted into a
   single hook call in Home.tsx and threaded to both oscilloscope panels as props, so a change in
   one is reflected in the other immediately rather than only after a reload. */
import { useState } from 'react';

export type AcquisitionMode = 'live' | 'step';

export interface OscilloscopeDisplaySettings {
  isDarkMode: boolean;
  showValues: boolean;
  channelColors: [string, string, string, string];
  acquisitionMode?: AcquisitionMode;
}

const STORAGE_KEY = 'mae-oscilloscope-display-settings';

// CH1/CH2/CH3 mirror the R/Y/B convention a 3-phase line uses elsewhere in the industry; CH4 takes
// the app's own accent purple.
export const DARK_CHANNEL_COLORS: [string, string, string, string] = ['#EF4444', '#EAB308', '#3B82F6', '#A855F7'];
export const LIGHT_CHANNEL_COLORS: [string, string, string, string] = ['#EF4444', '#EAB308', '#3B82F6', '#A855F7'];

export const DEFAULT_DISPLAY_SETTINGS: OscilloscopeDisplaySettings = {
  isDarkMode: true,
  showValues: true,
  channelColors: DARK_CHANNEL_COLORS,
  acquisitionMode: 'live',
};

function readSettings(): OscilloscopeDisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<OscilloscopeDisplaySettings>;
    const channelColors = Array.isArray(parsed.channelColors) && parsed.channelColors.length === 4
      ? (parsed.channelColors as [string, string, string, string])
      : DEFAULT_DISPLAY_SETTINGS.channelColors;
    return {
      isDarkMode: Boolean(parsed.isDarkMode ?? true),
      showValues: Boolean(parsed.showValues ?? true),
      channelColors,
      acquisitionMode: parsed.acquisitionMode === 'step' ? 'step' : 'live',
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function useOscilloscopeDisplaySettings(): [OscilloscopeDisplaySettings, (next: Partial<OscilloscopeDisplaySettings>) => void] {
  const [settings, setSettings] = useState<OscilloscopeDisplaySettings>(() => {
    try {
      return readSettings();
    } catch {
      return DEFAULT_DISPLAY_SETTINGS;
    }
  });

  const update = (next: Partial<OscilloscopeDisplaySettings>) => {
    setSettings(current => {
      const merged = { ...current, ...next };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Private window / storage disabled — the setting just won't survive a reload.
      }
      return merged;
    });
  };

  return [settings, update];
}
