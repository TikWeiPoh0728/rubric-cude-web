import { describe, it, expect } from 'vitest';
import { applyMoves, parseAlgorithm } from '../../cube/cube-moves';
import { solvedCube } from '../../cube/cube-validator';
import { piecesToFacelets, solvedPieces } from './piece-cube';
import { F2L_PAIRS, isCrossSolved, isF2lSolved, isLastLayerOriented, isPairSolved, isSolved } from './stage-checks';

const after = (alg: string) => applyMoves(solvedCube(), parseAlgorithm(alg));

describe('stage checks', () => {
  it('a solved cube passes every stage', () => {
    const f = solvedCube();
    expect(isCrossSolved(f)).toBe(true);
    expect(F2L_PAIRS.every((_, i) => isPairSolved(f, i))).toBe(true);
    expect(isF2lSolved(f)).toBe(true);
    expect(isLastLayerOriented(f)).toBe(true);
    expect(isSolved(f)).toBe(true);
  });

  it('turning only the top layer keeps the first two layers solved, but not the cube', () => {
    const f = after('U');
    expect(isCrossSolved(f)).toBe(true);
    expect(isF2lSolved(f)).toBe(true);
    expect(isLastLayerOriented(f)).toBe(true); // the top face is still all one color
    expect(isSolved(f)).toBe(false);
  });

  it('a top layer that is permuted and twisted passes F2L but not the orientation stage', () => {
    // Sune-like: R U R' U R U2 R' disturbs only the top layer, but twists pieces.
    const f = after("R U R' U R U2 R'");
    expect(isF2lSolved(f)).toBe(true);
    expect(isLastLayerOriented(f)).toBe(false);
  });

  it('turning the bottom, or a side that carries a bottom edge, breaks the cross', () => {
    expect(isCrossSolved(after('D'))).toBe(false);
    expect(isCrossSolved(after('R'))).toBe(false);
    expect(isCrossSolved(after('F2'))).toBe(false);
  });

  it('a move that is undone a few turns later leaves the bottom as it was', () => {
    // R U R' U' puts the right side back, so the bottom layer is untouched.
    expect(isCrossSolved(after("R U R' U'"))).toBe(true);
  });

  it('a pair is solved only when both its corner and its edge are home', () => {
    // R2 moves the right side's corners and edges: the front-right and back-right pairs
    // leave their slots, the two left-hand pairs do not.
    const f = after('R2');
    expect(isPairSolved(f, 0)).toBe(false); // front-right
    expect(isPairSolved(f, 1)).toBe(true); // front-left
    expect(isPairSolved(f, 2)).toBe(true); // back-left
    expect(isPairSolved(f, 3)).toBe(false); // back-right
  });

  it('a pair whose edge is home but whose corner is twisted is not solved', () => {
    const p = solvedPieces();
    p.co[4] = 1; // twist the front-right corner in its slot
    const f = piecesToFacelets(p);
    expect(isPairSolved(f, 0)).toBe(false);
    expect(isCrossSolved(f)).toBe(true); // the cross does not care about corners
  });

  it('a bottom edge that is in place but flipped means no cross', () => {
    const p = solvedPieces();
    p.eo[5] = 1; // flip the front-bottom edge in place
    expect(isCrossSolved(piecesToFacelets(p))).toBe(false);
  });
});
