import { KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { Face, FACES } from '../../core/cube/cube-validator';
import { classify, StickerClass } from '../../core/scan/classify';
import { pointInPolygon, signedArea } from '../../core/scan/geometry';
import { loadImageData } from '../../core/scan/image-input';
import { centerRefsFromItems, EvalItem, EvalReport, evaluate } from '../../core/scan/scan-eval';
import { DEFAULT_PIPELINE, PipelineOptions, PipelineResult } from '../../core/scan/scan-pipeline';
import type { Lab, Nine, ScanLabel } from '../../core/scan/scan-types';
import { ScanService } from '../../core/scan/scan.service';
import { labelsForScramble } from '../../core/scan/scramble-labels';
import { FACE_COLORS } from '../../shared/colors';
import { drawContours, drawGrid, drawImage, drawWarp, STATUS_COLORS } from './scan-debug-draw';

type Group = keyof PipelineOptions;
interface Field {
  group: Group;
  key: string;
  label: string;
  step: number;
  min?: number;
  max?: number;
}

/** Tunable numbers shown in the controls panel. */
const FIELDS: Field[] = [
  { group: 'preprocess', key: 'maxWidth', label: 'Max width (px)', step: 10, min: 80 },
  { group: 'preprocess', key: 'blur', label: 'Blur kernel', step: 2, min: 1 },
  { group: 'preprocess', key: 'adaptiveBlock', label: 'Adaptive block', step: 2, min: 3 },
  { group: 'preprocess', key: 'adaptiveC', label: 'Adaptive C', step: 1 },
  { group: 'preprocess', key: 'cannyLow', label: 'Canny low', step: 5, min: 0 },
  { group: 'preprocess', key: 'cannyHigh', label: 'Canny high', step: 5, min: 0 },
  { group: 'preprocess', key: 'dilate', label: 'Dilate iterations', step: 1, min: 0 },
  { group: 'preprocess', key: 'approxEpsilon', label: 'approxPolyDP ε', step: 0.01, min: 0.005 },
  { group: 'quad', key: 'minAreaFrac', label: 'Min area (frac)', step: 0.001, min: 0 },
  { group: 'quad', key: 'maxAreaFrac', label: 'Max area (frac)', step: 0.01, min: 0 },
  { group: 'quad', key: 'maxAspect', label: 'Max aspect', step: 0.05, min: 1 },
  { group: 'quad', key: 'maxCornerCos', label: 'Max |cos| corner', step: 0.05, min: 0, max: 1 },
  { group: 'grid', key: 'minSquares', label: 'Min squares', step: 1, min: 1 },
  { group: 'grid', key: 'sizeTolerance', label: 'Size tolerance ×', step: 0.1, min: 1 },
  { group: 'grid', key: 'minPitchRatio', label: 'Min pitch / side', step: 0.05, min: 0.5 },
  { group: 'grid', key: 'maxPitchRatio', label: 'Max pitch / side', step: 0.05, min: 0.5 },
  { group: 'grid', key: 'maxResidual', label: 'Max residual (cells)', step: 0.05, min: 0, max: 0.5 },
  { group: 'sampling', key: 'inner', label: 'Inner fraction', step: 0.05, min: 0.1, max: 1 },
  { group: 'sampling', key: 'glareMinValue', label: 'Glare min V', step: 5, min: 0, max: 255 },
  { group: 'sampling', key: 'glareMaxSaturation', label: 'Glare max S', step: 5, min: 0, max: 255 },
  { group: 'sampling', key: 'minCoverage', label: 'Min coverage', step: 0.05, min: 0, max: 1 },
];

const STORAGE_KEY = 'verycube.scan-debug.options';
const TEST_SET = 'assets/test-scans/';

interface Photo {
  name: string;
  blob: Blob;
  label?: ScanLabel;
}

@Component({
  selector: 'app-scan-debug',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [KeyValuePipe],
  templateUrl: './scan-debug.component.html',
  styleUrl: './scan-debug.component.scss',
})
export class ScanDebugComponent implements OnDestroy {
  private readonly scanner = inject(ScanService);

  protected readonly fields = FIELDS;
  protected readonly faces = FACES;
  protected readonly faceColors = FACE_COLORS;
  protected readonly statusColors = Object.entries(STATUS_COLORS);

  protected readonly cvState = signal<'loading' | 'ready' | string>('loading');
  protected readonly options = signal<PipelineOptions>(loadOptions());
  protected readonly photo = signal<Photo | null>(null);
  protected readonly result = signal<PipelineResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly hoveredContour = signal<number | null>(null);

  /** Center references from the last test-set run, used to classify single photos. */
  private readonly refs = signal<Record<Face, Lab> | null>(null);

  protected readonly report = signal<EvalReport | null>(null);
  protected readonly evalProgress = signal<string | null>(null);
  private evalItems: EvalItem[] = [];
  private readonly testPhotos = new Map<string, Photo>();

  protected readonly scramble = signal('');
  protected readonly labelPrefix = signal('scan');
  protected readonly generated = computed(() => {
    try {
      return { labels: labelsForScramble(this.scramble()), error: null };
    } catch (e) {
      return { labels: null, error: (e as Error).message };
    }
  });

  private readonly inputCanvas = viewChild<ElementRef<HTMLCanvasElement>>('inputCanvas');
  private readonly maskCanvas = viewChild<ElementRef<HTMLCanvasElement>>('maskCanvas');
  private readonly contourCanvas = viewChild<ElementRef<HTMLCanvasElement>>('contourCanvas');
  private readonly gridCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gridCanvas');
  private readonly warpCanvas = viewChild<ElementRef<HTMLCanvasElement>>('warpCanvas');

  private image: ImageData | null = null;
  private imageWidth = 0;
  private rerunTimer: ReturnType<typeof setTimeout> | undefined;
  private runId = 0;

  protected readonly hoveredInfo = computed(() => {
    const i = this.hoveredContour();
    const c = i === null ? null : this.result()?.debug?.contours[i];
    if (!c) return null;
    return c.ok ? `accepted (${c.points.length} vertices)` : `rejected: ${c.reason}`;
  });

  protected readonly contourSummary = computed(() => {
    const d = this.result()?.debug;
    if (!d) return '';
    const counts = new Map<string, number>();
    for (const c of d.contours) {
      const k = c.ok ? 'accepted' : c.reason!;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts].map(([k, n]) => `${k}: ${n}`).join(' · ');
  });

  /** Swatches, Lab values and (when possible) classification of the 9 cells. */
  protected readonly cells = computed(() => {
    const r = this.result();
    if (!r?.cells || !r.lab) return null;
    let classes: StickerClass[] | null = null;
    let note: string | null = null;
    const refs = this.refs();
    if (!refs) note = 'No center references yet: run the test set to classify.';
    else {
      try {
        classes = classify(r.lab as Nine<Lab>, refs);
      } catch (e) {
        note = `classify(): ${(e as Error).message}`;
      }
    }
    const expected = this.photo()?.label?.stickers;
    return {
      note,
      list: r.cells.map((c, i) => ({
        index: i,
        css: `rgb(${c.rgb.join(',')})`,
        lab: r.lab![i],
        coverage: c.coverage,
        glare: c.glareFallback,
        predicted: classes?.[i] ?? null,
        expected: expected?.[i] ?? null,
      })),
    };
  });

  constructor() {
    this.scanner.ready().then(
      () => this.cvState.set('ready'),
      e => this.cvState.set(`OpenCV failed to load: ${(e as Error).message}`),
    );

    effect(() => {
      const r = this.result();
      const hovered = this.hoveredContour();
      const canvases = [this.inputCanvas(), this.maskCanvas(), this.contourCanvas(), this.gridCanvas(), this.warpCanvas()];
      if (!r?.debug || canvases.some(c => !c)) return;
      const [input, mask, contours, grid, warp] = canvases.map(c => c!.nativeElement);
      drawImage(input, r.debug.input);
      drawImage(mask, r.debug.mask);
      drawContours(contours, r, hovered);
      drawGrid(grid, r);
      drawWarp(warp, r);
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.rerunTimer);
  }

  // ---- single photo ----

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) await this.openPhoto({ name: file.name, blob: file });
  }

  protected async openPhoto(photo: Photo): Promise<void> {
    this.photo.set(photo);
    this.image = null;
    await this.run();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private async run(): Promise<void> {
    const photo = this.photo();
    if (!photo) return;
    const id = ++this.runId;
    const opts = this.options();
    this.busy.set(true);
    this.error.set(null);
    try {
      if (!this.image || this.imageWidth !== opts.preprocess.maxWidth) {
        this.image = await loadImageData(photo.blob, opts.preprocess.maxWidth);
        this.imageWidth = opts.preprocess.maxWidth;
      }
      // The buffer is transferred to the worker, so send a copy and keep the original.
      const copy = new ImageData(new Uint8ClampedArray(this.image.data), this.image.width, this.image.height);
      const result = await this.scanner.scan(copy, opts, true);
      if (id !== this.runId) return;
      this.hoveredContour.set(null);
      this.result.set(result);
    } catch (e) {
      if (id === this.runId) this.error.set((e as Error).message);
    } finally {
      if (id === this.runId) this.busy.set(false);
    }
  }

  // ---- options ----

  protected value(f: Field): number {
    return (this.options()[f.group] as unknown as Record<string, number>)[f.key];
  }

  protected setValue(f: Field, raw: string): void {
    const v = Number(raw);
    if (raw === '' || !Number.isFinite(v)) return;
    this.updateOptions(o => ({ ...o, [f.group]: { ...o[f.group], [f.key]: v } }));
  }

  protected setMode(mode: string): void {
    this.updateOptions(o => ({ ...o, preprocess: { ...o.preprocess, mode: mode as 'adaptive' | 'canny' } }));
  }

  protected resetOptions(): void {
    this.updateOptions(() => structuredClone(DEFAULT_PIPELINE));
  }

  protected copyOptions(): void {
    navigator.clipboard?.writeText(JSON.stringify(this.options(), null, 2));
  }

  private updateOptions(change: (o: PipelineOptions) => PipelineOptions): void {
    this.options.update(change);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.options()));
    } catch {
      // storage unavailable: options just won't persist
    }
    clearTimeout(this.rerunTimer);
    this.rerunTimer = setTimeout(() => this.run(), 150);
  }

  // ---- contour hover ----

  protected onContourHover(event: MouseEvent): void {
    const canvas = event.target as HTMLCanvasElement;
    const contours = this.result()?.debug?.contours;
    if (!contours) return;
    const rect = canvas.getBoundingClientRect();
    const p = {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
    // Smallest contour under the cursor (nested contours: the innermost is the interesting one).
    let best: number | null = null;
    let bestArea = Infinity;
    contours.forEach((c, i) => {
      if (c.points.length < 3 || !pointInPolygon(p, c.points)) return;
      const area = Math.abs(signedArea(c.points));
      if (area < bestArea) {
        bestArea = area;
        best = i;
      }
    });
    if (best !== this.hoveredContour()) this.hoveredContour.set(best);
  }

  // ---- test set ----

  protected async runTestSet(): Promise<void> {
    this.report.set(null);
    this.evalItems = [];
    this.testPhotos.clear();
    const opts = this.options();
    try {
      this.evalProgress.set('Loading index.json…');
      const res = await fetch(TEST_SET + 'index.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`);
      const names = (await res.json()) as string[];
      if (!Array.isArray(names) || names.length === 0) throw new Error('index.json lists no photos');

      const items: EvalItem[] = [];
      for (const [n, name] of names.entries()) {
        this.evalProgress.set(`Scanning ${n + 1}/${names.length}: ${name}`);
        const base = name.replace(/\.[^.]+$/, '');
        try {
          const [imgRes, labelRes] = await Promise.all([
            fetch(TEST_SET + name, { cache: 'no-store' }),
            fetch(TEST_SET + base + '.json', { cache: 'no-store' }),
          ]);
          if (!imgRes.ok) throw new Error(`image: HTTP ${imgRes.status}`);
          if (!labelRes.ok) throw new Error(`label ${base}.json: HTTP ${labelRes.status}`);
          const label = (await labelRes.json()) as ScanLabel;
          const blob = await imgRes.blob();
          this.testPhotos.set(name, { name, blob, label });
          const result = await this.scanner.scan(await loadImageData(blob, opts.preprocess.maxWidth), opts, false);
          items.push({
            name,
            label,
            samples: result.lab,
            predicted: null,
            error: result.grid.ok ? undefined : `no grid: ${result.grid.reason}`,
          });
        } catch (e) {
          const label: ScanLabel = { face: 'U', stickers: [] };
          items.push({ name, label, samples: null, predicted: null, error: (e as Error).message });
        }
      }

      // Calibrate from the test set's own centers, then classify every photo with a grid.
      const refs = centerRefsFromItems(items);
      this.refs.set(refs);
      for (const item of items) {
        if (!item.samples) continue;
        if (!refs) {
          item.error = 'no center references: the test set needs a photo of every face';
          continue;
        }
        try {
          item.predicted = classify(item.samples as Nine<Lab>, refs).map(c => c.face);
        } catch (e) {
          item.error = `classify(): ${(e as Error).message}`;
        }
      }
      this.evalItems = items;
      this.report.set(evaluate(items));
      this.evalProgress.set(null);
    } catch (e) {
      this.evalProgress.set(`Test set failed: ${(e as Error).message}`);
    }
  }

  protected openTestPhoto(name: string): void {
    const photo = this.testPhotos.get(name);
    if (photo) this.openPhoto(photo);
  }

  protected exportReport(): void {
    download('scan-report.json', { options: this.options(), report: this.report(), items: this.evalItems });
  }

  protected percent(v: number | null): string {
    return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
  }

  // ---- label generator ----

  protected downloadLabels(): void {
    const labels = this.generated().labels;
    if (!labels) return;
    for (const l of labels) download(`${this.labelPrefix()}-${l.face}.json`, l);
  }

  protected indexEntries(): string {
    return FACES.map(f => `"${this.labelPrefix()}-${f}.jpg"`).join(',\n');
  }
}

function loadOptions(): PipelineOptions {
  const defaults = structuredClone(DEFAULT_PIPELINE);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PipelineOptions> | null;
    if (!saved) return defaults;
    // Merge per group so options added later keep their defaults.
    return {
      preprocess: { ...defaults.preprocess, ...saved.preprocess },
      quad: { ...defaults.quad, ...saved.quad },
      grid: { ...defaults.grid, ...saved.grid },
      sampling: { ...defaults.sampling, ...saved.sampling },
    };
  } catch {
    return defaults;
  }
}

function download(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
