import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CubeState } from '../../../core/state/cube-state';
import { FACE_COLORS, FACE_NAMES, PALETTE } from '../../../shared/colors';
import { Face } from '../../../core/cube/cube-validator';

@Component({
  selector: 'app-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './palette.component.html',
  styleUrl: './palette.component.scss',
})
export class PaletteComponent {
  protected readonly state = inject(CubeState);
  protected readonly colors = PALETTE;

  protected fill(c: Face): string {
    return FACE_COLORS[c];
  }

  protected name(c: Face): string {
    return FACE_NAMES[c];
  }

  /** Hint only: unavailable colors can still be picked and painted. */
  protected isUnavailable(c: Face): boolean {
    const allowed = this.state.allowed();
    return allowed !== null && !allowed.includes(c);
  }
}
