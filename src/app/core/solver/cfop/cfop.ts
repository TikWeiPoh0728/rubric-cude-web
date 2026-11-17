import { Face, Facelets, validateFull } from '../../cube/cube-validator';
import { Solution, stagedSolution } from '../solution';
import { solveCross } from './cross';
import { solveF2l } from './f2l';
import { piecesSolved, solveOll, solvePll } from './last-layer';
import { applyMoveNames, piecesFromFacelets } from './piece-cube';

/**
 * Solve a cube the CFOP way, in four stages from a fixed orientation (white cross on the
 * bottom, yellow on top; the cube is never turned over):
 *
 *   Cross  the four bottom edges, solved optimally (at most 8 moves)
 *   F2L    the four corner-edge pairs, with the moves a person uses to extract and insert a pair
 *   OLL    make the top face one color, from a table of 57 algorithms
 *   PLL    put the top layer's pieces in place, from a table of 21 algorithms
 *
 * Each stage starts from where the previous one stopped, keeps what the earlier stages
 * built, and may be empty when the cube does not need it.
 *
 * @param facelets 54 characters in U R F D L B order
 */
export function solveCfop(facelets: string): Solution {
  const cube = parseFacelets(facelets);
  const problems = validateFull(cube);
  if (!problems.valid) throw new Error(`This cube cannot be solved (${[...new Set(problems.errors.map(e => e.code))].join(', ')})`);

  let pieces = piecesFromFacelets(cube);

  const cross = solveCross(pieces);
  pieces = applyMoveNames(pieces, cross);

  const f2l = solveF2l(pieces);
  pieces = applyMoveNames(pieces, f2l);

  const oll = solveOll(pieces);
  pieces = applyMoveNames(pieces, oll);

  const pll = solvePll(pieces);
  pieces = applyMoveNames(pieces, pll);

  if (!piecesSolved(pieces)) throw new Error('The CFOP solution did not solve the cube'); // a bug, never a bad cube

  return stagedSolution([
    { id: 'cross', moves: cross },
    { id: 'f2l', moves: f2l },
    { id: 'oll', moves: oll },
    { id: 'pll', moves: pll },
  ]);
}

function parseFacelets(text: string): Facelets {
  if (text.length !== 54) throw new Error(`Expected 54 stickers, got ${text.length}`);
  const faces = new Set(['U', 'R', 'F', 'D', 'L', 'B']);
  return [...text].map(c => {
    if (!faces.has(c)) throw new Error(`Unknown sticker "${c}"`);
    return c as Face;
  });
}
