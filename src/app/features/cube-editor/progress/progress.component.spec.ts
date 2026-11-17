import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { applyMoves, parseAlgorithm } from '../../../core/cube/cube-moves';
import { solvedCube } from '../../../core/cube/cube-validator';
import { PlaybackState } from '../../../core/state/playback-state';
import { ProgressComponent } from './progress.component';
import { plainSolution, stagedSolution } from '../../../core/solver/solution';

describe('ProgressComponent', () => {
  let fixture: ComponentFixture<ProgressComponent>;
  let playback: PlaybackState;
  let root: HTMLElement;

  const slider = () => root.querySelector<HTMLInputElement>('input[type=range]')!;
  const label = () => root.querySelector('.value')!.textContent!.trim();
  const ticks = () => [...root.querySelectorAll('.tick')];
  const settle = () => fixture.whenStable();
  const drag = async (to: number) => {
    slider().value = String(to);
    slider().dispatchEvent(new Event('input'));
    await settle();
  };

  /** A 5-move solution, so the scale runs 0..5. */
  const load = async (moves: string[]) => {
    const scrambled = applyMoves(solvedCube(), parseAlgorithm("R U F' D L2"));
    playback.load(scrambled, plainSolution(moves));
    await settle();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    playback = TestBed.inject(PlaybackState);
    fixture = TestBed.createComponent(ProgressComponent);
    root = fixture.nativeElement;
    await load(['L2', 'F', 'D', "U'", "R'"]);
  });

  it('shows where you are out of how many', () => {
    expect(label()).toBe('Step 0 / 5');
  });

  it('runs the scale from 0 to the number of steps', () => {
    expect(slider().min).toBe('0');
    expect(slider().max).toBe('5');
    expect(slider().value).toBe('0');
  });

  it('draws one tick per step, including both ends', () => {
    expect(ticks().length).toBe(6);
  });

  it('dragging the slider jumps to that step', async () => {
    await drag(3);
    expect(playback.step()).toBe(3);
    expect(label()).toBe('Step 3 / 5');
  });

  it('follows the step when it changes elsewhere, for example with Next', async () => {
    playback.next();
    await settle();
    expect(slider().value).toBe('1');
    expect(label()).toBe('Step 1 / 5');
  });

  it('can be dragged while a move is still playing', async () => {
    playback.next(); // busy: step 1, shown 0
    await drag(4);
    expect(playback.step()).toBe(4);
  });

  it('is switched off when there is nothing to step through', async () => {
    await load([]);
    expect(slider().disabled).toBe(true);
    expect(label()).toBe('Step 0 / 0');
  });

  it('adapts when a different solution is loaded', async () => {
    await load(["R'", 'U']);
    expect(slider().max).toBe('2');
    expect(ticks().length).toBe(3);
  });

  describe('for a solution in stages', () => {
    const bands = () => [...root.querySelectorAll<HTMLElement>('.band')];
    const stageNow = () => root.querySelector('.stage-now')?.textContent?.trim();

    beforeEach(async () => {
      const scrambled = applyMoves(solvedCube(), parseAlgorithm("R U F' D L2"));
      playback.load(scrambled, stagedSolution([
        { id: 'cross', moves: ['L2', 'F'] },
        { id: 'f2l', moves: [] },
        { id: 'oll', moves: ['D', "U'", "R'"] },
        { id: 'pll', moves: [] },
      ]));
      await settle();
    });

    it('shows how long each stage is, in order, and hides a skipped one', () => {
      expect(bands().map(b => b.textContent!.trim())).toEqual(['Cross', 'F2L', 'OLL', 'PLL']);
      expect(bands().map(b => b.classList.contains('skipped'))).toEqual([false, true, false, true]);
    });

    it('makes each band as wide as its stage is long', () => {
      expect(bands().map(b => b.style.flexGrow)).toEqual(['2', '0', '3', '0']);
    });

    it('names the current stage next to the step count, and nothing at the start', async () => {
      expect(stageNow()).toBeUndefined();
      expect(label()).toBe('Step 0 / 5');

      await drag(1);
      expect(stageNow()).toBe('Cross');
      expect(label()).toBe('Step 1 / 5'); // the step count keeps its own wording

      await drag(4);
      expect(stageNow()).toBe('OLL');
    });

    it('highlights the band of the current stage', async () => {
      await drag(3);
      expect(bands().map(b => b.classList.contains('active'))).toEqual([false, false, true, false]);
    });

    it('makes the ticks taller where a stage begins', () => {
      // stages begin at steps 0 (Cross), 2 (F2L, skipped, and OLL); ticks 0 and 5 are always tall
      const major = ticks().map((t, i) => (t.classList.contains('major') ? i : -1)).filter(i => i >= 0);
      expect(major).toEqual([0, 2, 5]);
    });
  });

  it('without stages there are no bands and no stage name', async () => {
    await drag(2);
    expect(root.querySelector('.bands')).toBeNull();
    expect(root.querySelector('.stage-now')).toBeNull();
  });

  describe('Play / Stop', () => {
    const play = () => root.querySelector<HTMLButtonElement>('.play button')!;
    const label = () => play().textContent!.trim();
    const iconPath = () => play().querySelector('svg path')!.getAttribute('d');

    it('is a labelled button that says Play when nothing is playing', () => {
      expect(play()).not.toBeNull();
      expect(label()).toBe('Play');
      expect(play().disabled).toBe(false);
    });

    it('starts playing when pressed, and then says Stop', async () => {
      play().click();
      await settle();
      expect(playback.playing()).toBe(true);
      expect(label()).toBe('Stop');
    });

    it('stops playing when pressed again, and says Play again', async () => {
      play().click();
      await settle();
      play().click();
      await settle();
      expect(playback.playing()).toBe(false);
      expect(label()).toBe('Play');
    });

    it('changes its icon and color with its label', async () => {
      const playIcon = iconPath();
      const host = root.querySelector<HTMLElement>('.play')!;
      const playColor = host.style.getPropertyValue('--ui-main');

      play().click();
      await settle();
      expect(iconPath()).not.toBe(playIcon);
      expect(host.style.getPropertyValue('--ui-main')).not.toBe(playColor);
    });

    it('stops playing, and says Play, when the slider is dragged', async () => {
      play().click();
      await settle();
      await drag(3);
      expect(playback.playing()).toBe(false);
      expect(label()).toBe('Play');
    });

    it('is switched off when there is nothing to play', async () => {
      await load([]);
      expect(play().disabled).toBe(true);
      play().click();
      await settle();
      expect(playback.playing()).toBe(false);
    });
  });
});
