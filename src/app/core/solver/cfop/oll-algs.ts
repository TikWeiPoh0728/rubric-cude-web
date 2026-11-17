/**
 * The 57 OLL (orient the last layer) algorithms, written as cubing books write them, with
 * wide moves, slices and rotations. They are converted to face turns by notation.ts.
 *
 * An OLL algorithm leaves the first two layers solved and makes the whole top face one
 * color; it may scramble the top layer's pieces, which PLL then fixes. Which algorithm to
 * use for a position is not stored anywhere: the solver tries every entry with every top
 * turn and keeps the shortest that works (see last-layer.ts). The tests check every entry.
 */
export interface Algorithm {
  name: string;
  /** In book notation: R U R' ... with r, M, x and so on allowed. */
  alg: string;
}

export const OLL_ALGS: readonly Algorithm[] = [
  // The dot and the "no edges" shapes
  { name: 'OLL 1', alg: "R U2 R2 F R F' U2 R' F R F'" },
  { name: 'OLL 2', alg: "F R U R' U' F' f R U R' U' f'" },
  { name: 'OLL 3', alg: "f R U R' U' f' U' F R U R' U' F'" },
  { name: 'OLL 4', alg: "f R U R' U' f' U F R U R' U' F'" },
  { name: 'OLL 17', alg: "R U R' U R' F R F' U2 R' F R F'" },
  { name: 'OLL 18', alg: "r U R' U R U2 r2 U' R U' R' U2 r" },
  { name: 'OLL 19', alg: "M U R U R' U' M' R' F R F'" },
  { name: 'OLL 20', alg: "r U R' U' M2 U R U' R' U' M'" },

  // Small L shapes and "P" shapes (corners oriented the other way, edges in a bar)
  { name: 'OLL 5', alg: "r' U2 R U R' U r" },
  { name: 'OLL 6', alg: "r U2 R' U' R U' r'" },
  { name: 'OLL 7', alg: "r U R' U R U2 r'" },
  { name: 'OLL 8', alg: "r' U' R U' R' U2 r" },
  { name: 'OLL 9', alg: "R U R' U' R' F R2 U R' U' F'" },
  { name: 'OLL 10', alg: "R U R' U R' F R F' R U2 R'" },
  { name: 'OLL 11', alg: "r U R' U R' F R F' R U2 r'" },
  { name: 'OLL 12', alg: "F R U R' U' F' U F R U R' U' F'" },
  { name: 'OLL 13', alg: "F U R U2 R' U' R U R' F'" },
  { name: 'OLL 14', alg: "R' F R U R' F' R F U' F'" },
  { name: 'OLL 15', alg: "r' U' r R' U' R U r' U r" },
  { name: 'OLL 16', alg: "r U r' R U R' U' r U' r'" },

  // Corner-oriented cases (OCLL) and their relatives
  { name: 'OLL 21', alg: "R U2 R' U' R U R' U' R U' R'" },
  { name: 'OLL 22', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  { name: 'OLL 23', alg: "R2 D R' U2 R D' R' U2 R'" },
  { name: 'OLL 24', alg: "r U R' U' r' F R F'" },
  { name: 'OLL 25', alg: "F' r U R' U' r' F R" },
  { name: 'OLL 26', alg: "R U2 R' U' R U' R'" },
  { name: 'OLL 27', alg: "R U R' U R U2 R'" },

  // Lines and squares
  { name: 'OLL 28', alg: "r U R' U' r' R U R U' R'" },
  { name: 'OLL 29', alg: "R U R' U' R U' R' F' U' F R U R'" },
  { name: 'OLL 30', alg: "F U R U2 R' U' R U2 R' U' F'" },
  { name: 'OLL 31', alg: "R' U' F U R U' R' F' R" },
  { name: 'OLL 32', alg: "R U B' U' R' U R B R'" },
  { name: 'OLL 33', alg: "R U R' U' R' F R F'" },
  { name: 'OLL 34', alg: "R U R2 U' R' F R U R U' F'" },
  { name: 'OLL 35', alg: "R U2 R2 F R F' R U2 R'" },
  { name: 'OLL 36', alg: "R' U' R U' R' U R U R B' R' B" },
  { name: 'OLL 37', alg: "F R' F' R U R U' R'" },
  { name: 'OLL 38', alg: "R U R' U R U' R' U' R' F R F'" },

  // Fish, knight-move, awkward and big-lightning shapes
  { name: 'OLL 39', alg: "R U R' F' U' F U R U2 R'" },
  { name: 'OLL 40', alg: "R' F R U R' U' F' U R" },
  { name: 'OLL 41', alg: "R U R' U R U2 R' F R U R' U' F'" },
  { name: 'OLL 42', alg: "R' U' R U' R' U2 R F R U R' U' F'" },
  { name: 'OLL 43', alg: "R' U' F' U F R" },
  { name: 'OLL 44', alg: "F U R U' R' F'" },
  { name: 'OLL 45', alg: "F R U R' U' F'" },
  { name: 'OLL 46', alg: "R' U' R' F R F' U R" },
  { name: 'OLL 47', alg: "R' U' R' F R F' R' F R F' U R" },
  { name: 'OLL 48', alg: "F R U R' U' R U R' U' F'" },
  { name: 'OLL 49', alg: "R B' R2 F R2 B R2 F' R" },
  { name: 'OLL 50', alg: "r' U r2 U' r2 U' r2 U r'" },
  { name: 'OLL 51', alg: "F U R U' R' U R U' R' F'" },
  { name: 'OLL 52', alg: "R U R' U R d' R U' R' F'" },
  { name: 'OLL 53', alg: "r' U' R U' R' U R U' R' U2 r" },
  { name: 'OLL 54', alg: "r U R' U R U' R' U R U2 r'" },
  { name: 'OLL 55', alg: "R U2 R2 U' R U' R' U2 F R F'" },
  { name: 'OLL 56', alg: "r U r' U R U' R' U R U' R' r U' r'" },
  { name: 'OLL 57', alg: "R U R' U' M' U R U' r'" },
];
