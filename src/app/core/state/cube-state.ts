import { Injectable, computed, signal } from '@angular/core';
import {
  CENTERS, Face, Facelets, ValidationError, allowedColors, emptyCube, validateFull, validatePartial,
} from '../cube/cube-validator';

/**
 * The cube being edited: the single source of truth for the 54 stickers, plus what
 * is derived from them (problems, which colors fit where). It knows nothing about
 * the app's workflow; SessionState decides when editing is allowed and calls
 * lock() / unlock().
 * Must not import Three.js: the 3D view only renders what is stored here.
 */
@Injectable({ providedIn: 'root' })
export class CubeState {
  /** The cube: face letter per sticker (kociemba order U R F D L B), or null when empty. */
  readonly facelets = signal<Facelets>(emptyCube());

  /** Palette color currently picked for painting. */
  readonly activeColor = signal<Face | null>(null);

  /** Sticker under the cursor (3D or net), or null. */
  readonly hovered = signal<number | null>(null);

  /** Last sticker clicked, or null. */
  readonly selected = signal<number | null>(null);

  private readonly lockedSignal = signal(false);

  /** A locked cube is read-only: it cannot be painted, hovered or reset. */
  readonly locked = this.lockedSignal.asReadonly();

  /** All 54 stickers have a color. */
  readonly isComplete = computed(() => this.facelets().every(c => c !== null));

  /**
   * Problems with the current cube. While stickers are missing this is the live
   * partial check; once the cube is complete it is the full check, which adds
   * the parity rules (a twisted corner, a flipped edge, two swapped pieces).
   */
  readonly errors = computed<ValidationError[]>(() => {
    const f = this.facelets();
    return this.isComplete() ? validateFull(f).errors : validatePartial(f);
  });

  /** Complete and free of problems: a real cube that can be solved. */
  readonly isValid = computed(() => this.isComplete() && this.errors().length === 0);

  /** Sticker indices to outline in red. */
  readonly errorStickers = computed<ReadonlySet<number>>(
    () => new Set(this.errors().flatMap(e => e.stickers)),
  );

  /**
   * Sticker the palette hints are about: the one under the cursor, else the selected one
   * but only while it is still empty (waiting for a color). A painted sticker must not
   * keep greying palette colors, or it looks as if those colors are unusable everywhere.
   */
  readonly focusSticker = computed<number | null>(() => {
    const hovered = this.hovered();
    if (hovered !== null) return hovered;
    const selected = this.selected();
    return selected !== null && this.facelets()[selected] === null ? selected : null;
  });

  /** Colors allowed on the focus sticker, or null when there is no focus sticker. */
  readonly allowed = computed<readonly Face[] | null>(() => {
    const i = this.focusSticker();
    return i === null ? null : allowedColors(this.facelets(), i);
  });

  /** Pick (or un-pick) a palette color. */
  setActiveColor(color: Face | null): void {
    this.activeColor.set(color);
  }

  /**
   * Click on a sticker. Centers do nothing. With no active color the sticker is
   * just selected. Clicking a sticker that already has the active color clears it.
   */
  clickSticker(index: number): void {
    if (this.locked() || CENTERS.includes(index)) return;
    this.selected.set(index);
    const color = this.activeColor();
    if (color === null) return;
    const next = [...this.facelets()];
    next[index] = next[index] === color ? null : color;
    this.facelets.set(next);
  }

  /** Centers are fixed and a locked cube is read-only, so neither is a hover target. */
  setHovered(index: number | null): void {
    const target = this.locked() || (index !== null && CENTERS.includes(index)) ? null : index;
    if (this.hovered() !== target) this.hovered.set(target);
  }

  /** Make the cube read-only, and drop hover and selection. */
  lock(): void {
    this.lockedSignal.set(true);
    this.hovered.set(null);
    this.selected.set(null);
  }

  unlock(): void {
    this.lockedSignal.set(false);
  }

  /** Back to an empty cube (centers only). Keeps the picked palette color. */
  reset(): void {
    if (this.locked()) return;
    this.facelets.set(emptyCube());
    this.hovered.set(null);
    this.selected.set(null);
  }
}
