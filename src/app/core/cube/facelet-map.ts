/**
 * Pure geometry of the facelet array: which cubie and which side of that cubie
 * each of the 54 kociemba facelet indices belongs to.
 *
 * Coordinates: right-handed, x = right, y = up, z = toward the viewer (F = +z).
 * A cubie sits at (x, y, z) with each component in {-1, 0, 1}.
 * No Three.js and no colors in here — only geometry.
 */
import { Face, FACES } from './cube-validator';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FaceletInfo {
  /** Index 0..53 in kociemba order. */
  readonly index: number;
  readonly face: Face;
  /** Row 0..2 from the top of the face's own 2D view. */
  readonly row: number;
  /** Column 0..2 from the left of the face's own 2D view. */
  readonly col: number;
  /** Grid position of the cubie carrying this sticker. */
  readonly cubie: Vec3;
  /** Outward unit normal of the sticker (equals the face's normal). */
  readonly normal: Vec3;
}

export const FACE_NORMALS: Readonly<Record<Face, Vec3>> = {
  U: { x: 0, y: 1, z: 0 },
  R: { x: 1, y: 0, z: 0 },
  F: { x: 0, y: 0, z: 1 },
  D: { x: 0, y: -1, z: 0 },
  L: { x: -1, y: 0, z: 0 },
  B: { x: 0, y: 0, z: -1 },
};

/** Cubie position for a sticker at (row, col) on `face`. */
function cubiePosition(face: Face, row: number, col: number): Vec3 {
  switch (face) {
    case 'U': return { x: col - 1, y: 1, z: row - 1 };
    case 'R': return { x: 1, y: 1 - row, z: 1 - col };
    case 'F': return { x: col - 1, y: 1 - row, z: 1 };
    case 'D': return { x: col - 1, y: -1, z: 1 - row };
    case 'L': return { x: -1, y: 1 - row, z: col - 1 };
    case 'B': return { x: 1 - col, y: 1 - row, z: -1 };
  }
}

/** All 54 facelets, indexed by facelet index. */
export const FACELETS: readonly FaceletInfo[] = Array.from({ length: 54 }, (_, index) => {
  const face = FACES[Math.floor(index / 9)];
  const row = Math.floor((index % 9) / 3);
  const col = index % 3;
  return { index, face, row, col, cubie: cubiePosition(face, row, col), normal: FACE_NORMALS[face] };
});

export function faceletInfo(index: number): FaceletInfo {
  return FACELETS[index];
}

/** Inverse: the facelet index at a given cubie position and outward normal, or -1. */
export function faceletIndexAt(cubie: Vec3, normal: Vec3): number {
  return FACELETS.findIndex(f => sameVec(f.cubie, cubie) && sameVec(f.normal, normal));
}

export function sameVec(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

export function cubieKey(c: Vec3): string {
  return `${c.x},${c.y},${c.z}`;
}

/** The 26 cubie positions (everything in {-1,0,1}^3 except the hidden core). */
export const CUBIE_POSITIONS: readonly Vec3[] = (() => {
  const out: Vec3[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++)
        if (x !== 0 || y !== 0 || z !== 0) out.push({ x, y, z });
  return out;
})();

/** Facelet indices on a given cubie, in index order. */
export function faceletsOnCubie(cubie: Vec3): FaceletInfo[] {
  return FACELETS.filter(f => sameVec(f.cubie, cubie));
}
