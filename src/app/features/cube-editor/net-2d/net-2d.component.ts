import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CubeState } from '../../../core/state/cube-state';
import { EMPTY_COLOR, FACE_COLORS } from '../../../shared/colors';
import { CENTERS, Face } from '../../../core/cube/cube-validator';
import { FACELETS } from '../../../core/cube/facelet-map';

/** Top-left cell of each face in the 12 × 9 unfolded net. */
const NET_ORIGIN: Record<Face, { col: number; row: number }> = {
  U: { col: 3, row: 0 },
  L: { col: 0, row: 3 },
  F: { col: 3, row: 3 },
  R: { col: 6, row: 3 },
  B: { col: 9, row: 3 },
  D: { col: 3, row: 6 },
};

interface Cell {
  index: number;
  gridColumn: number;
  gridRow: number;
  center: boolean;
  label: string;
}

@Component({
  selector: 'app-net-2d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './net-2d.component.html',
  styleUrl: './net-2d.component.scss',
})
export class Net2dComponent {
  protected readonly state = inject(CubeState);

  protected readonly cells: Cell[] = FACELETS.map(f => ({
    index: f.index,
    gridColumn: NET_ORIGIN[f.face].col + f.col + 1,
    gridRow: NET_ORIGIN[f.face].row + f.row + 1,
    center: CENTERS.includes(f.index),
    label: `${f.face} face, row ${f.row + 1}, column ${f.col + 1}`,
  }));

  protected colorOf(index: number): string {
    const face = this.state.facelets()[index];
    return face ? FACE_COLORS[face] : EMPTY_COLOR;
  }
}
