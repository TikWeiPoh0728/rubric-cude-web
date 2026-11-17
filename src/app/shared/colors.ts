import { Face } from '../core/cube/cube-validator';

/**
 * Display color for each face letter. The centers fix the scheme:
 * yellow on top (U), white on the bottom (D), green front (F), blue back (B),
 * orange right (R), red left (L).
 *
 * This is the standard white-top scheme turned 180° around the front-back axis.
 * It must stay a pure rotation: swapping only white and yellow would describe a
 * mirror-image cube, which does not exist. Only these display colors depend on the
 * scheme; the cube state stores face letters, so the validator and solver are unaffected.
 */
export const FACE_COLORS: Readonly<Record<Face, string>> = {
  U: '#f2d31c', // yellow
  D: '#f5f5f5', // white
  F: '#1fa84f', // green
  B: '#2468d6', // blue
  R: '#f28c1c', // orange
  L: '#d62f2f', // red
};

export const FACE_NAMES: Readonly<Record<Face, string>> = {
  U: 'Yellow', D: 'White', F: 'Green', B: 'Blue', R: 'Orange', L: 'Red',
};

/** Palette order shown in the UI. */
export const PALETTE: readonly Face[] = ['U', 'D', 'F', 'B', 'L', 'R'];

/** Color of an unfilled sticker. */
export const EMPTY_COLOR = '#6b7280';
