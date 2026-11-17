import { describe, it, expect } from 'vitest';
import { Facelets, emptyCube, solvedCube, validateFull, validatePartial } from './cube-validator';

/** A solved cube with some stickers replaced. */
const with_ = (changes: Record<number, 'U' | 'R' | 'F' | 'D' | 'L' | 'B'>): Facelets => {
  const f = solvedCube();
  for (const [i, c] of Object.entries(changes)) f[Number(i)] = c;
  return f;
};

/** An empty cube (centers only) with some stickers filled in. */
const partial = (changes: Record<number, 'U' | 'R' | 'F' | 'D' | 'L' | 'B'>): Facelets => {
  const f = emptyCube();
  for (const [i, c] of Object.entries(changes)) f[Number(i)] = c;
  return f;
};

describe('validatePartial: errors are data, not text', () => {
  it('finds nothing wrong with an empty cube or a solved one', () => {
    expect(validatePartial(emptyCube())).toEqual([]);
    expect(validatePartial(solvedCube())).toEqual([]);
  });

  it('no error carries a message: wording is the UI\'s job', () => {
    const errors = validatePartial(partial({ 8: 'U', 9: 'U' }));
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) expect('message' in e).toBe(false);
  });

  it('CENTER: names the face whose center changed', () => {
    const f = emptyCube();
    f[4] = 'R';
    expect(validatePartial(f)).toEqual([{ code: 'CENTER', face: 'U', stickers: [4] }]);
  });

  it('COUNT_OVER: names the color and how many stickers it is on', () => {
    // The whole R face (9 stickers, center included) plus one more R elsewhere.
    const f = emptyCube();
    for (let i = 9; i < 18; i++) f[i] = 'R';
    f[18] = 'R';
    const errors = validatePartial(f);
    const over = errors.find(e => e.code === 'COUNT_OVER');
    expect(over).toMatchObject({ code: 'COUNT_OVER', face: 'R', count: 10 });
    expect(over!.stickers.length).toBe(10);
  });

  it('SAME_COLOR: the same color twice on a corner, with the corner\'s stickers', () => {
    expect(validatePartial(partial({ 8: 'U', 9: 'U' }))).toEqual([
      { code: 'SAME_COLOR', kind: 'corner', stickers: [8, 9, 20] },
    ]);
  });

  it('SAME_COLOR on an edge says "edge"', () => {
    expect(validatePartial(partial({ 5: 'U', 10: 'U' }))).toEqual([
      { code: 'SAME_COLOR', kind: 'edge', stickers: [5, 10] },
    ]);
  });

  it('OPPOSITE: opposite colors on one piece', () => {
    expect(validatePartial(partial({ 5: 'U', 10: 'D' }))).toEqual([
      { code: 'OPPOSITE', kind: 'edge', stickers: [5, 10] },
    ]);
  });

  it('CHIRALITY: a corner whose colors are in mirrored order', () => {
    // The URF corner reads U, R, F clockwise; U, F, R is its mirror image.
    expect(validatePartial(partial({ 8: 'U', 9: 'F', 20: 'R' }))).toEqual([
      { code: 'CHIRALITY', kind: 'corner', stickers: [8, 9, 20] },
    ]);
  });

  it('DUPLICATE: the same finished piece twice, with its colors', () => {
    // URF is solved (U, R, F); copy those colors onto the UFL corner as well.
    const errors = validatePartial(partial({ 8: 'U', 9: 'R', 20: 'F', 6: 'U', 18: 'R', 38: 'F' }));
    expect(errors).toEqual([
      { code: 'DUPLICATE', kind: 'corner', piece: ['U', 'R', 'F'], stickers: [8, 9, 20, 6, 18, 38] },
    ]);
  });
});

describe('validateFull: errors are data, not text', () => {
  it('accepts a solved cube and returns the facelet string', () => {
    const result = validateFull(solvedCube());
    expect(result.valid).toBe(true);
    expect(result.facelets).toBe('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  });

  it('INCOMPLETE: how many stickers are empty, and which', () => {
    const result = validateFull(emptyCube());
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ code: 'INCOMPLETE', count: 48 });
    expect(result.errors[0].stickers).toHaveLength(48);
  });

  it('COUNT_UNDER: names the color that is short, and by how much', () => {
    // Sticker 0 (an up-face corner) painted red: red has 10, yellow has only 8.
    const errors = validateFull(with_({ 0: 'R' })).errors;
    expect(errors).toContainEqual({ code: 'COUNT_UNDER', face: 'U', count: 8, stickers: [] });
    expect(errors.some(e => e.code === 'COUNT_OVER' && e.face === 'R' && e.count === 10)).toBe(true);
  });

  it('CORNER_TWIST: a single twisted corner, with that corner\'s stickers', () => {
    // Rotate the colors of the URF corner: every sticker is filled and the live checks
    // pass, but one corner cannot be twisted alone on a real cube.
    const f = solvedCube();
    [f[8], f[9], f[20]] = [f[9], f[20], f[8]];
    expect(validateFull(f).errors).toEqual([{ code: 'CORNER_TWIST', stickers: [8, 9, 20] }]);
  });

  it('EDGE_FLIP: a single flipped edge, with that edge\'s stickers', () => {
    const f = solvedCube();
    [f[5], f[10]] = [f[10], f[5]];
    expect(validateFull(f).errors).toEqual([{ code: 'EDGE_FLIP', stickers: [5, 10] }]);
  });

  it('PARITY: two edges swapped', () => {
    // Swap the UF and UL edges, sticker by sticker.
    const f = solvedCube();
    [f[7], f[3]] = [f[3], f[7]];
    [f[19], f[37]] = [f[37], f[19]];
    expect(validateFull(f).errors).toEqual([{ code: 'PARITY', stickers: [] }]);
  });
});
