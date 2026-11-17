import {
  EDGE_MOVES, MOVE_NAMES, PieceCube, applyMoveIndex, clonePieces,
} from './piece-cube';

/**
 * Stage 1, the cross: the four bottom edges (DR DF DL DB, pieces 4..7) in place and
 * oriented. Only those four pieces matter, so the state is small (190,080 reachable
 * positions) and a breadth-first table gives the exact number of moves left from any
 * of them. Following the table downhill is therefore an optimal cross, at most 8 moves.
 */
const CROSS_PIECES = [4, 5, 6, 7];
const STATES = 24 * 24 * 24 * 24; // 4 edges x (12 positions x 2 flips)
const UNSEEN = 255;

/** Pack four (position, flip) pairs into one number. */
const encode = (cells: number[]): number => ((cells[0] * 24 + cells[1]) * 24 + cells[2]) * 24 + cells[3];

function decode(state: number): number[] {
  return [Math.floor(state / 13824) % 24, Math.floor(state / 576) % 24, Math.floor(state / 24) % 24, state % 24];
}

/** The cross state of a cube: for each bottom edge, 2 * position + flip. */
export function crossState(p: PieceCube): number {
  const cells = [0, 0, 0, 0];
  for (let position = 0; position < 12; position++) {
    const k = CROSS_PIECES.indexOf(p.ep[position]);
    if (k >= 0) cells[k] = position * 2 + p.eo[position];
  }
  return encode(cells);
}

let table: Uint8Array | null = null;

/** Moves needed to finish the cross from each cross state. Built on first use (about 100 ms). */
export function crossTable(): Uint8Array {
  if (table) return table;
  const distance = new Uint8Array(STATES).fill(UNSEEN);
  const home = encode(CROSS_PIECES.map(piece => piece * 2));
  distance[home] = 0;
  let frontier = [home];
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const state of frontier) {
      const cells = decode(state);
      for (let m = 0; m < 18; m++) {
        const moved = cells.map(c => {
          const position = c >> 1;
          return EDGE_MOVES.dest[m][position] * 2 + ((c & 1) ^ EDGE_MOVES.flip[m][position]);
        });
        const code = encode(moved);
        if (distance[code] === UNSEEN) {
          distance[code] = depth;
          next.push(code);
        }
      }
    }
    frontier = next;
  }
  table = distance;
  return table;
}

/** How many moves the cross is away from done (exact). */
export function crossDistance(p: PieceCube): number {
  return crossTable()[crossState(p)];
}

/** An optimal cross for this cube: the moves, in standard notation. Empty if it is already done. */
export function solveCross(p: PieceCube): string[] {
  const moves: string[] = [];
  let current = clonePieces(p);
  let spare = clonePieces(p);
  let left = crossDistance(current);
  while (left > 0) {
    let stepped = false;
    for (let m = 0; m < 18 && !stepped; m++) {
      applyMoveIndex(current, m, spare);
      if (crossDistance(spare) === left - 1) {
        moves.push(MOVE_NAMES[m]);
        [current, spare] = [spare, current];
        left--;
        stepped = true;
      }
    }
    if (!stepped) throw new Error('The cross table has no way down: it was not built correctly');
  }
  return moves;
}
