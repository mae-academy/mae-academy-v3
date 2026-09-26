import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  keymap,
  lineNumberMarkers,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";

export type LineSeverity = "error" | "warning";

export interface CodeEditorHandle {
  /** Selects the whole 1-based `line`, scrolls it into view and focuses the editor. */
  focusLine: (line: number) => void;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Language support; must be referentially stable (module constant or memoized). */
  language: Extension;
  activeLine?: number;
  onCursorLine?: (line: number) => void;
  lineSeverity?: ReadonlyMap<number, LineSeverity>;
  breakpoints?: readonly number[];
  onToggleBreakpoint?: (line: number) => void;
  ariaLabel: string;
  ref?: Ref<CodeEditorHandle>;
}

interface LineFlags {
  active: number;
  severity: ReadonlyMap<number, LineSeverity>;
  breakpoints: readonly number[];
}

const EMPTY_FLAGS: LineFlags = { active: 0, severity: new Map(), breakpoints: [] };
const setFlags = StateEffect.define<LineFlags>();

const flagsField = StateField.define<LineFlags>({
  create: () => EMPTY_FLAGS,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFlags)) return effect.value;
    return value;
  },
});

const activeLineMark = Decoration.line({ class: "cm-mae-active-line" });

const activeLineDecorations = EditorView.decorations.compute([flagsField, "doc"], (state): DecorationSet => {
  const { active } = state.field(flagsField);
  if (active < 1 || active > state.doc.lines) return Decoration.none;
  return Decoration.set([activeLineMark.range(state.doc.line(active).from)]);
});

class ClassMarker extends GutterMarker {
  constructor(cls: string) {
    super();
    this.elementClass = cls;
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof ClassMarker && other.elementClass === this.elementClass;
  }
}

const ACTIVE_MARKER = new ClassMarker("cm-mae-active-gutter");
const SEVERITY_MARKERS: Record<LineSeverity, ClassMarker> = {
  error: new ClassMarker("cm-mae-error-gutter"),
  warning: new ClassMarker("cm-mae-warning-gutter"),
};

const lineNumberClasses = lineNumberMarkers.compute([flagsField, "doc"], (state): RangeSet<GutterMarker> => {
  const { active, severity } = state.field(flagsField);
  const lines = new Map<number, ClassMarker>();
  if (active >= 1) lines.set(active, ACTIVE_MARKER);
  severity.forEach((level, line) => lines.set(line, SEVERITY_MARKERS[level]));
  const ranges = Array.from(lines.entries())
    .filter(([line]) => line >= 1 && line <= state.doc.lines)
    .sort(([a], [b]) => a - b)
    .map(([line, marker]) => marker.range(state.doc.line(line).from));
  return RangeSet.of(ranges);
});

class BreakpointMarker extends GutterMarker {
  constructor(private readonly set: boolean) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof BreakpointMarker && other.set === this.set;
  }
  override toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = this.set ? "cm-mae-bp-dot cm-mae-bp-set" : "cm-mae-bp-dot";
    return dot;
  }
}

const BP_SET = new BreakpointMarker(true);
const BP_EMPTY = new BreakpointMarker(false);

