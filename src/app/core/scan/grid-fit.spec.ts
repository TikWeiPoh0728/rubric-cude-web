import { describe, expect, it } from 'vitest';
import { applyH, dist, fitHomography, Mat3, orderQuad } from './geometry';
import { DEFAULT_GRID_FIT, fitGrid, GridFitSuccess, searchPitch } from './grid-fit';
import type { Point, Quad } from './scan-types';

/** Camera model for a synthetic face: grid coords (cell (r, c) center at (c, r)) → image. */
function camera(corners: [number, number][]): Mat3 {
  const grid = [
    { x: -0.5, y: -0.5 },
    { x: 2.5, y: -0.5 },
    { x: 2.5, y: 2.5 },
    { x: -0.5, y: 2.5 },
  ];
  return fitHomography(grid, corners.map(([x, y]) => ({ x, y })))!;
}

/** The sticker square of cell `i` (row-major), with half-size `s` in cells. */
function sticker(H: Mat3, i: number, s = 0.42): Quad {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return orderQuad([
    applyH(H, { x: c - s, y: r - s }),
    applyH(H, { x: c + s, y: r - s }),
    applyH(H, { x: c + s, y: r + s }),
    applyH(H, { x: c - s, y: r + s }),
  ]);
}

const FRONTAL: [number, number][] = [
  [100, 60],
  [220, 65],
  [215, 185],
  [95, 180],
];
const W = 320;
const H_IMG = 240;

function expectFace(fit: ReturnType<typeof fitGrid>, cam: Mat3, tolerance = 2): GridFitSuccess {
  if (!fit.ok) throw new Error(`expected a grid, got: ${fit.reason}`);
  for (let i = 0; i < 9; i++) {
    const truth = applyH(cam, { x: i % 3, y: Math.floor(i / 3) });
    expect(dist(fit.cellCenters[i], truth)).toBeLessThan(tolerance);
  }
  return fit;
}

