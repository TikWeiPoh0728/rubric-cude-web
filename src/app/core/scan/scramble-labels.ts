/**
 * Expected labels for test photos, so they need not be labeled by hand: apply a
 * scramble to a solved cube with the app's own move logic and read off each face.
 */
import { parseAlgorithm, applyMoves } from '../cube/cube-moves';
import { Face, FACES, solvedCube } from '../cube/cube-validator';
import type { ScanLabel } from './scan-types';

/**
 * @param scramble moves in standard notation, e.g. "R U R' F2"
 * @returns for each face, its 9 stickers row-major in kociemba orientation
 *          (U seen from above with B at the top; D seen from below with F at the top;
 *          R, F, L, B seen from outside with U at the top).
 */
export function expectedFaces(scramble: string): Record<Face, Face[]> {
  const facelets = applyMoves(solvedCube(), parseAlgorithm(scramble));
  const result = {} as Record<Face, Face[]>;
  FACES.forEach((face, f) => {
    result[face] = facelets.slice(f * 9, f * 9 + 9) as Face[];
  });
  return result;
}

/** The six label files for one scrambled cube. */
export function labelsForScramble(scramble: string): ScanLabel[] {
  const faces = expectedFaces(scramble);
  const trimmed = scramble.trim().replace(/\s+/g, ' ');
  return FACES.map(face => ({ face, stickers: faces[face], scramble: trimmed }));
}
