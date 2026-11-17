import { expandNotation } from './notation';
import { Algorithm, OLL_ALGS } from './oll-algs';
import { PLL_ALGS } from './pll-algs';
import { PieceCube, applyMoveNames } from './piece-cube';

/**
 * Stages 3 and 4: OLL (make the top face one color) and PLL (put the top layer's pieces
 * in place). Both work from algorithm tables, but nothing is looked up by case. The
 * solver tries every table entry with every turn of the top layer, replays each on the
 * real cube, and keeps the shortest that reaches the stage's goal. A wrong table entry
 * can therefore never cause a wrong answer, only a missed shortcut; the tests audit every entry.
 */

/** A top-layer turn before or after an algorithm (none, U, U2, U'). */
const AUF: readonly string[][] = [[], ['U'], ['U2'], ["U'"]];

interface Entry {
  name: string;
  moves: string[];
}

const expand = (algs: readonly Algorithm[]): Entry[] => algs.map(a => ({ name: a.name, moves: expandNotation(a.alg) }));

export const OLL_ENTRIES: readonly Entry[] = expand(OLL_ALGS);
export const PLL_ENTRIES: readonly Entry[] = expand(PLL_ALGS);

// ---------------------------------------------------------------------------------
// Goals, on pieces. Pieces 4..7 of the corners and 4..11 of the edges are the first
// two layers (bottom corners, bottom edges, middle edges); the top layer is 0..3.
// ---------------------------------------------------------------------------------

/** The first two layers are solved. */
export function firstTwoLayersIntact(p: PieceCube): boolean {
  for (let i = 4; i < 8; i++) if (p.cp[i] !== i || p.co[i] !== 0) return false;
  for (let i = 4; i < 12; i++) if (p.ep[i] !== i || p.eo[i] !== 0) return false;
  return true;
}

/** The first two layers are solved and every top piece is oriented, so the top face is one color. */
export function topOriented(p: PieceCube): boolean {
  if (!firstTwoLayersIntact(p)) return false;
  for (let i = 0; i < 4; i++) if (p.co[i] !== 0 || p.eo[i] !== 0) return false;
  return true;
}

/** Every piece is home and untwisted. */
export function piecesSolved(p: PieceCube): boolean {
  for (let i = 0; i < 8; i++) if (p.cp[i] !== i || p.co[i] !== 0) return false;
  for (let i = 0; i < 12; i++) if (p.ep[i] !== i || p.eo[i] !== 0) return false;
  return true;
}

// ---------------------------------------------------------------------------------

/**
 * OLL: the moves that make the top face one color, or [] if it already is.
 * Throws if the first two layers are not solved or no entry works (a table gap, caught by the tests).
 */
export function solveOll(p: PieceCube): string[] {
  if (!firstTwoLayersIntact(p)) throw new Error('OLL needs the first two layers solved');
  if (topOriented(p)) return [];

  let best: string[] | null = null;
  for (const before of AUF) {
    for (const entry of OLL_ENTRIES) {
      const length = before.length + entry.moves.length;
      if (best && length >= best.length) continue;
      const moves = [...before, ...entry.moves];
      if (topOriented(applyMoveNames(p, moves))) best = moves;
    }
  }
  if (best) return best;

  // No single algorithm does it: orient in two looks, using any two table entries.
  for (const first of AUF) {
    for (const a of OLL_ENTRIES) {
      const afterFirst = applyMoveNames(p, [...first, ...a.moves]);
      if (!firstTwoLayersIntact(afterFirst)) continue;
      for (const second of AUF) {
        for (const b of OLL_ENTRIES) {
          const total = first.length + a.moves.length + second.length + b.moves.length;
          if (best && total >= best.length) continue;
          if (topOriented(applyMoveNames(afterFirst, [...second, ...b.moves]))) {
            best = [...first, ...a.moves, ...second, ...b.moves];
          }
        }
      }
    }
  }
  if (best) return best;
  throw new Error('No OLL algorithm found for this position');
}

/**
 * PLL: the moves that finish the cube from a cube whose top face is one color, or [] if it is solved.
 * Throws if the top face is not oriented or no entry works (a table gap, caught by the tests).
 */
export function solvePll(p: PieceCube): string[] {
  if (!topOriented(p)) throw new Error('PLL needs the top face oriented first');
  if (piecesSolved(p)) return [];

  let best: string[] | null = null;
  for (const before of AUF) {
    for (const entry of PLL_ENTRIES) {
      for (const after of AUF) {
        const length = before.length + entry.moves.length + after.length;
        if (best && length >= best.length) continue;
        const moves = [...before, ...entry.moves, ...after];
        if (piecesSolved(applyMoveNames(p, moves))) best = moves;
      }
    }
  }
  // A cube that is only a top turn from solved needs no algorithm at all.
  for (const only of AUF) {
    if (only.length > 0 && piecesSolved(applyMoveNames(p, only)) && (!best || only.length < best.length)) best = only;
  }
  if (best) return best;
  throw new Error('No PLL algorithm found for this position');
}
