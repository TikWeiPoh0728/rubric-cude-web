/**
 * Step 5: read one color per cell from the warped, square face image.
 * Uses the inner part of each cell (away from the gaps and sticker edges), skips glare
 * pixels and takes the per-channel median. Pure TS over an RGBA buffer.
 */

export interface SamplingOptions {
  /** Side of the sampled square as a fraction of the cell side (0.5 = inner 50%). */
  inner: number;
  /** A pixel is glare if its HSV value is at least this (0–255)… */
  glareMinValue: number;
  /** …and its HSV saturation is at most this (0–255). */
  glareMaxSaturation: number;
  /** If less than this fraction of pixels survive the glare filter, use all pixels instead. */
  minCoverage: number;
}

export const DEFAULT_SAMPLING: SamplingOptions = {
  inner: 0.5,
  glareMinValue: 230,
  glareMaxSaturation: 35,
  minCoverage: 0.15,
};

export interface CellSample {
  /** Median color, 0–255 per channel. */
  rgb: [number, number, number];
  /** Fraction of the sampled pixels that were kept (not glare). */
  coverage: number;
  /** True when glare covered nearly everything and all pixels were used anyway. */
  glareFallback: boolean;
  /** The sampled region in warped-image pixels. */
  box: { x: number; y: number; w: number; h: number };
}

/** Value and saturation of HSV, both 0–255 (same scale as OpenCV's 8-bit HSV). */
export function valueSaturation(r: number, g: number, b: number): { v: number; s: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return { v: max, s: max === 0 ? 0 : Math.round(((max - min) * 255) / max) };
}

export function isGlare(r: number, g: number, b: number, o: SamplingOptions): boolean {
  const { v, s } = valueSaturation(r, g, b);
  return v >= o.glareMinValue && s <= o.glareMaxSaturation;
}

/** Median of a 256-bin histogram holding `count` values. */
function histMedian(hist: Uint32Array, count: number): number {
  const half = (count - 1) / 2;
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += hist[i];
    if (seen > half) return i;
  }
  return 255;
}

/**
 * @param rgba warped face, `size`×`size`, 4 bytes per pixel
 * @returns 9 samples, row-major
 */
export function sampleCells(
  rgba: ArrayLike<number>,
  size: number,
  o: SamplingOptions = DEFAULT_SAMPLING,
): CellSample[] {
  const cell = size / 3;
  const side = Math.max(1, Math.round(cell * o.inner));
  const samples: CellSample[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x0 = Math.round(c * cell + (cell - side) / 2);
      const y0 = Math.round(r * cell + (cell - side) / 2);
      const kept = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      const all = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      let keptCount = 0;
      let total = 0;
      for (let y = y0; y < y0 + side; y++) {
        for (let x = x0; x < x0 + side; x++) {
          const i = (y * size + x) * 4;
          const R = rgba[i];
          const G = rgba[i + 1];
          const B = rgba[i + 2];
          all[0][R]++;
          all[1][G]++;
          all[2][B]++;
          total++;
          if (!isGlare(R, G, B, o)) {
            kept[0][R]++;
            kept[1][G]++;
            kept[2][B]++;
            keptCount++;
          }
        }
      }
      const coverage = total ? keptCount / total : 0;
      const glareFallback = coverage < o.minCoverage;
      const [hist, n] = glareFallback ? [all, total] : [kept, keptCount];
      samples.push({
        rgb: [histMedian(hist[0], n), histMedian(hist[1], n), histMedian(hist[2], n)],
        coverage,
        glareFallback,
        box: { x: x0, y: y0, w: side, h: side },
      });
    }
  }
  return samples;
}
