import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PlaybackState } from '../../../core/state/playback-state';
import { STAGE_COLOR, stageVars } from '../../../shared/stage-colors';
import { UiElementComponent } from '../../../shared/ui/ui-element.component';

/** Scale from 0 to the total number of steps; drag it to jump to any step. */
@Component({
  selector: 'app-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiElementComponent],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss',
})
export class ProgressComponent {
  protected readonly playback = inject(PlaybackState);
  protected readonly stageVars = stageVars;
  protected readonly stageColor = (id: keyof typeof STAGE_COLOR) => STAGE_COLOR[id];

  /** 0 .. total, one tick per step. */
  protected readonly ticks = computed(() => Array.from({ length: this.playback.total() + 1 }, (_, i) => i));

  /** Ticks where one stage ends and the next begins. */
  private readonly boundaries = computed(() => new Set((this.playback.stageRanges() ?? []).map(r => r.first)));

  /** A taller tick: every fifth step, the end, and wherever a stage begins. */
  protected isMajor(tick: number): boolean {
    return tick % 5 === 0 || tick === this.playback.total() || this.boundaries().has(tick);
  }

  protected onInput(event: Event): void {
    this.playback.seek((event.target as HTMLInputElement).valueAsNumber);
  }
}
