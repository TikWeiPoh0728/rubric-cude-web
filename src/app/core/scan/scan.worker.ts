/// <reference lib="webworker" />
import { loadOpenCv } from './opencv-loader';
import type { ScanRequest, ScanResponse } from './scan-protocol';
import { PipelineResult, runPipeline } from './scan-pipeline';

const send = (response: ScanResponse, transfer: Transferable[] = []): void =>
  postMessage(response, transfer);

let opencvUrl: string | null = null;

addEventListener('message', async ({ data }: MessageEvent<ScanRequest>) => {
  if (data.type === 'init') {
    opencvUrl = data.opencvUrl;
    try {
      await loadOpenCv(opencvUrl);
      send({ type: 'ready' });
    } catch (e) {
      send({ type: 'init-error', message: errorMessage(e) });
    }
    return;
  }

  try {
    if (!opencvUrl) throw new Error('Scan worker was not initialized');
    const cv = await loadOpenCv(opencvUrl);
    const result = runPipeline(cv, data.image, data.options, data.debug);
    send({ type: 'result', id: data.id, result }, imageBuffers(result));
  } catch (e) {
    send({ type: 'error', id: data.id, message: errorMessage(e) });
  }
});

/** Transfer the debug images instead of copying them. */
function imageBuffers(result: PipelineResult): Transferable[] {
  const d = result.debug;
  if (!d) return [];
  return [d.input, d.mask, d.warped].filter((i): i is ImageData => !!i).map(i => i.data.buffer);
}

function errorMessage(e: unknown): string {
  // OpenCV throws raw numbers (pointers to C++ exceptions) for its own errors.
  if (typeof e === 'number') return `OpenCV error (code ${e})`;
  return e instanceof Error ? e.message : String(e);
}
