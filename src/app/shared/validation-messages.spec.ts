import { describe, it, expect } from 'vitest';
import { ValidationError, ValidationErrorCode } from '../core/cube/cube-validator';
import { describeError } from './validation-messages';

/** One example of every kind of error. Typed as a Record so a new code cannot be forgotten here. */
const EXAMPLES: Record<ValidationErrorCode, ValidationError> = {
  CENTER: { code: 'CENTER', face: 'U', stickers: [4] },
  COUNT_OVER: { code: 'COUNT_OVER', face: 'R', count: 10, stickers: [] },
  COUNT_UNDER: { code: 'COUNT_UNDER', face: 'D', count: 8, stickers: [] },
  SAME_COLOR: { code: 'SAME_COLOR', kind: 'corner', stickers: [] },
  OPPOSITE: { code: 'OPPOSITE', kind: 'edge', stickers: [] },
  CHIRALITY: { code: 'CHIRALITY', kind: 'corner', stickers: [] },
  DUPLICATE: { code: 'DUPLICATE', kind: 'corner', piece: ['U', 'R', 'F'], stickers: [] },
  INCOMPLETE: { code: 'INCOMPLETE', count: 48, stickers: [] },
  CORNER_TWIST: { code: 'CORNER_TWIST', stickers: [] },
  EDGE_FLIP: { code: 'EDGE_FLIP', stickers: [] },
  PARITY: { code: 'PARITY', stickers: [] },
};

describe('describeError', () => {
  it('words every kind of error', () => {
    for (const error of Object.values(EXAMPLES)) {
      expect(describeError(error).length, error.code).toBeGreaterThan(10);
    }
  });

  it('uses color names, with the current color scheme (yellow on top, white on the bottom)', () => {
    expect(describeError(EXAMPLES['CENTER'])).toBe('The yellow center was changed');
    expect(describeError(EXAMPLES['COUNT_OVER'])).toBe('Orange is on 10 stickers, more than 9');
    expect(describeError(EXAMPLES['COUNT_UNDER'])).toBe('White is on only 8 stickers, it should be 9');
    expect(describeError(EXAMPLES['DUPLICATE'])).toBe('The yellow-orange-green corner appears more than once');
  });

  it('never shows a face letter such as U, R or F on its own', () => {
    for (const error of Object.values(EXAMPLES)) {
      expect(describeError(error), error.code).not.toMatch(/\b[URFDLB]\b/);
    }
  });

  it('mentions whether the piece is a corner or an edge', () => {
    expect(describeError({ code: 'SAME_COLOR', kind: 'corner', stickers: [] })).toContain('corner');
    expect(describeError({ code: 'SAME_COLOR', kind: 'edge', stickers: [] })).toContain('edge');
  });

  it('handles singular and plural counts', () => {
    expect(describeError({ code: 'INCOMPLETE', count: 1, stickers: [] })).toBe('1 sticker is still empty');
    expect(describeError({ code: 'INCOMPLETE', count: 5, stickers: [] })).toBe('5 stickers are still empty');
    expect(describeError({ code: 'COUNT_UNDER', face: 'U', count: 1, stickers: [] })).toBe('Yellow is on only 1 sticker, it should be 9');
  });
});
