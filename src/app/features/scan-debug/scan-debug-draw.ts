/** Canvas overlays for the scan debug page. Geometry comes from the pipeline result. */
import { applyH } from '../../core/scan/geometry';
import type { SquareStatus } from '../../core/scan/grid-fit';
import type { PipelineResult } from '../../core/scan/scan-pipeline';
import type { Point } from '../../core/scan/scan-types';

export const STATUS_COLORS: Record<SquareStatus, string> = {
  inlier: '#22c55e',
  outlier: '#f97316',
  size: '#94a3b8',
  'outside-window': '#a855f7',
  duplicate: '#64748b',
};

function polygon(ctx: CanvasRenderingContext2D, pts: readonly Point[], color: string, width = 1.5, dash: number[] = []) {
  if (pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, p: Point, color = '#fff') {
  ctx.save();
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, p.x, p.y);
  ctx.fillStyle = color;
  ctx.fillText(text, p.x, p.y);
  ctx.restore();
}

/** Size the canvas to the image and draw it (optionally dimmed so overlays stand out). */
export function drawImage(canvas: HTMLCanvasElement, image: ImageData, dim = 0): CanvasRenderingContext2D {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(image, 0, 0);
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, image.width, image.height);
  }
  return ctx;
}

export function drawContours(canvas: HTMLCanvasElement, r: PipelineResult, hovered: number | null) {
  const d = r.debug!;
  const ctx = drawImage(canvas, d.input, 0.35);
  d.contours.forEach((c, i) => {
    if (i !== hovered) polygon(ctx, c.points, c.ok ? '#22c55e' : 'rgba(239,68,68,0.8)', c.ok ? 1.5 : 1);
  });
  if (hovered !== null && d.contours[hovered]) polygon(ctx, d.contours[hovered].points, '#facc15', 2.5);
}

export function drawGrid(canvas: HTMLCanvasElement, r: PipelineResult) {
  const d = r.debug!;
  const ctx = drawImage(canvas, d.input, 0.25);
  const g = r.grid;
  d.squares.forEach((q, i) => {
    const s = g.squares[i];
    polygon(ctx, q, STATUS_COLORS[s.status], 1.5);
    const text = s.row !== undefined ? `${s.row},${s.col}` : s.status === 'inlier' ? '' : s.status[0];
    if (text) label(ctx, text, s.center);
  });
  if (!g.ok) return;

  // Other windows that held as many squares, with their scores.
  g.candidates.slice(1).forEach(c => {
    polygon(ctx, c.corners, 'rgba(250,204,21,0.7)', 1, [4, 3]);
    label(ctx, c.score.toFixed(2), c.corners[0], '#facc15');
  });

  // The fitted 3×3 grid: outline and inner cell lines through the homography.
  const H = g.homography;
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  for (let k = 0; k <= 3; k++) {
    const t = k - 0.5;
    for (const [a, b] of [
      [{ x: t, y: -0.5 }, { x: t, y: 2.5 }],
      [{ x: -0.5, y: t }, { x: 2.5, y: t }],
    ]) {
      const p = applyH(H, a);
      const q = applyH(H, b);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  }
  ctx.restore();
  polygon(ctx, g.corners, '#38bdf8', 2.5);
  label(ctx, g.candidates[0].score.toFixed(2), g.corners[0], '#38bdf8');
  g.cellCenters.forEach((c, i) => {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(c.x - 1.5, c.y - 1.5, 3, 3);
    if (g.squares.every(s => s.row === undefined || s.row * 3 + s.col! !== i)) label(ctx, String(i), c, '#38bdf8');
  });
}

export function drawWarp(canvas: HTMLCanvasElement, r: PipelineResult) {
  const d = r.debug!;
  if (!d.warped) return;
  const ctx = drawImage(canvas, d.warped);
  r.cells?.forEach((c, i) => {
    polygon(
      ctx,
      [
        { x: c.box.x, y: c.box.y },
        { x: c.box.x + c.box.w, y: c.box.y },
        { x: c.box.x + c.box.w, y: c.box.y + c.box.h },
        { x: c.box.x, y: c.box.y + c.box.h },
      ],
      c.glareFallback ? '#ef4444' : '#fff',
      1.5,
      [3, 2],
    );
    label(ctx, String(i), { x: c.box.x + 8, y: c.box.y + 8 });
  });
}
