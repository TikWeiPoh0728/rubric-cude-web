import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CubeState } from '../../../core/state/cube-state';
import { PlaybackState } from '../../../core/state/playback-state';
import { SessionState } from '../../../core/state/session-state';
import { SOLVE_METHODS } from '../../../core/solver/solve-method';
import { STAGE_COLOR, stageVars } from '../../../shared/stage-colors';
import { UiColor } from '../../../shared/ui/ui-colors';
import { UiElementComponent } from '../../../shared/ui/ui-element.component';
import { describeError } from '../../../shared/validation-messages';
import { Net2dComponent } from '../net-2d/net-2d.component';
import { PaletteComponent } from '../palette/palette.component';

/**
 * The right-hand panel, always as tall as the 3D cube panel next to it.
 *  - editing: net, palette, Reset, problems
 *  - saved: solution methods, and Start pinned to the bottom
 *  - solving/solved: methods locked (the chosen one highlighted), the steps, the total,
 *    and Back / Next pinned to the bottom where Start was
 */
@Component({
  selector: 'app-information',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Net2dComponent, PaletteComponent, UiElementComponent],
  templateUrl: './information.component.html',
  styleUrl: './information.component.scss',
})
export class InformationComponent {
  protected readonly state = inject(CubeState);
  protected readonly session = inject(SessionState);
  protected readonly playback = inject(PlaybackState);

  protected readonly methods = SOLVE_METHODS;
  protected readonly describe = describeError;
  protected readonly stageVars = stageVars;

  protected readonly filled = computed(() => this.state.facelets().filter(c => c !== null).length);

  /**
   * What to list under "Total steps": one section per stage, or, for a method without
   * stages, a single section with no title that holds every move.
   */
  protected readonly sections = computed<Section[]>(() => {
    const ranges = this.playback.stageRanges();
    if (ranges) return ranges.map(r => ({ ...r, color: STAGE_COLOR[r.id] }));
    return [{ id: 'all', label: null, moves: this.playback.moves(), first: 0, count: this.playback.total(), color: 'indigo' }];
  });

  /** "skipped" for a stage that was not needed, else "7 moves". */
  protected countText(count: number): string {
    return count === 0 ? 'skipped' : `${count} ${count === 1 ? 'move' : 'moves'}`;
  }
}

interface Section {
  id: string;
  /** The stage's title, or null for the single list of a method without stages. */
  label: string | null;
  moves: string[];
  /** Index of this section's first move in the whole solution. */
  first: number;
  count: number;
  /** The color its played moves are drawn in. */
  color: UiColor;
}
