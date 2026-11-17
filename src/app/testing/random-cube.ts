import { applyMoves, parseMove } from '../core/cube/cube-moves';
import { Facelets, solvedCube } from '../core/cube/cube-validator';

const ALL_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap(f => [f, `${f}'`, `${f}2`]);

/** A repeatable random number generator (the same seed always gives the same numbers). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A random scramble that never turns the same face twice in a row. */
export function randomScramble(random: () => number, length = 30): string[] {
  const moves: string[] = [];
  while (moves.length < length) {
    const move = ALL_MOVES[Math.floor(random() * ALL_MOVES.length)];
    if (moves.length === 0 || moves[moves.length - 1][0] !== move[0]) moves.push(move);
  }
  return moves;
}

/** A random, genuinely solvable cube (a solved cube with a random scramble applied). */
export function randomCube(random: () => number, length = 30): Facelets {
  return applyMoves(solvedCube(), randomScramble(random, length).map(parseMove));
}
