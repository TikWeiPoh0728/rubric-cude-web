import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../cube/cube-moves';
import { solvedCube } from '../cube/cube-validator';
import { CubeSolver } from '../solver/cube-solver';
import { FakeSolver } from '../../testing/fake-solver';
import { CubeState } from './cube-state';
import { PlaybackState } from './playback-state';
import { SessionState } from './session-state';

describe('SessionState', () => {
  let cube: CubeState;
  let playback: PlaybackState;
  let session: SessionState;
  let solver: FakeSolver;
  /** Scramble R U, so the solution is U' R'. */
  const scrambled = applyMoves(solvedCube(), parseAlgorithm('R U'));

  beforeEach(() => {
    solver = new FakeSolver();
    TestBed.configureTestingModule({ providers: [{ provide: CubeSolver, useValue: solver }] });
    cube = TestBed.inject(CubeState);
    playback = TestBed.inject(PlaybackState);
    session = TestBed.inject(SessionState);
  });

  /** Walk to the saved phase with the scrambled cube. */
  const saveScrambled = () => {
    cube.facelets.set(scrambled);
    session.save();
  };

  it('starts in the editing phase', () => {
    expect(session.phase()).toBe('editing');
    expect(session.isEditing()).toBe(true);
    expect(session.canSave()).toBe(false);
    expect(session.canEdit()).toBe(false);
    expect(session.canStart()).toBe(false);
    expect(session.hasStarted()).toBe(false);
  });

  describe('editing -> saved', () => {
    it('cannot save an incomplete cube', () => {
      session.save();
      expect(session.phase()).toBe('editing');
      expect(cube.locked()).toBe(false);
    });

    it('cannot save a complete cube that fails the parity rules', () => {
      const f = solvedCube();
      [f[8], f[9], f[20]] = [f[9], f[20], f[8]];
      cube.facelets.set(f);
      expect(session.canSave()).toBe(false);
      session.save();
      expect(session.phase()).toBe('editing');
    });

    it('saves a complete, valid cube and locks it', () => {
      cube.facelets.set(solvedCube());
      expect(session.canSave()).toBe(true);
      session.save();
      expect(session.phase()).toBe('saved');
      expect(cube.locked()).toBe(true);
      expect(session.canSave()).toBe(false);
      expect(session.canEdit()).toBe(true);
    });
  });

  describe('saved -> editing', () => {
    it('edit unlocks the cube and clears the chosen method', () => {
      saveScrambled();
      session.selectMethod('cfop');
      session.edit();
      expect(session.phase()).toBe('editing');
      expect(cube.locked()).toBe(false);
      expect(session.method()).toBeNull();
    });

    it('the old choice does not come back after saving again', () => {
      saveScrambled();
      session.selectMethod('cfop');
      session.edit();
      session.save();
      expect(session.canStart()).toBe(false);
    });

    it('cannot edit while editing', () => {
      session.edit();
      expect(session.phase()).toBe('editing');
    });
  });

  describe('choosing a method', () => {
    it('only works on a saved cube', () => {
      session.selectMethod('cfop');
      expect(session.method()).toBeNull();
    });

    it('Start needs a saved cube and a method, and the last choice wins', () => {
      saveScrambled();
      expect(session.canStart()).toBe(false);
      session.selectMethod('kociemba');
      expect(session.canStart()).toBe(true);
      session.selectMethod('lbl');
      expect(session.method()).toBe('lbl');
    });
  });

  describe('saved -> solving -> solved', () => {
    beforeEach(() => {
      saveScrambled();
      session.selectMethod('kociemba');
    });

    it('does nothing without a method', async () => {
      session.edit();
      saveScrambled();
      await session.start();
      expect(solver.calls).toEqual([]);
      expect(session.phase()).toBe('saved');
    });

    it('is solving while the solver runs, and sends the saved cube and method', async () => {
      const run = session.start();
      expect(session.phase()).toBe('solving');
      expect(session.hasStarted()).toBe(true);
      expect(session.canEdit()).toBe(false);
      expect(session.canStart()).toBe(false);
      expect(solver.calls).toEqual([{ method: 'kociemba', facelets: scrambled.join('') }]);

      solver.finish(["U'", "R'"]);
      await run;
      expect(session.phase()).toBe('solved');
    });

    it('hands the solution to the playback, from step 0', async () => {
      const run = session.start();
      solver.finish(["U'", "R'"]);
      await run;
      expect(playback.moves()).toEqual(["U'", "R'"]);
      expect(playback.step()).toBe(0);
      expect(playback.facelets()).toEqual(scrambled);
    });

    it('ignores a second start while solving', async () => {
      const run = session.start();
      void session.start();
      expect(solver.calls.length).toBe(1);
      solver.finish([]);
      await run;
    });

    it('cannot select another method, save or edit once started', async () => {
      const run = session.start();
      session.selectMethod('lbl');
      session.edit();
      session.save();
      expect(session.method()).toBe('kociemba');
      expect(session.phase()).toBe('solving');
      solver.finish([]);
      await run;
      session.edit();
      expect(session.phase()).toBe('solved');
    });

    it('an already solved cube is solved with no moves', async () => {
      session.edit();
      cube.facelets.set(solvedCube());
      session.save();
      session.selectMethod('kociemba');
      const run = session.start();
      solver.finish([]);
      await run;
      expect(session.phase()).toBe('solved');
      expect(playback.total()).toBe(0);
    });
  });

  describe('a failed solve', () => {
    it('goes back to saved with the error, keeping the method, until dismissed', async () => {
      saveScrambled();
      session.selectMethod('cfop');
      const run = session.start();
      solver.fail('CFOP is not available yet.');
      await run;

      expect(session.phase()).toBe('saved');
      expect(session.error()).toBe('CFOP is not available yet.');
      expect(session.hasStarted()).toBe(false); // Edit and Start are back
      expect(session.method()).toBe('cfop');
      expect(session.canStart()).toBe(true);

      session.dismissError();
      expect(session.error()).toBeNull();
    });

    it('starting again clears the previous error', async () => {
      saveScrambled();
      session.selectMethod('cfop');
      let run = session.start();
      solver.fail('nope');
      await run;
      expect(session.error()).toBe('nope');

      run = session.start();
      expect(session.error()).toBeNull();
      solver.finish([]);
      await run;
    });
  });
});
