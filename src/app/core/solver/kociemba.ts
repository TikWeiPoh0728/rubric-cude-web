import Cube from './vendor/cubejs/index';
import { invertAlgorithm } from '../cube/cube-moves';
import type { Variant } from './kociemba-protocol';

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

/** Depth limit of the first search. Always finishes in well under a second, and gives at most 21 moves. */
const QUICK_DEPTH = 21;

let tablesReady = false;

/** Build the pruning tables once. Takes seconds, so this only ever runs inside a worker. */
function ensureTables(): void {
  if (!tablesReady) {
    Cube.initSolver();
    tablesReady = true;
  }
}

const split = (alg: string): string[] => (alg.trim() === '' ? [] : alg.trim().split(/\s+/));

/**
 * A good solution, fast: Kociemba's two-phase search with a depth limit of 21.
 * @param facelets 54-character string in U R F D L B order (our facelet array joined).
 * @returns moves in standard notation, e.g. ["R", "U'", "F2"]; empty if already solved.
 */
export function solveQuick(facelets: string): string[] {
  // cubejs starts its search at depth 1, so it never reports "already solved"
  // and instead returns a pointless sequence. Answer that case ourselves.
  if (facelets === SOLVED) return [];
  ensureTables();
  return split(Cube.fromString(facelets).solve(QUICK_DEPTH));
}

/**
 * Keep asking for a solution one move shorter than the best so far, on a variant of
 * the cube, and report each improvement. Every attempt is an exhaustive search whose
 * time grows steeply as the limit drops, so one call can run for minutes: this must
 * run in a worker that the caller terminates when its time is up.
 *
 * @param current a valid solution of `facelets`
 * @param maxAttempts stop after this many searches (for tests)
 */
export function improveKociemba(
  facelets: string,
  variant: Variant,
  current: readonly string[],
  onBetter: (moves: string[]) => void,
  maxAttempts = Infinity,
): void {
  ensureTables();
  let best = current;
  // Replaying any solution on a solved cube gives the inverse of the scrambled cube.
  const start = variant.invert ? new Cube().move(best.join(' ')).asString() : facelets;
  const prefixLength = variant.prefix ? 1 : 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const depth = best.length - 1 - prefixLength;
    if (depth < 1) return;

    const cube = Cube.fromString(start);
    if (variant.prefix) cube.move(variant.prefix);

    let tail: string[];
    try {
      tail = split(cube.solve(depth));
    } catch {
      // cubejs throws (a TypeError deep inside its search) when no solution fits in
      // the depth limit. That is the normal end of the search: nothing shorter exists here.
      return;
    }

    const forVariant = variant.prefix ? [variant.prefix, ...tail] : tail;
    // A solution of the inverse cube, reversed, solves the original.
    const full = variant.invert ? invertAlgorithm(forVariant) : forVariant;
    if (full.length >= best.length) return;

    best = full;
    onBetter(full);
  }
}
