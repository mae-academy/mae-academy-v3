/**
 * Eigenvalues of a small dense real matrix: elimination to upper-Hessenberg form followed by the Francis
 * double-shift QR iteration (EISPACK `elmhes` + `hqr`). Used for the DC loop-gain stability test of op-amp
 * feedback networks, where the matrix is at most a handful of rows.
 */
export interface ComplexEigenvalue { re: number; im: number }

export function eigenvalues(input: number[][]): ComplexEigenvalue[] {
  const n = input.length;
  if (!n) return [];
  // 1-based working copy keeps the published algorithm readable.
  const a: number[][] = Array.from({ length: n + 2 }, () => Array<number>(n + 2).fill(0));
  for (let i = 1; i <= n; i += 1) for (let j = 1; j <= n; j += 1) a[i][j] = input[i - 1][j - 1];

  // ── Reduce to upper Hessenberg form by stabilised elementary similarity transformations ─────────────
  for (let m = 2; m < n; m += 1) {
    let x = 0; let i = m;
    for (let j = m; j <= n; j += 1) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j <= n; j += 1) [a[i][j], a[m][j]] = [a[m][j], a[i][j]];
      for (let j = 1; j <= n; j += 1) [a[j][i], a[j][m]] = [a[j][m], a[j][i]];
    }
    if (x !== 0) {
      for (i = m + 1; i <= n; i += 1) {
        let y = a[i][m - 1];
        if (y !== 0) {
          y /= x;
          a[i][m - 1] = y;
          for (let j = m; j <= n; j += 1) a[i][j] -= y * a[m][j];
          for (let j = 1; j <= n; j += 1) a[j][m] += y * a[j][i];
        }
      }
    }
  }
  for (let i = 3; i <= n; i += 1) for (let j = 1; j <= i - 2; j += 1) a[i][j] = 0;

  // ── Francis double-shift QR on the Hessenberg matrix ────────────────────────────────────────────────
  const wr = Array<number>(n + 1).fill(0);
  const wi = Array<number>(n + 1).fill(0);
  let anorm = 0;
  for (let i = 1; i <= n; i += 1) for (let j = Math.max(i - 1, 1); j <= n; j += 1) anorm += Math.abs(a[i][j]);
  let nn = n; let t = 0;
  const sign = (magnitude: number, reference: number) => (reference >= 0 ? Math.abs(magnitude) : -Math.abs(magnitude));
  while (nn >= 1) {
    let its = 0; let l: number;
    do {
      for (l = nn; l >= 2; l -= 1) {
        const s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]) || anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      let x = a[nn][nn];
      if (l === nn) {
        wr[nn] = x + t; wi[nn] = 0; nn -= 1;
      } else {
        let y = a[nn - 1][nn - 1];
        let w = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          const p = 0.5 * (y - x);
          const q = p * p + w;
          let z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + sign(z, p);
            wr[nn - 1] = wr[nn] = x + z;
            if (z !== 0) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = z; wi[nn] = -z;
          }
          nn -= 2;
        } else {
          if (its >= 60) throw new Error('eigenvalues: QR iteration did not converge');
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 1; i <= nn; i += 1) a[i][i] -= x;
            const s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          its += 1;
          let m: number; let p = 0; let q = 0; let r = 0; let z: number;
          for (m = nn - 2; m >= l; m -= 1) {
            z = a[m][m];
            r = x - z;
            const s2 = y - z;
            p = (r * s2 - w) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s2;
            r = a[m + 2][m + 1];
            const scale = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= scale; q /= scale; r /= scale;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i += 1) {
            a[i][i - 2] = 0;
            if (i !== m + 2) a[i][i - 3] = 0;
          }
          for (let k = m; k <= nn - 1; k += 1) {
            if (k !== m) {
              p = a[k][k - 1];
              q = a[k + 1][k - 1];
              r = k !== nn - 1 ? a[k + 2][k - 1] : 0;
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            const s3 = sign(Math.sqrt(p * p + q * q + r * r), p);
            if (s3 !== 0) {
              if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; } else a[k][k - 1] = -s3 * x;
              p += s3;
              x = p / s3; y = q / s3; z = r / s3;
              q /= p; r /= p;
              for (let j = k; j <= nn; j += 1) {
                let pp = a[k][j] + q * a[k + 1][j];
                if (k !== nn - 1) { pp += r * a[k + 2][j]; a[k + 2][j] -= pp * z; }
                a[k + 1][j] -= pp * y;
                a[k][j] -= pp * x;
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i += 1) {
                let pp = x * a[i][k] + y * a[i][k + 1];
                if (k !== nn - 1) { pp += z * a[i][k + 2]; a[i][k + 2] -= pp * r; }
                a[i][k + 1] -= pp * q;
                a[i][k] -= pp;
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return Array.from({ length: n }, (_, index) => ({ re: wr[index + 1], im: wi[index + 1] }));
}

/** Largest real part among the eigenvalues (−Infinity for an empty matrix). */
export function spectralAbscissa(matrix: number[][]): number {
  return eigenvalues(matrix).reduce((maximum, value) => Math.max(maximum, value.re), -Infinity);
}
