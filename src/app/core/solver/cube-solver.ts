import { Injectable } from '@angular/core';
import { CfopRequest, CfopResponse } from './cfop/cfop-protocol';
import { SolveRequest, SolveResponse, VARIANTS } from './kociemba-protocol';
import { SOLVE_METHODS, SolveMethod } from './solve-method';
import { Solution, plainSolution, stagedSolution } from './solution';

/**
 * Turns a facelet string into a solution. An abstract class so the real
 * solver can be swapped (another method, a backend) or faked in tests.
 */
@Injectable({ providedIn: 'root', useFactory: () => new WorkerCubeSolver() })
export abstract class CubeSolver {
  /**
   * @param facelets 54 characters in U R F D L B order.
   * @returns the moves, such as ["R", "U'", "F2"] (empty if the cube is already solved),
   *          grouped into stages for methods that have them.
   */
  abstract solve(method: SolveMethod, facelets: string): Promise<Solution>;
}

/** The few things the pool needs from a Web Worker; lets tests plug in a fake. */
export interface SolverWorker {
  postMessage(request: SolveRequest): void;
  terminate(): void;
  listen(onResponse: (response: SolveResponse) => void, onFailure: (message: string) => void): void;
}

/** The few things the CFOP path needs from a Web Worker. */
export interface CfopWorker {
  postMessage(request: CfopRequest): void;
  terminate(): void;
  listen(onResponse: (response: CfopResponse) => void, onFailure: (message: string) => void): void;
}

export interface PoolOptions {
  createWorker(): SolverWorker;
  /** One worker for CFOP, which is a single quick pass, not a race between variants. */
  createCfopWorker(): CfopWorker;
  /** Workers to run side by side, each on a different variant of the cube. */
  size: number;
  /** How long to keep looking for a shorter solution after the first one arrives. */
  improveMs: number;
  /** Stop at once when a solution this short turns up (the average optimal solution is about 18). */
  goodEnough: number;
}

function createKociembaWorker(): SolverWorker {
  const worker = new Worker(new URL('./kociemba.worker', import.meta.url), { type: 'module' });
  return {
    postMessage: request => worker.postMessage(request),
    terminate: () => worker.terminate(),
    listen(onResponse, onFailure) {
      worker.onmessage = (event: MessageEvent<SolveResponse>) => onResponse(event.data);
      worker.onerror = (event: ErrorEvent) => onFailure(event.message || 'The solver stopped unexpectedly.');
    },
  };
}

function createCfopWorker(): CfopWorker {
  const worker = new Worker(new URL('./cfop/cfop.worker', import.meta.url), { type: 'module' });
  return {
    postMessage: request => worker.postMessage(request),
    terminate: () => worker.terminate(),
    listen(onResponse, onFailure) {
      worker.onmessage = (event: MessageEvent<CfopResponse>) => onResponse(event.data);
      worker.onerror = (event: ErrorEvent) => onFailure(event.message || 'The solver stopped unexpectedly.');
    },
  };
}

function defaultOptions(): PoolOptions {
  const cores = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency || 4;
  return {
    createWorker: createKociembaWorker,
    createCfopWorker,
    // Leave one core for the page, but always use at least two variants.
    size: Math.min(VARIANTS.length, Math.max(2, cores - 1)),
    improveMs: 2000,
    goodEnough: 17,
  };
}

/**
 * Runs the solving methods in Web Workers, so the page stays responsive.
 *
 * Kociemba: the first solution arrives fast but is often 20-22 moves. Searching for a shorter
 * one can take minutes, and a running search cannot be interrupted from inside, so
 * several workers each search a different variant of the cube and report every
 * improvement. After `improveMs` the best solution wins and the workers are terminated.
 */
export class WorkerCubeSolver extends CubeSolver {
  private readonly options: PoolOptions;

  constructor(options?: Partial<PoolOptions>) {
    super();
    this.options = { ...defaultOptions(), ...options };
  }

  solve(method: SolveMethod, facelets: string): Promise<Solution> {
    switch (method) {
      case 'kociemba':
        return this.solveKociemba(facelets).then(plainSolution);
      case 'cfop':
        return this.solveCfop(facelets);
      default: {
        const label = SOLVE_METHODS.find(m => m.id === method)?.label ?? method;
        return Promise.reject(new Error(`${label} is not available yet. Pick Kociemba or CFOP instead.`));
      }
    }
  }

  /** CFOP is one deterministic pass (about 10 ms), so a single worker does it and the answer is final. */
  private solveCfop(facelets: string): Promise<Solution> {
    return new Promise<Solution>((resolve, reject) => {
      const worker = this.options.createCfopWorker();
      const finish = (action: () => void): void => {
        worker.terminate();
        action();
      };
      worker.listen(
        response => finish(() => (response.type === 'solution'
          ? resolve(stagedSolution(response.stages))
          : reject(new Error(response.message)))),
        message => finish(() => reject(new Error(message))),
      );
      worker.postMessage({ facelets });
    });
  }

  private solveKociemba(facelets: string): Promise<string[]> {
    const { createWorker, size, improveMs, goodEnough } = this.options;
    return new Promise<string[]>((resolve, reject) => {
      const variants = VARIANTS.slice(0, size);
      const workers = variants.map(() => createWorker());

      let best: string[] | null = null;
      let ended = 0; // workers that finished or failed
      let lastError = '';
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (finish: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        workers.forEach(w => w.terminate());
        finish();
      };
      const resolveBest = (): void => settle(() => resolve(best!));

      const workerEnded = (error?: string): void => {
        if (error) lastError = error;
        if (++ended < workers.length) return;
        settle(() => (best ? resolve(best) : reject(new Error(lastError || 'No solution was found.'))));
      };

      workers.forEach((worker, i) => {
        worker.listen(response => {
          if (settled) return;
          if (response.type === 'solution') {
            if (!best || response.moves.length < best.length) best = response.moves;
            if (best.length <= goodEnough) resolveBest();
            else timer ??= setTimeout(resolveBest, improveMs);
          } else if (response.type === 'done') {
            workerEnded();
          } else {
            workerEnded(response.message);
          }
        }, message => workerEnded(message));
        worker.postMessage({ facelets, variant: variants[i] });
      });
    });
  }
}
