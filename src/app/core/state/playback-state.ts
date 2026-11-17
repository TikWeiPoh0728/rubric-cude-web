import { Injectable, computed, effect, signal } from '@angular/core';
import { applyMove, parseMove } from '../cube/cube-moves';
import { Facelets, emptyCube } from '../cube/cube-validator';
import { Solution, SolveStage, StageId, plainSolution } from '../solver/solution';

/** While playing, how long to wait after a move has finished before starting the next one. */
export const PLAY_GAP_MS = 150;

/** Where one stage sits in the flat list of moves. */
export interface StageRange {
  id: StageId;
  label: string;
  /** The stage's moves. */
  moves: string[];
  /** Index in the whole solution of the stage's first move (steps are counted from 0). */
  first: number;
  count: number;
}

/**
 * Stepping through a solution. Holds the saved cube and its moves, and two
 * positions in them:
 *  - `step`: where the user wants to be (Next, Back, the slider write here);
 *  - `shown`: what the 3D view has actually drawn so far.
 * Drawing a move takes time, so the two differ while it runs. The view reports
 * back with markShown() once it has drawn a step. Back and Next do not wait for that:
 * they only move `step`, and the view catches up one move at a time (`walking`), so
 * a quick second click is queued, never lost, and the buttons never flicker.
 * Stages (Cross, F2L, ...) are only a grouping of the same flat list of moves:
 * stepping, animation and the slider never need to know about them.
 *
 * Playing is the same stepping done by a timer, like a video: while `playing`, each
 * time the view has caught up with `step`, the next move is requested after a short pause.
 * The 3D view animates it and reports back, which is what moves playback on. Anything the
 * user does by hand (Back, Next, the slider) pauses it, and Back / Next then take one step.
 * Must not import Three.js.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackState {
  /** The solution in standard notation, e.g. ["R", "U'", "F2"]. */
  readonly moves = signal<string[]>([]);

  /** How the moves split into stages, or null for a method without stages. */
  private readonly stagesSignal = signal<SolveStage[] | null>(null);

  /** Number of moves applied in the position the user asked for: 0 (the saved cube) up to `total` (solved). */
  readonly step = signal(0);

  /** The step the 3D view has finished drawing. */
  readonly shown = signal(0);

  /** The solution is playing by itself. */
  readonly playing = signal(false);

  /**
   * How `step` last changed. True for Back, Next and playing: the view must walk there one
   * move at a time, animating each, so clicks made while a move is being drawn queue up.
   * False for the slider, a restart, and loading: the view may jump straight to the step.
   */
  readonly walking = signal(false);

  private readonly origin = signal<Facelets>(emptyCube());

  readonly total = computed(() => this.moves().length);

  /** Every stage with the position of its moves in the whole solution; null without stages. */
  readonly stageRanges = computed<StageRange[] | null>(() => {
    const stages = this.stagesSignal();
    if (!stages) return null;
    let first = 0;
    return stages.map(s => {
      const range = { id: s.id, label: s.label, moves: s.moves, first, count: s.moves.length };
      first += s.moves.length;
      return range;
    });
  });

  /** The stage the last move played belongs to; null at the start, or without stages. */
  readonly currentStage = computed<StageRange | null>(() => {
    const ranges = this.stageRanges();
    const played = this.step() - 1; // index of the move just played
    if (!ranges || played < 0) return null;
    return ranges.find(r => played >= r.first && played < r.first + r.count) ?? null;
  });

  /** The cube after 0, 1, ..., total moves. */
  readonly states = computed<Facelets[]>(() => {
    const out: Facelets[] = [this.origin()];
    for (const move of this.moves()) out.push(applyMove(out[out.length - 1], parseMove(move)));
    return out;
  });

  /** The cube at the requested step. */
  readonly facelets = computed(() => this.states()[this.step()]);

  /** The view has not caught up with `step` yet (a move is being drawn). Playing waits for this to clear. */
  readonly busy = computed(() => this.step() !== this.shown());

  /**
   * Back and Next depend on where we are in the solution, never on the animation: they are
   * off only at the first and last step, so they do not flicker while moves are drawn.
   */
  readonly canBack = computed(() => this.step() > 0);
  readonly canNext = computed(() => this.step() < this.total());

  constructor() {
    // The player: runs again whenever playing, the step, or what is shown changes.
    effect(onCleanup => {
      if (!this.playing()) return;
      if (this.busy()) return; // a move is still being drawn: its report will bring us back here
      if (this.step() >= this.total()) {
        this.playing.set(false); // reached the end
        return;
      }
      const timer = setTimeout(() => {
        this.walking.set(true);
        this.step.update(s => s + 1);
      }, PLAY_GAP_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** Start stepping through `solution`, which solves `origin`, from the beginning. */
  load(origin: Facelets, solution: Solution): void {
    this.origin.set(origin);
    this.moves.set(solution.moves);
    // Stages are only a grouping: ignore them if they do not add up to exactly the moves.
    const joined = solution.stages?.flatMap(s => s.moves) ?? [];
    const consistent = solution.stages !== null && joined.length === solution.moves.length
      && joined.every((m, i) => m === solution.moves[i]);
    this.stagesSignal.set(consistent ? solution.stages : null);
    this.step.set(0);
    this.shown.set(0);
    this.playing.set(false);
    this.walking.set(false);
  }

  /** Forget the solution. */
  clear(): void {
    this.load(emptyCube(), plainSolution([]));
  }

  /** Start playing from where we are, or from the beginning if the solution was at its end. */
  play(): void {
    if (this.total() === 0) return;
    if (this.step() >= this.total()) {
      this.walking.set(false); // a restart is a jump back to the start, not a walk
      this.step.set(0);
    }
    this.playing.set(true);
  }

  /** Stop playing and stay at the current step. */
  stop(): void {
    this.playing.set(false);
  }

  toggle(): void {
    if (this.playing()) this.stop();
    else this.play();
  }

  /** One step forward (pausing playback). Allowed while a move is being drawn: it queues. */
  next(): void {
    this.stop();
    if (!this.canNext()) return;
    this.walking.set(true);
    this.step.update(s => s + 1);
  }

  /** One step back (pausing playback). Allowed while a move is being drawn: it queues. */
  back(): void {
    this.stop();
    if (!this.canBack()) return;
    this.walking.set(true);
    this.step.update(s => s - 1);
  }

  /** Jump to a step (clamped), e.g. from the slider. The view may jump there without playing the moves between. */
  seek(step: number): void {
    this.stop();
    this.walking.set(false);
    this.step.set(Math.min(Math.max(Math.round(step), 0), this.total()));
  }

  /** Called by the view when it has finished drawing `step`. */
  markShown(step: number): void {
    this.shown.set(step);
  }
}
