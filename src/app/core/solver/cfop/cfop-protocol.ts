import type { StageId } from '../solution';

/** What the page and the CFOP worker say to each other. Kept free of solver code so the main bundle stays small. */
export interface CfopRequest {
  /** 54 characters in U R F D L B order. */
  facelets: string;
}

export type CfopResponse =
  | { type: 'solution'; stages: { id: StageId; moves: string[] }[] }
  | { type: 'error'; message: string };
