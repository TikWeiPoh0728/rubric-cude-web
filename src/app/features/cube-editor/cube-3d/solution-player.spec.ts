import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../../../core/cube/cube-moves';
import { solvedCube } from '../../../core/cube/cube-validator';
import { PlaybackState } from '../../../core/state/playback-state';
import type { SceneView } from './cube-scene';
import { MAX_CATCH_UP_SPEED, PlayerScene, SolutionPlayer } from './solution-player';
import { plainSolution } from '../../../core/solver/solution';

/** A scene that records what it is asked to do; animations finish when the test says so. */
class FakeScene implements PlayerScene {
  updates: SceneView[] = [];
  animations: { move: string; reverse: boolean; speed: number; resolve(completed: boolean): void; settled: boolean }[] = [];
  /** The real scene cancels a running turn when it is asked to draw; turn this off to test the player alone. */
  cancelOnUpdate = true;

  update(view: SceneView): void {
    this.updates.push(view);
    if (this.cancelOnUpdate) this.animations.filter(a => !a.settled).forEach(a => this.settle(a, false));
  }

  animateMove(move: string, reverse: boolean, speed = 1): Promise<boolean> {
    return new Promise(resolve => this.animations.push({ move, reverse, speed, resolve, settled: false }));
  }

  get last() { return this.animations[this.animations.length - 1]; }
  get lastDrawn() { return this.updates[this.updates.length - 1].facelets; }

  /** The running move finishes normally. */
  finish(): void { this.settle(this.last, true); }

  private settle(a: { resolve(c: boolean): void; settled: boolean }, completed: boolean): void {
    a.settled = true;
    a.resolve(completed);
  }
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve));

