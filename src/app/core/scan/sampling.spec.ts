import { describe, expect, it } from 'vitest';
import { fromOpenCvLab } from './color-space';
import { DEFAULT_SAMPLING, isGlare, sampleCells } from './sampling';

/** size×size RGBA image where each cell is a flat color, painted by `paint`. */
function face(size: number, paint: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y);
      buf.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return buf;
}

const COLORS: [number, number, number][] = [
  [200, 30, 40],
  [30, 160, 70],
  [30, 90, 200],
  [240, 210, 30],
  [245, 130, 30],
  [235, 235, 230],
  [10, 10, 10],
  [128, 64, 32],
  [60, 200, 200],
];

describe('sampleCells', () => {
  it('returns the color of each cell, row-major', () => {
    const size = 90;
    const buf = face(size, (x, y) => COLORS[Math.floor(y / 30) * 3 + Math.floor(x / 30)]);
    const cells = sampleCells(buf, size);
    expect(cells.map(c => c.rgb)).toEqual(COLORS);
    expect(cells[0].box).toEqual({ x: 8, y: 8, w: 15, h: 15 });
  });

  it('ignores the cell borders (only the inner 50% is read)', () => {
    const size = 90;
    // Black 6px border around every cell, red inside.
    const buf = face(size, (x, y) => {
      const ix = x % 30;
      const iy = y % 30;
      return ix < 6 || ix >= 24 || iy < 6 || iy >= 24 ? [0, 0, 0] : [200, 30, 40];
    });
    expect(sampleCells(buf, size).every(c => c.rgb.join() === '200,30,40')).toBe(true);
  });

  it('skips glare pixels and reports coverage', () => {
    const size = 90;
    // Top-left cell: blue with a glare blob over 40% of its inner area.
    const buf = face(size, (x, y) => (x >= 8 && x < 14 && y >= 8 && y < 23 ? [255, 255, 255] : [30, 90, 200]));
    const [cell] = sampleCells(buf, size);
    expect(cell.rgb).toEqual([30, 90, 200]);
    expect(cell.coverage).toBeCloseTo(0.6, 2);
    expect(cell.glareFallback).toBe(false);
  });

  it('falls back to all pixels when glare covers almost everything (e.g. a white sticker)', () => {
    const size = 90;
    const buf = face(size, () => [245, 245, 245]);
    const [cell] = sampleCells(buf, size);
    expect(cell.glareFallback).toBe(true);
    expect(cell.rgb).toEqual([245, 245, 245]);
  });

  it('defines glare as bright and unsaturated', () => {
    expect(isGlare(250, 250, 250, DEFAULT_SAMPLING)).toBe(true);
    expect(isGlare(250, 220, 20, DEFAULT_SAMPLING)).toBe(false); // bright yellow is a color
    expect(isGlare(150, 150, 150, DEFAULT_SAMPLING)).toBe(false);
  });
});

describe('fromOpenCvLab', () => {
  it('maps OpenCV 8-bit Lab to standard ranges', () => {
    // cv.cvtColor(RGB2Lab) of pure red (255, 0, 0) gives [136, 208, 195];
    // the standard value is about (53.2, 80.1, 67.2).
    const lab = fromOpenCvLab(136, 208, 195);
    expect(lab.L).toBeCloseTo(53.3, 1);
    expect(lab.a).toBe(80);
    expect(lab.b).toBe(67);
    expect(fromOpenCvLab(255, 128, 128)).toEqual({ L: 100, a: 0, b: 0 });
  });
});
