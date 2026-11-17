import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../../../core/cube/cube-moves';
import { solvedCube } from '../../../core/cube/cube-validator';
import { CubeSolver } from '../../../core/solver/cube-solver';
import { CubeState } from '../../../core/state/cube-state';
import { SessionState } from '../../../core/state/session-state';
import { FakeSolver } from '../../../testing/fake-solver';
import { SolveDialogComponent } from './solve-dialog.component';

describe('SolveDialogComponent', () => {
  let fixture: ComponentFixture<SolveDialogComponent>;
  let cube: CubeState;
  let session: SessionState;
  let solver: FakeSolver;
  let root: HTMLElement;

  const dialog = () => root.querySelector<HTMLElement>('[role=alertdialog]');
  const text = () => dialog()?.textContent!.replace(/\s+/g, ' ').trim();
  const settle = () => fixture.whenStable();

  beforeEach(async () => {
    solver = new FakeSolver();
    TestBed.configureTestingModule({ providers: [{ provide: CubeSolver, useValue: solver }] });
    cube = TestBed.inject(CubeState);
    session = TestBed.inject(SessionState);
    fixture = TestBed.createComponent(SolveDialogComponent);
    root = fixture.nativeElement;

    cube.facelets.set(applyMoves(solvedCube(), parseAlgorithm('R U')));
    session.save();
    await settle();
  });

  it('is not shown while nothing is being solved', () => {
    expect(dialog()).toBeNull();
  });

  it('is not shown for a saved cube with a method picked, until Start', async () => {
    session.selectMethod('kociemba');
    await settle();
    expect(dialog()).toBeNull();
  });

  it('shows "Generating solution" with the chosen method while the solver works', async () => {
    session.selectMethod('kociemba');
    void session.start();
    await settle();
    expect(dialog()).not.toBeNull();
    expect(text()).toContain('Generating solution');
    expect(text()).toContain('Kociemba');
    expect(dialog()!.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.spinner')).not.toBeNull();
  });

  it('describes CFOP by its stages instead of a search', async () => {
    session.selectMethod('cfop');
    void session.start();
    await settle();
    expect(text()).toContain('Generating solution');
    expect(text()).toContain('Cross, F2L, OLL and PLL');
    expect(text()).not.toContain('looking for a short solution');
  });

  it('goes away when a solution arrives', async () => {
    session.selectMethod('kociemba');
    const run = session.start();
    await settle();
    solver.finish(["U'", "R'"]);
    await run;
    await settle();
    expect(dialog()).toBeNull();
  });

  describe('when the solver fails', () => {
    beforeEach(async () => {
      session.selectMethod('cfop');
      const run = session.start();
      solver.fail('CFOP is not available yet. Pick Kociemba instead.');
      await run;
      await settle();
    });

    it('explains why instead of the spinner', () => {
      expect(text()).toContain("Couldn't generate a solution");
      expect(text()).toContain('CFOP is not available yet. Pick Kociemba instead.');
      expect(root.querySelector('.spinner')).toBeNull();
    });

    it('closes when asked, leaving the saved cube and the chosen method as they were', async () => {
      root.querySelector<HTMLButtonElement>('.close button')!.click();
      await settle();
      expect(dialog()).toBeNull();
      expect(session.phase()).toBe('saved');
      expect(session.method()).toBe('cfop');
    });
  });
});
