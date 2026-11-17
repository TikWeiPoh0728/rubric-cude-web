import { describe, it, expect } from 'vitest';
import { invertAlgorithm } from '../../cube/cube-moves';
import {
  OLL_ENTRIES, PLL_ENTRIES, firstTwoLayersIntact, piecesSolved, solveOll, solvePll, topOriented,
} from './last-layer';
import { PieceCube, applyMoveNames, solvedPieces } from './piece-cube';

/** The position an algorithm is a solution for: a solved cube with the algorithm undone. */
const caseOf = (moves: string[]) => applyMoveNames(solvedPieces(), invertAlgorithm(moves));

describe('OLL table', () => {
  it('has the 57 algorithms', () => {
    expect(OLL_ENTRIES).toHaveLength(57);
    expect(new Set(OLL_ENTRIES.map(e => e.name)).size).toBe(57);
  });

  for (const entry of OLL_ENTRIES) {
    it(`${entry.name} is a real OLL: it keeps the first two layers and starts from an unoriented top`, () => {
      const start = caseOf(entry.moves);
      expect(firstTwoLayersIntact(start), 'first two layers survive').toBe(true);
      expect(topOriented(start), 'top was not already oriented').toBe(false);
      expect(topOriented(applyMoveNames(start, entry.moves)), 'it orients the top').toBe(true);
    });
  }

  it('no two entries start from the same orientation pattern, even turned by a top turn', () => {
    const patterns = new Map<string, string>();
    const clash: string[] = [];
    for (const entry of OLL_ENTRIES) {
      let p = caseOf(entry.moves);
      for (let turn = 0; turn < 4; turn++) {
        const key = `${[...p.co.slice(0, 4)]}|${[...p.eo.slice(0, 4)]}`;
        if (turn === 0) {
          const other = patterns.get(key);
          if (other) clash.push(`${entry.name} = ${other}`);
          patterns.set(key, entry.name);
        }
        p = applyMoveNames(p, ['U']);
      }
    }
    expect(clash).toEqual([]);
  });
});

describe('PLL table', () => {
  it('has the 21 algorithms', () => {
    expect(PLL_ENTRIES).toHaveLength(21);
    expect(new Set(PLL_ENTRIES.map(e => e.name)).size).toBe(21);
  });

  for (const entry of PLL_ENTRIES) {
    it(`${entry.name} is a real PLL: first two layers and top orientation survive, the top is not already solved`, () => {
      const start = caseOf(entry.moves);
      expect(topOriented(start), 'top is oriented before and after').toBe(true);
      expect(piecesSolved(start), 'not already solved').toBe(false);
      expect(piecesSolved(applyMoveNames(start, entry.moves)), 'it solves the cube').toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------------
// Every possible last layer
// ---------------------------------------------------------------------------------

/** A cube with the first two layers solved and the top layer's twists and flips as given. */
function orientationCase(twists: number[], flips: number[]): PieceCube {
  const p = solvedPieces();
  twists.forEach((t, i) => (p.co[i] = t));
  flips.forEach((f, i) => (p.eo[i] = f));
  return p;
}

/** All the ways to give 4 pieces a value in 0..n-1 where the total is a multiple of n. */
function patterns(n: number): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) for (let d = 0; d < n; d++) {
    if ((a + b + c + d) % n === 0) out.push([a, b, c, d]);
  }
  return out;
}

const permutations = (items: number[]): number[][] =>
  items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [x, ...rest]));

const parity = (perm: number[]) => perm.reduce((n, v, i) => n + perm.slice(i + 1).filter(w => w < v).length, 0) % 2;

describe('OLL covers every orientation of the last layer', () => {
  const all = patterns(3).flatMap(twists => patterns(2).map(flips => ({ twists, flips })));

  it('there are 216 orientation patterns, one of them solved', () => {
    expect(all).toHaveLength(216);
  });

  it('every one of the 215 unsolved patterns has a single algorithm (with a top turn before it) that orients it', () => {
    const missing: string[] = [];
    for (const { twists, flips } of all) {
      const p = orientationCase(twists, flips);
      if (topOriented(p)) continue;
      const works = OLL_ENTRIES.some(e => [[], ['U'], ['U2'], ["U'"]].some(pre => topOriented(applyMoveNames(p, [...pre, ...e.moves]))));
      if (!works) missing.push(`twists ${twists} flips ${flips}`);
    }
    expect(missing).toEqual([]);
  });

  it('solveOll orients all of them, and leaves the first two layers alone', () => {
    for (const { twists, flips } of all) {
      const p = orientationCase(twists, flips);
      const moves = solveOll(p);
      expect(topOriented(applyMoveNames(p, moves)), `twists ${twists} flips ${flips}`).toBe(true);
      if (topOriented(p)) expect(moves).toEqual([]);
    }
  });
});

describe('PLL covers every permutation of an oriented last layer', () => {
  const corners = permutations([0, 1, 2, 3]);
  const edges = permutations([0, 1, 2, 3]);
  const all = corners.flatMap(c => edges.filter(e => parity(c) === parity(e)).map(e => ({ c, e })));

  function permutationCase(c: number[], e: number[]): PieceCube {
    const p = solvedPieces();
    c.forEach((piece, i) => (p.cp[i] = piece));
    e.forEach((piece, i) => (p.ep[i] = piece));
    return p;
  }

  it('there are 288 reachable permutations', () => {
    expect(all).toHaveLength(288);
  });

  it('every one is solved by a top turn, an algorithm and a top turn', () => {
    const failed: string[] = [];
    for (const { c, e } of all) {
      const p = permutationCase(c, e);
      let moves: string[];
      try {
        moves = solvePll(p);
      } catch {
        failed.push(`corners ${c} edges ${e}`);
        continue;
      }
      if (!piecesSolved(applyMoveNames(p, moves))) failed.push(`corners ${c} edges ${e}`);
    }
    expect(failed).toEqual([]);
  });

  it('a solved cube needs no moves, and a cube a top turn away needs just that turn', () => {
    expect(solvePll(solvedPieces())).toEqual([]);
    expect(solvePll(applyMoveNames(solvedPieces(), ['U']))).toEqual(["U'"]);
    expect(solvePll(applyMoveNames(solvedPieces(), ['U2']))).toEqual(['U2']);
  });
});

describe('guards', () => {
  it('OLL and PLL refuse a cube that is not ready for them', () => {
    expect(() => solveOll(applyMoveNames(solvedPieces(), ['R']))).toThrow('first two layers');
    expect(() => solvePll(orientationCase([1, 2, 0, 0], [0, 0, 0, 0]))).toThrow('oriented');
  });

  it('a cube whose top is already oriented skips OLL', () => {
    expect(solveOll(applyMoveNames(solvedPieces(), ['U']))).toEqual([]);
  });
});
