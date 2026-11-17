import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../../../core/cube/cube-moves';
import { solvedCube } from '../../../core/cube/cube-validator';
import { CubeSolver } from '../../../core/solver/cube-solver';
import { CubeState } from '../../../core/state/cube-state';
import { PlaybackState } from '../../../core/state/playback-state';
import { SessionState } from '../../../core/state/session-state';
import { stagedSolution } from '../../../core/solver/solution';
import { FakeSolver, flush } from '../../../testing/fake-solver';
import { InformationComponent } from './information.component';

describe('InformationComponent', () => {
  let fixture: ComponentFixture<InformationComponent>;
  let cube: CubeState;
  let session: SessionState;
  let playback: PlaybackState;
  let solver: FakeSolver;
  let root: HTMLElement;

  const q = (selector: string) => root.querySelector<HTMLElement>(selector);
  const all = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)];
  const button = (text: string) => all('button').find(b => b.textContent!.includes(text)) as HTMLButtonElement | undefined;
  const text = (selector: string) => q(selector)?.textContent!.replace(/\s+/g, ' ').trim();
  const methods = () => all('.method button') as HTMLButtonElement[];
  /** Which method buttons are the chosen one (a radio says so with aria-checked). */
  const checked = () => methods().map(m => m.getAttribute('aria-checked') === 'true');
  const settle = () => fixture.whenStable();

  /** Scramble R U, so the solution is U' R'. */
  const scrambled = applyMoves(solvedCube(), parseAlgorithm('R U'));

  beforeEach(async () => {
    solver = new FakeSolver();
    TestBed.configureTestingModule({ providers: [{ provide: CubeSolver, useValue: solver }] });
    cube = TestBed.inject(CubeState);
    session = TestBed.inject(SessionState);
    playback = TestBed.inject(PlaybackState);
    fixture = TestBed.createComponent(InformationComponent);
    root = fixture.nativeElement;
    await settle();
  });

  describe('while editing', () => {
    it('shows the net, the palette, Reset, the count and the problems list', () => {
      expect(q('app-net-2d')).not.toBeNull();
      expect(q('app-palette')).not.toBeNull();
      expect(button('Reset')).toBeDefined();
      expect(text('.count')).toBe('6 / 54 filled');
      expect(text('.ok')).toBe('No problems found.');
    });

    it('has no footer: Start only belongs to the saved cube', () => {
      expect(q('.footer')).toBeNull();
      expect(button('Start')).toBeUndefined();
    });

    it('Reset empties the cube', async () => {
      cube.setActiveColor('F');
      cube.clickSticker(0);
      await settle();
      expect(text('.count')).toBe('7 / 54 filled');

      button('Reset')!.click();
      await settle();
      expect(text('.count')).toBe('6 / 54 filled');
    });

    it('lists problems in color names, never face letters', async () => {
      // The URF corner is finished (yellow, orange, green); give the UFL corner the same colors.
      cube.facelets.update(f => {
        const next = [...f];
        [next[8], next[9], next[20]] = ['U', 'R', 'F'];
        [next[6], next[18], next[38]] = ['U', 'R', 'F'];
        return next;
      });
      await settle();
      const problems = all('.errors li').map(li => li.textContent!.trim());
      expect(problems).toEqual(['The yellow-orange-green corner appears more than once']);
    });

    it('a repeated color on a piece says so', async () => {
      cube.setActiveColor('U');
      cube.clickSticker(8);
      cube.clickSticker(9);
      await settle();
      expect(all('.errors li').map(li => li.textContent!.trim())).toEqual(['This corner has a repeated color']);
      expect(q('.ok')).toBeNull();
    });
  });

  describe('once saved', () => {
    beforeEach(async () => {
      cube.facelets.set(scrambled);
      session.save();
      await settle();
    });

    it('swaps the editing tools for the solution choices', () => {
      expect(text('.solution-title')).toBe('Solution');
      expect(q('app-net-2d')).toBeNull();
      expect(q('app-palette')).toBeNull();
      expect(methods().map(m => m.textContent!.trim())).toEqual(['Kociemba', 'CFOP', 'LBL']);
    });

    it('keeps Start at the bottom, switched off until a method is picked', async () => {
      const footer = q('.footer')!;
      expect(footer.contains(button('Start')!)).toBe(true);
      expect(button('Start')!.disabled).toBe(true);

      methods()[0].click();
      await settle();
      expect(button('Start')!.disabled).toBe(false);
    });

    it('marks the chosen method, and a different choice replaces it', async () => {
      methods()[0].click();
      await settle();
      expect(checked()).toEqual([true, false, false]);
      expect(methods()[0].getAttribute('aria-checked')).toBe('true');

      methods()[2].click();
      await settle();
      expect(checked()).toEqual([false, false, true]);
    });

    it('shows nothing about steps yet', () => {
      expect(q('.total')).toBeNull();
      expect(q('.steps')).toBeNull();
    });
  });

  describe('while solving', () => {
    beforeEach(async () => {
      cube.facelets.set(scrambled);
      session.save();
      session.selectMethod('kociemba');
      void session.start();
      await settle();
    });

    it('locks the methods but keeps the chosen one highlighted', () => {
      expect(methods().every(m => m.disabled)).toBe(true);
      expect(checked()).toEqual([true, false, false]);
    });

    it('removes Start and has no Back or Next yet', () => {
      expect(button('Start')).toBeUndefined();
      expect(button('Back')).toBeUndefined();
      expect(button('Next')).toBeUndefined();
    });
  });

  describe('with a solution', () => {
    beforeEach(async () => {
      cube.facelets.set(scrambled);
      session.save();
      session.selectMethod('kociemba');
      const run = session.start();
      solver.finish(["U'", "R'"]);
      await run;
      await settle();
    });

    it('shows the total and the steps in standard notation', () => {
      expect(text('.total')).toBe('Total steps: 2');
      expect(all('.chip').map(c => c.textContent!.trim())).toEqual(["U'", "R'"]);
    });

    it('replaces Start with Back and Next, in the same footer', () => {
      expect(button('Start')).toBeUndefined();
      const footer = q('.footer')!;
      expect(footer.contains(button('Back')!)).toBe(true);
      expect(footer.contains(button('Next')!)).toBe(true);
    });

    it('starts at the beginning: Back is off, Next is on, no step is highlighted', () => {
      expect(button('Back')!.disabled).toBe(true);
      expect(button('Next')!.disabled).toBe(false);
      expect(q('.chip.current')).toBeNull();
    });

    it('Next advances and highlights the move being played, and the buttons do not flicker while it is drawn', async () => {
      button('Next')!.click();
      await settle();
      expect(playback.step()).toBe(1);
      expect(text('.chip.current')).toBe("U'");
      expect(playback.busy()).toBe(true); // the 3D view is still drawing the move...
      expect(button('Next')!.disabled).toBe(false); // ...but Back and Next stay available
      expect(button('Back')!.disabled).toBe(false);

      playback.markShown(1); // the 3D view finished the move
      await settle();
      expect(button('Next')!.disabled).toBe(false);
      expect(button('Back')!.disabled).toBe(false);
    });

    it('a second click while the first move is still being drawn is queued, not lost', async () => {
      button('Next')!.click();
      button('Next')!.click();
      await settle();
      expect(playback.step()).toBe(2);
      expect(button('Next')!.disabled).toBe(true); // at the end of this two-move solution
    });

    it('marks the steps already played as done', async () => {
      playback.seek(2);
      playback.markShown(2);
      await settle();
      expect(all('.chip').map(c => c.classList.contains('done'))).toEqual([true, true]);
      expect(text('.chip.current')).toBe("R'");
      expect(button('Next')!.disabled).toBe(true); // the end
    });

    it('Back steps back', async () => {
      playback.seek(2);
      playback.markShown(2);
      await settle();
      button('Back')!.click();
      await settle();
      expect(playback.step()).toBe(1);
    });
  });

  it('says so when the cube was already solved', async () => {
    cube.facelets.set(solvedCube());
    session.save();
    session.selectMethod('kociemba');
    const run = session.start();
    solver.finish([]);
    await run;
    await flush();
    await settle();
    expect(text('.total')).toBe('The cube is already solved: 0 steps.');
    expect(q('.steps')).toBeNull();
    expect(button('Next')!.disabled).toBe(true);
    expect(button('Back')!.disabled).toBe(true);
  });

  describe('with a solution in stages', () => {
    /** Cross: U'; F2L: skipped; OLL: R'; PLL: skipped. */
    beforeEach(async () => {
      cube.facelets.set(scrambled);
      session.save();
      session.selectMethod('cfop');
      const run = session.start();
      solver.finish(stagedSolution([
        { id: 'cross', moves: ["U'"] },
        { id: 'f2l', moves: [] },
        { id: 'oll', moves: ["R'"] },
        { id: 'pll', moves: [] },
      ]));
      await run;
      await settle();
    });

    const sections = () => all('.stage');
    const title = (section: HTMLElement) => section.querySelector('.stage-name')!.textContent!.trim();
    const count = (section: HTMLElement) => section.querySelector('.stage-count')!.textContent!.trim();

    it('shows four sections in the order Cross, F2L, OLL, PLL, each with its count', () => {
      expect(sections().map(title)).toEqual(['Cross', 'F2L', 'OLL', 'PLL']);
      expect(sections().map(count)).toEqual(['1 move', 'skipped', '1 move', 'skipped']);
    });

    it('lists the moves of each stage under its title, and nothing for a skipped stage', () => {
      expect(sections().map(s => [...s.querySelectorAll('.chip')].map(c => c.textContent!.trim()))).toEqual([
        ["U'"], [], ["R'"], [],
      ]);
      expect(sections()[1].querySelector('.steps')).toBeNull();
    });

    it('still shows the total for the whole solution', () => {
      expect(text('.total')).toBe('Total steps: 2');
    });

    it('highlights the section of the move being played and numbers the moves across sections', async () => {
      expect(sections().some(s => s.classList.contains('active'))).toBe(false);

      playback.seek(1);
      playback.markShown(1);
      await settle();
      expect(sections().map(s => s.classList.contains('active'))).toEqual([true, false, false, false]);
      expect(text('.chip.current')).toBe("U'");

      playback.seek(2); // the second move is the first move of OLL, because F2L was skipped
      playback.markShown(2);
      await settle();
      expect(sections().map(s => s.classList.contains('active'))).toEqual([false, false, true, false]);
      expect(text('.chip.current')).toBe("R'");
      expect(sections()[0].querySelector('.chip')!.classList).toContain('done');
    });

    it('gives each stage its own color', () => {
      const color = (section: HTMLElement) => section.style.getPropertyValue('--stage');
      const colors = sections().map(color);
      expect(colors.every(c => c !== '')).toBe(true);
      expect(new Set(colors).size).toBe(4);
    });
  });

  it('a method without stages keeps one plain list with no section titles', async () => {
    cube.facelets.set(scrambled);
    session.save();
    session.selectMethod('kociemba');
    const run = session.start();
    solver.finish(["U'", "R'"]);
    await run;
    await settle();
    expect(all('.stage').length).toBe(1);
    expect(q('.stage-title')).toBeNull();
    expect(all('.chip').map(c => c.textContent!.trim())).toEqual(["U'", "R'"]);
  });
});
