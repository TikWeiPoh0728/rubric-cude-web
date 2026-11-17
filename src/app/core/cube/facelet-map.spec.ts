import { describe, it, expect } from 'vitest';
import {
  CUBIE_POSITIONS, FACELETS, FACE_NORMALS, Vec3, cubieKey, faceletIndexAt, faceletInfo,
  faceletsOnCubie, sameVec,
} from './facelet-map';
import {
  CENTERS, CORNER_PIECES, CORNER_SLOTS, EDGE_PIECES, EDGE_SLOTS, FACES,
} from './cube-validator';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Where each validator slot (named in cube-validator.ts comments) must sit in 3D. */
const CORNER_POS: Vec3[] = [
  v(1, 1, 1),    // URF
  v(-1, 1, 1),   // UFL
  v(-1, 1, -1),  // ULB
  v(1, 1, -1),   // UBR
  v(1, -1, 1),   // DFR
  v(-1, -1, 1),  // DLF
  v(-1, -1, -1), // DBL
  v(1, -1, -1),  // DRB
];
const EDGE_POS: Vec3[] = [
  v(1, 1, 0), v(0, 1, 1), v(-1, 1, 0), v(0, 1, -1),     // UR UF UL UB
  v(1, -1, 0), v(0, -1, 1), v(-1, -1, 0), v(0, -1, -1), // DR DF DL DB
  v(1, 0, 1), v(-1, 0, 1), v(-1, 0, -1), v(1, 0, -1),   // FR FL BL BR
];

describe('facelet map: spec examples', () => {
  it('index 8 is the U sticker of the up-front-right corner', () => {
    const f = faceletInfo(8);
    expect(f.face).toBe('U');
    expect(f.cubie).toEqual(v(1, 1, 1));
    expect(f.normal).toEqual(v(0, 1, 0));
  });

  it('index 20 is the F sticker of the same corner', () => {
    const f = faceletInfo(20);
    expect(f.face).toBe('F');
    expect(f.cubie).toEqual(v(1, 1, 1));
    expect(f.normal).toEqual(v(0, 0, 1));
  });

  it('index 9 is the R sticker of the same corner', () => {
    const f = faceletInfo(9);
    expect(f.face).toBe('R');
    expect(f.cubie).toEqual(v(1, 1, 1));
  });

  it('hand-checked corners on the other faces', () => {
    expect(faceletInfo(0).cubie).toEqual(v(-1, 1, -1));  // U top-left = ULB
    expect(faceletInfo(29).cubie).toEqual(v(1, -1, 1));  // D, row 0 col 2 = DFR
    expect(faceletInfo(51).cubie).toEqual(v(1, -1, -1)); // B, row 2 col 0 = DRB
    expect(faceletInfo(38).cubie).toEqual(v(-1, 1, 1));  // L, row 0 col 2 = UFL
  });

  it('centers sit at the middle of each face, with the face normal', () => {
    CENTERS.forEach((idx, i) => {
      const f = faceletInfo(idx);
      expect(f.face).toBe(FACES[i]);
      expect(f.cubie).toEqual(FACE_NORMALS[FACES[i]]);
      expect(f.normal).toEqual(FACE_NORMALS[FACES[i]]);
    });
  });
});

describe('facelet map: structure', () => {
  it('has 54 facelets with unique (cubie, normal) pairs', () => {
    expect(FACELETS.length).toBe(54);
    const keys = new Set(FACELETS.map(f => `${cubieKey(f.cubie)}|${cubieKey(f.normal)}`));
    expect(keys.size).toBe(54);
  });

  it('uses exactly the 26 cubie positions', () => {
    expect(CUBIE_POSITIONS.length).toBe(26);
    const used = new Set(FACELETS.map(f => cubieKey(f.cubie)));
    expect(used.size).toBe(26);
    CUBIE_POSITIONS.forEach(c => expect(used.has(cubieKey(c))).toBe(true));
  });

  it('has 8 corners (3 stickers), 12 edges (2) and 6 centers (1)', () => {
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const c of CUBIE_POSITIONS) counts[faceletsOnCubie(c).length]++;
    expect(counts).toEqual({ 1: 6, 2: 12, 3: 8 });
  });

  it('every sticker normal points out of its cubie along the face axis', () => {
    for (const f of FACELETS) {
      expect(sameVec(f.normal, FACE_NORMALS[f.face])).toBe(true);
      // the cubie must be on the outer layer that the normal points at
      const dot = f.cubie.x * f.normal.x + f.cubie.y * f.normal.y + f.cubie.z * f.normal.z;
      expect(dot).toBe(1);
    }
  });

  it('faceletIndexAt is the inverse of faceletInfo', () => {
    for (const f of FACELETS) expect(faceletIndexAt(f.cubie, f.normal)).toBe(f.index);
    expect(faceletIndexAt(v(0, 0, 0), v(0, 1, 0))).toBe(-1);
  });
});

describe('facelet map vs cube-validator tables', () => {
  it('each corner slot lies on one cubie, at the position its name implies', () => {
    CORNER_SLOTS.forEach((slot, i) => {
      slot.forEach(idx => expect(faceletInfo(idx).cubie).toEqual(CORNER_POS[i]));
    });
  });

  it('each edge slot lies on one cubie, at the position its name implies', () => {
    EDGE_SLOTS.forEach((slot, i) => {
      slot.forEach(idx => expect(faceletInfo(idx).cubie).toEqual(EDGE_POS[i]));
    });
  });

  it('slot stickers belong to the faces the piece colors name (solved cube)', () => {
    CORNER_SLOTS.forEach((slot, i) =>
      slot.forEach((idx, k) => expect(faceletInfo(idx).face).toBe(CORNER_PIECES[i][k])));
    EDGE_SLOTS.forEach((slot, i) =>
      slot.forEach((idx, k) => expect(faceletInfo(idx).face).toBe(EDGE_PIECES[i][k])));
  });

  it('corner slots list their stickers clockwise when viewed from outside', () => {
    // For a corner at p, the clockwise order seen from outside satisfies
    // (n0 × n1) · p < 0 for consecutive stickers.
    for (const slot of CORNER_SLOTS) {
      for (let k = 0; k < 3; k++) {
        const a = faceletInfo(slot[k]).normal;
        const b = faceletInfo(slot[(k + 1) % 3]).normal;
        const p = faceletInfo(slot[0]).cubie;
        const cross = v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
        const dot = cross.x * p.x + cross.y * p.y + cross.z * p.z;
        expect(dot).toBeLessThan(0);
      }
    }
  });
});
