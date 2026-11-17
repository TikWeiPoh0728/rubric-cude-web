import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, afterNextRender, effect,
  inject, signal, viewChild,
} from '@angular/core';
import { FACE_NAMES } from '../../../shared/colors';
import { CubeState } from '../../../core/state/cube-state';
import { PlaybackState } from '../../../core/state/playback-state';
import { SessionState } from '../../../core/state/session-state';
import { Face } from '../../../core/cube/cube-validator';
import { UiElementComponent } from '../../../shared/ui/ui-element.component';
import { CubeScene } from './cube-scene';
import { SolutionPlayer } from './solution-player';

@Component({
  selector: 'app-cube-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiElementComponent],
  templateUrl: './cube-3d.component.html',
  styleUrl: './cube-3d.component.scss',
})
export class Cube3dComponent {
  private readonly state = inject(CubeState);
  private readonly session = inject(SessionState);
  private readonly playback = inject(PlaybackState);
  private readonly zone = inject(NgZone);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly three = signal<{ scene: CubeScene; player: SolutionPlayer } | null>(null);

  /** One button per side, labelled with that side's center color (the center is fixed). */
  protected readonly views: { face: Face; label: string }[] = (['U', 'D', 'F', 'B', 'L', 'R'] as const).map(
    face => ({ face, label: FACE_NAMES[face] }),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // The render loop and all pointer handling live outside Angular.
      this.zone.runOutsideAngular(() => {
        const scene = new CubeScene(this.canvas().nativeElement, {
          onHover: i => this.state.setHovered(i),
          onClick: i => this.state.clickSticker(i),
        });
        const stage = this.stage().nativeElement;
        const ro = new ResizeObserver(() => scene.resize(stage.clientWidth, stage.clientHeight));
        ro.observe(stage);
        scene.resize(stage.clientWidth, stage.clientHeight);
        destroyRef.onDestroy(() => {
          ro.disconnect();
          scene.dispose();
        });
        this.three.set({ scene, player: new SolutionPlayer(scene, this.playback) });
      });
    });

    // State → view. The scene is redrawn from the state signals, never the other way round.
    effect(() => {
      const three = this.three();
      if (!three) return;

      if (this.session.isSolved()) {
        // Solve mode: the player makes the scene follow the playback state.
        three.player.sync();
      } else {
        // Editing, or a saved cube waiting for Start.
        three.player.stop();
        three.scene.update({
          facelets: this.state.facelets(),
          errors: this.state.errorStickers(),
          hovered: this.state.hovered(),
          selected: this.state.selected(),
        });
      }
    });
  }

  protected goTo(face: Face): void {
    this.three()?.scene.viewFace(face);
  }
}
