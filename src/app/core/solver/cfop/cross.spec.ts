import { describe, it, expect } from 'vitest';
import { applyMoves, parseAlgorithm, parseMove } from '../../cube/cube-moves';
import { solvedCube } from '../../cube/cube-validator';
import { randomCube, seeded } from '../../../testing/random-cube';
import { crossDistance, crossTable, solveCross } from './cross';
import { piecesFromFacelets, piecesToFacelets, applyMoveNames, solvedPieces } from './piece-cube';
import { isCrossSolved } from './stage-checks';

describe('cross', () => {
  it('has a distance for every one of the 190,080 reachable cross positions', () => {
    const table = crossTable();
    let reachable = 0;
    let deepest = 0;
    for (const d of table) {
      if (d !== 255) {
        reachable++;
        deepest = Math.max(deepest, d);
      }
    }
    expect(reachable).toBe(190_080);
    expect(deepest).toBe(8); // no cross needs more than 8 moves
  });

  it('is zero moves away for a solved cube', () => {
    expect(crossDistance(solvedPieces())).toBe(0);
    expect(solveCross(solvedPieces())).toEqual([]);
  });

  it('knows a cross that is one move away', () => {
    expect(crossDistance(applyMoveNames(solvedPieces(), ['D']))).toBe(1);
    expect(crossDistance(applyMoveNames(solvedPieces(), ['R2']))).toBe(1);
  });

  it('does not count top-layer moves as breaking the cross', () => {
    expect(crossDistance(applyMoveNames(solvedPieces(), ['U', "U'", 'U2']))).toBe(0);
  });

  it('solves the cross of 300 random cubes, in at most 8 moves, as the sticker-level check sees it', () => {
    const random = seeded(11);
    for (let i = 0; i < 300; i++) {
      const cube = randomCube(random);
      const moves = solveCross(piecesFromFacelets(cube));
      expect(moves.length).toBeLessThanOrEqual(8);
      const result = applyMoves(cube, moves.map(parseMove));
      expect(isCrossSolved(result), `cube ${i}: ${moves.join(' ')}`).toBe(true);
    }
  });

  it('gives exactly the number of moves the table promised (the cross is solved optimally)', () => {
    const random = seeded(12);
    for (let i = 0; i < 100; i++) {
      const p = piecesFromFacelets(randomCube(random));
      expect(solveCross(p).length).toBe(crossDistance(p));
    }
  });

  it('is the best possible: no shorter move sequence solves the cross', () => {
    // For a few cubes whose cross is 2-3 moves away, try every shorter sequence.
    const random = seeded(13);
    let checked = 0;
    for (let tries = 0; tries < 400 && checked < 10; tries++) {
      const p = piecesFromFacelets(randomCube(random, 3)); // a short scramble keeps the cross close
      const distance = crossDistance(p);
      if (distance < 2 || distance > 3) continue;
      checked++;
      const names = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'B', "B'", 'B2'];
      const solves = (seq: string[]) => isCrossSolved(piecesToFacelets(applyMoveNames(p, seq)));
      for (const a of names) {
        expect(solves([a])).toBe(false);
        if (distance === 3) for (const b of names) expect(solves([a, b])).toBe(false);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('solves a cross that has been disturbed by a known algorithm', () => {
    const cube = applyMoves(solvedCube(), parseAlgorithm("R U R' U' F D' L2 B"));
    const moves = solveCross(piecesFromFacelets(cube));
    expect(isCrossSolved(applyMoves(cube, moves.map(parseMove)))).toBe(true);
  });
});
