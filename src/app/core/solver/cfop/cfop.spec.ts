import { describe, it, expect } from 'vitest';
import { applyMoves, parseAlgorithm, parseMove } from '../../cube/cube-moves';
import { Facelets, solvedCube } from '../../cube/cube-validator';
import { randomCube, seeded } from '../../../testing/random-cube';
import { StageId } from '../solution';
import { solveCfop } from './cfop';
import { isCrossSolved, isF2lSolved, isLastLayerOriented, isSolved } from './stage-checks';

const ORDER: StageId[] = ['cross', 'f2l', 'oll', 'pll'];

/** Replay the solution one stage at a time and check each stage's finish line on the stickers. */
function checkStages(cube: Facelets, text: string) {
  const solution = solveCfop(cube.join(''));
  expect(solution.stages!.map(s => s.id), text).toEqual(ORDER);
  expect(solution.moves, text).toEqual(solution.stages!.flatMap(s => s.moves));
  for (const m of solution.moves) expect(m).toMatch(/^[URFDLB](2|')?$/);

  const contracts: Record<StageId, (f: Facelets) => boolean> = {
    cross: isCrossSolved,
    f2l: isF2lSolved, // includes the cross
    oll: isLastLayerOriented, // includes the first two layers
    pll: isSolved,
  };
  let state = cube;
  for (const stage of solution.stages!) {
    state = applyMoves(state, stage.moves.map(parseMove));
    expect(contracts[stage.id](state), `${text}: after ${stage.label}`).toBe(true);
  }
  return solution;
}

describe('solveCfop', () => {
  it('returns the four stages, all empty, for a solved cube', () => {
    const solution = solveCfop(solvedCube().join(''));
    expect(solution.moves).toEqual([]);
    expect(solution.stages!.map(s => [s.id, s.label, s.moves.length])).toEqual([
      ['cross', 'Cross', 0], ['f2l', 'F2L', 0], ['oll', 'OLL', 0], ['pll', 'PLL', 0],
    ]);
  });

  it('solves 500 random cubes, and every stage ends on its own finish line', () => {
    const random = seeded(101);
    const lengths: number[] = [];
    for (let i = 0; i < 500; i++) {
      const cube = randomCube(random, 20 + (i % 20));
      const solution = checkStages(cube, `cube ${i}`);
      expect(applyMoves(cube, solution.moves.map(parseMove)), `cube ${i}`).toEqual(solvedCube());
      lengths.push(solution.moves.length);
    }
    const average = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // A CFOP solve by a person is about 55 moves. Loose limits: these catch a search gone wrong.
    expect(average).toBeGreaterThan(40);
    expect(average).toBeLessThan(65);
    expect(Math.max(...lengths)).toBeLessThan(90);
  }, 300_000);

  it('skips the stages a cube does not need', () => {
    // Only the top layer is disturbed: Cross and F2L are already done.
    const topOnly = applyMoves(solvedCube(), parseAlgorithm("R U R' U R U2 R' U"));
    const solution = checkStages(topOnly, 'top layer only');
    expect(solution.stages![0].moves).toEqual([]);
    expect(solution.stages![1].moves).toEqual([]);
    expect(solution.stages![2].moves.length).toBeGreaterThan(0);
  });

  it('a cube that is one top turn from solved needs just a PLL stage of one move', () => {
    const solution = checkStages(applyMoves(solvedCube(), parseAlgorithm('U')), 'U');
    expect(solution.stages!.map(s => s.moves.length)).toEqual([0, 0, 0, 1]);
  });

  it('a cube with only a cross to do has Cross moves and nothing after the cross matters', () => {
    const solution = checkStages(applyMoves(solvedCube(), parseAlgorithm('D')), 'D');
    expect(solution.stages![0].moves).toEqual(["D'"]);
    expect(solution.moves).toEqual(["D'"]);
  });

  it('keeps each stage in its own lane: Cross uses only what the cross needs, and OLL and PLL leave the lower layers alone', () => {
    const solution = checkStages(randomCube(seeded(102)), 'lanes');
    // After F2L, nothing in OLL or PLL may have broken the first two layers at the end of its stage,
    // which checkStages already proved. Here: the last two stages are short compared with the first two.
    const [cross, f2l, oll, pll] = solution.stages!.map(s => s.moves.length);
    expect(cross).toBeLessThanOrEqual(8);
    expect(f2l).toBeLessThan(40);
    expect(oll + pll).toBeLessThan(40);
  });

  it('refuses a cube that cannot exist, naming why, instead of searching forever', () => {
    const twisted = solvedCube();
    [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]]; // one twisted corner
    expect(() => solveCfop(twisted.join(''))).toThrow('cannot be solved');
    expect(() => solveCfop(twisted.join(''))).toThrow('CORNER_TWIST');
  });

  it('refuses text that is not a cube', () => {
    expect(() => solveCfop('UUU')).toThrow('54');
    expect(() => solveCfop('X'.repeat(54))).toThrow('Unknown sticker');
  });
});
