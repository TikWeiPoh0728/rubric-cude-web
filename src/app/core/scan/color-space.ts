import type { Lab } from './scan-types';

/**
 * OpenCV's 8-bit Lab (COLOR_RGB2Lab on CV_8UC3) packs the channels into 0–255:
 * L is scaled by 255/100 and a, b are offset by 128. Undo that so distances are
 * in standard CIE units.
 */
export function fromOpenCvLab(l8: number, a8: number, b8: number): Lab {
  return { L: (l8 * 100) / 255, a: a8 - 128, b: b8 - 128 };
}

/** Euclidean distance in Lab (CIE76 ΔE). */
export function deltaE76(p: Lab, q: Lab): number {
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}
