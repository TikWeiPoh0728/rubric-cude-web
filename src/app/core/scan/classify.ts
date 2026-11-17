/**
 * Step 7: decide which face each sticker belongs to, calibrated from the centers.
 * Interface only: the implementation is still to be written.
 */
import type { Face } from '../cube/cube-validator';
import type { Lab, Nine } from './scan-types';

export interface StickerClass {
  face: Face;
  /** 0–1, higher is more certain. */
  confidence: number;
}

/**
 * @param samples Lab color of each sticker of one face, row-major (standard Lab ranges).
 * @param centerRefs Lab color of each face's center sticker, used as the calibration.
 * @returns one result per sample, same order.
 */
export function classify(samples: Nine<Lab>, centerRefs: Record<Face, Lab>): StickerClass[] {
  void samples;
  void centerRefs;
  throw new Error('not implemented');
}
