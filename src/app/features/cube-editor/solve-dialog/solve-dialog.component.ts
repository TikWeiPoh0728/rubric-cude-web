import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionState } from '../../../core/state/session-state';
import { SOLVE_METHODS } from '../../../core/solver/solve-method';
import { UiElementComponent } from '../../../shared/ui/ui-element.component';

/** Modal dialog: "Generating solution" while the solver runs, or why it failed. */
@Component({
  selector: 'app-solve-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiElementComponent],
  templateUrl: './solve-dialog.component.html',
  styleUrl: './solve-dialog.component.scss',
})
export class SolveDialogComponent {
  protected readonly session = inject(SessionState);

  protected readonly methodLabel = computed(
    () => SOLVE_METHODS.find(m => m.id === this.session.method())?.label ?? 'the solver',
  );

  /** What is going on, in words that fit the method: Kociemba searches, CFOP works through its stages. */
  protected readonly detail = computed(() =>
    this.session.method() === 'cfop'
      ? 'Working through the Cross, F2L, OLL and PLL stages.'
      : `Working out the moves with ${this.methodLabel()} and looking for a short solution. This can take a few seconds.`,
  );
}
