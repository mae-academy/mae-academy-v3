import { EditorView } from "@codemirror/view";

function viewOf(content: Element): EditorView {
  const view = EditorView.findFromDOM(content as HTMLElement);
  if (!view) throw new Error("Element is not a CodeMirror content node");
  return view;
}

export function getEditorText(content: Element): string {
  return viewOf(content).state.doc.toString();
}

export function setEditorText(content: Element, text: string): void {
  const view = viewOf(content);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

// jsdom implements no layout, so CodeMirror's measure pass needs these Range geometry stubs.
if (typeof Range !== "undefined") {
  const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect ??= () => emptyRect as DOMRect;
  Range.prototype.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
}