describe('fitGrid', () => {
  it('fits all nine stickers of a frontal face', () => {
    const cam = camera(FRONTAL);
    const fit = expectFace(fitGrid([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => sticker(cam, i)), W, H_IMG), cam, 1);
    expect(fit.squares.every(s => s.status === 'inlier')).toBe(true);
    expect(fit.squares.map(s => s.row! * 3 + s.col!)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('labels cells by image position regardless of input order', () => {
    const cam = camera(FRONTAL);
    const order = [8, 3, 0, 5, 1];
    const fit = expectFace(fitGrid(order.map(i => sticker(cam, i)), W, H_IMG), cam);
    expect(fit.squares.map(s => s.row! * 3 + s.col!)).toEqual(order);
  });

  it('handles strong perspective', () => {
    const cam = camera([
      [80, 40],
      [250, 70],
      [235, 200],
      [95, 225],
    ]);
    expectFace(fitGrid([0, 2, 4, 5, 7].map(i => sticker(cam, i)), W, H_IMG), cam, 2.5);
  });

  it('handles a face rotated by 30°', () => {
    const c = { x: 160, y: 120 };
    const R = 70;
    const corners = [225, 315, 45, 135].map(deg => {
      const a = ((deg + 30) * Math.PI) / 180;
      return [c.x + R * Math.SQRT2 * Math.cos(a), c.y + R * Math.SQRT2 * Math.sin(a)] as [number, number];
    });
    const cam = camera(corners);
    const fit = fitGrid([0, 1, 3, 4, 8].map(i => sticker(cam, i)), W, H_IMG);
    expect(fit.ok).toBe(true);
  });

  it('works from only the four corner stickers (twice the pitch apart)', () => {
    const cam = camera(FRONTAL);
    expectFace(fitGrid([0, 2, 6, 8].map(i => sticker(cam, i)), W, H_IMG), cam);
  });

  it('works from a checkerboard of diagonal neighbours', () => {
    const cam = camera(FRONTAL);
    expectFace(fitGrid([0, 2, 4, 6, 8].map(i => sticker(cam, i)), W, H_IMG), cam);
  });

  it('works with small gaps (stickerless) and large gaps', () => {
    const cam = camera(FRONTAL);
    expectFace(fitGrid([0, 1, 4, 5, 8].map(i => sticker(cam, i, 0.49)), W, H_IMG), cam);
    expectFace(fitGrid([0, 1, 4, 5, 8].map(i => sticker(cam, i, 0.36)), W, H_IMG), cam);
  });

  it('rejects squares off the lattice and squares of the wrong size', () => {
    const cam = camera(FRONTAL);
    const off = sticker(cam, 4).map(p => ({ x: p.x + 18, y: p.y - 15 })) as Quad;
    const huge: Quad = [
      { x: 95, y: 60 },
      { x: 220, y: 60 },
      { x: 220, y: 185 },
      { x: 95, y: 185 },
    ];
    const quads = [sticker(cam, 0), sticker(cam, 2), sticker(cam, 6), sticker(cam, 8), off, huge];
    const fit = expectFace(fitGrid(quads, W, H_IMG), cam);
    expect(fit.squares[4].status).toBe('outlier');
    expect(fit.squares[5].status).toBe('size');
  });

  it('picks the window with the most squares when stray squares lie outside the face', () => {
    const cam = camera(FRONTAL);
    // A sticker of a neighbouring face, aligned with the lattice two cells to the right.
    const stray = sticker(cam, 2).map(p => ({ x: p.x + 2 * 40, y: p.y + 2 })) as Quad;
    const fit = expectFace(fitGrid([0, 1, 3, 4, 6].map(i => sticker(cam, i)).concat([stray]), W, H_IMG), cam);
    expect(fit.squares[5].status).toBe('outside-window');
  });

  it('breaks ties (an undetected column) with edge evidence', () => {
    const cam = camera(FRONTAL);
    const inv = fitHomography(
      [0, 1, 2, 3].map(i => applyH(cam, { x: i % 2, y: Math.floor(i / 2) })),
      [0, 1, 2, 3].map(i => ({ x: i % 2, y: Math.floor(i / 2) })),
    )!;
    // Edges exist on the gap lines inside the true face only.
    const edgeAt = (x: number, y: number) => {
      const g = applyH(inv, { x, y });
      const inside = g.x > -0.6 && g.x < 2.6 && g.y > -0.6 && g.y < 2.6;
      const onGap = Math.abs(g.x - Math.round(g.x + 0.5) + 0.5) < 0.08 || Math.abs(g.y - Math.round(g.y + 0.5) + 0.5) < 0.08;
      return inside && onGap ? 1 : 0;
    };
    // Only the left two columns detected: the window could also start one column further left.
    const quads = [0, 1, 3, 4, 6, 7].map(i => sticker(cam, i));
    const fit = expectFace(fitGrid(quads, W, H_IMG, DEFAULT_GRID_FIT, edgeAt), cam);
    expect(fit.candidates.length).toBeGreaterThan(1);
    expect(fit.candidates[0].edge).toBeGreaterThan(fit.candidates[1].edge);
  });

  it('fails clearly with too few squares', () => {
    const cam = camera(FRONTAL);
    const fit = fitGrid([0, 4, 8].map(i => sticker(cam, i)), W, H_IMG);
    expect(fit.ok).toBe(false);
    if (!fit.ok) expect(fit.reason).toContain('need 4');
  });

  it('returns corners in TL, TR, BR, BL order', () => {
    const cam = camera(FRONTAL);
    const fit = expectFace(fitGrid([0, 1, 2, 3, 4].map(i => sticker(cam, i)), W, H_IMG), cam);
    FRONTAL.forEach(([x, y], i) => expect(dist(fit.corners[i], { x, y })).toBeLessThan(2));
  });
});

describe('searchPitch', () => {
  it('finds the spacing from multiples, not half of it', () => {
    const side = 30;
    const pitch = 34;
    const offsets = [pitch, 2 * pitch, -pitch, 2 * pitch, 0, 0.5];
    expect(searchPitch(offsets, side, DEFAULT_GRID_FIT)).toBeCloseTo(pitch, 0);
  });

  it('falls back to a typical spacing when there is no information', () => {
    expect(searchPitch([0, 1, -1], 30, DEFAULT_GRID_FIT)).toBeCloseTo(33.6, 1);
  });
});

describe('geometry used by the fit', () => {
  it('fits an exact homography from 4 points', () => {
    const from: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const to: Point[] = [
      { x: 10, y: 20 },
      { x: 110, y: 30 },
      { x: 100, y: 140 },
      { x: 5, y: 120 },
    ];
    const h = fitHomography(from, to)!;
    from.forEach((p, i) => expect(dist(applyH(h, p), to[i])).toBeLessThan(1e-6));
  });

  it('orders quad corners clockwise from the top-left', () => {
    const q = orderQuad([
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(q).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });
});
