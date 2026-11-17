import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CubeState } from '../../../core/state/cube-state';
import { PaletteComponent } from './palette.component';

describe('PaletteComponent', () => {
  let fixture: ComponentFixture<PaletteComponent>;
  let state: CubeState;
  let root: HTMLElement;

  const swatches = () => [...root.querySelectorAll<HTMLButtonElement>('.swatch')];
  const names = () => swatches().map(s => s.getAttribute('aria-label'));
  const unavailable = () => swatches().filter(s => s.classList.contains('unavailable')).map(s => s.getAttribute('aria-label'));
  const hint = () => root.querySelector('.hint')!.textContent!.replace(/\s+/g, ' ').trim();
  const settle = () => fixture.whenStable();

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(CubeState);
    fixture = TestBed.createComponent(PaletteComponent);
    root = fixture.nativeElement;
    await settle();
  });

  it('offers the six colors, in the order of the camera buttons', () => {
    expect(names()).toEqual(['Yellow', 'White', 'Green', 'Blue', 'Red', 'Orange']);
  });

  it('starts with no color picked and explains how to paint', () => {
    expect(swatches().some(s => s.getAttribute('aria-checked') === 'true')).toBe(false);
    expect(hint()).toBe('Pick a color, then click stickers to paint them.');
  });

  it('picking a swatch sets the active color and marks it', async () => {
    swatches()[2].click(); // Green
    await settle();
    expect(state.activeColor()).toBe('F');
    expect(swatches()[2].getAttribute('aria-checked')).toBe('true');
    expect(swatches()[2].classList).toContain('active');
    expect(swatches()[0].classList).not.toContain('active');
  });

  it('greys out the colors that do not fit the sticker being pointed at, and says so', async () => {
    state.setActiveColor('U');
    state.clickSticker(8); // paint the URF corner's top sticker yellow
    state.setHovered(9); // the right-hand sticker of the same corner cannot be yellow or white
    await settle();
    expect(unavailable()).toEqual(['Yellow', 'White']);
    expect(hint()).toContain("don't fit the sticker you're pointing at");
  });

  it('a greyed color can still be picked: it is only a hint', async () => {
    state.clickSticker(8);
    state.setActiveColor('U');
    state.clickSticker(8);
    state.setHovered(9);
    await settle();
    swatches()[0].click(); // Yellow, greyed
    await settle();
    expect(state.activeColor()).toBe('U');
  });

  it('stops greying as soon as the pointer leaves, even though a sticker was just painted', async () => {
    state.setActiveColor('U');
    state.clickSticker(8);
    state.setHovered(9);
    await settle();
    expect(unavailable().length).toBeGreaterThan(0);

    state.setHovered(null);
    await settle();
    expect(unavailable()).toEqual([]);
    expect(hint()).toBe('Pick a color, then click stickers to paint them.');
  });

  it('explains greying for a selected empty sticker when nothing is hovered', async () => {
    state.setActiveColor('U');
    state.clickSticker(8);
    state.setActiveColor(null);
    state.clickSticker(9); // selected, still empty
    await settle();
    expect(hint()).toContain('selected empty sticker');
    expect(unavailable()).toEqual(['Yellow', 'White']);
  });
});
