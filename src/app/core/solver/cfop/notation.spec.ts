import { describe, it, expect } from 'vitest';
import Cube from '../vendor/cubejs/index';
import { applyMoves, parseMove } from '../../cube/cube-moves';
import { solvedCube } from '../../cube/cube-validator';
import { seeded } from '../../../testing/random-cube';
import { expandNotation } from './notation';

/** The cube after a book-notation algorithm, by our own model, read relative to the centers. */
const ours = (alg: string) => applyMoves(solvedCube(), expandNotation(alg).map(parseMove)).join('');

/**
 * The same algorithm on cubejs, an independent cube model that really turns the whole cube
 * for x, y, z, M, E, S and the wide moves. cubejs then puts the cube back upright, so the
 * result can be compared with ours, which always keeps the centers still.
 */
const reference = (alg: string) => {
  const cube = new Cube().move(alg);
  // upright() is the rotation that brings the centers home; its result applies to the cube.
  const upright = (cube as unknown as { upright(): string }).upright();
  return cube.move(upright).asString();
};

describe('expandNotation', () => {
  it('leaves plain face turns alone', () => {
    expect(expandNotation("R U R' U' F2 D L B'")).toEqual(['R', 'U', "R'", "U'", 'F2', 'D', 'L', "B'"]);
    expect(expandNotation('')).toEqual([]);
  });

  it('produces face turns only', () => {
    const out = expandNotation("r U r' x R' U R2 M' E S2 u d' f b' y z'");
    for (const move of out) expect(move).toMatch(/^[URFDLB](2|')?$/);
  });

  it('rejects notation it does not know', () => {
    expect(() => expandNotation('Rw')).toThrow('Invalid move');
    expect(() => expandNotation('R3')).toThrow('Invalid move');
  });

  it('a whole-cube rotation moves nothing relative to the centers', () => {
    expect(ours('x')).toBe(solvedCube().join(''));
    expect(ours("y z' x2")).toBe(solvedCube().join(''));
  });

  describe('agrees with cubejs, which turns the whole cube for real', () => {
    const cases = [
      'r', "r'", 'r2', 'l', "l'", 'u', "u'", 'd', "d'", 'f', "f'", 'b', "b'",
      'M', "M'", 'M2', 'E', "E'", 'S', "S'",
      "x R x'", "y R y'", "z R z'", "x' U x", "R U x R' U' x'",
      "r U R' U' r' F R F'", // OLL 24
      "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R", // a long plain one
      "M2 U M2 U2 M2 U M2", // H perm
      "x R' U R' D2 R U' R' D2 R2 x'", // A perm
      "R U R' U' y R' F' R2 U' R' U R' F R F", // V perm, ends turned by y
    ];
    for (const alg of cases) {
      it(alg, () => expect(ours(alg)).toBe(reference(alg)));
    }

    it('for 300 random algorithms that mix every kind of move', () => {
      const tokens = ['U', 'R', 'F', 'D', 'L', 'B', 'r', 'l', 'u', 'd', 'f', 'b', 'M', 'E', 'S', 'x', 'y', 'z'];
      const suffixes = ['', "'", '2'];
      const random = seeded(77);
      for (let i = 0; i < 300; i++) {
        const alg = Array.from({ length: 1 + Math.floor(random() * 14) }, () =>
          tokens[Math.floor(random() * tokens.length)] + suffixes[Math.floor(random() * 3)]).join(' ');
        expect(ours(alg), alg).toBe(reference(alg));
      }
    });
  });
});
