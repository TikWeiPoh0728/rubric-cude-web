import { describe, it, expect } from 'vitest';
import { applyMoves, invertAlgorithm, parseAlgorithm, parseMove } from '../cube/cube-moves';
import { improveKociemba, solveQuick } from './kociemba';
import { VARIANTS } from './kociemba-protocol';
import { solvedCube, validateFull } from '../cube/cube-validator';

const solves = (start: ReturnType<typeof solvedCube>, solution: string[]) =>
  applyMoves(start, solution.map(parseMove));

describe('solveQuick', () => {
  // Building the pruning tables takes a few seconds the first time.
  it('returns no moves for a solved cube', () => {
    expect(solveQuick(solvedCube().join(''))).toEqual([]);
  }, 60_000);

  it('solves scrambled cubes in at most 21 moves, and our own move tables replay it to a solved cube', () => {
    const scrambles = [
      "R U R' U'",
      "F2 L' D B2 U R2 F' D2 L U2 B R' D' F2 U L2",
      "U2 B' L R2 D F U' R' B2 D2 L' F R U B' D L2 F2 U'",
    ];
    for (const scramble of scrambles) {
      const start = applyMoves(solvedCube(), parseAlgorithm(scramble));
      expect(validateFull(start).valid, scramble).toBe(true);

      const solution = solveQuick(start.join(''));
      expect(solution.length, scramble).toBeGreaterThan(0);
      expect(solution.length, scramble).toBeLessThanOrEqual(21);
      solution.forEach(m => expect(() => parseMove(m)).not.toThrow());
      expect(solves(start, solution), scramble).toEqual(solvedCube());
    }
  }, 60_000);
});

describe('improveKociemba', () => {
  const scramble = "R U F' D2 L B' U R2 D";
  const start = applyMoves(solvedCube(), parseAlgorithm(scramble));
  const facelets = start.join('');

  // A valid but wasteful solution, padded with pointless "U U'" pairs up to 24 moves.
  // That makes the first search's depth limit (23, or 22 with a prefix) generous: the
  // two-phase search can need more moves than the true optimum, so a tight limit may
  // legitimately find nothing, but one this loose always does.
  const wasteful = [...solveQuick(facelets)];
  while (wasteful.length < 24) wasteful.push('U', "U'");

  it('the wasteful solution really is valid', () => {
    expect(solves(start, wasteful)).toEqual(solvedCube());
  }, 60_000);

  for (const [index, variant] of VARIANTS.entries()) {
    it(`finds a shorter, valid solution on variant ${index} (invert=${variant.invert}, prefix=${variant.prefix})`, () => {
      const found: string[][] = [];
      // One search only: later ones get tighter and their running time is unbounded.
      improveKociemba(facelets, variant, wasteful, moves => found.push(moves), 1);

      expect(found.length).toBe(1);
      expect(found[0].length).toBeLessThan(wasteful.length);
      expect(solves(start, found[0])).toEqual(solvedCube()); // it really solves the cube
    }, 60_000);
  }

  it('reports nothing when there is no room to improve', () => {
    const optimal = invertAlgorithm("R U".split(' '));
    const cube = applyMoves(solvedCube(), parseAlgorithm('R U'));
    const found: string[][] = [];
    improveKociemba(cube.join(''), VARIANTS[0], optimal, m => found.push(m), 1);
    expect(found).toEqual([]);
  }, 60_000);
});
