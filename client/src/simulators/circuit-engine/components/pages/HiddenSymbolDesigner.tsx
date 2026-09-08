import React, { useState, useRef } from "react";

type ElementType = "Line" | "Circle" | "Rectangle" | "Terminal" | "Polygon" | "Path";

interface BaseElement {
  id: string;
  type: ElementType;
  strokeWidth: number;
  stroke: string;
  fill: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  transform?: string;
}

interface LineElement extends BaseElement {
  type: "Line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isDashed: boolean;
}

interface CircleElement extends BaseElement {
  type: "Circle";
  cx: number;
  cy: number;
  r: number;
}

interface RectElement extends BaseElement {
  type: "Rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  isDashed: boolean;
}

interface TerminalElement extends BaseElement {
  type: "Terminal";
  x: number;
  y: number;
}

interface PolygonElement extends BaseElement {
  type: "Polygon";
  points: string;
}

interface PathElement extends BaseElement {
  type: "Path";
  d: string;
}

type CADElement = LineElement | CircleElement | RectElement | TerminalElement | PolygonElement | PathElement;

const generateId = () => Math.random().toString(36).substring(2, 9);
const snap = (v: number, step = 5) => Math.round(v / step) * step;

const getCentroid = (el: CADElement): { x: number, y: number } => {
  if (el.type === "Line") {
    const l = el as LineElement;
    return { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
  } else if (el.type === "Rectangle") {
    const r = el as RectElement;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  } else if (el.type === "Circle") {
    const c = el as CircleElement;
    return { x: c.cx, y: c.cy };
  } else if (el.type === "Polygon") {
    const p = el as PolygonElement;
    const pts = p.points.trim().split(/[\s,]+/).map(Number);
    if (pts.length < 2) return { x: 0, y: 0 };
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1] || 0; }
    return { x: cx / (pts.length / 2), y: cy / (pts.length / 2) };
  } else if (el.type === "Terminal") {
    const t = el as TerminalElement;
    return { x: t.x, y: t.y };
  }
  return { x: 0, y: 0 }; // Path requires bounding box, fallback to 0,0
};

