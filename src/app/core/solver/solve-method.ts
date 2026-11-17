/** The solving methods the user can choose between. */
export type SolveMethod = 'kociemba' | 'cfop' | 'lbl';

export const SOLVE_METHODS: readonly { id: SolveMethod; label: string }[] = [
  { id: 'kociemba', label: 'Kociemba' },
  { id: 'cfop', label: 'CFOP' },
  { id: 'lbl', label: 'LBL' },
];
