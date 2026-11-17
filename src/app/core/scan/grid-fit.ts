/**
 * Step 3: fit a 3×3 sticker grid from however many sticker squares were found.
 *
 * White-bodied and stickerless cubes rarely give a clean contour for all nine
 * stickers, so nothing here requires them. The idea:
 *   1. Directions: every detected square gives the two lattice directions from its
 *      edges. Average them into û (the more horizontal one, pointing right) and
 *      v̂ (pointing down).
 *   2. Pitch: search for the cell spacing along each direction that puts all pairwise
 *      center offsets closest to whole numbers of cells. It is searched within a range
 *      tied to the sticker size, so half or double the true pitch cannot win.
 *      This works even when only diagonal or far-apart squares are found.
 *   3. Integer coordinates: express each center relative to the most central square
 *      and round. Squares that land far from a lattice point are outliers.
 *   4. Homography: least-squares fit from lattice coordinates to image points using
 *      every inlier's center and four corners, then re-assign coordinates through it
 *      (handles perspective) and refit.
 *   5. Window: choose the 3×3 block that holds the most inliers; ties (a whole row or
 *      column undetected) are broken by edge evidence around each cell, how central
 *      the face is, and whether it stays inside the image.
 * Pure TS: unit-testable with synthetic quads.
 */
import { applyH, centroid, dist, fitHomography, invert3, Mat3, median, mul3 } from './geometry';
import type { Point, Quad } from './scan-types';

export interface GridFitOptions {
  /** Fewest inlier squares needed to trust a fit. */
  minSquares: number;
  /** Squares whose side differs from the median by more than this factor are dropped. */
  sizeTolerance: number;
  /** Allowed cell spacing, as a multiple of the median sticker side. */
  minPitchRatio: number;
  maxPitchRatio: number;
  /** Largest distance from a lattice point (in cells) for a square to count as an inlier. */
  maxResidual: number;
}

export const DEFAULT_GRID_FIT: GridFitOptions = {
  minSquares: 4,
  sizeTolerance: 1.6,
  minPitchRatio: 0.95,
  maxPitchRatio: 1.6,
  maxResidual: 0.3,
};

export type SquareStatus = 'inlier' | 'outlier' | 'size' | 'outside-window' | 'duplicate';

export interface GridSquare {
  center: Point;
  status: SquareStatus;
  /** Cell in the final 3×3 window (0–2), when the square is an inlier. */
  row?: number;
  col?: number;
  /** Distance from the nearest lattice point, in cells. */
  residual?: number;
}

export interface WindowCandidate {
  /** Offset of the window in anchor lattice coordinates. */
  col0: number;
  row0: number;
  inliers: number;
  corners: Quad;
  /** Final score and its parts (higher is better). */
  score: number;
  edge: number;
  centrality: number;
  outside: number;
}

export interface GridFitSuccess {
  ok: true;
  /** Outer corners of the face: top-left, top-right, bottom-right, bottom-left. */
  corners: Quad;
  /** Image position of each cell center, row-major. */
  cellCenters: Point[];
  /** Homography from grid coordinates (cell (r, c) center at x = c, y = r) to image pixels. */
  homography: Mat3;
  squares: GridSquare[];
  candidates: WindowCandidate[];
  /** Estimated spacing in pixels along û and v̂, and the directions themselves. */
  pitch: { u: number; v: number };
  directions: { u: Point; v: Point };
}

export interface GridFitFailure {
  ok: false;
  reason: string;
  squares: GridSquare[];
}

export type GridFit = GridFitSuccess | GridFitFailure;

/** Edge strength in [0, 1] at an image pixel, used to break window ties. */
export type EdgeSampler = (x: number, y: number) => number;

const add = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });
const sub = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });
const scale = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
const dot = (p: Point, q: Point): number => p.x * q.x + p.y * q.y;
const norm = (p: Point): Point => scale(p, 1 / (Math.hypot(p.x, p.y) || 1));
const frac = (x: number): number => x - Math.round(x);

