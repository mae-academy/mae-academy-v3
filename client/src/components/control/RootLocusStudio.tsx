import React, { useEffect, useRef, useState, useMemo } from "react";
import { findPolynomialRoots, simulateLtiStepResponse, findBreakawayPoints, complexAdd, complexSub, complexMul, complexDiv, complexMag, polyDeriv, evalPolyComplex, generateFlawlessRootLocus, type Complex } from "../../lib/controlMath";
import { TransferFunctionInput, TransferFunctionData } from "./TransferFunctionInput";
import { RootLocusStepsPanel } from "./RootLocusStepsPanel";
import { KatexMath } from "../ui/KatexMath";
import { BrandSlider } from "@/components/ui/BrandSlider";

export function RootLocusStudio() {
  const locusCanvasRef = useRef<HTMLCanvasElement>(null);
  const stepCanvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => document.documentElement.classList.contains("dark") ? "dark" : "light");

  // New-site shell adaptation only: retain the legacy canvas palette behavior while observing MAE's existing dark-mode class.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(root.classList.contains("dark") ? "dark" : "light"));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  
  // Dual-mode transfer function state
  const [tfData, setTfData] = useState<TransferFunctionData>({
    mode: "polynomial",
    numPoly: [1],
    denPoly: [1, 3, 2, 0],
    zpk: { k: 1, z: "", p: "0, -1, -2" },
    polyStr: { num: "1", den: "1 3 2 0" }
  });

  const [gainK, setGainK] = useState(1);
  const [kMin, setKMin] = useState(0.01);
  const [kMax, setKMax] = useState(100);
  const [maxTime, setMaxTime] = useState(10.0);
  const [gridMode, setGridMode] = useState<'cartesian' | 'polar'>('cartesian');

  // Viewport state for pan/zoom
  const [viewport, setViewport] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });

  const [tooltip, setTooltip] = useState<{ x: number, y: number, pointX?: number, pointY?: number, s: Complex, wn: number, zeta: number, theta: number } | null>(null);
  const animationRef = useRef<{ step: string | null, progress: number, startTime: number }>({ step: null, progress: 0, startTime: 0 });
  const reqFrameRef = useRef<number | null>(null);

  const drawCanvas = () => {
    const canvas = locusCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Check if resize is needed
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    
    ctx.save();
    ctx.scale(dpr, dpr);
    
    const w = rect.width;
    const h = rect.height;
    const isDark = theme === "dark";

    ctx.fillStyle = isDark ? "#0f172a" : "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    const { xMin, xMax, yMin, yMax } = plotLimits;
    const vp = viewport; // capture for closure

    // Viewport-aware coordinate mapping
    const toX = (re: number) => ((re - xMin) / (xMax - xMin)) * w * vp.scale + vp.offsetX;
    const toY = (im: number) => (h - ((im - yMin) / (yMax - yMin)) * h) * vp.scale + vp.offsetY;

    // Apply strict canvas clip for Asymptotes and Branches
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // ── GRID ──────────────────────────────────────────────────────────────────
    // Compute which math-space region is currently visible (dynamic bounds)
    const visXMin = xMin + (0 - vp.offsetX) / (w * vp.scale) * (xMax - xMin);
    const visXMax = xMin + (w - vp.offsetX) / (w * vp.scale) * (xMax - xMin);
    const visYMax = yMin + (1 - (0 - vp.offsetY) / (h * vp.scale)) * (yMax - yMin);
    const visYMin = yMin + (1 - (h - vp.offsetY) / (h * vp.scale)) * (yMax - yMin);

    if (gridMode === 'cartesian') {
      // Dynamic Cartesian grid – step size chosen so we always have 6-15 lines
      const rawSpanX = visXMax - visXMin;
      const rawSpanY = visYMax - visYMin;
      const niceStep = (span: number) => {
        const rough = span / 10;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
      };
      const stepX = niceStep(rawSpanX);
      const stepY = niceStep(rawSpanY);

      // Grid lines
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(visXMin / stepX) * stepX; x <= visXMax + stepX; x += stepX) {
        ctx.moveTo(toX(x), 0); ctx.lineTo(toX(x), h);
      }
      for (let y = Math.ceil(visYMin / stepY) * stepY; y <= visYMax + stepY; y += stepY) {
        ctx.moveTo(0, toY(y)); ctx.lineTo(w, toY(y));
      }
      ctx.stroke();

      // Axes
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, toY(0)); ctx.lineTo(w, toY(0));
      ctx.moveTo(toX(0), 0); ctx.lineTo(toX(0), h);
      ctx.stroke();

      // Ticks / labels
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.72)";
      ctx.font = "italic 10px 'KaTeX_Math', 'Times New Roman', Georgia, serif";
      const dp = stepX < 1 ? Math.ceil(-Math.log10(stepX)) : 0;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let x = Math.ceil(visXMin / stepX) * stepX; x <= visXMax + stepX; x += stepX) {
        const sx = toX(x);
        if (Math.abs(x) > stepX * 0.01)
          ctx.fillText(x.toFixed(dp), sx, Math.max(4, Math.min(h - 16, toY(0) + 4)));
      }
      const dpY = stepY < 1 ? Math.ceil(-Math.log10(stepY)) : 0;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let y = Math.ceil(visYMin / stepY) * stepY; y <= visYMax + stepY; y += stepY) {
        const sy = toY(y);
        if (Math.abs(y) > stepY * 0.01)
          ctx.fillText(y.toFixed(dpY) + 'j', Math.min(w - 4, Math.max(36, toX(0) - 4)), sy);
      }
    } else {
      // ── POLAR GRID (constant ωn circles + constant ζ lines) ─────────────────
      const originX = toX(0);
      const originY = toY(0);

      // Pixel distance from origin to farthest canvas corner → maxVisibleRadius
      const cornerDists = [
        Math.hypot(originX, originY),
        Math.hypot(w - originX, originY),
        Math.hypot(originX, h - originY),
        Math.hypot(w - originX, h - originY),
      ];
      const maxPixelR = Math.max(...cornerDists);

      // Convert to math-space radius; choose nice ωn step
      const mathR = maxPixelR / ((w * vp.scale) / (xMax - xMin));
      const niceStep = (span: number) => {
        const rough = span / 8;
        const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-9))));
        const norm = rough / mag;
        return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
      };
      const wnStep = niceStep(mathR);
      const wnMax = Math.ceil(mathR / wnStep) * wnStep;
      const pixPerUnit = (w * vp.scale) / (xMax - xMin);

      // Concentric ωn circles
      ctx.lineWidth = 1;
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let wn = wnStep; wn <= wnMax + wnStep * 0.5; wn += wnStep) {
        const r = wn * pixPerUnit;
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
        ctx.beginPath();
        ctx.arc(originX, originY, r, 0, Math.PI * 2);
        ctx.stroke();
        // Label near positive imaginary axis
        if (originY - r > 4 && originY - r < h - 4)
          ctx.fillText(wn % 1 === 0 ? wn.toString() : wn.toFixed(1), originX + 3, originY - r + 1);
      }

      // Constant ζ radial lines stretching to canvas corners
      const zetaValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      zetaValues.forEach(zeta => {
        const phi = Math.acos(zeta);           // angle from negative real axis
        const cosU = -Math.cos(phi);           // unit vec in math-space, upper LHP
        const sinU = Math.sin(phi);
        // pixel direction from origin
        const dxPx = cosU * pixPerUnit;
        const dyPx = -sinU * pixPerUnit;       // canvas Y is flipped
        const tFar = maxPixelR / Math.hypot(dxPx, dyPx) + 10;

        ctx.strokeStyle = isDark ? "rgba(96,165,250,0.18)" : "rgba(37,99,235,0.13)";
        ctx.lineWidth = 1;
        // Upper ray (LHP, +im)
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + dxPx * tFar, originY + dyPx * tFar);
        ctx.stroke();
        // Lower ray (mirror for -im)
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + dxPx * tFar, originY - dyPx * tFar);
        ctx.stroke();

        // ζ label at ~25% of the way to the corner
        const labelT = tFar * 0.25;
        ctx.fillStyle = isDark ? "rgba(147,197,253,0.8)" : "rgba(37,99,235,0.75)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lx = originX + dxPx * labelT;
        const ly = originY + dyPx * labelT;
        if (lx > 4 && lx < w - 4 && ly > 4 && ly < h - 4)
          ctx.fillText(`ζ=${zeta}`, lx, ly - 7);
      });

      // Axes on top of polar grid
      ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, originY); ctx.lineTo(w, originY);
      ctx.moveTo(originX, 0); ctx.lineTo(originX, h);
      ctx.stroke();
    }

    // Asymptotes
    if (asymptotes) {
      const isAsymptoteHighlight = animationRef.current.step === 'asymptotes';
      const animT = isAsymptoteHighlight ? animationRef.current.progress : 0;
      
      const rColor = isDark ? 255 - 255 * animT + 251 * animT : 37 + (251 - 37) * animT;
      const gColor = isDark ? 255 - 255 * animT + 113 * animT : 99 + (113 - 99) * animT;
      const bColor = isDark ? 255 - 255 * animT + 133 * animT : 235 + (133 - 235) * animT;
      const aColor = 0.2 + 0.6 * animT; // 0.2 to 0.8
      
      ctx.strokeStyle = `rgba(${rColor}, ${gColor}, ${bColor}, ${aColor})`;
      
      // We can't strictly animate lineDash visually without causing jumpiness, so we just use empty array for highlight
      ctx.setLineDash(isAsymptoteHighlight && animT > 0.5 ? [] : [5, 5]);
      ctx.lineWidth = 1.5 + 1.5 * animT; // 1.5 to 3.0
      const { centroid, angles } = asymptotes;
      const cx = toX(centroid);
      const cy = toY(0);

      // Draw highlighted centroid
      if (isAsymptoteHighlight) {
         ctx.fillStyle = ctx.strokeStyle;
         ctx.beginPath();
         ctx.arc(cx, cy, 6, 0, Math.PI * 2);
         ctx.fill();
         if (animT > 0) {
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = animT * 15;
         }
      }

      angles.forEach(angle => {
        let tMin = Infinity;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        
        // Intersect with right or left edge
        if (cosA > 1e-6) {
           const tx = (xMax - centroid) / cosA;
           if (tx > 0 && tx < tMin) tMin = tx;
        } else if (cosA < -1e-6) {
           const tx = (xMin - centroid) / cosA;
           if (tx > 0 && tx < tMin) tMin = tx;
        }

        // Intersect with top or bottom edge
        if (sinA > 1e-6) {
           const ty = (yMax - 0) / sinA;
           if (ty > 0 && ty < tMin) tMin = ty;
        } else if (sinA < -1e-6) {
           const ty = (yMin - 0) / sinA;
           if (ty > 0 && ty < tMin) tMin = ty;
        }

        if (tMin === Infinity) tMin = 10000; // Fail-safe
        tMin = Math.max(0, tMin); // Strict geometry fail-safe to prevent backward rays

        const mathX = centroid + tMin * cosA;
        const mathY = tMin * sinA; 
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(toX(mathX), toY(mathY));
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    }

    // Interactive Real Axis Locus Highlight
    if (animationRef.current.step === 'real_axis') {
       const animT = animationRef.current.progress;
       ctx.strokeStyle = `rgba(96, 165, 250, ${0.8 * animT})`;
       ctx.lineWidth = 2 + 6 * animT; // animate up to 8
       ctx.lineCap = "round";
       if (animT > 0) {
           ctx.shadowColor = ctx.strokeStyle;
           ctx.shadowBlur = animT * 15;
       }
       ctx.beginPath();
       const visXMin = xMin + (0 - vp.offsetX) / (w * vp.scale) * (xMax - xMin);
       const visXMax = xMin + (w - vp.offsetX) / (w * vp.scale) * (xMax - xMin);
       const allRealSingularities = [...openLoopPoles, ...openLoopZeros]
         .filter((root) => Math.abs(root.im) < 1e-8)
         .map((root) => root.re)
         .sort((a, b) => a - b);
       const visibleSingularities = allRealSingularities.filter((root) => root > visXMin && root < visXMax);
       const boundaries = [visXMin, ...visibleSingularities, visXMax];
       for (let index = 0; index < boundaries.length - 1; index++) {
         const left = boundaries[index];
         const right = boundaries[index + 1];
         const sample = (left + right) / 2;
         const rootsToRight = allRealSingularities.filter((root) => root > sample).length;
         if (rootsToRight % 2 !== 0) {
           ctx.beginPath();
           ctx.moveTo(toX(left), toY(0));
           ctx.lineTo(toX(right), toY(0));
           ctx.stroke();
         }
       }
       ctx.shadowBlur = 0;
    }

    // Locus Branches
    if (locusTrajectories.length > 0) {
      ctx.lineWidth = 2.5;
      for (const branch of locusTrajectories) {
        ctx.strokeStyle = isDark ? "#60a5fa" : "#2563eb";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        let started = false;
        for (const root of branch) {
          const px = toX(root.re);
          const py = toY(root.im);
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }
    }

    const isPolesZerosHighlight = animationRef.current.step === 'poles_zeros';
    const animPZ = isPolesZerosHighlight ? animationRef.current.progress : 0;
    const poleRad = 6 + 6 * animPZ; // 6 to 12
    const zeroRad = 6 + 4 * animPZ; // 6 to 10

    // Open-Loop Poles (Red X)
    ctx.lineWidth = 2 + 2 * animPZ; // 2 to 4
    ctx.strokeStyle = "#fb7185";
    if (animPZ > 0) {
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = animPZ * 15;
    }
    openLoopPoles.forEach((p: Complex) => {
      const px = toX(p.re);
      const py = toY(p.im);
      ctx.beginPath();
      ctx.moveTo(px - poleRad, py - poleRad); ctx.lineTo(px + poleRad, py + poleRad);
      ctx.moveTo(px + poleRad, py - poleRad); ctx.lineTo(px - poleRad, py + poleRad);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // Open-Loop Zeros (Blue O)
    ctx.lineWidth = 2 + 2 * animPZ; // 2 to 4
    ctx.strokeStyle = "#818cf8";
    if (animPZ > 0) {
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = animPZ * 15;
    }
    openLoopZeros.forEach((z: Complex) => {
      const px = toX(z.re);
      const py = toY(z.im);
      ctx.beginPath();
      ctx.arc(px, py, zeroRad, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // Breakaway Points
    const isBreakawayHighlight = animationRef.current.step === 'breakaway';
    const animB = isBreakawayHighlight ? animationRef.current.progress : 0;
    const breakRad = 5 + 5 * animB; // 5 to 10
    
    // Interpolate the MAE secondary signal from indigo to violet.
    const rB = 129 + (192 - 129) * animB;
    const gB = 140 + (132 - 140) * animB;
    const bB = 248 + (252 - 248) * animB;
    ctx.strokeStyle = `rgb(${rB}, ${gB}, ${bB})`;
    ctx.lineWidth = 2 + 2 * animB; // 2 to 4
    if (animB > 0) {
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = animB * 15;
    }
    breakawayPoints.forEach((pt: number) => {
      const px = toX(pt);
      const py = toY(0);
      ctx.beginPath();
      ctx.moveTo(px - breakRad, py); ctx.lineTo(px + breakRad, py);
      ctx.moveTo(px, py - breakRad); ctx.lineTo(px, py + breakRad);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // Imaginary Crossings Highlight
    if (animationRef.current.step === 'imag_crossings') {
       const animI = animationRef.current.progress;
       ctx.fillStyle = `rgba(192, 132, 252, ${0.8 * animI})`;
       const crossRad = 4 + 6 * animI; // animate from 4 to 10
       if (animI > 0) {
           ctx.shadowColor = ctx.fillStyle;
           ctx.shadowBlur = animI * 15;
       }
       imagCrossings.forEach(c => {
         const px = toX(0);
         const py1 = toY(c.omega);
         const py2 = toY(-c.omega);
         ctx.beginPath();
         ctx.arc(px, py1, crossRad, 0, Math.PI * 2);
         ctx.fill();
         if (c.omega > 1e-3) {
            ctx.beginPath();
            ctx.arc(px, py2, crossRad, 0, Math.PI * 2);
            ctx.fill();
         }
       });
       ctx.shadowBlur = 0;
    }

    // Closed-Loop Poles
    ctx.fillStyle = "#a78bfa";
    currentRoots.forEach((r: Complex) => {
      const px = toX(r.re);
      const py = toY(r.im);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore(); // Restore clip
    ctx.restore(); // Restore transform
  };

  const handleHighlight = (step: string) => {
    const duration = 1000; // 300 up, 400 hold, 300 down
    animationRef.current = { step, progress: 0, startTime: performance.now() };
    
    // Easing function
    const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const renderCanvasLoop = (time: number) => {
      const elapsed = time - animationRef.current.startTime;
      if (elapsed >= duration) {
        animationRef.current.step = null;
        animationRef.current.progress = 0;
        drawCanvas();
        reqFrameRef.current = null;
        return;
      }
      let progress = 0;
      if (elapsed < 300) {
         progress = elapsed / 300;
      } else if (elapsed < 700) {
         progress = 1;
      } else {
         progress = 1 - ((elapsed - 700) / 300);
      }
      
      animationRef.current.progress = easeInOutCubic(progress);
      drawCanvas();
      reqFrameRef.current = requestAnimationFrame(renderCanvasLoop);
    };

    if (reqFrameRef.current !== null) {
      cancelAnimationFrame(reqFrameRef.current);
    }
    reqFrameRef.current = requestAnimationFrame(renderCanvasLoop);
  };

  // Attach passive:false wheel listener so e.preventDefault() actually works
  // (React's synthetic onWheel is passive by default in modern browsers)
  useEffect(() => {
    const canvas = locusCanvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = Math.exp(-e.deltaY * 0.0005);
      setViewport(prev => {
        const newScale = Math.max(0.05, Math.min(100, prev.scale * zoomFactor));
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          offsetX: mouseX - (mouseX - prev.offsetX) * ratio,
          offsetY: mouseY - (mouseY - prev.offsetY) * ratio,
        };
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [locusCanvasRef.current]);

  // Empty useEffect since sliderValue mapping is removed
  useEffect(() => {}, []);

  // Extract N(s) and D(s) with padding
  const { num, den } = useMemo(() => {
    let n = [...tfData.numPoly];
    let d = [...tfData.denPoly];
    while (n.length > 1 && Math.abs(n[0]) < 1e-12) n.shift();
    while (d.length > 1 && Math.abs(d[0]) < 1e-12) d.shift();
    return { num: n, den: d };
  }, [tfData]);

  const openLoopZeros = useMemo(() => findPolynomialRoots(num), [num]);
  const openLoopPoles = useMemo(() => findPolynomialRoots(den), [den]);

  // Asymptotes Calculation
  const asymptotes = useMemo(() => {
    const n = openLoopPoles.length;
    const m = openLoopZeros.length;
    const i = n - m;
    if (i <= 0) return null;

    const sumPoles = openLoopPoles.reduce((acc, val) => acc + val.re, 0.0);
    const sumZeros = openLoopZeros.reduce((acc, val) => acc + val.re, 0.0);

    const centroid = (sumPoles - sumZeros) / i;
    const angles = [];
    for (let k = 0; k < i; k++) {
      angles.push(((2 * k + 1) * Math.PI) / i);
    }
    return { centroid, angles };
  }, [openLoopPoles, openLoopZeros]);

  // Precompute Root Locus Sweeps and Crossings
  const { locusTrajectories, imagCrossings } = useMemo(() => {
    
    if (openLoopPoles.length === 0) return { locusTrajectories: [], imagCrossings: [], angleDepartures: [] };

    const maxDeg = Math.max(den.length, num.length);
    const alignArr = (arr: number[]) => {
      const out = Array(maxDeg).fill(0);
      for (let i = 0; i < arr.length; i++) out[maxDeg - arr.length + i] = arr[i];
      return out;
    };
    const dAligned = alignArr(den);
    const nAligned = alignArr(num);

    const computeRoots = (K: number) => {
const charPoly = dAligned.map((d_val, idx) => d_val + K * nAligned[idx]);
        let st = 0;
        while (st < charPoly.length && Math.abs(charPoly[st]) < 1e-12) st++;
        if (st === charPoly.length) return [];
        const lead = charPoly[st];
        const normPoly = charPoly.slice(st).map(val => val / lead);
        return findPolynomialRoots(normPoly);
    };

    let branches = generateFlawlessRootLocus(openLoopPoles, computeRoots);

    // ── BREAKAWAY INJECTION PASS ─────────────────────────────────────────────
    const analyticalBreakPts = findBreakawayPoints(num, den);
    if (analyticalBreakPts.length > 0) {
      branches = branches.map(branch => {
        const result: Complex[] = [];
        for (let i = 0; i < branch.length; i++) {
          const pt = branch[i];
          const prevPt = i > 0 ? branch[i - 1] : null;

          const wasReal = prevPt !== null && Math.abs(prevPt.im) < 1e-4;
          const isComplex = Math.abs(pt.im) > 1e-4;

          if (wasReal && isComplex && prevPt) {
            let bestBreak: number | null = null;
            let bestDist = Infinity;
            for (const bp of analyticalBreakPts) {
              const d = Math.abs(bp - prevPt.re);
              if (d < bestDist) { bestDist = d; bestBreak = bp; }
            }
            if (bestBreak !== null && bestDist < 1.0) {
              result.push({ re: bestBreak, im: 0 });
              result.push({ re: bestBreak, im: pt.im >= 0 ? 0.0001 : -0.0001 });
            }
          }
          result.push(pt);
        }
        return result;
      });
    }

    // ── IMAGINARY AXIS CROSSING DETECTION ────────────────────────────────
    const crossingSet = new Map<string, { k: number; omega: number }>();

    const findStabilityK = (): number => {
      let kLo = 0, kHi = 1e6;
      for (let iter = 0; iter < 60; iter++) {
        const kMid = (kLo + kHi) / 2;
        const roots = computeRoots(kMid);
        if (roots.some(r => r.re > 0)) kHi = kMid; else kLo = kMid;
      }
      return (kLo + kHi) / 2;
    };

    branches.forEach(branch => {
      for (let i = 1; i < branch.length; i++) {
        const prev = branch[i - 1];
        const curr = branch[i];

        // Sign change on real part
        if (prev.re * curr.re < 0) {
          const t = -prev.re / (curr.re - prev.re);
          const crossIm = prev.im + t * (curr.im - prev.im);
          const omega = Math.abs(crossIm);
          const kEst = findStabilityK();
          
          const key = omega.toFixed(2);
          if (!crossingSet.has(key)) crossingSet.set(key, { k: kEst, omega });
        }
      }
    });

    const crossings: { k: number; omega: number }[] = Array.from(crossingSet.values())
      .filter(c => c.omega > 1e-3)
      .sort((a, b) => a.omega - b.omega);

    // Compute angle of departure for each complex open-loop pole
    const angleDepartures = openLoopPoles.filter(p => Math.abs(p.im) > 1e-8).map(pole => {
      const sumPoleAngles = openLoopPoles.reduce((sum, other) => {
        if (other === pole) return sum;
        const ang = Math.atan2(other.im - pole.im, other.re - pole.re) * 180 / Math.PI;
        return sum + ang;
      }, 0);
      const sumZeroAngles = openLoopZeros.reduce((sum, z) => {
        const ang = Math.atan2(z.im - pole.im, z.re - pole.re) * 180 / Math.PI;
        return sum + ang;
      }, 0);
      const phi = 180 - sumPoleAngles + sumZeroAngles;
      return { pole, angle: phi };
    });

    return { locusTrajectories: branches, imagCrossings: crossings, angleDepartures };

  }, [num, den, asymptotes]);

  // Current closed loop roots at gainK
  const currentRoots = useMemo(() => {
    const maxDeg = Math.max(den.length, num.length);
    const alignArr = (arr: number[]) => {
      const out = Array(maxDeg).fill(0);
      for (let i = 0; i < arr.length; i++) out[maxDeg - arr.length + i] = arr[i];
      return out;
    };

    const dAligned = alignArr(den);
    const nAligned = alignArr(num);

    const charPoly = dAligned.map((d_val, i) => d_val + gainK * nAligned[i]);
    let start = 0;
    while (start < charPoly.length && Math.abs(charPoly[start]) < 1e-12) start++;
    if (start === charPoly.length) return [];
    
    const lead = charPoly[start];
    const normPoly = charPoly.slice(start).map(val => val / lead);
    return findPolynomialRoots(normPoly);
  }, [num, den, gainK]);

  // Simulate RK4 Step Response for the Closed-Loop System T(s) = K*N(s) / (D(s) + K*N(s))
  const stepResponse = useMemo(() => {
    const maxDeg = Math.max(den.length, num.length);
    const alignArr = (arr: number[]) => {
      const out = Array(maxDeg).fill(0);
      for (let i = 0; i < arr.length; i++) out[maxDeg - arr.length + i] = arr[i];
      return out;
    };

    const dAligned = alignArr(den);
    const nAligned = alignArr(num);

    const numCl = nAligned.map(val => gainK * val);
    const denCl = dAligned.map((d_val, i) => d_val + gainK * nAligned[i]);

    return simulateLtiStepResponse(numCl, denCl, 1.0, maxTime, 0.01);
  }, [num, den, gainK, maxTime]);

  // Breakaway Points
  const breakawayPoints = useMemo(() => {
    return findBreakawayPoints(num, den);
  }, [num, den]);

  // Plot limits extracted out for tooltip mapping
  const plotLimits = useMemo(() => {
    let minRe = 0; let maxRe = 0; let maxIm = 0;
    const olRoots = [...openLoopPoles, ...openLoopZeros];
    if (olRoots.length > 0) {
      minRe = Math.min(...olRoots.map(r => r.re));
      maxRe = Math.max(...olRoots.map(r => r.re));
      maxIm = Math.max(...olRoots.map(r => Math.abs(r.im)));
    }
    if (maxRe - minRe < 4) { minRe -= 2; maxRe += 2; }
    if (maxIm < 2) maxIm = 2;

    const spanRe = maxRe - minRe;
    let xMin = minRe - 0.2 * spanRe;
    let xMax = maxRe + 0.2 * spanRe;
    if (xMax < 1) xMax = 1;
    let yMax = maxIm * 1.2;
    let yMin = -yMax;
    return { xMin, xMax, yMin, yMax };
  }, [openLoopPoles, openLoopZeros]);

  // Handle Canvas Mouse Move for Tooltips
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = locusCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    
    const { xMin, xMax, yMin, yMax } = plotLimits;
    
    let closestDist = Infinity;
    let closestRoot: Complex | null = null;
    const pxToCoordX = (re: number) => ((re - xMin) / (xMax - xMin)) * rect.width;
    const pxToCoordY = (im: number) => rect.height - ((im - yMin) / (yMax - yMin)) * rect.height;

    for (const roots of locusTrajectories) {
      for (const r of roots) {
         const sx = pxToCoordX(r.re);
         const sy = pxToCoordY(r.im);
         const dist = Math.hypot(px - sx, py - sy);
         if (dist < closestDist) {
            closestDist = dist;
            closestRoot = r;
         }
      }
    }
    
    if (closestDist < 15 && closestRoot) {
       const pointX = pxToCoordX(closestRoot.re);
       const pointY = pxToCoordY(closestRoot.im);
       const wn = Math.sqrt(closestRoot.re**2 + closestRoot.im**2);
       const thetaDeg = Math.atan2(Math.abs(closestRoot.im), -closestRoot.re) * 180 / Math.PI; 
       const zeta = wn === 0 ? 1 : Math.abs(closestRoot.re)/wn;
       setTooltip({ x: px, y: py, pointX, pointY, s: closestRoot, wn, zeta, theta: thetaDeg });
    } else {
       setTooltip(null);
    }
  };

  // Render Root Locus Canvas whenever dependencies change (when not actively animating)
  useEffect(() => {
    if (reqFrameRef.current === null) {
        drawCanvas();
    }
  }, [openLoopPoles, openLoopZeros, locusTrajectories, currentRoots, asymptotes, theme, plotLimits, viewport, gridMode]);

  // Render Step Response Canvas
  // Animated Step Response Canvas
  const [animProgress, setAnimProgress] = useState(0);
  const [targetYMax, setTargetYMax] = useState(1.5);
  const [animYMax, setAnimYMax] = useState(1.5);

  // Easing function (easeOutQuart)
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

  // Start animation when stepResponse or maxTime changes
  useEffect(() => {
    if (!stepResponse) return;
    const yDataMax = Math.max(...stepResponse.y);
    const newYMax = Math.max(1.5, yDataMax * 1.15);
    setTargetYMax(newYMax);
    setAnimProgress(0);
    const start = performance.now();
    const duration = 800; // ms
    const animate = (time: number) => {
      const elapsed = time - start;
      const t = Math.min(elapsed / duration, 1);
      setAnimProgress(t);
      setAnimYMax(prev => {
        const eased = easeOutQuart(t);
        return prev + (newYMax - prev) * eased;
      });
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [stepResponse, maxTime]);

  useEffect(() => {
    const canvas = stepCanvasRef.current;
    if (!canvas || !stepResponse) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const isDark = theme === "dark";
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = isDark ? "#0f172a" : "#f8fafc";
    ctx.fillRect(0, 0, w, h);

    const padding = 40;
    const tMax = stepResponse.t[stepResponse.t.length - 1];
    const yMax = animYMax;

    // Auto-scale negative undershoot
    const rawMin = Math.min(...stepResponse.y);
    const yMin = rawMin < 0 ? rawMin * 1.15 : 0;
    const yRange = yMax - yMin;

    const toX = (t: number) => padding + (t / tMax) * (w - 2 * padding);
    const toY = (y: number) => h - padding - ((y - yMin) / yRange) * (h - 2 * padding);

    // Calibrated scope grid — visual adaptation only; RK4 and response logic remain unchanged.
    ctx.strokeStyle = isDark ? "rgba(100,116,139,0.22)" : "rgba(100,116,139,0.18)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (let gridIndex = 0; gridIndex <= 5; gridIndex++) {
      const gridX = padding + (gridIndex / 5) * (w - 2 * padding);
      const gridY = padding + (gridIndex / 5) * (h - 2 * padding);
      ctx.beginPath(); ctx.moveTo(gridX, padding); ctx.lineTo(gridX, h - padding); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(padding, gridY); ctx.lineTo(w - padding, gridY); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Y-axis
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.stroke();

    // Zero reference line (may not be at bottom when yMin < 0)
    const zeroY = toY(0);
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.moveTo(padding, zeroY); ctx.lineTo(w - padding, zeroY);
    ctx.stroke();

    // Bottom border
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.moveTo(padding, h - padding); ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    // Ticks
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i <= 5; i++) {
      const t = tMax * (i / 5);
      ctx.fillText(t.toFixed(1), toX(t), h - padding + 4);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const tickCount = 6;
    for (let i = 0; i <= tickCount; i++) {
      const y = yMin + yRange * (i / tickCount);
      ctx.fillText(y.toFixed(2), padding - 4, toY(y));
    }

    // Step Response Line (Animated)
    ctx.strokeStyle = isDark ? "#60a5fa" : "#2563eb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const totalPoints = Math.floor(stepResponse.t.length * animProgress);
    for (let i = 0; i < totalPoints; i++) {
      const x = toX(stepResponse.t[i]);
      const y = toY(stepResponse.y[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Steady State Dashed Green Line
    const yss = stepResponse.y[stepResponse.y.length - 1];
    ctx.strokeStyle = "#a78bfa";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, toY(yss));
    ctx.lineTo(w - padding, toY(yss));
    ctx.stroke();
    ctx.setLineDash([]);

    // Peak Dot (Red)
    if (stepResponse.overshootPercent > 0) {
      ctx.fillStyle = "#fb7185";
      const peakIdx = stepResponse.y.findIndex((_: number,i: number) => stepResponse.t[i]===stepResponse.peakTime);
      const px = toX(stepResponse.peakTime);
      const py = toY(stepResponse.y[peakIdx] ?? yss);
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [animProgress, animYMax, stepResponse, theme]);

  return (
    <div className="space-y-6">
      <TransferFunctionInput onUpdate={setTfData} defaultData={tfData} gainK={gainK} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Root Locus */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                S-Plane Root Locus
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {/* Grid mode toggle */}
                <button
                  onClick={() => setGridMode('cartesian')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${
                    gridMode === 'cartesian'
                      ? 'bg-brand-gradient text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400'
                  }`}
                >
                  Cartesian
                </button>
                <button
                  onClick={() => setGridMode('polar')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm ${
                    gridMode === 'polar'
                      ? 'bg-brand-gradient text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400'
                  }`}
                >
                  Polar
                </button>
                {/* Auto Scale button */}
                <button
                  onClick={() => setViewport({ scale: 1, offsetX: 0, offsetY: 0 })}
                  title="Auto scale / fit to default bounds"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:border-blue-400 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-400 dark:hover:text-slate-200"
                >
                  Auto Scale
                </button>
              </div>
            </div>
            <div
              className={`relative w-full aspect-square md:aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-inner select-none ${isPanningRef.current ? 'cursor-grabbing' : 'cursor-grab'}`}
              onMouseDown={(e) => {
                isPanningRef.current = true;
                lastPanPosRef.current = { x: e.clientX, y: e.clientY };
              }}
              onMouseMove={(e) => {
                const canvas = locusCanvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();

                if (isPanningRef.current) {
                  // Pan: shift offset by mouse delta
                  const dx = e.clientX - lastPanPosRef.current.x;
                  const dy = e.clientY - lastPanPosRef.current.y;
                  lastPanPosRef.current = { x: e.clientX, y: e.clientY };
                  setViewport(prev => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
                  return;
                }

                // Tooltip: inverse-map screen coords to math coords
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const { xMin, xMax, yMin, yMax } = plotLimits;
                const mathX = xMin + ((x - viewport.offsetX) / (rect.width * viewport.scale)) * (xMax - xMin);
                const mathY = yMin + (1 - (y - viewport.offsetY) / (rect.height * viewport.scale)) * (yMax - yMin);

                let nearest: any = null;
                currentRoots.forEach(r => {
                  const d = Math.hypot(r.re - mathX, r.im - mathY);
                  if (!nearest || d < nearest.d) nearest = { p: r, d };
                });

                if (nearest && nearest.d < (xMax - xMin) * 0.05 / viewport.scale) {
                  const wn = Math.hypot(nearest.p.re, nearest.p.im);
                  const zeta = nearest.p.re < 0 ? Math.abs(nearest.p.re) / wn : -Math.abs(nearest.p.re) / wn;
                  const theta = wn > 0 ? Math.acos(Math.abs(nearest.p.re) / wn) * 180 / Math.PI : 0;

                  // Map math coords back to screen for dot indicator
                  const ptX = ((nearest.p.re - xMin) / (xMax - xMin)) * rect.width * viewport.scale + viewport.offsetX;
                  const ptY = (rect.height - ((nearest.p.im - yMin) / (yMax - yMin)) * rect.height) * viewport.scale + viewport.offsetY;

                  setTooltip({ x, y, pointX: ptX, pointY: ptY, s: nearest.p, wn, zeta, theta });
                } else {
                  setTooltip(null);
                }
              }}
              onMouseUp={() => { isPanningRef.current = false; }}
              onMouseLeave={() => { isPanningRef.current = false; setTooltip(null); }}
              onWheel={(e) => {
                e.preventDefault();
                const canvas = locusCanvasRef.current;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const zoomFactor = Math.exp(-e.deltaY * 0.0005);
                setViewport(prev => {
                  const newScale = Math.max(0.1, Math.min(50, prev.scale * zoomFactor));
                  // Zoom toward mouse cursor
                  const newOffsetX = mouseX - (mouseX - prev.offsetX) * (newScale / prev.scale);
                  const newOffsetY = mouseY - (mouseY - prev.offsetY) * (newScale / prev.scale);
                  return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
                });
              }}
            >
              <canvas ref={locusCanvasRef} className="absolute inset-0 w-full h-full touch-none" />
              {tooltip && tooltip.pointX !== undefined && tooltip.pointY !== undefined && (
                <div
                  className="absolute pointer-events-none w-[8px] h-[8px] bg-red-500 border-2 border-white dark:border-slate-900 rounded-full transform -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_2px_rgba(239,68,68,0.5)] z-10"
                  style={{ left: tooltip.pointX, top: tooltip.pointY }}
                />
              )}
              {tooltip && (
                <div
                  className="absolute pointer-events-none bg-white/95 border border-slate-200 text-slate-800 shadow-md backdrop-blur-sm text-xs p-3 rounded-xl dark:bg-slate-900/95 dark:border-slate-800 dark:text-slate-100 z-10"
                  style={{ left: tooltip.x + 15, top: tooltip.y + 15 }}
                >
                  <div className="mb-1 font-bold text-blue-500 dark:text-blue-400">
                    <span className="font-serif italic">s</span> = {parseFloat(tooltip.s.re.toFixed(3))} {tooltip.s.im < 0 ? '-' : '+'} j{parseFloat(Math.abs(tooltip.s.im).toFixed(3))}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                    <span>Distance (<span className="font-serif italic">ω</span><sub>n</sub>)</span><span className="font-mono text-right">{parseFloat(tooltip.wn.toFixed(3))} rad/s</span>
                    <span>Angle (<span className="font-serif italic">θ</span>)</span><span className="font-mono text-right">{parseFloat(tooltip.theta.toFixed(1))}°</span>
                    <span>Damping (<span className="font-serif italic">ζ</span>)</span><span className="font-mono text-right">{parseFloat(tooltip.zeta.toFixed(4))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step Response — visual language aligned with PID Interactive RK4 Scope. */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div><h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider">Closed-Loop Step Response (RK4)</h3><p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400">y(t) — closed-loop output</p></div>
              <div className="flex items-center gap-2">
                <KatexMath math="t_{max}" className="text-xs font-bold text-slate-500 dark:text-slate-400" />
                <input 
                  type="number"
                  value={maxTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0) setMaxTime(val);
                  }}
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-slate-800 text-lg tracking-wide dark:text-white w-20 text-right focus:outline-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
                />
              </div>
            </div>
            <div className="relative w-full aspect-[4/2] rounded-2xl overflow-hidden border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0f172a]">
              <canvas ref={stepCanvasRef} className="absolute inset-0 w-full h-full" />
              <div className="pointer-events-none absolute bottom-4 left-5 flex items-center gap-3 text-[10px] font-bold"><span className="flex items-center gap-1 text-violet-400"><i className="h-px w-3 bg-violet-400"/>r(t)</span><span className="flex items-center gap-1 text-blue-400"><i className="h-px w-3 bg-blue-400"/>y(t)</span></div>
            </div>
          </div>

          {/* Transient Metrics + Closed-Loop Roots: side-by-side on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 w-full">

          {/* RK4 Transient Metrics */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4">
              Transient Metrics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Overshoot (<KatexMath math="OS\%" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.overshootPercent.toFixed(2)}\\%`} />
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Peak Time (<KatexMath math="T_p" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.peakTime.toFixed(3)}\\,\\text{s}`} />
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Settling Time (<KatexMath math="T_s" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.settlingTime.toFixed(3)}\\,\\text{s}`} />
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Rise Time (<KatexMath math="T_r" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.riseTime.toFixed(3)}\\,\\text{s}`} />
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500">Delay Time (<KatexMath math="T_d" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.delayTime.toFixed(3)}\\,\\text{s}`} />
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500">Steady State Error (<KatexMath math="e_{ss}" />)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  <KatexMath math={`${stepResponse?.steadyStateError.toFixed(4)}`} />
                </span>
              </div>
            </div>
          </div>

          {/* Root Locus Current Poles */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4">
              Closed-Loop Roots
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {currentRoots.map((root: Complex, i: number) => {
                const wn = Math.hypot(root.re, root.im);
                const zeta = root.re < 0 ? Math.abs(root.re) / wn : -Math.abs(root.re) / wn;
                const os = zeta > 0 && zeta < 1 ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) * 100 : 0;
                
                return (
                  <div key={i} className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="text-slate-900 dark:text-white mb-2">
                      <KatexMath math={`s = ${root.re.toFixed(3)} ${root.im >= 0 ? "+" : "-"} ${Math.abs(root.im).toFixed(3)}j`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-slate-500"><KatexMath math={`\\omega_n = ${wn.toFixed(3)}`} /></div>
                      <div className="text-slate-500"><KatexMath math={`\\zeta = ${zeta.toFixed(3)}`} /></div>
                      {zeta > 0 && zeta < 1 && (
                        <div className="col-span-2 text-blue-600 dark:text-blue-400 font-bold">
                          <KatexMath math={`\\%OS = ${os.toFixed(1)}\\%`} />
                        </div>
                      )}
                      {root.re > 0 && (
                        <div className="col-span-2 text-red-600 dark:text-red-400 font-bold uppercase text-[10px]">
                          Unstable Region
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          </div>{/* end side-by-side grid */}

        </div>

        <div className="space-y-6">
          <RootLocusStepsPanel 
             openLoopZeros={openLoopZeros}
             openLoopPoles={openLoopPoles}
             asymptotes={asymptotes}
             breakawayPoints={breakawayPoints}
             imagCrossings={imagCrossings}
             onHighlight={handleHighlight}
          />

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4">
              Gain Calibration
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }} className="italic font-serif text-slate-800 text-lg tracking-wide dark:text-white">K =</span>
                <input 
                  type="number"
                  value={Number(gainK.toFixed(4))}
                  onChange={(e) => {
                    const k = parseFloat(e.target.value);
                    if (!isNaN(k) && k > 0) setGainK(k);
                  }}
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-slate-800 text-lg tracking-wide dark:text-white w-28 text-right focus:outline-blue-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={kMin}
                  step="0.01"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0 && v < kMax) setKMin(v);
                  }}
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
                />
                <BrandSlider
                  min={kMin}
                  max={kMax}
                  step={(kMax - kMin) / 1000}
                  value={gainK}
                  onChange={(e) => setGainK(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  value={kMax}
                  step="1"
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > kMin) setKMax(v);
                  }}
                  style={{ fontFamily: "'KaTeX_Main', 'Times New Roman', serif" }}
                  className="font-serif text-slate-800 text-lg tracking-wide bg-transparent border-none outline-none w-16 text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] m-0 dark:text-white"
                />
              </div>
            </div>
          </div>


        </div>
      </div>
    </div>
  );
}
