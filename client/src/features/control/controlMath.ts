/**
 * MAE Academy High-Precision Control Systems Mathematics Engine
 * Includes:
 * 1. Companion Matrix Double-Shift QR Eigenvalue Solver for arbitrary polynomial roots
 * 2. RK4 Numerical Integrator for Arbitrary LTI State-Space and Transfer Function Step Responses
 * 3. Mason's Gain Formula Graph Reduction Solver for Signal Flow Graphs
 * 4. Block Diagram Algebraic Reduction for MIMO Control Loops
 */

import { Matrix, EigenvalueDecomposition } from 'ml-matrix';

export type Complex = { re: number; im: number };
export type PoleStability = "stable" | "marginally-stable" | "unstable" | "indeterminate";

export function classifyPoleStability(poles: Complex[], tolerance = 1e-8): PoleStability {
  if (poles.length === 0 || poles.some((pole) => !Number.isFinite(pole.re) || !Number.isFinite(pole.im))) return "indeterminate";
  if (poles.some((pole) => pole.re > tolerance)) return "unstable";
  if (poles.some((pole) => Math.abs(pole.re) <= tolerance)) return "marginally-stable";
  return "stable";
}

export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function complexDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (Math.abs(denom) < 1e-15) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

export function complexMag(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

export function evalPolyComplex(poly: number[], s: Complex): Complex {
  let res: Complex = { re: 0, im: 0 };
  for (let i = 0; i < poly.length; i++) {
    res = complexAdd(complexMul(res, s), { re: poly[i], im: 0 });
  }
  return res;
}

/**
 * Polynomial Convolution (Multiplication)
 * Multiplies two polynomials given by their coefficients [an, an-1, ..., a0]
 */
export function multiplyPolynomials(poly1: number[], poly2: number[]): number[] {
  if (poly1.length === 0) return poly2;
  if (poly2.length === 0) return poly1;
  const result = new Array(poly1.length + poly2.length - 1).fill(0);
  for (let i = 0; i < poly1.length; i++) {
    for (let j = 0; j < poly2.length; j++) {
      result[i + j] += poly1[i] * poly2[j];
    }
  }
  return result;
}

export function polyDeriv(poly: number[]): number[] {
  if (poly.length <= 1) return [0];
  const n = poly.length - 1;
  const deriv = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    deriv[i] = poly[i] * (n - i);
  }
  return deriv;
}

export function polyAdd(p1: number[], p2: number[]): number[] {
  const maxLen = Math.max(p1.length, p2.length);
  const res = new Array(maxLen).fill(0);
  for (let i = 0; i < p1.length; i++) res[maxLen - p1.length + i] += p1[i];
  for (let i = 0; i < p2.length; i++) res[maxLen - p2.length + i] += p2[i];
  while (res.length > 1 && Math.abs(res[0]) < 1e-12) res.shift();
  return res;
}

export function polySub(p1: number[], p2: number[]): number[] {
  const maxLen = Math.max(p1.length, p2.length);
  const res = new Array(maxLen).fill(0);
  for (let i = 0; i < p1.length; i++) res[maxLen - p1.length + i] += p1[i];
  for (let i = 0; i < p2.length; i++) res[maxLen - p2.length + i] -= p2[i];
  while (res.length > 1 && Math.abs(res[0]) < 1e-12) res.shift();
  return res;
}

/**
 * Converts a list of roots (zeros or poles) into polynomial coefficients
 * Handles complex conjugate pairs to ensure a strictly real coefficient output.
 * e.g. roots = [-1, -2] => (s+1)(s+2) = s^2 + 3s + 2 => [1, 3, 2]
 */
