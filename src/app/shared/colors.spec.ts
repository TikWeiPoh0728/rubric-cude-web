import { describe, it, expect } from 'vitest';
import { FACE_COLORS, FACE_NAMES, PALETTE } from './colors';
import { FACES } from '../core/cube/cube-validator';

describe('color scheme', () => {
  it('has yellow on top and white on the bottom', () => {
    expect(FACE_NAMES.U).toBe('Yellow');
    expect(FACE_NAMES.D).toBe('White');
  });

  it('keeps opposite faces on opposite colors (white/yellow, red/orange, green/blue)', () => {
    const pair = (a: 'U' | 'R' | 'F', b: 'D' | 'L' | 'B') => [FACE_NAMES[a], FACE_NAMES[b]].sort().join('/');
    expect(pair('U', 'D')).toBe('White/Yellow');
    expect(pair('R', 'L')).toBe('Orange/Red');
    expect(pair('F', 'B')).toBe('Blue/Green');
  });

  it('is a real cube, not a mirror image: yellow top + green front puts orange on the right', () => {
    // The standard scheme is white top, green front, red right. Turning the cube 180°
    // around the front-back axis swaps top/bottom and left/right and keeps the front.
    const standard = { U: 'White', D: 'Yellow', F: 'Green', B: 'Blue', R: 'Red', L: 'Orange' } as const;
    const turned = { U: standard.D, D: standard.U, F: standard.F, B: standard.B, R: standard.L, L: standard.R };
    expect(FACE_NAMES).toEqual(turned);
  });

  it('gives every face its own display color, and the palette lists each face once', () => {
    expect(new Set(FACES.map(f => FACE_COLORS[f])).size).toBe(6);
    expect([...PALETTE].sort()).toEqual([...FACES].sort());
  });
});
