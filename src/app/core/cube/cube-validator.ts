/**
 * 3x3 Rubik's cube input validation (centers are fixed).
 *
 * State representation: an array of length 54 in kociemba order: U R F D L B,
 * 9 stickers per face, numbered 0..8 row by row from the top-left of each face.
 * Unfilled stickers are null.
 * Because the centers are fixed, a color is represented directly by the face it
 * belongs to ('U' | 'R' | ...).
 * The UI layer only needs a mapping like { white: 'U', red: 'R', green: 'F', ... }.
 */

export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export type Facelets = (Face | null)[];

export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

// ---------- Piece definitions (kociemba standard) ----------

/**
 * The 8 corner slots. Each lists the 3 sticker indices of that slot, clockwise;
 * the first one is always the sticker on the U or D face.
 */
export const CORNER_SLOTS: number[][] = [
  [8, 9, 20],  // URF
  [6, 18, 38], // UFL
  [0, 36, 47], // ULB
  [2, 45, 11], // UBR
  [29, 26, 15], // DFR
  [27, 44, 24], // DLF
  [33, 53, 42], // DBL
  [35, 17, 51], // DRB
];
/** The colors of the 8 corner pieces themselves (same order as the slots above, clockwise). */
export const CORNER_PIECES: Face[][] = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];

/** The 12 edge slots. Each lists the 2 sticker indices of that slot. */
export const EDGE_SLOTS: number[][] = [
  [5, 10], [7, 19], [3, 37], [1, 46], // UR UF UL UB
  [32, 16], [28, 25], [30, 43], [34, 52], // DR DF DL DB
  [23, 12], [21, 41], [50, 39], [48, 14], // FR FL BL BR
];
export const EDGE_PIECES: Face[][] = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'],
  ['D', 'R'], ['D', 'F'], ['D', 'L'], ['D', 'B'],
  ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

export const CENTERS = [4, 13, 22, 31, 40, 49];

// ---------- Helper: which (piece, orientation) can the stickers in a slot match? ----------

interface Match { piece: number; orientation: number; }

/**
 * Finds every (piece, orientation) consistent with the colors filled in so far.
 * Corner orientation o: the piece's k-th color appears on the slot's (k + o) % 3-th sticker.
 * Only rotations are tried (no mirroring), so a "mirrored corner" is naturally
 * excluded - this is the chirality check.
 */
function matchPiece(stickers: (Face | null)[], pieces: Face[][]): Match[] {
  const n = stickers.length;
  const result: Match[] = [];
  pieces.forEach((colors, piece) => {
    for (let o = 0; o < n; o++) {
      let ok = true;
      for (let k = 0; k < n; k++) {
        const s = stickers[(k + o) % n];
        if (s !== null && s !== colors[k]) { ok = false; break; }
      }
      if (ok) result.push({ piece, orientation: o });
    }
  });
  return result;
}

/** Converts a corner/edge orientation o into kociemba's orientation value (which sticker holds the U/D color). */
function cornerTwist(o: number): number { return o % 3; }
function edgeFlip(o: number): number { return o % 2; }

// ---------- Result types ----------

export type PieceKind = 'corner' | 'edge';

/**
 * What is wrong, as data. The wording is the UI's job (see shared/validation-messages.ts),
 * so it can use color names instead of face letters and be translated.
 * Each error also lists the stickers involved, which the UI highlights.
 */
export type ValidationError = { stickers: number[] } & (
  /** A center was changed (the face is the one whose center it is). */
  | { code: 'CENTER'; face: Face }
  /** A color is on more than 9 stickers. */
  | { code: 'COUNT_OVER'; face: Face; count: number }
  /** A color is on fewer than 9 stickers (only checked on a complete cube). */
  | { code: 'COUNT_UNDER'; face: Face; count: number }
  /** The same color twice on one piece / opposite colors on one piece / a mirrored corner. */
  | { code: 'SAME_COLOR' | 'OPPOSITE' | 'CHIRALITY'; kind: PieceKind }
  /** A fully colored piece appears twice; `piece` is its colors. */
  | { code: 'DUPLICATE'; kind: PieceKind; piece: Face[] }
  /** Stickers are still empty (the full check on an unfinished cube). */
  | { code: 'INCOMPLETE'; count: number }
  /** Parity rules, on a complete cube. */
  | { code: 'CORNER_TWIST' | 'EDGE_FLIP' | 'PARITY' }
);

export type ValidationErrorCode = ValidationError['code'];

