/**
 * The OpenCV half of the scanning pipeline: image processing only. The decisions
 * (is it a sticker, where is the grid, what color is a cell) live in the pure
 * modules it calls. Runs in the scan worker; `cv` is passed in, never global.
 *
 * Every Mat / MatVector created here is registered with `track` and deleted in a
 * `finally`, including on exceptions. Leaks in the WASM heap crash phones.
 */
import { fromOpenCvLab } from './color-space';
import { DEFAULT_GRID_FIT, fitGrid, GridFit, GridFitOptions } from './grid-fit';
import type { CV } from './opencv-loader';
import { checkQuad, dedupeQuads, DEFAULT_QUAD_FILTER, QuadFilterOptions } from './quad-filter';
import { CellSample, DEFAULT_SAMPLING, sampleCells, SamplingOptions } from './sampling';
import type { Lab, Point, Quad } from './scan-types';

export interface PreprocessOptions {
  /** Width the input is scaled down to (never up). */
  maxWidth: number;
  /** Gaussian kernel size (odd). */
  blur: number;
  mode: 'adaptive' | 'canny';
  /** Adaptive threshold neighbourhood (odd) and constant subtracted from the mean. */
  adaptiveBlock: number;
  adaptiveC: number;
  cannyLow: number;
  cannyHigh: number;
  /** Dilation iterations (3×3 kernel) to close gaps in the edge network. */
  dilate: number;
  /** approxPolyDP tolerance as a fraction of the contour perimeter. */
  approxEpsilon: number;
  /** Side of the warped face image. */
  warpSize: number;
}

export interface PipelineOptions {
  preprocess: PreprocessOptions;
  quad: QuadFilterOptions;
  grid: GridFitOptions;
  sampling: SamplingOptions;
}

export const DEFAULT_PIPELINE: PipelineOptions = {
  preprocess: {
    maxWidth: 320,
    blur: 5,
    mode: 'adaptive',
    adaptiveBlock: 11,
    adaptiveC: 3,
    cannyLow: 30,
    cannyHigh: 90,
    dilate: 1,
    approxEpsilon: 0.06,
    warpSize: 300,
  },
  quad: DEFAULT_QUAD_FILTER,
  grid: DEFAULT_GRID_FIT,
  sampling: DEFAULT_SAMPLING,
};

export interface ContourInfo {
  points: Point[];
  ok: boolean;
  reason?: string;
}

export interface PipelineDebug {
  /** Downscaled input. */
  input: ImageData;
  /** Edge / threshold mask after dilation (white = sticker borders). */
  mask: ImageData;
  /** Contours big enough to matter, with the filter's verdict. */
  contours: ContourInfo[];
  /** Accepted squares after de-duplication, in the order passed to the grid fit. */
  squares: Quad[];
  warped: ImageData | null;
}

export interface PipelineResult {
  width: number;
  height: number;
  grid: GridFit;
  /** Per-cell samples, row-major; null without a grid. */
  cells: CellSample[] | null;
  /** Standard-range Lab per cell; null without a grid. */
  lab: Lab[] | null;
  timings: Record<string, number>;
  debug?: PipelineDebug;
}

interface Deletable {
  delete(): void;
}

/**
 * @param image RGBA input; scaled down to `maxWidth` if wider
 * @param withDebug also return intermediate images and contours
 */