export function rootsToPolynomial(roots: Complex[]): number[] {
  let poly = [1];
  const processed = new Set<number>();

  for (let i = 0; i < roots.length; i++) {
    if (processed.has(i)) continue;
    const r = roots[i];

    if (Math.abs(r.im) > 1e-10) {
      // Find its complex conjugate
      let conjIdx = -1;
      for (let j = i + 1; j < roots.length; j++) {
        if (!processed.has(j) && Math.abs(roots[j].re - r.re) < 1e-10 && Math.abs(roots[j].im + r.im) < 1e-10) {
          conjIdx = j;
          break;
        }
      }
      if (conjIdx !== -1) {
        // Pair: (s - (a+bi))(s - (a-bi)) = s^2 - 2as + (a^2 + b^2)
        const quadratic = [1, -2 * r.re, r.re * r.re + r.im * r.im];
        poly = multiplyPolynomials(poly, quadratic);
        processed.add(conjIdx);
      } else {
        // Fallback for unpaired complex root (should mathematically not happen in real LTI systems, but we gracefully handle real part only)
        poly = multiplyPolynomials(poly, [1, -r.re]);
      }
    } else {
      // Real root: (s - r) -> [1, -r.re]
      poly = multiplyPolynomials(poly, [1, -r.re]);
    }
    processed.add(i);
  }
  return poly;
}

/**
 * Parses a string of comma-separated roots (real or complex).
 * Example: "-1, -2, -3+4j, -3-4j"
 */
export function parseRootsList(input: string): Complex[] {
  if (!input || input.trim() === "") return [];
  const rawParts = input.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  
  const parts: string[] = [];
  for (const p of rawParts) {
    if (p.includes("+-")) {
      parts.push(p.replace("+-", "+"));
      parts.push(p.replace("+-", "-"));
    } else if (p.includes("\\pm")) {
      parts.push(p.replace("\\pm", "+"));
      parts.push(p.replace("\\pm", "-"));
    } else {
      parts.push(p);
    }
  }

  const roots: Complex[] = [];

  for (const part of parts) {
    let s = part.replace(/\s+/g, "");
    
    // Check if it has 'j' or 'i'
    const hasImag = s.includes("j") || s.includes("i");
    s = s.replace(/j/g, "i"); // standardize to i
    
    if (!hasImag) {
      roots.push({ re: parseFloat(s), im: 0 });
    } else {
      // It's complex. Cases: "4i", "-4i", "3+4i", "-3-4i"
      // Remove 'i' at the end
      s = s.replace("i", "");
      
      // Find the last + or - that is NOT at the very beginning
      let splitIdx = -1;
      for (let k = s.length - 1; k > 0; k--) {
        if (s[k] === "+" || s[k] === "-") {
          splitIdx = k;
          break;
        }
      }
      
      if (splitIdx === -1) {
        // purely imaginary, e.g. "4", "-4" (because 'i' was removed)
        let imVal = parseFloat(s);
        if (s === "" || s === "+") imVal = 1;
        if (s === "-") imVal = -1;
        roots.push({ re: 0, im: imVal });
      } else {
        const rePart = s.substring(0, splitIdx);
        const imPart = s.substring(splitIdx);
        
        let imVal = parseFloat(imPart);
        if (imPart === "+" || imPart === "") imVal = 1;
        if (imPart === "-") imVal = -1;
        
        roots.push({ re: parseFloat(rePart), im: imVal });
      }
    }
  }
  
  const filteredRoots = roots.filter(r => !isNaN(r.re) && !isNaN(r.im));
  const uniqueRoots: Complex[] = [];
  const processed = new Set<number>();
  for (let i = 0; i < filteredRoots.length; i++) {
    if (processed.has(i)) continue;
    uniqueRoots.push(filteredRoots[i]);
    // If it's a complex root, find any exact duplicates and mark them as processed to avoid inserting them again.
    // We allow duplicate real roots (e.g., double pole at origin).
    if (Math.abs(filteredRoots[i].im) > 1e-10) {
      for (let j = i + 1; j < filteredRoots.length; j++) {
        if (!processed.has(j) && Math.abs(filteredRoots[i].re - filteredRoots[j].re) < 1e-10 && Math.abs(filteredRoots[i].im - filteredRoots[j].im) < 1e-10) {
          processed.add(j);
        }
      }
    }
  }
  return uniqueRoots;
}

/**
/**
 * Solves eigenvalues of an NxN Companion Matrix using numeric.js
 * Solves arbitrary polynomial: c[0]*s^n + c[1]*s^(n-1) + ... + c[n] = 0
 */
