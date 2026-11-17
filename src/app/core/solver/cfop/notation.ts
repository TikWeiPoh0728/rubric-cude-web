/**
 * Cubing books write algorithms with wide moves (r, u), slice moves (M, E, S) and whole-cube
 * rotations (x, y, z). This app only animates single face turns (U R F D L B), so tables
 * are written the way books write them and converted here.
 *
 * Why the conversion is exact: with the centers held still, a whole-cube rotation changes
 * nothing about how the pieces sit relative to the centers; it only changes which face the
 * next move is named after. So every wide move, slice and rotation becomes plain face turns
 * plus a renaming of the faces for the moves that follow.
 *
 *   r = L + x      l = R + x'      u = D + y      d = U + y'      f = B + z      b = F + z'
 *   M = R L' + x'  E = U D' + y'   S = F' B + z
 * (x, y, z turn the whole cube like R, U, F.)
 */
import { Face } from '../../cube/cube-validator';

/** Which fixed face a face name currently refers to. */
type Frame = Record<Face, Face>;

const IDENTITY: Frame = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };

/** The frame after the whole cube turns like R (x), U (y) or F (z), one clockwise quarter turn. */
function rotate(frame: Frame, axis: 'x' | 'y' | 'z'): Frame {
  switch (axis) {
    case 'x': return { ...frame, U: frame.F, F: frame.D, D: frame.B, B: frame.U };
    case 'y': return { ...frame, F: frame.R, R: frame.B, B: frame.L, L: frame.F };
    case 'z': return { ...frame, U: frame.L, R: frame.U, D: frame.R, L: frame.D };
  }
}

/** quarter turns: 1 = clockwise, 2 = half turn, 3 = counter-clockwise. */
type Quarters = 1 | 2 | 3;

const TOKEN = /^([URFDLB]|[rludfb]|[MES]|[xyz])(2|')?$/;

/** What a single token turns, as [face, direction multiplier] pairs, then which rotation follows. */
const EXPANSION: Record<string, { turns: [Face, 1 | -1][]; rotation: 'x' | 'y' | 'z' | null; rotationSign: 1 | -1 }> = {
  U: { turns: [['U', 1]], rotation: null, rotationSign: 1 },
  R: { turns: [['R', 1]], rotation: null, rotationSign: 1 },
  F: { turns: [['F', 1]], rotation: null, rotationSign: 1 },
  D: { turns: [['D', 1]], rotation: null, rotationSign: 1 },
  L: { turns: [['L', 1]], rotation: null, rotationSign: 1 },
  B: { turns: [['B', 1]], rotation: null, rotationSign: 1 },
  r: { turns: [['L', 1]], rotation: 'x', rotationSign: 1 },
  l: { turns: [['R', 1]], rotation: 'x', rotationSign: -1 },
  u: { turns: [['D', 1]], rotation: 'y', rotationSign: 1 },
  d: { turns: [['U', 1]], rotation: 'y', rotationSign: -1 },
  f: { turns: [['B', 1]], rotation: 'z', rotationSign: 1 },
  b: { turns: [['F', 1]], rotation: 'z', rotationSign: -1 },
  M: { turns: [['R', 1], ['L', -1]], rotation: 'x', rotationSign: -1 },
  E: { turns: [['U', 1], ['D', -1]], rotation: 'y', rotationSign: -1 },
  S: { turns: [['F', -1], ['B', 1]], rotation: 'z', rotationSign: 1 },
  x: { turns: [], rotation: 'x', rotationSign: 1 },
  y: { turns: [], rotation: 'y', rotationSign: 1 },
  z: { turns: [], rotation: 'z', rotationSign: 1 },
};

const suffixFor = (quarters: Quarters): string => (quarters === 1 ? '' : quarters === 2 ? '2' : "'");

/**
 * Turn an algorithm written with wide moves, slices and rotations into face turns only.
 * @example expandNotation("r U R' U' r'") -> L moves and renamed faces, as plain U R F D L B turns
 */
export function expandNotation(text: string): string[] {
  const out: string[] = [];
  let frame = IDENTITY;
  const tokens = text.trim() === '' ? [] : text.trim().split(/\s+/);

  for (const token of tokens) {
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`Invalid move "${token}"`);
    const [, name, suffix] = m;
    const base = suffix === "'" ? -1 : 1; // direction of the written move
    const amount = suffix === '2' ? 2 : 1;
    const spec = EXPANSION[name];

    // The turns, named by the faces as they are right now.
    for (const [face, sign] of spec.turns) {
      const direction = base * sign;
      const quarters: Quarters = amount === 2 ? 2 : direction === 1 ? 1 : 3;
      out.push(frame[face] + suffixFor(quarters));
    }
    // Then the whole cube turns, which renames the faces for what follows.
    if (spec.rotation) {
      const direction = base * spec.rotationSign;
      const times = amount === 2 ? 2 : direction === 1 ? 1 : 3;
      for (let i = 0; i < times; i++) frame = rotate(frame, spec.rotation);
    }
  }
  return out;
}
