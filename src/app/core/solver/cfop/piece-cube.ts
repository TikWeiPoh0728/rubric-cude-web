/**
 * The cube as pieces instead of stickers: where each of the 8 corners and 12 edges is,
 * and how it is twisted. Searching needs this because a move is a handful of array
 * lookups here, against shuffling 54 stickers.
 *
 * Every table is derived from the sticker-level `applyMove`, so the solver and the
 * animation can never disagree about what a move does.
 *
 * Numbering follows cube-validator.ts:
 *  - corners: URF UFL ULB UBR DFR DLF DBL DRB (0..7)
 *  - edges:   UR UF UL UB DR DF DL DB FR FL BL BR (0..11)
 */
import { applyMove, parseMove } from '../../cube/cube-moves';
import {
  CENTERS, CORNER_PIECES, CORNER_SLOTS, EDGE_PIECES, EDGE_SLOTS, FACES, Facelets, solvedCube,
} from '../../cube/cube-validator';

/**
 * By position: `cp[i]` is the corner piece sitting in corner position i and `co[i]` its
 * twist (0, 1, 2); `ep` and `eo` likewise for the 12 edge positions (flip 0 or 1).
 * A twist of 0 means the piece reads the same way round as its position's sticker list
 * in cube-validator.ts (CORNER_SLOTS / EDGE_SLOTS).
 */
export interface PieceCube {
  cp: Uint8Array;
  co: Uint8Array;
  ep: Uint8Array;
  eo: Uint8Array;
}

/** All 18 moves, in a fixed order: U U' U2 R R' R2 F F' F2 D D' D2 L L' L2 B B' B2. */
export const MOVE_NAMES: readonly string[] = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap(f => [f, `${f}'`, `${f}2`]);

/** The face (0..5, in U R F D L B order) each of the 18 moves turns. */
export const MOVE_FACE: readonly number[] = MOVE_NAMES.map((_, i) => Math.floor(i / 3));

export function solvedPieces(): PieceCube {
  return {
    cp: Uint8Array.from({ length: 8 }, (_, i) => i),
    co: new Uint8Array(8),
    ep: Uint8Array.from({ length: 12 }, (_, i) => i),
    eo: new Uint8Array(12),
  };
}

export function clonePieces(p: PieceCube): PieceCube {
  return { cp: p.cp.slice(), co: p.co.slice(), ep: p.ep.slice(), eo: p.eo.slice() };
}

/** Read the pieces off a (complete, valid) sticker cube. Throws if a piece cannot be identified. */
export function piecesFromFacelets(f: Facelets): PieceCube {
  const p = solvedPieces();
  CORNER_SLOTS.forEach((slot, position) => {
    const stickers = slot.map(i => f[i]);
    for (let piece = 0; piece < 8; piece++) {
      for (let twist = 0; twist < 3; twist++) {
        if (CORNER_PIECES[piece].every((color, k) => stickers[(k + twist) % 3] === color)) {
          p.cp[position] = piece;
          p.co[position] = twist;
          return;
        }
      }
    }
    throw new Error(`Corner at position ${position} is not a real corner`);
  });
  EDGE_SLOTS.forEach((slot, position) => {
    const stickers = slot.map(i => f[i]);
    for (let piece = 0; piece < 12; piece++) {
      for (let flip = 0; flip < 2; flip++) {
        if (EDGE_PIECES[piece].every((color, k) => stickers[(k + flip) % 2] === color)) {
          p.ep[position] = piece;
          p.eo[position] = flip;
          return;
        }
      }
    }
    throw new Error(`Edge at position ${position} is not a real edge`);
  });
  return p;
}

/** The sticker cube for these pieces (centers are always in place). */
export function piecesToFacelets(p: PieceCube): Facelets {
  const f: Facelets = new Array(54).fill(null);
  CENTERS.forEach((index, i) => (f[index] = FACES[i]));
  CORNER_SLOTS.forEach((slot, position) => {
    CORNER_PIECES[p.cp[position]].forEach((color, k) => (f[slot[(k + p.co[position]) % 3]] = color));
  });
  EDGE_SLOTS.forEach((slot, position) => {
    EDGE_PIECES[p.ep[position]].forEach((color, k) => (f[slot[(k + p.eo[position]) % 2]] = color));
  });
  return f;
}

/**
 * What each move does to a solved cube. From a solved cube the piece in position j after a
 * move is the one that came from position `cp[j]`, and its twist is the twist the move adds.
 */
const MOVE_TABLE: readonly PieceCube[] = MOVE_NAMES.map(name => piecesFromFacelets(applyMove(solvedCube(), parseMove(name))));

/**
 * Apply move number `m` (an index into MOVE_NAMES) to `p`, writing into `out`.
 * `out` must be a different object from `p`. Returns `out`.
 */
export function applyMoveIndex(p: PieceCube, m: number, out: PieceCube): PieceCube {
  const t = MOVE_TABLE[m];
  for (let j = 0; j < 8; j++) {
    const from = t.cp[j];
    out.cp[j] = p.cp[from];
    out.co[j] = (p.co[from] + t.co[j]) % 3;
  }
  for (let j = 0; j < 12; j++) {
    const from = t.ep[j];
    out.ep[j] = p.ep[from];
    out.eo[j] = (p.eo[from] + t.eo[j]) & 1;
  }
  return out;
}

/** Apply a list of moves in standard notation and return a new cube. */
export function applyMoveNames(p: PieceCube, moves: readonly string[]): PieceCube {
  let current = clonePieces(p);
  let spare = clonePieces(p);
  for (const name of moves) {
    const m = MOVE_NAMES.indexOf(name);
    if (m < 0) throw new Error(`Invalid move "${name}"`);
    applyMoveIndex(current, m, spare);
    [current, spare] = [spare, current];
  }
  return current;
}

/** Where each edge position's piece goes under each move, and how it flips: `dest[m][from]`, `flip[m][from]`. */
export const EDGE_MOVES: { dest: readonly Uint8Array[]; flip: readonly Uint8Array[] } = (() => {
  const dest: Uint8Array[] = [];
  const flip: Uint8Array[] = [];
  MOVE_TABLE.forEach(t => {
    const d = new Uint8Array(12);
    const fl = new Uint8Array(12);
    for (let j = 0; j < 12; j++) {
      d[t.ep[j]] = j;
      fl[t.ep[j]] = t.eo[j];
    }
    dest.push(d);
    flip.push(fl);
  });
  return { dest, flip };
})();