export function fitGrid(
  quads: readonly Quad[],
  width: number,
  height: number,
  options: GridFitOptions = DEFAULT_GRID_FIT,
  edgeAt?: EdgeSampler,
): GridFit {
  const o = options;
  const centers = quads.map(q => centroid(q));
  const sides = quads.map(q => q.reduce((s, p, i) => s + dist(p, q[(i + 1) % 4]), 0) / 4);
  const squares: GridSquare[] = centers.map(center => ({ center, status: 'outlier' }));
  const fail = (reason: string): GridFitFailure => ({ ok: false, reason, squares });

  if (quads.length < o.minSquares) return fail(`only ${quads.length} square(s) found, need ${o.minSquares}`);

  // Drop squares far from the typical size (a whole face, a speck of noise).
  const medSide = median(sides);
  const used: number[] = [];
  sides.forEach((s, i) => {
    if (s > medSide * o.sizeTolerance || s < medSide / o.sizeTolerance) squares[i].status = 'size';
    else used.push(i);
  });
  if (used.length < o.minSquares) return fail(`only ${used.length} squares of a consistent size`);

  // 1. Directions from the square edges.
  const { u: uHat, v: vHat } = latticeDirections(used.map(i => quads[i]));
  const basisInv = inverse2(uHat, vHat);
  if (!basisInv) return fail('square edges are degenerate');
  const toBasis = (d: Point): Point => ({
    x: basisInv[0] * d.x + basisInv[1] * d.y,
    y: basisInv[2] * d.x + basisInv[3] * d.y,
  });

  // 2. Pitch along each direction.
  const du: number[] = [];
  const dv: number[] = [];
  for (let a = 0; a < used.length; a++) {
    for (let b = a + 1; b < used.length; b++) {
      const d = toBasis(sub(centers[used[b]], centers[used[a]]));
      du.push(d.x);
      dv.push(d.y);
    }
  }
  const pu = searchPitch(du, medSide, o);
  const pv = searchPitch(dv, medSide, o);

  // 3. Integer lattice coordinates relative to an anchor square. Every square is tried
  //    as the anchor (a false positive must not be able to spoil the fit); the one that
  //    puts the most squares on the lattice wins, then the lowest total residual, then
  //    the most central.
  const mid = centroid(used.map(i => centers[i]));
  const relativeTo = (anchorIndex: number) => (i: number): Point => {
    const d = toBasis(sub(centers[i], centers[anchorIndex]));
    return { x: d.x / pu, y: d.y / pv };
  };
  let anchor = used[0];
  let bestScore = -Infinity;
  const diag = Math.hypot(width, height);
  for (const a of used) {
    const cells = assignCells(used, relativeTo(a), o.maxResidual, squares);
    const residual = [...cells.keys()].reduce((s, i) => s + (squares[i].residual ?? 0), 0);
    // Inlier count dominates (residual sum < 0.3 per square); centrality only breaks exact ties.
    const score = cells.size * 100 - residual - (0.01 * dist(centers[a], mid)) / diag;
    if (score > bestScore) {
      bestScore = score;
      anchor = a;
    }
  }
  const affine = relativeTo(anchor);
  let position = affine;
  let coords = assignCells(used, position, o.maxResidual, squares);
  if (coords.size < o.minSquares) return fail(`only ${coords.size} squares line up on a grid`);

  // Half-size of a sticker in cells, along each axis, from the affine model.
  const half = (proj: (p: Point) => Point) => {
    const hx: number[] = [];
    const hy: number[] = [];
    for (const i of coords.keys()) {
      const c = proj(centers[i]);
      for (const p of quads[i]) {
        const q = proj(p);
        hx.push(Math.abs(q.x - c.x));
        hy.push(Math.abs(q.y - c.y));
      }
    }
    return { x: median(hx), y: median(hy) };
  };
  const affinePoint = (p: Point): Point => {
    const d = toBasis(sub(p, centers[anchor]));
    return { x: d.x / pu, y: d.y / pv };
  };
  let h = half(affinePoint);

  // 4. Homography, refined twice by re-assigning cells through it.
  let H: Mat3 | null = null;
  for (let iter = 0; iter < 3; iter++) {
    H = fitFromCells(coords, centers, quads, h);
    if (!H) return fail('could not fit a homography (squares are degenerate)');
    if (iter === 2) break;
    const Hinv = invert3(H);
    if (!Hinv) break;
    const viaH = (i: number) => applyH(Hinv, centers[i]);
    const next = assignCells(used, viaH, o.maxResidual, squares);
    if (next.size < o.minSquares) break;
    position = viaH;
    coords = next;
    h = half(p => applyH(Hinv, p));
  }
  if (!H) return fail('could not fit a homography');
  // Statuses must describe the assignment actually used (a rejected pass may have changed them).
  coords = assignCells(used, position, o.maxResidual, squares);

  // 5. Choose the 3×3 window.
  const cols = [...coords.values()].map(c => c.x);
  const rows = [...coords.values()].map(c => c.y);
  const candidates: WindowCandidate[] = [];
  for (let col0 = Math.min(...cols) - 2; col0 <= Math.max(...cols); col0++) {
    for (let row0 = Math.min(...rows) - 2; row0 <= Math.max(...rows); row0++) {
      let inliers = 0;
      for (const c of coords.values()) {
        if (c.x >= col0 && c.x <= col0 + 2 && c.y >= row0 && c.y <= row0 + 2) inliers++;
      }
      candidates.push(scoreWindow(H, col0, row0, inliers, width, height, edgeAt));
    }
  }
  const most = Math.max(...candidates.map(c => c.inliers));
  const tied = candidates.filter(c => c.inliers === most).sort((a, b) => b.score - a.score);
  const best = tied[0];
  if (best.inliers < o.minSquares) return fail(`best 3×3 window holds only ${best.inliers} squares`);

  // Grid coordinates of the chosen window: shift so its top-left cell is (0, 0).
  const shift: Mat3 = [1, 0, best.col0, 0, 1, best.row0, 0, 0, 1];
  const Hw = mul3(H, shift);
  for (const [i, c] of coords) {
    const col = c.x - best.col0;
    const row = c.y - best.row0;
    if (col < 0 || col > 2 || row < 0 || row > 2) {
      squares[i].status = 'outside-window';
    } else {
      squares[i].row = row;
      squares[i].col = col;
    }
  }
  const cellCenters: Point[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cellCenters.push(applyH(Hw, { x: c, y: r }));

  return {
    ok: true,
    corners: best.corners,
    cellCenters,
    homography: Hw,
    squares,
    candidates: tied,
    pitch: { u: pu, v: pv },
    directions: { u: uHat, v: vHat },
  };
}

/**
 * The two lattice directions, averaged over every square's edges. û is the more
 * horizontal one and points right; v̂ points down.
 */
export function latticeDirections(quads: readonly Quad[]): { u: Point; v: Point } {
  const edgePairs = quads.map(q => {
    // Opposite sides averaged: top/bottom and left/right of the ordered quad.
    const e1 = scale(add(sub(q[1], q[0]), sub(q[2], q[3])), 0.5);
    const e2 = scale(add(sub(q[3], q[0]), sub(q[2], q[1])), 0.5);
    return [norm(e1), norm(e2)];
  });
  const ref = edgePairs[0][0];
  const refPerp = { x: -ref.y, y: ref.x };
  let u = { x: 0, y: 0 };
  let v = { x: 0, y: 0 };
  for (const [e1, e2] of edgePairs) {
    // Which of this square's edges runs along the reference direction?
    const [along, across] = Math.abs(dot(e1, ref)) >= Math.abs(dot(e2, ref)) ? [e1, e2] : [e2, e1];
    u = add(u, scale(along, Math.sign(dot(along, ref)) || 1));
    v = add(v, scale(across, Math.sign(dot(across, refPerp)) || 1));
  }
  u = norm(u);
  v = norm(v);
  if (Math.abs(u.x) < Math.abs(v.x)) [u, v] = [v, u];
  if (u.x < 0) u = scale(u, -1);
  if (v.y < 0) v = scale(v, -1);
  return { u, v };
}

/** Inverse of the 2×2 matrix whose columns are u and v, row-major. */
function inverse2(u: Point, v: Point): [number, number, number, number] | null {
  const det = u.x * v.y - v.x * u.y;
  if (Math.abs(det) < 1e-6) return null;
  return [v.y / det, -v.x / det, -u.y / det, u.x / det];
}

/**
 * Spacing that makes the offsets closest to whole multiples, searched in a range
 * tied to the sticker side so that half or double the true spacing cannot win.
 * With no information (every offset ~0, e.g. a single column) it returns the middle
 * of the plausible range.
 */
export function searchPitch(offsets: readonly number[], side: number, o: GridFitOptions): number {
  const informative = offsets.filter(d => Math.abs(d) > 0.5 * side);
  const lo = o.minPitchRatio * side;
  const hi = o.maxPitchRatio * side;
  const typical = 1.12 * side;
  if (informative.length === 0) return typical;
  let best = typical;
  let bestCost = Infinity;
  const steps = 200;
  for (let s = 0; s <= steps; s++) {
    const p = lo + ((hi - lo) * s) / steps;
    let cost = 0;
    for (const d of informative) cost += frac(d / p) ** 2;
    // A tiny pull towards the typical spacing breaks exact ties.
    cost += 1e-4 * ((p - typical) / side) ** 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }
  return best;
}

/** Round each square's lattice position; keep inliers, one square per cell (the closest). */
function assignCells(
  indices: readonly number[],
  position: (i: number) => Point,
  maxResidual: number,
  squares: GridSquare[],
): Map<number, Point> {
  const byCell = new Map<string, { i: number; cell: Point; residual: number }>();
  for (const i of indices) {
    const p = position(i);
    const cell = { x: Math.round(p.x), y: Math.round(p.y) };
    const residual = Math.hypot(p.x - cell.x, p.y - cell.y);
    squares[i].residual = residual;
    if (residual > maxResidual) {
      squares[i].status = 'outlier';
      continue;
    }
    const key = `${cell.x},${cell.y}`;
    const prev = byCell.get(key);
    if (prev && prev.residual <= residual) {
      squares[i].status = 'duplicate';
      continue;
    }
    if (prev) squares[prev.i].status = 'duplicate';
    squares[i].status = 'inlier';
    byCell.set(key, { i, cell, residual });
  }
  return new Map([...byCell.values()].map(e => [e.i, e.cell]));
}

/** Least-squares homography from lattice coordinates to the image, using centers and corners. */
function fitFromCells(
  coords: Map<number, Point>,
  centers: readonly Point[],
  quads: readonly Quad[],
  h: Point,
): Mat3 | null {
  const from: Point[] = [];
  const to: Point[] = [];
  // Corner order of an ordered quad is TL, TR, BR, BL; in lattice terms (−,−) (+,−) (+,+) (−,+).
  const signs = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const [i, cell] of coords) {
    from.push(cell);
    to.push(centers[i]);
    quads[i].forEach((p, k) => {
      from.push({ x: cell.x + signs[k][0] * h.x, y: cell.y + signs[k][1] * h.y });
      to.push(p);
    });
  }
  return fitHomography(from, to);
}

