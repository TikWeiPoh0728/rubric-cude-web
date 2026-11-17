import { describe, it, expect } from 'vitest';
import { applyMoves, parseMove } from '../../cube/cube-moves';
import { emptyCube, solvedCube } from '../../cube/cube-validator';
import { randomCube, randomScramble, seeded } from '../../../testing/random-cube';
import {
  MOVE_FACE, MOVE_NAMES, applyMoveIndex, applyMoveNames, clonePieces, piecesFromFacelets, piecesToFacelets,
  solvedPieces,
} from './piece-cube';

describe('piece cube', () => {
  it('has the 18 moves, three per face', () => {
    expect(MOVE_NAMES).toHaveLength(18);
    expect(MOVE_NAMES.slice(0, 6)).toEqual(['U', "U'", 'U2', 'R', "R'", 'R2']);
    expect(MOVE_FACE.filter(f => f === 0)).toHaveLength(3);
  });

  it('reads a solved cube as every piece home and untwisted', () => {
    const p = piecesFromFacelets(solvedCube());
    expect([...p.cp]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...p.co]).toEqual(new Array(8).fill(0));
    expect([...p.ep]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect([...p.eo]).toEqual(new Array(12).fill(0));
    expect(p).toEqual(solvedPieces());
  });

  it('refuses a cube whose pieces cannot be identified', () => {
    expect(() => piecesFromFacelets(emptyCube())).toThrow();
  });

  it('turns pieces back into the same stickers it read them from, for many cubes', () => {
    const random = seeded(1);
    for (let i = 0; i < 100; i++) {
      const cube = randomCube(random);
      expect(piecesToFacelets(piecesFromFacelets(cube))).toEqual(cube);
    }
  });

  describe('a move on pieces does exactly what the same move on stickers does', () => {
    it('for each of the 18 moves on a scrambled cube', () => {
      const cube = randomCube(seeded(2));
      for (let m = 0; m < 18; m++) {
        const onStickers = applyMoves(cube, [parseMove(MOVE_NAMES[m])]);
        const onPieces = applyMoveIndex(piecesFromFacelets(cube), m, clonePieces(solvedPieces()));
        expect(piecesToFacelets(onPieces), MOVE_NAMES[m]).toEqual(onStickers);
      }
    });

    it('for 200 random 30-move sequences from a scrambled cube', () => {
      const random = seeded(3);
      for (let i = 0; i < 200; i++) {
        const cube = randomCube(random, 20);
        const moves = randomScramble(random, 30);
        const onStickers = applyMoves(cube, moves.map(parseMove));
        const onPieces = applyMoveNames(piecesFromFacelets(cube), moves);
        expect(piecesToFacelets(onPieces), moves.join(' ')).toEqual(onStickers);
      }
    });
  });

  it('four quarter turns of any face give back the cube', () => {
    const start = piecesFromFacelets(randomCube(seeded(4)));
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      expect(applyMoveNames(start, [face, face, face, face])).toEqual(start);
    }
  });

  it('a move followed by its inverse gives back the cube', () => {
    const start = piecesFromFacelets(randomCube(seeded(5)));
    for (const face of ['U', 'R', 'F', 'D', 'L', 'B']) {
      expect(applyMoveNames(start, [face, `${face}'`])).toEqual(start);
    }
  });

  it('keeps every move a true permutation: no piece is lost or copied', () => {
    let p = piecesFromFacelets(randomCube(seeded(6)));
    for (const move of randomScramble(seeded(7), 40)) {
      p = applyMoveNames(p, [move]);
      expect([...p.cp].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect([...p.ep].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(p.co.reduce((a, b) => a + b, 0) % 3).toBe(0); // twists always add up to a multiple of 3
      expect(p.eo.reduce((a, b) => a + b, 0) % 2).toBe(0); // flips always add up to an even number
    }
  });

  it('rejects a move it does not know', () => {
    expect(() => applyMoveNames(solvedPieces(), ['X'])).toThrow('Invalid move "X"');
  });
});