export function runPipeline(
  cv: CV,
  image: ImageData,
  options: PipelineOptions = DEFAULT_PIPELINE,
  withDebug = false,
): PipelineResult {
  const p = options.preprocess;
  const owned: Deletable[] = [];
  const track = <T extends Deletable>(m: T): T => {
    owned.push(m);
    return m;
  };
  const timings: Record<string, number> = {};
  let t = performance.now();
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round((now - t) * 10) / 10;
    t = now;
  };

  try {
    // 0. Input, scaled down.
    let src = track(cv.matFromImageData(image));
    if (src.cols > p.maxWidth) {
      const small = track(new cv.Mat());
      const h = Math.round((src.rows * p.maxWidth) / src.cols);
      cv.resize(src, small, new cv.Size(p.maxWidth, h), 0, 0, cv.INTER_AREA);
      src = small;
    }
    const width = src.cols;
    const height = src.rows;
    lap('resize');

    // 1. Grayscale → blur → threshold or Canny → dilate. White = borders between stickers.
    const gray = track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const blurred = track(new cv.Mat());
    const k = oddAtLeast(p.blur, 1);
    cv.GaussianBlur(gray, blurred, new cv.Size(k, k), 0);
    const edges = track(new cv.Mat());
    if (p.mode === 'canny') {
      cv.Canny(blurred, edges, p.cannyLow, p.cannyHigh);
    } else {
      cv.adaptiveThreshold(
        blurred, edges, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV,
        oddAtLeast(p.adaptiveBlock, 3), p.adaptiveC,
      );
    }
    const mask = track(new cv.Mat());
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.dilate(edges, mask, kernel, new cv.Point(-1, -1), Math.max(0, Math.round(p.dilate)));
    lap('edges');

    // 2. Contours → polygons → square-ish quads. Stickers are holes in the white border network.
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(mask, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const imageArea = width * height;
    const minInteresting = options.quad.minAreaFrac * imageArea * 0.5;
    const debugContours: ContourInfo[] = [];
    const accepted: { quad: Quad; area: number }[] = [];
    const approx = track(new cv.Mat());
    const count = contours.size();
    for (let i = 0; i < count; i++) {
      const contour = contours.get(i);
      try {
        if (Math.abs(cv.contourArea(contour)) < minInteresting) continue;
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, p.approxEpsilon * perimeter, true);
        const points = matToPoints(approx);
        const verdict = checkQuad(points, imageArea, options.quad);
        if (verdict.ok) accepted.push({ quad: verdict.quad, area: verdict.area });
        if (withDebug) {
          debugContours.push(
            verdict.ok ? { points: verdict.quad, ok: true } : { points, ok: false, reason: verdict.reason },
          );
        }
      } finally {
        contour.delete();
      }
    }
    const squares = dedupeQuads(accepted).map(a => a.quad);
    lap('contours');

    // 3. Grid. The dilated mask doubles as the edge map for breaking window ties.
    const maskData: Uint8Array = mask.data;
    const edgeAt = (x: number, y: number) => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 0;
      return maskData[yi * width + xi] > 0 ? 1 : 0;
    };
    const grid = fitGrid(squares, width, height, options.grid, edgeAt);
    lap('grid');

    let cells: CellSample[] | null = null;
    let lab: Lab[] | null = null;
    let warpedImage: ImageData | null = null;
    if (grid.ok) {
      // 4. Perspective-warp the face to a square.
      const n = p.warpSize;
      const from = track(cv.matFromArray(4, 1, cv.CV_32FC2, grid.corners.flatMap(c => [c.x, c.y])));
      const to = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, n, 0, n, n, 0, n]));
      const M = track(cv.getPerspectiveTransform(from, to));
      const warped = track(new cv.Mat());
      cv.warpPerspective(src, warped, M, new cv.Size(n, n), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
      lap('warp');

      // 5. Sample the inner part of each cell (pure TS on the RGBA buffer).
      cells = sampleCells(warped.data, n, options.sampling);

      // 6. Lab through OpenCV, then back to standard ranges.
      const rgb = track(cv.matFromArray(1, 9, cv.CV_8UC3, cells.flatMap(c => c.rgb)));
      const labMat = track(new cv.Mat());
      cv.cvtColor(rgb, labMat, cv.COLOR_RGB2Lab);
      const d: Uint8Array = labMat.data;
      lab = cells.map((_, i) => fromOpenCvLab(d[i * 3], d[i * 3 + 1], d[i * 3 + 2]));
      lap('sample');

      if (withDebug) warpedImage = toImageData(cv, warped, track);
    }

    const result: PipelineResult = { width, height, grid, cells, lab, timings };
    if (withDebug) {
      result.debug = {
        input: toImageData(cv, src, track),
        mask: toImageData(cv, mask, track),
        contours: debugContours,
        squares,
        warped: warpedImage,
      };
    }
    return result;
  } finally {
    for (const m of owned) m.delete();
  }
}

function oddAtLeast(n: number, min: number): number {
  const v = Math.max(min, Math.round(n));
  return v % 2 ? v : v + 1;
}

/** Points of an approxPolyDP result (CV_32SC2, one point per row). */
function matToPoints(mat: { rows: number; data32S: Int32Array }): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < mat.rows; i++) pts.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
  return pts;
}

/** Copy a 1- or 4-channel 8-bit Mat out of the WASM heap into an ImageData. */
function toImageData(cv: CV, mat: CV, track: <T extends Deletable>(m: T) => T): ImageData {
  let rgba = mat;
  if (mat.channels() === 1) {
    rgba = track(new cv.Mat());
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  }
  return new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows);
}
