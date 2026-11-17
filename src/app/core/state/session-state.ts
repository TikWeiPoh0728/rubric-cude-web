import { Injectable, computed, inject, signal } from '@angular/core';
import { CubeSolver } from '../solver/cube-solver';
import { SolveMethod } from '../solver/solve-method';
import { CubeState } from './cube-state';
import { PlaybackState } from './playback-state';

/**
 * Where the user is in the app. Exactly one phase at a time, with these moves between them:
 *
 *   editing --save--> saved --start--> solving --> solved
 *      ^                |                  |          |
 *      +----- edit -----+                  |          |
 *      +-------------- finish -------------+----------+   (finish is only offered once solved)
 *                                          |
 *                                          +--(failed)--> saved, with an error to show
 *
 * - editing: painting the cube
 * - saved:   the cube is locked; pick a solving method and press Start
 * - solving: waiting for the solver
 * - solved:  stepping through the solution; Finish goes back to editing
 *
 * Every rule about what is allowed when lives here; components only read the phase
 * and call these methods.
 */
export type Phase = 'editing' | 'saved' | 'solving' | 'solved';

@Injectable({ providedIn: 'root' })
export class SessionState {
  private readonly cube = inject(CubeState);
  private readonly playback = inject(PlaybackState);
  private readonly solver = inject(CubeSolver);

  readonly phase = signal<Phase>('editing');

  /** The solving method picked in the saved phase. */
  readonly method = signal<SolveMethod | null>(null);

  /** Why the last attempt to solve failed, until the user dismisses it. */
  readonly error = signal<string | null>(null);

  readonly isEditing = computed(() => this.phase() === 'editing');
  readonly isSaved = computed(() => this.phase() === 'saved');
  readonly isSolving = computed(() => this.phase() === 'solving');
  readonly isSolved = computed(() => this.phase() === 'solved');

  /** Solving has begun, so the method can no longer be changed and there is no Edit or Start. */
  readonly hasStarted = computed(() => this.isSolving() || this.isSolved());

  readonly canSave = computed(() => this.isEditing() && this.cube.isValid());
  readonly canEdit = computed(() => this.isSaved());
  readonly canStart = computed(() => this.isSaved() && this.method() !== null);

  /** Lock a complete, valid cube so a method can be chosen. */
  save(): void {
    if (!this.canSave()) return;
    this.cube.lock();
    this.phase.set('saved');
  }

  /** Unlock the cube for editing again. The method belonged to the saved cube, so it is cleared. */
  edit(): void {
    if (!this.canEdit()) return;
    this.cube.unlock();
    this.method.set(null);
    this.phase.set('editing');
  }

  selectMethod(method: SolveMethod): void {
    if (this.isSaved()) this.method.set(method);
  }

  /** Solve the saved cube with the chosen method. */
  async start(): Promise<void> {
    if (!this.canStart()) return;
    const method = this.method()!;
    const origin = this.cube.facelets();
    this.error.set(null);
    this.phase.set('solving');
    try {
      const solution = await this.solver.solve(method, origin.join(''));
      this.playback.load(origin, solution);
      this.phase.set('solved');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.phase.set('saved');
    }
  }

  /**
   * Done with the solution: go back to editing. The cube is unlocked with the colors the user
   * entered (so it can be changed, reset or solved again), and the solution and the chosen
   * method, which belonged to that run, are dropped.
   */
  finish(): void {
    if (!this.isSolved()) return;
    this.playback.clear();
    this.cube.unlock();
    this.method.set(null);
    this.error.set(null);
    this.phase.set('editing');
  }

  /** Close the error message. The saved cube and the chosen method are still there. */
  dismissError(): void {
    this.error.set(null);
  }
}
