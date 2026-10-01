/** Complex arithmetic, real-polynomial algebra and root-list parsing: the input-handling layer of the control studios. */
export type Complex = { re: number; im: number };

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

