import type { PipelineOptions, PipelineResult } from './scan-pipeline';

/** Messages from the page to the scan worker. */
export type ScanRequest =
  | { type: 'init'; opencvUrl: string }
  | { type: 'scan'; id: number; image: ImageData; options: PipelineOptions; debug: boolean };

/** Messages from the scan worker to the page. */
export type ScanResponse =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; result: PipelineResult }
  | { type: 'error'; id: number; message: string };
