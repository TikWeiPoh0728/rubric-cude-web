/// <reference lib="webworker" />
import { improveKociemba, solveQuick } from './kociemba';
import type { SolveRequest, SolveResponse } from './kociemba-protocol';

const send = (response: SolveResponse): void => postMessage(response);

addEventListener('message', ({ data }: MessageEvent<SolveRequest>) => {
  try {
    const quick = solveQuick(data.facelets);
    send({ type: 'solution', moves: quick });
    if (quick.length > 0) {
      // Runs until it finds nothing shorter, or until the pool terminates this worker.
      improveKociemba(data.facelets, data.variant, quick, moves => send({ type: 'solution', moves }));
    }
    send({ type: 'done' });
  } catch (e) {
    send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
});
