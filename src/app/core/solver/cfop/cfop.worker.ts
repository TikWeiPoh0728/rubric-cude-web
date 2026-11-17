/// <reference lib="webworker" />
import type { CfopRequest, CfopResponse } from './cfop-protocol';
import { solveCfop } from './cfop';

const send = (response: CfopResponse): void => postMessage(response);

addEventListener('message', ({ data }: MessageEvent<CfopRequest>) => {
  try {
    const solution = solveCfop(data.facelets);
    send({ type: 'solution', stages: solution.stages!.map(s => ({ id: s.id, moves: s.moves })) });
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
});
