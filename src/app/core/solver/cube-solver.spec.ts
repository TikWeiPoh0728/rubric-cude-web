import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CfopRequest, CfopResponse } from './cfop/cfop-protocol';
import { CfopWorker, SolverWorker, WorkerCubeSolver } from './cube-solver';
import { SolveRequest, SolveResponse, VARIANTS } from './kociemba-protocol';

class FakeWorker implements SolverWorker {
  request: SolveRequest | null = null;
  terminated = false;
  private onResponse!: (r: SolveResponse) => void;
  private onFailure!: (m: string) => void;

  postMessage(request: SolveRequest) { this.request = request; }
  terminate() { this.terminated = true; }
  listen(onResponse: (r: SolveResponse) => void, onFailure: (m: string) => void) {
    this.onResponse = onResponse;
    this.onFailure = onFailure;
  }
  reply(response: SolveResponse) { this.onResponse(response); }
  crash(message: string) { this.onFailure(message); }
}

class FakeCfopWorker implements CfopWorker {
  request: CfopRequest | null = null;
  terminated = false;
  private onResponse!: (r: CfopResponse) => void;
  private onFailure!: (m: string) => void;

  postMessage(request: CfopRequest) { this.request = request; }
  terminate() { this.terminated = true; }
  listen(onResponse: (r: CfopResponse) => void, onFailure: (m: string) => void) {
    this.onResponse = onResponse;
    this.onFailure = onFailure;
  }
  reply(response: CfopResponse) { this.onResponse(response); }
  crash(message: string) { this.onFailure(message); }
}

const moves = (n: number): string[] => Array.from({ length: n }, () => 'U');
const FACELETS = 'x'.repeat(54);

