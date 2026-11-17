/** Small 2D / projective geometry helpers. Pure functions, no OpenCV. */
import type { Point, Quad } from './scan-types';

export const dist = (p: Point, q: Point): number => Math.hypot(p.x - q.x, p.y - q.y);

export function centroid(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/** Signed area (shoelace). Positive for clockwise order on screen (y down). */
export function signedArea(points: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Put four corners in a fixed order: clockwise on screen, starting with the
 * corner nearest the top-left (smallest x + y).
 */
export function orderQuad(points: readonly Point[]): Quad {
  const c = centroid(points);
  const sorted = [...points].sort(
    (p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x),
  );
  let start = 0;
  for (let i = 1; i < 4; i++) {
    if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  }
  return [0, 1, 2, 3].map(i => sorted[(start + i) % 4]) as Quad;
}

/** 3×3 matrix, row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function applyH(h: Mat3, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function mul3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv: Mat3 = [
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ];
  return inv.map(v => v / det) as Mat3;
}

/** Solve A x = b (n×n, row-major) by Gaussian elimination with partial pivoting. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      if (k !== 0) for (let c = col; c <= n; c++) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Similarity transform that moves the points' centroid to 0 and their mean distance to √2. */
function normalizer(points: readonly Point[]): Mat3 {
  const c = centroid(points);
  const meanDist = points.reduce((s, p) => s + dist(p, c), 0) / points.length || 1;
  const s = Math.SQRT2 / meanDist;
  return [s, 0, -s * c.x, 0, s, -s * c.y, 0, 0, 1];
}

/**
 * Least-squares homography mapping `from[i]` to `to[i]` (normalized DLT with h33 = 1).
 * Needs at least 4 pairs, not all on one line. Returns null if degenerate.
 */
export function fitHomography(from: readonly Point[], to: readonly Point[]): Mat3 | null {
  if (from.length < 4 || from.length !== to.length) return null;
  const tf = normalizer(from);
  const tt = normalizer(to);
  const f = from.map(p => applyH(tf, p));
  const t = to.map(p => applyH(tt, p));
  // Normal equations AᵀA h = Aᵀb for the 8 unknowns.
  const ata = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const atb = new Array(8).fill(0);
  const addRow = (row: number[], rhs: number) => {
    for (let i = 0; i < 8; i++) {
      atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) ata[i][j] += row[i] * row[j];
    }
  };
  for (let i = 0; i < f.length; i++) {
    const { x, y } = f[i];
    const { x: X, y: Y } = t[i];
    addRow([x, y, 1, 0, 0, 0, -X * x, -X * y], X);
    addRow([0, 0, 0, x, y, 1, -Y * x, -Y * y], Y);
  }
  const h = solveLinear(ata, atb);
  if (!h) return null;
  const hn = [...h, 1] as Mat3;
  const ttInv = invert3(tt);
  if (!ttInv) return null;
  const result = mul3(mul3(ttInv, hn), tf);
  return result.map(v => v / result[8]) as Mat3;
}

/** Even-odd point-in-polygon test. */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
