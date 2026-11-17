/**
 * Face turns in standard notation (U, R', F2, ...) applied to the facelet array.
 * Pure TypeScript, no Three.js: the move tables are derived from the 3D geometry
 * in facelet-map.ts, so the animation and the state change always agree.
 */
import { Face, FACES, Facelets } from './cube-validator';
import { FACELETS, FACE_NORMALS, Vec3, faceletIndexAt } from './facelet-map';

export interface Move {
  face: Face;
  /** Clockwise quarter turns seen from outside that face: 1, 2 (half turn) or -1 (counter-clockwise). */
  turns: 1 | 2 | -1;
}

const MOVE_PATTERN = /^([URFDLB])(2|')?$/;

/** Parse "R", "R'" or "R2". Throws on anything else. */
export function parseMove(text: string): Move {
  const m = MOVE_PATTERN.exec(text);
  if (!m) throw new Error(`Invalid move "${text}"`);
  return { face: m[1] as Face, turns: m[2] === "'" ? -1 : m[2] === '2' ? 2 : 1 };
}

export function formatMove(move: Move): string {
  return move.face + (move.turns === -1 ? "'" : move.turns === 2 ? '2' : '');
}

export function parseAlgorithm(text: string): Move[] {
  const trimmed = text.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/).map(parseMove);
}

/** The move that undoes `text`: R -> R', R' -> R, R2 -> R2. */
export function invertMoveText(text: string): string {
  const { face, turns } = parseMove(text);
  return formatMove({ face, turns: turns === 2 ? 2 : turns === 1 ? -1 : 1 });
}

/** The algorithm that undoes `moves`: reversed order, each move inverted. */
export function invertAlgorithm(moves: readonly string[]): string[] {
  return [...moves].reverse().map(invertMoveText);
}

/** True if the cubie at this grid position belongs to the layer turned by `face`. */
export function isInLayer(face: Face, cubie: Vec3): boolean {
  const n = FACE_NORMALS[face];
  return cubie.x * n.x + cubie.y * n.y + cubie.z * n.z === 1;
}

/** Rotate `v` by a quarter turn clockwise as seen from outside the face with normal `n`: -90° about n. */
export function rotateClockwise(v: Vec3, n: Vec3): Vec3 {
  const dot = n.x * v.x + n.y * v.y + n.z * v.z;
  // v' = v*cos(-90°) + (n × v)*sin(-90°) + n*(n·v)*(1 - cos(-90°)) = -(n × v) + n*(n·v)
  // The trailing "+ 0" turns -0 into 0.
  return {
    x: -(n.y * v.z - n.z * v.y) + n.x * dot + 0,
    y: -(n.z * v.x - n.x * v.z) + n.y * dot + 0,
    z: -(n.x * v.y - n.y * v.x) + n.z * dot + 0,
  };
}

/**
 * For each face, the permutation of one clockwise quarter turn:
 * `after[i] = before[QUARTER[face][i]]`.
 */
const QUARTER: Readonly<Record<Face, readonly number[]>> = (() => {
  const tables = {} as Record<Face, number[]>;
  for (const face of FACES) {
    const n = FACE_NORMALS[face];
    const source = Array.from({ length: 54 }, (_, i) => i);
    for (const f of FACELETS) {
      if (!isInLayer(face, f.cubie)) continue;
      const target = faceletIndexAt(rotateClockwise(f.cubie, n), rotateClockwise(f.normal, n));
      source[target] = f.index;
    }
    tables[face] = source;
  }
  return tables;
})();

/** Apply one move and return a new array. */
export function applyMove(facelets: Facelets, move: Move): Facelets {
  const quarters = ((move.turns % 4) + 4) % 4;
  let current = facelets;
  for (let q = 0; q < quarters; q++) {
    const perm = QUARTER[move.face];
    current = current.map((_, i) => current[perm[i]]);
  }
  return quarters === 0 ? [...facelets] : current;
}

export function applyMoves(facelets: Facelets, moves: readonly Move[]): Facelets {
  return moves.reduce(applyMove, facelets);
}
