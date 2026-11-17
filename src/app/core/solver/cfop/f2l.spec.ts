import { describe, it, expect } from 'vitest';
import { applyMoves, parseAlgorithm, parseMove } from '../../cube/cube-moves';
import { solvedCube } from '../../cube/cube-validator';
import { randomCube, seeded } from '../../../testing/random-cube';
import { solveCross } from './cross';
import { solveF2l } from './f2l';
import { applyMoveNames, piecesFromFacelets } from './piece-cube';
import { isCrossSolved, isF2lSolved } from './stage-checks';

/** A random cube with its cross already solved: what F2L is handed in the real solver. */
function crossSolvedCube(random: () => number) {
  const cube = randomCube(random);
  const crossMoves = solveCross(piecesFromFacelets(cube));
  return applyMoves(cube, crossMoves.map(parseMove));
}

describe('F2L', () => {
  it('does nothing for a cube whose first two layers are already solved', () => {
    expect(solveF2l(piecesFromFacelets(solvedCube()))).toEqual([]);
    const topTurned = applyMoves(solvedCube(), parseAlgorithm("U R U R' U'").slice(0, 1));
    expect(solveF2l(piecesFromFacelets(topTurned))).toEqual([]);
  });

  it('refuses a cube without a cross', () => {
    const noCross = applyMoves(solvedCube(), parseAlgorithm('D R'));
    expect(() => solveF2l(piecesFromFacelets(noCross))).toThrow('cross');
  });

  it('inserts a single pair that was pulled out of its slot', () => {
    // R U R' lifts the front-right pair out and leaves the other three where they were.
    const cube = applyMoves(solvedCube(), parseAlgorithm("R U R'"));
    expect(isF2lSolved(cube)).toBe(false);
    const moves = solveF2l(piecesFromFacelets(cube));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(6);
    expect(isF2lSolved(applyMoves(cube, moves.map(parseMove)))).toBe(true);
  });

  it('solves the first two layers of 150 random cubes, keeping the cross', () => {
    const random = seeded(21);
    for (let i = 0; i < 150; i++) {
      const cube = crossSolvedCube(random);
      const moves = solveF2l(piecesFromFacelets(cube));
      const result = applyMoves(cube, moves.map(parseMove));
      expect(isCrossSolved(result), `cube ${i} keeps its cross`).toBe(true);
      expect(isF2lSolved(result), `cube ${i}: ${moves.join(' ')}`).toBe(true);
    }
  }, 120_000);

  it('uses only face turns, and its lengths look like a real F2L', () => {
    const random = seeded(22);
    const lengths: number[] = [];
    for (let i = 0; i < 100; i++) {
      const moves = solveF2l(piecesFromFacelets(crossSolvedCube(random)));
      for (const m of moves) expect(m).toMatch(/^[URFDLB](2|')?$/);
      lengths.push(moves.length);
    }
    const average = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // A person needs about 28-32 moves for four pairs. Be loose: this guards against a
    // search that has gone wrong, not against a particular number.
    expect(average).toBeLessThan(45);
    expect(Math.max(...lengths)).toBeLessThan(80);
  }, 120_000);

  it('agrees with the piece model: the moves it returns replay on pieces too', () => {
    const cube = crossSolvedCube(seeded(23));
    const p = piecesFromFacelets(cube);
    const moves = solveF2l(p);
    expect(applyMoveNames(p, moves).cp.slice(4)).toEqual(Uint8Array.from([4, 5, 6, 7]));
  });
});

describe('F2L timing (spike)', () => {
  it('is fast enough to run in a worker: measured on 200 random cubes', () => {
    const random = seeded(31);
    const times: number[] = [];
    const lengths: number[] = [];
    for (let i = 0; i < 200; i++) {
      const p = piecesFromFacelets(crossSolvedCube(random));
      const t0 = performance.now();
      lengths.push(solveF2l(p).length);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const pct = (q: number) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    console.log(
      `F2L over 200 cubes: moves avg ${avgLen.toFixed(1)} (min ${Math.min(...lengths)}, max ${Math.max(...lengths)}); ` +
      `time ms median ${pct(0.5).toFixed(1)}, p95 ${pct(0.95).toFixed(1)}, max ${times[times.length - 1].toFixed(1)}`,
    );
    expect(times[times.length - 1]).toBeLessThan(5000);
  }, 300_000);
});