export default function HiddenSymbolDesigner() {
  const [elements, setElements] = useState<CADElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  // Dragging states
  const [draggingEl, setDraggingEl] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<{ id: string; index: number } | null>(null);

  const [importText, setImportText] = useState("");
  const masterGRef = useRef<SVGGElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [autoCenterExport, setAutoCenterExport] = useState(true);
  const [snapStep, setSnapStep] = useState(5);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Helper to check if a color is considered dark/low-contrast in dark mode
  const isDarkTone = (color?: string): boolean => {
    if (!color) return false;
    const c = color.trim().toLowerCase();
    if (c === "#1a2744" || c === "#000000" || c === "black" || c === "#111827" || c === "#0f172a" || c === "#1e293b" || c === "currentcolor") {
      return true;
    }
    // Check rgb / hex brightness if hex #RRGGBB
    if (c.startsWith("#") && c.length === 7) {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      // perceptual luminance < 75
      if ((0.299 * r + 0.587 * g + 0.114 * b) < 75) return true;
    }
    return false;
  };

  const getVisualStroke = (stroke: string, isSelected: boolean) => {
    if (isSelected) return "#3b82f6";
    if (theme === 'dark' && isDarkTone(stroke)) {
      return "#93c5fd"; // elevated high-contrast soft blue/slate tone in dark mode
    }
    if (theme === 'light' && (stroke === "currentColor" || stroke === "#ffffff" || stroke === "white")) {
      return "#0f172a"; // clear contrast in light mode
    }
    return stroke;
  };

  const getVisualFill = (fill: string) => {
    if (!fill || fill === "none" || fill === "transparent") return fill;
    if (theme === 'dark' && isDarkTone(fill)) {
      return "#1e293b";
    }
    return fill;
  };

  // ==========================================
  // PAN & ZOOM LOGIC
  // ==========================================
  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = 1 - e.deltaY * 0.002;
    setZoom((z) => Math.min(Math.max(0.2, z * zoomFactor), 20));
  };

  const getCanvasPt = (clientX: number, clientY: number) => {
    if (!masterGRef.current) return { x: 0, y: 0 };
    const svg = masterGRef.current.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = masterGRef.current.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const step = e.shiftKey ? snapStep : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else return;

      e.preventDefault();
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== selectedId) return el;
          if (el.type === "Line") {
            const l = el as LineElement;
            return { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy };
          } else if (el.type === "Rectangle") {
            const r = el as RectElement;
            return { ...r, x: r.x + dx, y: r.y + dy };
          } else if (el.type === "Circle") {
            const c = el as CircleElement;
            return { ...c, cx: c.cx + dx, cy: c.cy + dy };
          } else if (el.type === "Polygon") {
            const p = el as PolygonElement;
            let i = 0;
            const updatedPts = p.points.replace(/-?\d+(\.\d+)?/g, (match) => {
              const val = Number(match) + (i % 2 === 0 ? dx : dy);
              i++;
              return String(val);
            });
            return { ...p, points: updatedPts };
          } else if (el.type === "Path") {
            const p = el as PathElement;
            const updatedD = p.d.replace(/([MLCSQT])([^a-zA-Z]+)/g, (match, cmd, args) => {
              const nums = args.trim().split(/[\s,]+/).map(Number);
              const shifted = nums.map((n: number, j: number) => n + (j % 2 === 0 ? dx : dy));
              return `${cmd} ${shifted.join(" ")} `;
            });
            return { ...p, d: updatedD };
          } else if (el.type === "Terminal") {
            const t = el as TerminalElement;
            return { ...t, x: t.x + dx, y: t.y + dy };
          }
          return el;
        })
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, snapStep]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      (e.target as Element).setPointerCapture(e.pointerId);
      return;
    }
    if ((e.target as SVGElement).id === "bg-grid") {
      setSelectedId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
      return;
    }

    const pt = getCanvasPt(e.clientX, e.clientY);
    const sx = snap(pt.x, 5);
    const sy = snap(pt.y, 5);

    if (draggingHandle) {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== draggingHandle.id) return el;
          if (el.transform) return el; // Disable handle dragging if transformed

          if (el.type === "Line") {
            const l = el as LineElement;
            if (draggingHandle.index === 0) return { ...l, x1: sx, y1: sy };
            if (draggingHandle.index === 1) return { ...l, x2: sx, y2: sy };
          } else if (el.type === "Rectangle") {
            const r = el as RectElement;
            if (draggingHandle.index === 0) {
              const newW = r.x + r.width - sx;
              const newH = r.y + r.height - sy;
              return { ...r, x: sx, y: sy, width: Math.max(5, newW), height: Math.max(5, newH) };
            }
            if (draggingHandle.index === 1) {
              const newW = sx - r.x;
              const newH = r.y + r.height - sy;
              return { ...r, width: Math.max(5, newW), y: sy, height: Math.max(5, newH) };
            }
            if (draggingHandle.index === 2) {
              const newW = sx - r.x;
              const newH = sy - r.y;
              return { ...r, width: Math.max(5, newW), height: Math.max(5, newH) };
            }
            if (draggingHandle.index === 3) {
              const newW = r.x + r.width - sx;
              const newH = sy - r.y;
              return { ...r, x: sx, width: Math.max(5, newW), height: Math.max(5, newH) };
            }
          } else if (el.type === "Circle") {
            const c = el as CircleElement;
            if (draggingHandle.index === 0) return { ...c, cx: sx, cy: sy };
            if (draggingHandle.index === 1) {
              const r = Math.max(5, snap(Math.hypot(sx - c.cx, sy - c.cy), 5));
              return { ...c, r };
            }
          } else if (el.type === "Polygon") {
            const p = el as PolygonElement;
            const pts = p.points.trim().split(/[\s,]+/).map(Number);
            const newPts = [...pts];
            if (draggingHandle.index * 2 + 1 < newPts.length) {
              newPts[draggingHandle.index * 2] = sx;
              newPts[draggingHandle.index * 2 + 1] = sy;
            }
            return { ...p, points: newPts.join(" ") };
          }
          return el;
        })
      );
    } else if (draggingEl) {
      setElements((prev) =>
        prev.map((el) => {
          if (el.id !== draggingEl.id) return el;
          const isTerm = el.type === "Terminal";
          const curX = snap(pt.x, isTerm ? 25 : snapStep);
          const curY = snap(pt.y, isTerm ? 25 : snapStep);
          const dx = curX - draggingEl.offsetX;
          const dy = curY - draggingEl.offsetY;

          if (dx !== 0 || dy !== 0) {
            setDraggingEl({ id: el.id, offsetX: curX, offsetY: curY });

            if (el.type === "Line") {
              const l = el as LineElement;
              return { ...l, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy };
            } else if (el.type === "Rectangle") {
              const r = el as RectElement;
              return { ...r, x: r.x + dx, y: r.y + dy };
            } else if (el.type === "Circle") {
              const c = el as CircleElement;
              return { ...c, cx: c.cx + dx, cy: c.cy + dy };
            } else if (el.type === "Polygon") {
              const p = el as PolygonElement;
              let i = 0;
              const updatedPts = p.points.replace(/-?\d+(\.\d+)?/g, (match) => {
                const val = Number(match) + (i % 2 === 0 ? dx : dy);
                i++;
                return String(val);
              });
              return { ...p, points: updatedPts };
            } else if (el.type === "Path") {
              const p = el as PathElement;
              const updatedD = p.d.replace(/([MLCSQT])([^a-zA-Z]+)/g, (match, cmd, args) => {
                const nums = args.trim().split(/[\s,]+/).map(Number);
                const shifted = nums.map((n: number, j: number) => n + (j % 2 === 0 ? dx : dy));
                return `${cmd} ${shifted.join(" ")} `;
              });
              return { ...p, d: updatedD };
            } else if (el.type === "Terminal") {
              const t = el as TerminalElement;
              return { ...t, x: t.x + dx, y: t.y + dy };
            }
          }
          return el;
        })
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setIsPanning(false);
    setDraggingEl(null);
    setDraggingHandle(null);
  };

  // ==========================================
  // ELEMENT ACTIONS
  // ==========================================
  const addElement = (type: ElementType) => {
    let newElement: CADElement;
    const baseProps = { id: generateId(), type, strokeWidth: 2, stroke: "#1a2744", fill: "none" };

    switch (type) {
      case "Line":
        newElement = { ...baseProps, type: "Line", x1: -50, y1: 0, x2: 50, y2: 0, isDashed: false } as LineElement;
        break;
      case "Circle":
        newElement = { ...baseProps, type: "Circle", cx: 0, cy: 0, r: 50 } as CircleElement;
        break;
      case "Rectangle":
        newElement = { ...baseProps, type: "Rectangle", x: -50, y: -25, width: 100, height: 50, rx: 0, isDashed: false } as RectElement;
        break;
      case "Terminal":
        newElement = { ...baseProps, type: "Terminal", x: 0, y: 0 } as TerminalElement;
        break;
      case "Polygon":
        newElement = { ...baseProps, type: "Polygon", points: "0,-50 50,50 -50,50" } as PolygonElement;
        break;
      case "Path":
        newElement = { ...baseProps, type: "Path", d: "M -50 0 L 50 0" } as PathElement;
        break;
      default: return;
    }
    setElements([...elements, newElement]);
    setSelectedId(newElement.id);
  };

  const deleteSelected = () => {
    if (selectedId) {
      setElements(elements.filter(e => e.id !== selectedId));
      setSelectedId(null);
    }
  };

  const updateSelected = (field: string, value: any) => {
    if (!selectedId) return;
    setElements(prev => prev.map(el => el.id === selectedId ? { ...el, [field]: value } as CADElement : el));
  };

  // ==========================================
  // PARSER & EXPORT
  // ==========================================
  const generateExportJSX = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const exportedEls = elements.filter(el => el.type !== 'Terminal');
    if (exportedEls.length === 0) return "<g>\n\n</g>";

    if (autoCenterExport) {
      exportedEls.forEach(el => {
        if (el.type === 'Line') {
          const l = el as LineElement;
          minX = Math.min(minX, l.x1, l.x2); maxX = Math.max(maxX, l.x1, l.x2);
          minY = Math.min(minY, l.y1, l.y2); maxY = Math.max(maxY, l.y1, l.y2);
        } else if (el.type === 'Rectangle') {
          const r = el as RectElement;
          minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.width);
          minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.height);
        } else if (el.type === 'Circle') {
          const c = el as CircleElement;
          minX = Math.min(minX, c.cx - c.r); maxX = Math.max(maxX, c.cx + c.r);
          minY = Math.min(minY, c.cy - c.r); maxY = Math.max(maxY, c.cy + c.r);
        } else if (el.type === 'Polygon') {
          const p = el as PolygonElement;
          const pts = p.points.trim().split(/[\s,]+/).map(Number);
          for (let i = 0; i < pts.length; i += 2) {
            if (!isNaN(pts[i])) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); }
            if (!isNaN(pts[i + 1])) { minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
          }
        } else if (el.type === 'Path') {
          const p = el as PathElement;
          const matches = Array.from(p.d.matchAll(/([MLCSQT])([^a-zA-Z]+)/g));
          matches.forEach(m => {
            const coords = m[2].trim().split(/[\s,]+/).map(Number);
            for (let i = 0; i < coords.length; i += 2) {
              if (!isNaN(coords[i])) { minX = Math.min(minX, coords[i]); maxX = Math.max(maxX, coords[i]); }
              if (!isNaN(coords[i + 1])) { minY = Math.min(minY, coords[i + 1]); maxY = Math.max(maxY, coords[i + 1]); }
            }
          });
        }
      });
    }

    const centerX = autoCenterExport && isFinite(minX) ? snap((minX + maxX) / 2, 5) : 0;
    const centerY = autoCenterExport && isFinite(minY) ? snap((minY + maxY) / 2, 5) : 0;

    const lines = exportedEls.map((el) => {
      let jsx = "";
      let propsArr = [];
      if (el.strokeWidth !== 2) propsArr.push(`strokeWidth={${el.strokeWidth}}`);
      if (el.stroke !== "currentColor" && el.stroke !== "#1a2744") propsArr.push(`stroke="${el.stroke}"`); // omit default or just include
      else propsArr.push(`stroke="${el.stroke}"`);

      if (el.fill !== "none") propsArr.push(`fill="${el.fill}"`);
      if (el.strokeLinecap) propsArr.push(`strokeLinecap="${el.strokeLinecap}"`);
      if (el.strokeLinejoin) propsArr.push(`strokeLinejoin="${el.strokeLinejoin}"`);
      if (el.transform) propsArr.push(`transform="${el.transform}"`);

      const props = propsArr.length > 0 ? " " + propsArr.join(" ") : "";

      if (el.type === "Line") {
        const l = el as LineElement;
        const dash = l.isDashed ? ' strokeDasharray="5,5"' : "";
        jsx = `<line x1={${l.x1 - centerX}} y1={${l.y1 - centerY}} x2={${l.x2 - centerX}} y2={${l.y2 - centerY}}${props}${dash} />`;
      } else if (el.type === "Circle") {
        const c = el as CircleElement;
        jsx = `<circle cx={${c.cx - centerX}} cy={${c.cy - centerY}} r={${c.r}}${props} />`;
      } else if (el.type === "Rectangle") {
        const r = el as RectElement;
        const dash = r.isDashed ? ' strokeDasharray="5,5"' : "";
        const rxProp = r.rx > 0 ? ` rx={${r.rx}}` : "";
        jsx = `<rect x={${r.x - centerX}} y={${r.y - centerY}} width={${r.width}} height={${r.height}}${rxProp}${props}${dash} />`;
      } else if (el.type === "Polygon") {
        const p = el as PolygonElement;
        const pts = p.points.trim().split(/[\s,]+/).map(Number);
        const newPts = [];
        for (let i = 0; i < pts.length; i += 2) {
          if (!isNaN(pts[i]) && !isNaN(pts[i + 1])) {
            newPts.push(`${pts[i] - centerX},${pts[i + 1] - centerY}`);
          }
        }
        jsx = `<polygon points="${newPts.join(" ")}"${props} />`;
      } else if (el.type === "Path") {
        const p = el as PathElement;
        const updatedD = p.d.replace(/([MLCSQT])([^a-zA-Z]+)/g, (match, cmd, args) => {
          const nums = args.trim().split(/[\s,]+/).map(Number);
          const shifted = nums.map((n: number, j: number) => n - (j % 2 === 0 ? centerX : centerY));
          return `${cmd} ${shifted.join(" ")} `;
        }).trim();
        jsx = `<path d="${updatedD}"${props} />`;
      }
      return `    ${jsx}`;
    });

    return `<g>\n${lines.join("\n")}\n  </g>`;
  };

  const handleImport = () => {
    const newElements: CADElement[] = [];
    const terminals = elements.filter(el => el.type === "Terminal");

    // Remove comments
    const cleanText = importText.replace(/{\/\*.*?\*\/}/g, '');

    const tagRegex = /<\/?(g|line|rect|circle|polygon|path)([^>]*)>/g;
    let match;
    const gStack: any[] = [];

    while ((match = tagRegex.exec(cleanText)) !== null) {
      const isClosing = match[0].startsWith("</");
      const type = match[1];
      const attrsStr = match[2];

      const getAttr = (attrs: string, name: string, def = NaN) => {
        const matchCurly = new RegExp(`${name}={(-?\\d+(?:\\.\\d+)?)}`).exec(attrs);
        if (matchCurly) return Number(matchCurly[1]);
        const matchQuote = new RegExp(`${name}="(-?\\d+(?:\\.\\d+)?)"`).exec(attrs);
        if (matchQuote) return Number(matchQuote[1]);
        return def;
      };

      const getStringAttr = (attrs: string, name: string, def = "") => {
        const matchQuote = new RegExp(`${name}="([^"]*)"`).exec(attrs);
        if (matchQuote) return matchQuote[1];
        const matchCurlyStr = new RegExp(`${name}={'([^']*)'}`).exec(attrs);
        if (matchCurlyStr) return matchCurlyStr[1];
        const matchCurlyVar = new RegExp(`${name}={([^}]*)}`).exec(attrs);
        if (matchCurlyVar) {
          let val = matchCurlyVar[1].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")) || (val.startsWith("`") && val.endsWith("`"))) {
            val = val.slice(1, -1);
          }
          return val;
        }
        return def;
      };

      if (type === "g") {
        if (isClosing) {
          gStack.pop();
        } else {
          gStack.push({
            transform: getStringAttr(attrsStr, "transform", ""),
            stroke: getStringAttr(attrsStr, "stroke", ""),
            strokeWidth: getAttr(attrsStr, "strokeWidth", NaN),
            fill: getStringAttr(attrsStr, "fill", ""),
            strokeLinecap: getStringAttr(attrsStr, "strokeLinecap", ""),
            strokeLinejoin: getStringAttr(attrsStr, "strokeLinejoin", "")
          });
        }
        continue;
      }

      if (isClosing) continue;

      let inheritedTransform = gStack.map(g => g.transform).filter(Boolean).join(" ");
      let localTransform = getStringAttr(attrsStr, "transform", "");
      let finalTransform = [inheritedTransform, localTransform].filter(Boolean).join(" ");

      let stroke = getStringAttr(attrsStr, "stroke", "");
      if (!stroke) stroke = gStack.map(g => g.stroke).filter(Boolean).pop() || "currentColor";

      let fill = getStringAttr(attrsStr, "fill", "");
      if (!fill) fill = gStack.map(g => g.fill).filter(Boolean).pop() || "none";

      let strokeWidth = getAttr(attrsStr, "strokeWidth", NaN);
      if (isNaN(strokeWidth)) {
        const sw = gStack.map(g => g.strokeWidth).filter(val => !isNaN(val)).pop();
        strokeWidth = sw !== undefined ? sw : 2;
      }

      let strokeLinecap = getStringAttr(attrsStr, "strokeLinecap", "");
      if (!strokeLinecap) strokeLinecap = gStack.map(g => g.strokeLinecap).filter(Boolean).pop() || "";

      let strokeLinejoin = getStringAttr(attrsStr, "strokeLinejoin", "");
      if (!strokeLinejoin) strokeLinejoin = gStack.map(g => g.strokeLinejoin).filter(Boolean).pop() || "";

      const baseProps = {
        id: generateId(),
        strokeWidth,
        stroke,
        fill,
        strokeLinecap,
        strokeLinejoin,
        transform: finalTransform
      };

      if (type === "line") {
        const isDashed = attrsStr.includes("strokeDasharray");
        newElements.push({ ...baseProps, type: "Line", x1: getAttr(attrsStr, "x1", 0), y1: getAttr(attrsStr, "y1", 0), x2: getAttr(attrsStr, "x2", 0), y2: getAttr(attrsStr, "y2", 0), isDashed } as LineElement);
      } else if (type === "rect") {
        const isDashed = attrsStr.includes("strokeDasharray");
        newElements.push({ ...baseProps, type: "Rectangle", x: getAttr(attrsStr, "x", 0), y: getAttr(attrsStr, "y", 0), width: getAttr(attrsStr, "width", 0), height: getAttr(attrsStr, "height", 0), rx: getAttr(attrsStr, "rx", 0), isDashed } as RectElement);
      } else if (type === "circle") {
        newElements.push({ ...baseProps, type: "Circle", cx: getAttr(attrsStr, "cx", 0), cy: getAttr(attrsStr, "cy", 0), r: getAttr(attrsStr, "r", 0) } as CircleElement);
      } else if (type === "polygon") {
        newElements.push({ ...baseProps, type: "Polygon", points: getStringAttr(attrsStr, "points", "") } as PolygonElement);
      } else if (type === "path") {
        newElements.push({ ...baseProps, type: "Path", d: getStringAttr(attrsStr, "d", "") } as PathElement);
      }
    }

    setElements([...terminals, ...newElements]);
    setImportText("");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateExportJSX());
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const sel = elements.find(e => e.id === selectedId);

  return (
    <div className={`fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none font-mono transition-colors duration-200 ${theme === 'dark' ? 'bg-[#0f172a] text-slate-100' : 'bg-[#f8fafc] text-slate-800'
      }`}>

      {/* Top Bar */}
      <div className={`h-12 flex items-center justify-between px-4 border-b shrink-0 transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
        <div className="flex items-center space-x-4">
          <h1 className={`text-sm font-bold tracking-widest ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
            MINI-CAD DESIGNER
          </h1>
          <div className={`h-4 w-px ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
          <div className="flex space-x-2">
            <button onClick={() => addElement("Line")} className={`px-3 py-1 text-xs rounded border transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}>Line</button>
            <button onClick={() => addElement("Rectangle")} className={`px-3 py-1 text-xs rounded border transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}>Rect</button>
            <button onClick={() => addElement("Circle")} className={`px-3 py-1 text-xs rounded border transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}>Circle</button>
            <button onClick={() => addElement("Polygon")} className={`px-3 py-1 text-xs rounded border transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}>Poly</button>
            <button onClick={() => addElement("Path")} className={`px-3 py-1 text-xs rounded border transition-colors ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}>Path</button>
            <button onClick={() => addElement("Terminal")} className="px-3 py-1 bg-red-900/40 hover:bg-red-900/70 text-red-500 hover:text-red-400 font-bold text-xs rounded border border-red-500/50 transition-colors">Term</button>
          </div>
        </div>

        {/* Theme Toggle Button */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold border transition-all ${theme === 'dark'
              ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 9h-1m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span>Dark Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Middle Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Canvas Area */}
        <div className={`flex-1 relative overflow-hidden transition-colors ${theme === 'dark' ? 'bg-[#0b0f19]' : 'bg-[#ffffff]'
          }`}>

          <svg
            className="w-full h-full cursor-crosshair overflow-visible"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={e => e.preventDefault()}
          >
            <defs>
              <pattern id="square-grid" width={25 * zoom} height={25 * zoom} patternUnits="userSpaceOnUse"
                patternTransform={`translate(${pan.x + window.innerWidth / 2}, ${pan.y + window.innerHeight / 2})`}>
                <path
                  d={`M ${25 * zoom} 0 L 0 0 0 ${25 * zoom}`}
                  fill="none"
                  stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'}
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect id="bg-grid" width="100%" height="100%" fill="url(#square-grid)" />

            <g ref={masterGRef} transform={`translate(${window.innerWidth / 2 + pan.x}, ${window.innerHeight / 2 + pan.y}) scale(${zoom})`}>

              {/* Origin Crosshair */}
              <g opacity={theme === 'dark' ? "0.4" : "0.7"}>
                <line x1="-10000" y1="0" x2="10000" y2="0" stroke={theme === 'dark' ? '#ef4444' : '#dc2626'} strokeWidth={theme === 'dark' ? "2" : "2"} />
                <line x1="0" y1="-10000" x2="0" y2="10000" stroke={theme === 'dark' ? '#38bdf8' : '#2563eb'} strokeWidth={theme === 'dark' ? "2" : "2"} />
                <circle cx="0" cy="0" r="4" fill={theme === 'dark' ? '#ef4444' : '#dc2626'} />
              </g>

              {/* Elements */}
              <g className="text-gray-200">
                {elements.map((el) => {
                  const isSelected = selectedId === el.id;
                  const renderProps = {
                    stroke: el.stroke,
                    strokeWidth: el.strokeWidth,
                    fill: el.fill,
                    strokeLinecap: el.strokeLinecap as any,
                    strokeLinejoin: el.strokeLinejoin as any
                  };

                  let renderedTransform = el.transform;
                  if (renderedTransform && renderedTransform.match(/^rotate\(-?\d+(\.\d+)?\)$/)) {
                    const { x: cx, y: cy } = getCentroid(el);
                    renderedTransform = renderedTransform.replace(")", `, ${cx}, ${cy})`);
                  }

                  return (
                    <g key={el.id} className="focus:outline-none" transform={renderedTransform}>
                      {/* Interactive Element Body */}
                      <g
                        className="cursor-move"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          (e.target as Element).setPointerCapture(e.pointerId);
                          setSelectedId(el.id);
                          const pt = getCanvasPt(e.clientX, e.clientY);
                          const isTerm = el.type === "Terminal";
                          setDraggingEl({ id: el.id, offsetX: snap(pt.x, isTerm ? 25 : snapStep), offsetY: snap(pt.y, isTerm ? 25 : snapStep) });
                        }}
                      >
                        {/* Invisible Hitbox */}
                        <g stroke="transparent" strokeWidth="15" fill="transparent">
                          {el.type === "Line" && <line x1={(el as LineElement).x1} y1={(el as LineElement).y1} x2={(el as LineElement).x2} y2={(el as LineElement).y2} />}
                          {el.type === "Circle" && <circle cx={(el as CircleElement).cx} cy={(el as CircleElement).cy} r={(el as CircleElement).r} />}
                          {el.type === "Rectangle" && <rect x={(el as RectElement).x} y={(el as RectElement).y} width={(el as RectElement).width} height={(el as RectElement).height} />}
                          {el.type === "Polygon" && <polygon points={(el as PolygonElement).points} />}
                          {el.type === "Path" && <path d={(el as PathElement).d} />}
                        </g>

                        {/* Visible Render */}
                        {(() => {
                          const vStroke = getVisualStroke(el.stroke, isSelected);
                          const vFill = getVisualFill(el.fill);
                          const strokeProps = {
                            ...renderProps,
                            stroke: vStroke,
                            fill: vFill
                          };

                          if (el.type === "Line") {
                            const l = el as LineElement;
                            return <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} {...strokeProps} strokeDasharray={l.isDashed ? "5,5" : undefined} />;
                          }
                          if (el.type === "Circle") {
                            const c = el as CircleElement;
                            return <circle cx={c.cx} cy={c.cy} r={c.r} {...strokeProps} />;
                          }
                          if (el.type === "Rectangle") {
                            const r = el as RectElement;
                            return <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.rx} {...strokeProps} strokeDasharray={r.isDashed ? "5,5" : undefined} />;
                          }
                          if (el.type === "Polygon") {
                            const p = el as PolygonElement;
                            return <polygon points={p.points} {...strokeProps} />;
                          }
                          if (el.type === "Path") {
                            const p = el as PathElement;
                            return <path d={p.d} {...strokeProps} />;
                          }
                          if (el.type === "Terminal") {
                            const t = el as TerminalElement;
                            return <circle cx={t.x} cy={t.y} r="4" fill="white" stroke={isSelected ? "#ef4444" : (theme === 'dark' ? "#38bdf8" : "#111827")} strokeWidth="2" />;
                          }
                        })()}
                      </g>

                      {/* Drag Handles (Only if selected) */}
                      {isSelected && (
                        <g>
                          {el.type === "Line" && [
                            { i: 0, x: (el as LineElement).x1, y: (el as LineElement).y1 },
                            { i: 1, x: (el as LineElement).x2, y: (el as LineElement).y2 }
                          ].map(h => (
                            <circle key={h.i} cx={h.x} cy={h.y} r={6 / zoom} fill="#3b82f6" stroke="white" strokeWidth={2 / zoom} className="cursor-crosshair"
                              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDraggingHandle({ id: el.id, index: h.i }); }} />
                          ))}
                          {el.type === "Rectangle" && [
                            { i: 0, x: (el as RectElement).x, y: (el as RectElement).y },
                            { i: 1, x: (el as RectElement).x + (el as RectElement).width, y: (el as RectElement).y },
                            { i: 2, x: (el as RectElement).x + (el as RectElement).width, y: (el as RectElement).y + (el as RectElement).height },
                            { i: 3, x: (el as RectElement).x, y: (el as RectElement).y + (el as RectElement).height }
                          ].map(h => (
                            <rect key={h.i} x={h.x - 4 / zoom} y={h.y - 4 / zoom} width={8 / zoom} height={8 / zoom} fill="#3b82f6" stroke="white" strokeWidth={1 / zoom} className="cursor-crosshair"
                              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDraggingHandle({ id: el.id, index: h.i }); }} />
                          ))}
                          {el.type === "Circle" && [
                            { i: 0, x: (el as CircleElement).cx, y: (el as CircleElement).cy },
                            { i: 1, x: (el as CircleElement).cx + (el as CircleElement).r, y: (el as CircleElement).cy }
                          ].map(h => (
                            <circle key={h.i} cx={h.x} cy={h.y} r={5 / zoom} fill={h.i === 0 ? "#10b981" : "#3b82f6"} stroke="white" strokeWidth={2 / zoom} className="cursor-crosshair"
                              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDraggingHandle({ id: el.id, index: h.i }); }} />
                          ))}
                          {el.type === "Polygon" && (el as PolygonElement).points.trim().split(/[\s,]+/).map(Number).reduce<{ i: number, x: number, y: number }[]>((acc, val, idx, arr) => {
                            if (idx % 2 === 0 && !isNaN(val) && !isNaN(arr[idx + 1])) {
                              acc.push({ i: idx / 2, x: val, y: arr[idx + 1] });
                            }
                            return acc;
                          }, []).map(h => (
                            <circle key={h.i} cx={h.x} cy={h.y} r={5 / zoom} fill="#3b82f6" stroke="white" strokeWidth={2 / zoom} className="cursor-crosshair"
                              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); setDraggingHandle({ id: el.id, index: h.i }); }} />
                          ))}
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          <div className="absolute top-4 right-4 bg-slate-900/80 p-2 rounded text-xs border border-slate-700 pointer-events-none text-slate-300 shadow-md">
            Zoom: {Math.round(zoom * 100)}% | Pan: {Math.round(pan.x)}, {Math.round(pan.y)}
          </div>
        </div>

        {/* Properties Sidebar */}
        <div className={`w-80 border-l p-4 overflow-y-auto shrink-0 flex flex-col transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
          }`}>
          {sel ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className={`font-bold truncate pr-2 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                  Selected: {sel.type}
                </h3>
                <button onClick={deleteSelected} className="text-red-500 hover:bg-red-500/10 px-2 py-1 rounded text-xs border border-red-500/30 transition-colors">Delete</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Stroke Color</label>
                  <input type="text" value={sel.stroke} onChange={e => updateSelected("stroke", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                    }`} />
                </div>
                <div className="col-span-1">
                  <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Fill Color</label>
                  <input type="text" value={sel.fill} onChange={e => updateSelected("fill", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                    }`} />
                </div>

                <div className="col-span-1">
                  <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Stroke Width</label>
                  <input type="number" value={sel.strokeWidth} onChange={e => updateSelected("strokeWidth", Number(e.target.value))} className={`w-full rounded px-2 py-1.5 text-xs mt-1 outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                    }`} />
                </div>
                <div className="col-span-1">
                  <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Linejoin</label>
                  <input type="text" placeholder="miter, round" value={sel.strokeLinejoin || ""} onChange={e => updateSelected("strokeLinejoin", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                    }`} />
                </div>

                <div className="col-span-2">
                  <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Transform (e.g. translate, rotate)</label>
                  <input type="text" value={sel.transform || ""} onChange={e => updateSelected("transform", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 font-mono outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                    }`} />
                </div>

                {sel.type === "Path" && (
                  <div className="col-span-2">
                    <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Path Data (d)</label>
                    <textarea value={(sel as PathElement).d} onChange={e => updateSelected("d", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 font-mono h-24 outline-none transition-colors resize-none border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                      }`} />
                  </div>
                )}

                {sel.type === "Polygon" && (
                  <div className="col-span-2">
                    <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Points</label>
                    <textarea value={(sel as PolygonElement).points} onChange={e => updateSelected("points", e.target.value)} className={`w-full rounded px-2 py-1.5 text-xs mt-1 font-mono h-20 outline-none transition-colors resize-none border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                      }`} />
                  </div>
                )}

                {sel.type === "Line" && (
                  <div className={`col-span-2 flex items-center space-x-2 mt-2 p-2 rounded border ${theme === 'dark' ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}>
                    <input type="checkbox" checked={(sel as LineElement).isDashed} onChange={e => updateSelected("isDashed", e.target.checked)} className="rounded border-slate-700 accent-blue-500 w-4 h-4" />
                    <label className={`text-xs ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>Dashed Stroke</label>
                  </div>
                )}

                {sel.type === "Rectangle" && (
                  <>
                    <div className="col-span-2">
                      <label className={`text-[10px] uppercase tracking-wide font-bold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>Corner Radius (rx)</label>
                      <input type="number" value={(sel as RectElement).rx} onChange={e => updateSelected("rx", Number(e.target.value))} className={`w-full rounded px-2 py-1.5 text-xs mt-1 outline-none transition-colors border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-800 focus:border-blue-500'
                        }`} />
                    </div>
                    <div className={`col-span-2 flex items-center space-x-2 mt-2 p-2 rounded border ${theme === 'dark' ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-100 border-slate-200'
                      }`}>
                      <input type="checkbox" checked={(sel as RectElement).isDashed} onChange={e => updateSelected("isDashed", e.target.checked)} className="rounded border-slate-700 accent-blue-500 w-4 h-4" />
                      <label className={`text-xs ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>Dashed Stroke</label>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className={`flex flex-col items-center justify-center h-40 mt-10 space-y-3 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <p className="text-sm text-center">Select an element on the canvas to edit its properties.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Dock */}
      <div className={`h-40 border-t flex shrink-0 p-2 gap-2 transition-colors ${theme === 'dark' ? 'border-slate-800 bg-[#090d16]' : 'border-slate-200 bg-slate-100'
        }`}>
        {/* Export ReadOnly Area */}
        <div className={`flex-1 flex flex-col rounded-md border overflow-hidden transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
          <div className={`flex items-center justify-between p-2 border-b transition-colors ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
            }`}>
            <div className="flex items-center space-x-4">
              <label className="text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-500 flex items-center">
                <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Exported JSX
              </label>
              <label className={`flex items-center space-x-2 cursor-pointer px-2 py-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-200'
                }`}>
                <input type="checkbox" checked={autoCenterExport} onChange={e => setAutoCenterExport(e.target.checked)} className="rounded border-slate-700 bg-slate-800 accent-blue-500 w-3.5 h-3.5" />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Auto-Center Geometry</span>
              </label>
              <div className={`h-4 w-px mx-1 ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
              <label className="flex items-center space-x-2">
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>Snap:</span>
                <select value={snapStep} onChange={e => setSnapStep(Number(e.target.value))} className={`text-xs rounded px-1 py-0.5 outline-none border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                  }`}>
                  <option value={25}>25px</option>
                  <option value={5}>5px</option>
                  <option value={1}>1px</option>
                </select>
              </label>
            </div>
            <button
              onClick={handleCopy}
              className={`px-3 py-1 font-bold text-xs rounded transition-colors flex items-center ${isCopied
                ? "bg-emerald-500 text-white"
                : theme === 'dark' ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                }`}
            >
              {isCopied ? (
                <><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Copied!</>
              ) : (
                <><svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg> Copy JSX</>
              )}
            </button>
          </div>
          <textarea
            readOnly
            value={generateExportJSX()}
            className={`flex-1 w-full bg-transparent font-mono text-[11px] p-3 outline-none resize-none leading-relaxed ${theme === 'dark' ? 'text-emerald-400/90' : 'text-emerald-700'
              }`}
            placeholder="JSX will appear here..."
          />
        </div>

        {/* Import JSX Area */}
        <div className={`flex-1 flex flex-col rounded-md border overflow-hidden transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}>
          <div className={`flex items-center justify-between p-2 border-b transition-colors ${theme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
            }`}>
            <label className="text-xs uppercase font-bold tracking-wider text-blue-600 dark:text-blue-500 flex items-center">
              <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import JSX
            </label>
            <div className="flex space-x-2">
              <button
                onClick={() => setImportText("")}
                className={`px-2 py-1 text-[10px] uppercase font-bold transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
              >
                Clear
              </button>
              <button
                onClick={handleImport}
                className="px-3 py-1 font-bold text-xs rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
              >
                Import
              </button>
            </div>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className={`flex-1 w-full bg-transparent font-mono text-[11px] p-3 outline-none resize-none leading-relaxed transition-colors ${theme === 'dark' ? 'text-slate-300 focus:bg-slate-800/30' : 'text-slate-800 focus:bg-slate-50'
              }`}
            placeholder="Paste <g> ... </g> or <path> here to load..."
          />
        </div>
      </div>
    </div>
  );
}
