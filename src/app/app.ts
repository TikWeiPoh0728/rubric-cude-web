import { Component, isDevMode } from '@angular/core';
import { CubeEditorComponent } from './features/cube-editor/cube-editor.component';
import { ScanDebugComponent } from './features/scan-debug/scan-debug.component';

/**
 * `/dev/scan` (development builds only) shows the scanner tuning page instead of the
 * editor. It is a @defer block, so the page, the scan worker and OpenCV load lazily
 * and add nothing to the main bundle (no router needed for one dev page).
 */
@Component({
  selector: 'app-root',
  imports: [CubeEditorComponent, ScanDebugComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly scanDebug =
    isDevMode() && location.pathname.replace(/\/+$/, '').endsWith('/dev/scan');
}
