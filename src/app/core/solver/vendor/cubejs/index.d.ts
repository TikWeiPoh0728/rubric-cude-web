// Minimal typings for the parts of cubejs (a JS port of Kociemba's two-phase solver) that we use.
export default class Cube {
  /** Build a cube from a 54-character facelet string in U R F D L B order. */
  static fromString(facelets: string): Cube;
  /** The algorithm that undoes `algorithm` (reversed, each move inverted). */
  static inverse(algorithm: string): string;
  /** Build the pruning tables. Slow (seconds), must be called once before `solve`. */
  static initSolver(): void;
  /** Apply an algorithm such as "U F R2 B' D2 L'" and return the cube. */
  move(algorithm: string): Cube;
  /** The cube as a 54-character facelet string. */
  asString(): string;
  /**
   * Space-separated solution, "" if already solved.
   * Throws when no solution fits within `maxDepth`.
   */
  solve(maxDepth?: number): string;
}
