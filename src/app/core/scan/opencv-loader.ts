/**
 * Loads the official opencv.js build (served from public/opencv/) inside the scan worker.
 *
 * The file is a UMD script, not an ES module, and Angular builds workers as module
 * workers where importScripts() is unavailable. So it is fetched and evaluated with
 * indirect eval, which runs it in global scope: its UMD wrapper then sets `self.cv`.
 * Nothing of OpenCV ends up in any bundle.
 *
 * The emscripten module it creates is a thenable that resolves with itself, which
 * would make `await` loop forever; its `then` is removed before resolving.
 */

/** OpenCV.js has no official typings; the pipeline uses this loose alias. */
export type CV = any;

/** Served path of the vendored build, relative to the app's base URL. */
export const OPENCV_PATH = 'opencv/opencv-4.9.0.js';

let loading: Promise<CV> | null = null;

export function loadOpenCv(url: string): Promise<CV> {
  if (!loading) {
    loading = load(url).catch(e => {
      loading = null; // allow a retry
      throw e;
    });
  }
  return loading;
}

async function load(url: string): Promise<CV> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load OpenCV (${response.status} ${url})`);
  const code = await response.text();
  // Indirect eval: global scope, so the UMD wrapper's `this` is the worker global.
  (0, eval)(`${code}\n//# sourceURL=${url}`);
  const g = globalThis as { cv?: CV };
  const raw = g.cv;
  if (!raw) throw new Error('OpenCV script ran but did not define cv');
  const cv = await new Promise<CV>(resolve => {
    const done = (m: CV) => {
      if (typeof m.then === 'function') delete m.then;
      resolve(m);
    };
    if (raw.Mat) done(raw); // already initialized
    else if (typeof raw.then === 'function') raw.then(done); // emscripten MODULARIZE build (4.x)
    else raw.onRuntimeInitialized = () => done(raw); // older builds
  });
  g.cv = cv;
  return cv;
}
