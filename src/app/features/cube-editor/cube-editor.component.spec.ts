import { describe, it, expect, beforeEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../../core/cube/cube-moves';
import { solvedCube } from '../../core/cube/cube-validator';
import { CubeSolver } from '../../core/solver/cube-solver';
import { CubeState } from '../../core/state/cube-state';
import { SessionState } from '../../core/state/session-state';
import { FakeSolver } from '../../testing/fake-solver';
import { Cube3dComponent } from './cube-3d/cube-3d.component';
import { CubeEditorComponent } from './cube-editor.component';

/** The real 3D view needs WebGL, which jsdom does not have; its logic is tested elsewhere. */
@Component({ selector: 'app-cube-3d', template: '<div class="stub-3d"></div>' })
class Stub3dComponent {}

describe('CubeEditorComponent', () => {
  let fixture: ComponentFixture<CubeEditorComponent>;
  let cube: CubeState;
  let session: SessionState;
  let solver: FakeSolver;
  let root: HTMLElement;

  const q = (selector: string) => root.querySelector<HTMLElement>(selector);
  const slotButton = () => q('.action-slot button') as HTMLButtonElement | null;
  const settle = () => fixture.whenStable();

  beforeEach(async () => {
    solver = new FakeSolver();
    TestBed.configureTestingModule({ providers: [{ provide: CubeSolver, useValue: solver }] });
    TestBed.overrideComponent(CubeEditorComponent, {
      remove: { imports: [Cube3dComponent] },
      add: { imports: [Stub3dComponent] },
    });
    cube = TestBed.inject(CubeState);
    session = TestBed.inject(SessionState);
    fixture = TestBed.createComponent(CubeEditorComponent);
    root = fixture.nativeElement;
    await settle();
  });

  it('shows the title, the 3D view, the right-hand panel and no progress panel', () => {
    expect(q('h1')!.textContent).toBe('VeryCube');
    expect(q('.stub-3d')).not.toBeNull();
    expect(q('app-information')).not.toBeNull();
    expect(q('app-progress')).toBeNull();
  });

  it('offers no Save or Edit for an unfinished cube, but keeps the slot so the layout does not jump', () => {
    expect(q('.action-slot')).not.toBeNull();
    expect(slotButton()).toBeNull();
  });

  it('offers Save as soon as the cube is complete and correct', async () => {
    cube.facelets.set(solvedCube());
    await settle();
    expect(slotButton()!.textContent!.trim()).toBe('Save');
  });

  it('does not offer Save for a complete cube that cannot exist', async () => {
    const f = solvedCube();
    [f[8], f[9], f[20]] = [f[9], f[20], f[8]]; // one twisted corner
    cube.facelets.set(f);
    await settle();
    expect(slotButton()).toBeNull();
  });

  it('Save turns into Edit in the same place, and Edit goes back', async () => {
    cube.facelets.set(solvedCube());
    await settle();
    const slot = q('.action-slot')!;

    slotButton()!.click();
    await settle();
    expect(slot.contains(slotButton())).toBe(true);
    expect(slotButton()!.textContent!.trim()).toBe('Edit');
    expect(session.phase()).toBe('saved');
    expect(q('.solution-title')).not.toBeNull();

    slotButton()!.click();
    await settle();
    expect(slotButton()!.textContent!.trim()).toBe('Save');
    expect(session.phase()).toBe('editing');
    expect(q('app-net-2d')).not.toBeNull();
  });

  describe('solving', () => {
    beforeEach(async () => {
      cube.facelets.set(applyMoves(solvedCube(), parseAlgorithm('R U')));
      await settle();
      slotButton()!.click(); // Save
      session.selectMethod('kociemba');
      await settle();
    });

    it('hides Edit and Save as soon as solving starts, and shows the dialog', async () => {
      void session.start();
      await settle();
      expect(slotButton()).toBeNull();
      expect(q('[role=alertdialog]')).not.toBeNull();
    });

    it('brings in the progress panel only once there is a solution', async () => {
      const run = session.start();
      await settle();
      expect(q('app-progress')).toBeNull();

      solver.finish(["U'", "R'"]);
      await run;
      await settle();
      expect(q('app-progress')).not.toBeNull();
      expect(q('[role=alertdialog]')).toBeNull();
      expect(slotButton()).toBeNull();
    });

    it('after a failure, Edit is back and the progress panel never appeared', async () => {
      const run = session.start();
      solver.fail('nope');
      await run;
      await settle();
      expect(q('app-progress')).toBeNull();
      expect(slotButton()!.textContent!.trim()).toBe('Edit');
      expect(q('[role=alertdialog]')!.textContent).toContain('nope');
    });
  });
});
