import { StageId } from '../core/solver/solution';
import { UI_COLORS, UiColor } from './ui/ui-colors';

/** Which palette color each CFOP stage is drawn in. */
export const STAGE_COLOR: Readonly<Record<StageId, UiColor>> = {
  cross: 'sky',
  f2l: 'green',
  oll: 'amber',
  pll: 'violet',
};

/**
 * CSS custom properties for a stage, to bind with [style]: strong (current), dark (outline),
 * soft (done) and the text on soft. An unknown id (the single list of a method without
 * stages) gets none, so the stylesheet's defaults apply.
 */
export function stageVars(id: string): Record<string, string> {
  const color = STAGE_COLOR[id as StageId];
  if (!color) return {};
  const p = UI_COLORS[color];
  return { '--stage': p.main, '--stage-dark': p.dark, '--stage-soft': p.soft, '--stage-soft-text': p.softText };
}
