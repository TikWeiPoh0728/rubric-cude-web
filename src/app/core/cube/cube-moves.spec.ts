import { describe, it, expect } from 'vitest';
import Cube from '../solver/vendor/cubejs/index';
import {
  applyMove, applyMoves, formatMove, invertAlgorithm, invertMoveText, isInLayer, parseAlgorithm, parseMove,
  rotateClockwise,
} from './cube-moves';
import { FACES, solvedCube } from './cube-validator';
import { CUBIE_POSITIONS, FACE_NORMALS } from './facelet-map';

const ALL_MOVES = FACES.flatMap(f => [f, `${f}'`, `${f}2`]);
const solved = () => solvedCube();
const str = (f: (string | null)[]) => f.join('');

describe('move notation', () => {
  it('parses and formats every move', () => {
    for (const m of ALL_MOVES) expect(formatMove(parseMove(m))).toBe(m);
  });

  it('maps the suffix to turns', () => {
    expect(parseMove('R')).toEqual({ face: 'R', turns: 1 });
    expect(parseMove("R'")).toEqual({ face: 'R', turns: -1 });
    expect(parseMove('R2')).toEqual({ face: 'R', turns: 2 });
  });

  it('rejects invalid moves', () => {
    for (const bad of ['', 'X', 'R3', "R''", 'r', 'RR', "2R"]) expect(() => parseMove(bad)).toThrow();
  });

  it('parses algorithms', () => {
    expect(parseAlgorithm("  U  R2 F' ").map(formatMove)).toEqual(['U', 'R2', "F'"]);
    expect(parseAlgorithm('')).toEqual([]);
  });
});

describe('inverting moves', () => {
  it('inverts single moves', () => {
    expect(invertMoveText('R')).toBe("R'");
    expect(invertMoveText("R'")).toBe('R');
    expect(invertMoveText('R2')).toBe('R2');
  });

  it('reverses and inverts algorithms, matching cubejs', () => {
    const alg = "R U2 F' D L2 B' R' U";
    expect(invertAlgorithm(alg.split(' ')).join(' ')).toBe(Cube.inverse(alg));
    expect(invertAlgorithm([])).toEqual([]);
  });

  it('an algorithm followed by its inverse returns to the start', () => {
    const alg = parseAlgorithm("R U2 F' D L2 B' R' U F2");
    const start = applyMoves(solved(), parseAlgorithm("L' D2 B"));
    const there = applyMoves(start, alg);
    expect(applyMoves(there, invertAlgorithm(alg.map(formatMove)).map(parseMove))).toEqual(start);
  });
});

describe('move geometry', () => {
  it('turns a layer of 9 cubies', () => {
    for (const face of FACES) {
      expect(CUBIE_POSITIONS.filter(c => isInLayer(face, c)).length).toBe(9); // 4 corners, 4 edges, the center
    }
  });

  it('turns U clockwise seen from above: front goes to the left', () => {
    expect(rotateClockwise({ x: 0, y: 0, z: 1 }, FACE_NORMALS.U)).toEqual({ x: -1, y: 0, z: 0 });
  });
});

describe('applyMove', () => {
  it('U on a solved cube moves the side top rows: F gets R, R gets B, B gets L, L gets F', () => {
    const expected =
      'UUUUUUUUU' + // U
      'BBBRRRRRR' + // R
      'RRRFFFFFF' + // F
      'DDDDDDDDD' + // D
      'FFFLLLLLL' + // L
      'LLLBBBBBB';  // B
    expect(str(applyMove(solved(), parseMove('U')))).toBe(expected);
  });

  it('does not change its input', () => {
    const before = solved();
    applyMove(before, parseMove('R'));
    expect(before).toEqual(solved());
  });

  it('four quarter turns, or a move and its inverse, give back the cube', () => {
    const scrambled = applyMoves(solved(), parseAlgorithm("R U2 F' D L2 B R' U"));
    for (const face of FACES) {
      const turn = parseMove(face);
      let f = scrambled;
      for (let i = 0; i < 4; i++) f = applyMove(f, turn);
      expect(f).toEqual(scrambled);
      expect(applyMove(applyMove(scrambled, turn), parseMove(`${face}'`))).toEqual(scrambled);
      expect(applyMove(scrambled, parseMove(`${face}2`))).toEqual(applyMove(applyMove(scrambled, turn), turn));
    }
  });

  it('keeps the centers fixed', () => {
    const f = applyMoves(solved(), parseAlgorithm("R U F' D2 L B' R2"));
    [4, 13, 22, 31, 40, 49].forEach((i, k) => expect(f[i]).toBe(FACES[k]));
  });

  describe('matches the independent cubejs model', () => {
    it('for each of the 18 moves on a solved cube', () => {
      for (const m of ALL_MOVES) {
        const oracle = new Cube().move(m).asString();
        expect(str(applyMove(solved(), parseMove(m))), m).toBe(oracle);
      }
    });

    it('for each of the 18 moves on a scrambled cube', () => {
      const scramble = "R U2 F' D L2 B R' U F2 L' D' B2";
      const base = applyMoves(solved(), parseAlgorithm(scramble));
      expect(str(base)).toBe(new Cube().move(scramble).asString());
      for (const m of ALL_MOVES) {
        const oracle = Cube.fromString(str(base)).move(m).asString();
        expect(str(applyMove(base, parseMove(m))), m).toBe(oracle);
      }
    });

    it('for long random algorithms', () => {
      let seed = 12345;
      const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (let round = 0; round < 20; round++) {
        const alg = Array.from({ length: 25 }, () => ALL_MOVES[Math.floor(rand() * ALL_MOVES.length)]).join(' ');
        expect(str(applyMoves(solved(), parseAlgorithm(alg))), alg).toBe(new Cube().move(alg).asString());
      }
    });
  });
});
