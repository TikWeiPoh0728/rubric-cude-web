import type { Algorithm } from './oll-algs';

/**
 * The 21 PLL (permute the last layer) algorithms, in book notation. A PLL algorithm
 * is used on a cube whose top face is already one color, and leaves the cube solved
 * (possibly after a top turn before and one after, which the solver adds).
 */
export const PLL_ALGS: readonly Algorithm[] = [
  // Corners only / edges only 3-cycles
  { name: 'Aa', alg: "x R' U R' D2 R U' R' D2 R2 x'" },
  { name: 'Ab', alg: "x R2 D2 R U R' D2 R U' R x'" },
  { name: 'E', alg: "x' R U' R' D R U R' D' R U R' D R U' R' D' x" },
  { name: 'Ua', alg: "R U' R U R U R U' R' U' R2" },
  { name: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'" },
  { name: 'Z', alg: "M' U M2 U M2 U M' U2 M2" },
  { name: 'H', alg: "M2 U M2 U2 M2 U M2" },

  // Swaps of two edges and two corners
  { name: 'Ja', alg: "x R2 F R F' R U2 r' U r U2 x'" },
  { name: 'Jb', alg: "R U R' F' R U R' U' R' F R2 U' R'" },
  { name: 'T', alg: "R U R' U' R' F R2 U' R' U' R U R' F'" },
  { name: 'Y', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'" },
  { name: 'V', alg: "R' U R' U' y R' F' R2 U' R' U R' F R F" },
  { name: 'F', alg: "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R" },
  { name: 'Na', alg: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'" },
  { name: 'Nb', alg: "R' U R U' R' F' U' F R U R' F R' F' R U' R" },
  { name: 'Ra', alg: "R U' R' U' R U R D R' U' R D' R' U2 R'" },
  { name: 'Rb', alg: "R' U2 R U2 R' F R U R' U' R' F' R2" },

  // G perms
  { name: 'Ga', alg: "R2 U R' U R' U' R U' R2 U' D R' U R D'" },
  { name: 'Gb', alg: "R' U' R U D' R2 U R' U R U' R U' R2 D" },
  { name: 'Gc', alg: "R2 U' R U' R U R' U R2 U D' R U' R' D" },
  { name: 'Gd', alg: "R U R' U' D R2 U' R U' R' U R' U R2 D'" },
];
