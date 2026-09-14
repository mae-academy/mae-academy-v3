/* Oscilloscope theme/channel-color preference: a viewer setting, like the app's own light/dark
   toggle — shared by every scope on the canvas, not saved into the circuit file. Lifted into a
   single hook call in Home.tsx and threaded to both oscilloscope panels as props, so a change in
   one is reflected in the other immediately rather than only after a reload. */
import { useState } from 'react';

export interface OscilloscopeDisplaySettings {
  isDarkMode: boolean;
  channelColors: [string, string, string, string];
}

const STORAGE_KEY = 'mae-oscilloscope-display-settings';

export const DARK_CHANNEL_COLORS: [string, string, string, string] = ['#38bdf8', '#f472b6', '#facc15', '#a78bfa'];
export const LIGHT_CHANNEL_COLORS: [string, string, string, string] = ['#0369a1', '#be185d', '#a16207', '#6d28d9'];

export const DEFAULT_DISPLAY_SETTINGS: OscilloscopeDisplaySettings = {
  isDarkMode: true,
  channelColors: DARK_CHANNEL_COLORS,
};

function readSettings(): OscilloscopeDisplaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<OscilloscopeDisplaySettings>;
    const channelColors = Array.isArray(parsed.channelColors) && parsed.channelColors.length === 4
      ? (parsed.channelColors as [string, string, string, string])
      : DEFAULT_DISPLAY_SETTINGS.channelColors;
    return { isDarkMode: Boolean(parsed.isDarkMode ?? true), channelColors };
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