// ======================================================================
// Stage 1: call after every sticker is filled in - only checks for things that
// are already definitely wrong, so an unfinished cube is allowed
// ======================================================================
export function validatePartial(f: Facelets): ValidationError[] {
  const errors: ValidationError[] = [];

  // Centers must stay fixed
  CENTERS.forEach((idx, i) => {
    if (f[idx] !== FACES[i]) {
      errors.push({ code: 'CENTER', face: FACES[i], stickers: [idx] });
    }
  });

  // No color may appear on more than 9 stickers
  for (const face of FACES) {
    const idxs = f.map((c, i) => (c === face ? i : -1)).filter(i => i >= 0);
    if (idxs.length > 9) {
      errors.push({ code: 'COUNT_OVER', face, count: idxs.length, stickers: idxs });
    }
  }

  // Local check of every piece, remembering which pieces are fully identified (to detect duplicates)
  const checkSlots = (slots: number[][], pieces: Face[][], kind: PieceKind) => {
    const usedBy = new Map<number, number[]>(); // piece -> slot indices
    slots.forEach(slot => {
      const stickers = slot.map(i => f[i]);
      const filled = stickers.filter(s => s !== null) as Face[];
      if (filled.length === 0) return;

      // The same color twice on one piece
      if (new Set(filled).size !== filled.length) {
        errors.push({ code: 'SAME_COLOR', kind, stickers: slot });
        return;
      }
      // Opposite colors on one piece (white+yellow, red+orange, green+blue)
      if (filled.some(c => filled.includes(OPPOSITE[c]))) {
        errors.push({ code: 'OPPOSITE', kind, stickers: slot });
        return;
      }
      const matches = matchPiece(stickers, pieces);
      if (matches.length === 0) {
        // The color combination exists, but in mirrored order (can only happen on corners)
        errors.push({ code: 'CHIRALITY', kind, stickers: slot });
        return;
      }
      // Fully filled -> identity is known; record it to detect duplicates
      if (filled.length === slot.length) {
        const p = matches[0].piece;
        usedBy.set(p, [...(usedBy.get(p) ?? []), ...slot]);
      }
    });
    usedBy.forEach((stickerIdxs, p) => {
      if (stickerIdxs.length > slots[0].length) {
        errors.push({ code: 'DUPLICATE', kind, piece: pieces[p], stickers: stickerIdxs });
      }
    });
  };

  checkSlots(CORNER_SLOTS, CORNER_PIECES, 'corner');
  checkSlots(EDGE_SLOTS, EDGE_PIECES, 'edge');
  return errors;
}

// ======================================================================
// For the UI: which colors can still go on a given sticker
// (used to grey out unusable colors in the palette)
// ======================================================================
export function allowedColors(f: Facelets, sticker: number): Face[] {
  if (CENTERS.includes(sticker)) return [f[sticker]!];
  return FACES.filter(color => {
    const trial = [...f];
    trial[sticker] = color;
    return validatePartial(trial).length === 0;
  });
}

// ======================================================================
// Stage 2: call once all 54 stickers are filled, before "Solve" -
// full check plus the three parity rules
// ======================================================================
export interface FullResult {
  valid: boolean;
  errors: ValidationError[];
  /** When valid, the 54-character string for kociemba, ready to send to the backend solver */
  facelets?: string;
}

export function validateFull(f: Facelets): FullResult {
  const errors: ValidationError[] = [];

  const empty = f.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
  if (empty.length > 0) {
    return { valid: false, errors: [{ code: 'INCOMPLETE', count: empty.length, stickers: empty }] };
  }

  // Run the partial checks first (layers 1-3)
  errors.push(...validatePartial(f));
  for (const face of FACES) {
    const n = f.filter(c => c === face).length;
    if (n < 9) errors.push({ code: 'COUNT_UNDER', face, count: n, stickers: [] });
  }
  if (errors.length > 0) return { valid: false, errors };

  // Identify every slot as (piece, orientation)
  const cp: number[] = [], co: number[] = [], ep: number[] = [], eo: number[] = [];
  CORNER_SLOTS.forEach(slot => {
    const m = matchPiece(slot.map(i => f[i]), CORNER_PIECES)[0];
    cp.push(m.piece); co.push(cornerTwist(m.orientation));
  });
  EDGE_SLOTS.forEach(slot => {
    const m = matchPiece(slot.map(i => f[i]), EDGE_PIECES)[0];
    ep.push(m.piece); eo.push(edgeFlip(m.orientation));
  });

  // Layer 4: parity
  const twistSum = co.reduce((a, b) => a + b, 0);
  if (twistSum % 3 !== 0) {
    // Find the twisted corners so the UI can highlight them (we can't always pinpoint
    // exactly which one, so every corner with a non-zero twist is marked)
    const suspects = CORNER_SLOTS.filter((_, i) => co[i] !== 0).flat();
    errors.push({ code: 'CORNER_TWIST', stickers: suspects });
  }
  const flipSum = eo.reduce((a, b) => a + b, 0);
  if (flipSum % 2 !== 0) {
    const suspects = EDGE_SLOTS.filter((_, i) => eo[i] !== 0).flat();
    errors.push({ code: 'EDGE_FLIP', stickers: suspects });
  }
  if (permutationParity(cp) !== permutationParity(ep)) {
    errors.push({ code: 'PARITY', stickers: [] });
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], facelets: f.join('') };
}

/** Permutation parity: counts inversions, 0 = even, 1 = odd */
function permutationParity(perm: number[]): number {
  let inv = 0;
  for (let i = 0; i < perm.length; i++)
    for (let j = i + 1; j < perm.length; j++)
      if (perm[i] > perm[j]) inv++;
  return inv % 2;
}

/** For tests and UI initialization: an empty cube with only the centers filled in */
export function emptyCube(): Facelets {
  const f: Facelets = new Array(54).fill(null);
  CENTERS.forEach((idx, i) => (f[idx] = FACES[i]));
  return f;
}

/** A solved cube */
export function solvedCube(): Facelets {
  return FACES.flatMap(face => new Array(9).fill(face));
}