export function findPolynomialRoots(coeffs: number[]): Complex[] {
  // Normalize leading zeros
  let i = 0;
  while (i < coeffs.length && Math.abs(coeffs[i]) < 1e-12) i++;
  const c = coeffs.slice(i);
  const n = c.length - 1;

  if (n <= 0) return [];
  if (n === 1) return [{ re: -c[1] / c[0], im: 0 }];

  if (n === 2) {
    const a = c[0];
    const b = c[1];
    const d = c[2];
    const disc = b * b - 4 * a * d;
    if (disc >= 0) {
      return [
        { re: (-b + Math.sqrt(disc)) / (2 * a), im: 0 },
        { re: (-b - Math.sqrt(disc)) / (2 * a), im: 0 },
      ];
    }
    return [
      { re: -b / (2 * a), im: Math.sqrt(-disc) / (2 * a) },
      { re: -b / (2 * a), im: -Math.sqrt(-disc) / (2 * a) },
    ];
  }

  // Construct companion matrix A
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const lead = c[0];
  for (let col = 0; col < n; col++) {
    A[0][col] = -c[col + 1] / lead;
  }
  for (let row = 1; row < n; row++) {
    A[row][row - 1] = 1;
  }

  // Use ml-matrix to compute eigenvalues
  const matrixA = new Matrix(A);
  const eig = new EigenvalueDecomposition(matrixA);
  const roots: Complex[] = [];

  const realParts = eig.realEigenvalues;
  const imagParts = eig.imaginaryEigenvalues;

  for (let k = 0; k < n; k++) {
    roots.push({
      re: realParts[k] || 0,
      im: imagParts ? imagParts[k] || 0 : 0
    });
  }

  return roots.sort((a, b) => a.re - b.re || a.im - b.im);
}

export function findBreakawayPoints(num: number[], den: number[]): number[] {
  const dDeriv = polyDeriv(den);
  const nDeriv = polyDeriv(num);
  const term1 = multiplyPolynomials(dDeriv, num);
  const term2 = multiplyPolynomials(den, nDeriv);
  const p_s = polySub(term1, term2);
  
  if (p_s.length <= 1 && Math.abs(p_s[0] || 0) < 1e-12) return []; // no valid poly

  const roots = findPolynomialRoots(p_s);
  return roots.filter(r => Math.abs(r.im) < 1e-4).map(r => r.re);
}

function solveQuadBlock(a: number, b: number, c: number, d: number): Complex[] {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    return [
      { re: (tr + Math.sqrt(disc)) / 2, im: 0 },
      { re: (tr - Math.sqrt(disc)) / 2, im: 0 },
    ];
  }
  return [
    { re: tr / 2, im: Math.sqrt(-disc) / 2 },
    { re: tr / 2, im: -Math.sqrt(-disc) / 2 },
  ];
}

/**
 * High-Order 4th-Order Runge-Kutta (RK4) Step Response Simulator
 */
export type StepResponseData = {
  t: number[];
  y: number[];
  sp: number[];
  error: number[];
  overshootPercent: number;
  settlingTime: number;
  peakTime: number;
  riseTime: number;
  delayTime: number;
  steadyStateError: number;
  termination: "complete" | "unstable-growth" | "non-finite";
};

