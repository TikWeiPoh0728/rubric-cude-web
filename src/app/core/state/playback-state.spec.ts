import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../cube/cube-moves';
import { solvedCube } from '../cube/cube-validator';
import { PLAY_GAP_MS, PlaybackState } from './playback-state';
import { plainSolution, stagedSolution } from '../solver/solution';

describe('PlaybackState', () => {
  let p: PlaybackState;
  /** Scramble R U, so the solution is U' R'. */
  const scrambled = applyMoves(solvedCube(), parseAlgorithm('R U'));

  beforeEach(() => {
    TestBed.configureTestingModule({});
    p = TestBed.inject(PlaybackState);
    p.load(scrambled, plainSolution(["U'", "R'"]));
  });

  it('starts at step 0 with the saved cube and a total', () => {
    expect(p.total()).toBe(2);
    expect(p.step()).toBe(0);
    expect(p.shown()).toBe(0);
    expect(p.facelets()).toEqual(scrambled);
    expect(p.states().length).toBe(3);
  });

  it('reaches the solved cube at the last step', () => {
    p.seek(2);
    expect(p.facelets()).toEqual(solvedCube());
  });

  it('next and back move one step and stop at the ends', () => {
    expect(p.canBack()).toBe(false);
    p.back();
    expect(p.step()).toBe(0);

    p.next();
    p.markShown(1);
    p.next();
    p.markShown(2);
    expect(p.step()).toBe(2);
    expect(p.canNext()).toBe(false);
    p.next();
    expect(p.step()).toBe(2);

    p.back();
    expect(p.step()).toBe(1);
  });

  it('seek clamps and rounds', () => {
    p.seek(99);
    expect(p.step()).toBe(2);
    p.seek(-5);
    expect(p.step()).toBe(0);
    p.seek(1.4);
    expect(p.step()).toBe(1);
  });

  describe('while the view is still drawing a move', () => {
    it('is busy from the moment a step is requested until the view reports it', () => {
      expect(p.busy()).toBe(false);
      p.next();
      expect(p.step()).toBe(1);
      expect(p.busy()).toBe(true);
      p.markShown(1);
      expect(p.busy()).toBe(false);
    });

    it('Back and Next keep working while a move is being drawn: a click just moves the step, and is not lost', () => {
      p.next(); // step 1, the view is still drawing it
      p.next();
      expect(p.step()).toBe(2); // queued, not ignored
      p.back();
      expect(p.step()).toBe(1);
    });

    it('Back and Next depend only on where we are, so they do not change while a move is drawn', () => {
      expect([p.canBack(), p.canNext()]).toEqual([false, true]); // at the start
      p.next();
      expect(p.busy()).toBe(true);
      expect([p.canBack(), p.canNext()]).toEqual([true, true]); // the same while the move is drawn
      p.markShown(1);
      expect([p.canBack(), p.canNext()]).toEqual([true, true]); // and after it
      p.next();
      p.markShown(2);
      expect([p.canBack(), p.canNext()]).toEqual([true, false]); // off only at the end
    });

    it('Next does nothing at the end, and Back at the start, even while a move is being drawn', () => {
      p.back();
      expect(p.step()).toBe(0);
      p.seek(2);
      p.next();
      expect(p.step()).toBe(2);
    });
  });

  describe('walking (how the step was reached)', () => {
    it('is false to begin with, and after loading', () => {
      expect(p.walking()).toBe(false);
      p.next();
      p.load(scrambled, plainSolution(["U'", "R'"]));
      expect(p.walking()).toBe(false);
    });

    it('is true after Next or Back: the view must walk there, move by move', () => {
      p.next();
      expect(p.walking()).toBe(true);
      p.seek(0);
      p.next();
      p.back();
      expect(p.walking()).toBe(true);
    });

    it('is false after the slider: the view may jump', () => {
      p.next();
      p.seek(2);
      expect(p.walking()).toBe(false);
    });

    it('is false after clearing, which is what Finish does', () => {
      p.next();
      p.clear();
      expect(p.walking()).toBe(false);
    });

    it('does not change when Next or Back are refused at the ends', () => {
      p.back();
      expect(p.walking()).toBe(false);
    });

    it('a restart from the end is a jump, not a walk back through every move', () => {
      p.seek(2);
      p.markShown(2);
      p.next(); // refused: at the end
      p.play();
      expect(p.step()).toBe(0);
      expect(p.walking()).toBe(false);
    });
  });

  it('handles an already solved cube: no moves, nothing to step through', () => {
    p.load(solvedCube(), plainSolution([]));
    expect(p.total()).toBe(0);
    expect(p.canNext()).toBe(false);
    expect(p.canBack()).toBe(false);
    expect(p.facelets()).toEqual(solvedCube());
  });

  it('loading a new solution starts again from step 0', () => {
    p.seek(2);
    p.markShown(2);
    p.load(scrambled, plainSolution(["U'", "R'"]));
    expect(p.step()).toBe(0);
    expect(p.shown()).toBe(0);
  });

  it('clear forgets the solution', () => {
    p.clear();
    expect(p.total()).toBe(0);
    expect(p.step()).toBe(0);
  });

  describe('stages', () => {
    const staged = stagedSolution([
      { id: 'cross', moves: ["U'", "R'"] },
      { id: 'f2l', moves: [] }, // not needed
      { id: 'oll', moves: [] },
      { id: 'pll', moves: [] },
    ]);

    it('a plain solution has no stages', () => {
      expect(p.stageRanges()).toBeNull();
      expect(p.currentStage()).toBeNull();
    });

    it('lists every stage with where its moves start, a skipped stage included', () => {
      p.load(scrambled, stagedSolution([
        { id: 'cross', moves: ["U'"] },
        { id: 'f2l', moves: [] },
        { id: 'oll', moves: ["R'"] },
        { id: 'pll', moves: [] },
      ]));
      expect(p.stageRanges()!.map(r => [r.id, r.label, r.first, r.count])).toEqual([
        ['cross', 'Cross', 0, 1],
        ['f2l', 'F2L', 1, 0],
        ['oll', 'OLL', 1, 1],
        ['pll', 'PLL', 2, 0],
      ]);
    });

    it('keeps the flat list of moves, so stepping and animation do not care about stages', () => {
      p.load(scrambled, staged);
      expect(p.moves()).toEqual(["U'", "R'"]);
      expect(p.total()).toBe(2);
      expect(p.facelets()).toEqual(scrambled);
      p.seek(2);
      expect(p.facelets()).toEqual(solvedCube());
    });

    it('the current stage is the one the last move played belongs to', () => {
      p.load(scrambled, stagedSolution([
        { id: 'cross', moves: ["U'"] },
        { id: 'f2l', moves: [] },
        { id: 'oll', moves: ["R'"] },
        { id: 'pll', moves: [] },
      ]));
      expect(p.currentStage()).toBeNull(); // nothing played yet
      p.seek(1);
      expect(p.currentStage()!.id).toBe('cross');
      p.seek(2);
      expect(p.currentStage()!.id).toBe('oll'); // F2L was skipped, so step 2 is already OLL
    });

    it('ignores stages that do not add up to the moves, rather than showing a wrong grouping', () => {
      p.load(scrambled, { moves: ["U'", "R'"], stages: [{ id: 'cross', label: 'Cross', moves: ["U'"] }] });
      expect(p.stageRanges()).toBeNull();
      expect(p.moves()).toEqual(["U'", "R'"]);
    });

    it('loading a plain solution afterwards drops the stages', () => {
      p.load(scrambled, staged);
      p.load(scrambled, plainSolution(["U'", "R'"]));
      expect(p.stageRanges()).toBeNull();
    });
  });

  describe('playing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** Let the effects run, as the app does after every change. */
    const tick = () => TestBed.tick();

    /** One round: the pause passes and the step advances; then the view finishes drawing it. */
    const playOneMove = () => {
      vi.advanceTimersByTime(PLAY_GAP_MS);
      tick();
      p.markShown(p.step());
      tick();
    };

    it('starts out not playing', () => {
      expect(p.playing()).toBe(false);
    });

    it('play() starts playing and the first move follows after the short pause', () => {
      p.play();
      tick();
      expect(p.playing()).toBe(true);
      expect(p.step()).toBe(0);

      vi.advanceTimersByTime(PLAY_GAP_MS - 1);
      expect(p.step()).toBe(0); // not yet
      vi.advanceTimersByTime(1);
      expect(p.step()).toBe(1);
    });

    it('waits while a move is still being drawn, and carries on once the view reports it', () => {
      p.play();
      tick();
      vi.advanceTimersByTime(PLAY_GAP_MS);
      tick();
      expect(p.step()).toBe(1);
      expect(p.busy()).toBe(true);

      vi.advanceTimersByTime(10_000); // however long the animation takes, nothing else starts
      tick();
      expect(p.step()).toBe(1);

      p.markShown(1); // the view finished the move
      tick();
      vi.advanceTimersByTime(PLAY_GAP_MS);
      expect(p.step()).toBe(2);
    });

    it('plays through every move and stops by itself at the end', () => {
      p.play();
      tick();
      playOneMove();
      playOneMove();
      expect(p.step()).toBe(2);
      expect(p.facelets()).toEqual(solvedCube());
      expect(p.playing()).toBe(false);
    });

    it('every move it plays is a walk, so the view animates it instead of jumping', () => {
      p.play();
      tick();
      playOneMove();
      expect(p.walking()).toBe(true);
    });

    it('Stop pauses in place, and Play carries on from there', () => {
      p.play();
      tick();
      playOneMove();
      expect(p.step()).toBe(1);

      p.stop();
      tick();
      expect(p.playing()).toBe(false);
      vi.advanceTimersByTime(10_000);
      tick();
      expect(p.step()).toBe(1); // stayed put

      p.play();
      tick();
      playOneMove();
      expect(p.step()).toBe(2);
    });

    it('Stop right after a move was scheduled cancels it', () => {
      p.play();
      tick();
      p.stop();
      tick();
      vi.advanceTimersByTime(10_000);
      expect(p.step()).toBe(0);
    });

    it('Play at the end of the solution starts again from the beginning', () => {
      p.seek(2);
      p.markShown(2);
      p.play();
      expect(p.step()).toBe(0);
      expect(p.playing()).toBe(true);
    });

    it('toggle switches between playing and stopped', () => {
      p.toggle();
      expect(p.playing()).toBe(true);
      p.toggle();
      expect(p.playing()).toBe(false);
    });

    it('does nothing when there are no moves to play', () => {
      p.load(solvedCube(), plainSolution([]));
      p.play();
      expect(p.playing()).toBe(false);
      p.toggle();
      expect(p.playing()).toBe(false);
    });

    describe('anything done by hand stops it', () => {
      beforeEach(() => {
        p.play();
        tick();
      });

      it('Next', () => {
        p.next();
        expect(p.playing()).toBe(false);
      });

      it('Back', () => {
        p.back();
        expect(p.playing()).toBe(false);
      });

      it('the slider', () => {
        p.seek(1);
        expect(p.playing()).toBe(false);
      });

      it('loading another solution', () => {
        p.load(scrambled, plainSolution(["U'", "R'"]));
        expect(p.playing()).toBe(false);
      });

      it('clearing, which is what Finish does', () => {
        p.clear();
        expect(p.playing()).toBe(false);
      });

      it('and the timer that was waiting does not move the cube afterwards', () => {
        p.seek(0);
        vi.advanceTimersByTime(10_000);
        expect(p.step()).toBe(0);
      });
    });
  });
});