function breakpointGutter(onToggle: (line: number) => void): Extension {
  return gutter({
    class: "cm-mae-bp-gutter",
    lineMarker: (view, line) => {
      const number = view.state.doc.lineAt(line.from).number;
      return view.state.field(flagsField).breakpoints.includes(number) ? BP_SET : BP_EMPTY;
    },
    lineMarkerChange: update =>
      update.docChanged || update.transactions.some(tr => tr.effects.some(effect => effect.is(setFlags))),
    initialSpacer: () => BP_EMPTY,
    domEventHandlers: {
      mousedown(view, line) {
        onToggle(view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

const FONT_STACK = "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, 'Courier New', monospace";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    color: "var(--cm-fg)",
    backgroundColor: "var(--cm-bg)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: FONT_STACK, lineHeight: "22px", overflow: "auto" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--cm-caret)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cm-caret)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--cm-selection)" },
  ".cm-gutters": {
    backgroundColor: "var(--cm-gutter-bg)",
    color: "var(--cm-gutter-fg)",
    border: "none",
    borderRight: "1px solid var(--cm-gutter-border)",
    fontFamily: FONT_STACK,
  },
  ".cm-gutter.cm-lineNumbers .cm-gutterElement": {
    padding: "0 10px 0 6px",
    minWidth: "2.75em",
    fontSize: "12px",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-mae-active-line": { backgroundColor: "var(--cm-active-line)" },
  ".cm-gutterElement.cm-mae-active-gutter": {
    backgroundColor: "var(--cm-active-gutter-bg)",
    color: "var(--cm-active-gutter-fg)",
    fontWeight: "500",
  },
  ".cm-gutterElement.cm-mae-error-gutter": {
    backgroundColor: "var(--cm-error-gutter-bg)",
    color: "var(--cm-error-gutter-fg)",
    fontWeight: "500",
  },
  ".cm-gutterElement.cm-mae-warning-gutter": { color: "var(--cm-warning-gutter-fg)", fontWeight: "500" },
  ".cm-mae-bp-gutter": { width: "18px", cursor: "pointer" },
  ".cm-mae-bp-gutter .cm-gutterElement": { display: "flex", alignItems: "center", justifyContent: "center", padding: "0" },
  ".cm-mae-bp-dot": { width: "8px", height: "8px", borderRadius: "9999px", border: "1px solid transparent", boxSizing: "border-box" },
  ".cm-mae-bp-gutter .cm-gutterElement:hover .cm-mae-bp-dot": { borderColor: "var(--cm-gutter-fg)" },
  ".cm-mae-bp-dot.cm-mae-bp-set": { backgroundColor: "#f43f5e", borderColor: "#f43f5e" },
});

const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--cm-comment)", fontStyle: "italic" },
  { tag: [t.string, t.special(t.string), t.character], color: "var(--cm-string)" },
  { tag: [t.number, t.integer, t.float], color: "var(--cm-number)" },
  { tag: [t.controlKeyword], color: "var(--cm-control)" },
  {
    tag: [t.keyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.modifier, t.typeName, t.self, t.bool, t.null],
    color: "var(--cm-keyword)",
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.standard(t.variableName)], color: "var(--cm-function)" },
  { tag: [t.meta, t.processingInstruction, t.annotation], color: "var(--cm-meta)" },
]);

export function CodeEditor({
  value,
  onChange,
  language,
  activeLine = 0,
  onCursorLine,
  lineSeverity,
  breakpoints,
  onToggleBreakpoint,
  ariaLabel,
  ref,
}: CodeEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onCursorLine, onToggleBreakpoint });
  callbacks.current = { onCursorLine, onToggleBreakpoint };

  const flags = useMemo<LineFlags>(
    () => ({ active: activeLine, severity: lineSeverity ?? EMPTY_FLAGS.severity, breakpoints: breakpoints ?? EMPTY_FLAGS.breakpoints }),
    [activeLine, lineSeverity, breakpoints]
  );
  const flagsRef = useRef(flags);
  flagsRef.current = flags;

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setFlags.of(flags) });
  }, [flags]);

  useImperativeHandle(
    ref,
    () => ({
      focusLine(line) {
        const view = viewRef.current;
        if (!view) return;
        const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
        view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
        view.focus();
      },
    }),
    []
  );

  const hasBreakpoints = onToggleBreakpoint !== undefined;
  const extensions = useMemo<Extension[]>(
    () => [
      flagsField,
      activeLineDecorations,
      lineNumberClasses,
      ...(hasBreakpoints ? [breakpointGutter(line => callbacks.current.onToggleBreakpoint?.(line))] : []),
      lineNumbers({ formatNumber: n => String(n).padStart(2, "0") }),
      keymap.of([indentWithTab]),
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        spellcheck: "false",
        autocapitalize: "off",
        autocorrect: "off",
      }),
      EditorView.updateListener.of(update => {
        if (!update.selectionSet && !update.docChanged) return;
        callbacks.current.onCursorLine?.(update.state.doc.lineAt(update.state.selection.main.head).number);
      }),
      language,
    ],
    [language, hasBreakpoints, ariaLabel]
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f8fbff] select-text dark:bg-[#07080a]" dir="ltr">
      <CodeMirror
        value={value}
        onChange={onChange}
        height="100%"
        theme={[editorTheme, syntaxHighlighting(highlightStyle)]}
        extensions={extensions}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          closeBrackets: true,
          bracketMatching: true,
          history: true,
          indentOnInput: true,
        }}
        onCreateEditor={view => {
          viewRef.current = view;
          view.dispatch({ effects: setFlags.of(flagsRef.current) });
        }}
      />
    </div>
  );
}