describe('SolutionPlayer', () => {
  let playback: PlaybackState;
  let scene: FakeScene;
  let player: SolutionPlayer;

  const origin = applyMoves(solvedCube(), parseAlgorithm('R U F'));
  const solution = ["F'", "U'", "R'"];

  /** What the real effect does: run sync() whenever the playback changes. */
  const sync = () => player.sync();

  beforeEach(() => {
    TestBed.configureTestingModule({});
    playback = TestBed.inject(PlaybackState);
    playback.load(origin, plainSolution(solution));
    scene = new FakeScene();
    player = new SolutionPlayer(scene, playback);
  });

  it('draws the starting cube without playing anything', () => {
    sync();
    expect(scene.lastDrawn).toEqual(playback.states()[0]);
    expect(scene.animations).toEqual([]);
  });

  it('never shows hover, selection or problem outlines in solve mode', () => {
    sync();
    const view = scene.updates[0];
    expect(view.hovered).toBeNull();
    expect(view.selected).toBeNull();
    expect(view.errors.size).toBe(0);
  });

  describe('one step forward', () => {
    beforeEach(() => {
      sync();
      playback.next(); // step 1, shown 0
      sync();
    });

    it('plays that move forwards, starting from the cube it is on', () => {
      expect(scene.animations.length).toBe(1);
      expect(scene.last.move).toBe("F'");
      expect(scene.last.reverse).toBe(false);
      expect(scene.lastDrawn).toEqual(playback.states()[0]);
    });

    it('stays busy until the move finishes, then reports the step as shown', async () => {
      expect(playback.busy()).toBe(true);
      scene.finish();
      await flush();
      expect(playback.shown()).toBe(1);
      expect(playback.busy()).toBe(false);
    });

    it('draws the new cube once it has reported', async () => {
      scene.finish();
      await flush();
      sync(); // the effect runs again because `shown` changed
      expect(scene.lastDrawn).toEqual(playback.states()[1]);
      expect(scene.animations.length).toBe(1); // and plays nothing more
    });
  });

  describe('one step back', () => {
    it('plays the move that led to the shown step, in reverse', async () => {
      playback.seek(2);
      sync(); // a jump to step 2
      playback.back(); // step 1
      sync();
      expect(scene.last.move).toBe("U'");
      expect(scene.last.reverse).toBe(true);
      expect(scene.lastDrawn).toEqual(playback.states()[2]);
    });
  });

  describe('a longer way', () => {
    it('jumps without playing anything, and reports straight away', () => {
      sync();
      playback.seek(3);
      sync();
      expect(scene.animations).toEqual([]);
      expect(scene.lastDrawn).toEqual(solvedCube());
      expect(playback.shown()).toBe(3);
    });
  });

  describe('when the user moves on before a move has finished', () => {
    it('cancels the move and jumps, and the cancelled move does not report', async () => {
      sync();
      playback.next();
      sync(); // playing move 1
      playback.seek(3);
      sync(); // slider dragged far away
      await flush();

      expect(scene.animations[0].settled).toBe(true); // cancelled by the redraw
      expect(playback.shown()).toBe(3);
      expect(scene.lastDrawn).toEqual(solvedCube());
    });

    it('ignores a finish from a move that has been overtaken', async () => {
      scene.cancelOnUpdate = false; // so the old move can still "finish" after the newer sync
      sync();
      playback.next();
      sync(); // playing move 1 (step 1, shown 0)
      const overtaken = scene.last;

      playback.seek(0);
      sync(); // back to where it was: nothing to play, but a newer sync has run
      overtaken.resolve(true);
      await flush();

      expect(playback.shown()).toBe(0); // the old move did not claim step 1
    });

    it('a new one-step request plays from the step the view actually shows', async () => {
      sync();
      playback.next(); // step 1
      sync();
      playback.seek(0); // slider back to the start before the move finished
      sync(); // shown is still 0 and target is 0: nothing to play
      playback.seek(1);
      sync(); // one step from shown (0) again: plays move 1 again
      expect(scene.animations.length).toBe(2);
      expect(scene.last.move).toBe("F'");
      expect(scene.last.reverse).toBe(false);
    });
  });

  it('stop() makes a move in flight stay unreported', async () => {
    sync();
    playback.next();
    sync();
    player.stop();
    scene.finish();
    await flush();
    expect(playback.shown()).toBe(0);
  });

  describe('clicks made while a move is being drawn', () => {
    /** The move finishes, the view reports it, and the effect runs sync() again. */
    const finishAndContinue = async () => {
      scene.finish();
      await flush();
      sync();
    };

    beforeEach(() => sync());

    it('queue: three quick Next clicks play three moves, one after another, in order', async () => {
      playback.next();
      playback.next();
      playback.next();
      sync();
      expect(scene.animations.map(a => a.move)).toEqual(["F'"]); // only the first starts

      await finishAndContinue();
      expect(scene.animations.map(a => a.move)).toEqual(["F'", "U'"]);
      await finishAndContinue();
      expect(scene.animations.map(a => a.move)).toEqual(["F'", "U'", "R'"]);
      await finishAndContinue();

      expect(playback.shown()).toBe(3);
      expect(scene.animations.every(a => !a.reverse)).toBe(true);
      expect(scene.lastDrawn).toEqual(playback.states()[3]);
      expect(scene.animations).toHaveLength(3); // nothing left to play
    });

    it('does not restart a move that is already playing when another click arrives', () => {
      playback.next();
      sync();
      playback.next(); // clicked while the first move is still being drawn
      sync();
      expect(scene.animations).toHaveLength(1);
      expect(scene.animations[0].settled).toBe(false); // not cancelled, not restarted
    });

    it('carries on from the move that was playing, not from the start', async () => {
      playback.next();
      sync();
      playback.next();
      sync(); // no restart
      await finishAndContinue();
      expect(scene.animations.map(a => a.move)).toEqual(["F'", "U'"]);
    });

    it('turning back cancels a move playing the other way, and walks back instead', async () => {
      playback.next();
      sync();
      await finishAndContinue(); // shown 1
      playback.next(); // heading to 2
      sync();
      expect(scene.last.move).toBe("U'");
      expect(scene.last.reverse).toBe(false);

      playback.back();
      playback.back(); // now the target is 0, behind what is shown
      sync();

      expect(scene.animations[1].settled).toBe(true); // the forward move was cancelled
      expect(scene.last.move).toBe("F'"); // the move that led to step 1, undone
      expect(scene.last.reverse).toBe(true);
    });

    it('going back to exactly where the cube is cancels the move and just shows the cube', () => {
      playback.next();
      sync();
      playback.back(); // target is shown again
      sync();
      expect(scene.animations[0].settled).toBe(true);
      expect(scene.animations).toHaveLength(1);
      expect(scene.lastDrawn).toEqual(playback.states()[0]);
    });

    it('walks back through several moves, undoing each in turn', async () => {
      playback.seek(3);
      sync(); // jump to the end
      playback.back();
      playback.back();
      sync();
      expect(scene.last).toMatchObject({ move: "R'", reverse: true });
      await finishAndContinue();
      expect(scene.last).toMatchObject({ move: "U'", reverse: true });
      await finishAndContinue();
      expect(playback.shown()).toBe(1);
      expect(scene.animations).toHaveLength(2);
    });

    it('a slider jump still jumps, and cancels the queue', () => {
      playback.next();
      sync(); // a move is playing
      playback.seek(3); // dragged to the end
      sync();
      expect(scene.animations[0].settled).toBe(true);
      expect(scene.animations).toHaveLength(1); // no new animation
      expect(playback.shown()).toBe(3);
      expect(scene.lastDrawn).toEqual(playback.states()[3]);
    });

    it('the slider moved by exactly one step still plays that one move', () => {
      playback.seek(1);
      sync();
      expect(scene.animations).toHaveLength(1);
      expect(scene.last.move).toBe("F'");
    });

    it('moves that are waiting play faster, up to a limit', async () => {
      playback.next();
      playback.next();
      playback.next();
      sync();
      expect(scene.last.speed).toBe(2); // three to go
      await finishAndContinue();
      expect(scene.last.speed).toBe(1.5); // two to go
      await finishAndContinue();
      expect(scene.last.speed).toBe(1); // the last one is at normal speed
    });

    it('never plays faster than the limit, however many are waiting', () => {
      const moves = ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'"];
      playback.load(solvedCube(), plainSolution(moves));
      sync();
      for (let i = 0; i < moves.length; i++) playback.next();
      sync();
      expect(scene.last.speed).toBe(MAX_CATCH_UP_SPEED);
    });

    it('stop() leaves the queue alone: nothing more is played or reported', async () => {
      playback.next();
      playback.next();
      sync();
      player.stop();
      scene.finish();
      await flush();
      expect(playback.shown()).toBe(0);
      expect(scene.animations).toHaveLength(1);
    });
  });
});