export function simulateLtiStepResponse(
  num: number[],
  den: number[],
  setpoint = 1.0,
  tMax = 10.0,
  dt = 0.01
): StepResponseData {
  const n = den.length - 1;
  const lead = den[0] || 1;
  const normDen = den.map((v) => v / lead);
  const normNum = num.map((v) => v / lead);

  // Align numerator size
  while (normNum.length < den.length) normNum.unshift(0);

  // State-Space Controllable Canonical Form: dx/dt = A*x + B*u, y = C*x + D*u
  const x = Array(n).fill(0);
  const tArr: number[] = [];
  const yArr: number[] = [];
  const spArr: number[] = [];
  const errArr: number[] = [];

  const bLead = normNum[0];
  const cVec = Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    cVec[i] = normNum[normNum.length - 1 - i] - bLead * normDen[normDen.length - 1 - i];
  }

  const stateDeriv = (currX: number[], u: number): number[] => {
    const dxdt = Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      dxdt[i] = currX[i + 1];
    }
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum -= normDen[normDen.length - 1 - i] * currX[i];
    }
    sum += u;
    dxdt[n - 1] = sum;
    return dxdt;
  };

  const steps = Math.floor(tMax / dt);
  let peakVal = 0;
  let peakTime = 0;
  let termination: StepResponseData["termination"] = "complete";
  const responseMagnitudeLimit = 1e9;

  for (let step = 0; step <= steps; step++) {
    const t = step * dt;
    const u = setpoint;

    // Output: y = C*x + D*u
    let y = bLead * u;
    for (let i = 0; i < n; i++) {
      y += cVec[i] * x[i];
    }

    if (!Number.isFinite(y)) {
      termination = "non-finite";
      break;
    }
    if (Math.abs(y) > responseMagnitudeLimit) {
      termination = "unstable-growth";
      break;
    }

    tArr.push(t);
    yArr.push(y);
    spArr.push(u);
    errArr.push(u - y);

    if (y > peakVal) {
      peakVal = y;
      peakTime = t;
    }

    // RK4 integration
    const k1 = stateDeriv(x, u);
    const x_k2 = x.map((xi, idx) => xi + 0.5 * dt * k1[idx]);
    const k2 = stateDeriv(x_k2, u);
    const x_k3 = x.map((xi, idx) => xi + 0.5 * dt * k2[idx]);
    const k3 = stateDeriv(x_k3, u);
    const x_k4 = x.map((xi, idx) => xi + dt * k3[idx]);
    const k4 = stateDeriv(x_k4, u);

    const nextState = x.map((value, index) => value + (dt / 6) * (k1[index] + 2 * k2[index] + 2 * k3[index] + k4[index]));
    if (nextState.some((value) => !Number.isFinite(value))) {
      termination = "non-finite";
      break;
    }
    for (let i = 0; i < n; i++) x[i] = nextState[i];
  }

  const finalY = yArr[yArr.length - 1] || setpoint;
  const overshoot = setpoint !== 0 && peakVal > finalY ? ((peakVal - finalY) / finalY) * 100 : 0;
  const ess = Math.abs(setpoint - finalY);

  // 2% settling band
  const band = 0.02 * Math.abs(finalY || setpoint);
  let settlingTime = tMax;
  for (let i = yArr.length - 1; i >= 0; i--) {
    if (Math.abs(yArr[i] - finalY) > band) {
      settlingTime = tArr[Math.min(i + 1, tArr.length - 1)];
      break;
    }
  }

  // 10% to 90% rise time and 50% delay time
  let t10 = 0;
  let t50 = 0;
  let t90 = 0;
  for (let i = 0; i < yArr.length; i++) {
    if (yArr[i] >= 0.1 * finalY && t10 === 0) t10 = tArr[i];
    if (yArr[i] >= 0.5 * finalY && t50 === 0) t50 = tArr[i];
    if (yArr[i] >= 0.9 * finalY && t90 === 0) {
      t90 = tArr[i];
      break;
    }
  }
  const riseTime = t90 > t10 ? t90 - t10 : 0;
  const delayTime = t50;

  return {
    t: tArr,
    y: yArr,
    sp: spArr,
    error: errArr,
    overshootPercent: overshoot,
    settlingTime,
    peakTime,
    riseTime,
    delayTime,
    steadyStateError: ess,
    termination,
  };
}

