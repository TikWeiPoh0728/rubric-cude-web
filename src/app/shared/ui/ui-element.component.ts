import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { UiColor, colorVars } from './ui-colors';
import { UI_ICONS, UiIconName } from './ui-icons';

export type UiKind = 'button' | 'label';
export type UiVariant = 'solid' | 'soft' | 'outline';
export type UiSize = 'xs' | 'sm' | 'md' | 'lg';
export type UiShape = 'rounded' | 'pill';

/**
 * The one general UI element of the app: a button or a label, in any color, with a value
 * (the text) that can change, and the same font everywhere. Give it `iconOnly` and it
 * becomes an icon button.
 *
 *   <app-ui-element label="Play" icon="play" color="green" (click)="play()" />
 *   <app-ui-element kind="label" label="F2L" color="green" variant="soft" size="xs" />
 *   <app-ui-element label="Stop" icon="stop" [iconOnly]="true" />        icon button, "Stop" is its name
 *
 * A button is a real <button>, so it is focusable and works with the keyboard; use a normal
 * (click) on <app-ui-element>. A label is plain text in a <span>.
 */
@Component({
  selector: 'app-ui-element',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  templateUrl: './ui-element.component.html',
  styleUrl: './ui-element.component.scss',
  host: {
    '[style]': 'vars()',
    '[class.block]': 'block()',
  },
})
export class UiElementComponent {
  /** A clickable button, or a plain label. */
  readonly kind = input<UiKind>('button');

  /** The text. Change it and the element follows (Play becomes Stop). */
  readonly label = input('');

  readonly icon = input<UiIconName | null>(null);
  readonly iconPosition = input<'start' | 'end'>('start');

  /** Show only the icon. The label is then the accessible name, so it must still be set. */
  readonly iconOnly = input(false);

  readonly color = input<UiColor>('navy');
  readonly variant = input<UiVariant>('solid');
  readonly size = input<UiSize>('md');
  readonly shape = input<UiShape>('rounded');

  /**
   * For a choice among several (a radio) or a toggle: whether this one is picked. A picked
   * element is drawn solid. Leave it null for an ordinary button.
   */
  readonly selected = input<boolean | null>(null);

  readonly disabled = input(false);

  /** Fill the width of the parent. */
  readonly block = input(false);

  /** Set to 'radio' for one of a group of choices (named so it never lands on the host element as a role). */
  readonly ariaRole = input<string | null>(null);

  /** The accessible name, when it should differ from the visible text. */
  readonly ariaLabel = input<string | null>(null);

  /** A hint shown on hover. */
  readonly tooltip = input<string | null>(null);

  protected readonly vars = computed(() => colorVars(this.color()));

  /** A picked element is always solid, whatever variant it was given. */
  private readonly drawnVariant = computed<UiVariant>(() => (this.selected() ? 'solid' : this.variant()));

  protected readonly classes = computed(() =>
    [
      'ui',
      `ui--${this.drawnVariant()}`,
      `ui--${this.size()}`,
      `ui--${this.shape()}`,
      this.iconOnly() ? 'ui--icon-only' : '',
      this.selected() ? 'ui--selected' : '',
    ].filter(Boolean).join(' '),
  );

  protected readonly iconData = computed(() => {
    const name = this.icon();
    return name ? UI_ICONS[name] : null;
  });

  /** The name for assistive technology: given explicitly, or the label when there is no visible text. */
  protected readonly accessibleName = computed(() => this.ariaLabel() ?? (this.iconOnly() ? this.label() : null));

  protected readonly pressed = computed(() => (this.ariaRole() !== 'radio' && this.selected() !== null ? this.selected() : null));
  protected readonly checked = computed(() => (this.ariaRole() === 'radio' ? !!this.selected() : null));
}
