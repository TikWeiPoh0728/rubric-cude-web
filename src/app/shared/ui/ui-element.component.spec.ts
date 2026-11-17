import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UI_COLORS, colorVars } from './ui-colors';
import { UI_ICON_NAMES, UI_ICONS } from './ui-icons';
import { UiElementComponent } from './ui-element.component';

describe('UiElementComponent', () => {
  let fixture: ComponentFixture<UiElementComponent>;
  let host: HTMLElement;

  const button = () => host.querySelector<HTMLButtonElement>('button');
  const inner = () => host.querySelector<HTMLElement>('.ui')!;
  const text = () => host.querySelector('.text')?.textContent?.trim();
  const svg = () => host.querySelector('svg');
  const set = async (inputs: Record<string, unknown>) => {
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(UiElementComponent);
    host = fixture.nativeElement;
    await set({ label: 'Play' });
  });

  describe('as a button', () => {
    it('is a real button that does not submit forms, with the label as its text', () => {
      expect(button()).not.toBeNull();
      expect(button()!.type).toBe('button');
      expect(text()).toBe('Play');
    });

    it('follows the label when it changes', async () => {
      await set({ label: 'Stop' });
      expect(text()).toBe('Stop');
      expect(button()!.textContent!.trim()).toBe('Stop');
    });

    it('can be disabled, and a disabled button sends no clicks', async () => {
      let clicks = 0;
      host.addEventListener('click', () => clicks++);
      button()!.click();
      expect(clicks).toBe(1);

      await set({ disabled: true });
      expect(button()!.disabled).toBe(true);
      button()!.click();
      expect(clicks).toBe(1);
    });

    it('a click reaches whoever listens on the element itself', () => {
      let clicked = false;
      host.addEventListener('click', () => (clicked = true));
      button()!.click();
      expect(clicked).toBe(true);
    });

    it('shows a hint on hover when given one', async () => {
      expect(button()!.hasAttribute('title')).toBe(false);
      await set({ tooltip: 'Plays the solution' });
      expect(button()!.title).toBe('Plays the solution');
    });
  });

  describe('as a label', () => {
    beforeEach(() => set({ kind: 'label', label: 'F2L' }));

    it('is plain text in a span: no button, nothing to focus', () => {
      expect(button()).toBeNull();
      expect(inner().tagName).toBe('SPAN');
      expect(text()).toBe('F2L');
    });

    it('follows the label when it changes', async () => {
      await set({ label: 'OLL' });
      expect(text()).toBe('OLL');
    });
  });

  describe('color', () => {
    const vars = () => ({
      main: host.style.getPropertyValue('--ui-main'),
      dark: host.style.getPropertyValue('--ui-dark'),
      soft: host.style.getPropertyValue('--ui-soft'),
      softText: host.style.getPropertyValue('--ui-soft-text'),
      border: host.style.getPropertyValue('--ui-border'),
    });

    it('is navy by default, drawn from the shared palette', () => {
      expect(vars()).toEqual(UI_COLORS.navy);
    });

    it('changes with the color input, all five parts together', async () => {
      await set({ color: 'green' });
      expect(vars()).toEqual(UI_COLORS.green);
      await set({ color: 'red' });
      expect(vars()).toEqual(UI_COLORS.red);
    });

    it('every color has all five parts', () => {
      for (const color of Object.keys(UI_COLORS) as (keyof typeof UI_COLORS)[]) {
        expect(Object.keys(colorVars(color)).sort(), color).toEqual(['--ui-border', '--ui-dark', '--ui-main', '--ui-soft', '--ui-soft-text']);
        for (const part of Object.values(UI_COLORS[color])) expect(part).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });

  describe('variant, size and shape', () => {
    it('are solid, md and rounded by default', () => {
      expect(inner().classList).toContain('ui--solid');
      expect(inner().classList).toContain('ui--md');
      expect(inner().classList).toContain('ui--rounded');
    });

    it('follow their inputs', async () => {
      await set({ variant: 'outline', size: 'sm', shape: 'pill' });
      expect(inner().classList).toContain('ui--outline');
      expect(inner().classList).toContain('ui--sm');
      expect(inner().classList).toContain('ui--pill');
      expect(inner().classList).not.toContain('ui--solid');
    });

    it('a selected element is drawn solid, whatever its variant', async () => {
      await set({ variant: 'outline', selected: false });
      expect(inner().classList).toContain('ui--outline');
      await set({ selected: true });
      expect(inner().classList).toContain('ui--solid');
      expect(inner().classList).not.toContain('ui--outline');
    });

    it('block fills the width of the parent', async () => {
      expect(host.classList).not.toContain('block');
      await set({ block: true });
      expect(host.classList).toContain('block');
    });
  });

  describe('selected, for choices and toggles', () => {
    it('an ordinary button carries no pressed or checked state', () => {
      expect(button()!.hasAttribute('aria-pressed')).toBe(false);
      expect(button()!.hasAttribute('aria-checked')).toBe(false);
    });

    it('a toggle says whether it is pressed', async () => {
      await set({ selected: false });
      expect(button()!.getAttribute('aria-pressed')).toBe('false');
      await set({ selected: true });
      expect(button()!.getAttribute('aria-pressed')).toBe('true');
    });

    it('one of a group of choices says whether it is checked, and has the role of a radio', async () => {
      await set({ ariaRole: 'radio', selected: false });
      expect(button()!.getAttribute('role')).toBe('radio');
      expect(button()!.getAttribute('aria-checked')).toBe('false');
      expect(button()!.hasAttribute('aria-pressed')).toBe(false);
      await set({ selected: true });
      expect(button()!.getAttribute('aria-checked')).toBe('true');
    });

    it('never puts a role on the host element itself', async () => {
      await set({ ariaRole: 'radio' });
      expect(host.hasAttribute('role')).toBe(false);
    });
  });

  describe('icons', () => {
    it('shows no icon unless asked', () => {
      expect(svg()).toBeNull();
    });

    it('draws the icon before the text by default', async () => {
      await set({ icon: 'play' });
      expect(svg()).not.toBeNull();
      const order = [...inner().children].map(c => c.tagName.toLowerCase());
      expect(order).toEqual(['svg', 'span']);
    });

    it('can draw the icon after the text', async () => {
      await set({ icon: 'next', iconPosition: 'end' });
      expect([...inner().children].map(c => c.tagName.toLowerCase())).toEqual(['span', 'svg']);
    });

    it('is hidden from assistive technology (the label already says it)', async () => {
      await set({ icon: 'play' });
      expect(svg()!.getAttribute('aria-hidden')).toBe('true');
    });

    it('every icon draws its paths, as a solid shape or a line', async () => {
      for (const name of UI_ICON_NAMES) {
        await set({ icon: name });
        const paths = [...host.querySelectorAll('svg path')].map(p => p.getAttribute('d'));
        expect(paths, name).toEqual([...UI_ICONS[name].paths]);
        expect(svg()!.classList.contains('icon--fill'), name).toBe(UI_ICONS[name].style === 'fill');
      }
    });
  });

  describe('as an icon button', () => {
    beforeEach(() => set({ icon: 'play', iconOnly: true, label: 'Play' }));

    it('shows only the icon, no text', () => {
      expect(svg()).not.toBeNull();
      expect(host.querySelector('.text')).toBeNull();
      expect(inner().classList).toContain('ui--icon-only');
    });

    it('still has a name for assistive technology: the label', () => {
      expect(button()!.getAttribute('aria-label')).toBe('Play');
    });

    it('the name follows the label, as Play becomes Stop', async () => {
      await set({ label: 'Stop', icon: 'stop' });
      expect(button()!.getAttribute('aria-label')).toBe('Stop');
    });

    it('an explicit accessible name wins', async () => {
      await set({ ariaLabel: 'Play the solution' });
      expect(button()!.getAttribute('aria-label')).toBe('Play the solution');
    });

    it('turning iconOnly off brings the text back and drops the extra name', async () => {
      await set({ iconOnly: false });
      expect(text()).toBe('Play');
      expect(button()!.hasAttribute('aria-label')).toBe(false);
    });
  });

  it('an element with visible text has no aria-label unless one is given', () => {
    expect(button()!.hasAttribute('aria-label')).toBe(false);
  });
});
