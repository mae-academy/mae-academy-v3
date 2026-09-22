/**
 * Unified Monaco & Code Editor Theme Configuration for MAE Academy
 * Enforces unified brand purple (#7C3AED in light, #A855F7 in dark)
 * across Code Studio, Arduino Studio, and PLC Simulator.
 */

export interface MonacoThemeRule {
  token: string;
  foreground?: string;
  fontStyle?: string;
}

export interface MonacoThemeData {
  base: 'vs' | 'vs-dark';
  inherit: boolean;
  rules: MonacoThemeRule[];
  colors: Record<string, string>;
}

export interface MonacoInstance {
  editor: {
    defineTheme: (name: string, theme: MonacoThemeData) => void;
  };
}

export const MAE_LIGHT_THEME: MonacoThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
    { token: 'keyword', foreground: '2563EB', fontStyle: 'bold' },
    { token: 'number', foreground: 'DC2626' },
    { token: 'string', foreground: '059669' },
    { token: 'type', foreground: '7C3AED' },
    { token: 'variable', foreground: '4338CA' },
  ],
  colors: {
    'editor.background': '#F8FAFC', // Slate-50 clean background
    'editor.foreground': '#0F172A',
    // Active line highlight: Soft purple tint instead of default yellow
    'editor.lineHighlightBackground': '#F1F5F9', // Subtle slate/purple tint
    'editor.lineHighlightBorder': '#E2E8F0',
    'editorLineNumber.foreground': '#94A3B8',
    'editorLineNumber.activeForeground': '#7C3AED', // Unified brand purple
    'editorGutter.background': '#F8FAFC',
    'editorCursor.foreground': '#7C3AED',
  },
};

export const MAE_DARK_THEME: MonacoThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
    { token: 'keyword', foreground: '60A5FA', fontStyle: 'bold' },
    { token: 'number', foreground: 'FB7185' },
    { token: 'string', foreground: '34D399' },
    { token: 'type', foreground: 'A855F7' },
    { token: 'variable', foreground: '818CF8' },
  ],
  colors: {
    'editor.background': '#0B0F19',
    'editor.foreground': '#F8FAFC',
    'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#A855F7',
    'editor.lineHighlightBackground': '#1E1B4B22',
    'editor.lineHighlightBorder': '#312E8144',
    'editorGutter.background': '#0B0F19',
    'editorCursor.foreground': '#A855F7',
  },
};

/** Shared Tailwind / CSS design tokens across all simulator code editors */
export const UNIFIED_EDITOR_COLORS = {
  brandPurpleLight: '#7C3AED',
  brandPurpleDark: '#A855F7',
  activeLineNumberClass: 'bg-violet-500/20 font-medium text-violet-700 dark:text-violet-300',
  activeLineCodeClass: 'bg-violet-100/40 text-slate-900 dark:bg-violet-500/15 dark:text-white',
  normalLineCodeClass: 'text-slate-800 dark:text-slate-200',
  normalLineNumberClass: 'text-slate-400 dark:text-slate-500',
  caretClass: '!caret-violet-500',
} as const;

/**
 * Register mae-light and mae-dark themes on any Monaco instance.
 */
export function registerUnifiedMonacoThemes(monaco?: MonacoInstance | any) {
  if (!monaco?.editor?.defineTheme) return;
  monaco.editor.defineTheme('mae-light', MAE_LIGHT_THEME);
  monaco.editor.defineTheme('mae-dark', MAE_DARK_THEME);
}
