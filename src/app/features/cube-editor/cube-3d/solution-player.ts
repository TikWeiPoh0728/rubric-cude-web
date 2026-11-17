import { PlaybackState } from '../../../core/state/playback-state';
import type { SceneView } from './cube-scene';

/** The part of CubeScene the player needs; lets tests use a fake without WebGL. */
export interface PlayerScene {
  update(view: SceneView): void;
  /**
   * Resolves true when the move finished, false if it was cancelled first.
   * `speed` above 1 plays it faster (used when more moves are waiting).
   */
  animateMove(move: string, reverse: boolean, speed?: number): Promise<boolean>;
}

const NO_ERRORS: ReadonlySet<number> = new Set();

/** The fastest a queued move is played, as a multiple of normal speed. */
export const MAX_CATCH_UP_SPEED = 3;

/**
 * Makes the 3D scene follow PlaybackState.
 *
 * - When the step was reached by Back, Next or playing (`walking`), or is exactly one step
 *   away, the scene plays the moves between what is shown and the target one at a time
 *   (backwards when going back). Each finished move is reported with markShown(), which
 *   starts the next one, so clicks made while a move is being drawn queue up in order.
 * - Any other distance (the slider) is a jump.
 *
 * A move that is already playing in the right direction is left alone when the target moves
 * on; restarting it would make the animation stutter. Moves that are waiting play faster.
 * Contains no Three.js, so it is tested with a fake scene.
 */
export class SolutionPlayer {
  /** Identifies the latest decision, so a move that has been overtaken does not report. */
  private token = 0;

  /** The move being drawn right now: the step it starts from, and which way it goes. */
  private flight: { from: number; direction: 1 | -1 } | null = null;

  constructor(
    private readonly scene: PlayerScene,
    private readonly playback: PlaybackState,
  ) {}

  /**
   * Bring the scene up to date. Reads the playback signals, so calling it from an
   * effect runs it again whenever the requested step or the shown step changes.
   */
  sync(): void {
    const target = this.playback.step();
    const shown = this.playback.shown();
    const walking = this.playback.walking();
    const states = this.playback.states();
    const moves = this.playback.moves();
    const view = (step: number): SceneView => ({
      facelets: states[step], errors: NO_ERRORS, hovered: null, selected: null,
    });
    const distance = target - shown;

    // Nothing to play. Either the scene is up to date (a repaint that changes nothing), or the
    // target is far away and was not reached by walking: draw it straight away.
    if (distance === 0 || (!walking && Math.abs(distance) !== 1)) {
      this.token++;
      this.flight = null;
      this.scene.update(view(target)); // also cancels a move that was still playing
      if (distance !== 0) this.playback.markShown(target);
      return;
    }

    const direction = distance > 0 ? 1 : -1;
    // The move towards the target is already playing: let it finish.
    if (this.flight && this.flight.from === shown && this.flight.direction === direction) return;

    const token = ++this.token;
    this.scene.update(view(shown)); // also cancels a move that was playing the other way
    this.flight = { from: shown, direction };
    const speed = Math.min(MAX_CATCH_UP_SPEED, 1 + (Math.abs(distance) - 1) / 2);
    const move = moves[direction > 0 ? shown : shown - 1];
    this.scene.animateMove(move, direction < 0, speed).then(completed => {
      if (token !== this.token) return;
      this.flight = null;
      if (completed) this.playback.markShown(shown + direction);
    });
  }

  /** Forget any move in flight, for when solve mode ends. */
  stop(): void {
    this.token++;
    this.flight = null;
  }
}
