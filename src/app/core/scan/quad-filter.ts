/**
 * Step 2 of the pipeline, minus OpenCV: decide whether a simplified contour
 * looks like one sticker. The worker feeds it the output of approxPolyDP.
 */
import { centroid, dist, orderQuad, signedArea } from './geometry';
import type { Point, Quad } from './scan-types';

export interface QuadFilterOptions {
  /** Smallest sticker, as a fraction of the image area. */
  minAreaFrac: number;
  /** Largest sticker, as a fraction of the image area (a whole face is ~1/9 of this). */
  maxAreaFrac: number;
  /** Longest side pair / shortest side pair. Perspective stretches squares, so allow some slack. */
  maxAspect: number;
  /** Largest |cos| of any corner angle (0 = every corner exactly 90°). */
  maxCornerCos: number;
}

export const DEFAULT_QUAD_FILTER: QuadFilterOptions = {
  minAreaFrac: 0.002,
  maxAreaFrac: 0.12,
  maxAspect: 1.6,
  maxCornerCos: 0.45,
};

export type QuadVerdict = { ok: true; quad: Quad; area: number } | { ok: false; reason: string };

export function checkQuad(points: readonly Point[], imageArea: number, o: QuadFilterOptions): QuadVerdict {
  if (points.length !== 4) return { ok: false, reason: `${points.length} vertices` };
  const quad = orderQuad(points);
  const area = Math.abs(signedArea(quad));
  if (area < o.minAreaFrac * imageArea) return { ok: false, reason: 'too small' };
  if (area > o.maxAreaFrac * imageArea) return { ok: false, reason: 'too large' };
  if (!isConvex(quad)) return { ok: false, reason: 'not convex' };

  const sides = quad.map((p, i) => dist(p, quad[(i + 1) % 4]));
  const a = (sides[0] + sides[2]) / 2;
  const b = (sides[1] + sides[3]) / 2;
  if (Math.max(a, b) / Math.min(a, b) > o.maxAspect) return { ok: false, reason: 'aspect ratio' };

  for (let i = 0; i < 4; i++) {
    const prev = quad[(i + 3) % 4];
    const p = quad[i];
    const next = quad[(i + 1) % 4];
    const cos =
      ((prev.x - p.x) * (next.x - p.x) + (prev.y - p.y) * (next.y - p.y)) /
      (dist(prev, p) * dist(next, p));
    if (Math.abs(cos) > o.maxCornerCos) return { ok: false, reason: 'corner angle' };
  }
  return { ok: true, quad, area };
}

function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * Edge images give two nested contours per sticker (inside and outside of the
 * border line). Keep one square per spot: when two centers are closer than
 * `ratio` × the smaller square's side, keep the smaller (inner) one, which
 * hugs the sticker more tightly.
 */
export function dedupeQuads<T extends { quad: Quad; area: number }>(items: readonly T[], ratio = 0.5): T[] {
  const sorted = [...items].sort((a, b) => a.area - b.area);
  const kept: T[] = [];
  for (const item of sorted) {
    const c = centroid(item.quad);
    const side = Math.sqrt(item.area);
    const dup = kept.some(k => dist(centroid(k.quad), c) < ratio * Math.min(side, Math.sqrt(k.area)));
    if (!dup) kept.push(item);
  }
  return kept;
}
