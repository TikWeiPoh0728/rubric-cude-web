import { Injectable, OnDestroy } from '@angular/core';
import { OPENCV_PATH } from './opencv-loader';
import { DEFAULT_PIPELINE, PipelineOptions, PipelineResult } from './scan-pipeline';
import type { ScanRequest, ScanResponse } from './scan-protocol';

/**
 * Main-thread side of scanning. Owns the scan worker, which loads OpenCV.js on
 * first use; the main thread only sends ImageData and receives results.
 *
 * Only the scan pages inject this, so neither the worker nor OpenCV is loaded
 * (or bundled) for the rest of the app.
 */
@Injectable({ providedIn: 'root' })
export class ScanService implements OnDestroy {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(r: PipelineResult): void; reject(e: Error): void }>();

  /** Resolves when OpenCV is loaded and ready in the worker. Safe to call repeatedly. */
  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL('./scan.worker', import.meta.url), { type: 'module' });
        this.worker = worker;
        worker.onmessage = ({ data }: MessageEvent<ScanResponse>) => {
          if (data.type === 'ready') resolve();
          else if (data.type === 'init-error') this.fail(new Error(data.message), reject);
          else this.settle(data);
        };
        worker.onerror = (event: ErrorEvent) =>
          this.fail(new Error(event.message || 'The scan worker stopped unexpectedly.'), reject);
        const opencvUrl = new URL(OPENCV_PATH, document.baseURI).href;
        this.post({ type: 'init', opencvUrl });
      });
    }
    return this.readyPromise;
  }

  /**
   * Run the pipeline on one photo. `image` should already be downscaled
   * (see loadImageData); its buffer is transferred, so it is unusable afterwards.
   */
  async scan(
    image: ImageData,
    options: PipelineOptions = DEFAULT_PIPELINE,
    debug = false,
  ): Promise<PipelineResult> {
    await this.ready();
    const id = this.nextId++;
    return new Promise<PipelineResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ type: 'scan', id, image, options, debug }, [image.data.buffer]);
    });
  }

  ngOnDestroy(): void {
    this.fail(new Error('Scan service destroyed'));
  }

  private post(request: ScanRequest, transfer: Transferable[] = []): void {
    this.worker?.postMessage(request, transfer);
  }

  private settle(data: Extract<ScanResponse, { id: number }>): void {
    const p = this.pending.get(data.id);
    if (!p) return;
    this.pending.delete(data.id);
    if (data.type === 'result') p.resolve(data.result);
    else p.reject(new Error(data.message));
  }

  /** Tear the worker down and reject everything waiting; the next call starts afresh. */
  private fail(error: Error, rejectReady?: (e: Error) => void): void {
    rejectReady?.(error);
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
  }
}