function scoreWindow(
  H: Mat3,
  col0: number,
  row0: number,
  inliers: number,
  width: number,
  height: number,
  edgeAt?: EdgeSampler,
): WindowCandidate {
  const at = (x: number, y: number) => applyH(H, { x: col0 + x, y: row0 + y });
  const corners: Quad = [at(-0.5, -0.5), at(2.5, -0.5), at(2.5, 2.5), at(-0.5, 2.5)];
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;

  const outside = corners.filter(p => !inside(p)).length / 4;
  const center = at(1, 1);
  const centrality = 1 - Math.min(1, dist(center, { x: width / 2, y: height / 2 }) / (Math.hypot(width, height) / 2));

  // Edge evidence: how much of each cell's outline (the gap lines around it) has edges.
  let edge = 0;
  if (edgeAt) {
    let hits = 0;
    let samples = 0;
    const n = 8;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        for (let s = 0; s < n; s++) {
          const t = -0.5 + (s + 0.5) / n;
          for (const [x, y] of [
            [c + t, r - 0.5],
            [c + t, r + 0.5],
            [c - 0.5, r + t],
            [c + 0.5, r + t],
          ]) {
            const p = at(x, y);
            samples++;
            if (inside(p)) hits += edgeAt(p.x, p.y);
          }
        }
      }
    }
    edge = hits / samples;
  }
  const score = edge + 0.5 * centrality - outside;
  return { col0, row0, inliers, corners, score, edge, centrality, outside };
}
