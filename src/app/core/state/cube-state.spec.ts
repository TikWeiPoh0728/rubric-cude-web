import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CubeState } from './cube-state';
import { emptyCube, solvedCube } from '../cube/cube-validator';

describe('CubeState', () => {
  let s: CubeState;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    s = TestBed.inject(CubeState);
  });

  it('starts with centers only and no errors', () => {
    expect(s.facelets()).toEqual(emptyCube());
    expect(s.errors()).toEqual([]);
    expect(s.facelets().filter(c => c !== null).length).toBe(6);
  });

  it('paints the clicked sticker with the active color', () => {
    s.setActiveColor('R');
    s.clickSticker(0);
    expect(s.facelets()[0]).toBe('R');
    expect(s.selected()).toBe(0);
  });

  it('does nothing when a center is clicked', () => {
    s.setActiveColor('R');
    s.clickSticker(4);
    expect(s.facelets()).toEqual(emptyCube());
    expect(s.selected()).toBeNull();
  });

  it('selects without painting when no color is active', () => {
    s.clickSticker(7);
    expect(s.facelets()[7]).toBeNull();
    expect(s.selected()).toBe(7);
  });

  it('clears a sticker that is clicked again with the same color', () => {
    s.setActiveColor('F');
    s.clickSticker(7);
    s.clickSticker(7);
    expect(s.facelets()[7]).toBeNull();
  });

  it('does not mutate the previous array (new reference per change)', () => {
    const before = s.facelets();
    s.setActiveColor('F');
    s.clickSticker(0);
    expect(before[0]).toBeNull();
    expect(s.facelets()).not.toBe(before);
  });

  it('reports errors and their stickers, then clears them when fixed', () => {
    // Two U-colored stickers on the URF corner (8 and 9 are on the same corner).
    s.setActiveColor('U');
    s.clickSticker(8);
    s.clickSticker(9);
    expect(s.errors().some(e => e.code === 'SAME_COLOR')).toBe(true);
    expect(s.errorStickers().has(8)).toBe(true);
    expect(s.errorStickers().has(9)).toBe(true);
    expect(s.errorStickers().has(20)).toBe(true);

    s.clickSticker(9); // same color again → clear
    expect(s.errors()).toEqual([]);
    expect(s.errorStickers().size).toBe(0);
  });

  it('allowed colors follow the hovered sticker', () => {
    expect(s.allowed()).toBeNull();
    s.setActiveColor('U');
    s.clickSticker(8); // paint URF's U sticker white

    s.setHovered(9); // R sticker on the same corner: white and yellow are not possible there
    const allowedOnHover = s.allowed()!;
    expect(allowedOnHover).not.toContain('U');
    expect(allowedOnHover).not.toContain('D');

    s.setHovered(null);
    expect(s.allowed()).toBeNull();
  });

  it('a painted sticker does not keep greying the palette once the cursor leaves', () => {
    s.setActiveColor('U');
    s.clickSticker(8);
    expect(s.selected()).toBe(8);
    expect(s.focusSticker()).toBeNull();
    expect(s.allowed()).toBeNull();
  });

  it('a selected sticker that is still empty drives the palette hint', () => {
    s.clickSticker(9); // no active color: selects only
    expect(s.focusSticker()).toBe(9);
    expect(s.allowed()).not.toBeNull();

    s.setActiveColor('U');
    s.clickSticker(9); // now painted
    expect(s.focusSticker()).toBeNull();
  });

  it('ignores hover on centers', () => {
    s.setHovered(4);
    expect(s.hovered()).toBeNull();
    s.setHovered(5);
    expect(s.hovered()).toBe(5);
  });

  describe('validity', () => {
    it('an incomplete cube is not valid', () => {
      expect(s.isComplete()).toBe(false);
      expect(s.isValid()).toBe(false);
    });

    it('a complete, correct cube is valid', () => {
      s.facelets.set(solvedCube());
      expect(s.errors()).toEqual([]);
      expect(s.isValid()).toBe(true);
    });

    it('a complete cube that fails the parity rules is not valid', () => {
      // Rotate the colors of the URF corner: every sticker is filled and passes the
      // live checks, but the corner is twisted, so the cube is unsolvable.
      const f = solvedCube();
      [f[8], f[9], f[20]] = [f[9], f[20], f[8]];
      s.facelets.set(f);
      expect(s.isComplete()).toBe(true);
      expect(s.errors().map(e => e.code)).toContain('CORNER_TWIST');
      expect(s.isValid()).toBe(false);
    });
  });

  describe('locking', () => {
    beforeEach(() => s.facelets.set(solvedCube()));

    it('a locked cube cannot be painted, hovered or reset', () => {
      s.setActiveColor('R');
      s.lock();

      s.clickSticker(0);
      expect(s.facelets()).toEqual(solvedCube());
      s.setHovered(0);
      expect(s.hovered()).toBeNull();
      s.reset();
      expect(s.facelets()).toEqual(solvedCube());
    });

    it('locking clears hover and selection', () => {
      s.setHovered(0);
      s.clickSticker(0);
      s.lock();
      expect(s.locked()).toBe(true);
      expect(s.hovered()).toBeNull();
      expect(s.selected()).toBeNull();
    });

    it('unlocking allows painting again', () => {
      s.lock();
      s.unlock();
      expect(s.locked()).toBe(false);
      s.setActiveColor('R');
      s.clickSticker(0); // a U sticker: now painted red
      expect(s.facelets()[0]).toBe('R');
      expect(s.isValid()).toBe(false); // the edit made the cube invalid
    });
  });

  it('reset restores the empty cube and clears hover/selection', () => {
    s.setActiveColor('R');
    s.clickSticker(0);
    s.setHovered(1);
    s.reset();
    expect(s.facelets()).toEqual(emptyCube());
    expect(s.hovered()).toBeNull();
    expect(s.selected()).toBeNull();
    expect(s.activeColor()).toBe('R');
  });
});
