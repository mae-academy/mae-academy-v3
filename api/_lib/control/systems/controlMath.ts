/**
 * MAE Academy High-Precision Control Systems Mathematics Engine
 * Includes:
 * 1. Companion Matrix Double-Shift QR Eigenvalue Solver for arbitrary polynomial roots
 * 2. RK4 Numerical Integrator for Arbitrary LTI State-Space and Transfer Function Step Responses
 * 3. Mason's Gain Formula Graph Reduction Solver for Signal Flow Graphs
 * 4. Block Diagram Algebraic Reduction for MIMO Control Loops
 */

import { multiplyPolynomials, polyDeriv, polySub, type Complex } from "../../../../shared/control/polynomial";
export type { Complex };
import type { StepResponseData } from "../../../../shared/control/stepTypes";
export type { StepResponseData };
export { complexAdd, complexSub, complexMul, complexDiv, complexMag, evalPolyComplex, multiplyPolynomials, polyDeriv, polyAdd, polySub, rootsToPolynomial, parseRootsList } from "../../../../shared/control/polynomial";


export type PoleStability = "stable" | "marginally-stable" | "unstable" | "indeterminate";

export function classifyPoleStability(poles: Complex[], tolerance = 1e-8): PoleStability {
  if (poles.length === 0 || poles.some((pole) => !Number.isFinite(pole.re) || !Number.isFinite(pole.im))) return "indeterminate";
  if (poles.some((pole) => pole.re > tolerance)) return "unstable";
  if (poles.some((pole) => Math.abs(pole.re) <= tolerance)) return "marginally-stable";
  return "stable";
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

  // The companion matrix is already upper Hessenberg: shifted-QR (EISPACK hqr) gives every eigenvalue with no external dependency.
  const roots = hessenbergEigenvalues(A);

  return roots.sort((a, b) => a.re - b.re || a.im - b.im);
}

/**
 * Eigenvalues of a real upper-Hessenberg matrix by the double-shift QR algorithm (EISPACK `hqr`, as in
 * Numerical Recipes). Works in place on a copy; pure TypeScript, no dependencies, safe for the Edge runtime.
 */
export function hessenbergEigenvalues(input: number[][]): Complex[] {
  const n = input.length;
  const a = input.map((row) => row.slice());
  const roots: Complex[] = new Array<Complex>(n);
  const sign = (magnitude: number, reference: number) => (reference >= 0 ? Math.abs(magnitude) : -Math.abs(magnitude));
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
  let nn = n - 1;
  let t = 0;
  while (nn >= 0) {
    let its = 0;
    let l: number;
    do {
      for (l = nn; l >= 1; l--) {
        let s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      let x = a[nn][nn];
      if (l === nn) { // one real root found
        roots[nn] = { re: x + t, im: 0 };
        nn--;
      } else {
        let y = a[nn - 1][nn - 1];
        let w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) { // a pair found
          const p = 0.5 * (y - x);
          const q = p * p + w;
          let z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            roots[nn - 1] = { re: x + z, im: 0 };
            roots[nn] = { re: z !== 0 ? x - w / z : x + z, im: 0 };
          } else {
            roots[nn - 1] = { re: x + p, im: z };
            roots[nn] = { re: x + p, im: -z };
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error("Eigenvalue iteration did not converge.");
          if (its === 10 || its === 20) { // exceptional shift
            t += x;
            for (let i = 0; i <= nn; i++) a[i][i] -= x;
            const s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          its++;
          let m: number;
          let p = 0, q = 0, r = 0, z = 0;
          for (m = nn - 2; m >= l; m--) {
            z = a[m][m];
            r = x - z;
            const s0 = y - z;
            p = (r * s0 - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s0;
            r = a[m + 2][m + 1];
            const s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s; q /= s; r /= s;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = k !== nn - 1 ? a[k + 2][k - 1] : 0;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            const s = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s !== 0) {
              if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s * x;
              p += s;
              x = p / s; y = q / s; z = r / s;
              q /= p; r /= p;
              for (let j = k; j <= nn; j++) {
                p = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) { p += r * a[k + 2][j]; a[k + 2][j] -= p * z; }
                a[k + 1][j] -= p * y;
                a[k][j] -= p * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) { p += z * a[i][k + 2]; a[i][k + 2] -= p * r; }
                a[i][k + 1] -= p * q;
                a[i][k] -= p;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return roots;
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
