import { crossDistance } from './cross';
import { F2L_PAIRS } from './stage-checks';
import { MOVE_NAMES, PieceCube, applyMoveIndex, clonePieces } from './piece-cube';

/**
 * Stage 2, F2L (first two layers): put the four corner-edge pairs into their slots
 * without losing the cross.
 *
 * The search does not try all 18 moves: that explodes, and its answers would not look
 * like CFOP. It builds solutions the way a person does, from two kinds of building block:
 *  - a turn of the top layer (U, U', U2), to line pieces up;
 *  - a "conjugate" X U^a X', for X one of R, L, F, B turned either way: X lifts the
 *    pair in one slot up into the top layer, U^a moves the top layer, X' puts it back.
 *    This is how a pair is pulled out of a slot and how it is inserted.
 * A conjugate never carries a bottom-layer edge into the top layer, so the cross comes
 * back after every block. Only the slot that X turns is disturbed, so the pairs in the
 * other slots come back too.
 *
 * Each pair is found by trying total lengths 1, 2, 3, ... until some block sequence
 * solves it, so the sequence is the shortest one these blocks can make. The pair that
 * is quickest to solve goes first.
 */
const U = [0, 1, 2]; // U, U', U2 as indices into MOVE_NAMES

interface Block {
  /** Indices into MOVE_NAMES, in order. */
  moves: number[];
  /** The side face X it is built on (0..5), or -1 for a plain top-layer turn. */
  face: number;
  /** +1 if X is turned clockwise first, -1 if counter-clockwise; 0 for a plain top turn. */
  direction: number;
}

/** Index of a face's move in MOVE_NAMES: [clockwise, counter-clockwise] = 3f, 3f + 1. */
const turn = (face: number, direction: number) => face * 3 + (direction > 0 ? 0 : 1);

const BLOCKS: readonly Block[] = (() => {
  const blocks: Block[] = U.map(m => ({ moves: [m], face: -1, direction: 0 }));
  // R = face 1, F = face 2, L = face 4, B = face 5 (U R F D L B)
  for (const face of [1, 4, 2, 5]) {
    for (const direction of [1, -1]) {
      for (const u of U) blocks.push({ moves: [turn(face, direction), u, turn(face, -direction)], face, direction });
    }
  }
  return blocks;
})();

/** The longest sequence (in moves) we will look for. Every cube tried so far needs far less. */
const MAX_LENGTH = 17;

const cornerHome = (p: PieceCube, c: number) => p.cp[c] === c && p.co[c] === 0;
const edgeHome = (p: PieceCube, e: number) => p.ep[e] === e && p.eo[e] === 0;

/** Is the pair (a bottom corner and the middle edge beside it) solved? */
export function pairSolved(p: PieceCube, pair: number): boolean {
  const { corner, edge } = F2L_PAIRS[pair];
  return cornerHome(p, corner) && edgeHome(p, edge);
}

/** Does `p` have the cross and these pairs solved? */
function goalReached(p: PieceCube, pairs: readonly number[]): boolean {
  return crossDistance(p) === 0 && pairs.every(k => pairSolved(p, k));
}

/** Apply a block's moves to `from`, writing the result into `to`. `tmp` holds the middle steps. */
function applyBlock(from: PieceCube, block: Block, to: PieceCube, tmp: [PieceCube, PieceCube]): void {
  const m = block.moves;
  if (m.length === 1) {
    applyMoveIndex(from, m[0], to);
  } else {
    applyMoveIndex(from, m[0], tmp[0]);
    applyMoveIndex(tmp[0], m[1], tmp[1]);
    applyMoveIndex(tmp[1], m[2], to);
  }
}

/** The blocks of a sequence of exactly `length` moves that solves the cross plus `pairs`, or null. */
function findSequence(start: PieceCube, pairs: readonly number[], length: number): number[] | null {
  // levels[d] is the cube after d blocks; nothing is allocated while the search runs.
  const levels: PieceCube[] = Array.from({ length: length + 1 }, () => clonePieces(start));
  levels[0] = clonePieces(start);
  const tmp: [PieceCube, PieceCube] = [clonePieces(start), clonePieces(start)];
  const chosen: number[] = [];

  const dfs = (remaining: number, previous: number): boolean => {
    const depth = chosen.length;
    if (remaining === 0) return goalReached(levels[depth], pairs);
    for (let b = 0; b < BLOCKS.length; b++) {
      const block = BLOCKS[b];
      if (block.moves.length > remaining) continue;
      if (previous >= 0) {
        const last = BLOCKS[previous];
        if (block.face === -1 && last.face === -1) continue; // two top turns in a row are one top turn
        // The same side turned the same way twice would cancel its own X' X.
        if (block.face !== -1 && block.face === last.face && block.direction === last.direction) continue;
      }
      applyBlock(levels[depth], block, levels[depth + 1], tmp);
      chosen.push(b);
      if (dfs(remaining - block.moves.length, b)) return true;
      chosen.pop();
    }
    return false;
  };

  return dfs(length, -1) ? [...chosen] : null;
}

/**
 * Solve the four pairs from a cube whose cross is solved.
 * @returns the moves in standard notation; empty if the first two layers are already done.
 * Throws if the blocks cannot solve it within MAX_LENGTH moves per pair.
 */
export function solveF2l(start: PieceCube): string[] {
  if (crossDistance(start) !== 0) throw new Error('F2L needs the cross solved first');
  let current = clonePieces(start);
  const out: string[] = [];
  const done = new Set<number>(F2L_PAIRS.map((_, k) => k).filter(k => pairSolved(current, k)));

  while (done.size < F2L_PAIRS.length) {
    const todo = F2L_PAIRS.map((_, k) => k).filter(k => !done.has(k));
    let step: { pair: number; blocks: number[] } | null = null;
    for (let length = 1; length <= MAX_LENGTH && !step; length++) {
      for (const pair of todo) {
        const blocks = findSequence(current, [...done, pair], length);
        if (blocks) {
          step = { pair, blocks };
          break;
        }
      }
    }
    if (!step) throw new Error('No F2L solution found within the move limit');

    for (const b of step.blocks) {
      for (const m of BLOCKS[b].moves) {
        const next = clonePieces(current);
        applyMoveIndex(current, m, next);
        current = next;
        out.push(MOVE_NAMES[m]);
      }
    }
    for (let k = 0; k < F2L_PAIRS.length; k++) if (pairSolved(current, k)) done.add(k);
  }
  return out;
}
