import { useLayoutEffect, type RefObject } from 'react';

/**
 * Runtime self-check for KaTeX port labels. Every `<PortLabel target=…>` records the terminal it names
 * in `data-target` (SVG user units); the audit root is the label canvas (SVG plus its overlay). The audit measures where the typeset glyphs actually landed on
 * screen, converts back to user units and reports any label further than `radius` from its terminal:
 * a label that drifted off the hardware (late-loading fonts, a layout change, a wrong anchor).
 *
 * Additionally validates the `data-terminal-id` / `data-label-id` pairing: for each terminal anchor
 * element `[data-terminal-id]` that has a corresponding `[data-label-id]`, the rendered centre of
 * both must stay within the allowed radius.
 */

export const LABEL_RADIUS = 40;

export interface LabelViolation {
  readonly port: string;
  /** Distance from the terminal to the nearest edge of the rendered label, user units. */
  readonly distance: number;
}

export function auditPortLabels(root: Element, radius: number = LABEL_RADIUS): LabelViolation[] {
  // `root` is a LabelCanvas wrapper (SVG + label overlay) or, for a bare SVG, the SVG itself.
  const svg = root instanceof SVGSVGElement ? root : root.querySelector('svg');
  const ctm = svg?.getScreenCTM?.();
  if (!ctm || ctm.a === 0) return []; // not laid out (hidden, or no layout engine)
  const bad: LabelViolation[] = [];

  // 1. Original data-port / data-target audit.
  root.querySelectorAll<Element>('[data-port][data-target]').forEach((label) => {
    const [tx, ty] = (label.getAttribute('data-target') ?? '').split(',').map(Number);
    const glyphs = label.querySelector('.katex-html') ?? label;
    const box = glyphs.getBoundingClientRect();
    if (tx === undefined || ty === undefined || Number.isNaN(tx) || Number.isNaN(ty) || (box.width === 0 && box.height === 0)) return;
    // terminal in screen space
    const sx = ctm.a * tx + ctm.c * ty + ctm.e;
    const sy = ctm.b * tx + ctm.d * ty + ctm.f;
    const dx = Math.max(box.left - sx, 0, sx - box.right);
    const dy = Math.max(box.top - sy, 0, sy - box.bottom);
    const distance = Math.hypot(dx, dy) / Math.abs(ctm.a);
    if (distance > radius) bad.push({ port: label.getAttribute('data-port') ?? '?', distance });
  });

  // 2. data-terminal-id / data-label-id pairing audit. Only checks terminals that
  //    have a corresponding label element — screw sub-terminals (Q1.1, Q1.2) that
  //    intentionally share a parent label are silently skipped.
  root.querySelectorAll<Element>('[data-terminal-id]').forEach((anchor) => {
    const id = anchor.getAttribute('data-terminal-id');
    if (!id) return;
    const label = root.querySelector<Element>(`[data-port][data-label-id="${id}"]`) ?? root.querySelector<Element>(`[data-label-id="${id}"]`);
    if (!label) return; // no matching label — not an error, e.g. screw sub-terminals
    const anchorBox = anchor.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    if (anchorBox.width === 0 || labelBox.width === 0) return;
    const aCx = (anchorBox.left + anchorBox.right) / 2;
    const aCy = (anchorBox.top + anchorBox.bottom) / 2;
    const lDx = Math.max(labelBox.left - aCx, 0, aCx - labelBox.right);
    const lDy = Math.max(labelBox.top - aCy, 0, aCy - labelBox.bottom);
    const dist = Math.hypot(lDx, lDy) / Math.abs(ctm.a);
    // Only add if not already reported by the first pass.
    if (dist > radius && !bad.some((v) => v.port === id)) {
      bad.push({ port: id, distance: dist });
    }
  });

  return bad;
}

/**
 * Development-only observer: audits after layout, when the SVG is resized and once web fonts have
 * loaded, and logs a console warning (once per label) for every detached label.
 */
export function usePortLabelAudit(root: RefObject<Element | null>, scope: string): void {
  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const node = root.current;
    if (!node) return undefined;
    const seen = new Set<string>();
    let cancelled = false;
    const run = (): void => {
      if (cancelled) return;
      for (const { port, distance } of auditPortLabels(node)) {
        if (seen.has(port)) continue;
        seen.add(port);
        console.warn(
          `%c[${scope}] KaTeX label "${port}" is ${distance === Infinity ? 'MISSING' : `${distance.toFixed(1)} units`} from its terminal (limit ${LABEL_RADIUS}).`,
          'color: #ff0000; font-weight: bold',
        );
      }
    };
    run();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    observer?.observe(node);
    void document.fonts?.ready.then(run);
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  });
}
