import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionState } from '../../core/state/session-state';
import { UiElementComponent } from '../../shared/ui/ui-element.component';
import { Cube3dComponent } from './cube-3d/cube-3d.component';
import { InformationComponent } from './information/information.component';
import { ProgressComponent } from './progress/progress.component';
import { SolveDialogComponent } from './solve-dialog/solve-dialog.component';

@Component({
  selector: 'app-cube-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Cube3dComponent, InformationComponent, ProgressComponent, SolveDialogComponent, UiElementComponent],
  templateUrl: './cube-editor.component.html',
  styleUrl: './cube-editor.component.scss',
})
export class CubeEditorComponent {
  protected readonly session = inject(SessionState);
}
