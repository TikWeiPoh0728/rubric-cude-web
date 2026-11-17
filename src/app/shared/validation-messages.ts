import { ValidationError } from '../core/cube/cube-validator';
import { FACE_NAMES } from './colors';

/**
 * The wording of every problem the validator can report, in the user's terms:
 * color names (Yellow, Orange, ...), never face letters (U, R, ...).
 */
export function describeError(error: ValidationError): string {
  switch (error.code) {
    case 'CENTER':
      return `The ${FACE_NAMES[error.face].toLowerCase()} center was changed`;
    case 'COUNT_OVER':
      return `${FACE_NAMES[error.face]} is on ${error.count} stickers, more than 9`;
    case 'COUNT_UNDER':
      return `${FACE_NAMES[error.face]} is on only ${error.count} ${error.count === 1 ? 'sticker' : 'stickers'}, it should be 9`;
    case 'SAME_COLOR':
      return `This ${error.kind} has a repeated color`;
    case 'OPPOSITE':
      return `This ${error.kind} has two opposite colors, which cannot exist`;
    case 'CHIRALITY':
      return `The colors on this ${error.kind} are in the wrong order (mirrored); check the positions of the stickers`;
    case 'DUPLICATE':
      return `The ${error.piece.map(f => FACE_NAMES[f].toLowerCase()).join('-')} ${error.kind} appears more than once`;
    case 'INCOMPLETE':
      return error.count === 1 ? '1 sticker is still empty' : `${error.count} stickers are still empty`;
    case 'CORNER_TWIST':
      return 'A corner is oriented wrongly (twisted); check the highlighted corners';
    case 'EDGE_FLIP':
      return 'An edge is oriented wrongly (flipped); check the highlighted edges';
    case 'PARITY':
      return 'Two pieces appear to be swapped; check whether two pieces were entered the wrong way round';
  }
}
