/** The stages of a CFOP solution, in the order they are solved. */
export type StageId = 'cross' | 'f2l' | 'oll' | 'pll';

export const STAGE_LABELS: Readonly<Record<StageId, string>> = {
  cross: 'Cross',
  f2l: 'F2L',
  oll: 'OLL',
  pll: 'PLL',
};

/** One stage of a staged solution. A stage that was not needed has no moves. */
export interface SolveStage {
  id: StageId;
  label: string;
  moves: string[];
}

/**
 * What a solver returns: the moves in standard notation (R, U', F2 ...) and, for methods
 * that work in stages, how those moves split up. Methods without stages (Kociemba)
 * leave `stages` null.
 */
export interface Solution {
  moves: string[];
  stages: SolveStage[] | null;
}

/** A solution without stages. */
export function plainSolution(moves: string[]): Solution {
  return { moves, stages: null };
}

/** A staged solution; the flat move list is the stages joined in order, so the two can never disagree. */
export function stagedSolution(stages: { id: StageId; moves: string[] }[]): Solution {
  const full: SolveStage[] = stages.map(s => ({ id: s.id, label: STAGE_LABELS[s.id], moves: s.moves }));
  return { moves: full.flatMap(s => s.moves), stages: full };
}
