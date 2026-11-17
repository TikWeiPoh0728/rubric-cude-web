import { describe, expect, it } from 'vitest';
import type { Face } from '../cube/cube-validator';
import { classify } from './classify';
import { centerRefsFromItems, EvalItem, evaluate } from './scan-eval';
import { expectedFaces, labelsForScramble } from './scramble-labels';
import type { Lab, Nine } from './scan-types';

const lab = (L: number): Lab => ({ L, a: 0, b: 0 });
const nine = (f: Face): Face[] => new Array(9).fill(f);

describe('evaluate', () => {
  it('counts detection, accuracy and the confusion matrix', () => {
    const items: EvalItem[] = [
      { name: 'a', label: { face: 'U', stickers: nine('U') }, samples: new Array(9).fill(lab(50)), predicted: nine('U') },
      {
        name: 'b',
        label: { face: 'F', stickers: nine('F') },
        samples: new Array(9).fill(lab(50)),
        predicted: ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'R', 'R'],
      },
      { name: 'c', label: { face: 'D', stickers: nine('D') }, samples: null, predicted: null, error: 'no grid' },
    ];
    const r = evaluate(items);
    expect(r.photos).toBe(3);
    expect(r.gridsFound).toBe(2);
    expect(r.detectionRate).toBeCloseTo(2 / 3);
    expect(r.stickersClassified).toBe(18);
    expect(r.stickersCorrect).toBe(16);
    expect(r.accuracyWhenFound).toBeCloseTo(16 / 18);
    expect(r.accuracyOverall).toBeCloseTo(16 / 27);
    expect(r.confusion.F.R).toBe(2);
    expect(r.confusion.F.F).toBe(7);
    expect(r.confusion.U.U).toBe(9);
    expect(r.failures.map(f => f.name)).toEqual(['b', 'c']);
  });

  it('reports no accuracy when nothing was classified', () => {
    const r = evaluate([{ name: 'a', label: { face: 'U', stickers: nine('U') }, samples: [lab(1)], predicted: null }]);
    expect(r.accuracyWhenFound).toBeNull();
    expect(r.failures[0].reason).toBe('not classified');
  });
});

describe('centerRefsFromItems', () => {
  const item = (face: Face, L: number): EvalItem => ({
    name: face + L,
    label: { face, stickers: nine(face) },
    samples: new Array(9).fill(lab(L)),
    predicted: null,
  });

  it('averages each face center over its photos', () => {
    const items = (['U', 'R', 'F', 'D', 'L', 'B'] as Face[]).map((f, i) => item(f, i * 10));
    items.push(item('U', 20));
    const refs = centerRefsFromItems(items)!;
    expect(refs.U.L).toBe(10);
    expect(refs.B.L).toBe(50);
  });

  it('needs every face', () => {
    expect(centerRefsFromItems([item('U', 1)])).toBeNull();
  });
});

describe('scramble labels', () => {
  it('gives a solved cube for an empty scramble', () => {
    const faces = expectedFaces('');
    expect(faces.U).toEqual(nine('U'));
    expect(faces.B).toEqual(nine('B'));
  });

  it("brings F's right column up to U on R", () => {
    const faces = expectedFaces('R');
    expect([2, 5, 8].map(i => faces.U[i])).toEqual(['F', 'F', 'F']);
    expect([2, 5, 8].map(i => faces.F[i])).toEqual(['D', 'D', 'D']);
    expect(faces.R).toEqual(nine('R'));
  });

  it('keeps centers and counts after a long scramble', () => {
    const labels = labelsForScramble("  R U R' U' F2  D L' B ");
    expect(labels.map(l => l.face)).toEqual(['U', 'R', 'F', 'D', 'L', 'B']);
    expect(labels[0].scramble).toBe("R U R' U' F2 D L' B");
    for (const l of labels) expect(l.stickers[4]).toBe(l.face);
    const all = labels.flatMap(l => l.stickers);
    for (const f of ['U', 'R', 'F', 'D', 'L', 'B']) expect(all.filter(x => x === f)).toHaveLength(9);
  });
});

describe('classify', () => {
  it('is a stub until implemented', () => {
    const samples = new Array(9).fill(lab(50)) as Nine<Lab>;
    const refs = { U: lab(1), R: lab(2), F: lab(3), D: lab(4), L: lab(5), B: lab(6) };
    expect(() => classify(samples, refs)).toThrow('not implemented');
  });
});
