/**
 * Scoring the pipeline on the labeled test set: grid detection rate, per-sticker
 * accuracy and a confusion matrix. Pure TS; the debug page feeds it results.
 */
import { Face, FACES } from '../cube/cube-validator';
import type { Lab, ScanLabel } from './scan-types';

export interface EvalItem {
  name: string;
  label: ScanLabel;
  /** Null when no grid was found. */
  samples: Lab[] | null;
  /** Null when no grid was found or classification failed. */
  predicted: Face[] | null;
  /** Why this photo failed, if it did. */
  error?: string;
}

export type ConfusionMatrix = Record<Face, Record<Face, number>>;

export interface EvalReport {
  photos: number;
  gridsFound: number;
  /** gridsFound / photos. */
  detectionRate: number;
  /** Stickers classified (photos with a grid and a classification). */
  stickersClassified: number;
  stickersCorrect: number;
  /** Correct / classified: how good the colors are once a grid is found. */
  accuracyWhenFound: number | null;
  /** Correct / (photos × 9): undetected photos count as all wrong. */
  accuracyOverall: number | null;
  /** confusion[expected][predicted] */
  confusion: ConfusionMatrix;
  failures: { name: string; reason: string }[];
}

export function emptyConfusion(): ConfusionMatrix {
  const m = {} as ConfusionMatrix;
  for (const e of FACES) {
    m[e] = {} as Record<Face, number>;
    for (const p of FACES) m[e][p] = 0;
  }
  return m;
}

export function evaluate(items: readonly EvalItem[]): EvalReport {
  const confusion = emptyConfusion();
  const failures: { name: string; reason: string }[] = [];
  let gridsFound = 0;
  let classified = 0;
  let correct = 0;
  let anyClassified = false;

  for (const item of items) {
    if (item.samples) gridsFound++;
    if (!item.predicted) {
      failures.push({ name: item.name, reason: item.error ?? (item.samples ? 'not classified' : 'no grid') });
      continue;
    }
    anyClassified = true;
    let wrong = 0;
    item.predicted.forEach((p, i) => {
      const expected = item.label.stickers[i];
      confusion[expected][p]++;
      classified++;
      if (p === expected) correct++;
      else wrong++;
    });
    if (wrong > 0) failures.push({ name: item.name, reason: `${wrong} sticker(s) wrong` });
  }

  const photos = items.length;
  return {
    photos,
    gridsFound,
    detectionRate: photos ? gridsFound / photos : 0,
    stickersClassified: classified,
    stickersCorrect: correct,
    accuracyWhenFound: anyClassified ? correct / classified : null,
    accuracyOverall: anyClassified ? correct / (photos * 9) : null,
    confusion,
    failures,
  };
}

/**
 * Calibration references from the test set itself: the mean Lab of the center
 * sticker over every photo of each face. Null if some face has no photo with a grid.
 */
export function centerRefsFromItems(items: readonly EvalItem[]): Record<Face, Lab> | null {
  const sums = new Map<Face, { L: number; a: number; b: number; n: number }>();
  for (const item of items) {
    if (!item.samples) continue;
    const c = item.samples[4];
    const s = sums.get(item.label.face) ?? { L: 0, a: 0, b: 0, n: 0 };
    s.L += c.L;
    s.a += c.a;
    s.b += c.b;
    s.n++;
    sums.set(item.label.face, s);
  }
  if (FACES.some(f => !sums.has(f))) return null;
  const refs = {} as Record<Face, Lab>;
  for (const [face, s] of sums) refs[face] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n };
  return refs;
}