export function alignRootsRobust(prev: Complex[], curr: Complex[]): Complex[] {
    const getPermutations = (arr: number[]): number[][] => {
        if (arr.length <= 1) return [arr];
        const perms: number[][] = [];
        for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            const rest = arr.slice(0, i).concat(arr.slice(i + 1));
            for (const perm of getPermutations(rest)) perms.push([c, ...perm]);
        }
        return perms;
    };
    if (prev.length > 8) {
        const used = new Set<number>();
        const aligned: Complex[] = [];
        for (const p of prev) {
            let bestIdx = -1, minDist = Infinity;
            for (let i = 0; i < curr.length; i++) {
                if (used.has(i)) continue;
                const d = (p.re - curr[i].re)**2 + (p.im - curr[i].im)**2;
                if (d < minDist) { minDist = d; bestIdx = i; }
            }
            used.add(bestIdx);
            aligned.push(curr[bestIdx]);
        }
        return aligned;
    }
    const indices = Array.from({ length: prev.length }, (_, i) => i);
    const allPerms = getPermutations(indices);
    let bestPerm: number[] = [], minTotalDist = Infinity;
    for (const perm of allPerms) {
        let totalDist = 0;
        for (let i = 0; i < prev.length; i++) {
            totalDist += (prev[i].re - curr[perm[i]].re)**2 + (prev[i].im - curr[perm[i]].im)**2;
        }
        if (totalDist < minTotalDist) { minTotalDist = totalDist; bestPerm = perm; }
    }
    return bestPerm.map(idx => curr[idx]);
}

export function generateFlawlessRootLocus(openLoopPoles: Complex[], computeRoots: (K: number) => Complex[]): Complex[][] {
    // Initialize branches with the starting open-loop poles
    let branches: Complex[][] = openLoopPoles.map(p => [{ re: p.re, im: p.im }]);
    let currentRoots: Complex[] = openLoopPoles.map(p => ({ re: p.re, im: p.im }));
    
    let K = 0;
    let dK = 0.0001; // Micro-step for perfect Angle of Departure precision
    const K_MAX = 500000; // Push far enough to lock onto asymptotes
    
    let consecutiveSuccesses = 0;

    // Failsafe escape hatch to prevent infinite loops in extreme edge cases
    let maxIterations = 50000; 
    let iteration = 0;

    while (K < K_MAX && iteration < maxIterations) {
        iteration++;
        let nextK = K + dK;
        
        // 1. Calculate raw roots using the stable eigenvalue solver
        let nextRawRoots = computeRoots(nextK); 
        
        if (nextRawRoots.length !== currentRoots.length) {
            // Bad matrix solver output at extreme K. Reduce step size and retry.
            dK /= 2;
            consecutiveSuccesses = 0;
            continue;
        }
        
        // 2. Align roots to prevent branch swapping
        let nextTrackedRoots = alignRootsRobust(currentRoots, nextRawRoots);
        
        // 3. Measure the maximum spatial jump across ALL roots
        let maxDist = 0;
        for (let i = 0; i < currentRoots.length; i++) {
            let dist = Math.hypot(
                currentRoots[i].re - nextTrackedRoots[i].re, 
                currentRoots[i].im - nextTrackedRoots[i].im
            );
            if (dist > maxDist) maxDist = dist;
        }
        
        // 4. THE ADAPTIVE CLAMP: If any root jumped too far, reject the step and halve dK
        if (maxDist > 0.15) {
            dK /= 2;
            consecutiveSuccesses = 0;
            continue; // Loop again with smaller dK, DO NOT update K
        }
        
        // 5. STEP ACCEPTED: Process Spatial Decimation for Canvas Performance
        for (let i = 0; i < branches.length; i++) {
            let lastPushed = branches[i][branches[i].length - 1];
            let distFromLastPushed = Math.hypot(
                nextTrackedRoots[i].re - lastPushed.re, 
                nextTrackedRoots[i].im - lastPushed.im
            );
            
            // Only save the point if it moved at least 0.05 units visually, or if it's the very last step
            if (distFromLastPushed >= 0.05 || nextK >= K_MAX * 0.99) {
                branches[i].push({ re: nextTrackedRoots[i].re, im: nextTrackedRoots[i].im });
            }
        }
        
        // 6. Advance State
        currentRoots = nextTrackedRoots;
        K = nextK;
        consecutiveSuccesses++;
        
        // 7. MOMENTUM ACCELERATION: Speed up calculation in linear/flat regions
        if (maxDist < 0.03 && consecutiveSuccesses > 3) {
            dK *= 1.4; // Exponentially increase step size on straight paths (like asymptotes)
        }
    }
    
    return branches; // Returns isolated, perfectly smooth, decimated lines ready for Canvas
}
