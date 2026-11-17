import { CubeSolver } from '../core/solver/cube-solver';
import { SolveMethod } from '../core/solver/solve-method';
import { Solution, plainSolution } from '../core/solver/solution';

/**
 * A solver the test controls: solve() stays pending until the test calls finish() or
 * fail(), so a test can look at the app while it is "solving".
 */
export class FakeSolver extends CubeSolver {
  calls: { method: SolveMethod; facelets: string }[] = [];
  private pending!: { resolve(solution: Solution): void; reject(error: Error): void };

  solve(method: SolveMethod, facelets: string): Promise<Solution> {
    this.calls.push({ method, facelets });
    return new Promise((resolve, reject) => (this.pending = { resolve, reject }));
  }

  /** Finish with a plain list of moves (no stages), or with a full solution. */
  finish(result: string[] | Solution): void {
    this.pending.resolve(Array.isArray(result) ? plainSolution(result) : result);
  }

  fail(message: string): void {
    this.pending.reject(new Error(message));
  }
}

/** Wait for promise callbacks (and the effects they trigger) to run. */
export const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve));
