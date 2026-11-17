/**
 * Shared types for the face-scanning pipeline. Plain data only: everything here
 * can cross the worker boundary (structured clone) and be used in unit tests.
 */
import type { Face } from '../cube/cube-validator';

export interface Point {
  x: number;
  y: number;
}

/** Four corners in clockwise order on screen (y down), starting top-left. */
export type Quad = [Point, Point, Point, Point];

/** CIE L*a*b* in standard ranges: L 0–100, a and b roughly −128…127. */
export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** Exactly nine values, one per sticker, row-major as seen in the photo. */
export type Nine<T> = [T, T, T, T, T, T, T, T, T];

/** Label file stored next to each test photo (`name.jpg` + `name.json`). */
export interface ScanLabel {
  /** Which face of the cube the photo shows (its center sticker). */
  face: Face;
  /** Expected face letter of each sticker, row-major in kociemba orientation for that face. */
  stickers: Face[];
  /** Scramble the labels were generated from, if any. */
  scramble?: string;
}
