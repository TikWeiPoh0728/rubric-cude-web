/**
 * What the main thread and the Kociemba workers say to each other. Kept free of
 * cubejs so the main bundle does not pull the solver in.
 */

/**
 * A way of looking at the same cube. Different variants send the two-phase search
 * down different paths, so one that is slow on one variant is often fast on another.
 *  - `invert`: solve the inverse cube, then reverse the solution.
 *  - `prefix`: make this move first and solve what is left.
 */
export interface Variant {
  invert: boolean;
  prefix: string | null;
}

/** One per worker; the pool uses as many as the machine can run side by side. */
export const VARIANTS: readonly Variant[] = [
  { invert: false, prefix: null },
  { invert: true, prefix: null },
  { invert: false, prefix: 'U' },
  { invert: true, prefix: 'R' },
];

export interface SolveRequest {
  /** 54 characters in U R F D L B order. */
  facelets: string;
  variant: Variant;
}

export type SolveResponse =
  /** A valid solution, shorter than any this worker sent before. */
  | { type: 'solution'; moves: string[] }
  /** The worker has nothing more to try. */
  | { type: 'done' }
  | { type: 'error'; message: string };