describe('WorkerCubeSolver', () => {
  let workers: FakeWorker[];
  let cfopWorkers: FakeCfopWorker[];
  let solver: WorkerCubeSolver;

  beforeEach(() => {
    vi.useFakeTimers();
    workers = [];
    cfopWorkers = [];
    solver = new WorkerCubeSolver({
      createCfopWorker: () => {
        const w = new FakeCfopWorker();
        cfopWorkers.push(w);
        return w;
      },
      size: 3,
      improveMs: 2000,
      goodEnough: 17,
      createWorker: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w;
      },
    });
  });

  afterEach(() => vi.useRealTimers());

  it('LBL is not available yet, and no worker is started for it', async () => {
    await expect(solver.solve('lbl', FACELETS)).rejects.toThrow('LBL is not available yet');
    expect(workers.length).toBe(0);
    expect(cfopWorkers.length).toBe(0);
  });

  describe('CFOP', () => {
    const answer: CfopResponse = {
      type: 'solution',
      stages: [
        { id: 'cross', moves: ['D', 'R'] },
        { id: 'f2l', moves: ['U', "R'"] },
        { id: 'oll', moves: [] },
        { id: 'pll', moves: ['U2'] },
      ],
    };

    it('uses one CFOP worker of its own, not the Kociemba workers, and sends it the cube', () => {
      void solver.solve('cfop', FACELETS);
      expect(cfopWorkers).toHaveLength(1);
      expect(cfopWorkers[0].request).toEqual({ facelets: FACELETS });
      expect(workers).toHaveLength(0);
    });

    it('answers with the stages, and the flat list of moves is the stages joined', async () => {
      const result = solver.solve('cfop', FACELETS);
      cfopWorkers[0].reply(answer);
      const solution = await result;
      expect(solution.stages!.map(s => [s.id, s.label, s.moves.length])).toEqual([
        ['cross', 'Cross', 2], ['f2l', 'F2L', 2], ['oll', 'OLL', 0], ['pll', 'PLL', 1],
      ]);
      expect(solution.moves).toEqual(['D', 'R', 'U', "R'", 'U2']);
    });

    it('stops the worker as soon as it has answered', async () => {
      const result = solver.solve('cfop', FACELETS);
      cfopWorkers[0].reply(answer);
      await result;
      expect(cfopWorkers[0].terminated).toBe(true);
    });

    it('fails with the message the worker sends, for example for a cube that cannot exist', async () => {
      const result = solver.solve('cfop', FACELETS);
      const failed = expect(result).rejects.toThrow('This cube cannot be solved (CORNER_TWIST)');
      cfopWorkers[0].reply({ type: 'error', message: 'This cube cannot be solved (CORNER_TWIST)' });
      await failed;
      expect(cfopWorkers[0].terminated).toBe(true);
    });

    it('fails, and cleans up, if the worker itself crashes', async () => {
      const result = solver.solve('cfop', FACELETS);
      const failed = expect(result).rejects.toThrow('worker died');
      cfopWorkers[0].crash('worker died');
      await failed;
      expect(cfopWorkers[0].terminated).toBe(true);
    });
  });

  it('starts one worker per variant, all on the same cube', () => {
    void solver.solve('kociemba', FACELETS);
    expect(workers.length).toBe(3);
    expect(workers.map(w => w.request!.variant)).toEqual(VARIANTS.slice(0, 3));
    workers.forEach(w => expect(w.request!.facelets).toBe(FACELETS));
  });

  it('keeps listening for improvements for the window after the first solution, then takes the shortest', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[0].reply({ type: 'solution', moves: moves(21) });

    await vi.advanceTimersByTimeAsync(1000);
    workers[1].reply({ type: 'solution', moves: moves(19) });
    workers[2].reply({ type: 'solution', moves: moves(20) }); // worse than 19: ignored
    workers[0].reply({ type: 'solution', moves: moves(20) });

    await vi.advanceTimersByTimeAsync(999); // 1999 ms after the first solution: still open
    workers[2].reply({ type: 'solution', moves: moves(18) });

    await vi.advanceTimersByTimeAsync(1); // window over
    expect((await result).moves.length).toBe(18);
    workers.forEach(w => expect(w.terminated).toBe(true));
  });

  it('counts the window from the first solution, not from the start', async () => {
    const result = solver.solve('kociemba', FACELETS);
    await vi.advanceTimersByTimeAsync(10_000); // tables are still being built; nothing is cut off
    expect(workers.some(w => w.terminated)).toBe(false);

    workers[0].reply({ type: 'solution', moves: moves(21) });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await result).moves.length).toBe(21);
  });

  it('stops at once for a solution that is short enough', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[1].reply({ type: 'solution', moves: moves(17) });
    expect((await result).moves.length).toBe(17);
    workers.forEach(w => expect(w.terminated).toBe(true));
  });

  it('answers an already solved cube immediately', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[0].reply({ type: 'solution', moves: [] });
    expect((await result).moves).toEqual([]);
  });

  it('stops early when every worker has nothing more to try', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[0].reply({ type: 'solution', moves: moves(19) });
    workers.forEach(w => w.reply({ type: 'done' }));
    expect((await result).moves.length).toBe(19); // no need to wait for the window
  });

  it('survives some workers failing as long as one found a solution', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[0].crash('boom');
    workers[1].reply({ type: 'error', message: 'oops' });
    workers[2].reply({ type: 'solution', moves: moves(20) });
    await vi.advanceTimersByTimeAsync(2000);
    expect((await result).moves.length).toBe(20);
  });

  it('fails with the last error when every worker fails', async () => {
    const result = solver.solve('kociemba', FACELETS);
    const failed = expect(result).rejects.toThrow('worker died');
    workers[0].reply({ type: 'error', message: 'oops' });
    workers[1].reply({ type: 'error', message: 'oops again' });
    workers[2].crash('worker died');
    await failed;
    workers.forEach(w => expect(w.terminated).toBe(true));
  });

  it('ignores messages that arrive after it has finished', async () => {
    const result = solver.solve('kociemba', FACELETS);
    workers[0].reply({ type: 'solution', moves: moves(17) });
    await result;
    expect(() => workers[1].reply({ type: 'solution', moves: moves(15) })).not.toThrow();
    expect(() => workers[2].crash('late')).not.toThrow();
  });
});
