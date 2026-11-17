import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CubeState } from '../../../core/state/cube-state';
import { solvedCube } from '../../../core/cube/cube-validator';
import { Net2dComponent } from './net-2d.component';

describe('Net2dComponent', () => {
  let fixture: ComponentFixture<Net2dComponent>;
  let state: CubeState;
  let root: HTMLElement;

  const cells = () => [...root.querySelectorAll<HTMLButtonElement>('.cell')];
  const cell = (i: number) => cells()[i];
  const settle = () => fixture.whenStable();
  const pointer = (i: number, type: 'pointerenter' | 'pointerleave') => cell(i).dispatchEvent(new Event(type));

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(CubeState);
    fixture = TestBed.createComponent(Net2dComponent);
    root = fixture.nativeElement;
    await settle();
  });

  it('draws all 54 stickers', () => {
    expect(cells().length).toBe(54);
  });

  it('marks the six centers, which never respond', () => {
    const centers = cells().map((c, i) => (c.classList.contains('center') ? i : -1)).filter(i => i >= 0);
    expect(centers).toEqual([4, 13, 22, 31, 40, 49]);
  });

  it('describes each sticker for screen readers by its face, row and column', () => {
    expect(cell(0).getAttribute('aria-label')).toBe('U face, row 1, column 1');
    expect(cell(53).getAttribute('aria-label')).toBe('B face, row 3, column 3');
  });

  it('lays the faces out as a cross: top in the middle of the first rows, side faces in a row below', () => {
    // [facelet index, expected grid column, expected grid row]
    const expected: [number, string, string][] = [
      [0, '4', '1'], // U, top-left
      [27, '4', '7'], // D, top-left
      [36, '1', '4'], // L, top-left
      [18, '4', '4'], // F, top-left
      [9, '7', '4'], // R, top-left
      [53, '12', '6'], // B, bottom-right
    ];
    for (const [i, column, row] of expected) {
      expect(cell(i).style.gridColumn, `column of ${i}`).toBe(column);
      expect(cell(i).style.gridRow, `row of ${i}`).toBe(row);
    }
  });

  it('paints a sticker with the picked color when it is clicked, and selects it', async () => {
    state.setActiveColor('F');
    cell(0).click();
    await settle();
    expect(state.facelets()[0]).toBe('F');
    expect(cell(0).classList).toContain('selected');
  });

  it('shows a painted sticker in its color and an empty one as grey', async () => {
    state.setActiveColor('F');
    cell(0).click();
    await settle();
    expect(cell(0).style.backgroundColor).not.toBe(cell(1).style.backgroundColor);
  });

  it('ignores clicks on a center', async () => {
    state.setActiveColor('F');
    cell(4).click();
    await settle();
    expect(state.facelets()[4]).toBe('U');
    expect(state.selected()).toBeNull();
  });

  it('highlights a sticker while the pointer is on it, and only while it is', async () => {
    pointer(7, 'pointerenter');
    await settle();
    expect(state.hovered()).toBe(7);
    expect(cell(7).classList).toContain('hover');

    pointer(7, 'pointerleave');
    await settle();
    expect(state.hovered()).toBeNull();
    expect(cell(7).classList).not.toContain('hover');
  });

  it('outlines the stickers that have a problem', async () => {
    state.setActiveColor('U');
    cell(8).click();
    cell(9).click(); // the same color twice on the URF corner
    await settle();
    for (const i of [8, 9, 20]) expect(cell(i).classList, `sticker ${i}`).toContain('error');
    expect(cell(0).classList).not.toContain('error');
  });

  it('does not respond once the cube is locked', async () => {
    state.facelets.set(solvedCube());
    state.lock();
    state.setActiveColor('F');
    cell(0).click();
    pointer(1, 'pointerenter');
    await settle();
    expect(state.facelets()).toEqual(solvedCube());
    expect(state.hovered()).toBeNull();
  });
});
