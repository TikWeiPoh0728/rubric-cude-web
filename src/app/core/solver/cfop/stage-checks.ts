/**
 * What "this stage is finished" means for CFOP, written on the sticker cube with fixed
 * positions: the cross is on the bottom (D), the last layer is the top (U), and the
 * cube is never rotated. These are the contracts every stage must meet; the solver
 * and the tests both use them.
 */
import {
  CORNER_PIECES, CORNER_SLOTS, EDGE_PIECES, EDGE_SLOTS, Facelets,
} from '../../cube/cube-validator';

/** Bottom edges DR DF DL DB are edge numbers 4..7. */
const CROSS_EDGES = [4, 5, 6, 7];

/** The four F2L pairs: corner number and the edge between the same two layers (DFR+FR, DLF+FL, DBL+BL, DRB+BR). */
export const F2L_PAIRS: readonly { corner: number; edge: number; name: string }[] = [
  { corner: 4, edge: 8, name: 'front-right' },
  { corner: 5, edge: 9, name: 'front-left' },
  { corner: 6, edge: 10, name: 'back-left' },
  { corner: 7, edge: 11, name: 'back-right' },
];

const piecesHome = (f: Facelets, slot: number[], colors: string[]) => slot.every((sticker, k) => f[sticker] === colors[k]);

/** The four bottom edges are in place and the right way round. */
export function isCrossSolved(f: Facelets): boolean {
  return CROSS_EDGES.every(e => piecesHome(f, EDGE_SLOTS[e], EDGE_PIECES[e]));
}

/** One F2L pair (a bottom corner and its middle-layer edge) is in its slot, solved. */
export function isPairSolved(f: Facelets, pair: number): boolean {
  const { corner, edge } = F2L_PAIRS[pair];
  return piecesHome(f, CORNER_SLOTS[corner], CORNER_PIECES[corner]) && piecesHome(f, EDGE_SLOTS[edge], EDGE_PIECES[edge]);
}

/** The cross and all four pairs: the bottom two layers are solved. */
export function isF2lSolved(f: Facelets): boolean {
  return isCrossSolved(f) && F2L_PAIRS.every((_, i) => isPairSolved(f, i));
}

/** The bottom two layers are solved and the whole top face is one color. */
export function isLastLayerOriented(f: Facelets): boolean {
  return isF2lSolved(f) && f.slice(0, 9).every(c => c === 'U');
}

export function isSolved(f: Facelets): boolean {
  return f.every((c, i) => c === ['U', 'R', 'F', 'D', 'L', 'B'][Math.floor(i / 9)]);
}
