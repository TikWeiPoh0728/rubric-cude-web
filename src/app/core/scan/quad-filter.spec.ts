import { describe, expect, it } from 'vitest';
import { checkQuad, dedupeQuads, DEFAULT_QUAD_FILTER } from './quad-filter';
import type { Point } from './scan-types';

const AREA = 320 * 240;
const square = (x: number, y: number, s: number): Point[] => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('checkQuad', () => {
  it('accepts a sticker-sized square in any vertex order', () => {
    const pts = square(50, 50, 30);
    const v = checkQuad([pts[2], pts[0], pts[3], pts[1]], AREA, DEFAULT_QUAD_FILTER);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.quad[0]).toEqual({ x: 50, y: 50 });
  });

  it('accepts a moderately foreshortened square', () => {
    const v = checkQuad(
      [
        { x: 0, y: 0 },
        { x: 40, y: 4 },
        { x: 38, y: 34 },
        { x: 2, y: 30 },
      ],
      AREA,
      DEFAULT_QUAD_FILTER,
    );
    expect(v.ok).toBe(true);
  });

  it.each([
    ['vertex count', square(0, 0, 30).slice(0, 3), '3 vertices'],
    ['tiny', square(0, 0, 5), 'too small'],
    ['whole image', square(0, 0, 200), 'too large'],
    [
      'long rectangle',
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 25 },
        { x: 0, y: 25 },
      ],
      'aspect ratio',
    ],
    [
      'rhombus',
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 70, y: 35 },
        { x: 30, y: 35 },
      ],
      'corner angle',
    ],
  ])('rejects %s', (_name, pts, reason) => {
    const v = checkQuad(pts as Point[], AREA, DEFAULT_QUAD_FILTER);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe(reason);
  });
});

describe('dedupeQuads', () => {
  it('keeps the inner of two nested contours of one sticker, and separate stickers', () => {
    const mk = (x: number, y: number, s: number) => {
      const v = checkQuad(square(x, y, s), AREA, DEFAULT_QUAD_FILTER);
      if (!v.ok) throw new Error(v.reason);
      return v;
    };
    const outer = mk(48, 48, 34);
    const inner = mk(50, 50, 30);
    const other = mk(90, 50, 30);
    const kept = dedupeQuads([outer, inner, other]);
    expect(kept).toHaveLength(2);
    expect(kept).toContain(inner);
    expect(kept).toContain(other);
  });
});
